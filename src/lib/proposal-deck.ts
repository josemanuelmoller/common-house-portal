/**
 * proposal-deck.ts — private serving of embedded proposal decks.
 *
 * The deck bundles live under `deck-content/<bundle>/` at the repo root — NOT
 * under `public/` — so Next.js never serves them statically. They are pulled
 * into the serverless function via `outputFileTracingIncludes` (see
 * next.config.ts) and read from disk at request time by the gated route handler
 * `src/app/proposal-deck/[slug]/[[...asset]]/route.ts`.
 *
 * Every request (HTML document AND every asset) is authorised against the
 * Client Room for the slug before a single byte is returned. This module only
 * does bundle resolution + safe file lookup; the auth gate lives in the route.
 *
 * Server-only. Never import from a client component.
 */

import "server-only";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { supabaseAdmin } from "@/lib/supabase";

/**
 * Registry of known deck bundles: the leading path segment of a stored
 * `project_materials.url` → the private directory under `deck-content/`.
 * A material url must resolve to one of these or the deck is treated as absent.
 */
const DECK_BUNDLES: Record<string, string> = {
  "mps-deck": "mps-deck",
};

const DECK_ROOT = path.join(process.cwd(), "deck-content");

const CONTENT_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
};

/** Each path segment: alphanumerics, dot, dash, underscore. No leading dot
 * (blocks dotfiles), no "." / ".." (blocks traversal), no slashes/backslashes,
 * no null bytes — those characters simply aren't in the class. */
const SAFE_SEGMENT = /^[A-Za-z0-9_-][A-Za-z0-9._-]*$/;

/** Map a stored material url (e.g. "/mps-deck/index.html") to its private
 * bundle directory, or null if it is not a known embeddable deck. */
export function bundleDirFromMaterialUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const clean = url.split(/[?#]/)[0].replace(/^\/+/, "");
  const first = clean.split("/")[0];
  return DECK_BUNDLES[first] ?? null;
}

export type DeckResolution = {
  projectId: string;
  bundleDir: string;
  /** true when a client-visible (non-archived) presentation deck exists.
   * Admins may view regardless; clients only when this is true. */
  clientVisible: boolean;
};

const RESOLUTION_TTL_MS = 30_000;
const resolutionCache = new Map<string, { value: DeckResolution | null; exp: number }>();

/**
 * Resolve the deck bundle for a room slug from its project's presentation
 * material — without mutating anything. Cached for 30s (non-user-specific data:
 * project id, bundle dir, and whether a client-visible deck exists). The
 * per-user access decision is NOT cached; it happens in the route on every hit.
 */
export async function resolveDeckForSlug(slug: string): Promise<DeckResolution | null> {
  const cached = resolutionCache.get(slug);
  const now = Date.now();
  if (cached && cached.exp > now) return cached.value;

  const value = await loadDeckForSlug(slug);
  resolutionCache.set(slug, { value, exp: now + RESOLUTION_TTL_MS });
  return value;
}

async function loadDeckForSlug(slug: string): Promise<DeckResolution | null> {
  const sb = supabaseAdmin();
  const { data: project } = await sb
    .from("projects")
    .select("id")
    .eq("hall_slug", slug)
    .maybeSingle();
  if (!project) return null;
  const projectId = (project as { id: string }).id;

  const { data: materials } = await sb
    .from("project_materials")
    .select("url, visibility")
    .eq("project_id", projectId)
    .eq("category", "presentation")
    .neq("document_status", "archived");

  let bundleDir: string | null = null;
  let clientVisible = false;
  for (const row of (materials ?? []) as Array<{ url: string; visibility: string }>) {
    const dir = bundleDirFromMaterialUrl(row.url);
    if (!dir) continue;
    bundleDir = dir;
    if (row.visibility === "client") {
      clientVisible = true;
      break; // a client-visible deck is the strongest match
    }
  }
  if (!bundleDir) return null;
  return { projectId, bundleDir, clientVisible };
}

export type DeckAsset = { data: Buffer; contentType: string };

/**
 * Safely resolve a single asset within a bundle directory. Returns null on any
 * disallowed path (traversal, unknown extension, missing file) so the caller
 * responds 404 uniformly. An empty asset path serves the bundle's index.html.
 */
export async function resolveDeckAsset(
  bundleDir: string,
  assetParts: string[]
): Promise<DeckAsset | null> {
  const parts = (assetParts ?? []).filter((p) => p.length > 0);
  const effective = parts.length === 0 ? ["index.html"] : parts;

  // Reject anything that is not a plain, safe path segment.
  for (const segment of effective) {
    if (!SAFE_SEGMENT.test(segment)) return null;
  }

  const ext = path.extname(effective[effective.length - 1]).toLowerCase();
  const contentType = CONTENT_TYPES[ext];
  if (!contentType) return null;

  const bundleRoot = path.resolve(DECK_ROOT, bundleDir);
  const abs = path.resolve(bundleRoot, ...effective);
  // Defense in depth: never escape the bundle root even if a segment slipped through.
  if (abs !== bundleRoot && !abs.startsWith(bundleRoot + path.sep)) return null;

  try {
    const info = await stat(abs);
    if (!info.isFile()) return null;
  } catch {
    return null;
  }

  const data = await readFile(abs);
  return { data, contentType };
}
