/**
 * POST /api/projects/[id]/proposal-upload
 *
 * Accepts a multipart upload of the proposal document (PDF, DOCX, PPTX, etc.)
 * and persists it to the `library-docs` Supabase bucket under a project-scoped
 * namespace. Updates the project's hall_draft.proposal with the resulting
 * signed URL + filename so the Hall render can show a download button.
 *
 * Auth: adminGuardApi.
 *
 * Returns:
 *   { ok: true, file_url, file_name }
 *   { ok: false, error }   on 4xx/5xx
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { adminGuardApi } from "@/lib/require-admin";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { requireSameOriginRequest } from "@/lib/require-same-origin";
import type { HallDraft } from "@/lib/hall-compose";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const BUCKET = "library-docs";
const SIGNED_URL_EXPIRY = 60 * 60 * 24 * 365 * 10; // 10 years

const MAX_SIZE_MB = 20;
const MAX_SIZE_BYTES = MAX_SIZE_MB * 1024 * 1024;

const ALLOWED_MIME = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document", // .docx
  "application/vnd.openxmlformats-officedocument.presentationml.presentation", // .pptx
  "application/msword",          // .doc legacy
  "application/vnd.ms-powerpoint", // .ppt legacy
  "text/plain",
  "text/markdown",
]);

function getStorageClient() {
  // Storage requires service-key auth (the upload writes to a private bucket).
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!,
  );
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const csrf = requireSameOriginRequest(req);
  if (csrf) return csrf;
  const guard = await adminGuardApi();
  if (guard) return guard;

  const { id: projectId } = await ctx.params;
  if (!projectId) {
    return NextResponse.json({ ok: false, error: "missing project id" }, { status: 400 });
  }
  // Path traversal hardening: projectId is interpolated into the storage path.
  // Accept only uuid / Notion page id shapes.
  if (!/^[0-9a-fA-F-]{32,36}$/.test(projectId)) {
    return NextResponse.json({ ok: false, error: "invalid project id" }, { status: 400 });
  }

  let file: File | null = null;
  try {
    const form = await req.formData();
    file = form.get("file") as File | null;
  } catch {
    return NextResponse.json({ ok: false, error: "expected multipart/form-data" }, { status: 400 });
  }
  if (!file) {
    return NextResponse.json({ ok: false, error: "no file provided" }, { status: 400 });
  }
  if (file.size > MAX_SIZE_BYTES) {
    return NextResponse.json(
      { ok: false, error: `file too large (max ${MAX_SIZE_MB} MB)` },
      { status: 400 },
    );
  }

  const mime = file.type || "application/octet-stream";
  if (!ALLOWED_MIME.has(mime)) {
    return NextResponse.json(
      { ok: false, error: `mime type not allowed: ${mime}` },
      { status: 415 },
    );
  }

  // Upload to Supabase Storage. Project-scoped path so files of different
  // projects don't collide; timestamp prefix so re-uploads don't overwrite
  // the previous version (admin can choose to wire history later).
  const buffer = Buffer.from(await file.arrayBuffer());
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const storagePath = `proposals/${projectId}/${Date.now()}-${safeName}`;

  const storage = getStorageClient();
  const { error: upErr } = await storage.storage
    .from(BUCKET)
    .upload(storagePath, buffer, { contentType: mime, upsert: false });
  if (upErr) {
    console.error("[proposal-upload] storage upload failed:", upErr.message);
    return NextResponse.json({ ok: false, error: "storage upload failed" }, { status: 500 });
  }

  const { data: signedData, error: signErr } = await storage.storage
    .from(BUCKET)
    .createSignedUrl(storagePath, SIGNED_URL_EXPIRY);
  if (signErr || !signedData?.signedUrl) {
    console.error("[proposal-upload] createSignedUrl failed:", signErr?.message ?? "no url");
    return NextResponse.json({ ok: false, error: "signed URL failed" }, { status: 500 });
  }

  // Patch the project's hall_draft.proposal in place — keeps it pending_review,
  // doesn't touch published hall_hero. Admin still needs to click Publish for
  // the file to appear on /hall.
  const sb = getSupabaseServerClient();
  const { data: row } = await sb
    .from("projects")
    .select("hall_draft, hall_draft_status")
    .eq("notion_id", projectId)
    .maybeSingle();

  const currentDraft = (row?.hall_draft as HallDraft | null) ?? null;
  const nextDraft: HallDraft = currentDraft
    ? {
        ...currentDraft,
        proposal: {
          status:    currentDraft.proposal?.status ?? "ready",
          summary:   currentDraft.proposal?.summary ?? null,
          sent_at:   currentDraft.proposal?.sent_at ?? null,
          file_url:  signedData.signedUrl,
          file_name: file.name,
        },
      }
    : {
        // Fallback when no draft exists yet — minimal shape.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ...({} as any),
        quote:    null,
        angles:   [],
        timeline: [],
        hall_text: {
          welcome_note: null, current_focus: null, next_milestone: null,
          challenge: null, matters_most: null, obstacles: null, success: null,
        },
        meta: {
          generated_from_source_ids: [],
          fireflies_transcript_ids:  [],
          model:          "manual",
          prompt_version: "manual",
          project_id:     projectId,
        },
        proposal: {
          status:    "ready",
          summary:   null,
          file_url:  signedData.signedUrl,
          file_name: file.name,
          sent_at:   null,
        },
      };

  const { error: updErr } = await sb
    .from("projects")
    .update({
      hall_draft:        nextDraft,
      hall_draft_status: row?.hall_draft_status === "published" ? "pending_review" : (row?.hall_draft_status ?? "pending_review"),
      updated_at:        new Date().toISOString(),
    })
    .eq("notion_id", projectId);
  if (updErr) {
    console.error("[proposal-upload] db update failed:", updErr.message);
    return NextResponse.json({ ok: false, error: "db update failed" }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    file_url:  signedData.signedUrl,
    file_name: file.name,
  });
}
