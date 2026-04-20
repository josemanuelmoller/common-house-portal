/**
 * GET|POST /api/cron/observe-calendar
 *
 * Runs a delta sync of Jose's Google Calendar into hall_calendar_events and
 * updates hall_attendees.meeting_count correctly. Idempotent — repeated calls
 * within seconds only do work when Google actually has changes.
 *
 * Intended callers:
 *   - Vercel cron every 4h (Authorization: Bearer <CRON_SECRET>)
 *   - Admin one-off trigger from /admin/hall/contacts auto-refresh
 *     (uses Clerk admin session — see adminGuardApi fallback)
 */

import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "@clerk/nextjs/server";
import { isAdminUser, isAdminEmail } from "@/lib/clients";
import { syncCalendarDelta } from "@/lib/calendar-sync";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function authCheck(req: NextRequest): Promise<boolean> {
  const expected = process.env.CRON_SECRET;
  const agentKey  = req.headers.get("x-agent-key");
  const cronToken = req.headers.get("authorization");
  if (expected && agentKey  === expected)              return true;
  if (expected && cronToken === `Bearer ${expected}`)  return true;
  try {
    const user = await currentUser();
    if (!user) return false;
    const email = user.primaryEmailAddress?.emailAddress ?? "";
    if (isAdminUser(user.id) || isAdminEmail(email)) return true;
  } catch { /* noop */ }
  return false;
}

async function handle(req: NextRequest) {
  if (!(await authCheck(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const result = await syncCalendarDelta();
    return NextResponse.json(result, { status: result.ok ? 200 : 502 });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: "unhandled", detail: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}

export async function GET(req: NextRequest)  { return handle(req); }
export async function POST(req: NextRequest) { return handle(req); }
