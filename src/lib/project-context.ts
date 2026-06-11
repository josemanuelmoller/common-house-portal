/**
 * project-context.ts
 *
 * Resolves "which project / strategic objective does this work hang from?"
 * for Suggested Time Blocks, so every block carries a priority-legible chip
 * (project · objective tier) instead of forcing Jose to guess.
 *
 * Resolution order per candidate:
 *   1. explicit  — FK ids on the source row (action_items.project_id /
 *      .strategic_objective_id, loops.parent_project_name). Authoritative.
 *   2. inferred  — conservative name match between the candidate's text and
 *      active project names. Only an UNAMBIGUOUS single winner is used;
 *      two plausible projects → no chip (a missing chip beats a wrong one).
 *
 * Objective tier is resolved ONLY through explicit linkage (the candidate's
 * strategic_objective_id, or a strategic_objectives row whose linked_projects
 * contains the resolved project). Tier is never inferred from text — an
 * invented priority is worse than none.
 *
 * Fail-soft: any DB error returns an empty map. Context is decoration;
 * it must never break block generation.
 */

import { getSupabaseServerClient } from "./supabase-server";
import type { Candidate } from "./time-block-candidates";

export type ProjectContext = {
  project_name: string | null;
  objective_title: string | null;
  objective_tier: string | null;            // 'high' | 'mid' | 'low'
  project_source: "explicit" | "inferred" | null;
};

/** Minimal project shape the matching primitives operate on. Exported so
 *  ingestors and backfills can run the SAME conservative inference that
 *  powers the STB chips — one matcher, one behaviour. */
export type MatchableProject = {
  id: string;
  notion_id: string | null;
  name: string;
};

type ProjectRow = MatchableProject;

type ObjectiveRow = {
  id: string;
  title: string;
  tier: string;
  linked_projects: string[] | null;
};

/** Accent-insensitive lowercase with everything non-alphanumeric removed —
 *  "Reuse for All" and "ReuseForAll" both squash to "reuseforall". */
function squash(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function tokens(s: string): Set<string> {
  return new Set(
    s.normalize("NFD").replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter(t => t.length >= 3),
  );
}

/** The matchable part of a project name: qualifiers after a dash/em-dash or
 *  in parentheses are dropped ("Auto Mercado - Fase 2" matches on
 *  "Auto Mercado"; "Kinko — Pre-sale (Uruguay…)" matches on "Kinko"). */
function primaryName(name: string): string {
  return name.split(/\s+[-–—]\s+|\(/)[0].trim();
}

function projectMatchesText(project: ProjectRow, textSquash: string, textTokens: Set<string>): boolean {
  const prim = primaryName(project.name);
  const primSquash = squash(prim);
  if (primSquash.length >= 5) return textSquash.includes(primSquash);
  if (primSquash.length >= 4) return textTokens.has(primSquash);
  return false; // names under 4 chars are too collision-prone to infer from
}

/** When several projects match, accept only the family case where every
 *  match is an extension of one shortest base name ("Kinko" + "Kinko —
 *  Pre-sale…" → "Kinko"). Genuinely distinct matches → ambiguous → null. */
function disambiguate(matches: MatchableProject[]): MatchableProject | null {
  if (matches.length === 0) return null;
  if (matches.length === 1) return matches[0];
  const sorted = [...matches].sort((a, b) => squash(primaryName(a.name)).length - squash(primaryName(b.name)).length);
  const base = squash(primaryName(sorted[0].name));
  return sorted.every(p => squash(primaryName(p.name)).startsWith(base)) ? sorted[0] : null;
}

const EMPTY_CONTEXT: ProjectContext = {
  project_name: null, objective_title: null, objective_tier: null, project_source: null,
};

/** Active (non-dead) projects, fetched once per caller run. Throws on DB
 *  error — callers decide their own fail-soft policy. */
export async function loadActiveProjects(): Promise<MatchableProject[]> {
  const sb = getSupabaseServerClient();
  // Status filter runs in JS: SQL `NOT IN` silently drops NULL-status rows.
  const { data, error } = await sb.from("projects").select("id,notion_id,name,project_status");
  if (error) throw new Error(`loadActiveProjects: ${error.message}`);
  const deadProj = new Set(["Archived", "Completed", "Closed", "Cancelled"]);
  return ((data ?? []) as (MatchableProject & { project_status: string | null })[])
    .filter(p => !deadProj.has(p.project_status ?? ""));
}

/**
 * Conservative name inference: returns the single unambiguous project whose
 * primary name appears in `text`, or null. Two genuinely distinct matches →
 * null (a missing link beats a wrong one). Same matcher the STB chips use.
 */
export function inferProjectFromText(
  projects: MatchableProject[],
  text: string,
): MatchableProject | null {
  if (!text.trim() || projects.length === 0) return null;
  const textSquash = squash(text);
  const textTokens = tokens(text);
  return disambiguate(projects.filter(p => projectMatchesText(p, textSquash, textTokens)));
}

/**
 * Batch-resolve project context for a set of candidates.
 * Returns a map keyed by candidate fingerprint; candidates with no
 * resolvable context map to EMPTY_CONTEXT semantics (all nulls).
 */
export async function resolveProjectContexts(
  candidates: Candidate[],
): Promise<Map<string, ProjectContext>> {
  const out = new Map<string, ProjectContext>();
  const relevant = candidates.filter(c => c.project_ref);
  if (relevant.length === 0) return out;

  let projects: ProjectRow[] = [];
  let objectives: ObjectiveRow[] = [];
  try {
    const sb = getSupabaseServerClient();
    // Status filter runs in JS: SQL `NOT IN` silently drops NULL-status rows.
    const [projList, objRes] = await Promise.all([
      loadActiveProjects(),
      sb.from("strategic_objectives").select("id,title,tier,status,linked_projects"),
    ]);
    const deadObj = new Set(["achieved", "dropped"]);
    projects = projList;
    objectives = ((objRes.data ?? []) as (ObjectiveRow & { status: string | null })[])
      .filter(o => !deadObj.has(o.status ?? ""));
  } catch (e) {
    // Fail-soft but visible (AGENTS.md fallback observability rule): blocks
    // render without chips this round, and the logs say why.
    console.warn("[project-context] DEGRADED: context resolution failed —", e instanceof Error ? e.message : e);
    return out;
  }
  if (projects.length === 0) return out;

  const byUuid = new Map(projects.map(p => [p.id, p]));
  const byNameSquash = new Map(projects.map(p => [squash(p.name), p]));
  const objByUuid = new Map(objectives.map(o => [o.id, o]));

  function objectiveForProject(p: ProjectRow): ObjectiveRow | null {
    for (const o of objectives) {
      const linked = o.linked_projects ?? [];
      if (linked.includes(p.id) || (p.notion_id && linked.includes(p.notion_id))) return o;
    }
    return null;
  }

  for (const c of relevant) {
    const ref = c.project_ref!;
    let project: ProjectRow | null = null;
    let source: ProjectContext["project_source"] = null;
    let objective: ObjectiveRow | null = null;

    if (ref.objective_id && objByUuid.has(ref.objective_id)) {
      objective = objByUuid.get(ref.objective_id)!;
    }
    if (ref.project_id && byUuid.has(ref.project_id)) {
      project = byUuid.get(ref.project_id)!;
      source = "explicit";
    } else if (ref.name_hint) {
      // Loops store the project NAME, not the uuid — trust it as explicit.
      project = byNameSquash.get(squash(ref.name_hint)) ?? null;
      source = "explicit";
      if (!project) {
        out.set(c.fingerprint, {
          project_name: ref.name_hint, objective_title: objective?.title ?? null,
          objective_tier: objective?.tier ?? null, project_source: "explicit",
        });
        continue;
      }
    } else if (ref.infer_text) {
      project = inferProjectFromText(projects, ref.infer_text);
      source = project ? "inferred" : null;
    }

    if (!objective && project) objective = objectiveForProject(project);

    out.set(c.fingerprint, project || objective ? {
      project_name:    project?.name ?? null,
      objective_title: objective?.title ?? null,
      objective_tier:  objective?.tier ?? null,
      project_source:  source,
    } : EMPTY_CONTEXT);
  }
  return out;
}
