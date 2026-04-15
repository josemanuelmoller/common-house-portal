/**
 * POST /api/create-candidate
 *
 * Quick-creates an Opportunity Candidate from an inbox item.
 * Called from the InboxTriage component "+ Opportunity" button.
 *
 * Body:
 *   { fromName: string, from: string, subject: string, snippet?: string, gmailUrl?: string }
 *
 * Creates Stage="Candidate" in Opportunities [OS v2] with:
 *   - Opportunity Name: derived from subject + fromName
 *   - Organization: fromName
 *   - Pending Action: snippet summary (as signal context)
 *   - Review URL: Gmail thread URL
 *   - Stage: Candidate, Follow-up Status: Needed, Scope: CH
 *
 * Auth: adminGuardApi()
 */

import { NextRequest, NextResponse } from "next/server";
import { Client } from "@notionhq/client";
import { adminGuardApi } from "@/lib/require-admin";

const notion = new Client({ auth: process.env.NOTION_API_KEY });
const DB_OPPORTUNITIES = "687caa98594a41b595c9960c141be0c0";

export async function POST(req: NextRequest) {
  const guard = await adminGuardApi();
  if (guard) return guard;

  let body: { fromName?: string; from?: string; subject?: string; snippet?: string; gmailUrl?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const { fromName, from, subject, snippet, gmailUrl } = body;
  if (!fromName || !subject) return NextResponse.json({ error: "fromName and subject are required" }, { status: 400 });

  // Derive a concise opportunity name: truncate subject if needed + fromName
  const oppName = `${subject.slice(0, 70)} — ${fromName}`.slice(0, 100);
  const signalContext = snippet
    ? `Inbox signal: email from ${fromName}${from ? ` <${from}>` : ""}. Preview: ${snippet.slice(0, 300)}`
    : `Inbox signal: email from ${fromName}${from ? ` <${from}>` : ""}. Subject: ${subject}`;

  try {
    const page = await notion.pages.create({
      parent: { database_id: DB_OPPORTUNITIES },
      properties: {
        "Opportunity Name": { title:     [{ text: { content: oppName } }] },
        "Stage":            { select:    { name: "Candidate" } },
        "Follow-up Status": { select:    { name: "Needed" } },
        "Scope":            { select:    { name: "CH" } },
        "Organization":     { rich_text: [{ text: { content: fromName.slice(0, 200) } }] },
        ...(signalContext ? { "Pending Action": { rich_text: [{ text: { content: signalContext.slice(0, 2000) } }] } } : {}),
        ...(gmailUrl ? { "Review URL": { url: gmailUrl } } : {}),
      },
    });
    return NextResponse.json({ ok: true, candidateId: page.id, notionUrl: (page as { url?: string }).url ?? "" });
  } catch (err) {
    console.error("[create-candidate] Notion create failed:", err);
    return NextResponse.json({ error: "Failed to create candidate", detail: String(err) }, { status: 502 });
  }
}
