/**
 * contact-photos — resolve and refresh contact avatar URLs.
 *
 * Resolution priority (highest wins):
 *   1. manual          — user-entered URL, never overwritten
 *   2. google_contacts — via People API using cached google_resource_name
 *   3. gravatar        — md5(email) served by gravatar.com; d=404 so missing
 *                        returns a 404 instead of a placeholder, so we can
 *                        detect absence
 *   4. (nothing)       — UI falls back to an initials avatar
 *
 * Called by:
 *   - /api/contact-photos/sync        — batch refresh (cron)
 *   - /api/contact-photos/refresh     — single-contact refresh (admin UI)
 */

import { createHash } from "crypto";
import { google, people_v1 } from "googleapis";
import { getGoogleAuthClient } from "@/lib/google-auth";

export type PhotoSource = "manual" | "google_contacts" | "gravatar" | "linkedin" | "proxycurl";

export type PhotoResolution = {
  url:    string | null;
  source: PhotoSource | null;
};

/**
 * Fetch the Google Contacts photo for a given resourceName.
 * Returns the highest-priority non-default photo (sourceType=CONTACT wins
 * over PROFILE so user-uploaded ones win over Google+ defaults).
 */
export async function fetchGooglePhoto(resourceName: string): Promise<string | null> {
  const auth = getGoogleAuthClient();
  if (!auth.ok) return null;
  const people = google.people({ version: "v1", auth: auth.client });
  try {
    const resp = await people.people.get({
      resourceName,
      personFields: "photos",
    });
    const photos = resp.data.photos ?? [];
    if (photos.length === 0) return null;
    // Google returns a default grey silhouette when the user has no real photo.
    // That silhouette has `default=true` in the response metadata — skip those.
    const real = photos.filter(p => !(p as people_v1.Schema$Photo & { default?: boolean }).default);
    const ranked = [...real].sort((a, b) => {
      // CONTACT-uploaded > PROFILE > anything else
      const rank = (p: people_v1.Schema$Photo) => {
        const src = p.metadata?.source?.type ?? "";
        if (src === "CONTACT") return 2;
        if (src === "PROFILE") return 1;
        return 0;
      };
      return rank(b) - rank(a);
    });
    const chosen = ranked[0] ?? photos[0];
    const url = chosen.url ?? null;
    if (!url) return null;
    // Strip the size suffix so we can request sz=256 at render time. Google's
    // URL format is `…=s100` or `…=s100-p-k-no-mo`; drop the `=s…` tail.
    return url.replace(/=s\d+(-[\w-]+)?$/, "");
  } catch (e) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("[contact-photos] Google fetch failed:", e instanceof Error ? e.message : String(e));
    }
    return null;
  }
}

/**
 * Build a Gravatar URL for an email. `d=404` means if the email doesn't have
 * a Gravatar, the image 404s — the caller can fetch-test it to decide whether
 * to persist gravatar as a source. Size 256 serves 2x retina comfortably.
 */
export function gravatarUrl(email: string): string {
  const normalised = email.trim().toLowerCase();
  const hash = createHash("md5").update(normalised).digest("hex");
  return `https://www.gravatar.com/avatar/${hash}?s=256&d=404`;
}

/**
 * Check whether a Gravatar actually exists for this email by HEADing the URL.
 * If 200 → real, use it. If 404 → email has no Gravatar, fall back.
 */
export async function gravatarExists(email: string): Promise<boolean> {
  try {
    const res = await fetch(gravatarUrl(email), { method: "HEAD", redirect: "manual" });
    return res.status === 200;
  } catch {
    return false;
  }
}

/**
 * Resolve the best photo for a contact, in priority order.
 * `personFromDb` must include google_resource_name, email, photo_url,
 * photo_source. Existing `manual` source is always preserved.
 */
export async function resolvePhoto(personFromDb: {
  google_resource_name: string | null;
  email:                string | null;
  photo_url:            string | null;
  photo_source:         PhotoSource | null;
}): Promise<PhotoResolution> {
  // Manual > everything else
  if (personFromDb.photo_source === "manual" && personFromDb.photo_url) {
    return { url: personFromDb.photo_url, source: "manual" };
  }

  // Google Contacts
  if (personFromDb.google_resource_name && !personFromDb.google_resource_name.startsWith("otherContacts/")) {
    const url = await fetchGooglePhoto(personFromDb.google_resource_name);
    if (url) return { url, source: "google_contacts" };
  }

  // Gravatar fallback (needs an email + a real gravatar)
  if (personFromDb.email) {
    if (await gravatarExists(personFromDb.email)) {
      return { url: gravatarUrl(personFromDb.email), source: "gravatar" };
    }
  }

  return { url: null, source: null };
}
