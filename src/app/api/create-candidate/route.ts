/**
 * POST /api/create-candidate
 *
 * Quick-creates an Opportunity Candidate from an inbox item.
 * Called from the InboxTriage component "+ Opportunity" button.
 *
 * Body:
 *   { fromName: string, from: string, subject: string, snippet?: string, gmailUrl?: string }
 *
 * Creates Opportunity Status="New" in Opportunities [OS v2] with:
 *   - Opportunity Name: derived from subject + fromName
 *   - Trigger / Signal: inbox context (fromName, email, snippet)
 *   - Source URL: Gmail thread URL
 *   - Opportunity Status: New, Follow-up Status: Needed, Scope: CH
 *
 * Field names verified against Notion schema 2026-04-13:
 *   "Opportunity Status" (select: New|Qualifying|Active|Stalled|Closed Won|Closed Lost)
 *   "Opportunity Type"   (select)
 *   "Trigger / Signal"   (rich_text) — replaces old "Pending Action"
 *   "Source URL"         (url)       — replaces old "Review URL"
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
        "Opportunity Name":   { title:  [{ text: { content: oppName } }] },
        "Opportunity Status": { select: { name: "New" } },
        "Follow-up Status":   { select: { name: "Needed" } },
        "Scope":              { select: { name: "CH" } },
        // "Account / Organization" is a relation — cannot set as free text from inbox signal.
        // Org context is encoded in Trigger / Signal instead.
        ...(signalContext ? { "Trigger / Signal": { rich_text: [{ text: { content: signalContext.slice(0, 2000) } }] } } : {}),
        ...(gmailUrl ? { "Source URL": { url: gmailUrl } } : {}),
      },
    });
    return NextResponse.json({ ok: true, candidateId: page.id, notionUrl: (page as { url?: string }).url ?? "" });
  } catch (err) {
    console.error("[create-candidate] Notion create failed:", err);
    return NextResponse.json({ error: "Failed to create candidate", detail: String(err) }, { status: 502 });
  }
}
