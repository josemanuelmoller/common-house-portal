import { NextRequest, NextResponse } from "next/server";
import { adminGuardApi } from "@/lib/require-admin";
import { Client } from "@notionhq/client";

const notion = new Client({ auth: process.env.NOTION_API_KEY });

export async function POST(req: NextRequest) {
  const guard = await adminGuardApi();
  if (guard) return guard;

  const { draftId, action } = await req.json();

  if (!draftId || !action) {
    return NextResponse.json({ error: "draftId and action required" }, { status: 400 });
  }

  const validActions = ["approve", "revision"] as const;
  if (!validActions.includes(action)) {
    return NextResponse.json({ error: "action must be approve or revision" }, { status: 400 });
  }

  const statusMap = {
    approve:  "Approved",
    revision: "Revision Requested",
  } as const;

  try {
    await notion.pages.update({
      page_id: draftId,
      properties: {
        "Status": { select: { name: statusMap[action as keyof typeof statusMap] } },
      },
    });
    return NextResponse.json({ ok: true, status: statusMap[action as keyof typeof statusMap] });
  } catch (e) {
    return NextResponse.json({ error: "Notion update error", detail: String(e) }, { status: 500 });
  }
}
