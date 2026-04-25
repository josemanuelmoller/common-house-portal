/**
 * Gmail ingestor — reference implementation of the ingestor contract.
 *
 * See docs/NORMALIZATION_ARCHITECTURE.md §11 (Gmail source → layer mapping).
 *
 * v1 scope:
 *  - Delta-fetch Gmail threads since last watermark
 *  - Determine ball_in_court from last-sender + primary-recipient (To vs Cc)
 *  - Emit ActionSignal when ball_in_court='jose' (intent=reply)
 *  - Generate next_action via Claude Haiku (batched, one call per run)
 *  - Emit RelationshipSignal for every resolved contact touch
 *
 * Out of scope (later):
 *  - chase intent (Jose sent last + >7d old)
 *  - deadline extraction from body
 *  - objective_link via project mapping
 *  - CH Sources conversation_id linkage (left null)
 */

import Anthropic from "@anthropic-ai/sdk";
import type { gmail_v1 } from "googleapis";
import { getGoogleGmailClient } from "@/lib/google-gmail";
import { getSelfEmails } from "@/lib/hall-self";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { buildFactors } from "./priority";
import {
  loadProjectRoles,
  loadPersonProjectMap,
  effectiveProjectFor,
  passesManagementGate,
} from "./project-roles";
import {
  getWatermark,
  startIngestorRun,
  finishIngestorRun,
  persistSignals,
  setWatermark,
  summarizeResult,
  hasFatalErrors,
  flushPerRowErrorsToDlq,
} from "./persist";
import type {
  ActionSignal,
  IngestError,
  IngestInput,
  IngestResult,
  RelationshipSignal,
  Signal,
} from "./types";

const INGESTOR_VERSION = "gmail@1.2.0";
const SOURCE_TYPE = "gmail" as const;
const DEFAULT_MAX_ITEMS = 100;
const DEFAULT_BACKFILL_DAYS = 7;

// ─── Noise filters ────────────────────────────────────────────────────────
// Calendar emails belong to the Calendar ingestor (Phase 7), not Gmail.
// We still emit a RelationshipSignal for the touch, but NOT an ActionSignal.
const CALENDAR_SUBJECT_PREFIXES = [
  "invitation:", "updated invitation:", "accepted:", "declined:", "tentative:",
  "re: invitation:", "re: updated invitation:", "canceled:", "cancelled:", "rsvp",
  "invitación:", "invitacion:", "aceptado:", "rechazado:", "cancelado:", "tentativa:",
  "re: invitación:", "re: invitacion:",
  "actualización de invitación:", "actualizacion de invitacion:",
  "ausencia por vacaciones", "ausencia:",
  "cancelled event with note:", "canceled event with note:",
];
const NOISE_SENDER_PATTERNS = [
  "noreply@", "no-reply@", "do-not-reply@", "donotreply@",
  "calendar-notification@", "calendar@", "notifications-noreply@", "notifications@",
  "@calendly.com", "@zoom.us", "@fireflies.ai", "@granola.ai", "@otter.ai",
  "@loom.com", "@mailchimp.com", "@substack.com", "@linkedin.com",
  "@medium.com", "@github.com", "@notion.so", "@slack.com", "@stripe.com",
  "@typeform.com", "@docusign.net", "@dropboxmail.com",
  "bounce", "mailer-daemon", "postmaster@",
];
const NOISE_SUBJECT_HINTS = [
  "unsubscribe", "newsletter", "weekly digest", "daily digest",
  "your receipt", "receipt from", "payment received", "payment confirmation",
  "invoice paid", "out of office", "automatic reply",
  "respuesta automática", "respuesta automatica", "notification:",
  "your meeting notes", "meeting notes are ready", "meeting recap",
  "call recording", "is ready to view", "summary of your", "here are your notes",
];

function isCalendarOrNoise(params: { subject: string; fromEmail: string }): "calendar" | "noise" | null {
  // Strip forwarded/reply prefixes before pattern-matching — otherwise
  // "FW: Updated invitation:" leaks through the calendar filter.
  const subj = params.subject
    .toLowerCase()
    .replace(/^\s*(fw|fwd|re|rv|resp)\s*[:\-]\s*/i, "")
    .replace(/^\s*(fw|fwd|re|rv|resp)\s*[:\-]\s*/i, "") // run twice for "Fwd: Re:"
    .trim();
  const from = params.fromEmail.toLowerCase();
  if (CALENDAR_SUBJECT_PREFIXES.some(p => subj.startsWith(p))) return "calendar";
  if (NOISE_SENDER_PATTERNS.some(p => from.includes(p))) return "noise";
  if (NOISE_SUBJECT_HINTS.some(h => subj.includes(h))) return "noise";
  return null;
}

type ThreadInfo = {
  threadId: string;
  messageId: string;
  internalDate: Date;
  subject: string;
  fromEmail: string;
  fromName: string;
  toEmails: string[];
  ccEmails: string[];
  snippet: string;
  permalink: string;
};

export async function runGmailIngestor(input: IngestInput): Promise<IngestResult> {
  const startedAt = new Date();
  const errors: IngestError[] = [];
  const signals: Signal[] = [];
  let processed = 0;
  let skipped = 0;
  let toWatermark: string | null = null;
  let fallbackUsed: string | undefined;

  // ─── Resolve since watermark ──────────────────────────────────────────
  let since: string | null = null;
  if (input.mode === "backfill") {
    since = input.since ?? null;
  } else {
    since = await getWatermark(SOURCE_TYPE);
    if (!since) {
      const d = new Date(Date.now() - DEFAULT_BACKFILL_DAYS * 86_400_000);
      since = d.toISOString();
      fallbackUsed = "no_prior_watermark_defaulted_to_7d";
    }
  }

  // ─── Start run log ────────────────────────────────────────────────────
  const runId = await startIngestorRun({
    sourceType: SOURCE_TYPE,
    ingestorVersion: INGESTOR_VERSION,
    sinceWatermark: since,
  });

  try {
    // ─── Fetch Gmail threads ────────────────────────────────────────────
    const gmail = getGoogleGmailClient();
    if (!gmail) throw new Error("Gmail client unavailable — check GOOGLE_* env vars");
    const selfSet = await getSelfEmails();
    if (selfSet.size === 0) {
      // Without self identities we cannot compute ball_in_court — abort cleanly
      fallbackUsed = "no_self_identities";
      throw new Error("hall_self_identities is empty — ingestor cannot determine ball_in_court");
    }

    const threads = await fetchThreadsSince(gmail, since, input.maxItems ?? DEFAULT_MAX_ITEMS);

    // ─── Filter + build per-thread context ──────────────────────────────
    const actionableThreads: Array<ThreadInfo & { ball: "jose"; isPrimary: boolean }> = [];
    const relationshipTouches: Array<{ email: string; at: Date; direction: "inbound" | "outbound" }> = [];
    let maxInternalDate = since ? new Date(since) : new Date(0);

    for (const t of threads) {
      try {
        if (t.internalDate > maxInternalDate) maxInternalDate = t.internalDate;

        const senderIsSelf = selfSet.has(t.fromEmail.toLowerCase());
        const joseInTo = t.toEmails.some(e => selfSet.has(e.toLowerCase()));
        const joseInCc = t.ccEmails.some(e => selfSet.has(e.toLowerCase()));

        // Relationship touch regardless of outcome (if not bot/noreply sender)
        const isBotSender = NOISE_SENDER_PATTERNS.some(p => t.fromEmail.toLowerCase().includes(p));
        if (!senderIsSelf && !isBotSender) {
          relationshipTouches.push({ email: t.fromEmail, at: t.internalDate, direction: "inbound" });
        } else if (senderIsSelf && t.toEmails.length > 0) {
          relationshipTouches.push({ email: t.toEmails[0], at: t.internalDate, direction: "outbound" });
        }

        // Skip gates — counted as 'skipped' for observability
        if (senderIsSelf) { skipped++; continue; }
        if (!joseInTo) { skipped++; continue; } // Cc-only → demote (v1)
        const noiseKind = isCalendarOrNoise({ subject: t.subject, fromEmail: t.fromEmail });
        if (noiseKind) { skipped++; continue; } // calendar invites / newsletters / bot → no ActionSignal
        void joseInCc;

        actionableThreads.push({ ...t, ball: "jose", isPrimary: joseInTo });
      } catch (err: unknown) {
        errors.push({ source_id: t.threadId, message: err instanceof Error ? err.message : String(err) });
      }
    }

    toWatermark = maxInternalDate.toISOString();

    // ─── Generate next_action for actionable threads (batched Haiku) ────
    const nextActions = actionableThreads.length
      ? await generateNextActions(actionableThreads, errors)
      : new Map<string, string>();

    // ─── Resolve contacts → person_id + warmth ──────────────────────────
    const allEmails = Array.from(new Set([
      ...actionableThreads.map(t => t.fromEmail.toLowerCase()),
      ...relationshipTouches.map(r => r.email.toLowerCase()),
    ]));
    const contactMap = allEmails.length
      ? await resolveContacts(allEmails)
      : new Map<string, ResolvedContact>();

    // ─── Phase 11 — load Management Level + person→projects map ────────
    // Only fetched when there are actionable threads (saves Notion calls
    // when there's nothing to gate).
    const [projectRoles, peopleProjectMap] = actionableThreads.length > 0
      ? await Promise.all([loadProjectRoles(), loadPersonProjectMap()])
      : [new Map(), new Map()];

    // ─── Build ActionSignals ────────────────────────────────────────────
    for (const t of actionableThreads) {
      // Haiku SKIP = drop. If next_action is null the LLM decided this isn't
      // actionable — respect it rather than emitting a null-action row.
      const nextAction = nextActions.get(t.threadId);
      if (!nextAction) { skipped++; continue; }

      // Phase 11 — Management gate via counterparty's Projects relation.
      // If the sender is on a mentorship/observer-only set of projects,
      // this email is project-scoped advisory work — skip ActionSignal.
      // Senders with no project context (cold contacts, unrelated people)
      // pass through unchanged.
      const inferredProject = effectiveProjectFor({
        email:      t.fromEmail,
        peopleMap:  peopleProjectMap,
        roles:      projectRoles,
      });
      const gate = passesManagementGate({
        projectNotionId: inferredProject,
        roles:           projectRoles,
        // For Gmail there's no per-thread "actor=Jose" classification;
        // the user being on To: AND last sender is not self already implies
        // Jose owes a reply. Treat as actor=self for the gate so mentorship
        // emails where Jose IS the addressee still pass.
        actorIsSelf: true,
      });
      if (!gate.pass) { skipped++; continue; }

      const contact = contactMap.get(t.fromEmail.toLowerCase());
      // Relationship Tier lives in Notion; not yet mirrored to Supabase people.
      // When that sync lands, read contact.tier here. For now, tier is null and
      // the priority formula falls back to warmth (see priority.ts).
      const tier: "VIP" | "Active" | "Occasional" | "Dormant" | null = null;
      const warmth = mapWarmthStr(contact?.contact_warmth);
      const founderOwned = false; // v1: no founder-owned detection in gmail ingestor

      const factors = buildFactors({
        intent:         "reply",
        deadline:       null,
        lastMotionAt:   t.internalDate,
        tier,
        warmth,
        objectiveTier:  null,
        founderOwned,
      });

      const signal: ActionSignal = {
        kind: "action",
        source_type: SOURCE_TYPE,
        source_id: t.threadId,
        source_url: t.permalink,
        emitted_at: new Date().toISOString(),
        ingestor_version: INGESTOR_VERSION,
        related_ids: {
          contact_id: contact?.id ?? undefined,
        },
        payload: {
          intent: "reply",
          ball_in_court: "jose",
          owner_person_id: null,
          founder_owned: founderOwned,
          next_action: nextAction,
          subject: t.subject || "(no subject)",
          counterparty: t.fromName || t.fromEmail || null,
          deadline: null,
          last_motion_at: t.internalDate.toISOString(),
          consequence: null,
          priority_factors: factors,
        },
      };
      signals.push(signal);
      processed++;
    }

    // ─── Build RelationshipSignals ──────────────────────────────────────
    for (const r of relationshipTouches) {
      const contact = contactMap.get(r.email.toLowerCase());
      if (!contact?.id) continue; // need resolved person_id; unresolved emails stay in orphan queue
      const rel: RelationshipSignal = {
        kind: "relationship",
        source_type: SOURCE_TYPE,
        source_id: `${r.direction}:${contact.id}:${r.at.getTime()}`,
        emitted_at: new Date().toISOString(),
        ingestor_version: INGESTOR_VERSION,
        related_ids: { contact_id: contact.id },
        payload: {
          contact_id: contact.id,
          direction: r.direction,
          at: r.at.toISOString(),
        },
      };
      signals.push(rel);
    }
  } catch (err: unknown) {
    errors.push({ message: err instanceof Error ? err.message : String(err) });
  }

  // ─── Persist + finalize ────────────────────────────────────────────────
  const { counts, errors: persistErrors } = await persistSignals(signals, { dryRun: input.dryRun ?? false });
  errors.push(...persistErrors);

  const result: IngestResult = {
    source_type: SOURCE_TYPE,
    ingestor_version: INGESTOR_VERSION,
    started_at: startedAt.toISOString(),
    finished_at: new Date().toISOString(),
    since_watermark: since,
    to_watermark: toWatermark,
    processed,
    skipped,
    errors,
    fallback_used: fallbackUsed,
    signals,
    dry_run: input.dryRun ?? false,
    run_id: runId,
  };

  await finishIngestorRun({
    runId,
    toWatermark,
    processed,
    skipped,
    errors,
    signalsEmitted: { ...counts, ...summarizeResult(result) },
    fallbackUsed,
    dryRun: input.dryRun ?? false,
  });

  if (!input.dryRun) {
    await flushPerRowErrorsToDlq({
      sourceType: SOURCE_TYPE,
      ingestorVersion: INGESTOR_VERSION,
      runId,
      errors,
    });
  }

  // Only advance the watermark on non-dryRun delta runs with no fatal errors
  // Watermark advances when there are NO fatal errors. Per-row errors
  // (e.g. one malformed thread) are routed to the DLQ via flushPerRowErrorsToDlq
  // so the pipeline doesn't stall on a single poison row.
  if (!input.dryRun && input.mode === "delta" && toWatermark && !hasFatalErrors(errors)) {
    await setWatermark({
      sourceType: SOURCE_TYPE,
      watermark: toWatermark,
      ingestorVersion: INGESTOR_VERSION,
      runId,
    });
  }

  return result;
}

// ─── Internal helpers ──────────────────────────────────────────────────────

async function fetchThreadsSince(
  gmail: gmail_v1.Gmail,
  sinceIso: string | null,
  maxItems: number
): Promise<ThreadInfo[]> {
  const sinceDate = sinceIso ? new Date(sinceIso) : new Date(Date.now() - DEFAULT_BACKFILL_DAYS * 86_400_000);
  const ageMs = Date.now() - sinceDate.getTime();
  const days = Math.max(1, Math.ceil(ageMs / 86_400_000));
  const q = `newer_than:${days}d in:inbox -category:promotions -category:social -category:updates`;

  const list = await gmail.users.threads.list({
    userId: "me",
    q,
    maxResults: Math.min(maxItems, 100),
  });
  const ids = (list.data.threads ?? []).map(t => t.id).filter((x): x is string => typeof x === "string");

  const out: ThreadInfo[] = [];
  for (const threadId of ids) {
    const detail = await gmail.users.threads.get({
      userId: "me",
      id: threadId,
      format: "metadata",
      metadataHeaders: ["From", "To", "Cc", "Subject", "Date"],
    });
    const messages = detail.data.messages ?? [];
    if (messages.length === 0) continue;
    const last = messages[messages.length - 1];
    const headers = last.payload?.headers ?? [];
    const get = (name: string) =>
      headers.find(h => (h.name ?? "").toLowerCase() === name.toLowerCase())?.value ?? "";
    const fromRaw = get("From");
    const toRaw = get("To");
    const ccRaw = get("Cc");
    const subject = get("Subject");
    const internalDateMs = Number(last.internalDate ?? 0);
    if (!internalDateMs) continue;
    const internalDate = new Date(internalDateMs);
    if (internalDate.getTime() < sinceDate.getTime()) continue;

    out.push({
      threadId,
      messageId: last.id ?? "",
      internalDate,
      subject,
      fromEmail: parseEmail(fromRaw),
      fromName: parseName(fromRaw) || parseEmail(fromRaw),
      toEmails: parseEmailList(toRaw),
      ccEmails: parseEmailList(ccRaw),
      snippet: (last.snippet ?? "").slice(0, 280),
      permalink: `https://mail.google.com/mail/u/0/#inbox/${threadId}`,
    });
  }
  return out;
}

function parseEmail(raw: string): string {
  if (!raw) return "";
  const angle = raw.match(/<([^>]+)>/);
  const email = (angle ? angle[1] : raw).trim().toLowerCase();
  return email;
}

function parseName(raw: string): string {
  if (!raw) return "";
  const m = raw.match(/^\s*"?([^"<]+?)"?\s*<[^>]+>\s*$/);
  return (m?.[1] ?? "").trim();
}

function parseEmailList(raw: string): string[] {
  if (!raw) return [];
  return raw.split(",").map(s => parseEmail(s.trim())).filter(Boolean);
}

type ResolvedContact = {
  id:               string;
  email:            string;
  full_name:        string | null;
  contact_warmth:   string | null;
};

async function resolveContacts(emails: string[]): Promise<Map<string, ResolvedContact>> {
  const keys = [...new Set(emails.map(e => e.toLowerCase()).filter(Boolean))];
  const out = new Map<string, ResolvedContact>();
  if (keys.length === 0) return out;
  const sb = getSupabaseServerClient();
  const { data, error } = await sb
    .from("people")
    .select("id, email, full_name, contact_warmth")
    .in("email", keys);
  if (error) return out; // caller continues without contact resolution
  for (const r of (data ?? []) as ResolvedContact[]) {
    if (r.email) out.set(r.email.toLowerCase(), r);
  }
  return out;
}

function mapWarmthStr(s: unknown): "hot" | "warm" | "cool" | "dormant" | null {
  if (typeof s !== "string") return null;
  const lower = s.toLowerCase();
  if (lower === "hot") return "hot";
  if (lower === "warm") return "warm";
  if (lower === "cold" || lower === "cool") return "cool";
  if (lower === "dormant") return "dormant";
  return null;
}

async function generateNextActions(
  threads: Array<ThreadInfo & { ball: "jose" }>,
  errors: IngestError[]
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    errors.push({ message: "ANTHROPIC_API_KEY missing — next_action generation skipped" });
    return out;
  }

  const anthropic = new Anthropic({ apiKey });
  const items = threads.map((t, i) => ({
    index:   i,
    from:    t.fromName || t.fromEmail,
    subject: t.subject,
    snippet: t.snippet,
  }));

  const prompt = `You are helping Jose decide the next concrete action for each email thread below.

For EACH thread, output one short imperative sentence that tells Jose what to DO next.
Rules:
- Start with an imperative verb (Reply, Confirm, Send, Decide, Approve, Share, Decline, Schedule, Ask, Forward).
- Mention the counterparty or subject only if essential.
- Maximum 12 words.
- No quotes, no markdown, no trailing period.
- If the thread is truly not actionable, output exactly: SKIP

Threads:
${JSON.stringify(items, null, 2)}

Return a JSON array: [{"index": <int>, "next_action": "<imperative line or SKIP>"}]. Only the JSON, no prose.`;

  try {
    const res = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1200,
      messages: [{ role: "user", content: prompt }],
    });
    const block = res.content[0];
    if (!block || block.type !== "text") return out;
    const text = block.text.trim();
    const match = text.match(/\[[\s\S]*\]/);
    if (!match) return out;
    const parsed = JSON.parse(match[0]) as Array<{ index: number; next_action: string }>;
    for (const row of parsed) {
      const t = threads[row.index];
      if (!t) continue;
      const action = (row.next_action ?? "").trim();
      if (!action || action.toUpperCase() === "SKIP") continue;
      out.set(t.threadId, action);
    }
  } catch (err: unknown) {
    errors.push({ message: `next_action generation failed: ${err instanceof Error ? err.message : String(err)}` });
  }
  return out;
}
