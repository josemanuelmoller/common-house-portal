"use client";

import { useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";

export type InboxItem = {
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
};

const LABEL_STYLE: Record<string, string> = {
  "Urgent":      "bg-red-50 text-red-600 border border-red-200",
  "Needs Reply": "bg-amber-50 text-amber-600 border border-amber-200",
  "FYI":         "bg-[#EFEFEA] text-[#131218]/40 border border-[#E0E0D8]",
};

const LABEL_DOT: Record<string, string> = {
  "Urgent":      "bg-red-500",
  "Needs Reply": "bg-amber-400",
  "FYI":         "bg-[#131218]/20",
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
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/inbox-triage", {
        headers: { "x-agent-key": "ch-os-agent-2024-secure" },
      });
      if (!res.ok) {
        setError("Failed to refresh inbox");
        return;
      }
      const data = await res.json();
      setItems(data.items ?? []);
      setScanned(data.total_scanned ?? 0);
    } catch {
      setError("Could not reach inbox-triage");
    } finally {
      setLoading(false);
    }
  }, []);

  // Auto-load on mount when the server didn't provide data
  useEffect(() => {
    if (!serverHasData) refresh();
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
      const res = await fetch("/api/inbox-ignore", {
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
        <span className="w-1.5 h-1.5 rounded-full bg-[#131218]/20 animate-pulse" />
        <span className="text-[11px] text-[#131218]/30">Refreshing inbox…</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-between py-2">
        <p className="text-[11px] text-[#131218]/30">{error}</p>
        <button
          onClick={refresh}
          className="text-[9px] font-bold text-[#131218]/25 hover:text-[#131218] transition-colors uppercase tracking-widest"
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
    <div className="max-w-[760px]">
      <div
        className={`bg-white rounded-xl border border-[#E0E0D8] divide-y divide-[#E0E0D8] ${
          overflow ? "max-h-[60vh] sm:max-h-[380px] overflow-y-auto" : ""
        }`}
      >
        {visible.map((item) => (
          <div
            key={item.threadId}
            className="px-3.5 py-2.5 flex items-start gap-3 hover:bg-[#FAFAF5] transition-colors"
          >
            <span className={`mt-[5px] w-1.5 h-1.5 rounded-full shrink-0 ${LABEL_DOT[item.label]}`} />

            <div className="flex-1 min-w-0">
              <div className="flex items-start gap-2">
                {/* D2 — allow subject to wrap up to 2 lines so first ~80 chars
                    always visible; ellipsis only fires on runaway subjects */}
                <span className="text-[12px] font-semibold text-[#131218] line-clamp-2 leading-snug">
                  {item.subject}
                </span>
                {item.isUnread && (
                  <span className="text-[8px] font-black uppercase tracking-widest text-[#131218]/30 bg-[#131218]/6 px-1.5 py-0.5 rounded-full shrink-0 mt-[1px]">
                    Unread
                  </span>
                )}
              </div>
              <p className="text-[10.5px] text-[#131218]/45 truncate mt-0.5">
                <span className="font-semibold">{item.fromName}</span>
                <span className="text-[#131218]/25"> · </span>
                <span className={item.daysWaiting >= 5 ? "text-red-500 font-bold" : "text-[#131218]/35"}>
                  {item.daysWaiting}d
                </span>
                {item.reason && (
                  <>
                    <span className="text-[#131218]/25"> · </span>
                    <span className="italic">{item.reason}</span>
                  </>
                )}
              </p>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {/* Classification label — informational, not a CTA */}
              <span className={`text-[8.5px] font-bold px-2 py-0.5 rounded-full ${LABEL_STYLE[item.label]}`}>
                {item.label}
              </span>

              {/* PRIMARY ACTION — solid pill */}
              <a
                href={item.gmailUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[10px] font-bold text-white bg-[#131218] hover:bg-[#2a2938] transition-colors px-2.5 py-1 rounded-md whitespace-nowrap"
              >
                Open →
              </a>

              {/* SECONDARY — candidate creation, 24x24 hit area (D3) */}
              {created.has(item.threadId) ? (
                <span className="text-[11px] font-bold text-emerald-600 w-11 h-11 sm:w-6 sm:h-6 flex items-center justify-center" title="Candidate created">✓</span>
              ) : failed.has(item.threadId) ? (
                <button
                  onClick={() => createCandidate(item)}
                  disabled={creating === item.threadId}
                  title="Failed — click to retry"
                  className="w-11 h-11 sm:w-6 sm:h-6 flex items-center justify-center rounded-md text-[13px] sm:text-[11px] font-bold text-red-500 hover:text-red-700 hover:bg-red-50 transition-colors disabled:opacity-40"
                >
                  {creating === item.threadId ? "…" : "↻"}
                </button>
              ) : (
                <button
                  onClick={() => createCandidate(item)}
                  disabled={creating === item.threadId}
                  title="Create opportunity candidate from this email"
                  aria-label="Create opportunity candidate"
                  className="w-11 h-11 sm:w-6 sm:h-6 flex items-center justify-center rounded-md text-[17px] sm:text-[13px] font-bold text-[#131218]/30 hover:text-amber-600 hover:bg-amber-50 transition-colors disabled:opacity-40 leading-none"
                >
                  {creating === item.threadId ? "…" : "+"}
                </button>
              )}

              {/* TERTIARY — quiet dismiss. 44x44 on mobile for thumb targets (WCAG AAA), 24x24 on sm+. */}
              <button
                onClick={() => ignoreItem(item)}
                disabled={ignoring === item.threadId}
                title="Ignore this thread — won't resurface"
                aria-label="Ignore"
                className="w-11 h-11 sm:w-6 sm:h-6 flex items-center justify-center rounded-md text-[15px] sm:text-[12px] text-[#131218]/25 hover:text-[#131218]/80 hover:bg-[#EFEFEA] transition-colors disabled:opacity-40 leading-none"
              >
                {ignoring === item.threadId ? "…" : "×"}
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between pt-1.5 px-1">
        <p className="text-[9px] text-[#131218]/25">
          {visible.length} flagged
          {overflow && (
            <span className="text-[#131218]/55"> — {visible.length - MAX_VISIBLE_ROWS} more below (scroll)</span>
          )}
          <span className="text-[#131218]/15"> · {scanned} scanned</span>
        </p>
        <button
          onClick={refresh}
          className="text-[9px] font-bold text-[#131218]/25 hover:text-[#131218] transition-colors uppercase tracking-widest"
        >
          Refresh
        </button>
      </div>
    </div>
  );
}
