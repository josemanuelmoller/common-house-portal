import { NextRequest, NextResponse } from "next/server";
import { adminGuardApi } from "@/lib/require-admin";
import { supabaseAdmin } from "@/lib/supabase";
import { resolveClientRoomProject } from "@/lib/client-room";

const ROOM_STATUSES = new Set(["preparing", "shared", "active", "complete", "archived"]);

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = await adminGuardApi();
  if (guard) return guard;
  const { id } = await ctx.params;
  const project = await resolveClientRoomProject(id);
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  let body: Record<string, unknown>;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const update: Record<string, unknown> = {};
  if (typeof body.enabled === "boolean") update.client_room_enabled = body.enabled;
  if (typeof body.label === "string") update.client_room_label = body.label.trim() || null;
  if (typeof body.status === "string") {
    if (!ROOM_STATUSES.has(body.status)) return NextResponse.json({ error: "Invalid room status" }, { status: 400 });
    update.client_room_status = body.status;
  }
  if (typeof body.slug === "string") {
    const slug = body.slug.trim().toLowerCase();
    if (!/^[a-z0-9][a-z0-9-]{0,62}$/.test(slug)) {
      return NextResponse.json({ error: "Slug must be lowercase letters, numbers and hyphens" }, { status: 400 });
    }
    update.hall_slug = slug;
  }
  if (typeof body.driveFolderId === "string") update.drive_folder_id = body.driveFolderId.trim() || null;
  if (typeof body.driveFolderUrl === "string") update.drive_folder_url = body.driveFolderUrl.trim() || null;
  if (Object.keys(update).length === 0) return NextResponse.json({ error: "No supported fields" }, { status: 400 });
  update.updated_at = new Date().toISOString();

  const { data, error } = await supabaseAdmin()
    .from("projects")
    .update(update)
    .eq("id", project.id)
    .select("id, hall_slug, client_room_enabled, client_room_status, client_room_label, drive_folder_id, drive_folder_url")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 502 });
  return NextResponse.json({ ok: true, project: data });
}
