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
import { ChiefOfStaffDesk, ParkedLoopsSection } from "@/components/ChiefOfStaffDesk";
import { DiscoverySection } from "@/components/DiscoverySection";
import { MarketSignalsPanel } from "@/components/MarketSignalsPanel";
import { HallOrgsColdRelations, HallOrgsClassMix } from "@/components/HallOrgsWidgets";
import { HallOppFreshnessRadar } from "@/components/HallOppFreshnessRadar";
import { HallPortfolioPulse } from "@/components/HallPortfolioPulse";
import { HallAskQueue } from "@/components/HallAskQueue";
import { HallTimeAllocation } from "@/components/HallTimeAllocation";
import { HallCommitmentLedger } from "@/components/HallCommitmentLedger";
import { HallNextMeeting } from "@/components/HallNextMeeting";
import { HallAutopilotLog } from "@/components/HallAutopilotLog";
import { HallTabs } from "@/components/HallTabs";
import OpportunityExplorer from "@/components/OpportunityExplorer";
import {
  getProjectsOverview,
  getDecisionItems,
  getDailyBriefing,
  getLatestMarketSignals,
  getRecentInsightBriefBriefs,
  getAgentDrafts,
  getOutboxDrafts,
  getCoSTasks,
  getParkedLoops,
  getRadarLoops,
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
import { SuggestedTimeBlocks } from "@/components/SuggestedTimeBlocks";
import { HallManualTriggers } from "@/components/HallManualTriggers";
import { HallLiveClock } from "@/components/HallLiveClock";
import { getAgentsOnlineCount } from "@/lib/hall-agents-count";

export { ADMIN_NAV as NAV } from "@/lib/admin-nav";
export const dynamic = "force-dynamic";

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

// Q4 — "Hot" is a HEALTHY state (recent activity), so it should be green,
// not red. Red is reserved for alarming signals (blockers, stale >30d).
function warmthLabel(days: number | null): { label: string; dot: string; text: string } {
  if (days === null) return { label: "Dormant", dot: "bg-[#131218]/15", text: "text-[#131218]/35" };
  if (days <= 3)  return { label: "Hot",     dot: "bg-emerald-500",  text: "text-emerald-700" };
  if (days <= 10) return { label: "Warm",    dot: "bg-[#c8f55a]",    text: "text-[#131218]/70" };
  if (days <= 21) return { label: "Warm",    dot: "bg-amber-300",    text: "text-amber-600" };
  if (days <= 35) return { label: "Cold",    dot: "bg-blue-400",     text: "text-blue-500" };
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

    // Track A: passive discovery items are never eligible for Focus
    if (task.isPassiveDiscovery) continue;

    const isGrant          = task.opportunityType === "Grant";
    const hasExplicitPending = !!task.pendingAction
      && !task.pendingAction.startsWith("SIGNALS:")
      && !task.pendingAction.startsWith("Inbox signal:")
      && !task.pendingAction.startsWith("Grant Radar")   // auto-generated scan metadata
      && !task.pendingAction.startsWith("Radar match")   // auto-generated scan metadata
      && task.pendingAction.trim().length >= 20;
    const reviewIsDoc      = !!task.reviewUrl && !task.reviewUrl.includes("mail.google.com");

    // Suppress: auto-generated Grant Radar scan results — never founder-initiated
    if (task.pendingAction?.startsWith("Grant Radar") || task.pendingAction?.startsWith("Radar match")) continue;

    // Suppress: grants without explicit interest
    if (isGrant && task.opportunityStage !== "Active" && !hasExplicitPending) continue;

    // Suppress: vague follow-ups — no link to act on and no specific action
    // (a Gmail thread URL counts — it IS something to open and reply to)
    if (
      task.loopType === "follow-up" &&
      !hasExplicitPending &&
      !task.reviewUrl
    ) continue;

    // Suppress: generic "Follow up" title with no URL and no context
    const titleLower = task.taskTitle.toLowerCase();
    if (
      (titleLower.startsWith("follow up") || titleLower.startsWith("follow-up")) &&
      !hasExplicitPending &&
      !task.reviewUrl
    ) continue;

    let score = 1; // base: every non-suppressed task qualifies; scoring picks the best
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

    // Prepared work — doc > gmail thread (both are actionable, doc is higher signal)
    if (reviewIsDoc)          { score += 15; reasons.push("doc ready"); }
    else if (task.reviewUrl)  { score += 5;  reasons.push("thread to reply"); }
    if (hasExplicitPending)   { score += 10; reasons.push("specific action described"); }

    // Founder ownership (Track F) — strategic items Jose leads directly
    if (task.signalReason?.startsWith("Founder-owned")) {
      score += 15; reasons.push("founder-owned");
    }

    candidates.push({ task, score, winReason: reasons.join(" · ") });
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
  } else if (task.loopType === "follow-up") {
    const reviewIsGmail = !!task.reviewUrl && task.reviewUrl.includes("mail.google.com");
    if (pendingSnippet) {
      action = `Spend ${timeEstimate} on ${pendingSnippet} with ${task.orgName}.`;
    } else if (reviewIsGmail) {
      action = `Spend ${timeEstimate} replying to the ${task.orgName} thread — ${task.opportunityName}.`;
    } else {
      action = `Spend ${timeEstimate} following up with ${task.orgName} on ${task.opportunityName}.`;
    }
  } else {
    action = `Spend ${timeEstimate} on ${pendingSnippet ?? task.taskTitle} with ${task.orgName}.`;
  }

  // Check if there's a matching draft for this task
  const linkedDraft = agentDrafts.find(d =>
    d.opportunityId && task.linkedEntityId && d.opportunityId === task.linkedEntityId
  );

  // Why today — C+: up to 2 specific reasons; avoid generic fallbacks
  const isFounderOwned = task.signalReason?.startsWith("Founder-owned") ?? false;
  // signalReason is human-readable for Notion-fallback tasks; loop engine tasks store internal metadata ("N signals · score X")
  const humanSignalReason = (() => {
    if (!task.signalReason) return null;
    const s = task.signalReason.replace(/^Founder-owned · /, "").trim();
    if (/^\d+ signal/.test(s)) return null;
    return s;
  })();

  const whyParts: string[] = [];

  // Primary: time-based or loop-type structural signal
  if (task.dueDate) {
    const msTo = new Date(task.dueDate).getTime() - now;
    const days = Math.floor(msTo / 86400000);
    if (msTo < 0) {
      whyParts.push(`Overdue since ${meetingLabel} — waiting on you.`);
    } else if (days <= 1) {
      whyParts.push(task.loopType === "prep"
        ? `Meeting ${meetingLabel} — prepare now or it's too late.`
        : `Deadline ${meetingLabel} — last window to act.`);
    } else if (days <= 7) {
      whyParts.push(task.loopType === "prep"
        ? `Meeting with ${task.orgName} ${meetingLabel}${reviewIsDoc ? " — document ready." : "."}`
        : `Due ${meetingLabel}.`);
    }
    // date is far out — fall through to signal-based reasoning below
  }

  if (whyParts.length === 0) {
    if (task.loopType === "blocker") {
      whyParts.push(`Unblocks ${task.opportunityName} progress.`);
    } else if (task.loopType === "decision") {
      whyParts.push("Decision open — needs your call to move forward.");
    } else if (reviewIsDoc) {
      whyParts.push("Document is ready to review — no waiting on others.");
    } else if (humanSignalReason) {
      whyParts.push(humanSignalReason.endsWith(".") ? humanSignalReason : `${humanSignalReason}.`);
    } else if (task.reviewUrl?.includes("mail.google.com")) {
      whyParts.push("Email thread waiting — reply needed.");
    }
  }

  // Secondary: prepared work or ownership signal (one more if room)
  if (whyParts.length < 2) {
    if (linkedDraft) {
      whyParts.push("Draft is ready to send.");
    } else if (isFounderOwned) {
      whyParts.push("You own this directly.");
    }
  }

  // Absolute fallback
  if (whyParts.length === 0) {
    whyParts.push(isFounderOwned ? "You own this directly — top of your action queue." : "Top item in your action queue.");
  }

  let whyToday = whyParts.join(" ");

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

// Compact quiet-state row — used in place of a large dead slab when a section
// has nothing to show. Keeps the header visible so state is auditable, but the
// row is ~36px instead of ~120px.
function QuietRow({ label, note, action }: {
  label: string;
  note: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 bg-white/50 border border-dashed border-[#E0E0D8] rounded-xl px-4 py-2">
      <span className="w-1.5 h-1.5 rounded-full bg-[#131218]/15 shrink-0" />
      <span className="text-[10px] font-bold uppercase tracking-[2px] text-[#131218]/30">{label}</span>
      <span className="text-[11px] text-[#131218]/45 flex-1 min-w-0 truncate">{note}</span>
      {action}
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
    latestMarketSignals,
    marketSignalBriefs,
    agentDrafts,
    gmailDrafts,
    approvedDrafts,
    cosTasks,
    parkedTasks,
    radarLoops,
    candidates,
    opportunities,
    coldRelationships,
    readyContent,
    inboxData,
    agentsOnline,
  ] = await Promise.all([
    getProjectsOverview(),
    getDecisionItems("Open"),
    getDailyBriefing(),
    getLatestMarketSignals(),
    getRecentInsightBriefBriefs(),
    // Outbox: only Pending Review drafts whose approval triggers an external
    // action (LinkedIn, email, delegation). Market Signal + Quick Win Scan are
    // filtered out — they surface in their own Hall sections, not in approval.
    getOutboxDrafts(),
    getAgentDrafts("Draft Created"),
    getAgentDrafts("Approved"),
    getCoSTasks(),
    getParkedLoops(),
    getRadarLoops(),
    getCandidateOpportunities(),
    getOpportunitiesByScope(),
    getColdRelationships(),
    getReadyContent(),
    fetchInboxServer(),
    getAgentsOnlineCount(),
  ]);

  // ── Ready for Jose — only actionable draft types (email drafts, posts, briefs)
  // Market Signal and other system-generated signals are excluded: they have no
  // Jose-facing next action. "Approved" on those means the agent approved its own output.
  const RFJ_TYPES = new Set(["Follow-up Email", "Check-in Email", "LinkedIn Post", "Grant Brief", "Grant Application Draft"]);
  const rfjGmailDrafts    = gmailDrafts.filter(d => RFJ_TYPES.has(d.draftType));
  const rfjApprovedDrafts = approvedDrafts.filter(d => RFJ_TYPES.has(d.draftType));

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

  // ── Date + greeting (K-v2: one-line collapsed header) ────────────────────────
  const today = new Date();
  // Short mono eyebrow: "THU 23 APR" — capitalized, no year, no comma.
  const eyebrowDate = today
    .toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })
    .toUpperCase();
  const firstName = adminUser.firstName || adminUser.primaryEmailAddress?.emailAddress?.split("@")[0] || "Common House";

  return (
    <div className="flex min-h-screen bg-[#EFEFEA]">
      <Sidebar adminNav />

      <main
        className="flex-1 ml-60 overflow-auto"
        style={{ fontFamily: "var(--font-hall-sans)", background: "var(--hall-paper-0)" }}
      >

        {/* ── 0. Header — K-v2 one-line ─────────────────────────────────── */}
        <header
          className="flex items-center justify-between gap-6 px-9 py-3.5"
          style={{ borderBottom: "1px solid var(--hall-ink-0)" }}
        >
          <div className="flex items-baseline gap-4 min-w-0">
            <span
              className="text-[10px] tracking-[0.08em] whitespace-nowrap"
              style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted-2)" }}
            >
              THE HALL · <b style={{ color: "var(--hall-ink-0)" }}>{eyebrowDate}</b>
            </span>
            <h1
              className="text-[16px] font-medium tracking-[-0.01em] truncate"
              style={{ color: "var(--hall-ink-0)" }}
            >
              Hi <span style={{ fontWeight: 700 }}>{firstName}</span>.
            </h1>
          </div>
          <HallLiveClock
            initialIso={today.toISOString()}
            agentsOnline={agentsOnline ?? undefined}
          />
        </header>

        <HallTabs
          badges={{
            today:         (p1Decisions.length + imminentDeadlines.length) || undefined,
            signals:       marketSignalBriefs.length > 0 ? `${marketSignalBriefs.length} new` : undefined,
            relationships: coldRelationships.length || undefined,
            portfolio:     projects.length || undefined,
          }}
          alerts={{
            signals: marketSignalBriefs.length > 0,
          }}
        >
        <div className="px-8 py-6 space-y-6 max-w-6xl mx-auto">

          {/* ── 1. Focus of the Day ───────────────────────────────────────── */}
          {focusRec ? (
            <div className="bg-[#131218] rounded-2xl px-6 py-5 border border-[#131218]">
              <div className="flex items-start justify-between gap-6">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2.5 mb-2.5">
                    <p className="text-[9px] font-bold uppercase tracking-[2.5px] text-[#c8f55a]/60">
                      Focus of the Day
                    </p>
                    <span className="text-[9px] font-bold text-[#131218] bg-[#c8f55a]/90 px-2 py-0.5 rounded-full">
                      {focusRec.timeEstimate}
                    </span>
                    {dailyBriefing?.generatedAt && (
                      <span className="text-[8px] text-white/25 ml-auto md:ml-0">
                        briefing {new Date(dailyBriefing.generatedAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    )}
                  </div>
                  <p className="text-[14px] font-semibold text-white leading-[1.5] max-w-[640px]">
                    {focusRec.action}
                  </p>
                  <p className="text-[11px] text-white/45 mt-1.5 leading-snug">
                    {focusRec.whyToday}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1.5 shrink-0">
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
            </div>
          ) : (() => {
            // Smarter empty state — surface up to 2 lightweight alternatives
            // so the slot is never a dead dialogue box.
            type Suggestion = { label: string; action: string; href: string; kind: "inbox" | "decision" | "candidate" | "cold" };
            const suggestions: Suggestion[] = [];

            const topInbox = inboxData.items[0];
            if (topInbox) {
              suggestions.push({
                label: "Reply",
                action: `Reply to "${topInbox.subject.slice(0, 56)}${topInbox.subject.length > 56 ? "…" : ""}" from ${topInbox.fromName}`,
                href: topInbox.gmailUrl,
                kind: "inbox",
              });
            }
            const firstUrgentDecision = deskDecisions[0];
            if (firstUrgentDecision && suggestions.length < 2) {
              suggestions.push({
                label: "Decide",
                action: `Make the call on "${firstUrgentDecision.title.slice(0, 64)}${firstUrgentDecision.title.length > 64 ? "…" : ""}"`,
                href: "/admin/decisions",
                kind: "decision",
              });
            }
            const firstCandidate = candidates[0];
            if (firstCandidate && suggestions.length < 2) {
              suggestions.push({
                label: "Review",
                action: `Review candidate — ${firstCandidate.name}`,
                href: firstCandidate.notionUrl,
                kind: "candidate",
              });
            }
            const firstCold = coldRelationships[0];
            if (firstCold && suggestions.length < 2) {
              suggestions.push({
                label: "Reach out",
                action: `Catch up with ${firstCold.name} — ${firstCold.warmth.toLowerCase()}`,
                href: firstCold.notionUrl,
                kind: "cold",
              });
            }

            if (suggestions.length === 0) {
              return (
                <div className="bg-white border border-[#E0E0D8] rounded-xl px-5 py-3 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#c8f55a] shrink-0" />
                    <p className="text-[10px] font-bold uppercase tracking-[2.5px] text-[#131218]/35">Focus of the Day</p>
                    <p className="text-[12px] text-[#131218]/50 truncate">Queue is clear — good moment for deep work.</p>
                  </div>
                  <TriggerBriefingButton />
                </div>
              );
            }

            // B2 — context-aware subtitle: if the top suggestion is a P1 decision or
            // an imminent deadline, frame the hero as "Your call today" instead of
            // the apologetic "No critical task" default.
            const hasP1 = p1Decisions.length > 0;
            const hasDeadline = imminentDeadlines.length > 0;
            const topKind = suggestions[0]?.kind;
            const heroSubtitle = hasP1
              ? `Your call today — ${p1Decisions.length} P1 critical`
              : hasDeadline
                ? `${imminentDeadlines.length} deadline${imminentDeadlines.length > 1 ? "s" : ""} this week`
                : topKind === "decision"
                  ? "Top decision pending your call"
                  : topKind === "inbox"
                    ? "Inbox needs your reply"
                    : suggestions.length === 1 ? "Suggested move" : "Suggested moves";

            return (
              <div className={`bg-white border rounded-xl overflow-hidden ${hasP1 ? "border-red-300 ring-1 ring-red-100" : "border-[#E0E0D8]"}`}>
                <div className={`px-5 pt-3 pb-2 flex items-center justify-between gap-3 border-b ${hasP1 ? "border-red-100 bg-red-50/40" : "border-[#EFEFEA]"}`}>
                  <div className="flex items-center gap-2.5">
                    <span className={`w-1.5 h-1.5 rounded-full ${hasP1 ? "bg-red-500 animate-pulse" : "bg-[#c8f55a]"}`} />
                    <p className="text-[10px] font-bold uppercase tracking-[2.5px] text-[#131218]/35">Focus of the Day</p>
                    <span className="text-[10px] text-[#131218]/35">·</span>
                    <span className={`text-[10px] font-semibold ${hasP1 ? "text-red-700" : "text-[#131218]/55"}`}>{heroSubtitle}</span>
                  </div>
                  <TriggerBriefingButton />
                </div>
                <div className="divide-y divide-[#EFEFEA]">
                  {suggestions.map((s, i) => (
                    <a
                      key={i}
                      href={s.href}
                      target={s.href.startsWith("http") ? "_blank" : undefined}
                      rel={s.href.startsWith("http") ? "noopener noreferrer" : undefined}
                      className="flex items-center gap-3 px-5 py-2.5 hover:bg-[#EFEFEA]/50 transition-colors"
                    >
                      <span className="text-[9px] font-bold uppercase tracking-widest text-[#131218]/40 bg-[#EFEFEA] px-2 py-0.5 rounded-full shrink-0 w-[72px] text-center">
                        {s.label}
                      </span>
                      <p className="text-[12px] text-[#131218] flex-1 min-w-0 truncate">{s.action}</p>
                      <span className="text-[#131218]/25 shrink-0 text-sm">→</span>
                    </a>
                  ))}
                </div>
              </div>
            );
          })()}

          {/* ── 2. P1 Banner — show ONLY imminent deadlines (P1 decisions are already in Focus of the Day hero).
                Prevents rojo overload (Q3): same information shown twice turns red into wallpaper. ── */}
          {imminentDeadlines.length > 0 && p1Decisions.length === 0 && (
            <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-xl px-5 py-3">
              <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0" />
              <p className="text-[13px] text-[#131218] flex-1 min-w-0">
                <strong>{imminentDeadlines.length} deadline{imminentDeadlines.length !== 1 ? "s" : ""} this week</strong>
                {imminentDeadlines.slice(0, 1).map(d => (
                  <span key={d.id}>{" · "}{d.title}{d.dueDate ? ` — closes ${new Date(d.dueDate).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}` : ""}</span>
                ))}
              </p>
              <Link href="/admin/decisions" className="text-[11px] font-bold text-amber-700 shrink-0 hover:text-amber-900 transition-colors whitespace-nowrap">
                View →
              </Link>
            </div>
          )}

          {/* ── 3. Stats row — B6: hero tile wider, 2 satellites narrower. B7: expand abbreviations. ── */}
          <div className="grid grid-cols-[1.6fr_1fr_1fr] gap-3 items-stretch">

            {/* Tile 1 — Portfolio (hero) */}
            <div className="bg-white rounded-xl border border-[#E0E0D8] px-4 py-3 flex flex-col">
              <p className="text-[9px] font-bold text-[#131218]/25 uppercase tracking-widest mb-1">Active portfolio</p>
              <div className="flex items-baseline gap-3">
                <p className="text-[28px] font-[800] text-[#131218] tracking-tight leading-none">{projects.length}</p>
                <span className="text-[10px] font-semibold text-[#131218]/50 leading-tight">
                  {workroomCount} Workroom{workroomCount !== 1 ? "s" : ""} · {garageCount} Garage{untypedCount > 0 ? ` · ${untypedCount} untyped` : ""}
                </span>
              </div>
              <div className="mt-auto pt-1.5 flex items-center gap-2.5 text-[10px]">
                {blockerCount > 0 ? (
                  <span className="flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-red-400 shrink-0" />
                    <span className="font-bold text-red-500">{blockerCount} blocker{blockerCount !== 1 ? "s" : ""}</span>
                  </span>
                ) : (
                  <span className="text-[#131218]/35">No blockers</span>
                )}
                {staleProjects.length > 0 && (
                  <span className="text-[#131218]/40">· {staleProjects.length} stale 30d+</span>
                )}
              </div>
            </div>

            {/* Tile 2 — Decisiones + updates */}
            <Link href="/admin/decisions" className="bg-white rounded-xl border border-[#E0E0D8] px-3.5 py-2 hover:bg-[#EFEFEA]/40 transition-colors flex flex-col">
              <p className="text-[9px] font-bold text-[#131218]/25 uppercase tracking-widest mb-0.5">Decisions + updates</p>
              <div className="flex items-baseline gap-2">
                <p className={`text-[18px] font-[800] tracking-tight leading-none ${openDecisions.length > 0 ? "text-amber-500" : "text-[#131218]/15"}`}>
                  {openDecisions.length}
                </p>
                <span className="text-[9.5px] font-semibold text-[#131218]/40 leading-tight">
                  {totalPending > 0 ? `${totalPending} need action` : "desk clear"}
                </span>
              </div>
              <div className="mt-auto pt-1 flex items-center gap-2.5 text-[9.5px]">
                <span className="text-[#131218]/40">
                  {urgentDecisions.length} urgent · {needsUpdate.length} to update
                </span>
                {withDeadlines.length > 0 && (
                  <span className="flex items-center gap-1">
                    <span className="w-1 h-1 rounded-full bg-amber-400 shrink-0" />
                    <span className="font-bold text-amber-500">{withDeadlines.length} this week</span>
                  </span>
                )}
              </div>
            </Link>

            {/* Tile 3 — OS activity. B8 — only show non-zero metrics. */}
            <div className="bg-white rounded-xl border border-[#E0E0D8] px-3.5 py-2">
              <p className="text-[9px] font-bold text-[#131218]/25 uppercase tracking-widest mb-1">OS activity</p>
              {(() => {
                const metrics = [
                  { label: "Outbox",         count: agentDrafts.length,   activeColor: "text-[#131218]" },
                  { label: "CoS tasks",      count: cosTasks.length,      activeColor: "text-amber-500" },
                  { label: "Candidates",     count: candidates.length,    activeColor: "text-amber-400" },
                  { label: "Cold relations", count: coldOnly.length,      activeColor: "text-blue-500" },
                  { label: "Dormant",        count: dormantRelationships.length, activeColor: "text-[#131218]/40" },
                ].filter(m => m.count > 0);

                if (metrics.length === 0) {
                  return (
                    <p className="text-[10px] text-[#131218]/35 italic py-1">All queues clear.</p>
                  );
                }

                return (
                  <div className="grid grid-cols-2 gap-x-3 gap-y-0.5">
                    {metrics.map(({ label, count, activeColor }) => (
                      <div key={label} className="flex items-center justify-between">
                        <span className="text-[9.5px] text-[#131218]/50 truncate">{label}</span>
                        <span className={`text-[10.5px] font-[800] ${activeColor}`}>{count}</span>
                      </div>
                    ))}
                  </div>
                );
              })()}
            </div>
          </div>

          {/* ── 4. Outbox (TODAY) ──────────────────────────────────────────
             Drafts whose approval sends something out of the house —
             LinkedIn posts, emails, delegation briefs. Internal digests
             (Market Signal, Quick Win Scan) surface in their own panels. */}
          {agentDrafts.length > 0 && (
            <div data-hall-tab="today">
              <SectionHeader label="Outbox" count={agentDrafts.length} />
              <AgentQueueSection drafts={agentDrafts} />
            </div>
          )}

          {/* ── 4b. Suggested Time Blocks — TODAY ─────────────────────────── */}
          <div data-hall-tab="today">
            <div className="flex items-center gap-3 mb-3">
              <p className="text-[10px] font-bold text-[#131218]/30 uppercase tracking-widest">Suggested time blocks</p>
              <div className="flex-1 h-px bg-[#E0E0D8]" />
              <HallManualTriggers />
            </div>
            <SuggestedTimeBlocks />
          </div>

          {/* ── 4c. Inbox + Meeting prep right column — lives in TODAY + SIGNALS ─── */}
          <div data-hall-tab="today signals" className="grid grid-cols-[1fr_340px] gap-6 items-start">
            <div className="space-y-6 min-w-0">
              {/* Inbox Triage */}
              <div>
                <SectionHeader label="Inbox — needs attention" />
                <InboxTriage initialItems={inboxData.items} initialScanned={inboxData.total_scanned} />
              </div>
            </div>

            {/* Side column — briefing context parallel to Ready/Inbox */}
            <div className="flex flex-col gap-4">
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

              <MarketSignalsPanel
                text={latestMarketSignals?.text ?? null}
                date={latestMarketSignals?.date ?? null}
                generatedAt={latestMarketSignals?.generatedAt ?? null}
                briefs={marketSignalBriefs}
              />

              <HallNextMeeting />
              <HallAutopilotLog />
              <HallCommitmentLedger />
              <HallPortfolioPulse />
              <HallOppFreshnessRadar />
              <HallAskQueue />
              <HallTimeAllocation />
              <HallOrgsColdRelations />
              <HallOrgsClassMix />

              {!dailyBriefing?.meetingPrep && !latestMarketSignals && (
                <div className="bg-white rounded-2xl border border-[#E0E0D8] px-5 py-4">
                  <p className="text-[11px] text-[#131218]/30">No briefing context yet today.</p>
                </div>
              )}
            </div>
          </div>

          {/* ── Two-column main layout — TODAY tab ─────── */}
          <div data-hall-tab="today" className="grid grid-cols-[1fr_340px] gap-6 items-start">

            {/* ── LEFT COLUMN ───────────────────────────────────────────────── */}
            <div className="space-y-6">

              {/* ── 5a+5b. Discovery + CoS — collapse to 1-line when all empty (M1+U1) ── */}
              {(() => {
                const discoveryCount = candidates.length + radarLoops.length;
                const totalCoS = cosTasks.length + rfjGmailDrafts.length + rfjApprovedDrafts.length;
                const allEmpty = discoveryCount === 0 && totalCoS === 0;

                if (allEmpty) {
                  return (
                    <div className="bg-white rounded-xl border border-[#E0E0D8] px-5 py-2.5 flex items-center gap-3">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                      <span className="text-[11px] font-semibold text-[#131218]/70">System clear</span>
                      <span className="text-[10px] text-[#131218]/40">— no candidates, no Chief-of-Staff work, no parked loops.</span>
                    </div>
                  );
                }

                return (
                  <>
                    {/* Discovery (shown only if non-empty — U1) */}
                    {discoveryCount > 0 && (
                      <div>
                        <SectionHeader label="Discovery" count={discoveryCount} />
                        <DiscoverySection candidates={candidates} radarLoops={radarLoops} />
                      </div>
                    )}

                    {/* Chief of Staff (shown only if non-empty — U1) */}
                    {totalCoS > 0 && (
                      <div>
                        <SectionHeader
                          label="Chief of Staff"
                          count={totalCoS}
                          action={cosTasks.length > 0 ? "All opportunities →" : undefined}
                          href="/admin/opportunities"
                        />
                        {(rfjGmailDrafts.length + rfjApprovedDrafts.length) > 0 && (
                          <div className="mb-3">
                            <ReadyForJoseSection
                              gmailDrafts={rfjGmailDrafts}
                              approvedDrafts={rfjApprovedDrafts}
                            />
                          </div>
                        )}
                        <ChiefOfStaffDesk tasks={cosTasks} />
                      </div>
                    )}
                  </>
                );
              })()}

              {/* ── 5b-parked. Parked · Waiting ───────────────────────────── */}
              {parkedTasks.length > 0 && (
                <div>
                  <ParkedLoopsSection tasks={parkedTasks} />
                </div>
              )}

              {/* ── 6. Open decisions ─────────────────────────────────────── */}
              {(() => {
                // Hide dead "From today's briefing — No open P1 items" wrappers.
                // Only show briefing commitments if they contain substantive content
                // (more than a short "no items" placeholder).
                const substantiveCommitments = dailyBriefing?.myCommitments
                  && dailyBriefing.myCommitments.trim().length > 40
                  && !/^no\b/i.test(dailyBriefing.myCommitments.trim());

                if (!substantiveCommitments && openDecisions.length === 0) return null;

                // Sort: P1 Critical first, then due soonest.
                const sortedDecisions = [...openDecisions].sort((a, b) => {
                  const pri = (p: string) => p === "P1 Critical" ? 0 : p === "High" ? 1 : 2;
                  const diff = pri(a.priority) - pri(b.priority);
                  if (diff !== 0) return diff;
                  const ad = a.dueDate ? new Date(a.dueDate).getTime() : Infinity;
                  const bd = b.dueDate ? new Date(b.dueDate).getTime() : Infinity;
                  return ad - bd;
                });

                return (
                  <div>
                    <SectionHeader label="Open decisions" count={openDecisions.length} action="All decisions" href="/admin/decisions" />
                    <div className="bg-white rounded-2xl border border-[#E0E0D8] overflow-hidden">
                      {substantiveCommitments && (
                        <div className="px-5 py-3.5 border-b border-[#EFEFEA] bg-[#EFEFEA]/40">
                          <p className="text-[9px] font-bold uppercase tracking-widest text-[#131218]/30 mb-1.5">From today&apos;s briefing</p>
                          <pre className="text-[11.5px] text-[#131218]/70 leading-[1.6] whitespace-pre-wrap font-sans">
                            {dailyBriefing!.myCommitments.slice(0, 500)}
                          </pre>
                        </div>
                      )}
                      {sortedDecisions.slice(0, 5).map(d => {
                        const isP1  = d.priority === "P1 Critical";
                        const isHigh = d.priority === "High";
                        const daysToDue = d.dueDate ? Math.floor((new Date(d.dueDate).getTime() - Date.now()) / 86400000) : null;
                        const dueBadgeClass = daysToDue === null ? "text-[#131218]/30"
                          : daysToDue < 0 ? "text-red-600"
                          : daysToDue <= 3 ? "text-amber-600"
                          : "text-[#131218]/40";
                        // N1 — differentiate P1/High/normal via icon glyph, not just color.
                        const priorityIcon = isP1 ? "⬤" : isHigh ? "◐" : "○";
                        const priorityLabel = isP1 ? "P1" : isHigh ? "P2" : "P3";
                        // N2 — show 1-line preview of notes/context when available (first 100 chars).
                        const preview = d.notes
                          ? d.notes.replace(/\[[A-Z_]+:[^\]]+\]/g, "").replace(/\n+/g, " ").trim().slice(0, 110)
                          : null;
                        return (
                          <Link key={d.id} href="/admin/decisions" className={`flex items-start gap-3 px-5 py-3 hover:bg-[#EFEFEA]/40 transition-colors border-b border-[#EFEFEA] last:border-0 ${isP1 ? "border-l-2 border-l-red-400" : isHigh ? "border-l-2 border-l-amber-300" : ""}`}>
                            <div className={`w-6 h-6 rounded-md flex items-center justify-center shrink-0 mt-[1px] ${isP1 ? "bg-red-100" : isHigh ? "bg-amber-50" : "bg-[#EFEFEA]"}`}
                                 title={`${priorityLabel} priority`}>
                              <span className={`text-[10px] font-bold ${isP1 ? "text-red-600" : isHigh ? "text-amber-600" : "text-[#131218]/35"}`}>{priorityIcon}</span>
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-[11.5px] font-medium text-[#131218] truncate">{d.title}</p>
                              {preview && (
                                <p className="text-[9.5px] text-[#131218]/45 truncate mt-0.5">{preview}{d.notes && d.notes.length > 110 ? "…" : ""}</p>
                              )}
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              {/* N4 — always reserve due-date column; show "no SLA" when missing */}
                              <span className={`text-[9px] font-bold ${dueBadgeClass} w-14 text-right`}>
                                {d.dueDate
                                  ? new Date(d.dueDate).toLocaleDateString("en-GB", { day: "numeric", month: "short" })
                                  : <span className="text-[#131218]/20 italic">no SLA</span>}
                              </span>
                              {/* N3 — move decision type to a dedicated column (right) so type pills align */}
                              <span className="text-[9px] font-bold text-[#131218]/25 w-28 text-right truncate">{d.decisionType}</span>
                            </div>
                          </Link>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}

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

            </div>

            {/* ── RIGHT COLUMN ──────────────────────────────────────────────── */}
            <div className="flex flex-col gap-4">

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

          {/* ── MONITORING STRIP ─────────────────────────────────────────────
              Two-column grid ends above. Everything below is full-width so the
              right rail never goes visually idle while the portfolio scrolls. */}

          {/* ── 8. Active Portfolio — TODAY + PORTFOLIO tabs ──────── */}
          <div data-hall-tab="today portfolio">
          {(() => {
            // Editorial summary counts — computed once so summary and rows agree.
            const projBlocked  = projects.filter(p => p.blockerCount > 0);
            const projUpdate   = projects.filter(p => p.blockerCount === 0 && p.updateNeeded);
            const projStale    = projects.filter(p => {
              const d = daysSince(bestActivity(p));
              return p.blockerCount === 0 && !p.updateNeeded && d !== null && d > 30;
            });
            const projDormant  = projects.filter(p => {
              const d = daysSince(bestActivity(p));
              return p.blockerCount === 0 && !p.updateNeeded && d !== null && d > 60;
            });
            const projHealthy  = projects.length - projBlocked.length - projUpdate.length - projStale.length;

            // Rank: blocked → update-needed → stale → healthy/warm → dormant
            const rankOf = (p: typeof projects[number]): number => {
              if (p.blockerCount > 0) return 0;
              if (p.updateNeeded)     return 1;
              const d = daysSince(bestActivity(p));
              if (d !== null && d > 60) return 4;       // dormant last
              if (d !== null && d > 30) return 2;       // stale
              return 3;                                  // healthy
            };
            const ranked = [...projects].sort((a, b) => {
              const ra = rankOf(a), rb = rankOf(b);
              if (ra !== rb) return ra - rb;
              // secondary: most recent activity first
              const ad = new Date(bestActivity(a) ?? 0).getTime();
              const bd = new Date(bestActivity(b) ?? 0).getTime();
              return bd - ad;
            });

            return (
              <div>
                <SectionHeader label="Active portfolio" count={projects.length} />

                {/* Editorial summary — read in 2 seconds */}
                <div className="flex flex-wrap items-center gap-x-5 gap-y-1 mb-3 px-1 text-[11px]">
                  {projBlocked.length > 0 && (
                    <span className="flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
                      <span className="font-bold text-red-500">{projBlocked.length} blocked</span>
                    </span>
                  )}
                  {projUpdate.length > 0 && (
                    <span className="flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                      <span className="font-bold text-amber-600">{projUpdate.length} need update</span>
                    </span>
                  )}
                  {projStale.length > 0 && (
                    <span className="flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-red-300" />
                      <span className="text-[#131218]/60">{projStale.length} stale 30d+</span>
                    </span>
                  )}
                  <span className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#c8f55a]" />
                    <span className="text-[#131218]/55">{projHealthy} healthy</span>
                  </span>
                  {projDormant.length > 0 && (
                    <span className="flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#131218]/20" />
                      <span className="text-[#131218]/40">{projDormant.length} dormant</span>
                    </span>
                  )}
                </div>

                {/* Denser list — 4 columns, type baked into project cell.
                    H4 — collapse dormant (>60d) rows into a single tail row. */}
                {(() => {
                  const dormantIds = new Set(projDormant.map(p => p.id));
                  const actionableRows = ranked.filter(p => !dormantIds.has(p.id));
                  const dormantRows = ranked.filter(p => dormantIds.has(p.id));
                  return (
                <div className="bg-white rounded-2xl border border-[#E0E0D8] overflow-hidden">
                  <div className="divide-y divide-[#EFEFEA]">
                    {actionableRows.map(p => {
                      const activityDate = bestActivity(p);
                      const days    = daysSince(activityDate);
                      const warmth  = warmthLabel(days);
                      const typeLbl = projectTypeLabel(p.primaryWorkspace);
                      const typeCls = projectTypeBadge(p.primaryWorkspace);
                      const hasSignal = p.blockerCount > 0 || p.updateNeeded;
                      return (
                        <Link
                          key={p.id}
                          href={`/admin/projects/${p.id}`}
                          className={`grid grid-cols-[minmax(0,2.2fr)_minmax(0,1fr)_110px_110px_24px] gap-3 px-5 py-3 hover:bg-[#EFEFEA]/50 transition-colors group items-center ${p.blockerCount > 0 ? "border-l-2 border-l-red-400" : p.updateNeeded ? "border-l-2 border-l-amber-300" : ""}`}
                        >
                          {/* Project name + inline type + geography */}
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 min-w-0">
                              <p className="text-[12px] font-semibold text-[#131218] truncate">{p.name}</p>
                              {typeLbl !== "—" && (
                                <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded-full shrink-0 ${typeCls}`}>{typeLbl}</span>
                              )}
                            </div>
                            {p.geography.length > 0 && (
                              <p className="text-[10px] text-[#131218]/30 font-medium truncate mt-0.5">{p.geography.slice(0, 2).join(" · ")}</p>
                            )}
                          </div>

                          {/* Stage */}
                          <div className="min-w-0">
                            {p.stage ? (
                              <span className={`inline-block text-[9px] font-bold px-2 py-0.5 rounded-full truncate max-w-full ${STAGE_COLORS[p.stage] ?? "bg-[#EFEFEA] text-[#131218]/50"}`}>
                                {p.stage}
                              </span>
                            ) : <span className="text-[#131218]/15 text-xs">—</span>}
                          </div>

                          {/* Warmth */}
                          <div className="flex items-center gap-1.5">
                            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${warmth.dot}`} />
                            <span className={`text-[10px] font-semibold ${warmth.text}`}>{warmth.label}</span>
                          </div>

                          {/* Signal OR last-update date — never both empty */}
                          <div className="text-right min-w-0">
                            {hasSignal ? (
                              <div className="flex flex-col items-end gap-0.5">
                                {p.blockerCount > 0 && (
                                  <span className="text-[9px] font-bold text-red-500">↯ Blocked</span>
                                )}
                                {p.updateNeeded && p.blockerCount === 0 && (
                                  <span className="text-[9px] font-bold text-amber-500">! Update due</span>
                                )}
                              </div>
                            ) : p.lastUpdate ? (
                              <p className="text-[10px] text-[#131218]/50 font-medium">
                                {new Date(p.lastUpdate).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                              </p>
                            ) : days !== null ? (
                              <p className="text-[10px] text-[#131218]/30 font-medium">{days}d silent</p>
                            ) : (
                              <span className="text-[#131218]/15 text-xs">—</span>
                            )}
                          </div>

                          <div className="text-[#131218]/20 group-hover:text-[#131218]/60 transition-colors text-sm text-right">→</div>
                        </Link>
                      );
                    })}
                    {projects.length === 0 && (
                      <div className="px-5 py-6 text-center">
                        <p className="text-[11px] text-[#131218]/25 font-medium">No active projects</p>
                      </div>
                    )}
                    {/* H4 — collapsed dormant tail */}
                    {dormantRows.length > 0 && (
                      <details className="group">
                        <summary className="list-none cursor-pointer px-5 py-2.5 flex items-center gap-3 hover:bg-[#EFEFEA]/40 transition-colors">
                          <span className="w-1.5 h-1.5 rounded-full bg-[#131218]/20 shrink-0" />
                          <span className="text-[10px] font-semibold text-[#131218]/45">
                            + {dormantRows.length} dormant
                          </span>
                          <span className="text-[9px] text-[#131218]/30 group-open:hidden">show →</span>
                          <span className="text-[9px] text-[#131218]/30 hidden group-open:inline">hide ↑</span>
                        </summary>
                        <div className="divide-y divide-[#EFEFEA] border-t border-[#EFEFEA]">
                          {dormantRows.map(p => {
                            const typeLbl = projectTypeLabel(p.primaryWorkspace);
                            const typeCls = projectTypeBadge(p.primaryWorkspace);
                            const activityDate = bestActivity(p);
                            const days = daysSince(activityDate);
                            return (
                              <Link key={p.id} href={`/admin/projects/${p.id}`}
                                    className="grid grid-cols-[minmax(0,2.2fr)_minmax(0,1fr)_110px_110px_24px] gap-3 px-5 py-2.5 hover:bg-[#EFEFEA]/50 transition-colors items-center opacity-60">
                                <div className="min-w-0">
                                  <div className="flex items-center gap-2 min-w-0">
                                    <p className="text-[11.5px] text-[#131218]/70 truncate">{p.name}</p>
                                    {typeLbl !== "—" && (
                                      <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded-full shrink-0 ${typeCls}`}>{typeLbl}</span>
                                    )}
                                  </div>
                                </div>
                                <div>
                                  {p.stage && <span className={`inline-block text-[9px] font-bold px-2 py-0.5 rounded-full ${STAGE_COLORS[p.stage] ?? "bg-[#EFEFEA] text-[#131218]/50"}`}>{p.stage}</span>}
                                </div>
                                <div className="text-[10px] text-[#131218]/35">Dormant</div>
                                <div className="text-right text-[10px] text-[#131218]/30">{days != null ? `${days}d silent` : "—"}</div>
                                <div className="text-[#131218]/15 text-sm text-right">→</div>
                              </Link>
                            );
                          })}
                        </div>
                      </details>
                    )}
                  </div>
                </div>
                  );
                })()}
              </div>
            );
          })()}
          </div>

          {/* ── 9. Opportunities Explorer — TODAY + PORTFOLIO tabs ─────── */}
          <div data-hall-tab="today portfolio">
          {(() => {
            const total = filteredOpps.ch.length + filteredOpps.portfolio.length;
            if (total === 0) return null;
            // O1 — if ≤3 opps, render inline so the section has visible content
            // (fixes page-9-blank peak-end). Above 3, keep collapsed details.
            const renderInline = total <= 3;

            if (renderInline) {
              return (
                <div>
                  <div className="flex items-center gap-3 px-1 py-2">
                    <p className="text-[10px] font-bold text-[#131218]/30 uppercase tracking-widest">Opportunities — explore</p>
                    <span className="text-[9px] font-bold bg-[#131218]/6 text-[#131218]/40 px-1.5 py-0.5 rounded-full">
                      {total}
                    </span>
                    <div className="flex-1 h-px bg-[#E0E0D8]" />
                  </div>
                  <div className="mt-2">
                    <OpportunityExplorer ch={filteredOpps.ch} portfolio={filteredOpps.portfolio} />
                  </div>
                </div>
              );
            }

            return (
              <details className="group">
                <summary className="list-none cursor-pointer flex items-center gap-3 px-1 py-2 hover:opacity-80 transition-opacity">
                  <p className="text-[10px] font-bold text-[#131218]/30 uppercase tracking-widest">Opportunities — explore</p>
                  <span className="text-[9px] font-bold bg-[#131218]/6 text-[#131218]/40 px-1.5 py-0.5 rounded-full">
                    {total}
                  </span>
                  <div className="flex-1 h-px bg-[#E0E0D8]" />
                  <span className="text-[9px] font-bold text-[#131218]/30 uppercase tracking-widest whitespace-nowrap group-open:hidden">
                    Show →
                  </span>
                  <span className="text-[9px] font-bold text-[#131218]/30 uppercase tracking-widest whitespace-nowrap hidden group-open:inline">
                    Hide ↑
                  </span>
                </summary>
                <div className="mt-2">
                  <p className="text-[10px] text-[#131218]/30 mb-2 px-1">
                    Low-pressure exploration. Nothing requires action — flag anything that looks worth pursuing.
                  </p>
                  <OpportunityExplorer ch={filteredOpps.ch} portfolio={filteredOpps.portfolio} />
                </div>
              </details>
            );
          })()}
          </div>

          {/* ── 10. Ready to Publish — TODAY ─────────────────────────────── */}
          {readyContent.length > 0 && (
            <div data-hall-tab="today">
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

          {/* ── SIGNALS tab — focused feed of market + inbox + pipeline ─────── */}
          <div data-hall-tab="signals" className="space-y-6">
            <div className="flex items-center gap-3">
              <p className="text-[10px] font-bold text-[#131218]/30 uppercase tracking-widest">Market & pipeline signals</p>
              <div className="flex-1 h-px bg-[#E0E0D8]" />
            </div>
            <MarketSignalsPanel
              text={latestMarketSignals?.text ?? null}
              date={latestMarketSignals?.date ?? null}
              generatedAt={latestMarketSignals?.generatedAt ?? null}
              briefs={marketSignalBriefs}
            />
            <InboxTriage initialItems={inboxData.items} initialScanned={inboxData.total_scanned} />
            <HallAskQueue />
            <HallOppFreshnessRadar />
            <HallPortfolioPulse />
          </div>

          {/* ── RELATIONSHIPS tab — network, classes, time allocation ────── */}
          <div data-hall-tab="relationships" className="space-y-6">
            <div className="flex items-center gap-3">
              <p className="text-[10px] font-bold text-[#131218]/30 uppercase tracking-widest">Relationships</p>
              <div className="flex-1 h-px bg-[#E0E0D8]" />
              <Link href="/admin/hall/network" className="text-[9px] font-bold tracking-widest uppercase text-[#131218]/40 hover:text-[#131218]/80">
                Network graph →
              </Link>
            </div>
            <HallTimeAllocation />
            <HallOrgsColdRelations />
            <HallOrgsClassMix />
            <div className="bg-white rounded-2xl border border-[#E0E0D8] px-5 py-4 flex items-center justify-between">
              <div>
                <p className="text-[11px] font-bold text-[#131218]">Contacts & Organizations</p>
                <p className="text-[10px] text-[#131218]/45 mt-0.5">Tag who's who · classify senders · maintain the registry</p>
              </div>
              <div className="flex gap-2">
                <Link href="/admin/hall/contacts" className="text-[10px] font-bold uppercase tracking-wider bg-[#131218] text-white hover:bg-[#2a2938] px-3 py-1.5 rounded-md transition-colors">
                  Contacts →
                </Link>
                <Link href="/admin/hall/organizations" className="text-[10px] font-bold uppercase tracking-wider bg-[#EFEFEA] text-[#131218] hover:bg-[#E0E0D8] px-3 py-1.5 rounded-md transition-colors">
                  Orgs →
                </Link>
              </div>
            </div>
          </div>

        </div>
        </HallTabs>
      </main>
    </div>
  );
}
