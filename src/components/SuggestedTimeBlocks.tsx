"use client";

/**
 * SuggestedTimeBlocks — "When should I execute this?" for the Hall.
 *
 * Fetches on mount and renders up to 5 cards. Each card offers:
 *   Block time → creates Google Calendar event via /accept
 *   Not now   → snooze 24h via /snooze
 *   Dismiss   → dismiss via /dismiss
 * The component is optimistic — removes cards on action, rolls back on error.
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { PrepBriefModal, type BriefResponse } from "./PrepBriefModal";

type Suggestion = {
  id: string;
  title: string;
  entity_type: string;
  entity_id: string;
  entity_label: string;
  start: string;
  end: string;
  duration_min: number;
  task_type: "deep_work" | "follow_up" | "prep" | "decision" | "admin";
  urgency_score: number;
  confidence_score: number;
  why_now: string;
  expected_outcome: string;
  status: string;
  gcal_event_link: string | null;
  slot_label: string;
};

type ApiResponse =
  | { mode: "cached" | "fresh"; suggestions: Suggestion[]; generated_at?: string }
  | { mode: "empty"; suggestions: []; reason: string }
  | { error: string; message?: string };

const TASK_TYPE_LABEL: Record<string, string> = {
  deep_work: "Deep work",
  follow_up: "Follow-up",
  prep:      "Prep",
  decision:  "Decision",
  admin:     "Admin",
};

const TASK_TYPE_CLASS: Record<string, string> = {
  deep_work: "bg-[#131218] text-[#c8f55a]",
  follow_up: "bg-amber-50 text-amber-700 border border-amber-200",
  prep:      "bg-blue-50 text-blue-700 border border-blue-200",
  decision:  "bg-red-50 text-red-600 border border-red-200",
  admin:     "bg-[#EFEFEA] text-[#131218]/60 border border-[#E0E0D8]",
};

export function SuggestedTimeBlocks() {
  const router = useRouter();
  const [items, setItems]       = useState<Suggestion[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);
  const [acting, setActing]     = useState<string | null>(null);
  const [toast, setToast]       = useState<string | null>(null);
  const [emptyReason, setEmpty] = useState<string | null>(null);
  // Prep-brief modal state — eventId + title open the modal; briefCache avoids re-fetch on reopen.
  const [briefOpen, setBriefOpen] = useState<{ eventId: string; title: string } | null>(null);
  const [briefCache, setBriefCache] = useState<Record<string, BriefResponse["brief"]>>({});

  async function load(force = false) {
    setLoading(true);
    setError(null);
    setEmpty(null);
    try {
      const res = await fetch(`/api/suggested-time-blocks${force ? "?force=1" : ""}`, { cache: "no-store" });
      const data = (await res.json()) as ApiResponse;
      if ("error" in data) {
        if (data.error === "calendar_scope_missing") {
          setError("__consent_needed__");
        } else if (data.error === "calendar_auth_revoked") {
          setError("__consent_needed__");
        } else {
          setError(data.message || data.error);
        }
        setItems([]);
        return;
      }
      if (data.mode === "empty") {
        setItems([]);
        setEmpty(data.reason || "No valid suggestions right now.");
        return;
      }
      setItems(data.suggestions);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(false); /* initial load on mount */ }, []);

  async function act(
    id: string,
    endpoint: "accept" | "dismiss" | "snooze",
    snoozeHours?: number,
  ) {
    setActing(id);
    const previous = items;
    // Optimistic remove
    setItems(items.filter(i => i.id !== id));
    try {
      const res = await fetch(`/api/suggested-time-blocks/${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(endpoint === "snooze" ? { id, hours: snoozeHours } : { id }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({} as { error?: string; message?: string }));
        setItems(previous);                                    // rollback
        setToast(err.message || err.error || `Failed to ${endpoint}.`);
        setTimeout(() => setToast(null), 4000);
        return;
      }
      if (endpoint === "accept") {
        const data = await res.json() as { event_link?: string };
        if (data.event_link) {
          setToast(`✓ Blocked on calendar. Opening event…`);
          window.open(data.event_link, "_blank", "noopener");
        } else {
          setToast(`✓ Blocked on calendar.`);
        }
        setTimeout(() => setToast(null), 3000);
      }
      // Refresh server-rendered counters that may depend on this
      router.refresh();
    } catch (err) {
      setItems(previous);
      setToast(err instanceof Error ? err.message : String(err));
      setTimeout(() => setToast(null), 4000);
    } finally {
      setActing(null);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-3 bg-white/50 border border-dashed border-[#E0E0D8] rounded-xl px-4 py-2">
        <span className="w-1.5 h-1.5 rounded-full bg-[#131218]/30 animate-pulse shrink-0" />
        <p className="text-[11px] text-[#131218]/45">Scanning calendar + loops for time-block suggestions…</p>
      </div>
    );
  }

  if (error) {
    if (error === "__consent_needed__") {
      // Soft, non-alarming state — feature is deployed, just needs the one-time
      // Google consent. Doesn't read like something is broken.
      return (
        <div className="flex items-center gap-3 bg-white/50 border border-dashed border-[#E0E0D8] rounded-xl px-4 py-2">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
          <p className="text-[11px] text-[#131218]/50 flex-1 min-w-0 truncate">
            Waiting on Google Calendar consent — activates as soon as the refresh token has calendar scope.
          </p>
          <a
            href="/api/google/auth"
            className="text-[9px] font-bold text-[#131218]/50 hover:text-[#131218] uppercase tracking-widest shrink-0"
          >
            Re-authorise →
          </a>
        </div>
      );
    }
    return (
      <div className="flex items-center gap-3 bg-red-50 border border-red-200 rounded-xl px-4 py-2">
        <span className="w-1.5 h-1.5 rounded-full bg-red-400 shrink-0" />
        <p className="text-[11px] text-red-700 flex-1 min-w-0 truncate" title={error}>{error}</p>
        <button
          onClick={() => load(true)}
          className="text-[9px] font-bold text-red-700 hover:text-red-900 uppercase tracking-widest shrink-0"
        >
          Retry
        </button>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="flex items-center gap-3 bg-white/50 border border-dashed border-[#E0E0D8] rounded-xl px-4 py-2">
        <span className="w-1.5 h-1.5 rounded-full bg-[#131218]/15 shrink-0" />
        <p className="text-[11px] text-[#131218]/40 flex-1 min-w-0 truncate">
          {emptyReason ?? "No time-block suggestions right now."}
        </p>
        <button
          onClick={() => load(true)}
          className="text-[9px] font-bold text-[#131218]/40 hover:text-[#131218] uppercase tracking-widest shrink-0"
        >
          Re-scan →
        </button>
      </div>
    );
  }

  return (
    <div className="relative">
      {toast && (
        <div className="absolute -top-9 right-0 text-[10px] font-bold bg-[#131218] text-white px-3 py-1.5 rounded-md z-10 shadow-lg">
          {toast}
        </div>
      )}
      <div className="bg-white rounded-2xl border border-[#E0E0D8] divide-y divide-[#EFEFEA] overflow-hidden">
        {items.map(item => (
          <div key={item.id} className={`px-5 py-3.5 ${acting === item.id ? "opacity-50" : ""}`}>
            <div className="flex items-start gap-4">
              {/* Time window column */}
              <div className="shrink-0 w-[138px]">
                <p className="text-[11px] font-bold text-[#131218] leading-snug">
                  {item.slot_label}
                </p>
                <p className="text-[9px] text-[#131218]/35 mt-0.5">
                  {item.duration_min} min
                </p>
                <span className={`inline-block mt-1 text-[8px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded-full ${TASK_TYPE_CLASS[item.task_type] ?? "bg-[#EFEFEA] text-[#131218]/50"}`}>
                  {TASK_TYPE_LABEL[item.task_type] ?? item.task_type}
                </span>
              </div>

              {/* Content column */}
              <div className="flex-1 min-w-0">
                <p className="text-[12.5px] font-semibold text-[#131218] leading-snug">
                  {item.title}
                </p>
                <p className="text-[10.5px] text-[#131218]/45 mt-0.5 truncate">
                  {item.entity_label}
                </p>
                <p className="text-[10.5px] text-[#131218]/60 mt-1.5 leading-[1.5]">
                  <span className="font-semibold text-[#131218]/75">Why now: </span>{item.why_now}
                </p>
                <p className="text-[10.5px] text-[#131218]/60 mt-0.5 leading-[1.5]">
                  <span className="font-semibold text-[#131218]/75">Outcome: </span>{item.expected_outcome}
                </p>
              </div>

              {/* Actions column */}
              <div className="flex flex-col items-end gap-1 shrink-0">
                <button
                  onClick={() => act(item.id, "accept")}
                  disabled={acting === item.id}
                  className="text-[10px] font-bold text-[#131218] bg-[#c8f55a] hover:bg-[#b8e54a] disabled:opacity-50 transition-colors px-3 py-1.5 rounded-md whitespace-nowrap"
                >
                  Block time →
                </button>
                {item.task_type === "prep" && item.entity_type === "meeting_prep" && (
                  <button
                    onClick={() => setBriefOpen({ eventId: item.entity_id, title: item.entity_label })}
                    className="text-[10px] font-bold text-[#131218] bg-white border border-[#131218] hover:bg-[#131218] hover:text-white transition-colors px-3 py-1.5 rounded-md whitespace-nowrap"
                  >
                    Open brief →
                  </button>
                )}
                <div className="flex items-center gap-1 mt-0.5">
                  <button
                    onClick={() => act(item.id, "snooze", 24)}
                    disabled={acting === item.id}
                    title="Snooze 24h"
                    className="text-[9px] font-bold text-[#131218]/40 hover:text-[#131218] transition-colors uppercase tracking-widest disabled:opacity-50"
                  >
                    Not now
                  </button>
                  <span className="text-[#131218]/20">·</span>
                  <button
                    onClick={() => act(item.id, "dismiss")}
                    disabled={acting === item.id}
                    title="Dismiss"
                    className="text-[9px] font-bold text-[#131218]/25 hover:text-[#131218]/70 transition-colors uppercase tracking-widest disabled:opacity-50"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
      {briefOpen && (
        <PrepBriefModal
          eventId={briefOpen.eventId}
          meetingTitle={briefOpen.title}
          cachedBrief={briefCache[briefOpen.eventId]}
          onBriefFetched={(eventId, brief) => {
            if (brief) setBriefCache(prev => ({ ...prev, [eventId]: brief }));
          }}
          onClose={() => setBriefOpen(null)}
        />
      )}
    </div>
  );
}
