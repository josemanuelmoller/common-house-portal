/**
 * project-roles.ts — Helper to classify projects by the user's role.
 *
 * Three levels, stored on CH Projects [OS v2]."Management Level":
 *   operational   Jose leads day-to-day. All actionable items pass through
 *                 to action_items.
 *   mentorship    Jose advises but does not lead. Only items where Jose is
 *                 the EXPLICIT named actor (actor="jose") pass. Items owned
 *                 by counterparties do NOT land on Jose's desk — those are
 *                 the project-lead's job to chase.
 *   observer      Jose is aware but has no role. No action_items emitted.
 *                 Conversations + RelationshipSignals still recorded.
 *
 * Default when field is empty: "operational" — backward-compatible; Jose
 * opts out per-project via the /admin/settings/project-roles UI.
 */

import { notion, DB } from "@/lib/notion/core";

export type ManagementLevel = "operational" | "mentorship" | "observer";

type NotionProjectRole = {
  notion_id: string;
  name: string;
  level: ManagementLevel;
};

/** Default when the field is not set. Conservative: treat as operational. */
export const DEFAULT_MANAGEMENT_LEVEL: ManagementLevel = "operational";

/**
 * Fetch Management Level for all active projects. Ingestors call this
 * once per run and cache the map. Takes ~1 Notion query.
 */
export async function loadProjectRoles(): Promise<Map<string, ManagementLevel>> {
  const out = new Map<string, ManagementLevel>();
  let cursor: string | undefined;
  do {
    const res: {
      results: Array<{ id: string; properties: Record<string, unknown> }>;
      has_more: boolean;
      next_cursor: string | null;
    } = await (notion.databases as unknown as {
      query: (args: unknown) => Promise<{
        results: Array<{ id: string; properties: Record<string, unknown> }>;
        has_more: boolean;
        next_cursor: string | null;
      }>;
    }).query({
      database_id: DB.projects,
      page_size: 100,
      start_cursor: cursor,
      // Include Proposed + Active + Paused — items with non-active projects
      // might still appear in evidence/loops and we want deterministic filtering.
    });
    for (const p of res.results) {
      const props = p.properties as Record<string, unknown>;
      const level = extractSelect(props["Management Level"]);
      out.set(p.id, normalizeLevel(level));
    }
    cursor = res.has_more ? (res.next_cursor ?? undefined) : undefined;
  } while (cursor);
  return out;
}

function extractSelect(prop: unknown): string | null {
  if (!prop || typeof prop !== "object") return null;
  const p = prop as { select?: { name?: string } | null };
  return p.select?.name ?? null;
}

function normalizeLevel(s: string | null): ManagementLevel {
  if (s === "operational" || s === "mentorship" || s === "observer") return s;
  return DEFAULT_MANAGEMENT_LEVEL;
}

/**
 * Apply the management-level rule to an action candidate.
 *
 * Returns `true` when the candidate should be emitted as an ActionSignal.
 * Returns `false` when it should be skipped (still write evidence /
 * relationship signals upstream — this only gates the action layer).
 *
 * `actorIsSelf` means Jose is the EXPLICIT named actor on the underlying
 * evidence (or the loop is `founder_owned`). For Gmail/Calendar where the
 * project context is implicit (or missing), pass `true` so they always
 * pass — those ingestors don't have a specific project to gate on.
 */
export function passesManagementGate(params: {
  projectNotionId: string | null | undefined;
  roles: Map<string, ManagementLevel>;
  actorIsSelf: boolean;
}): { pass: boolean; reason: string } {
  if (!params.projectNotionId) {
    // No project context → can't gate; let it through. Orphan items flow
    // through, and the dedup_key / priority_score logic downstream still applies.
    return { pass: true, reason: "no_project_context" };
  }
  const level = params.roles.get(params.projectNotionId) ?? DEFAULT_MANAGEMENT_LEVEL;
  switch (level) {
    case "operational":
      return { pass: true, reason: "operational" };
    case "mentorship":
      return params.actorIsSelf
        ? { pass: true, reason: "mentorship_explicit_self" }
        : { pass: false, reason: "mentorship_not_self" };
    case "observer":
      return { pass: false, reason: "observer" };
    default:
      return { pass: true, reason: "default_operational" };
  }
}
