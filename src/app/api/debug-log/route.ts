/**
 * POST /api/debug-log
 *
 * Diagnostic endpoint that writes a full error stack (no truncation) to
 * Supabase debug_log. Called from src/app/admin/error.tsx and from any
 * other place that wants to capture a server-error that Vercel's runtime
 * log truncates to ~240 chars.
 *
 * Auth: adminGuardApi() — same as other admin debug endpoints.
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
  const email = user?.primaryEmailAddress?.emailAddress ?? null;

  let body: { source?: string; url?: string; message?: string; stack?: string; digest?: string; metadata?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const sb = getSupabaseServerClient();
  const { data, error } = await sb
    .from("debug_log")
    .insert({
      source: body.source ?? "unknown",
      user_email: email,
      url: body.url ?? null,
      message: body.message ?? null,
      stack: body.stack ?? null,
      digest: body.digest ?? null,
      metadata: body.metadata ?? null,
    })
    .select("id")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, id: data?.id });
}
