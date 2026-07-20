/**
 * /api/projects/[id]/hall-draft
 *
 * PATCH  → save admin edits to hall_draft (still pending_review). The body
 *          replaces the entire hall_draft JSONB; the client component is the
 *          source of truth for the edited state.
 *
 * DELETE → discard the draft (clear hall_draft, set status='discarded').
 *
 * Auth: adminGuardApi.
 *
 * Live hall_hero is NEVER touched by this route. Publish lives separately at
 * /api/projects/[id]/publish-hall-draft.
 */
import { NextRequest, NextResponse } from "next/server";
import { adminGuardApi } from "@/lib/require-admin";
import { getSupabaseServerClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const keyCol = (id: string) => (UUID_RE.test(id) ? "id" : "notion_id");

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const guard = await adminGuardApi();
  if (guard) return guard;

  const { id } = await ctx.params;
  let body: { draft?: unknown } = {};
  try { body = await req.json(); } catch { /* fallthrough */ }
  if (!body?.draft || typeof body.draft !== "object") {
    return NextResponse.json({ ok: false, error: "draft required" }, { status: 400 });
  }

  const sb = getSupabaseServerClient();
  const { error } = await sb
    .from("projects")
    .update({
      hall_draft:        body.draft,
      hall_draft_status: "pending_review",
      updated_at:        new Date().toISOString(),
    })
    .eq(keyCol(id), id);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const guard = await adminGuardApi();
  if (guard) return guard;

  const { id } = await ctx.params;

  const sb = getSupabaseServerClient();
  const { error } = await sb
    .from("projects")
    .update({
      hall_draft:        null,
      hall_draft_status: "discarded",
      updated_at:        new Date().toISOString(),
    })
    .eq(keyCol(id), id);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
