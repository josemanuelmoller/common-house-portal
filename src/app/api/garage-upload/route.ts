import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { adminGuardApi } from "@/lib/require-admin";
import { notion, DB } from "@/lib/notion";

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
  );
}

// POST — generate signed upload URLs so the browser uploads directly to Supabase
// Body: { projectId, files: Array<{ name: string; type: string }> }
// Returns: { results: Array<{ name, storagePath, signedUrl }> }
export async function POST(req: NextRequest) {
  const guard = await adminGuardApi();
  if (guard) return guard;

  const { projectId, files } = await req.json() as {
    projectId: string;
    files: { name: string; type: string }[];
  };

  if (!projectId || !files?.length)
    return NextResponse.json({ error: "projectId and files required" }, { status: 400 });

  const supabase = getSupabase();
  const results: { name: string; storagePath: string; signedUrl: string; error?: string }[] = [];

  for (const file of files) {
    // Sanitize filename — spaces and special chars break Supabase storage paths
    const safeName = file.name.replace(/[^a-zA-Z0-9.\-_]/g, "_");
    const storagePath = `${projectId}/${Date.now()}-${Math.random().toString(36).slice(2, 6)}-${safeName}`;
    const { data, error } = await supabase.storage
      .from("garage-docs")
      .createSignedUploadUrl(storagePath);

    if (error || !data) {
      results.push({ name: file.name, storagePath, signedUrl: "", error: error?.message ?? "Failed to create upload URL" });
    } else {
      results.push({ name: file.name, storagePath, signedUrl: data.signedUrl });
    }
  }

  return NextResponse.json({ results });
}

// DELETE — remove a specific Data Room item (Notion record + Supabase file)
export async function DELETE(req: NextRequest) {
  const guard = await adminGuardApi();
  if (guard) return guard;

  const { notionId, storagePath } = await req.json();
  const errs: string[] = [];

  if (notionId) {
    try {
      await notion.pages.update({ page_id: notionId, archived: true });
    } catch { errs.push("Failed to archive Notion record"); }
  }

  if (storagePath) {
    const { error } = await getSupabase().storage.from("garage-docs").remove([storagePath]);
    if (error) errs.push(`Storage delete failed: ${error.message}`);
  }

  return NextResponse.json({ ok: errs.length === 0, errors: errs });
}
