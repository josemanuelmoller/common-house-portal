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
 *   4. domain    — el dominio del correo de la contraparte mapea a UNA sola
 *      organización con participación activa en UN solo proyecto
 *      (project_organization_roles). Compartida entre proyectos → null.
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
import { getSupabaseServerClient } from "@/lib/supabase-server";

export type ProjectLinkage = {
  projects: MatchableProject[];
  /** projects.notion_id → projects.id (active projects only) */
  idByNotionId: Map<string, string>;
  /**
   * dominio de correo → projects.id de los proyectos donde esa organización
   * participa activamente. Varios proyectos = contraparte compartida, y ahí no
   * se resuelve nada (Neil Khor está en COP31, ZWD y ZWF a la vez: quién es no
   * alcanza para saber de qué se habló).
   */
  projectsByDomain: Map<string, Set<string>>;
};

/** org_domains es TEXT y guarda un JSON-array-como-texto: `["a.com","b.com"]`. */
function parseOrgDomains(raw: string | null): string[] {
  if (!raw) return [];
  return raw
    .replace(/[[\]"]/g, "")
    .split(",")
    .map(d => d.trim().toLowerCase())
    // La columna hace doble uso: en varias orgs guarda etiquetas de sector
    // ("Retail", "Climate") en vez de dominios. Sin punto no es un dominio, y
    // dejarlas pasar emparejaría Tesco con Waitrose.
    .filter(d => d.includes("."));
}

export async function loadProjectLinkage(): Promise<ProjectLinkage | null> {
  try {
    const projects = await loadActiveProjects();
    const idByNotionId = new Map<string, string>();
    for (const p of projects) {
      if (p.notion_id) idByNotionId.set(p.notion_id, p.id);
    }

    // project_organization_roles es el espinazo real proyecto↔organización:
    // es muchos-a-muchos (COP31 tiene 7 contrapartes). projects.organization_id
    // es sólo la org primaria y no sirve para esto.
    const live = new Set(projects.map(p => p.id));
    const projectsByDomain = new Map<string, Set<string>>();
    const { data, error } = await getSupabaseServerClient()
      .from("project_organization_roles")
      .select("project_id, organizations(org_domains)")
      .eq("participation_status", "active");
    if (error) throw new Error(error.message);

    for (const row of (data ?? []) as Array<{ project_id: string; organizations: { org_domains: string | null } | { org_domains: string | null }[] | null }>) {
      if (!live.has(row.project_id)) continue;
      const org = Array.isArray(row.organizations) ? row.organizations[0] : row.organizations;
      for (const dom of parseOrgDomains(org?.org_domains ?? null)) {
        const set = projectsByDomain.get(dom) ?? new Set<string>();
        set.add(row.project_id);
        projectsByDomain.set(dom, set);
      }
    }

    return { projects, idByNotionId, projectsByDomain };
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
    /** Correo de la contraparte, para el salto dominio→organización→proyecto. */
    counterpartyEmail?: string | null;
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

  // 4. dominio del correo → organización → proyecto donde participa.
  //    Última porque es la más indirecta: dice con qué casa hablamos, no de qué.
  //    Una organización en dos proyectos no desambigua nada y se descarta.
  const email = params.counterpartyEmail?.trim().toLowerCase();
  if (email && email.includes("@")) {
    const dom = email.split("@")[1];
    const hits = linkage.projectsByDomain.get(dom);
    if (hits && hits.size === 1) return [...hits][0];
  }

  return null;
}
