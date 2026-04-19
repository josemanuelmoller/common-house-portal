/**
 * /api/cos-loops
 *
 * GET  — Returns open loops sorted by priority_score DESC.
 *         Used by getCoSTasks() as the Supabase-first read path.
 *
 * PATCH /:id (via query param ?id=) — Transitions a loop's status and
 *         records a loop_action. Called by ChiefOfStaffDesk when the user
 *         changes a task status on a loop-sourced task.
 *
 * Auth: adminGuardApi() — requires authenticated admin session.
 */

import { NextRequest, NextResponse } from "next/server";
import { adminGuardApi } from "@/lib/require-admin";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import type { ActionType, LoopStatus } from "@/lib/loops";

const STATUS_TO_ACTION: Record<string, { status: LoopStatus; action: ActionType }> = {
  "In Progress": { status: "in_progress", action: "marked_in_progress" },
  "Done":        { status: "resolved",    action: "resolved" },
  "Dropped":     { status: "dismissed",   action: "dismissed" },
  "Waiting":     { status: "open",        action: "updated" },
  "Needed":      { status: "open",        action: "updated" },
};

// ─── GET — list open loops ────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const guard = await adminGuardApi();
  if (guard) return guard;

  try {
    const sb = getSupabaseServerClient();
    const { data, error } = await sb
      .from("loops")
      .select("*")
      .in("status", ["open", "in_progress"])
      .order("priority_score", { ascending: false })
      .order("first_seen_at",  { ascending: true })
      .limit(50);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 502 });
    }

    return NextResponse.json({ ok: true, loops: data ?? [] });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

// ─── PATCH — transition loop status ──────────────────────────────────────────

export async function PATCH(req: NextRequest) {
  const guard = await adminGuardApi();
  if (guard) return guard;

  let body: { loopId?: string; status?: string; founderInterest?: string; note?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { loopId, status, founderInterest, note } = body;
  if (!loopId) return NextResponse.json({ error: "loopId required" }, { status: 400 });

  try {
    const sb = getSupabaseServerClient();

    // ── Branch A: founder_interest update (Watch / Interested / Drop) ──────────
    if (founderInterest !== undefined) {
      const VALID_INTEREST = new Set(["watching", "interested", "dropped", null]);
      if (!VALID_INTEREST.has(founderInterest)) {
        return NextResponse.json(
          { error: `Invalid founderInterest "${founderInterest}". Valid: watching, interested, dropped` },
          { status: 400 },
        );
      }

      const { error: updateErr } = await sb
        .from("loops")
        .update({
          founder_interest: founderInterest,
          last_action_at:   new Date().toISOString(),
          updated_at:       new Date().toISOString(),
        })
        .eq("id", loopId);

      if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 502 });

      await sb.from("loop_actions").insert({
        loop_id:     loopId,
        action_type: "updated",
        actor:       "jose",
        note:        `founder_interest → ${founderInterest ?? "null"}`,
      });

      return NextResponse.json({ ok: true, loopId, founderInterest });
    }

    // ── Branch B: status transition ────────────────────────────────────────────
    if (!status) return NextResponse.json({ error: "status or founderInterest required" }, { status: 400 });

    const transition = STATUS_TO_ACTION[status];
    if (!transition) {
      return NextResponse.json(
        { error: `Unknown status "${status}". Valid: ${Object.keys(STATUS_TO_ACTION).join(", ")}` },
        { status: 400 },
      );
    }

    const { error: updateErr } = await sb
      .from("loops")
      .update({
        status:         transition.status,
        last_action_at: new Date().toISOString(),
        updated_at:     new Date().toISOString(),
      })
      .eq("id", loopId);

    if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 502 });

    await sb.from("loop_actions").insert({
      loop_id:     loopId,
      action_type: transition.action,
      actor:       "jose",
      note:        note ?? null,
    });

    return NextResponse.json({ ok: true, loopId, status: transition.status });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
