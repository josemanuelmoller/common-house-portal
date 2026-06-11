/**
 * /admin/control-plane
 *
 * Unified dashboard for AI performance — answers four questions:
 *   1. What did the system spend in the last 7 days?
 *   2. Which agents had errors?
 *   3. What's the human acceptance rate per agent?
 *   4. What active error clusters need attention?
 *
 * Single source of truth across:
 *   - routine_runs (cron telemetry, cost_usd)
 *   - proposal_outcomes (human accept/reject/edit decisions)
 *   - agent_health_diagnoses (clustered error patterns)
 *   - ROUTINE_CATALOG (which agents are P1 / expected to run)
 */

import { requireAdmin } from "@/lib/require-admin";
import { PortalShell } from "@/components/PortalShell";
import { HallSection } from "@/components/HallSection";
import { ROUTINE_CATALOG } from "@/lib/routine-log";
import { getSupabaseServerClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

// ── Data layer ───────────────────────────────────────────────────────────────

type AgentActivity7d = {
  routine_name: string;
  runs: number;
  errors: number;
  total_cost: number | null;
  avg_duration_ms: number | null;
  last_run: string | null;
};

type AcceptanceRow = {
  agent_name: string | null;
  decisions: number;
  approved: number;
  edited: number;
  rejected: number;
  revision_requested: number;
  skipped: number;
};

type Diagnosis = {
  cluster_key: string;
  routine_name: string;
  classification: string;
  confidence: string;
  occurrence_count: number;
  last_seen: string;
  status: string;
};

async function loadActivity7d(): Promise<AgentActivity7d[]> {
  const sb = getSupabaseServerClient();
  // Aggregation happens client-side after fetching the rows because PostgREST
  // doesn't support GROUP BY directly. The 7-day window keeps this small.
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data } = await sb
    .from("routine_runs")
    .select("routine_name, status, cost_usd, duration_ms, started_at")
    .gte("started_at", since)
    .limit(2000);

  type Row = {
    routine_name: string;
    status: string;
    cost_usd: number | null;
    duration_ms: number | null;
    started_at: string;
  };
  const rows = (data ?? []) as Row[];
  const map = new Map<string, AgentActivity7d>();
  for (const r of rows) {
    const cur = map.get(r.routine_name) ?? {
      routine_name: r.routine_name,
      runs: 0,
      errors: 0,
      total_cost: 0,
      avg_duration_ms: 0,
      last_run: null,
    };
    cur.runs++;
    if (r.status === "error") cur.errors++;
    if (r.cost_usd != null) cur.total_cost = (cur.total_cost ?? 0) + r.cost_usd;
    if (r.duration_ms != null) cur.avg_duration_ms = (cur.avg_duration_ms ?? 0) + r.duration_ms;
    if (!cur.last_run || r.started_at > cur.last_run) cur.last_run = r.started_at;
    map.set(r.routine_name, cur);
  }
  // Convert summed avg into actual avg
  for (const v of map.values()) {
    if (v.avg_duration_ms != null && v.runs > 0) v.avg_duration_ms = v.avg_duration_ms / v.runs;
    if (v.total_cost === 0) v.total_cost = null;
  }
  return Array.from(map.values());
}

async function loadAcceptance7d(): Promise<AcceptanceRow[]> {
  const sb = getSupabaseServerClient();
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data } = await sb
    .from("proposal_outcomes")
    .select("agent_name, action")
    .gte("decided_at", since)
    .limit(2000);

  type Row = { agent_name: string | null; action: string };
  const rows = (data ?? []) as Row[];
  const map = new Map<string, AcceptanceRow>();
  for (const r of rows) {
    const key = r.agent_name ?? "(unknown)";
    const cur = map.get(key) ?? {
      agent_name: r.agent_name,
      decisions: 0,
      approved: 0,
      edited: 0,
      rejected: 0,
      revision_requested: 0,
      skipped: 0,
    };
    cur.decisions++;
    if (r.action === "approved") cur.approved++;
    else if (r.action === "edited") cur.edited++;
    else if (r.action === "rejected") cur.rejected++;
    else if (r.action === "revision_requested") cur.revision_requested++;
    else if (r.action === "skipped") cur.skipped++;
    map.set(key, cur);
  }
  return Array.from(map.values()).sort((a, b) => b.decisions - a.decisions);
}

async function loadActiveDiagnoses(): Promise<Diagnosis[]> {
  const sb = getSupabaseServerClient();
  const { data } = await sb
    .from("agent_health_diagnoses")
    .select("cluster_key, routine_name, classification, confidence, occurrence_count, last_seen, status")
    .in("status", ["new", "acknowledged"])
    .order("last_seen", { ascending: false })
    .limit(20);
  return (data ?? []) as Diagnosis[];
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmtCost(n: number | null): string {
  if (n == null) return "—";
  if (n < 0.01) return `$${n.toFixed(4)}`;
  if (n < 1) return `$${n.toFixed(3)}`;
  return `$${n.toFixed(2)}`;
}

function fmtDuration(ms: number | null): string {
  if (ms == null) return "—";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function relativeTime(iso: string | null): string {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return "ahora";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h`;
  return `${Math.floor(hr / 24)}d`;
}

function pct(num: number, den: number): string {
  if (den === 0) return "—";
  return `${Math.round((num / den) * 100)}%`;
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default async function ControlPlanePage() {
  await requireAdmin();

  const [activity, acceptance, diagnoses] = await Promise.all([
    loadActivity7d(),
    loadAcceptance7d(),
    loadActiveDiagnoses(),
  ]);

  // KPIs
  const totalRuns = activity.reduce((s, a) => s + a.runs, 0);
  const totalErrors = activity.reduce((s, a) => s + a.errors, 0);
  const totalCost = activity.reduce((s, a) => s + (a.total_cost ?? 0), 0);
  const totalDecisions = acceptance.reduce((s, a) => s + a.decisions, 0);
  const totalApproved = acceptance.reduce((s, a) => s + a.approved, 0);
  const acceptanceRate = totalDecisions > 0 ? totalApproved / totalDecisions : null;

  // P1 stale: P1 routines that have not run in the last 24h (excluding clearly
  // weekly ones — we approximate "should have run by now" by Daily/Mon-Fri).
  const staleP1 = Object.entries(ROUTINE_CATALOG)
    .filter(([, meta]) => meta.priority === 1 && !meta.retired)
    .map(([name, meta]) => ({
      name,
      meta,
      last_run: activity.find((a) => a.routine_name === name)?.last_run ?? null,
    }))
    .filter((r) => {
      if (!/Mon-Fri|daily|Daily/.test(r.meta.schedule)) return false;
      if (!r.last_run) return true;
      const ageHr = (Date.now() - new Date(r.last_run).getTime()) / 3_600_000;
      return ageHr > 26; // 26h = 24h SLA + 2h grace
    });

  // Cost ranking — top spenders this week
  const costRanked = [...activity]
    .filter((a) => a.total_cost != null && a.total_cost > 0)
    .sort((a, b) => (b.total_cost ?? 0) - (a.total_cost ?? 0));

  // Activity ranking — by run count for completeness
  const runRanked = [...activity].sort((a, b) => b.runs - a.runs);

  const headerMeta = (
    <div className="flex items-center gap-2">
      <a href="/admin/agents" className="hall-btn-ghost" style={{ fontSize: 11 }}>
        Registry ↗
      </a>
      <a href="/admin/agents/health" className="hall-btn-ghost" style={{ fontSize: 11 }}>
        Health ↗
      </a>
    </div>
  );

  return (
    <PortalShell
      eyebrow={{ label: "CONTROL PLANE", accent: "LAST 7 DAYS" }}
      title="System"
      flourish="pulse"
      meta={headerMeta}
      subtitle="Telemetry, cost, and acceptance signal across every cron, agent, and human approval. Read-only — surfaces drift early so we can intervene."
    >
      {/* KPI strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KPI
          label="Total runs"
          value={String(totalRuns)}
          tail={`${activity.length} routines reporting`}
        />
        <KPI
          label="Errors"
          value={String(totalErrors)}
          tail={pct(totalErrors, totalRuns) + " error rate"}
          color={totalErrors > 0 ? "var(--hall-danger)" : "var(--hall-ok)"}
        />
        <KPI
          label="Cost (7d)"
          value={fmtCost(totalCost > 0 ? totalCost : null)}
          tail={
            costRanked.length > 0
              ? `${costRanked.length} agente${costRanked.length !== 1 ? "s" : ""} con cost`
              : "ningún cost reportado todavía"
          }
        />
        <KPI
          label="Acceptance rate"
          value={acceptanceRate != null ? `${Math.round(acceptanceRate * 100)}%` : "—"}
          tail={`${totalApproved}/${totalDecisions} decisiones`}
          color={
            acceptanceRate == null
              ? "var(--hall-muted-3)"
              : acceptanceRate >= 0.7
              ? "var(--hall-ok)"
              : acceptanceRate >= 0.4
              ? "var(--hall-warn)"
              : "var(--hall-danger)"
          }
        />
      </div>

      {/* P1 stale alerts */}
      {staleP1.length > 0 && (
        <HallSection
          title="P1"
          flourish="alerts"
          meta={`${staleP1.length} CRITICAL ROUTINE${staleP1.length !== 1 ? "S" : ""} STALE`}
        >
          <div className="border" style={{ borderColor: "var(--hall-danger)" }}>
            <ul className="flex flex-col">
              {staleP1.map((r) => (
                <li
                  key={r.name}
                  className="grid grid-cols-[1fr_140px_120px] gap-3 items-center px-3 py-3"
                  style={{ borderTop: "1px solid var(--hall-line-soft)" }}
                >
                  <p
                    style={{
                      fontFamily: "var(--font-hall-mono)",
                      fontSize: 11,
                      fontWeight: 700,
                      color: "var(--hall-ink-0)",
                    }}
                  >
                    {r.name}
                  </p>
                  <p
                    style={{
                      fontFamily: "var(--font-hall-mono)",
                      fontSize: 10,
                      color: "var(--hall-muted-2)",
                    }}
                  >
                    expects: {r.meta.schedule}
                  </p>
                  <p
                    style={{
                      fontFamily: "var(--font-hall-mono)",
                      fontSize: 10,
                      color: "var(--hall-danger)",
                    }}
                  >
                    last: {r.last_run ? relativeTime(r.last_run) : "nunca"}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        </HallSection>
      )}

      {/* Cost by agent */}
      <HallSection
        title="Cost"
        flourish="by agent"
        meta={`7D · ${costRanked.length} REPORTING`}
      >
        {costRanked.length === 0 ? (
          <EmptyState
            text="Ninguna routine ha reportado cost_usd todavía. Wire computeAnthropicCost() al response JSON de routes Anthropic-powered."
          />
        ) : (
          <div>
            <TableHeaders cols={["Routine", "Runs", "Avg duration", "Total cost"]} />
            <ul className="flex flex-col">
              {costRanked.map((a) => (
                <li
                  key={a.routine_name}
                  className="grid grid-cols-[1fr_80px_140px_140px] gap-3 items-center px-1 py-2.5"
                  style={{ borderTop: "1px solid var(--hall-line-soft)" }}
                >
                  <Cell mono bold>{a.routine_name}</Cell>
                  <Cell mono>{String(a.runs)}</Cell>
                  <Cell mono muted>{fmtDuration(a.avg_duration_ms)}</Cell>
                  <Cell mono bold>{fmtCost(a.total_cost)}</Cell>
                </li>
              ))}
            </ul>
          </div>
        )}
      </HallSection>

      {/* Activity by agent */}
      <HallSection
        title="Activity"
        flourish="by agent"
        meta={`7D · ${runRanked.length} ROUTINES`}
      >
        {runRanked.length === 0 ? (
          <EmptyState text="Ninguna routine ha corrido en los últimos 7 días." />
        ) : (
          <div>
            <TableHeaders cols={["Routine", "Runs", "Errors", "Last run"]} />
            <ul className="flex flex-col">
              {runRanked.map((a) => (
                <li
                  key={a.routine_name}
                  className="grid grid-cols-[1fr_80px_80px_120px] gap-3 items-center px-1 py-2.5"
                  style={{ borderTop: "1px solid var(--hall-line-soft)" }}
                >
                  <Cell mono bold>{a.routine_name}</Cell>
                  <Cell mono>{String(a.runs)}</Cell>
                  <Cell mono color={a.errors > 0 ? "var(--hall-danger)" : "var(--hall-muted-2)"}>
                    {String(a.errors)}
                  </Cell>
                  <Cell mono muted>{relativeTime(a.last_run)}</Cell>
                </li>
              ))}
            </ul>
          </div>
        )}
      </HallSection>

      {/* Acceptance rate by agent */}
      <HallSection
        title="Acceptance"
        flourish="rate"
        meta={`7D · ${acceptance.length} AGENT${acceptance.length !== 1 ? "S" : ""} WITH FEEDBACK`}
      >
        {acceptance.length === 0 ? (
          <EmptyState
            text="Ningún proposal ha sido decidido por humano en los últimos 7 días. Drafts y pitches escriben aquí cuando se aprueban/rechazan."
          />
        ) : (
          <div>
            <TableHeaders
              cols={["Agent", "Decisions", "Approved", "Edited", "Rejected", "Rate"]}
            />
            <ul className="flex flex-col">
              {acceptance.map((row) => {
                const rate = row.decisions > 0 ? row.approved / row.decisions : 0;
                const rateColor =
                  row.decisions === 0
                    ? "var(--hall-muted-3)"
                    : rate >= 0.7
                    ? "var(--hall-ok)"
                    : rate >= 0.4
                    ? "var(--hall-warn)"
                    : "var(--hall-danger)";
                return (
                  <li
                    key={row.agent_name ?? "(unknown)"}
                    className="grid grid-cols-[1.4fr_90px_90px_80px_90px_80px] gap-3 items-center px-1 py-2.5"
                    style={{ borderTop: "1px solid var(--hall-line-soft)" }}
                  >
                    <Cell mono bold>{row.agent_name ?? "(unknown)"}</Cell>
                    <Cell mono>{String(row.decisions)}</Cell>
                    <Cell mono color="var(--hall-ok)">{String(row.approved)}</Cell>
                    <Cell mono muted>{String(row.edited)}</Cell>
                    <Cell mono color="var(--hall-danger)">
                      {String(row.rejected + row.revision_requested + row.skipped)}
                    </Cell>
                    <Cell mono bold color={rateColor}>{pct(row.approved, row.decisions)}</Cell>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </HallSection>

      {/* Active diagnoses */}
      <HallSection
        title="Error"
        flourish="clusters"
        meta={
          <a href="/admin/agents/health" className="hall-btn-ghost" style={{ fontSize: 11 }}>
            Open all ↗
          </a>
        }
      >
        {diagnoses.length === 0 ? (
          <EmptyState text="Sin diagnoses activos. diagnose-agent-errors clusters errors 2× por día." />
        ) : (
          <div>
            <TableHeaders
              cols={["Routine", "Classification", "Confidence", "Count", "Last seen", "Status"]}
            />
            <ul className="flex flex-col">
              {diagnoses.map((d) => (
                <li
                  key={d.cluster_key}
                  className="grid grid-cols-[1.2fr_1.2fr_90px_70px_90px_90px] gap-3 items-center px-1 py-2.5"
                  style={{ borderTop: "1px solid var(--hall-line-soft)" }}
                >
                  <Cell mono bold>{d.routine_name}</Cell>
                  <Cell mono>{d.classification}</Cell>
                  <Cell mono muted>{d.confidence}</Cell>
                  <Cell mono>{String(d.occurrence_count)}</Cell>
                  <Cell mono muted>{relativeTime(d.last_seen)}</Cell>
                  <Cell
                    mono
                    bold
                    color={d.status === "new" ? "var(--hall-danger)" : "var(--hall-warn)"}
                  >
                    {d.status.toUpperCase()}
                  </Cell>
                </li>
              ))}
            </ul>
          </div>
        )}
      </HallSection>

      {/* Footer */}
      <p
        style={{
          fontFamily: "var(--font-hall-mono)",
          fontSize: 10,
          color: "var(--hall-muted-3)",
        }}
      >
        Sources: <code>routine_runs</code> (cost + activity), <code>proposal_outcomes</code>{" "}
        (human feedback), <code>agent_health_diagnoses</code> (clusters), <code>ROUTINE_CATALOG</code>{" "}
        (P1 expectations). Window: rolling 7 days. Page is read-only.
      </p>
    </PortalShell>
  );
}

// ── Local components ─────────────────────────────────────────────────────────

function KPI({
  label,
  value,
  tail,
  color = "var(--hall-ink-0)",
}: {
  label: string;
  value: string;
  tail: string;
  color?: string;
}) {
  return (
    <div className="p-4" style={{ border: "1px solid var(--hall-line)" }}>
      <p
        className="mb-1.5"
        style={{
          fontFamily: "var(--font-hall-mono)",
          fontSize: 10,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: "var(--hall-muted-2)",
        }}
      >
        {label}
      </p>
      <p className="text-[1.8rem] font-[900] leading-none tracking-tight" style={{ color }}>
        {value}
      </p>
      <p
        style={{
          fontFamily: "var(--font-hall-mono)",
          fontSize: 10,
          color: "var(--hall-muted-2)",
          marginTop: 6,
        }}
      >
        {tail}
      </p>
    </div>
  );
}

function TableHeaders({ cols }: { cols: string[] }) {
  return (
    <div
      className="hidden md:flex items-center gap-3 px-1 py-2"
      style={{ borderBottom: "1px solid var(--hall-line)" }}
    >
      {cols.map((c, i) => (
        <p
          key={c}
          className="flex-1"
          style={{
            fontFamily: "var(--font-hall-mono)",
            fontSize: 10,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: "var(--hall-muted-2)",
            textAlign: i === 0 ? "left" : "left",
          }}
        >
          {c}
        </p>
      ))}
    </div>
  );
}

function Cell({
  children,
  mono,
  bold,
  muted,
  color,
}: {
  children: React.ReactNode;
  mono?: boolean;
  bold?: boolean;
  muted?: boolean;
  color?: string;
}) {
  return (
    <p
      className="truncate"
      style={{
        fontFamily: mono ? "var(--font-hall-mono)" : "var(--font-hall-sans)",
        fontSize: mono ? 11 : 12,
        fontWeight: bold ? 700 : 400,
        color: color ?? (muted ? "var(--hall-muted-3)" : "var(--hall-ink-0)"),
      }}
    >
      {children}
    </p>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="px-4 py-6" style={{ border: "1px dashed var(--hall-line)" }}>
      <p
        style={{
          fontFamily: "var(--font-hall-mono)",
          fontSize: 11,
          color: "var(--hall-muted-3)",
        }}
      >
        {text}
      </p>
    </div>
  );
}
