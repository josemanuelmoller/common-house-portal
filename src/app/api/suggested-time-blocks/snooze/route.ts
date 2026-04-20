/**
 * POST /api/suggested-time-blocks/snooze
 * Body: { id: string, hours?: number }
 *
 * Marks the suggestion snoozed until (now + hours). Default 24h.
 * The fingerprint won't be re-proposed until the snooze window ends.
 */

import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "@clerk/nextjs/server";
import { adminGuardApi } from "@/lib/require-admin";
import { getSupabaseServerClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const guard = await adminGuardApi();
  if (guard) return guard;

  const user = await currentUser();
  const email = user?.primaryEmailAddress?.emailAddress;
  if (!email) return NextResponse.json({ error: "No email" }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  const { id, hours } = body as { id?: string; hours?: number };
  if (!id || typeof id !== "string") {
    return NextResponse.json({ error: "id_required" }, { status: 400 });
  }
  const snoozeHours = typeof hours === "number" && hours > 0 && hours <= 168 ? hours : 24;
  const until = new Date(Date.now() + snoozeHours * 3600_000);

  const sb = getSupabaseServerClient();
  const { error } = await sb
    .from("suggested_time_blocks")
    .update({ status: "snoozed", snoozed_until: until.toISOString() })
    .eq("id", id)
    .eq("user_email", email);
  if (error) return NextResponse.json({ error: "db", message: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, snoozed_until: until.toISOString() });
}
