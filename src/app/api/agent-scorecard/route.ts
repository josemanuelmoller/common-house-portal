/**
 * GET/POST /api/agent-scorecard
 *
 * Monthly Balanced Scorecard for OS v2 agents and cron routines.
 *
 * Reads Supabase `routine_runs` (last N days) for live frequency/cost/health,
 * applies a static token cost model for projected monthly spend, and writes a
 * formatted markdown report to Agent Drafts [OS v2].
 *
 * Pure TypeScript — no Anthropic API call needed; output is deterministic.
 *
 * Auth: x-agent-key / CRON_SECRET header OR authenticated admin session.
 * Called by Vercel cron on the 1st of each month at 07:45 UTC.
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { isAdminUser } from "@/lib/clients";
import { withRoutineLog } from "@/lib/routine-log";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { createCanonicalRow } from "@/lib/canonical-write";

export const maxDuration = 120;
export const dynamic = "force-dynamic";

// ─── Auth ─────────────────────────────────────────────────────────────────────

async function authCheck(req: NextRequest): Promise<boolean> {
  const agentKey = req.headers.get("x-agent-key");
  const cronToken = req.headers.get("authorization");
  const expected = process.env.CRON_SECRET;
  if (expected && agentKey === expected) return true;
  if (expected && cronToken === `Bearer ${expected}`) return true;
  try {
    const { userId } = await auth();
    if (userId && isAdminUser(userId)) return true;
  } catch { /* no-op */ }
  return false;
}

// ─── Static cost model (Haiku 4.5) ────────────────────────────────────────────

const HAIKU_INPUT_PRICE  = 0.80 / 1_000_000;  // $/token
const HAIKU_OUTPUT_PRICE = 4.00 / 1_000_000;

interface CostModelEntry {
  routine_name:        string;       // matches routine_runs.routine_name
  display_name:        string;
  freq_per_month:      number;
  input_tokens:        number;       // per run
  output_tokens:       number;       // per run
  cadence_days:        number;       // expected gap between runs
  notes:               string;
}

const COST_MODEL: CostModelEntry[] = [
  { routine_name: "os-runner",              display_name: "os-runner (full cycle)", freq_per_month: 4,  input_tokens: 470000, output_tokens: 70000, cadence_days: 7,  notes: "Delta-only; scales with active sources" },
  { routine_name: "briefing-agent",         display_name: "briefing-agent",          freq_per_month: 4,  input_tokens: 60000,  output_tokens: 10000, cadence_days: 7,  notes: "3× quick + 1× full per month" },
  { routine_name: "hygiene-agent",          display_name: "hygiene-agent",           freq_per_month: 2,  input_tokens: 80000,  output_tokens: 8000,  cadence_days: 14, notes: "Bi-weekly; automations + entity scan" },
  { routine_name: "portfolio-health-agent", display_name: "portfolio-health-agent",  freq_per_month: 4,  input_tokens: 50000,  output_tokens: 10000, cadence_days: 7,  notes: "at_risk_only ≈60% scope reduction" },
  { routine_name: "deal-flow-agent",        display_name: "deal-flow-agent",         freq_per_month: 1,  input_tokens: 100000, output_tokens: 15000, cadence_days: 30, notes: "Monthly investor × startup matrix" },
  { routine_name: "grant-monitor",          display_name: "grant-monitor",           freq_per_month: 1,  input_tokens: 50000,  output_tokens: 10000, cadence_days: 30, notes: "Monthly agreements scan" },
  { routine_name: "grant-radar",            display_name: "grant-radar",             freq_per_month: 2,  input_tokens: 30000,  output_tokens: 8000,  cadence_days: 14, notes: "Bi-weekly web search" },
  { routine_name: "review-queue",           display_name: "review-queue",            freq_per_month: 12, input_tokens: 20000,  output_tokens: 5000,  cadence_days: 3,  notes: "~3×/week semi-live" },
  { routine_name: "generate-daily-briefing",display_name: "generate-daily-briefing", freq_per_month: 22, input_tokens: 25000,  output_tokens: 6000,  cadence_days: 1,  notes: "Mon–Fri Hall dashboard" },
  { routine_name: "competitive-monitor",    display_name: "competitive-monitor",     freq_per_month: 4,  input_tokens: 35000,  output_tokens: 8000,  cadence_days: 7,  notes: "Weekly watchlist scan" },
];

const ADHOC_BUCKETS = [
  { name: "source-intake / evidence-review", runs: 20, input: 10000, output: 3000 },
  { name: "ingest-conversation (meetings)",  runs: 25, input: 15000, output: 5000 },
  { name: "write skills (upsert-*, create-*)", runs: 30, input: 8000,  output: 3000 },
  { name: "analysis skills (vc-eyes, proposal)", runs: 10, input: 25000, output: 8000 },
];

// ─── Live data ────────────────────────────────────────────────────────────────

interface RoutineRun {
  routine_name:    string;
  started_at:      string;
  finished_at:     string | null;
  duration_ms:     number | null;
  status:          string;
  http_status:     number | null;
  records_read:    number | null;
  records_written: number | null;
  cost_usd:        number | null;
  error_message:   string | null;
}

interface AgentLiveStats {
  routine_name:        string;
  runs_in_window:      number;
  errors_in_window:    number;
  last_run_at:         string | null;
  last_status:         string | null;
  total_cost_usd:      number;        // sum of cost_usd where present
  total_records_read:  number;
  total_records_written: number;
}

async function fetchLiveStats(windowDays: number): Promise<Map<string, AgentLiveStats>> {
  const sb = getSupabaseServerClient();
  const since = new Date(Date.now() - windowDays * 86400_000).toISOString();

  const { data, error } = await sb
    .from("routine_runs")
    .select("routine_name, started_at, finished_at, duration_ms, status, http_status, records_read, records_written, cost_usd, error_message")
    .gte("started_at", since)
    .order("started_at", { ascending: false });

  if (error) {
    console.error("[agent-scorecard] routine_runs fetch failed:", error.message);
    return new Map();
  }

  const stats = new Map<string, AgentLiveStats>();
  for (const r of (data ?? []) as RoutineRun[]) {
    const cur = stats.get(r.routine_name) ?? {
      routine_name:          r.routine_name,
      runs_in_window:        0,
      errors_in_window:      0,
      last_run_at:           null,
      last_status:           null,
      total_cost_usd:        0,
      total_records_read:    0,
      total_records_written: 0,
    };
    cur.runs_in_window += 1;
    if (r.status === "error") cur.errors_in_window += 1;
    if (!cur.last_run_at) {
      cur.last_run_at = r.started_at;
      cur.last_status = r.status;
    }
    if (typeof r.cost_usd === "number")        cur.total_cost_usd        += r.cost_usd;
    if (typeof r.records_read === "number")    cur.total_records_read    += r.records_read;
    if (typeof r.records_written === "number") cur.total_records_written += r.records_written;
    stats.set(r.routine_name, cur);
  }
  return stats;
}

// ─── Compute scorecard ────────────────────────────────────────────────────────

type Bsc = "🟢" | "🟡" | "🔴" | "⚪";

interface ScoredAgent {
  display_name:        string;
  routine_name:        string;
  freq_per_month:      number;
  tokens_per_month:    number;
  cost_per_month:      number;
  last_run_at:         string | null;
  last_status:         string | null;
  errors_in_window:    number;
  runs_in_window:      number;
  bsc:                 Bsc;
  amber_red_reason:    string | null;
  cadence_days:        number;
  actual_cost_window:  number;
}

function computeAgent(model: CostModelEntry, live: AgentLiveStats | undefined, today: Date): ScoredAgent {
  const tokens_per_month = (model.input_tokens + model.output_tokens) * model.freq_per_month;
  const cost_per_month   = model.input_tokens * model.freq_per_month * HAIKU_INPUT_PRICE
                         + model.output_tokens * model.freq_per_month * HAIKU_OUTPUT_PRICE;

  const lastRunAt = live?.last_run_at ?? null;
  const ageDays   = lastRunAt ? (today.getTime() - new Date(lastRunAt).getTime()) / 86400_000 : Infinity;

  let bsc: Bsc = "🟢";
  let reason: string | null = null;

  if (!live || live.runs_in_window === 0) {
    bsc = "⚪";
    reason = "No runs recorded in window";
  } else if (live.errors_in_window > 0 && live.last_status === "error") {
    bsc = "🔴";
    reason = `Last run errored (${live.errors_in_window} errors in window)`;
  } else if (ageDays > model.cadence_days * 2) {
    bsc = "🔴";
    reason = `Last run ${Math.round(ageDays)}d ago (cadence ${model.cadence_days}d)`;
  } else if (ageDays > model.cadence_days * 1.4) {
    bsc = "🟡";
    reason = `Last run ${Math.round(ageDays)}d ago (cadence ${model.cadence_days}d)`;
  } else if (live.errors_in_window > live.runs_in_window * 0.2) {
    bsc = "🟡";
    reason = `${live.errors_in_window}/${live.runs_in_window} runs errored`;
  }

  return {
    display_name:       model.display_name,
    routine_name:       model.routine_name,
    freq_per_month:     model.freq_per_month,
    tokens_per_month,
    cost_per_month,
    last_run_at:        lastRunAt,
    last_status:        live?.last_status ?? null,
    errors_in_window:   live?.errors_in_window ?? 0,
    runs_in_window:     live?.runs_in_window ?? 0,
    bsc,
    amber_red_reason:   reason,
    cadence_days:       model.cadence_days,
    actual_cost_window: live?.total_cost_usd ?? 0,
  };
}

function computeAdhoc() {
  let cost = 0;
  let tokens = 0;
  for (const b of ADHOC_BUCKETS) {
    cost   += b.input * b.runs * HAIKU_INPUT_PRICE + b.output * b.runs * HAIKU_OUTPUT_PRICE;
    tokens += (b.input + b.output) * b.runs;
  }
  return { cost, tokens };
}

// ─── Render markdown ──────────────────────────────────────────────────────────

function fmtUsd(n: number): string { return `$${n.toFixed(2)}`; }
function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(0)}k`;
  return String(n);
}
function fmtDate(s: string | null): string { return s ? s.slice(0, 10) : "—"; }
function pct(n: number, total: number): string { return total > 0 ? `${((n / total) * 100).toFixed(0)}%` : "0%"; }

function render(
  scored:          ScoredAgent[],
  adhoc:           { cost: number; tokens: number },
  budgetUsd:       number,
  windowDays:      number,
  showBreakdown:   boolean
): string {
  const today = new Date().toISOString().slice(0, 10);

  const totalCost   = scored.reduce((a, s) => a + s.cost_per_month, 0);
  const totalTokens = scored.reduce((a, s) => a + s.tokens_per_month, 0);
  const grandTotal  = totalCost + adhoc.cost;
  const grandTokens = totalTokens + adhoc.tokens;

  const green   = scored.filter(s => s.bsc === "🟢").length;
  const amber   = scored.filter(s => s.bsc === "🟡").length;
  const red     = scored.filter(s => s.bsc === "🔴").length;
  const untrack = scored.filter(s => s.bsc === "⚪").length;

  const budgetStatus =
    grandTotal > budgetUsd       ? "Over"
    : grandTotal > budgetUsd*0.85 ? "At risk"
    :                                "Under";

  const lines: string[] = [];
  lines.push(`# Agent Scorecard — Common House OS v2`);
  lines.push(`Generated: ${today}  |  Window: last ${windowDays} days`);
  lines.push("");
  lines.push("## KPI Summary");
  lines.push(`- Total agents tracked: **${scored.length}**`);
  lines.push(`- 🟢 Healthy: ${green}  ·  🟡 Needs attention: ${amber}  ·  🔴 Critical: ${red}  ·  ⚪ Untracked: ${untrack}`);
  lines.push("");
  lines.push(`- Estimated monthly spend (scheduled): **${fmtUsd(totalCost)}**`);
  lines.push(`- Estimated monthly spend (ad-hoc): ${fmtUsd(adhoc.cost)}`);
  lines.push(`- **Grand total: ${fmtUsd(grandTotal)}**  ·  Budget ceiling: ${fmtUsd(budgetUsd)}  ·  Status: **${budgetStatus}**`);
  lines.push(`- Total tokens/month (est): ${fmtTokens(grandTokens)}`);
  lines.push("");
  lines.push("## Agent Scorecard");
  lines.push("");
  lines.push("| Agent | Freq | Tokens/mo | Cost/mo | Last Run | Status | Runs (window) | BSC |");
  lines.push("|---|---|---|---|---|---|---|---|");
  for (const s of scored.sort((a, b) => b.cost_per_month - a.cost_per_month)) {
    lines.push(
      `| ${s.display_name} | ${s.freq_per_month}×/mo | ${fmtTokens(s.tokens_per_month)} | ${fmtUsd(s.cost_per_month)} | ${fmtDate(s.last_run_at)} | ${s.last_status ?? "—"} | ${s.runs_in_window} (${s.errors_in_window} err) | ${s.bsc} |`
    );
  }
  lines.push(`| Ad-hoc skills | — | ${fmtTokens(adhoc.tokens)} | ${fmtUsd(adhoc.cost)} | — | — | — | — |`);
  lines.push("");

  if (showBreakdown) {
    lines.push("## Cost Breakdown");
    const top3 = [...scored].sort((a, b) => b.cost_per_month - a.cost_per_month).slice(0, 3);
    lines.push("");
    lines.push("**Top 3 cost drivers:**");
    top3.forEach((s, i) => {
      lines.push(`${i + 1}. ${s.display_name} — ${fmtUsd(s.cost_per_month)}/mo (${pct(s.cost_per_month, grandTotal)} of total)`);
    });
    lines.push("");
    lines.push(`**Ad-hoc share:** ${fmtUsd(adhoc.cost)}/mo (${pct(adhoc.cost, grandTotal)} of total)`);
    lines.push("");
  }

  // Alerts
  const redAgents   = scored.filter(s => s.bsc === "🔴");
  const amberAgents = scored.filter(s => s.bsc === "🟡");
  const untrackedAgents = scored.filter(s => s.bsc === "⚪");
  if (redAgents.length || amberAgents.length || untrackedAgents.length || budgetStatus !== "Under") {
    lines.push("## Alerts");
    for (const s of redAgents)       lines.push(`- 🔴 **${s.display_name}** — ${s.amber_red_reason}`);
    for (const s of amberAgents)     lines.push(`- 🟡 **${s.display_name}** — ${s.amber_red_reason}`);
    for (const s of untrackedAgents) lines.push(`- ⚪ ${s.display_name} — no telemetry`);
    if (budgetStatus !== "Under") lines.push(`- 💰 Budget ${budgetStatus.toLowerCase()}: ${fmtUsd(grandTotal)} vs ceiling ${fmtUsd(budgetUsd)}`);
    lines.push("");
  }

  // Recommendations
  const recs: string[] = [];
  for (const s of redAgents) {
    if (s.amber_red_reason?.includes("errored")) {
      recs.push(`HIGH — ${s.display_name} — Investigate error logs (\`/api/diagnose-agent-errors\`) — Risk: degraded automation`);
    } else if (s.amber_red_reason?.includes("Last run")) {
      recs.push(`HIGH — ${s.display_name} — Schedule overdue, run manually or check cron — Risk: stale data`);
    }
  }
  for (const s of amberAgents) {
    if (s.amber_red_reason?.includes("errored")) {
      recs.push(`MEDIUM — ${s.display_name} — Elevated error rate (${s.errors_in_window}/${s.runs_in_window}) — Risk: silent failures`);
    }
  }
  for (const s of untrackedAgents) {
    recs.push(`LOW — ${s.display_name} — No telemetry recorded; verify routine is registered with withRoutineLog`);
  }
  if (budgetStatus === "Over") {
    recs.push(`HIGH — Budget — Grand total ${fmtUsd(grandTotal)} exceeds ceiling ${fmtUsd(budgetUsd)} — Review top 3 cost drivers above`);
  }
  if (recs.length) {
    lines.push("## Recommended Actions");
    recs.slice(0, 5).forEach(r => lines.push(`- ${r}`));
    lines.push("");
  }

  lines.push("---");
  lines.push(`_skill_contract: agents_scored=${scored.length}, agents_red=${red}, agents_amber=${amber}, grand_total_usd=${grandTotal.toFixed(2)}, budget_status=${budgetStatus.toLowerCase()}_`);

  return lines.join("\n");
}

// ─── Handler ──────────────────────────────────────────────────────────────────

async function _POST(req: NextRequest) {
  if (!await authCheck(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const windowDays   = typeof body.time_window_days === "number" ? body.time_window_days : 30;
  const budgetUsd    = typeof body.budget_threshold_usd === "number" ? body.budget_threshold_usd : 150;
  const showBreakdown = body.show_cost_breakdown !== false;
  const mode         = body.mode ?? "execute";  // dry_run skips Notion write

  const today = new Date();
  const live = await fetchLiveStats(windowDays);
  const scored = COST_MODEL.map(m => computeAgent(m, live.get(m.routine_name), today));
  const adhoc = computeAdhoc();
  const markdown = render(scored, adhoc, budgetUsd, windowDays, showBreakdown);

  const grandTotal = scored.reduce((a, s) => a + s.cost_per_month, 0) + adhoc.cost;
  const counts = {
    green:     scored.filter(s => s.bsc === "🟢").length,
    amber:     scored.filter(s => s.bsc === "🟡").length,
    red:       scored.filter(s => s.bsc === "🔴").length,
    untracked: scored.filter(s => s.bsc === "⚪").length,
  };

  let draftId: string | null = null;
  if (mode === "execute") {
    const created = await createCanonicalRow({
      table: "notion_agent_drafts",
      fields: {
        title:      `Agent Scorecard — ${today.toISOString().slice(0, 10)}`,
        draft_type: "Health Report",
        status:     "Pending Review",
        draft_text: markdown.slice(0, 1990),
      },
    });
    if (created.ok) draftId = created.id ?? null;
    else console.error("[agent-scorecard] draft create failed:", created.error);
  }

  return NextResponse.json({
    ok:                true,
    mode,
    run_date:          today.toISOString(),
    window_days:       windowDays,
    budget_usd:        budgetUsd,
    grand_total_usd:   Number(grandTotal.toFixed(2)),
    counts,
    agents_scored:     scored.length,
    records_read:      Array.from(live.values()).reduce((a, s) => a + s.runs_in_window, 0),
    records_written:   draftId ? 1 : 0,
    draft_id:          draftId,
    scorecard:         scored,
    markdown,
  });
}

async function _handler(req: NextRequest): Promise<Response> {
  if (req.method === "GET") {
    const cronReq = new Request(req.url, {
      method:  "POST",
      headers: req.headers,
      body:    JSON.stringify({ mode: "execute" }),
    }) as NextRequest;
    return _POST(cronReq);
  }
  return _POST(req);
}

export const POST = withRoutineLog("agent-scorecard", _handler);
export const GET  = POST;
