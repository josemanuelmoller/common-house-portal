/**
 * Client-safe helpers for embedding proposal decks.
 *
 * No server-only imports — usable from both server and client components.
 * The actual deck bytes are served exclusively by the Client-Room-gated route
 * handler at /proposal-deck/<slug> (see src/lib/proposal-deck.ts). A stored
 * material url like "/mps-deck/index.html" is only a marker that a bundle
 * exists; it must NEVER be linked or embedded directly.
 */

/** True when a material url points at an embeddable deck bundle (marker only). */
export function isEmbeddableDeckUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  return url.startsWith("/mps-deck/") || url.startsWith("/decks/");
}

/** The gated, same-origin URL to embed/open a room's deck. */
export function proposalDeckIndexPath(slug: string): string {
  return `/proposal-deck/${encodeURIComponent(slug)}/index.html`;
}
