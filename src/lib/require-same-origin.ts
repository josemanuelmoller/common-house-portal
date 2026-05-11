/**
 * CSRF defense for multipart / form-encoded routes.
 *
 * Why this exists: routes that accept multipart/form-data (uploads) and rely
 * only on Clerk cookie auth are CSRF-exposed when Clerk's SameSite is `lax`
 * — an attacker-hosted form POST will attach the cookie. JSON routes get
 * implicit protection via CORS preflight when Content-Type is
 * application/json, but a hostile form with `enctype="text/plain"` can
 * smuggle JSON without triggering preflight; multipart never preflight-s.
 *
 * Defense (Wave 2.6 + Wave 5 tightening):
 *   - Sec-Fetch-Site = same-origin   → ALLOW (first-party POST)
 *   - x-csrf-portal:  1               → ALLOW (explicit opt-in for older clients)
 *   - anything else (cross-site, same-site, none, missing) → REJECT
 *
 * Wave 5 H2 change: `same-site` is NO LONGER accepted by default. Any
 * subdomain XSS would have been a CSRF source through that path. If you
 * really need to accept a trusted subdomain (e.g. clerk.wearecommonhouse.com
 * for SSO POSTs), bypass this helper with an explicit origin check at the
 * call site.
 */

import { NextResponse } from "next/server";

export function requireSameOriginRequest(req: Request): NextResponse | null {
  const fetchSite = req.headers.get("sec-fetch-site");
  if (fetchSite === "same-origin") return null;
  if (req.headers.get("x-csrf-portal") === "1") return null;
  return NextResponse.json({ error: "Cross-origin request blocked" }, { status: 403 });
}

/**
 * Variant for navigation endpoints (e.g. PWA Web Share Target).
 *
 * Android system shares arrive as a top-level navigation with:
 *   Sec-Fetch-Dest: document
 *   Sec-Fetch-Mode: navigate
 *   Sec-Fetch-Site: none (or cross-site, depending on Android version)
 *
 * An attacker form-POST also navigates but typically has Sec-Fetch-Mode:
 * navigate with Sec-Fetch-Dest: document and Sec-Fetch-Site: cross-site.
 *
 * To distinguish: legitimate share-target requests have
 * `Sec-Fetch-Site: none` (no referrer / from the OS) OR `same-origin`.
 * Cross-site form POSTs are rejected.
 */
export function requireNavigationOrSameOrigin(req: Request): NextResponse | null {
  const fetchSite = req.headers.get("sec-fetch-site");
  const fetchMode = req.headers.get("sec-fetch-mode");
  const fetchDest = req.headers.get("sec-fetch-dest");

  if (fetchSite === "same-origin") return null;

  // PWA Share Target: top-level navigation, no referrer.
  if (
    fetchSite === "none" &&
    fetchMode === "navigate" &&
    fetchDest === "document"
  ) {
    return null;
  }

  if (req.headers.get("x-csrf-portal") === "1") return null;

  return NextResponse.json({ error: "Cross-origin request blocked" }, { status: 403 });
}
