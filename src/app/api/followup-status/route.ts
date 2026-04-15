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

const STATUS_TO_LOOP: Record<string, { status: LoopStatus; action: ActionType } | null> = {
  "In Progress": { status: "in_progress", action: "marked_in_progress" },
  "Done":        { status: "resolved",    action: "resolved" },
  "Dropped":     { status: "dismissed",   action: "dismissed" },
  "Waiting":     { status: "open",        action: "updated" },
  "Needed":      { status: "open",        action: "updated" },
  "Sent":        { status: "open",        action: "updated" },
  "None":        null,
};

/** Write a loop_action (and optionally transition loop status) for the matching loop. Fire-and-forget. */
async function syncLoopAction(opportunityId: string, newStatus: string): Promise<void> {
  const transition = STATUS_TO_LOOP[newStatus];
  if (!transition) return;

  try {
    const sb = getSupabaseServerClient();

    // Find the loop(s) linked to this opportunity
    const { data: loops } = await sb
      .from("loops")
      .select("id, status")
      .eq("linked_entity_id", opportunityId)
      .eq("linked_entity_type", "opportunity");

    if (!loops || loops.length === 0) return;

    for (const loop of loops) {
      // Transition status if changed
      if (loop.status !== transition.status) {
        await sb.from("loops").update({
          status:         transition.status,
          last_action_at: new Date().toISOString(),
          updated_at:     new Date().toISOString(),
        }).eq("id", loop.id);
      }

      // Record action
      await sb.from("loop_actions").insert({
        loop_id:     loop.id,
        action_type: transition.action,
        actor:       "jose",
        note:        `Follow-up status set to "${newStatus}"`,
      });
    }
  } catch {
    // Loop Engine is best-effort — never fail the Notion write because of it
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

    // Fire-and-forget: sync to Loop Engine (never blocks the response)
    syncLoopAction(opportunityId, status).catch(() => {});

    return NextResponse.json({ ok: true, opportunityId, status });
  } catch (err) {
    console.error("[followup-status] Notion update failed:", err);
    return NextResponse.json(
      { error: "Failed to update Notion record", detail: err instanceof Error ? err.message : String(err) },
      { status: 502 }
    );
  }
}
