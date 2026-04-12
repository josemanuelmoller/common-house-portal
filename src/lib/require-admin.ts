/**
 * Admin auth helpers — use these instead of inline isAdminUser() calls.
 *
 * Checks both ADMIN_USER_IDS (Clerk userId) and ADMIN_EMAILS (email address),
 * so admin access works even when the production Clerk userId differs from dev.
 */

import { currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import { isAdminUser, isAdminEmail } from "./clients";

/** Server component / page: redirect to /hall if not admin */
export async function requireAdmin() {
  const user = await currentUser();
  if (!user) redirect("/sign-in");
  const email = user.primaryEmailAddress?.emailAddress ?? "";
  if (!isAdminUser(user.id) && !isAdminEmail(email)) redirect("/hall");
  return user;
}

/** API route: return 401/403 response if not admin, null if OK */
export async function adminGuardApi(): Promise<NextResponse | null> {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const email = user.primaryEmailAddress?.emailAddress ?? "";
  if (!isAdminUser(user.id) && !isAdminEmail(email)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return null;
}

/** Server action: throw if not admin */
export async function requireAdminAction() {
  const user = await currentUser();
  if (!user) throw new Error("Unauthorized");
  const email = user.primaryEmailAddress?.emailAddress ?? "";
  if (!isAdminUser(user.id) && !isAdminEmail(email)) throw new Error("Forbidden");
  return user;
}

/** Check without redirecting (for conditional rendering) */
export async function checkIsAdmin(): Promise<boolean> {
  const user = await currentUser();
  if (!user) return false;
  const email = user.primaryEmailAddress?.emailAddress ?? "";
  return isAdminUser(user.id) || isAdminEmail(email);
}
