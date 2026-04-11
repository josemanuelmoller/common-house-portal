/**
 * Control Room — Internal staff layer.
 *
 * This is not a Room (Hall / Workroom / Garage). It is the Control Room:
 * the internal operating layer for the Common House team.
 *
 * Control Room surfaces mapped here:
 *   PMO / Delivery  → /admin          (this page) — project health, source activity
 *   Intake          → /admin/os       — unprocessed sources, evidence queue
 *   Knowledge       → /admin/knowledge — knowledge assets review
 *   System Health   → /admin/health   — OS hygiene, validation stats (stub)
 *
 * Clients never enter /admin. All /admin routes are gated by isAdminUser().
 * See src/types/house.ts for the full House architecture documentation.
 */

import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Sidebar } from "@/components/Sidebar";
import { StatusBadge } from "@/components/StatusBadge";
import { ProjectAvatar } from "@/components/ProjectAvatar";
import { ProjectsMap } from "@/components/ProjectsMap";
import { getProjectsOverview, getAllSources } from "@/lib/notion";
import { isAdminUser } from "@/lib/clients";

function CHIsotipo({ size = 28, className }: { size?: number; className?: string }) {
  return (
    <svg width={size * 2} height={size} viewBox="0 0 120 60" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      <path d="M46 8 C26 8 12 18 12 30 C12 42 26 52 46 52" stroke="currentColor" strokeWidth="9" strokeLinecap="round" />
      <circle cx="85" cy="30" r="20" stroke="currentColor" strokeWidth="9" />
    </svg>
  );
}

function sourceIcon(type: string): string {
  if (type.includes("Email") || type.includes("Gmail")) return "✉";
  if (type.includes("Meeting") || type.includes("Fireflies")) return "◷";
  return "▤";
}

function daysSince(dateStr: string | null): number {
  if (!dateStr) return 999;
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
}

function staleColor(days: number): string {
  if (days > 30) return "text-red-500";
  if (days > 14) return "text-amber-500";
  return "text-[#131218]/35";
}

function staleDotColor(days: number): string {
  if (days > 30) return "bg-red-400";
  if (days > 14) return "bg-amber-400";
  return "bg-[#131218]/15";
}

const STAGE_COLORS: Record<string, string> = {
  "Discovery":  "bg-blue-50 text-blue-600 border border-blue-200",
  "Validation": "bg-amber-50 text-amber-600 border border-amber-200",
  "Execution":  "bg-[#131218] text-[#B2FF59]",
  "Completion": "bg-[#B2FF59] text-[#131218]",
  "On Hold":    "bg-gray-100 text-gray-400 border border-gray-200",
  "Paused":     "bg-gray-100 text-gray-400 border border-gray-200",
};

export const NAV = [
  { label: "PMO / Delivery",       href: "/admin",            icon: "◈" },
  { label: "Intake / Exceptions",  href: "/admin/os",         icon: "⬡" },
  { label: "Knowledge Assets",     href: "/admin/knowledge",  icon: "◉" },
  { label: "System Health",        href: "/admin/health",     icon: "◎" },
];

export default async function AdminPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");
  if (!isAdminUser(userId)) redirect("/hall");

  const [projects, allSources] = await Promise.all([
    getProjectsOverview(),
    getAllSources(),
  ]);

  const totalEvidence  = projects.reduce((s, p) => s + p.evidenceCount, 0);
  const totalValidated = projects.reduce((s, p) => s + p.validatedCount, 0);
  const totalSources   = projects.reduce((s, p) => s + p.sourcesCount, 0);
  const totalBlockers  = projects.reduce((s, p) => s + p.blockerCount, 0);
  const totalEmails    = projects.reduce((s, p) => s + p.emailCount, 0);
  const totalMeetings  = projects.reduce((s, p) => s + p.meetingCount, 0);
  const totalDocs      = projects.reduce((s, p) => s + p.documentCount, 0);
  const validationRate = totalEvidence > 0
    ? Math.round((totalValidated / totalEvidence) * 100)
    : 0;

  const totalDecisions    = projects.reduce((s, p) => s + p.decisionCount, 0);
  const totalDependencies = projects.reduce((s, p) => s + p.dependencyCount, 0);
  const totalOutcomes     = projects.reduce((s, p) => s + p.outcomeCount, 0);
  const totalNewEvidence  = projects.reduce((s, p) => s + p.newEvidenceCount, 0);
  const totalReusable     = projects.reduce((s, p) => s + p.reusableCount, 0);

  const needsUpdate  = projects.filter(p => p.updateNeeded);
  const withBlockers = projects.filter(p => p.blockerCount > 0);
  // Stale = no update in >30 days AND updateNeeded flag not already set (avoids double-counting)
  const staleProjects = projects.filter(p => !p.updateNeeded && daysSince(p.lastUpdate) > 30);

  // Stage distribution
  const stageCounts = projects.reduce((acc, p) => {
    const s = p.stage || "Unknown";
    acc[s] = (acc[s] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  const stageEntries = Object.entries(stageCounts).sort((a, b) => b[1] - a[1]);

  // Recent sources (last 8 across all projects, with project name)
  const projectById = Object.fromEntries(projects.map(p => [p.id, p.name]));
  const recentActivity = allSources.slice(0, 8).map(s => ({
    ...s,
    projectName: (s.projectId && projectById[s.projectId]) || "—",
  }));

  return (
    <div className="flex min-h-screen bg-[#EFEFEA]">
      <Sidebar items={NAV} isAdmin />

      <main className="flex-1 overflow-auto">

        {/* Header */}
        <div className="bg-white border-b border-[#E0E0D8] px-8 py-6">
          <div className="flex items-end justify-between mb-6">
            <div>
              <div className="flex items-center gap-3 mb-3">
                <CHIsotipo size={16} className="text-[#131218]" />
                <p className="text-[10px] font-bold text-[#131218]/25 uppercase tracking-widest">
                  Control Room · House View
                </p>
                <span className="text-[#131218]/15">·</span>
                <p className="text-[10px] font-bold text-[#B2FF59] bg-[#131218] px-2.5 py-1 rounded-full uppercase tracking-widest">
                  PMO / Delivery
                </p>
              </div>
              <h1 className="text-3xl font-bold text-[#131218] tracking-tight">Portfolio</h1>
            </div>
            <p className="text-xs text-[#131218]/30 font-medium pb-1">
              {new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
            </p>
          </div>

          {/* Global stats row */}
          <div className="grid grid-cols-6 gap-px bg-[#E0E0D8] rounded-2xl overflow-hidden">
            <div className="bg-white px-5 py-4">
              <p className="text-2xl font-bold tracking-tight text-[#131218]">{projects.length}</p>
              <p className="text-[10px] font-bold text-[#131218]/30 uppercase tracking-widest mt-1">Active</p>
            </div>
            <div className="bg-white px-5 py-4">
              {withBlockers.length > 0 ? (
                <p className="text-2xl font-bold tracking-tight text-red-500">{withBlockers.length}</p>
              ) : (
                <p className="text-2xl font-bold tracking-tight text-[#131218]/20">0</p>
              )}
              <p className="text-[10px] font-bold text-[#131218]/30 uppercase tracking-widest mt-1">Blocked</p>
            </div>
            <div className="bg-white px-5 py-4">
              {needsUpdate.length > 0 ? (
                <p className="text-2xl font-bold tracking-tight text-amber-500">{needsUpdate.length}</p>
              ) : (
                <p className="text-2xl font-bold tracking-tight text-[#131218]/20">0</p>
              )}
              <p className="text-[10px] font-bold text-[#131218]/30 uppercase tracking-widest mt-1">Update needed</p>
              {staleProjects.length > 0 && (
                <p className="text-[9px] text-red-400 font-bold mt-1.5">{staleProjects.length} stale (&gt;30d)</p>
              )}
            </div>
            <div className="bg-white px-5 py-4">
              <p className="text-2xl font-bold tracking-tight text-[#131218]">{totalSources}</p>
              <p className="text-[10px] font-bold text-[#131218]/30 uppercase tracking-widest mt-1">Sources</p>
              <p className="text-[10px] text-[#131218]/30 font-medium mt-1.5 space-x-1">
                <span>✉ {totalEmails}</span>
                <span>· ◎ {totalMeetings}</span>
                <span>· ▤ {totalDocs}</span>
              </p>
            </div>
            <div className="bg-white px-5 py-4">
              <div className="flex items-start gap-2">
                <p className="text-2xl font-bold tracking-tight text-[#131218]">{totalEvidence}</p>
                {totalNewEvidence > 0 && (
                  <span className="text-[9px] font-bold text-amber-600 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded-full mt-1 whitespace-nowrap">
                    {totalNewEvidence} pending
                  </span>
                )}
              </div>
              <p className="text-[10px] font-bold text-[#131218]/30 uppercase tracking-widest mt-1">Evidence</p>
            </div>
            <div className="bg-white px-5 py-4">
              <p className="text-2xl font-bold tracking-tight text-[#B2FF59] bg-[#131218] w-fit px-2 rounded-lg">{validationRate}%</p>
              <p className="text-[10px] font-bold text-[#131218]/30 uppercase tracking-widest mt-1">Val. Rate</p>
            </div>
          </div>

          {/* Stage distribution strip */}
          {stageEntries.length > 0 && (
            <div className="flex items-center gap-2 mt-4 flex-wrap">
              <p className="text-[9px] font-bold text-[#131218]/25 uppercase tracking-widest mr-1">Stage</p>
              {stageEntries.map(([stage, count]) => (
                <span
                  key={stage}
                  className={`text-[10px] font-bold px-2.5 py-1 rounded-full ${STAGE_COLORS[stage] ?? "bg-[#EFEFEA] text-[#131218]/50"}`}
                >
                  {stage} {count}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Map + Attention panel */}
        <div className="px-8 pt-6">
          <div className="grid grid-cols-2 gap-6 items-start">
            <ProjectsMap projects={projects.map(p => ({ id: p.id, name: p.name, geography: p.geography }))} />

            {/* Portfolio Pulse */}
            <div className="bg-white rounded-2xl border border-[#E0E0D8] overflow-hidden flex flex-col" style={{ height: 380 }}>
              <div className="h-1 bg-[#131218]" />
              <div className="px-6 py-4 border-b border-[#EFEFEA] flex items-center justify-between">
                <div>
                  <p className="text-[10px] font-bold text-[#131218]/30 uppercase tracking-widest">Attention Queue</p>
                  <p className="text-sm font-bold text-[#131218] tracking-tight mt-0.5">Blockers &amp; Updates</p>
                </div>
                {(withBlockers.length + needsUpdate.length) > 0 && (
                  <span className="text-[10px] font-bold bg-amber-100 text-amber-700 px-2.5 py-1 rounded-full uppercase tracking-widest">
                    {withBlockers.length + needsUpdate.length} items
                  </span>
                )}
              </div>

              {/* Attention items + recent sources — scrollable */}
              <div className="flex-1 overflow-y-auto divide-y divide-[#EFEFEA]">
                {needsUpdate.length === 0 && withBlockers.length === 0 && (
                  <div className="px-6 py-4 text-center">
                    <p className="text-xs text-[#131218]/25 font-medium">All projects up to date</p>
                  </div>
                )}
                {withBlockers.map(p => (
                  <div key={`blocker-${p.id}`} className="px-6 py-2.5 flex items-center gap-3">
                    <span className="w-2 h-2 rounded-full bg-red-500 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-[#131218] truncate">{p.name}</p>
                      <p className="text-[10px] text-red-500 font-bold uppercase tracking-widest mt-0.5">
                        {p.blockerCount} blocker{p.blockerCount > 1 ? "s" : ""}
                      </p>
                    </div>
                  </div>
                ))}
                {needsUpdate.map(p => {
                  const days = daysSince(p.lastUpdate);
                  return (
                    <div key={`update-${p.id}`} className="px-6 py-2.5 flex items-center gap-3">
                      <span className={`w-2 h-2 rounded-full shrink-0 ${staleDotColor(days)}`} />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-[#131218] truncate">{p.name}</p>
                        <p className="text-[10px] text-amber-500 font-bold uppercase tracking-widest mt-0.5">Update needed</p>
                      </div>
                      {p.lastUpdate && (
                        <div className="text-right shrink-0">
                          <p className="text-[10px] text-[#131218]/25 font-medium">
                            {new Date(p.lastUpdate).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                          </p>
                          <p className={`text-[9px] font-bold ${days > 30 ? "text-red-400" : "text-amber-400"}`}>
                            {days < 999 ? `${days}d ago` : ""}
                          </p>
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* Recent sources — inside scroll area */}
                {recentActivity.length > 0 && (
                  <>
                    <div className="px-6 py-2 bg-[#EFEFEA]/40 border-b border-[#EFEFEA]">
                      <p className="text-[9px] font-bold text-[#131218]/30 uppercase tracking-widest">Recent Sources</p>
                    </div>
                    {recentActivity.map(s => (
                      <div key={s.id} className="px-6 py-2.5 flex items-center gap-2.5">
                        <span className="text-[11px] text-[#131218]/30 shrink-0 w-4">{sourceIcon(s.sourceType)}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-[#131218] truncate">{s.title}</p>
                          <p className="text-[10px] text-[#131218]/30 font-medium truncate">{s.projectName}</p>
                        </div>
                        {s.dateIngested && (
                          <p className="text-[10px] text-[#131218]/25 font-medium shrink-0">
                            {new Date(s.dateIngested).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                          </p>
                        )}
                      </div>
                    ))}
                  </>
                )}
              </div>

              {/* Footer: source type counts */}
              <div className="mt-auto px-6 py-3 border-t border-[#EFEFEA] grid grid-cols-3 gap-2">
                <div className="text-center">
                  <p className="text-lg font-bold text-[#131218]">{totalEmails}</p>
                  <p className="text-[9px] font-bold text-[#131218]/25 uppercase tracking-widest">Emails</p>
                </div>
                <div className="text-center">
                  <p className="text-lg font-bold text-[#131218]">{totalMeetings}</p>
                  <p className="text-[9px] font-bold text-[#131218]/25 uppercase tracking-widest">Meetings</p>
                </div>
                <div className="text-center">
                  <p className="text-lg font-bold text-[#131218]">{totalDocs}</p>
                  <p className="text-[9px] font-bold text-[#131218]/25 uppercase tracking-widest">Docs</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Evidence breakdown */}
        <div className="px-8 pt-6">
          <div className="grid grid-cols-4 gap-4">
            {[
              { label: "Decisions",     value: totalDecisions,    bar: "bg-[#B2FF59]", icon: "✓", iconCls: "bg-[#131218] text-[#B2FF59]" },
              { label: "Dependencies",  value: totalDependencies, bar: "bg-amber-400",  icon: "⊡", iconCls: "bg-amber-50 text-amber-500"  },
              { label: "Outcomes",      value: totalOutcomes,     bar: "bg-[#B2FF59]", icon: "↗", iconCls: "bg-[#131218] text-[#B2FF59]" },
              { label: "Reusable",      value: totalReusable,     bar: "bg-[#131218]", icon: "◈", iconCls: "bg-[#131218] text-[#B2FF59]" },
            ].map(card => (
              <div key={card.label} className="bg-white rounded-2xl border border-[#E0E0D8] overflow-hidden">
                <div className={`h-1 ${card.bar}`} />
                <div className="px-5 py-4 flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 text-sm font-bold ${card.iconCls}`}>
                    {card.icon}
                  </div>
                  <div>
                    <p className="text-xl font-bold text-[#131218] tracking-tight">{card.value}</p>
                    <p className="text-[10px] font-bold text-[#131218]/30 uppercase tracking-widest">{card.label}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Projects list */}
        <div className="px-8 py-6">
          <div className="bg-white rounded-2xl border border-[#E0E0D8] overflow-hidden">

            {/* Table header */}
            <div className="h-1 bg-[#131218]" />
            <div className="px-6 py-3 border-b border-[#EFEFEA]">
              <p className="text-[10px] font-bold text-[#131218]/30 uppercase tracking-widest">Project roster</p>
            </div>
            <div className="grid grid-cols-[2fr_1fr_1fr_1fr_80px_80px_80px_80px_120px_40px] gap-0 border-b border-[#EFEFEA] px-4 py-3">
              {["Project", "Status", "Stage", "Geography", "Sources", "Evidence", "Validated", "Blockers", "Last update", ""].map(h => (
                <div key={h} className="px-2 text-[10px] font-bold text-[#131218]/25 uppercase tracking-widest">
                  {h}
                </div>
              ))}
            </div>

            {/* Project rows */}
            <div className="divide-y divide-[#EFEFEA]">
              {projects.map(p => (
                <Link
                  key={p.id}
                  href={`/admin/projects/${p.id}`}
                  className="grid grid-cols-[2fr_1fr_1fr_1fr_80px_80px_80px_80px_120px_40px] gap-0 px-4 py-3.5 hover:bg-[#EFEFEA]/50 transition-colors group items-center"
                >
                  {/* Project name + avatar */}
                  <div className="px-2 flex items-center gap-3 min-w-0">
                    <ProjectAvatar name={p.name} size="sm" />
                    <div className="min-w-0">
                      <p className="font-semibold text-[#131218] text-sm tracking-tight truncate">
                        {p.name}
                      </p>
                      {p.themes.length > 0 && (
                        <p className="text-[10px] text-[#131218]/30 font-medium truncate mt-0.5">
                          {p.themes.slice(0, 2).join(" · ")}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Status */}
                  <div className="px-2">
                    <StatusBadge value={p.status} />
                  </div>

                  {/* Stage */}
                  <div className="px-2">
                    <StatusBadge value={p.stage} />
                  </div>

                  {/* Geography */}
                  <div className="px-2">
                    <span className="text-xs text-[#131218]/40 font-medium">
                      {p.geography.join(", ") || "—"}
                    </span>
                  </div>

                  {/* Sources */}
                  <div className="px-2 text-center">
                    <span className="text-sm font-bold text-[#131218]">{p.sourcesCount}</span>
                  </div>

                  {/* Evidence */}
                  <div className="px-2 text-center">
                    <span className="text-sm font-bold text-[#131218]">{p.evidenceCount}</span>
                  </div>

                  {/* Validated */}
                  <div className="px-2 text-center">
                    {p.validatedCount > 0 ? (
                      <span className="inline-block bg-[#B2FF59] text-[#131218] text-xs font-bold px-2 py-0.5 rounded-full">
                        {p.validatedCount}
                      </span>
                    ) : (
                      <span className="text-[#131218]/20 text-sm">—</span>
                    )}
                  </div>

                  {/* Blockers */}
                  <div className="px-2 text-center">
                    {p.blockerCount > 0 ? (
                      <span className="inline-block bg-red-100 text-red-600 text-xs font-bold px-2 py-0.5 rounded-full">
                        {p.blockerCount}
                      </span>
                    ) : (
                      <span className="text-[#131218]/15 text-sm">—</span>
                    )}
                  </div>

                  {/* Last update */}
                  <div className="px-2">
                    {p.lastUpdate ? (
                      <>
                        <span className={`text-xs font-medium ${staleColor(daysSince(p.lastUpdate))}`}>
                          {new Date(p.lastUpdate).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                        </span>
                        <p className={`text-[9px] font-medium mt-0.5 ${
                          daysSince(p.lastUpdate) > 14 ? staleColor(daysSince(p.lastUpdate)) : "text-[#131218]/20"
                        }`}>
                          {daysSince(p.lastUpdate) < 999 ? `${daysSince(p.lastUpdate)}d ago` : ""}
                        </p>
                      </>
                    ) : (
                      <span className="text-[#131218]/15 text-sm">—</span>
                    )}
                    {p.updateNeeded && (
                      <span className="block text-[9px] font-bold text-amber-500 mt-0.5">⚠ Update needed</span>
                    )}
                  </div>

                  {/* Arrow */}
                  <div className="px-2 text-right">
                    <span className="text-[#131218]/20 group-hover:text-[#131218]/60 transition-colors text-sm">→</span>
                  </div>
                </Link>
              ))}
            </div>

            {/* Footer */}
            <div className="px-6 py-3 border-t border-[#EFEFEA] flex items-center justify-between">
              <p className="text-[10px] text-[#131218]/25 font-bold uppercase tracking-widest">
                {projects.length} project{projects.length !== 1 ? "s" : ""}
              </p>
              <div className="flex items-center gap-3">
                {totalBlockers > 0 && (
                  <span className="text-[10px] font-bold text-red-500">
                    ↯ {totalBlockers} blocker{totalBlockers !== 1 ? "s" : ""}
                  </span>
                )}
                {needsUpdate.length > 0 && (
                  <span className="text-[10px] font-bold text-amber-500">
                    ⚠ {needsUpdate.length} update{needsUpdate.length !== 1 ? "s" : ""} needed
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

      </main>
    </div>
  );
}
