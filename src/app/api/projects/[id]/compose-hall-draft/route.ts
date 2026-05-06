/**
 * POST /api/projects/[id]/compose-hall-draft
 *
 * Generates a fresh hall_draft JSONB for the project from its conversational
 * footprint. Proposal-first — never publishes. Admin reviews at
 * /admin/projects/[id]/hall-compose then clicks Publish to make it live.
 *
 * Auth: adminGuardApi (user-triggered).
 *
 * Returns:
 *   { ok: true, draft, sources_used }  on success
 *   { ok: false, error }                 with 4xx/5xx
 */
import { NextRequest, NextResponse } from "next/server";
import { adminGuardApi } from "@/lib/require-admin";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { composeHallDraft } from "@/lib/hall-compose";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 90;

export async function POST(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const guard = await adminGuardApi();
  if (guard) return guard;

  const { id } = await ctx.params;
  if (!id) {
    return NextResponse.json({ ok: false, error: "missing project id" }, { status: 400 });
  }

  const sb = getSupabaseServerClient();
  const result = await composeHallDraft(sb, id);

  if (!result.ok) {
    const status = result.error.includes("not found") ? 404
                 : result.error.includes("no source material") ? 400
                 : 500;
    return NextResponse.json(result, { status });
  }
  return NextResponse.json(result);
}
