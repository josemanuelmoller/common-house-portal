/**
 * POST /api/reap-stale-drafts
 *
 * Daily cleanup of stale agent drafts — CANONICAL `agent_drafts` table.
 *
 * (Until 2026-06-10 this swept the `notion_agent_drafts` MIRROR, which froze
 * at the Notion cutoff — so the canonical queue accumulated a 37-draft
 * graveyard going back to 2026-05-06 while the reaper polished a dead table.)
 *
 * Tier model (canonical has no staled_at column; updated_at is the clock):
 *   - Pending Review / Revision Requested untouched for 14d+ → Auto-archived.
 *     A draft nobody approved in two weeks is dead — keeping it "pending"
 *     just buries the fresh ones.
 *   - Approved / Draft Created untouched for 21d+ → Auto-archived.
 *     Approved-but-never-sent for three weeks means the moment passed.
 *
 * Rows are preserved (status flip only); nothing is deleted.
 *
 * Auth: x-agent-key OR Authorization: Bearer <CRON_SECRET>.
 * Cron: 03:30 UTC daily (vercel.json).
 */

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { withRoutineLog } from "@/lib/routine-log";

const PENDING_ARCHIVE_DAYS = 14;
const APPROVED_ARCHIVE_DAYS = 21;

function isAuthorized(req: NextRequest): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;
  const agentKey  = req.headers.get("x-agent-key");
  const cronToken = req.headers.get("authorization");
  if (agentKey === expected) return true;
  if (cronToken === `Bearer ${expected}`) return true;
  return false;
}

async function archiveOlderThan(
  statuses: string[],
  cutoffIso: string,
): Promise<{ archived: number; error?: string }> {
  const sb = getSupabaseServerClient();
  const { data, error } = await sb
    .from("agent_drafts")
    .update({ status: "Auto-archived", updated_at: new Date().toISOString() })
    .in("status", statuses)
    .lt("updated_at", cutoffIso)
    .select("id");
  if (error) return { archived: 0, error: error.message };
  return { archived: (data ?? []).length };
}

async function _POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = Date.now();
  const pendingCutoff  = new Date(now - PENDING_ARCHIVE_DAYS * 86_400_000).toISOString();
  const approvedCutoff = new Date(now - APPROVED_ARCHIVE_DAYS * 86_400_000).toISOString();

  const pending  = await archiveOlderThan(["Pending Review", "Revision Requested"], pendingCutoff);
  const approved = await archiveOlderThan(["Approved", "Draft Created"], approvedCutoff);

  const errors = [pending.error, approved.error].filter(Boolean) as string[];
  if (errors.length > 0) {
    return NextResponse.json(
      { error: "reap failed", detail: errors.join(" · ") },
      { status: 500 },
    );
  }

  const archived = pending.archived + approved.archived;
  return NextResponse.json({
    ok: true,
    records_read: archived,
    records_written: archived,
    archived_pending: pending.archived,
    archived_approved: approved.archived,
    notes: `auto-archived ${pending.archived} pending(>${PENDING_ARCHIVE_DAYS}d) + ${approved.archived} approved(>${APPROVED_ARCHIVE_DAYS}d)`,
  });
}

export const POST = withRoutineLog("reap-stale-drafts", _POST);
export const GET = POST;
