import { requireAdmin } from "@/lib/require-admin";
import { Sidebar } from "@/components/Sidebar";
import { HallSection } from "@/components/HallSection";

// ── Static agent registry ────────────────────────────────────────────────────
interface AgentDef {
  id: string;
  name: string;
  fn: string;
  schedule: string;
}

const AGENTS: AgentDef[] = [
  {
    id: "os-runner",
    name: "os-runner",
    fn: "Orchestrates the full OS pipeline; sequences daily agent chain.",
    schedule: "Daily 07:50",
  },
  {
    id: "source-intake",
    name: "source-intake",
    fn: "Ingests emails, meetings, and documents into CH Sources [OS v2].",
    schedule: "Daily 08:00",
  },
  {
    id: "evidence-review",
    name: "evidence-review",
    fn: "Reviews raw sources and extracts atomic evidence records.",
    schedule: "Daily 08:30",
  },
  {
    id: "validation-operator",
    name: "validation-operator",
    fn: "Validates evidence against project context; sets Validated status.",
    schedule: "Daily 09:00",
  },
  {
    id: "project-operator",
    name: "project-operator",
    fn: "Updates project status summaries from validated evidence.",
    schedule: "Daily 09:15",
  },
  {
    id: "update-knowledge-asset",
    name: "update-knowledge-asset",
    fn: "Proposes delta updates to Knowledge Assets from new evidence.",
    schedule: "Daily 09:30",
  },
  {
    id: "db-hygiene-operator",
    name: "db-hygiene-operator",
    fn: "Flags duplicate records and stale entries across all OS v2 DBs.",
    schedule: "Mon 07:00",
  },
  {
    id: "hygiene-agent",
    name: "hygiene-agent",
    fn: "Runs full DB hygiene loop: deduplication, blank fields, broken links.",
    schedule: "Mon 07:00",
  },
  {
    id: "briefing-agent",
    name: "briefing-agent",
    fn: "Generates weekly OS briefing from decisions, insights, and signals.",
    schedule: "Mon 06:00",
  },
  {
    id: "portfolio-health-agent",
    name: "portfolio-health-agent",
    fn: "Produces portfolio health snapshot across all active projects.",
    schedule: "Mon 07:30",
  },
  {
    id: "grant-monitor-agent",
    name: "grant-monitor-agent",
    fn: "Monitors grant deadlines and fit scores; surfaces P1 signals.",
    schedule: "1st Mon 06:00",
  },
  {
    id: "deal-flow-agent",
    name: "deal-flow-agent",
    fn: "Scans pipeline opportunities; scores and ranks by qualification criteria.",
    schedule: "Mon 08:00",
  },
  {
    id: "review-queue",
    name: "review-queue",
    fn: "Surfaces items requiring human review across Evidence and Decisions.",
    schedule: "Daily 10:00",
  },
  {
    id: "living-room-agent",
    name: "living-room-agent",
    fn: "Curates Living Room feed from signals, insights, and selected content.",
    schedule: "Mon 08:45",
  },
];

// ── Live run data from Supabase (via REST — no package required) ─────────────
interface AgentRunRow {
  agent_name: string;
  ran_at: string;
  status: "success" | "warning" | "error" | "skipped";
  output_summary: string | null;
  items_processed: number;
  duration_seconds: number | null;
}

async function getAgentRunData(): Promise<AgentRunRow[]> {
  // agent_latest_runs is a low-privilege read view; service key not required.
  // Prefer service key if present (bypasses RLS), fall back to anon key which
  // relies on the view's published RLS policy.
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY ?? process.env.SUPABASE_ANON_KEY;
  if (!url || !key) return [];

  try {
    const res = await fetch(`${url}/rest/v1/agent_latest_runs?select=*`, {
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
      },
      cache: "no-store",
    });
    if (!res.ok) return [];
    return await res.json();
  } catch {
    return [];
  }
}

// ── Relative time helper ─────────────────────────────────────────────────────
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

// ── Status components ─────────────────────────────────────────────────────────
type LiveStatus = "success" | "warning" | "error" | "skipped" | "none";

function StatusDot({ status }: { status: LiveStatus }) {
  if (status === "success")
    return <span className="w-2 h-2 rounded-full flex-shrink-0" title="Success" style={{ background: "var(--hall-ok)" }} />;
  if (status === "warning")
    return <span className="w-2 h-2 rounded-full flex-shrink-0" title="Warning" style={{ background: "var(--hall-warn)" }} />;
  if (status === "error")
    return <span className="w-2 h-2 rounded-full flex-shrink-0" title="Error" style={{ background: "var(--hall-danger)" }} />;
  // skipped or none
  return <span className="w-2 h-2 rounded-full flex-shrink-0" title="Sin datos" style={{ background: "var(--hall-muted-3)" }} />;
}

function StatusLabel({ status }: { status: LiveStatus }) {
  if (status === "success")
    return (
      <span
        className="px-2 py-0.5 rounded-full whitespace-nowrap"
        style={{
          fontFamily: "var(--font-hall-mono)",
          fontSize: 10,
          fontWeight: 700,
          color: "var(--hall-ok)",
          background: "var(--hall-ok-soft)",
        }}
      >
        OK
      </span>
    );
  if (status === "warning")
    return (
      <span
        className="px-2 py-0.5 rounded-full whitespace-nowrap"
        style={{
          fontFamily: "var(--font-hall-mono)",
          fontSize: 10,
          fontWeight: 700,
          color: "var(--hall-warn)",
          background: "var(--hall-warn-soft)",
        }}
      >
        Warning
      </span>
    );
  if (status === "error")
    return (
      <span
        className="px-2 py-0.5 rounded-full whitespace-nowrap"
        style={{
          fontFamily: "var(--font-hall-mono)",
          fontSize: 10,
          fontWeight: 700,
          color: "var(--hall-danger)",
          background: "var(--hall-danger-soft)",
        }}
      >
        Error
      </span>
    );
  if (status === "skipped")
    return (
      <span
        className="px-2 py-0.5 rounded-full whitespace-nowrap"
        style={{
          fontFamily: "var(--font-hall-mono)",
          fontSize: 10,
          fontWeight: 700,
          color: "var(--hall-muted-3)",
          background: "var(--hall-fill-soft)",
        }}
      >
        Skipped
      </span>
    );
  // none — no label
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

export default async function AgentsPage() {
  await requireAdmin();

  const runData = await getAgentRunData();
  const runMap = new Map<string, AgentRunRow>(runData.map((r) => [r.agent_name, r]));

  const hasTelemetry = runData.length > 0;

  // Compute summary counts from live data
  const successCount = runData.filter((r) => r.status === "success").length;
  const warnCount = runData.filter((r) => r.status === "warning").length;
  const errorCount = runData.filter((r) => r.status === "error").length;

  // Most recent run across all agents
  const latestRanAt = runData.length
    ? runData.reduce((best, r) =>
        new Date(r.ran_at) > new Date(best.ran_at) ? r : best
      ).ran_at
    : null;

  const todayLabel = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

  return (
    <div className="flex min-h-screen" style={{ background: "var(--hall-paper-0)" }}>
      <Sidebar adminNav />

      <main
        className="flex-1 ml-60 flex flex-col"
        style={{ fontFamily: "var(--font-hall-sans)", background: "var(--hall-paper-0)" }}
      >
        {/* Page header — thin one-line */}
        <header
          className="flex items-center justify-between gap-6 px-9 py-3.5"
          style={{ borderBottom: "1px solid var(--hall-ink-0)" }}
        >
          <div className="flex items-baseline gap-4 min-w-0">
            <span
              className="text-[10px] tracking-[0.08em] whitespace-nowrap"
              style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted-2)" }}
            >
              CONTROL ROOM · OS v2 ·{" "}
              <b style={{ color: "var(--hall-ink-0)" }}>{todayLabel}</b>
            </span>
            <h1
              className="text-[16px] font-medium tracking-[-0.01em]"
              style={{ color: "var(--hall-ink-0)" }}
            >
              Agent Registry
            </h1>
          </div>
          <div className="flex items-center gap-2">
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
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: "var(--hall-danger)" }} />
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
        </header>

        {/* Content */}
        <div className="flex-1 px-9 py-7">
          <div className="max-w-4xl">

            {/* Architecture diagram */}
            <section
              className="mb-7"
              style={{ fontFamily: "var(--font-hall-sans)" }}
            >
              <div
                className="flex items-baseline justify-between gap-3 pb-2 mb-3.5"
                style={{ borderBottom: "1px solid var(--hall-ink-0)" }}
              >
                <h2
                  className="text-[19px] font-bold leading-none"
                  style={{ letterSpacing: "-0.02em", color: "var(--hall-ink-0)" }}
                >
                  Architecture{" "}
                  <em
                    style={{
                      fontFamily: "var(--font-hall-display)",
                      fontStyle: "italic",
                      fontWeight: 400,
                      color: "var(--hall-ink-0)",
                    }}
                  >
                    map
                  </em>
                </h2>
                <a
                  href="/portal/diagrama-agentes.html"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hall-btn-ghost"
                  style={{ fontSize: 11 }}
                >
                  Open full ↗
                </a>
              </div>
              <div style={{ border: "1px solid var(--hall-line)" }}>
                <iframe
                  src="/portal/diagrama-agentes.html"
                  className="w-full border-none"
                  style={{ height: 780 }}
                  title="Agent Architecture"
                />
              </div>
            </section>

            {/* Summary metrics */}
            <div className="grid grid-cols-3 gap-3 mb-7">
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
                  Total agents
                </p>
                <p
                  className="text-[1.8rem] font-[900] leading-none tracking-tight"
                  style={{ color: "var(--hall-ink-0)" }}
                >
                  {AGENTS.length}
                </p>
                <p style={{ fontFamily: "var(--font-hall-mono)", fontSize: 10, color: "var(--hall-muted-2)", marginTop: 6 }}>
                  in OS v2
                </p>
              </div>
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
                  Running daily
                </p>
                <p
                  className="text-[1.8rem] font-[900] leading-none tracking-tight"
                  style={{ color: "var(--hall-ok)" }}
                >
                  {AGENTS.filter((a) => a.schedule.startsWith("Daily")).length}
                </p>
                <p style={{ fontFamily: "var(--font-hall-mono)", fontSize: 10, color: "var(--hall-muted-2)", marginTop: 6 }}>
                  scheduled agents
                </p>
              </div>
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
                  Last run
                </p>
                <p
                  className="text-[1.8rem] font-[900] leading-none tracking-tight"
                  style={{ color: "var(--hall-ink-0)" }}
                >
                  {latestRanAt ? relativeTime(latestRanAt) : "—"}
                </p>
                <p style={{ fontFamily: "var(--font-hall-mono)", fontSize: 10, color: "var(--hall-muted-2)", marginTop: 6 }}>
                  {latestRanAt ? "último agente activo" : "sin ejecuciones"}
                </p>
              </div>
            </div>

            {/* Agent table */}
            <HallSection
              title="Agent"
              flourish="registry"
              meta={`${AGENTS.length} AGENTS · ${hasTelemetry ? "LIVE DATA" : "SIN TELEMETRÍA"}`}
            >
              <div>
                {/* Column headers */}
                <div
                  className="grid grid-cols-[32px_1fr_2fr_120px_110px_80px] gap-3 items-center px-1 py-2"
                  style={{ borderBottom: "1px solid var(--hall-line)" }}
                >
                  <div />
                  {["Agent", "Function", "Schedule", "Last run", "Status"].map((h) => (
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

                {/* Agent rows */}
                <ul className="flex flex-col">
                  {AGENTS.map((agent) => {
                    const run = runMap.get(agent.name);
                    const liveStatus: LiveStatus = run ? run.status : "none";
                    const lastRun = run
                      ? relativeTime(run.ran_at)
                      : "Sin ejecuciones registradas";

                    return (
                      <li
                        key={agent.id}
                        className="grid grid-cols-[32px_1fr_2fr_120px_110px_80px] gap-3 items-center px-1 py-3"
                        style={{ borderTop: "1px solid var(--hall-line-soft)" }}
                      >
                        {/* Status dot */}
                        <div className="flex items-center justify-center">
                          <StatusDot status={liveStatus} />
                        </div>

                        {/* Name */}
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

                        {/* Function */}
                        <p
                          className="leading-snug"
                          style={{ fontSize: 10.5, color: "var(--hall-muted-2)" }}
                        >
                          {agent.fn}
                        </p>

                        {/* Schedule */}
                        <p
                          style={{
                            fontFamily: "var(--font-hall-mono)",
                            fontSize: 10,
                            color: "var(--hall-muted-2)",
                          }}
                        >
                          {agent.schedule}
                        </p>

                        {/* Last run */}
                        <p
                          className="truncate"
                          style={{
                            fontFamily: "var(--font-hall-mono)",
                            fontSize: 10,
                            color: "var(--hall-muted-3)",
                          }}
                        >
                          {lastRun}
                        </p>

                        {/* Status pill */}
                        <StatusLabel status={liveStatus} />
                      </li>
                    );
                  })}
                </ul>
              </div>
            </HallSection>

            {/* Footer note */}
            <p
              className="mt-4"
              style={{
                fontFamily: "var(--font-hall-mono)",
                fontSize: 10,
                color: "var(--hall-muted-3)",
              }}
            >
              Agent schedules reflect OS v2 spec · Sprint 28 · Last updated 2026-04-13.
              {hasTelemetry
                ? ` Telemetría activa — ${runData.length} agente${runData.length !== 1 ? "s" : ""} con datos.`
                : " Live run data will appear once agent hooks report back via POST /api/agent-run."}
            </p>

          </div>
        </div>
      </main>
    </div>
  );
}
