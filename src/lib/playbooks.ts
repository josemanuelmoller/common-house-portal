/**
 * playbooks.ts — Supabase helpers for the Knowledge → Playbooks system.
 *
 * Server-only module. Do NOT import from "use client" components.
 *
 * Schema (see migration create_playbooks_system):
 *   - public.playbooks          — living markdown documents grouped by project_type
 *   - public.playbook_changelog — every curator action against a playbook (applied / proposed / rejected)
 *   - public.playbook_citations — when other agents read a playbook (drives reference_count)
 */

import { getSupabaseServerClient } from "./supabase-server";

export type PlaybookStatus = "Active" | "Stale" | "Archived";
export type ChangelogAction = "CREATED" | "APPEND" | "AMEND" | "SPLIT" | "IGNORE";
export type ChangelogStatus = "applied" | "proposed" | "rejected";

export type Playbook = {
  id: string;
  slug: string;
  title: string;
  project_type: string;
  summary: string;
  body_md: string;
  status: PlaybookStatus;
  reference_count: number;
  last_evidence_at: string | null;
  last_reviewed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type PlaybookChangelogEntry = {
  id: string;
  playbook_id: string;
  evidence_notion_id: string | null;
  action: ChangelogAction;
  section: string | null;
  diff_before: string | null;
  diff_after: string | null;
  reasoning: string;
  status: ChangelogStatus;
  applied_by: string;
  created_at: string;
  applied_at: string | null;
};

/** Fetch all playbooks (list view). Sorted by most-recently-touched first. */
export async function getAllPlaybooks(): Promise<Playbook[]> {
  const sb = getSupabaseServerClient();
  const { data, error } = await sb
    .from("playbooks")
    .select("*")
    .neq("status", "Archived")
    .order("updated_at", { ascending: false });
  if (error) {
    console.error("[playbooks] getAllPlaybooks:", error.message);
    return [];
  }
  return (data as Playbook[]) ?? [];
}

/** Fetch a single playbook by slug. Returns null if not found. */
export async function getPlaybookBySlug(slug: string): Promise<Playbook | null> {
  const sb = getSupabaseServerClient();
  const { data, error } = await sb
    .from("playbooks")
    .select("*")
    .eq("slug", slug)
    .maybeSingle();
  if (error) {
    console.error("[playbooks] getPlaybookBySlug:", error.message);
    return null;
  }
  return (data as Playbook) ?? null;
}

/** Fetch recent changelog entries for a playbook. Most recent first. */
export async function getPlaybookChangelog(
  playbookId: string,
  limit = 30,
): Promise<PlaybookChangelogEntry[]> {
  const sb = getSupabaseServerClient();
  const { data, error } = await sb
    .from("playbook_changelog")
    .select("*")
    .eq("playbook_id", playbookId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) {
    console.error("[playbooks] getPlaybookChangelog:", error.message);
    return [];
  }
  return (data as PlaybookChangelogEntry[]) ?? [];
}

/** Log a citation — when another agent/skill loads a playbook for context. */
export async function logPlaybookCitation(
  playbookId: string,
  citedBy: string,
  context?: string,
): Promise<void> {
  const sb = getSupabaseServerClient();
  const { error } = await sb.from("playbook_citations").insert({
    playbook_id: playbookId,
    cited_by: citedBy,
    context: context ?? null,
  });
  if (error) {
    console.error("[playbooks] logPlaybookCitation:", error.message);
  }
}

/** Append a changelog entry. Status defaults to "applied" — set to "proposed" for human-review path. */
export async function appendPlaybookChangelog(entry: {
  playbook_id: string;
  evidence_notion_id?: string | null;
  action: ChangelogAction;
  section?: string | null;
  diff_before?: string | null;
  diff_after?: string | null;
  reasoning: string;
  status?: ChangelogStatus;
  applied_by?: string;
}): Promise<void> {
  const sb = getSupabaseServerClient();
  const { error } = await sb.from("playbook_changelog").insert({
    playbook_id: entry.playbook_id,
    evidence_notion_id: entry.evidence_notion_id ?? null,
    action: entry.action,
    section: entry.section ?? null,
    diff_before: entry.diff_before ?? null,
    diff_after: entry.diff_after ?? null,
    reasoning: entry.reasoning,
    status: entry.status ?? "applied",
    applied_by: entry.applied_by ?? "agent:knowledge-curator",
    applied_at: entry.status === "proposed" ? null : new Date().toISOString(),
  });
  if (error) {
    console.error("[playbooks] appendPlaybookChangelog:", error.message);
    throw error;
  }
}

/** Overwrite body_md + bump last_evidence_at. Triggers updated_at automatically. */
export async function updatePlaybookBody(
  id: string,
  body_md: string,
  options?: { summary?: string; markEvidenceAt?: boolean },
): Promise<void> {
  const sb = getSupabaseServerClient();
  const patch: Record<string, unknown> = { body_md };
  if (options?.summary !== undefined) patch.summary = options.summary;
  if (options?.markEvidenceAt) patch.last_evidence_at = new Date().toISOString();

  const { error } = await sb.from("playbooks").update(patch).eq("id", id);
  if (error) {
    console.error("[playbooks] updatePlaybookBody:", error.message);
    throw error;
  }
}

/** Mark as reviewed by human — resets the "stale" clock. */
export async function markPlaybookReviewed(id: string): Promise<void> {
  const sb = getSupabaseServerClient();
  const { error } = await sb
    .from("playbooks")
    .update({ last_reviewed_at: new Date().toISOString() })
    .eq("id", id);
  if (error) {
    console.error("[playbooks] markPlaybookReviewed:", error.message);
  }
}

/** List of valid project_type values the curator is allowed to classify into.
 *  Adding a new type requires first seeding a stub playbook with that project_type. */
export async function listProjectTypes(): Promise<string[]> {
  const sb = getSupabaseServerClient();
  const { data, error } = await sb
    .from("playbooks")
    .select("project_type")
    .neq("status", "Archived");
  if (error || !data) return [];
  return [...new Set(data.map(r => r.project_type as string))];
}
