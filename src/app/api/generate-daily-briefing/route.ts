/**
 * POST /api/generate-daily-briefing
 *
 * Reads active state from Notion (Projects, Opportunities, Decisions, Agent Drafts,
 * Content Pipeline, People) and uses Claude Haiku to synthesise a structured daily
 * briefing. Writes (upserts) one record per date to Daily Briefings [OS v2].
 *
 * The Hall dashboard reads this record on every page load.
 *
 * Fields written:
 *   Focus of the Day   — 1-sentence priority for today
 *   Meeting Prep       — bullet list of external meetings with context
 *   My Commitments     — open decisions + tasks needing JMM action
 *   Follow-up Queue    — opportunities with Follow-up Status = Needed
 *   Agent Queue        — count + titles of pending Agent Drafts
 *   Market Signals     — brief signals from recent evidence
 *   Ready to Publish   — content items at "Ready to Publish" status
 *   Generated At       — ISO datetime
 *   Status             — Fresh
 *
 * Auth: x-agent-key header OR Vercel cron CRON_SECRET header.
 * Called by Vercel cron daily at 07:30 UTC Mon–Fri.
 */

import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { Client } from "@notionhq/client";
import { auth } from "@clerk/nextjs/server";
import { isAdminUser } from "@/lib/clients";

export const maxDuration = 120;

const notion    = new Client({ auth: process.env.NOTION_API_KEY });
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const DB = {
  projects:       "49d59b18095f46588960f2e717832c5f",
  opportunities:  "687caa98594a41b595c9960c141be0c0",
  decisions:      "6b801204c4de49c7b6179e04761a285a",
  agentDrafts:    "9844ece875ea4c618f616e8cc97d5a90",
  contentPipeline:"3bf5cf81f45c4db2840590f3878bfdc0",
  people:         "1bc0f96f33ca4a9e9ff26844377e81de",
  dailyBriefings: "d206d6cdb09040d3ac2f34a977ad9f2a",
  evidence:       "fa28124978d043039d8932ac9964ccf5",
};

// ─── Auth ─────────────────────────────────────────────────────────────────────

async function authCheck(req: NextRequest): Promise<boolean> {
  const agentKey  = req.headers.get("x-agent-key");
  const cronToken = req.headers.get("authorization");
  const expected  = process.env.CRON_SECRET;
  if (agentKey && agentKey === expected) return true;
  if (cronToken === `Bearer ${expected}`) return true;
  // Allow authenticated admin session (browser trigger)
  try {
    const { userId } = await auth();
    if (userId && isAdminUser(userId)) return true;
  } catch { /* no-op */ }
  return false;
}

// ─── Notion helpers ───────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const text  = (p: any): string => p?.title?.[0]?.plain_text ?? p?.rich_text?.[0]?.plain_text ?? "";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sel   = (p: any): string => p?.select?.name ?? "";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const prop  = (page: any, name: string) => page.properties?.[name];

// ─── Data fetchers ────────────────────────────────────────────────────────────

async function fetchActiveProjects() {
  const ACTIVE = new Set(["Discovery", "Validation", "Execution", "Active"]);
  const res = await notion.databases.query({ database_id: DB.projects, page_size: 30 });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (res.results as any[])
    .filter(p => ACTIVE.has(sel(prop(p, "Stage"))))
    .map(p => ({
      name:   text(prop(p, "Project Name")),
      stage:  sel(prop(p, "Stage")),
      status: text(prop(p, "Status Summary")),
    }));
}

async function fetchFollowUpOpportunities() {
  const res = await notion.databases.query({
    database_id: DB.opportunities,
    filter: { property: "Follow-up Status", select: { equals: "Needed" } },
    page_size: 15,
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (res.results as any[]).map(p => ({
    name:   text(prop(p, "Opportunity Name")),
    stage:  sel(prop(p, "Stage")),
    org:    p.properties?.["Organization"]?.relation?.[0]?.id ?? null,
  }));
}

async function fetchPendingDecisions() {
  const res = await notion.databases.query({
    database_id: DB.decisions,
    filter: {
      and: [
        { property: "Status", select: { equals: "Open" } },
        { property: "Priority", select: { equals: "P1" } },
      ],
    },
    page_size: 10,
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (res.results as any[]).map(p => ({
    title: text(prop(p, "Title")) || text(prop(p, "Name")),
    type:  sel(prop(p, "Type")),
  }));
}

async function fetchPendingDrafts() {
  const res = await notion.databases.query({
    database_id: DB.agentDrafts,
    filter: { property: "Status", select: { equals: "Pending Review" } },
    sorts: [{ timestamp: "created_time", direction: "descending" }],
    page_size: 10,
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (res.results as any[]).map(p => ({
    title: text(prop(p, "Title")) || text(prop(p, "Name")),
    type:  sel(prop(p, "Type")),
  }));
}

async function fetchReadyContent() {
  const res = await notion.databases.query({
    database_id: DB.contentPipeline,
    filter: { property: "Status", select: { equals: "Ready to Publish" } },
    page_size: 10,
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (res.results as any[]).map(p => ({
    title:    text(prop(p, "Title")) || text(prop(p, "Name")),
    platform: sel(prop(p, "Platform")),
  }));
}

async function fetchColdPeople() {
  const res = await notion.databases.query({
    database_id: DB.people,
    filter: {
      or: [
        { property: "Contact Warmth", select: { equals: "Cold" } },
        { property: "Contact Warmth", select: { equals: "Dormant" } },
      ],
    },
    page_size: 15,
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (res.results as any[]).map(p => ({
    name:   text(prop(p, "Full Name")),
    warmth: sel(prop(p, "Contact Warmth")),
  }));
}

async function fetchRecentEvidence() {
  const since = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const res = await notion.databases.query({
    database_id: DB.evidence,
    filter: {
      and: [
        { property: "Validation Status", select: { equals: "Validated" } },
        { property: "Date Captured", date: { on_or_after: since } },
      ],
    },
    sorts: [{ property: "Date Captured", direction: "descending" }],
    page_size: 10,
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (res.results as any[]).map(p => ({
    title:     text(prop(p, "Title")) || text(prop(p, "Name")),
    type:      sel(prop(p, "Evidence Type")),
    statement: (p.properties?.["Statement"]?.rich_text ?? [])
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((r: any) => r.plain_text).join("").slice(0, 200),
  }));
}

// ─── Check for existing briefing today ───────────────────────────────────────

async function findExistingBriefing(dateStr: string): Promise<string | null> {
  const res = await notion.databases.query({
    database_id: DB.dailyBriefings,
    filter: { property: "Date", date: { equals: dateStr } },
    page_size: 1,
  });
  return res.results.length > 0 ? res.results[0].id : null;
}

// ─── Main handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  if (!await authCheck(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const today = new Date().toISOString().slice(0, 10);

  // Fetch all data in parallel
  const [projects, followUps, decisions, drafts, readyContent, coldPeople, recentEvidence] =
    await Promise.all([
      fetchActiveProjects().catch(() => []),
      fetchFollowUpOpportunities().catch(() => []),
      fetchPendingDecisions().catch(() => []),
      fetchPendingDrafts().catch(() => []),
      fetchReadyContent().catch(() => []),
      fetchColdPeople().catch(() => []),
      fetchRecentEvidence().catch(() => []),
    ]);

  // Build context for Claude
  const context = `
Date: ${today}

## Active Projects (${projects.length})
${projects.map(p => `- ${p.name} [${p.stage}]${p.status ? `: ${p.status.slice(0, 120)}` : ""}`).join("\n") || "None"}

## Follow-up Queue (${followUps.length} opportunities needing action)
${followUps.map(o => `- ${o.name} [${o.stage}]`).join("\n") || "None"}

## Open P1 Decisions (${decisions.length})
${decisions.map(d => `- [${d.type}] ${d.title}`).join("\n") || "None"}

## Agent Drafts Pending Review (${drafts.length})
${drafts.map(d => `- [${d.type}] ${d.title}`).join("\n") || "None"}

## Ready to Publish (${readyContent.length})
${readyContent.map(c => `- ${c.title} [${c.platform}]`).join("\n") || "None"}

## Cold / Dormant Relationships (${coldPeople.length})
${coldPeople.slice(0, 8).map(p => `- ${p.name} [${p.warmth}]`).join("\n") || "None"}

## Recent Validated Evidence (last 3 days)
${recentEvidence.map(e => `- [${e.type}] ${e.title}: ${e.statement}`).join("\n") || "None"}
`.trim();

  // Claude Haiku generates the briefing sections
  const response = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 1200,
    system: `You are the daily briefing writer for Common House (CH), a circular economy accelerator.
Write concise, actionable text for each section. No headers. No markdown. Plain text only.
Be direct — assume the reader (Jose, the founder) knows the context. Max 2-3 sentences per section.`,
    messages: [{
      role: "user",
      content: `Based on this OS snapshot, write the 7 sections of today's daily briefing.

${context}

Return EXACTLY this JSON (no extra keys, no markdown):
{
  "focus_of_day": "one sentence — the single most important thing to move forward today",
  "meeting_prep": "bullet list of who needs prep today, or 'No external meetings today' if none",
  "my_commitments": "open P1 decisions and any blockers that need JMM action, or 'No open P1 items' if none",
  "follow_up_queue": "list of opportunities needing follow-up, or 'No follow-ups needed' if none",
  "agent_queue": "summary of pending drafts to review, or 'Agent queue clear' if none",
  "market_signals": "1-2 signals from recent evidence that are commercially relevant, or 'No new signals' if none",
  "ready_to_publish": "list of content ready to go live, or 'Nothing ready to publish' if none"
}`,
    }],
  });

  const raw = (response.content[0] as { type: string; text: string }).text.trim();

  let sections: Record<string, string>;
  try {
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    sections = JSON.parse(jsonMatch?.[0] ?? raw);
  } catch {
    return NextResponse.json({ error: "Failed to parse Claude response", raw }, { status: 500 });
  }

  // Upsert: update if exists, create if not
  const existingId = await findExistingBriefing(today);
  const now = new Date().toISOString();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const properties: Record<string, any> = {
    "Focus of the Day": { rich_text: [{ text: { content: sections.focus_of_day ?? "" } }] },
    "Meeting Prep":     { rich_text: [{ text: { content: sections.meeting_prep ?? "" } }] },
    "My Commitments":   { rich_text: [{ text: { content: sections.my_commitments ?? "" } }] },
    "Follow-up Queue":  { rich_text: [{ text: { content: sections.follow_up_queue ?? "" } }] },
    "Agent Queue":      { rich_text: [{ text: { content: sections.agent_queue ?? "" } }] },
    "Market Signals":   { rich_text: [{ text: { content: sections.market_signals ?? "" } }] },
    "Ready to Publish": { rich_text: [{ text: { content: sections.ready_to_publish ?? "" } }] },
    "Generated At":     { date: { start: now } },
    "Status":           { select: { name: "Fresh" } },
  };

  if (existingId) {
    await notion.pages.update({ page_id: existingId, properties });
  } else {
    properties["Date"] = { date: { start: today } };
    properties["Name"] = { title: [{ text: { content: `Daily Briefing — ${today}` } }] };
    await notion.pages.create({
      parent: { database_id: DB.dailyBriefings },
      properties,
    });
  }

  return NextResponse.json({
    ok: true,
    date: today,
    action: existingId ? "updated" : "created",
    sections: Object.keys(sections),
    stats: {
      projects: projects.length,
      followUps: followUps.length,
      decisions: decisions.length,
      drafts: drafts.length,
      readyContent: readyContent.length,
    },
  });
}
