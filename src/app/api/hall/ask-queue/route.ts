/**
 * GET /api/hall/ask-queue
 *
 * Threads where Jose sent the LAST message and nobody replied in N days.
 * Complement to /api/inbox-triage (which shows threads Jose hasn't replied to).
 *
 * Excludes:
 *   - threads answered by the other side
 *   - personal contacts (Family / Friend / Personal Service)
 *   - calendar/marketing noise (same filters as inbox-triage)
 *
 * Priorities VIP senders first, then by days since sent.
 */

import { NextRequest, NextResponse } from "next/server";
import { google } from "googleapis";
import { adminGuardApi } from "@/lib/require-admin";
import { getContactsByEmails, isPersonalContact, isVipContact } from "@/lib/contacts";
import { getSelfEmails } from "@/lib/hall-self";

export const dynamic = "force-dynamic";
export const maxDuration = 45;

const MIN_DAYS_WAITING = 3;
const MAX_THREADS      = 60;

// J1 + J6 — spam tracker IDs (25608997.xxx, 8-digit-dot-long-alnum) and
// similar patterns that dominate promotional/list-managed senders.
const SPAM_SUBJECT_REGEX = /^\d{8}\.[A-Za-z0-9]{15,}/;
const ATTACHMENT_SUBJECT_REGEX = /^(CamScanner|Scan \d|IMG_\d|Screenshot)\b/i;

// J2 — senders that are structurally not worth chasing.
const NOISE_LOCAL_PARTS = new Set([
  "unsubscribe", "noreply", "no-reply", "newsletter", "notifications",
  "notification", "mailer", "mailer-daemon", "postmaster", "support",
  "bounces", "donotreply", "do-not-reply", "automated",
]);
function isNoiseSender(email: string): boolean {
  const local = (email.split("@")[0] ?? "").toLowerCase();
  return NOISE_LOCAL_PARTS.has(local);
}

// J6 — strip hex prefixes the spam filter missed, keep readable portion.
function cleanSubject(raw: string): string {
  let s = raw.replace(/^\d{8,}\.[A-Za-z0-9]{10,}[-_.]?/, "").trim();
  if (!s) s = raw;
  return s.length > 80 ? s.slice(0, 77) + "…" : s;
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
  const m = header.match(/<([^>]+)>/);
  return (m ? m[1] : header).toLowerCase().trim();
}
function extractName(header: string): string {
  const m = header.match(/^"?([^"<]+)"?\s*</);
  return m ? m[1].trim() : header.split("@")[0];
}

function buildGmailUrl(threadId: string, userEmail: string): string {
  return `https://mail.google.com/mail/?authuser=${encodeURIComponent(userEmail)}#all/${threadId}`;
}

export async function GET(_req: NextRequest) {
  const guard = await adminGuardApi();
  if (guard) return guard;

  const gmail = getGmailClient();
  if (!gmail) return NextResponse.json({ error: "Gmail not configured" }, { status: 503 });

  const selfSet = await getSelfEmails();
  // Primary self = OAuth-owner, fetched fresh so we are immune to env drift.
  let selfEmail = "";
  try {
    const p = await gmail.users.getProfile({ userId: "me" });
    selfEmail = (p.data.emailAddress ?? "").toLowerCase();
  } catch { /* fall through — we still have selfSet */ }

  // Scan recent sent-by-Jose threads. `in:sent newer_than:30d` is cheap.
  let threadIds: string[] = [];
  try {
    const res = await gmail.users.threads.list({
      userId: "me",
      q: `in:sent newer_than:30d -category:promotions -category:social`,
      maxResults: MAX_THREADS,
    });
    threadIds = (res.data.threads ?? []).map(t => t.id!).filter(Boolean);
  } catch (err) {
    return NextResponse.json({ error: "Gmail list failed", detail: String(err) }, { status: 502 });
  }

  type Candidate = {
    threadId: string;
    subject:  string;
    to:       string;
    toName:   string;
    snippet:  string;
    daysWaiting: number;
    lastSentAt: number;
  };
  const candidates: Candidate[] = [];
  const now = Date.now();
  const minWaitMs = MIN_DAYS_WAITING * 86400_000;

  await Promise.all(
    threadIds.map(async (tid) => {
      try {
        const t = await gmail.users.threads.get({
          userId: "me",
          id: tid,
          format: "metadata",
          metadataHeaders: ["From", "To", "Subject", "Date"],
        });
        const messages = t.data.messages ?? [];
        if (messages.length === 0) return;
        const last = messages[messages.length - 1];
        const first = messages[0];
        const lastFromHeader = last.payload?.headers?.find(h => h.name === "From")?.value ?? "";
        const lastFrom = extractEmail(lastFromHeader);

        // Only threads where the LAST message is from self.
        const isLastFromSelf = selfSet.has(lastFrom) || (selfEmail && lastFrom === selfEmail);
        if (!isLastFromSelf) return;

        const lastDateMs = parseInt(last.internalDate ?? "0", 10);
        if (!lastDateMs) return;
        if (now - lastDateMs < minWaitMs) return;

        // Extract the principal recipient = the non-self party on To/From of the first msg.
        const toHeader = last.payload?.headers?.find(h => h.name === "To")?.value ?? "";
        const firstFromHeader = first.payload?.headers?.find(h => h.name === "From")?.value ?? "";
        const firstFrom = extractEmail(firstFromHeader);

        let counterpartyEmail = "";
        let counterpartyName = "";
        if (!selfSet.has(firstFrom) && firstFrom !== selfEmail && firstFrom) {
          counterpartyEmail = firstFrom;
          counterpartyName  = extractName(firstFromHeader);
        } else if (toHeader) {
          // Fallback: first To that is not self.
          const parts = toHeader.split(",").map(s => s.trim());
          for (const part of parts) {
            const e = extractEmail(part);
            if (e && !selfSet.has(e) && e !== selfEmail) {
              counterpartyEmail = e;
              counterpartyName  = extractName(part);
              break;
            }
          }
        }
        if (!counterpartyEmail) return;

        const subject = first.payload?.headers?.find(h => h.name === "Subject")?.value ?? "(no subject)";

        // J1 + J6 — discard subjects that are pure tracker IDs or attachments.
        if (SPAM_SUBJECT_REGEX.test(subject)) return;
        if (ATTACHMENT_SUBJECT_REGEX.test(subject)) return;
        // J2 — discard senders with structural noise local parts.
        if (isNoiseSender(counterpartyEmail)) return;

        const snippet = last.snippet ?? "";
        candidates.push({
          threadId: tid,
          subject,
          to:       counterpartyEmail,
          toName:   counterpartyName,
          snippet,
          daysWaiting: Math.floor((now - lastDateMs) / 86400_000),
          lastSentAt: lastDateMs,
        });
      } catch { /* skip */ }
    }),
  );

  if (candidates.length === 0) {
    return NextResponse.json({ ok: true, items: [] });
  }

  // Enrich with contact classes (includes org-level fallback).
  const classes = await getContactsByEmails(candidates.map(c => c.to));
  const enriched = candidates
    .map(c => {
      const contact = classes.get(c.to);
      return {
        ...c,
        contactClasses: contact?.relationship_classes ?? [],
        isPersonal:     contact ? isPersonalContact(contact) : false,
        isVip:          contact ? isVipContact(contact) : false,
      };
    })
    .filter(c => !c.isPersonal)
    // J3 — require classified contact (excludes bulk senders where org/person
    // isn't a known entity in Hall). Empty classes = we don't know who this is.
    .filter(c => c.contactClasses.length > 0);

  // Rank: VIP first, then by weighted staleness+class priority.
  enriched.sort((a, b) => {
    const aScore = (a.isVip ? 10000 : 0) + a.daysWaiting * 10;
    const bScore = (b.isVip ? 10000 : 0) + b.daysWaiting * 10;
    return bScore - aScore;
  });

  const items = enriched.slice(0, 10).map(c => ({
    threadId:    c.threadId,
    subject:     cleanSubject(c.subject),
    to:          c.to,
    toName:      c.toName,
    snippet:     c.snippet.slice(0, 140),
    daysWaiting: c.daysWaiting,
    classes:     c.contactClasses,
    isVip:       c.isVip,
    gmailUrl:    buildGmailUrl(c.threadId, selfEmail || "me"),
  }));

  return NextResponse.json({
    ok: true,
    items,
    total_scanned: threadIds.length,
    waiting_total: enriched.length,
  });
}
