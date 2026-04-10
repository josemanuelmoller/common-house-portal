import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createProjectFolders } from "@/lib/drive";
import { isAdminUser } from "@/lib/clients";

/**
 * POST /api/create-project-folders
 * Admin-only. Creates the default folder structure in Drive for a new project.
 * Returns the rootFolderId — add this to clients.ts as driveFolderId.
 */
export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId || !isAdminUser(userId)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { projectName } = await req.json();
  if (!projectName) {
    return NextResponse.json({ error: "projectName required" }, { status: 400 });
  }

  try {
    const result = await createProjectFolders(projectName);
    return NextResponse.json({
      success: true,
      rootFolderId: result.rootFolderId,
      subfolders: result.subfolders,
      message: `Created folder structure for "${projectName}". Add rootFolderId to clients.ts as driveFolderId.`,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to create folders" },
      { status: 500 }
    );
  }
}
