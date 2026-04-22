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

export type RoleCategory = "Founder" | "Executive" | "Manager" | "IC" | "Investor" | "Advisor" | "Other";
export type FunctionArea =
  | "Marketing" | "Sales" | "Product" | "Engineering" | "Design"
  | "Operations" | "Finance" | "People" | "Legal" | "Strategy"
  | "Sustainability" | "Data" | "General" | "Research" | "CustomerSuccess" | "Other";

export const ROLE_CATEGORIES: RoleCategory[] = ["Founder", "Executive", "Manager", "IC", "Investor", "Advisor", "Other"];
export const FUNCTION_AREAS: FunctionArea[] = [
  "Marketing", "Sales", "Product", "Engineering", "Design",
  "Operations", "Finance", "People", "Legal", "Strategy",
  "Sustainability", "Data", "General", "Research", "CustomerSuccess", "Other",
];

export type EnrichmentResult = {
  url:                   string;
  confidence:            number;            // URL-match confidence 0-1
  reasoning:             string;
  source:                "google_cse";
  query:                 string;
  considered:            CseItem[];         // all candidates we showed Haiku (for audit)

  // Role extraction — returned alongside the URL in the same Haiku call.
  job_title:             string | null;     // verbatim title, e.g. "Head of Product"
  role_category:         RoleCategory | null;
  function_area:         FunctionArea | null;
  organization_detected: string | null;     // org name as it appears on LinkedIn (may differ from our hall_organizations row)
  role_confidence:       number;             // 0-1 — how sure Haiku is about the title + buckets
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

  // Ask Haiku to pick the best match AND extract role information from the
  // winning candidate's title/snippet. Single call, zero extra cost.
  const systemPrompt = `You are evaluating LinkedIn profile candidates for a single person and extracting their current role.

You receive:
- The person's real name (authoritative)
- Optional: their email
- Optional: their organisation
- A list of LinkedIn URLs with the title and snippet from a Google search

Task 1 — pick the matching URL. Confidence score 0-1:
- 1.0  name + org + headline all match
- 0.8  name matches + one other signal (org, email domain, country)
- 0.6  name matches only
- 0.4  name ambiguous (common name, no other signal)
- 0.0  none of the candidates is plausibly this person

Task 2 — if confidence >= 0.4, extract the role from the winning candidate's title + snippet. The Google snippet for a LinkedIn profile typically contains the current job title and organisation. Examples:
  "Nacho Rivera - CEO at Common House"                    → title="CEO", org="Common House", category="Founder", area="General"
  "Julia Koskella · Head of Strategy · SystemIQ"          → title="Head of Strategy", org="SystemIQ", category="Executive", area="Strategy"
  "Ana Martinez - Marketing Lead at Almond Co"            → title="Marketing Lead", org="Almond Co", category="Manager", area="Marketing"
  "Tarek Abdelzaher · Senior Frontend Engineer · PVita"   → title="Senior Frontend Engineer", org="PVita", category="IC", area="Engineering"
  "Jane Doe · Partner at Climate Fund"                    → title="Partner", org="Climate Fund", category="Investor", area="General"
  "Bob Smith · Board Advisor · Cycle Co"                  → title="Board Advisor", org="Cycle Co", category="Advisor", area="General"

Role taxonomy — category (seniority) must be ONE of:
  Founder | Executive | Manager | IC | Investor | Advisor | Other

Function area (functional domain) must be ONE of:
  Marketing | Sales | Product | Engineering | Design | Operations | Finance | People | Legal | Strategy | Sustainability | Data | General | Research | CustomerSuccess | Other

Use "General" for generalist roles (CEO of a small startup, Chief of Staff, Founder). Use "Other" only when you genuinely can't classify.

role_confidence scoring:
- 0.9+ the title is explicit in the snippet and the bucket is obvious
- 0.7  the title is present but the bucket requires judgement
- 0.5  partial info (only function hinted, or only seniority)
- 0.0  no role info in any candidate

Respond ONLY with compact JSON, no prose:
{
  "url": "<linkedin url or null>",
  "confidence": <number>,
  "reasoning": "<one sentence about URL match>",
  "job_title": "<string or null>",
  "role_category": "<one of the taxonomy values or null>",
  "function_area": "<one of the taxonomy values or null>",
  "organization_detected": "<string or null>",
  "role_confidence": <number>
}`;

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

  type Verdict = {
    url:                   string | null;
    confidence:            number;
    reasoning:             string;
    job_title:             string | null;
    role_category:         RoleCategory | null;
    function_area:         FunctionArea | null;
    organization_detected: string | null;
    role_confidence:       number;
  };
  let verdict: Verdict;
  try {
    const resp = await anthropic.messages.create({
      model:       "claude-haiku-4-5-20251001",
      max_tokens:  400,
      temperature: 0,
      system:      systemPrompt,
      messages:    [{ role: "user", content: userPrompt }],
    });
    const block = resp.content[0];
    const text = block?.type === "text" ? block.text : "";
    const parsed = JSON.parse(text.trim().replace(/^```(?:json)?\s*|\s*```$/g, "")) as Record<string, unknown>;
    const roleCat = parsed.role_category as string | null | undefined;
    const funcArea = parsed.function_area as string | null | undefined;
    verdict = {
      url:                   typeof parsed.url === "string" ? parsed.url : null,
      confidence:            typeof parsed.confidence === "number" ? Math.max(0, Math.min(1, parsed.confidence)) : 0,
      reasoning:             typeof parsed.reasoning === "string" ? parsed.reasoning : "",
      job_title:             typeof parsed.job_title === "string" && parsed.job_title.trim() ? parsed.job_title.trim() : null,
      role_category:         roleCat && (ROLE_CATEGORIES as string[]).includes(roleCat) ? (roleCat as RoleCategory) : null,
      function_area:         funcArea && (FUNCTION_AREAS as string[]).includes(funcArea) ? (funcArea as FunctionArea) : null,
      organization_detected: typeof parsed.organization_detected === "string" && parsed.organization_detected.trim() ? parsed.organization_detected.trim() : null,
      role_confidence:       typeof parsed.role_confidence === "number" ? Math.max(0, Math.min(1, parsed.role_confidence)) : 0,
    };
  } catch (e) {
    // If Haiku fails to return JSON, fall back to a low-confidence first
    // hit — better than losing the query. The caller will file it for
    // manual review because confidence < 0.8.
    const first = items[0];
    verdict = {
      url:                   first.link,
      confidence:            0.3,
      reasoning:             `Haiku parse failed (${e instanceof Error ? e.message : String(e)}); first CSE hit kept for review.`,
      job_title:             null,
      role_category:         null,
      function_area:         null,
      organization_detected: null,
      role_confidence:       0,
    };
  }

  if (!verdict.url) return null;

  // Normalise: strip query params / fragments / trailing slashes so that
  // re-enrichments don't treat `?utm=…` variants as different profiles.
  const cleaned = cleanLinkedInUrl(verdict.url);
  if (!cleaned) return null;

  return {
    url:                   cleaned,
    confidence:            verdict.confidence,
    reasoning:             verdict.reasoning,
    source:                "google_cse",
    query,
    considered:            items,
    job_title:             verdict.job_title,
    role_category:         verdict.role_category,
    function_area:         verdict.function_area,
    organization_detected: verdict.organization_detected,
    role_confidence:       verdict.role_confidence,
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
