/**
 * Client-scoped access helpers.
 *
 * Mirrors require-admin.ts shape but for non-admin clients who only see
 * a single project via /hall/[slug]. Admin always passes through.
 *
 * Reads from public.client_access (Supabase) — the canonical mapping from
 * Clerk user → project(s) they can read. Service-role only; the table has
 * REVOKE ALL on anon/authenticated.
 */

import "server-only";
import { currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import { isAdminUser, isAdminEmail } from "./clients";
import { supabaseAdmin } from "./supabase";

export type ClientRole = "viewer" | "collaborator" | "approver";

export type ClientGrant = {
  projectId: string;
  hallSlug: string | null;
  role: ClientRole;
};

export type AccessOutcome =
  | { kind: "admin"; userId: string; email: string }
  | { kind: "client"; userId: string; email: string; grant: ClientGrant }
  | { kind: "denied"; reason: "unauthenticated" | "no-access" };

type GrantRow = {
  project_id: string;
  role: ClientRole;
  expires_at: string | null;
  projects?: { hall_slug: string | null } | { hall_slug: string | null }[] | null;
};

function verifiedPrimaryEmail(user: Awaited<ReturnType<typeof currentUser>>): string | null {
  const primary = user?.primaryEmailAddress;
  if (!primary || primary.verification?.status !== "verified") return null;
  return primary.emailAddress.trim().toLowerCase();
}

async function grantForProject(
  userId: string,
  verifiedEmail: string | null,
  projectId: string
): Promise<{ role: ClientRole; expires_at: string | null } | null> {
  const sb = supabaseAdmin();
  const { data: direct } = await sb
    .from("client_access")
    .select("role, expires_at")
    .eq("clerk_user_id", userId)
    .eq("project_id", projectId)
    .is("revoked_at", null)
    .maybeSingle();
  if (direct) return direct as { role: ClientRole; expires_at: string | null };
  if (!verifiedEmail) return null;

  const { data: pending } = await sb
    .from("client_access")
    .select("role, expires_at")
    .ilike("granted_email", verifiedEmail)
    .eq("project_id", projectId)
    .is("revoked_at", null)
    .maybeSingle();
  return (pending as { role: ClientRole; expires_at: string | null } | null) ?? null;
}

/**
 * List every active grant for the current Clerk user.
 * Returns empty array if user is not authenticated. Used by middleware
 * and by /hall (the listing/router page).
 */
export async function listGrantsForCurrentUser(): Promise<ClientGrant[]> {
  const user = await currentUser();
  if (!user) return [];
  const sb = supabaseAdmin();
  const select = "project_id, role, expires_at, projects(hall_slug)";
  const { data: direct } = await sb
    .from("client_access")
    .select(select)
    .eq("clerk_user_id", user.id)
    .is("revoked_at", null);
  const email = verifiedPrimaryEmail(user);
  const { data: emailRows } = email
    ? await sb
      .from("client_access")
      .select(select)
      .ilike("granted_email", email)
      .is("revoked_at", null)
    : { data: [] };
  const uniqueRows = new Map<string, GrantRow>();
  for (const row of [...(emailRows ?? []), ...(direct ?? [])] as GrantRow[]) {
    uniqueRows.set(row.project_id, row);
  }
  const now = Date.now();
  return [...uniqueRows.values()]
    .filter((row) => {
      const exp = row.expires_at;
      if (!exp) return true;
      return new Date(exp).getTime() > now;
    })
    .map((row) => {
      // Supabase nested select returns the joined row as either an object or an array
      // depending on the relationship cardinality; normalize to a single value.
      const proj = Array.isArray(row.projects) ? row.projects[0] : row.projects;
      return {
        projectId: row.project_id,
        hallSlug: proj?.hall_slug ?? null,
        role: row.role,
      };
    });
}

/**
 * Check if the current user has an active grant for a given project (by slug).
 * Returns the grant if found, null otherwise. Does NOT consider admin status —
 * use resolveAccessForSlug for the full check including admin bypass.
 */
export async function findGrantForSlug(
  slug: string
): Promise<ClientGrant | null> {
  const user = await currentUser();
  if (!user) return null;
  const sb = supabaseAdmin();
  const { data } = await sb
    .from("projects")
    .select("id, hall_slug")
    .eq("hall_slug", slug)
    .maybeSingle();
  if (!data) return null;
  const projectId = data.id as string;
  const grant = await grantForProject(user.id, verifiedPrimaryEmail(user), projectId);
  if (!grant) return null;
  if (grant.expires_at && new Date(grant.expires_at).getTime() <= Date.now()) {
    return null;
  }
  return {
    projectId,
    hallSlug: data.hall_slug as string | null,
    role: grant.role as ClientRole,
  };
}

/**
 * Full resolution: returns "admin" if the user is admin (full pass),
 * "client" if they hold a grant for this slug, or "denied" otherwise.
 *
 * Use this in /hall/[slug]/page.tsx. Do NOT use this in API routes —
 * those should use clientAccessGuardApi which returns NextResponse.
 */
export async function resolveAccessForSlug(slug: string): Promise<AccessOutcome> {
  const user = await currentUser();
  if (!user) return { kind: "denied", reason: "unauthenticated" };
  const email = user.primaryEmailAddress?.emailAddress ?? "";

  if (isAdminUser(user.id) || isAdminEmail(email)) {
    return { kind: "admin", userId: user.id, email };
  }

  const grant = await findGrantForSlug(slug);
  if (!grant) return { kind: "denied", reason: "no-access" };
  return { kind: "client", userId: user.id, email, grant };
}

/**
 * Page helper: enforces access or redirects.
 *  - Not authenticated → /sign-in
 *  - Authenticated but no grant and not admin → /no-access (read-only landing)
 *  - Admin → returns { kind: "admin" }
 *  - Client with grant → returns { kind: "client", grant }
 */
export async function requireClientAccessForSlug(slug: string): Promise<AccessOutcome> {
  const outcome = await resolveAccessForSlug(slug);
  if (outcome.kind === "denied" && outcome.reason === "unauthenticated") {
    redirect("/sign-in");
  }
  if (outcome.kind === "denied") {
    redirect("/no-access");
  }
  return outcome;
}

/**
 * API route helper: returns null when allowed, NextResponse when denied.
 * Use exactly like adminGuardApi() but for client-scoped routes.
 */
export async function clientAccessGuardApi(
  projectId: string,
  options?: { roles?: ClientRole[] }
): Promise<NextResponse | null> {
  const user = await currentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const email = user.primaryEmailAddress?.emailAddress ?? "";
  if (isAdminUser(user.id) || isAdminEmail(email)) return null;

  const data = await grantForProject(user.id, verifiedPrimaryEmail(user), projectId);
  if (!data) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (data.expires_at && new Date(data.expires_at).getTime() <= Date.now()) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (options?.roles && !options.roles.includes(data.role as ClientRole)) {
    return NextResponse.json({ error: "Insufficient project role" }, { status: 403 });
  }
  return null;
}
