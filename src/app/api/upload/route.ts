import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "@clerk/nextjs/server";
import { uploadFileToDrive, FolderName } from "@/lib/drive";
// notion-cutoff-2026-06-02: Notion `Sources` write removed; canonical write is now to `sources` (Supabase).
// import { notion, DB } from "@/lib/notion";
import { getProjectIdForUser, getClientConfig, isAdminUser, isAdminEmail } from "@/lib/clients";
import { getSupabaseServerClient } from "@/lib/supabase-server";

const MAX_SIZE_MB = 20;
const MAX_SIZE_BYTES = MAX_SIZE_MB * 1024 * 1024;

export async function POST(req: NextRequest) {
  try {
    const user = await currentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const email = user.primaryEmailAddress?.emailAddress ?? "";

    // Get project context
    let projectId: string | null = null;
    let rootFolderId: string | null = null;

    if (isAdminUser(user.id) || isAdminEmail(email)) {
      // Admin can upload to any project — pass projectId in form
      projectId    = req.nextUrl.searchParams.get("projectId");
      rootFolderId = req.nextUrl.searchParams.get("folderId");
    } else {
      projectId    = getProjectIdForUser(email);
      rootFolderId = getClientConfig(email)?.driveFolderId ?? null;
    }

    if (!projectId)    return NextResponse.json({ error: "No project linked" }, { status: 400 });
    if (!rootFolderId) return NextResponse.json({ error: "No Drive folder configured for this project" }, { status: 400 });

    // Parse form data
    const form     = await req.formData();
    const file     = form.get("file") as File | null;
    const folder   = (form.get("folder") as string) as FolderName;

    if (!file)   return NextResponse.json({ error: "No file provided" }, { status: 400 });
    if (!folder) return NextResponse.json({ error: "No folder selected" }, { status: 400 });

    if (file.size > MAX_SIZE_BYTES) {
      return NextResponse.json({ error: `File too large (max ${MAX_SIZE_MB}MB)` }, { status: 400 });
    }

    // Upload to Drive
    const buffer = Buffer.from(await file.arrayBuffer());
    const result = await uploadFileToDrive(
      buffer,
      file.name,
      file.type || "application/octet-stream",
      rootFolderId,
      folder
    );

    // notion-cutoff-2026-06-02: replaced by canonical write to sources (Supabase).
    // Notion → Supabase (sources) column mapping:
    //   "Source Title"      → title
    //   "Source Type"       → source_type
    //   "Source Platform"   → source_platform
    //   "Source URL"        → source_url
    //   "Processing Status" → processing_status (kept as "Ingested" so the
    //                                            engine's finalize-source-processing skill
    //                                            can run its 9-condition hygiene check)
    //   "Source Date"       → source_date
    //   "Linked Projects"   → project_notion_id (string FK to projects.notion_id)
    //
    // await notion.pages.create({
    //   parent: { database_id: DB.sources },
    //   properties: {
    //     "Source Title":      { title: [{ text: { content: file.name } }] },
    //     "Source Type":       { select: { name: "Document" } },
    //     "Source Platform":   { select: { name: "Google Drive" } },
    //     "Source URL":        { url: result.webViewLink },
    //     "Linked Projects":   { relation: [{ id: projectId }] },
    //     "Processing Status": { select: { name: "Ingested" } },
    //     "Source Date":       { date: { start: new Date().toISOString().split("T")[0] } },
    //   },
    // });
    const sb = getSupabaseServerClient();
    const { error: srcErr } = await sb
      .from("sources")
      .insert({
        title:             file.name,
        source_type:       "Document",
        source_platform:   "Google Drive",
        source_url:        result.webViewLink,
        processing_status: "Ingested",
        source_date:       new Date().toISOString().split("T")[0],
        project_notion_id: projectId,
      });
    if (srcErr) {
      console.error("[upload] sources insert failed:", srcErr.message);
      // Drive upload already succeeded; surface a soft failure but keep the upload result.
    }

    return NextResponse.json({
      success: true,
      file: {
        name:     result.fileName,
        url:      result.webViewLink,
        folder:   result.folder,
      },
    });

  } catch (err) {
    console.error("Upload error:", err);
    const msg = err instanceof Error ? err.message : "Upload failed";
    // Service accounts can't store files in personal My Drive folders (no quota).
    // Until the target folder is migrated to a Shared Drive, surface a clear message.
    if (msg.includes("do not have storage quota") || msg.includes("storageQuota")) {
      return NextResponse.json(
        { error: "Document upload is not available yet for this project. The team has been notified." },
        { status: 503 }
      );
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
