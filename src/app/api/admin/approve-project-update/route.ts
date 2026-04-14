/**
 * POST /api/admin/approve-project-update
 *
 * Portal-native action for the "Flagged for update" banner on project pages.
 *
 * Actions:
 *   approve — copies Draft Status Update → Status Summary, clears the draft,
 *             unchecks "Project Update Needed?"
 *   dismiss — unchecks "Project Update Needed?" only (no status change)
 *
 * Auth: Clerk admin session.
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { Client } from "@notionhq/client";
import { isAdminUser } from "@/lib/clients";

const notion = new Client({ auth: process.env.NOTION_API_KEY });

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId || !isAdminUser(userId)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { projectId, action, draftText } = await req.json() as {
    projectId: string;
    action: "approve" | "dismiss";
    draftText?: string;
  };

  if (!projectId || !["approve", "dismiss"].includes(action)) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const properties: Record<string, any> = {
      "Project Update Needed?": { checkbox: false },
    };

    if (action === "approve" && draftText) {
      properties["Status Summary"] = {
        rich_text: [{ type: "text", text: { content: draftText.slice(0, 2000) } }],
      };
      properties["Draft Status Update"] = {
        rich_text: [],
      };
    }

    await notion.pages.update({ page_id: projectId, properties });

    return NextResponse.json({ ok: true, action });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
