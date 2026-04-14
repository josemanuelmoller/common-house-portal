"use client";

import { useState, useEffect, useCallback } from "react";

type InboxItem = {
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

export function InboxTriage() {
  const [items, setItems]       = useState<InboxItem[] | null>(null);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);
  const [scanned, setScanned]   = useState<number>(0);
  const [dismissed, setDismiss] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/inbox-triage", {
        headers: { "x-agent-key": "ch-os-agent-2024-secure" },
      });
      if (res.status === 503) {
        setError("Gmail not configured");
        return;
      }
      if (!res.ok) {
        setError("Failed to load inbox");
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

  useEffect(() => { load(); }, [load]);

  const visible = (items ?? []).filter(i => !dismissed.has(i.threadId));

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-3">
        <span className="w-1.5 h-1.5 rounded-full bg-[#131218]/20 animate-pulse" />
        <span className="text-[11px] text-[#131218]/30">Scanning inbox…</span>
      </div>
    );
  }

  if (error) {
    return (
      <p className="text-[11px] text-[#131218]/30 py-2">{error}</p>
    );
  }

  if (visible.length === 0) {
    return (
      <div className="flex items-center justify-between py-3">
        <p className="text-[12px] text-[#131218]/35">Inbox clear — no threads waiting 2+ days.</p>
        <button
          onClick={load}
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
          {/* Urgency dot */}
          <span className={`mt-[3px] w-2 h-2 rounded-full shrink-0 ${LABEL_DOT[item.label]}`} />

          {/* Content */}
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

          {/* Right: label + actions */}
          <div className="flex flex-col items-end gap-1.5 shrink-0">
            <span className={`text-[8.5px] font-bold px-2 py-0.5 rounded-full ${LABEL_STYLE[item.label]}`}>
              {item.label}
            </span>
            <div className="flex items-center gap-2">
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

      {/* Footer */}
      <div className="flex items-center justify-between pt-1">
        <p className="text-[9px] text-[#131218]/20">
          {scanned} thread{scanned !== 1 ? "s" : ""} scanned · {visible.length} flagged
        </p>
        <button
          onClick={load}
          className="text-[9px] font-bold text-[#131218]/25 hover:text-[#131218] transition-colors uppercase tracking-widest"
        >
          Refresh
        </button>
      </div>
    </div>
  );
}
