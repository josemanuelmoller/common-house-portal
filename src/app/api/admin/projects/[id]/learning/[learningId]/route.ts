import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "@clerk/nextjs/server";
import { adminGuardApi } from "@/lib/require-admin";
import { supabaseAdmin } from "@/lib/supabase";
import { resolveClientRoomProject } from "@/lib/client-room";

const STATUSES = new Set(["observed", "review", "promoted", "rejected", "stale"]);
const TRANSFERABILITY = new Set(["project", "candidate", "confirmed"]);

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string; learningId: string }> }) {
  const guard = await adminGuardApi();
  if (guard) return guard;
  const { id, learningId } = await ctx.params;
  const project = await resolveClientRoomProject(id);
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });
  let body: { status?: string; transferability?: string; staleAfter?: string };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.status) {
    if (!STATUSES.has(body.status)) return NextResponse.json({ error: "Invalid learning status" }, { status: 400 });
    update.status = body.status;
  }
  if (body.transferability) {
    if (!TRANSFERABILITY.has(body.transferability)) return NextResponse.json({ error: "Invalid transferability" }, { status: 400 });
    update.transferability = body.transferability;
  }
  if (typeof body.staleAfter === "string") update.stale_after = body.staleAfter || null;
  const user = await currentUser();
  update.updated_by = user?.primaryEmailAddress?.emailAddress ?? user?.id ?? "unknown-admin";
  const { data, error } = await supabaseAdmin().from("project_learning_items")
    .update(update).eq("id", learningId).eq("project_id", project.id).select("*").maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 502 });
  if (!data) return NextResponse.json({ error: "Learning item not found" }, { status: 404 });
  return NextResponse.json({ ok: true, learning: data });
}
