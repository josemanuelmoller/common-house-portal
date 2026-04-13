import { NextRequest, NextResponse } from "next/server";
import { adminGuardApi } from "@/lib/require-admin";
import { notion } from "@/lib/notion";

/**
 * PATCH /api/content/[id]
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

  try {
    if (action === "archive") {
      await notion.pages.update({
        page_id: pageId,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        properties: { Status: { select: { name: "Archived" } } } as any,
      });
      return NextResponse.json({ ok: true, status: "Archived" });
    }

    if (action === "status" && status) {
      await notion.pages.update({
        page_id: pageId,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        properties: { Status: { select: { name: status } } } as any,
      });
      return NextResponse.json({ ok: true, status });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    console.error("[content PATCH]", err);
    return NextResponse.json({ error: "Failed to update" }, { status: 500 });
  }
}
