/**
 * PATCH /api/flag-opportunity
 *
 * Flags an existing Opportunity for Chief-of-Staff follow-up by setting
 * Follow-up Status = "Needed". Optionally records a note in Trigger/Signal.
 *
 * This is the bridge between the "Opportunities Explorer" (passive read-only view)
 * and the "Chief of Staff Desk" (active work layer). Use it to activate any
 * Active or Qualifying opportunity for proactive follow-up without opening Notion.
 *
 * Body: { opportunityId: string, note?: string }
 *
 * On success:
 *   - Follow-up Status → "Needed"
 *   - If note provided: prepends "[Flagged {date}: {note}]" to Trigger/Signal
 *
 * Auth: adminGuardApi()
 */

import { NextRequest, NextResponse } from "next/server";
import { Client } from "@notionhq/client";
import { adminGuardApi } from "@/lib/require-admin";
import { prop, text } from "@/lib/notion/core";

const notion = new Client({ auth: process.env.NOTION_API_KEY });

export async function PATCH(req: NextRequest) {
  const guard = await adminGuardApi();
  if (guard) return guard;

  let body: { opportunityId?: string; note?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const { opportunityId, note } = body;
  if (!opportunityId || typeof opportunityId !== "string") {
    return NextResponse.json({ error: "opportunityId required" }, { status: 400 });
  }

  try {
    // Build properties update
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const properties: Record<string, any> = {
      "Follow-up Status": { select: { name: "Needed" } },
    };

    // If a note is provided, prepend it to the existing Trigger/Signal text
    if (note && note.trim()) {
      // Read current Trigger/Signal value
      const page = await notion.pages.retrieve({ page_id: opportunityId });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const existing = text(prop(page as any, "Trigger / Signal")) || "";
      const dateStr  = new Date().toISOString().slice(0, 10);
      const prefix   = `[Flagged ${dateStr}: ${note.trim()}]`;
      const combined = existing ? `${prefix}\n${existing}` : prefix;
      properties["Trigger / Signal"] = {
        rich_text: [{ type: "text", text: { content: combined.slice(0, 2000) } }],
      };
    }

    await notion.pages.update({ page_id: opportunityId, properties });
    return NextResponse.json({ ok: true, opportunityId });
  } catch (err) {
    return NextResponse.json({ error: "Notion update failed", detail: String(err) }, { status: 502 });
  }
}
