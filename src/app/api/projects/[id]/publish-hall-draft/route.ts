/**
 * POST /api/projects/[id]/publish-hall-draft
 *
 * Promotes a reviewed draft to the live hero. Two writes:
 *   1) hall_hero = body.draft  (or whatever is in hall_draft if no body)
 *   2) flat hall_* text columns mirrored from draft.hall_text (so legacy
 *      consumers that read columns directly stay correct)
 *
 * Status transitions to 'published'. hall_draft is preserved (so the admin can
 * see what was last published — useful for diffing).
 *
 * Auth: adminGuardApi.
 */
import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { adminGuardApi } from "@/lib/require-admin";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import type { HallDraft } from "@/lib/hall-compose";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const guard = await adminGuardApi();
  if (guard) return guard;

  const { id } = await ctx.params;

  // Body draft is preferred (admin's edited version). Falls back to whatever
  // is already in hall_draft if no body — defensive.
  let bodyDraft: HallDraft | null = null;
  try {
    const body = await req.json();
    if (body?.draft && typeof body.draft === "object") bodyDraft = body.draft as HallDraft;
  } catch { /* no body — use stored draft */ }

  const sb = getSupabaseServerClient();
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const { data: proj } = await sb
    .from("projects")
    .select("id")
    .eq(UUID_RE.test(id) ? "id" : "notion_id", id)
    .maybeSingle();
  if (!proj) return NextResponse.json({ ok: false, error: "project not found" }, { status: 404 });
  const projId = proj.id as string;

  let draftToPublish: HallDraft | null = bodyDraft;

  if (!draftToPublish) {
    const { data: row } = await sb
      .from("projects")
      .select("hall_draft")
      .eq("id", projId)
      .maybeSingle();
    draftToPublish = (row?.hall_draft as HallDraft | null) ?? null;
  }

  if (!draftToPublish) {
    return NextResponse.json({ ok: false, error: "no draft to publish" }, { status: 400 });
  }

  const ht = draftToPublish.hall_text ?? {
    welcome_note: null, current_focus: null, next_milestone: null,
    challenge: null, matters_most: null, obstacles: null, success: null,
  };

  const nowIso = new Date().toISOString();
  const { error } = await sb
    .from("projects")
    .update({
      hall_hero:           draftToPublish,
      hall_draft:          draftToPublish,           // keep for diff/history
      hall_draft_status:   "published",
      hall_published_at:   nowIso,
      hall_welcome_note:   ht.welcome_note,
      hall_current_focus:  ht.current_focus,
      hall_next_milestone: ht.next_milestone,
      hall_challenge:      ht.challenge,
      hall_matters_most:   ht.matters_most,
      hall_obstacles:      ht.obstacles,
      hall_success:        ht.success,
      updated_at:          nowIso,
    })
    .eq("id", projId);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  // Bust the Hall page cache so the new hero shows immediately.
  revalidatePath(`/hall/${id}`);
  revalidatePath(`/admin/projects/${id}`);
  revalidatePath(`/admin/projects/${id}/hall-compose`);

  return NextResponse.json({ ok: true, published_at: nowIso });
}
