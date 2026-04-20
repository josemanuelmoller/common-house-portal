/**
 * POST /api/competitive-monitor
 *
 * Scans the web for recent signals from entities in CH Watchlist [OS v2],
 * grouped into two sections:
 *   1. COMPETITOR PULSE  — Type = Competitor (Perpetual, Upstream, Unpackaged, Searious Business)
 *   2. SECTOR SIGNAL     — Type = Sector (WRAP, Circle Economy, Zero Waste Europe, etc.)
 *
 * In execute mode, writes new records to CH Competitive Intel [OS v2].
 * In dry_run (default), returns proposed records without writing.
 *
 * Uses Anthropic API with web search (anthropic-beta: web-search-2025-03-05).
 *
 * Auth: x-agent-key / CRON_SECRET header OR authenticated admin session.
 *
 * STATUS (2026-04-20): cron disabled. Output DB (CH Competitive Intel [OS v2],
 * af8d7edb750b4131b3b55ef5ee83556a) is not read by any server-rendered surface
 * in src/. The only consumer is the static mockup public/portal/competitive-intel.html
 * which shows "Watchlist vacia" copy and points users back to Notion.
 * Running weekly burned Anthropic web-search tool budget on invisible output.
 * Route retained for manual/admin invocation; re-add cron once a product surface
 * consumes DB_INTEL.
 */

import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { Client } from "@notionhq/client";
import { auth } from "@clerk/nextjs/server";
import { isAdminUser } from "@/lib/clients";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

const notion    = new Client({ auth: process.env.NOTION_API_KEY });
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Page IDs (from Notion URL) — NOT collection IDs
const DB_WATCHLIST     = "d5fad9978ed0436baae4964a0ad0e211"; // CH Watchlist [OS v2]
const DB_INTEL         = "af8d7edb750b4131b3b55ef5ee83556a"; // CH Competitive Intel [OS v2]

// ─── Auth ─────────────────────────────────────────────────────────────────────

async function authCheck(req: NextRequest): Promise<boolean> {
  const agentKey  = req.headers.get("x-agent-key");
  const cronToken = req.headers.get("authorization");
  const expected  = process.env.CRON_SECRET;
  if (expected && agentKey === expected)              return true;
  if (expected && cronToken === `Bearer ${expected}`) return true;
  try {
    const { userId } = await auth();
    if (userId && isAdminUser(userId)) return true;
  } catch { /* no-op */ }
  return false;
}

// ─── Notion helpers ───────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const text = (p: any) => p?.title?.[0]?.plain_text ?? p?.rich_text?.[0]?.plain_text ?? "";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sel  = (p: any) => p?.select?.name ?? "";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const url  = (p: any) => p?.url ?? "";

interface WatchlistEntry {
  id: string;
  name: string;
  type: string;
  website: string;
  twitterX: string;
  linkedInUrl: string;
  scanFrequency: string;
  notes: string;
}

async function fetchWatchlist(types: string[]): Promise<WatchlistEntry[]> {
  const res = await notion.databases.query({
    database_id: DB_WATCHLIST,
    filter: {
      and: [
        { property: "Active", checkbox: { equals: true } },
        {
          or: types.map(t => ({ property: "Type", select: { equals: t } })),
        },
      ],
    },
    page_size: 20,
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (res.results as any[]).map(p => ({
    id:            p.id,
    name:          text(p.properties["Name"]),
    type:          sel(p.properties["Type"]),
    website:       url(p.properties["Website"]),
    twitterX:      text(p.properties["Twitter / X"]),
    linkedInUrl:   url(p.properties["LinkedIn URL"]),
    scanFrequency: sel(p.properties["Scan Frequency"]),
    notes:         text(p.properties["Notes"]),
  }));
}

async function dedupeCheck(watchlistPageId: string, title: string): Promise<boolean> {
  try {
    const res = await notion.databases.query({
      database_id: DB_INTEL,
      filter: {
        and: [
          { property: "Watchlist Entry", relation: { contains: watchlistPageId } },
          { property: "Title", title: { contains: title.slice(0, 50) } },
        ],
      },
      page_size: 1,
    });
    return res.results.length > 0;
  } catch {
    return false;
  }
}

// ─── Intel record ─────────────────────────────────────────────────────────────

interface IntelSignal {
  watchlistId: string;
  watchlistName: string;
  signalType: string;
  relevance: string;
  title: string;
  summary: string;
  sourceUrl: string;
  dateSignal: string;
}

async function createIntelRecord(signal: IntelSignal): Promise<string | null> {
  try {
    const page = await notion.pages.create({
      parent: { database_id: DB_INTEL },
      properties: {
        "Title":           { title: [{ text: { content: signal.title.slice(0, 120) } }] },
        "Watchlist Entry": { relation: [{ id: signal.watchlistId }] },
        "Signal Type":     { select: { name: signal.signalType } },
        "Relevance":       { select: { name: signal.relevance } },
        "Status":          { select: { name: "New" } },
        "Source URL":      { url: signal.sourceUrl || null },
        "Date Captured":   { date: { start: new Date().toISOString().slice(0, 10) } },
        "Summary":         { rich_text: [{ text: { content: signal.summary.slice(0, 2000) } }] },
      },
    });
    return page.id;
  } catch (err) {
    console.error("[competitive-monitor] create intel record failed:", err);
    return null;
  }
}

// ─── Claude + web search ──────────────────────────────────────────────────────

interface ParsedSignal {
  entity: string;
  section: "competitor_pulse" | "sector_signal";
  signalType: string;
  relevance: string;
  title: string;
  summary: string;
  sourceUrl: string;
  dateSignal: string;
}

async function runCompetitiveSearch(
  competitors: WatchlistEntry[],
  sectorOrgs: WatchlistEntry[],
  lookbackDays: number,
): Promise<{ signals: ParsedSignal[]; rawReport: string }> {
  const today = new Date().toISOString().slice(0, 10);
  const cutoff = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000)
    .toISOString().slice(0, 10);

  const competitorList = competitors
    .map(c => `- ${c.name} (${c.website})${c.notes ? ` — ${c.notes.slice(0, 100)}` : ""}`)
    .join("\n");

  const sectorList = sectorOrgs
    .map(c => `- ${c.name} (${c.website})${c.notes ? ` — ${c.notes.slice(0, 100)}` : ""}`)
    .join("\n");

  const prompt = `You are the Competitive Monitor Agent for Common House (CH), a circular economy consultancy and accelerator based in the UK.

Today: ${today}. Only include signals published after ${cutoff}.

## Your task
Search the web for recent news and public signals for each entity below. Look for:
- Grants won or applied for
- Partnerships or collaborations signed
- New hires or leadership changes
- Media coverage, interviews, keynotes
- Product or service launches
- Funding rounds
- Events or conference appearances
- Campaigns or public initiatives

## Common House context (for relevance scoring)
CH is a circular economy consultancy that works with UK retailers (Co-op, Waitrose, etc.) and FMCG brands. It runs a portfolio accelerator for circular startups. CH is pursuing grants (Horizon Europe, Innovate UK, SUFI). Direct competitors are Perpetual, Upstream, Unpackaged, Searious Business.

Alta relevance = directly threatens or helps CH (same grant, same retailer, same hiring pool).
Media relevance = worth monitoring but no immediate threat.
Baja relevance = context only.

---

## SECTION 1 — COMPETITOR PULSE
Search for recent signals from these direct competitors:
${competitorList}

## SECTION 2 — SECTOR SIGNAL
Search for recent signals from these sector organisations:
${sectorList}

---

## Output format
Return a structured JSON array of signals found. Each signal:
{
  "entity": "exact name from list above",
  "section": "competitor_pulse" | "sector_signal",
  "signalType": "Grant" | "Partnership" | "Hiring" | "Media / PR" | "Evento" | "Funding" | "Producto" | "Campana" | "Contenido",
  "relevance": "Alta" | "Media" | "Baja",
  "title": "factual headline, max 120 chars",
  "summary": "2-3 sentences: what happened + why it matters to CH",
  "sourceUrl": "direct URL to the article or post",
  "dateSignal": "YYYY-MM-DD or empty if unknown"
}

After the JSON array, add a brief human-readable summary section with:
--- COMPETITOR PULSE (top 5 signals) ---
--- SECTOR SIGNAL (top 5 signals) ---
--- P1 SIGNALS (Alta + Grant/Partnership/Funding/Hiring) ---`;

  // Use Anthropic API with web search beta
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const response = await (anthropic as any).beta.messages.create({
    model:      "claude-sonnet-4-5",
    max_tokens: 8192,
    betas:      ["web-search-2025-03-05"],
    tools:      [{ type: "web_search_20250305", name: "web_search", max_uses: 20 }],
    messages:   [{ role: "user", content: prompt }],
  });

  // Extract text from response
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rawText = response.content
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .filter((b: any) => b.type === "text")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((b: any) => b.text)
    .join("\n");

  // Parse JSON array from response
  let signals: ParsedSignal[] = [];
  try {
    const jsonMatch = rawText.match(/\[[\s\S]*?\]/);
    if (jsonMatch) {
      signals = JSON.parse(jsonMatch[0]);
    }
  } catch {
    console.warn("[competitive-monitor] Could not parse JSON signals from response");
  }

  return { signals, rawReport: rawText };
}

// ─── Main handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  if (!await authCheck(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const mode         = body.mode         ?? "dry_run";
  const lookbackDays = body.lookback_days ?? 30;

  // 1. Fetch watchlist entries
  const [competitors, sectorOrgs] = await Promise.all([
    fetchWatchlist(["Competitor"]).catch(() => [] as WatchlistEntry[]),
    fetchWatchlist(["Sector"]).catch(()     => [] as WatchlistEntry[]),
  ]);

  if (competitors.length === 0 && sectorOrgs.length === 0) {
    return NextResponse.json({ error: "No active Watchlist entries found" }, { status: 400 });
  }

  // 2. Run competitive search with Claude + web search
  const { signals, rawReport } = await runCompetitiveSearch(
    competitors, sectorOrgs, lookbackDays
  );

  // Build lookup map name → watchlist entry
  const watchlistMap = new Map<string, WatchlistEntry>(
    [...competitors, ...sectorOrgs].map(e => [e.name.toLowerCase(), e])
  );

  // 3. Process signals — dedup + create (execute only)
  const results = {
    total:             signals.length,
    created:           0,
    duplicate_skipped: 0,
    dry_run_proposed:  0,
    p1_signals:        [] as string[],
    errors:            0,
  };

  for (const signal of signals) {
    const entry = watchlistMap.get(signal.entity.toLowerCase())
      ?? [...watchlistMap.values()].find(e => signal.entity.toLowerCase().includes(e.name.toLowerCase()));

    if (!entry) continue;

    const isP1 = signal.relevance === "Alta" &&
      ["Grant", "Partnership", "Funding", "Hiring"].includes(signal.signalType);

    if (isP1) results.p1_signals.push(`${signal.signalType} · ${entry.name} — ${signal.title}`);

    if (mode === "execute") {
      const isDuplicate = await dedupeCheck(entry.id, signal.title);
      if (isDuplicate) {
        results.duplicate_skipped++;
        continue;
      }
      const pageId = await createIntelRecord({ ...signal, watchlistId: entry.id, watchlistName: entry.name });
      if (pageId) results.created++;
      else results.errors++;
    } else {
      results.dry_run_proposed++;
    }
  }

  // 4. Update Last Scan dates (execute only)
  if (mode === "execute") {
    const allEntries = [...competitors, ...sectorOrgs];
    await Promise.allSettled(
      allEntries.map(e =>
        notion.pages.update({
          page_id: e.id,
          properties: { "Last Scan": { date: { start: new Date().toISOString().slice(0, 10) } } },
        })
      )
    );
  }

  return NextResponse.json({
    ok:             true,
    mode,
    lookback_days:  lookbackDays,
    run_date:       new Date().toISOString(),
    entities: {
      competitors: competitors.map(c => c.name),
      sector:      sectorOrgs.map(s => s.name),
    },
    results,
    report: rawReport,
  });
}

// Vercel cron calls GET
export async function GET(req: NextRequest) {
  // Cron runs in dry_run by default — change to execute once confirmed working
  return POST(new Request(req.url, {
    method:  "POST",
    headers: req.headers,
    body:    JSON.stringify({ mode: "execute", lookback_days: 7 }),
  }) as NextRequest);
}
