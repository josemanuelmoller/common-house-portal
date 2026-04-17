/**
 * PATCH /api/promote-candidate
 *
 * Promotes or ignores an Opportunity Candidate (Opportunity Status = "New").
 *   action "promote" → Opportunity Status = "Qualifying", Follow-up Status = "Needed"
 *   action "ignore"  → Opportunity Status = "Stalled",   Follow-up Status = "None"
 *                      If reason provided, prepends "[Ignored {date}: {reason}]" to Trigger/Signal
 *
 * Body: { candidateId: string, action: "promote" | "ignore", reason?: string }
 * Auth: adminGuardApi()
 *
 * Field names verified against Notion schema 2026-04-13.
 */

import { NextRequest, NextResponse } from "next/server";
import { Client } from "@notionhq/client";
import { adminGuardApi } from "@/lib/require-admin";
import { prop, text } from "@/lib/notion/core";
import { getSupabaseServerClient } from "@/lib/supabase-server";

const notion = new Client({ auth: process.env.NOTION_API_KEY });

export async function PATCH(req: NextRequest) {
  const guard = await adminGuardApi();
  if (guard) return guard;

  let body: { candidateId?: string; action?: string; reason?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const { candidateId, action, reason } = body;
  if (!candidateId) return NextResponse.json({ error: "candidateId required" }, { status: 400 });
  if (action !== "promote" && action !== "ignore") return NextResponse.json({ error: "action must be promote or ignore" }, { status: 400 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const properties: Record<string, any> = action === "promote"
    ? { "Opportunity Status": { select: { name: "Qualifying" } }, "Follow-up Status": { select: { name: "Needed" } } }
    : { "Opportunity Status": { select: { name: "Stalled" } },   "Follow-up Status": { select: { name: "None" } } };

  // For ignore actions, record the reason in Trigger/Signal
  if (action === "ignore" && reason && reason.trim()) {
    const page = await notion.pages.retrieve({ page_id: candidateId });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const existing = text(prop(page as any, "Trigger / Signal")) || "";
    const dateStr  = new Date().toISOString().slice(0, 10);
    const prefix   = `[Ignored ${dateStr}: ${reason.trim()}]`;
    const combined = existing ? `${prefix}\n${existing}` : prefix;
    properties["Trigger / Signal"] = {
      rich_text: [{ type: "text", text: { content: combined.slice(0, 2000) } }],
    };
  }

  try {
    await notion.pages.update({ page_id: candidateId, properties });

    // Dual-write to Supabase — makes status / follow_up_status live immediately
    try {
      const sb = getSupabaseServerClient();
      const sbStatus    = action === "promote" ? "Qualifying" : "Stalled";
      const sbFollowUp  = action === "promote" ? "Needed"     : "None";
      await sb.from("opportunities")
        .update({ status: sbStatus, follow_up_status: sbFollowUp, updated_at: new Date().toISOString() })
        .eq("notion_id", candidateId);
    } catch { /* non-critical */ }

    return NextResponse.json({ ok: true, candidateId, action });
  } catch (err) {
    return NextResponse.json({ error: "Notion update failed", detail: String(err) }, { status: 502 });
  }
}
