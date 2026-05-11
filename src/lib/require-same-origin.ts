/**
 * CSRF defense for multipart / form-encoded routes.
 *
 * Why this exists: routes that accept multipart/form-data (uploads) and rely
 * only on Clerk cookie auth are CSRF-exposed when Clerk's SameSite is `lax`
 * — an attacker-hosted form POST will attach the cookie. JSON routes get
 * implicit protection via CORS preflight; multipart does not.
 *
 * Defense:
 *   1. Modern browsers send Sec-Fetch-Site = same-origin on first-party POSTs
 *      and `cross-site` on attacker-driven ones. We accept only same-origin.
 *   2. Older browsers and non-browser clients (e.g. internal scripts) can pass
 *      `x-csrf-portal: 1` instead — any custom header forces a CORS preflight
 *      that the attacker origin cannot satisfy.
 */

import { NextResponse } from "next/server";

export function requireSameOriginRequest(req: Request): NextResponse | null {
  const fetchSite = req.headers.get("sec-fetch-site");
  if (fetchSite === "same-origin" || fetchSite === "same-site") return null;
  // Older browsers don't send Sec-Fetch-Site at all. They can opt in via the
  // custom header — sending a custom header triggers a CORS preflight which an
  // attacker page cannot satisfy from a different origin.
  if (req.headers.get("x-csrf-portal") === "1") return null;
  // No Sec-Fetch-Site header AND no custom header → reject as cross-origin.
  return NextResponse.json({ error: "Cross-origin request blocked" }, { status: 403 });
}
