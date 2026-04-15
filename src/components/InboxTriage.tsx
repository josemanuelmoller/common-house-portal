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
  const [dismissed, setDismiss]       = useState<Set<string>>(new Set());
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

  const visible = items.filter(i => !dismissed.has(i.threadId));

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
    return (
      <div className="flex items-center justify-between py-3">
        <p className="text-[12px] text-[#131218]/35">Inbox clear — no threads waiting 2+ days.</p>
        <button
          onClick={refresh}
          className="text-[9px] font-bold text-[#131218]/25 hover:text-[#131218] transition-colors uppercase tracking-widest"
        >
          Refresh
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {visible.map((item) => (
        <div
          key={item.threadId}
          className="bg-white rounded-xl border border-[#E0E0D8] px-4 py-3 flex items-start gap-3"
        >
          <span className={`mt-[3px] w-2 h-2 rounded-full shrink-0 ${LABEL_DOT[item.label]}`} />

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-0.5 flex-wrap">
              <span className="text-[12px] font-semibold text-[#131218] truncate max-w-[320px]">
                {item.subject}
              </span>
              {item.isUnread && (
                <span className="text-[8px] font-black uppercase tracking-widest text-[#131218]/30 bg-[#131218]/6 px-1.5 py-0.5 rounded-full shrink-0">
                  Unread
                </span>
              )}
            </div>
            <p className="text-[11px] text-[#131218]/45 mb-1">
              <span className="font-semibold">{item.fromName}</span>
              {" · "}
              <span className="text-[#131218]/30">{item.from}</span>
              {" · "}
              <span className={item.daysWaiting >= 5 ? "text-red-500 font-bold" : "text-[#131218]/30"}>
                {item.daysWaiting}d waiting
              </span>
            </p>
            {item.reason && (
              <p className="text-[10.5px] text-[#131218]/40 leading-snug italic">{item.reason}</p>
            )}
          </div>

          <div className="flex flex-col items-end gap-1.5 shrink-0">
            <span className={`text-[8.5px] font-bold px-2 py-0.5 rounded-full ${LABEL_STYLE[item.label]}`}>
              {item.label}
            </span>
            <div className="flex items-center gap-2">
              {/* Quick-create opportunity candidate */}
              {created.has(item.threadId) ? (
                <span className="text-[9px] font-bold text-green-600">✓ Candidate</span>
              ) : failed.has(item.threadId) ? (
                <button
                  onClick={() => createCandidate(item)}
                  disabled={creating === item.threadId}
                  title="Failed — click to retry"
                  className="text-[9px] font-bold text-red-500 hover:text-red-700 transition-colors disabled:opacity-40"
                >
                  {creating === item.threadId ? "…" : "✕ Retry"}
                </button>
              ) : (
                <button
                  onClick={() => createCandidate(item)}
                  disabled={creating === item.threadId}
                  title="Create opportunity candidate from this email"
                  className="text-[9px] font-bold text-amber-500 hover:text-amber-700 transition-colors disabled:opacity-40"
                >
                  {creating === item.threadId ? "…" : "+ Opp"}
                </button>
              )}
              <a
                href={item.gmailUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[9px] font-bold text-[#131218]/30 hover:text-[#131218] transition-colors"
              >
                Open →
              </a>
              <button
                onClick={() => setDismiss(prev => new Set(prev).add(item.threadId))}
                className="text-[9px] font-bold text-[#131218]/20 hover:text-[#131218]/50 transition-colors"
                title="Dismiss from view"
              >
                ✕
              </button>
            </div>
          </div>
        </div>
      ))}

      <div className="flex items-center justify-between pt-1">
        <p className="text-[9px] text-[#131218]/20">
          {scanned} thread{scanned !== 1 ? "s" : ""} scanned · {visible.length} flagged
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
