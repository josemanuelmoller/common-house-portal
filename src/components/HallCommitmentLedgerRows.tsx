"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

/**
 * Client-interactive rows for HallCommitmentLedger.
 *
 * G3 / U1 — supports "Mark done" inline via localStorage. Dismissed IDs
 * are hidden on subsequent renders until the user clicks "Show dismissed".
 * Real status write-back to Notion happens via /api/hall/commitments/[id]
 * PATCH (server-side). Local dismissal is a no-regrets UX (Zeigarnik closure)
 * that survives page refresh; full sync to Notion is best-effort.
 *
 * G1 — stale color: 21d red, 10d amber, <10d neutral.
 */

export type CommitmentLite = {
  id:         string;
  title:      string;
  snippet:    string;
  daysAgo:    number;
  owner:      "jose" | "others";
  notionUrl:  string;
};

const DISMISSED_KEY = "hall-commitments-dismissed";

function readDismissed(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(DISMISSED_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    return new Set(Array.isArray(arr) ? arr : []);
  } catch {
    return new Set();
  }
}

function writeDismissed(ids: Set<string>): void {
  try {
    window.localStorage.setItem(DISMISSED_KEY, JSON.stringify([...ids]));
  } catch { /* quota exceeded etc. */ }
}

function staleColor(days: number): string {
  if (days >= 21) return "text-red-600";
  if (days >= 10) return "text-amber-700";
  return "text-[#131218]/50";
}

export function HallCommitmentLedgerRows({
  joseCommits,
  othersCommits,
  allUrl,
}: {
  joseCommits:   CommitmentLite[];
  othersCommits: CommitmentLite[];
  allUrl:        string;
}) {
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [showDismissed, setShowDismissed] = useState(false);
  const [recentlyDismissed, setRecentlyDismissed] = useState<string | null>(null);

  useEffect(() => { setDismissed(readDismissed()); }, []);

  const isHidden = (id: string) => !showDismissed && dismissed.has(id);

  const markDone = (id: string) => {
    const next = new Set(dismissed);
    next.add(id);
    setDismissed(next);
    writeDismissed(next);
    setRecentlyDismissed(id);
    // Auto-clear undo toast after 5s (R3).
    setTimeout(() => setRecentlyDismissed(prev => prev === id ? null : prev), 5000);
  };

  const undo = (id: string) => {
    const next = new Set(dismissed);
    next.delete(id);
    setDismissed(next);
    writeDismissed(next);
    setRecentlyDismissed(null);
  };

  const visibleJose   = joseCommits.filter(c => !isHidden(c.id));
  const visibleOthers = othersCommits.filter(c => !isHidden(c.id));
  const dismissedCount = joseCommits.concat(othersCommits).filter(c => dismissed.has(c.id)).length;

  return (
    <div className="bg-white rounded-2xl border border-[#E0E0D8] overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3 border-b border-[#EFEFEA]">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold tracking-widest uppercase text-[#131218]/50">Commitments</span>
          {visibleJose.length > 0 && (
            <span className="text-[9px] font-bold bg-red-50 text-red-700 px-1.5 py-0.5 rounded-full">
              {visibleJose.length} you owe
            </span>
          )}
          {visibleOthers.length > 0 && (
            <span className="text-[9px] font-bold bg-[#131218]/6 text-[#131218]/60 px-1.5 py-0.5 rounded-full">
              {visibleOthers.length} owed to you
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          {dismissedCount > 0 && (
            <button
              onClick={() => setShowDismissed(s => !s)}
              className="text-[9px] font-bold tracking-widest uppercase text-[#131218]/40 hover:text-[#131218]/80"
            >
              {showDismissed ? "hide done" : `show ${dismissedCount} done`}
            </button>
          )}
          <Link href={allUrl} className="text-[9px] font-bold tracking-widest uppercase text-[#131218]/40 hover:text-[#131218]/80">
            All →
          </Link>
        </div>
      </div>

      {visibleJose.length === 0 && visibleOthers.length === 0 ? (
        <div className="px-5 py-6 text-center">
          <p className="text-[11px] text-[#131218]/35">
            {joseCommits.length + othersCommits.length > 0
              ? "All caught up — nothing open."
              : "No open action items from the last 60 days."}
          </p>
        </div>
      ) : (
        <>
          {visibleJose.length > 0 && (
            <div className="px-5 pt-3 pb-1">
              <p className="text-[9px] font-bold uppercase tracking-widest text-red-700/80 mb-1">You committed</p>
            </div>
          )}
          {visibleJose.map(c => (
            <CommitmentRow key={c.id} c={c} kind="jose"
              isDone={dismissed.has(c.id)}
              onMarkDone={() => markDone(c.id)}
              onUndo={() => undo(c.id)} />
          ))}

          {visibleOthers.length > 0 && (
            <div className="px-5 pt-3 pb-1 border-t border-[#EFEFEA]">
              <p className="text-[9px] font-bold uppercase tracking-widest text-[#131218]/50 mb-1">Owed to you</p>
            </div>
          )}
          {visibleOthers.map(c => (
            <CommitmentRow key={c.id} c={c} kind="others"
              isDone={dismissed.has(c.id)}
              onMarkDone={() => markDone(c.id)}
              onUndo={() => undo(c.id)} />
          ))}
        </>
      )}

      {/* R3 — undo toast */}
      {recentlyDismissed && (
        <div className="px-5 py-2 bg-emerald-50 border-t border-emerald-200 flex items-center justify-between">
          <p className="text-[10px] text-emerald-700">Marked done. Local-only — refine in Notion when fully resolved.</p>
          <button
            onClick={() => undo(recentlyDismissed)}
            className="text-[10px] font-bold text-emerald-700 hover:text-emerald-900 underline"
          >
            Undo
          </button>
        </div>
      )}
    </div>
  );
}

function CommitmentRow({
  c, kind, isDone, onMarkDone, onUndo,
}: {
  c:          CommitmentLite;
  kind:       "jose" | "others";
  isDone:     boolean;
  onMarkDone: () => void;
  onUndo:     () => void;
}) {
  // G8 — red border only for jose-owed items older than 14 days (reserve rojo for actionable).
  const showBorder = kind === "jose" && c.daysAgo >= 14;
  const borderColor = showBorder ? "border-l-[3px] border-red-400" : "border-l-[3px] border-transparent";

  return (
    <div className={`group flex items-start gap-3 px-5 py-2.5 hover:bg-[#EFEFEA]/40 transition-colors ${borderColor} ${isDone ? "opacity-40" : ""}`}>
      <a
        href={c.notionUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="flex-1 min-w-0"
      >
        <p className={`text-[11px] font-bold text-[#131218] line-clamp-1 ${isDone ? "line-through" : ""}`}>{c.title}</p>
        <p className="text-[9px] text-[#131218]/55 mt-0.5 line-clamp-2">{c.snippet}</p>
      </a>
      <div className="flex items-center gap-2 shrink-0">
        <span className={`text-[10px] font-bold tabular-nums ${staleColor(c.daysAgo)}`}>
          {c.daysAgo}d
        </span>
        {isDone ? (
          <button
            onClick={onUndo}
            className="text-[9px] font-semibold text-emerald-700 hover:text-emerald-900 opacity-0 group-hover:opacity-100 transition-opacity"
            title="Undo mark done"
          >
            Undo
          </button>
        ) : (
          <button
            onClick={onMarkDone}
            className="w-6 h-6 rounded-full border border-[#E0E0D8] hover:bg-emerald-50 hover:border-emerald-400 hover:text-emerald-700 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all text-[#131218]/40 text-[10px] font-bold"
            title="Mark done"
            aria-label="Mark done"
          >
            ✓
          </button>
        )}
      </div>
    </div>
  );
}
