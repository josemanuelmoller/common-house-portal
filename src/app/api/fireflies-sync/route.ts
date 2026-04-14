/**
 * POST /api/fireflies-sync
 *
 * Syncs recent Fireflies meetings → CH Projects [OS v2] "Last Meeting Date".
 *
 * Match logic: project name substring match against transcript title (case-insensitive).
 * Also checks reverse: any word ≥4 chars from the transcript title appears in project name.
 *
 * Default (daily cron): reads only yesterday's meetings (delta).
 * Backfill: POST with body { days: 60 } to seed historical data once.
 *
 * Auth: x-agent-key OR Vercel cron CRON_SECRET.
 * Called by Vercel cron daily at 06:30 UTC Mon–Fri.
 */

import { NextRequest, NextResponse } from "next/server";
import { Client } from "@notionhq/client";

export const maxDuration = 60;

const notion = new Client({ auth: process.env.NOTION_API_KEY });
const FIREFLIES_API = "https://api.fireflies.ai/graphql";
const PROJECTS_DB = "49d59b18095f46588960f2e717832c5f";

// ─── Auth ─────────────────────────────────────────────────────────────────────

function authCheck(req: NextRequest): boolean {
  const agentKey  = req.headers.get("x-agent-key");
  const cronToken = req.headers.get("authorization");
  const expected  = process.env.CRON_SECRET;
  return (agentKey === expected) || (cronToken === `Bearer ${expected}`);
}

// ─── Fireflies ────────────────────────────────────────────────────────────────

interface FirefliesTranscript {
  id: string;
  title: string;
  date: number; // Unix ms
}

async function getTranscripts(fromDate: string, toDate: string): Promise<FirefliesTranscript[]> {
  const apiKey = process.env.FIREFLIES_API_KEY;
  if (!apiKey) return [];

  const query = `
    query GetTranscripts($fromDate: String, $toDate: String) {
      transcripts(fromDate: $fromDate, toDate: $toDate) {
        id
        title
        date
      }
    }
  `;

  try {
    const res = await fetch(FIREFLIES_API, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ query, variables: { fromDate, toDate } }),
    });
    if (!res.ok) return [];
    const json = await res.json();
    return json?.data?.transcripts ?? [];
  } catch {
    return [];
  }
}

// ─── Match ────────────────────────────────────────────────────────────────────

function titlesMatch(projectName: string, transcriptTitle: string): boolean {
  const proj  = projectName.toLowerCase();
  const title = transcriptTitle.toLowerCase();

  // Direct substring: project name in title or title in project name
  if (title.includes(proj) || proj.includes(title)) return true;

  // Token match: any significant word (≥4 chars) from project name appears in title
  const tokens = proj.split(/\W+/).filter(t => t.length >= 4);
  return tokens.some(t => title.includes(t));
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  if (!authCheck(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Parse lookback window — default = yesterday (delta mode)
  let days = 1;
  try {
    const body = await req.json().catch(() => ({}));
    if (typeof body?.days === "number" && body.days > 0) days = body.days;
  } catch { /* no body */ }

  const toDate   = new Date().toISOString().slice(0, 10);
  const fromDate = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);

  // Load all active projects
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let projects: { id: string; name: string; currentMeetingDate: string | null }[] = [];
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

  const transcripts = await getTranscripts(fromDate, toDate);

  if (transcripts.length === 0) {
    return NextResponse.json({ ok: true, transcripts: 0, updated: 0, mode: days === 1 ? "delta" : `backfill-${days}d` });
  }

  // Build a map: projectId → most recent meeting date from matched transcripts
  const latestByProject = new Map<string, string>();

  for (const t of transcripts) {
    const meetingDate = new Date(t.date).toISOString().slice(0, 10);
    for (const p of projects) {
      if (!titlesMatch(p.name, t.title)) continue;
      const current = latestByProject.get(p.id);
      if (!current || meetingDate > current) {
        latestByProject.set(p.id, meetingDate);
      }
    }
  }

  // Write to Notion — only if the new date is more recent than what's stored
  let updated = 0;
  const errors: string[] = [];

  for (const [projectId, meetingDate] of latestByProject) {
    const project = projects.find(p => p.id === projectId)!;
    // Skip if we already have a newer or equal date stored
    if (project.currentMeetingDate && project.currentMeetingDate >= meetingDate) continue;

    try {
      await notion.pages.update({
        page_id: projectId,
        properties: {
          "Last Meeting Date": { date: { start: meetingDate } },
        } as any, // eslint-disable-line @typescript-eslint/no-explicit-any
      });
      updated++;
    } catch (err) {
      errors.push(`${project.name}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return NextResponse.json({
    ok: true,
    mode: days === 1 ? "delta" : `backfill-${days}d`,
    fromDate,
    toDate,
    transcripts: transcripts.length,
    matched: latestByProject.size,
    updated,
    errors,
  });
}
