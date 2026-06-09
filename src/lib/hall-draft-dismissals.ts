/**
 * Reader for `public.hall_draft_dismissals` — the server-side filter that
 * makes Ready-for-Jose dismisses permanent across browsers and sessions.
 * Used by /admin/page.tsx to drop dismissed drafts before passing them to
 * <ReadyForJoseSection>. See L-011 / L-013 in tasks/lessons.md.
 */

import { getSupabaseServerClient } from "@/lib/supabase-server";

/** Returns the set of draft notion_ids the given user has dismissed. */
export async function getDismissedDraftIds(userId: string): Promise<Set<string>> {
  const ids = new Set<string>();
  if (!userId) return ids;
  try {
    const sb = getSupabaseServerClient();
    const { data } = await sb
      .from("hall_draft_dismissals")
      .select("draft_notion_id")
      .eq("user_id", userId);
    for (const r of (data ?? []) as { draft_notion_id: string }[]) {
      if (r.draft_notion_id) ids.add(r.draft_notion_id);
    }
  } catch {
    // best-effort — caller will fall back to empty Set and one dismissed
    // draft may reappear once. Far better than crashing /admin.
  }
  return ids;
}
