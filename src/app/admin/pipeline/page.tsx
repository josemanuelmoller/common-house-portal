import Link from "next/link";
import { Sidebar } from "@/components/Sidebar";
import { getProjectsOverview, getDecisionItems } from "@/lib/notion";
import { requireAdmin } from "@/lib/require-admin";

function daysSince(dateStr: string | null): number {
  if (!dateStr) return 999;
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
}

// ── Stage config ──────────────────────────────────────────────────────────────

const STAGE_ORDER = [
  "Stakeholder Alignment",
  "Discovery",
  "Validation",
  "Pilot Planning",
  "Pilot Live",
  "Execution",
  "Scale",
  "Completion",
  "Design",
  "On Hold",
];

const STAGE_STYLE: Record<string, { header: string; dot: string; card: string }> = {
  "Stakeholder Alignment": {
    header: "text-slate-500",
    dot:    "bg-slate-400",
    card:   "border-slate-200",
  },
  "Discovery": {
    header: "text-blue-500",
    dot:    "bg-blue-400",
    card:   "border-blue-200",
  },
  "Validation": {
    header: "text-amber-500",
    dot:    "bg-amber-400",
    card:   "border-amber-200",
  },
  "Pilot Planning": {
    header: "text-amber-600",
    dot:    "bg-amber-500",
    card:   "border-amber-200",
  },
  "Pilot Live": {
    header: "text-green-600",
    dot:    "bg-green-500",
    card:   "border-green-200",
  },
  "Execution": {
    header: "text-green-700",
    dot:    "bg-green-600",
    card:   "border-green-200",
  },
  "Scale": {
    header: "text-[#131218]",
    dot:    "bg-[#c8f55a]",
    card:   "border-[#c8f55a]/40",
  },
  "Completion": {
    header: "text-[#131218]",
    dot:    "bg-[#c8f55a]",
    card:   "border-[#c8f55a]/60",
  },
  "Design": {
    header: "text-purple-600",
    dot:    "bg-purple-500",
    card:   "border-purple-200",
  },
  "On Hold": {
    header: "text-[#131218]/30",
    dot:    "bg-[#131218]/20",
    card:   "border-[#E0E0D8]",
  },
};

const STAGE_STYLE_DEFAULT = {
  header: "text-[#131218]/40",
  dot:    "bg-[#131218]/20",
  card:   "border-[#E0E0D8]",
};

export default async function PipelinePage() {
  await requireAdmin();

  const [allProjects, decisions] = await Promise.all([
    getProjectsOverview(),
    getDecisionItems(),
  ]);

  const projects = allProjects;

  const commercialDecisions = decisions.filter(d =>
    d.status !== "Approved" && d.status !== "Rejected" && d.status !== "Executed"
  );
  const urgentDecisions = commercialDecisions.filter(d =>
    d.priority === "P1" || d.priority === "P1 Critical" || d.priority === "Urgent"
  );
  const withDeadlines = commercialDecisions.filter(d => d.dueDate);

  // Group projects by stage
  const byStage: Record<string, typeof projects> = {};
  for (const p of projects) {
    const s = p.stage || "Unknown";
    if (!byStage[s]) byStage[s] = [];
    byStage[s].push(p);
  }

  // Ordered columns — only stages that have projects
  const orderedStages = [
    ...STAGE_ORDER.filter(s => byStage[s]?.length > 0),
    ...Object.keys(byStage).filter(s => !STAGE_ORDER.includes(s) && byStage[s].length > 0),
  ];

  return (
    <div className="flex min-h-screen bg-[#EFEFEA]">
      <Sidebar adminNav />

      <main className="flex-1 ml-[228px] flex flex-col">

        {/* Dark header */}
        <header className="bg-[#131218] px-12 pt-10 pb-11 flex-shrink-0">
          <p className="text-[8px] font-bold tracking-[2.5px] uppercase text-white/20 mb-3">
            Commercial · Pipeline overview
          </p>
          <div className="flex items-end justify-between">
            <div>
              <h1 className="text-[2.6rem] font-light text-white tracking-[-1.5px] leading-none">
                Commercial <em className="font-black italic text-[#c8f55a]">Pipeline</em>
              </h1>
              <p className="text-sm text-white/40 mt-3">
                All active engagements by stage. Decisions, deadlines, and delivery signals.
              </p>
            </div>
            <div className="flex items-center gap-4 pb-1">
              <div className="text-right">
                <p className="text-[2rem] font-black text-white tracking-tight leading-none">{projects.length}</p>
                <p className="text-[9px] font-bold tracking-[1.5px] uppercase text-white/30 mt-0.5">Active</p>
              </div>
              <div className="w-px h-10 bg-white/10" />
              <div className="text-right">
                <p className="text-[2rem] font-black text-amber-400 tracking-tight leading-none">{commercialDecisions.length}</p>
                <p className="text-[9px] font-bold tracking-[1.5px] uppercase text-white/30 mt-0.5">Open items</p>
              </div>
            </div>
          </div>
        </header>

        <div className="flex-1 flex flex-col px-12 py-9 gap-6 min-w-0">

          {/* P1 banner */}
          {(urgentDecisions.length > 0 || withDeadlines.length > 0) && (
            <div className="flex items-center gap-3 bg-red-50 border border-red-200 rounded-xl px-5 py-3.5 flex-shrink-0">
              <span className="w-2 h-2 rounded-full bg-red-500 shrink-0 animate-pulse" />
              <p className="text-sm text-[#131218] flex-1 min-w-0">
                {urgentDecisions.length > 0 && (
                  <><strong>{urgentDecisions.length} urgent decision{urgentDecisions.length !== 1 ? "s" : ""}</strong>
                  {" — "}{urgentDecisions.slice(0, 1).map(d => d.title).join(", ")}</>
                )}
                {withDeadlines.length > 0 && (
                  <>{urgentDecisions.length > 0 ? " · " : ""}
                  <strong>{withDeadlines.length} with deadline</strong></>
                )}
              </p>
              <Link href="/admin/decisions" className="text-[11px] font-bold text-red-600 shrink-0 hover:text-red-800 transition-colors whitespace-nowrap">
                Review decisions →
              </Link>
            </div>
          )}

          {/* ── Kanban board ─────────────────────────────────────────────────── */}
          <div>
            <div className="flex items-center gap-3 mb-4">
              <p className="text-[9px] font-bold tracking-widest uppercase text-[#131218]/30">Pipeline board</p>
              <div className="flex-1 h-px bg-[#E0E0D8]" />
              <p className="text-[9px] font-bold text-[#131218]/25">{orderedStages.length} stages</p>
            </div>

            <div className="overflow-x-auto pb-2 -mx-2 px-2">
              <div className="flex gap-3" style={{ minWidth: "max-content" }}>
                {orderedStages.map(stage => {
                  const cards = byStage[stage] ?? [];
                  const style = STAGE_STYLE[stage] ?? STAGE_STYLE_DEFAULT;
                  return (
                    <div
                      key={stage}
                      className="flex flex-col gap-2"
                      style={{ width: 210, minWidth: 210 }}
                    >
                      {/* Column header */}
                      <div className="flex items-center gap-2 px-1">
                        <span className={`w-2 h-2 rounded-full shrink-0 ${style.dot}`} />
                        <p className={`text-[10px] font-bold uppercase tracking-widest truncate ${style.header}`}>
                          {stage}
                        </p>
                        <span className="ml-auto text-[10px] font-bold text-[#131218]/25 shrink-0">
                          {cards.length}
                        </span>
                      </div>

                      {/* Cards */}
                      <div className="flex flex-col gap-2">
                        {cards.map(p => {
                          const days = daysSince(p.lastUpdate);
                          const isStale = days > 30;
                          return (
                            <Link
                              key={p.id}
                              href={`/admin/projects/${p.id}`}
                              className={`bg-white rounded-xl border-[1.5px] ${style.card} px-3 py-3 hover:border-[#131218]/30 hover:translate-y-[-2px] transition-all block`}
                            >
                              <p className="text-[12px] font-bold text-[#131218] leading-snug mb-1.5">
                                {p.name}
                              </p>
                              <div className="flex items-center justify-between gap-2">
                                <div className="flex items-center gap-1.5">
                                  {p.primaryWorkspace === "garage" && (
                                    <span className="text-[8px] font-bold bg-[#131218] text-[#c8f55a] px-1.5 py-0.5 rounded-md">
                                      Garage
                                    </span>
                                  )}
                                  {p.primaryWorkspace === "workroom" && (
                                    <span className="text-[8px] font-bold bg-[#EFEFEA] text-[#131218]/50 border border-[#E0E0D8] px-1.5 py-0.5 rounded-md">
                                      Room
                                    </span>
                                  )}
                                </div>
                                {p.lastUpdate && (
                                  <p className={`text-[9px] font-medium shrink-0 ${isStale ? "text-red-400" : "text-[#131218]/30"}`}>
                                    {new Date(p.lastUpdate).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                                  </p>
                                )}
                              </div>
                              {p.blockerCount > 0 && (
                                <p className="text-[9px] font-bold text-red-500 mt-1.5">
                                  ↯ {p.blockerCount} blocker{p.blockerCount !== 1 ? "s" : ""}
                                </p>
                              )}
                              {p.updateNeeded && !p.blockerCount && (
                                <p className="text-[9px] font-bold text-amber-500 mt-1.5">! Update needed</p>
                              )}
                            </Link>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* ── Open decisions — full width list ─────────────────────────────── */}
          <div>
            <div className="flex items-center gap-3 mb-3">
              <p className="text-[9px] font-bold tracking-widest uppercase text-[#131218]/30">Open decisions</p>
              <div className="flex-1 h-px bg-[#E0E0D8]" />
              {commercialDecisions.length > 0 && (
                <span className="text-[9px] font-bold bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">
                  {commercialDecisions.length}
                </span>
              )}
            </div>

            <div className="bg-white rounded-2xl border border-[#E0E0D8] overflow-hidden">
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 divide-x divide-y divide-[#EFEFEA]">
                {commercialDecisions.slice(0, 12).map(d => (
                  <Link
                    key={d.id}
                    href="/admin/decisions"
                    className="flex items-start gap-3 px-4 py-3 hover:bg-[#EFEFEA]/40 transition-colors group"
                  >
                    <div className={`w-5 h-5 rounded-md flex items-center justify-center shrink-0 mt-0.5 ${
                      d.priority === "P1" || d.priority === "P1 Critical" || d.priority === "Urgent"
                        ? "bg-red-100" : "bg-[#EFEFEA]"
                    }`}>
                      <span className={`text-[8px] font-bold ${
                        d.priority === "P1" || d.priority === "P1 Critical" || d.priority === "Urgent"
                          ? "text-red-600" : "text-[#131218]/30"
                      }`}>
                        {d.priority === "P1" || d.priority === "P1 Critical" ? "P1" : "·"}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] font-semibold text-[#131218] leading-snug line-clamp-2">{d.title}</p>
                      <p className="text-[9px] text-[#131218]/35 mt-0.5">
                        {d.decisionType || "Decision"}
                        {d.dueDate && ` · Due ${new Date(d.dueDate).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`}
                      </p>
                    </div>
                  </Link>
                ))}
                {commercialDecisions.length === 0 && (
                  <div className="col-span-4 px-4 py-6 text-center">
                    <p className="text-[11px] text-[#131218]/25 font-medium">No open decisions</p>
                  </div>
                )}
              </div>
              <div className="px-4 py-2.5 border-t border-[#EFEFEA]">
                <Link href="/admin/decisions" className="text-[9px] font-bold text-[#131218]/30 hover:text-[#131218]/60 transition-colors uppercase tracking-widest">
                  All decisions →
                </Link>
              </div>
            </div>
          </div>

        </div>
      </main>
    </div>
  );
}
