/**
 * POST /api/fireflies-sync
 *
 * Comprehensive Fireflies → Notion sync. One cron, all non-AI writes:
 *
 *   1. CH Projects  [OS v2] — "Last Meeting Date"
 *   2. CH Sources   [OS v2] — Meeting source record per matched transcript
 *                             (deduped by Source URL = Fireflies viewer link)
 *   3. CH People    [OS v2] — "Last Contact Date" for participant emails
 *
 * Project matching uses BOTH title-substring logic AND a keyword override map
 * so meetings like "Sesiones avance proyecto Refill" correctly link to iRefill.
 *
 * Default (daily cron): reads only yesterday's meetings (delta).
 * Backfill: POST with body { days: 60 } to seed historical data.
 *
 * Auth: x-agent-key OR Vercel cron CRON_SECRET.
 * Called by Vercel cron daily at 06:30 UTC Mon–Fri.
 */

import { NextRequest, NextResponse } from "next/server";
import { Client } from "@notionhq/client";
import { currentUser } from "@clerk/nextjs/server";
import { isAdminUser, isAdminEmail } from "@/lib/clients";

export const maxDuration = 90;

const notion = new Client({ auth: process.env.NOTION_API_KEY });
const FIREFLIES_API = "https://api.fireflies.ai/graphql";
const PROJECTS_DB   = "49d59b18095f46588960f2e717832c5f";
const SOURCES_DB    = "d88aff1b019d4110bcefab7f5bfbd0ae";
const PEOPLE_DB     = "1bc0f96f33ca4a9e9ff26844377e81de";

// ─── Keyword overrides ────────────────────────────────────────────────────────
// For projects whose names are substrings that won't appear verbatim in titles.
// Key = Notion Project ID, value = keywords to match (case-insensitive).

const PROJECT_KEYWORD_OVERRIDES: Record<string, string[]> = {
  // iRefill — meetings are titled "Sesiones avance proyecto Refill...", "Reunión Refill...", etc.
  "33f45e5b-6633-81f6-9b68-d898237d6533": ["refill", "airefil", "automercado", "auto mercado", "rajneesh", "dispensadora"],
  // SUFI — usually in title but also via participant email domains
  "33f45e5b-6633-81f4-bde2-f97d7a11bfb3": ["sufi", "andresalejandrobarbieri"],
  // Way Out — various spellings
  "33f45e5b-6633-8129-b715-ea38f400d631": ["wayout", "way out", "wayout"],
  // Beeok
  "33f45e5b-6633-8124-b2b8-c79d18a4d46a": ["beeok"],
  // Yenxa
  "33f45e5b-6633-812a-9b42-faf1f0b2518b": ["yenxa"],
  // Moss Solutions
  "33f45e5b-6633-8138-937a-f600fc992756": ["moss solutions", "moss"],
  // GotoFly
  "33f45e5b-6633-814e-8d18-e3c96a8d20ca": ["gotofly", "goto fly"],
  // Movener
  "33f45e5b-6633-810b-81d1-e22915da2506": ["movener"],
};

// ─── Auth ─────────────────────────────────────────────────────────────────────

async function authCheck(req: NextRequest): Promise<boolean> {
  const expected = process.env.CRON_SECRET;
  const agentKey  = req.headers.get("x-agent-key");
  const cronToken = req.headers.get("authorization");
  if (expected && agentKey  === expected)              return true;
  if (expected && cronToken === `Bearer ${expected}`)  return true;
  try {
    const user = await currentUser();
    if (!user) return false;
    const email = user.primaryEmailAddress?.emailAddress ?? "";
    if (isAdminUser(user.id) || isAdminEmail(email)) return true;
  } catch { /* noop */ }
  return false;
}

// ─── Fireflies ────────────────────────────────────────────────────────────────

interface FirefliesTranscript {
  id:           string;
  title:        string;
  date:         number;           // Unix ms
  meeting_link: string | null;
  participants: string[];
  summary: {
    overview:         string | null;
    shorthand_bullet: string | null;
  } | null;
}

class FirefliesError extends Error {
  constructor(message: string, public readonly detail: unknown) { super(message); }
}

async function getTranscripts(fromDate: string, toDate: string): Promise<FirefliesTranscript[]> {
  const apiKey = process.env.FIREFLIES_API_KEY;
  if (!apiKey) throw new FirefliesError("FIREFLIES_API_KEY missing", null);

  // Fireflies expects DateTime (ISO-8601), not String. Declaring the
  // variables as String makes Fireflies reject the query with
  // GRAPHQL_VALIDATION_FAILED and the prior catch-all silently returned [].
  const query = `
    query GetTranscripts($fromDate: DateTime, $toDate: DateTime) {
      transcripts(fromDate: $fromDate, toDate: $toDate) {
        id
        title
        date
        meeting_link
        participants
        summary {
          overview
          shorthand_bullet
        }
      }
    }
  `;

  const res = await fetch(FIREFLIES_API, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ query, variables: { fromDate, toDate } }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json?.errors) {
    throw new FirefliesError(
      `Fireflies API error (HTTP ${res.status})`,
      json?.errors ?? json ?? { http_status: res.status },
    );
  }
  return json?.data?.transcripts ?? [];
}

// ─── Project matching ─────────────────────────────────────────────────────────

interface ProjectRecord {
  id:                 string;
  name:               string;
  currentMeetingDate: string | null;
}

function matchesProject(project: ProjectRecord, transcript: FirefliesTranscript): boolean {
  const title = transcript.title.toLowerCase();
  const proj  = project.name.toLowerCase();

  // 1. Direct substring match
  if (title.includes(proj) || proj.includes(title)) return true;

  // 2. Token match: significant words (≥4 chars) from project name in title
  const tokens = proj.split(/\W+/).filter(t => t.length >= 4);
  if (tokens.some(t => title.includes(t))) return true;

  // 3. Keyword override map
  const overrideKeywords = PROJECT_KEYWORD_OVERRIDES[project.id] ?? [];
  const allText = (title + " " + transcript.participants.join(" ")).toLowerCase();
  if (overrideKeywords.some(k => allText.includes(k.toLowerCase()))) return true;

  return false;
}

// ─── Deduplication: CH Sources URLs already in DB ────────────────────────────

async function getExistingSourceUrls(fromDate: string): Promise<Set<string>> {
  try {
    const existing = new Set<string>();
    let cursor: string | undefined;
    do {
      const res = await notion.databases.query({
        database_id: SOURCES_DB,
        filter: {
          and: [
            { property: "Source Platform", select: { equals: "Fireflies" } },
            { property: "Source Date",     date:   { on_or_after: fromDate } },
          ],
        },
        page_size: 100,
        ...(cursor ? { start_cursor: cursor } : {}),
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const page of res.results as any[]) {
        const url = page.properties?.["Source URL"]?.url as string | null;
        if (url) existing.add(url);
      }
      cursor = res.has_more ? (res.next_cursor ?? undefined) : undefined;
    } while (cursor);
    return existing;
  } catch {
    return new Set();
  }
}

// ─── CH People: update Last Contact Date ─────────────────────────────────────

async function updatePeopleLastContact(emails: string[], dateStr: string): Promise<number> {
  let updated = 0;
  for (const email of emails.slice(0, 30)) {
    try {
      const res = await notion.databases.query({
        database_id: PEOPLE_DB,
        filter: { property: "Email", email: { equals: email } },
        page_size: 1,
      });
      if (res.results.length === 0) continue;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await notion.pages.update({
        page_id: res.results[0].id,
        properties: {
          "Last Contact Date": { date: { start: dateStr } },
        } as any, // eslint-disable-line @typescript-eslint/no-explicit-any
      });
      updated++;
    } catch { /* skip on error — non-critical */ }
  }
  return updated;
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  if (!(await authCheck(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Parse lookback window — default = yesterday (delta mode)
  let days = 1;
  try {
    const body = await req.json().catch(() => ({}));
    if (typeof body?.days === "number" && body.days > 0) days = body.days;
  } catch { /* no body */ }

  // Fireflies expects DateTime (full ISO 8601). Notion's date filter wants
  // YYYY-MM-DD. Keep them as separate strings.
  const now = new Date();
  const fromIso       = new Date(now.getTime() - days * 86_400_000).toISOString();
  const toIso         = now.toISOString();
  const fromDateOnly  = fromIso.slice(0, 10);

  // ── 1. Load active projects ──────────────────────────────────────────────────
  let projects: ProjectRecord[] = [];
  try {
    const res = await notion.databases.query({
      database_id: PROJECTS_DB,
      filter: { property: "Project Status", select: { equals: "Active" } },
      page_size: 100,
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    projects = (res.results as any[]).map(p => ({
      id:                 p.id,
      name:               p.properties["Project Name"]?.title?.[0]?.plain_text ?? "",
      currentMeetingDate: p.properties["Last Meeting Date"]?.date?.start ?? null,
    })).filter(p => p.name.trim() !== "");
  } catch (err) {
    return NextResponse.json({ error: "Failed to load projects", detail: String(err) }, { status: 500 });
  }

  // ── 2. Fetch transcripts from Fireflies ─────────────────────────────────────
  let transcripts: FirefliesTranscript[];
  try {
    transcripts = await getTranscripts(fromIso, toIso);
  } catch (err) {
    const e = err as FirefliesError;
    // Surface the real cause to the UI instead of silent 0.
    return NextResponse.json({
      ok: false,
      error: "fireflies_api_error",
      message: e.message,
      detail: e.detail,
      mode: days === 1 ? "delta" : `backfill-${days}d`,
    }, { status: 502 });
  }

  if (transcripts.length === 0) {
    return NextResponse.json({
      ok: true, transcripts: 0, projects_updated: 0, sources_created: 0, people_updated: 0,
      mode: days === 1 ? "delta" : `backfill-${days}d`,
    });
  }

  // ── 3. Pre-load existing Source URLs to prevent duplicates ──────────────────
  const alreadyIngested = await getExistingSourceUrls(fromDateOnly);

  // ── 4. Match transcripts to projects ────────────────────────────────────────
  const latestByProject = new Map<string, string>();                              // projectId → date
  const matchPairs: { transcript: FirefliesTranscript; projectId: string }[] = [];

  for (const t of transcripts) {
    const meetingDate = new Date(t.date).toISOString().slice(0, 10);
    for (const p of projects) {
      if (!matchesProject(p, t)) continue;

      const current = latestByProject.get(p.id);
      if (!current || meetingDate > current) latestByProject.set(p.id, meetingDate);

      matchPairs.push({ transcript: t, projectId: p.id });
    }
  }

  // ── 5. Update CH Projects "Last Meeting Date" ────────────────────────────────
  let projectsUpdated = 0;
  const projectErrors: string[] = [];

  for (const [projectId, meetingDate] of latestByProject) {
    const project = projects.find(p => p.id === projectId)!;
    if (project.currentMeetingDate && project.currentMeetingDate >= meetingDate) continue;
    try {
      await notion.pages.update({
        page_id: projectId,
        properties: { "Last Meeting Date": { date: { start: meetingDate } } } as any, // eslint-disable-line @typescript-eslint/no-explicit-any
      });
      projectsUpdated++;
    } catch (err) {
      projectErrors.push(`${project.name}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // ── 6. Create CH Sources records (deduplicated) ──────────────────────────────
  let sourcesCreated = 0;
  const sourceErrors: string[] = [];

  for (const { transcript: t, projectId } of matchPairs) {
    const viewerUrl = `https://app.fireflies.ai/view/${t.id}`;
    if (alreadyIngested.has(viewerUrl)) continue;

    const meetingDate = new Date(t.date).toISOString().slice(0, 10);
    const summary     = t.summary?.overview || t.summary?.shorthand_bullet || "";

    try {
      const props: Record<string, unknown> = {
        "Source Title":      { title: [{ text: { content: t.title.slice(0, 200) } }] },
        "Source Type":       { select: { name: "Meeting" } },
        "Source Platform":   { select: { name: "Fireflies" } },
        "Processing Status": { select: { name: "Processed" } },
        "Source Date":       { date:   { start: meetingDate } },
        "Source URL":        { url: viewerUrl },
        "Linked Projects":   { relation: [{ id: projectId }] },
      };
      if (summary) {
        props["Processed Summary"] = { rich_text: [{ text: { content: summary.slice(0, 2000) } }] };
      }

      await notion.pages.create({
        parent:     { database_id: SOURCES_DB },
        properties: props as Parameters<typeof notion.pages.create>[0]["properties"],
      });

      alreadyIngested.add(viewerUrl); // prevent duplicate within same run
      sourcesCreated++;
    } catch (err) {
      sourceErrors.push(`${t.title}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // ── 7. Update CH People "Last Contact Date" ──────────────────────────────────
  // Collect unique participant emails from all matched meetings
  const participantEmails = new Map<string, string>(); // email → most recent meeting date

  for (const { transcript: t } of matchPairs) {
    const meetingDate = new Date(t.date).toISOString().slice(0, 10);
    for (const email of (t.participants ?? [])) {
      if (!email.includes("@")) continue;
      const current = participantEmails.get(email);
      if (!current || meetingDate > current) participantEmails.set(email, meetingDate);
    }
  }

  let peopleUpdated = 0;
  for (const [email, dateStr] of participantEmails) {
    peopleUpdated += await updatePeopleLastContact([email], dateStr);
  }

  const errors = [...projectErrors, ...sourceErrors];

  return NextResponse.json({
    ok: true,
    mode:             days === 1 ? "delta" : `backfill-${days}d`,
    fromDate:         fromIso,
    toDate:           toIso,
    transcripts:      transcripts.length,
    matched:          latestByProject.size,
    projects_updated: projectsUpdated,
    sources_created:  sourcesCreated,
    people_updated:   peopleUpdated,
    errors,
  });
}
