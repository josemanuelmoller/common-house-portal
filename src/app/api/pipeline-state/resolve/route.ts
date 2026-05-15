/**
 * POST /api/pipeline-state/resolve
 *
 * Body: {
 *   entityType: 'organization' | 'opportunity',
 *   entityId: string,
 *   reason: 'ball_with_jose' | 'ball_with_them' | 'drift' | 'pre_meeting',
 *   closeUnderlying?: boolean  // defaults true — also closes action_items / decision_items
 * }
 *
 * Marks a Pipeline State row resolved manually. When closeUnderlying=true
 * (default) it also resolves the underlying entities so the row doesn't
 * re-surface on the next render. For drift on an organization, applies a
 * 30-day snooze as soft dormancy.
 */

import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "@clerk/nextjs/server";
import { adminGuardApi } from "@/lib/require-admin";
import { manualResolve, type Reason } from "@/lib/pipeline-state";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const VALID_REASONS: Reason[] = ["ball_with_jose", "ball_with_them", "drift", "pre_meeting"];

export async function POST(req: NextRequest) {
  const guard = await adminGuardApi();
  if (guard) return guard;

  const user = await currentUser();
  const email = user?.primaryEmailAddress?.emailAddress ?? null;

  let body: { entityType?: string; entityId?: string; reason?: string; closeUnderlying?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { entityType, entityId, reason, closeUnderlying } = body;
  if (entityType !== "organization" && entityType !== "opportunity") {
    return NextResponse.json({ error: "entityType must be organization|opportunity" }, { status: 400 });
  }
  if (!entityId || typeof entityId !== "string") {
    return NextResponse.json({ error: "entityId required" }, { status: 400 });
  }
  if (!reason || !VALID_REASONS.includes(reason as Reason)) {
    return NextResponse.json({ error: "reason invalid" }, { status: 400 });
  }

  const result = await manualResolve(
    entityType,
    entityId,
    reason as Reason,
    closeUnderlying !== false,
    email
  );
  return NextResponse.json({ ok: true, ...result });
}
