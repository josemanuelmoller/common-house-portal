import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { resolveClientRoomProject } from "@/lib/client-room";
import { requireSameOriginRequest } from "@/lib/require-same-origin";
import { can, logRoomEvent, resolveRoomActor } from "@/lib/project-roles";

/**
 * Materiales de la sala (project_materials).
 * Ver: todos, pero quien no tiene internal.view sólo ve lo marcado como visible
 * para el cliente. Descargar: pm/colaborador/cliente. Al Lector se le OMITE la
 * url (ve la lista pero no puede bajar) — enforce a nivel de datos, no solo UI.
 * Subir: material.upload (pm/colaborador), siempre a visibilidad interna: pasar
 * algo a client-visible es una decisión de divulgación aparte.
 */

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_BYTES = 25 * 1024 * 1024;
const EXT: Record<string, string> = {
  "application/pdf": "pdf",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
};
const CATEGORIES = new Set([
  "plan_timeline", "deliverable", "presentation", "manual", "working_document",
  "contract_agreement", "proposal_budget", "purchase_order", "invoice", "multimedia", "other",
]);

async function ctxFor(projectId: string) {
  const project = await resolveClientRoomProject(projectId);
  if (!project) return { error: NextResponse.json({ error: "Project not found" }, { status: 404 }) };
  const actor = await resolveRoomActor(project.id);
  if (!actor.role) return { error: NextResponse.json({ error: "Not a member of this room" }, { status: 403 }) };
  return { project, actor };
}

export async function GET(_req: NextRequest, c: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await c.params;
  const { project, actor, error } = await ctxFor(projectId);
  if (error) return error;
  if (!can(actor.role, "material.view")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let query = supabaseAdmin()
    .from("project_materials")
    .select("id, title, url, mime_type, category, folder_name, visibility, modified_at")
    .eq("project_id", project.id);
  // Sin internal.view (cliente, lector) sólo se ve lo explícitamente compartido.
  if (!can(actor.role, "internal.view")) query = query.eq("visibility", "client");

  const { data, error: dbErr } = await query.order("modified_at", { ascending: false });
  if (dbErr) return NextResponse.json({ error: dbErr.message }, { status: 502 });

  const canDownload = can(actor.role, "material.download");
  const materials = (data ?? []).map((m) => (canDownload ? m : { ...m, url: null }));
  return NextResponse.json({ ok: true, materials, canDownload, canUpload: can(actor.role, "material.upload") });
}

// ─── POST: subir un documento a la sala (multipart) ────────────────────────
export async function POST(req: NextRequest, c: { params: Promise<{ projectId: string }> }) {
  const csrf = requireSameOriginRequest(req);
  if (csrf) return csrf;
  const { projectId } = await c.params;
  const { project, actor, error } = await ctxFor(projectId);
  if (error) return error;
  if (!can(actor.role, "material.upload")) return NextResponse.json({ error: "Tu rol no puede subir materiales" }, { status: 403 });

  const form = await req.formData();
  const file = form.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });
  const ext = EXT[file.type];
  if (!ext) return NextResponse.json({ error: "Sólo PDF o PPTX" }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "Archivo demasiado grande (máx 25MB)" }, { status: 400 });

  const title = (((form.get("title") as string) || file.name || "Documento").trim()).slice(0, 200);
  const categoryRaw = (form.get("category") as string) || "working_document";
  const category = CATEGORIES.has(categoryRaw) ? categoryRaw : "working_document";

  const db = supabaseAdmin();
  const path = `${project.id}/${crypto.randomUUID()}.${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  const { error: upErr } = await db.storage.from("room-docs").upload(path, buffer, { contentType: file.type, upsert: false });
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 502 });

  const { data, error: insErr } = await db
    .from("project_materials")
    .insert({
      project_id: project.id,
      provider: "supabase",
      external_id: path,
      title,
      category,
      document_status: "in_review",
      visibility: "internal",
      url: "",
      mime_type: file.type,
      added_by: actor.email ?? actor.clerkId,
      modified_at: new Date().toISOString(),
    })
    .select("id, title, mime_type, category, folder_name, visibility, modified_at")
    .single();
  // Sin fila, el objeto en storage queda huérfano: se borra antes de responder.
  if (insErr || !data) {
    await db.storage.from("room-docs").remove([path]);
    return NextResponse.json({ error: insErr?.message ?? "Insert failed" }, { status: 502 });
  }

  const url = `/api/projects/${project.id}/materials/${data.id}/file`;
  await db.from("project_materials").update({ url }).eq("id", data.id);

  await logRoomEvent({
    projectId: project.id, actor, verb: "created", targetType: "material", targetId: data.id,
    summary: `Subió "${title}"`, payload: { category, mime_type: file.type, bytes: file.size },
  });
  return NextResponse.json({ ok: true, material: { ...data, url } });
}
