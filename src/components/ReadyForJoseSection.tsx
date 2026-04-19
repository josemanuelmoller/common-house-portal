"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import type { AgentDraft } from "@/lib/notion";

// Dismissals expire after 24 hours so completed items don't pile up permanently
const DISMISS_TTL_MS = 24 * 60 * 60 * 1000;
const STORAGE_KEY = "rfj_dismissed_v1";

function loadDismissed(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set();
    const parsed: Record<string, number> = JSON.parse(raw);
    const now = Date.now();
    const active = Object.entries(parsed)
      .filter(([, ts]) => now - ts < DISMISS_TTL_MS)
      .map(([id]) => id);
    return new Set(active);
  } catch {
    return new Set();
  }
}

function saveDismiss(id: string) {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed: Record<string, number> = raw ? JSON.parse(raw) : {};
    parsed[id] = Date.now();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));
  } catch {
    /* ignore */
  }
}

function estimatedTime(draftType: string): string {
  if (draftType === "Follow-up Email" || draftType === "Check-in Email") return "5 min";
  if (draftType === "LinkedIn Post") return "10 min";
  return "15 min";
}

function typeIcon(draftType: string): string {
  if (draftType === "Follow-up Email" || draftType === "Check-in Email") return "✉";
  if (draftType === "LinkedIn Post") return "in";
  return "·";
}

function typeBadgeColor(draftType: string): string {
  if (draftType === "LinkedIn Post") return "bg-[#0077B5] text-white";
  return "bg-[#EFEFEA] text-[#131218]/50";
}

// Gmail drafts link — takes user straight to their drafts folder
const GMAIL_DRAFTS_URL = "https://mail.google.com/mail/u/0/#drafts";

type ItemState = "idle" | "sending" | "sent" | "error";

export function ReadyForJoseSection({
  gmailDrafts,
  approvedDrafts,
}: {
  gmailDrafts: AgentDraft[];   // status === "Draft Created"  — already in Gmail
  approvedDrafts: AgentDraft[]; // status === "Approved"       — ready to push to Gmail
}) {
  const router = useRouter();
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [states, setStates] = useState<Record<string, ItemState>>({});

  // Hydrate from localStorage after mount (avoids SSR mismatch)
  useEffect(() => {
    setDismissed(loadDismissed());
  }, []);

  function dismiss(id: string) {
    saveDismiss(id);
    setDismissed((prev) => new Set([...prev, id]));
  }

  async function pushToGmail(draft: AgentDraft) {
    setStates((s) => ({ ...s, [draft.id]: "sending" }));
    try {
      const res = await fetch("/api/send-draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ draftId: draft.id }),
      });
      if (res.ok) {
        setStates((s) => ({ ...s, [draft.id]: "sent" }));
        setTimeout(() => dismiss(draft.id), 1500);
        router.refresh();
      } else {
        setStates((s) => ({ ...s, [draft.id]: "error" }));
      }
    } catch {
      setStates((s) => ({ ...s, [draft.id]: "error" }));
    }
  }

  const allItems: Array<AgentDraft & { source: "gmail" | "approved" }> = [
    ...gmailDrafts.map((d) => ({ ...d, source: "gmail" as const })),
    ...approvedDrafts.map((d) => ({ ...d, source: "approved" as const })),
  ].filter((d) => !dismissed.has(d.id));

  if (allItems.length === 0) return null;

  return (
    <div className="grid grid-cols-3 gap-3">
      {allItems.slice(0, 6).map((item) => {
        const icon    = typeIcon(item.draftType);
        const state   = states[item.id] ?? "idle";
        const isEmail = item.draftType === "Follow-up Email" || item.draftType === "Check-in Email";

        return (
          <div
            key={item.id}
            className="bg-white rounded-2xl border border-[#E0E0D8] overflow-hidden flex flex-col"
          >
            {/* ── Header ─────────────────────────────────────────────────── */}
            <div className="px-4 py-3.5 flex-1">
              <div className="flex items-start gap-2.5">
                <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 text-[10px] font-black ${typeBadgeColor(item.draftType)}`}>
                  {icon}
                </div>
                <div className="flex-1 min-w-0">
                  {/* Source badge */}
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <span className="text-[8px] font-bold uppercase tracking-widest text-[#131218]/25">
                      {item.draftType}
                    </span>
                    {item.source === "gmail" && (
                      <span className="text-[8px] font-bold text-emerald-600 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded-full">
                        In Gmail
                      </span>
                    )}
                    {item.source === "approved" && isEmail && (
                      <span className="text-[8px] font-bold text-blue-600 bg-blue-50 border border-blue-200 px-1.5 py-0.5 rounded-full">
                        Ready to send
                      </span>
                    )}
                  </div>
                  <p className="text-[12px] font-semibold text-[#131218] leading-snug">
                    {item.title}
                  </p>
                  {/* Time estimate */}
                  <p className="text-[9px] text-[#131218]/30 mt-0.5">
                    ~{estimatedTime(item.draftType)}
                  </p>
                </div>
              </div>

              {/* Preview */}
              {item.draftText && (
                <p className="mt-2 text-[10.5px] text-[#131218]/40 leading-[1.55] line-clamp-2">
                  {item.draftText.slice(0, 160)}
                  {item.draftText.length > 160 ? "…" : ""}
                </p>
              )}
            </div>

            {/* ── Actions ────────────────────────────────────────────────── */}
            <div className="px-4 py-2.5 border-t border-[#EFEFEA] flex items-center gap-2">
              {state === "sent" ? (
                <span className="flex-1 text-center text-[10px] font-bold text-emerald-600">
                  ✓ Sent to Gmail
                </span>
              ) : state === "error" ? (
                <span className="flex-1 text-center text-[10px] font-bold text-red-500">
                  ✗ Error — retry?
                </span>
              ) : item.source === "gmail" ? (
                /* Gmail draft: open directly */
                <>
                  <a
                    href={GMAIL_DRAFTS_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 text-center text-[10px] font-bold bg-[#c8f55a] text-[#131218] rounded-lg py-1.5 hover:bg-[#b8e54a] transition-colors"
                  >
                    Open in Gmail →
                  </a>
                  <a
                    href={item.notionUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[10px] font-bold text-[#131218]/25 hover:text-[#131218] transition-colors shrink-0"
                    title="View in Notion"
                  >
                    ↗
                  </a>
                  <button
                    onClick={() => dismiss(item.id)}
                    className="text-[10px] text-[#131218]/20 hover:text-[#131218]/60 transition-colors shrink-0"
                    title="Dismiss"
                  >
                    ✕
                  </button>
                </>
              ) : (
                /* Approved draft: push to Gmail */
                <>
                  <button
                    onClick={() => pushToGmail(item)}
                    disabled={state === "sending"}
                    className="flex-1 text-center text-[10px] font-bold bg-[#131218] text-white rounded-lg py-1.5 hover:bg-[#2a2938] transition-colors disabled:opacity-50"
                  >
                    {state === "sending" ? "Sending…" : "Send to Gmail →"}
                  </button>
                  <a
                    href={item.notionUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[10px] font-bold text-[#131218]/25 hover:text-[#131218] transition-colors shrink-0"
                    title="View in Notion"
                  >
                    ↗
                  </a>
                  <button
                    onClick={() => dismiss(item.id)}
                    className="text-[10px] text-[#131218]/20 hover:text-[#131218]/60 transition-colors shrink-0"
                    title="Dismiss"
                  >
                    ✕
                  </button>
                </>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
