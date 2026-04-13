"use client";

import { useState } from "react";
import type { AgentDraft } from "@/lib/notion";

const DRAFT_TYPE_ICON: Record<string, string> = {
  "LinkedIn Post":    "in",
  "Follow-up Email":  "✉",
  "Check-in Email":   "✉",
  "Market Signals":   "◉",
  "Quick Win Scan":   "⚡",
  "Delegation Brief": "→",
};

type DraftState = "pending" | "approving" | "approved" | "revision";

export function AgentQueueSection({ drafts }: { drafts: AgentDraft[] }) {
  const [expandedId, setExpandedId]     = useState<string | null>(null);
  const [states, setStates]             = useState<Record<string, DraftState>>({});
  const [dismissed, setDismissed]       = useState<Set<string>>(new Set());

  const visible = drafts.filter((d) => !dismissed.has(d.id));

  async function handleAction(draftId: string, action: "approve" | "revision") {
    setStates((s) => ({ ...s, [draftId]: action === "approve" ? "approving" : "approving" }));
    try {
      const res = await fetch("/api/approve-draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ draftId, action }),
      });
      if (res.ok) {
        setStates((s) => ({ ...s, [draftId]: action === "approve" ? "approved" : "revision" }));
        setTimeout(() => {
          setDismissed((prev) => new Set(prev).add(draftId));
        }, 1200);
      }
    } catch {
      setStates((s) => ({ ...s, [draftId]: "pending" }));
    }
  }

  if (visible.length === 0) return null;

  return (
    <div className="grid grid-cols-3 gap-3">
      {visible.slice(0, 6).map((draft) => {
        const icon      = DRAFT_TYPE_ICON[draft.draftType] ?? "·";
        const isLinkedIn = draft.draftType === "LinkedIn Post";
        const isExpanded = expandedId === draft.id;
        const state     = states[draft.id] ?? "pending";

        return (
          <div
            key={draft.id}
            className="bg-white rounded-2xl border border-[#E0E0D8] overflow-hidden flex flex-col"
          >
            {/* Header */}
            <div className="px-4 py-3.5 border-b border-[#EFEFEA] flex-1">
              <div className="flex items-start gap-2.5">
                <div
                  className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 text-[10px] font-black ${
                    isLinkedIn ? "bg-[#0077B5] text-white" : "bg-[#EFEFEA] text-[#131218]/50"
                  }`}
                >
                  {icon}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[9px] font-bold uppercase tracking-widest text-[#131218]/30 mb-0.5">
                    {draft.draftType}
                  </p>
                  <p className="text-[12px] font-semibold text-[#131218] leading-snug">
                    {draft.title}
                  </p>
                </div>
              </div>

              {/* Preview / Expanded */}
              {draft.draftText && (
                <div className="mt-2.5">
                  {isExpanded ? (
                    <pre className="text-[10.5px] text-[#131218]/60 leading-[1.6] whitespace-pre-wrap font-sans max-h-48 overflow-y-auto">
                      {draft.draftText}
                    </pre>
                  ) : (
                    <p className="text-[11px] text-[#131218]/45 leading-[1.55] line-clamp-3">
                      {draft.draftText.slice(0, 180)}
                      {draft.draftText.length > 180 ? "…" : ""}
                    </p>
                  )}
                  <button
                    onClick={() => setExpandedId(isExpanded ? null : draft.id)}
                    className="mt-1.5 text-[9px] font-bold text-[#131218]/30 hover:text-[#131218] transition-colors"
                  >
                    {isExpanded ? "Collapse ↑" : "Expand ↓"}
                  </button>
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="px-4 py-2.5 flex items-center gap-2">
              {state === "approved" ? (
                <span className="flex-1 text-center text-[10px] font-bold text-emerald-600">
                  ✓ Approved
                </span>
              ) : state === "revision" ? (
                <span className="flex-1 text-center text-[10px] font-bold text-amber-500">
                  ↩ Revision requested
                </span>
              ) : (
                <>
                  <button
                    onClick={() => handleAction(draft.id, "approve")}
                    disabled={state === "approving"}
                    className="flex-1 text-center text-[10px] font-bold bg-[#c8f55a] text-[#131218] rounded-lg py-1.5 hover:bg-[#b8e54a] transition-colors disabled:opacity-50"
                  >
                    {state === "approving" ? "…" : "Approve"}
                  </button>
                  <button
                    onClick={() => handleAction(draft.id, "revision")}
                    disabled={state === "approving"}
                    className="text-[10px] font-bold text-[#131218]/30 hover:text-[#131218] transition-colors border border-[#E0E0D8] rounded-lg px-2.5 py-1.5 disabled:opacity-50"
                  >
                    Revise
                  </button>
                  <a
                    href={draft.notionUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[10px] font-bold text-[#131218]/25 hover:text-[#131218] transition-colors shrink-0"
                  >
                    ↗
                  </a>
                </>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
