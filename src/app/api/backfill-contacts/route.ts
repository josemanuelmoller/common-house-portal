/**
 * POST /api/backfill-contacts?days=60
 *
 * One-shot backfill for hall_attendees / hall_email_observations.
 *
 * Scans Gmail threads modified in the last `days` window (default 60),
 * extracts From/To/Cc participants across every message, and runs the shared
 * observer for each. The observer diffs against prior attendee_emails so it
 * registers late-joiners (e.g. replies to outbound threads that were first
 * recorded with no external participants) without double-counting existing
 * ones.
 *
 * Does NOT create Notion Source records. That's handled by the daily
 * /api/ingest-gmail cron. This route only closes the gap where threads were
 * already ingested to Sources but their participants never made it into
 * hall_attendees.
 *
 * Auth: x-agent-key header OR Authorization: Bearer <CRON_SECRET>.
 * Intended to be called manually, not on a schedule.
 */

import { NextRequest, NextResponse } from "next/server";
import { google } from "googleapis";
import { currentUser } from "@clerk/nextjs/server";
import { isAdminUser, isAdminEmail } from "@/lib/clients";
import { observeGmailThread } from "@/lib/hall-contact-observers";

export const maxDuration = 300;

function extractEmail(header: string): string {
  const match = header.match(/<([^>]+)>/);
  const raw = match ? match[1] : header;
  return raw.toLowerCase().trim();
}

function splitAddressList(header: string): string[] {
  return header.split(",").map(s => extractEmail(s)).filter(e => /.+@.+\..+/.test(e));
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

async function authCheck(req: NextRequest): Promise<boolean> {
  const expected = process.env.CRON_SECRET;
  const agentKey = req.headers.get("x-agent-key");
  const cronKey  = req.headers.get("authorization");
  if (expected && agentKey === expected)             return true;
  if (expected && cronKey  === `Bearer ${expected}`) return true;
  try {
    const user = await currentUser();
    if (!user) return false;
    const email = user.primaryEmailAddress?.emailAddress ?? "";
    if (isAdminUser(user.id) || isAdminEmail(email)) return true;
  } catch { /* noop */ }
  return false;
}

export async function POST(req: NextRequest) {
  if (!(await authCheck(req))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const gmail = getGmailClient();
  if (!gmail) return NextResponse.json({ error: "Gmail not configured" }, { status: 503 });

  const days = Math.min(180, Math.max(1, parseInt(req.nextUrl.searchParams.get("days") ?? "60", 10) || 60));
  const maxThreads = Math.min(500, Math.max(50, parseInt(req.nextUrl.searchParams.get("max") ?? "500", 10) || 500));

  let selfEmail = "";
  try {
    const profile = await gmail.users.getProfile({ userId: "me" });
    selfEmail = (profile.data.emailAddress ?? "").toLowerCase();
  } catch { /* fall through */ }

  const after = Math.floor((Date.now() - days * 86_400_000) / 1000);
  const query = `after:${after} -category:promotions -category:social -category:updates`;

  // Single list call. maxResults caps at 500 per Gmail API — that's 60 days
  // of typical volume. If the user needs more, they can re-run with smaller
  // `days` windows.
  const threadIds: string[] = [];
  try {
    const listRes = await gmail.users.threads.list({
      userId: "me",
      q: query,
      maxResults: maxThreads,
    });
    for (const t of listRes.data.threads ?? []) if (t.id) threadIds.push(t.id);
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }

  let observed = 0;
  let contactsAdded = 0;
  let skippedNoExternals = 0;
  const errors: string[] = [];

  for (const threadId of threadIds) {
    try {
      const thread = await gmail.users.threads.get({
        userId: "me",
        id: threadId,
        format: "metadata",
        metadataHeaders: ["Subject", "From", "To", "Cc", "Date"],
      });
      const messages = thread.data.messages ?? [];
      if (messages.length === 0) continue;

      const firstMsg = messages[0];
      const lastMsg  = messages[messages.length - 1] ?? firstMsg;
      const headers  = firstMsg?.payload?.headers ?? [];
      const subject  = headers.find(h => h.name === "Subject")?.value ?? "(no subject)";
      const dateStr  = headers.find(h => h.name === "Date")?.value    ?? "";

      const allEmails = new Set<string>();
      for (const m of messages) {
        const h = m.payload?.headers ?? [];
        const from = h.find(x => x.name === "From")?.value ?? "";
        if (from) {
          const e = extractEmail(from);
          if (e) allEmails.add(e);
        }
        for (const field of ["To", "Cc"] as const) {
          const v = h.find(x => x.name === field)?.value ?? "";
          if (v) for (const e of splitAddressList(v)) allEmails.add(e);
        }
      }
      if (selfEmail) allEmails.delete(selfEmail);

      if (allEmails.size === 0) {
        skippedNoExternals++;
        continue;
      }

      const lastDateStr = lastMsg?.payload?.headers?.find(h => h.name === "Date")?.value ?? dateStr;
      const lastAt = lastDateStr ? new Date(lastDateStr) : new Date();

      const obs = await observeGmailThread({
        threadId,
        attendeeEmails: [...allEmails],
        subject,
        lastMessageAt: lastAt,
      });
      observed++;
      contactsAdded += obs.incremented;
    } catch (err) {
      errors.push(`Thread ${threadId}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return NextResponse.json({
    ok: true,
    days,
    threads_scanned: threadIds.length,
    threads_observed: observed,
    contacts_incremented: contactsAdded,
    skipped_no_externals: skippedNoExternals,
    errors: errors.slice(0, 20),
  });
}
