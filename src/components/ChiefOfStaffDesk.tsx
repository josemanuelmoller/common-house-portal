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

function loopBadge(loopType: CoSTask["loopType"]): { label: string; cls: string } {
  switch (loopType) {
    case "blocker":    return { label: "Blocker",    cls: "bg-red-50 text-red-600 border-red-200" };
    case "commitment": return { label: "Commitment", cls: "bg-amber-50 text-amber-700 border-amber-200" };
    case "decision":   return { label: "Decision",   cls: "bg-purple-50 text-purple-600 border-purple-200" };
    case "prep":       return { label: "Prep needed", cls: "bg-blue-50 text-blue-600 border-blue-200" };
    case "review":     return { label: "Review",      cls: "bg-sky-50 text-sky-600 border-sky-200" };
    case "follow-up":  return { label: "Follow-up",   cls: "bg-green-50 text-green-700 border-green-200" };
    default:           return { label: "Action",      cls: "bg-[#EFEFEA] text-[#131218]/50 border-[#E0E0D8]" };
  }
}

function interventionHint(moment: CoSTask["interventionMoment"]): string {
  switch (moment) {
    case "urgent":           return "Handle today";
    case "next_meeting":     return "Raise in next meeting";
    case "email_this_week":  return "Send email this week";
    case "review_this_week": return "Review doc this week";
    case "this_week":        return "This week";
    default:                 return "";
  }
}

function signalBadge(signal: CoSTask["entrySignal"]): { label: string; cls: string } {
  switch (signal) {
    case "meeting_soon":     return { label: "Meeting soon",   cls: "bg-red-50 text-red-600 border-red-200" };
    case "review_needed":    return { label: "Review needed",  cls: "bg-blue-50 text-blue-600 border-blue-200" };
    case "negotiation":      return { label: "Negotiation",    cls: "bg-purple-50 text-purple-600 border-purple-200" };
    case "proposal_pending": return { label: "Proposal sent",  cls: "bg-amber-50 text-amber-600 border-amber-200" };
    case "inbound":          return { label: "Inbound",        cls: "bg-green-50 text-green-700 border-green-200" };
    default:                 return { label: "Follow-up",      cls: "bg-[#EFEFEA] text-[#131218]/50 border-[#E0E0D8]" };
  }
}

function statusBadge(status: CoSTask["taskStatus"]): { label: string; cls: string } | null {
  switch (status) {
    case "in-progress": return { label: "In progress", cls: "bg-blue-50 text-blue-600 border-blue-200" };
    case "waiting":     return { label: "Waiting",     cls: "bg-[#EFEFEA] text-[#131218]/40 border-[#E0E0D8]" };
    // "todo" for a row that was previously reopened — Loop Engine surfaces it
    // as actionable again, but we still want the lineage context visible.
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
  const lBadge       = loopBadge(task.loopType);
  const sBadge       = statusBadge(task.taskStatus);
  const dueDateStr   = dueDateLabel(task.dueDate);
  const dueDateCls   = dueDateColor(task.dueDate);
  const hint         = interventionHint(task.interventionMoment);

  return (
    <div className={`divide-y divide-[#EFEFEA] ${urgencyBar(task.urgency)}`}>

      {/* ── Main row ──────────────────────────────────────────────────────── */}
      <div className="px-5 py-4">
        <div className="flex items-start gap-3">
          <span className={`w-2 h-2 rounded-full shrink-0 mt-1.5 ${urgencyDot(task.urgency)}`} />

          <div className="flex-1 min-w-0">

            {/* Badges row — loopType is primary */}
            <div className="flex items-center gap-1.5 mb-1.5 flex-wrap">
              <span className={`text-[8px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded-full border ${lBadge.cls}`}>
                {lBadge.label}
              </span>
              {sBadge && (
                <span className={`text-[8px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded-full border ${sBadge.cls}`}>
                  {sBadge.label}
                </span>
              )}
              {(task.reopenCount ?? 0) > 0 && (
                <span className="text-[8px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded-full border bg-orange-50 text-orange-600 border-orange-200">
                  Reopened{(task.reopenCount ?? 0) > 1 ? ` ×${task.reopenCount}` : ""}
                </span>
              )}
              {hint && (
                <span className="text-[8px] font-medium text-[#131218]/30 uppercase tracking-widest">
                  · {hint}
                </span>
              )}
              {task.opportunityType && task.opportunityType !== "Project" && (
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

            {/* Source context — SECONDARY */}
            <p className="text-[9.5px] text-[#131218]/30 font-medium mt-0.5">
              {task.taskSource === "project" ? "Project" : "Opportunity"}:{" "}
              <span className="font-semibold text-[#131218]/50">{task.opportunityName}</span>
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

            {/* ── Debug strip (admin observability) ──────────────────────── */}
            <div className="mt-2 pt-2 border-t border-dashed border-[#131218]/8">
              <p className="text-[8px] font-mono text-[#131218]/25 leading-relaxed">
                <span className="font-bold uppercase tracking-widest">debug</span>
                {" · "}status={task.loopStatus ?? task.taskStatus}
                {" · "}passive={task.isPassiveDiscovery ? "yes" : "no"}
                {" · "}founder-owned={task.founderOwned ? "yes" : "no"}
                {" · "}reopened={
                  (task.reopenCount ?? 0) > 0
                    ? `yes ×${task.reopenCount}`
                    : "no"
                }
                {" · "}source={task.loopEngineId ? "engine" : "notion-fallback"}
                {task.loopEngineId && (
                  <span title={task.loopEngineId}>{" · "}id={task.loopEngineId.slice(0, 8)}…</span>
                )}
              </p>
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

    // Optimistic hide for TERMINAL transitions only (Done, Dropped).
    // Waiting / In Progress are VISIBLE persistent states — never hide them.
    const terminal = status === "Done" || status === "Dropped";
    if (terminal) {
      setLocalDone(prev => new Set(prev).add(taskId));
    }

    const task = tasks.find(t => t.id === taskId);
    const isLoopEngineTask = !!task?.loopEngineId;

    let cosOk  = true;
    let loopSyncOk = true;

    try {
      if (isLoopEngineTask) {
        const resp = await fetch("/api/cos-loops", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ loopId: task!.loopEngineId, status }),
        });
        cosOk = resp.ok;

        // Keep Notion in sync for opportunity-sourced loops. Now AWAITED so we
        // know the real end-to-end result — persistence must be confirmed both
        // in Supabase (loops) and in Notion (Follow-up Status) for opportunity
        // tasks, otherwise a refresh would revert the button.
        if (task?.taskSource === "opportunity") {
          const notionPageId = task.notionUrl.split("/").pop()?.replace(/-/g, "");
          if (notionPageId && notionPageId.length === 32) {
            try {
              const r2 = await fetch("/api/followup-status", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ opportunityId: notionPageId, status }),
              });
              if (r2.ok) {
                const body = await r2.json().catch(() => ({} as { loop_sync_ok?: boolean }));
                loopSyncOk = body?.loop_sync_ok !== false;
              } else {
                loopSyncOk = false;
              }
            } catch {
              loopSyncOk = false;
            }
          }
        }
      } else if (task?.taskSource === "project" || task?.taskSource === "evidence") {
        // Notion-fallback task (no Loop Engine row). Hall renders from a
        // separate read path in this case; nothing to persist server-side.
        // (Kept as a no-op branch — preserves prior behavior for cold start.)
      } else {
        // Notion-fallback opportunity
        const resp = await fetch("/api/followup-status", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ opportunityId: taskId, status }),
        });
        cosOk = resp.ok;
      }
    } catch {
      cosOk = false;
    }

    if (!cosOk || !loopSyncOk) {
      // Revert optimistic hide on failure; user will retry.
      if (terminal) {
        setLocalDone(prev => { const s = new Set(prev); s.delete(taskId); return s; });
      }
      // Visible surface for partial failure (followup-status shape).
      if (!loopSyncOk) {
        console.warn("[ChiefOfStaffDesk] Partial persistence: Notion updated but Loop Engine sync failed.");
      }
    }

    // Always refresh so the server-rendered list reflects the new state.
    router.refresh();
    setUpdating(null);
  }

  const visible = tasks.filter(t => !localDone.has(t.id));

  if (visible.length === 0) {
    return (
      <div className="flex items-center gap-3 bg-white/50 border border-dashed border-[#E0E0D8] rounded-xl px-4 py-2">
        <span className="w-1.5 h-1.5 rounded-full bg-[#c8f55a] shrink-0" />
        <p className="text-[11px] text-[#131218]/45 flex-1 min-w-0">
          Desk is clear — tasks surface when work has a review link, meeting, or explicit action.
        </p>
      </div>
    );
  }

  const criticalCount = visible.filter(t => t.urgency === "critical").length;
  const highCount     = visible.filter(t => t.urgency === "high").length;

  return (
    <div>
      {/* Summary strip — mono K-v2 style */}
      {(criticalCount > 0 || highCount > 0) && (
        <div
          className="flex items-center gap-3 mb-3 text-[10px]"
          style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted-2)" }}
        >
          {criticalCount > 0 && (
            <span
              className="font-bold uppercase px-1.5 py-0.5 rounded-[3px]"
              style={{
                fontSize: 9,
                letterSpacing: "0.12em",
                color: "var(--hall-danger)",
                background: "var(--hall-danger-soft)",
                border: "1px solid var(--hall-danger)",
              }}
            >
              {criticalCount} CRITICAL
            </span>
          )}
          {highCount > 0 && (
            <span
              className="font-bold uppercase px-1.5 py-0.5 rounded-[3px]"
              style={{
                fontSize: 9,
                letterSpacing: "0.12em",
                color: "var(--hall-warn)",
                background: "var(--hall-warn-soft)",
                border: "1px solid var(--hall-warn)",
              }}
            >
              {highCount} HIGH PRIORITY
            </span>
          )}
          <span style={{ color: "var(--hall-muted-3)" }}>Tasks · not opportunities</span>
        </div>
      )}

      {/* Task list */}
      <div className="flex flex-col">
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

// ─── Parked Section ───────────────────────────────────────────────────────────
//
// Separate compact strip for loops the user has explicitly marked Waiting.
// These persist across refreshes. Resume = transition back to open.
// Done / Drop on a parked loop move it to terminal state.

export function ParkedLoopsSection({ tasks }: { tasks: CoSTask[] }) {
  const router = useRouter();
  const [updating, setUpdating] = useState<string | null>(null);
  const [hidden, setHidden]     = useState<Set<string>>(new Set());

  async function transition(taskId: string, loopId: string, status: string) {
    setUpdating(taskId);
    if (status === "Done" || status === "Dropped" || status === "Needed") {
      setHidden(prev => new Set(prev).add(taskId));
    }
    try {
      const resp = await fetch("/api/cos-loops", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ loopId, status }),
      });
      if (!resp.ok) {
        setHidden(prev => { const s = new Set(prev); s.delete(taskId); return s; });
      }
    } catch {
      setHidden(prev => { const s = new Set(prev); s.delete(taskId); return s; });
    }
    router.refresh();
    setUpdating(null);
  }

  const visible = tasks.filter(t => !hidden.has(t.id));
  if (visible.length === 0) return null;

  return (
    <div>
      <div
        className="flex items-center gap-2 mb-3"
        style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted-2)" }}
      >
        <span
          className="font-bold uppercase"
          style={{ fontSize: 9, letterSpacing: "0.12em" }}
        >
          Parked · Waiting
        </span>
        <span style={{ fontSize: 9, color: "var(--hall-muted-3)" }}>{visible.length}</span>
        <span className="ml-auto" style={{ fontSize: 9, color: "var(--hall-muted-3)" }}>
          Out of the urgent queue until you resume
        </span>
      </div>
      <ul className="flex flex-col">
        {visible.map(task => {
          const loopId = task.loopEngineId;
          if (!loopId) return null;
          const isUpdating = updating === task.id;
          return (
            <li
              key={task.id}
              className="group py-2 flex items-center gap-3"
              style={{ borderTop: "1px solid var(--hall-line-soft)" }}
            >
              <span
                className="shrink-0"
                style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--hall-muted-3)" }}
              />
              <div className="flex-1 min-w-0">
                <span className="block text-[11.5px] font-semibold truncate" style={{ color: "var(--hall-ink-3)" }}>
                  {task.taskTitle}
                </span>
                <span className="block text-[10.5px] truncate" style={{ color: "var(--hall-muted-3)" }}>
                  {task.opportunityName}
                </span>
              </div>
              <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={() => transition(task.id, loopId, "Needed")}
                  disabled={isUpdating}
                  className="hall-btn-outline disabled:opacity-40"
                  style={{ padding: "3px 9px", fontSize: 10 }}
                >
                  Resume
                </button>
                <button
                  onClick={() => transition(task.id, loopId, "Done")}
                  disabled={isUpdating}
                  className="hall-btn-primary disabled:opacity-40"
                  style={{ padding: "3px 9px", fontSize: 10 }}
                >
                  ✓ Done
                </button>
                <button
                  onClick={() => transition(task.id, loopId, "Dropped")}
                  disabled={isUpdating}
                  className="text-[11px] transition-colors px-1"
                  style={{ color: "var(--hall-muted-3)" }}
                  title="Drop"
                >
                  ×
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
