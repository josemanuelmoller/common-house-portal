/**
 * DELETE /api/admin/projects/[id]/roles/[roleId]
 *   — end an organization's participation in a project (non-destructive:
 *     sets ended_at + participation_status='completed', keeps history).
 *
 * Auth: adminGuardApi().
 */

import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api-error";
import { currentUser } from "@clerk/nextjs/server";
import { adminGuardApi } from "@/lib/require-admin";
import { endProjectOrgRole } from "@/lib/relational-model";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string; roleId: string }> }
) {
  const guard = await adminGuardApi();
  if (guard) return guard;
  const { roleId } = await ctx.params;
  if (!roleId) return NextResponse.json({ error: "roleId required" }, { status: 400 });

  const user = await currentUser();
  const actor = user?.primaryEmailAddress?.emailAddress ?? user?.id ?? "admin";

  try {
    await endProjectOrgRole(roleId, actor);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return apiError(e, { route: "[/api/admin/projects/[id]/roles/[roleId]]", status: 502 });
  }
}
