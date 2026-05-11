import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { adminGuardApi } from "@/lib/require-admin";
// notion-cutoff-2026-06-02: Notion `Data Room` archive removed; canonical delete is now on `data_room_documents` (Supabase).
// import { notion, DB } from "@/lib/notion";
import { getSupabaseServerClient } from "@/lib/supabase-server";

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

  // projectId is interpolated into the storage path — without shape validation an
  // admin could pass "../something/" and write into a sibling bucket prefix.
  // Notion page IDs are 32 hex chars (with or without dashes); allow both.
  if (!/^[0-9a-fA-F-]{32,36}$/.test(projectId)) {
    return NextResponse.json({ error: "projectId must be a valid uuid or notion page id" }, { status: 400 });
  }

  const supabase = getSupabase();
  const results: { name: string; storagePath: string; signedUrl: string; error?: string }[] = [];

  for (const file of files) {
    // Sanitize filename — spaces and special chars break Supabase storage paths
    const safeName = file.name.replace(/[^a-zA-Z0-9.\-_]/g, "_");
    // Prefix `garage/` so the finalize route's allowlist check holds.
    const storagePath = `garage/${projectId}/${Date.now()}-${Math.random().toString(36).slice(2, 6)}-${safeName}`;
    const { data, error } = await supabase.storage
      .from("garage-docs")
      .createSignedUploadUrl(storagePath);

    if (error || !data) {
      if (error) console.error("[garage-upload] createSignedUploadUrl failed:", error.message);
      results.push({ name: file.name, storagePath, signedUrl: "", error: "Failed to create upload URL" });
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
    // notion-cutoff-2026-06-02: replaced by canonical delete on data_room_documents (Supabase).
    // notionId is matched against either uuid `id` or the `notion_id` backref column.
    // try { await notion.pages.update({ page_id: notionId, archived: true }); }
    // catch { errs.push("Failed to archive Notion record"); }
    try {
      const sb = getSupabaseServerClient();
      const isUuid = /^[0-9a-f-]{36}$/i.test(notionId);
      const matchColumn = isUuid ? "id" : "notion_id";
      const { error } = await sb
        .from("data_room_documents")
        .delete()
        .eq(matchColumn, notionId);
      if (error) {
        console.error("[garage-upload DELETE] data_room_documents delete failed:", error.message);
        errs.push("Failed to delete data_room_documents row");
      }
    } catch (e) {
      console.error("[garage-upload DELETE] data_room_documents threw:", e);
      errs.push("Failed to delete data_room_documents row");
    }
  }

  if (storagePath) {
    const { error } = await getSupabase().storage.from("garage-docs").remove([storagePath]);
    if (error) {
      console.error("[garage-upload DELETE] storage remove failed:", error.message);
      errs.push("Storage delete failed");
    }
  }

  return NextResponse.json({ ok: errs.length === 0, errors: errs });
}
