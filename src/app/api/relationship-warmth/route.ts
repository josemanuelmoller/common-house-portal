/**
 * POST /api/relationship-warmth
 *
 * Computes Contact Warmth (Hot/Warm/Cold/Dormant) for all active people in
 * CH People [OS v2] based on Gmail thread recency.
 *
 * Warmth model:
 *   Hot     — contact within 14 days
 *   Warm    — contact 15–30 days ago
 *   Cold    — contact 31–60 days ago
 *   Dormant — no contact in 60+ days (or never contacted)
 *
 * Also updates "Last Contact Date" if Gmail evidence is found.
 * Conservative: only writes if warmth or date has changed.
 *
 * Requires same Gmail OAuth env vars as /api/ingest-gmail.
 * Degrades gracefully if Gmail creds not configured — skips Gmail scan,
 * marks all people without a recent date as Dormant.
 *
 * Auth: x-agent-key header OR Vercel cron CRON_SECRET header.
 * Called by Vercel cron bi-weekly: Mon + Thu at 06:00 UTC.
 */

/**
 * POST /api/relationship-warmth
 * (header updated 2026-04-17: people read switched to Supabase-first)
 *
 * People read: Supabase-first since Wave 5 follow-on (2026-04-17).
 * Notion fallback preserved. Write path (Contact Warmth + Last Contact Date)
 * unchanged — still writes to Notion. Noon sync picks up new values.
 */

import { NextRequest, NextResponse } from "next/server";
import { google } from "googleapis";
import type { gmail_v1 } from "googleapis";
import { Client } from "@notionhq/client";
import { getSupabaseServerClient } from "@/lib/supabase-server";

export const maxDuration = 120;

const notion = new Client({ auth: process.env.NOTION_API_KEY });

const PEOPLE_DB = "1bc0f96f33ca4a9e9ff26844377e81de";

const LOOKBACK_DAYS   = 60;
const HOT_DAYS        = 14;
const WARM_DAYS       = 30;

// ─── Auth ─────────────────────────────────────────────────────────────────────

function authCheck(req: NextRequest): boolean {
  const agentKey  = req.headers.get("x-agent-key");
  const cronToken = req.headers.get("authorization");
  const expected  = process.env.CRON_SECRET;
  if (agentKey && agentKey === expected) return true;
  if (cronToken === `Bearer ${expected}`) return true;
  return false;
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

// ─── Warmth computation ───────────────────────────────────────────────────────

function computeWarmth(lastContactDate: Date | null): "Hot" | "Warm" | "Cold" | "Dormant" {
  if (!lastContactDate) return "Dormant";
  const diffDays = (Date.now() - lastContactDate.getTime()) / (1000 * 60 * 60 * 24);
  if (diffDays <= HOT_DAYS)  return "Hot";
  if (diffDays <= WARM_DAYS) return "Warm";
  if (diffDays <= LOOKBACK_DAYS) return "Cold";
  return "Dormant";
}

// ─── Gmail scan: most recent thread date for an email address ─────────────────

async function getLastContactDate(
  gmail: gmail_v1.Gmail,
  email: string,
  afterTimestamp: number,
): Promise<Date | null> {
  try {
    const query = `(from:${email} OR to:${email}) after:${afterTimestamp}`;
    const listRes = await gmail.users.messages.list({
      userId: "me",
      q: query,
      maxResults: 5,
    });
    const messages = listRes.data.messages ?? [];
    if (messages.length === 0) return null;

    // Fetch first message to get date
    const msg = await gmail.users.messages.get({
      userId: "me",
      id: messages[0].id!,
      format: "metadata",
      metadataHeaders: ["Date"],
    });
    const dateHeader = msg.data.payload?.headers?.find(h => h.name === "Date")?.value;
    if (!dateHeader) return null;
    const parsed = new Date(dateHeader);
    return isNaN(parsed.getTime()) ? null : parsed;
  } catch {
    return null;
  }
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  if (!authCheck(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const gmail      = getGmailClient();
  const gmailReady = gmail !== null;

  // Load all people — Supabase-first (synced noon weekdays; 18h stale at most on Mon/Thu 6am run)
  // Note: Supabase read has no "Status != Archived" filter — the people table has ~30 rows and
  // processing archived people is benign (warmth/date write to archived Notion pages works fine).
  let allPeople: { id: string; name: string; email: string; currentWarmth: string | null; lastContactDate: string | null }[] = [];

  try {
    const sb = getSupabaseServerClient();
    const { data, error } = await sb
      .from("people")
      .select("notion_id, full_name, email, contact_warmth, last_contact_date");

    if (!error && data && data.length > 0) {
      allPeople = data.map(p => ({
        id:              p.notion_id,
        name:            p.full_name      ?? "",
        email:           p.email          ?? "",
        currentWarmth:   p.contact_warmth ?? null,
        lastContactDate: p.last_contact_date ?? null,
      })).filter(p => p.name.trim() !== "");
    }
  } catch {
    // Supabase unavailable — fall through to Notion
  }

  if (allPeople.length === 0) {
    // Notion fallback
    try {
      const res = await notion.databases.query({
        database_id: PEOPLE_DB,
        page_size: 200,
        filter: { property: "Status", status: { does_not_equal: "Archived" } },
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      allPeople = (res.results as any[]).map((page: any) => ({
        id:              page.id,
        name:            page.properties?.["Full Name"]?.title?.[0]?.plain_text ?? "",
        email:           page.properties?.["Email"]?.email ?? "",
        currentWarmth:   page.properties?.["Contact Warmth"]?.select?.name ?? null,
        lastContactDate: page.properties?.["Last Contact Date"]?.date?.start ?? null,
      })).filter(p => p.name.trim() !== "");
    } catch (err) {
      return NextResponse.json({ error: "Failed to load people", detail: String(err) }, { status: 500 });
    }
  }

  const afterTimestamp = Math.floor((Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000) / 1000);

  const results = {
    total: allPeople.length,
    updated: 0,
    skipped_no_email: 0,
    skipped_no_change: 0,
    errors: 0,
    gmail_enabled: gmailReady,
  };

  for (const person of allPeople) {
    try {
      if (!person.email) {
        results.skipped_no_email++;
        continue;
      }

      let lastContact: Date | null = null;

      if (gmailReady && gmail) {
        lastContact = await getLastContactDate(gmail, person.email, afterTimestamp);
      } else if (person.lastContactDate) {
        // No Gmail — use existing date from Notion to preserve warmth
        lastContact = new Date(person.lastContactDate);
      }

      const newWarmth      = computeWarmth(lastContact);
      const newDateStr     = lastContact ? lastContact.toISOString().slice(0, 10) : null;
      const warmthChanged  = newWarmth !== person.currentWarmth;
      const dateChanged    = gmailReady && newDateStr !== person.lastContactDate;

      if (!warmthChanged && !dateChanged) {
        results.skipped_no_change++;
        continue;
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const properties: Record<string, any> = {
        "Contact Warmth": { select: { name: newWarmth } },
      };
      if (dateChanged && newDateStr) {
        properties["Last Contact Date"] = { date: { start: newDateStr } };
      }

      await notion.pages.update({ page_id: person.id, properties });
      results.updated++;
    } catch {
      results.errors++;
    }
  }

  return NextResponse.json({ ok: true, ...results });
}
