import { getSupabaseServerClient } from "./supabase-server";

/**
 * Resolve project display names from a set of project identifiers.
 *
 * Used by Hall surfaces to show explicit project context per item
 * ("Project: X" or "(sin proyecto)"). The owner's rule: every card must
 * disclose what project it belongs to — empty / duplicate-of-title is
 * not acceptable.
 *
 * Caller chooses the key type:
 *   - `projectIds` matches `projects.id` (UUID PK) — use for action_items
 *   - `projectNotionIds` matches `projects.notion_id` — use for evidence
 *     and any row keyed by the legacy Notion id during migration.
 *
 * Returns two maps so callers can look up by whichever key they have.
 * Missing rows are simply absent — callers should fall back to
 * `"(sin proyecto)"` for those.
 */
export async function resolveProjectNames(args: {
  projectIds?: string[];
  projectNotionIds?: string[];
}): Promise<{
  byId: Map<string, string>;
  byNotionId: Map<string, string>;
}> {
  const sb = getSupabaseServerClient();
  const ids = [...new Set((args.projectIds ?? []).filter(Boolean))];
  const notionIds = [...new Set((args.projectNotionIds ?? []).filter(Boolean))];

  const byId = new Map<string, string>();
  const byNotionId = new Map<string, string>();

  if (ids.length === 0 && notionIds.length === 0) return { byId, byNotionId };

  let query = sb.from("projects").select("id, notion_id, name");
  if (ids.length > 0 && notionIds.length > 0) {
    query = query.or(`id.in.(${ids.join(",")}),notion_id.in.(${notionIds.join(",")})`);
  } else if (ids.length > 0) {
    query = query.in("id", ids);
  } else {
    query = query.in("notion_id", notionIds);
  }

  const { data } = await query;
  for (const r of (data ?? []) as { id: string; notion_id: string | null; name: string }[]) {
    if (r.id) byId.set(r.id, r.name);
    if (r.notion_id) byNotionId.set(r.notion_id, r.name);
  }
  return { byId, byNotionId };
}

/** Standard label for items with no resolvable project. */
export const NO_PROJECT_LABEL = "(sin proyecto)";
