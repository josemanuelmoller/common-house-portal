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

  if (allItems.length === 0) {
    return (
      <div
        className="flex items-center gap-3 px-4 py-2 rounded-xl"
        style={{ border: "1px dashed var(--hall-line)" }}
      >
        <span
          className="w-1.5 h-1.5 rounded-full shrink-0"
          style={{ background: "var(--hall-muted-3)" }}
        />
        <p
          className="text-[11px] flex-1 min-w-0"
          style={{ color: "var(--hall-muted-2)" }}
        >
          No prepared work yet — approve a draft or let an agent generate one.
        </p>
      </div>
    );
  }

  // Responsive grid: 1 item → full-width single card, 2 → 2-col, 3+ → 3-col.
  const cols = allItems.length === 1 ? "grid-cols-1" : allItems.length === 2 ? "grid-cols-2" : "grid-cols-3";

  return (
    <div className={`grid gap-3 ${cols}`}>
      {allItems.slice(0, 6).map((item) => {
        const icon    = typeIcon(item.draftType);
        const state   = states[item.id] ?? "idle";
        const isEmail = item.draftType === "Follow-up Email" || item.draftType === "Check-in Email";
        const isLinkedIn = item.draftType === "LinkedIn Post";

        return (
          <div
            key={item.id}
            className="flex flex-col rounded-xl overflow-hidden"
            style={{ border: "1px solid var(--hall-line)", background: "#fff" }}
          >
            {/* ── Header ─────────────────────────────────────────────────── */}
            <div className="px-4 py-3.5 flex-1">
              <div className="flex items-start gap-2.5">
                <div
                  className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 text-[10px] font-black"
                  style={
                    isLinkedIn
                      ? { background: "#0077B5", color: "#fff" }
                      : { background: "var(--hall-fill-soft)", color: "var(--hall-muted-2)" }
                  }
                >
                  {icon}
                </div>
                <div className="flex-1 min-w-0">
                  {/* Kind + source + type chips */}
                  <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                    <span
                      className="text-[8px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded-full"
                      style={{
                        fontFamily: "var(--font-hall-mono)",
                        background: "#c8f55a",
                        color: "var(--hall-ink-0)",
                      }}
                    >
                      Draft
                    </span>
                    <span
                      className="text-[8px] font-bold uppercase tracking-widest"
                      style={{
                        fontFamily: "var(--font-hall-mono)",
                        color: "var(--hall-muted-3)",
                      }}
                    >
                      · {item.draftType}
                    </span>
                    {item.source === "gmail" && (
                      <span
                        className="text-[8px] font-bold px-1.5 py-0.5 rounded-full"
                        style={{
                          fontFamily: "var(--font-hall-mono)",
                          color: "var(--hall-ok)",
                          border: "1px solid var(--hall-ok)",
                          background: "#fff",
                        }}
                      >
                        In Gmail
                      </span>
                    )}
                    {item.source === "approved" && isEmail && (
                      <span
                        className="text-[8px] font-bold px-1.5 py-0.5 rounded-full"
                        style={{
                          fontFamily: "var(--font-hall-mono)",
                          color: "var(--hall-ink-3)",
                          border: "1px solid var(--hall-line)",
                          background: "var(--hall-fill-soft)",
                        }}
                      >
                        Ready to send
                      </span>
                    )}
                  </div>
                  <p
                    className="text-[12px] font-semibold leading-snug"
                    style={{ color: "var(--hall-ink-0)" }}
                  >
                    {item.title}
                  </p>
                  {/* Time estimate */}
                  <p
                    className="text-[9px] mt-0.5"
                    style={{
                      fontFamily: "var(--font-hall-mono)",
                      color: "var(--hall-muted-3)",
                    }}
                  >
                    ~{estimatedTime(item.draftType)}
                  </p>
                </div>
              </div>

              {/* Preview */}
              {item.draftText && (
                <p
                  className="mt-2 text-[10.5px] leading-[1.55] line-clamp-2"
                  style={{ color: "var(--hall-muted-2)" }}
                >
                  {item.draftText.slice(0, 160)}
                  {item.draftText.length > 160 ? "…" : ""}
                </p>
              )}
            </div>

            {/* ── Actions ────────────────────────────────────────────────── */}
            <div
              className="px-4 py-2.5 flex items-center gap-2"
              style={{ borderTop: "1px solid var(--hall-line-soft)" }}
            >
              {state === "sent" ? (
                <span
                  className="flex-1 text-center text-[10px] font-bold"
                  style={{ color: "var(--hall-ok)" }}
                >
                  ✓ Sent to Gmail
                </span>
              ) : state === "error" ? (
                <span
                  className="flex-1 text-center text-[10px] font-bold"
                  style={{ color: "var(--hall-danger)" }}
                >
                  ✗ Error — retry?
                </span>
              ) : item.source === "gmail" ? (
                /* Gmail draft: open directly */
                <>
                  <a
                    href={GMAIL_DRAFTS_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hall-btn-primary flex-1 text-center"
                    style={{ padding: "6px 10px", fontSize: 10 }}
                  >
                    Open in Gmail →
                  </a>
                  <a
                    href={item.notionUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[10px] font-bold shrink-0 transition-colors"
                    style={{ color: "var(--hall-muted-3)" }}
                    title="View in Notion"
                  >
                    ↗
                  </a>
                  <button
                    onClick={() => dismiss(item.id)}
                    className="text-[10px] shrink-0 transition-colors"
                    style={{ color: "var(--hall-muted-3)" }}
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
                    className="hall-btn-primary flex-1 text-center disabled:opacity-50"
                    style={{ padding: "6px 10px", fontSize: 10 }}
                  >
                    {state === "sending" ? "Sending…" : "Send to Gmail →"}
                  </button>
                  <a
                    href={item.notionUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[10px] font-bold shrink-0 transition-colors"
                    style={{ color: "var(--hall-muted-3)" }}
                    title="View in Notion"
                  >
                    ↗
                  </a>
                  <button
                    onClick={() => dismiss(item.id)}
                    className="text-[10px] shrink-0 transition-colors"
                    style={{ color: "var(--hall-muted-3)" }}
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
