/**
 * Normalization helpers for the action_items layer.
 *
 * See docs/NORMALIZATION_ARCHITECTURE.md §10 (Dedup key normalization).
 *
 * These helpers are deliberately LIGHTER than normalizeFingerprint() in
 * src/lib/loops.ts — that one strips stopwords for Jaccard similarity.
 * Subject dedup needs exact matches to preserve distinctions like
 * "the contract" vs "a contract", so stopwords stay.
 */

import { createHash } from "node:crypto";

const REPLY_FORWARD_PREFIX_RE =
  /^\s*(re|fwd|fw|rv|resp|reply)\s*[:\-]\s*|^\s*\[(external|ext|extern|externo)\]\s*/gi;

const URL_RE = /https?:\/\/\S+/g;

/**
 * Strip diacritics, lowercase, trim. Same pattern as person-resolver.ts#norm
 * so that cross-source matching stays consistent.
 */
function stripDiacritics(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

/**
 * Canonicalize a subject line for dedup_key use.
 *
 * Steps:
 *  1. Strip repeated reply/forward prefixes (Re:, Fwd:, RE:, FW:, [External], ...)
 *  2. Strip URLs (they mutate across forwards even when the topic is the same)
 *  3. Strip diacritics + lowercase
 *  4. Collapse non-alphanumeric to single space
 *  5. Collapse whitespace, trim
 *  6. Truncate to maxLen (default 100)
 *
 * Does NOT remove stopwords — we want "the contract" to remain distinct from
 * "a contract" for exact-match dedup.
 */
export function normalizeSubject(raw: string | null | undefined, maxLen = 100): string {
  if (!raw) return "";
  let s = stripDiacritics(raw).toLowerCase();

  // Strip repeated reply/forward prefixes. A long thread can accumulate
  // "Re: Fwd: Re:" so we loop until nothing changes.
  let prev = "";
  while (s !== prev) {
    prev = s;
    s = s.replace(REPLY_FORWARD_PREFIX_RE, "");
  }

  s = s.replace(URL_RE, " ");
  s = s.replace(/[^\p{L}\p{N}\s]/gu, " ");
  s = s.replace(/\s+/g, " ").trim();
  return s.slice(0, maxLen);
}

/**
 * Canonicalize a counterparty label (person name, org name, email).
 *
 * Lighter than normalizeSubject: no punctuation strip because "co-op" and
 * "coop" should collide. We also strip the common email-address structure
 * so "chloe@co-op.co.uk" and "Chloe (Co-op)" land close together.
 */
export function normalizeCounterparty(raw: string | null | undefined, maxLen = 80): string {
  if (!raw) return "";
  let s = stripDiacritics(raw).toLowerCase();

  // If it looks like an email, keep the local-part + domain root.
  const emailMatch = s.match(/([a-z0-9._+-]+)@([a-z0-9.-]+)/);
  if (emailMatch) {
    s = `${emailMatch[1]} ${emailMatch[2].split(".").slice(0, -1).join(" ")}`;
  }

  // Drop parenthetical aside: "Chloe (Co-op)" -> "Chloe Co-op"
  s = s.replace(/[()\[\]{}]/g, " ");
  s = s.replace(/[^\p{L}\p{N}\s\-]/gu, " ");
  s = s.replace(/\s+/g, " ").trim();
  return s.slice(0, maxLen);
}

/**
 * Build the canonical dedup_key for an action_item.
 *
 * action_items.dedup_key = sha256(intent + "|" + normalizeCounterparty(...) + "|" + normalizeSubject(...))
 *
 * Truncated to 32 hex chars (128 bits) — collision-resistant for the scale we
 * operate at (<1M rows) and fits in a text index comfortably.
 */
export function buildDedupKey(params: {
  intent: string;
  counterparty: string | null | undefined;
  subject: string;
}): string {
  const payload = [
    params.intent.trim().toLowerCase(),
    normalizeCounterparty(params.counterparty),
    normalizeSubject(params.subject),
  ].join("|");
  return createHash("sha256").update(payload).digest("hex").slice(0, 32);
}

// ─── Fuzzy dedup helpers (paraphrase-resistant) ───────────────────────────────
// Used as a second-line check after exact dedup_key match fails. Catches the
// case where two ingestors describe the same commitment with different words:
//   "Follow up with Carlos on Istanbul Initiative status report"
//   "Chase Carlos on Istanbul Initiative briefing document completion"
// Same intent, same counterparty, paraphrased subject → should collapse.

const STOP_GENERIC = new Set([
  "the","a","an","of","to","for","and","or","but","on","in","at","by",
  "is","are","was","were","be","been","being","this","that","these","those",
  "we","i","you","they","them","our","my","your","it","its","as","from","with",
  "about","regarding","re",
  // phrasal verb particles — left over after "follow", "reach", "circle" etc strip
  "up","out","back","over","off","through","along","around","into","onto",
]);

const STOP_ACTION_VERBS = new Set([
  "follow","followup","chase","ping","check","ask","send","share","prepare",
  "complete","completion","finish","deliver","review","confirm","schedule",
  "set","make","do","get","give","have","has","had","need","needs","please",
  "remind","update","reach","reachout","loop","circle","touch","base",
]);

/**
 * Normalize an action_item subject for fuzzy similarity. Stricter than
 * normalizeSubject — strips action verbs and generic stopwords so that what
 * remains is the topic substance (entities + nouns).
 */
export function actionItemFingerprint(subject: string | null | undefined): string {
  if (!subject) return "";
  let s = stripDiacritics(subject).toLowerCase();
  s = s.replace(/^\s*(re|fwd|fw|rv|resp|reply)\s*[:\-]\s*/gi, " ");
  s = s.replace(URL_RE, " ");
  s = s.replace(/[^\p{L}\p{N}\s]/gu, " ");
  s = s.replace(/\s+/g, " ").trim();
  return s.split(" ")
    .filter(w => w && !STOP_GENERIC.has(w) && !STOP_ACTION_VERBS.has(w))
    .join(" ");
}

/**
 * Overlap coefficient: |A ∩ B| / min(|A|, |B|).
 * Better than Jaccard when one fingerprint is much shorter — it doesn't
 * penalize the longer one for adding context the shorter one omits.
 */
export function overlapCoefficient(a: string, b: string): number {
  const A = new Set(a.split(" ").filter(Boolean));
  const B = new Set(b.split(" ").filter(Boolean));
  const minSize = Math.min(A.size, B.size);
  if (minSize === 0) return 0;
  let inter = 0;
  for (const t of A) if (B.has(t)) inter++;
  return inter / minSize;
}
