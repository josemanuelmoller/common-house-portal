/**
 * POST /api/xero/sync   (GET delegates to the same handler)
 *
 * Pulls ACCREC invoices from Xero into revenue_events. Idempotent.
 *
 * Auth (either is accepted):
 *   - CRON_SECRET via `Authorization: Bearer <secret>` or `x-agent-key` header
 *     (cron / agent / the chained compute-kpi run)
 *   - an admin Clerk session (so José can trigger it from the browser)
 *
 * Returns the sync stats. 409 if Xero isn't connected yet; 502 on a Xero/API
 * failure; 200 on success.
 */

import { NextRequest, NextResponse } from "next/server";
import { adminGuardApi } from "@/lib/require-admin";
import { withRoutineLog } from "@/lib/routine-log";
import { syncXeroRevenue } from "@/lib/xero-sync";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

function cronAuthOk(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  if (req.headers.get("x-agent-key") === secret) return true;
  if (req.headers.get("authorization") === `Bearer ${secret}`) return true;
  return false;
}

async function _POST(req: NextRequest) {
  if (!cronAuthOk(req)) {
    const guard = await adminGuardApi();
    if (guard) return guard; // not admin and no cron secret → 401/403
  }

  const result = await syncXeroRevenue();
  const status = result.ok ? 200 : result.reason === "not_connected" || result.reason === "no_tenant" ? 409 : 502;
  return NextResponse.json(result, { status });
}

export const POST = withRoutineLog("xero-sync", _POST);
export const GET = POST;
