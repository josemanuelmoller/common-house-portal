import Link from "next/link";
import { Sidebar } from "@/components/Sidebar";
import { getProjectsOverview, getDecisionItems } from "@/lib/notion";
import { requireAdmin } from "@/lib/require-admin";

function daysSince(dateStr: string | null): number {
  if (!dateStr) return 999;
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
}

// Funding stages in order
const FUNDING_STAGES = ["Pre-seed", "Seed", "Series A", "Series B", "Series C"];
const ALL_STAGES = ["Discovery", "Validation", "Execution", "Completion", "On Hold"];

function stageColor(stage: string): string {
  if (stage === "Series A" || stage === "Series B" || stage === "Series C") return "bg-[#131218] text-[#B2FF59]";
  if (stage === "Seed")    return "bg-blue-50 text-blue-700 border border-blue-200";
  if (stage === "Pre-seed") return "bg-purple-50 text-purple-700 border border-purple-200";
  if (stage === "Execution") return "bg-green-50 text-green-700 border border-green-200";
  if (stage === "Validation") return "bg-amber-50 text-amber-700 border border-amber-200";
  return "bg-[#EFEFEA] text-[#131218]/50 border border-[#E0E0D8]";
}

function readinessScore(p: { evidenceCount: number; validatedCount: number }): number {
  if (!p.evidenceCount) return 0;
  return Math.min(100, Math.round((p.validatedCount / p.evidenceCount) * 100));
}

export default async function DealFlowPage() {
  await requireAdmin();

  const [allProjects, decisions] = await Promise.all([
    getProjectsOverview(),
    getDecisionItems(),
  ]);

  // Deal flow = garage projects (startups at various stages)
  const garageProjects = allProjects.filter(p => p.primaryWorkspace === "garage");

  // Fundraising-related decisions — open
  const dealDecisions = decisions.filter(d => {
    const combined = `${d.title} ${d.decisionType} ${d.notes}`.toLowerCase();
    return (
      d.status !== "Approved" && d.status !== "Rejected" && d.status !== "Executed" &&
      (combined.includes("raise") || combined.includes("round") || combined.includes("valuation") ||
       combined.includes("investor") || combined.includes("term sheet") || combined.includes("cap table") ||
       combined.includes("dilut") || combined.includes("funding") || combined.includes("safe") ||
       combined.includes("convertible") || combined.includes("pitch"))
    );
  });

  // Group by stage for funnel
  const byFundingStage = garageProjects.reduce((acc, p) => {
    const s = p.stage || "Unknown";
    if (!acc[s]) acc[s] = [];
    acc[s].push(p);
    return acc;
  }, {} as Record<string, typeof garageProjects>);

  const withBlockers = garageProjects.filter(p => p.blockerCount > 0);
  const avgReadiness = garageProjects.length > 0
    ? Math.round(garageProjects.reduce((sum, p) => sum + readinessScore(p), 0) / garageProjects.length)
    : 0;

  return (
    <div className="flex min-h-screen bg-[#EFEFEA]">
      <Sidebar adminNav />

      <main className="flex-1 ml-[228px]">

        {/* Dark header */}
        <header className="bg-[#131218] px-12 pt-10 pb-11">
          <p className="text-[8px] font-bold tracking-[2.5px] uppercase text-white/20 mb-3">
            Commercial · Fundraising
          </p>
          <div className="flex items-end justify-between">
            <div>
              <h1 className="text-[2.6rem] font-light text-white tracking-[-1.5px] leading-none">
                Deal <em className="font-black not-italic text-[#B2FF59]">Flow</em>
              </h1>
              <p className="text-sm text-white/40 mt-3">
                Portfolio fundraising pipeline. Stage by stage, startup by startup.
              </p>
            </div>
            <div className="flex items-center gap-4 pb-1">
              <div className="text-right">
                <p className="text-[2rem] font-black text-white tracking-tight leading-none">{garageProjects.length}</p>
                <p className="text-[9px] font-bold tracking-[1.5px] uppercase text-white/30 mt-0.5">Startups</p>
              </div>
              <div className="w-px h-10 bg-white/10" />
              <div className="text-right">
                <p className="text-[2rem] font-black text-[#B2FF59] tracking-tight leading-none">{avgReadiness}%</p>
                <p className="text-[9px] font-bold tracking-[1.5px] uppercase text-white/30 mt-0.5">Avg ready</p>
              </div>
            </div>
          </div>
        </header>

        <div className="px-12 py-9 max-w-7xl space-y-6">

          {/* P1 blockers */}
          {withBlockers.length > 0 && (
            <div className="flex items-center gap-3 bg-red-50 border border-red-200 rounded-xl px-5 py-3.5">
              <span className="w-2 h-2 rounded-full bg-red-500 shrink-0 animate-pulse" />
              <p className="text-sm text-[#131218] flex-1 min-w-0">
                <strong>{withBlockers.length} startup{withBlockers.length !== 1 ? "s" : ""} blocked</strong>
                {" — "}{withBlockers.map(p => p.name).join(", ")}
              </p>
              <Link href="/admin/garage-view" className="text-[11px] font-bold text-red-600 shrink-0 hover:text-red-800 transition-colors whitespace-nowrap">
                Review →
              </Link>
            </div>
          )}

          {/* Funnel strip */}
          <div>
            <div className="flex items-center gap-3 mb-3">
              <p className="text-[9px] font-bold tracking-widest uppercase text-[#131218]/30">Funding funnel</p>
              <div className="flex-1 h-px bg-[#E0E0D8]" />
            </div>
            <div className="flex gap-3 flex-wrap">
              {[...FUNDING_STAGES, ...ALL_STAGES].filter(s => byFundingStage[s]?.length > 0).map(stage => (
                <div key={stage} className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold ${stageColor(stage)}`}>
                  <span>{byFundingStage[stage].length}</span>
                  <span className="opacity-60 text-[11px]">{stage}</span>
                </div>
              ))}
              {garageProjects.length === 0 && (
                <p className="text-sm text-[#131218]/25">No startups in pipeline</p>
              )}
            </div>
          </div>

          {/* Two-column: startup cards + deal decisions */}
          <div className="grid grid-cols-[1fr_340px] gap-6 items-start">

            {/* Startup cards */}
            <div>
              <div className="flex items-center gap-3 mb-3">
                <p className="text-[9px] font-bold tracking-widest uppercase text-[#131218]/30">Portfolio</p>
                <div className="flex-1 h-px bg-[#E0E0D8]" />
                <p className="text-[9px] font-bold text-[#131218]/25">{garageProjects.length}</p>
              </div>

              {garageProjects.length > 0 ? (
                <div className="flex flex-col gap-3">
                  {garageProjects.map(p => {
                    const score = readinessScore(p);
                    const days  = daysSince(p.lastUpdate);
                    return (
                      <Link
                        key={p.id}
                        href={`/admin/projects/${p.id}`}
                        className="group bg-white rounded-xl border border-[#E0E0D8] px-5 py-4 hover:border-[#131218]/25 hover:-translate-y-0.5 transition-all duration-200"
                      >
                        <div className="flex items-start justify-between gap-3 mb-3">
                          <div className="min-w-0 flex-1">
                            <p className="text-[13px] font-bold text-[#131218] truncate">{p.name}</p>
                            {p.geography.length > 0 && (
                              <p className="text-[10px] text-[#131218]/40 mt-0.5">{p.geography.slice(0, 2).join(" · ")}</p>
                            )}
                          </div>
                          {p.stage && (
                            <span className={`text-[8.5px] font-bold px-2 py-0.5 rounded-full shrink-0 ${stageColor(p.stage)}`}>
                              {p.stage}
                            </span>
                          )}
                        </div>

                        {/* Readiness bar */}
                        <div className="mb-3">
                          <div className="flex items-center justify-between mb-1">
                            <p className="text-[8px] font-bold tracking-wider uppercase text-[#131218]/25">Investor readiness</p>
                            <p className={`text-[10px] font-bold ${score >= 80 ? "text-green-600" : score >= 60 ? "text-amber-500" : "text-red-500"}`}>{score}%</p>
                          </div>
                          <div className="h-1 bg-[#EFEFEA] rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full ${score >= 80 ? "bg-[#B2FF59]" : score >= 60 ? "bg-amber-400" : score >= 40 ? "bg-orange-400" : "bg-red-400"}`}
                              style={{ width: `${score}%` }}
                            />
                          </div>
                        </div>

                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <span className="text-[9px] text-[#131218]/35">{p.validatedCount} validated · {p.sourcesCount} sources</span>
                            {p.blockerCount > 0 && (
                              <span className="text-[9px] font-bold text-red-500">↯ {p.blockerCount} blocker{p.blockerCount !== 1 ? "s" : ""}</span>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5">
                            <span className="text-[9px] text-[#131218]/25">
                              {days < 999 ? `${days}d ago` : "No update"}
                            </span>
                            <span className="text-[#131218]/20 group-hover:text-[#131218]/60 transition-colors">→</span>
                          </div>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              ) : (
                <div className="bg-white rounded-2xl border border-[#E0E0D8] p-10 text-center">
                  <p className="text-sm text-[#131218]/25">
                    No garage projects found. Assign <strong>Primary Workspace = garage</strong> in Notion.
                  </p>
                </div>
              )}
            </div>

            {/* Deal decisions */}
            <div>
              <div className="flex items-center gap-3 mb-3">
                <p className="text-[9px] font-bold tracking-widest uppercase text-[#131218]/30">Deal decisions</p>
                <div className="flex-1 h-px bg-[#E0E0D8]" />
                {dealDecisions.length > 0 && (
                  <span className="text-[9px] font-bold bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">{dealDecisions.length}</span>
                )}
              </div>

              <div className="bg-white rounded-2xl border border-[#E0E0D8] overflow-hidden">
                <div className="divide-y divide-[#EFEFEA]">
                  {dealDecisions.slice(0, 8).map(d => (
                    <Link key={d.id} href="/admin/decisions" className="flex items-start gap-3 px-4 py-3 hover:bg-[#EFEFEA]/40 transition-colors">
                      <div className={`w-5 h-5 rounded-md flex items-center justify-center shrink-0 mt-0.5 ${
                        d.priority === "P1" || d.priority === "P1 Critical" || d.priority === "Urgent"
                          ? "bg-red-100" : "bg-[#EFEFEA]"
                      }`}>
                        <span className={`text-[8px] font-bold ${
                          d.priority === "P1" || d.priority === "P1 Critical" || d.priority === "Urgent"
                            ? "text-red-600" : "text-[#131218]/30"
                        }`}>
                          {d.priority?.startsWith("P1") || d.priority === "Urgent" ? "P1" : "·"}
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
                  {dealDecisions.length === 0 && (
                    <div className="px-4 py-6 text-center">
                      <p className="text-[11px] text-[#131218]/25 font-medium">No open deal decisions</p>
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
