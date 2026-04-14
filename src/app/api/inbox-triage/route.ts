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
        const fromHeader = firstMsg.payload?.headers?.find(h => h.name === "From")?.value ?? "";
        const from = extractEmail(fromHeader);
        const fromName = extractName(fromHeader);
        const snippet = firstMsg.snippet ?? "";

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
        });
      } catch {
        // skip failed threads
      }
    })
  );

  if (candidates.length === 0) {
    return NextResponse.json({ ok: true, items: [] });
  }

  // Sort by days waiting descending before sending to Claude
  candidates.sort((a, b) => b.daysWaiting - a.daysWaiting);
  const top = candidates.slice(0, 15);

  // Claude Haiku classifies urgency
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const prompt = `You are triaging emails for Jose, founder of Common House (circular economy accelerator).
Classify each email as exactly one of: "Urgent", "Needs Reply", or "FYI".

Rules:
- "Urgent": sender is a partner, funder, investor, retailer, grant body, or government entity; OR email mentions a deadline, decision, contract, or explicit request.${thresholdDays <= 2 ? " Max 3 Urgents." : ""}
- "Needs Reply": clear question, invitation, intro, or action requested. Jose should respond.
- "FYI": newsletter, notification, auto-generated, low-stakes update.

For each item, also write a 1-sentence reason (max 12 words).

Emails to classify:
${top.map((c, i) => `${i + 1}. From: ${c.fromName} <${c.from}>\n   Subject: ${c.subject}\n   Preview: ${c.snippet.slice(0, 150)}`).join("\n\n")}

Return ONLY valid JSON array — no markdown, no explanation:
[{"index": 1, "label": "Urgent"|"Needs Reply"|"FYI", "reason": "..."}]`;

  let classifications: { index: number; label: string; reason: string }[] = [];
  let classificationError: string | undefined;
  try {
    const res = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 600,
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

  // Merge
  const items = top.map((c, i) => {
    const cl = classifications.find(x => x.index === i + 1);
    return {
      threadId:    c.threadId,
      subject:     c.subject,
      from:        c.from,
      fromName:    c.fromName,
      snippet:     c.snippet.slice(0, 200),
      daysWaiting: c.daysWaiting,
      isUnread:    c.isUnread,
      label:       cl?.label ?? "Needs Reply",
      reason:      cl?.reason ?? "",
      gmailUrl:    `https://mail.google.com/mail/u/0/#inbox/${c.threadId}`,
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

  return NextResponse.json({ ok: true, items: output, total_scanned: candidates.length });
}
