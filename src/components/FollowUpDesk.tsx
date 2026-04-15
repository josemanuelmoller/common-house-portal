"use client";

/**
 * FollowUpDesk — Chief-of-Staff Follow-up Desk
 *
 * Signals-based queue that surfaces every active opportunity that needs
 * attention, not just manually-flagged ones. Renders richer cards with:
 *   – Why this is in the queue
 *   – Pending action (computed or manual)
 *   – Next meeting date
 *   – Review link (proposal/doc)
 *   – Recommended move CTA
 *   – Status actions: Handled / Reviewing / Waiting
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { FollowUpDeskItem } from "@/lib/notion";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function signalBadge(signal: FollowUpDeskItem["entrySignal"]): { label: string; cls: string } {
  switch (signal) {
    case "has_meeting":      return { label: "Meeting soon",    cls: "bg-red-50 text-red-600 border-red-200" };
    case "negotiation_stale": return { label: "Negotiation",    cls: "bg-purple-50 text-purple-600 border-purple-200" };
    case "proposal_stale":   return { label: "Proposal sent",  cls: "bg-amber-50 text-amber-600 border-amber-200" };
    case "manual":           return { label: "Follow-up",      cls: "bg-[#EFEFEA] text-[#131218]/50 border-[#E0E0D8]" };
    default:                 return { label: "Active",         cls: "bg-[#EFEFEA] text-[#131218]/40 border-[#E0E0D8]" };
  }
}

function urgencyDot(level: FollowUpDeskItem["urgencyLevel"]): string {
  if (level === "urgent") return "bg-red-500";
  if (level === "high")   return "bg-amber-400";
  return "bg-[#131218]/20";
}

function moveLabel(move: FollowUpDeskItem["recommendedMove"]): string {
  switch (move) {
    case "review_doc":         return "Review doc";
    case "advance_negotiation": return "Advance negotiation";
    case "schedule_meeting":   return "Schedule meeting";
    default:                   return "Draft follow-up";
  }
}

// ─── Single item card ─────────────────────────────────────────────────────────

function DeskCard({
  item,
  onStatusChange,
  updating,
}: {
  item: FollowUpDeskItem;
  onStatusChange: (id: string, status: string) => Promise<void>;
  updating: string | null;
}) {
  const [expanded, setExpanded] = useState(false);
  const badge = signalBadge(item.entrySignal);
  const isUpdating = updating === item.id;
  const meetingDateLabel = item.nextMeetingDate
    ? new Date(item.nextMeetingDate).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "short" })
    : null;

  // Derive a short doc label from the URL
  const reviewDocLabel = item.reviewUrl
    ? (() => {
        try {
          const url = new URL(item.reviewUrl);
          return url.pathname.split("/").filter(Boolean).pop()?.replace(/[-_]/g, " ") || "View document";
        } catch {
          return "View document";
        }
      })()
    : null;

  return (
    <div className={`divide-y divide-[#EFEFEA] ${item.urgencyLevel === "urgent" ? "border-l-2 border-red-400" : item.urgencyLevel === "high" ? "border-l-2 border-amber-400" : ""}`}>
      {/* Main row */}
      <div className="px-5 py-4">
        <div className="flex items-start gap-3">
          <span className={`w-2 h-2 rounded-full shrink-0 mt-1.5 ${urgencyDot(item.urgencyLevel)}`} />

          <div className="flex-1 min-w-0">
            {/* Top line: badges */}
            <div className="flex items-center gap-1.5 mb-1 flex-wrap">
              <span className={`text-[8px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded-full border ${badge.cls}`}>
                {badge.label}
              </span>
              {item.scope && (
                <span className="text-[8px] font-bold uppercase tracking-widest text-[#131218]/25">
                  {item.scope}
                </span>
              )}
              {item.type && (
                <span className="text-[8px] font-bold uppercase tracking-widest text-[#131218]/20">
                  · {item.type}
                </span>
              )}
            </div>

            {/* Opportunity name */}
            <p className="text-[13px] font-semibold text-[#131218] leading-tight">
              {item.name}
            </p>
            {item.orgName && (
              <p className="text-[10.5px] text-[#131218]/40 mt-0.5">{item.orgName}</p>
            )}

            {/* Why in queue */}
            <p className="text-[10px] text-[#131218]/35 mt-0.5 font-medium">{item.entryReason}</p>

            {/* Pending action — always visible */}
            <div className="mt-2.5 flex items-start gap-2">
              <span className="text-[10px] font-bold text-[#131218]/20 mt-0.5 shrink-0">⚡</span>
              <p className={`text-[11.5px] font-semibold leading-snug ${item.urgencyLevel === "urgent" ? "text-red-600" : item.urgencyLevel === "high" ? "text-amber-600" : "text-[#131218]/70"}`}>
                {item.pendingActionLabel}
              </p>
            </div>

            {/* Meeting date */}
            {meetingDateLabel && (
              <div className="mt-1.5 flex items-center gap-1.5">
                <span className="text-[10px] text-[#131218]/25">📅</span>
                <p className="text-[10.5px] text-[#131218]/50 font-medium">
                  Meeting: <span className="font-bold text-[#131218]/70">{meetingDateLabel}</span>
                </p>
              </div>
            )}

            {/* Review link */}
            {item.reviewUrl && (
              <div className="mt-1 flex items-center gap-1.5">
                <span className="text-[10px] text-[#131218]/25">📄</span>
                <a
                  href={item.reviewUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[10.5px] text-blue-600 hover:text-blue-800 font-medium truncate max-w-[260px] transition-colors"
                >
                  {reviewDocLabel} →
                </a>
              </div>
            )}
          </div>

          {/* Expand/collapse toggle */}
          <button
            onClick={() => setExpanded(x => !x)}
            className="text-[#131218]/20 hover:text-[#131218]/50 transition-colors text-xs shrink-0 mt-0.5"
            aria-label={expanded ? "Collapse" : "Expand"}
          >
            {expanded ? "▲" : "▼"}
          </button>
        </div>

        {/* Action row — always visible */}
        <div className="flex items-center gap-2 mt-3 ml-5 flex-wrap">
          {/* Primary CTA */}
          {item.reviewUrl ? (
            <a
              href={item.reviewUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[10px] font-bold text-white bg-[#131218] hover:bg-[#131218]/80 px-3 py-1.5 rounded-lg transition-colors"
            >
              {moveLabel(item.recommendedMove)} →
            </a>
          ) : (
            <a
              href={item.notionUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[10px] font-bold text-white bg-[#131218] hover:bg-[#131218]/80 px-3 py-1.5 rounded-lg transition-colors"
            >
              Open in Notion →
            </a>
          )}

          {/* Calendar block — only if review + imminent meeting */}
          {item.calendarBlockUrl && (
            <a
              href={item.calendarBlockUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[10px] font-bold text-[#131218]/60 bg-[#EFEFEA] hover:bg-[#E0E0D8] px-3 py-1.5 rounded-lg transition-colors"
            >
              📅 Block 1h for review
            </a>
          )}

          {/* Draft follow-up */}
          {!item.reviewUrl && (
            <a
              href={item.notionUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[10px] font-bold text-[#131218]/50 hover:text-[#131218] px-2 py-1.5 transition-colors"
            >
              Draft follow-up →
            </a>
          )}

          {/* Status actions */}
          <div className="flex items-center gap-1 ml-auto">
            <button
              onClick={() => onStatusChange(item.id, "Sent")}
              disabled={isUpdating}
              className="text-[9px] font-bold text-green-600 bg-green-50 border border-green-200 hover:bg-green-100 px-2 py-1 rounded-full transition-colors disabled:opacity-40"
            >
              {isUpdating ? "…" : "✓ Handled"}
            </button>
            <button
              onClick={() => onStatusChange(item.id, "Waiting")}
              disabled={isUpdating}
              className="text-[9px] font-bold text-[#131218]/40 bg-[#EFEFEA] hover:bg-[#E0E0D8] px-2 py-1 rounded-full transition-colors disabled:opacity-40"
            >
              Waiting
            </button>
          </div>
        </div>
      </div>

      {/* Expanded details */}
      {expanded && (
        <div className="px-5 py-3 bg-[#FAFAF8]">
          <div className="ml-5 space-y-1.5">
            <p className="text-[9px] font-bold uppercase tracking-widest text-[#131218]/25">Details</p>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[10.5px]">
              <div><span className="text-[#131218]/35">Stage</span> <span className="font-semibold text-[#131218]/70">{item.stage || "—"}</span></div>
              <div><span className="text-[#131218]/35">Score</span> <span className="font-semibold text-[#131218]/70">{item.score !== null ? `${item.score}/100` : "—"}</span></div>
              <div><span className="text-[#131218]/35">Last edited</span> <span className="font-semibold text-[#131218]/70">{item.lastEdited ? new Date(item.lastEdited).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : "—"}</span></div>
              <div><span className="text-[#131218]/35">Qualification</span> <span className="font-semibold text-[#131218]/70">{item.qualificationStatus || "—"}</span></div>
            </div>
            {item.pendingAction && (
              <div className="mt-1 pt-1 border-t border-[#EFEFEA]">
                <p className="text-[9px] font-bold uppercase tracking-widest text-[#131218]/25 mb-0.5">Pending action note</p>
                <p className="text-[10.5px] text-[#131218]/60">{item.pendingAction}</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main export ──────────────────────────────────────────────────────────────

export function FollowUpDesk({ items }: { items: FollowUpDeskItem[] }) {
  const router = useRouter();
  const [updating, setUpdating] = useState<string | null>(null);

  async function handleStatusChange(opportunityId: string, status: string) {
    setUpdating(opportunityId);
    try {
      await fetch("/api/followup-status", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ opportunityId, status }),
      });
      router.refresh();
    } catch {
      // silently fail — Notion write errors don't need user-visible errors here
    } finally {
      setUpdating(null);
    }
  }

  if (items.length === 0) {
    return (
      <div className="bg-white/50 border border-dashed border-[#E0E0D8] rounded-2xl px-5 py-10 text-center">
        <p className="text-[12px] text-[#131218]/25 font-medium">No active follow-ups</p>
        <p className="text-[10.5px] text-[#131218]/18 mt-1">
          Items appear here when opportunities are Active, Proposal Sent, or in Negotiation
        </p>
      </div>
    );
  }

  const urgentCount = items.filter(i => i.urgencyLevel === "urgent").length;
  const highCount   = items.filter(i => i.urgencyLevel === "high").length;

  return (
    <div className="bg-white rounded-2xl border border-[#E0E0D8] overflow-hidden">
      {/* Status strip */}
      {urgentCount > 0 && <div className="h-0.5 bg-red-400" />}
      {urgentCount === 0 && highCount > 0 && <div className="h-0.5 bg-amber-400" />}
      {urgentCount === 0 && highCount === 0 && <div className="h-0.5 bg-[#E0E0D8]" />}

      {/* Summary bar */}
      {(urgentCount > 0 || highCount > 0) && (
        <div className="px-5 py-2.5 bg-[#FAFAF8] border-b border-[#EFEFEA] flex items-center gap-3">
          {urgentCount > 0 && (
            <span className="text-[9px] font-bold text-red-600 bg-red-50 border border-red-200 px-2 py-0.5 rounded-full uppercase tracking-widest">
              {urgentCount} urgent
            </span>
          )}
          {highCount > 0 && (
            <span className="text-[9px] font-bold text-amber-600 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full uppercase tracking-widest">
              {highCount} high priority
            </span>
          )}
          <p className="text-[9px] text-[#131218]/25 font-medium">Sorted by urgency · signals-based detection</p>
        </div>
      )}

      {/* Item list */}
      <div className="divide-y divide-[#EFEFEA]">
        {items.map(item => (
          <DeskCard
            key={item.id}
            item={item}
            onStatusChange={handleStatusChange}
            updating={updating}
          />
        ))}
      </div>
    </div>
  );
}
