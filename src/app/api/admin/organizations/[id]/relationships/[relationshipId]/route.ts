/**
 * DELETE /api/admin/organizations/[id]/relationships/[relationshipId]
 *   — end (close) a durable relationship. Non-destructive: sets ended_at + logs an event.
 *     History is preserved; the same type can be reopened later via POST.
 *
 * Auth: adminGuardApi() (mandatory per AGENTS.md API auth rules).
 */

import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api-error";
import { currentUser } from "@clerk/nextjs/server";
import { adminGuardApi } from "@/lib/require-admin";
import { endOrgRelationship } from "@/lib/relational-model";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function DELETE(
  req: NextRequest,
  ctx: { params: Promise<{ id: string; relationshipId: string }> }
) {
  const guard = await adminGuardApi();
  if (guard) return guard;

  const { relationshipId } = await ctx.params;
  if (!relationshipId) {
    return NextResponse.json({ error: "relationshipId required" }, { status: 400 });
  }

  let reason: string | undefined;
  try {
    const body = (await req.json().catch(() => ({}))) as { reason?: unknown };
    if (typeof body.reason === "string" && body.reason.trim()) reason = body.reason.trim();
  } catch {
    /* no body is fine */
  }

  const user = await currentUser();
  const actor = user?.primaryEmailAddress?.emailAddress ?? user?.id ?? "admin";

  try {
    await endOrgRelationship(relationshipId, actor, reason);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return apiError(e, { route: "[/api/admin/organizations/[id]/relationships/[relationshipId]]", status: 502 });
  }
}
