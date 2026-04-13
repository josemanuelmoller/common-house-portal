import { requireAdmin } from "@/lib/require-admin";
import { Sidebar } from "@/components/Sidebar";
import { ADMIN_NAV } from "@/lib/admin-nav";

// ── Static agent registry ────────────────────────────────────────────────────
type AgentStatus = "ok" | "warning" | "idle";

interface AgentDef {
  id: string;
  name: string;
  fn: string;
  schedule: string;
  status: AgentStatus;
}

const AGENTS: AgentDef[] = [
  {
    id: "os-runner",
    name: "os-runner",
    fn: "Orchestrates the full OS pipeline; sequences daily agent chain.",
    schedule: "Daily 07:50",
    status: "ok",
  },
  {
    id: "source-intake",
    name: "source-intake",
    fn: "Ingests emails, meetings, and documents into CH Sources [OS v2].",
    schedule: "Daily 08:00",
    status: "ok",
  },
  {
    id: "evidence-review",
    name: "evidence-review",
    fn: "Reviews raw sources and extracts atomic evidence records.",
    schedule: "Daily 08:30",
    status: "ok",
  },
  {
    id: "validation-operator",
    name: "validation-operator",
    fn: "Validates evidence against project context; sets Validated status.",
    schedule: "Daily 09:00",
    status: "ok",
  },
  {
    id: "project-operator",
    name: "project-operator",
    fn: "Updates project status summaries from validated evidence.",
    schedule: "Daily 09:15",
    status: "ok",
  },
  {
    id: "update-knowledge-asset",
    name: "update-knowledge-asset",
    fn: "Proposes delta updates to Knowledge Assets from new evidence.",
    schedule: "Daily 09:30",
    status: "idle",
  },
  {
    id: "db-hygiene-operator",
    name: "db-hygiene-operator",
    fn: "Flags duplicate records and stale entries across all OS v2 DBs.",
    schedule: "Mon 07:00",
    status: "idle",
  },
  {
    id: "hygiene-agent",
    name: "hygiene-agent",
    fn: "Runs full DB hygiene loop: deduplication, blank fields, broken links.",
    schedule: "Mon 07:00",
    status: "idle",
  },
  {
    id: "briefing-agent",
    name: "briefing-agent",
    fn: "Generates weekly OS briefing from decisions, insights, and signals.",
    schedule: "Mon 06:00",
    status: "idle",
  },
  {
    id: "portfolio-health-agent",
    name: "portfolio-health-agent",
    fn: "Produces portfolio health snapshot across all active projects.",
    schedule: "Mon 07:30",
    status: "idle",
  },
  {
    id: "grant-monitor-agent",
    name: "grant-monitor-agent",
    fn: "Monitors grant deadlines and fit scores; surfaces P1 signals.",
    schedule: "1st Mon 06:00",
    status: "idle",
  },
  {
    id: "deal-flow-agent",
    name: "deal-flow-agent",
    fn: "Scans pipeline opportunities; scores and ranks by qualification criteria.",
    schedule: "Mon 08:00",
    status: "idle",
  },
  {
    id: "review-queue",
    name: "review-queue",
    fn: "Surfaces items requiring human review across Evidence and Decisions.",
    schedule: "Daily 10:00",
    status: "idle",
  },
  {
    id: "living-room-agent",
    name: "living-room-agent",
    fn: "Curates Living Room feed from signals, insights, and selected content.",
    schedule: "Mon 08:45",
    status: "idle",
  },
];

function StatusDot({ status }: { status: AgentStatus }) {
  if (status === "ok") {
    return (
      <span
        className="w-2 h-2 rounded-full bg-[#B2FF59] flex-shrink-0"
        title="OK"
      />
    );
  }
  if (status === "warning") {
    return (
      <span
        className="w-2 h-2 rounded-full bg-[#FFE066] flex-shrink-0"
        title="Warning"
      />
    );
  }
  return (
    <span
      className="w-2 h-2 rounded-full bg-[#CCCCCC] flex-shrink-0"
      title="Idle"
    />
  );
}

function StatusLabel({ status }: { status: AgentStatus }) {
  if (status === "ok") {
    return (
      <span className="text-[10px] font-bold text-[#3a6600] bg-[#B2FF59]/20 px-2 py-0.5 rounded-full whitespace-nowrap">
        OK
      </span>
    );
  }
  if (status === "warning") {
    return (
      <span className="text-[10px] font-bold text-[#7a5800] bg-[#FFE066]/20 px-2 py-0.5 rounded-full whitespace-nowrap">
        Warning
      </span>
    );
  }
  return (
    <span className="text-[10px] font-bold text-[#131218]/30 px-2 py-0.5 rounded-full whitespace-nowrap">
      —
    </span>
  );
}

export default async function AgentsPage() {
  await requireAdmin();

  const okCount = AGENTS.filter((a) => a.status === "ok").length;
  const warnCount = AGENTS.filter((a) => a.status === "warning").length;

  return (
    <div className="flex min-h-screen bg-[#EFEFEA]">
      <Sidebar items={ADMIN_NAV} isAdmin />

      <main className="flex-1 ml-60 flex flex-col">
        {/* Top bar */}
        <div className="bg-[#131218] px-10 py-4 flex items-center justify-between border-b border-white/6">
          <div className="flex items-center gap-2">
            <span className="text-sm font-[800] text-white tracking-tight">
              Control Room
            </span>
            <span className="text-[10px] text-white/25 font-medium ml-1">
              OS v2 · Agents
            </span>
          </div>
          <div className="flex items-center gap-3">
            {warnCount > 0 && (
              <span className="inline-flex items-center gap-1.5 bg-[#3a0000] border border-[rgba(255,80,80,0.3)] rounded-full px-2.5 py-1 text-[9px] font-bold text-[#ff8080] uppercase tracking-[0.5px]">
                <span className="w-1.5 h-1.5 rounded-full bg-[#ff6060]" />
                {warnCount} warning{warnCount > 1 ? "s" : ""}
              </span>
            )}
            {warnCount === 0 && (
              <span className="inline-flex items-center gap-1.5 bg-[#B2FF59]/10 border border-[#B2FF59]/20 rounded-full px-2.5 py-1 text-[9px] font-bold text-[#B2FF59] uppercase tracking-[0.5px]">
                <span className="w-1.5 h-1.5 rounded-full bg-[#B2FF59]" />
                {okCount} active
              </span>
            )}
          </div>
        </div>

        {/* Sub-nav breadcrumb */}
        <div className="bg-white border-b border-[#E0E0D8] px-10 flex items-center gap-0 h-[46px]">
          <a
            href="/admin"
            className="text-[11px] font-semibold text-[#6b6b6b] hover:text-[#131218] h-full flex items-center border-b-2 border-transparent px-4 pl-0"
          >
            Overview
          </a>
          <a
            href="/admin/agents"
            className="text-[11px] font-semibold text-[#131218] h-full flex items-center border-b-2 border-[#131218] px-4"
          >
            Agents
          </a>
        </div>

        {/* Content */}
        <div className="flex-1 px-10 py-8">
          <div className="max-w-4xl">

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
                  —
                </p>
                <p className="text-[9.5px] text-[#6b6b6b] mt-1">no data yet</p>
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
                  {AGENTS.length} agents · Static data
                </span>
              </div>

              {/* Column headers */}
              <div className="grid grid-cols-[32px_1fr_2fr_120px_90px_80px] gap-3 items-center px-5 py-2.5 border-b border-[#E0E0D8] bg-[#F7F7F5]">
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
              {AGENTS.map((agent, i) => (
                <div
                  key={agent.id}
                  className={`grid grid-cols-[32px_1fr_2fr_120px_90px_80px] gap-3 items-center px-5 py-3 ${
                    i < AGENTS.length - 1 ? "border-b border-[#E0E0D8]" : ""
                  } group hover:bg-[#F7F7F5] transition-colors`}
                >
                  {/* Status dot */}
                  <div className="flex items-center justify-center">
                    <StatusDot status={agent.status} />
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
                  <p className="text-[9.5px] text-[#131218]/30 font-mono">
                    —
                  </p>

                  {/* Status pill */}
                  <StatusLabel status={agent.status} />
                </div>
              ))}
            </div>

            {/* Footer note */}
            <p className="text-[9px] text-[#131218]/25 mt-4 font-medium">
              Agent schedules reflect OS v2 spec · Sprint 28 · Last updated 2026-04-13.
              Live run data will appear once agent hooks report back to the portal.
            </p>

          </div>
        </div>
      </main>
    </div>
  );
}
