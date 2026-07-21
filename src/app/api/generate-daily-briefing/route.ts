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
import { currentUser } from "@clerk/nextjs/server";
import { isAdminUser, isAdminEmail } from "@/lib/clients";
import { withRoutineLog } from "@/lib/routine-log";
import { computeAnthropicCost } from "@/lib/anthropic-cost";
import { getSupabaseServerClient } from "@/lib/supabase-server";

const HAIKU_MODEL = "claude-haiku-4-5-20251001";

export const maxDuration = 120;

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ─── Auth ─────────────────────────────────────────────────────────────────────

async function authCheck(req: NextRequest): Promise<boolean> {
  const agentKey  = req.headers.get("x-agent-key");
  const cronToken = req.headers.get("authorization");
  const expected  = process.env.CRON_SECRET;
  // Both cron paths require a non-empty CRON_SECRET — otherwise fail closed.
  if (expected) {
    if (agentKey && agentKey === expected) return true;
    if (cronToken === `Bearer ${expected}`) return true;
  }
  // Allow authenticated admin session (browser trigger) — match adminGuardApi
  // by checking BOTH ADMIN_USER_IDS and ADMIN_EMAILS so browser-triggered
  // refreshes work in prod where userIds can drift from dev.
  try {
    const user = await currentUser();
    if (!user) return false;
    const email = user.primaryEmailAddress?.emailAddress ?? "";
    if (isAdminUser(user.id) || isAdminEmail(email)) return true;
  } catch { /* no-op */ }
  return false;
}

// ─── Data fetchers (Supabase canonical) ──────────────────────────────────────

async function fetchActiveProjects() {
  const sb = getSupabaseServerClient();
  const { data } = await sb
    .from("projects")
    .select("name, current_stage, status_summary")
    .eq("project_status", "Active")
    .limit(30);
  return (data ?? []).map(p => ({
    name:   (p.name as string) ?? "",
    stage:  (p.current_stage as string) ?? "",
    status: (p.status_summary as string) ?? "",
  }));
}

async function fetchFollowUpOpportunities() {
  const sb = getSupabaseServerClient();
  const { data } = await sb
    .from("opportunities")
    .select("notion_id, title, status, opportunity_type, org_notion_id, is_followed")
    .eq("follow_up_status", "Needed")
    .limit(15);
  // Grant activation gate: unfollowed grants must NOT enter the daily briefing.
  // is_followed is the source of truth for human activation.
  return (data ?? [])
    .filter(r => r.opportunity_type !== "Grant" || r.is_followed === true)
    .map(r => ({
      name:  (r.title as string) ?? "",
      stage: (r.status as string) ?? "",
      org:   (r.org_notion_id as string) ?? null,
    }));
}

async function fetchPendingDecisions() {
  const sb = getSupabaseServerClient();
  const { data } = await sb
    .from("decision_items")
    .select("title, decision_type")
    .eq("status", "Open")
    .eq("priority", "P1 Critical")
    .limit(10);
  return (data ?? []).map(d => ({
    title: (d.title as string) ?? "",
    type:  (d.decision_type as string) ?? "",
  }));
}

async function fetchPendingDrafts() {
  const sb = getSupabaseServerClient();
  const { data } = await sb
    .from("agent_drafts")
    .select("title, draft_type, notion_created_at")
    .eq("status", "Pending Review")
    .order("notion_created_at", { ascending: false })
    .limit(10);
  return (data ?? []).map(d => ({
    title: (d.title as string) ?? "",
    type:  (d.draft_type as string) ?? "",
  }));
}

async function fetchReadyContent() {
  const sb = getSupabaseServerClient();
  const { data } = await sb
    .from("content_pipeline_items")
    .select("title, channel")
    .eq("status", "Ready to Publish")
    .limit(10);
  return (data ?? []).map(c => ({
    title:    (c.title as string) ?? "",
    platform: (c.channel as string) ?? "",
  }));
}

async function fetchColdPeople() {
  const sb = getSupabaseServerClient();
  const { data } = await sb
    .from("people")
    .select("full_name, contact_warmth")
    .in("contact_warmth", ["Cold", "Dormant"])
    .limit(15);
  return (data ?? []).map(p => ({
    name:   (p.full_name as string) ?? "",
    warmth: (p.contact_warmth as string) ?? "",
  }));
}

// Insight Briefs are the authoritative source for market signals — they
// capture sector reports, competitor moves, funding announcements, and
// ecosystem news curated into CH's Insight Engine. Internal CH Evidence is
// about decisions/blockers/tasks — NOT market intel — so it is not read here.
//
// Fidelity note: the legacy Notion source exposed Executive Summary / Theme /
// Relevance properties. The canonical `insight_briefs` table carries the body
// in body_md and a single brief_type tag — so summary is drawn from body_md
// and theme from brief_type; per-brief Relevance is not modelled in Supabase.
async function fetchRecentInsightBriefs() {
  const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
  const sb = getSupabaseServerClient();
  const { data } = await sb
    .from("insight_briefs")
    .select("title, brief_type, body_md, status, updated_at")
    .gte("updated_at", since)
    .order("updated_at", { ascending: false })
    .limit(20);
  return (data ?? []).map(b => ({
    title:     (b.title as string) || "Untitled",
    summary:   ((b.body_md as string) ?? "").slice(0, 400),
    theme:     b.brief_type ? [b.brief_type as string] : ([] as string[]),
    relevance: [] as string[],
    status:    (b.status as string) ?? "",
  }));
}

// ─── Knowledge hot leaves (Supabase) ─────────────────────────────────────────
//
// The knowledge-curator appends domain insights to the tree every weekday at
// 03:30 — and until 2026-06-10 NOTHING surfaced that work to Jose (the only
// consumer was the manually-triggered prep brief). The briefing is where he
// looks every morning, so the freshest leaves get a seat here.

async function fetchHotKnowledgeLeaves(): Promise<Array<{ path: string; title: string; recent: string }>> {
  const sb = getSupabaseServerClient();
  const since = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const { data } = await sb
    .from("knowledge_nodes")
    .select("path, title, body_md, last_evidence_at")
    .gte("last_evidence_at", since)
    .not("body_md", "is", null)
    .order("last_evidence_at", { ascending: false })
    .limit(3);
  return ((data ?? []) as Array<{ path: string; title: string; body_md: string | null }>).map(n => {
    // Curator APPENDs at the end of sections — the tail bullets are the
    // freshest material. Grab the last 3 bullet lines as the digest seed.
    const bullets = (n.body_md ?? "")
      .split(/\r?\n/)
      .map(l => l.trim())
      .filter(l => /^[-*•]\s+\S/.test(l));
    const recent = bullets.slice(-3).map(b => b.replace(/^[-*•]\s+/, "")).join(" | ").slice(0, 400);
    return { path: n.path, title: n.title, recent: recent || "(updated)" };
  });
}

// ─── Main handler ─────────────────────────────────────────────────────────────

async function _POST(req: NextRequest) {
  if (!await authCheck(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const today = new Date().toISOString().slice(0, 10);

  // Fetch all data in parallel
  const [projects, followUps, decisions, drafts, readyContent, coldPeople, recentBriefs, hotLeaves] =
    await Promise.all([
      fetchActiveProjects().catch(() => []),
      fetchFollowUpOpportunities().catch(() => []),
      fetchPendingDecisions().catch(() => []),
      fetchPendingDrafts().catch(() => []),
      fetchReadyContent().catch(() => []),
      fetchColdPeople().catch(() => []),
      fetchRecentInsightBriefs().catch(() => []),
      fetchHotKnowledgeLeaves().catch(() => []),
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

## Recent Insight Briefs (last 14 days) — source for market signals
${recentBriefs.map(b =>
  `- "${b.title}" [${b.theme.join(", ") || "no-theme"}${b.relevance.length ? " · rel: " + b.relevance.join(", ") : ""}]: ${b.summary || "(no summary)"}`
).join("\n") || "None"}

## Knowledge tree — leaves updated this week (curator output)
${hotLeaves.map(l => `- ${l.path} — ${l.title}: ${l.recent}`).join("\n") || "None"}
`.trim();

  // Claude Haiku generates the briefing sections
  const response = await anthropic.messages.create({
    model: HAIKU_MODEL,
    max_tokens: 1200,
    system: `You are the daily briefing writer for Common House (CH), a circular economy accelerator.
Write concise, actionable text for each section. No headers. No markdown. Plain text only.
Be direct — assume the reader (Jose, the founder) knows the context. Max 2-3 sentences per section.`,
    messages: [{
      role: "user",
      content: `Based on this OS snapshot, write the 8 sections of today's daily briefing.

${context}

Return EXACTLY this JSON (no extra keys, no markdown):
{
  "focus_of_day": "one sentence — the single most important thing to move forward today",
  "meeting_prep": "bullet list of who needs prep today, or 'No external meetings today' if none",
  "my_commitments": "open P1 decisions and any blockers that need JMM action, or 'No open P1 items' if none",
  "follow_up_queue": "list of opportunities needing follow-up, or 'No follow-ups needed' if none",
  "agent_queue": "summary of pending drafts to review, or 'Agent queue clear' if none",
  "market_signals": "3-5 external market signals drawn ONLY from the Insight Briefs above. Cover three kinds when evidence allows: (a) portfolio moves (iRefill, SUFI, Yenxa, Auto Mercado, Greenleaf), (b) CH-vertical shifts (retail refill, financial inclusion, sustainable food, agritech, circular economy), (c) competitor or ecosystem moves (who raised, launched, pivoted, or entered CH's space). Return STRICTLY this format — one signal per block, blank line between blocks, no preamble, no numbering: '[Tag] Headline in one sentence.\\n· Why it matters in one sentence.' Tag MUST be one of: Policy | Funding | Market Move | Sector Trend | Competitor | Ecosystem | Portfolio. If the brief list is empty or irrelevant, return exactly 'No recent briefs logged — run the Insight Engine to pull sector signals.'",
  "ready_to_publish": "list of content ready to go live, or 'Nothing ready to publish' if none",
  "knowledge_hot": "1-2 sentences on what the knowledge tree learned this week (name the leaves, cite the most useful insight), or 'Knowledge tree quiet this week' if no leaves updated"
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

  // Upsert: update if exists, create if not.
  // Existence check consults Supabase (canonical) — the daily_briefings table
  // is the single source of truth post-cutoff.
  const now = new Date().toISOString();
  const sb = getSupabaseServerClient();
  let existingId: string | null = null;
  try {
    const { data: existingRow } = await sb
      .from("daily_briefings")
      .select("id")
      .eq("briefing_date", today)
      .maybeSingle();
    existingId = (existingRow?.id as string | undefined) ?? null;
  } catch { /* no-op: treat as new briefing */ }

  // notion-cutoff-2026-06-02: replaced by canonical write to daily_briefings
  // The previous Notion write block (kept here for reference until Phase 6
  // removes the file entirely) wrote 7 rich-text properties + Generated At + Status:
  //   const properties = {
  //     "Focus of the Day": { rich_text: [{ text: { content: sections.focus_of_day ?? "" } }] },
  //     "Meeting Prep":     { rich_text: [{ text: { content: sections.meeting_prep ?? "" } }] },
  //     "My Commitments":   { rich_text: [{ text: { content: sections.my_commitments ?? "" } }] },
  //     "Follow-up Queue":  { rich_text: [{ text: { content: sections.follow_up_queue ?? "" } }] },
  //     "Agent Queue":      { rich_text: [{ text: { content: sections.agent_queue ?? "" } }] },
  //     "Market Signals":   { rich_text: [{ text: { content: sections.market_signals ?? "" } }] },
  //     "Ready to Publish": { rich_text: [{ text: { content: sections.ready_to_publish ?? "" } }] },
  //     "Generated At":     { date: { start: now } },
  //     "Status":           { select: { name: "Fresh" } },
  //   };
  //   if (existingId) await notion.pages.update({ page_id: existingId, properties });
  //   else await notion.pages.create({ parent: { database_id: DB.dailyBriefings }, properties: { ...properties, Date: { date: { start: today } }, Name: { title: [{ text: { content: `Daily Briefing — ${today}` } }] } } });

  // Notion → Supabase (daily_briefings) column mapping:
  //   Date              → briefing_date (date, upsert key)
  //   Name              → title
  //   Focus / Meeting Prep / Commitments / Follow-up / Agent Queue /
  //   Market Signals / Ready to Publish → composed into body_md;
  //                       also stashed structured into payload.sections so
  //                       Phase 6 can bind dedicated columns without re-running
  //                       Claude.
  //   Generated At      → payload.generated_at (until Phase 6 binds a column)
  //   Status            → payload.status
  const briefingTitle = `Daily Briefing — ${today}`;
  const sectionMap: Record<string, string> = {
    focus_of_day:     sections.focus_of_day ?? "",
    meeting_prep:     sections.meeting_prep ?? "",
    my_commitments:   sections.my_commitments ?? "",
    follow_up_queue:  sections.follow_up_queue ?? "",
    agent_queue:      sections.agent_queue ?? "",
    market_signals:   sections.market_signals ?? "",
    ready_to_publish: sections.ready_to_publish ?? "",
    knowledge_hot:    sections.knowledge_hot ?? "",
  };
  const bodyMd = [
    `## Focus of the Day\n${sectionMap.focus_of_day}`,
    `## Meeting Prep\n${sectionMap.meeting_prep}`,
    `## My Commitments\n${sectionMap.my_commitments}`,
    `## Follow-up Queue\n${sectionMap.follow_up_queue}`,
    `## Agent Queue\n${sectionMap.agent_queue}`,
    `## Market Signals\n${sectionMap.market_signals}`,
    `## Ready to Publish\n${sectionMap.ready_to_publish}`,
    ...(sectionMap.knowledge_hot ? [`## Knowledge Hot\n${sectionMap.knowledge_hot}`] : []),
  ].join("\n\n");

  // Upsert keyed on briefing_date — single row per day per freeze §3.4.
  const { error: upsertErr } = await sb
    .from("daily_briefings")
    .upsert(
      {
        briefing_date: today,
        title:         briefingTitle,
        body_md:       bodyMd,
        source_agent:  "generate-daily-briefing",
        payload:       {
          sections:     sectionMap,
          generated_at: now,
          status:       "Fresh",
        },
        updated_at:    now,
      },
      { onConflict: "briefing_date" },
    );
  if (upsertErr) {
    console.error("[generate-daily-briefing] supabase upsert failed:", upsertErr.message);
    return NextResponse.json({ error: "Supabase upsert failed", detail: upsertErr.message }, { status: 500 });
  }

  const cost_usd = computeAnthropicCost(response.usage, HAIKU_MODEL);

  return NextResponse.json({
    ok: true,
    date: today,
    action: existingId ? "updated" : "created",
    sections: Object.keys(sections),
    cost_usd,
    stats: {
      projects: projects.length,
      followUps: followUps.length,
      decisions: decisions.length,
      drafts: drafts.length,
      readyContent: readyContent.length,
    },
  });
}

export const POST = withRoutineLog("generate-daily-briefing", _POST);
export const GET = POST;
