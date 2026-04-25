import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { adminGuardApi } from "@/lib/require-admin";

/**
 * POST /api/ingest-library/upload-url
 *
 * Returns a one-time signed upload URL for the `library-docs` Supabase bucket
 * so the browser can upload large files directly (bypassing Vercel's ~4.5 MB
 * serverless body cap). Used by Full Digest mode for big strategic docs
 * (research papers / decks / reports often run 10–50 MB).
 *
 * Body: { fileName: string }
 * Response: { ok, signedUrl, token, storagePath }
 *
 * After upload, the client calls /api/ingest-library/digest with
 * { storagePath } and the digest route downloads from Supabase server-side.
 */

const BUCKET = "library-docs";

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!,
    { auth: { persistSession: false } },
  );
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export async function POST(req: NextRequest) {
  const guard = await adminGuardApi();
  if (guard) return guard;

  let fileName: unknown;
  try {
    const body = await req.json();
    fileName = body.fileName;
  } catch {
    return NextResponse.json({ error: "Expected JSON body with fileName" }, { status: 400 });
  }

  if (typeof fileName !== "string" || !fileName) {
    return NextResponse.json({ error: "fileName required" }, { status: 400 });
  }

  const extMatch = fileName.match(/\.([a-z0-9]+)$/i);
  const ext = (extMatch?.[1] ?? "bin").toLowerCase();
  const base = slugify(fileName.replace(/\.[a-z0-9]+$/i, "")) || "doc";
  const storagePath = `library/${Date.now()}-${base}.${ext}`;

  const supabase = getSupabase();
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUploadUrl(storagePath);

  if (error || !data) {
    console.error("[ingest-library/upload-url] error:", error);
    return NextResponse.json(
      { error: error?.message ?? "Failed to create signed upload URL" },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    signedUrl: data.signedUrl,
    token: data.token,
    storagePath,
  });
}
