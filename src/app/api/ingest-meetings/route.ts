/**
 * POST /api/ingest-meetings
 *
 * Fetches recent Fireflies transcripts via GraphQL REST API,
 * extracts meeting intelligence with Anthropic Haiku,
 * and writes to Notion:
 *   - Agent Drafts [OS v2]: one "Meeting Intelligence" draft per run
 *   - CH People [OS v2]: updates Last Contact Date for matched participants
 *
 * Called by Vercel cron at 12:00 and 18:00 UTC-6 (Mon–Fri)
 * = 18:00 UTC and 00:00 UTC respectively.
 *
 * Auth: x-agent-key header OR Vercel cron CRON_SECRET header.
 */

/**
 * POST /api/ingest-meetings
 * (updated 2026-04-17: people email lookup switched to Supabase-first)
 *
 * People lookup in updatePeopleLastContact: Supabase-first since Wave 5
 * follow-on. Removes up to 20 Notion DB queries per run. Write path
 * (Last Contact Date → Notion) unchanged.
 */

import { NextRequest, NextResponse } from "next/server";
import { Client } from "@notionhq/client";
import Anthropic from "@anthropic-ai/sdk";
import { getSupabaseServerClient } from "@/lib/supabase-server";

const notion    = new Client({ auth: process.env.NOTION_API_KEY });
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const FIREFLIES_API   = "https://api.fireflies.ai/graphql";
const AGENT_DRAFTS_DB = "9844ece875ea4c618f616e8cc97d5a90";
const PEOPLE_DB       = "1bc0f96f33ca4a9e9ff26844377e81de";

// ─── Fireflies GraphQL ────────────────────────────────────────────────────────

interface FirefliesTranscript {
  id: string;
  title: string;
  date: number;       // unix ms
  duration: number;   // seconds
  participants: string[];
  organizer_email: string;
  summary: {
    action_items:      string | null;
    keywords:          string | null;
    shorthand_bullet:  string | null;
    overview:          string | null;
  } | null;
}

async function fetchRecentTranscripts(fromDate: Date): Promise<FirefliesTranscript[]> {
  const query = `
    query RecentTranscripts($fromDate: DateTime) {
      transcripts(fromDate: $fromDate, limit: 20) {
        id
        title
        date
        duration
        participants
        organizer_email
        summary {
          action_items
          keywords
          shorthand_bullet
          overview
        }
      }
    }
  `;

  const res = await fetch(FIREFLIES_API, {
    method: "POST",
    headers: {
      "Content-Type":  "application/json",
      "Authorization": `Bearer ${process.env.FIREFLIES_API_KEY}`,
    },
    body: JSON.stringify({
      query,
      variables: { fromDate: fromDate.toISOString() },
    }),
  });

  if (!res.ok) {
    throw new Error(`Fireflies API error: ${res.status} ${await res.text()}`);
  }

  const json = await res.json();
  return (json?.data?.transcripts ?? []) as FirefliesTranscript[];
}

// ─── Extract meeting intelligence with Haiku ──────────────────────────────────

async function extractIntelligence(transcripts: FirefliesTranscript[]): Promise<string> {
  if (transcripts.length === 0) return "No new meetings in this window.";

  const meetingBlocks = transcripts.map(t => {
    const date     = new Date(t.date).toLocaleDateString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
    const duration = `${Math.round(t.duration / 60)} min`;
    return `
Meeting: ${t.title}
Date: ${date} | Duration: ${duration}
Participants: ${t.participants.join(", ") || "unknown"}
Summary: ${t.summary?.overview || t.summary?.shorthand_bullet || "no summary"}
Action items: ${t.summary?.action_items || "none noted"}
Keywords: ${t.summary?.keywords || "none"}
`.trim();
  }).join("\n\n---\n\n");

  const prompt = `You are reviewing ${transcripts.length} recent meeting(s) for Common House (a portfolio + coworking company).

Extract the following in a concise structured format:

## Action Items
List every specific commitment or task mentioned, with owner if known. Max 10 items.

## Market Signals
Any external signals: sector news, competitor moves, funding mentions, regulation updates. Max 5.

## Relationship Updates
People engaged in these meetings worth following up with. Max 5.

## Quick Wins
1-2 things that could be actioned today based on these meetings.

Be specific and direct. Skip anything vague or obvious.

---
MEETINGS:
${meetingBlocks}`;

  const message = await anthropic.messages.create({
    model:      "claude-haiku-4-5-20251001",
    max_tokens: 1024,
    messages:   [{ role: "user", content: prompt }],
  });

  return message.content[0].type === "text" ? message.content[0].text : "";
}

// ─── Update CH People Last Contact Date ───────────────────────────────────────
// Supabase-first: look up page ID by email, then write to Notion.
// Notion fallback per email if not yet synced (noon sync may lag).

async function updatePeopleLastContact(
  emails: string[],
  dateStr: string,
): Promise<number> {
  if (emails.length === 0) return 0;

  const sb = getSupabaseServerClient();
  let updated = 0;

  for (const email of emails.slice(0, 20)) {
    try {
      let pageId: string | null = null;

      // Supabase lookup — faster than Notion DB query per email
      try {
        const { data: sbPerson } = await sb
          .from("people")
          .select("notion_id")
          .eq("email", email)
          .single();
        if (sbPerson?.notion_id) pageId = sbPerson.notion_id;
      } catch {
        // PGRST116 (no rows) or network error — fall through to Notion
      }

      // Notion fallback: person not yet synced to Supabase
      if (!pageId) {
        const res = await notion.databases.query({
          database_id: PEOPLE_DB,
          filter: { property: "Email", email: { equals: email } },
          page_size: 1,
        });
        if (res.results.length > 0) pageId = res.results[0].id;
      }

      if (!pageId) continue;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await notion.pages.update({
        page_id: pageId,
        properties: {
          "Last Contact Date": { date: { start: dateStr } },
        } as any,
      });

      // Dual-write to Supabase — makes last_contact_date live immediately
      try {
        await sb.from("people")
          .update({ last_contact_date: dateStr, updated_at: new Date().toISOString() })
          .eq("notion_id", pageId);
      } catch { /* non-critical */ }

      updated++;
    } catch {
      // skip on error — non-critical
    }
  }
  return updated;
}

// ─── Write Agent Draft ────────────────────────────────────────────────────────

async function writeAgentDraft(
  intelligenceText: string,
  meetingCount: number,
  today: string,
  windowLabel: string,
): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const page = await notion.pages.create({
    parent: { database_id: AGENT_DRAFTS_DB },
    properties: {
      "Draft Title":      { title: [{ text: { content: `Meeting Intel (${windowLabel}): ${meetingCount} meeting${meetingCount !== 1 ? "s" : ""} — ${today}` } }] },
      "Type":             { select: { name: "Market Signal" } },
      "Status":           { select: { name: "Pending Review" } },
      "Source Reference": { rich_text: [{ text: { content: `Fireflies — ${meetingCount} meetings` } }] },
      "Content":          { rich_text: [{ text: { content: intelligenceText.slice(0, 2000) } }] },
    } as any,
  });
  return (page as { url?: string }).url ?? "";
}

// ─── Main handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  // Auth: agent key or Vercel cron secret
  const agentKey = req.headers.get("x-agent-key");
  const cronSecret = req.headers.get("authorization");

  const validAgentKey = agentKey === process.env.AGENT_API_KEY;
  const validCron     = cronSecret === `Bearer ${process.env.CRON_SECRET}`;

  if (!validAgentKey && !validCron) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Window: last 7 hours (covers both 12pm and 6pm runs with 1h overlap buffer)
    const now      = new Date();
    const fromDate = new Date(now.getTime() - 7 * 60 * 60 * 1000);
    const today    = now.toISOString().slice(0, 10);

    const hour        = now.getUTCHours();
    const windowLabel = hour >= 16 && hour < 22 ? "12pm" : "6pm";

    // 1. Fetch transcripts
    const transcripts = await fetchRecentTranscripts(fromDate);

    if (transcripts.length === 0) {
      return NextResponse.json({
        ok:       true,
        meetings: 0,
        message:  "No new meetings in window",
        window:   `${fromDate.toISOString()} → ${now.toISOString()}`,
      });
    }

    // 2. Extract intelligence
    const intelligenceText = await extractIntelligence(transcripts);

    // 3. Collect all participant emails (excluding organizer duplicates)
    const allEmails = Array.from(new Set(
      transcripts.flatMap(t => t.participants.filter(p => p.includes("@")))
    ));

    // 4. Update CH People last contact
    const peopleUpdated = await updatePeopleLastContact(allEmails, today);

    // 5. Write Agent Draft
    const draftUrl = await writeAgentDraft(
      intelligenceText,
      transcripts.length,
      today,
      windowLabel,
    );

    return NextResponse.json({
      ok:             true,
      meetings:       transcripts.length,
      people_updated: peopleUpdated,
      draft_url:      draftUrl,
      window:         `${fromDate.toISOString()} → ${now.toISOString()}`,
    });
  } catch (e) {
    console.error("ingest-meetings error:", e);
    return NextResponse.json(
      { error: "Internal error", detail: String(e) },
      { status: 500 },
    );
  }
}

// Allow Vercel cron (GET) to trigger
export async function GET(req: NextRequest) {
  return POST(req);
}
