/**
 * hall-self.ts — Single source of truth for "which email addresses are Jose
 * himself". Used everywhere we observe or render attendees so Jose never
 * shows up in his own registry.
 *
 * Identities live in Supabase table hall_self_identities. Reads are cached
 * in-memory per-request to avoid repeated SELECTs from hot loops (ingest).
 *
 * Adding an address: INSERT into hall_self_identities, or call
 * addSelfIdentity(email, source). New identity is picked up on next request.
 */

import { getSupabaseServerClient } from "./supabase-server";

let cache: { emails: Set<string>; loadedAt: number } | null = null;
const TTL_MS = 60_000;  // 60s — cheap to reload, avoids long stales

/** Returns the set of "self" email addresses. Lowercased. */
export async function getSelfEmails(): Promise<Set<string>> {
  if (cache && Date.now() - cache.loadedAt < TTL_MS) return cache.emails;
  const sb = getSupabaseServerClient();
  const { data } = await sb.from("hall_self_identities").select("email");
  const emails = new Set<string>();
  for (const r of (data ?? []) as { email: string }[]) {
    if (r.email) emails.add(r.email.toLowerCase());
  }
  cache = { emails, loadedAt: Date.now() };
  return emails;
}

/** True if the given email is one of Jose's own identities. */
export async function isSelfEmail(email: string): Promise<boolean> {
  if (!email) return false;
  const set = await getSelfEmails();
  return set.has(email.toLowerCase());
}

/** Sync version (cache must already be warm). Useful inside tight loops. */
export function isSelfEmailSync(email: string, selfSet: Set<string>): boolean {
  return !!email && selfSet.has(email.toLowerCase());
}

/** Manual add (e.g. Jose tells us about a new workspace email). */
export async function addSelfIdentity(email: string, source = "manual", notes?: string, addedBy?: string): Promise<void> {
  const sb = getSupabaseServerClient();
  await sb.from("hall_self_identities").upsert({
    email:    email.toLowerCase(),
    source,
    notes:    notes ?? null,
    added_by: addedBy ?? null,
  }, { onConflict: "email" });
  cache = null;  // invalidate
}
