/**
 * POST /api/suggested-time-blocks/dismiss
 * Body: { id: string }
 *
 * Marks the suggestion dismissed. The fingerprint is remembered for 24h so
 * the same candidate isn't re-proposed on the next generation.
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

  const { id } = await req.json().catch(() => ({ id: null }));
  if (!id || typeof id !== "string") {
    return NextResponse.json({ error: "id_required" }, { status: 400 });
  }

  const sb = getSupabaseServerClient();
  const { error } = await sb
    .from("suggested_time_blocks")
    .update({ status: "dismissed", dismissed_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_email", email);
  if (error) return NextResponse.json({ error: "db", message: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
