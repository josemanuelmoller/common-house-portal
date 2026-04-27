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
import { adminGuardApi } from "@/lib/require-admin";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { applyMirrorEdit, pushPending } from "@/lib/notion-mirror-push";

export async function PATCH(req: NextRequest) {
  const guard = await adminGuardApi();
  if (guard) return guard;

  let body: { opportunityId?: string; note?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const { opportunityId, note } = body;
  if (!opportunityId || typeof opportunityId !== "string") {
    return NextResponse.json({ error: "opportunityId required" }, { status: 400 });
  }

  // 1) Compose the changes. If a note is provided, prepend it to existing
  //    trigger_signal (read from Supabase mirror — already up to date).
  const changes: Record<string, unknown> = { follow_up_status: "Needed" };

  if (note && note.trim()) {
    const sb = getSupabaseServerClient();
    const { data } = await sb
      .from("opportunities")
      .select("trigger_signal")
      .eq("notion_id", opportunityId)
      .maybeSingle();
    const existing = (data?.trigger_signal as string | null) ?? "";
    const dateStr  = new Date().toISOString().slice(0, 10);
    const prefix   = `[Flagged ${dateStr}: ${note.trim()}]`;
    const combined = existing ? `${prefix}\n${existing}` : prefix;
    // trigger_signal isn't yet in FIELD_MAP for opportunities — write to mirror
    // directly here, while follow_up_status flows through applyMirrorEdit.
    await sb.from("opportunities")
      .update({ trigger_signal: combined.slice(0, 2000), updated_at: new Date().toISOString() })
      .eq("notion_id", opportunityId);
    // Note: trigger_signal won't sync back to Notion via the push module yet —
    // not in FIELD_MAP. Add it there if needed; for now Notion stays as-is.
  }

  // 2) Apply mirror edit + push to Notion.
  const apply = await applyMirrorEdit({ table: "opportunities", id: opportunityId, changes });
  if (!apply.ok) {
    return NextResponse.json({ error: "Mirror update failed", detail: apply.error }, { status: 500 });
  }
  const push = await pushPending("opportunities", opportunityId);

  return NextResponse.json({
    ok: true,
    opportunityId,
    notion_push:  push.ok ? "ok" : "pending_retry",
    notion_error: push.ok ? undefined : push.error,
  });
}
