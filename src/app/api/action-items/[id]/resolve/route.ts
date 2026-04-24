/**
 * POST /api/action-items/:id/resolve
 *
 * Close an open action_items row from a surface (Hall Inbox, Commitments,
 * CoS Desk). Surfaces never mutate the layer directly — they call this.
 *
 * Body:
 *   { "reason": "manual_done" | "manual_dismiss" }
 *
 * Auth: adminGuardApi() — Jose / admins only.
 *
 * See docs/NORMALIZATION_ARCHITECTURE.md §10 (lifecycle) and §14 (security).
 */

import { NextRequest, NextResponse } from "next/server";
import { adminGuardApi } from "@/lib/require-admin";
import { resolveActionItem, isValidResolutionReason } from "@/lib/action-items";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const guard = await adminGuardApi();
  if (guard) return guard;

  const { id } = await ctx.params;
  if (!id || typeof id !== "string" || id.length < 8) {
    return NextResponse.json({ ok: false, error: "invalid id" }, { status: 400 });
  }

  let body: { reason?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid json body" }, { status: 400 });
  }

  const reason = body.reason;
  if (!reason || !isValidResolutionReason(reason)) {
    return NextResponse.json(
      { ok: false, error: "reason must be manual_done or manual_dismiss" },
      { status: 400 }
    );
  }

  const result = await resolveActionItem({ id, reason });
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
