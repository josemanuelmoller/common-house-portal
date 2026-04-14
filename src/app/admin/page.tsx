/**
 * Control Room — The Hall v2
 *
 * Sprint A+B Hall redesign — productivity-first, OS-driven.
 * All data from Notion. Fresh read on every load (no caching).
 *
 * Sections:
 *   0  Header — greeting + date
 *   1  Focus of the Day — from Daily Briefings [OS v2]
 *   2  P1 Banner — blockers + deadlines
 *   3  Stats row
 *   4  Agent Queue — pending personal agent drafts
 *   5  Follow-up Queue — opted-in opportunities needing action
 *   6  My Commitments — from decisions + briefing
 *   7  Relationship Queue — cold / dormant contacts
 *   8  Active Portfolio — project table
 *   9  Opportunities Explorer — CH vs Portfolio (explore, no pressure)
 *  10  Ready to Publish — content pipeline
 *      Right sidebar: pending review + stale projects
 */

import Link from "next/link";
import { Sidebar } from "@/components/Sidebar";
import { AgentQueueSection } from "@/components/AgentQueueSection";
import { InboxTriage } from "@/components/InboxTriage";
import { DraftCheckinButton } from "@/components/DraftCheckinButton";
import { DraftFollowupButton } from "@/components/DraftFollowupButton";
import {
  getProjectsOverview,
  getDecisionItems,
  getDailyBriefing,
  getAgentDrafts,
  getFollowUpOpportunities,
  getOpportunitiesByScope,
  getColdRelationships,
  getReadyContent,
} from "@/lib/notion";
import { ADMIN_NAV } from "@/lib/admin-nav";
import { requireAdmin } from "@/lib/require-admin";
import { TriggerBriefingButton } from "@/components/TriggerBriefingButton";

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

function personWarmthBadge(warmth: string): { dot: string; text: string; bg: string } {
  if (warmth === "Hot")     return { dot: "bg-red-400",    text: "text-red-600",    bg: "bg-red-50 border-red-200" };
  if (warmth === "Warm")    return { dot: "bg-amber-400",  text: "text-amber-600",  bg: "bg-amber-50 border-amber-200" };
  if (warmth === "Cold")    return { dot: "bg-blue-400",   text: "text-blue-600",   bg: "bg-blue-50 border-blue-200" };
  return                    { dot: "bg-gray-300",   text: "text-gray-400",   bg: "bg-gray-50 border-gray-200" };
}

function projectTypeBadge(primaryWorkspace: string): string {
  if (primaryWorkspace === "garage")   return "bg-[#131218] text-[#B2FF59]";
  if (primaryWorkspace === "workroom") return "bg-[#EFEFEA] text-[#131218]/60 border border-[#E0E0D8]";
  return "bg-[#EFEFEA] text-[#131218]/30 border border-[#E0E0D8]";
}

function projectTypeLabel(primaryWorkspace: string): string {
  if (primaryWorkspace === "garage")   return "Garage";
  if (primaryWorkspace === "workroom") return "Workroom";
  return "—";
}

const STAGE_COLORS: Record<string, string> = {
  "Discovery":  "bg-blue-50 text-blue-600 border border-blue-200",
  "Validation": "bg-amber-50 text-amber-600 border border-amber-200",
  "Execution":  "bg-[#131218] text-[#B2FF59]",
  "Completion": "bg-[#B2FF59] text-[#131218]",
  "On Hold":    "bg-gray-100 text-gray-400 border border-gray-200",
  "Paused":     "bg-gray-100 text-gray-400 border border-gray-200",
};

// Section header — consistent across all Hall sections
function SectionHeader({ label, count, action, href }: {
  label: string;
  count?: number;
  action?: string;
  href?: string;
}) {
  return (
    <div className="flex items-center gap-3 mb-3">
      <p className="text-[10px] font-bold text-[#131218]/30 uppercase tracking-widest">{label}</p>
      {count !== undefined && (
        <span className="text-[9px] font-bold bg-[#131218]/6 text-[#131218]/40 px-1.5 py-0.5 rounded-full">
          {count}
        </span>
      )}
      <div className="flex-1 h-px bg-[#E0E0D8]" />
      {action && href && (
        <Link href={href} className="text-[9px] font-bold text-[#131218]/30 hover:text-[#131218]/70 transition-colors uppercase tracking-widest whitespace-nowrap">
          {action} →
        </Link>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function AdminPage() {
  const adminUser = await requireAdmin();

  const [
    projects,
    decisions,
    dailyBriefing,
    agentDrafts,
    followUpOpps,
    opportunities,
    coldRelationships,
    readyContent,
  ] = await Promise.all([
    getProjectsOverview(),
    getDecisionItems(),
    getDailyBriefing(),
    getAgentDrafts("Pending Review"),
    getFollowUpOpportunities(),
    getOpportunitiesByScope(),
    getColdRelationships(),
    getReadyContent(),
  ]);

  // ── Derived state ────────────────────────────────────────────────────────────
  const withBlockers    = projects.filter(p => p.blockerCount > 0);
  const needsUpdate     = projects.filter(p => p.updateNeeded);
  const staleProjects   = projects.filter(p => !p.updateNeeded && daysSince(p.lastUpdate) > 30);
  const workroomCount   = projects.filter(p => p.primaryWorkspace === "workroom").length;
  const garageCount     = projects.filter(p => p.primaryWorkspace === "garage").length;

  const openDecisions   = decisions.filter(d => d.status !== "Approved" && d.status !== "Rejected" && d.status !== "Executed");
  const urgentDecisions = openDecisions.filter(d => d.priority === "P1" || d.priority === "Urgent");
  const withDeadlines   = openDecisions.filter(d => d.dueDate);
  const blockerCount    = withBlockers.length;
  const deadlineCount   = withDeadlines.length;
  const totalPending    = needsUpdate.length + openDecisions.length;

  const dormantRelationships = coldRelationships.filter(r => r.warmth === "Dormant");
  const coldOnly             = coldRelationships.filter(r => r.warmth === "Cold");

  // ── Date + greeting ──────────────────────────────────────────────────────────
  const today = new Date();
  const dateLabel = today.toLocaleDateString("en-GB", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });
  const hour      = today.getHours();
  const greeting  = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const firstName = adminUser.firstName || adminUser.primaryEmailAddress?.emailAddress?.split("@")[0] || "Common House";

  return (
    <div className="flex min-h-screen bg-[#EFEFEA]">
      <Sidebar adminNav />

      <main className="flex-1 ml-60 overflow-auto">

        {/* ── 0. Header ─────────────────────────────────────────────────── */}
        <div className="bg-[#131218] px-10 py-10">
          <p className="text-[8px] font-bold uppercase tracking-[2.5px] text-white/20 mb-3">
            HOME · {dateLabel.toUpperCase()}
          </p>
          <h1 className="text-[2.6rem] font-[300] text-white leading-[1] tracking-[-1.5px]">
            {greeting},<br />
            <em className="font-[900] italic text-[#c8f55a]">{firstName}.</em>
          </h1>
          <p className="text-[12.5px] text-white/40 mt-3 max-w-[520px] leading-[1.65]">
            Here is your day — what moves, what waits, and what needs your attention.
          </p>
        </div>

        <div className="px-8 py-6 space-y-6 max-w-7xl">

          {/* ── 1. Focus of the Day ───────────────────────────────────────── */}
          {dailyBriefing ? (
            <div className="bg-[#131218] rounded-2xl px-7 py-5 border border-[#131218]">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <p className="text-[9px] font-bold uppercase tracking-[2.5px] text-[#c8f55a]/70 mb-2">
                    Focus of the Day
                  </p>
                  <p className="text-[14px] text-white/85 leading-[1.65] max-w-[680px]">
                    {dailyBriefing.focusOfDay || "No focus set for today — run generate-daily-briefing."}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <span className="inline-block text-[9px] font-bold text-[#c8f55a]/50 uppercase tracking-widest border border-[#c8f55a]/20 rounded-full px-2.5 py-1">
                    {dailyBriefing.status || "Fresh"}
                  </span>
                  {dailyBriefing.generatedAt && (
                    <p className="text-[9px] text-white/20 mt-1">
                      {new Date(dailyBriefing.generatedAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
                    </p>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-[#131218]/6 border border-dashed border-[#131218]/15 rounded-2xl px-7 py-5 flex items-center justify-between gap-4">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[2.5px] text-[#131218]/30 mb-1">Focus of the Day</p>
                <p className="text-[13px] text-[#131218]/40">No briefing generated yet today.</p>
                <p className="text-[11px] text-[#131218]/25 mt-0.5">Synthesises active projects, decisions, and open signals into a daily focus.</p>
              </div>
              <TriggerBriefingButton />
            </div>
          )}

          {/* ── 2. P1 Banner ──────────────────────────────────────────────── */}
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

          {/* ── 3. Stats row ──────────────────────────────────────────────── */}
          <div className="grid grid-cols-3 gap-4">

            {/* Tile 1 — Portfolio */}
            <div className="bg-white rounded-2xl border border-[#E0E0D8] px-5 py-5">
              <p className="text-[9px] font-bold text-[#131218]/25 uppercase tracking-widest mb-2">Portfolio activo</p>
              <p className="text-3xl font-[800] text-[#131218] tracking-tight leading-none mb-2">{projects.length}</p>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-semibold text-[#131218]/40">{workroomCount} Workroom · {garageCount} Garage</span>
              </div>
              {blockerCount > 0 && (
                <div className="mt-2.5 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-400 shrink-0" />
                  <span className="text-[10px] font-bold text-red-500">{blockerCount} blocker{blockerCount !== 1 ? "s" : ""}</span>
                </div>
              )}
            </div>

            {/* Tile 2 — Cola de trabajo */}
            <Link href="/admin/decisions" className="bg-white rounded-2xl border border-[#E0E0D8] px-5 py-5 hover:bg-[#EFEFEA]/40 transition-colors block">
              <p className="text-[9px] font-bold text-[#131218]/25 uppercase tracking-widest mb-2">Decisiones + updates</p>
              <p className={`text-3xl font-[800] tracking-tight leading-none mb-2 ${totalPending > 0 ? "text-amber-500" : "text-[#131218]/15"}`}>
                {totalPending}
              </p>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-semibold text-[#131218]/40">
                  {urgentDecisions.length} urgentes · {needsUpdate.length} proyectos por actualizar
                </span>
              </div>
              {withDeadlines.length > 0 && (
                <div className="mt-2.5 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
                  <span className="text-[10px] font-bold text-amber-500">{withDeadlines.length} deadline{withDeadlines.length !== 1 ? "s" : ""} esta semana</span>
                </div>
              )}
            </Link>

            {/* Tile 3 — OS Layer */}
            <div className="bg-white rounded-2xl border border-[#E0E0D8] px-5 py-5">
              <p className="text-[9px] font-bold text-[#131218]/25 uppercase tracking-widest mb-3">OS activo</p>
              <div className="space-y-2.5">
                {[
                  {
                    label: "Borradores de agentes",
                    count: agentDrafts.length,
                    activeColor: "text-[#131218]",
                    hint: "Pending agent drafts needing your review",
                  },
                  {
                    label: "Follow-ups activos",
                    count: followUpOpps.length,
                    activeColor: "text-amber-500",
                    hint: "Mark an opportunity as interested to track it here",
                  },
                  {
                    label: "Relaciones frías",
                    count: coldOnly.length,
                    activeColor: "text-blue-500",
                    hint: "Populated by relationship warmth scan (Mon · Thu)",
                  },
                  {
                    label: "Dormantes",
                    count: dormantRelationships.length,
                    activeColor: "text-[#131218]/40",
                    hint: "No contact in 60+ days",
                  },
                ].map(({ label, count, activeColor, hint }) => (
                  <div key={label}>
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] text-[#131218]/50">{label}</span>
                      <span className={`text-[13px] font-[800] ${count > 0 ? activeColor : "text-[#131218]/15"}`}>{count}</span>
                    </div>
                    {count === 0 && (
                      <p className="text-[9px] text-[#131218]/20 mt-0.5 leading-snug">{hint}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* ── 4. Agent Queue ────────────────────────────────────────────── */}
          {agentDrafts.length > 0 && (
            <div>
              <SectionHeader label="Agent queue" count={agentDrafts.length} />
              <AgentQueueSection drafts={agentDrafts} />
            </div>
          )}

          {/* ── 4b. Inbox Triage ──────────────────────────────────────────── */}
          <div>
            <SectionHeader label="Inbox — needs attention" />
            <InboxTriage />
          </div>

          {/* ── Two-column main layout ─────────────────────────────────────── */}
          <div className="grid grid-cols-[1fr_340px] gap-6 items-start">

            {/* ── LEFT COLUMN ───────────────────────────────────────────────── */}
            <div className="space-y-6">

              {/* ── 5. Follow-up Queue ────────────────────────────────────── */}
              <div>
                <SectionHeader
                  label="Follow-up queue"
                  count={followUpOpps.length}
                  action={followUpOpps.length > 0 ? "All opportunities" : undefined}
                  href="/admin"
                />
                {followUpOpps.length > 0 ? (
                  <div className="bg-white rounded-2xl border border-[#E0E0D8] divide-y divide-[#EFEFEA] overflow-hidden">
                    {followUpOpps.map(opp => {
                      const lastEditDays = opp.lastEdited ? daysSince(opp.lastEdited) : null;
                      const isUrgent = lastEditDays !== null && lastEditDays > 14;
                      return (
                        <div key={opp.id} className="flex items-center gap-3 px-5 py-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-0.5">
                              {isUrgent && (
                                <span className="text-[8px] font-bold text-red-600 bg-red-50 border border-red-200 px-1.5 rounded-full uppercase tracking-wide">Urgent</span>
                              )}
                              <span className="text-[8px] font-bold uppercase tracking-widest text-[#131218]/25">{opp.scope}</span>
                            </div>
                            <p className="text-[12.5px] font-semibold text-[#131218] truncate">{opp.name}</p>
                            <p className="text-[10px] text-[#131218]/40 mt-0.5">
                              {opp.stage}{opp.orgName ? ` · ${opp.orgName}` : ""}
                              {lastEditDays !== null ? ` · ${lastEditDays}d silent` : ""}
                            </p>
                          </div>
                          <DraftFollowupButton
                            opportunityId={opp.id}
                            notionUrl={opp.notionUrl}
                          />
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="bg-white/50 border border-dashed border-[#E0E0D8] rounded-2xl px-5 py-10 text-center">
                    <p className="text-[12px] text-[#131218]/25 font-medium">Sin follow-ups activos</p>
                    <p className="text-[10.5px] text-[#131218]/18 mt-1">Marca &quot;Me interesa&quot; en una oportunidad para trackearlo aquí</p>
                  </div>
                )}
              </div>

              {/* ── 6. My Commitments (from briefing + decisions) ─────────── */}
              {(dailyBriefing?.myCommitments || openDecisions.length > 0) && (
                <div>
                  <SectionHeader label="My commitments" count={openDecisions.length} action="Decisions" href="/admin/decisions" />
                  <div className="bg-white rounded-2xl border border-[#E0E0D8] overflow-hidden">
                    {dailyBriefing?.myCommitments ? (
                      <div className="px-5 py-4 border-b border-[#EFEFEA]">
                        <p className="text-[9px] font-bold uppercase tracking-widest text-[#131218]/25 mb-2">From today&apos;s briefing</p>
                        <pre className="text-[11.5px] text-[#131218]/70 leading-[1.65] whitespace-pre-wrap font-sans">
                          {dailyBriefing.myCommitments.slice(0, 600)}
                        </pre>
                      </div>
                    ) : null}
                    {openDecisions.slice(0, 5).map(d => (
                      <Link key={d.id} href="/admin/decisions" className="flex items-center gap-3 px-5 py-3.5 hover:bg-[#EFEFEA]/40 transition-colors border-b border-[#EFEFEA] last:border-0">
                        <div className={`w-5 h-5 rounded-md flex items-center justify-center shrink-0 ${d.priority === "P1" || d.priority === "Urgent" ? "bg-red-100" : "bg-[#EFEFEA]"}`}>
                          <span className={`text-[9px] font-bold ${d.priority === "P1" || d.priority === "Urgent" ? "text-red-600" : "text-[#131218]/35"}`}>!</span>
                        </div>
                        <p className="text-[11px] font-medium text-[#131218] flex-1 min-w-0 truncate">{d.title}</p>
                        <div className="flex items-center gap-2 shrink-0">
                          {d.dueDate && (
                            <span className="text-[9px] font-bold text-[#131218]/35">
                              {new Date(d.dueDate).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                            </span>
                          )}
                          <span className="text-[9px] font-bold text-[#131218]/25">{d.decisionType}</span>
                        </div>
                      </Link>
                    ))}
                  </div>
                </div>
              )}

              {/* ── 7. Relationship Queue ─────────────────────────────────── */}
              {coldRelationships.length > 0 && (
                <div>
                  <SectionHeader label="Relationship queue" count={coldRelationships.length} />
                  <div className="bg-white rounded-2xl border border-[#E0E0D8] divide-y divide-[#EFEFEA] overflow-hidden">
                    {coldRelationships.slice(0, 6).map(r => {
                      const badge = personWarmthBadge(r.warmth);
                      const lastContactDays = r.lastContactDate ? daysSince(r.lastContactDate) : null;
                      const calUrl = r.email
                        ? `https://calendar.google.com/calendar/r/eventedit?add=${encodeURIComponent(r.email)}&text=Catch+up+with+${encodeURIComponent(r.name)}`
                        : "https://calendar.google.com/calendar/r/eventedit";
                      return (
                        <div key={r.id} className="flex items-center gap-3 px-5 py-3">
                          <div className={`w-2 h-2 rounded-full shrink-0 ${badge.dot}`} />
                          <div className="flex-1 min-w-0">
                            <p className="text-[12px] font-semibold text-[#131218] truncate">{r.name}</p>
                            <p className="text-[10px] text-[#131218]/35 truncate mt-0.5">
                              {r.jobTitle}
                              {lastContactDays !== null ? ` · ${lastContactDays}d silent` : " · never contacted"}
                            </p>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className={`text-[8px] font-bold px-2 py-0.5 rounded-full border ${badge.bg} ${badge.text}`}>
                              {r.warmth}
                            </span>
                            <a
                              href={calUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-[#c8f55a] text-[#131218] hover:bg-[#b8e54a] transition-colors"
                            >
                              Catch up
                            </a>
                            <DraftCheckinButton
                              personId={r.id}
                              notionUrl={r.notionUrl}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* ── 8. Active Portfolio ───────────────────────────────────── */}
              <div>
                <SectionHeader label="Active portfolio" count={projects.length} />
                <div className="bg-white rounded-2xl border border-[#E0E0D8] overflow-hidden">
                  <div className="grid grid-cols-[2fr_1fr_80px_80px_80px_20px] px-5 py-2.5 border-b border-[#EFEFEA]">
                    {["Project", "Stage", "Type", "Warmth", "Update", ""].map(h => (
                      <div key={h} className="text-[9px] font-bold text-[#131218]/25 uppercase tracking-widest">{h}</div>
                    ))}
                  </div>
                  <div className="divide-y divide-[#EFEFEA]">
                    {projects.map(p => {
                      const days    = daysSince(p.lastUpdate);
                      const warmth  = warmthLabel(days);
                      const typeLbl = projectTypeLabel(p.primaryWorkspace);
                      const typeCls = projectTypeBadge(p.primaryWorkspace);
                      return (
                        <Link
                          key={p.id}
                          href={`/admin/projects/${p.id}`}
                          className="grid grid-cols-[2fr_1fr_80px_80px_80px_20px] px-5 py-4 hover:bg-[#EFEFEA]/50 transition-colors group items-center"
                        >
                          <div className="min-w-0">
                            <p className="text-[12px] font-semibold text-[#131218] truncate">{p.name}</p>
                            {p.geography.length > 0 && (
                              <p className="text-[10px] text-[#131218]/30 font-medium truncate mt-0.5">{p.geography.slice(0, 2).join(" · ")}</p>
                            )}
                          </div>
                          <div>
                            {p.stage ? (
                              <span className={`inline-block text-[9px] font-bold px-2 py-0.5 rounded-full ${STAGE_COLORS[p.stage] ?? "bg-[#EFEFEA] text-[#131218]/50"}`}>
                                {p.stage}
                              </span>
                            ) : <span className="text-[#131218]/15 text-xs">—</span>}
                          </div>
                          <div>
                            {typeLbl !== "—" ? (
                              <span className={`inline-block text-[9px] font-bold px-2 py-0.5 rounded-full ${typeCls}`}>{typeLbl}</span>
                            ) : <span className="text-[#131218]/15 text-xs">—</span>}
                          </div>
                          <div className="flex items-center gap-1.5">
                            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${warmth.dot}`} />
                            <span className={`text-[10px] font-semibold ${warmth.text}`}>{warmth.label}</span>
                          </div>
                          <div>
                            {p.lastUpdate ? (
                              <p className="text-[10px] text-[#131218]/50 font-medium">
                                {new Date(p.lastUpdate).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                              </p>
                            ) : <span className="text-[#131218]/15 text-xs">—</span>}
                            {p.updateNeeded && <p className="text-[9px] font-bold text-amber-500 mt-0.5">! Update</p>}
                            {p.blockerCount > 0 && <p className="text-[9px] font-bold text-red-500 mt-0.5">↯ Blocked</p>}
                          </div>
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
                </div>
              </div>

              {/* ── 9. Opportunities Explorer ─────────────────────────────── */}
              {(opportunities.ch.length > 0 || opportunities.portfolio.length > 0) && (
                <div>
                  <SectionHeader label="Opportunities — explore" count={opportunities.ch.length + opportunities.portfolio.length} />
                  <div className="grid grid-cols-2 gap-4">

                    {/* CH Opportunities */}
                    <div className="bg-white rounded-2xl border border-[#E0E0D8] overflow-hidden">
                      <div className="px-4 py-3 border-b border-[#EFEFEA]">
                        <p className="text-[9px] font-bold uppercase tracking-widest text-[#131218]/30">Common House</p>
                      </div>
                      <div className="divide-y divide-[#EFEFEA]">
                        {opportunities.ch.slice(0, 6).map(o => (
                          <a
                            key={o.id}
                            href={o.notionUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-3 px-4 py-2.5 hover:bg-[#EFEFEA]/40 transition-colors"
                          >
                            <div className="flex-1 min-w-0">
                              <p className="text-[11.5px] font-semibold text-[#131218] truncate">{o.name}</p>
                              <p className="text-[10px] text-[#131218]/35 mt-0.5">{o.stage}{o.type ? ` · ${o.type}` : ""}</p>
                            </div>
                            {o.followUpStatus !== "None" && o.followUpStatus !== "" && (
                              <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded-full uppercase tracking-wide shrink-0 ${
                                o.followUpStatus === "Needed" ? "bg-amber-50 text-amber-600 border border-amber-200" :
                                o.followUpStatus === "Waiting" ? "bg-blue-50 text-blue-600 border border-blue-200" :
                                "bg-[#EFEFEA] text-[#131218]/30"
                              }`}>
                                {o.followUpStatus}
                              </span>
                            )}
                          </a>
                        ))}
                        {opportunities.ch.length === 0 && (
                          <div className="px-4 py-5 text-center">
                            <p className="text-[11px] text-[#131218]/25">No CH opportunities</p>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Portfolio Opportunities */}
                    <div className="bg-white rounded-2xl border border-[#E0E0D8] overflow-hidden">
                      <div className="px-4 py-3 border-b border-[#EFEFEA]">
                        <p className="text-[9px] font-bold uppercase tracking-widest text-[#131218]/30">Portfolio</p>
                      </div>
                      <div className="divide-y divide-[#EFEFEA]">
                        {opportunities.portfolio.slice(0, 6).map(o => (
                          <a
                            key={o.id}
                            href={o.notionUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-3 px-4 py-2.5 hover:bg-[#EFEFEA]/40 transition-colors"
                          >
                            <div className="flex-1 min-w-0">
                              <p className="text-[11.5px] font-semibold text-[#131218] truncate">{o.name}</p>
                              <p className="text-[10px] text-[#131218]/35 mt-0.5">{o.stage}{o.orgName ? ` · ${o.orgName}` : ""}</p>
                            </div>
                            {o.followUpStatus !== "None" && o.followUpStatus !== "" && (
                              <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded-full uppercase tracking-wide shrink-0 ${
                                o.followUpStatus === "Needed" ? "bg-amber-50 text-amber-600 border border-amber-200" :
                                o.followUpStatus === "Waiting" ? "bg-blue-50 text-blue-600 border border-blue-200" :
                                "bg-[#EFEFEA] text-[#131218]/30"
                              }`}>
                                {o.followUpStatus}
                              </span>
                            )}
                          </a>
                        ))}
                        {opportunities.portfolio.length === 0 && (
                          <div className="px-4 py-5 text-center">
                            <p className="text-[11px] text-[#131218]/25">No portfolio opportunities</p>
                          </div>
                        )}
                      </div>
                    </div>

                  </div>
                </div>
              )}

              {/* ── 10. Ready to Publish ─────────────────────────────────── */}
              {readyContent.length > 0 && (
                <div>
                  <SectionHeader label="Ready to publish" count={readyContent.length} />
                  <div className="grid grid-cols-3 gap-3">
                    {readyContent.map(c => (
                      <a
                        key={c.id}
                        href={c.notionUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="bg-white rounded-xl border border-[#E0E0D8] px-4 py-3.5 hover:bg-[#EFEFEA]/50 transition-colors"
                      >
                        <p className="text-[9px] font-bold uppercase tracking-widest text-[#131218]/25 mb-1">
                          {c.platform} · {c.contentType}
                        </p>
                        <p className="text-[12px] font-semibold text-[#131218] leading-snug">{c.title}</p>
                        {c.publishWindow && (
                          <p className="text-[10px] text-[#131218]/35 mt-1">Window: {c.publishWindow}</p>
                        )}
                      </a>
                    ))}
                  </div>
                </div>
              )}

            </div>

            {/* ── RIGHT COLUMN ──────────────────────────────────────────────── */}
            <div className="flex flex-col gap-4">

              {/* Meeting Prep from briefing */}
              {dailyBriefing?.meetingPrep && (
                <div className="bg-white rounded-2xl border border-[#E0E0D8] overflow-hidden">
                  <div className="px-5 py-3 border-b border-[#EFEFEA]">
                    <p className="text-xs font-bold text-[#131218]">Meeting prep</p>
                  </div>
                  <div className="px-5 py-4">
                    <pre className="text-[11px] text-[#131218]/65 leading-[1.65] whitespace-pre-wrap font-sans">
                      {dailyBriefing.meetingPrep.slice(0, 700)}
                    </pre>
                  </div>
                </div>
              )}

              {/* Market Signals from briefing */}
              {dailyBriefing?.marketSignals && (
                <div className="bg-white rounded-2xl border border-[#E0E0D8] overflow-hidden">
                  <div className="px-5 py-3 border-b border-[#EFEFEA]">
                    <p className="text-xs font-bold text-[#131218]">Market signals</p>
                  </div>
                  <div className="px-5 py-4">
                    <pre className="text-[11px] text-[#131218]/65 leading-[1.65] whitespace-pre-wrap font-sans">
                      {dailyBriefing.marketSignals.slice(0, 500)}
                    </pre>
                  </div>
                </div>
              )}

              {/* Pending review queue */}
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
                  {withBlockers.slice(0, 2).map(p => (
                    <Link key={`blk-${p.id}`} href={`/admin/projects/${p.id}`} className="flex items-center gap-3 px-5 py-3.5 hover:bg-[#EFEFEA]/40 transition-colors">
                      <div className="w-5 h-5 rounded-md bg-red-100 flex items-center justify-center shrink-0">
                        <span className="text-[9px] font-bold text-red-600">!</span>
                      </div>
                      <p className="text-[11px] font-medium text-[#131218] flex-1 min-w-0 truncate">{p.name}</p>
                      <span className="text-[9px] font-bold text-[#131218]/30 shrink-0">Blocker</span>
                    </Link>
                  ))}
                  {urgentDecisions.slice(0, 2).map(d => (
                    <Link key={`urg-${d.id}`} href="/admin/decisions" className="flex items-center gap-3 px-5 py-3.5 hover:bg-[#EFEFEA]/40 transition-colors">
                      <div className="w-5 h-5 rounded-md bg-red-100 flex items-center justify-center shrink-0">
                        <span className="text-[9px] font-bold text-red-600">!</span>
                      </div>
                      <p className="text-[11px] font-medium text-[#131218] flex-1 min-w-0 truncate">{d.title}</p>
                      <span className="text-[9px] font-bold text-[#131218]/30 shrink-0">Decision</span>
                    </Link>
                  ))}
                  {needsUpdate.slice(0, 3).map(p => (
                    <Link key={`upd-${p.id}`} href={`/admin/projects/${p.id}`} className="flex items-center gap-3 px-5 py-3.5 hover:bg-[#EFEFEA]/40 transition-colors">
                      <div className="w-5 h-5 rounded-md bg-[#EFEFEA] flex items-center justify-center shrink-0">
                        <span className="text-[9px] font-bold text-amber-500">!</span>
                      </div>
                      <p className="text-[11px] font-medium text-[#131218] flex-1 min-w-0 truncate">{p.name}</p>
                      <span className="text-[9px] font-bold text-[#131218]/30 shrink-0">Update</span>
                    </Link>
                  ))}
                  {totalPending === 0 && (
                    <div className="px-5 py-5 text-center">
                      <p className="text-[11px] text-[#131218]/25 font-medium">Queue clear</p>
                    </div>
                  )}
                </div>
                <div className="px-5 py-2.5 border-t border-[#EFEFEA]">
                  <Link href="/admin/decisions" className="text-[10px] font-bold text-[#131218]/30 hover:text-[#131218]/70 transition-colors uppercase tracking-widest">
                    All decisions →
                  </Link>
                </div>
              </div>

              {/* Stale projects */}
              {staleProjects.length > 0 && (
                <div className="bg-white rounded-2xl border border-red-200 overflow-hidden">
                  <div className="h-1 bg-red-400" />
                  <div className="px-5 py-3 border-b border-[#EFEFEA] flex items-center justify-between">
                    <p className="text-xs font-bold text-red-600">Stale — 30d+ no update</p>
                    <span className="text-[10px] font-bold bg-red-50 text-red-600 border border-red-200 px-2 py-0.5 rounded-full">{staleProjects.length}</span>
                  </div>
                  <div className="divide-y divide-[#EFEFEA]">
                    {staleProjects.slice(0, 3).map(p => (
                      <Link key={p.id} href={`/admin/projects/${p.id}`} className="flex items-center gap-3 px-5 py-3.5 hover:bg-[#EFEFEA]/40 transition-colors group">
                        <span className="w-1.5 h-1.5 rounded-full bg-red-400 shrink-0" />
                        <p className="text-[11px] font-medium text-[#131218] flex-1 min-w-0 truncate">{p.name}</p>
                        <span className="text-[10px] font-bold text-red-400 shrink-0">{daysSince(p.lastUpdate)}d</span>
                      </Link>
                    ))}
                  </div>
                </div>
              )}

              {/* OS pulse */}
              <div className="bg-[#131218]/4 rounded-xl px-4 py-3 flex items-center gap-2.5">
                <div className="w-2 h-2 rounded-full bg-[#c8f55a]" />
                <div>
                  <p className="text-[10px] font-bold text-[#131218]/50">OS v2 · {coldOnly.length} cold · {dormantRelationships.length} dormant</p>
                  <a href="/admin/agents" className="text-[9px] text-[#131218]/30 hover:text-[#131218]/60 transition-colors">Agent log →</a>
                </div>
              </div>

            </div>
          </div>

        </div>
      </main>
    </div>
  );
}
