import Link from "next/link";
import { Sidebar } from "@/components/Sidebar";
import { getProjectsOverview } from "@/lib/notion";
import { requireAdmin } from "@/lib/require-admin";

function daysSince(dateStr: string | null): number {
  if (!dateStr) return 999;
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
}

function warmthLabel(days: number): { label: string; dot: string; text: string } {
  if (days <= 3)  return { label: "Hot",     dot: "bg-red-500",        text: "text-red-600" };
  if (days <= 10) return { label: "Warm",    dot: "bg-amber-400",      text: "text-amber-600" };
  if (days <= 21) return { label: "Active",  dot: "bg-amber-300",      text: "text-amber-500" };
  if (days <= 35) return { label: "Cold",    dot: "bg-blue-400",       text: "text-blue-500" };
  return              { label: "Dormant", dot: "bg-[#131218]/15",   text: "text-[#131218]/35" };
}

const STAGE_COLORS: Record<string, string> = {
  "Discovery":  "bg-blue-50 text-blue-600 border border-blue-200",
  "Validation": "bg-amber-50 text-amber-600 border border-amber-200",
  "Execution":  "bg-[#131218] text-[#B2FF59]",
  "Completion": "bg-[#B2FF59] text-[#131218]",
  "On Hold":    "bg-gray-100 text-gray-400 border border-gray-200",
};

const MODE_COLORS: Record<string, string> = {
  "Advisory":    "bg-purple-50 text-purple-700 border border-purple-200",
  "Embedded":    "bg-[#131218] text-[#B2FF59]",
  "Consulting":  "bg-blue-50 text-blue-600 border border-blue-200",
  "Partnership": "bg-green-50 text-green-700 border border-green-200",
};

export default async function WorkroomsPage() {
  await requireAdmin();

  const allProjects = await getProjectsOverview();
  const projects    = allProjects.filter(p => p.primaryWorkspace === "workroom");

  const withBlockers   = projects.filter(p => p.blockerCount > 0);
  const needsUpdate    = projects.filter(p => p.updateNeeded);
  const staleCount     = projects.filter(p => daysSince(p.lastUpdate) > 30).length;
  const executionCount = projects.filter(p => p.stage === "Execution").length;

  return (
    <div className="flex min-h-screen bg-[#EFEFEA]">
      <Sidebar adminNav />

      <main className="flex-1 ml-[228px]">

        {/* Dark header */}
        <header className="bg-[#131218] px-12 pt-10 pb-11">
          <p className="text-[8px] font-bold tracking-[2.5px] uppercase text-white/20 mb-3">
            Portfolio · Client Engagements
          </p>
          <div className="flex items-end justify-between">
            <div>
              <h1 className="text-[2.6rem] font-light text-white tracking-[-1.5px] leading-none">
                The <em className="font-black italic text-[#c8f55a]">Workrooms</em>
              </h1>
              <p className="text-sm text-white/40 mt-3">
                Active client engagements. Evidence, momentum, and delivery — room by room.
              </p>
            </div>
            <div className="flex items-center gap-4 pb-1">
              <div className="text-right">
                <p className="text-[2rem] font-black text-white tracking-tight leading-none">{projects.length}</p>
                <p className="text-[9px] font-bold tracking-[1.5px] uppercase text-white/30 mt-0.5">Active</p>
              </div>
              <div className="w-px h-10 bg-white/10" />
              <div className="text-right">
                <p className="text-[2rem] font-black text-[#B2FF59] tracking-tight leading-none">{executionCount}</p>
                <p className="text-[9px] font-bold tracking-[1.5px] uppercase text-white/30 mt-0.5">In Exec</p>
              </div>
            </div>
          </div>
        </header>

        <div className="px-12 py-9 max-w-7xl space-y-6">

          {/* P1 banner */}
          {(withBlockers.length > 0 || needsUpdate.length > 0) && (
            <div className="flex items-center gap-3 bg-red-50 border border-red-200 rounded-xl px-5 py-3.5">
              <span className="w-2 h-2 rounded-full bg-red-500 shrink-0 animate-pulse" />
              <p className="text-sm text-[#131218] flex-1 min-w-0">
                {withBlockers.length > 0 && (
                  <><strong>{withBlockers.length} blocker{withBlockers.length !== 1 ? "s" : ""}</strong>
                  {" — "}{withBlockers.slice(0, 2).map(p => p.name).join(", ")}</>
                )}
                {needsUpdate.length > 0 && (
                  <>{withBlockers.length > 0 ? " · " : ""}
                  <strong>{needsUpdate.length} update{needsUpdate.length !== 1 ? "s" : ""} pending</strong></>
                )}
              </p>
              <Link href="/admin/decisions" className="text-[11px] font-bold text-red-600 shrink-0 hover:text-red-800 transition-colors whitespace-nowrap">
                View decisions →
              </Link>
            </div>
          )}

          {/* Stats row */}
          <div className="grid grid-cols-4 gap-4">
            <div className="bg-white rounded-2xl border border-[#E0E0D8] px-5 py-4">
              <p className="text-[9px] font-bold tracking-widest uppercase text-[#131218]/30 mb-2">Workrooms</p>
              <p className="text-3xl font-bold text-[#131218] tracking-tight">{projects.length}</p>
              <p className="text-[11px] text-[#131218]/40 font-medium mt-1.5">Active client engagements</p>
            </div>
            <div className="bg-white rounded-2xl border border-[#E0E0D8] px-5 py-4">
              <p className="text-[9px] font-bold tracking-widest uppercase text-[#131218]/30 mb-2">In Execution</p>
              <p className="text-3xl font-bold text-[#B2FF59] bg-[#131218] w-fit px-3 py-0.5 rounded-xl tracking-tight">{executionCount}</p>
              <p className="text-[11px] text-[#131218]/40 font-medium mt-1.5">Delivering now</p>
            </div>
            <div className="bg-white rounded-2xl border border-[#E0E0D8] px-5 py-4">
              <p className="text-[9px] font-bold tracking-widest uppercase text-[#131218]/30 mb-2">Blockers</p>
              {withBlockers.length > 0
                ? <p className="text-3xl font-bold text-red-500 tracking-tight">{withBlockers.length}</p>
                : <p className="text-3xl font-bold text-[#131218]/15 tracking-tight">0</p>
              }
              <p className="text-[11px] text-[#131218]/40 font-medium mt-1.5">
                {withBlockers.length > 0 ? "Need attention" : "All clear"}
              </p>
            </div>
            <div className="bg-white rounded-2xl border border-[#E0E0D8] px-5 py-4">
              <p className="text-[9px] font-bold tracking-widest uppercase text-[#131218]/30 mb-2">Stale</p>
              {staleCount > 0
                ? <p className="text-3xl font-bold text-amber-500 tracking-tight">{staleCount}</p>
                : <p className="text-3xl font-bold text-[#131218]/15 tracking-tight">0</p>
              }
              <p className="text-[11px] text-[#131218]/40 font-medium mt-1.5">30+ days no update</p>
            </div>
          </div>

          {/* Project cards grid */}
          {projects.length > 0 ? (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {projects.map(p => {
                const days   = daysSince(p.lastUpdate);
                const warmth = warmthLabel(days);

                return (
                  <Link
                    key={p.id}
                    href={`/admin/projects/${p.id}`}
                    className="group bg-white rounded-2xl border border-[#E0E0D8] overflow-hidden hover:border-[#131218]/25 hover:-translate-y-0.5 transition-all duration-200"
                  >
                    {/* Top accent bar */}
                    {p.blockerCount > 0 && <div className="h-1 bg-red-400" />}
                    {!p.blockerCount && p.updateNeeded && <div className="h-1 bg-amber-400" />}
                    {!p.blockerCount && !p.updateNeeded && <div className="h-1 bg-[#B2FF59]" />}

                    <div className="px-5 py-4">
                      <div className="flex items-start justify-between gap-3 mb-3">
                        <div className="min-w-0 flex-1">
                          <p className="text-[13px] font-bold text-[#131218] tracking-tight leading-snug truncate">{p.name}</p>
                          {p.geography.length > 0 && (
                            <p className="text-[10px] text-[#131218]/40 mt-0.5 truncate">
                              {p.geography.slice(0, 2).join(" · ")}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <span className={`w-1.5 h-1.5 rounded-full ${warmth.dot}`} />
                          <span className={`text-[9.5px] font-bold ${warmth.text}`}>{warmth.label}</span>
                        </div>
                      </div>

                      {/* Badges */}
                      <div className="flex flex-wrap gap-1.5 mb-4">
                        {p.stage && (
                          <span className={`text-[8.5px] font-bold px-2 py-0.5 rounded-full ${STAGE_COLORS[p.stage] ?? "bg-[#EFEFEA] text-[#131218]/50"}`}>
                            {p.stage}
                          </span>
                        )}
                        {p.workroomMode && (
                          <span className={`text-[8.5px] font-bold px-2 py-0.5 rounded-full ${MODE_COLORS[p.workroomMode] ?? "bg-[#EFEFEA] text-[#131218]/40 border border-[#E0E0D8]"}`}>
                            {p.workroomMode}
                          </span>
                        )}
                        {p.engagementStage && (
                          <span className="text-[8.5px] font-bold px-2 py-0.5 rounded-full bg-[#EFEFEA] text-[#131218]/40 border border-[#E0E0D8]">
                            {p.engagementStage}
                          </span>
                        )}
                      </div>

                      {/* Stats */}
                      <div className="grid grid-cols-4 gap-2 mb-4">
                        {[
                          { label: "Evidence",  val: p.evidenceCount,  color: "" },
                          { label: "Validated", val: p.validatedCount, color: "" },
                          { label: "Sources",   val: p.sourcesCount,   color: "" },
                          { label: "Decisions", val: p.decisionCount,  color: p.decisionCount > 0 ? "text-amber-500" : "" },
                        ].map(s => (
                          <div key={s.label}>
                            <p className="text-[8px] font-bold tracking-wider uppercase text-[#131218]/25 mb-0.5">{s.label}</p>
                            <p className={`text-[13px] font-bold text-[#131218] ${s.color}`}>{s.val}</p>
                          </div>
                        ))}
                      </div>

                      {/* Footer */}
                      <div className="flex items-center justify-between pt-3 border-t border-[#EFEFEA]">
                        <div className="flex items-center gap-3">
                          {p.blockerCount > 0 && (
                            <span className="text-[9px] font-bold text-red-500">↯ {p.blockerCount} blocker{p.blockerCount !== 1 ? "s" : ""}</span>
                          )}
                          {p.updateNeeded && (
                            <span className="text-[9px] font-bold text-amber-500">! Update needed</span>
                          )}
                          {!p.blockerCount && !p.updateNeeded && (
                            <span className="text-[9px] font-medium text-[#131218]/25">
                              {p.lastUpdate
                                ? `Updated ${new Date(p.lastUpdate).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`
                                : "No update logged"
                              }
                            </span>
                          )}
                        </div>
                        <span className="text-[#131218]/20 group-hover:text-[#131218]/60 transition-colors text-sm">→</span>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-[#E0E0D8] p-12 text-center">
              <p className="text-sm font-bold text-[#131218]/25 mb-2">No workroom projects found</p>
              <p className="text-xs text-[#131218]/20">
                Assign a project&apos;s <strong>Primary Workspace</strong> to <strong>workroom</strong> in Notion to see it here.
              </p>
            </div>
          )}

        </div>
      </main>
    </div>
  );
}
