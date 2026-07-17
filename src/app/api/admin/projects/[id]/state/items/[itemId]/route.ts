import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "@clerk/nextjs/server";
import { adminGuardApi } from "@/lib/require-admin";
import { supabaseAdmin } from "@/lib/supabase";
import { resolveClientRoomProject } from "@/lib/client-room";

const STATUSES = new Set(["active", "resolved", "superseded", "unknown", "expired"]);

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string; itemId: string }> }) {
  const guard = await adminGuardApi();
  if (guard) return guard;
  const { id, itemId } = await ctx.params;
  const project = await resolveClientRoomProject(id);
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });
  let body: { status?: string; resolutionNote?: string; lastConfirmedAt?: string; staleAfter?: string };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.status) {
    if (!STATUSES.has(body.status)) return NextResponse.json({ error: "Invalid item status" }, { status: 400 });
    update.status = body.status;
  }
  if (typeof body.resolutionNote === "string") update.resolution_note = body.resolutionNote.trim() || null;
  if (typeof body.lastConfirmedAt === "string") update.last_confirmed_at = body.lastConfirmedAt || null;
  if (typeof body.staleAfter === "string") update.stale_after = body.staleAfter || null;
  const user = await currentUser();
  update.updated_by = user?.primaryEmailAddress?.emailAddress ?? user?.id ?? "unknown-admin";
  const { data, error } = await supabaseAdmin().from("project_state_items")
    .update(update).eq("id", itemId).eq("project_id", project.id).select("*").maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 502 });
  if (!data) return NextResponse.json({ error: "State item not found" }, { status: 404 });
  return NextResponse.json({ ok: true, item: data });
}
