/**
 * POST /api/ingest-gmail
 *
 * Fetches Gmail threads from the last 24h (or since last recorded run),
 * creates Source records in CH Sources [OS v2] for new threads only.
 *
 * Requires env vars:
 *   GMAIL_CLIENT_ID        — Google OAuth2 client ID
 *   GMAIL_CLIENT_SECRET    — Google OAuth2 client secret
 *   GMAIL_REFRESH_TOKEN    — long-lived refresh token for the CH Gmail account
 *   GMAIL_USER_EMAIL       — the Gmail address to read (e.g. jose@wearecommonhouse.com)
 *
 * Auth: x-agent-key header OR Vercel cron CRON_SECRET header.
 * Called by Vercel cron daily at 07:00 UTC Mon–Fri.
 */

import { NextRequest, NextResponse } from "next/server";
import { google } from "googleapis";
import { Client } from "@notionhq/client";

const notion = new Client({ auth: process.env.NOTION_API_KEY });

const SOURCES_DB  = "d88aff1b019d4110bcefab7f5bfbd0ae";
const PROJECTS_DB = "49d59b18095f46588960f2e717832c5f";

// ─── Auth ─────────────────────────────────────────────────────────────────────

function getGmailClient() {
  const clientId     = process.env.GMAIL_CLIENT_ID;
  const clientSecret = process.env.GMAIL_CLIENT_SECRET;
  const refreshToken = process.env.GMAIL_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken) return null;

  const auth = new google.auth.OAuth2(clientId, clientSecret);
  auth.setCredentials({ refresh_token: refreshToken });
  return google.gmail({ version: "v1", auth });
}

// ─── Known project domains — used to auto-link sources to projects ────────────

const DOMAIN_TO_PROJECT: Record<string, string> = {
  "irefill.in":        "33d45e5b-6633-81ba-8784-ea132f0a57ca",
  "automercado.biz":   "33d45e5b-6633-81ba-8784-ea132f0a57ca",
  "algramo.com":       "33d45e5b-6633-81ba-8784-ea132f0a57ca",
};

function resolveProjectId(headers: { name?: string | null; value?: string | null }[]): string | null {
  const fromHeader = headers.find(h => h.name?.toLowerCase() === "from")?.value ?? "";
  for (const [domain, projectId] of Object.entries(DOMAIN_TO_PROJECT)) {
    if (fromHeader.toLowerCase().includes(domain)) return projectId;
  }
  return null;
}

// ─── Dedup — check if a thread ID already exists as a source ─────────────────

async function threadAlreadyIngested(threadId: string): Promise<boolean> {
  try {
    const res = await notion.databases.query({
      database_id: SOURCES_DB,
      filter: {
        property: "Source URL",
        url: { contains: threadId },
      },
      page_size: 1,
    });
    return res.results.length > 0;
  } catch {
    return false;
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const agentKey  = req.headers.get("x-agent-key");
  const cronKey   = req.headers.get("authorization");
  const validKey  = agentKey === process.env.CRON_SECRET ||
                    cronKey  === `Bearer ${process.env.CRON_SECRET}`;
  if (!validKey) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const gmail = getGmailClient();
  if (!gmail) {
    return NextResponse.json({
      ok: false,
      skipped: true,
      reason: "Gmail OAuth credentials not configured. Set GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN, GMAIL_USER_EMAIL.",
    });
  }

  const userEmail = process.env.GMAIL_USER_EMAIL ?? "me";

  // Fetch threads modified in the last 24h
  const after = Math.floor((Date.now() - 86_400_000) / 1000);
  let threadIds: string[] = [];
  try {
    const listRes = await gmail.users.threads.list({
      userId: userEmail,
      q: `after:${after} -category:promotions -category:social -category:updates`,
      maxResults: 30,
    });
    threadIds = (listRes.data.threads ?? []).map(t => t.id!).filter(Boolean);
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }

  let created = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const threadId of threadIds) {
    try {
      if (await threadAlreadyIngested(threadId)) { skipped++; continue; }

      const thread = await gmail.users.threads.get({
        userId: userEmail,
        id: threadId,
        format: "metadata",
        metadataHeaders: ["Subject", "From", "Date", "To"],
      });

      const firstMsg  = thread.data.messages?.[0];
      const headers   = firstMsg?.payload?.headers ?? [];
      const subject   = headers.find(h => h.name === "Subject")?.value  ?? "(no subject)";
      const from      = headers.find(h => h.name === "From")?.value     ?? "";
      const dateStr   = headers.find(h => h.name === "Date")?.value     ?? "";
      const msgCount  = thread.data.messages?.length ?? 1;

      const sourceDate = dateStr ? new Date(dateStr).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10);
      const threadUrl  = `https://mail.google.com/mail/u/0/#inbox/${threadId}`;
      const projectId  = resolveProjectId(headers);

      const properties: Record<string, unknown> = {
        "Source Title":     { title: [{ text: { content: subject.slice(0, 180) } }] },
        "Source Type":      { select: { name: "Email" } },
        "Source Platform":  { select: { name: "Gmail" } },
        "Source URL":       { url: threadUrl },
        "Processing Status":{ select: { name: "Ingested" } },
        "Source Date":      { date: { start: sourceDate } },
        "Dedup Key":        { rich_text: [{ text: { content: `gmail:${threadId}` } }] },
      };
      if (projectId) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (properties as any)["Linked Projects"] = { relation: [{ id: projectId }] };
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await notion.pages.create({ parent: { database_id: SOURCES_DB }, properties: properties as any });
      created++;

      void notion; // suppress unused warning
    } catch (err) {
      errors.push(`Thread ${threadId}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return NextResponse.json({ ok: true, checked: threadIds.length, created, skipped, errors });
}
