/**
 * POST /api/agent-drafts/dismiss
 * Body: { draftId: string }   // notion page id of the draft
 *
 * Permanently dismisses an agent draft card from the Ready-For-Jose section
 * for the current user. Writes to hall_draft_dismissals keyed by
 * (draft_notion_id, user_id). The admin page reads this table and filters
 * matching drafts out before rendering.
 *
 * Replaces the previous localStorage-only mechanism (24h TTL, lost on
 * browser switch) so a dismiss sticks forever across devices (B-005 audit).
 */

import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "@clerk/nextjs/server";
import { adminGuardApi } from "@/lib/require-admin";
import { getSupabaseServerClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const guard = await adminGuardApi();
  if (guard) return guard;

  const user = await currentUser();
  const userId = user?.id;
  const email = user?.primaryEmailAddress?.emailAddress ?? null;
  if (!userId) return NextResponse.json({ error: "no_user" }, { status: 400 });

  const { draftId } = await req.json().catch(() => ({ draftId: null }));
  if (!draftId || typeof draftId !== "string") {
    return NextResponse.json({ error: "draftId_required" }, { status: 400 });
  }

  const sb = getSupabaseServerClient();
  const { error } = await sb
    .from("hall_draft_dismissals")
    .upsert(
      { draft_notion_id: draftId, user_id: userId, dismissed_at: new Date().toISOString(), dismissed_by: email },
      { onConflict: "draft_notion_id,user_id" },
    );

  if (error) return NextResponse.json({ error: "db", message: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
