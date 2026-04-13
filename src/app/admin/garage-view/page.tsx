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
  "Pre-seed":   "bg-purple-50 text-purple-700 border border-purple-200",
  "Seed":       "bg-blue-50 text-blue-600 border border-blue-200",
  "Series A":   "bg-[#131218] text-[#B2FF59]",
  "Series B":   "bg-[#131218] text-[#B2FF59]",
  "Discovery":  "bg-[#EFEFEA] text-[#131218]/50 border border-[#E0E0D8]",
  "Validation": "bg-amber-50 text-amber-600 border border-amber-200",
  "Execution":  "bg-green-50 text-green-700 border border-green-200",
  "On Hold":    "bg-gray-100 text-gray-400 border border-gray-200",
};

function readinessColor(score: number): string {
  if (score >= 80) return "text-green-600";
  if (score >= 60) return "text-amber-500";
  if (score >= 40) return "text-orange-500";
  return "text-red-500";
}

export default async function GarageViewPage() {
  await requireAdmin();

  const allProjects = await getProjectsOverview();
  const projects    = allProjects.filter(p => p.primaryWorkspace === "garage");

  const withBlockers   = projects.filter(p => p.blockerCount > 0);
  const needsUpdate    = projects.filter(p => p.updateNeeded);
  const totalEvidence  = projects.reduce((sum, p) => sum + p.evidenceCount, 0);
  const totalValidated = projects.reduce((sum, p) => sum + p.validatedCount, 0);

  // Readiness score proxy: validated / total evidence × 100, capped at 100
  function readinessScore(p: typeof projects[0]): number {
    if (!p.evidenceCount) return 0;
    return Math.min(100, Math.round((p.validatedCount / p.evidenceCount) * 100));
  }

  return (
    <div className="flex min-h-screen bg-[#EFEFEA]">
      <Sidebar adminNav />

      <main className="flex-1 ml-[228px]">

        {/* Dark header */}
        <header className="bg-[#131218] px-12 pt-10 pb-11">
          <p className="text-[8px] font-bold tracking-[2.5px] uppercase text-white/20 mb-3">
            Portfolio · Startups
          </p>
          <div className="flex items-end justify-between">
            <div>
              <h1 className="text-[2.6rem] font-light text-white tracking-[-1.5px] leading-none">
                The <em className="font-black not-italic text-[#B2FF59]">Garage</em>
              </h1>
              <p className="text-sm text-white/40 mt-3">
                Portfolio startups. Evidence, investor readiness, and growth signals — company by company.
              </p>
            </div>
            <div className="flex items-center gap-4 pb-1">
              <div className="text-right">
                <p className="text-[2rem] font-black text-white tracking-tight leading-none">{projects.length}</p>
                <p className="text-[9px] font-bold tracking-[1.5px] uppercase text-white/30 mt-0.5">Startups</p>
              </div>
              <div className="w-px h-10 bg-white/10" />
              <div className="text-right">
                <p className="text-[2rem] font-black text-[#B2FF59] tracking-tight leading-none">{totalValidated}</p>
                <p className="text-[9px] font-bold tracking-[1.5px] uppercase text-white/30 mt-0.5">Validated</p>
              </div>
            </div>
          </div>
        </header>

        <div className="px-12 py-9 max-w-7xl space-y-6">

          {/* P1 banner */}
          {withBlockers.length > 0 && (
            <div className="flex items-center gap-3 bg-red-50 border border-red-200 rounded-xl px-5 py-3.5">
              <span className="w-2 h-2 rounded-full bg-red-500 shrink-0 animate-pulse" />
              <p className="text-sm text-[#131218] flex-1 min-w-0">
                <strong>{withBlockers.length} blocker{withBlockers.length !== 1 ? "s" : ""}</strong>
                {" — "}{withBlockers.slice(0, 2).map(p => p.name).join(", ")}
              </p>
              <Link href="/admin/decisions" className="text-[11px] font-bold text-red-600 shrink-0 hover:text-red-800 transition-colors whitespace-nowrap">
                View decisions →
              </Link>
            </div>
          )}

          {/* Stats row */}
          <div className="grid grid-cols-4 gap-4">
            <div className="bg-white rounded-2xl border border-[#E0E0D8] px-5 py-4">
              <p className="text-[9px] font-bold tracking-widest uppercase text-[#131218]/30 mb-2">Portfolio</p>
              <p className="text-3xl font-bold text-[#131218] tracking-tight">{projects.length}</p>
              <p className="text-[11px] text-[#131218]/40 font-medium mt-1.5">Active startups</p>
            </div>
            <div className="bg-white rounded-2xl border border-[#E0E0D8] px-5 py-4">
              <p className="text-[9px] font-bold tracking-widest uppercase text-[#131218]/30 mb-2">Total evidence</p>
              <p className="text-3xl font-bold text-[#131218] tracking-tight">{totalEvidence}</p>
              <p className="text-[11px] text-[#131218]/40 font-medium mt-1.5">{totalValidated} validated</p>
            </div>
            <div className="bg-white rounded-2xl border border-[#E0E0D8] px-5 py-4">
              <p className="text-[9px] font-bold tracking-widest uppercase text-[#131218]/30 mb-2">Blockers</p>
              {withBlockers.length > 0
                ? <p className="text-3xl font-bold text-red-500 tracking-tight">{withBlockers.length}</p>
                : <p className="text-3xl font-bold text-[#131218]/15 tracking-tight">0</p>
              }
              <p className="text-[11px] text-[#131218]/40 font-medium mt-1.5">
                {withBlockers.length > 0 ? "Need attention" : "Portfolio clear"}
              </p>
            </div>
            <div className="bg-white rounded-2xl border border-[#E0E0D8] px-5 py-4">
              <p className="text-[9px] font-bold tracking-widest uppercase text-[#131218]/30 mb-2">Pending updates</p>
              {needsUpdate.length > 0
                ? <p className="text-3xl font-bold text-amber-500 tracking-tight">{needsUpdate.length}</p>
                : <p className="text-3xl font-bold text-[#131218]/15 tracking-tight">0</p>
              }
              <p className="text-[11px] text-[#131218]/40 font-medium mt-1.5">Status updates due</p>
            </div>
          </div>

          {/* Startup cards grid */}
          {projects.length > 0 ? (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {projects.map(p => {
                const days    = daysSince(p.lastUpdate);
                const warmth  = warmthLabel(days);
                const score   = readinessScore(p);

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
                          <span className={`text-[8.5px] font-bold px-2 py-0.5 rounded-full ${STAGE_COLORS[p.stage] ?? "bg-[#EFEFEA] text-[#131218]/50 border border-[#E0E0D8]"}`}>
                            {p.stage}
                          </span>
                        )}
                        {p.themes.slice(0, 2).map(t => (
                          <span key={t} className="text-[8.5px] font-bold px-2 py-0.5 rounded-full bg-[#EFEFEA] text-[#131218]/40 border border-[#E0E0D8]">
                            {t}
                          </span>
                        ))}
                      </div>

                      {/* Stats grid + readiness */}
                      <div className="grid grid-cols-5 gap-2 mb-4">
                        {[
                          { label: "Evidence",  val: p.evidenceCount  },
                          { label: "Validated", val: p.validatedCount },
                          { label: "Sources",   val: p.sourcesCount   },
                          { label: "Decisions", val: p.decisionCount  },
                          { label: "Outcomes",  val: p.outcomeCount   },
                        ].map(s => (
                          <div key={s.label}>
                            <p className="text-[7.5px] font-bold tracking-wider uppercase text-[#131218]/25 mb-0.5">{s.label}</p>
                            <p className="text-[13px] font-bold text-[#131218]">{s.val}</p>
                          </div>
                        ))}
                      </div>

                      {/* Readiness bar */}
                      <div className="mb-4">
                        <div className="flex items-center justify-between mb-1">
                          <p className="text-[8px] font-bold tracking-wider uppercase text-[#131218]/25">Readiness</p>
                          <p className={`text-[10px] font-bold ${readinessColor(score)}`}>{score}%</p>
                        </div>
                        <div className="h-1 bg-[#EFEFEA] rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${score >= 80 ? "bg-[#B2FF59]" : score >= 60 ? "bg-amber-400" : score >= 40 ? "bg-orange-400" : "bg-red-400"}`}
                            style={{ width: `${score}%` }}
                          />
                        </div>
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
              <p className="text-sm font-bold text-[#131218]/25 mb-2">No garage projects found</p>
              <p className="text-xs text-[#131218]/20">
                Assign a project&apos;s <strong>Primary Workspace</strong> to <strong>garage</strong> in Notion to see it here.
              </p>
            </div>
          )}

        </div>
      </main>
    </div>
  );
}
