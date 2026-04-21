import { NextRequest, NextResponse } from "next/server";
import { adminGuardApi } from "@/lib/require-admin";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { currentUser } from "@clerk/nextjs/server";

/**
 * G3 — Commitment mark-done write-back.
 *
 * PATCH  /api/hall/commitments/[id]   → mark done (insert into hall_commitment_dismissals)
 * DELETE /api/hall/commitments/[id]   → undo (remove the dismissal)
 *
 * id is the evidence notion_id. This is the persistent analogue to the
 * localStorage cache in HallCommitmentLedgerRows — it survives device
 * switches and tab refreshes.
 */

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(_req: NextRequest, ctx: Ctx) {
  const guard = await adminGuardApi();
  if (guard) return guard;

  const { id } = await ctx.params;
  if (!id || id.length < 8) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  const user = await currentUser();
  const by = user?.emailAddresses?.[0]?.emailAddress ?? user?.id ?? null;

  const sb = getSupabaseServerClient();
  const { error } = await sb
    .from("hall_commitment_dismissals")
    .upsert({
      notion_id:    id,
      dismissed_at: new Date().toISOString(),
      dismissed_by: by,
    }, { onConflict: "notion_id" });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const guard = await adminGuardApi();
  if (guard) return guard;

  const { id } = await ctx.params;
  if (!id || id.length < 8) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  const sb = getSupabaseServerClient();
  const { error } = await sb
    .from("hall_commitment_dismissals")
    .delete()
    .eq("notion_id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
