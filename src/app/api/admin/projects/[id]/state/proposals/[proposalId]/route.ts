import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "@clerk/nextjs/server";
import { adminGuardApi } from "@/lib/require-admin";
import { resolveClientRoomProject } from "@/lib/client-room";
import { acceptProposal, rejectProposal } from "@/lib/state-proposals";

/**
 * PATCH /api/admin/projects/[id]/state/proposals/[proposalId]
 * Body: { action: 'accept' | 'reject', note?: string }
 *
 * Accept applies the proposed change to project state and records a
 * 'system_refresh' revision. Reject marks it rejected. Both are idempotent
 * against a non-pending proposal (409).
 */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string; proposalId: string }> }) {
  const guard = await adminGuardApi();
  if (guard) return guard;
  const { id, proposalId } = await ctx.params;
  const project = await resolveClientRoomProject(id);
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  let body: { action?: string; note?: string };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  if (body.action !== "accept" && body.action !== "reject") {
    return NextResponse.json({ error: "action must be 'accept' or 'reject'" }, { status: 400 });
  }

  const user = await currentUser();
  const actor = user?.primaryEmailAddress?.emailAddress ?? user?.id ?? "unknown-admin";
  const note = typeof body.note === "string" ? body.note.trim() || null : null;

  const result = body.action === "accept"
    ? await acceptProposal(project.id, proposalId, actor)
    : await rejectProposal(project.id, proposalId, actor, note);

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ ok: true, action: body.action, kind: result.kind });
}
