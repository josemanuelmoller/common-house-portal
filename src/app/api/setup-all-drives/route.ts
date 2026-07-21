import { NextResponse } from "next/server";
import { createProjectFolders } from "@/lib/drive";
import { adminGuardApi } from "@/lib/require-admin";
import { getSupabaseServerClient } from "@/lib/supabase-server";

/**
 * POST /api/setup-all-drives
 * Admin-only. Creates Drive folder structure for ALL projects in Supabase.
 * Returns a mapping of projectId → { projectName, rootFolderId } so you can
 * paste the values into clients.ts.
 */
export async function POST() {
  const guard = await adminGuardApi();
  if (guard) return guard;

  // Get all projects from Supabase
  const sb = getSupabaseServerClient();
  const { data: projectRows } = await sb
    .from("projects")
    .select("notion_id, name")
    .order("name", { ascending: true });
  const rows = (projectRows ?? []) as Array<{ notion_id: string | null; name: string | null }>;

  const results: Array<{
    notionId: string;
    projectName: string;
    rootFolderId: string;
    driveUrl: string;
    status: "created" | "error";
    error?: string;
  }> = [];

  for (const row of rows) {
    const nameProp = row.name ?? "";
    if (!nameProp) continue;

    try {
      const { rootFolderId } = await createProjectFolders(nameProp);
      results.push({
        notionId: row.notion_id ?? "",
        projectName: nameProp,
        rootFolderId,
        driveUrl: `https://drive.google.com/drive/folders/${rootFolderId}`,
        status: "created",
      });
    } catch (err) {
      results.push({
        notionId: row.notion_id ?? "",
        projectName: nameProp,
        rootFolderId: "",
        driveUrl: "",
        status: "error",
        error: "Internal error",
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
    total: rows.length,
    created: results.filter(r => r.status === "created").length,
    errors: results.filter(r => r.status === "error").length,
    results,
    clientsSnippet: snippet,
  });
}
