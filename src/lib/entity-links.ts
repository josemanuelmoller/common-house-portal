import "server-only";

import { supabaseAdmin } from "@/lib/supabase";

/**
 * Typed links from state items / learning items to canonical people /
 * organizations (Phase 6). Resolution is best-effort trigram matching in the
 * link_subject_entities RPC; labels are always kept, links are additive.
 */

export type LinkedEntity = {
  entityType: "person" | "organization";
  entityId: string;
  entityName: string;
  relation: string;
  matchScore: number | null;
};

/** Resolve a subject's owner/stakeholder labels to entities and link them (idempotent). */
export async function linkStateSubject(
  projectId: string,
  subjectType: "state_item" | "learning_item",
  subjectId: string,
  ownerLabel: string | null,
  stakeholderLabel: string | null,
  actor: string,
): Promise<number> {
  if (!ownerLabel && !stakeholderLabel) return 0;
  const { data, error } = await supabaseAdmin().rpc("link_subject_entities", {
    p_project_id: projectId,
    p_subject_type: subjectType,
    p_subject_id: subjectId,
    p_owner_label: ownerLabel,
    p_stakeholder_label: stakeholderLabel,
    p_actor: actor,
  });
  if (error) throw new Error(`entity link failed: ${error.message}`);
  return (data as number | null) ?? 0;
}

/** Fetch links for a set of subjects, with resolved entity names, grouped by subject id. */
export async function getLinksForSubjects(subjectIds: string[]): Promise<Map<string, LinkedEntity[]>> {
  const out = new Map<string, LinkedEntity[]>();
  if (subjectIds.length === 0) return out;
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from("project_entity_links")
    .select("subject_id, entity_type, entity_id, relation, match_score")
    .in("subject_id", subjectIds);
  if (error) throw new Error(`entity links read failed: ${error.message}`);
  const rows = data ?? [];
  const personIds = [...new Set(rows.filter((r) => r.entity_type === "person").map((r) => r.entity_id as string))];
  const orgIds = [...new Set(rows.filter((r) => r.entity_type === "organization").map((r) => r.entity_id as string))];
  const [people, orgs] = await Promise.all([
    personIds.length ? sb.from("people").select("id, full_name").in("id", personIds) : Promise.resolve({ data: [] }),
    orgIds.length ? sb.from("organizations").select("id, name").in("id", orgIds) : Promise.resolve({ data: [] }),
  ]);
  const nameOf = new Map<string, string>();
  for (const p of (people.data ?? []) as { id: string; full_name: string | null }[]) nameOf.set(`person:${p.id}`, p.full_name ?? "Unknown person");
  for (const o of (orgs.data ?? []) as { id: string; name: string | null }[]) nameOf.set(`organization:${o.id}`, o.name ?? "Unknown org");
  for (const r of rows) {
    const key = r.subject_id as string;
    const list = out.get(key) ?? [];
    list.push({
      entityType: r.entity_type as "person" | "organization",
      entityId: r.entity_id as string,
      entityName: nameOf.get(`${r.entity_type}:${r.entity_id}`) ?? "Unknown",
      relation: r.relation as string,
      matchScore: (r.match_score as number | null) ?? null,
    });
    out.set(key, list);
  }
  return out;
}

/**
 * Resolve labels → links for every active state item and learning item in scope.
 * Idempotent; safe to re-run. Returns how many links were created.
 */
export async function backfillEntityLinks(projectId?: string): Promise<{ subjects: number; linksCreated: number }> {
  const sb = supabaseAdmin();
  let itemQ = sb.from("project_state_items")
    .select("id, project_id, owner_label, stakeholder_label")
    .eq("status", "active")
    .or("owner_label.not.is.null,stakeholder_label.not.is.null");
  if (projectId) itemQ = itemQ.eq("project_id", projectId);
  const { data: items, error: itemErr } = await itemQ;
  if (itemErr) throw new Error(`backfill items read failed: ${itemErr.message}`);

  // Learnings carry no owner/stakeholder labels — resolve their `area` (a team /
  // function) as a stakeholder. With the hardened resolver most areas stay
  // unresolved, which is the intended conservative behavior.
  let learnQ = sb.from("project_learning_items")
    .select("id, project_id, area")
    .not("status", "in", "(promoted,rejected)")
    .not("area", "is", null);
  if (projectId) learnQ = learnQ.eq("project_id", projectId);
  const { data: learnings, error: learnErr } = await learnQ;
  if (learnErr) throw new Error(`backfill learnings read failed: ${learnErr.message}`);

  let subjects = 0;
  let linksCreated = 0;
  for (const it of items ?? []) {
    subjects += 1;
    linksCreated += await linkStateSubject(
      it.project_id as string, "state_item", it.id as string,
      (it.owner_label as string | null) ?? null, (it.stakeholder_label as string | null) ?? null,
      "backfill",
    );
  }
  for (const lr of learnings ?? []) {
    subjects += 1;
    linksCreated += await linkStateSubject(
      lr.project_id as string, "learning_item", lr.id as string,
      null, (lr.area as string | null) ?? null,
      "backfill",
    );
  }
  return { subjects, linksCreated };
}

export type EntityView = {
  entityType: "person" | "organization";
  entityId: string;
  entityName: string;
  items: Array<{
    subjectType: string;
    subjectId: string;
    relation: string;
    projectId: string;
    projectName: string | null;
    statement: string;
    itemKind: string;
    status: string;
  }>;
};

/** Everything (state items + learnings) linked to a given person/organization, across projects. */
export async function getEntityView(entityType: "person" | "organization", entityId: string): Promise<EntityView | null> {
  const sb = supabaseAdmin();
  const entityRes = entityType === "person"
    ? await sb.from("people").select("full_name").eq("id", entityId).maybeSingle()
    : await sb.from("organizations").select("name").eq("id", entityId).maybeSingle();
  if (!entityRes.data) return null;
  const entityName = ((entityRes.data as Record<string, unknown>).full_name ?? (entityRes.data as Record<string, unknown>).name ?? "Unknown") as string;

  const { data: links, error } = await sb
    .from("project_entity_links")
    .select("subject_type, subject_id, relation, project_id")
    .eq("entity_type", entityType).eq("entity_id", entityId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(`entity view read failed: ${error.message}`);

  const stateIds = (links ?? []).filter((l) => l.subject_type === "state_item").map((l) => l.subject_id as string);
  const learnIds = (links ?? []).filter((l) => l.subject_type === "learning_item").map((l) => l.subject_id as string);
  const projectIds = [...new Set((links ?? []).map((l) => l.project_id as string))];
  const [stateItems, learnItems, projects] = await Promise.all([
    stateIds.length ? sb.from("project_state_items").select("id, item_type, statement, status").in("id", stateIds) : Promise.resolve({ data: [] }),
    learnIds.length ? sb.from("project_learning_items").select("id, learning_type, title, status").in("id", learnIds) : Promise.resolve({ data: [] }),
    projectIds.length ? sb.from("projects").select("id, name").in("id", projectIds) : Promise.resolve({ data: [] }),
  ]);
  const stateById = new Map((stateItems.data ?? []).map((r: Record<string, unknown>) => [r.id as string, r]));
  const learnById = new Map((learnItems.data ?? []).map((r: Record<string, unknown>) => [r.id as string, r]));
  const projName = new Map((projects.data ?? []).map((r: Record<string, unknown>) => [r.id as string, r.name as string | null]));

  const itemsOut: EntityView["items"] = [];
  for (const l of links ?? []) {
    if (l.subject_type === "state_item") {
      const s = stateById.get(l.subject_id as string);
      if (!s) continue;
      itemsOut.push({ subjectType: "state_item", subjectId: l.subject_id as string, relation: l.relation as string, projectId: l.project_id as string, projectName: projName.get(l.project_id as string) ?? null, statement: (s.statement as string) ?? "", itemKind: (s.item_type as string) ?? "", status: (s.status as string) ?? "" });
    } else {
      const s = learnById.get(l.subject_id as string);
      if (!s) continue;
      itemsOut.push({ subjectType: "learning_item", subjectId: l.subject_id as string, relation: l.relation as string, projectId: l.project_id as string, projectName: projName.get(l.project_id as string) ?? null, statement: (s.title as string) ?? "", itemKind: (s.learning_type as string) ?? "", status: (s.status as string) ?? "" });
    }
  }
  return { entityType, entityId, entityName, items: itemsOut };
}
