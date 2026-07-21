/**
 * POST /api/project-operator
 *
 * Inspects active projects for new validated evidence and writes a Draft Status Update
 * to CH Projects [OS v2] where material change is detected.
 *
 * - Filters by Project Status ∈ {Active, Paused} per agent spec
 *   (.claude/agents/project-operator.md). Stage is a human-owned field —
 *   we do not filter by it and never write it.
 * - Only writes if ≥2 new validated evidence items exist since last status update
 * - Writes directly to "Status Summary" — no manual approval step
 * - Clears "Draft Status Update" and sets "Project Update Needed? = false"
 * - Conservative: no stage changes, no narrative rewrites
 *
 * Auth: x-agent-key OR Vercel cron CRON_SECRET.
 * Called by Vercel cron daily at 05:00 UTC Mon–Fri.
 */

import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { withRoutineLog } from "@/lib/routine-log";
import { computeAnthropicCost, makeUsageAccumulator, addUsage, type AnthropicUsage } from "@/lib/anthropic-cost";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { requireCronAuth } from "@/lib/require-cron";

const HAIKU_MODEL = "claude-haiku-4-5";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const ACTIVE_STATUSES = ["Active", "Paused"] as const;

// ─── Types ────────────────────────────────────────────────────────────────────

interface ProjectRow {
  id: string;
  name: string;
  stage: string;
  lastUpdate: string | null;  // ISO date of last status update
  updateNeeded: boolean;
}

interface EvidenceRow {
  id: string;
  title: string;
  type: string;
  statement: string;
  validationStatus: string;
  dateCaptured: string | null;
}

// ─── Fetch active projects ────────────────────────────────────────────────────

async function fetchActiveProjects(): Promise<ProjectRow[]> {
  const sb = getSupabaseServerClient();
  const { data } = await sb
    .from("projects")
    .select("notion_id, name, current_stage, last_status_update, update_needed")
    .in("project_status", ACTIVE_STATUSES as unknown as string[])
    .limit(50);

  return (data ?? []).map(p => ({
    id:           (p.notion_id as string),
    name:         (p.name as string) ?? "Untitled",
    stage:        (p.current_stage as string) ?? "",
    lastUpdate:   (p.last_status_update as string) ?? null,
    updateNeeded: (p.update_needed as boolean) ?? false,
  }));
}

// ─── Fetch evidence for a project ────────────────────────────────────────────

async function fetchProjectEvidence(projectId: string, since: string | null): Promise<EvidenceRow[]> {
  try {
    const sb = getSupabaseServerClient();
    let q = sb
      .from("evidence")
      .select("notion_id, title, evidence_type, evidence_statement, validation_status, date_captured")
      .eq("project_notion_id", projectId)
      .eq("validation_status", "Validated")
      .limit(30);
    if (since) {
      q = q.gte("date_captured", since);
    }
    const { data } = await q;

    return (data ?? []).map(e => ({
      id:               (e.notion_id as string),
      title:            (e.title as string) ?? "",
      type:             (e.evidence_type as string) ?? "",
      statement:        (e.evidence_statement as string) ?? "",
      validationStatus: (e.validation_status as string) ?? "",
      dateCaptured:     (e.date_captured as string) ?? null,
    }));
  } catch {
    return [];
  }
}

// ─── Generate draft status update ────────────────────────────────────────────

async function generateDraftUpdate(
  projectName: string,
  stage: string,
  evidence: EvidenceRow[],
  usageAcc?: AnthropicUsage
): Promise<string | null> {
  const items = evidence.map((e, i) =>
    `${i + 1}. [${e.type}] ${e.title}: ${e.statement}`
  ).join("\n");

  const prompt = `You are a project status writer for Common House, a circular economy ecosystem operator.

Project: ${projectName}
Stage: ${stage}
New validated evidence since last update:

${items}

Write a 2-3 sentence "Draft Status Update" paragraph that:
- Summarises the most material developments (decisions made, blockers, outcomes)
- Is factual and concise — no filler language
- Uses past tense for completed items, present tense for ongoing
- Does NOT propose next steps or recommendations
- Max 80 words

Return only the paragraph text, no labels, no markdown.`;

  try {
    const msg = await anthropic.messages.create({
      model: HAIKU_MODEL,
      max_tokens: 200,
      messages: [{ role: "user", content: prompt }],
    });
    if (usageAcc) addUsage(usageAcc, msg.usage);
    return msg.content[0].type === "text" ? msg.content[0].text.trim() : null;
  } catch {
    return null;
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function _POST(req: NextRequest) {
  const authFail = requireCronAuth(req);
  if (authFail) return authFail;

  const projects = await fetchActiveProjects();
  const usageAcc = makeUsageAccumulator();
  let updated = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const project of projects) {
    try {
      // Look back 14 days if no previous update, otherwise since last update
      const since = project.lastUpdate
        ? project.lastUpdate
        : new Date(Date.now() - 14 * 86_400_000).toISOString().slice(0, 10);

      const evidence = await fetchProjectEvidence(project.id, since);

      // Need ≥2 validated items to generate a meaningful update
      if (evidence.length < 2) { skipped++; continue; }

      const draft = await generateDraftUpdate(project.name, project.stage, evidence, usageAcc);
      if (!draft) { errors.push(`Claude generation failed: ${project.name}`); continue; }

      // notion-cutoff-2026-06-02: replaced by canonical write to projects (Supabase).
      // Notion → Supabase column mapping:
      //   "Status Summary"         → status_summary
      //   "Draft Status Update"    → draft_status_update
      //   "Project Update Needed?" → update_needed
      //
      // await notion.pages.update({
      //   page_id: project.id,
      //   properties: {
      //     "Status Summary":         { rich_text: [{ text: { content: draft } }] },
      //     "Draft Status Update":    { rich_text: [] },
      //     "Project Update Needed?": { checkbox: false },
      //   } as any,
      // });
      const sb = getSupabaseServerClient();
      const { error: updErr } = await sb
        .from("projects")
        .update({
          status_summary:      draft,
          draft_status_update: null,
          update_needed:       false,
          updated_at:          new Date().toISOString(),
        })
        .eq("notion_id", project.id);
      if (updErr) {
        errors.push(`${project.name}: ${updErr.message}`);
        continue;
      }

      updated++;
    } catch (err) {
      errors.push(`${project.name}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  const cost_usd = computeAnthropicCost(usageAcc, HAIKU_MODEL);

  return NextResponse.json({
    ok: true,
    projectsChecked: projects.length,
    checked: projects.length,
    updated,
    skipped,
    cost_usd,
    errors,
  });
}

export const POST = withRoutineLog("project-operator", _POST);
export const GET = POST;
