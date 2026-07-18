import { NextRequest, NextResponse } from "next/server";
import { adminGuardApi } from "@/lib/require-admin";
import { isValidCronRequest } from "@/lib/require-cron";
import { getPortalHealth, getOnboardingReadiness } from "@/lib/portal-health";

/**
 * GET /api/portal-2/health          → Portal 2.0 data-integrity + env probe
 * GET /api/portal-2/health?project= → adds onboarding readiness for a project
 *
 * Auth: cron (CRON_SECRET) or admin. Returns 200 with { ok:false } when a table
 * or env check fails — callers should treat ok=false as a failure even on 200.
 */
export async function GET(req: NextRequest) {
  if (!isValidCronRequest(req)) {
    const adminFail = await adminGuardApi();
    if (adminFail) return adminFail;
  }
  const health = await getPortalHealth();
  const projectId = new URL(req.url).searchParams.get("project");
  const readiness = projectId ? await getOnboardingReadiness(projectId) : null;
  return NextResponse.json({ ...health, readiness });
}
