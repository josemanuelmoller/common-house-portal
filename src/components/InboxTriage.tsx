"use client";

import { useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";

export type InboxItem = {
  /**
   * action_items.id (uuid). Present when the item comes from the normalization
   * layer (Phase 3+). Older flows may omit it. Required for the new resolve
   * route; fallback path below uses threadId against /api/inbox-ignore.
   */
  actionItemId?: string;
  threadId: string;
  subject: string;
  from: string;
  fromName: string;
  snippet: string;
  daysWaiting: number;
  isUnread: boolean;
  label: "Urgent" | "Needs Reply" | "FYI";
  reason: string;
  gmailUrl: string;
  /** Imperative next-action line (Phase 3) or 1-line Haiku summary (legacy). */
  summary?: string | null;
};

const LABEL_STYLE: Record<string, string> = {
  "Urgent":      "bg-red-50 text-red-600 border border-red-200",
  "Needs Reply": "bg-amber-50 text-amber-600 border border-amber-200",
  "FYI":         "bg-[#f4f4ef] text-[#0a0a0a]/40 border border-[#e4e4dd]",
};

const LABEL_DOT: Record<string, string> = {
  "Urgent":      "bg-red-500",
  "Needs Reply": "bg-amber-400",
  "FYI":         "bg-[#0a0a0a]/20",
};

const MAX_VISIBLE_ROWS = 5;

interface Props {
  /** Pre-fetched server-side data. If provided, skips the initial client fetch. */
  initialItems?: InboxItem[];
  initialScanned?: number;
}

export function InboxTriage({ initialItems, initialScanned = 0 }: Props) {
  // If server-side fetch succeeded, start with those items; otherwise start empty and auto-load
  const serverHasData = initialItems !== undefined && initialItems.length > 0;
  const [items, setItems]             = useState<InboxItem[]>(initialItems ?? []);
  const [loading, setLoading]         = useState(!serverHasData); // auto-load when no server data
  const [error, setError]             = useState<string | null>(null);
  const [scanned, setScanned]         = useState<number>(initialScanned);
  const [hidden, setHidden]           = useState<Set<string>>(new Set());
  const [ignoring, setIgnoring]       = useState<string | null>(null);
  const [creating, setCreating]       = useState<string | null>(null); // threadId being created
  const [created, setCreated]         = useState<Set<string>>(new Set()); // threadIds already created
  const [failed, setFailed]           = useState<Set<string>>(new Set()); // threadIds that failed
  const router = useRouter();

  const refresh = useCallback(async () => {
    // Phase 3: data source is now the server component (action_items layer),
    // so refresh = re-render the server. No direct /api/inbox-triage fetch.
    setLoading(true);
    setError(null);
    try {
      router.refresh();
    } finally {
      // Next server render will reset items via fresh props; clear loading
      // state after a short beat so the spinner doesn't flash forever.
      setTimeout(() => setLoading(false), 300);
    }
  }, [router]);

  // Auto-load on mount when the server didn't provide data
  useEffect(() => {
    if (!serverHasData) router.refresh();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function createCandidate(item: InboxItem) {
    setCreating(item.threadId);
    try {
      const res = await fetch("/api/create-candidate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fromName: item.fromName,
          from:     item.from,
          subject:  item.subject,
          snippet:  item.snippet,
          gmailUrl: item.gmailUrl,
        }),
      });
      if (res.ok) {
        setCreated(prev => new Set(prev).add(item.threadId));
        setFailed(prev => { const s = new Set(prev); s.delete(item.threadId); return s; });
        router.refresh();
      } else {
        setFailed(prev => new Set(prev).add(item.threadId));
      }
    } catch {
      setFailed(prev => new Set(prev).add(item.threadId));
    } finally {
      setCreating(null);
    }
  }

  async function ignoreItem(item: InboxItem) {
    setIgnoring(item.threadId);
    // Optimistic hide — server persists it, refresh confirms it won't resurface.
    setHidden(prev => new Set(prev).add(item.threadId));
    try {
      // Phase 3: resolve via the normalized action_items layer when we have
      // an actionItemId. Legacy fallback (threadId → inbox_ignores) kept for
      // any stale items still flowing through the old path.
      const res = item.actionItemId
        ? await fetch(`/api/action-items/${item.actionItemId}/resolve`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ reason: "manual_dismiss" }),
          })
        : await fetch("/api/inbox-ignore", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              threadId: item.threadId,
              subject:  item.subject,
              from:     item.from,
            }),
          });
      if (!res.ok) {
        // Rollback on failure so the user sees the real state.
        setHidden(prev => { const s = new Set(prev); s.delete(item.threadId); return s; });
      } else {
        router.refresh();
      }
    } catch {
      setHidden(prev => { const s = new Set(prev); s.delete(item.threadId); return s; });
    } finally {
      setIgnoring(null);
    }
  }

  const visible = items.filter(i => !hidden.has(i.threadId));

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-3">
        <span className="w-1.5 h-1.5 rounded-full bg-[#0a0a0a]/20 animate-pulse" />
        <span className="text-[11px] text-[#0a0a0a]/30">Refreshing inbox…</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-between py-2">
        <p className="text-[11px] text-[#0a0a0a]/30">{error}</p>
        <button
          onClick={refresh}
          className="text-[9px] font-bold text-[#0a0a0a]/25 hover:text-[#0a0a0a] transition-colors uppercase tracking-widest"
        >
          Retry
        </button>
      </div>
    );
  }

  if (visible.length === 0) {
    // B3 — Inbox zero celebration. Green dot + positive copy rewards the state.
    return (
      <div className="max-w-[760px] flex items-center justify-between py-3 px-4 bg-emerald-50/40 rounded-xl border border-emerald-200/60">
        <div className="flex items-center gap-2.5">
          <span className="w-2 h-2 rounded-full bg-emerald-500" />
          <p className="text-[12px] font-semibold text-emerald-900">Inbox zero</p>
          <p className="text-[11px] text-emerald-900/60">— nothing waiting on you.</p>
        </div>
        <button
          onClick={refresh}
          className="text-[9px] font-bold text-emerald-700/60 hover:text-emerald-900 transition-colors uppercase tracking-widest"
        >
          Refresh
        </button>
      </div>
    );
  }

  // Approx row height is ~72px — cap container so ~5 rows show before scroll.
  const overflow = visible.length > MAX_VISIBLE_ROWS;

  return (
    <div>
      <ul
        className={`flex flex-col ${overflow ? "max-h-[380px] overflow-y-auto" : ""}`}
      >
        {visible.map((item) => (
          <li
            key={item.threadId}
            className="group grid items-center py-2.5 gap-3"
            style={{
              gridTemplateColumns: "32px 1fr auto",
              borderTop: "1px solid var(--hall-line-soft)",
            }}
          >
            <div
              className="grid place-items-center"
              style={{
                width: 32,
                height: 32,
                borderRadius: "50%",
                background: "var(--hall-fill-soft)",
                border: "1px solid var(--hall-line)",
              }}
              aria-hidden
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" style={{ color: "var(--hall-ink-3)" }}>
                <rect x="3" y="5" width="18" height="14" rx="2" />
                <path d="M3 7l9 6 9-6" />
              </svg>
            </div>

            <div className="min-w-0">
              <div className="flex items-start gap-2 min-w-0">
                <span
                  className="text-[12.8px] font-semibold line-clamp-1 leading-snug"
                  style={{ color: "var(--hall-ink-0)" }}
                >
                  {item.summary ?? item.subject}
                </span>
                {item.isUnread && (
                  <span
                    className="font-bold uppercase tracking-widest shrink-0 mt-[2px]"
                    style={{
                      fontFamily: "var(--font-hall-mono)",
                      fontSize: 8,
                      color: "var(--hall-muted-3)",
                      background: "var(--hall-fill-soft)",
                      padding: "1px 5px",
                      borderRadius: 100,
                    }}
                  >
                    Unread
                  </span>
                )}
              </div>
              <span
                className="block text-[11px] line-clamp-1"
                style={{ color: "var(--hall-muted-2)" }}
              >
                <span className="font-semibold" style={{ color: "var(--hall-ink-3)" }}>{item.fromName}</span>
                {item.reason && (
                  <>
                    <span> · </span>
                    <span className="italic">{item.reason}</span>
                  </>
                )}
              </span>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <span
                className="font-semibold tabular-nums"
                style={{
                  fontFamily: "var(--font-hall-mono)",
                  fontSize: 10,
                  color: item.daysWaiting >= 5 ? "var(--hall-danger)" : "var(--hall-muted-3)",
                }}
              >
                {item.daysWaiting}d
              </span>
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <a
                  href={item.gmailUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hall-btn-primary"
                  style={{ padding: "4px 10px", fontSize: 10.5 }}
                >
                  Open →
                </a>
                {created.has(item.threadId) ? (
                  <span
                    className="text-[11px] font-bold w-5 h-5 flex items-center justify-center"
                    style={{ color: "var(--hall-ok)" }}
                    title="Candidate created"
                  >
                    ✓
                  </span>
                ) : failed.has(item.threadId) ? (
                  <button
                    onClick={() => createCandidate(item)}
                    disabled={creating === item.threadId}
                    title="Failed — click to retry"
                    className="w-5 h-5 flex items-center justify-center text-[11px] font-bold disabled:opacity-40"
                    style={{ color: "var(--hall-danger)" }}
                  >
                    {creating === item.threadId ? "…" : "↻"}
                  </button>
                ) : (
                  <button
                    onClick={() => createCandidate(item)}
                    disabled={creating === item.threadId}
                    title="Create opportunity candidate from this email"
                    aria-label="Create opportunity candidate"
                    className="w-5 h-5 flex items-center justify-center text-[13px] font-bold leading-none disabled:opacity-40"
                    style={{ color: "var(--hall-muted-3)" }}
                  >
                    {creating === item.threadId ? "…" : "+"}
                  </button>
                )}
                <button
                  onClick={() => ignoreItem(item)}
                  disabled={ignoring === item.threadId}
                  title="Ignore this thread — won't resurface"
                  aria-label="Ignore"
                  className="w-5 h-5 flex items-center justify-center text-[12px] leading-none disabled:opacity-40"
                  style={{ color: "var(--hall-muted-3)" }}
                >
                  {ignoring === item.threadId ? "…" : "×"}
                </button>
              </div>
            </div>
          </li>
        ))}
      </ul>

      <div className="flex items-center justify-between pt-1.5 px-1">
        <p className="text-[9px] text-[#0a0a0a]/25">
          {visible.length} flagged
          {overflow && (
            <span className="text-[#0a0a0a]/55"> — {visible.length - MAX_VISIBLE_ROWS} more below (scroll)</span>
          )}
          <span className="text-[#0a0a0a]/15"> · {scanned} scanned</span>
        </p>
        <button
          onClick={refresh}
          className="text-[9px] font-bold text-[#0a0a0a]/25 hover:text-[#0a0a0a] transition-colors uppercase tracking-widest"
        >
          Refresh
        </button>
      </div>
    </div>
  );
}
