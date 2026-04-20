/**
 * GET /api/hall-manual-triggers-status
 *
 * Returns the last successful run timestamp for each manual-trigger target
 * (calendar, gmail, meetings). Used by the Hall "Manual refresh" panel to
 * show "last synced X ago" under each button.
 *
 * Auth: adminGuardApi()
 */

import { NextResponse } from "next/server";
import { adminGuardApi } from "@/lib/require-admin";
import { getSupabaseServerClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

type Status = {
  last_run_at:   string | null;
  last_status:   "success" | "error" | "unknown" | null;
};

async function calendarStatus(): Promise<Status> {
  const sb = getSupabaseServerClient();
  const { data } = await sb
    .from("hall_calendar_sync_state")
    .select("last_full_sync_at, last_delta_sync_at")
    .eq("scope", "primary")
    .maybeSingle();
  const row = data as { last_full_sync_at: string | null; last_delta_sync_at: string | null } | null;
  const latest = [row?.last_full_sync_at, row?.last_delta_sync_at]
    .filter((x): x is string => !!x)
    .sort()
    .pop() ?? null;
  return { last_run_at: latest, last_status: latest ? "success" : null };
}

async function routineStatus(routineName: string): Promise<Status> {
  const sb = getSupabaseServerClient();
  const { data } = await sb
    .from("routine_latest_runs")
    .select("started_at, finished_at, status")
    .eq("routine_name", routineName)
    .maybeSingle();
  const row = data as { started_at: string | null; finished_at: string | null; status: string | null } | null;
  if (!row) return { last_run_at: null, last_status: null };
  const stamp = row.finished_at ?? row.started_at;
  const status: Status["last_status"] =
    row.status === "success" ? "success"
    : row.status === "error" ? "error"
    : "unknown";
  return { last_run_at: stamp ?? null, last_status: status };
}

export async function GET() {
  const guard = await adminGuardApi();
  if (guard) return guard;

  try {
    const [calendar, gmail, meetings] = await Promise.all([
      calendarStatus(),
      routineStatus("ingest-gmail"),
      routineStatus("fireflies-sync"),
    ]);
    return NextResponse.json({ ok: true, calendar, gmail, meetings });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
