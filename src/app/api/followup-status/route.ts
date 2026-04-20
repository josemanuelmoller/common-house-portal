/**
 * PATCH /api/followup-status
 *
 * Updates the "Follow-up Status" select on an Opportunity [OS v2] record.
 * Called by ChiefOfStaffDesk when the user changes a task's status.
 *
 * Also writes a loop_action to the Loop Engine when a matching loop exists
 * (normalized_key LIKE 'opportunity:{opportunityId}:%').
 *
 * Body: { opportunityId: string, status: TaskStatus }
 *
 * Valid statuses (maps to Follow-up Status select in Notion):
 *   "Needed"      → Todo (task is pending)
 *   "In Progress" → In Progress (actively working)
 *   "Waiting"     → Waiting on them (sent, awaiting reply)
 *   "Done"        → Done (task complete — item disappears from desk)
 *   "Dropped"     → Dropped (no longer pursuing — item disappears from desk)
 *   "Sent"        → Legacy alias for Waiting
 *   "None"        → Legacy: no status set
 *
 * Auth: adminGuardApi() — must be an authenticated admin session.
 */

import { NextRequest, NextResponse } from "next/server";
import { Client } from "@notionhq/client";
import { adminGuardApi } from "@/lib/require-admin";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import type { ActionType, LoopStatus } from "@/lib/loops";

const notion = new Client({ auth: process.env.NOTION_API_KEY });
const VALID_STATUSES = ["Needed", "In Progress", "Waiting", "Done", "Dropped", "Sent", "None"] as const;
type FollowUpStatus = (typeof VALID_STATUSES)[number];

type LoopTransition = {
  status: LoopStatus;
  action: ActionType;
  stampCol: "resolved_at" | "dismissed_at" | null;
};

const STATUS_TO_LOOP: Record<string, LoopTransition | null> = {
  "In Progress": { status: "in_progress", action: "marked_in_progress", stampCol: null },
  "Done":        { status: "resolved",    action: "resolved",           stampCol: "resolved_at" },
  "Dropped":     { status: "dismissed",   action: "dismissed",          stampCol: "dismissed_at" },
  "Waiting":     { status: "waiting",     action: "marked_waiting",     stampCol: null },
  "Needed":      { status: "open",        action: "updated",            stampCol: null },
  "Sent":        { status: "waiting",     action: "marked_waiting",     stampCol: null },
  "None":        null,
};

/**
 * Write a loop_action and transition loop status for all loops linked to this
 * opportunity. Awaited (not fire-and-forget) so the Hall button result reflects
 * the true end-to-end state. Failures are surfaced as a warning marker rather
 * than a 500 — a Notion success without loop sync is still partially valuable,
 * but we want the caller to KNOW when it's partial so the button can retry.
 */
async function syncLoopAction(
  opportunityId: string,
  newStatus: string,
): Promise<{ ok: boolean; loopsTouched: number; warning?: string }> {
  const transition = STATUS_TO_LOOP[newStatus];
  if (!transition) return { ok: true, loopsTouched: 0 };

  try {
    const sb = getSupabaseServerClient();

    const { data: loops, error: selectErr } = await sb
      .from("loops")
      .select("id, status")
      .eq("linked_entity_id", opportunityId)
      .eq("linked_entity_type", "opportunity");

    if (selectErr) {
      console.warn(`[followup-status] Loop lookup failed for ${opportunityId}:`, selectErr.message);
      return { ok: false, loopsTouched: 0, warning: `loop-lookup-failed: ${selectErr.message}` };
    }
    if (!loops || loops.length === 0) return { ok: true, loopsTouched: 0 };

    const nowIso = new Date().toISOString();
    let touched = 0;

    for (const loop of loops) {
      const updatePayload: Record<string, unknown> = {
        last_action_at: nowIso,
        updated_at:     nowIso,
      };
      if (loop.status !== transition.status) {
        updatePayload.status = transition.status;
        if (transition.stampCol) updatePayload[transition.stampCol] = nowIso;
      }

      const { error: updErr } = await sb.from("loops").update(updatePayload).eq("id", loop.id);
      if (updErr) {
        console.warn(`[followup-status] Loop update failed for ${loop.id}:`, updErr.message);
        continue;
      }

      const { error: insErr } = await sb.from("loop_actions").insert({
        loop_id:     loop.id,
        action_type: transition.action,
        actor:       "jose",
        note:        `Follow-up status set to "${newStatus}"`,
      });
      if (insErr) {
        console.warn(`[followup-status] loop_action insert failed for ${loop.id}:`, insErr.message);
      }
      touched++;
    }

    return { ok: true, loopsTouched: touched };
  } catch (err) {
    console.warn(`[followup-status] syncLoopAction threw for ${opportunityId}:`, err);
    return { ok: false, loopsTouched: 0, warning: `sync-threw: ${String(err)}` };
  }
}

export async function PATCH(req: NextRequest) {
  const guard = await adminGuardApi();
  if (guard) return guard;

  let body: { opportunityId?: string; status?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { opportunityId, status } = body;

  if (!opportunityId || typeof opportunityId !== "string") {
    return NextResponse.json({ error: "opportunityId is required" }, { status: 400 });
  }
  if (!status || !VALID_STATUSES.includes(status as FollowUpStatus)) {
    return NextResponse.json({ error: `status must be one of: ${VALID_STATUSES.join(", ")}` }, { status: 400 });
  }

  try {
    await notion.pages.update({
      page_id: opportunityId,
      properties: {
        "Follow-up Status": { select: { name: status } },
      },
    });

    // Dual-write to Supabase opportunities — makes follow_up_status live immediately
    try {
      const sb = getSupabaseServerClient();
      await sb.from("opportunities")
        .update({ follow_up_status: status, updated_at: new Date().toISOString() })
        .eq("notion_id", opportunityId);
    } catch (err) {
      console.warn("[followup-status] opportunities update failed (non-critical):", err);
    }

    // AWAIT the Loop Engine sync. Previously fire-and-forget, which led to
    // partial-persistence bugs in the Hall. If the loop part fails we still
    // return 200 (Notion write succeeded) but include a warning so the UI
    // can surface the partial state instead of pretending it's fully done.
    const loopSync = await syncLoopAction(opportunityId, status);

    return NextResponse.json({
      ok: true,
      opportunityId,
      status,
      loops_touched: loopSync.loopsTouched,
      loop_sync_ok:  loopSync.ok,
      ...(loopSync.warning ? { warning: loopSync.warning } : {}),
    });
  } catch (err) {
    console.error("[followup-status] Notion update failed:", err);
    return NextResponse.json(
      { error: "Failed to update Notion record", detail: err instanceof Error ? err.message : String(err) },
      { status: 502 }
    );
  }
}
