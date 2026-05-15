/**
 * POST /api/pipeline-state/snooze
 *
 * Body: { entityType: 'organization' | 'opportunity', entityId: string, days: number, reason?: string }
 *
 * Suppresses a Pipeline State row for N days. Generic snooze, reusable by
 * other Hall widgets that adopt the same hall_snoozes table.
 */

import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "@clerk/nextjs/server";
import { adminGuardApi } from "@/lib/require-admin";
import { snoozeEntity } from "@/lib/pipeline-state";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const guard = await adminGuardApi();
  if (guard) return guard;

  const user = await currentUser();
  const email = user?.primaryEmailAddress?.emailAddress ?? null;

  let body: { entityType?: string; entityId?: string; days?: number; reason?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { entityType, entityId, days, reason } = body;
  if (entityType !== "organization" && entityType !== "opportunity") {
    return NextResponse.json({ error: "entityType must be organization|opportunity" }, { status: 400 });
  }
  if (!entityId || typeof entityId !== "string") {
    return NextResponse.json({ error: "entityId required" }, { status: 400 });
  }
  const d = Number(days);
  if (!Number.isFinite(d) || d < 1 || d > 90) {
    return NextResponse.json({ error: "days must be 1..90" }, { status: 400 });
  }

  await snoozeEntity(entityType, entityId, d, reason ?? null, email);
  return NextResponse.json({ ok: true, snoozed_for_days: d });
}
