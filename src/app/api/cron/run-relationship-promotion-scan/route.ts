/**
 * GET /api/cron/run-relationship-promotion-scan
 *
 * Daily Vercel cron wrapper around POST /api/admin/relationship-promotion/scan.
 * Executes the operator (mode=execute, limit=50) so any new "Engatel pattern"
 * orgs surface in /admin/os automatically.
 *
 * Auth: x-agent-key: $CRON_SECRET (Vercel cron sends Authorization: Bearer
 * automatically; the inner POST handler accepts both forms).
 */

import { NextRequest, NextResponse } from "next/server";
import { withRoutineLog } from "@/lib/routine-log";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function _GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 500 });
  }
  // Vercel sends `authorization: Bearer $CRON_SECRET` for scheduled invocations.
  const auth = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const agentKey = req.headers.get("x-agent-key");
  if (auth !== cronSecret && agentKey !== cronSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Re-invoke the operator via internal fetch (preserves auth + isolation).
  const origin = req.nextUrl.origin;
  const upstream = await fetch(`${origin}/api/admin/relationship-promotion/scan`, {
    method: "POST",
    headers: {
      "x-agent-key": cronSecret,
      "content-type": "application/json",
    },
    body: JSON.stringify({ mode: "execute", limit: 50 }),
  });

  const json = await upstream.json().catch(() => ({}));
  return NextResponse.json(
    { ok: upstream.ok, status: upstream.status, result: json },
    { status: upstream.ok ? 200 : 502 },
  );
}

export const GET = withRoutineLog("cron-run-relationship-promotion-scan", _GET);
export const POST = GET;
