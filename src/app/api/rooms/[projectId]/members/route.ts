import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { resolveClientRoomProject } from "@/lib/client-room";
import { can, logRoomEvent, resolveRoomActor } from "@/lib/project-roles";

/**
 * Miembros y roles de la sala. Ver el equipo: cualquier rol. Gestionar acceso: solo PM.
 * project_members es el backbone de la matriz y del scope "salas visibles".
 */

const ROLES = new Set(["pm", "collaborator", "client", "reader"]);

async function ctxFor(projectId: string) {
  const project = await resolveClientRoomProject(projectId);
  if (!project) return { error: NextResponse.json({ error: "Project not found" }, { status: 404 }) };
  const actor = await resolveRoomActor(project.id);
  if (!actor.role) return { error: NextResponse.json({ error: "Not a member of this room" }, { status: 403 }) };
  return { project, actor };
}

// ─── GET: ver el equipo ────────────────────────────────────────────────────
export async function GET(_req: NextRequest, c: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await c.params;
  const { project, actor, error } = await ctxFor(projectId);
  if (error) return error;
  if (!can(actor.role, "room.view")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { data, error: dbError } = await supabaseAdmin()
    .from("project_members")
    .select("id, person_id, user_email, role, revoked_at, created_at")
    .eq("project_id", project.id)
    .is("revoked_at", null)
    .order("created_at", { ascending: true });
  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 502 });
  return NextResponse.json({ ok: true, members: data });
}

// ─── POST: invitar / agregar miembro (solo PM) ─────────────────────────────
export async function POST(req: NextRequest, c: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await c.params;
  const { project, actor, error } = await ctxFor(projectId);
  if (error) return error;
  if (!can(actor.role, "member.manage")) return NextResponse.json({ error: "Solo el PM gestiona el acceso" }, { status: 403 });

  let body: Record<string, unknown>;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const role = typeof body.role === "string" ? body.role : "";
  if (!email) return NextResponse.json({ error: "An email is required" }, { status: 400 });
  if (!ROLES.has(role)) return NextResponse.json({ error: "Invalid role" }, { status: 400 });

  const db = supabaseAdmin();
  const { data: existing } = await db
    .from("project_members").select("id").eq("project_id", project.id).ilike("user_email", email).maybeSingle();

  let row;
  if (existing) {
    const { data, error: upErr } = await db.from("project_members")
      .update({ role, revoked_at: null, invited_by: actor.email }).eq("id", existing.id).select("*").single();
    if (upErr) return NextResponse.json({ error: upErr.message }, { status: 502 });
    row = data;
  } else {
    const { data, error: inErr } = await db.from("project_members")
      .insert({ project_id: project.id, user_email: email, person_id: typeof body.personId === "string" ? body.personId : null, role, invited_by: actor.email })
      .select("*").single();
    if (inErr) return NextResponse.json({ error: inErr.message }, { status: 502 });
    row = data;
  }

  await logRoomEvent({ projectId: project.id, actor, verb: "member_added", targetType: "member", targetId: row.id, summary: `Dio acceso a ${email} como ${role}`, payload: { email, role } });
  return NextResponse.json({ ok: true, member: row });
}

// ─── PATCH: cambiar rol / revocar acceso (solo PM) ─────────────────────────
export async function PATCH(req: NextRequest, c: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await c.params;
  const { project, actor, error } = await ctxFor(projectId);
  if (error) return error;
  if (!can(actor.role, "member.manage")) return NextResponse.json({ error: "Solo el PM gestiona el acceso" }, { status: 403 });

  let body: Record<string, unknown>;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const id = typeof body.id === "string" ? body.id : "";
  if (!id) return NextResponse.json({ error: "A member id is required" }, { status: 400 });

  const db = supabaseAdmin();
  const { data: current, error: readErr } = await db
    .from("project_members").select("*").eq("id", id).eq("project_id", project.id).single();
  if (readErr || !current) return NextResponse.json({ error: "Member not found" }, { status: 404 });

  if (body.revoke === true) {
    const { data, error: upErr } = await db.from("project_members").update({ revoked_at: new Date().toISOString() }).eq("id", id).select("*").single();
    if (upErr) return NextResponse.json({ error: upErr.message }, { status: 502 });
    await logRoomEvent({ projectId: project.id, actor, verb: "member_revoked", targetType: "member", targetId: id, summary: `Revocó el acceso de ${current.user_email}` });
    return NextResponse.json({ ok: true, member: data });
  }

  const role = typeof body.role === "string" ? body.role : "";
  if (!ROLES.has(role)) return NextResponse.json({ error: "Invalid role" }, { status: 400 });
  const { data, error: upErr } = await db.from("project_members").update({ role, revoked_at: null }).eq("id", id).select("*").single();
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 502 });
  await logRoomEvent({ projectId: project.id, actor, verb: "member_role_changed", targetType: "member", targetId: id, summary: `Cambió el rol de ${current.user_email} a ${role}`, payload: { from: current.role, to: role } });
  return NextResponse.json({ ok: true, member: data });
}
