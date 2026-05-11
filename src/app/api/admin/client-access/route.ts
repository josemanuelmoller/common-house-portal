/**
 * POST /api/admin/client-access
 *   Grants a Clerk user access to a project (by hall_slug).
 *   Body: { email, slug, role?, expiresAt? }
 *   - email     — recipient's email (must match a Clerk user; lookup at write time)
 *   - slug      — projects.hall_slug
 *   - role      — 'viewer' | 'collaborator' (default 'viewer')
 *   - expiresAt — ISO timestamp, optional (no expiry if omitted)
 *
 * DELETE /api/admin/client-access?email=...&slug=...&reason=...
 *   Revokes the active grant (sets revoked_at). Multiple revokes are idempotent.
 *
 * GET /api/admin/client-access?slug=...
 *   Lists all grants (active + revoked) for a project.
 *
 * Auth: adminGuardApi() — admin Clerk session only.
 */

import { NextRequest, NextResponse } from "next/server";
import { clerkClient } from "@clerk/nextjs/server";
import { adminGuardApi } from "@/lib/require-admin";
import { supabaseAdmin } from "@/lib/supabase";
import { currentUser } from "@clerk/nextjs/server";
import { apiError } from "@/lib/api-error";

async function findClerkUserIdByEmail(email: string): Promise<string | null> {
  try {
    const client = await clerkClient();
    const res = await client.users.getUserList({ emailAddress: [email] });
    if (res.data.length === 0) return null;
    return res.data[0].id;
  } catch {
    return null;
  }
}

async function getProjectIdBySlug(slug: string): Promise<string | null> {
  const sb = supabaseAdmin();
  const { data } = await sb
    .from("projects")
    .select("id")
    .eq("hall_slug", slug)
    .maybeSingle();
  return (data?.id as string | undefined) ?? null;
}

export async function POST(req: NextRequest) {
  const guard = await adminGuardApi();
  if (guard) return guard;

  let body: { email?: string; slug?: string; role?: string; expiresAt?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const email = (body.email ?? "").trim().toLowerCase();
  const slug = (body.slug ?? "").trim().toLowerCase();
  const role = body.role === "collaborator" ? "collaborator" : "viewer";
  const expiresAt = body.expiresAt ?? null;

  if (!email || !slug) {
    return NextResponse.json(
      { error: "email and slug are required" },
      { status: 400 }
    );
  }

  try {
    const projectId = await getProjectIdBySlug(slug);
    if (!projectId) {
      return NextResponse.json(
        { error: `No project found with slug: ${slug}` },
        { status: 404 }
      );
    }

    const clerkUserId = await findClerkUserIdByEmail(email);
    if (!clerkUserId) {
      return NextResponse.json(
        {
          error:
            "No Clerk user found for that email. The user must sign up to Clerk first (via the portal sign-up page) or you must invite them through the Clerk dashboard before granting access.",
        },
        { status: 404 }
      );
    }

    const me = await currentUser();
    const grantedBy =
      me?.primaryEmailAddress?.emailAddress ?? me?.id ?? "unknown-admin";

    const sb = supabaseAdmin();
    const { data, error } = await sb
      .from("client_access")
      .insert({
        clerk_user_id: clerkUserId,
        granted_email: email,
        project_id: projectId,
        role,
        granted_by: grantedBy,
        expires_at: expiresAt,
      })
      .select("id")
      .single();

    if (error) {
      // Unique-constraint hit means an active grant already exists.
      if (error.code === "23505") {
        return NextResponse.json(
          { error: "An active grant already exists for this user + project." },
          { status: 409 }
        );
      }
      return NextResponse.json({ error: error.message }, { status: 502 });
    }

    return NextResponse.json({ ok: true, id: data.id, projectId, clerkUserId });
  } catch (err) {
    return apiError(err, { route: "[/api/admin/client-access POST]" });
  }
}

export async function DELETE(req: NextRequest) {
  const guard = await adminGuardApi();
  if (guard) return guard;

  const url = new URL(req.url);
  const email = (url.searchParams.get("email") ?? "").trim().toLowerCase();
  const slug = (url.searchParams.get("slug") ?? "").trim().toLowerCase();
  const reason = url.searchParams.get("reason") ?? "admin-revoke";

  if (!email || !slug) {
    return NextResponse.json(
      { error: "email and slug query params required" },
      { status: 400 }
    );
  }

  try {
    const projectId = await getProjectIdBySlug(slug);
    if (!projectId) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }
    const clerkUserId = await findClerkUserIdByEmail(email);
    if (!clerkUserId) {
      return NextResponse.json({ error: "Clerk user not found" }, { status: 404 });
    }

    const me = await currentUser();
    const revokedBy =
      me?.primaryEmailAddress?.emailAddress ?? me?.id ?? "unknown-admin";

    const sb = supabaseAdmin();
    const { error, count } = await sb
      .from("client_access")
      .update({
        revoked_at: new Date().toISOString(),
        revoked_by: revokedBy,
        revoked_reason: reason,
      }, { count: "exact" })
      .eq("clerk_user_id", clerkUserId)
      .eq("project_id", projectId)
      .is("revoked_at", null);

    if (error) return NextResponse.json({ error: error.message }, { status: 502 });
    return NextResponse.json({ ok: true, revoked: count ?? 0 });
  } catch (err) {
    return apiError(err, { route: "[/api/admin/client-access DELETE]" });
  }
}

export async function GET(req: NextRequest) {
  const guard = await adminGuardApi();
  if (guard) return guard;

  const url = new URL(req.url);
  const slug = (url.searchParams.get("slug") ?? "").trim().toLowerCase();
  if (!slug) {
    return NextResponse.json({ error: "slug query param required" }, { status: 400 });
  }

  try {
    const projectId = await getProjectIdBySlug(slug);
    if (!projectId) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }
    const sb = supabaseAdmin();
    const { data, error } = await sb
      .from("client_access")
      .select(
        "id, clerk_user_id, granted_email, role, granted_by, granted_at, expires_at, revoked_at, revoked_by, revoked_reason"
      )
      .eq("project_id", projectId)
      .order("granted_at", { ascending: false });

    if (error) return NextResponse.json({ error: error.message }, { status: 502 });
    return NextResponse.json({ grants: data ?? [] });
  } catch (err) {
    return apiError(err, { route: "[/api/admin/client-access GET]" });
  }
}
