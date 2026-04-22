/**
 * workstreams.ts — Classify a source (meeting / email / whatsapp / document) into
 * a workstream inside its project.
 *
 * A "workstream" is the sub-team or functional thread within a project:
 * Quality, Legal, Operations, Marketing, Procurement, Finance, IT, plus
 * named sub-initiatives like "Refill MP", "Axis 4", "Platform Alignment".
 *
 * The curator uses workstream to derive stakeholder_function on evidence
 * without having to guess from free text — cheaper + more accurate.
 *
 * Strategy (cheapest-first):
 *   1. Regex extraction from title
 *   2. Keyword match against canonical function list
 *   3. Short-circuit if confident
 *   (LLM fallback is scaffolded but not invoked by default — enable per-call
 *    via classifyWorkstreamWithLLM when a high-signal classification is needed)
 */

import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL = "claude-haiku-4-5-20251001";

/** Canonical function labels the curator understands. Case-insensitive match. */
const CANONICAL_FUNCTIONS = [
  "IT", "Quality", "Operations", "Legal", "Finance", "Marketing",
  "Executive", "Procurement", "Sales", "Customer Service", "Supply Chain",
] as const;

/** Keyword lexicon for fast rule-based classification. Keys map to a canonical label. */
const KEYWORD_MAP: Array<{ label: string; patterns: RegExp[] }> = [
  { label: "IT",            patterns: [/\bit\b/i, /\binfosec\b/i, /\btech\b/i, /\bdevops\b/i, /\bintegra(tion|cion)\b/i, /\bplatform alignment\b/i] },
  { label: "Quality",       patterns: [/\bquality\b/i, /\bcalidad\b/i, /\bQA\b/, /\bsanitary\b/i] },
  { label: "Operations",    patterns: [/\boperations\b/i, /\bops\b/i, /\bopera(tions|ciones)\b/i, /\bpilot ops\b/i, /\brollout\b/i] },
  { label: "Legal",         patterns: [/\blegal\b/i, /\bcontract(s|ing)?\b/i, /\bcompliance\b/i] },
  { label: "Finance",       patterns: [/\bfinance\b/i, /\bfinanciera?\b/i, /\binvoic/i, /\btesorer/i, /\bbudget\b/i] },
  { label: "Marketing",     patterns: [/\bmarketing\b/i, /\bPOP\b/, /\bbrand\b/i, /\bcomms\b/i, /\bcommunications\b/i] },
  { label: "Executive",     patterns: [/\bexec(utive)?\b/i, /\bsteering\b/i, /\bboard\b/i, /\bC-suite\b/i, /\bCEO\b/i, /\bCFO\b/i] },
  { label: "Procurement",   patterns: [/\bprocurement\b/i, /\bcompras\b/i, /\bpurchasing\b/i, /\bvendor(s)?\b/i, /\bsuppliers?\b/i] },
  { label: "Sales",         patterns: [/\bsales\b/i, /\bcommercial\b/i, /\bdeal\b/i, /\bcuentas\b/i] },
  { label: "Supply Chain",  patterns: [/\bsupply\b/i, /\blogistics\b/i, /\blogistica\b/i, /\bwarehouse\b/i, /\bdistribution\b/i] },
];

/**
 * Extract the workstream hint between the first em-dash (or hyphen separator)
 * and the parenthetical date/detail. Common forms:
 *   "[Meeting] AutoMercado — Quality Review (10 Apr 2026)" → "Quality Review"
 *   "[Email] ZWF — CCT Business Segment (Apr 2026)"        → "CCT Business Segment"
 *   "[Meeting] Auto Mercado — Refill Project Update (...)" → "Refill Project Update"
 */
function extractHintFromTitle(title: string): string | null {
  if (!title) return null;

  // Strip leading "[Type] " prefix
  const cleaned = title.replace(/^\[[^\]]+\]\s*/, "").trim();

  // Split by em-dash or " - " and drop the first segment (project hint)
  const parts = cleaned.split(/\s[—–-]\s/);
  if (parts.length < 2) return null;

  // Take the second segment; strip trailing "(...)" annotation
  const ws = parts[1].replace(/\s*\(.*\)\s*$/, "").trim();
  return ws || null;
}

/**
 * Match a free-form hint against the canonical function lexicon.
 * Returns the canonical label if any keyword pattern hits, else null.
 */
function matchCanonical(hint: string | null | undefined): string | null {
  if (!hint) return null;
  for (const group of KEYWORD_MAP) {
    if (group.patterns.some(rx => rx.test(hint))) return group.label;
  }
  return null;
}

/**
 * Classify — pure rule-based pass.
 * Returns { workstream, function_hint } where:
 *   - workstream = the raw extracted label (may be specific, e.g. "Refill MP")
 *   - function_hint = canonical function if rule-detected, else null
 *
 * If nothing is detected, both are null (caller decides whether to LLM-fallback).
 */
export function classifyWorkstreamRuleBased(input: {
  title?: string | null;
  processed_summary?: string | null;
}): { workstream: string | null; function_hint: string | null } {
  const { title, processed_summary } = input;

  // 1) Title hint first — most reliable
  const titleHint = extractHintFromTitle(title ?? "");
  if (titleHint) {
    const fn = matchCanonical(titleHint);
    return { workstream: titleHint, function_hint: fn };
  }

  // 2) Scan title + first 600 chars of summary for function keywords
  const haystack = `${title ?? ""}\n${(processed_summary ?? "").slice(0, 600)}`;
  const fn = matchCanonical(haystack);
  if (fn) return { workstream: fn, function_hint: fn };

  return { workstream: null, function_hint: null };
}

/**
 * LLM fallback — call only when rule-based returned null and the source has
 * enough text to reason over. Cheap (~$0.00005 per call with Haiku).
 *
 * Returns the workstream label and function_hint. Always returns something
 * (may be "General" if truly ambiguous), so callers can decide whether to
 * accept or keep null.
 */
export async function classifyWorkstreamWithLLM(input: {
  title: string;
  processed_summary?: string | null;
  participants?: string[];
  project_name?: string | null;
}): Promise<{ workstream: string; function_hint: string | null }> {
  const { title, processed_summary, participants, project_name } = input;

  const sys = `You classify a source (meeting / email / whatsapp thread) into a workstream — the sub-team or functional thread within a project. Output JSON only.

Canonical function labels (use these exactly when a function is the right workstream): ${CANONICAL_FUNCTIONS.join(", ")}.

If the workstream is a named sub-initiative ("Refill MP", "Axis 4", "Platform Alignment"), use that name in "workstream" AND set "function_hint" to the closest canonical function if clear, or null if not.

If the content is truly generic project coordination with no specific function slant, use workstream="General", function_hint=null.`;

  const user = `Project: ${project_name ?? "—"}
Title: ${title}
Participants: ${participants?.slice(0, 10).join(", ") ?? "—"}
Summary (first 600 chars): ${(processed_summary ?? "").slice(0, 600)}

Respond with JSON:
{ "workstream": "Quality" | "Refill MP" | "General" | ..., "function_hint": "Quality" | null }`;

  const res = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 150,
    system: sys,
    messages: [{ role: "user", content: user }],
  });

  const block = res.content.find(b => b.type === "text");
  if (!block || block.type !== "text") {
    return { workstream: "General", function_hint: null };
  }
  const raw = block.text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "");
  try {
    const parsed = JSON.parse(raw) as { workstream: string; function_hint: string | null };
    return {
      workstream: (parsed.workstream ?? "General").slice(0, 80),
      function_hint: parsed.function_hint ?? null,
    };
  } catch {
    return { workstream: "General", function_hint: null };
  }
}

/**
 * One-shot convenience: rule-based first, LLM fallback only if rules failed
 * AND we have enough content (title + summary). Caller still decides what to
 * persist.
 */
export async function classifyWorkstream(input: {
  title: string;
  processed_summary?: string | null;
  participants?: string[];
  project_name?: string | null;
}): Promise<{ workstream: string | null; function_hint: string | null; via: "rule" | "llm" | "none" }> {
  const rule = classifyWorkstreamRuleBased(input);
  if (rule.workstream) return { ...rule, via: "rule" };

  const haveEnoughContent = input.title?.length > 8 && (input.processed_summary?.length ?? 0) > 40;
  if (!haveEnoughContent) return { workstream: null, function_hint: null, via: "none" };

  const llm = await classifyWorkstreamWithLLM(input);
  return { workstream: llm.workstream, function_hint: llm.function_hint, via: "llm" };
}
