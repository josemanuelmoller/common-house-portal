import { NextResponse } from "next/server";
import { createProjectFolders } from "@/lib/drive";
import { adminGuardApi } from "@/lib/require-admin";
import { notion, DB } from "@/lib/notion";

/**
 * POST /api/setup-all-drives
 * Admin-only. Creates Drive folder structure for ALL active projects in Notion.
 * Returns a mapping of projectId → { projectName, rootFolderId } so you can
 * paste the values into clients.ts.
 */
export async function POST() {
  const guard = await adminGuardApi();
  if (guard) return guard;

  // Get all projects from Notion
  const res = await notion.databases.query({
    database_id: DB.projects,
    sorts: [{ property: "Project Name", direction: "ascending" }],
  });

  const results: Array<{
    notionId: string;
    projectName: string;
    rootFolderId: string;
    driveUrl: string;
    status: "created" | "error";
    error?: string;
  }> = [];

  for (const page of res.results) {
    if (page.object !== "page") continue;
    const props = (page as any).properties;

    const nameProp = props["Project Name"]?.title?.[0]?.plain_text ?? "";
    if (!nameProp) continue;

    try {
      const { rootFolderId } = await createProjectFolders(nameProp);
      results.push({
        notionId: page.id,
        projectName: nameProp,
        rootFolderId,
        driveUrl: `https://drive.google.com/drive/folders/${rootFolderId}`,
        status: "created",
      });
    } catch (err) {
      results.push({
        notionId: page.id,
        projectName: nameProp,
        rootFolderId: "",
        driveUrl: "",
        status: "error",
        error: err instanceof Error ? err.message : "Unknown error",
      });
    }
  }

  // Generate the clients.ts snippet for easy copy-paste
  const snippet = results
    .filter(r => r.status === "created")
    .map(r => `  // "${r.projectName}"
  // "client@email.com": {
  //   projectId:     "${r.notionId}",
  //   driveUrl:      "${r.driveUrl}",
  //   driveFolderId: "${r.rootFolderId}",
  // },`)
    .join("\n\n");

  return NextResponse.json({
    success: true,
    total: res.results.length,
    created: results.filter(r => r.status === "created").length,
    errors: results.filter(r => r.status === "error").length,
    results,
    clientsSnippet: snippet,
  });
}
