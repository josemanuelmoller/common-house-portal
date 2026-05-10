/**
 * POST /api/inbox/quick-capture
 *
 * Fase 2: receives a multipart form-data capture from the PWA Quick Capture
 * screen. Body fields (all optional, but at least one of raw_text/photo/audio
 * required by DB constraint):
 *
 *   raw_text             — string
 *   user_notes_to_agent  — string (instructions for the classifier)
 *   user_type_override   — reminder | read-later | client-message | reference | idea | other
 *   user_due_date        — YYYY-MM-DD
 *   client_capture_id    — UUID generated client-side, used for offline-queue dedup
 *   photo                — File (image/*)
 *   audio                — File (audio/*)
 *   source               — quick_capture (default) | voice_capture
 *
 * Auth: adminGuardApi() — same Clerk-session check as the rest of /api/admin/*.
 * Phase 4 will wire the inbox-classifier-agent off the new row.
 */

import { NextResponse, after } from "next/server";
import { currentUser } from "@clerk/nextjs/server";
import { adminGuardApi } from "@/lib/require-admin";
import {
  createInboxItem,
  uploadInboxMedia,
  isValidUserType,
  type InboxItemSource,
} from "@/lib/inbox";
import { classifyInboxItem } from "@/lib/inbox-classifier";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_SOURCES: InboxItemSource[] = [
  "quick_capture",
  "share_target",
  "voice_capture",
];

export async function POST(req: Request) {
  const guard = await adminGuardApi();
  if (guard) return guard;

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json(
      { error: "Expected multipart/form-data" },
      { status: 400 }
    );
  }

  const user = await currentUser();
  const userId = user?.id ?? null;

  const sourceField = form.get("source")?.toString() ?? "quick_capture";
  const source: InboxItemSource = (ALLOWED_SOURCES as string[]).includes(sourceField)
    ? (sourceField as InboxItemSource)
    : "quick_capture";

  const raw_text = trimOrNull(form.get("raw_text"));
  const user_notes_to_agent = trimOrNull(form.get("user_notes_to_agent"));
  const user_due_date = trimOrNull(form.get("user_due_date"));
  const client_capture_id = trimOrNull(form.get("client_capture_id"));

  const userTypeRaw = form.get("user_type_override")?.toString() ?? null;
  const user_type_override = isValidUserType(userTypeRaw) ? userTypeRaw : null;

  const photoFile = form.get("photo");
  const audioFile = form.get("audio");

  // Upload media if present
  let photo_path: string | null = null;
  let audio_path: string | null = null;

  if (photoFile instanceof File && photoFile.size > 0) {
    const r = await uploadInboxMedia(photoFile, userId, "photo");
    if (r.error) {
      return NextResponse.json(
        { error: `Photo upload failed: ${r.error}` },
        { status: 500 }
      );
    }
    photo_path = r.path;
  }

  if (audioFile instanceof File && audioFile.size > 0) {
    const r = await uploadInboxMedia(audioFile, userId, "audio");
    if (r.error) {
      return NextResponse.json(
        { error: `Audio upload failed: ${r.error}` },
        { status: 500 }
      );
    }
    audio_path = r.path;
  }

  if (!raw_text && !photo_path && !audio_path) {
    return NextResponse.json(
      { error: "Capture must include at least one of: raw_text, photo, audio" },
      { status: 400 }
    );
  }

  const { row, error, deduplicated } = await createInboxItem({
    source,
    client_capture_id,
    raw_text,
    user_notes_to_agent,
    user_type_override,
    user_due_date,
    photo_path,
    audio_path,
    user_id: userId,
  });

  if (error || !row) {
    return NextResponse.json(
      { error: error || "Insert failed" },
      { status: 500 }
    );
  }

  // Fire-and-forget classification AFTER the response is sent.
  // Next.js `after()` keeps the function alive until the work completes,
  // so the user gets a fast capture response while Claude classifies in
  // the background. Cron `/api/cron/run-inbox-classify` is the safety net
  // for any items that don't get processed here.
  if (!deduplicated) {
    after(async () => {
      try {
        await classifyInboxItem(row);
      } catch (e) {
        console.warn("[quick-capture] post-response classify failed:", e);
      }
    });
  }

  return NextResponse.json(
    { ok: true, item: row, deduplicated },
    { status: deduplicated ? 200 : 201 }
  );
}

function trimOrNull(v: FormDataEntryValue | null): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length > 0 ? t : null;
}
