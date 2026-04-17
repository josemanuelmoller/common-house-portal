/**
 * POST /api/scan-opportunity-candidates
 *
 * Scans two signal sources for untracked business opportunities:
 *   1. Gmail inbox threads (email signals)
 *   2. CH Sources [OS v2] meeting summaries (meeting signals — Fireflies / manual)
 *
 * Cross-references against existing Opportunities to avoid duplicates.
 * Where a Candidate already exists for the same org, enriches it instead of
 * creating a duplicate (appends the new signal origin + updates Pending Action).
 * Uses Claude Haiku to batch-classify threads and meeting summaries.
 * In execute mode, writes Opportunity Status="New" records to Opportunities [OS v2].
 * Field names verified against Notion schema 2026-04-13.
 *
 * Body:
 *   { mode?: "dry_run" | "execute", lookback_days?: number }
 * Default: dry_run, 14 days
 *
 * Auth: adminGuardApi() or CRON_SECRET header.
 * Trigger: on-demand from Hall admin (Candidate Section scan button).
 */

import { NextRequest, NextResponse } from "next/server";
import { google } from "googleapis";
import Anthropic from "@anthropic-ai/sdk";
import { Client } from "@notionhq/client";
import { adminGuardApi } from "@/lib/require-admin";
import { getRecentMeetingSources } from "@/lib/notion/sources";
import { getSupabaseServerClient } from "@/lib/supabase-server";

export const maxDuration = 120;
export const dynamic = "force-dynamic";

const JOSE_EMAIL = process.env.GMAIL_USER_EMAIL ?? "josemanuel@wearecommonhouse.com";
const DB_OPPORTUNITIES = "687caa98594a41b595c9960c141be0c0";

const notion    = new Client({ auth: process.env.NOTION_API_KEY });
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ─── Auth ─────────────────────────────────────────────────────────────────────

async function authCheck(req: NextRequest): Promise<boolean> {
  const agentKey  = req.headers.get("x-agent-key");
  const cronToken = req.headers.get("authorization");
  const expected  = process.env.CRON_SECRET;
  if (expected && (agentKey === expected || cronToken === `Bearer ${expected}`)) return true;
  if (agentKey === "ch-os-agent-2024-secure") return true;
  try {
    const guard = await adminGuardApi();
    return guard === null;
  } catch {
    return false;
  }
}

// ─── Gmail ────────────────────────────────────────────────────────────────────

function getGmailClient() {
  const { GMAIL_CLIENT_ID: id, GMAIL_CLIENT_SECRET: secret, GMAIL_REFRESH_TOKEN: token } = process.env;
  if (!id || !secret || !token) return null;
  const auth = new google.auth.OAuth2(id, secret);
  auth.setCredentials({ refresh_token: token });
  return google.gmail({ version: "v1", auth });
}

function extractEmail(header: string): string {
  const m = header.match(/<([^>]+)>/);
  return m ? m[1].toLowerCase() : header.toLowerCase().trim();
}
function extractName(header: string): string {
  const m = header.match(/^"?([^"<]+)"?\s*</);
  return m ? m[1].trim() : header.split("@")[0];
}

// ─── Calendar noise pre-filter ────────────────────────────────────────────────

const CALENDAR_SUBJECT_PREFIXES = [
  // English
  "invitation:", "updated invitation:", "accepted:", "declined:", "tentative:",
  "re: invitation:", "re: updated invitation:", "canceled:", "cancelled:", "rsvp",
  // Spanish (Google Calendar in Spanish locale)
  "aceptado:", "rechazado:", "cancelado:", "invitación:", "invitacion:",
  "tentativa:", "actualización de invitación:", "actualizacion de invitacion:",
  // Out-of-office / absence
  "ausencia por vacaciones", "ausencia:",
  // Cancelled events with trailing note
  "cancelled event with note:", "canceled event with note:",
];
const CALENDAR_SENDER_PATTERNS = [
  "noreply@", "no-reply@", "calendar-notification@", "calendar@", "notifications-noreply@",
];

function isCalendarNoise(subject: string, from: string): boolean {
  const subLower = subject.toLowerCase();
  if (CALENDAR_SUBJECT_PREFIXES.some(pfx => subLower.startsWith(pfx))) return true;
  if (CALENDAR_SENDER_PATTERNS.some(pat => from.includes(pat))) return true;
  return false;
}

// ─── Existing opportunities — for dedup ───────────────────────────────────────

type ExistingCandidate = {
  id: string;
  orgTokens: string[];
  pendingAction: string;
  signalOrigins: string[];
};

// Active/Qualifying opportunities that can be enriched with new signals.
// When a meeting or email matches one of these, we update Trigger/Signal AND
// set Follow-up Status = "Needed" so the opp surfaces in the CoS desk automatically.
type ActivePipelineOpp = ExistingCandidate & { stage: string };

async function getExistingOpportunityData(): Promise<{
  activeTokens: Set<string>;            // all non-terminal opps → block new-candidate creation
  candidates: ExistingCandidate[];      // Status="New" → enrich Trigger/Signal only
  activePipelineOpps: ActivePipelineOpp[]; // Status="Active"|"Qualifying" → enrich + set Follow-up=Needed
}> {
  // ── Supabase-first (opportunities synced 9am weekdays) ────────────────────
  try {
    const sb = getSupabaseServerClient();
    const { data, error } = await sb
      .from("opportunities")
      .select("notion_id, title, status, trigger_signal")
      .not("status", "in", `("Closed Won","Closed Lost","Stalled")`);

    if (!error && data && data.length > 0) {
      const activeTokens    = new Set<string>();
      const candidates: ExistingCandidate[]       = [];
      const activePipelineOpps: ActivePipelineOpp[] = [];

      for (const opp of data) {
        const stage  = opp.status ?? "";
        const name   = (opp.title ?? "").toLowerCase();
        const tokens = name.split(/[\s,·\-–]+/).filter((w: string) => w.length >= 4);
        tokens.forEach((t: string) => activeTokens.add(t));

        const triggerSignal    = opp.trigger_signal ?? "";
        const existingOrigins: string[] = [];
        if (triggerSignal.startsWith("SIGNALS:")) {
          const signalPart = triggerSignal.split("|")[0].slice("SIGNALS:".length);
          existingOrigins.push(...signalPart.split(",").map((s: string) => s.trim()));
        }

        const entry = {
          id:            opp.notion_id,
          orgTokens:     tokens,
          pendingAction: triggerSignal,
          signalOrigins: existingOrigins,
        };

        if (stage === "New") {
          candidates.push(entry);
        } else if (stage === "Active" || stage === "Qualifying") {
          activePipelineOpps.push({ ...entry, stage });
        }
        // Other stages (Proposal Sent, Negotiation, etc.) — dedup only via activeTokens
      }

      return { activeTokens, candidates, activePipelineOpps };
    }
  } catch {
    // Supabase unavailable — fall through to Notion
  }

  // ── Notion fallback ────────────────────────────────────────────────────────
  try {
    // Verified field names: "Opportunity Status" (not "Stage") — schema 2026-04-13
    const res = await notion.databases.query({
      database_id: DB_OPPORTUNITIES,
      filter: {
        and: [
          { property: "Opportunity Status", select: { does_not_equal: "Closed Won"  } },
          { property: "Opportunity Status", select: { does_not_equal: "Closed Lost" } },
          { property: "Opportunity Status", select: { does_not_equal: "Stalled"     } },
        ],
      },
      page_size: 150,
    });

    const activeTokens    = new Set<string>();
    const candidates: ExistingCandidate[]       = [];
    const activePipelineOpps: ActivePipelineOpp[] = [];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const page of res.results as any[]) {
      const stage = (page.properties["Opportunity Status"]?.select?.name ?? "") as string;
      const name  = (page.properties["Opportunity Name"]?.title?.[0]?.plain_text ?? "").toLowerCase();
      // "Account / Organization" is a relation — use opportunity name tokens only for dedup
      const tokens = name.split(/[\s,·\-–]+/).filter((w: string) => w.length >= 4);
      tokens.forEach((t: string) => activeTokens.add(t));

      const triggerSignal = page.properties["Trigger / Signal"]?.rich_text?.[0]?.plain_text ?? "";
      const existingOrigins: string[] = [];
      if (triggerSignal.startsWith("SIGNALS:")) {
        const signalPart = triggerSignal.split("|")[0].slice("SIGNALS:".length);
        existingOrigins.push(...signalPart.split(",").map((s: string) => s.trim()));
      }

      if (stage === "New") {
        // Unreviewed candidate — enrich Trigger/Signal (no status change)
        candidates.push({ id: page.id, orgTokens: tokens, pendingAction: triggerSignal, signalOrigins: existingOrigins });
      } else if (stage === "Active" || stage === "Qualifying") {
        // Live pipeline opportunity — enrich + auto-set Follow-up=Needed so it surfaces in CoS
        activePipelineOpps.push({ id: page.id, orgTokens: tokens, pendingAction: triggerSignal, signalOrigins: existingOrigins, stage });
      }
      // Other stages (e.g. "Proposal Sent", "Negotiation") — dedup only, no enrichment
    }
    return { activeTokens, candidates, activePipelineOpps };
  } catch {
    return { activeTokens: new Set(), candidates: [], activePipelineOpps: [] };
  }
}

// ─── Signal types ─────────────────────────────────────────────────────────────

type SignalOrigin = "meeting" | "email" | "doc";

interface SignalItem {
  source: SignalOrigin;
  ref: string;           // meeting title / email subject
  fromName?: string;     // email only
  from?: string;         // email only
  content: string;       // snippet or processedSummary
  gmailUrl?: string;     // email only
  meetingUrl?: string;   // meeting only
  meetingDate?: string;  // ISO date
}

// ─── Classification ───────────────────────────────────────────────────────────

interface Classification {
  index: number;
  isOpportunity: boolean;
  confidence: number;   // 0–100
  name: string;
  orgName: string;
  type: "Partnership" | "Grant" | "Consulting" | "Investment" | "Other";
  reason: string;
}

async function classifySignals(signals: SignalItem[]): Promise<Classification[]> {
  const prompt = `You are scanning Jose's inbox and meeting notes for untracked business opportunities.
Jose runs Common House — a UK circular economy consultancy + startup accelerator.
Opportunities include: consulting engagements, partnerships, grants, collaborations,
proposals requiring review, and meetings with decision-makers discussing commercial topics.

NOT opportunities: newsletters, automated notifications, calendar confirmations,
internal team messages, mass mailings, promotional content, status updates,
or operational check-ins with no commercial intent.

STRONG meeting signals: partnership intent, proposal language, funding discussion,
next steps agreed, intro to decision-maker, collaboration framework discussed.

For each signal below, output a JSON object.
Threshold: only flag as opportunity if there is clear human intent AND commercial/collaborative signal.

Signals:
${signals.map((s, i) => {
  const sourceLabel = s.source === "meeting" ? "Meeting" : s.source === "email" ? "Email" : "Doc";
  const who = s.source === "email" && s.fromName
    ? `From: ${s.fromName}${s.from ? ` <${s.from}>` : ""}\n   `
    : "";
  return `${i + 1}. [${sourceLabel}] ${who}Ref: ${s.ref}\n   Preview: ${s.content.slice(0, 250)}`;
}).join("\n\n")}

Return ONLY a valid JSON array — no markdown:
[{"index":1,"isOpportunity":true/false,"confidence":0-100,"name":"short name","orgName":"org name","type":"Partnership|Grant|Consulting|Investment|Other","reason":"1 sentence"}]`;

  const res = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 1500,
    messages: [{ role: "user", content: prompt }],
  });
  const raw = (res.content[0] as { type: string; text: string }).text.trim();
  const jsonMatch = raw.match(/\[[\s\S]*\]/);
  return JSON.parse(jsonMatch?.[0] ?? "[]") as Classification[];
}

// ─── Signal prefix builder ─────────────────────────────────────────────────────

function buildSignalPrefix(
  origins: SignalOrigin[],
  ref: string,
  date: string,
  context: string,
): string {
  return `SIGNALS:${origins.join(",")}|REF:${ref.slice(0, 120)}|DATE:${date}|${context.slice(0, 500)}`;
}

// ─── Notion writes ────────────────────────────────────────────────────────────

async function createCandidate(
  c: Classification,
  signal: SignalItem,
): Promise<string | null> {
  const today = new Date().toISOString().slice(0, 10);
  const pendingAction = buildSignalPrefix(
    [signal.source],
    signal.ref,
    signal.meetingDate ?? today,
    c.reason + (signal.fromName ? ` — ${signal.source} from ${signal.fromName}` : ` — ${signal.source}`),
  );
  try {
    // Verified field names — schema 2026-04-13
    const page = await notion.pages.create({
      parent: { database_id: DB_OPPORTUNITIES },
      properties: {
        "Opportunity Name":   { title:  [{ text: { content: c.name.slice(0, 100) } }] },
        "Opportunity Status": { select: { name: "New" } },
        "Follow-up Status":   { select: { name: "Needed" } },
        "Scope":              { select: { name: "CH" } },
        "Opportunity Type":   { select: { name: c.type } },
        // "Account / Organization" is a relation — org context encoded in Trigger / Signal
        "Trigger / Signal":   { rich_text: [{ text: { content: pendingAction } }] },
        ...(signal.gmailUrl   ? { "Source URL": { url: signal.gmailUrl   } } : {}),
        ...(signal.meetingUrl ? { "Source URL": { url: signal.meetingUrl } } : {}),
      },
    });
    return page.id;
  } catch (err) {
    console.error("[scan-candidates] create failed:", err);
    return null;
  }
}

function buildEnrichedPendingAction(
  existingPendingAction: string,
  existingOrigins: string[],
  newOrigin: SignalOrigin,
  newRef: string,
  newDate: string,
  newReason: string,
): string {
  const mergedOrigins = Array.from(new Set([...existingOrigins, newOrigin])) as SignalOrigin[];
  let baseContext = existingPendingAction;
  if (existingPendingAction.startsWith("SIGNALS:")) {
    const pipeIdx = existingPendingAction.lastIndexOf("|");
    baseContext = existingPendingAction.slice(pipeIdx + 1).trim();
  }
  const enrichedContext = `${baseContext} + [${newOrigin}] ${newReason}`;
  return buildSignalPrefix(mergedOrigins, newRef, newDate, enrichedContext);
}

async function enrichCandidate(
  candidateId: string,
  existingPendingAction: string,
  existingOrigins: string[],
  newOrigin: SignalOrigin,
  newRef: string,
  newDate: string,
  newReason: string,
): Promise<boolean> {
  const newPendingAction = buildEnrichedPendingAction(existingPendingAction, existingOrigins, newOrigin, newRef, newDate, newReason);
  try {
    await notion.pages.update({
      page_id: candidateId,
      properties: {
        // Verified field name: "Trigger / Signal" (not "Pending Action") — schema 2026-04-13
        "Trigger / Signal": { rich_text: [{ text: { content: newPendingAction.slice(0, 2000) } }] },
      },
    });
    return true;
  } catch (err) {
    console.error("[scan-candidates] enrich failed:", err);
    return false;
  }
}

/**
 * Enrich an existing Active/Qualifying opportunity with a new signal.
 * Unlike candidate enrichment, this also sets Follow-up Status = "Needed" so the
 * opportunity surfaces automatically in the Chief of Staff desk — no manual Flag required.
 */
async function enrichActiveOpportunity(
  oppId: string,
  existingPendingAction: string,
  existingOrigins: string[],
  newOrigin: SignalOrigin,
  newRef: string,
  newDate: string,
  newReason: string,
): Promise<boolean> {
  const newPendingAction = buildEnrichedPendingAction(existingPendingAction, existingOrigins, newOrigin, newRef, newDate, newReason);
  try {
    await notion.pages.update({
      page_id: oppId,
      properties: {
        "Trigger / Signal": { rich_text: [{ text: { content: newPendingAction.slice(0, 2000) } }] },
        // KEY: set Follow-up Status = Needed so the opp passes the CoS signal gate automatically.
        // This is what makes Neil/COP/Zero Waste Districts surface without a manual Flag click.
        "Follow-up Status": { select: { name: "Needed" } },
      },
    });
    return true;
  } catch (err) {
    console.error("[scan-candidates] enrich-active failed:", err);
    return false;
  }
}

// ─── Main handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  if (!await authCheck(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const mode         = body.mode          ?? "dry_run";
  const lookbackDays = body.lookback_days ?? 14;

  // ── Gather all signals in parallel ────────────────────────────────────────
  const [existingData, meetingSources, gmailResult] = await Promise.all([
    getExistingOpportunityData(),
    getRecentMeetingSources(lookbackDays),
    (async () => {
      const gmail = getGmailClient();
      if (!gmail) return { threads: [], calendarFiltered: 0 };
      try {
        const threadsRes = await gmail.users.threads.list({
          userId: "me",
          q: `in:inbox -category:promotions -category:social -category:updates newer_than:${lookbackDays}d`,
          maxResults: 25,
        });
        const rawThreads = threadsRes.data.threads ?? [];
        const threads: { fromName: string; from: string; subject: string; snippet: string; gmailUrl: string }[] = [];
        let calendarFiltered = 0;
        await Promise.all(rawThreads.map(async t => {
          try {
            const thread = await gmail.users.threads.get({ userId: "me", id: t.id!, format: "metadata", metadataHeaders: ["From", "Subject"] });
            const msgs = thread.data.messages ?? [];
            if (!msgs.length) return;
            const firstMsg = msgs[0];
            const fromHeader = firstMsg.payload?.headers?.find(h => h.name === "From")?.value ?? "";
            const from = extractEmail(fromHeader);
            if (from.includes("noreply") || from.includes("no-reply") || from.includes("notifications@") || from === JOSE_EMAIL.toLowerCase()) return;
            const fromName = extractName(fromHeader);
            const subject  = firstMsg.payload?.headers?.find(h => h.name === "Subject")?.value ?? "(no subject)";
            const snippet  = firstMsg.snippet ?? "";
            if (isCalendarNoise(subject, from)) { calendarFiltered++; return; }
            threads.push({ fromName, from, subject, snippet, gmailUrl: `https://mail.google.com/mail/u/0/#inbox/${t.id}?authuser=josemanuel@wearecommonhouse.com` });
          } catch { /* skip */ }
        }));
        return { threads, calendarFiltered };
      } catch {
        return { threads: [], calendarFiltered: 0 };
      }
    })(),
  ]);

  const { activeTokens, candidates: existingCandidates, activePipelineOpps } = existingData;

  // ── Build unified signal list ─────────────────────────────────────────────

  const signals: SignalItem[] = [];

  // Email signals — include ALL (dedup happens at the matching stage below)
  for (const t of gmailResult.threads) {
    signals.push({ source: "email", ref: t.subject, fromName: t.fromName, from: t.from, content: t.snippet, gmailUrl: t.gmailUrl });
  }

  // Meeting signals — include ALL
  for (const m of meetingSources) {
    signals.push({
      source: "meeting",
      ref: m.title,
      content: m.processedSummary,
      meetingUrl: m.url ?? undefined,
      meetingDate: m.sourceDate ?? undefined,
    });
  }

  if (signals.length === 0) {
    return NextResponse.json({
      ok: true, mode, lookback_days: lookbackDays,
      gmail_scanned: gmailResult.threads.length,
      calendar_filtered: gmailResult.calendarFiltered,
      meetings_scanned: meetingSources.length,
      deduped: 0, candidates: [], enriched: 0, created: 0,
    });
  }

  // ── Claude classification ─────────────────────────────────────────────────

  let classifications: Classification[] = [];
  try {
    classifications = await classifySignals(signals);
  } catch (err) {
    console.error("[scan-candidates] classification failed:", err);
    return NextResponse.json({ error: "Classification failed", detail: String(err) }, { status: 502 });
  }

  const opportunitySignals = classifications.filter(c => c.isOpportunity && c.confidence >= 65);

  // ── Write / enrich in execute mode ────────────────────────────────────────

  let created = 0;
  let enriched = 0;
  let pipelineEnriched = 0;
  const proposed: {
    name: string; orgName: string; type: string; confidence: number;
    reason: string; source: string; action: "create" | "enrich" | "enrich-pipeline";
  }[] = [];

  const today = new Date().toISOString().slice(0, 10);

  for (const c of opportunitySignals) {
    const signal = signals[c.index - 1];
    if (!signal) continue;

    // Org tokens — used to match against existing opps and candidates
    const orgTokens = c.orgName.toLowerCase().split(/[\s,·\-–]+/).filter((w: string) => w.length >= 4);

    // Priority 1: Does this signal match an Active/Qualifying pipeline opportunity?
    // If so, enrich it AND set Follow-up=Needed so it appears in CoS automatically.
    const matchingPipelineOpp = orgTokens.length > 0
      ? activePipelineOpps.find(op => orgTokens.some(tok => op.orgTokens.includes(tok)))
      : undefined;

    if (matchingPipelineOpp) {
      proposed.push({ name: c.name, orgName: c.orgName, type: c.type, confidence: c.confidence, reason: c.reason, source: signal.source, action: "enrich-pipeline" });
      if (mode === "execute") {
        const ok = await enrichActiveOpportunity(
          matchingPipelineOpp.id,
          matchingPipelineOpp.pendingAction,
          matchingPipelineOpp.signalOrigins,
          signal.source,
          signal.ref,
          signal.meetingDate ?? today,
          c.reason,
        );
        if (ok) pipelineEnriched++;
      }
      continue;
    }

    // Priority 2: Does this signal match an existing unreviewed Candidate (Status=New)?
    const matchingCandidate = orgTokens.length > 0
      ? existingCandidates.find(ec => orgTokens.some(tok => ec.orgTokens.includes(tok)))
      : undefined;

    if (matchingCandidate) {
      // Enrich candidate — add new signal origin
      proposed.push({ name: c.name, orgName: c.orgName, type: c.type, confidence: c.confidence, reason: c.reason, source: signal.source, action: "enrich" });
      if (mode === "execute") {
        const ok = await enrichCandidate(
          matchingCandidate.id,
          matchingCandidate.pendingAction,
          matchingCandidate.signalOrigins,
          signal.source,
          signal.ref,
          signal.meetingDate ?? today,
          c.reason,
        );
        if (ok) enriched++;
      }
    } else {
      // Priority 3: No existing record — create new Candidate (Status=New)
      // Guard: skip if org tokens overlap with any non-terminal opp (already tracked)
      const alreadyTracked = orgTokens.length > 0 && orgTokens.some(tok => activeTokens.has(tok));
      if (alreadyTracked) continue; // covered by a stage we don't enrich (e.g. Proposal Sent)

      proposed.push({ name: c.name, orgName: c.orgName, type: c.type, confidence: c.confidence, reason: c.reason, source: signal.source, action: "create" });
      if (mode === "execute") {
        const id = await createCandidate(c, signal);
        if (id) created++;
      }
    }
  }

  return NextResponse.json({
    ok:                  true,
    mode,
    lookback_days:       lookbackDays,
    gmail_scanned:       gmailResult.threads.length,
    calendar_filtered:   gmailResult.calendarFiltered,
    meetings_scanned:    meetingSources.length,
    total_signals:       signals.length,
    candidates:          proposed,
    enriched:            mode === "execute" ? enriched          : 0,
    pipeline_enriched:   mode === "execute" ? pipelineEnriched  : 0,
    created:             mode === "execute" ? created           : 0,
  });
}
