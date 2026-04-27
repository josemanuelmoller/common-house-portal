import { NextRequest, NextResponse } from "next/server";
import { adminGuardApi } from "@/lib/require-admin";
import { applyMirrorEdit, pushPending } from "@/lib/notion-mirror-push";

/**
 * PATCH /api/content/[id]
 *
 * Updates a row in the Content Pipeline mirror first (instant UI),
 * then pushes the change to Notion async.
 *
 * Actions:
 *   { action: "archive" } → sets Status to "Archived"
 *   { action: "status", status: "Review" } → sets Status to any valid value
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

  let newStatus: string | null = null;
  if (action === "archive") newStatus = "Archived";
  else if (action === "status" && status) newStatus = status;
  else return NextResponse.json({ error: "Unknown action" }, { status: 400 });

  const apply = await applyMirrorEdit({
    table: "notion_content_pipeline",
    id: pageId,
    changes: { status: newStatus },
  });
  if (!apply.ok) {
    return NextResponse.json({ error: "Mirror update failed", detail: apply.error }, { status: 500 });
  }
  const push = await pushPending("notion_content_pipeline", pageId);

  return NextResponse.json({
    ok: true,
    status: newStatus,
    notion_push:  push.ok ? "ok" : "pending_retry",
    notion_error: push.ok ? undefined : push.error,
  });
}
