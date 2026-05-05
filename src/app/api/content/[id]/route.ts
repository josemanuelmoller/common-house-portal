import { NextRequest, NextResponse } from "next/server";
import { adminGuardApi } from "@/lib/require-admin";
import { getSupabaseServerClient } from "@/lib/supabase-server";

/**
 * PATCH /api/content/[id]
 *
 * Actions:
 *   { action: "archive" } → sets Status to "Archived"
 *   { action: "status", status: "Review" } → sets Status to any valid value
 *
 * Migrated 2026-05-05 from Notion `CH Content Pipeline [OS v2]` writes to the
 * canonical `content_pipeline_items` Supabase table. The route still receives
 * the Notion page id as the URL `[id]` segment — it is matched against the
 * `notion_id` column. See docs/SUPABASE_CONSOLIDATION_FREEZE.md §3.4.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await adminGuardApi();
  if (guard) return guard;

  let body: Record<string, string>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { action, status } = body;
  const { id: pageId } = await params;

  // Resolve the canonical row by either id (uuid) or notion_id (legacy).
  const sb = getSupabaseServerClient();
  const matchColumn = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(pageId)
    ? "id"
    : "notion_id";

  try {
    if (action === "archive") {
      // notion-cutoff-2026-06-02: replaced by canonical write to content_pipeline_items
      // await notion.pages.update({ page_id: pageId, properties: { Status: { select: { name: "Archived" } } } });
      const { error } = await sb
        .from("content_pipeline_items")
        .update({ status: "Archived", updated_at: new Date().toISOString() })
        .eq(matchColumn, pageId);
      if (error) {
        console.error("[content PATCH] supabase update failed:", error.message);
        return NextResponse.json({ error: "Failed to update", detail: error.message }, { status: 500 });
      }
      return NextResponse.json({ ok: true, status: "Archived" });
    }

    if (action === "status" && status) {
      // notion-cutoff-2026-06-02: replaced by canonical write to content_pipeline_items
      // await notion.pages.update({ page_id: pageId, properties: { Status: { select: { name: status } } } });
      const { error } = await sb
        .from("content_pipeline_items")
        .update({ status, updated_at: new Date().toISOString() })
        .eq(matchColumn, pageId);
      if (error) {
        console.error("[content PATCH] supabase update failed:", error.message);
        return NextResponse.json({ error: "Failed to update", detail: error.message }, { status: 500 });
      }
      return NextResponse.json({ ok: true, status });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    console.error("[content PATCH]", err);
    return NextResponse.json({ error: "Failed to update" }, { status: 500 });
  }
}
