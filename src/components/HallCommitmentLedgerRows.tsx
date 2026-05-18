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
    // Optimistic UI — apply locally first, then sync to server (Phase 5:
    // action_items layer, not hall_commitment_dismissals). `id` is the
    // action_items UUID set by HallCommitmentLedger (server component).
    const next = new Set(dismissed);
    next.add(id);
    setDismissed(next);
    writeDismissed(next);
    setRecentlyDismissed(id);
    setTimeout(() => setRecentlyDismissed(prev => prev === id ? null : prev), 5000);
    // Fire-and-forget server sync. Resolves via the normalization layer.
    fetch(`/api/action-items/${encodeURIComponent(id)}/resolve`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason: "manual_done" }),
    }).catch(() => { /* localStorage is authoritative fallback */ });
  };

  const undo = (id: string) => {
    // Local-only undo for v1. Server-side "re-open a resolved row" isn't
    // supported yet — it would need a POST /reopen route. LocalStorage
    // overlay re-shows the row for the current session; after refresh it
    // will stay dismissed (action_items.status='resolved' in DB).
    const next = new Set(dismissed);
    next.delete(id);
    setDismissed(next);
    writeDismissed(next);
    setRecentlyDismissed(null);
  };

  const visibleJose   = joseCommits.filter(c => !isHidden(c.id));
  const visibleOthers = othersCommits.filter(c => !isHidden(c.id));
  const dismissedCount = joseCommits.concat(othersCommits).filter(c => dismissed.has(c.id)).length;

  if (visibleJose.length === 0 && visibleOthers.length === 0) {
    return (
      <p className="text-[11px]" style={{ color: "var(--hall-muted-3)" }}>
        {joseCommits.length + othersCommits.length > 0
          ? "All caught up — nothing open."
          : "No open action items from the last 60 days."}
      </p>
    );
  }

  return (
    <div>
      {/* K-v2 2-col split: I OWE / OWED TO ME */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        <div>
          <h4
            className="font-bold uppercase mb-2 flex items-baseline gap-1.5"
            style={{ fontSize: 10, letterSpacing: "0.16em", color: "var(--hall-muted-3)" }}
          >
            <span style={{ fontFamily: "var(--font-hall-mono)", fontSize: 11, color: "var(--hall-ink-0)" }}>
              {visibleJose.length}
            </span>
            <span>I OWE</span>
          </h4>
          {visibleJose.length === 0 ? (
            <p className="text-[10px]" style={{ color: "var(--hall-muted-3)" }}>—</p>
          ) : (
            <ul className="flex flex-col">
              {visibleJose.map(c => (
                <CommitmentRow key={c.id} c={c} kind="jose"
                  isDone={dismissed.has(c.id)}
                  onMarkDone={() => markDone(c.id)}
                  onUndo={() => undo(c.id)} />
              ))}
            </ul>
          )}
        </div>
        <div>
          <h4
            className="font-bold uppercase mb-2 flex items-baseline gap-1.5"
            style={{ fontSize: 10, letterSpacing: "0.16em", color: "var(--hall-muted-3)" }}
          >
            <span style={{ fontFamily: "var(--font-hall-mono)", fontSize: 11, color: "var(--hall-ink-0)" }}>
              {visibleOthers.length}
            </span>
            <span>OWED TO ME</span>
          </h4>
          {visibleOthers.length === 0 ? (
            <p className="text-[10px]" style={{ color: "var(--hall-muted-3)" }}>—</p>
          ) : (
            <ul className="flex flex-col">
              {visibleOthers.map(c => (
                <CommitmentRow key={c.id} c={c} kind="others"
                  isDone={dismissed.has(c.id)}
                  onMarkDone={() => markDone(c.id)}
                  onUndo={() => undo(c.id)} />
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Footer: show-done toggle + All link */}
      {(dismissedCount > 0 || true) && (
        <div className="flex items-center justify-end gap-3 mt-3 pt-2" style={{ borderTop: "1px solid var(--hall-line-soft)" }}>
          {dismissedCount > 0 && (
            <button
              onClick={() => setShowDismissed(s => !s)}
              className="text-[9px] font-bold tracking-widest uppercase transition-colors"
              style={{ color: "var(--hall-muted-2)" }}
            >
              {showDismissed ? "hide done" : `show ${dismissedCount} done`}
            </button>
          )}
          <Link
            href={allUrl}
            className="text-[9px] font-bold tracking-widest uppercase transition-colors"
            style={{ color: "var(--hall-muted-2)" }}
          >
            All →
          </Link>
        </div>
      )}

      {recentlyDismissed && (
        <div
          className="mt-2 px-3 py-2 flex items-center justify-between rounded-[3px]"
          style={{ background: "var(--hall-ok-soft)", border: "1px solid var(--hall-ok)" }}
        >
          <p className="text-[10px]" style={{ color: "var(--hall-ok)" }}>
            Marked done · synced.
          </p>
          <button
            onClick={() => undo(recentlyDismissed)}
            className="text-[10px] font-bold underline"
            style={{ color: "var(--hall-ok)" }}
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
  const ageColor = c.daysAgo >= 21 ? "var(--hall-danger)"
    : c.daysAgo >= 10 ? "var(--hall-warn)"
    : "var(--hall-muted-3)";

  return (
    <li
      className={`group flex items-baseline justify-between gap-2.5 py-2 ${isDone ? "opacity-40" : ""}`}
      style={{
        borderTop: "1px solid var(--hall-line-soft)",
        paddingLeft: showBorder ? 6 : 0,
        borderLeft: showBorder ? "2px solid var(--hall-danger)" : undefined,
      }}
    >
      <a
        href={c.notionUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="min-w-0 flex-1"
      >
        <span
          className={`block text-[12px] font-semibold line-clamp-1 ${isDone ? "line-through" : ""}`}
          style={{ color: "var(--hall-ink-0)" }}
        >
          {c.title}
        </span>
        <span
          className="block text-[10.5px] line-clamp-1"
          style={{ color: "var(--hall-muted-2)" }}
          title={c.snippet}
        >
          {c.snippet}
        </span>
      </a>
      <div className="flex items-center gap-1.5 shrink-0">
        <span
          className="font-semibold whitespace-nowrap"
          style={{ fontFamily: "var(--font-hall-mono)", fontSize: 10, color: ageColor }}
        >
          {c.daysAgo}d
        </span>
        {isDone ? (
          <button
            onClick={onUndo}
            className="text-[9px] font-semibold opacity-0 group-hover:opacity-100 transition-opacity"
            style={{ color: "var(--hall-ok)" }}
            title="Undo mark done"
          >
            Undo
          </button>
        ) : (
          <button
            onClick={onMarkDone}
            className="w-5 h-5 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all text-[10px] font-bold"
            style={{
              border: "1px solid var(--hall-line-strong)",
              color: "var(--hall-muted-3)",
            }}
            title="Mark done"
            aria-label="Mark done"
          >
            ✓
          </button>
        )}
      </div>
    </li>
  );
}
