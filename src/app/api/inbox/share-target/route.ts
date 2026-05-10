/**
 * POST /api/inbox/share-target
 *
 * Receives shares from the Android system Share menu. Wired in manifest.ts
 * via `share_target.action`. The browser sends multipart/form-data with the
 * fields declared there: title, text, url, file (image/*).
 *
 * Behavior: persist as a new inbox_item (source = 'share_target') with
 * raw_text composed from title + text + url, and the file (if any) uploaded
 * to the inbox-captures bucket. Then 303-redirect to /admin/capture so the
 * user lands on the bandeja with their item visible.
 */

import { NextResponse, after } from "next/server";
import { currentUser } from "@clerk/nextjs/server";
import { adminGuardApi } from "@/lib/require-admin";
import { createInboxItem, uploadInboxMedia } from "@/lib/inbox";
import { classifyInboxItem } from "@/lib/inbox-classifier";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

  const title = trimOrNull(form.get("title"));
  const text = trimOrNull(form.get("text"));
  const url = trimOrNull(form.get("url"));
  const file = form.get("file");

  const parts: string[] = [];
  if (title) parts.push(title);
  if (text) parts.push(text);
  if (url) parts.push(url);
  const raw_text = parts.length > 0 ? parts.join("\n\n") : null;

  let photo_path: string | null = null;
  if (file instanceof File && file.size > 0) {
    const r = await uploadInboxMedia(file, userId, "photo");
    if (r.error) {
      return NextResponse.json(
        { error: `Upload failed: ${r.error}` },
        { status: 500 }
      );
    }
    photo_path = r.path;
  }

  if (!raw_text && !photo_path) {
    return NextResponse.json(
      { error: "Share must include text, url, or a file" },
      { status: 400 }
    );
  }

  const { row, error } = await createInboxItem({
    source: "share_target",
    raw_text,
    photo_path,
    user_id: userId,
  });

  if (error || !row) {
    return NextResponse.json({ error: error || "Insert failed" }, { status: 500 });
  }

  // Background classification (see quick-capture for rationale).
  after(async () => {
    try {
      await classifyInboxItem(row);
    } catch (e) {
      console.warn("[share-target] post-response classify failed:", e);
    }
  });

  // 303 forces GET on the redirect target.
  const redirectTo = new URL("/admin/capture", req.url);
  return NextResponse.redirect(redirectTo, 303);
}

function trimOrNull(v: FormDataEntryValue | null): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length > 0 ? t : null;
}
