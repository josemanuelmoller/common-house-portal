"use client";

/**
 * ChiefOfStaffDesk — concrete action layer
 *
 * Renders CoS Tasks derived from Opportunities. These are NOT opportunity cards —
 * they are action cards. The task (WHAT TO DO) is prominent; the opportunity it
 * relates to is secondary context.
 *
 * Architecture note:
 *   Opportunities = strategic / commercial pipeline layer (grants, partnerships, etc.)
 *   CoS Tasks     = derived action layer (review this doc, prep for this meeting, etc.)
 *   A single Opportunity can generate 0 or 1 task in v1.
 *   Status stored in Follow-up Status field on the Opportunity record.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { CoSTask } from "@/lib/notion";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function urgencyBar(urgency: CoSTask["urgency"]): string {
  if (urgency === "critical") return "border-l-2 border-red-400";
  if (urgency === "high")     return "border-l-2 border-amber-400";
  return "";
}

function urgencyDot(urgency: CoSTask["urgency"]): string {
  if (urgency === "critical") return "bg-red-500";
  if (urgency === "high")     return "bg-amber-400";
  return "bg-[#131218]/20";
}

function urgencyTaskColor(urgency: CoSTask["urgency"]): string {
  if (urgency === "critical") return "text-red-700";
  if (urgency === "high")     return "text-amber-700";
  return "text-[#131218]/80";
}

function signalBadge(signal: CoSTask["entrySignal"]): { label: string; cls: string } {
  switch (signal) {
    case "meeting_soon":     return { label: "Meeting soon",   cls: "bg-red-50 text-red-600 border-red-200" };
    case "review_needed":    return { label: "Review needed",  cls: "bg-blue-50 text-blue-600 border-blue-200" };
    case "negotiation":      return { label: "Negotiation",    cls: "bg-purple-50 text-purple-600 border-purple-200" };
    case "proposal_pending": return { label: "Proposal sent",  cls: "bg-amber-50 text-amber-600 border-amber-200" };
    default:                 return { label: "Follow-up",      cls: "bg-[#EFEFEA] text-[#131218]/50 border-[#E0E0D8]" };
  }
}

function statusBadge(status: CoSTask["taskStatus"]): { label: string; cls: string } | null {
  switch (status) {
    case "in-progress": return { label: "In progress", cls: "bg-blue-50 text-blue-600 border-blue-200" };
    case "waiting":     return { label: "Waiting",     cls: "bg-[#EFEFEA] text-[#131218]/40 border-[#E0E0D8]" };
    default:            return null;
  }
}

function dueDateLabel(isoDate: string | null): string | null {
  if (!isoDate) return null;
  const d = new Date(isoDate);
  const msToDate = d.getTime() - Date.now();
  const days = Math.floor(msToDate / 86400000);
  if (days < 0)   return `Overdue (${Math.abs(days)}d)`;
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  return d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "short" });
}

function dueDateColor(isoDate: string | null): string {
  if (!isoDate) return "text-[#131218]/30";
  const days = Math.floor((new Date(isoDate).getTime() - Date.now()) / 86400000);
  if (days < 0)   return "text-red-600 font-bold";
  if (days === 0) return "text-red-500 font-bold";
  if (days === 1) return "text-amber-600 font-semibold";
  if (days <= 3)  return "text-amber-500 font-semibold";
  return "text-[#131218]/50";
}

// ─── Single Task Card ─────────────────────────────────────────────────────────

function TaskCard({
  task,
  onStatusChange,
  updating,
}: {
  task: CoSTask;
  onStatusChange: (id: string, status: string) => Promise<void>;
  updating: string | null;
}) {
  const [expanded, setExpanded] = useState(false);
  const isUpdating   = updating === task.id;
  const badge        = signalBadge(task.entrySignal);
  const sBadge       = statusBadge(task.taskStatus);
  const dueDateStr   = dueDateLabel(task.dueDate);
  const dueDateCls   = dueDateColor(task.dueDate);

  return (
    <div className={`divide-y divide-[#EFEFEA] ${urgencyBar(task.urgency)}`}>

      {/* ── Main row ──────────────────────────────────────────────────────── */}
      <div className="px-5 py-4">
        <div className="flex items-start gap-3">
          <span className={`w-2 h-2 rounded-full shrink-0 mt-1.5 ${urgencyDot(task.urgency)}`} />

          <div className="flex-1 min-w-0">

            {/* Badges row */}
            <div className="flex items-center gap-1.5 mb-1.5 flex-wrap">
              <span className={`text-[8px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded-full border ${badge.cls}`}>
                {badge.label}
              </span>
              {sBadge && (
                <span className={`text-[8px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded-full border ${sBadge.cls}`}>
                  {sBadge.label}
                </span>
              )}
              {task.opportunityType && (
                <span className="text-[8px] font-bold text-[#131218]/20 uppercase tracking-widest">
                  · {task.opportunityType}
                </span>
              )}
            </div>

            {/* ⚡ Task title — PRIMARY: what to do */}
            <p className={`text-[13.5px] font-bold leading-snug mb-1 ${urgencyTaskColor(task.urgency)}`}>
              {task.taskTitle}
            </p>

            {/* Signal reason (why this is a task) */}
            <p className="text-[10px] text-[#131218]/35 font-medium mb-1.5">
              {task.signalReason}
            </p>

            {/* Due date / meeting date */}
            {dueDateStr && (
              <div className="flex items-center gap-1.5 mb-1.5">
                <span className="text-[10px] text-[#131218]/25">📅</span>
                <span className={`text-[10.5px] ${dueDateCls}`}>{dueDateStr}</span>
              </div>
            )}

            {/* Review link */}
            {task.reviewUrl && (
              <div className="flex items-center gap-1.5 mb-1.5">
                <span className="text-[10px] text-[#131218]/25">📄</span>
                <a
                  href={task.reviewUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[10.5px] text-blue-600 hover:text-blue-800 font-medium truncate max-w-[260px] transition-colors"
                >
                  Open doc →
                </a>
              </div>
            )}

            {/* Opportunity context — SECONDARY */}
            <p className="text-[9.5px] text-[#131218]/30 font-medium mt-0.5">
              Opportunity: <span className="font-semibold text-[#131218]/50">{task.opportunityName}</span>
              {task.orgName && task.orgName !== task.opportunityName && (
                <span className="text-[#131218]/30"> · {task.orgName}</span>
              )}
              <span className="text-[#131218]/25"> · {task.opportunityStage || "—"}</span>
            </p>

          </div>

          {/* Expand toggle */}
          <button
            onClick={() => setExpanded(x => !x)}
            className="text-[#131218]/20 hover:text-[#131218]/50 transition-colors text-xs shrink-0 mt-0.5"
            aria-label={expanded ? "Collapse" : "Expand"}
          >
            {expanded ? "▲" : "▼"}
          </button>
        </div>

        {/* ── Action row ───────────────────────────────────────────────── */}
        <div className="flex items-center gap-2 mt-3 ml-5 flex-wrap">
          {/* Primary CTA */}
          {task.reviewUrl ? (
            <a
              href={task.reviewUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[10px] font-bold text-white bg-[#131218] hover:bg-[#131218]/80 px-3 py-1.5 rounded-lg transition-colors"
            >
              Open doc →
            </a>
          ) : (
            <a
              href={task.notionUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[10px] font-bold text-white bg-[#131218] hover:bg-[#131218]/80 px-3 py-1.5 rounded-lg transition-colors"
            >
              Open in Notion →
            </a>
          )}

          {/* Calendar block */}
          {task.calendarBlockUrl && (
            <a
              href={task.calendarBlockUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[10px] font-bold text-[#131218]/60 bg-[#EFEFEA] hover:bg-[#E0E0D8] px-3 py-1.5 rounded-lg transition-colors"
            >
              📅 Block 1h
            </a>
          )}

          {/* Status actions — right-aligned */}
          <div className="flex items-center gap-1 ml-auto">
            {task.taskStatus !== "in-progress" && (
              <button
                onClick={() => onStatusChange(task.id, "In Progress")}
                disabled={isUpdating}
                className="text-[9px] font-bold text-blue-600 bg-blue-50 border border-blue-200 hover:bg-blue-100 px-2 py-1 rounded-full transition-colors disabled:opacity-40"
              >
                {isUpdating ? "…" : "In progress"}
              </button>
            )}
            {task.taskStatus !== "waiting" && (
              <button
                onClick={() => onStatusChange(task.id, "Waiting")}
                disabled={isUpdating}
                className="text-[9px] font-bold text-[#131218]/40 bg-[#EFEFEA] hover:bg-[#E0E0D8] px-2 py-1 rounded-full transition-colors disabled:opacity-40"
              >
                Waiting
              </button>
            )}
            <button
              onClick={() => onStatusChange(task.id, "Done")}
              disabled={isUpdating}
              className="text-[9px] font-bold text-green-600 bg-green-50 border border-green-200 hover:bg-green-100 px-2 py-1 rounded-full transition-colors disabled:opacity-40"
            >
              {isUpdating ? "…" : "✓ Done"}
            </button>
          </div>
        </div>
      </div>

      {/* ── Expanded details ─────────────────────────────────────────────── */}
      {expanded && (
        <div className="px-5 py-3 bg-[#FAFAF8]">
          <div className="ml-5 space-y-2">
            <p className="text-[9px] font-bold uppercase tracking-widest text-[#131218]/25">Task context</p>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[10.5px]">
              <div><span className="text-[#131218]/35">Stage</span> <span className="font-semibold text-[#131218]/70">{task.opportunityStage || "—"}</span></div>
              <div><span className="text-[#131218]/35">Type</span> <span className="font-semibold text-[#131218]/70">{task.opportunityType || "—"}</span></div>
              <div><span className="text-[#131218]/35">Task status</span> <span className="font-semibold text-[#131218]/70">{task.taskStatus}</span></div>
            </div>

            {/* Drop task */}
            <div className="pt-1.5 flex items-center gap-2">
              <button
                onClick={() => onStatusChange(task.id, "Dropped")}
                disabled={isUpdating}
                className="text-[9px] font-bold text-[#131218]/25 hover:text-[#131218]/50 transition-colors"
              >
                Drop task →
              </button>
              <a
                href={task.notionUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[9px] font-bold text-[#131218]/25 hover:text-[#131218]/50 transition-colors ml-auto"
              >
                Notion →
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main export ──────────────────────────────────────────────────────────────

export function ChiefOfStaffDesk({ tasks }: { tasks: CoSTask[] }) {
  const router  = useRouter();
  const [updating, setUpdating] = useState<string | null>(null);
  const [localDone, setLocalDone] = useState<Set<string>>(new Set());

  async function handleStatusChange(taskId: string, status: string) {
    setUpdating(taskId);
    // Optimistic hide for Done / Dropped
    if (status === "Done" || status === "Dropped") {
      setLocalDone(prev => new Set(prev).add(taskId));
    }
    try {
      await fetch("/api/followup-status", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ opportunityId: taskId, status }),
      });
      router.refresh();
    } catch {
      // On error, remove the optimistic hide
      if (status === "Done" || status === "Dropped") {
        setLocalDone(prev => { const s = new Set(prev); s.delete(taskId); return s; });
      }
    } finally {
      setUpdating(null);
    }
  }

  const visible = tasks.filter(t => !localDone.has(t.id));

  if (visible.length === 0) {
    return (
      <div className="bg-white/50 border border-dashed border-[#E0E0D8] rounded-2xl px-5 py-10 text-center">
        <p className="text-[12px] text-[#131218]/25 font-medium">No active tasks</p>
        <p className="text-[10.5px] text-[#131218]/18 mt-1">
          Tasks appear here when opportunities have a meeting scheduled, a pending review, or an explicit action
        </p>
      </div>
    );
  }

  const criticalCount = visible.filter(t => t.urgency === "critical").length;
  const highCount     = visible.filter(t => t.urgency === "high").length;

  return (
    <div className="bg-white rounded-2xl border border-[#E0E0D8] overflow-hidden">
      {/* Urgency stripe */}
      {criticalCount > 0
        ? <div className="h-0.5 bg-red-400" />
        : highCount > 0
          ? <div className="h-0.5 bg-amber-400" />
          : <div className="h-0.5 bg-[#E0E0D8]" />
      }

      {/* Summary strip */}
      {(criticalCount > 0 || highCount > 0) && (
        <div className="px-5 py-2.5 bg-[#FAFAF8] border-b border-[#EFEFEA] flex items-center gap-3">
          {criticalCount > 0 && (
            <span className="text-[9px] font-bold text-red-600 bg-red-50 border border-red-200 px-2 py-0.5 rounded-full uppercase tracking-widest">
              {criticalCount} critical
            </span>
          )}
          {highCount > 0 && (
            <span className="text-[9px] font-bold text-amber-600 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full uppercase tracking-widest">
              {highCount} high priority
            </span>
          )}
          <p className="text-[9px] text-[#131218]/25 font-medium">Tasks · not opportunities</p>
        </div>
      )}

      {/* Task list */}
      <div className="divide-y divide-[#EFEFEA]">
        {visible.map(task => (
          <TaskCard
            key={task.id}
            task={task}
            onStatusChange={handleStatusChange}
            updating={updating}
          />
        ))}
      </div>
    </div>
  );
}
