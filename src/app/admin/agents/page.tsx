import { requireAdmin } from "@/lib/require-admin";
import { PortalShell } from "@/components/PortalShell";
import { HallSection } from "@/components/HallSection";
import { ROUTINE_CATALOG } from "@/lib/routine-log";

// ── Live run data from the unified agent_latest_runs view ────────────────────
//
// agent_latest_runs is a UNION of:
//   - routine_runs  (cron-style; written via withRoutineLog wrapper)
//   - agent_runs    (external skill self-report via POST /api/agent-run)
//
// One row per agent_name. routine_runs wins when both channels report.
// See migration: create_unified_agent_latest_runs_view.

interface AgentLatestRunRow {
  agent_name: string;
  source: "routine" | "external";
  ran_at: string;
  status: "success" | "warning" | "error" | "skipped";
  output_summary: string | null;
  items_processed: number;
  duration_seconds: number | string | null; // numeric arrives as string from PostgREST
}

async function getAgentRunData(): Promise<AgentLatestRunRow[]> {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY ?? process.env.SUPABASE_ANON_KEY;
  if (!url || !key) return [];

  try {
    const res = await fetch(`${url}/rest/v1/agent_latest_runs?select=*`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
      cache: "no-store",
    });
    if (!res.ok) return [];
    return (await res.json()) as AgentLatestRunRow[];
  } catch {
    return [];
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function relativeTime(isoString: string): string {
  const diffMs = Date.now() - new Date(isoString).getTime();
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return "hace un momento";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `hace ${diffMin}m`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `hace ${diffHr}h`;
  const diffDays = Math.floor(diffHr / 24);
  return `hace ${diffDays}d`;
}

type LiveStatus = "success" | "warning" | "error" | "skipped" | "none";

function StatusDot({ status }: { status: LiveStatus }) {
  const colorMap: Record<LiveStatus, string> = {
    success: "var(--hall-ok)",
    warning: "var(--hall-warn)",
    error: "var(--hall-danger)",
    skipped: "var(--hall-muted-3)",
    none: "var(--hall-muted-3)",
  };
  return (
    <span
      className="w-2 h-2 rounded-full flex-shrink-0"
      title={status}
      style={{ background: colorMap[status] }}
    />
  );
}

function StatusLabel({ status }: { status: LiveStatus }) {
  const map: Record<LiveStatus, { label: string; fg: string; bg: string } | null> = {
    success: { label: "OK", fg: "var(--hall-ok)", bg: "var(--hall-ok-soft)" },
    warning: { label: "Warning", fg: "var(--hall-warn)", bg: "var(--hall-warn-soft)" },
    error: { label: "Error", fg: "var(--hall-danger)", bg: "var(--hall-danger-soft)" },
    skipped: { label: "Skipped", fg: "var(--hall-muted-3)", bg: "var(--hall-fill-soft)" },
    none: null,
  };
  const s = map[status];
  if (!s) {
    return (
      <span
        className="px-2 py-0.5 whitespace-nowrap"
        style={{
          fontFamily: "var(--font-hall-mono)",
          fontSize: 10,
          color: "var(--hall-muted-3)",
        }}
      >
        —
      </span>
    );
  }
  return (
    <span
      className="px-2 py-0.5 rounded-full whitespace-nowrap"
      style={{
        fontFamily: "var(--font-hall-mono)",
        fontSize: 10,
        fontWeight: 700,
        color: s.fg,
        background: s.bg,
      }}
    >
      {s.label}
    </span>
  );
}

function PriorityBadge({ priority }: { priority: 1 | 2 | 3 }) {
  const map = {
    1: { label: "P1", fg: "var(--hall-danger)" },
    2: { label: "P2", fg: "var(--hall-warn)" },
    3: { label: "P3", fg: "var(--hall-muted-3)" },
  };
  const p = map[priority];
  return (
    <span
      style={{
        fontFamily: "var(--font-hall-mono)",
        fontSize: 9,
        fontWeight: 700,
        color: p.fg,
        letterSpacing: "0.05em",
      }}
    >
      {p.label}
    </span>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default async function AgentsPage() {
  await requireAdmin();

  const runData = await getAgentRunData();
  const runMap = new Map<string, AgentLatestRunRow>(runData.map((r) => [r.agent_name, r]));
  const hasTelemetry = runData.length > 0;

  // Cataloged routines — known agents with metadata (retired ones excluded
  // from the registry, but kept in the catalog so they don't show as orphans)
  const catalog = Object.entries(ROUTINE_CATALOG)
    .filter(([, meta]) => !meta.retired)
    .map(([name, meta]) => ({ name, ...meta, run: runMap.get(name) }))
    .sort((a, b) => a.priority - b.priority || a.name.localeCompare(b.name));

  // Routines that ran but are not in the catalog (orphan telemetry)
  const cataloged = new Set(Object.keys(ROUTINE_CATALOG));
  const uncataloged = runData
    .filter((r) => !cataloged.has(r.agent_name))
    .sort((a, b) => new Date(b.ran_at).getTime() - new Date(a.ran_at).getTime());

  // Aggregate counts
  const successCount = runData.filter((r) => r.status === "success").length;
  const warnCount = runData.filter((r) => r.status === "warning").length;
  const errorCount = runData.filter((r) => r.status === "error").length;
  const latestRanAt = runData.length
    ? runData.reduce((best, r) => (new Date(r.ran_at) > new Date(best.ran_at) ? r : best)).ran_at
    : null;

  const todayLabel = new Date().toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  // Header status pills
  const headerMeta = (
    <div className="flex items-center gap-2">
      <a href="/admin/agents/health" className="hall-btn-ghost" style={{ fontSize: 11 }}>
        Health ↗
      </a>
      {errorCount > 0 && (
        <span
          className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1"
          style={{
            fontFamily: "var(--font-hall-mono)",
            fontSize: 10,
            fontWeight: 700,
            color: "var(--hall-danger)",
            background: "var(--hall-danger-soft)",
          }}
        >
          <span
            className="w-1.5 h-1.5 rounded-full"
            style={{ background: "var(--hall-danger)" }}
          />
          {errorCount} error{errorCount > 1 ? "s" : ""}
        </span>
      )}
      {warnCount > 0 && (
        <span
          className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1"
          style={{
            fontFamily: "var(--font-hall-mono)",
            fontSize: 10,
            fontWeight: 700,
            color: "var(--hall-warn)",
            background: "var(--hall-warn-soft)",
          }}
        >
          <span className="w-1.5 h-1.5 rounded-full" style={{ background: "var(--hall-warn)" }} />
          {warnCount} warning{warnCount > 1 ? "s" : ""}
        </span>
      )}
      {errorCount === 0 && warnCount === 0 && hasTelemetry && (
        <span
          className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1"
          style={{
            fontFamily: "var(--font-hall-mono)",
            fontSize: 10,
            fontWeight: 700,
            color: "var(--hall-ok)",
            background: "var(--hall-ok-soft)",
          }}
        >
          <span className="w-1.5 h-1.5 rounded-full" style={{ background: "var(--hall-ok)" }} />
          {successCount} ok
        </span>
      )}
      {!hasTelemetry && (
        <span
          className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1"
          style={{
            fontFamily: "var(--font-hall-mono)",
            fontSize: 10,
            fontWeight: 700,
            color: "var(--hall-muted-3)",
            background: "var(--hall-fill-soft)",
          }}
        >
          Sin telemetría
        </span>
      )}
    </div>
  );

  return (
    <PortalShell
      eyebrow={{ label: "CONTROL ROOM · OS v2", accent: todayLabel }}
      title="Agent"
      flourish="registry"
      meta={headerMeta}
    >
      {/* Architecture diagram */}
      <HallSection
        title="Architecture"
        flourish="map"
        meta={
          <a
            href="/portal/diagrama-agentes.html"
            target="_blank"
            rel="noopener noreferrer"
            className="hall-btn-ghost"
            style={{ fontSize: 11 }}
          >
            Open full ↗
          </a>
        }
      >
        <div style={{ border: "1px solid var(--hall-line)" }}>
          <iframe
            src="/portal/diagrama-agentes.html"
            className="w-full border-none"
            style={{ height: 780 }}
            title="Agent Architecture"
          />
        </div>
      </HallSection>

      {/* Summary metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <SummaryCard
          label="Total routines"
          value={String(catalog.length)}
          tail="in catalog"
        />
        <SummaryCard
          label="P1 critical"
          value={String(catalog.filter((c) => c.priority === 1).length)}
          tail="must-run agents"
          color="var(--hall-ink-0)"
        />
        <SummaryCard
          label="Reporting"
          value={String(runData.length)}
          tail={hasTelemetry ? "agents with telemetry" : "—"}
          color={hasTelemetry ? "var(--hall-ok)" : "var(--hall-muted-3)"}
        />
        <SummaryCard
          label="Last run"
          value={latestRanAt ? relativeTime(latestRanAt) : "—"}
          tail={latestRanAt ? "último agente activo" : "sin ejecuciones"}
        />
      </div>

      {/* Agent registry — driven by ROUTINE_CATALOG */}
      <HallSection
        title="Routine"
        flourish="catalog"
        meta={`${catalog.length} CATALOGED · ${hasTelemetry ? `${runData.length} REPORTING` : "SIN TELEMETRÍA"}`}
      >
        <div>
          {/* Column headers — desktop only */}
          <div
            className="hidden md:grid grid-cols-[28px_28px_1.4fr_2fr_140px_120px_90px] gap-3 items-center px-1 py-2"
            style={{ borderBottom: "1px solid var(--hall-line)" }}
          >
            <div />
            <div />
            {["Routine", "Reads → Writes · Surface", "Schedule", "Last run", "Status"].map((h) => (
              <p
                key={h}
                style={{
                  fontFamily: "var(--font-hall-mono)",
                  fontSize: 10,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  color: "var(--hall-muted-2)",
                }}
              >
                {h}
              </p>
            ))}
          </div>

          {/* Rows */}
          <ul className="flex flex-col">
            {catalog.map((agent) => {
              const liveStatus: LiveStatus = agent.run ? agent.run.status : "none";
              const lastRun = agent.run
                ? relativeTime(agent.run.ran_at)
                : "Sin ejecuciones registradas";
              const flowText = `${agent.reads} → ${agent.writes}`;

              return (
                <li
                  key={agent.name}
                  className="grid grid-cols-[28px_28px_1.4fr_2fr_140px_120px_90px] gap-3 items-center px-1 py-3"
                  style={{ borderTop: "1px solid var(--hall-line-soft)" }}
                >
                  <div className="flex items-center justify-center">
                    <StatusDot status={liveStatus} />
                  </div>
                  <div className="flex items-center justify-center">
                    <PriorityBadge priority={agent.priority} />
                  </div>
                  <div className="min-w-0">
                    <p
                      className="truncate"
                      style={{
                        fontFamily: "var(--font-hall-mono)",
                        fontSize: 11,
                        fontWeight: 700,
                        color: "var(--hall-ink-0)",
                      }}
                    >
                      {agent.name}
                    </p>
                    {!agent.visible_in_product && (
                      <p
                        style={{
                          fontFamily: "var(--font-hall-mono)",
                          fontSize: 9,
                          color: "var(--hall-muted-3)",
                          marginTop: 2,
                        }}
                      >
                        no UI consumer
                      </p>
                    )}
                  </div>
                  <div className="min-w-0">
                    <p
                      className="leading-snug truncate"
                      style={{ fontSize: 10.5, color: "var(--hall-muted-2)" }}
                      title={flowText}
                    >
                      {flowText}
                    </p>
                    <p
                      className="truncate"
                      style={{
                        fontFamily: "var(--font-hall-mono)",
                        fontSize: 9.5,
                        color: "var(--hall-muted-3)",
                        marginTop: 2,
                      }}
                      title={agent.output_surface}
                    >
                      → {agent.output_surface}
                    </p>
                  </div>
                  <p
                    style={{
                      fontFamily: "var(--font-hall-mono)",
                      fontSize: 10,
                      color: "var(--hall-muted-2)",
                    }}
                  >
                    {agent.schedule}
                  </p>
                  <p
                    className="truncate"
                    style={{
                      fontFamily: "var(--font-hall-mono)",
                      fontSize: 10,
                      color: "var(--hall-muted-3)",
                    }}
                    title={agent.run?.output_summary ?? undefined}
                  >
                    {lastRun}
                  </p>
                  <StatusLabel status={liveStatus} />
                </li>
              );
            })}
          </ul>
        </div>
      </HallSection>

      {/* Uncataloged — telemetry exists but no metadata in ROUTINE_CATALOG */}
      {uncataloged.length > 0 && (
        <HallSection
          title="Uncatalogued"
          flourish="routines"
          meta={`${uncataloged.length} REPORTING · ADD TO ROUTINE_CATALOG`}
        >
          <div>
            <ul className="flex flex-col">
              {uncataloged.map((r) => (
                <li
                  key={r.agent_name}
                  className="grid grid-cols-[28px_1fr_120px_120px_90px] gap-3 items-center px-1 py-3"
                  style={{ borderTop: "1px solid var(--hall-line-soft)" }}
                >
                  <StatusDot status={r.status} />
                  <p
                    style={{
                      fontFamily: "var(--font-hall-mono)",
                      fontSize: 11,
                      fontWeight: 700,
                      color: "var(--hall-ink-0)",
                    }}
                  >
                    {r.agent_name}
                  </p>
                  <p
                    style={{
                      fontFamily: "var(--font-hall-mono)",
                      fontSize: 10,
                      color: "var(--hall-muted-3)",
                    }}
                  >
                    source: {r.source}
                  </p>
                  <p
                    style={{
                      fontFamily: "var(--font-hall-mono)",
                      fontSize: 10,
                      color: "var(--hall-muted-3)",
                    }}
                  >
                    {relativeTime(r.ran_at)}
                  </p>
                  <StatusLabel status={r.status} />
                </li>
              ))}
            </ul>
          </div>
        </HallSection>
      )}

      {/* Footer */}
      <p
        style={{
          fontFamily: "var(--font-hall-mono)",
          fontSize: 10,
          color: "var(--hall-muted-3)",
        }}
      >
        Catalog defined in <code>src/lib/routine-log.ts</code> · Telemetry from{" "}
        <code>agent_latest_runs</code> view (UNION of <code>routine_runs</code> +{" "}
        <code>agent_runs</code>).{" "}
        {hasTelemetry
          ? `${runData.length} agente${runData.length !== 1 ? "s" : ""} reportando.`
          : "Sin datos en vivo todavía — los crons reportan vía withRoutineLog; los skills externos vía POST /api/agent-run."}
      </p>
    </PortalShell>
  );
}

// ── Local components ─────────────────────────────────────────────────────────

function SummaryCard({
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
      <p
        className="text-[1.8rem] font-[900] leading-none tracking-tight"
        style={{ color }}
      >
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
