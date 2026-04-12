import { redirect } from "next/navigation";
import Link from "next/link";
import { Sidebar } from "@/components/Sidebar";
import { MetricCard } from "@/components/MetricCard";
import { StatusBadge } from "@/components/StatusBadge";
import { getAllEvidence, getAllSources, getAllProjects } from "@/lib/notion";
import { NAV } from "../page";
import { requireAdmin } from "@/lib/require-admin";

function daysSince(dateStr: string | null): number {
  if (!dateStr) return 999;
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
}

export default async function HealthPage() {
  await requireAdmin();

  const [allEvidence, sources, projects] = await Promise.all([
    getAllEvidence(),
    getAllSources(),
    getAllProjects(),
  ]);

  // Build project name lookup
  const projectNames: Record<string, string> = {};
  for (const p of projects) projectNames[p.id] = p.name;

  const newEvidence        = allEvidence.filter(e => e.validationStatus === "New");
  const reviewedEvidence   = allEvidence.filter(e => e.validationStatus === "Reviewed");
  const validatedEvidence  = allEvidence.filter(e => e.validationStatus === "Validated");
  const blockers           = allEvidence.filter(e => e.type === "Blocker" && e.validationStatus === "Validated");
  const evidenceWithExcerpt    = allEvidence.filter(e => e.excerpt && e.excerpt.trim().length > 0);
  const evidenceMissingExcerpt = allEvidence.filter(e => !e.excerpt || e.excerpt.trim().length === 0);

  const validationRate = allEvidence.length > 0
    ? Math.round((validatedEvidence.length / allEvidence.length) * 100)
    : 0;

  // Source pipeline breakdown
  const ingestedSources    = sources.filter(s => s.status === "Ingested");
  const processedSources   = sources.filter(s => s.status === "Processed");
  const needsReviewSources = sources.filter(s => s.status === "Needs Review");
  const unlinkedSources    = sources.filter(s => !s.projectId);

  // Evidence backlog per project (projects with pending evidence)
  const backlogByProject = projects
    .map(p => {
      const pending = allEvidence.filter(
        e => e.projectId === p.id && e.validationStatus === "New"
      ).length;
      return { ...p, pending };
    })
    .filter(p => p.pending > 0)
    .sort((a, b) => b.pending - a.pending);

  // Project health
  const updateNeededProjects = projects.filter(p => p.updateNeeded);
  const staleProjects        = projects.filter(p => daysSince(p.lastUpdate) > 30);

  // Missing excerpts intentionally excluded from overallHealthy — it is a content quality
  // metric (tracked separately on the health page) not an operational blocker. Including it
  // would permanently suppress "All clear" on any active system with large evidence volumes.
  const overallHealthy =
    newEvidence.length === 0 &&
    blockers.length === 0 &&
    updateNeededProjects.length === 0 &&
    needsReviewSources.length === 0;

  return (
    <div className="flex min-h-screen bg-[#EFEFEA]">
      <Sidebar items={NAV} isAdmin />

      <main className="flex-1 overflow-auto">
        {/* Header */}
        <div className="bg-white border-b border-[#E0E0D8] px-8 py-6">
          <div className="flex items-end justify-between">
            <div>
              <p className="text-[10px] font-bold text-[#B2FF59] bg-[#131218] px-2.5 py-1 rounded-full uppercase tracking-widest inline-block mb-3">
                Internal
              </p>
              <h1 className="text-3xl font-bold text-[#131218] tracking-tight">System Health</h1>
              <p className="text-sm text-[#131218]/40 mt-1">Live signals from the OS engine · Hygiene and backlog status</p>
            </div>
            <div className="text-right pb-1">
              {overallHealthy ? (
                <p className="text-xs text-[#131218]/30 font-medium">All signals healthy ✓</p>
              ) : (
                <p className="text-sm font-bold text-amber-500">Attention needed</p>
              )}
            </div>
          </div>
        </div>

        <div className="px-8 py-6 space-y-6">

          {/* Intervention summary — what needs action right now */}
          {overallHealthy ? (
            <div className="bg-[#131218] rounded-2xl px-6 py-5 flex items-center gap-4">
              <span className="w-2 h-2 rounded-full bg-[#B2FF59] shrink-0" />
              <div>
                <p className="text-sm font-bold text-white tracking-tight">All clear — no intervention needed</p>
                <p className="text-xs text-white/30 font-medium mt-0.5">Evidence is clean, blockers are resolved, sources are linked.</p>
              </div>
            </div>
          ) : (
            <div className="bg-[#131218] rounded-2xl overflow-hidden">
              <div className="px-6 py-4 border-b border-white/8 flex items-center justify-between">
                <p className="text-[10px] font-bold text-white/30 uppercase tracking-widest">Intervention Needed</p>
                <span className="text-[10px] font-bold bg-red-500 text-white px-2.5 py-1 rounded-full uppercase tracking-widest">
                  {[
                    blockers.length > 0 && "blockers",
                    newEvidence.length > 0 && "pending evidence",
                    updateNeededProjects.length > 0 && "updates needed",
                    needsReviewSources.length > 0 && "source exceptions",
                  ].filter(Boolean).length} signals
                </span>
              </div>
              <div className="divide-y divide-white/5">
                {blockers.length > 0 && (
                  <div className="px-6 py-3 flex items-center gap-3">
                    <span className="w-1.5 h-1.5 rounded-full bg-red-400 shrink-0" />
                    <p className="text-sm text-white/80 font-semibold flex-1">
                      {blockers.length} active blocker{blockers.length !== 1 ? "s" : ""}
                    </p>
                    <p className="text-[10px] text-red-400 font-bold uppercase tracking-widest">Act now</p>
                  </div>
                )}
                {needsReviewSources.length > 0 && (
                  <div className="px-6 py-3 flex items-center gap-3">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
                    <p className="text-sm text-white/80 font-semibold flex-1">
                      {needsReviewSources.length} source{needsReviewSources.length !== 1 ? "s" : ""} need review
                    </p>
                    <Link href="/admin/os" className="text-[10px] text-amber-400 font-bold uppercase tracking-widest hover:text-amber-300 transition-colors">
                      Go to Intake →
                    </Link>
                  </div>
                )}
                {newEvidence.length > 0 && (
                  <div className="px-6 py-3 flex items-center gap-3">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
                    <p className="text-sm text-white/80 font-semibold flex-1">
                      {newEvidence.length} evidence item{newEvidence.length !== 1 ? "s" : ""} pending validation
                    </p>
                    <Link href="/admin/os" className="text-[10px] text-amber-400 font-bold uppercase tracking-widest hover:text-amber-300 transition-colors">
                      Go to Intake →
                    </Link>
                  </div>
                )}
                {updateNeededProjects.length > 0 && (
                  <div className="px-6 py-3 flex items-center gap-3">
                    <span className="w-1.5 h-1.5 rounded-full bg-white/20 shrink-0" />
                    <p className="text-sm text-white/80 font-semibold flex-1">
                      {updateNeededProjects.length} project{updateNeededProjects.length !== 1 ? "s" : ""} need a status update
                    </p>
                    <p className="text-[10px] text-white/25 font-bold uppercase tracking-widest">This week</p>
                  </div>
                )}
                {staleProjects.filter(p => !p.updateNeeded).length > 0 && (
                  <div className="px-6 py-3 flex items-center gap-3">
                    <span className="w-1.5 h-1.5 rounded-full bg-white/10 shrink-0" />
                    <p className="text-sm text-white/50 font-semibold flex-1">
                      {staleProjects.filter(p => !p.updateNeeded).length} project{staleProjects.filter(p => !p.updateNeeded).length !== 1 ? "s" : ""} stale (30d+)
                    </p>
                    <p className="text-[10px] text-white/20 font-bold uppercase tracking-widest">Watch</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Core health metrics */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <MetricCard label="Pending Evidence"   value={newEvidence.length}            color={newEvidence.length > 0 ? "yellow" : "green"} sub={reviewedEvidence.length > 0 ? `+${reviewedEvidence.length} reviewed` : undefined} />
            <MetricCard label="Active Blockers"    value={blockers.length}               color={blockers.length > 0 ? "red" : "green"} />
            <MetricCard label="Validation Rate"    value={`${validationRate}%`}          color={validationRate >= 80 ? "green" : "yellow"} />
            <MetricCard label="Ingested (pending)" value={ingestedSources.length}        color={ingestedSources.length > 0 ? "yellow" : "green"} sub={`${processedSources.length} processed`} />
          </div>

          {/* Evidence hygiene */}
          <div className="grid grid-cols-2 gap-4">

            {/* Missing excerpts */}
            <div className="bg-white rounded-2xl border border-[#E0E0D8] overflow-hidden">
              <div className={`h-1 ${evidenceMissingExcerpt.length > 0 ? "bg-amber-400" : "bg-[#B2FF59]"}`} />
              <div className="px-6 py-4 border-b border-[#EFEFEA] flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-bold text-[#131218] tracking-tight">Missing Excerpts</h2>
                  <p className="text-xs text-[#131218]/40 mt-0.5">Evidence records with no excerpt text</p>
                </div>
                <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full uppercase tracking-widest ${
                  evidenceMissingExcerpt.length > 0
                    ? "bg-amber-100 text-amber-700"
                    : "bg-[#EFEFEA] text-[#131218]/30"
                }`}>
                  {evidenceMissingExcerpt.length} missing
                </span>
              </div>
              <div className="px-6 py-4">
                <div className="flex items-center gap-4">
                  <div>
                    <p className="text-2xl font-bold text-[#131218]">{evidenceMissingExcerpt.length}</p>
                    <p className="text-[10px] font-bold text-[#131218]/30 uppercase tracking-widest mt-0.5">Without excerpt</p>
                  </div>
                  <div className="text-[#131218]/20 text-lg">·</div>
                  <div>
                    <p className="text-2xl font-bold text-[#131218]">{evidenceWithExcerpt.length}</p>
                    <p className="text-[10px] font-bold text-[#131218]/30 uppercase tracking-widest mt-0.5">With excerpt</p>
                  </div>
                  <div className="flex-1">
                    <div className="h-2 bg-[#EFEFEA] rounded-full overflow-hidden">
                      <div
                        className="h-full bg-[#B2FF59] rounded-full"
                        style={{ width: allEvidence.length > 0 ? `${Math.round((evidenceWithExcerpt.length / allEvidence.length) * 100)}%` : "0%" }}
                      />
                    </div>
                    <p className="text-[9px] font-bold text-[#131218]/25 uppercase tracking-widest mt-1">
                      {allEvidence.length > 0 ? Math.round((evidenceWithExcerpt.length / allEvidence.length) * 100) : 0}% coverage
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Validation backlog */}
            <div className="bg-white rounded-2xl border border-[#E0E0D8] overflow-hidden">
              <div className={`h-1 ${newEvidence.length > 0 ? "bg-amber-400" : "bg-[#B2FF59]"}`} />
              <div className="px-6 py-4 border-b border-[#EFEFEA] flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-bold text-[#131218] tracking-tight">Validation Backlog</h2>
                  <p className="text-xs text-[#131218]/40 mt-0.5">Evidence awaiting review or validation</p>
                </div>
                <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full uppercase tracking-widest ${
                  newEvidence.length > 0
                    ? "bg-amber-100 text-amber-700"
                    : "bg-[#EFEFEA] text-[#131218]/30"
                }`}>
                  {newEvidence.length} pending
                </span>
              </div>
              <div className="px-6 py-4">
                <div className="flex items-center gap-4">
                  <div>
                    <p className="text-2xl font-bold text-[#131218]">{newEvidence.length}</p>
                    <p className="text-[10px] font-bold text-[#131218]/30 uppercase tracking-widest mt-0.5">New</p>
                  </div>
                  <div className="text-[#131218]/20 text-lg">·</div>
                  <div>
                    <p className="text-2xl font-bold text-[#131218]">{validatedEvidence.length}</p>
                    <p className="text-[10px] font-bold text-[#131218]/30 uppercase tracking-widest mt-0.5">Validated</p>
                  </div>
                  <div className="flex-1">
                    <div className="h-2 bg-[#EFEFEA] rounded-full overflow-hidden">
                      <div
                        className="h-full bg-[#B2FF59] rounded-full"
                        style={{ width: `${validationRate}%` }}
                      />
                    </div>
                    <p className="text-[9px] font-bold text-[#131218]/25 uppercase tracking-widest mt-1">
                      {validationRate}% validated
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Backlog by project */}
          {backlogByProject.length > 0 && (
            <div className="bg-white rounded-2xl border border-[#E0E0D8] overflow-hidden">
              <div className="h-1 bg-amber-400" />
              <div className="px-6 py-4 border-b border-[#EFEFEA] flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-bold text-[#131218] tracking-tight">Pending by Project</h2>
                  <p className="text-xs text-[#131218]/40 mt-0.5">Projects with unreviewed evidence in the queue</p>
                </div>
                <span className="text-[10px] font-bold bg-amber-100 text-amber-700 px-2.5 py-1 rounded-full uppercase tracking-widest">
                  {backlogByProject.length} project{backlogByProject.length !== 1 ? "s" : ""}
                </span>
              </div>
              <div className="divide-y divide-[#EFEFEA]">
                {backlogByProject.map(p => (
                  <Link
                    key={p.id}
                    href={`/admin/projects/${p.id}`}
                    className="flex items-center gap-4 px-6 py-3 hover:bg-[#EFEFEA]/50 transition-colors group"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-[#131218] text-sm truncate">{p.name}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <StatusBadge value={p.stage} />
                      </div>
                    </div>
                    <span className="text-[10px] font-bold bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full uppercase tracking-widest shrink-0">
                      {p.pending} pending
                    </span>
                    <span className="text-[#131218]/20 group-hover:text-[#131218]/60 transition-colors text-sm shrink-0">→</span>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* Active blockers */}
          {blockers.length > 0 && (
            <div className="bg-white rounded-2xl border border-red-200 overflow-hidden">
              <div className="h-1 bg-red-400" />
              <div className="px-6 py-4 border-b border-[#EFEFEA] flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-bold text-[#131218] tracking-tight">Active Blockers</h2>
                  <p className="text-xs text-[#131218]/40 mt-0.5">Validated blockers across all projects</p>
                </div>
                <span className="text-[10px] font-bold bg-red-100 text-red-600 px-2.5 py-1 rounded-full uppercase tracking-widest">
                  {blockers.length} blocker{blockers.length !== 1 ? "s" : ""}
                </span>
              </div>
              <div className="divide-y divide-[#EFEFEA]">
                {blockers.map(e => (
                  <div key={e.id} className="px-6 py-3 flex items-start gap-3">
                    <span className="w-1.5 h-1.5 rounded-full bg-red-400 shrink-0 mt-1.5" />
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-[#131218] text-sm">{e.title}</p>
                      {e.projectId && (
                        <Link
                          href={`/admin/projects/${e.projectId}`}
                          className="text-xs text-[#131218]/40 hover:text-[#131218]/70 font-medium mt-0.5 inline-block transition-colors"
                        >
                          {projectNames[e.projectId] ?? "—"} →
                        </Link>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Project health */}
          {(updateNeededProjects.length > 0 || staleProjects.length > 0) && (
            <div className="bg-white rounded-2xl border border-[#E0E0D8] overflow-hidden">
              <div className="h-1 bg-amber-400" />
              <div className="px-6 py-4 border-b border-[#EFEFEA] flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-bold text-[#131218] tracking-tight">Project Status</h2>
                  <p className="text-xs text-[#131218]/40 mt-0.5">Projects needing a status update or showing no recent activity</p>
                </div>
                <div className="flex items-center gap-2">
                  {updateNeededProjects.length > 0 && (
                    <span className="text-[10px] font-bold bg-amber-100 text-amber-700 px-2.5 py-1 rounded-full uppercase tracking-widest">
                      {updateNeededProjects.length} update needed
                    </span>
                  )}
                  {staleProjects.length > 0 && (
                    <span className="text-[10px] font-bold bg-red-50 text-red-500 border border-red-200 px-2.5 py-1 rounded-full uppercase tracking-widest">
                      {staleProjects.length} stale
                    </span>
                  )}
                </div>
              </div>
              <div className="divide-y divide-[#EFEFEA]">
                {updateNeededProjects.map(p => (
                  <Link key={`upd-${p.id}`} href={`/admin/projects/${p.id}`}
                    className="flex items-center gap-3 px-6 py-3 hover:bg-[#EFEFEA]/50 transition-colors group">
                    <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-[#131218] text-sm truncate">{p.name}</p>
                      <p className="text-[10px] text-amber-500 font-bold uppercase tracking-widest mt-0.5">
                        Update needed · {daysSince(p.lastUpdate) < 999 ? `${daysSince(p.lastUpdate)}d ago` : "unknown"}
                      </p>
                    </div>
                    <StatusBadge value={p.stage} />
                    <span className="text-[#131218]/20 group-hover:text-[#131218]/60 transition-colors text-sm shrink-0">→</span>
                  </Link>
                ))}
                {staleProjects.filter(p => !p.updateNeeded).map(p => (
                  <Link key={`stale-${p.id}`} href={`/admin/projects/${p.id}`}
                    className="flex items-center gap-3 px-6 py-3 hover:bg-[#EFEFEA]/50 transition-colors group">
                    <span className="w-2 h-2 rounded-full bg-red-400 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-[#131218] text-sm truncate">{p.name}</p>
                      <p className="text-[10px] text-red-400 font-bold uppercase tracking-widest mt-0.5">
                        Stale · {daysSince(p.lastUpdate)}d since last update
                      </p>
                    </div>
                    <StatusBadge value={p.stage} />
                    <span className="text-[#131218]/20 group-hover:text-[#131218]/60 transition-colors text-sm shrink-0">→</span>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* Source exceptions */}
          {(needsReviewSources.length > 0 || unlinkedSources.length > 0) && (
            <div className="bg-white rounded-2xl border border-[#E0E0D8] overflow-hidden">
              <div className="h-1 bg-amber-400" />
              <div className="px-6 py-4 border-b border-[#EFEFEA]">
                <h2 className="text-sm font-bold text-[#131218] tracking-tight">Source Exceptions</h2>
                <p className="text-xs text-[#131218]/40 mt-0.5">Sources blocked or unlinked — require manual triage</p>
              </div>
              <div className="divide-y divide-[#EFEFEA]">
                {needsReviewSources.map(s => (
                  <div key={s.id} className="px-6 py-3 flex items-center gap-3">
                    <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-[#131218] text-sm truncate">{s.title}</p>
                      <p className="text-[10px] text-amber-500 font-bold uppercase tracking-widest mt-0.5">
                        Needs Review · {s.sourceType}
                      </p>
                    </div>
                    <StatusBadge value={s.status} />
                  </div>
                ))}
                {unlinkedSources.slice(0, 5).map(s => (
                  <div key={`unlinked-${s.id}`} className="px-6 py-3 flex items-center gap-3">
                    <span className="w-2 h-2 rounded-full bg-gray-300 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-[#131218] text-sm truncate">{s.title}</p>
                      <p className="text-[10px] text-[#131218]/30 font-bold uppercase tracking-widest mt-0.5">
                        Unlinked · {s.sourceType}
                      </p>
                    </div>
                    <StatusBadge value={s.status} />
                  </div>
                ))}
                {unlinkedSources.length > 5 && (
                  <div className="px-6 py-3 text-center">
                    <p className="text-[10px] text-[#131218]/30 font-bold uppercase tracking-widest">
                      +{unlinkedSources.length - 5} more unlinked sources
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

        </div>
      </main>
    </div>
  );
}
