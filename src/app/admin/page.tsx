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
import { InboxTriage, type InboxItem } from "@/components/InboxTriage";
import { DraftCheckinButton } from "@/components/DraftCheckinButton";
import { ChiefOfStaffDesk } from "@/components/ChiefOfStaffDesk";
import { CandidateSection } from "@/components/CandidateSection";
import OpportunityExplorer from "@/components/OpportunityExplorer";
import {
  getProjectsOverview,
  getDecisionItems,
  getDailyBriefing,
  getAgentDrafts,
  getCoSTasks,
  getCandidateOpportunities,
  getOpportunitiesByScope,
  getColdRelationships,
  getReadyContent,
  type CoSTask,
} from "@/lib/notion";
import { ADMIN_NAV } from "@/lib/admin-nav";
import { requireAdmin } from "@/lib/require-admin";
import { TriggerBriefingButton } from "@/components/TriggerBriefingButton";
import { ReadyForJoseSection } from "@/components/ReadyForJoseSection";

export { ADMIN_NAV as NAV } from "@/lib/admin-nav";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function daysSince(dateStr: string | null): number | null {
  if (!dateStr) return null;
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
}

/** Best available activity signal: last status update OR last evidence OR last meeting */
function bestActivity(p: { lastUpdate: string | null; lastEvidenceDate?: string | null; lastMeetingDate?: string | null }): string | null {
  return [p.lastUpdate, p.lastEvidenceDate ?? null, p.lastMeetingDate ?? null]
    .filter(Boolean)
    .sort()
    .pop() ?? null;
}

function warmthLabel(days: number | null): { label: string; dot: string; text: string } {
  if (days === null) return { label: "Dormant", dot: "bg-[#131218]/15", text: "text-[#131218]/35" };
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

// ─── Focus of the Day — recommendation engine ─────────────────────────────────

type FocusLink = { label: string; url: string; style: "primary" | "secondary" };

type FocusRecommendation = {
  action: string;
  timeEstimate: string;
  whyToday: string;
  links: FocusLink[];
  winReason: string;
};

function computeFocusRecommendation(
  cosTasks: CoSTask[],
  inboxItems: InboxItem[],
  agentDrafts: { id: string; title: string; notionUrl: string; opportunityId: string | null }[],
): FocusRecommendation | null {
  const now = Date.now();

  type Candidate = { task: CoSTask; score: number; winReason: string };
  const candidates: Candidate[] = [];

  for (const task of cosTasks) {
    if (task.taskStatus === "done" || task.taskStatus === "dropped") continue;

    const isGrant          = task.opportunityType === "Grant";
    const hasExplicitPending = !!task.pendingAction
      && !task.pendingAction.startsWith("SIGNALS:")
      && !task.pendingAction.startsWith("Inbox signal:")
      && task.pendingAction.trim().length >= 20;
    const reviewIsDoc      = !!task.reviewUrl && !task.reviewUrl.includes("mail.google.com");

    // Suppress: grants without explicit interest
    if (isGrant && task.opportunityStage !== "Active" && !hasExplicitPending) continue;

    // Suppress: vague follow-ups — no specific action described
    if (
      task.loopType === "follow-up" &&
      !hasExplicitPending &&
      !reviewIsDoc
    ) continue;

    // Suppress: generic "Follow up" title with no context
    const titleLower = task.taskTitle.toLowerCase();
    if (
      (titleLower.startsWith("follow up") || titleLower.startsWith("follow-up")) &&
      !hasExplicitPending
    ) continue;

    let score = 0;
    const reasons: string[] = [];

    // Urgency
    if (task.urgency === "critical")  { score += 30; reasons.push("critical urgency"); }
    else if (task.urgency === "high") { score += 20; reasons.push("high urgency"); }

    if (task.dueDate) {
      const msTo = new Date(task.dueDate).getTime() - now;
      if (msTo >= 0 && msTo <= 2 * 86400000)      { score += 25; reasons.push("due in ≤2 days"); }
      else if (msTo >= 0 && msTo <= 7 * 86400000)  { score += 15; reasons.push("due this week"); }
    }

    if (task.interventionMoment === "urgent" || task.interventionMoment === "next_meeting") {
      score += 10; reasons.push("imminent meeting");
    }

    // Leverage
    if (task.loopType === "blocker")  { score += 20; reasons.push("unblocks progress"); }
    if (task.loopType === "decision") { score += 15; reasons.push("decision open"); }
    if (task.loopType === "prep" && task.dueDate) {
      const msTo = new Date(task.dueDate).getTime() - now;
      if (msTo >= 0 && msTo <= 7 * 86400000) { score += 10; reasons.push("prep needed"); }
    }

    // Prepared work
    if (reviewIsDoc)          { score += 15; reasons.push("doc ready"); }
    if (hasExplicitPending)   { score += 10; reasons.push("specific action described"); }

    // Penalise passive inbound with no action
    if (task.entrySignal === "inbound" && !hasExplicitPending) score -= 15;

    if (score > 0) {
      candidates.push({ task, score, winReason: reasons.join(" · ") });
    }
  }

  if (candidates.length === 0) {
    // Fallback: urgent inbox item
    const urgentInbox = inboxItems.find(i => i.label === "Urgent");
    if (urgentInbox) {
      return {
        action:       `Spend 20 minutes replying to "${urgentInbox.subject}" from ${urgentInbox.fromName}.`,
        timeEstimate: "20 min",
        whyToday:     urgentInbox.daysWaiting >= 2
          ? `${urgentInbox.daysWaiting} days waiting — needs a reply today.`
          : "Marked urgent in your inbox.",
        links:  [{ label: "Open thread", url: urgentInbox.gmailUrl, style: "primary" }],
        winReason: "inbox fallback — no actionable CoS tasks",
      };
    }
    return null;
  }

  candidates.sort((a, b) => b.score - a.score);
  const { task, winReason } = candidates[0];

  const hasExplicitPending = !!task.pendingAction
    && !task.pendingAction.startsWith("SIGNALS:")
    && !task.pendingAction.startsWith("Inbox signal:")
    && task.pendingAction.trim().length >= 20;
  const reviewIsDoc      = !!task.reviewUrl && !task.reviewUrl.includes("mail.google.com");

  // Time estimate
  const timeMap: Record<CoSTask["loopType"], string> = {
    blocker:     "30 min",
    decision:    "30 min",
    prep:        reviewIsDoc || hasExplicitPending ? "45 min" : "30 min",
    review:      reviewIsDoc ? "1 hour" : "30 min",
    commitment:  "45 min",
    "follow-up": "30 min",
  };
  const timeEstimate = timeMap[task.loopType] ?? "30 min";

  // Meeting label for due date
  const meetingLabel = task.dueDate
    ? (() => {
        const msTo = new Date(task.dueDate).getTime() - now;
        const days = Math.floor(msTo / 86400000);
        if (days === 0) return "today";
        if (days === 1) return "tomorrow";
        return new Date(task.dueDate).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "short" });
      })()
    : null;

  // Action sentence
  let action: string;
  const pendingSnippet = hasExplicitPending
    ? task.pendingAction!.trim().replace(/\.$/, "").slice(0, 80)
    : null;

  if (task.loopType === "blocker") {
    action = `Spend ${timeEstimate} resolving ${pendingSnippet ?? `the ${task.opportunityName} blocker`} with ${task.orgName}.`;
  } else if (task.loopType === "decision") {
    action = `Spend ${timeEstimate} making the call on ${pendingSnippet ?? task.taskTitle} — ${task.orgName} is waiting.`;
  } else if (task.loopType === "prep") {
    if (pendingSnippet) {
      action = `Spend ${timeEstimate} on ${pendingSnippet}${meetingLabel ? ` before the ${task.orgName} meeting ${meetingLabel}` : ""}.`;
    } else {
      action = `Spend ${timeEstimate} preparing for the ${task.orgName} meeting${meetingLabel ? ` ${meetingLabel}` : ""}.`;
    }
  } else if (task.loopType === "review") {
    if (reviewIsDoc) {
      action = `Spend ${timeEstimate} reviewing the ${task.opportunityName} document${pendingSnippet ? ` — ${pendingSnippet}` : ""}.`;
    } else {
      action = `Spend ${timeEstimate} clearing the ${task.orgName} thread${pendingSnippet ? ` — ${pendingSnippet}` : ""}.`;
    }
  } else if (task.loopType === "commitment") {
    action = `Spend ${timeEstimate} delivering on your ${task.opportunityName} commitment to ${task.orgName}.`;
  } else {
    action = `Spend ${timeEstimate} on ${pendingSnippet ?? task.taskTitle} with ${task.orgName}.`;
  }

  // Why today
  let whyToday: string;
  if (task.dueDate) {
    const msTo = new Date(task.dueDate).getTime() - now;
    const days = Math.floor(msTo / 86400000);
    if (days <= 1) {
      whyToday = task.loopType === "prep"
        ? `Meeting ${meetingLabel} — prepare now or it's too late.`
        : `Deadline ${meetingLabel} — last window to act.`;
    } else if (days <= 7) {
      whyToday = task.loopType === "prep"
        ? `Meeting with ${task.orgName} ${meetingLabel}${reviewIsDoc ? " — document ready." : "."}`
        : `Due ${meetingLabel}.`;
    } else {
      whyToday = task.loopType === "blocker"
        ? `Unblocks ${task.opportunityName}.`
        : `Top item in your action queue.`;
    }
  } else if (task.loopType === "blocker") {
    whyToday = `Unblocks ${task.opportunityName} progress.`;
  } else if (task.loopType === "decision") {
    whyToday = "Decision open — needs your call to move forward.";
  } else if (reviewIsDoc) {
    whyToday = "Document is ready to review — no waiting on others.";
  } else {
    whyToday = "Top item in your action queue.";
  }

  // Check if there's a matching draft for this task
  const linkedDraft = agentDrafts.find(d =>
    d.opportunityId && task.linkedEntityId && d.opportunityId === task.linkedEntityId
  );
  if (linkedDraft) {
    whyToday += " Draft is ready.";
  }

  // Links
  const links: FocusLink[] = [];
  if (reviewIsDoc && task.reviewUrl) {
    links.push({ label: "Open doc", url: task.reviewUrl, style: "primary" });
  } else if (task.reviewUrl) {
    links.push({ label: "Open thread", url: task.reviewUrl, style: "primary" });
  }
  if (linkedDraft) {
    links.push({ label: "Review draft", url: linkedDraft.notionUrl, style: "primary" });
  }
  links.push({ label: "Notion", url: task.notionUrl, style: "secondary" });

  return { action, timeEstimate, whyToday, links, winReason };
}

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

async function fetchInboxServer(): Promise<{ items: InboxItem[]; total_scanned: number }> {
  try {
    const base = process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : "http://localhost:3000";
    const res = await fetch(`${base}/api/inbox-triage`, {
      headers: { "x-agent-key": "ch-os-agent-2024-secure" },
      cache: "no-store",
    });
    if (!res.ok) return { items: [], total_scanned: 0 };
    return res.json();
  } catch {
    return { items: [], total_scanned: 0 };
  }
}

export default async function AdminPage() {
  const adminUser = await requireAdmin();

  const [
    projects,
    decisions,
    dailyBriefing,
    agentDrafts,
    gmailDrafts,
    approvedDrafts,
    cosTasks,
    candidates,
    opportunities,
    coldRelationships,
    readyContent,
    inboxData,
  ] = await Promise.all([
    getProjectsOverview(),
    getDecisionItems("Open"),
    getDailyBriefing(),
    getAgentDrafts("Pending Review"),
    getAgentDrafts("Draft Created"),
    getAgentDrafts("Approved"),
    getCoSTasks(),
    getCandidateOpportunities(),
    getOpportunitiesByScope(),
    getColdRelationships(),
    getReadyContent(),
    fetchInboxServer(),
  ]);

  // ── Derived state ────────────────────────────────────────────────────────────
  const withBlockers    = projects.filter(p => p.blockerCount > 0);
  const needsUpdate     = projects.filter(p => p.updateNeeded);
  const staleProjects   = projects.filter(p => { const d = daysSince(bestActivity(p)); return !p.updateNeeded && d !== null && d > 30; });
  const workroomCount   = projects.filter(p => p.primaryWorkspace === "workroom").length;
  const garageCount     = projects.filter(p => p.primaryWorkspace === "garage").length;
  const untypedCount    = projects.filter(p => !p.primaryWorkspace || (p.primaryWorkspace !== "workroom" && p.primaryWorkspace !== "garage")).length;

  const openDecisions   = decisions; // pre-filtered to "Open" at DB level in getDecisionItems("Open")
  const urgentDecisions = openDecisions.filter(d => d.priority === "P1 Critical");
  // Deadlines: open decisions with a due date within the next 14 days
  const in14days        = Date.now() + 14 * 86400000;
  const withDeadlines   = openDecisions.filter(d => d.dueDate && new Date(d.dueDate).getTime() <= in14days);
  const blockerCount    = withBlockers.length;
  const deadlineCount   = withDeadlines.length;
  // Banner: only show if there are P1 decisions OR imminent deadlines (≤7 days)
  const in7days         = Date.now() + 7 * 86400000;
  const imminentDeadlines = openDecisions.filter(d => d.dueDate && new Date(d.dueDate).getTime() <= in7days);
  const p1Decisions     = openDecisions.filter(d => d.priority === "P1 Critical");
  const showBanner      = p1Decisions.length > 0 || imminentDeadlines.length > 0;
  // Widget: all open decisions Jose needs to act on directly
  const deskDecisions   = openDecisions.filter(d =>
    d.decisionType === "Missing Input" ||
    d.decisionType === "Approval" ||
    d.decisionType === "Policy / Automation Decision"
  );
  const totalPending    = deskDecisions.length;

  // Dedup: filter Opportunities Explorer to exclude items already shown in CoS Tasks.
  // When the loop engine is active, t.id is a Supabase UUID — not a Notion page ID.
  // Use linkedEntityId (Notion page ID of the linked opportunity) for dedup when available.
  const cosTaskIds        = new Set(cosTasks.map(t => t.linkedEntityId ?? t.id));
  const filteredOpps      = {
    ch:        opportunities.ch.filter(o => !cosTaskIds.has(o.id)),
    portfolio: opportunities.portfolio.filter(o => !cosTaskIds.has(o.id)),
  };

  const dormantRelationships = coldRelationships.filter(r => r.warmth === "Dormant");
  const coldOnly             = coldRelationships.filter(r => r.warmth === "Cold");

  // ── Focus recommendation — scored selection from CoS tasks + inbox fallback
  const focusRec = computeFocusRecommendation(cosTasks, inboxData.items, agentDrafts);
  // focusSuggestion: top CoS task with imminent meeting (≤7 days), used in Focus of the Day section
  const focusSuggestion = cosTasks.find(task => {
    if (!task.dueDate) return false;
    const msTo = new Date(task.dueDate).getTime() - Date.now();
    return msTo >= 0 && msTo <= 7 * 86400000;
  }) ?? cosTasks[0] ?? null;

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
            HOME · {dateLabel.toUpperCase()} · v2
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
          {focusRec ? (
            <div className="bg-[#131218] rounded-2xl px-7 py-6 border border-[#131218]">
              <div className="flex items-start justify-between gap-6">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2.5 mb-3">
                    <p className="text-[9px] font-bold uppercase tracking-[2.5px] text-[#c8f55a]/60">
                      Focus of the Day
                    </p>
                    <span className="text-[9px] font-bold text-[#131218] bg-[#c8f55a]/90 px-2 py-0.5 rounded-full">
                      {focusRec.timeEstimate}
                    </span>
                  </div>
                  <p className="text-[15px] font-semibold text-white leading-[1.6] max-w-[640px]">
                    {focusRec.action}
                  </p>
                  <p className="text-[11px] text-white/45 mt-2 leading-snug">
                    {focusRec.whyToday}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-2 shrink-0">
                  {focusRec.links.map(link => (
                    <a
                      key={link.url}
                      href={link.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={
                        link.style === "primary"
                          ? "text-[10px] font-bold text-[#131218] bg-[#c8f55a] hover:bg-white px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap"
                          : "text-[10px] font-bold text-white/50 hover:text-white border border-white/10 hover:border-white/30 px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap"
                      }
                    >
                      {link.label} →
                    </a>
                  ))}
                </div>
              </div>
              {dailyBriefing?.generatedAt && (
                <p className="text-[8px] text-white/15 mt-4 pt-3 border-t border-white/5">
                  Briefing generated at {new Date(dailyBriefing.generatedAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
                </p>
              )}
            </div>
          ) : (
            <div className="bg-[#131218]/6 border border-dashed border-[#131218]/15 rounded-2xl px-7 py-5 flex items-center justify-between gap-4">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[2.5px] text-[#131218]/30 mb-1">Focus of the Day</p>
                <p className="text-[13px] text-[#131218]/40">Nothing actionable in queue right now.</p>
                <p className="text-[11px] text-[#131218]/25 mt-0.5">Focus appears when CoS tasks, inbox, or drafts have a clear next action.</p>
              </div>
              <TriggerBriefingButton />
            </div>
          )}

          {/* ── 2. P1 Banner — only P1 Critical decisions or deadlines ≤7 days ── */}
          {showBanner && (
            <div className="flex items-center gap-3 bg-red-50 border border-red-200 rounded-xl px-5 py-3.5">
              <span className="w-2 h-2 rounded-full bg-red-500 shrink-0 animate-pulse" />
              <p className="text-sm text-[#131218] flex-1 min-w-0">
                {p1Decisions.length > 0 && (
                  <><strong>{p1Decisions.length} P1 decision{p1Decisions.length !== 1 ? "s" : ""}</strong>{" · "}{p1Decisions.slice(0, 2).map(d => d.title).join(" · ")}</>
                )}
                {imminentDeadlines.length > 0 && (
                  <>{p1Decisions.length > 0 ? " · " : ""}<strong>{imminentDeadlines.length} deadline{imminentDeadlines.length !== 1 ? "s" : ""} this week</strong>
                  {imminentDeadlines.slice(0, 1).map(d => (
                    <span key={d.id}>{" · "}{d.title}{d.dueDate ? ` — closes ${new Date(d.dueDate).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}` : ""}</span>
                  ))}</>
                )}
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
                <span className="text-[10px] font-semibold text-[#131218]/40">
                  {workroomCount} Workroom · {garageCount} Garage{untypedCount > 0 ? ` · ${untypedCount} sin tipo` : ""}
                </span>
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
              <p className={`text-3xl font-[800] tracking-tight leading-none mb-2 ${openDecisions.length > 0 ? "text-amber-500" : "text-[#131218]/15"}`}>
                {openDecisions.length}
              </p>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-semibold text-[#131218]/40">
                  {totalPending > 0 ? `${totalPending} requieren acción · ` : ""}{urgentDecisions.length} urgentes · {needsUpdate.length} por actualizar
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
                    label: "CoS tasks activas",
                    count: cosTasks.length,
                    activeColor: "text-amber-500",
                    hint: "Tasks with meetings, pending reviews, or explicit actions",
                  },
                  {
                    label: "Candidatos sin revisar",
                    count: candidates.length,
                    activeColor: "text-amber-400",
                    hint: "Use Scan inbox to detect new candidates",
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

          {/* ── 4c. Ready for Jose — prepared work already done ───────────── */}
          {(gmailDrafts.length > 0 || approvedDrafts.length > 0) && (
            <div>
              <SectionHeader
                label="Ready for Jose"
                count={gmailDrafts.length + approvedDrafts.length}
              />
              <ReadyForJoseSection
                gmailDrafts={gmailDrafts}
                approvedDrafts={approvedDrafts}
              />
            </div>
          )}

          {/* ── 4b. Inbox Triage ──────────────────────────────────────────── */}
          <div>
            <SectionHeader label="Inbox — needs attention" />
            <InboxTriage initialItems={inboxData.items} initialScanned={inboxData.total_scanned} />
          </div>

          {/* ── Two-column main layout ─────────────────────────────────────── */}
          <div className="grid grid-cols-[1fr_340px] gap-6 items-start">

            {/* ── LEFT COLUMN ───────────────────────────────────────────────── */}
            <div className="space-y-6">

              {/* ── 5a. Opportunity Candidates — always visible so Scan button is accessible */}
              <div>
                <SectionHeader
                  label="Unreviewed signals"
                  count={candidates.length}
                />
                <CandidateSection candidates={candidates} />
              </div>

              {/* ── 5b. Chief of Staff — Tasks ───────────────────────────── */}
              <div>
                <SectionHeader
                  label="Chief of Staff · Tasks"
                  count={cosTasks.length}
                  action={cosTasks.length > 0 ? "All opportunities →" : undefined}
                  href="/admin/opportunities"
                />
                <ChiefOfStaffDesk tasks={cosTasks} />
              </div>

              {/* ── 6. My Commitments (from briefing + decisions) ─────────── */}
              {(dailyBriefing?.myCommitments || openDecisions.length > 0) && (
                <div>
                  <SectionHeader label="Open decisions" count={openDecisions.length} action="Decisions" href="/admin/decisions" />
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
                        <div className={`w-5 h-5 rounded-md flex items-center justify-center shrink-0 ${d.priority === "P1 Critical" ? "bg-red-100" : "bg-[#EFEFEA]"}`}>
                          <span className={`text-[9px] font-bold ${d.priority === "P1 Critical" ? "text-red-600" : "text-[#131218]/35"}`}>!</span>
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
                      const activityDate = [p.lastUpdate, p.lastEvidenceDate, p.lastMeetingDate].filter(Boolean).sort().pop() ?? null;
                      const days    = daysSince(activityDate);
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
              {(filteredOpps.ch.length > 0 || filteredOpps.portfolio.length > 0) && (
                <div>
                  <SectionHeader label="Opportunities — explore" count={filteredOpps.ch.length + filteredOpps.portfolio.length} />
                  <OpportunityExplorer ch={filteredOpps.ch} portfolio={filteredOpps.portfolio} />
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

              {/* On your desk — only things Jose can act on */}
              <div className="bg-white rounded-2xl border border-[#E0E0D8] overflow-hidden">
                <div className="px-5 py-3.5 border-b border-[#EFEFEA] flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-lg bg-[#131218] flex items-center justify-center shrink-0">
                      <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
                      </svg>
                    </div>
                    <p className="text-xs font-bold text-[#131218]">On your desk</p>
                  </div>
                  {totalPending > 0 && (
                    <span className="text-[10px] font-bold bg-[#131218] text-white px-2 py-0.5 rounded-full">{totalPending}</span>
                  )}
                </div>
                <div className="divide-y divide-[#EFEFEA]">
                  {/* All open decisions Jose needs to act on */}
                  {deskDecisions.slice(0, 5).map(d => {
                    const isApproval = d.decisionType === "Approval";
                    const isPolicy   = d.decisionType === "Policy / Automation Decision";
                    const isUrgent   = d.priority === "P1 Critical" || d.priority === "High";
                    const actionLabel = isApproval ? "Approve" : isPolicy ? "Decide" : "Input needed";
                    return (
                      <Link key={`dec-${d.id}`} href="/admin/decisions" className="flex items-center gap-3 px-5 py-3.5 hover:bg-[#EFEFEA]/40 transition-colors">
                        <div className={`w-5 h-5 rounded-md flex items-center justify-center shrink-0 ${isUrgent ? "bg-red-100" : "bg-[#EFEFEA]"}`}>
                          <span className={`text-[9px] font-bold ${isUrgent ? "text-red-600" : "text-[#131218]/40"}`}>{isApproval ? "✓" : "?"}</span>
                        </div>
                        <p className="text-[11px] font-medium text-[#131218] flex-1 min-w-0 truncate">{d.title}</p>
                        <span className="text-[9px] font-bold text-[#131218]/30 shrink-0">{actionLabel}</span>
                      </Link>
                    );
                  })}
                  {totalPending === 0 && (
                    <div className="px-5 py-5 text-center">
                      <p className="text-[11px] text-[#131218]/25 font-medium">Desk clear ✓</p>
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
                        <span className="text-[10px] font-bold text-red-400 shrink-0">{daysSince(bestActivity(p)) ?? "—"}d</span>
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
