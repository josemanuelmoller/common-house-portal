/**
 * POST /api/maintenance/stale-decay
 *
 * Closes action_items that have stalled. Runs nightly via Vercel cron.
 * See docs/NORMALIZATION_ARCHITECTURE.md §10 (Stale and reopen).
 *
 * Rules:
 *   - status='open' AND no deadline AND last_motion_at < now() - 21 days
 *     → status='stale', resolved_reason='stale_decay'
 *   - status='open' WITH a deadline that passed > 7 days ago AND no fresh motion
 *     → status='resolved', resolved_reason='deadline_passed'
 *   - opportunities status='Stalled' untouched > 60 days
 *     → is_archived=true (2026-06-10: 44 of 84 open opportunities were
 *       Stalled, polluting every commercial surface; an opportunity nobody
 *       touched in two months is closed in everything but name)
 *
 * Items that get closed here can still be REOPENED (see persist.ts) when a
 * new substrate signal arrives — so this is non-destructive auto-archive,
 * not deletion. Archived opportunities are likewise un-archivable in the DB.
 */

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { withRoutineLog } from "@/lib/routine-log";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

function authCheck(req: NextRequest): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;
  if (req.headers.get("x-agent-key") === expected) return true;
  if (req.headers.get("authorization") === `Bearer ${expected}`) return true;
  return false;
}

const STALE_DAYS = 21;
const DEADLINE_GRACE_DAYS = 7;
const OPP_STALLED_ARCHIVE_DAYS = 60;

export const POST = withRoutineLog("maintenance-stale-decay", handle);
export const GET  = POST;

async function handle(req: NextRequest) {
  if (!authCheck(req)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const sb = getSupabaseServerClient();
  const now = new Date();
  const staleCutoff    = new Date(now.getTime() - STALE_DAYS * 86_400_000).toISOString();
  const deadlineCutoff = new Date(now.getTime() - DEADLINE_GRACE_DAYS * 86_400_000).toISOString();
  const nowIso = now.toISOString();

  // (1) Stale: open, no deadline, last_motion_at older than 21 days
  const { data: staleRows, error: staleErr } = await sb
    .from("action_items")
    .update({
      status:          "stale",
      resolved_at:     nowIso,
      resolved_reason: "stale_decay",
    })
    .eq("status", "open")
    .is("deadline", null)
    .lt("last_motion_at", staleCutoff)
    .select("id");
  if (staleErr) {
    return NextResponse.json({ ok: false, error: `stale_decay: ${staleErr.message}` }, { status: 500 });
  }

  // (2) Deadline passed > 7 days ago AND no motion since deadline
  const { data: deadlineRows, error: deadlineErr } = await sb
    .from("action_items")
    .update({
      status:          "resolved",
      resolved_at:     nowIso,
      resolved_reason: "deadline_passed",
    })
    .eq("status", "open")
    .lt("deadline", deadlineCutoff)
    .lt("last_motion_at", deadlineCutoff)
    .select("id");
  if (deadlineErr) {
    return NextResponse.json({ ok: false, error: `deadline: ${deadlineErr.message}` }, { status: 500 });
  }

  // (3) Stalled opportunities with no real signal in > 60 days → archive
  // (reversible flag). NOTE: updated_at is useless here — the daily
  // sync-opportunities mirror bumps it on every run. last_signal_at is the
  // real-activity column; rows older than the cutoff with no signal since
  // (or no signal EVER) are closed in everything but name.
  const oppCutoff = new Date(now.getTime() - OPP_STALLED_ARCHIVE_DAYS * 86_400_000).toISOString();
  const { data: oppRows, error: oppErr } = await sb
    .from("opportunities")
    .update({
      is_archived: true,
      updated_at:  nowIso,
    })
    .eq("status", "Stalled")
    .eq("is_archived", false)
    .or(`last_signal_at.is.null,last_signal_at.lt.${oppCutoff}`)
    .lt("created_at", oppCutoff)
    .select("id");
  if (oppErr) {
    return NextResponse.json({ ok: false, error: `opp_archive: ${oppErr.message}` }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    stale_decayed:    (staleRows ?? []).length,
    deadline_passed:  (deadlineRows ?? []).length,
    stalled_opps_archived: (oppRows ?? []).length,
    cutoffs: { stale_days: STALE_DAYS, deadline_grace_days: DEADLINE_GRACE_DAYS, opp_stalled_archive_days: OPP_STALLED_ARCHIVE_DAYS },
  });
}
