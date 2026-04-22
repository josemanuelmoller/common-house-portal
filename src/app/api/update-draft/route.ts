/**
 * POST /api/update-draft
 *
 * Updates the Content (body) of an Agent Draft in Notion.
 * Used by the Outbox inline editor so JMM can tweak a draft before approving.
 *
 * Body: { draftId: string; content: string }
 * Auth: admin session (Clerk).
 */

import { NextRequest, NextResponse } from "next/server";
import { adminGuardApi } from "@/lib/require-admin";
import { Client } from "@notionhq/client";

const notion = new Client({ auth: process.env.NOTION_API_KEY });

const MAX_CONTENT = 2000; // Matches the slice used at write time in other skills.

export async function POST(req: NextRequest) {
  const guard = await adminGuardApi();
  if (guard) return guard;

  const body = await req.json().catch(() => ({}));
  const draftId: string = body.draftId;
  const content: string = body.content;

  if (!draftId || typeof content !== "string") {
    return NextResponse.json({ error: "draftId and content required" }, { status: 400 });
  }

  try {
    await notion.pages.update({
      page_id: draftId,
      properties: {
        // "Content" is the canonical body field — all Agent Draft write paths use this name.
        "Content": { rich_text: [{ text: { content: content.slice(0, MAX_CONTENT) } }] },
      },
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: "Notion update error", detail: String(e) },
      { status: 500 }
    );
  }
}
