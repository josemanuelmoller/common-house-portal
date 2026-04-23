/**
 * GET  /api/user-identity
 * POST /api/user-identity
 *
 * Reads / writes the singleton `user_identity` row (Capa 2). This row is
 * injected into every contact-intelligence prompt so Haiku never attributes
 * a user-owned organisation to another contact.
 *
 * POST body:
 *   {
 *     user_name:          string,
 *     user_aliases:       string[],
 *     user_own_orgs:      Array<{name: string, role?: string, stake?: string, notes?: string}>,
 *     user_role_classes:  string[],
 *     additional_context: string,
 *   }
 *
 * Auth: adminGuardApi()
 */
import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "@clerk/nextjs/server";
import { adminGuardApi } from "@/lib/require-admin";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { getUserIdentity, type OwnOrg } from "@/lib/user-identity";

export const dynamic = "force-dynamic";

export async function GET() {
  const guard = await adminGuardApi();
  if (guard) return guard;
  const user  = await currentUser();
  const email = user?.primaryEmailAddress?.emailAddress?.toLowerCase();
  const identity = await getUserIdentity(email);
  return NextResponse.json({ ok: true, identity });
}

export async function POST(req: NextRequest) {
  const guard = await adminGuardApi();
  if (guard) return guard;

  let body: {
    user_name?:          string;
    user_aliases?:       unknown;
    user_own_orgs?:      unknown;
    user_role_classes?:  unknown;
    additional_context?: string | null;
  };
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  const user_name = (body.user_name ?? "").trim();
  if (!user_name) return NextResponse.json({ error: "user_name required" }, { status: 400 });
  if (user_name.length > 120) return NextResponse.json({ error: "user_name too long" }, { status: 400 });

  const user_aliases = Array.isArray(body.user_aliases)
    ? body.user_aliases.filter((s): s is string => typeof s === "string" && s.trim().length > 0)
                        .map(s => s.trim()).slice(0, 20)
    : [];

  const user_role_classes = Array.isArray(body.user_role_classes)
    ? body.user_role_classes.filter((s): s is string => typeof s === "string" && s.trim().length > 0)
                            .map(s => s.trim()).slice(0, 10)
    : [];

  const user_own_orgs: OwnOrg[] = [];
  if (Array.isArray(body.user_own_orgs)) {
    for (const raw of body.user_own_orgs) {
      if (!raw || typeof raw !== "object") continue;
      const r = raw as Record<string, unknown>;
      const name = typeof r.name === "string" ? r.name.trim() : "";
      if (!name) continue;
      user_own_orgs.push({
        name,
        role:  typeof r.role  === "string" && r.role.trim()  ? r.role.trim()  : null,
        stake: typeof r.stake === "string" && r.stake.trim() ? r.stake.trim() : null,
        notes: typeof r.notes === "string" && r.notes.trim() ? r.notes.trim() : null,
      });
      if (user_own_orgs.length >= 15) break;
    }
  }

  const user_role_context = typeof body.additional_context === "string"
    ? body.additional_context.trim().slice(0, 2000) || null
    : null;

  // Key by the logged-in admin's Clerk email so multi-user works later.
  const user = await currentUser();
  const user_email = (user?.primaryEmailAddress?.emailAddress ?? "").toLowerCase();
  if (!user_email) return NextResponse.json({ error: "could not resolve current user email" }, { status: 401 });

  const sb = getSupabaseServerClient();
  const { error } = await sb.from("user_identity").upsert({
    user_email,
    user_name,
    user_aliases,
    user_own_orgs,
    user_role_classes,
    user_role_context,
    updated_at: new Date().toISOString(),
  }, { onConflict: "user_email" });
  if (error) return NextResponse.json({ error: error.message }, { status: 502 });

  const identity = await getUserIdentity(user_email);
  return NextResponse.json({ ok: true, identity });
}
