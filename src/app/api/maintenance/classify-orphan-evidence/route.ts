/**
 * POST/GET /api/maintenance/classify-orphan-evidence
 *
 * LLM attribution classifier — the last mile after the deterministic resolver.
 * Reads orphaned evidence whose text is rich (names people / products / topics)
 * but whose project/org the resolver could not derive (no source link, title
 * doesn't name a project, etc.), and proposes the project and/or org it belongs
 * to from the active catalog.
 *
 * HUMAN-GATED: dry-run (default) returns proposals with a confidence per row and
 * writes nothing. `?execute=true` applies ONLY `confidence:"high"` proposals,
 * and only fills fields that are currently NULL (never overwrites). Medium/low
 * are reported for review, never auto-applied.
 *
 * Auth: CRON_SECRET (x-agent-key / Authorization: Bearer). Model: Haiku.
 */
import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getSupabaseServerClient } from "@/lib/supabase-server";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

const MODEL = "claude-haiku-4-5-20251001";
const BATCH = 25;

function authCheck(req: NextRequest): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;
  if (req.headers.get("x-agent-key") === expected) return true;
  if (req.headers.get("authorization") === `Bearer ${expected}`) return true;
  return false;
}

type Proposal = {
  id: string;
  project_notion_id: string | null;
  project_name: string | null;
  org_notion_id: string | null;
  org_name: string | null;
  confidence: "high" | "medium" | "low";
  reason: string;
  ev_project_null: boolean;
  ev_project_current: string | null;
  ev_org_null: boolean;
};

async function handle(req: NextRequest) {
  if (!authCheck(req)) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const url = new URL(req.url);
  const execute = url.searchParams.get("execute") === "true";
  const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "200", 10) || 200, 2000);
  // Default newest-first (keeps the recent layer clean). `order=oldest` sweeps
  // the historical backlog (e.g. source-less April/May evidence).
  const oldestFirst = url.searchParams.get("order") === "oldest";
  // Re-split mode: re-classify the evidence CURRENTLY in this project across the
  // full catalog, and MOVE (high-confidence) the ones that belong elsewhere.
  const sourceProject = url.searchParams.get("source_project");
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return NextResponse.json({ ok: false, error: "ANTHROPIC_API_KEY missing" }, { status: 500 });

  const sb = getSupabaseServerClient();

  // Catalogs
  const { data: projs } = await sb
    .from("projects")
    .select("notion_id, name, status_summary, objective_outcome")
    .eq("project_status", "Active");
  const projList = ((projs ?? []) as Array<{ notion_id: string | null; name: string | null; status_summary: string | null; objective_outcome: string | null }>)
    .filter(p => p.notion_id && p.name)
    .map((p, i) => ({ key: i, notion_id: p.notion_id as string, name: p.name as string, blurb: (p.status_summary ?? p.objective_outcome ?? "").replace(/\s+/g, " ").slice(0, 160) }));

  const { data: orgs } = await sb.from("organizations").select("notion_id, name");
  const orgList = ((orgs ?? []) as Array<{ notion_id: string | null; name: string | null }>)
    .filter(o => o.notion_id && o.name)
    .map((o, i) => ({ key: i, notion_id: o.notion_id as string, name: o.name as string }));

  const projByKey = new Map(projList.map(p => [p.key, p]));
  const orgByKey  = new Map(orgList.map(o => [o.key, o]));
  const validProjects = new Set(projList.map(p => p.notion_id));

  // Orphans with rich text
  let evQuery = sb
    .from("evidence")
    .select("id, title, evidence_statement, project_notion_id, org_notion_id")
    .not("evidence_statement", "is", null);
  evQuery = sourceProject
    ? evQuery.eq("project_notion_id", sourceProject)          // re-split this project
    : evQuery.or("project_notion_id.is.null,org_notion_id.is.null"); // fill orphans
  const { data: evs } = await evQuery
    .order("date_captured", { ascending: oldestFirst })
    .limit(limit);
  const evidence = ((evs ?? []) as Array<{ id: string; title: string | null; evidence_statement: string | null; project_notion_id: string | null; org_notion_id: string | null }>)
    .filter(e => (e.evidence_statement ?? "").trim().length >= 25);

  const anthropic = new Anthropic({ apiKey });
  const proposals: Proposal[] = [];
  const errors: string[] = [];

  const catalog =
    "PROJECTS (key — name — what it is):\n" +
    projList.map(p => `${p.key} — ${p.name}${p.blurb ? ` — ${p.blurb}` : ""}`).join("\n") +
    "\n\nORGANIZATIONS (key — name):\n" +
    orgList.map(o => `${o.key} — ${o.name}`).join("\n");

  for (let i = 0; i < evidence.length; i += BATCH) {
    const batch = evidence.slice(i, i + BATCH);
    const items = batch.map((e, j) => ({ index: j, text: `${e.title ? e.title + ": " : ""}${e.evidence_statement}`.replace(/\s+/g, " ").slice(0, 380) }));

    const prompt = `You attribute atomic evidence (one factual claim extracted from a Common House meeting or document) to the PROJECT and/or ORGANIZATION it belongs to.

${catalog}

For each item, decide the single best project and/or org based ONLY on named people, products, organizations, places, or specific topics in the text. Output a JSON array:
[{"index":<int>,"project_key":<int|null>,"org_key":<int|null>,"confidence":"high"|"medium"|"low","reason":"<≤12 words>"}]

Rules:
- Assign a project/org ONLY when the text clearly maps to one (a named person/product/topic unique to it). Generic statements, reference/library material, or internal-only claims with no clear counterpart → both null, confidence "low".
- "high" = you are sure. "medium" = likely. "low" = a guess (won't be applied).
- A claim may have an org but no project (relationship/exploratory) — set project_key null, org_key set.
- Never invent a key that isn't in the catalog.

Items:
${JSON.stringify(items)}

Return ONLY the JSON array, no prose.`;

    try {
      const res = await anthropic.messages.create({ model: MODEL, max_tokens: 3500, messages: [{ role: "user", content: prompt }] });
      const block = res.content[0];
      if (!block || block.type !== "text") continue;
      const m = block.text.match(/\[[\s\S]*\]/);
      if (!m) continue;
      const parsed = JSON.parse(m[0]) as Array<{ index: number; project_key: number | null; org_key: number | null; confidence: string; reason?: string }>;
      for (const r of parsed) {
        const ev = batch[r.index];
        if (!ev) continue;
        const proj = (typeof r.project_key === "number") ? projByKey.get(r.project_key) : undefined;
        const org  = (typeof r.org_key === "number") ? orgByKey.get(r.org_key) : undefined;
        if (!proj && !org) continue;
        const confidence = (["high", "medium", "low"] as const).includes(r.confidence as never) ? (r.confidence as Proposal["confidence"]) : "low";
        proposals.push({
          id: ev.id,
          project_notion_id: proj?.notion_id ?? null,
          project_name: proj?.name ?? null,
          org_notion_id: org?.notion_id ?? null,
          org_name: org?.name ?? null,
          confidence,
          reason: (r.reason ?? "").slice(0, 90),
          ev_project_null: ev.project_notion_id === null,
          ev_project_current: ev.project_notion_id,
          ev_org_null: ev.org_notion_id === null,
        });
      }
    } catch (e) {
      errors.push(`batch ${i}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  // Apply ONLY high-confidence, only NULL fields.
  let appliedProject = 0, appliedOrg = 0;
  if (execute) {
    for (const p of proposals) {
      if (p.confidence !== "high") continue;
      const patch: { project_notion_id?: string; org_notion_id?: string } = {};
      if (sourceProject) {
        // re-split: MOVE only when confidently a DIFFERENT valid project
        if (p.project_notion_id && p.project_notion_id !== p.ev_project_current && validProjects.has(p.project_notion_id)) patch.project_notion_id = p.project_notion_id;
      } else if (p.project_notion_id && p.ev_project_null) {
        patch.project_notion_id = p.project_notion_id;
      }
      if (p.org_notion_id && p.ev_org_null) patch.org_notion_id = p.org_notion_id;
      if (!patch.project_notion_id && !patch.org_notion_id) continue;
      const { error } = await sb.from("evidence").update(patch).eq("id", p.id);
      if (!error) { if (patch.project_notion_id) appliedProject++; if (patch.org_notion_id) appliedOrg++; }
    }
  }

  const byProject = new Map<string, number>();
  for (const p of proposals) if (p.confidence === "high" && p.project_name) byProject.set(p.project_name, (byProject.get(p.project_name) ?? 0) + 1);

  const counts = { high: 0, medium: 0, low: 0 };
  for (const p of proposals) counts[p.confidence]++;

  return NextResponse.json({
    ok: true,
    mode: execute ? "execute" : "dry-run",
    scanned: evidence.length,
    proposed: proposals.length,
    by_confidence: counts,
    applied: { project: appliedProject, org: appliedOrg },
    high_by_project: Array.from(byProject.entries()).map(([name, n]) => ({ project: name, count: n })).sort((a, b) => b.count - a.count),
    sample_medium: proposals.filter(p => p.confidence === "medium").slice(0, 15).map(p => ({ project: p.project_name, org: p.org_name, reason: p.reason })),
    errors: errors.slice(0, 5),
  });
}

export const GET = handle;
export const POST = handle;
