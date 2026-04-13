/**
 * Control Room — The Hall (admin home)
 *
 * Redesigned to match platform-admin.html view-hall spec:
 * - Greeting header + date
 * - P1 banner (blockers + deadlines from Notion)
 * - Stats row: active projects, pending review, agent status, next meeting
 * - Agent pulse bar
 * - Today's 3 urgencies
 * - Two-column: active projects table (type/warmth/update) + pending/upcoming
 */

import Link from "next/link";
import { Sidebar } from "@/components/Sidebar";
import { getProjectsOverview, getAllSources, getDecisionItems } from "@/lib/notion";
import { ADMIN_NAV } from "@/lib/admin-nav";
import { requireAdmin } from "@/lib/require-admin";

// Re-export from shared module so server components can import from here
export { ADMIN_NAV as NAV } from "@/lib/admin-nav";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function daysSince(dateStr: string | null): number {
  if (!dateStr) return 999;
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
}

function warmthLabel(days: number): { label: string; dot: string; text: string } {
  if (days <= 3)  return { label: "Hot",     dot: "bg-red-500",    text: "text-red-600" };
  if (days <= 10) return { label: "Warm",    dot: "bg-amber-400",  text: "text-amber-600" };
  if (days <= 21) return { label: "Warm",    dot: "bg-amber-300",  text: "text-amber-500" };
  if (days <= 35) return { label: "Cold",    dot: "bg-blue-400",   text: "text-blue-500" };
  return              { label: "Dormant", dot: "bg-[#131218]/15", text: "text-[#131218]/35" };
}

function projectType(primaryWorkspace: string): string {
  if (primaryWorkspace === "garage")   return "Garage";
  if (primaryWorkspace === "workroom") return "Workroom";
  return "—";
}

function projectTypeBadge(primaryWorkspace: string): string {
  if (primaryWorkspace === "garage")   return "bg-[#131218] text-[#B2FF59]";
  if (primaryWorkspace === "workroom") return "bg-[#EFEFEA] text-[#131218]/60 border border-[#E0E0D8]";
  return "bg-[#EFEFEA] text-[#131218]/30 border border-[#E0E0D8]";
}

const STAGE_COLORS: Record<string, string> = {
  "Discovery":  "bg-blue-50 text-blue-600 border border-blue-200",
  "Validation": "bg-amber-50 text-amber-600 border border-amber-200",
  "Execution":  "bg-[#131218] text-[#B2FF59]",
  "Completion": "bg-[#B2FF59] text-[#131218]",
  "On Hold":    "bg-gray-100 text-gray-400 border border-gray-200",
  "Paused":     "bg-gray-100 text-gray-400 border border-gray-200",
};

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function AdminPage() {
  await requireAdmin();

  const [projects, , decisions] = await Promise.all([
    getProjectsOverview(),
    getAllSources(),
    getDecisionItems(),
  ]);

  // Derived counts
  const withBlockers    = projects.filter(p => p.blockerCount > 0);
  const needsUpdate     = projects.filter(p => p.updateNeeded);
  const staleProjects   = projects.filter(p => !p.updateNeeded && daysSince(p.lastUpdate) > 30);
  const workroomCount   = projects.filter(p => p.primaryWorkspace === "workroom").length;
  const garageCount     = projects.filter(p => p.primaryWorkspace === "garage").length;

  // Pending review items from decisions
  const openDecisions   = decisions.filter(d => d.status !== "Approved" && d.status !== "Rejected" && d.status !== "Executed");
  const urgentDecisions = openDecisions.filter(d => d.priority === "P1" || d.priority === "Urgent");

  // Deadline decisions (those with a dueDate)
  const withDeadlines   = openDecisions.filter(d => d.dueDate);

  // P1 banner text
  const blockerCount   = withBlockers.length;
  const deadlineCount  = withDeadlines.length;

  // Total pending review: needsUpdate + openDecisions
  const totalPending = needsUpdate.length + openDecisions.length;

  const today = new Date();
  const dateLabel = today.toLocaleDateString("en-GB", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });

  // Hour-based greeting
  const hour = today.getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  return (
    <div className="flex min-h-screen bg-[#EFEFEA]">
      <Sidebar adminNav />

      <main className="flex-1 ml-60 overflow-auto">

        {/* ── Page header ─────────────────────────────────────────────── */}
        <div className="border-b border-[#E0E0D8] bg-white px-8 py-6">
          <p className="text-[10px] font-bold text-[#131218]/30 uppercase tracking-widest mb-2">
            Home · {dateLabel}
          </p>
          <h1 className="text-3xl font-bold text-[#131218] tracking-tight leading-tight">
            {greeting},<br />
            <em className="not-italic text-[#131218]/50">Common House.</em>
          </h1>
          <p className="text-sm text-[#131218]/40 font-medium mt-2">
            Here is your day — what moves, what waits, and what needs your attention.
          </p>
        </div>

        <div className="px-8 py-6 space-y-6 max-w-7xl">

          {/* ── P1 Banner ───────────────────────────────────────────────── */}
          {(blockerCount > 0 || deadlineCount > 0) && (
            <div className="flex items-center gap-3 bg-red-50 border border-red-200 rounded-xl px-5 py-3.5">
              <span className="w-2 h-2 rounded-full bg-red-500 shrink-0 animate-pulse" />
              <p className="text-sm text-[#131218] flex-1 min-w-0">
                {blockerCount > 0 && (
                  <><strong>{blockerCount} active blocker{blockerCount !== 1 ? "s" : ""}</strong>{" · "}</>
                )}
                {withBlockers.slice(0, 2).map(p => p.name).join(" · ")}
                {deadlineCount > 0 && (
                  <>{blockerCount > 0 ? " · " : ""}<strong>{deadlineCount} deadline{deadlineCount !== 1 ? "s" : ""} this week</strong></>
                )}
                {withDeadlines.slice(0, 1).map(d => (
                  <span key={d.id}>{" · "}{d.title}{d.dueDate ? ` — closes ${new Date(d.dueDate).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}` : ""}</span>
                ))}
              </p>
              <Link href="/admin/decisions" className="text-[11px] font-bold text-red-600 shrink-0 hover:text-red-800 transition-colors whitespace-nowrap">
                View decisions →
              </Link>
            </div>
          )}

          {/* ── Stats row ───────────────────────────────────────────────── */}
          <div className="grid grid-cols-4 gap-4">
            {/* Active projects */}
            <div className="bg-white rounded-2xl border border-[#E0E0D8] px-5 py-4">
              <p className="text-[10px] font-bold text-[#131218]/30 uppercase tracking-widest mb-2">Active projects</p>
              <p className="text-3xl font-bold text-[#131218] tracking-tight">{projects.length}</p>
              <p className="text-[11px] text-[#131218]/40 font-medium mt-1.5">
                {workroomCount} Workroom{workroomCount !== 1 ? "s" : ""} · {garageCount} Garage
              </p>
            </div>

            {/* Pending review */}
            <div className="bg-white rounded-2xl border border-[#E0E0D8] px-5 py-4">
              <p className="text-[10px] font-bold text-[#131218]/30 uppercase tracking-widest mb-2">Pending review</p>
              {totalPending > 0 ? (
                <p className="text-3xl font-bold text-amber-500 tracking-tight">{totalPending}</p>
              ) : (
                <p className="text-3xl font-bold text-[#131218]/15 tracking-tight">0</p>
              )}
              <p className="text-[11px] text-[#131218]/40 font-medium mt-1.5">
                Updates · Decisions · Content
              </p>
            </div>

            {/* Agents */}
            <div className="bg-white rounded-2xl border border-[#E0E0D8] px-5 py-4">
              <p className="text-[10px] font-bold text-[#131218]/30 uppercase tracking-widest mb-2">Agents</p>
              <p className="text-3xl font-bold text-[#B2FF59] bg-[#131218] w-fit px-3 py-0.5 rounded-xl tracking-tight">OK</p>
              <p className="text-[11px] text-[#131218]/40 font-medium mt-1.5">OS v2 running</p>
            </div>

            {/* Blockers */}
            <div className="bg-white rounded-2xl border border-[#E0E0D8] px-5 py-4">
              <p className="text-[10px] font-bold text-[#131218]/30 uppercase tracking-widest mb-2">Blockers</p>
              {blockerCount > 0 ? (
                <p className="text-3xl font-bold text-red-500 tracking-tight">{blockerCount}</p>
              ) : (
                <p className="text-3xl font-bold text-[#131218]/15 tracking-tight">0</p>
              )}
              <p className="text-[11px] text-[#131218]/40 font-medium mt-1.5">
                {staleProjects.length > 0 ? `${staleProjects.length} stale (30d+)` : "All projects active"}
              </p>
            </div>
          </div>

          {/* ── Agent pulse bar ─────────────────────────────────────────── */}
          <div className="flex items-center gap-3 bg-white border border-[#E0E0D8] rounded-xl px-5 py-3 flex-wrap">
            <span className="text-[8.5px] font-bold tracking-widest uppercase text-[#131218]/30">OS v2</span>
            <div className="w-px h-3.5 bg-[#E0E0D8] shrink-0" />
            <div className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block shrink-0 shadow-[0_0_0_2px_rgba(34,197,94,0.2)]" />
              <span className="text-[11px] font-semibold text-[#131218]">os-runner</span>
              <span className="text-[10px] text-[#131218]/35">last run</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block shrink-0" />
              <span className="text-[11px] font-semibold text-[#131218]">source-intake</span>
              <span className="text-[10px] text-[#131218]/35">active</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 inline-block shrink-0" />
              <span className="text-[11px] font-semibold text-[#131218]">hygiene-agent</span>
              <span className="text-[10px] text-amber-600">{staleProjects.length > 0 ? `${staleProjects.length} warning${staleProjects.length !== 1 ? "s" : ""}` : "OK"}</span>
            </div>
            <div className="ml-auto flex items-center gap-1.5">
              <span className="text-[10px] text-[#131218]/35">Next scheduled:</span>
              <span className="text-[10.5px] font-bold text-[#131218]">briefing-agent · Mon 07:00</span>
            </div>
          </div>

          {/* ── Today's urgencies ───────────────────────────────────────── */}
          {(blockerCount > 0 || urgentDecisions.length > 0 || needsUpdate.length > 0) && (
            <div className="grid grid-cols-3 gap-3">
              {/* Blocker card */}
              {withBlockers[0] ? (
                <div className="bg-red-50/80 border border-red-200 rounded-xl px-4 py-3.5">
                  <p className="text-[8px] font-bold tracking-widest uppercase text-red-600 mb-1.5">Active blocker</p>
                  <p className="text-[12.5px] font-bold text-[#131218] leading-snug mb-1">{withBlockers[0].name}</p>
                  <p className="text-[10.5px] text-[#131218]/50">
                    {withBlockers[0].blockerCount} blocker{withBlockers[0].blockerCount !== 1 ? "s" : ""} · review required
                  </p>
                </div>
              ) : (
                <div className="bg-[#EFEFEA]/60 border border-[#E0E0D8] rounded-xl px-4 py-3.5 flex items-center justify-center">
                  <p className="text-[11px] text-[#131218]/25 font-medium">No blockers today</p>
                </div>
              )}

              {/* Deadline card */}
              {withDeadlines[0] ? (
                <div className="bg-red-50/80 border border-red-200 rounded-xl px-4 py-3.5">
                  <p className="text-[8px] font-bold tracking-widest uppercase text-red-600 mb-1.5">
                    Deadline{withDeadlines[0].dueDate ? ` · ${daysSince(withDeadlines[0].dueDate) < 0 ? Math.abs(daysSince(withDeadlines[0].dueDate)) : daysSince(withDeadlines[0].dueDate)} days` : ""}
                  </p>
                  <p className="text-[12.5px] font-bold text-[#131218] leading-snug mb-1">{withDeadlines[0].title}</p>
                  <p className="text-[10.5px] text-[#131218]/50">
                    {withDeadlines[0].dueDate
                      ? `Closes ${new Date(withDeadlines[0].dueDate).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`
                      : "Review required"}
                  </p>
                </div>
              ) : (
                <div className="bg-[#EFEFEA]/60 border border-[#E0E0D8] rounded-xl px-4 py-3.5 flex items-center justify-center">
                  <p className="text-[11px] text-[#131218]/25 font-medium">No deadlines this week</p>
                </div>
              )}

              {/* Review card */}
              {needsUpdate[0] ? (
                <div className="bg-amber-50/80 border border-amber-200 rounded-xl px-4 py-3.5">
                  <p className="text-[8px] font-bold tracking-widest uppercase text-amber-600 mb-1.5">Review today</p>
                  <p className="text-[12.5px] font-bold text-[#131218] leading-snug mb-1">{needsUpdate[0].name}</p>
                  <p className="text-[10.5px] text-[#131218]/50">
                    {needsUpdate[0].stage || "No stage"} · update pending
                  </p>
                </div>
              ) : urgentDecisions[0] ? (
                <div className="bg-amber-50/80 border border-amber-200 rounded-xl px-4 py-3.5">
                  <p className="text-[8px] font-bold tracking-widest uppercase text-amber-600 mb-1.5">Review today</p>
                  <p className="text-[12.5px] font-bold text-[#131218] leading-snug mb-1">{urgentDecisions[0].title}</p>
                  <p className="text-[10.5px] text-[#131218]/50">
                    {urgentDecisions[0].decisionType || "Decision"} · approval pending
                  </p>
                </div>
              ) : (
                <div className="bg-[#EFEFEA]/60 border border-[#E0E0D8] rounded-xl px-4 py-3.5 flex items-center justify-center">
                  <p className="text-[11px] text-[#131218]/25 font-medium">Queue clear</p>
                </div>
              )}
            </div>
          )}

          {/* ── Two-column layout ───────────────────────────────────────── */}
          <div className="grid grid-cols-[1fr_340px] gap-6 items-start">

            {/* Left: Active projects table */}
            <div>
              <div className="flex items-center gap-3 mb-3">
                <p className="text-[10px] font-bold text-[#131218]/30 uppercase tracking-widest">Active portfolio</p>
                <div className="flex-1 h-px bg-[#E0E0D8]" />
                <p className="text-[10px] font-bold text-[#131218]/30 uppercase tracking-widest">{projects.length} projects</p>
              </div>

              <div className="bg-white rounded-2xl border border-[#E0E0D8] overflow-hidden">
                {/* Table header */}
                <div className="grid grid-cols-[2fr_1fr_90px_90px_90px_24px] px-5 py-2.5 border-b border-[#EFEFEA]">
                  {["Project", "Stage", "Type", "Warmth", "Update", ""].map(h => (
                    <div key={h} className="text-[9px] font-bold text-[#131218]/25 uppercase tracking-widest">{h}</div>
                  ))}
                </div>

                {/* Rows */}
                <div className="divide-y divide-[#EFEFEA]">
                  {projects.map(p => {
                    const days   = daysSince(p.lastUpdate);
                    const warmth = warmthLabel(days);
                    const type   = projectType(p.primaryWorkspace);
                    const typeCls = projectTypeBadge(p.primaryWorkspace);

                    return (
                      <Link
                        key={p.id}
                        href={`/admin/projects/${p.id}`}
                        className="grid grid-cols-[2fr_1fr_90px_90px_90px_24px] px-5 py-3 hover:bg-[#EFEFEA]/50 transition-colors group items-center"
                      >
                        {/* Name */}
                        <div className="min-w-0">
                          <p className="text-[12.5px] font-semibold text-[#131218] truncate">{p.name}</p>
                          {p.geography.length > 0 && (
                            <p className="text-[10px] text-[#131218]/30 font-medium truncate mt-0.5">
                              {p.geography.slice(0, 2).join(" · ")}
                            </p>
                          )}
                        </div>

                        {/* Stage */}
                        <div>
                          {p.stage ? (
                            <span className={`inline-block text-[9px] font-bold px-2 py-0.5 rounded-full ${STAGE_COLORS[p.stage] ?? "bg-[#EFEFEA] text-[#131218]/50"}`}>
                              {p.stage}
                            </span>
                          ) : (
                            <span className="text-[#131218]/20 text-xs">—</span>
                          )}
                        </div>

                        {/* Type */}
                        <div>
                          {type !== "—" ? (
                            <span className={`inline-block text-[9px] font-bold px-2 py-0.5 rounded-full ${typeCls}`}>
                              {type}
                            </span>
                          ) : (
                            <span className="text-[#131218]/20 text-xs">—</span>
                          )}
                        </div>

                        {/* Warmth */}
                        <div className="flex items-center gap-1.5">
                          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${warmth.dot}`} />
                          <span className={`text-[10px] font-semibold ${warmth.text}`}>{warmth.label}</span>
                        </div>

                        {/* Update */}
                        <div>
                          {p.lastUpdate ? (
                            <p className="text-[10px] text-[#131218]/50 font-medium">
                              {new Date(p.lastUpdate).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                            </p>
                          ) : (
                            <span className="text-[#131218]/15 text-xs">—</span>
                          )}
                          {p.updateNeeded && (
                            <p className="text-[9px] font-bold text-amber-500 mt-0.5">⚠ Update</p>
                          )}
                          {p.blockerCount > 0 && (
                            <p className="text-[9px] font-bold text-red-500 mt-0.5">↯ Blocked</p>
                          )}
                        </div>

                        {/* Arrow */}
                        <div className="text-[#131218]/20 group-hover:text-[#131218]/60 transition-colors text-sm text-right">→</div>
                      </Link>
                    );
                  })}

                  {projects.length === 0 && (
                    <div className="px-5 py-8 text-center">
                      <p className="text-sm text-[#131218]/25 font-medium">No active projects</p>
                    </div>
                  )}
                </div>

                {/* Footer */}
                <div className="px-5 py-2.5 border-t border-[#EFEFEA] flex items-center justify-between">
                  <p className="text-[9px] font-bold text-[#131218]/25 uppercase tracking-widest">
                    {projects.length} project{projects.length !== 1 ? "s" : ""}
                  </p>
                  <div className="flex items-center gap-3">
                    {blockerCount > 0 && (
                      <span className="text-[9px] font-bold text-red-500">↯ {blockerCount} blocker{blockerCount !== 1 ? "s" : ""}</span>
                    )}
                    {needsUpdate.length > 0 && (
                      <span className="text-[9px] font-bold text-amber-500">⚠ {needsUpdate.length} need update</span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Right column */}
            <div className="flex flex-col gap-4">

              {/* Pending items */}
              <div className="bg-white rounded-2xl border border-[#E0E0D8] overflow-hidden">
                <div className="px-5 py-3.5 border-b border-[#EFEFEA] flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-lg bg-amber-50 border border-amber-200 flex items-center justify-center shrink-0">
                      <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="#92400e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                      </svg>
                    </div>
                    <p className="text-xs font-bold text-[#131218]">Pending review</p>
                  </div>
                  {totalPending > 0 && (
                    <span className="text-[10px] font-bold bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">{totalPending}</span>
                  )}
                </div>

                <div className="divide-y divide-[#EFEFEA]">
                  {/* Blockers */}
                  {withBlockers.slice(0, 2).map(p => (
                    <Link key={`blk-${p.id}`} href={`/admin/projects/${p.id}`} className="flex items-center gap-3 px-5 py-2.5 hover:bg-[#EFEFEA]/40 transition-colors">
                      <div className="w-5 h-5 rounded-md bg-red-100 flex items-center justify-center shrink-0">
                        <span className="text-[9px] font-bold text-red-600">!</span>
                      </div>
                      <p className="text-[11px] font-medium text-[#131218] flex-1 min-w-0 truncate">{p.name}</p>
                      <span className="text-[9px] font-bold text-[#131218]/30 shrink-0">Blocker</span>
                    </Link>
                  ))}

                  {/* Urgent decisions */}
                  {urgentDecisions.slice(0, 2).map(d => (
                    <Link key={`urg-${d.id}`} href="/admin/decisions" className="flex items-center gap-3 px-5 py-2.5 hover:bg-[#EFEFEA]/40 transition-colors">
                      <div className="w-5 h-5 rounded-md bg-red-100 flex items-center justify-center shrink-0">
                        <span className="text-[9px] font-bold text-red-600">!</span>
                      </div>
                      <p className="text-[11px] font-medium text-[#131218] flex-1 min-w-0 truncate">{d.title}</p>
                      <span className="text-[9px] font-bold text-[#131218]/30 shrink-0">Decision</span>
                    </Link>
                  ))}

                  {/* Open decisions */}
                  {openDecisions.filter(d => d.priority !== "P1" && d.priority !== "Urgent").slice(0, 2).map(d => (
                    <Link key={`dec-${d.id}`} href="/admin/decisions" className="flex items-center gap-3 px-5 py-2.5 hover:bg-[#EFEFEA]/40 transition-colors">
                      <div className="w-5 h-5 rounded-md bg-[#EFEFEA] flex items-center justify-center shrink-0">
                        <span className="text-[9px] font-bold text-[#131218]/40">·</span>
                      </div>
                      <p className="text-[11px] font-medium text-[#131218] flex-1 min-w-0 truncate">{d.title}</p>
                      <span className="text-[9px] font-bold text-[#131218]/30 shrink-0">Decision</span>
                    </Link>
                  ))}

                  {/* Updates needed */}
                  {needsUpdate.slice(0, 2).map(p => (
                    <Link key={`upd-${p.id}`} href={`/admin/projects/${p.id}`} className="flex items-center gap-3 px-5 py-2.5 hover:bg-[#EFEFEA]/40 transition-colors">
                      <div className="w-5 h-5 rounded-md bg-[#EFEFEA] flex items-center justify-center shrink-0">
                        <span className="text-[9px] font-bold text-amber-500">⚠</span>
                      </div>
                      <p className="text-[11px] font-medium text-[#131218] flex-1 min-w-0 truncate">{p.name}</p>
                      <span className="text-[9px] font-bold text-[#131218]/30 shrink-0">Update</span>
                    </Link>
                  ))}

                  {totalPending === 0 && (
                    <div className="px-5 py-5 text-center">
                      <p className="text-[11px] text-[#131218]/25 font-medium">Queue clear — nothing pending</p>
                    </div>
                  )}
                </div>

                <div className="px-5 py-2.5 border-t border-[#EFEFEA]">
                  <Link href="/admin/decisions" className="text-[10px] font-bold text-[#131218]/30 hover:text-[#131218]/70 transition-colors uppercase tracking-widest">
                    All decisions →
                  </Link>
                </div>
              </div>

              {/* Stale projects — compact warning */}
              {staleProjects.length > 0 && (
                <div className="bg-white rounded-2xl border border-red-200 overflow-hidden">
                  <div className="h-1 bg-red-400" />
                  <div className="px-5 py-3 border-b border-[#EFEFEA] flex items-center justify-between">
                    <p className="text-xs font-bold text-red-600">Stale — 30d+ no update</p>
                    <span className="text-[10px] font-bold bg-red-50 text-red-600 border border-red-200 px-2 py-0.5 rounded-full">{staleProjects.length}</span>
                  </div>
                  <div className="divide-y divide-[#EFEFEA]">
                    {staleProjects.slice(0, 3).map(p => (
                      <Link key={p.id} href={`/admin/projects/${p.id}`} className="flex items-center gap-3 px-5 py-2.5 hover:bg-[#EFEFEA]/40 transition-colors group">
                        <span className="w-1.5 h-1.5 rounded-full bg-red-400 shrink-0" />
                        <p className="text-[11px] font-medium text-[#131218] flex-1 min-w-0 truncate">{p.name}</p>
                        <span className="text-[10px] font-bold text-red-400 shrink-0">{daysSince(p.lastUpdate)}d</span>
                      </Link>
                    ))}
                  </div>
                </div>
              )}

            </div>
          </div>

        </div>
      </main>
    </div>
  );
}
