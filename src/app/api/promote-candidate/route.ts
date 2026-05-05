/**
 * PATCH /api/promote-candidate
 *
 * Promotes or ignores an Opportunity Candidate (Opportunity Status = "New").
 *   action "promote" → status = "Qualifying", follow_up_status = "Needed"
 *   action "ignore"  → status = "Stalled",   follow_up_status = "None"
 *                      If reason provided, prepends "[Ignored {date}: {reason}]" to trigger_signal.
 *
 * Body: { candidateId: string, action: "promote" | "ignore", reason?: string }
 * Auth: adminGuardApi()
 *
 * notion-cutoff-2026-06-02: replaced by canonical write to opportunities (Supabase).
 * Per docs/SUPABASE_CONSOLIDATION_FREEZE.md §3.2 the canonical store is `public.opportunities`;
 * `candidateId` is the legacy Notion page id, used as the upsert key on `notion_id`.
 */

import { NextRequest, NextResponse } from "next/server";
import { adminGuardApi } from "@/lib/require-admin";
import { getSupabaseServerClient } from "@/lib/supabase-server";

export async function PATCH(req: NextRequest) {
  const guard = await adminGuardApi();
  if (guard) return guard;

  let body: { candidateId?: string; action?: string; reason?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const { candidateId, action, reason } = body;
  if (!candidateId) return NextResponse.json({ error: "candidateId required" }, { status: 400 });
  if (action !== "promote" && action !== "ignore") return NextResponse.json({ error: "action must be promote or ignore" }, { status: 400 });

  const sbStatus    = action === "promote" ? "Qualifying" : "Stalled";
  const sbFollowUp  = action === "promote" ? "Needed"     : "None";
  const updatePayload: Record<string, unknown> = {
    status:           sbStatus,
    follow_up_status: sbFollowUp,
    updated_at:       new Date().toISOString(),
  };

  try {
    const sb = getSupabaseServerClient();

    // For ignore actions, prepend the reason to trigger_signal.
    if (action === "ignore" && reason && reason.trim()) {
      const { data: existingRow } = await sb
        .from("opportunities")
        .select("trigger_signal")
        .eq("notion_id", candidateId)
        .maybeSingle();

      const existing = (existingRow?.trigger_signal ?? "") as string;
      const dateStr  = new Date().toISOString().slice(0, 10);
      const prefix   = `[Ignored ${dateStr}: ${reason.trim()}]`;
      const combined = existing ? `${prefix}\n${existing}` : prefix;
      updatePayload.trigger_signal = combined.slice(0, 2000);
      updatePayload.pending_action = combined.slice(0, 2000);
    }

    // notion-cutoff-2026-06-02: replaced by canonical write to opportunities
    // const properties = action === "promote"
    //   ? { "Opportunity Status": { select: { name: "Qualifying" } }, "Follow-up Status": { select: { name: "Needed" } } }
    //   : { "Opportunity Status": { select: { name: "Stalled" } },   "Follow-up Status": { select: { name: "None" } } };
    // if (ignore && reason) properties["Trigger / Signal"] = { rich_text: [{ text: { content: combined } }] };
    // await notion.pages.update({ page_id: candidateId, properties });
    const { error } = await sb
      .from("opportunities")
      .update(updatePayload)
      .eq("notion_id", candidateId);

    if (error) {
      return NextResponse.json({ error: "Supabase update failed", detail: error.message }, { status: 502 });
    }

    return NextResponse.json({ ok: true, candidateId, action });
  } catch (err) {
    return NextResponse.json({ error: "Update failed", detail: String(err) }, { status: 502 });
  }
}
