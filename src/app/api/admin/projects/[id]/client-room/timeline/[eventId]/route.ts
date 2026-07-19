import { NextRequest, NextResponse } from "next/server";
import { adminGuardApi } from "@/lib/require-admin";
import { supabaseAdmin } from "@/lib/supabase";
import { resolveClientRoomProject } from "@/lib/client-room";

const KINDS = new Set(["meeting", "milestone", "document", "exchange"]);
const VISIBILITY = new Set(["internal", "client", "archived"]);

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string; eventId: string }> }) {
  const guard = await adminGuardApi();
  if (guard) return guard;
  const { id, eventId } = await ctx.params;
  const project = await resolveClientRoomProject(id);
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  let body: {
    title?: string; eventDate?: string; kind?: string; summary?: string;
    attendees?: unknown; location?: string; visibility?: string; sortOrder?: number;
  };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (typeof body.title === "string") {
    const title = body.title.trim();
    if (!title) return NextResponse.json({ error: "Title cannot be empty" }, { status: 400 });
    update.title = title;
  }
  if (typeof body.eventDate === "string") {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(body.eventDate.trim())) {
      return NextResponse.json({ error: "Invalid event date" }, { status: 400 });
    }
    update.event_date = body.eventDate.trim();
  }
  if (body.kind) {
    if (!KINDS.has(body.kind)) return NextResponse.json({ error: "Invalid kind" }, { status: 400 });
    update.kind = body.kind;
  }
  if (body.visibility) {
    if (!VISIBILITY.has(body.visibility)) return NextResponse.json({ error: "Invalid visibility" }, { status: 400 });
    update.visibility = body.visibility;
  }
  if (typeof body.summary === "string") update.summary = body.summary.trim() || null;
  if (typeof body.location === "string") update.location = body.location.trim() || null;
  if (Array.isArray(body.attendees)) update.attendees = body.attendees.map((v) => String(v).trim()).filter(Boolean);
  if (Number.isFinite(body.sortOrder)) update.sort_order = Number(body.sortOrder);

  const { data, error } = await supabaseAdmin()
    .from("project_timeline_events")
    .update(update)
    .eq("id", eventId)
    .eq("project_id", project.id)
    .select("*")
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 502 });
  if (!data) return NextResponse.json({ error: "Event not found" }, { status: 404 });
  return NextResponse.json({ ok: true, event: data });
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string; eventId: string }> }) {
  const guard = await adminGuardApi();
  if (guard) return guard;
  const { id, eventId } = await ctx.params;
  const project = await resolveClientRoomProject(id);
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  const { error } = await supabaseAdmin()
    .from("project_timeline_events")
    .delete()
    .eq("id", eventId)
    .eq("project_id", project.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 502 });
  return NextResponse.json({ ok: true });
}
