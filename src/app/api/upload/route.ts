import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { uploadFileToDrive, FolderName } from "@/lib/drive";
import { notion, DB } from "@/lib/notion";
import { getProjectIdForUser, getClientConfig, isAdminUser } from "@/lib/clients";
import { currentUser } from "@clerk/nextjs/server";

const MAX_SIZE_MB = 20;
const MAX_SIZE_BYTES = MAX_SIZE_MB * 1024 * 1024;

export async function POST(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // Get project context
    let projectId: string | null = null;
    let rootFolderId: string | null = null;

    if (isAdminUser(userId)) {
      // Admin can upload to any project — pass projectId in form
      projectId    = req.nextUrl.searchParams.get("projectId");
      rootFolderId = req.nextUrl.searchParams.get("folderId");
    } else {
      const user  = await currentUser();
      const email = user?.emailAddresses?.[0]?.emailAddress ?? "";
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

    // Create Source record in Notion
    await notion.pages.create({
      parent: { database_id: DB.sources },
      properties: {
        "Source Title": {
          title: [{ text: { content: file.name } }],
        },
        "Source Type": {
          select: { name: "Document" },
        },
        "Source Platform": {
          select: { name: "Google Drive" },
        },
        "Source URL": {
          url: result.webViewLink,
        },
        "Linked Projects": {
          relation: [{ id: projectId }],
        },
        // Set to Ingested (not Processed) so the OS engine's finalize-source-processing skill
        // can validate this record through its 9-condition hygiene check before marking it
        // Processed. Setting Processed directly would create hygiene-skipped source records
        // with no Processed Summary, Dedup Key, or Sensitivity set.
        "Processing Status": {
          select: { name: "Ingested" },
        },
        "Source Date": {
          date: { start: new Date().toISOString().split("T")[0] },
        },
      },
    });

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
