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
import { CompetitiveIntelPanel } from "@/components/CompetitiveIntelPanel";
import { CompetitiveIntelSummary } from "@/components/CompetitiveIntelSummary";
import { HallOrgsColdRelations, HallOrgsClassMix } from "@/components/HallOrgsWidgets";
import { HallOppFreshnessRadar } from "@/components/HallOppFreshnessRadar";
import { HallPortfolioPulse } from "@/components/HallPortfolioPulse";
import { HallAskQueue } from "@/components/HallAskQueue";
import { HallTimeAllocation } from "@/components/HallTimeAllocation";
import { HallCommitmentLedger } from "@/components/HallCommitmentLedger";
import { HallTodayAgenda } from "@/components/HallTodayAgenda";
import { HallAutopilotLog } from "@/components/HallAutopilotLog";
import { HallTabs } from "@/components/HallTabs";
import { HallSection } from "@/components/HallSection";
import OpportunityExplorer from "@/components/OpportunityExplorer";
import {
  getProjectsOverview,
  getDecisionItems,
  getDailyBriefing,
  getLatestMarketSignals,
  getRecentInsightBriefBriefs,
  getRecentCompetitiveIntel,
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
import { getInboxActions, countOpenGmailActions, getCoSActions } from "@/lib/action-items";
import { getObjectivesForYear } from "@/lib/plan";

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
  if (days === null) return { label: "Dormant", dot: "bg-[#0a0a0a]/15", text: "text-[#0a0a0a]/35" };
  if (days <= 3)  return { label: "Hot",     dot: "bg-emerald-500",  text: "text-emerald-700" };
  if (days <= 10) return { label: "Warm",    dot: "bg-[#c6f24a]",    text: "text-[#0a0a0a]/70" };
  if (days <= 21) return { label: "Warm",    dot: "bg-amber-300",    text: "text-amber-600" };
  if (days <= 35) return { label: "Cold",    dot: "bg-blue-400",     text: "text-blue-500" };
  return              { label: "Dormant", dot: "bg-[#0a0a0a]/15", text: "text-[#0a0a0a]/35" };
}

function personWarmthBadge(warmth: string): { dot: string; text: string; bg: string } {
  if (warmth === "Hot")     return { dot: "bg-red-400",    text: "text-red-600",    bg: "bg-red-50 border-red-200" };
  if (warmth === "Warm")    return { dot: "bg-amber-400",  text: "text-amber-600",  bg: "bg-amber-50 border-amber-200" };
  if (warmth === "Cold")    return { dot: "bg-blue-400",   text: "text-blue-600",   bg: "bg-blue-50 border-blue-200" };
  return                    { dot: "bg-gray-300",   text: "text-gray-400",   bg: "bg-gray-50 border-gray-200" };
}

function projectTypeBadge(primaryWorkspace: string): string {
  if (primaryWorkspace === "garage")   return "bg-[#0a0a0a] text-[#c6f24a]";
  if (primaryWorkspace === "workroom") return "bg-[#f4f4ef] text-[#0a0a0a]/60 border border-[#e4e4dd]";
  return "bg-[#f4f4ef] text-[#0a0a0a]/30 border border-[#e4e4dd]";
}

function projectTypeLabel(primaryWorkspace: string): string {
  if (primaryWorkspace === "garage")   return "Garage";
  if (primaryWorkspace === "workroom") return "Workroom";
  return "—";
}

const STAGE_COLORS: Record<string, string> = {
  "Discovery":  "bg-blue-50 text-blue-600 border border-blue-200",
  "Validation": "bg-amber-50 text-amber-600 border border-amber-200",
  "Execution":  "bg-[#0a0a0a] text-[#c6f24a]",
  "Completion": "bg-[#c6f24a] text-[#0a0a0a]",
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

// ─── Focus heuristics (Phase 13) ──────────────────────────────────────────
// Verbs that signal "context awareness", not actionable decision/work.
// When a task's title/pendingAction starts with these AND has no
// counterparty/orgName, it's an observation about the world rather than
// something Jose can move forward today. -25 score → drops out of Focus.
const OBSERVATION_VERBS = [
  "monitor", "track", "consider", "evaluate", "assess", "observe", "watch",
  "review market", "explore", "research", "study", "review trends",
  "awaiting", "waiting on", "watch for",
];

// Verbs that signal pure founder-leverage (only Jose can do, high stakes).
const FOUNDER_VERBS = [
  "decide", "approve", "sign", "hire", "fire", "pitch", "negotiate",
  "close", "commit", "reject", "veto", "endorse",
];

function isObservationShaped(task: CoSTask): boolean {
  const text = `${task.taskTitle ?? ""} ${task.pendingAction ?? ""}`.trim().toLowerCase();
  if (!text) return false;

  // What counts as REAL context (not self-referential):
  //   - orgName = a non-empty counterparty name distinct from the title.
  //   - reviewUrl pointing to an EXTERNAL source (Gmail/Drive). A Notion
  //     URL back to the loop itself isn't context — it just links to the
  //     same record we're already looking at.
  const hasOrg = !!task.orgName?.trim() && task.orgName.trim().toLowerCase() !== text;
  const url = task.reviewUrl ?? "";
  const isExternalLink =
    url.includes("mail.google.com") ||
    url.includes("drive.google.com") ||
    url.includes("docs.google.com") ||
    url.includes("fireflies.ai");
  const hasContext = hasOrg || isExternalLink;
  if (hasContext) return false;

  return OBSERVATION_VERBS.some(v => text.includes(v));
}

function startsWithFounderVerb(task: CoSTask): boolean {
  const t = task.taskTitle?.toLowerCase().trim() ?? "";
  return FOUNDER_VERBS.some(v => t.startsWith(v));
}

// Match a task to a strategic objective by keyword overlap on title/area.
// Returns the best-tier match found, or null. Cheap heuristic — replace
// with a Haiku classifier at ingest if false-positive rate is too high.
function matchObjective(
  task: CoSTask,
  objectives: { id: string; title: string; area: string; tier: string }[]
): { id: string; tier: string; title: string } | null {
  if (!objectives.length) return null;
  const haystack = `${task.taskTitle ?? ""} ${task.opportunityName ?? ""} ${task.orgName ?? ""} ${task.pendingAction ?? ""}`.toLowerCase();
  if (!haystack.trim()) return null;
  let best: { id: string; tier: string; title: string; rank: number } | null = null;
  const tierRank: Record<string, number> = { high: 3, mid: 2, low: 1 };
  for (const o of objectives) {
    const needle = o.title.toLowerCase();
    if (needle.length < 6) continue; // avoid single-word matches
    // Loose token overlap: any 3+ char word in objective title appears in haystack
    const tokens = needle.split(/\s+/).filter(t => t.length >= 5);
    if (tokens.length === 0) continue;
    const matches = tokens.filter(t => haystack.includes(t)).length;
    if (matches < 2) continue; // need at least 2 distinct token hits
    const rank = tierRank[o.tier] ?? 0;
    if (!best || rank > best.rank) best = { id: o.id, tier: o.tier, title: o.title, rank };
  }
  return best ? { id: best.id, tier: best.tier, title: best.title } : null;
}

// Match a task to an active Notion opportunity by org/name overlap.
function matchOpportunity(
  task: CoSTask,
  opportunities: { id: string; name: string; stage: string; followUpStatus: string; orgName: string; type: string; score: number | null }[]
): { name: string; stage: string; followUpStatus: string; daysQuiet: number } | null {
  if (!opportunities.length) return null;
  const orgLower = (task.orgName ?? "").toLowerCase().trim();
  const titleLower = (task.taskTitle ?? "").toLowerCase();
  if (!orgLower && !titleLower) return null;
  const ACTIVE_STAGES = new Set(["Active", "Qualifying", "Proposal Sent", "Negotiation"]);
  for (const o of opportunities) {
    if (!ACTIVE_STAGES.has(o.stage)) continue;
    const oOrg = o.orgName.toLowerCase();
    const oName = o.name.toLowerCase();
    if (oOrg && orgLower && (oOrg === orgLower || oOrg.includes(orgLower) || orgLower.includes(oOrg))) {
      return { name: o.name, stage: o.stage, followUpStatus: o.followUpStatus, daysQuiet: 0 };
    }
    if (oName && titleLower.includes(oName)) {
      return { name: o.name, stage: o.stage, followUpStatus: o.followUpStatus, daysQuiet: 0 };
    }
  }
  return null;
}

function computeFocusRecommendation(
  cosTasks: CoSTask[],
  inboxItems: InboxItem[],
  agentDrafts: { id: string; title: string; notionUrl: string; opportunityId: string | null }[],
  strategicObjectives: { id: string; title: string; area: string; tier: string }[] = [],
  opportunities: { id: string; name: string; stage: string; followUpStatus: string; orgName: string; type: string; score: number | null }[] = [],
): FocusRecommendation | null {
  const now = Date.now();

  type Candidate = {
    task: CoSTask;
    score: number;
    winReason: string;
    matchedObjective: ReturnType<typeof matchObjective>;
    matchedOpportunity: ReturnType<typeof matchOpportunity>;
    linkedDraft: typeof agentDrafts[0] | null;
  };
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

    // ── PHASE 13 STEP 1 — Observation penalty ─────────────────────────
    // Items shaped like "monitor X" / "evaluate Y" with no counterparty
    // or link are CONTEXT, not actionable. Drop hard so they don't
    // dominate Focus when their score is incidentally high.
    if (isObservationShaped(task)) {
      score -= 25;
      reasons.push("(observation-shaped: -25)");
    }

    // ── PHASE 13 STEP 2 — Strategic objective leverage ────────────────
    const matchedObj = matchObjective(task, strategicObjectives);
    if (matchedObj) {
      const tierBoost: Record<string, number> = { high: 30, mid: 15, low: 5 };
      const boost = tierBoost[matchedObj.tier] ?? 0;
      score += boost;
      reasons.push(`tier-${matchedObj.tier} objective`);
    }

    // ── PHASE 13 STEP 3 — Active opportunity (revenue impact) ─────────
    const matchedOpp = matchOpportunity(task, opportunities);
    if (matchedOpp) {
      score += 20;
      reasons.push(`active opportunity (${matchedOpp.stage})`);
      // Extra boost if proposal sent and stale (deal getting cold)
      if (matchedOpp.followUpStatus === "Sent" || matchedOpp.followUpStatus === "Waiting") {
        score += 15;
        reasons.push("response pending");
      }
    }

    // ── PHASE 13 STEP 3 (cont.) — Founder-only verb signal ────────────
    if (startsWithFounderVerb(task)) {
      score += 15;
      reasons.push("founder-only verb");
    }

    // Linked agent draft = ready-to-approve = highest leverage
    const linkedDraft = agentDrafts.find(d =>
      d.opportunityId && task.linkedEntityId && d.opportunityId === task.linkedEntityId
    ) ?? null;
    if (linkedDraft) {
      score += 25;
      reasons.push("draft ready to approve");
    }

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

    candidates.push({
      task, score,
      winReason: reasons.join(" · "),
      matchedObjective: matchedObj,
      matchedOpportunity: matchedOpp,
      linkedDraft,
    });
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
  const { task, winReason, matchedObjective, matchedOpportunity, linkedDraft } = candidates[0];

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

  // ── PHASE 13 STEP 4 — Action sentence by leverage type ────────────────
  // Priority order — pick the FIRST framing that matches:
  //   1. linkedDraft           → Approve [draft]. Ready to send.
  //   2. matchedOpportunity    → Close / Reactivate [opportunity].
  //   3. founder verb in title → use Jose's verb directly (Decide, Approve…)
  //   4. blocker               → Resolve the X — blocking Y.
  //   5. decision + counterpty → Decide on X — Y is waiting.
  //   6. prep + due ≤ 7d       → Prep for the X meeting [date].
  //   7. review (doc)          → Review the X doc.
  //   8. chase / follow-up     → Nudge X on Y.
  //   9. fallback              → Spend [time] on X with Y.
  let action: string;
  const pendingSnippet = hasExplicitPending
    ? task.pendingAction!.trim().replace(/\.$/, "").slice(0, 80)
    : null;
  const orgFragment = task.orgName?.trim() ? task.orgName.trim() : null;
  const titleClean = task.taskTitle.replace(/\.$/, "").slice(0, 90);

  if (linkedDraft) {
    action = `Approve the ${orgFragment ?? linkedDraft.title} draft — ready to send.`;
  } else if (matchedOpportunity && (matchedOpportunity.followUpStatus === "Sent" || matchedOpportunity.followUpStatus === "Waiting")) {
    action = `Reactivate ${matchedOpportunity.name} — response pending.`;
  } else if (matchedOpportunity && matchedOpportunity.stage === "Negotiation") {
    action = `Close ${matchedOpportunity.name} — in negotiation.`;
  } else if (matchedOpportunity) {
    action = `Push ${matchedOpportunity.name} forward — ${matchedOpportunity.stage.toLowerCase()}.`;
  } else if (startsWithFounderVerb(task)) {
    // Use Jose's verb directly — already imperative
    action = orgFragment
      ? `${titleClean} — ${orgFragment} waiting.`
      : `${titleClean}.`;
  } else if (task.loopType === "blocker") {
    action = `Resolve ${pendingSnippet ?? `the ${task.opportunityName} blocker`}${orgFragment ? ` — blocking ${orgFragment}` : ""}.`;
  } else if (task.loopType === "decision") {
    action = `Decide on ${pendingSnippet ?? titleClean}${orgFragment ? ` — ${orgFragment} is waiting` : ""}.`;
  } else if (task.loopType === "prep") {
    if (pendingSnippet) {
      action = `Prep: ${pendingSnippet}${meetingLabel ? ` before the ${orgFragment ?? "meeting"} ${meetingLabel}` : ""}.`;
    } else {
      action = `Prep for the ${orgFragment ?? task.opportunityName} meeting${meetingLabel ? ` ${meetingLabel}` : ""}.`;
    }
  } else if (task.loopType === "review") {
    if (reviewIsDoc) {
      action = `Review the ${orgFragment ?? task.opportunityName} doc${pendingSnippet ? ` — ${pendingSnippet}` : ""}.`;
    } else {
      action = `Clear the ${orgFragment ?? task.opportunityName} thread${pendingSnippet ? ` — ${pendingSnippet}` : ""}.`;
    }
  } else if (task.loopType === "commitment") {
    action = `Deliver on your ${task.opportunityName} commitment${orgFragment ? ` to ${orgFragment}` : ""}.`;
  } else if (task.loopType === "follow-up") {
    const reviewIsGmail = !!task.reviewUrl && task.reviewUrl.includes("mail.google.com");
    if (pendingSnippet) {
      action = `Nudge ${orgFragment ?? "them"}: ${pendingSnippet}.`;
    } else if (reviewIsGmail) {
      action = `Reply to the ${orgFragment ?? task.opportunityName} thread.`;
    } else {
      action = `Nudge ${orgFragment ?? task.opportunityName} on ${titleClean}.`;
    }
  } else {
    action = `Spend ${timeEstimate} on ${pendingSnippet ?? titleClean}${orgFragment ? ` with ${orgFragment}` : ""}.`;
  }
  // linkedDraft already destructured from candidates[0] above

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
    } else if (matchedOpportunity && (matchedOpportunity.followUpStatus === "Sent" || matchedOpportunity.followUpStatus === "Waiting")) {
      whyParts.push("Response pending — deal at risk of cooling.");
    } else if (matchedObjective) {
      whyParts.push(`Tied to a tier-${matchedObjective.tier} objective.`);
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
  // K-v2 — h2 ink-underlined, mono meta on right. Same visual as HallSection's
  // head; used in places where we don't want the HallSection <section> wrapper
  // (e.g. sections that are siblings of other sections, not nested content).
  return (
    <div
      className="flex items-baseline justify-between gap-3 pb-2 mb-3.5"
      style={{ borderBottom: "1px solid var(--hall-ink-0)" }}
    >
      <h2
        className="text-[19px] font-bold leading-none flex items-baseline gap-2"
        style={{ letterSpacing: "-0.02em", color: "var(--hall-ink-0)" }}
      >
        <span>{label}</span>
        {count !== undefined && (
          <span
            style={{
              fontFamily: "var(--font-hall-mono)",
              fontSize: 12,
              fontWeight: 600,
              color: "var(--hall-muted-2)",
            }}
          >
            {count}
          </span>
        )}
      </h2>
      {action && href && (
        <Link
          href={href}
          className="text-[9px] font-bold uppercase tracking-widest whitespace-nowrap transition-colors"
          style={{ color: "var(--hall-muted-2)" }}
        >
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
    <div className="flex items-center gap-3 bg-white/50 border border-dashed border-[#e4e4dd] rounded-xl px-4 py-2">
      <span className="w-1.5 h-1.5 rounded-full bg-[#0a0a0a]/15 shrink-0" />
      <span className="text-[10px] font-bold uppercase tracking-[2px] text-[#0a0a0a]/30">{label}</span>
      <span className="text-[11px] text-[#0a0a0a]/45 flex-1 min-w-0 truncate">{note}</span>
      {action}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

/**
 * Phase 3 of the normalization architecture (docs/NORMALIZATION_ARCHITECTURE.md §15):
 * Inbox reads from the action_items layer instead of live-classifying Gmail.
 * The Gmail ingestor (src/lib/ingestors/gmail.ts, cron at 8/12/16/20 UTC)
 * populates action_items; this function is a pure SELECT over it.
 */
async function fetchInboxServer(): Promise<{ items: InboxItem[]; total_scanned: number }> {
  try {
    const [items, total] = await Promise.all([
      getInboxActions(20),
      countOpenGmailActions(),
    ]);
    return { items, total_scanned: total };
  } catch (err) {
    console.error("[fetchInboxServer] action_items read failed:", err);
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
    competitiveIntel,
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
    getRecentCompetitiveIntel(30),
    // Outbox: only Pending Review drafts whose approval triggers an external
    // action (LinkedIn, email, delegation). Market Signal + Quick Win Scan are
    // filtered out — they surface in their own Hall sections, not in approval.
    getOutboxDrafts(),
    getAgentDrafts("Draft Created"),
    getAgentDrafts("Approved"),
    getCoSActions(40),  // Phase 6.5: CoS desk reads from action_items layer
    getParkedLoops(),
    getRadarLoops(),
    getCandidateOpportunities(),
    getOpportunitiesByScope(),
    getColdRelationships(),
    getReadyContent(),
    fetchInboxServer(),
    getAgentsOnlineCount(),
  ]);
  // Phase 13 — load strategic objectives separately (Supabase, fast).
  // Used by computeFocusRecommendation to weight items by tier.
  const strategicObjectives = await getObjectivesForYear(new Date().getFullYear());

  const competitiveLastScan = competitiveIntel.reduce<string | null>(
    (latest, r) =>
      r.dateCaptured && (!latest || r.dateCaptured > latest) ? r.dateCaptured : latest,
    null
  );
  const competitiveHighCount = competitiveIntel.filter((r) => r.relevance === "Alta").length;

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
  // Phase 13 — strategic objectives + active opportunities now feed scoring.
  const focusOpportunities = [...opportunities.ch, ...opportunities.portfolio];
  const focusRec = computeFocusRecommendation(
    cosTasks,
    inboxData.items,
    agentDrafts,
    strategicObjectives.map(o => ({ id: o.id, title: o.title, area: o.area, tier: o.tier })),
    focusOpportunities,
  );
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
    <div className="flex min-h-screen bg-[#f4f4ef]">
      <Sidebar adminNav />

      <main
        className="flex-1 md:ml-60 overflow-auto"
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
        <div className="px-9 py-6 space-y-7" style={{ background: "var(--hall-paper-0)" }}>

          {/* ─── K-v2 primary layout (TODAY tab) ───────────────────────────
              Narrative left: Focus hero → Suggested blocks → Inbox → Commitments.
              Context right:  Next meeting → Deadline → Allocation → Signals → Agents.
              Lime is reserved for the Focus hero and live "now" indicators. */}
          <div className="hall-today-grid" data-hall-tab="today">

            <div className="hall-today-col-left">

          {/* ── 1. Focus of the Day — K-v2 lime hero ────────────────────── */}
          {focusRec ? (
            <section className="mb-7">
              <div className="flex gap-1.5 mb-2.5">
                <span className="hall-chip-dark">FOCUS OF THE DAY</span>
              </div>
              <div className="hall-focus-card">
                <div className="flex items-center justify-between mb-3.5 gap-3">
                  <span
                    className="uppercase"
                    style={{
                      fontFamily: "var(--font-hall-mono)",
                      fontSize: 10,
                      color: "var(--hall-muted-2)",
                      letterSpacing: "0.08em",
                    }}
                  >
                    {focusRec.timeEstimate} WINDOW
                  </span>
                  {dailyBriefing?.generatedAt && (
                    <span
                      style={{
                        fontFamily: "var(--font-hall-mono)",
                        fontSize: 9.5,
                        color: "var(--hall-muted-3)",
                        letterSpacing: "0.04em",
                      }}
                    >
                      briefing {new Date(dailyBriefing.generatedAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  )}
                </div>
                <div
                  className="hall-focus-grid grid items-start"
                  style={{ gridTemplateColumns: "72px 1fr", gap: "22px" }}
                >
                  <div className="hall-focus-icon" aria-hidden>
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
                      <circle cx="12" cy="12" r="3" />
                      <path d="M12 1v6M12 17v6M1 12h6M17 12h6" />
                    </svg>
                  </div>
                  <div className="min-w-0">
                    <h3
                      className="font-bold mb-2.5"
                      style={{
                        fontSize: 26,
                        letterSpacing: "-0.02em",
                        lineHeight: 1.15,
                        color: "var(--hall-ink-0)",
                      }}
                    >
                      {focusRec.action}
                    </h3>
                    <p
                      className="mb-3"
                      style={{
                        fontSize: 13.5,
                        lineHeight: 1.55,
                        color: "var(--hall-ink-3)",
                        maxWidth: "60ch",
                      }}
                    >
                      {focusRec.whyToday}
                    </p>
                    <div className="flex items-center gap-2 flex-wrap mt-4">
                      {focusRec.links.map((link) => (
                        <a
                          key={link.url}
                          href={link.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={link.style === "primary" ? "hall-btn-primary" : "hall-btn-outline"}
                        >
                          {link.label} →
                        </a>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </section>
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
                <div className="bg-white border border-[#e4e4dd] rounded-xl px-5 py-3 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#c6f24a] shrink-0" />
                    <p className="text-[10px] font-bold uppercase tracking-[2.5px] text-[#0a0a0a]/35">Focus of the Day</p>
                    <p className="text-[12px] text-[#0a0a0a]/50 truncate">Queue is clear — good moment for deep work.</p>
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
              <div className={`bg-white border rounded-xl overflow-hidden ${hasP1 ? "border-red-300 ring-1 ring-red-100" : "border-[#e4e4dd]"}`}>
                <div className={`px-5 pt-3 pb-2 flex items-center justify-between gap-3 border-b ${hasP1 ? "border-red-100 bg-red-50/40" : "border-[#f4f4ef]"}`}>
                  <div className="flex items-center gap-2.5">
                    <span className={`w-1.5 h-1.5 rounded-full ${hasP1 ? "bg-red-500 animate-pulse" : "bg-[#c6f24a]"}`} />
                    <p className="text-[10px] font-bold uppercase tracking-[2.5px] text-[#0a0a0a]/35">Focus of the Day</p>
                    <span className="text-[10px] text-[#0a0a0a]/35">·</span>
                    <span className={`text-[10px] font-semibold ${hasP1 ? "text-red-700" : "text-[#0a0a0a]/55"}`}>{heroSubtitle}</span>
                  </div>
                  <TriggerBriefingButton />
                </div>
                <div className="divide-y divide-[#f4f4ef]">
                  {suggestions.map((s, i) => (
                    <a
                      key={i}
                      href={s.href}
                      target={s.href.startsWith("http") ? "_blank" : undefined}
                      rel={s.href.startsWith("http") ? "noopener noreferrer" : undefined}
                      className="flex items-center gap-3 px-5 py-2.5 hover:bg-[#f4f4ef]/50 transition-colors"
                    >
                      <span className="text-[9px] font-bold uppercase tracking-widest text-[#0a0a0a]/40 bg-[#f4f4ef] px-2 py-0.5 rounded-full shrink-0 w-[72px] text-center">
                        {s.label}
                      </span>
                      <p className="text-[12px] text-[#0a0a0a] flex-1 min-w-0 truncate">{s.action}</p>
                      <span className="text-[#0a0a0a]/25 shrink-0 text-sm">→</span>
                    </a>
                  ))}
                </div>
              </div>
            );
          })()}

          {/* ── Suggested blocks — K-v2 left col ─────────────────────────── */}
          <HallSection title="Suggested" flourish="blocks">
            <SuggestedTimeBlocks />
          </HallSection>

          {/* ── Inbox · needs attention — K-v2 left col ──────────────────── */}
          <HallSection
            title="Inbox · "
            flourish="needs attention"
            meta={`${inboxData.items.length} VISIBLE · ${inboxData.total_scanned} TOTAL`}
          >
            <InboxTriage initialItems={inboxData.items} initialScanned={inboxData.total_scanned} />
          </HallSection>

            </div>{/* /hall-today-col-left */}

            <div className="hall-today-col-right">

              {/* ── Manual triggers — top of right col ───────────────────── */}
              <HallSection title="Manual " flourish="triggers">
                <HallManualTriggers />
              </HallSection>

              {/* ── Today's agenda — next meeting rich + rest compact ────── */}
              <HallSection title="Today's " flourish="agenda">
                <HallTodayAgenda />
              </HallSection>

              {/* ── This week — Deadline card (replaces old P1 Banner) ────
                  Shows imminent deadlines in the K-v2 amber-card style.
                  Suppressed when a P1 decision is already in Focus (avoid
                  redundancy — same info twice turns red into wallpaper). */}
              {imminentDeadlines.length > 0 && p1Decisions.length === 0 && (
                <HallSection
                  title="This "
                  flourish="week"
                  meta={`${imminentDeadlines.length} DEADLINE${imminentDeadlines.length > 1 ? "S" : ""}`}
                >
                  {imminentDeadlines.slice(0, 1).map((d) => (
                    <Link key={d.id} href="/admin/decisions" className="hall-deadline-card hover:opacity-90 transition-opacity">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--hall-warn)" strokeWidth="1.8" style={{ marginTop: 2 }}>
                        <circle cx="12" cy="12" r="10" />
                        <path d="M12 6v6l4 2" />
                      </svg>
                      <div>
                        <b style={{ fontSize: 12.5, color: "var(--hall-ink-0)", display: "block", marginBottom: 2 }}>{d.title}</b>
                        <span style={{ fontSize: 11, color: "var(--hall-muted-2)", display: "block", lineHeight: 1.4 }}>
                          {d.decisionType}
                        </span>
                        {d.dueDate && (
                          <div className="hall-deadline-when">
                            CLOSES {new Date(d.dueDate).toLocaleDateString("en-GB", { day: "numeric", month: "short" }).toUpperCase()}
                          </div>
                        )}
                      </div>
                    </Link>
                  ))}
                </HallSection>
              )}

              {/* ── Upcoming commitments ─────────────────────────────────── */}
              <HallSection title="Commitments">
                <HallCommitmentLedger />
              </HallSection>

              {/* ── Open decisions (compact right-col peek) ──────────────── */}
              {deskDecisions.length > 0 && (() => {
                const sorted = [...deskDecisions].sort((a, b) => {
                  const pri = (p: string) => p === "P1 Critical" ? 0 : p === "High" ? 1 : 2;
                  return pri(a.priority) - pri(b.priority) ||
                    ((a.dueDate ?? "").localeCompare(b.dueDate ?? ""));
                });
                return (
                  <HallSection
                    title="Open "
                    flourish="decisions"
                    meta={`${deskDecisions.length} OPEN`}
                  >
                    <ul className="flex flex-col">
                      {sorted.slice(0, 4).map(d => {
                        const isP1 = d.priority === "P1 Critical";
                        const isHigh = d.priority === "High";
                        const daysToDue = d.dueDate ? Math.floor((new Date(d.dueDate).getTime() - Date.now()) / 86400000) : null;
                        const dueColor = daysToDue === null ? "var(--hall-muted-3)"
                          : daysToDue < 0 ? "var(--hall-danger)"
                          : daysToDue <= 3 ? "var(--hall-warn)"
                          : "var(--hall-muted-3)";
                        return (
                          <li
                            key={d.id}
                            className="py-2.5"
                            style={{ borderTop: "1px solid var(--hall-line-soft)" }}
                          >
                            <div className="flex items-start gap-2">
                              <span
                                className="shrink-0 mt-0.5 w-1.5 h-1.5 rounded-full"
                                style={{ background: isP1 ? "var(--hall-danger)" : isHigh ? "var(--hall-warn)" : "var(--hall-muted-3)", marginTop: 5 }}
                              />
                              <div className="flex-1 min-w-0">
                                <Link href="/admin/decisions">
                                  <p className="text-[11.5px] font-semibold leading-snug hover:opacity-70 transition-opacity" style={{ color: "var(--hall-ink-0)" }}>
                                    {d.title}
                                  </p>
                                </Link>
                                {daysToDue !== null && (
                                  <p className="text-[9px] font-bold uppercase tracking-wide mt-0.5" style={{ color: dueColor, fontFamily: "var(--font-hall-mono)" }}>
                                    {daysToDue < 0 ? `Overdue ${Math.abs(daysToDue)}d` : daysToDue === 0 ? "Due today" : `Due in ${daysToDue}d`}
                                  </p>
                                )}
                              </div>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                    {deskDecisions.length > 4 && (
                      <Link
                        href="/admin/decisions"
                        className="block text-center text-[9.5px] font-bold uppercase tracking-widest mt-2 hover:opacity-70 transition-opacity"
                        style={{ color: "var(--hall-muted-3)", fontFamily: "var(--font-hall-mono)" }}
                      >
                        +{deskDecisions.length - 4} more →
                      </Link>
                    )}
                  </HallSection>
                );
              })()}

            </div>{/* /hall-today-col-right */}
          </div>{/* /hall-today-grid */}

          {/* Stats row removed in Phase 5 — data was redundant with the
              K-v2 right col (Allocation + Agents + Deadline). */}

          {/* ── Outbox (moved to SIGNALS in Phase 5) ───────────────────────
             Drafts whose approval sends something out of the house —
             LinkedIn posts, emails, delegation briefs. Internal digests
             (Market Signal, Quick Win Scan) surface in their own panels. */}
          {agentDrafts.length > 0 && (
            <div data-hall-tab="signals">
              <SectionHeader label="Outbox" count={agentDrafts.length} />
              <AgentQueueSection drafts={agentDrafts} />
            </div>
          )}

          {/* ── Signals tab — full market feed + ops + manual triggers.
                The K-v2 Today grid above shows compact peeks of Market +
                Inbox; this Signals wrapper hosts the deeper panels and
                the manual agent triggers Jose uses when feeds go stale. ── */}
          <div data-hall-tab="signals" className="hall-today-grid">
            <div className="hall-today-col-left">
              <HallSection title="Market " flourish="signals" meta={marketSignalBriefs.length > 0 ? `${marketSignalBriefs.length} NEW` : undefined}>
                <MarketSignalsPanel
                  text={latestMarketSignals?.text ?? null}
                  date={latestMarketSignals?.date ?? null}
                  generatedAt={latestMarketSignals?.generatedAt ?? null}
                  briefs={marketSignalBriefs}
                />
              </HallSection>

              <HallSection
                title="Competitive "
                flourish="intel"
                meta={
                  competitiveIntel.length > 0
                    ? `${competitiveIntel.length} SIGNALS${
                        competitiveHighCount > 0 ? ` · ${competitiveHighCount} ALTA` : ""
                      }`
                    : "WATCHLIST IDLE"
                }
              >
                <CompetitiveIntelPanel rows={competitiveIntel} lastScanAt={competitiveLastScan} />
              </HallSection>

              <HallSection
                title="Inbox · "
                flourish="needs attention"
                meta={`${inboxData.items.length} VISIBLE · ${inboxData.total_scanned} TOTAL`}
              >
                <InboxTriage initialItems={inboxData.items} initialScanned={inboxData.total_scanned} />
              </HallSection>

              <HallSection title="Waiting on " flourish="others">
                <HallAskQueue />
              </HallSection>

              <HallSection title="Opps going " flourish="cold">
                <HallOppFreshnessRadar />
              </HallSection>
            </div>

            <div className="hall-today-col-right">
              {dailyBriefing?.meetingPrep && (
                <HallSection title="Meeting " flourish="prep">
                  <pre
                    className="text-[11px] leading-[1.65] whitespace-pre-wrap font-sans"
                    style={{ color: "var(--hall-muted-2)" }}
                  >
                    {dailyBriefing.meetingPrep.slice(0, 700)}
                  </pre>
                </HallSection>
              )}

            </div>
          </div>

          {/* ── Two-column main layout — moved to SIGNALS in Phase 5 ──
              Discovery / CoS desk / Parked / Open Decisions / Relationship
              Queue all live here. Today's primary view is now just the
              K-v2 grid above. ── */}
          <div data-hall-tab="signals" className="grid grid-cols-[1fr_340px] gap-6 items-start">

            {/* ── LEFT COLUMN ───────────────────────────────────────────────── */}
            <div className="space-y-6">

              {/* ── 5a+5b. Discovery + CoS — collapse to 1-line when all empty (M1+U1) ── */}
              {(() => {
                const discoveryCount = candidates.length + radarLoops.length;
                const totalCoS = cosTasks.length + rfjGmailDrafts.length + rfjApprovedDrafts.length;
                const allEmpty = discoveryCount === 0 && totalCoS === 0;

                if (allEmpty) {
                  return (
                    <div className="bg-white rounded-xl border border-[#e4e4dd] px-5 py-2.5 flex items-center gap-3">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                      <span className="text-[11px] font-semibold text-[#0a0a0a]/70">System clear</span>
                      <span className="text-[10px] text-[#0a0a0a]/40">— no candidates, no Chief-of-Staff work, no parked loops.</span>
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
                    {substantiveCommitments && (
                      <div
                        className="px-3.5 py-3 mb-3 rounded-[3px]"
                        style={{ background: "var(--hall-paper-1)", border: "1px solid var(--hall-line-soft)" }}
                      >
                        <p
                          className="font-bold uppercase mb-1.5"
                          style={{ fontSize: 9, letterSpacing: "0.18em", color: "var(--hall-muted-3)", fontFamily: "var(--font-hall-mono)" }}
                        >
                          From today&apos;s briefing
                        </p>
                        <pre
                          className="text-[11.5px] leading-[1.6] whitespace-pre-wrap font-sans"
                          style={{ color: "var(--hall-muted-2)" }}
                        >
                          {dailyBriefing!.myCommitments.slice(0, 500)}
                        </pre>
                      </div>
                    )}
                    <ul className="flex flex-col">
                      {sortedDecisions.slice(0, 5).map(d => {
                        const isP1  = d.priority === "P1 Critical";
                        const isHigh = d.priority === "High";
                        const daysToDue = d.dueDate ? Math.floor((new Date(d.dueDate).getTime() - Date.now()) / 86400000) : null;
                        const dueColor = daysToDue === null ? "var(--hall-muted-3)"
                          : daysToDue < 0 ? "var(--hall-danger)"
                          : daysToDue <= 3 ? "var(--hall-warn)"
                          : "var(--hall-muted-3)";
                        const priorityIcon = isP1 ? "⬤" : isHigh ? "◐" : "○";
                        const priorityLabel = isP1 ? "P1" : isHigh ? "P2" : "P3";
                        const iconBg = isP1 ? "var(--hall-danger-soft)" : isHigh ? "var(--hall-warn-paper)" : "var(--hall-fill-soft)";
                        const iconColor = isP1 ? "var(--hall-danger)" : isHigh ? "var(--hall-warn)" : "var(--hall-muted-3)";
                        const leftBorder = isP1 ? "2px solid var(--hall-danger)" : isHigh ? "2px solid var(--hall-warn)" : "none";
                        const preview = d.notes
                          ? d.notes.replace(/\[[A-Z_]+:[^\]]+\]/g, "").replace(/\n+/g, " ").trim().slice(0, 110)
                          : null;
                        return (
                          <li key={d.id} style={{ borderTop: "1px solid var(--hall-line-soft)" }}>
                            <Link
                              href="/admin/decisions"
                              className="flex items-start gap-3 py-2.5"
                              style={{ borderLeft: leftBorder, paddingLeft: leftBorder !== "none" ? 8 : 0 }}
                            >
                              <span
                                className="flex items-center justify-center shrink-0 mt-[1px]"
                                style={{ width: 22, height: 22, borderRadius: 4, background: iconBg, color: iconColor, fontSize: 10, fontWeight: 700 }}
                                title={`${priorityLabel} priority`}
                              >
                                {priorityIcon}
                              </span>
                              <div className="flex-1 min-w-0">
                                <span
                                  className="block text-[12px] font-semibold truncate"
                                  style={{ color: "var(--hall-ink-0)" }}
                                >
                                  {d.title}
                                </span>
                                {preview && (
                                  <span
                                    className="block text-[10.5px] truncate mt-0.5"
                                    style={{ color: "var(--hall-muted-2)" }}
                                  >
                                    {preview}{d.notes && d.notes.length > 110 ? "…" : ""}
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                <span
                                  className="font-bold w-14 text-right"
                                  style={{ fontFamily: "var(--font-hall-mono)", fontSize: 10, color: dueColor }}
                                >
                                  {d.dueDate
                                    ? new Date(d.dueDate).toLocaleDateString("en-GB", { day: "numeric", month: "short" })
                                    : <span className="italic" style={{ color: "var(--hall-muted-3)" }}>no SLA</span>}
                                </span>
                                <span
                                  className="w-28 text-right truncate uppercase"
                                  style={{ fontFamily: "var(--font-hall-mono)", fontSize: 9, color: "var(--hall-muted-3)", letterSpacing: "0.06em" }}
                                >
                                  {d.decisionType}
                                </span>
                              </div>
                            </Link>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                );
              })()}

              {/* ── Relationship Queue ─────────────────────────────────── */}
              {coldRelationships.length > 0 && (
                <div>
                  <SectionHeader label="Relationship queue" count={coldRelationships.length} />
                  <ul className="flex flex-col">
                    {coldRelationships.slice(0, 6).map(r => {
                      const badge = personWarmthBadge(r.warmth);
                      const lastContactDays = r.lastContactDate ? daysSince(r.lastContactDate) : null;
                      const calUrl = r.email
                        ? `https://calendar.google.com/calendar/r/eventedit?add=${encodeURIComponent(r.email)}&text=Catch+up+with+${encodeURIComponent(r.name)}`
                        : "https://calendar.google.com/calendar/r/eventedit";
                      return (
                        <li
                          key={r.id}
                          className="group flex items-center gap-3 py-2.5"
                          style={{ borderTop: "1px solid var(--hall-line-soft)" }}
                        >
                          <span className={`shrink-0 ${badge.dot}`} style={{ width: 8, height: 8, borderRadius: "50%" }} />
                          <div className="flex-1 min-w-0">
                            <span className="block text-[12px] font-semibold truncate" style={{ color: "var(--hall-ink-0)" }}>{r.name}</span>
                            <span className="block text-[10.5px] mt-0.5 truncate" style={{ color: "var(--hall-muted-2)" }}>
                              {r.jobTitle}
                              {lastContactDays !== null ? ` · ${lastContactDays}d silent` : " · never contacted"}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 shrink-0 opacity-70 group-hover:opacity-100 transition-opacity">
                            <span
                              className="uppercase"
                              style={{
                                fontFamily: "var(--font-hall-mono)",
                                fontSize: 9,
                                fontWeight: 700,
                                letterSpacing: "0.08em",
                                color: "var(--hall-muted-2)",
                              }}
                            >
                              {r.warmth}
                            </span>
                            <a
                              href={calUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="hall-btn-primary"
                              style={{ padding: "4px 10px", fontSize: 10.5 }}
                            >
                              Catch up →
                            </a>
                            <DraftCheckinButton
                              personId={r.id}
                              notionUrl={r.notionUrl}
                            />
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}

            </div>

            {/* ── RIGHT COLUMN ──────────────────────────────────────────────── */}
            <div className="flex flex-col gap-7">

              {/* Stale projects */}
              {staleProjects.length > 0 && (
                <div>
                  <SectionHeader label="Stale projects" count={staleProjects.length} />
                  <ul className="flex flex-col">
                    {staleProjects.slice(0, 3).map(p => (
                      <li key={p.id} style={{ borderTop: "1px solid var(--hall-line-soft)" }}>
                        <Link href={`/admin/projects/${p.id}`} className="flex items-center gap-3 py-2.5">
                          <span className="shrink-0" style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--hall-danger)" }} />
                          <span className="flex-1 min-w-0 truncate text-[12px] font-semibold" style={{ color: "var(--hall-ink-0)" }}>{p.name}</span>
                          <span className="font-semibold shrink-0" style={{ fontFamily: "var(--font-hall-mono)", fontSize: 10, color: "var(--hall-danger)" }}>
                            {daysSince(bestActivity(p)) ?? "—"}d
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* OS pulse */}
              <div
                className="flex items-center gap-2.5 px-3 py-2.5 rounded-[3px]"
                style={{ background: "var(--hall-paper-1)", border: "1px solid var(--hall-line-soft)" }}
              >
                <span
                  className="shrink-0"
                  style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--hall-ok)" }}
                />
                <div className="flex-1 min-w-0">
                  <p
                    className="text-[10.5px] font-semibold"
                    style={{ color: "var(--hall-ink-3)", fontFamily: "var(--font-hall-mono)" }}
                  >
                    OS v2 · {coldOnly.length} COLD · {dormantRelationships.length} DORMANT
                  </p>
                  <a
                    href="/admin/agents"
                    className="text-[9px] uppercase tracking-widest font-bold"
                    style={{ color: "var(--hall-muted-2)" }}
                  >
                    Agent log →
                  </a>
                </div>
              </div>

            </div>
          </div>

          {/* ── MONITORING STRIP ─────────────────────────────────────────────
              Two-column grid ends above. Everything below is full-width so the
              right rail never goes visually idle while the portfolio scrolls. */}

          {/* ── Active Portfolio — PORTFOLIO tab only (Phase 5) ──────── */}
          <div data-hall-tab="portfolio">
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
                <div
                  className="flex flex-wrap items-center gap-x-5 gap-y-1 mb-4 text-[11px]"
                  style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted-2)" }}
                >
                  {projBlocked.length > 0 && (
                    <span className="flex items-center gap-1.5">
                      <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--hall-danger)" }} />
                      <span style={{ color: "var(--hall-danger)", fontWeight: 700 }}>{projBlocked.length} BLOCKED</span>
                    </span>
                  )}
                  {projUpdate.length > 0 && (
                    <span className="flex items-center gap-1.5">
                      <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--hall-warn)" }} />
                      <span style={{ color: "var(--hall-warn)", fontWeight: 700 }}>{projUpdate.length} NEED UPDATE</span>
                    </span>
                  )}
                  {projStale.length > 0 && (
                    <span className="flex items-center gap-1.5">
                      <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--hall-danger)", opacity: 0.4 }} />
                      <span>{projStale.length} STALE 30D+</span>
                    </span>
                  )}
                  <span className="flex items-center gap-1.5">
                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--hall-ok)" }} />
                    <span>{projHealthy} HEALTHY</span>
                  </span>
                  {projDormant.length > 0 && (
                    <span className="flex items-center gap-1.5">
                      <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--hall-muted-3)" }} />
                      <span style={{ color: "var(--hall-muted-3)" }}>{projDormant.length} DORMANT</span>
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
                <div className="flex flex-col">
                    {actionableRows.map(p => {
                      const activityDate = bestActivity(p);
                      const days    = daysSince(activityDate);
                      const warmth  = warmthLabel(days);
                      const typeLbl = projectTypeLabel(p.primaryWorkspace);
                      const typeCls = projectTypeBadge(p.primaryWorkspace);
                      const hasSignal = p.blockerCount > 0 || p.updateNeeded;
                      const leftBorder = p.blockerCount > 0 ? "2px solid var(--hall-danger)"
                        : p.updateNeeded ? "2px solid var(--hall-warn)"
                        : "none";
                      return (
                        <Link
                          key={p.id}
                          href={`/admin/projects/${p.id}`}
                          className="grid grid-cols-[minmax(0,1fr)_72px_90px_18px] md:grid-cols-[minmax(0,2.2fr)_minmax(0,1fr)_110px_110px_24px] gap-2 md:gap-3 py-2.5 group items-center"
                          style={{
                            borderTop: "1px solid var(--hall-line-soft)",
                            borderLeft: leftBorder,
                            paddingLeft: leftBorder !== "none" ? 8 : 0,
                          }}
                        >
                          {/* Project name + inline type + geography */}
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 min-w-0 flex-wrap">
                              <span className="text-[12.5px] font-semibold truncate max-w-full" style={{ color: "var(--hall-ink-0)" }}>{p.name}</span>
                              {typeLbl !== "—" && (
                                <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full shrink-0 ${typeCls}`}>{typeLbl}</span>
                              )}
                              {/* Mobile-only: show stage inline under the name since the stage column is hidden */}
                              {p.stage && (
                                <span className={`md:hidden text-[9px] font-bold px-1.5 py-0.5 rounded-full shrink-0 ${STAGE_COLORS[p.stage] ?? "bg-[#f4f4ef] text-[#0a0a0a]/50"}`}>
                                  {p.stage}
                                </span>
                              )}
                            </div>
                            {p.geography.length > 0 && (
                              <span
                                className="block text-[10px] font-medium truncate mt-0.5"
                                style={{ color: "var(--hall-muted-3)", fontFamily: "var(--font-hall-mono)" }}
                              >
                                {p.geography.slice(0, 2).join(" · ")}
                              </span>
                            )}
                          </div>

                          {/* Stage — hidden on mobile, shown inline under project name instead */}
                          <div className="min-w-0 hidden md:block">
                            {p.stage ? (
                              <span className={`inline-block text-[9px] font-bold px-2 py-0.5 rounded-full truncate max-w-full ${STAGE_COLORS[p.stage] ?? "bg-[#f4f4ef] text-[#0a0a0a]/50"}`}>
                                {p.stage}
                              </span>
                            ) : <span className="text-xs" style={{ color: "var(--hall-muted-3)" }}>—</span>}
                          </div>

                          {/* Warmth */}
                          <div className="flex items-center gap-1.5">
                            <span className={`shrink-0 ${warmth.dot}`} style={{ width: 8, height: 8, borderRadius: "50%" }} />
                            <span
                              className="text-[10px] font-bold uppercase"
                              style={{ fontFamily: "var(--font-hall-mono)", letterSpacing: "0.06em", color: "var(--hall-muted-2)" }}
                            >
                              {warmth.label}
                            </span>
                          </div>

                          {/* Signal OR last-update date */}
                          <div className="text-right min-w-0">
                            {hasSignal ? (
                              <div className="flex flex-col items-end gap-0.5" style={{ fontFamily: "var(--font-hall-mono)" }}>
                                {p.blockerCount > 0 && (
                                  <span className="text-[9px] font-bold uppercase" style={{ color: "var(--hall-danger)", letterSpacing: "0.06em" }}>↯ BLOCKED</span>
                                )}
                                {p.updateNeeded && p.blockerCount === 0 && (
                                  <span className="text-[9px] font-bold uppercase" style={{ color: "var(--hall-warn)", letterSpacing: "0.06em" }}>! UPDATE DUE</span>
                                )}
                              </div>
                            ) : p.lastUpdate ? (
                              <span className="text-[10px] font-medium" style={{ color: "var(--hall-muted-2)", fontFamily: "var(--font-hall-mono)" }}>
                                {new Date(p.lastUpdate).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                              </span>
                            ) : days !== null ? (
                              <span className="text-[10px] font-medium" style={{ color: "var(--hall-muted-3)", fontFamily: "var(--font-hall-mono)" }}>{days}d silent</span>
                            ) : (
                              <span className="text-xs" style={{ color: "var(--hall-muted-3)" }}>—</span>
                            )}
                          </div>

                          <div className="text-sm text-right transition-colors" style={{ color: "var(--hall-muted-3)" }}>→</div>
                        </Link>
                      );
                    })}
                    {projects.length === 0 && (
                      <p className="py-6 text-center text-[11px] font-medium" style={{ color: "var(--hall-muted-3)" }}>No active projects</p>
                    )}
                    {/* Collapsed dormant tail */}
                    {dormantRows.length > 0 && (
                      <details className="group">
                        <summary
                          className="list-none cursor-pointer py-2 flex items-center gap-3"
                          style={{ borderTop: "1px solid var(--hall-line-soft)" }}
                        >
                          <span className="shrink-0" style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--hall-muted-3)" }} />
                          <span
                            className="text-[10px] font-bold uppercase"
                            style={{ fontFamily: "var(--font-hall-mono)", letterSpacing: "0.08em", color: "var(--hall-muted-2)" }}
                          >
                            + {dormantRows.length} dormant
                          </span>
                          <span className="text-[9px] group-open:hidden" style={{ color: "var(--hall-muted-3)" }}>show →</span>
                          <span className="text-[9px] hidden group-open:inline" style={{ color: "var(--hall-muted-3)" }}>hide ↑</span>
                        </summary>
                        <div className="flex flex-col">
                          {dormantRows.map(p => {
                            const typeLbl = projectTypeLabel(p.primaryWorkspace);
                            const typeCls = projectTypeBadge(p.primaryWorkspace);
                            const activityDate = bestActivity(p);
                            const days = daysSince(activityDate);
                            return (
                              <Link
                                key={p.id}
                                href={`/admin/projects/${p.id}`}
                                className="grid grid-cols-[minmax(0,2.2fr)_minmax(0,1fr)_110px_110px_24px] gap-3 py-2 items-center opacity-60"
                                style={{ borderTop: "1px solid var(--hall-line-soft)" }}
                              >
                                <div className="min-w-0">
                                  <div className="flex items-center gap-2 min-w-0">
                                    <span className="text-[11.5px] truncate" style={{ color: "var(--hall-muted-2)" }}>{p.name}</span>
                                    {typeLbl !== "—" && (
                                      <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded-full shrink-0 ${typeCls}`}>{typeLbl}</span>
                                    )}
                                  </div>
                                </div>
                                <div>
                                  {p.stage && <span className={`inline-block text-[9px] font-bold px-2 py-0.5 rounded-full ${STAGE_COLORS[p.stage] ?? "bg-[#f4f4ef] text-[#0a0a0a]/50"}`}>{p.stage}</span>}
                                </div>
                                <div className="text-[10px]" style={{ color: "var(--hall-muted-3)", fontFamily: "var(--font-hall-mono)" }}>DORMANT</div>
                                <div className="text-right text-[10px]" style={{ color: "var(--hall-muted-3)", fontFamily: "var(--font-hall-mono)" }}>{days != null ? `${days}d silent` : "—"}</div>
                                <div className="text-sm text-right" style={{ color: "var(--hall-muted-3)" }}>→</div>
                              </Link>
                            );
                          })}
                        </div>
                      </details>
                    )}
                </div>
                  );
                })()}
              </div>
            );
          })()}
          </div>

          {/* ── Opportunities Explorer — PORTFOLIO tab only ─────────────── */}
          <div data-hall-tab="portfolio">
          {(() => {
            const total = filteredOpps.ch.length + filteredOpps.portfolio.length;
            if (total === 0) return null;
            const renderInline = total <= 3;

            if (renderInline) {
              return (
                <HallSection title="Opportunities · " flourish="explore" meta={`${total} TOTAL`}>
                  <OpportunityExplorer ch={filteredOpps.ch} portfolio={filteredOpps.portfolio} />
                </HallSection>
              );
            }

            return (
              <details className="group mb-7">
                <summary
                  className="list-none cursor-pointer flex items-baseline justify-between gap-3 pb-2 mb-3.5"
                  style={{ borderBottom: "1px solid var(--hall-ink-0)" }}
                >
                  <h2
                    className="text-[19px] font-bold leading-none flex items-baseline gap-2"
                    style={{ letterSpacing: "-0.02em", color: "var(--hall-ink-0)" }}
                  >
                    <span>Opportunities · <em className="hall-flourish">explore</em></span>
                    <span style={{ fontFamily: "var(--font-hall-mono)", fontSize: 12, fontWeight: 600, color: "var(--hall-muted-2)" }}>
                      {total}
                    </span>
                  </h2>
                  <span
                    className="text-[9px] font-bold uppercase tracking-widest whitespace-nowrap group-open:hidden"
                    style={{ color: "var(--hall-muted-2)" }}
                  >
                    Show →
                  </span>
                  <span
                    className="text-[9px] font-bold uppercase tracking-widest whitespace-nowrap hidden group-open:inline"
                    style={{ color: "var(--hall-muted-2)" }}
                  >
                    Hide ↑
                  </span>
                </summary>
                <p className="text-[10.5px] mb-3" style={{ color: "var(--hall-muted-2)" }}>
                  Low-pressure exploration. Nothing requires action — flag anything that looks worth pursuing.
                </p>
                <OpportunityExplorer ch={filteredOpps.ch} portfolio={filteredOpps.portfolio} />
              </details>
            );
          })()}
          </div>

          {/* ── Ready to Publish ─────────────────────────────────────── */}
          {readyContent.length > 0 && (
            <div data-hall-tab="signals">
              <SectionHeader label="Ready to publish" count={readyContent.length} />
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {readyContent.map(c => (
                  <a
                    key={c.id}
                    href={c.notionUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-3.5 py-3 rounded-[3px] transition-colors"
                    style={{ border: "1px solid var(--hall-line-soft)", background: "var(--hall-paper-0)" }}
                  >
                    <p
                      className="font-bold uppercase mb-1"
                      style={{
                        fontFamily: "var(--font-hall-mono)",
                        fontSize: 9,
                        letterSpacing: "0.1em",
                        color: "var(--hall-muted-3)",
                      }}
                    >
                      {c.platform} · {c.contentType}
                    </p>
                    <p className="text-[12.5px] font-semibold leading-snug" style={{ color: "var(--hall-ink-0)" }}>{c.title}</p>
                    {c.publishWindow && (
                      <p className="text-[10.5px] mt-1" style={{ color: "var(--hall-muted-2)" }}>Window: {c.publishWindow}</p>
                    )}
                  </a>
                ))}
              </div>
            </div>
          )}

          {/* Old dedicated Signals wrapper removed in Phase 2b — its content
              now lives in the repurposed signals grid higher up. */}

          {/* ── RELATIONSHIPS tab — network, classes, time allocation ────── */}
          <div data-hall-tab="relationships" className="hall-today-grid">
            <div className="hall-today-col-left">
              <HallSection title="Time " flourish="allocation">
                <HallTimeAllocation />
              </HallSection>
              <HallSection title="Cold " flourish="orgs">
                <HallOrgsColdRelations />
              </HallSection>
            </div>
            <div className="hall-today-col-right">
              <HallSection title="Network " flourish="mix">
                <HallOrgsClassMix />
              </HallSection>
              <HallSection title="Contacts & " flourish="organizations">
                <p className="text-[11px] mb-3" style={{ color: "var(--hall-muted-2)" }}>
                  Tag who&apos;s who · classify senders · maintain the registry
                </p>
                <div className="flex gap-2">
                  <Link
                    href="/admin/hall/contacts"
                    className="hall-btn-primary"
                    style={{ padding: "6px 12px", fontSize: 11 }}
                  >
                    Contacts →
                  </Link>
                  <Link
                    href="/admin/hall/organizations"
                    className="hall-btn-outline"
                    style={{ padding: "5px 11px", fontSize: 11 }}
                  >
                    Orgs →
                  </Link>
                  <Link
                    href="/admin/hall/network"
                    className="hall-btn-ghost"
                    style={{ fontSize: 11 }}
                  >
                    Network graph →
                  </Link>
                </div>
              </HallSection>
            </div>
          </div>

        </div>
        </HallTabs>
      </main>
    </div>
  );
}
