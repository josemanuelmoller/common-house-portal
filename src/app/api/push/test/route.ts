/**
 * POST /api/push/test
 * Sends a debug push to the current user. Used by the UI toggle's
 * "Probar" button. Auth: adminGuardApi().
 */

import { NextResponse } from "next/server";
import { currentUser } from "@clerk/nextjs/server";
import { adminGuardApi } from "@/lib/require-admin";
import { notifyTest } from "@/lib/push-notify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const guard = await adminGuardApi();
  if (guard) return guard;
  const user = await currentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await notifyTest(user.id);
  return NextResponse.json({ ok: true, ...result });
}
