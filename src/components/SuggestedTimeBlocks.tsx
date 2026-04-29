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
  deep_work: "bg-[#0a0a0a] text-[#c6f24a]",
  follow_up: "bg-amber-50 text-amber-700 border border-amber-200",
  prep:      "bg-blue-50 text-blue-700 border border-blue-200",
  decision:  "bg-red-50 text-red-600 border border-red-200",
  admin:     "bg-[#f4f4ef] text-[#0a0a0a]/60 border border-[#e4e4dd]",
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
      <p className="text-[11px]" style={{ color: "var(--hall-muted-3)" }}>
        Scanning calendar + loops for time-block suggestions…
      </p>
    );
  }

  if (error) {
    if (error === "__consent_needed__") {
      return (
        <p className="text-[11px] flex items-center gap-3" style={{ color: "var(--hall-muted-2)" }}>
          <span className="shrink-0">Waiting on Google Calendar consent — activates as soon as the refresh token has calendar scope.</span>
          <a
            href="/api/google/auth"
            className="text-[9px] font-bold uppercase tracking-widest shrink-0"
            style={{ color: "var(--hall-ink-0)" }}
          >
            Re-authorise →
          </a>
        </p>
      );
    }
    return (
      <p className="text-[11px] flex items-center gap-3" style={{ color: "var(--hall-danger)" }} title={error}>
        <span className="truncate flex-1">{error}</span>
        <button
          onClick={() => load(true)}
          className="text-[9px] font-bold uppercase tracking-widest shrink-0"
          style={{ color: "var(--hall-danger)" }}
        >
          Retry
        </button>
      </p>
    );
  }

  if (items.length === 0) {
    return (
      <p className="text-[11px] flex items-center gap-3" style={{ color: "var(--hall-muted-3)" }}>
        <span className="truncate flex-1">{emptyReason ?? "No time-block suggestions right now."}</span>
        <button
          onClick={() => load(true)}
          className="text-[9px] font-bold uppercase tracking-widest shrink-0"
          style={{ color: "var(--hall-muted-2)" }}
        >
          Re-scan →
        </button>
      </p>
    );
  }

  return (
    <div className="relative">
      {toast && (
        <div
          className="absolute -top-9 right-0 text-[10px] font-bold px-3 py-1.5 rounded-[3px] z-10"
          style={{ background: "var(--hall-ink-0)", color: "var(--hall-paper-0)", boxShadow: "0 4px 12px rgba(10,10,10,0.15)" }}
        >
          {toast}
        </div>
      )}
      <div className="flex flex-col">
        {items.map(item => (
          <div
            key={item.id}
            className={`group py-3 sm:py-3.5 px-2.5 -mx-2.5 transition-colors hover:bg-[var(--hall-paper-1)] ${acting === item.id ? "opacity-50" : ""}`}
            style={{ borderTop: "1px solid var(--hall-line-soft)" }}
          >
            {/* Mobile: compact meta strip (slot · duration · task type) */}
            <div className="flex items-center gap-2 flex-wrap sm:hidden mb-1.5">
              <span
                className="font-bold"
                style={{ fontFamily: "var(--font-hall-mono)", fontSize: 10, color: "var(--hall-ink-0)" }}
              >
                {item.slot_label}
              </span>
              <span style={{ color: "var(--hall-muted-3)", fontSize: 10 }}>·</span>
              <span
                style={{ fontFamily: "var(--font-hall-mono)", fontSize: 10, color: "var(--hall-muted-2)" }}
              >
                {item.duration_min} min
              </span>
              <span
                style={{
                  fontFamily: "var(--font-hall-mono)",
                  fontSize: 8.5,
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  color: "var(--hall-muted-2)",
                  background: "var(--hall-fill-soft)",
                  padding: "1px 5px",
                  borderRadius: 2,
                }}
              >
                {TASK_TYPE_LABEL[item.task_type] ?? item.task_type}
              </span>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-start sm:gap-4">
              {/* Time window column — desktop only */}
              <div className="hidden sm:block shrink-0 w-[100px]">
                <p
                  className="font-bold leading-snug"
                  style={{ fontFamily: "var(--font-hall-mono)", fontSize: 10.5, color: "var(--hall-ink-0)" }}
                >
                  {item.slot_label}
                </p>
                <p
                  className="mt-0.5"
                  style={{ fontFamily: "var(--font-hall-mono)", fontSize: 10, color: "var(--hall-muted-2)" }}
                >
                  {item.duration_min} min
                </p>
                <span
                  className="inline-block mt-1.5"
                  style={{
                    fontFamily: "var(--font-hall-mono)",
                    fontSize: 9,
                    letterSpacing: "0.1em",
                    textTransform: "uppercase",
                    color: "var(--hall-muted-2)",
                    background: "var(--hall-fill-soft)",
                    padding: "2px 6px",
                    borderRadius: 2,
                  }}
                >
                  {TASK_TYPE_LABEL[item.task_type] ?? item.task_type}
                </span>
              </div>

              {/* Content column */}
              <div className="flex-1 min-w-0">
                <p
                  className="text-[12px] sm:text-[13px] font-semibold leading-snug"
                  style={{ color: "var(--hall-ink-0)" }}
                >
                  {item.title}
                </p>
                <p
                  className="text-[10.5px] sm:text-[11px] mt-0.5 truncate"
                  style={{ color: "var(--hall-muted-2)" }}
                >
                  {item.entity_label}
                </p>
                <p
                  className="text-[10.5px] sm:text-[11px] mt-1.5 leading-[1.5]"
                  style={{ color: "var(--hall-muted-2)" }}
                >
                  <span className="font-semibold" style={{ color: "var(--hall-ink-3)" }}>Why now: </span>{item.why_now}
                </p>
                <p
                  className="text-[10.5px] sm:text-[11px] mt-0.5 leading-[1.5]"
                  style={{ color: "var(--hall-muted-2)" }}
                >
                  <span className="font-semibold" style={{ color: "var(--hall-ink-3)" }}>Outcome: </span>{item.expected_outcome}
                </p>
              </div>

              {/* Actions — stacked row on mobile, hover-reveal column on desktop */}
              <div className="flex flex-row items-center gap-3 mt-2.5 sm:mt-0 sm:flex-col sm:items-end sm:gap-1.5 shrink-0 sm:opacity-50 sm:group-hover:opacity-100 sm:transition-opacity">
                <button
                  onClick={() => act(item.id, "accept")}
                  disabled={acting === item.id}
                  className="hall-btn-primary disabled:opacity-50"
                  style={{ padding: "5px 12px", fontSize: 11 }}
                >
                  Block →
                </button>
                {item.task_type === "prep" && item.entity_type === "meeting_prep" && (
                  <button
                    onClick={() => setBriefOpen({ eventId: item.entity_id, title: item.entity_label })}
                    className="hall-btn-outline"
                    style={{ padding: "4px 10px", fontSize: 10.5 }}
                  >
                    Open brief →
                  </button>
                )}
                <div className="flex items-center gap-1.5 sm:mt-0.5">
                  <button
                    onClick={() => act(item.id, "snooze", 24)}
                    disabled={acting === item.id}
                    title="Snooze 24h"
                    className="text-[9px] font-bold uppercase tracking-widest transition-colors disabled:opacity-50"
                    style={{ color: "var(--hall-muted-3)" }}
                  >
                    Not now
                  </button>
                  <span style={{ color: "var(--hall-muted-3)" }}>·</span>
                  <button
                    onClick={() => act(item.id, "dismiss")}
                    disabled={acting === item.id}
                    title="Dismiss"
                    className="text-[9px] font-bold uppercase tracking-widest transition-colors disabled:opacity-50"
                    style={{ color: "var(--hall-muted-3)" }}
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
