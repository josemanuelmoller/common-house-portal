/**
 * POST /api/project-operator
 *
 * Inspects active projects for new validated evidence and writes a Draft Status Update
 * to CH Projects [OS v2] where material change is detected.
 *
 * - Only touches projects in Active / Executing / Validation / Discovery stages
 * - Only writes if ≥2 new validated evidence items exist since last status update
 * - Writes to "Draft Status Update" field only — never touches Status Summary
 * - Sets "Project Update Needed? = true" so admin sees it in the portal
 * - Conservative: no stage changes, no narrative rewrites
 *
 * Auth: x-agent-key OR Vercel cron CRON_SECRET.
 * Called by Vercel cron daily at 05:00 UTC Mon–Fri.
 */

import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { Client } from "@notionhq/client";

const notion    = new Client({ auth: process.env.NOTION_API_KEY });
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const PROJECTS_DB = "49d59b18095f46588960f2e717832c5f";
const EVIDENCE_DB = "fa28124978d043039d8932ac9964ccf5";

const ACTIVE_STAGES = new Set(["Discovery", "Validation", "Execution", "Active"]);

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
  const stageFilters = [...ACTIVE_STAGES].map(s => ({
    property: "Current Stage", select: { equals: s },
  }));

  const res = await notion.databases.query({
    database_id: PROJECTS_DB,
    filter: { or: stageFilters },
    page_size: 50,
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (res.results as any[]).map(page => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const p = (name: string) => page.properties[name] as any;
    return {
      id:           page.id,
      name:         p("Project Name")?.title?.map((r: any) => r.plain_text).join("") ?? "Untitled",
      stage:        p("Current Stage")?.select?.name ?? "",
      lastUpdate:   p("Last Status Update")?.date?.start ?? null,
      updateNeeded: p("Project Update Needed?")?.checkbox ?? false,
    };
  });
}

// ─── Fetch evidence for a project ────────────────────────────────────────────

async function fetchProjectEvidence(projectId: string, since: string | null): Promise<EvidenceRow[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const filters: any[] = [
    { property: "Linked Projects", relation: { contains: projectId } },
    { property: "Validation Status", select: { equals: "Validated" } },
  ];
  if (since) {
    filters.push({ property: "Date Captured", date: { on_or_after: since } });
  }

  try {
    const res = await notion.databases.query({
      database_id: EVIDENCE_DB,
      filter: { and: filters },
      page_size: 30,
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (res.results as any[]).map(page => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const p = (name: string) => page.properties[name] as any;
      return {
        id:               page.id,
        title:            p("Evidence Title")?.title?.map((r: any) => r.plain_text).join("") ?? "",
        type:             p("Evidence Type")?.select?.name ?? "",
        statement:        p("Statement")?.rich_text?.map((r: any) => r.plain_text).join("") ?? "",
        validationStatus: p("Validation Status")?.select?.name ?? "",
        dateCaptured:     p("Date Captured")?.date?.start ?? null,
      };
    });
  } catch {
    return [];
  }
}

// ─── Generate draft status update ────────────────────────────────────────────

async function generateDraftUpdate(
  projectName: string,
  stage: string,
  evidence: EvidenceRow[]
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
      model: "claude-haiku-4-5",
      max_tokens: 200,
      messages: [{ role: "user", content: prompt }],
    });
    return msg.content[0].type === "text" ? msg.content[0].text.trim() : null;
  } catch {
    return null;
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const agentKey = req.headers.get("x-agent-key");
  const cronKey  = req.headers.get("authorization");
  const validKey = agentKey === process.env.CRON_SECRET ||
                   cronKey  === `Bearer ${process.env.CRON_SECRET}`;
  if (!validKey) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const projects = await fetchActiveProjects();
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

      const draft = await generateDraftUpdate(project.name, project.stage, evidence);
      if (!draft) { errors.push(`Claude generation failed: ${project.name}`); continue; }

      await notion.pages.update({
        page_id: project.id,
        properties: {
          "Draft Status Update":    { rich_text: [{ text: { content: draft } }] },
          "Project Update Needed?": { checkbox: true },
        } as any, // eslint-disable-line @typescript-eslint/no-explicit-any
      });

      updated++;
    } catch (err) {
      errors.push(`${project.name}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return NextResponse.json({
    ok: true,
    projectsChecked: projects.length,
    updated,
    skipped,
    errors,
  });
}
