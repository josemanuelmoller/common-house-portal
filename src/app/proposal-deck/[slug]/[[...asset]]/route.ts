/**
 * Gated proposal-deck server.
 *
 *   GET /proposal-deck/<slug>[/<...asset>]
 *
 * Serves an embedded proposal deck (HTML + JS + fonts + images) ONLY to viewers
 * authorised for the Client Room identified by <slug>:
 *   - an admin, or
 *   - a Clerk user with an active client_access grant for that room AND a
 *     client-visible presentation deck on the project.
 *
 * The deck bundle lives in a private `deck-content/<bundle>/` directory (never
 * under `public/`), so there is NO unauthenticated static path to this content.
 * Every request — the HTML document and every asset — passes through this gate.
 *
 * Middleware note: `src/middleware.ts` adds an explicit `/proposal-deck/(.*)`
 * matcher so Clerk runs even for asset URLs ending in .js/.woff2/.png (which the
 * default matcher excludes). `auth.protect()` therefore redirects unauthenticated
 * requests to sign-in before they reach this handler; the checks below are
 * defense in depth.
 */

import "server-only";
import type { NextRequest } from "next/server";
import { resolveAccessForSlug } from "@/lib/require-client-access";
import { resolveDeckAsset, resolveDeckForSlug } from "@/lib/proposal-deck";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function notFound() {
  return new Response("Not found", { status: 404 });
}

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ slug: string; asset?: string[] }> }
) {
  const { slug, asset } = await ctx.params;

  // 1. Authorise against the Client Room. Admin passes; client needs a grant.
  const access = await resolveAccessForSlug(slug);
  if (access.kind === "denied") {
    return access.reason === "unauthenticated"
      ? new Response("Unauthorized", { status: 401 })
      : notFound();
  }
  const isAdmin = access.kind === "admin";

  // 2. Resolve the deck bundle from the project's presentation material.
  const deck = await resolveDeckForSlug(slug);
  if (!deck) return notFound();

  // 3. Clients may only read the deck when it is actually client-visible —
  //    mirrors exactly what the room UI shows them. Admins may always preview.
  if (!isAdmin && !deck.clientVisible) return notFound();

  // 4. Safe asset lookup (allowlist + traversal-proof). Empty path → index.html.
  const file = await resolveDeckAsset(deck.bundleDir, asset ?? []);
  if (!file) return notFound();

  return new Response(new Uint8Array(file.data), {
    status: 200,
    headers: {
      "Content-Type": file.contentType,
      // Private, per-user content: never store in shared/browser caches.
      "Cache-Control": "private, no-store, max-age=0, must-revalidate",
    },
  });
}
