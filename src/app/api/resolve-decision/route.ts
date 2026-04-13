import { NextRequest, NextResponse } from "next/server";
import { notion } from "@/lib/notion";

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders() });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const id: string = body.id ?? "";
  const action: string = body.action ?? "resolve"; // "resolve" | "dismiss"
  const note: string = body.note ?? "";

  if (!id) {
    return NextResponse.json(
      { error: "id is required" },
      { status: 400, headers: corsHeaders() }
    );
  }

  const statusMap: Record<string, string> = {
    resolve: "Resolved",
    dismiss: "Dismissed",
  };

  const newStatus = statusMap[action] ?? "Resolved";

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const properties: Record<string, any> = {
    "Status": { select: { name: newStatus } },
  };

  // Append resolution note if provided
  if (note) {
    properties["Resolution Note"] = {
      rich_text: [{ text: { content: note.slice(0, 2000) } }],
    };
  }

  try {
    await notion.pages.update({ page_id: id, properties });
  } catch (err) {
    // If "Resolution Note" field doesn't exist, retry without it
    try {
      await notion.pages.update({
        page_id: id,
        properties: { "Status": { select: { name: newStatus } } },
      });
    } catch (err2) {
      return NextResponse.json(
        { error: "Notion update failed", detail: String(err2) },
        { status: 500, headers: corsHeaders() }
      );
    }
    void err; // note field not present — that's fine
  }

  return NextResponse.json(
    { ok: true, id, status: newStatus },
    { headers: corsHeaders() }
  );
}
