import "server-only";

import { supabaseAdmin } from "@/lib/supabase";
import { resolveClientRoomProject } from "@/lib/client-room";
import { getLinksForSubjects, type LinkedEntity } from "@/lib/entity-links";

export type ProjectState = {
  projectId: string;
  currentSummary: string | null;
  currentPhase: string | null;
  currentFocus: string | null;
  health: "on_track" | "watch" | "blocked" | "paused" | "unknown";
  confidence: number;
  nextCheckInAt: string | null;
  lastSourceAt: string | null;
  lastStateChangeAt: string | null;
  staleAfter: string | null;
  stateStatus: "draft" | "current" | "stale" | "archived";
  updatedAt: string;
};

export type ProjectStateItem = {
  id: string;
  itemType: string;
  statement: string;
  status: string;
  ownerLabel: string | null;
  stakeholderLabel: string | null;
  sourceRefs: string[];
  confidence: number;
  dueAt: string | null;
  lastConfirmedAt: string | null;
  staleAfter: string | null;
  resolutionNote: string | null;
  visibility: string;
  updatedAt: string;
  linkedEntities: LinkedEntity[];
};

export type ProjectLearningItem = {
  id: string;
  learningType: string;
  area: string | null;
  title: string;
  observation: string;
  implication: string | null;
  status: string;
  transferability: string;
  confidence: number;
  sourceRefs: string[];
  lastSeenAt: string | null;
  staleAfter: string | null;
  updatedAt: string;
};

export type ProjectStateView = {
  projectId: string;
  projectName: string;
  organizationId: string | null;
  state: ProjectState | null;
  items: ProjectStateItem[];
  learnings: ProjectLearningItem[];
};

function stringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

export async function getProjectStateView(identifier: string): Promise<ProjectStateView | null> {
  const project = await resolveClientRoomProject(identifier);
  if (!project) return null;
  const sb = supabaseAdmin();
  const [stateResult, itemResult, learningResult] = await Promise.all([
    sb.from("project_states").select("*").eq("project_id", project.id).maybeSingle(),
    sb.from("project_state_items")
      .select("id, item_type, statement, status, owner_label, stakeholder_label, source_refs, confidence, due_at, last_confirmed_at, stale_after, resolution_note, visibility, updated_at")
      .eq("project_id", project.id)
      .order("updated_at", { ascending: false }),
    sb.from("project_learning_items")
      .select("id, learning_type, area, title, observation, implication, status, transferability, confidence, source_refs, last_seen_at, stale_after, updated_at")
      .eq("project_id", project.id)
      .order("updated_at", { ascending: false }),
  ]);
  if (stateResult.error) throw new Error(`project state read failed: ${stateResult.error.message}`);
  if (itemResult.error) throw new Error(`project state items read failed: ${itemResult.error.message}`);
  if (learningResult.error) throw new Error(`project learning read failed: ${learningResult.error.message}`);

  const row = stateResult.data;
  const state: ProjectState | null = row ? {
    projectId: row.project_id as string,
    currentSummary: (row.current_summary as string | null) ?? null,
    currentPhase: (row.current_phase as string | null) ?? null,
    currentFocus: (row.current_focus as string | null) ?? null,
    health: row.health as ProjectState["health"],
    confidence: row.confidence as number,
    nextCheckInAt: (row.next_check_in_at as string | null) ?? null,
    lastSourceAt: (row.last_source_at as string | null) ?? null,
    lastStateChangeAt: (row.last_state_change_at as string | null) ?? null,
    staleAfter: (row.stale_after as string | null) ?? null,
    stateStatus: row.state_status as ProjectState["stateStatus"],
    updatedAt: row.updated_at as string,
  } : null;

  const itemRows = itemResult.data ?? [];
  const linksBySubject = await getLinksForSubjects(itemRows.map((r) => r.id as string));

  return {
    projectId: project.id,
    projectName: project.name ?? "Untitled project",
    organizationId: project.organization_id,
    state,
    items: itemRows.map((item) => ({
      id: item.id as string,
      itemType: item.item_type as string,
      statement: item.statement as string,
      status: item.status as string,
      ownerLabel: (item.owner_label as string | null) ?? null,
      stakeholderLabel: (item.stakeholder_label as string | null) ?? null,
      sourceRefs: stringArray(item.source_refs),
      confidence: item.confidence as number,
      dueAt: (item.due_at as string | null) ?? null,
      lastConfirmedAt: (item.last_confirmed_at as string | null) ?? null,
      staleAfter: (item.stale_after as string | null) ?? null,
      resolutionNote: (item.resolution_note as string | null) ?? null,
      visibility: item.visibility as string,
      updatedAt: item.updated_at as string,
      linkedEntities: linksBySubject.get(item.id as string) ?? [],
    })),
    learnings: (learningResult.data ?? []).map((item) => ({
      id: item.id as string,
      learningType: item.learning_type as string,
      area: (item.area as string | null) ?? null,
      title: item.title as string,
      observation: item.observation as string,
      implication: (item.implication as string | null) ?? null,
      status: item.status as string,
      transferability: item.transferability as string,
      confidence: item.confidence as number,
      sourceRefs: stringArray(item.source_refs),
      lastSeenAt: (item.last_seen_at as string | null) ?? null,
      staleAfter: (item.stale_after as string | null) ?? null,
      updatedAt: item.updated_at as string,
    })),
  };
}
