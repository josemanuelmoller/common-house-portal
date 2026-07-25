import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { resolveClientRoomProject } from "@/lib/client-room";
import { can, logRoomEvent, resolveRoomActor } from "@/lib/project-roles";
import { requireSameOriginRequest } from "@/lib/require-same-origin";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Materiales de la sala (index de Drive + subidas desde la sala).
 * Ver: todos, pero lo interno solo con internal.view — mismo criterio que el
 * loader de la sala y que la sala de preventa.
 * Descargar: pm/colaborador/cliente. Al Lector se le OMITE la url (ve la lista
 * pero no puede bajar) — enforce a nivel de datos, no solo UI.
 */

const MAX_BYTES = 25 * 1024 * 1024;
const EXT: Record<string, string> = {
  "application/pdf": "pdf",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/msword": "doc",
};
const CATEGORIES = new Set(["plan_timeline", "deliverable", "presentation", "manual", "working_document", "contract_agreement", "proposal_budget", "purchase_order", "invoice", "multimedia", "other"]);

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

  const { data, error: dbError } = await supabaseAdmin()
    .from("project_materials")
    .select("id, title, url, mime_type, category, folder_name, modified_at, visibility")
    .eq("project_id", project.id)
    .order("modified_at", { ascending: false });
  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 502 });

  const canSeeInternal = can(actor.role, "internal.view");
  const canDownload = can(actor.role, "material.download");
  const materials = (data ?? [])
    .filter((m) => canSeeInternal || m.visibility === "client")
    .map((m) => (canDownload ? m : { ...m, url: null }));
  return NextResponse.json({ ok: true, materials, canDownload });
}

/**
 * POST (multipart) — subir un documento desde la sala.
 *
 * Lo subido queda compartido con la sala (visibility 'client'), no interno: la
 * ruta que sirve el archivo exige 'client' a quien no es admin, así que un
 * material interno no lo podría abrir ni quien acaba de subirlo. Lo interno se
 * carga por la superficie admin, que sí lo marca así a propósito.
 */
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
  if (!ext) return NextResponse.json({ error: "Solo PDF, PPTX o Word" }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "Archivo muy grande (máx. 25MB)" }, { status: 400 });

  const title = ((form.get("title") as string) || file.name || "Documento").trim();
  const categoryRaw = (form.get("category") as string) || "working_document";
  const category = CATEGORIES.has(categoryRaw) ? categoryRaw : "working_document";

  const db = supabaseAdmin();
  const path = `${project.id}/${crypto.randomUUID()}.${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  const { error: upErr } = await db.storage.from("room-docs").upload(path, buffer, { contentType: file.type, upsert: false });
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 502 });

  const now = new Date().toISOString();
  const { data, error: inErr } = await db
    .from("project_materials")
    .insert({
      project_id: project.id,
      provider: "supabase",
      external_id: path,
      title,
      category,
      document_status: "current",
      visibility: "client",
      url: "",
      mime_type: file.type,
      added_by: actor.email ?? actor.clerkId,
      client_visible_at: now,
      modified_at: now,
    })
    .select("id, title, url, mime_type, category, folder_name, modified_at, visibility")
    .single();
  if (inErr || !data) {
    // Sin fila no hay material: se borra el binario para no dejar huérfanos.
    await db.storage.from("room-docs").remove([path]);
    return NextResponse.json({ error: inErr?.message ?? "Insert failed" }, { status: 502 });
  }

  const url = `/api/projects/${project.id}/materials/${data.id}/file`;
  await db.from("project_materials").update({ url }).eq("id", data.id);

  await logRoomEvent({ projectId: project.id, actor, verb: "uploaded", targetType: "material", targetId: data.id, summary: `Subió "${title}"`, payload: { title, category } });
  return NextResponse.json({ ok: true, material: { ...data, url } });
}
