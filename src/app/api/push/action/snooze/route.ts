/**
 * POST /api/push/action/snooze?action=snooze-1h&tag=ch-decision
 *
 * Fired by the SW notificationclick handler when user taps a snooze action.
 * For now this is a stub — Fase 5 minimum just acknowledges the click.
 * Future enhancement: write a row to a `push_snoozes` table so the next
 * digest/cron knows to skip that signal until the snooze expires.
 */

import { NextResponse } from "next/server";
import { adminGuardApi } from "@/lib/require-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const guard = await adminGuardApi();
  if (guard) return guard;
  const { searchParams } = new URL(req.url);
  const action = searchParams.get("action");
  const tag = searchParams.get("tag");
  console.log("[push] snooze action:", { action, tag });
  return NextResponse.json({ ok: true, action, tag });
}
