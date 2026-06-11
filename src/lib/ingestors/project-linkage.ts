/**
 * project-linkage.ts — resolve action_items.project_id at INGEST time.
 *
 * Systemic fix for the empty-linkage problem: STB chips fell back to name
 * inference at render time because no ingestor ever wrote
 * action_items.project_id. This module lets every ingestor stamp the
 * Supabase projects.id uuid on the signal when — and only when — the source
 * maps to a known project unambiguously.
 *
 * Resolution order (first hit wins):
 *   1. explicit  — the source row carries a project notion_id (Fireflies
 *      evidence.project_notion_id). Authoritative.
 *   2. inferred  — conservative name match between the signal's text and
 *      active project names (same matcher as the STB chips; ambiguous → null).
 *   3. person    — the counterparty is linked to EXACTLY ONE active project
 *      in CH People. Two or more → null.
 *
 * Fail-soft: linkage is decoration on top of ingestion. loadProjectLinkage
 * returns null on DB error (visibly logged) and resolveProjectIdForSignal
 * degrades to null — ingestion must never break because of it.
 */

import {
  loadActiveProjects,
  inferProjectFromText,
  type MatchableProject,
} from "@/lib/project-context";

export type ProjectLinkage = {
  projects: MatchableProject[];
  /** projects.notion_id → projects.id (active projects only) */
  idByNotionId: Map<string, string>;
};

export async function loadProjectLinkage(): Promise<ProjectLinkage | null> {
  try {
    const projects = await loadActiveProjects();
    const idByNotionId = new Map<string, string>();
    for (const p of projects) {
      if (p.notion_id) idByNotionId.set(p.notion_id, p.id);
    }
    return { projects, idByNotionId };
  } catch (e) {
    // Visible per the fallback observability rule — items land without
    // project_id this run and the logs say why.
    console.warn(
      "[project-linkage] DEGRADED: active-project load failed —",
      e instanceof Error ? e.message : e,
    );
    return null;
  }
}

export function resolveProjectIdForSignal(
  linkage: ProjectLinkage | null,
  params: {
    /** Explicit project notion_id on the source row, when it has one. */
    projectNotionId?: string | null;
    /** Free text for conservative name inference (subject, title, statement). */
    inferText?: string | null;
    /** Project notion_ids the counterparty is linked to in CH People. */
    counterpartyProjectNotionIds?: string[] | null;
  },
): string | null {
  if (!linkage) return null;

  if (params.projectNotionId) {
    const id = linkage.idByNotionId.get(params.projectNotionId);
    if (id) return id;
    // Explicit notion id pointing at a dead/unknown project: do NOT fall
    // through to inference — the source said which project it was, and that
    // project is not active. No link beats a contradictory one.
    return null;
  }

  if (params.inferText) {
    const match = inferProjectFromText(linkage.projects, params.inferText);
    if (match) return match.id;
  }

  const cpIds = params.counterpartyProjectNotionIds ?? [];
  if (cpIds.length > 0) {
    const active = [...new Set(
      cpIds.map(n => linkage.idByNotionId.get(n)).filter((x): x is string => !!x),
    )];
    if (active.length === 1) return active[0];
  }

  return null;
}
