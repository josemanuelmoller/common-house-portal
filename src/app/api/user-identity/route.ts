/**
 * GET  /api/user-identity  → fetch the single user_identity row
 * POST /api/user-identity  → upsert (admin only)
 *
 * Body for POST:
 *   {
 *     user_name: string,
 *     user_aliases: string[],
 *     user_own_orgs: string[],
 *     user_role_context: string
 *   }
 *
 * user_email comes from the authenticated Clerk session (never trust body).
 *
 * Auth: adminGuardApi()
 */
import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "@clerk/nextjs/server";
import { adminGuardApi } from "@/lib/require-admin";
import { getSupabaseServerClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

export async function GET() {
  const guard = await adminGuardApi();
  if (guard) return guard;
  const sb = getSupabaseServerClient();
  const { data } = await sb
    .from("user_identity")
    .select("user_email, user_name, user_aliases, user_own_orgs, user_role_context, updated_at")
    .limit(1)
    .maybeSingle();
  return NextResponse.json({ ok: true, identity: data ?? null });
}

export async function POST(req: NextRequest) {
  const guard = await adminGuardApi();
  if (guard) return guard;

  const user = await currentUser();
  const email = user?.primaryEmailAddress?.emailAddress?.toLowerCase();
  if (!email) return NextResponse.json({ error: "no user email on session" }, { status: 400 });

  let body: {
    user_name?:         string | null;
    user_aliases?:      string[];
    user_own_orgs?:     string[];
    user_role_context?: string | null;
  };
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  const clean = {
    user_email:        email,
    user_name:         body.user_name?.trim() || null,
    user_aliases:      (body.user_aliases ?? []).map(s => s.trim()).filter(Boolean),
    user_own_orgs:     (body.user_own_orgs ?? []).map(s => s.trim()).filter(Boolean),
    user_role_context: body.user_role_context?.trim() || null,
    updated_at:        new Date().toISOString(),
  };

  const sb = getSupabaseServerClient();
  const { data, error } = await sb
    .from("user_identity")
    .upsert(clean, { onConflict: "user_email" })
    .select("user_email, user_name, user_aliases, user_own_orgs, user_role_context, updated_at")
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, identity: data });
}
