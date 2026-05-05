/**
 * POST /api/reap-stale-drafts
 *
 * Phase 2.0 Step 4 — daily cleanup of stale agent drafts.
 *
 * Two-tier model:
 *   - Drafts in non-terminal status (Pending Review, Revision Requested,
 *     Draft Created) untouched for 48h+: set staled_at = now()
 *   - Drafts already staled for 5d+: status = 'Auto-archived' (preserves
 *     the row; UI hides them from the active list)
 *
 * Approved status is NOT staled — those are waiting for an explicit Send.
 *
 * Auth: x-agent-key OR Authorization: Bearer <CRON_SECRET>.
 * Cron: 03:30 UTC daily (vercel.json).
 */

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { withRoutineLog } from "@/lib/routine-log";

const STALE_AFTER_HOURS = 48;
const ARCHIVE_AFTER_DAYS_STALED = 5;

const STALEABLE_STATUSES = ["Pending Review", "Revision Requested", "Draft Created"];

function isAuthorized(req: NextRequest): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;
  const agentKey  = req.headers.get("x-agent-key");
  const cronToken = req.headers.get("authorization");
  if (agentKey === expected) return true;
  if (cronToken === `Bearer ${expected}`) return true;
  return false;
}

async function _POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sb = getSupabaseServerClient();
  const now = new Date();
  const staleCutoff   = new Date(now.getTime() - STALE_AFTER_HOURS * 3_600_000).toISOString();
  const archiveCutoff = new Date(now.getTime() - ARCHIVE_AFTER_DAYS_STALED * 86_400_000).toISOString();

  // Pass 1: mark drafts stale
  // - non-terminal status
  // - last_edited_at older than cutoff (or NULL)
  // - staled_at not yet set
  const { data: stalingRows, error: stalingErr } = await sb
    .from("notion_agent_drafts")
    .select("id, last_edited_at")
    .in("status", STALEABLE_STATUSES)
    .is("staled_at", null)
    .or(`last_edited_at.lt.${staleCutoff},last_edited_at.is.null`)
    .limit(500);

  if (stalingErr) {
    return NextResponse.json(
      { error: "stale lookup failed", detail: stalingErr.message },
      { status: 500 },
    );
  }

  const stalingIds = (stalingRows ?? []).map((r: { id: string }) => r.id);
  let staled = 0;
  if (stalingIds.length > 0) {
    const { error: updateErr } = await sb
      .from("notion_agent_drafts")
      .update({ staled_at: now.toISOString() })
      .in("id", stalingIds);
    if (updateErr) {
      return NextResponse.json(
        { error: "stale update failed", detail: updateErr.message },
        { status: 500 },
      );
    }
    staled = stalingIds.length;
  }

  // Pass 2: auto-archive long-staled drafts
  const { data: archiveRows, error: archiveErr } = await sb
    .from("notion_agent_drafts")
    .select("id")
    .lt("staled_at", archiveCutoff)
    .neq("status", "Auto-archived")
    .neq("status", "Sent")
    .limit(500);

  if (archiveErr) {
    return NextResponse.json(
      { error: "archive lookup failed", detail: archiveErr.message },
      { status: 500 },
    );
  }

  const archiveIds = (archiveRows ?? []).map((r: { id: string }) => r.id);
  let archived = 0;
  if (archiveIds.length > 0) {
    const { error: updateErr } = await sb
      .from("notion_agent_drafts")
      .update({ status: "Auto-archived" })
      .in("id", archiveIds);
    if (updateErr) {
      return NextResponse.json(
        { error: "archive update failed", detail: updateErr.message },
        { status: 500 },
      );
    }
    archived = archiveIds.length;
  }

  return NextResponse.json({
    ok: true,
    records_read: (stalingRows?.length ?? 0) + (archiveRows?.length ?? 0),
    records_written: staled + archived,
    staled,
    archived,
    notes: `staled ${staled}, archived ${archived}`,
  });
}

export const POST = withRoutineLog("reap-stale-drafts", _POST);
export const GET = POST;
