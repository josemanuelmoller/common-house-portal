import { NextRequest, NextResponse } from "next/server";
import { adminGuardApi } from "@/lib/require-admin";
import { supabaseAdmin } from "@/lib/supabase";
import { resolveClientRoomProject } from "@/lib/client-room";

const KINDS = new Set(["meeting", "milestone", "document", "exchange"]);
const VISIBILITY = new Set(["internal", "client", "archived"]);

function cleanAttendees(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((v) => String(v).trim()).filter(Boolean);
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = await adminGuardApi();
  if (guard) return guard;
  const { id } = await ctx.params;
  const project = await resolveClientRoomProject(id);
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  let body: {
    title?: string; eventDate?: string; kind?: string; summary?: string;
    attendees?: unknown; location?: string; visibility?: string; sortOrder?: number;
  };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const title = (body.title ?? "").trim();
  if (!title) return NextResponse.json({ error: "Title is required" }, { status: 400 });
  const eventDate = (body.eventDate ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(eventDate)) {
    return NextResponse.json({ error: "Valid event date (YYYY-MM-DD) is required" }, { status: 400 });
  }
  const kind = body.kind && KINDS.has(body.kind) ? body.kind : "milestone";
  const visibility = body.visibility && VISIBILITY.has(body.visibility) ? body.visibility : "internal";

  const insert = {
    project_id: project.id,
    event_date: eventDate,
    kind,
    title,
    summary: typeof body.summary === "string" ? body.summary.trim() || null : null,
    attendees: cleanAttendees(body.attendees),
    location: typeof body.location === "string" ? body.location.trim() || null : null,
    visibility,
    sort_order: Number.isFinite(body.sortOrder) ? Number(body.sortOrder) : 0,
    added_by: "admin",
  };

  const { data, error } = await supabaseAdmin()
    .from("project_timeline_events")
    .insert(insert)
    .select("*")
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 502 });
  return NextResponse.json({ ok: true, event: data });
}
