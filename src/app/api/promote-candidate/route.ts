/**
 * PATCH /api/promote-candidate
 *
 * Promotes or ignores an Opportunity Candidate (Stage = "Candidate").
 *   action "promote" → Stage = "Active", Follow-up Status = "Needed"
 *   action "ignore"  → Stage = "Archived", Follow-up Status = "None"
 *
 * Body: { candidateId: string, action: "promote" | "ignore" }
 * Auth: adminGuardApi()
 */

import { NextRequest, NextResponse } from "next/server";
import { Client } from "@notionhq/client";
import { adminGuardApi } from "@/lib/require-admin";

const notion = new Client({ auth: process.env.NOTION_API_KEY });

export async function PATCH(req: NextRequest) {
  const guard = await adminGuardApi();
  if (guard) return guard;

  let body: { candidateId?: string; action?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const { candidateId, action } = body;
  if (!candidateId) return NextResponse.json({ error: "candidateId required" }, { status: 400 });
  if (action !== "promote" && action !== "ignore") return NextResponse.json({ error: "action must be promote or ignore" }, { status: 400 });

  const properties = action === "promote"
    ? { "Stage": { select: { name: "Active" } }, "Follow-up Status": { select: { name: "Needed" } } }
    : { "Stage": { select: { name: "Archived" } }, "Follow-up Status": { select: { name: "None" } } };

  try {
    await notion.pages.update({ page_id: candidateId, properties });
    return NextResponse.json({ ok: true, candidateId, action });
  } catch (err) {
    return NextResponse.json({ error: "Notion update failed", detail: String(err) }, { status: 502 });
  }
}
