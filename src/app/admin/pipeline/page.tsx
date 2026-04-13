import Link from "next/link";
import { Sidebar } from "@/components/Sidebar";
import { getProjectsOverview, getDecisionItems } from "@/lib/notion";
import { requireAdmin } from "@/lib/require-admin";

function daysSince(dateStr: string | null): number {
  if (!dateStr) return 999;
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
}

const STAGE_COLORS: Record<string, string> = {
  "Discovery":  "bg-blue-50 text-blue-600 border border-blue-200",
  "Validation": "bg-amber-50 text-amber-600 border border-amber-200",
  "Execution":  "bg-[#131218] text-[#B2FF59]",
  "Completion": "bg-[#B2FF59] text-[#131218]",
  "On Hold":    "bg-gray-100 text-gray-400 border border-gray-200",
};

export default async function PipelinePage() {
  await requireAdmin();

  const [allProjects, decisions] = await Promise.all([
    getProjectsOverview(),
    getDecisionItems(),
  ]);

  // Pipeline = all active projects — the full commercial view across all workspaces
  const projects = allProjects;

  // Commercial decision items — approvals, proposals, missing inputs
  const commercialDecisions = decisions.filter(d =>
    d.status !== "Approved" && d.status !== "Rejected" && d.status !== "Executed"
  );
  const urgentDecisions = commercialDecisions.filter(d =>
    d.priority === "P1" || d.priority === "P1 Critical" || d.priority === "Urgent"
  );
  const withDeadlines = commercialDecisions.filter(d => d.dueDate);

  // Stage breakdown
  const byStage = projects.reduce((acc, p) => {
    const s = p.stage || "Unknown";
    acc[s] = (acc[s] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const stageOrder = ["Discovery", "Validation", "Execution", "Completion", "On Hold"];

  return (
    <div className="flex min-h-screen bg-[#EFEFEA]">
      <Sidebar adminNav />

      <main className="flex-1 ml-[228px]">

        {/* Dark header */}
        <header className="bg-[#131218] px-12 pt-10 pb-11">
          <p className="text-[8px] font-bold tracking-[2.5px] uppercase text-white/20 mb-3">
            Commercial · Pipeline overview
          </p>
          <div className="flex items-end justify-between">
            <div>
              <h1 className="text-[2.6rem] font-light text-white tracking-[-1.5px] leading-none">
                Commercial <em className="font-black not-italic text-[#B2FF59]">Pipeline</em>
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

        <div className="px-12 py-9 max-w-7xl space-y-6">

          {/* P1 banner */}
          {(urgentDecisions.length > 0 || withDeadlines.length > 0) && (
            <div className="flex items-center gap-3 bg-red-50 border border-red-200 rounded-xl px-5 py-3.5">
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

          {/* Stage breakdown */}
          <div>
            <div className="flex items-center gap-3 mb-3">
              <p className="text-[9px] font-bold tracking-widest uppercase text-[#131218]/30">By stage</p>
              <div className="flex-1 h-px bg-[#E0E0D8]" />
            </div>
            <div className="flex gap-3 flex-wrap">
              {stageOrder.filter(s => byStage[s] > 0).map(stage => (
                <div key={stage} className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border text-sm font-bold ${STAGE_COLORS[stage] ?? "bg-[#EFEFEA] text-[#131218]/40 border-[#E0E0D8]"}`}>
                  <span>{byStage[stage]}</span>
                  <span className="opacity-60 text-[11px]">{stage}</span>
                </div>
              ))}
              {Object.entries(byStage)
                .filter(([s]) => !stageOrder.includes(s))
                .map(([stage, count]) => (
                  <div key={stage} className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-[#E0E0D8] bg-[#EFEFEA] text-sm font-bold text-[#131218]/40">
                    <span>{count}</span>
                    <span className="opacity-60 text-[11px]">{stage}</span>
                  </div>
                ))
              }
            </div>
          </div>

          {/* Two-column: projects + open decisions */}
          <div className="grid grid-cols-[1fr_340px] gap-6 items-start">

            {/* Projects table */}
            <div>
              <div className="flex items-center gap-3 mb-3">
                <p className="text-[9px] font-bold tracking-widest uppercase text-[#131218]/30">All engagements</p>
                <div className="flex-1 h-px bg-[#E0E0D8]" />
                <p className="text-[9px] font-bold text-[#131218]/25">{projects.length}</p>
              </div>

              <div className="bg-white rounded-2xl border border-[#E0E0D8] overflow-hidden">
                <div className="grid grid-cols-[2fr_80px_80px_80px_24px] px-5 py-2.5 border-b border-[#EFEFEA]">
                  {["Project", "Stage", "Type", "Update", ""].map(h => (
                    <p key={h} className="text-[9px] font-bold text-[#131218]/25 uppercase tracking-widest">{h}</p>
                  ))}
                </div>

                <div className="divide-y divide-[#EFEFEA]">
                  {projects.map(p => {
                    const days = daysSince(p.lastUpdate);
                    const isStale = days > 30;
                    const typeBadge = p.primaryWorkspace === "garage"
                      ? "bg-[#131218] text-[#B2FF59]"
                      : p.primaryWorkspace === "workroom"
                        ? "bg-[#EFEFEA] text-[#131218]/60 border border-[#E0E0D8]"
                        : "bg-[#EFEFEA] text-[#131218]/30 border border-[#E0E0D8]";

                    return (
                      <Link
                        key={p.id}
                        href={`/admin/projects/${p.id}`}
                        className="grid grid-cols-[2fr_80px_80px_80px_24px] px-5 py-3 hover:bg-[#EFEFEA]/50 transition-colors group items-center"
                      >
                        <div className="min-w-0">
                          <p className="text-[12px] font-semibold text-[#131218] truncate">{p.name}</p>
                          {p.blockerCount > 0 && (
                            <p className="text-[9px] font-bold text-red-500 mt-0.5">↯ {p.blockerCount} blocker{p.blockerCount !== 1 ? "s" : ""}</p>
                          )}
                        </div>
                        <div>
                          {p.stage ? (
                            <span className={`inline-block text-[8px] font-bold px-1.5 py-0.5 rounded-full ${STAGE_COLORS[p.stage] ?? "bg-[#EFEFEA] text-[#131218]/50"}`}>
                              {p.stage}
                            </span>
                          ) : <span className="text-[#131218]/20 text-xs">—</span>}
                        </div>
                        <div>
                          <span className={`inline-block text-[8px] font-bold px-1.5 py-0.5 rounded-full ${typeBadge}`}>
                            {p.primaryWorkspace === "garage" ? "Garage" : p.primaryWorkspace === "workroom" ? "Room" : "—"}
                          </span>
                        </div>
                        <div>
                          {p.lastUpdate ? (
                            <p className={`text-[10px] font-medium ${isStale ? "text-red-400" : "text-[#131218]/40"}`}>
                              {new Date(p.lastUpdate).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                            </p>
                          ) : <span className="text-[#131218]/20 text-xs">—</span>}
                          {p.updateNeeded && <p className="text-[8px] font-bold text-amber-500">⚠ Due</p>}
                        </div>
                        <div className="text-[#131218]/20 group-hover:text-[#131218]/60 transition-colors text-sm text-right">→</div>
                      </Link>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Open decisions sidebar */}
            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-3 mb-0">
                <p className="text-[9px] font-bold tracking-widest uppercase text-[#131218]/30">Open decisions</p>
                <div className="flex-1 h-px bg-[#E0E0D8]" />
                {commercialDecisions.length > 0 && (
                  <span className="text-[9px] font-bold bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">{commercialDecisions.length}</span>
                )}
              </div>

              <div className="bg-white rounded-2xl border border-[#E0E0D8] overflow-hidden">
                <div className="divide-y divide-[#EFEFEA]">
                  {commercialDecisions.slice(0, 8).map(d => (
                    <Link key={d.id} href="/admin/decisions" className="flex items-start gap-3 px-4 py-3 hover:bg-[#EFEFEA]/40 transition-colors group">
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
                    <div className="px-4 py-6 text-center">
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

        </div>
      </main>
    </div>
  );
}
