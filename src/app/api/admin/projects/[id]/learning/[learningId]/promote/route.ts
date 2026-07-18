import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "@clerk/nextjs/server";
import { adminGuardApi } from "@/lib/require-admin";
import { resolveClientRoomProject } from "@/lib/client-room";
import { promoteLearning } from "@/lib/learning-promotion";

/**
 * POST /api/admin/projects/[id]/learning/[learningId]/promote
 * Promote a reviewed, source-backed learning to a knowledge asset (new, or
 * appended to { targetAssetId }). Guarded + atomic in the RPC.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string; learningId: string }> }) {
  const guard = await adminGuardApi();
  if (guard) return guard;
  const { id, learningId } = await ctx.params;
  const project = await resolveClientRoomProject(id);
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  let body: { targetAssetId?: string } = {};
  try {
    const text = await req.text();
    if (text) body = JSON.parse(text);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const user = await currentUser();
  const actor = user?.primaryEmailAddress?.emailAddress ?? user?.id ?? "unknown-admin";
  const result = await promoteLearning(project.id, learningId, actor, body.targetAssetId ?? null);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ ok: true, assetId: result.assetId, assetTitle: result.assetTitle });
}
