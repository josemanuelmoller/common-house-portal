/**
 * POST /api/contact-news/scan
 *
 * Biweekly news + LinkedIn activity monitor for VIP contacts. Uses
 * Anthropic Haiku with web_search to look for:
 *   - Recent news mentions / interviews / podcasts with the person
 *   - Recent public LinkedIn posts by them (site:linkedin.com/posts/)
 *   - Org announcements (only when the person has an organisation_detected
 *     OR the email's domain is a known company)
 *
 * Scope:
 *   - VIP-tagged contacts (relationship_classes contains 'VIP')
 *   - 14-day cooldown via people.last_news_scan_at
 *   - Skips contacts without full_name (nothing to search for)
 *   - Contacts without an organisation STILL get scanned for personal
 *     mentions + LinkedIn activity — only the org query is skipped
 *
 * Writes deduped results to `people_news_mentions`.
 *
 * Auth: x-agent-key / CRON_SECRET header OR admin session.
 * Cron: Monday 08:00 UTC, limit 8 per run. The 14-day cooldown inside
 * means a given contact is re-scanned every 2 weeks effectively — the
 * weekly cron just drains the backlog naturally.
 */
import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { currentUser } from "@clerk/nextjs/server";
import { isAdminUser, isAdminEmail } from "@/lib/clients";
import { getSupabaseServerClient } from "@/lib/supabase-server";

export const maxDuration = 300;
export const dynamic     = "force-dynamic";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const COOLDOWN_DAYS = 14;
const MAX_MENTIONS_PER_SCAN = 8;

async function authCheck(req: NextRequest): Promise<boolean> {
  const agentKey  = req.headers.get("x-agent-key");
  const cronToken = req.headers.get("authorization");
  const expected  = process.env.CRON_SECRET;
  if (expected && agentKey === expected)              return true;
  if (expected && cronToken === `Bearer ${expected}`) return true;
  try {
    const user = await currentUser();
    if (!user) return false;
    const email = user.primaryEmailAddress?.emailAddress ?? "";
    if (isAdminUser(user.id) || isAdminEmail(email)) return true;
  } catch { /* no-op */ }
  return false;
}

const SYSTEM_PROMPT = `You are a contact intelligence analyst. For ONE person, you search the open web for recent public activity (last 60 days preferred, last 6 months acceptable) across four kinds of sources:

  1. "news"              — news articles where they are quoted, interviewed, or profiled
  2. "linkedin_post"     — public posts they've authored (linkedin.com/posts/<handle>_…)
  3. "blog" / "podcast"  — blog posts, podcast episodes, op-eds they published
  4. "org_announcement"  — announcements from their organisation that mention them or that they clearly drove

Use web_search. For LinkedIn posts specifically prefer queries like:
  site:linkedin.com/in/<handle> OR site:linkedin.com/posts "<Full Name>" 2026
  "<Full Name>" linkedin post 2026

Relevance scoring 0-1:
  1.0 — about them directly, quoted, authored, announced
  0.8 — mentions them in a substantive way
  0.6 — their organisation announcement, doesn't mention them by name
  0.4 — tangential, same industry only
  0.0 — no good match

Output up to 8 mentions, ranked by recency * relevance. Do NOT invent URLs. Only return things you actually retrieved via web_search.

Respond ONLY with compact JSON:
{
  "mentions": [
    {
      "url": "https://…",
      "title": "…",
      "snippet": "…",
      "source": "Reuters|LinkedIn|…",
      "kind": "news|linkedin_post|blog|podcast|org_announcement",
      "published_at": "2026-04-18" or null,
      "relevance": 0.0-1.0,
      "why_relevant": "one short sentence"
    }
  ]
}`;

type AgentMention = {
  url:          string;
  title:        string | null;
  snippet:      string | null;
  source:       string | null;
  kind:         string;
  published_at: string | null;
  relevance:    number;
  why_relevant: string | null;
};

type ScanOutcome = {
  person_id:   string;
  name:        string;
  action:      "scanned" | "skipped_cooldown" | "skipped_no_name" | "error";
  found:       number;
  inserted:    number;
  error?:      string;
};

export async function POST(req: NextRequest) {
  if (!(await authCheck(req))) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const limit = Math.max(1, Math.min(30, Number(searchParams.get("limit") ?? "8")));
  const force = searchParams.get("force") === "1";
  // Allow single-person scans too: ?person_id=… or ?email=…
  const singlePersonId = (searchParams.get("person_id") ?? "").trim();
  const singleEmail    = (searchParams.get("email") ?? "").trim().toLowerCase();

  const sb = getSupabaseServerClient();
  const cutoff = new Date(Date.now() - COOLDOWN_DAYS * 86400_000).toISOString();

  type Row = {
    id: string;
    email: string | null;
    full_name: string | null;
    display_name: string | null;
    organization_detected: string | null;
    last_news_scan_at: string | null;
    relationship_classes: string[] | null;
  };

  let queue: Row[] = [];

  if (singlePersonId || singleEmail) {
    let q = sb.from("people")
      .select("id, email, full_name, display_name, organization_detected, last_news_scan_at, relationship_classes");
    if (singlePersonId) q = q.eq("id", singlePersonId);
    else                q = q.eq("email", singleEmail);
    const { data } = await q.maybeSingle();
    if (data) queue = [data as unknown as Row];
  } else {
    let q = sb
      .from("people")
      .select("id, email, full_name, display_name, organization_detected, last_news_scan_at, relationship_classes")
      .contains("relationship_classes", ["VIP"])
      .is("dismissed_at", null)
      .order("last_news_scan_at", { ascending: true, nullsFirst: true })
      .limit(limit);
    if (!force) {
      q = q.or(`last_news_scan_at.is.null,last_news_scan_at.lt.${cutoff}`);
    }
    const { data, error } = await q;
    if (error) return NextResponse.json({ error: error.message }, { status: 502 });
    queue = (data ?? []) as Row[];
  }

  const outcomes: ScanOutcome[] = [];
  const nowIso = new Date().toISOString();

  for (const p of queue) {
    const name = (p.full_name ?? p.display_name ?? "").trim();
    if (!name) {
      outcomes.push({ person_id: p.id, name: "", action: "skipped_no_name", found: 0, inserted: 0 });
      continue;
    }

    try {
      const orgLine = p.organization_detected ? `Organisation: ${p.organization_detected}` : `No organisation on record — only search for personal activity.`;
      const domain = (p.email?.split("@")[1] ?? "").toLowerCase();
      const userPrompt = `Contact: ${name}
${orgLine}
Email domain: ${domain || "unknown"}

Find recent public activity (news, LinkedIn posts, blog posts, podcasts, org announcements) about this person from the last 60 days. Prefer recent over older, relevant over tangential.`;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const resp = await (anthropic as any).beta.messages.create({
        model:       "claude-haiku-4-5-20251001",
        max_tokens:  2000,
        temperature: 0,
        betas:       ["web-search-2025-03-05"],
        tools:       [{ type: "web_search_20250305", name: "web_search", max_uses: 4 }],
        system:      SYSTEM_PROMPT,
        messages:    [{ role: "user", content: userPrompt }],
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const textBlocks = (resp.content as any[]).filter(b => b?.type === "text").map(b => (b.text ?? "") as string);
      const raw = textBlocks.join("\n").trim();
      if (!raw) throw new Error("empty Haiku response");

      const cleaned = raw.replace(/^```(?:json)?\s*|\s*```$/g, "").trim();
      const firstBrace = cleaned.indexOf("{");
      const lastBrace  = cleaned.lastIndexOf("}");
      if (firstBrace === -1) throw new Error("no JSON object");
      const parsed = JSON.parse(cleaned.slice(firstBrace, lastBrace + 1));

      const mentions: AgentMention[] = Array.isArray(parsed.mentions)
        ? parsed.mentions
            .filter((m: Record<string, unknown>) => typeof m.url === "string" && (m.url as string).startsWith("http"))
            .map((m: Record<string, unknown>) => ({
              url:          String(m.url),
              title:        typeof m.title   === "string" ? m.title   : null,
              snippet:      typeof m.snippet === "string" ? m.snippet : null,
              source:       typeof m.source  === "string" ? m.source  : null,
              kind:         ["news", "linkedin_post", "blog", "podcast", "org_announcement"].includes(m.kind as string)
                            ? (m.kind as string) : "news",
              published_at: typeof m.published_at === "string" ? m.published_at : null,
              relevance:    typeof m.relevance === "number" ? Math.max(0, Math.min(1, m.relevance)) : 0,
              why_relevant: typeof m.why_relevant === "string" ? m.why_relevant : null,
            }))
            .slice(0, MAX_MENTIONS_PER_SCAN)
        : [];

      // Insert (upsert on unique (person_id, url))
      let inserted = 0;
      if (mentions.length > 0) {
        const rows = mentions.map(m => ({
          person_id:    p.id,
          url:          m.url,
          title:        m.title,
          snippet:      m.snippet,
          source:       m.source,
          kind:         m.kind,
          published_at: m.published_at,
          relevance:    m.relevance,
          why_relevant: m.why_relevant,
          detected_at:  nowIso,
        }));
        const { error: upsertErr, count } = await sb
          .from("people_news_mentions")
          .upsert(rows, { onConflict: "person_id,url", ignoreDuplicates: true, count: "exact" });
        if (upsertErr) throw new Error("upsert failed: " + upsertErr.message);
        inserted = count ?? rows.length;
      }

      await sb.from("people").update({
        last_news_scan_at: nowIso,
        updated_at:        nowIso,
      }).eq("id", p.id);

      outcomes.push({ person_id: p.id, name, action: "scanned", found: mentions.length, inserted });
    } catch (e) {
      outcomes.push({
        person_id: p.id, name,
        action: "error", found: 0, inserted: 0,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  return NextResponse.json({
    ok:        true,
    processed: outcomes.length,
    summary: {
      scanned:         outcomes.filter(o => o.action === "scanned").length,
      mentions_added:  outcomes.reduce((s, o) => s + o.inserted, 0),
      errors:          outcomes.filter(o => o.action === "error").length,
    },
    outcomes,
  });
}

export { POST as GET };
