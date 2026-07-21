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
 * STATUS (2026-04-24): cron re-enabled weekly (Mon 07:00 UTC). Output now
 * consumed by the Hall "Competitive intel" panel (src/components/
 * CompetitiveIntelPanel.tsx), fed by getRecentCompetitiveIntel() which
 * joins Intel records with CH Watchlist entries. Re-enabled because
 * there is a real product surface reading the writes.
 */

import { NextRequest, NextResponse, after } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { currentUser } from "@clerk/nextjs/server";
import { isAdminUser, isAdminEmail } from "@/lib/clients";
import { getSupabaseServerClient } from "@/lib/supabase-server";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ─── Auth ─────────────────────────────────────────────────────────────────────

async function authCheck(req: NextRequest): Promise<boolean> {
  const agentKey  = req.headers.get("x-agent-key");
  const cronToken = req.headers.get("authorization");
  const expected  = process.env.CRON_SECRET;
  if (expected && agentKey === expected)              return true;
  if (expected && cronToken === `Bearer ${expected}`) return true;
  try {
    // Check id AND email — the production Clerk userId differs from dev, so
    // admin access must also resolve via ADMIN_EMAILS (mirrors adminGuardApi).
    const user = await currentUser();
    if (user) {
      const email = user.primaryEmailAddress?.emailAddress ?? "";
      if (isAdminUser(user.id) || isAdminEmail(email)) return true;
    }
  } catch { /* no-op */ }
  return false;
}

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
  const sb = getSupabaseServerClient();
  const { data, error } = await sb
    .from("watchlist_entities")
    .select("notion_id, name, watch_type, url, notes")
    .in("watch_type", types)
    .limit(20);
  if (error) throw new Error(error.message);

  return (data ?? []).map(p => ({
    id:            p.notion_id as string,
    name:          (p.name as string) ?? "",
    type:          (p.watch_type as string) ?? "",
    website:       (p.url as string) ?? "",
    // No Twitter/X, LinkedIn, or Scan Frequency columns in the Supabase schema.
    twitterX:      "",
    linkedInUrl:   "",
    scanFrequency: "",
    notes:         (p.notes as string) ?? "",
  }));
}

async function dedupeCheck(watchlistPageId: string, title: string): Promise<boolean> {
  try {
    const sb = getSupabaseServerClient();
    const { data } = await sb
      .from("competitive_intel")
      .select("id")
      .eq("watchlist_entity_notion_id", watchlistPageId)
      .ilike("title", `%${title.slice(0, 50)}%`)
      .limit(1);
    return !!(data && data.length > 0);
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
    // notion-cutoff-2026-06-02: removed; canonical write is now to competitive_intel (Supabase).
    // const page = await notion.pages.create({
    //   parent: { database_id: DB_INTEL },
    //   properties: {
    //     "Title":           { title: [{ text: { content: signal.title.slice(0, 120) } }] },
    //     "Watchlist Entry": { relation: [{ id: signal.watchlistId }] },
    //     "Signal Type":     { select: { name: signal.signalType } },
    //     "Relevance":       { select: { name: signal.relevance } },
    //     "Status":          { select: { name: "New" } },
    //     "Source URL":      { url: signal.sourceUrl || null },
    //     "Date Captured":   { date: { start: new Date().toISOString().slice(0, 10) } },
    //     "Summary":         { rich_text: [{ text: { content: signal.summary.slice(0, 2000) } }] },
    //   },
    // });
    // return page.id;
    const sb = getSupabaseServerClient();
    const todayDate = new Date().toISOString().slice(0, 10);
    // Notion → Supabase (competitive_intel) column mapping:
    //   Title           → title
    //   Watchlist Entry → watchlist_entity_notion_id (string FK to watchlist_entities.notion_id)
    //   Signal Type     → signal_type
    //   Date Captured   → signal_date (date)
    //   Summary         → body_md
    //   Source URL      → url
    // Anything not bound to a column (Relevance, Status="New") goes to payload jsonb
    // until Phase 6 binds it to dedicated columns or drops payload.
    const { data, error } = await sb
      .from("competitive_intel")
      .insert({
        title:                       signal.title.slice(0, 120),
        watchlist_entity_notion_id:  signal.watchlistId,
        signal_type:                 signal.signalType,
        signal_date:                 signal.dateSignal || todayDate,
        body_md:                     signal.summary.slice(0, 2000),
        url:                         signal.sourceUrl || null,
        source_agent:                "competitive-monitor",
        payload:                     {
          relevance: signal.relevance,
          status:    "New",
          watchlist_name: signal.watchlistName,
        },
      })
      .select("id")
      .single();
    if (error) {
      console.error("[competitive-monitor] create intel record failed:", error.message);
      return null;
    }
    return (data?.id as string) ?? null;
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

// ─── Scan core ──────────────────────────────────────────────────────────────

type ScanOutcome = {
  results: {
    total: number;
    created: number;
    duplicate_skipped: number;
    dry_run_proposed: number;
    p1_signals: string[];
    errors: number;
  };
  rawReport: string;
  competitors: WatchlistEntry[];
  sectorOrgs: WatchlistEntry[];
};

/** Runs the full scan. Throws "No active Watchlist entries found" if empty. */
async function runScan(mode: string, lookbackDays: number): Promise<ScanOutcome> {
  // 1. Fetch watchlist entries
  const [competitors, sectorOrgs] = await Promise.all([
    fetchWatchlist(["Competitor"]).catch(() => [] as WatchlistEntry[]),
    fetchWatchlist(["Sector"]).catch(()     => [] as WatchlistEntry[]),
  ]);

  if (competitors.length === 0 && sectorOrgs.length === 0) {
    throw new Error("No active Watchlist entries found");
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
    const sb = getSupabaseServerClient();
    const todayIso = new Date().toISOString();
    const todayDate = todayIso.slice(0, 10);
    // watchlist_entities has no native last_scan column yet (Phase 1 schema).
    // Stash it in payload.last_scan until Phase 6 binds a column.
    await Promise.allSettled(
      allEntries.map(async e => {
        // Read existing payload to merge non-destructively.
        const { data: existing } = await sb
          .from("watchlist_entities")
          .select("payload")
          .eq("notion_id", e.id)
          .maybeSingle();
        const mergedPayload = {
          ...(existing?.payload as Record<string, unknown> | null ?? {}),
          last_scan: todayDate,
        };
        await sb
          .from("watchlist_entities")
          .update({ payload: mergedPayload, updated_at: todayIso })
          .eq("notion_id", e.id);
      })
    );
  }

  return { results, rawReport, competitors, sectorOrgs };
}

/**
 * Runs a scan and records one routine_runs row (success or error) so both the
 * synchronous cron path and the background button path stay visible in the
 * routines health panel. Re-throws so the caller can map the error to a status.
 * (Replaces the old withRoutineLog wrapper, which would have logged the instant
 * 202 of the background path instead of the real work.)
 */
async function runScanAndLog(mode: string, lookbackDays: number): Promise<ScanOutcome> {
  const startedAt = new Date();
  const t0 = Date.now();
  let status: "success" | "error" = "success";
  let errorMessage: string | null = null;
  let outcome: ScanOutcome | null = null;
  try {
    outcome = await runScan(mode, lookbackDays);
    return outcome;
  } catch (err) {
    status = "error";
    errorMessage = err instanceof Error ? err.message : String(err);
    throw err;
  } finally {
    try {
      const sb = getSupabaseServerClient();
      await sb.from("routine_runs").insert({
        routine_name:    "competitive-monitor",
        started_at:      startedAt.toISOString(),
        finished_at:     new Date().toISOString(),
        duration_ms:     Date.now() - t0,
        status,
        http_status:     status === "success" ? 200 : 500,
        records_read:    outcome ? outcome.competitors.length + outcome.sectorOrgs.length : null,
        records_written: outcome ? outcome.results.created : null,
        error_message:   errorMessage,
      });
    } catch (e) {
      console.error("[competitive-monitor] routine_runs insert failed:", e instanceof Error ? e.message : String(e));
    }
  }
}

// ─── Main handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest): Promise<Response> {
  if (!await authCheck(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const mode         = body.mode          ?? "dry_run";
  const lookbackDays = body.lookback_days ?? 30;
  const background   = body.background === true;

  // Background mode: the web-search scan runs ~2-3 min — longer than a browser
  // fetch reliably stays open (the "Error de red" the UI used to hit). Schedule
  // the work with after() so it continues server-side (up to maxDuration) after
  // we return immediately. routine_runs is still written inside runScanAndLog.
  if (background) {
    after(async () => {
      try { await runScanAndLog(mode, lookbackDays); }
      catch { /* already logged in runScanAndLog */ }
    });
    return NextResponse.json({ ok: true, started: true, mode });
  }

  // Synchronous mode — Vercel cron GET (server-to-server, no browser timeout).
  try {
    const out = await runScanAndLog(mode, lookbackDays);
    return NextResponse.json({
      ok:             true,
      mode,
      lookback_days:  lookbackDays,
      run_date:       new Date().toISOString(),
      // Top-level count fields so UI clients have a stable contract without
      // reaching into `results`. Both consumers (CompetitiveIntelClient reads
      // `signalsCreated`, CompetitiveIntelPanel reads `created`) resolve here.
      created:        out.results.created,
      signalsCreated: out.results.created,
      entities: {
        competitors: out.competitors.map(c => c.name),
        sector:      out.sectorOrgs.map(s => s.name),
      },
      results: out.results,
      report:  out.rawReport,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    if (msg.includes("No active Watchlist")) {
      return NextResponse.json({ error: "No active Watchlist entries found" }, { status: 400 });
    }
    console.error("[competitive-monitor] scan failed:", msg);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

// Vercel cron calls GET — invoke execute mode with 7-day lookback through the
// synchronous path so the run is captured in routine_runs (runScanAndLog).
export async function GET(req: NextRequest) {
  const wrapped = new Request(req.url, {
    method:  "POST",
    headers: req.headers,
    body:    JSON.stringify({ mode: "execute", lookback_days: 7 }),
  }) as NextRequest;
  return POST(wrapped);
}
