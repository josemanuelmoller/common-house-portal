/**
 * POST /api/push/action/snooze?action=snooze-1h&tag=ch-decision
 *
 * Fired by the SW notificationclick handler when the user taps a snooze
 * action on a Web Push notification. Persists a row to `push_snoozes`
 * keyed by (tag, user_id). The `sendPush` helper checks this table before
 * emitting and skips any tag that is currently snoozed for the user.
 *
 * Without this persistence the snooze was a no-op (B-004 audit, 2026-05-18).
 */

import { NextResponse } from "next/server";
import { currentUser } from "@clerk/nextjs/server";
import { adminGuardApi } from "@/lib/require-admin";
import { getSupabaseServerClient } from "@/lib/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ACTION_TO_HOURS: Record<string, number> = {
  "snooze-1h": 1,
  "snooze-3h": 3,
  "snooze-24h": 24,
};

export async function POST(req: Request) {
  const guard = await adminGuardApi();
  if (guard) return guard;

  const user = await currentUser();
  const userId = user?.id;
  const email = user?.primaryEmailAddress?.emailAddress ?? null;
  if (!userId) return NextResponse.json({ error: "no_user" }, { status: 400 });

  const { searchParams } = new URL(req.url);
  const action = searchParams.get("action") ?? "";
  const tag = searchParams.get("tag");
  if (!tag) return NextResponse.json({ error: "tag_required" }, { status: 400 });

  const hours = ACTION_TO_HOURS[action];
  if (!hours) return NextResponse.json({ error: "unknown_action", action }, { status: 400 });

  const snoozedUntil = new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
  const sb = getSupabaseServerClient();
  const { error } = await sb
    .from("push_snoozes")
    .upsert(
      { tag, user_id: userId, snoozed_until: snoozedUntil, snoozed_at: new Date().toISOString(), snoozed_by: email },
      { onConflict: "tag,user_id" },
    );

  if (error) return NextResponse.json({ error: "db", message: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, action, tag, snoozed_until: snoozedUntil });
}
