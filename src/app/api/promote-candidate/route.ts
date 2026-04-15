/**
 * PATCH /api/promote-candidate
 *
 * Promotes or ignores an Opportunity Candidate (Opportunity Status = "New").
 *   action "promote" → Opportunity Status = "Qualifying", Follow-up Status = "Needed"
 *   action "ignore"  → Opportunity Status = "Stalled",   Follow-up Status = "None"
 *
 * Body: { candidateId: string, action: "promote" | "ignore" }
 * Auth: adminGuardApi()
 *
 * Field names verified against Notion schema 2026-04-13.
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
    ? { "Opportunity Status": { select: { name: "Qualifying" } }, "Follow-up Status": { select: { name: "Needed" } } }
    : { "Opportunity Status": { select: { name: "Stalled" } },   "Follow-up Status": { select: { name: "None" } } };

  try {
    await notion.pages.update({ page_id: candidateId, properties });
    return NextResponse.json({ ok: true, candidateId, action });
  } catch (err) {
    return NextResponse.json({ error: "Notion update failed", detail: String(err) }, { status: 502 });
  }
}
