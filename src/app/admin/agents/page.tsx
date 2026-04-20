import { requireAdmin } from "@/lib/require-admin";
import { Sidebar } from "@/components/Sidebar";
import { ADMIN_NAV } from "@/lib/admin-nav";

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
    return <span className="w-2 h-2 rounded-full bg-[#c8f55a] flex-shrink-0" title="Success" />;
  if (status === "warning")
    return <span className="w-2 h-2 rounded-full bg-[#FFE066] flex-shrink-0" title="Warning" />;
  if (status === "error")
    return <span className="w-2 h-2 rounded-full bg-[#FF6060] flex-shrink-0" title="Error" />;
  // skipped or none
  return <span className="w-2 h-2 rounded-full bg-[#CCCCCC] flex-shrink-0" title="Sin datos" />;
}

function StatusLabel({ status }: { status: LiveStatus }) {
  if (status === "success")
    return (
      <span className="text-[10px] font-bold text-[#3a6600] bg-[#B2FF59]/20 px-2 py-0.5 rounded-full whitespace-nowrap">
        OK
      </span>
    );
  if (status === "warning")
    return (
      <span className="text-[10px] font-bold text-[#7a5800] bg-[#FFE066]/20 px-2 py-0.5 rounded-full whitespace-nowrap">
        Warning
      </span>
    );
  if (status === "error")
    return (
      <span className="text-[10px] font-bold text-[#7a0000] bg-[#FF6060]/20 px-2 py-0.5 rounded-full whitespace-nowrap">
        Error
      </span>
    );
  if (status === "skipped")
    return (
      <span className="text-[10px] font-bold text-[#131218]/40 bg-[#CCCCCC]/20 px-2 py-0.5 rounded-full whitespace-nowrap">
        Skipped
      </span>
    );
  // none — no label
  return (
    <span className="text-[10px] font-bold text-[#131218]/30 px-2 py-0.5 rounded-full whitespace-nowrap">
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

  return (
    <div className="flex min-h-screen bg-[#EFEFEA]">
      <Sidebar adminNav />

      <main className="flex-1 ml-60 flex flex-col">
        {/* Page header */}
        <div className="bg-[#131218] px-10 py-10">
          <p className="text-[8px] font-bold uppercase tracking-[2.5px] text-white/20 mb-3">
            CONTROL ROOM · OS v2
          </p>
          <div className="flex items-end justify-between">
            <div>
              <h1 className="text-[2.6rem] font-[300] text-white leading-[1] tracking-[-1.5px]">
                Agent <em className="font-[900] italic text-[#c8f55a]">Registry</em>
              </h1>
              <p className="text-[12.5px] text-white/40 mt-3 max-w-[520px] leading-[1.65]">
                OS v2 agents — schedules, live run status, and telemetry.
              </p>
            </div>
            <div className="flex items-center gap-3 pb-1">
              {errorCount > 0 && (
                <span className="inline-flex items-center gap-1.5 bg-[#3a0000] border border-[rgba(255,80,80,0.3)] rounded-full px-2.5 py-1 text-[9px] font-bold text-[#ff8080] uppercase tracking-[0.5px]">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#ff6060]" />
                  {errorCount} error{errorCount > 1 ? "s" : ""}
                </span>
              )}
              {warnCount > 0 && (
                <span className="inline-flex items-center gap-1.5 bg-[#3a2000] border border-[rgba(255,200,80,0.3)] rounded-full px-2.5 py-1 text-[9px] font-bold text-[#FFE066] uppercase tracking-[0.5px]">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#FFE066]" />
                  {warnCount} warning{warnCount > 1 ? "s" : ""}
                </span>
              )}
              {errorCount === 0 && warnCount === 0 && hasTelemetry && (
                <span className="inline-flex items-center gap-1.5 bg-[#c8f55a]/10 border border-[#c8f55a]/20 rounded-full px-2.5 py-1 text-[9px] font-bold text-[#c8f55a] uppercase tracking-[0.5px]">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#c8f55a]" />
                  {successCount} ok
                </span>
              )}
              {!hasTelemetry && (
                <span className="inline-flex items-center gap-1.5 bg-white/5 border border-white/10 rounded-full px-2.5 py-1 text-[9px] font-bold text-white/30 uppercase tracking-[0.5px]">
                  Sin telemetría
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 px-10 py-8">
          <div className="max-w-4xl">

            {/* Architecture diagram */}
            <div className="bg-white border border-[#E0E0D8] rounded-2xl overflow-hidden mb-6">
              <div className="px-5 py-3.5 border-b border-[#E0E0D8] flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-md bg-[#131218] flex items-center justify-center">
                    <svg viewBox="0 0 14 14" width="11" height="11" fill="none" stroke="white" strokeWidth="1.8" strokeLinecap="round">
                      <rect x="2" y="2" width="4" height="4" rx="1"/>
                      <rect x="8" y="2" width="4" height="4" rx="1"/>
                      <rect x="2" y="8" width="4" height="4" rx="1"/>
                      <rect x="8" y="8" width="4" height="4" rx="1"/>
                    </svg>
                  </div>
                  <span className="text-[11px] font-[800] text-[#131218] tracking-tight">
                    Architecture map
                  </span>
                </div>
                <a
                  href="/portal/diagrama-agentes.html"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[9px] font-bold uppercase tracking-[1.5px] text-[#131218]/30 hover:text-[#131218]/60 transition-colors"
                >
                  Open full ↗
                </a>
              </div>
              <iframe
                src="/portal/diagrama-agentes.html"
                className="w-full border-none"
                style={{ height: 780 }}
                title="Agent Architecture"
              />
            </div>

            {/* Summary metrics */}
            <div className="grid grid-cols-3 gap-3 mb-6">
              <div className="bg-white border border-[#E0E0D8] rounded-xl p-4">
                <p className="text-[8.5px] font-bold uppercase tracking-[1.8px] text-[#131218]/20 mb-1.5">
                  Total agents
                </p>
                <p className="text-[1.8rem] font-[900] text-[#131218] leading-none tracking-tight">
                  {AGENTS.length}
                </p>
                <p className="text-[9.5px] text-[#6b6b6b] mt-1">in OS v2</p>
              </div>
              <div className="bg-white border border-[#E0E0D8] rounded-xl p-4">
                <p className="text-[8.5px] font-bold uppercase tracking-[1.8px] text-[#131218]/20 mb-1.5">
                  Running daily
                </p>
                <p className="text-[1.8rem] font-[900] text-[#3a6600] leading-none tracking-tight">
                  {AGENTS.filter((a) => a.schedule.startsWith("Daily")).length}
                </p>
                <p className="text-[9.5px] text-[#6b6b6b] mt-1">scheduled agents</p>
              </div>
              <div className="bg-white border border-[#E0E0D8] rounded-xl p-4">
                <p className="text-[8.5px] font-bold uppercase tracking-[1.8px] text-[#131218]/20 mb-1.5">
                  Last run
                </p>
                <p className="text-[1.8rem] font-[900] text-[#131218] leading-none tracking-tight">
                  {latestRanAt ? relativeTime(latestRanAt) : "—"}
                </p>
                <p className="text-[9.5px] text-[#6b6b6b] mt-1">
                  {latestRanAt ? "último agente activo" : "sin ejecuciones"}
                </p>
              </div>
            </div>

            {/* Agent table */}
            <div className="bg-white border border-[#E0E0D8] rounded-2xl overflow-hidden">
              {/* Card header */}
              <div className="px-5 py-3.5 border-b border-[#E0E0D8] flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-md bg-[#131218] flex items-center justify-center">
                    <svg viewBox="0 0 14 14" width="11" height="11" fill="none" stroke="white" strokeWidth="1.8" strokeLinecap="round">
                      <circle cx="7" cy="5" r="3"/>
                      <path d="M1 12a6 6 0 0 1 12 0"/>
                    </svg>
                  </div>
                  <span className="text-[11px] font-[800] text-[#131218] tracking-tight">
                    Agent Registry
                  </span>
                </div>
                <span className="text-[8px] font-bold uppercase tracking-[1.5px] text-[#131218]/30">
                  {AGENTS.length} agents · {hasTelemetry ? "Live data" : "Sin telemetría"}
                </span>
              </div>

              {/* Column headers */}
              <div className="grid grid-cols-[32px_1fr_2fr_120px_110px_80px] gap-3 items-center px-5 py-2.5 border-b border-[#E0E0D8] bg-[#F7F7F5]">
                <div />
                <p className="text-[8px] font-bold uppercase tracking-[1.5px] text-[#131218]/30">
                  Agent
                </p>
                <p className="text-[8px] font-bold uppercase tracking-[1.5px] text-[#131218]/30">
                  Function
                </p>
                <p className="text-[8px] font-bold uppercase tracking-[1.5px] text-[#131218]/30">
                  Schedule
                </p>
                <p className="text-[8px] font-bold uppercase tracking-[1.5px] text-[#131218]/30">
                  Last run
                </p>
                <p className="text-[8px] font-bold uppercase tracking-[1.5px] text-[#131218]/30">
                  Status
                </p>
              </div>

              {/* Agent rows */}
              {AGENTS.map((agent, i) => {
                const run = runMap.get(agent.name);
                const liveStatus: LiveStatus = run ? run.status : "none";
                const lastRun = run
                  ? relativeTime(run.ran_at)
                  : "Sin ejecuciones registradas";

                return (
                  <div
                    key={agent.id}
                    className={`grid grid-cols-[32px_1fr_2fr_120px_110px_80px] gap-3 items-center px-5 py-3 ${
                      i < AGENTS.length - 1 ? "border-b border-[#E0E0D8]" : ""
                    } group hover:bg-[#F7F7F5] transition-colors`}
                  >
                    {/* Status dot */}
                    <div className="flex items-center justify-center">
                      <StatusDot status={liveStatus} />
                    </div>

                    {/* Name */}
                    <p className="text-[11px] font-[700] text-[#131218] font-mono truncate">
                      {agent.name}
                    </p>

                    {/* Function */}
                    <p className="text-[10.5px] text-[#6b6b6b] leading-snug">
                      {agent.fn}
                    </p>

                    {/* Schedule */}
                    <p className="text-[9.5px] text-[#6b6b6b] font-mono">
                      {agent.schedule}
                    </p>

                    {/* Last run */}
                    <p className="text-[9.5px] text-[#131218]/30 font-mono truncate">
                      {lastRun}
                    </p>

                    {/* Status pill */}
                    <StatusLabel status={liveStatus} />
                  </div>
                );
              })}
            </div>

            {/* Footer note */}
            <p className="text-[9px] text-[#131218]/25 mt-4 font-medium">
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
