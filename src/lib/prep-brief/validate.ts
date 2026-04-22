/**
 * prep-brief/validate.ts
 *
 * Post-generation guardrails. Scans prose for:
 *   - Relative-time phrases that aren't in the fact sheet
 *   - Tenses that contradict a resolved personal event
 *   - Mention of any disclosure-denied field keyword
 *
 * Returns a list of issues. The API handler decides whether to retry, strip,
 * or surface them. For the spike we just report — no auto-retry yet.
 */

import type { FactSheet, BriefProse } from "./types";

const RELATIVE_TIME_PATTERNS: RegExp[] = [
  /\bhace\s+\d+\s+(d[ií]as?|semanas?|meses?|a[nñ]os?)\b/gi,
  /\ben\s+\d+\s+(d[ií]as?|semanas?|meses?|a[nñ]os?)\b/gi,
  /\b(ayer|anteayer|mañana|pasado\s+mañana|la\s+semana\s+pasada|la\s+pr[oó]xima\s+semana|el\s+mes\s+pasado)\b/gi,
  /\b(\d+\s+days?\s+ago|in\s+\d+\s+days?|yesterday|tomorrow|last\s+week|next\s+week|last\s+month|next\s+month)\b/gi,
];

const DISCLOSURE_KEYWORDS: Record<string, RegExp[]> = {
  revenue_absolute: [/\$\s?[\d,.]+(?:k|m|million|millones?|mil)?\s*(?:revenue|ingresos?|ventas?)/i,
                     /revenue\s+of\s+\$/i,
                     /ingresos?\s+de\s+\$/i],
  margin:           [/\bmargin\b/i, /\bmargen\b/i],
  cap_table:        [/\bcap\s*table\b/i, /\btabla\s+de\s+capitalizaci[oó]n\b/i, /\bequity\s+split\b/i],
  challenges_real: [/\bchurn\b/i, /\bburn\s*rate\b/i, /\brunway\b/i, /\blayoffs?\b/i],
  pipeline_named:   [/\b(Co[-\s]?op|Waitrose|Tesco|Sainsbury|Morrisons|Whole\s*Foods|Aldi|Lidl)\b/i],
};

export type ValidationIssue = {
  severity: "block" | "warn";
  kind:     "relative_time" | "disclosure" | "invented_event";
  field:    keyof BriefProse;
  match:    string;
  note:     string;
};

export function validateProse(prose: BriefProse, fact: FactSheet): { passed: boolean; issues: ValidationIssue[] } {
  const issues: ValidationIssue[] = [];
  const fields: (keyof BriefProse)[] = ["suggested_angle", "agenda_outline", "risks", "opening_line"];

  // Build allowed relative-time phrases (from fact sheet itself)
  const allowedPhrases: string[] = [];
  const dUntil = fact.meeting.days_until;
  if (Number.isFinite(dUntil)) allowedPhrases.push(String(dUntil));
  for (const p of fact.personal_events) allowedPhrases.push(String(Math.abs(p.days_from_today)));
  for (const c of fact.open_commitments) if (c.days_open != null) allowedPhrases.push(String(c.days_open));
  const allowedSet = new Set(allowedPhrases);

  for (const field of fields) {
    const text = prose[field] ?? "";
    if (!text) continue;

    // 1. Relative-time matches — flag and cross-check against allowed numbers
    for (const pat of RELATIVE_TIME_PATTERNS) {
      pat.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = pat.exec(text))) {
        const numMatch = /\d+/.exec(m[0]);
        if (numMatch && allowedSet.has(numMatch[0])) continue; // numeric delta matches fact sheet
        issues.push({
          severity: "warn",
          kind:     "relative_time",
          field,
          match:    m[0],
          note:     "Relative-time phrase not anchored in fact sheet — verify tense & delta.",
        });
      }
    }

    // 2. Disclosure — any deny-list hit is a block
    for (const denyKey of fact.disclosure.deny) {
      const patterns = DISCLOSURE_KEYWORDS[denyKey];
      if (!patterns) continue;
      for (const pat of patterns) {
        const m = pat.exec(text);
        if (m) {
          issues.push({
            severity: "block",
            kind:     "disclosure",
            field,
            match:    m[0],
            note:     `Disclosure profile "${fact.disclosure.profile_name}" denies "${denyKey}" but prose mentions "${m[0]}".`,
          });
        }
      }
    }

    // 3. Invented personal-event tenses — if text says "el maratón fue" but
    //    the event tense is "future", flag. Very light heuristic.
    for (const e of fact.personal_events) {
      const keyword = e.event.slice(0, 18).toLowerCase();
      if (!keyword || keyword.length < 6) continue;
      if (!text.toLowerCase().includes(keyword.split(/\s+/).find(w => w.length > 5) ?? "")) continue;
      if (e.tense === "future") {
        if (/\b(fue|estuvo|pas[oó]|was|went|took\s+place)\b/i.test(text)) {
          issues.push({
            severity: "block",
            kind:     "invented_event",
            field,
            match:    keyword,
            note:     `"${e.event}" is FUTURE (date ${e.event_date}) but prose uses past-tense verb.`,
          });
        }
      }
      if (e.tense === "past") {
        if (/\b(será|va\s+a\s+ser|estará|will\s+be|is\s+going\s+to)\b/i.test(text)) {
          issues.push({
            severity: "block",
            kind:     "invented_event",
            field,
            match:    keyword,
            note:     `"${e.event}" is PAST but prose uses future-tense verb.`,
          });
        }
      }
    }
  }

  const blocks = issues.filter(i => i.severity === "block");
  return { passed: blocks.length === 0, issues };
}
