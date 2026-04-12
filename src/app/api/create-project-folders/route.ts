import { NextRequest, NextResponse } from "next/server";
import { createProjectFolders } from "@/lib/drive";
import { adminGuardApi } from "@/lib/require-admin";

/**
 * POST /api/create-project-folders
 * Admin-only. Creates the default folder structure in Drive for a new project.
 * Returns the rootFolderId — add this to clients.ts as driveFolderId.
 */
export async function POST(req: NextRequest) {
  const guard = await adminGuardApi();
  if (guard) return guard;

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
