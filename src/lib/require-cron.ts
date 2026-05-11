/**
 * Cron / agent auth helper — use this in every API route that is NOT user-facing.
 *
 * Why this exists:
 *   `src/middleware.ts` marks /api/* as public, so Clerk does NOT enforce a session
 *   on cron / agent routes. Each route MUST authenticate itself locally.
 *
 * The old inline pattern `header === \`Bearer ${process.env.CRON_SECRET}\`` is unsafe:
 *   if the env var is missing/empty, the comparison evaluates to "Bearer undefined",
 *   which any unauthenticated attacker can replay verbatim. This helper fails closed.
 *
 * Accepts either header form:
 *   - Authorization: Bearer <secret>
 *   - x-agent-key: <secret>
 *
 * Returns NextResponse on failure (401 / 500) — null on success.
 */
import { NextResponse } from "next/server";

export function requireCronAuth(req: Request): NextResponse | null {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    return NextResponse.json(
      { error: "CRON_SECRET not configured" },
      { status: 500 }
    );
  }
  const authHeader = req.headers.get("authorization") ?? "";
  const agentKey = req.headers.get("x-agent-key") ?? "";
  const bearerOk = authHeader === `Bearer ${expected}`;
  const agentOk = agentKey !== "" && agentKey === expected;
  if (!bearerOk && !agentOk) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}

/**
 * Boolean-form variant for routes that need cron-OR-admin fallback.
 * Use alongside an admin guard:
 *
 *   if (!isValidCronRequest(req)) {
 *     const adminFail = await adminGuardApi();
 *     if (adminFail) return adminFail;
 *   }
 */
export function isValidCronRequest(req: Request): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;
  const authHeader = req.headers.get("authorization") ?? "";
  const agentKey = req.headers.get("x-agent-key") ?? "";
  return authHeader === `Bearer ${expected}` || (agentKey !== "" && agentKey === expected);
}
