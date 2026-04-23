/**
 * case-codes.ts — Deterministic generator + parser for evidence case codes.
 *
 * Scalable family for ALL knowledge sources, not just project instances.
 *
 * Full shape: <TYPE>:<IDENTIFIER>-<SCOPE>-<YEAR>
 *
 * TYPE:
 *   PRJ — Project instance (active or historical pilot)        → PRJ:AUTOMERCADO-CR-2026
 *   DOC — External reference doc (report, paper, guide)        → DOC:EMF-UK-2023
 *   REG — Regulation or policy                                  → REG:EPR-UK-2024
 *   STD — Standard / certification                              → STD:BPI-US-2023
 *   BCH — Benchmark / dataset                                   → BCH:IDEMAT-INT-2022
 *   BOK — Book / chapter                                        → BOK:RAWORTH-UK-2017
 *   NEW — News / article / blog                                 → NEW:FASTCO-US-2024
 *   ITV — Cited interview                                       → ITV:BOCKEN-NL-2024
 *   INT — Internal CH artifact (past deck/proposal)             → INT:CH-UK-2024
 *
 * Backcompat: codes without a prefix are treated as implicit PRJ:.
 *   "AUTOMERCADO-CR-2026" is equivalent to "PRJ:AUTOMERCADO-CR-2026".
 *
 * When a required component is missing (no identifier or no year), returns null —
 * caller decides whether to skip or escalate.
 */

const COUNTRY_NAME_TO_ISO: Record<string, string> = {
  "argentina": "AR",
  "brazil":    "BR",
  "brasil":    "BR",
  "chile":     "CL",
  "colombia":  "CO",
  "costa rica":"CR",
  "ecuador":   "EC",
  "mexico":    "MX",
  "méxico":    "MX",
  "paraguay":  "PY",
  "peru":      "PE",
  "perú":      "PE",
  "uruguay":   "UY",
  "venezuela": "VE",
  "united kingdom": "UK",
  "uk":        "UK",
  "gran bretaña": "UK",
  "united states": "US",
  "usa":       "US",
  "us":        "US",
  "spain":     "ES",
  "españa":    "ES",
  "france":    "FR",
  "germany":   "DE",
  "italy":     "IT",
  "netherlands": "NL",
  "portugal":  "PT",
  "turkey":    "TR",
  "turquía":   "TR",
  "kenya":     "KE",
  "south africa": "ZA",
  "nigeria":   "NG",
  "india":     "IN",
  "china":     "CN",
  "japan":     "JP",
  "australia": "AU",
  "new zealand": "NZ",
  "latam":     "INT",
  "eu":        "INT",
  "europe":    "INT",
  "north america": "INT",
  "asia":      "INT",
};

// Kept short on purpose: we only strip tokens that are almost never part of
// the distinctive project name. "Auto" is NOT here because "Auto Mercado" is
// one brand name — stripping "Auto" produces MERCADO, which is wrong. Similarly
// we keep company words like "Mercado", "House", etc.
const SKIP_TOKENS = new Set([
  "the", "a", "an", "for", "all", "of", "and", "y", "del", "de", "la", "el",
  "project", "pilot", "piloto", "fase", "proyecto", "programa", "initiative",
]);

function stripAccents(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

/** Pick the first significant token of a project name for the abbrev. */
function projectAbbrev(projectName: string | null): string | null {
  if (!projectName) return null;
  const cleaned = stripAccents(projectName)
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .trim();
  const tokens = cleaned.split(/\s+/).filter(Boolean);

  // Special-case multi-word names that are better identified by 2 tokens
  // (e.g. "Auto Mercado" → AUTOMERCADO; "ZWF Forum 2026" → ZWF).
  // Strategy: concat leading tokens, skipping SKIP_TOKENS, until we have
  // ≥3 chars or ≥2 non-skip tokens.
  const significant: string[] = [];
  for (const t of tokens) {
    const lower = t.toLowerCase();
    if (SKIP_TOKENS.has(lower)) {
      if (significant.length > 0) break;
      continue;
    }
    if (/^\d+$/.test(t)) continue; // skip bare numbers like "2026"
    significant.push(t);
    if (significant.join("").length >= 8) break;
  }
  if (significant.length === 0) {
    const firstNonSkip = tokens.find(t => !SKIP_TOKENS.has(t.toLowerCase()));
    if (!firstNonSkip) return null;
    significant.push(firstNonSkip);
  }

  const joined = significant.join("").toUpperCase().slice(0, 14);
  return joined || null;
}

/** Map a free-form geography field to an ISO-2 country code (best-effort). */
export function geographyToCountry(geo: string | null | undefined): string {
  if (!geo) return "X";
  const trimmed = geo.trim();
  if (!trimmed) return "X";

  // Parse JSON-like strings ("[\"Costa Rica\",\"Argentina\"]")
  let parts: string[];
  try {
    const parsed = JSON.parse(trimmed);
    parts = Array.isArray(parsed) ? parsed.map(String) : [trimmed];
  } catch {
    parts = trimmed.split(/[,;|]/).map(s => s.trim()).filter(Boolean);
  }

  if (parts.length === 0) return "X";

  // Prefer the first concrete country over regions/blocs. Regions (LATAM, EU,
  // Europe, Asia, etc.) are stored as "INT" in the lexicon — treat those as
  // fallbacks, never primary if there is a specific country in the same list.
  const regionalFallbacks = new Set(["INT"]);
  const mapped = parts.map(p => COUNTRY_NAME_TO_ISO[p.toLowerCase()] ?? null);

  const firstSpecific = mapped.find(iso => iso !== null && !regionalFallbacks.has(iso));
  if (firstSpecific) return firstSpecific;

  const firstAny = mapped.find(iso => iso !== null);
  if (firstAny) return firstAny;

  const iso = COUNTRY_NAME_TO_ISO[parts[0].toLowerCase()];
  if (iso) return iso;

  // If already looks like ISO-2 (2 uppercase letters), keep it
  if (/^[A-Z]{2}$/.test(parts[0])) return parts[0];

  // Fallback: first 2 uppercase letters of the name
  return stripAccents(parts[0]).toUpperCase().replace(/[^A-Z]/g, "").slice(0, 2) || "X";
}

function yearFromDate(date: string | null | undefined): number | null {
  if (!date) return null;
  const m = date.match(/^(\d{4})/);
  return m ? parseInt(m[1], 10) : null;
}

/**
 * Generate a case code from evidence + project metadata.
 * Returns null if essential components (project name or date) are missing.
 */
export function generateCaseCode(input: {
  project_name: string | null;
  geography: string | null;
  date_captured: string | null;
}): string | null {
  const abbrev = projectAbbrev(input.project_name);
  if (!abbrev) return null;
  const year = yearFromDate(input.date_captured);
  if (!year) return null;
  const country = geographyToCountry(input.geography);
  return `${abbrev}-${country}-${year}`;
}

export type CaseType = "PRJ" | "DOC" | "REG" | "STD" | "BCH" | "BOK" | "NEW" | "ITV" | "INT";

export const CASE_TYPES: CaseType[] = ["PRJ", "DOC", "REG", "STD", "BCH", "BOK", "NEW", "ITV", "INT"];

export const CASE_TYPE_LABELS: Record<CaseType, string> = {
  PRJ: "Project",
  DOC: "Reference doc",
  REG: "Regulation",
  STD: "Standard",
  BCH: "Benchmark",
  BOK: "Book",
  NEW: "News / article",
  ITV: "Interview",
  INT: "Internal (CH)",
};

/** Parse a case code (with or without prefix) into parts. Returns null when malformed. */
export function parseCaseCode(code: string): {
  type: CaseType;
  identifier: string;
  scope: string;
  year: number;
} | null {
  // Try prefixed form first
  const prefixed = code.match(/^(PRJ|DOC|REG|STD|BCH|BOK|NEW|ITV|INT):([A-Z0-9]+)-([A-Z]{2,3})-(\d{4})$/);
  if (prefixed) {
    return {
      type: prefixed[1] as CaseType,
      identifier: prefixed[2],
      scope: prefixed[3],
      year: parseInt(prefixed[4], 10),
    };
  }
  // Legacy / backcompat: no prefix → implicit PRJ
  const legacy = code.match(/^([A-Z0-9]+)-([A-Z]{2,3})-(\d{4})$/);
  if (legacy) {
    return {
      type: "PRJ",
      identifier: legacy[1],
      scope: legacy[2],
      year: parseInt(legacy[3], 10),
    };
  }
  return null;
}

/** Normalise a (possibly unprefixed) case code to its canonical PRJ:/DOC:/etc form. */
export function canonicaliseCaseCode(code: string): string | null {
  const parsed = parseCaseCode(code);
  if (!parsed) return null;
  return `${parsed.type}:${parsed.identifier}-${parsed.scope}-${parsed.year}`;
}

/** Case code regex for markdown scanning. Captures codes WITH or WITHOUT prefix. */
export const CASE_CODE_REGEX = /\[((?:PRJ|DOC|REG|STD|BCH|BOK|NEW|ITV|INT):)?([A-Z0-9]+-[A-Z]{2,3}-\d{4})\]/g;

/** Generate a case code from metadata. For PRJ: the existing behaviour. For
 *  other types: caller supplies identifier + scope + year directly (no
 *  project-name heuristic — reference docs have explicit publishers, reg has
 *  a formal name, etc). */
export function generateTypedCaseCode(input: {
  type: CaseType;
  identifier: string;       // already uppercase + normalised
  scope?: string | null;    // free-form; run through scope sanitiser
  year: number;
}): string {
  const ident = input.identifier.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 14);
  const scope = (input.scope ?? "X").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 3) || "X";
  return `${input.type}:${ident}-${scope}-${input.year}`;
}

/** Sanitise a free-form identifier candidate (publisher, org, brand name)
 *  into a 3-14 char uppercase token. Used by the Library ingest form. */
export function sanitiseIdentifier(raw: string): string {
  return stripAccents(raw)
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .trim()
    .split(/\s+/)
    .filter(t => !SKIP_TOKENS.has(t.toLowerCase()))
    .join("")
    .toUpperCase()
    .slice(0, 14);
}
