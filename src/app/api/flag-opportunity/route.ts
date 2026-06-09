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
 * notion-cutoff-2026-06-02: replaced by canonical write to opportunities (Supabase).
 * Per docs/SUPABASE_CONSOLIDATION_FREEZE.md §3.2 the canonical store for opportunities
 * is `public.opportunities`. The opportunityId received in the body is the
 * legacy Notion page id, which is also the upsert key (`notion_id`) on the
 * Supabase row.
 *
 * Auth: adminGuardApi()
 */

import { NextRequest, NextResponse } from "next/server";
import { adminGuardApi } from "@/lib/require-admin";
import { getSupabaseServerClient } from "@/lib/supabase-server";

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
    const sb = getSupabaseServerClient();

    // Build update payload — always set follow_up_status; optionally prepend a
    // dated flag prefix to the trigger_signal column.
    const updatePayload: Record<string, unknown> = {
      follow_up_status: "Needed",
      updated_at:       new Date().toISOString(),
    };

    if (note && note.trim()) {
      // Read existing trigger_signal so we can prepend the new flag prefix.
      const { data: existingRow } = await sb
        .from("opportunities")
        .select("trigger_signal")
        .eq("notion_id", opportunityId)
        .maybeSingle();

      const existing = (existingRow?.trigger_signal ?? "") as string;
      const dateStr  = new Date().toISOString().slice(0, 10);
      const prefix   = `[Flagged ${dateStr}: ${note.trim()}]`;
      const combined = existing ? `${prefix}\n${existing}` : prefix;
      updatePayload.trigger_signal = combined.slice(0, 2000);
      updatePayload.pending_action = combined.slice(0, 2000);
    }

    // notion-cutoff-2026-06-02: replaced by canonical write to opportunities
    // const properties: Record<string, any> = { "Follow-up Status": { select: { name: "Needed" } } };
    // if (note) properties["Trigger / Signal"] = { rich_text: [{ text: { content: combined.slice(0, 2000) } }] };
    // await notion.pages.update({ page_id: opportunityId, properties });
    const { error } = await sb
      .from("opportunities")
      .update(updatePayload)
      .eq("notion_id", opportunityId);

    if (error) {
      return NextResponse.json({ error: "Supabase update failed", detail: error.message }, { status: 502 });
    }

    return NextResponse.json({ ok: true, opportunityId });
  } catch (err) {
    return NextResponse.json({ error: "Update failed" }, { status: 502 });
  }
}
