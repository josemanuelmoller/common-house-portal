/**
 * case-codes.ts — Deterministic generator for evidence case codes.
 *
 * Convention: <PROJECT_ABBREV>-<COUNTRY>-<YEAR>
 *   PROJECT_ABBREV — uppercase, accent-stripped, first significant token of
 *                    project name, capped at 14 chars
 *   COUNTRY        — ISO-2 code inferred from geography (CR, AR, UK, etc.).
 *                    Multi-country → INT. Unknown → X.
 *   YEAR           — year portion of date_captured
 *
 * Examples:
 *   Auto Mercado - Fase 2 · Costa Rica · 2026-04  → AUTOMERCADO-CR-2026
 *   SUFI · Argentina · 2026-03                    → SUFI-AR-2026
 *   ZWF Forum 2026 · Turkey · 2026-04              → ZWF-TR-2026
 *
 * When a required component is missing (no project or no date), returns null —
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

const SKIP_TOKENS = new Set([
  "the", "auto", "refill", "project", "pilot", "piloto", "fase", "proyecto", "programa",
  "the plan", "for", "all", "platform", "initiative", "co", "sl", "inc", "ltd", "corp",
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
  if (parts.length > 1) {
    // Multi-country → check if all resolve to the same ISO-2
    const isos = parts.map(p => COUNTRY_NAME_TO_ISO[p.toLowerCase()] ?? null);
    const unique = new Set(isos.filter(Boolean));
    if (unique.size === 1) return [...unique][0]!;
    return "INT";
  }

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

/** Parse a case code back into parts. Returns null when malformed. */
export function parseCaseCode(code: string): {
  project: string;
  country: string;
  year: number;
} | null {
  const m = code.match(/^([A-Z0-9]+)-([A-Z]{2,3})-(\d{4})$/);
  if (!m) return null;
  return { project: m[1], country: m[2], year: parseInt(m[3], 10) };
}
