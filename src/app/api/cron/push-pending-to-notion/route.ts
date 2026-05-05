/**
 * Cron route: drain pending pushes from Supabase mirror tables back to Notion.
 *
 * DEPRECATED (2026-05-05): the mirror layer this route drained is scheduled
 * for `DROP` at Phase 6 cutoff (2026-06-02). The route is now a no-op that
 * returns 200 OK with `deprecated: true` so existing cron schedules don't
 * raise alerts. The route file itself is slated for deletion at cutoff per
 * docs/SUPABASE_CONSOLIDATION_FREEZE.md §3.7.
 */

import { NextResponse } from "next/server";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

async function handle() {
  return NextResponse.json({
    ok: true,
    deprecated: true,
    message: "scheduled for removal at cutoff 2026-06-02",
  });
}

export async function GET()  { return handle(); }
export async function POST() { return handle(); }
