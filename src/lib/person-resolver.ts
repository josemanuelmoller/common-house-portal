/**
 * person-resolver — shared fuzzy-matching between a text sender (name + optional
 * email) and a row in the Supabase `people` table. Used by the WhatsApp
 * clipper at write time and by any feature (prep-brief, AI distill, admin
 * orphan scanner) that needs to re-resolve `conversation_messages.sender_name`
 * against the current state of `people`.
 *
 * Resolution order (most-confident first):
 *   1. email exact                        → confidence 1.00
 *   2. WhatsApp self marker ("Tú/You/Yo") → confidence 1.00, no person_id
 *   3. full_name exact (case-insensitive) → confidence 0.95
 *   4. alias exact (case-insensitive)     → confidence 0.85
 *   5. bidirectional substring            → confidence 0.70
 *   6. unique first-name match            → confidence 0.60
 *   7. otherwise                          → confidence 0, matched_by "none"
 *
 * `is_self` fires when the resolved person's email is in
 * `hall_self_identities`, or when the sender name is a WhatsApp self marker.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export type PersonEntry = {
  id:        string;
  full_name: string;
  email:     string | null;
  aliases:   string[];
};

export type PersonIndex = {
  byId:          Map<string, PersonEntry>;
  byEmail:       Map<string, string>;          // email → person_id
  byExactName:   Map<string, string>;          // lowercased full_name → person_id
  byAlias:       Map<string, string>;          // lowercased alias → person_id
  byFirstName:   Map<string, string[]>;        // lowercased first token → person_ids
  selfEmails:    Set<string>;                  // from hall_self_identities
  selfPersonIds: Set<string>;                  // people whose email ∈ selfEmails
};

export type ResolutionReason =
  | "email"
  | "self_marker"
  | "exact_full_name"
  | "alias"
  | "substring"
  | "first_name_unique"
  | "none";

export type ResolutionResult = {
  person_id:  string | null;
  is_self:    boolean;
  matched_by: ResolutionReason;
  confidence: number;
  full_name:  string | null;
};

const SELF_MARKER_RE = /^(tú|tu|you|yo)$/i;

/** Lowercase + strip diacritics. Makes "Cristóbal" match "Cristobal".
 *  Both the index side and the query side go through this, so comparisons
 *  are consistently accent-insensitive. */
function norm(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

const NO_MATCH: ResolutionResult = {
  person_id: null,
  is_self: false,
  matched_by: "none",
  confidence: 0,
  full_name: null,
};

export async function buildPersonIndex(sb: SupabaseClient): Promise<PersonIndex> {
  const [peopleRes, selfRes] = await Promise.all([
    sb.from("people").select("id, full_name, email, aliases"),
    sb.from("hall_self_identities").select("email"),
  ]);

  const selfEmails = new Set<string>(
    ((selfRes.data ?? []) as { email: string | null }[])
      .map(r => (r.email ?? "").toLowerCase().trim())
      .filter(Boolean)
  );

  const idx: PersonIndex = {
    byId:          new Map(),
    byEmail:       new Map(),
    byExactName:   new Map(),
    byAlias:       new Map(),
    byFirstName:   new Map(),
    selfEmails,
    selfPersonIds: new Set(),
  };

  type Raw = { id: string; full_name: string | null; email: string | null; aliases: string[] | null };
  for (const p of (peopleRes.data ?? []) as Raw[]) {
    const fullName = (p.full_name ?? "").trim();
    if (!fullName) continue;
    const entry: PersonEntry = { id: p.id, full_name: fullName, email: p.email, aliases: p.aliases ?? [] };
    idx.byId.set(p.id, entry);

    const fnNorm = norm(fullName);
    idx.byExactName.set(fnNorm, p.id);

    const firstName = fnNorm.split(/\s+/)[0];
    if (firstName && firstName.length >= 3) {
      const list = idx.byFirstName.get(firstName) ?? [];
      list.push(p.id);
      idx.byFirstName.set(firstName, list);
    }

    for (const a of entry.aliases) {
      const al = norm(String(a ?? ""));
      if (al) idx.byAlias.set(al, p.id);
    }

    if (p.email) {
      const em = p.email.toLowerCase().trim();
      idx.byEmail.set(em, p.id);
      if (selfEmails.has(em)) idx.selfPersonIds.add(p.id);
    }
  }

  return idx;
}

export function resolvePerson(
  opts: { name?: string | null; email?: string | null },
  idx: PersonIndex,
): ResolutionResult {
  const name  = norm(opts.name ?? "");
  const email = (opts.email ?? "").toLowerCase().trim();

  // 1. Email exact
  if (email) {
    const pid = idx.byEmail.get(email);
    if (pid) {
      const entry = idx.byId.get(pid)!;
      return {
        person_id:  pid,
        is_self:    idx.selfEmails.has(email) || idx.selfPersonIds.has(pid),
        matched_by: "email",
        confidence: 1,
        full_name:  entry.full_name,
      };
    }
    if (idx.selfEmails.has(email)) {
      return { person_id: null, is_self: true, matched_by: "email", confidence: 1, full_name: null };
    }
  }

  if (!name) return NO_MATCH;

  // 2. WhatsApp self marker — "Tú" / "You" / "Yo"
  if (SELF_MARKER_RE.test(name)) {
    return { person_id: null, is_self: true, matched_by: "self_marker", confidence: 1, full_name: null };
  }

  // 3. Exact full_name
  {
    const pid = idx.byExactName.get(name);
    if (pid) {
      const entry = idx.byId.get(pid)!;
      return {
        person_id:  pid,
        is_self:    idx.selfPersonIds.has(pid),
        matched_by: "exact_full_name",
        confidence: 0.95,
        full_name:  entry.full_name,
      };
    }
  }

  // 4. Alias
  {
    const pid = idx.byAlias.get(name);
    if (pid) {
      const entry = idx.byId.get(pid)!;
      return {
        person_id:  pid,
        is_self:    idx.selfPersonIds.has(pid),
        matched_by: "alias",
        confidence: 0.85,
        full_name:  entry.full_name,
      };
    }
  }

  // 5. Bidirectional substring ("Francisco Cerda L" ↔ "Francisco Cerda")
  //    Both sides normalised (accent-insensitive) for matching.
  for (const entry of idx.byId.values()) {
    const fn = norm(entry.full_name);
    if (fn.length < 3) continue;
    if (name.includes(fn) || fn.includes(name)) {
      return {
        person_id:  entry.id,
        is_self:    idx.selfPersonIds.has(entry.id),
        matched_by: "substring",
        confidence: 0.7,
        full_name:  entry.full_name,
      };
    }
  }

  // 5b. Token-set match: handles "Correa, Cristobal" vs "Cristóbal Correa"
  //     and similar reorderings / punctuation variants. Requires ≥2 token
  //     overlap AND full subset containment (no extra tokens in the query
  //     that aren't in the candidate), to avoid false positives like
  //     "Cristian Bustos" matching "Cristian Perez".
  //     Split chars include `@` and `/` so full_names that leaked email-like
  //     strings (pre-backfill fallback was "user@domain.tld") still tokenise
  //     cleanly. "carolina.urmeneta@globalmethanehub.org" → {carolina, urmeneta,
  //     globalmethanehub, org}.
  const tokenize = (s: string) => new Set(s.split(/[\s,.\-_@/()]+/).filter(t => t.length >= 3));
  const qTokens = tokenize(name);
  if (qTokens.size >= 2) {
    for (const entry of idx.byId.values()) {
      const fTokens = tokenize(norm(entry.full_name));
      if (fTokens.size < 2) continue;
      let overlap = 0;
      for (const t of qTokens) if (fTokens.has(t)) overlap++;
      if (overlap >= 2 && overlap === Math.min(qTokens.size, fTokens.size)) {
        return {
          person_id:  entry.id,
          is_self:    idx.selfPersonIds.has(entry.id),
          matched_by: "substring",   // keep same reason for the 0.7 tier
          confidence: 0.8,            // slightly higher — exact token-set match
          full_name:  entry.full_name,
        };
      }
    }
  }

  // 6. Unique first-name
  const firstName = name.split(/\s+/)[0];
  const candidates = firstName ? idx.byFirstName.get(firstName) : undefined;
  if (candidates?.length === 1) {
    const pid = candidates[0];
    const entry = idx.byId.get(pid)!;
    return {
      person_id:  pid,
      is_self:    idx.selfPersonIds.has(pid),
      matched_by: "first_name_unique",
      confidence: 0.6,
      full_name:  entry.full_name,
    };
  }

  return NO_MATCH;
}

// Convenience: wrap the common shape used by write-time callers that only need
// the is_self / person_id pair. Returns the same shape whether resolved or not.
export function quickMatch(
  opts: { name?: string | null; email?: string | null },
  idx: PersonIndex,
): { person_id: string | null; is_self: boolean } {
  const r = resolvePerson(opts, idx);
  return { person_id: r.person_id, is_self: r.is_self };
}
