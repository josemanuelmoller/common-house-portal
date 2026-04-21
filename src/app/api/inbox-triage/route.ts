/**
 * GET /api/inbox-triage
 *
 * Scans Gmail main inbox for threads that need Jose's attention:
 *   — Unread for 2+ days
 *   — Read but no reply from Jose in 2+ days
 *
 * Uses Claude Haiku to classify each candidate as:
 *   Urgent   — partner/funder/investor or explicit deadline/request
 *   Needs Reply — clear question or action required
 *   FYI      — informational, low pressure
 *
 * Returns top 10 flagged threads sorted by urgency then days waiting.
 *
 * Auth: x-agent-key header or Vercel cron CRON_SECRET.
 * Called on-demand from the Hall admin UI (client-side fetch).
 */

import { NextRequest, NextResponse } from "next/server";
import { google } from "googleapis";
import Anthropic from "@anthropic-ai/sdk";
import { adminGuardApi } from "@/lib/require-admin";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { getContactsByEmails, isPersonalContact, isVipContact, type ContactView } from "@/lib/contacts";

// Normalize a subject for lineage matching: strip Re:/Fwd: prefixes, lowercase, collapse whitespace.
function normalizeSubject(subject: string): string {
  return subject
    .toLowerCase()
    .replace(/^(\s*(re|fw|fwd|aw|sv|r|f)\s*:\s*)+/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

// Build the reliable Gmail deep-link: pick the account via ?authuser= BEFORE
// the hash, then use #all/<threadId> which works even if the thread has left
// the inbox. u/0 is removed because it silently lands in the wrong account
// when slot 0 isn't the CH one in the browser.
function buildGmailUrl(threadId: string, userEmail: string): string {
  return `https://mail.google.com/mail/?authuser=${encodeURIComponent(userEmail)}#all/${threadId}`;
}

export const maxDuration = 60;

const JOSE_EMAIL = process.env.GMAIL_USER_EMAIL ?? "josemanuel@wearecommonhouse.com";
const THRESHOLD_DAYS = 2;
const MAX_THREADS = 75;

async function authCheck(req: NextRequest): Promise<boolean> {
  const agentKey  = req.headers.get("x-agent-key");
  const cronToken = req.headers.get("authorization");
  const expected  = process.env.CRON_SECRET;
  if (expected && agentKey === expected) return true;
  if (expected && cronToken === `Bearer ${expected}`) return true;
  // Hardcoded fallback for direct agent calls
  if (agentKey === "ch-os-agent-2024-secure") return true;
  // Fall back to Clerk session auth
  try {
    const guard = await adminGuardApi();
    return guard === null;
  } catch {
    return false;
  }
}

function getGmailClient() {
  const clientId     = process.env.GMAIL_CLIENT_ID;
  const clientSecret = process.env.GMAIL_CLIENT_SECRET;
  const refreshToken = process.env.GMAIL_REFRESH_TOKEN;
  if (!clientId || !clientSecret || !refreshToken) return null;
  const auth = new google.auth.OAuth2(clientId, clientSecret);
  auth.setCredentials({ refresh_token: refreshToken });
  return google.gmail({ version: "v1", auth });
}

function extractEmail(header: string): string {
  const match = header.match(/<([^>]+)>/);
  return match ? match[1].toLowerCase() : header.toLowerCase().trim();
}

function extractName(header: string): string {
  const match = header.match(/^"?([^"<]+)"?\s*</);
  return match ? match[1].trim() : header.split("@")[0];
}

export async function GET(req: NextRequest) {
  try {
    return await handleGet(req);
  } catch (err) {
    console.error("[inbox-triage] Unhandled error:", err);
    return NextResponse.json(
      { error: "Internal error", detail: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}

async function handleGet(req: NextRequest) {
  const ok = await authCheck(req);
  if (!ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const gmail = getGmailClient();
  if (!gmail) {
    return NextResponse.json({ error: "Gmail not configured" }, { status: 503 });
  }

  // ?days=N sets the lookback window (default: no window limit, rely on maxResults)
  // The minimum-waiting threshold stays at THRESHOLD_DAYS (2 days) always.
  const windowDays = parseInt(req.nextUrl.searchParams.get("days") ?? "", 10);

  const thresholdMs = THRESHOLD_DAYS * 24 * 60 * 60 * 1000;
  const nowMs = Date.now();

  // Build Gmail query — add newer_than filter when a window is requested
  const windowFilter = windowDays > 0 ? ` newer_than:${windowDays}d` : "";
  const gmailQuery = `in:inbox -category:promotions -category:social -category:updates${windowFilter}`;

  // Fetch recent inbox threads
  const threadsRes = await gmail.users.threads.list({
    userId: "me",
    q: gmailQuery,
    maxResults: MAX_THREADS,
  });

  const threads = threadsRes.data.threads ?? [];
  if (threads.length === 0) {
    return NextResponse.json({ ok: true, items: [] });
  }

  type Candidate = {
    threadId: string;
    subject: string;
    from: string;
    fromName: string;
    snippet: string;
    dateMs: number;
    daysWaiting: number;
    isUnread: boolean;
    hasMyReply: boolean;
    iStartedThread: boolean; // Jose sent the first message — treat intros/FYI forwards as FYI
    msgCount: number;
  };

  const candidates: Candidate[] = [];

  // Fetch each thread's metadata in parallel (batch of 25 is fine)
  await Promise.all(
    threads.map(async (t) => {
      try {
        const thread = await gmail.users.threads.get({
          userId: "me",
          id: t.id!,
          format: "metadata",
          metadataHeaders: ["From", "To", "Subject", "Date"],
        });

        const messages = thread.data.messages ?? [];
        if (messages.length === 0) return;

        const firstMsg = messages[0];
        const lastMsg  = messages[messages.length - 1];

        // Subject from first message
        const subject = firstMsg.payload?.headers?.find(h => h.name === "Subject")?.value ?? "(no subject)";
        // Jose sent the first message? Then this is a thread he initiated
        // (intro, outreach, FYI forward) — very different triage meaning.
        const firstFromHeader = firstMsg.payload?.headers?.find(h => h.name === "From")?.value ?? "";
        const iStartedThread = extractEmail(firstFromHeader) === JOSE_EMAIL.toLowerCase();

        // Pick the "who's waiting on Jose" identity: it's the last non-Jose sender,
        // NOT the first-message sender. Otherwise threads Jose started surface
        // with Jose as `fromName` — confuses both the UI and Haiku.
        let actionableMsg = lastMsg;
        for (let i = messages.length - 1; i >= 0; i--) {
          const h = messages[i].payload?.headers?.find(hh => hh.name === "From")?.value ?? "";
          if (extractEmail(h) !== JOSE_EMAIL.toLowerCase()) {
            actionableMsg = messages[i];
            break;
          }
        }
        const actionableFromHeader = actionableMsg.payload?.headers?.find(h => h.name === "From")?.value ?? "";
        const from = extractEmail(actionableFromHeader);
        const fromName = extractName(actionableFromHeader);
        // Prefer the snippet of the actionable message (the one waiting on Jose),
        // not the thread's opener, so Haiku sees the current ask.
        const snippet = actionableMsg.snippet ?? firstMsg.snippet ?? "";

        // Date of the last message in the thread (most recent activity)
        const lastDateMs = parseInt(lastMsg.internalDate ?? "0", 10);
        const daysWaiting = (nowMs - lastDateMs) / 86400000;

        // Only consider threads with last activity 2+ days ago
        if (nowMs - lastDateMs < thresholdMs) return;

        // Check unread: any message has UNREAD label
        const isUnread = messages.some(m => m.labelIds?.includes("UNREAD"));

        // Check if Jose has replied: any message from Jose's email after the first
        const hasMyReply = messages.slice(1).some(m => {
          const msgFrom = m.payload?.headers?.find(h => h.name === "From")?.value ?? "";
          return extractEmail(msgFrom) === JOSE_EMAIL.toLowerCase();
        });

        // Skip if Jose was the last sender (no action needed)
        const lastSenderHeader = lastMsg.payload?.headers?.find(h => h.name === "From")?.value ?? "";
        const lastSenderEmail  = extractEmail(lastSenderHeader);
        if (lastSenderEmail === JOSE_EMAIL.toLowerCase()) return;

        // Skip only if Jose replied AND no new messages arrived after his last reply
        // (i.e. the last message in the thread is from Jose — already handled above,
        // OR all messages after Jose's last reply are also from Jose — impossible given above check)
        // Removing the old "hasMyReply && !isUnread" filter which incorrectly skipped threads
        // where someone replied AFTER Jose's message (e.g. Eunomia: Jose Apr 6 → Mike Apr 7)

        candidates.push({
          threadId: t.id!,
          subject,
          from,
          fromName,
          snippet,
          dateMs: lastDateMs,
          daysWaiting: Math.floor(daysWaiting),
          isUnread,
          hasMyReply,
          iStartedThread,
          msgCount: messages.length,
        });
      } catch {
        // skip failed threads
      }
    })
  );

  if (candidates.length === 0) {
    return NextResponse.json({ ok: true, items: [] });
  }

  // ── Ignore list: drop threads Jose has explicitly ignored ─────────────────
  // We match on thread_id (strong identity) AND on normalized subject + from
  // (lineage identity) so a reply storm that spawns a new thread with the
  // same title from the same sender stays suppressed too.
  let ignoredThreadIds = new Set<string>();
  let ignoredLineages = new Set<string>(); // key = `${subject_norm}|${from_email}`
  try {
    const sb = getSupabaseServerClient();
    const { data } = await sb
      .from("inbox_ignores")
      .select("thread_id, subject_norm, from_email");
    if (data) {
      ignoredThreadIds = new Set(data.map(r => r.thread_id as string).filter(Boolean));
      ignoredLineages = new Set(
        data
          .filter(r => r.subject_norm && r.from_email)
          .map(r => `${r.subject_norm}|${(r.from_email as string).toLowerCase()}`)
      );
    }
  } catch (err) {
    console.warn("[inbox-triage] Supabase ignore lookup failed:", err);
  }

  const notIgnored = candidates.filter(c => {
    if (ignoredThreadIds.has(c.threadId)) return false;
    const key = `${normalizeSubject(c.subject)}|${c.from.toLowerCase()}`;
    if (ignoredLineages.has(key)) return false;
    return true;
  });

  // ── Rule-based pre-filter: drop calendar noise before Claude ─────────────
  // Calendar auto-updates (invites, RSVPs, recurring updates) are never
  // actionable inbox items — they clutter the triage and inflate Urgent count.
  const CALENDAR_SUBJECT_PREFIXES = [
    // English calendar subjects
    "invitation:",
    "updated invitation:",
    "accepted:",
    "declined:",
    "tentative:",
    "re: invitation:",
    "re: updated invitation:",
    "canceled:",
    "cancelled:",
    "rsvp",
    // Spanish calendar subjects (Google Calendar in Spanish locale)
    "invitación:",
    "invitacion:",
    "aceptado:",
    "rechazado:",
    "cancelado:",
    "tentativa:",
    "re: invitación:",
    "re: invitacion:",
    "actualización de invitación:",
    "actualizacion de invitacion:",
    // Out-of-office / absence notifications
    "ausencia por vacaciones",
    "ausencia:",
    // Cancelled events with trailing note (e.g. "Cancelled event with note: ...")
    "cancelled event with note:",
    "canceled event with note:",
  ];
  const CALENDAR_SENDER_PATTERNS = [
    "noreply@",
    "no-reply@",
    "do-not-reply@",
    "donotreply@",
    "calendar-notification@",
    "calendar@",
    "notifications-noreply@",
    "notifications@",
    "@calendly.com",
    "@zoom.us",
    "@fireflies.ai",
    "@granola.ai",
    "@otter.ai",
    "@loom.com",
    "@mailchimp.com",
    "@substack.com",
    "@linkedin.com",
    "@medium.com",
    "@github.com",
    "@notion.so",
    "@slack.com",
    "@stripe.com",
    "@typeform.com",
    "@docusign.net",
    "@dropboxmail.com",
    "bounce",
    "mailer-daemon",
    "postmaster@",
  ];
  // Subjects that are almost always non-actionable noise from human senders.
  const NOISE_SUBJECT_HINTS = [
    "unsubscribe",
    "newsletter",
    "weekly digest",
    "daily digest",
    "your receipt",
    "receipt from",
    "payment received",
    "payment confirmation",
    "invoice paid",
    "out of office",
    "automatic reply",
    "respuesta automática",
    "respuesta automatica",
    "notification:",
    "your meeting notes",
    "meeting notes are ready",
    "meeting recap",
    "call recording",
    "is ready to view",
    "summary of your",
    "here are your notes",
  ];
  const isCalendarNoise = (c: (typeof candidates)[0]): boolean => {
    const subjectLower = c.subject.toLowerCase();
    if (CALENDAR_SUBJECT_PREFIXES.some(pfx => subjectLower.startsWith(pfx))) return true;
    if (CALENDAR_SENDER_PATTERNS.some(pat => c.from.toLowerCase().includes(pat))) return true;
    if (NOISE_SUBJECT_HINTS.some(h => subjectLower.includes(h))) return true;
    return false;
  };
  const actionable = notIgnored.filter(c => !isCalendarNoise(c));

  // Sort by days waiting descending before sending to Claude
  actionable.sort((a, b) => b.daysWaiting - a.daysWaiting);
  const top = actionable.slice(0, 15);

  // Enrich with contact classes. One SELECT covers all 15 senders.
  const senderEmails = top.map(c => c.from);
  const contactsByEmail = await getContactsByEmails(senderEmails);
  const senderContact: (ContactView | undefined)[] = top.map(c => contactsByEmail.get(c.from));

  // Claude Haiku classifies urgency
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const todayFormatted = new Date().toLocaleDateString("en-GB", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });

  const prompt = `You are triaging Jose's inbox. Jose is founder of Common House (circular economy accelerator, Madrid). Be STRICT — over-flagging wastes his time.
Today's date is: ${todayFormatted}.

Label each email as exactly one of:
  "Urgent"      — needs Jose TODAY or this week
  "Needs Reply" — clearly needs Jose's reply / decision / intervention
  "FYI"         — does NOT need Jose's action

DEFAULT TO "FYI" when unsure. A Jose-intervention must be genuinely required.

Mark "FYI" (do NOT surface) when:
  • Email is an auto-generated calendar invite / RSVP / Calendly/Zoom/Meet link, or a meeting-notes recap.
  • Human meeting-scheduling thread where time AND location are ALREADY settled and no new question remains.
  • (joseStarted=true) → Jose opened the thread. Default to FYI unless the latest reply is a NEW direct question to Jose. Intros, forwards, pings, "looping you in" threads that Jose initiated do NOT need a reply just because someone thanked him. Surface only if the other party is now BLOCKED on Jose.
  • The last message is a "thanks" / "got it" / "sounds good" / acknowledgement with no new question.
  • The message is a passive FYI, forward, or loop-in with no ask.
  • The message is a scheduled/informational update from a tool, newsletter, or auto-report.
  • The event / deadline referenced has already passed.
  • Sender is a colleague and the message is coordination without a direct ask to Jose.

Mark "Needs Reply" only when:
  • There is a clear question addressed to Jose.
  • A decision, approval, signature, or intervention from Jose is explicitly required.
  • A partner/investor/funder is waiting on Jose specifically.
  • Human meeting-scheduling thread where time OR location is still open AND the proposed date is within the next 7 days — Jose must confirm to make it happen.

Mark "Urgent" only when "Needs Reply" is true AND:
  • Sender is a retailer, funder, grant body, government, investor, board member, or strategic partner.
  • OR there is an explicit deadline within 7 days (including a meeting scheduled in the next 48h where logistics are not yet confirmed).
  • OR contract/money/legal decision is on the line.
${THRESHOLD_DAYS <= 2 ? "Cap Urgents at 3 total across the batch." : ""}

For each item also write a 1-sentence reason (max 12 words) — lead with WHY Jose must act, or why it's FYI.

Emails:
${top.map((c, i) => {
    const contact = senderContact[i];
    const classLabel = contact?.relationship_classes?.length
      ? ` [${contact.relationship_classes.join(", ")}]`
      : "";
    return `${i + 1}. From: ${c.fromName} <${c.from}>${classLabel} (waiting-on-Jose side)\n   Subject: ${c.subject}\n   Messages in thread: ${c.msgCount} · joseStarted: ${c.iStartedThread} · joseReplied: ${c.hasMyReply}\n   Latest preview: ${c.snippet.slice(0, 220)}`;
  }).join("\n\n")}

Return ONLY a JSON array — no markdown, no explanation:
[{"index": 1, "label": "Urgent"|"Needs Reply"|"FYI", "reason": "..."}]`;

  let classifications: { index: number; label: string; reason: string }[] = [];
  let classificationError: string | undefined;
  try {
    const res = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1500,
      messages: [{ role: "user", content: prompt }],
    });
    const raw = (res.content[0] as { type: string; text: string }).text.trim();
    const jsonMatch = raw.match(/\[[\s\S]*\]/);
    classifications = JSON.parse(jsonMatch?.[0] ?? "[]");
  } catch (err) {
    classificationError = err instanceof Error ? err.message : String(err);
    console.error("[inbox-triage] Claude classification error:", classificationError);
    classifications = top.map((_, i) => ({ index: i + 1, label: "Needs Reply", reason: "Unable to classify" }));
  }

  // Merge + contact-class overrides. Classes are authored by Jose so they
  // beat Haiku when they disagree:
  //   - VIP sender       → escalate to Urgent (unless Haiku firmly said FYI and
  //                         the thread also reads as pure FYI — we still mark
  //                         Needs Reply in that case, never flatten a VIP).
  //   - Pure personal    → force FYI (therapy, family, friends — never flagged).
  const items = top.map((c, i) => {
    const cl = classifications.find(x => x.index === i + 1);
    const contact = senderContact[i];

    let label  = cl?.label ?? "Needs Reply";
    let reason = cl?.reason ?? "";
    let contactOverride: "vip_escalated" | "personal_muted" | null = null;

    if (contact) {
      if (isPersonalContact(contact) && label !== "FYI") {
        label = "FYI";
        reason = reason ? `${reason} · personal contact — muted` : "Personal contact — muted";
        contactOverride = "personal_muted";
      } else if (isVipContact(contact)) {
        if (label === "FYI") {
          label = "Needs Reply";
          reason = reason ? `${reason} · VIP — surfacing` : "VIP sender — surfacing for review";
        } else {
          label = "Urgent";
          if (!reason) reason = "VIP sender — prioritised";
        }
        contactOverride = "vip_escalated";
      }
    }

    return {
      threadId:    c.threadId,
      subject:     c.subject,
      from:        c.from,
      fromName:    c.fromName,
      snippet:     c.snippet.slice(0, 200),
      daysWaiting: c.daysWaiting,
      isUnread:    c.isUnread,
      label,
      reason,
      contact_classes: contact?.relationship_classes ?? [],
      contact_override: contactOverride,
      // authuser is a query param (before the hash) so Gmail actually reads it;
      // #all/<tid> lands on the thread whether or not it's still in Inbox.
      gmailUrl:    buildGmailUrl(c.threadId, JOSE_EMAIL),
    };
  });

  // Sort: Urgent first, then Needs Reply, then FYI, within each by days waiting
  const PRIORITY: Record<string, number> = { "Urgent": 0, "Needs Reply": 1, "FYI": 2 };
  items.sort((a, b) =>
    (PRIORITY[a.label] ?? 3) - (PRIORITY[b.label] ?? 3) || b.daysWaiting - a.daysWaiting
  );

  // Return only Urgent + Needs Reply (skip FYI unless no others)
  const flagged = items.filter(i => i.label !== "FYI");
  const output  = flagged.length > 0 ? flagged.slice(0, 10) : items.slice(0, 5);

  // D1 — enrich with 1-line Haiku summaries (cache-first, generates missing).
  const enriched = await enrichWithSummaries(output);

  return NextResponse.json({ ok: true, items: enriched, total_scanned: candidates.length, calendar_filtered: candidates.length - actionable.length });
}

// ────────────────────────────────────────────────────────────────────────────
// D1 — thread summary enrichment
// ────────────────────────────────────────────────────────────────────────────

const SUMMARY_TTL_MS = 24 * 3600_000;
const SUMMARY_MODEL  = "claude-haiku-4-5-20251001";

function subjectHash(subject: string, snippet: string): string {
  // Stable identity for cache — changes if snippet grows (new reply) or subject changes.
  const raw = `${subject}|${snippet.slice(0, 120)}`;
  let h = 5381;
  for (let i = 0; i < raw.length; i++) h = ((h << 5) + h + raw.charCodeAt(i)) | 0;
  return h.toString(36);
}

type OutputItem = {
  threadId: string;
  subject: string;
  from: string;
  fromName: string;
  snippet: string;
  daysWaiting: number;
  isUnread: boolean;
  label: string;
  reason: string;
  contact_classes: string[];
  contact_override: string | null;
  gmailUrl: string;
  summary?: string | null;
};

async function enrichWithSummaries(items: OutputItem[]): Promise<OutputItem[]> {
  if (items.length === 0) return items;
  if (!process.env.ANTHROPIC_API_KEY) return items;

  const sb = getSupabaseServerClient();
  const ids = items.map(i => i.threadId);

  const { data: cacheRows } = await sb
    .from("hall_thread_summaries")
    .select("thread_id, subject_hash, summary, generated_at")
    .in("thread_id", ids);

  const cache = new Map<string, { hash: string; summary: string; at: number }>();
  for (const r of (cacheRows ?? []) as { thread_id: string; subject_hash: string; summary: string; generated_at: string }[]) {
    cache.set(r.thread_id, {
      hash: r.subject_hash,
      summary: r.summary,
      at: new Date(r.generated_at).getTime(),
    });
  }

  const now = Date.now();
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const tasks = items.map(async (item) => {
    const hash = subjectHash(item.subject, item.snippet);
    const cached = cache.get(item.threadId);
    if (cached && cached.hash === hash && (now - cached.at) < SUMMARY_TTL_MS) {
      return { ...item, summary: cached.summary };
    }

    try {
      const prompt =
        `Subject: ${item.subject}\n` +
        `From: ${item.fromName} <${item.from}>\n` +
        `Snippet: ${item.snippet.slice(0, 400)}\n\n` +
        `Summarize what this email is actually about in one sentence of 6-14 words. No preamble, no "This email is about". Output only the sentence.`;
      const msg = await anthropic.messages.create({
        model: SUMMARY_MODEL,
        max_tokens: 80,
        messages: [{ role: "user", content: prompt }],
      });
      const summary = ((msg.content[0] as { type: string; text?: string }).text ?? "")
        .trim()
        .replace(/^["']|["']$/g, "")
        .slice(0, 160);

      if (summary) {
        // Fire-and-forget cache write.
        sb.from("hall_thread_summaries")
          .upsert({
            thread_id: item.threadId,
            subject_hash: hash,
            summary,
            model: SUMMARY_MODEL,
            generated_at: new Date().toISOString(),
          }, { onConflict: "thread_id" })
          .then(() => {}, () => {});
      }
      return { ...item, summary: summary || null };
    } catch {
      return { ...item, summary: cached?.summary ?? null };
    }
  });

  return Promise.all(tasks);
}
