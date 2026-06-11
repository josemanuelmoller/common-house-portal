/**
 * Post-Notion-cutoff link guard.
 *
 * Notion went read-only / access-revoked at the 2026-06-02 cutoff, so any
 * `notion.so` / `notion.com` deep-link in the portal is dead. This returns a
 * usable external href, or `null` when the URL is empty or points at Notion.
 *
 * Safe to apply to ANY href source: real external links (Gmail, Fireflies,
 * Drive, etc.) pass straight through — only Notion URLs and empties are nulled.
 * Render an anchor only when this returns non-null.
 */
export function liveHref(url?: string | null): string | null {
  if (!url) return null;
  if (/notion\.(so|com)/i.test(url)) return null;
  return url;
}
