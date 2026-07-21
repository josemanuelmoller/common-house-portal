/**
 * people-names.ts — shared name-hygiene helpers.
 *
 * The Gmail ingestion path historically stored the sender's *email* in
 * people.full_name (it dropped the "From" display name). These helpers let
 * every write path (a) detect an email-like/blank name and (b) sanitize a raw
 * "From/To" display name into a clean human name — conservatively returning
 * null rather than guessing when the header doesn't clearly contain one.
 *
 * Used by:
 *   - src/lib/ingestors/persist.ts        (fill email-like names on relationship touch)
 *   - src/lib/ingestors/gmail.ts          (clean fromName before threading it through)
 *   - src/lib/meeting-classifier.ts       (Google-contacts cache insert)
 *   - src/lib/prep-brief/fact-extraction.ts
 *   - src/app/api/admin/people/backfill-names/route.ts (one-time backfill)
 */

/**
 * True when `name` should be treated as "not a real name": it is null/empty,
 * contains '@', or equals `email` (case-insensitive). These are the rows the
 * backfill targets and the only rows any write path is allowed to overwrite.
 */
export function isEmailLikeName(
  name: string | null | undefined,
  email?: string | null,
): boolean {
  const n = (name ?? "").trim();
  if (n === "") return true;
  if (n.includes("@")) return true;
  const em = (email ?? "").trim();
  if (em && n.toLowerCase() === em.toLowerCase()) return true;
  return false;
}

/** Minimal sanity gate for "is there a plausible human name here". */
function looksLikeHumanName(s: string): boolean {
  if (!s) return false;
  if (s.includes("@")) return false;
  if (!/[A-Za-z]/.test(s)) return false;
  return true;
}

/** Automated-sender fragments that disqualify a header value from being a name. */
const AUTOMATED_MARKERS = [
  "noreply",
  "no-reply",
  "notifications",
  "mailer",
  "donotreply",
  "support@",
  "via ",
];

/**
 * Sanitize a raw "From/To" display name into a clean human name, or return
 * null when no clear human name remains. Conservative by design: prefer null
 * over a wrong name.
 *
 * Transformations:
 *   - strip surrounding single/double quotes
 *   - collapse whitespace
 *   - strip a trailing " via ..." decoration
 *   - strip a trailing " | Company" / " (Company)" decoration ONLY when a
 *     clear human name remains in front of it
 *
 * Returns null when the result:
 *   - contains '@'
 *   - is empty
 *   - equals the email or its local-part (case-insensitive)
 *   - looks like an automated sender (noreply / notifications / mailer / …)
 *   - is ALL-CAPS with no lowercase and more than 3 words (likely an org)
 */
export function cleanHeaderName(
  raw: string | null | undefined,
  email?: string | null,
): string | null {
  if (raw == null) return null;
  let s = String(raw).trim();
  if (s === "") return null;

  // Strip surrounding quotes (single or double), possibly nested/repeated.
  let prev: string;
  do {
    prev = s;
    s = s.replace(/^['"]+/, "").replace(/['"]+$/, "").trim();
  } while (s !== prev && s !== "");
  if (s === "") return null;

  // Collapse internal whitespace runs.
  s = s.replace(/\s+/g, " ").trim();

  // Strip a trailing " via ..." decoration (e.g. "Jane Doe via Notion").
  s = s.replace(/\s+via\s+.*$/i, "").trim();

  // Strip a trailing " | Company" decoration when a human name leads it.
  const pipeMatch = s.match(/^(.*?)\s*\|\s*[^|]+$/);
  if (pipeMatch) {
    const head = pipeMatch[1].trim();
    if (looksLikeHumanName(head)) s = head;
  }

  // Strip a trailing " (Company)" decoration when a human name leads it.
  const parenMatch = s.match(/^(.*?)\s*\([^)]*\)\s*$/);
  if (parenMatch) {
    const head = parenMatch[1].trim();
    if (looksLikeHumanName(head)) s = head;
  }

  s = s.trim();
  if (s === "") return null;

  // Flip "Last, First" → "First Last" (common Outlook/Gmail export format,
  // e.g. "Mateo Rodríguez, Ignasi" → "Ignasi Mateo Rodríguez"). Only when there
  // is exactly one comma splitting two plausible name halves — never touch a
  // value that isn't clearly an inverted name.
  const commaParts = s.split(",");
  if (commaParts.length === 2) {
    const last = commaParts[0].trim();
    const first = commaParts[1].trim();
    const namePart = /^[\p{L}][\p{L} .'-]*$/u;
    if (last && first && namePart.test(last) && namePart.test(first)) {
      s = `${first} ${last}`;
    }
  }

  // ─── Reject clearly non-name / automated / ambiguous results ───────────
  if (s.includes("@")) return null;

  const lower = s.toLowerCase();
  const emailLower = (email ?? "").trim().toLowerCase();
  if (emailLower) {
    if (lower === emailLower) return null;
    const localPart = emailLower.split("@")[0];
    if (localPart && lower === localPart) return null;
  }

  if (AUTOMATED_MARKERS.some((tok) => lower.includes(tok))) return null;

  // ALL-CAPS org heuristic: no lowercase letters AND more than 3 words.
  const hasLower = /[a-z]/.test(s);
  const wordCount = s.split(/\s+/).filter(Boolean).length;
  if (!hasLower && wordCount > 3) return null;

  return s;
}
