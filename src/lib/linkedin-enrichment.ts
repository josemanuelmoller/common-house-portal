/**
 * linkedin-enrichment — look up the LinkedIn profile for a contact given
 * their name, email, and (optionally) organisation name.
 *
 * Strategy v1 — Google Custom Search + Claude Haiku validation:
 *
 *   1. Query Google CSE with `"<full_name>" "<org>" site:linkedin.com/in`
 *      (or drop the org if we don't have one). Returns top 3 results.
 *   2. Pass (query, top 3 URLs + titles + snippets, contact info) to
 *      Claude Haiku with a tight JSON schema. Ask it: which of these is
 *      the same person? Return url, confidence 0-1, reasoning.
 *   3. If no CSE results, or Haiku rejects all of them with low confidence,
 *      return null.
 *
 * This is cheap and fast per lookup (~$0.0005 on Haiku, 1 CSE query) but
 * not perfectly precise — hence the `linkedin_needs_review` flag gating
 * auto-apply at 0.8.
 *
 * Env:
 *   GOOGLE_CSE_API_KEY  — API key from Google Cloud Console (Custom Search API enabled)
 *   GOOGLE_CSE_ID       — ID of a Programmable Search Engine scoped to linkedin.com/in/*
 *   ANTHROPIC_API_KEY   — already set elsewhere in the app
 *
 * Usage:
 *   const hit = await findLinkedIn({ full_name, email, org_name });
 *   if (hit) { people.linkedin = hit.url; linkedin_confidence = hit.confidence; ... }
 */

import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

type CseItem = {
  title:   string;
  link:    string;
  snippet: string;
};

type CseResponse = {
  items?: CseItem[];
  error?: { code: number; message: string };
};

export type EnrichmentResult = {
  url:        string;
  confidence: number;           // 0-1
  reasoning:  string;
  source:     "google_cse";
  query:      string;
  considered: CseItem[];        // all candidates we showed Haiku (for audit)
};

export async function findLinkedIn(opts: {
  full_name: string;
  email?:    string | null;
  org_name?: string | null;
}): Promise<EnrichmentResult | null> {
  const apiKey = process.env.GOOGLE_CSE_API_KEY;
  const cseId  = process.env.GOOGLE_CSE_ID;
  if (!apiKey || !cseId) {
    // Missing env vars — the caller should record this as an attempt so we
    // don't re-query the person on every run. Surface a clear error.
    throw new Error("GOOGLE_CSE_API_KEY / GOOGLE_CSE_ID not configured");
  }
  const name = opts.full_name.trim();
  if (!name) return null;

  // Build the CSE query. Quoting the name biases toward exact matches and
  // avoids false positives like "Juan Rivera" matching "Nacho Rivera".
  const parts = [`"${name}"`];
  if (opts.org_name) parts.push(`"${opts.org_name}"`);
  parts.push("site:linkedin.com/in");
  const query = parts.join(" ");

  const url = new URL("https://www.googleapis.com/customsearch/v1");
  url.searchParams.set("key", apiKey);
  url.searchParams.set("cx",  cseId);
  url.searchParams.set("q",   query);
  url.searchParams.set("num", "3");

  const cseRes = await fetch(url, { cache: "no-store" });
  const cseJson = (await cseRes.json()) as CseResponse;
  if (!cseRes.ok || cseJson.error) {
    throw new Error(`google_cse ${cseRes.status}: ${cseJson.error?.message ?? "unknown"}`);
  }
  const items = (cseJson.items ?? []).filter(i => i.link?.includes("linkedin.com/in/"));
  if (items.length === 0) return null;

  // Ask Haiku to pick the best match. Tight JSON schema + temperature 0.
  const systemPrompt = `You are evaluating LinkedIn profile candidates for a single person.

You receive:
- The person's real name (authoritative)
- Optional: their email
- Optional: their organisation
- A list of LinkedIn URLs with the title and snippet from a Google search

Return which URL is the same person, with a confidence score 0-1 where:
- 1.0  = name + org + headline all match
- 0.8  = name matches and one other signal matches (org, email domain, country)
- 0.6  = name matches but nothing else confirms
- 0.4  = name is ambiguous (common name, no other signal)
- 0.0  = none of the candidates is plausibly this person

Respond ONLY with compact JSON:
{"url": "<linkedin url or null>", "confidence": <number>, "reasoning": "<one sentence>"}`;

  const userPrompt = JSON.stringify({
    name,
    email: opts.email ?? null,
    org:   opts.org_name ?? null,
    candidates: items.map(i => ({
      url:     i.link,
      title:   i.title,
      snippet: i.snippet,
    })),
  });

  let verdict: { url: string | null; confidence: number; reasoning: string };
  try {
    const resp = await anthropic.messages.create({
      model:       "claude-haiku-4-5-20251001",
      max_tokens:  200,
      temperature: 0,
      system:      systemPrompt,
      messages:    [{ role: "user", content: userPrompt }],
    });
    const block = resp.content[0];
    const text = block?.type === "text" ? block.text : "";
    const parsed = JSON.parse(text.trim().replace(/^```(?:json)?\s*|\s*```$/g, ""));
    verdict = {
      url:        typeof parsed.url === "string" ? parsed.url : null,
      confidence: typeof parsed.confidence === "number" ? Math.max(0, Math.min(1, parsed.confidence)) : 0,
      reasoning:  typeof parsed.reasoning === "string" ? parsed.reasoning : "",
    };
  } catch (e) {
    // If Haiku fails to return JSON, fall back to a low-confidence first
    // hit — better than losing the query. The caller will file it for
    // manual review because confidence < 0.8.
    const first = items[0];
    verdict = {
      url:        first.link,
      confidence: 0.3,
      reasoning:  `Haiku parse failed (${e instanceof Error ? e.message : String(e)}); first CSE hit kept for review.`,
    };
  }

  if (!verdict.url) return null;

  // Normalise: strip query params / fragments / trailing slashes so that
  // re-enrichments don't treat `?utm=…` variants as different profiles.
  const cleaned = cleanLinkedInUrl(verdict.url);
  if (!cleaned) return null;

  return {
    url:        cleaned,
    confidence: verdict.confidence,
    reasoning:  verdict.reasoning,
    source:     "google_cse",
    query,
    considered: items,
  };
}

export function cleanLinkedInUrl(raw: string): string | null {
  try {
    const u = new URL(raw);
    if (!/(^|\.)linkedin\.com$/i.test(u.hostname)) return null;
    if (!u.pathname.startsWith("/in/")) return null;
    // Drop trailing slash + query + fragment. Lowercase host.
    u.hash = "";
    u.search = "";
    u.hostname = u.hostname.toLowerCase();
    let path = u.pathname;
    if (path.endsWith("/") && path.length > 4) path = path.slice(0, -1);
    return `${u.origin}${path}`;
  } catch {
    return null;
  }
}
