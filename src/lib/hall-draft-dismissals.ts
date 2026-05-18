import { getSupabaseServerClient } from "./supabase-server";

/**
 * Returns the set of draft notion_ids that the given user has permanently
 * dismissed from the Ready-For-Jose section. Used by server components to
 * filter out dismissed drafts before render.
 *
 * The dismissals are forever — they only lose effect when the underlying
 * draft is deleted/superseded server-side. There is no TTL.
 */
export async function getDismissedDraftIds(userId: string | null): Promise<Set<string>> {
  if (!userId) return new Set();
  const sb = getSupabaseServerClient();
  const { data, error } = await sb
    .from("hall_draft_dismissals")
    .select("draft_notion_id")
    .eq("user_id", userId);
  if (error || !data) return new Set();
  return new Set(data.map(r => (r as { draft_notion_id: string }).draft_notion_id));
}
