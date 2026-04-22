/**
 * linkedin-enrichment — look up the LinkedIn profile for a contact given
 * their name, email, and (optionally) organisation name.
 *
 * Strategy v2 — Anthropic web_search (drops Google CSE dependency):
 *
 *   1. Single call to Haiku with `web_search_20250305` tool enabled.
 *   2. Haiku searches the open web for the person's LinkedIn profile,
 *      matches against the name/email/org context we provide, and extracts:
 *        - profile URL
 *        - verbatim job_title
 *        - role_category (seniority tier)
 *        - function_area (functional domain)
 *        - organization_detected (org name as it appears on LinkedIn)
 *        - url_confidence (how sure of the profile match, 0-1)
 *        - role_confidence (how sure of the extracted role, 0-1)
 *   3. Returns JSON or null if no plausible match.
 *
 * Cost: ~$0.01-0.03 per lookup (Haiku tokens + 2-3 web_search calls).
 * Throughput: ~1-3s per lookup.
 *
 * Env:
 *   ANTHROPIC_API_KEY — already set elsewhere in the app
 *
 * Usage:
 *   const hit = await findLinkedIn({ full_name, email, org_name });
 *   if (hit) { people.linkedin = hit.url; people.job_title = hit.job_title; ... }
 */

import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

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
  source:                "anthropic_web_search";
  query:                 string;

  // Role extraction — returned alongside the URL in the same Haiku call.
  job_title:             string | null;
  role_category:         RoleCategory | null;
  function_area:         FunctionArea | null;
  organization_detected: string | null;
  role_confidence:       number;
};

const SYSTEM_PROMPT = `You are a contact enrichment agent. Given a person's name, email, and (optionally) organisation, you search the open web to find their current LinkedIn profile and extract their job details.

Process:
1. Use web_search to find the person. Prefer searches that include site:linkedin.com/in plus the name and org in quotes.
2. Identify the one candidate that's most likely this specific person. Consider:
   - Does the name on the profile match?
   - Does the organisation on the profile match?
   - Does the snippet mention an email domain, location, or role that's consistent?
3. From the winning profile's title + snippet, extract:
   - verbatim job_title (e.g. "Head of Sustainability", "Senior Frontend Engineer", "Co-Founder & CEO")
   - role_category — seniority bucket, ONE of: Founder | Executive | Manager | IC | Investor | Advisor | Other
   - function_area — domain bucket, ONE of: Marketing | Sales | Product | Engineering | Design | Operations | Finance | People | Legal | Strategy | Sustainability | Data | General | Research | CustomerSuccess | Other
   - organization_detected — org name as it appears on LinkedIn
4. Score your confidence:
   - url_confidence (how sure this is the right person):
       1.0  name + org + headline all match
       0.8  name matches + one other signal (org, domain, country)
       0.6  name matches only
       0.4  name is ambiguous (common name, weak signal)
       0.0  no plausible match
   - role_confidence (how sure of the title/tier/area):
       0.9+  title explicit in snippet, bucket obvious
       0.7   title present, bucket requires judgement
       0.5   partial info (only tier or only area hinted)
       0.0   no role info

Taxonomy guidance:
- "General" = generalist roles (CEO of a small startup, Chief of Staff, Founder without clear function).
- Co-founders and solo founders are Founder + General unless their title says otherwise.
- Use "Other" only when you genuinely can't classify.

Respond with compact JSON ONLY — no prose, no markdown fences:
{
  "url": "<linkedin url or null>",
  "url_confidence": <number 0-1>,
  "job_title": "<string or null>",
  "role_category": "<taxonomy value or null>",
  "function_area": "<taxonomy value or null>",
  "organization_detected": "<string or null>",
  "role_confidence": <number 0-1>,
  "reasoning": "<one sentence>"
}

If no plausible profile exists after searching, return:
{"url": null, "url_confidence": 0, "job_title": null, "role_category": null, "function_area": null, "organization_detected": null, "role_confidence": 0, "reasoning": "<one sentence>"}`;

type Verdict = {
  url:                   string | null;
  url_confidence:        number;
  job_title:             string | null;
  role_category:         RoleCategory | null;
  function_area:         FunctionArea | null;
  organization_detected: string | null;
  role_confidence:       number;
  reasoning:             string;
};

export async function findLinkedIn(opts: {
  full_name: string;
  email?:    string | null;
  org_name?: string | null;
}): Promise<EnrichmentResult | null> {
  const name = opts.full_name.trim();
  if (!name) return null;

  const contextLines = [`Person: ${name}`];
  if (opts.email)    contextLines.push(`Email: ${opts.email}`);
  if (opts.org_name) contextLines.push(`Organisation: ${opts.org_name}`);
  const userPrompt = contextLines.join("\n") + "\n\nFind this person's LinkedIn profile and extract their current role.";

  // Build the query string we'll include in the audit trail. Haiku chooses
  // its own search terms, but recording a canonical query helps debugging.
  const queryParts = [`"${name}"`];
  if (opts.org_name) queryParts.push(`"${opts.org_name}"`);
  queryParts.push("site:linkedin.com/in");
  const queryCanonical = queryParts.join(" ");

  let verdict: Verdict;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const resp = await (anthropic as any).beta.messages.create({
      model:       "claude-haiku-4-5-20251001",
      max_tokens:  1024,
      temperature: 0,
      betas:       ["web-search-2025-03-05"],
      tools:       [{ type: "web_search_20250305", name: "web_search", max_uses: 3 }],
      system:      SYSTEM_PROMPT,
      messages:    [{ role: "user", content: userPrompt }],
    });

    // The response is a mix of tool_use blocks (web_search calls Claude made)
    // and text blocks. Only the text blocks contain the final JSON verdict.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const textBlocks = (resp.content as any[]).filter(b => b?.type === "text").map(b => (b.text ?? "") as string);
    const rawText = textBlocks.join("\n").trim();
    if (!rawText) throw new Error("empty Haiku response");

    // Strip fences in case Claude forgets and wraps in ``` anyway.
    const cleaned = rawText.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
    // Grab the first {...} object in case there's prose around it.
    const firstBrace = cleaned.indexOf("{");
    const lastBrace  = cleaned.lastIndexOf("}");
    if (firstBrace === -1 || lastBrace === -1) throw new Error("no JSON object in Haiku response");
    const jsonText = cleaned.slice(firstBrace, lastBrace + 1);
    const parsed = JSON.parse(jsonText) as Record<string, unknown>;

    const roleCat  = parsed.role_category as string | null | undefined;
    const funcArea = parsed.function_area as string | null | undefined;

    verdict = {
      url:                   typeof parsed.url === "string" && parsed.url.trim() ? parsed.url.trim() : null,
      url_confidence:        typeof parsed.url_confidence === "number" ? clamp01(parsed.url_confidence) : 0,
      job_title:             typeof parsed.job_title === "string" && parsed.job_title.trim() ? parsed.job_title.trim() : null,
      role_category:         roleCat  && (ROLE_CATEGORIES as string[]).includes(roleCat)  ? (roleCat  as RoleCategory) : null,
      function_area:         funcArea && (FUNCTION_AREAS  as string[]).includes(funcArea) ? (funcArea as FunctionArea) : null,
      organization_detected: typeof parsed.organization_detected === "string" && parsed.organization_detected.trim() ? parsed.organization_detected.trim() : null,
      role_confidence:       typeof parsed.role_confidence === "number" ? clamp01(parsed.role_confidence) : 0,
      reasoning:             typeof parsed.reasoning === "string" ? parsed.reasoning : "",
    };
  } catch (e) {
    throw new Error(`anthropic_web_search: ${e instanceof Error ? e.message : String(e)}`);
  }

  if (!verdict.url) return null;

  const cleanedUrl = cleanLinkedInUrl(verdict.url);
  if (!cleanedUrl) return null;

  return {
    url:                   cleanedUrl,
    confidence:            verdict.url_confidence,
    reasoning:             verdict.reasoning,
    source:                "anthropic_web_search",
    query:                 queryCanonical,
    job_title:             verdict.job_title,
    role_category:         verdict.role_category,
    function_area:         verdict.function_area,
    organization_detected: verdict.organization_detected,
    role_confidence:       verdict.role_confidence,
  };
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

export function cleanLinkedInUrl(raw: string): string | null {
  try {
    const u = new URL(raw);
    if (!/(^|\.)linkedin\.com$/i.test(u.hostname)) return null;
    if (!u.pathname.startsWith("/in/")) return null;
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
