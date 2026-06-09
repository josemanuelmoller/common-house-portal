"use client";

/**
 * RadarSection — passive discovery items not yet acted on.
 *
 * Shows loops that were filtered out from CoS because they have no founder
 * intent signal. Three actions per item:
 *   Watch      → founder_interest = 'watching' (stays in Radar)
 *   Interested → founder_interest = 'interested' (moves to CoS on next load)
 *   Drop       → founder_interest = 'dropped' (hidden from Radar)
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { RadarLoop } from "@/lib/notion";

const LOOP_TYPE_LABEL: Record<string, string> = {
  follow_up: "Follow-up",
  decision:  "Decision",
  review:    "Review",
  prep:      "Prep",
  blocker:   "Blocker",
  commitment: "Commitment",
};

// Lime reserved per PORTAL_DESIGN — "Interested" status uses ink-on-paper
// instead of the brand lime to keep lime exclusive to Focus / LIVE.
const INTEREST_BADGE: Record<string, { label: string; cls: string }> = {
  watching:   { label: "Watching",   cls: "bg-amber-50 text-amber-600 border border-amber-200" },
  interested: { label: "Interested", cls: "bg-[#0a0a0a]/5 text-[#0a0a0a] border border-[#0a0a0a]/15" },
};

async function patchInterest(loopId: string, founderInterest: string | null): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch("/api/cos-loops", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ loopId, founderInterest }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({} as { error?: string }));
      return { ok: false, error: body?.error ?? `HTTP ${res.status}` };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export function RadarSection({ initialLoops }: { initialLoops: RadarLoop[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [optimistic, setOptimistic] = useState<Record<string, string | null>>({});
  const [errs, setErrs] = useState<Record<string, string>>({});

  // Optimistic state:
  //   "dropped"    → remove from Radar immediately
  //   "interested" → show as "→ CoS" briefly, then remove on router.refresh()
  const visible = initialLoops.filter(l => {
    const interest = optimistic[l.id] !== undefined ? optimistic[l.id] : l.founder_interest;
    return interest !== "dropped";
  });

  async function handleAction(loopId: string, founderInterest: string | null) {
    setErrs(prev => { const n = { ...prev }; delete n[loopId]; return n; });
    setOptimistic(prev => ({ ...prev, [loopId]: founderInterest }));
    const result = await patchInterest(loopId, founderInterest);
    if (!result.ok) {
      // Roll back optimistic state and surface the failure inline. Previous
      // version silently kept the optimistic hide even on 4xx/5xx, so the
      // user saw "success" but the row came back on next refresh with no
      // explanation.
      setOptimistic(prev => { const n = { ...prev }; delete n[loopId]; return n; });
      setErrs(prev => ({ ...prev, [loopId]: result.error ?? "Failed" }));
      return;
    }
    startTransition(() => { router.refresh(); });
  }

  if (visible.length === 0) {
    return (
      <div className="flex items-center gap-3 bg-white/50 border border-dashed border-[#e4e4dd] rounded-xl px-4 py-2">
        <span className="w-1.5 h-1.5 rounded-full bg-[#0a0a0a]/15 shrink-0" />
        <p className="text-[11px] text-[#0a0a0a]/40 flex-1 min-w-0">Radar clear — no passive discovery items.</p>
      </div>
    );
  }

  return (
    <div className={`bg-white rounded-2xl border border-[#e4e4dd] overflow-hidden ${isPending ? "opacity-70" : ""}`}>
      <div className="divide-y divide-[#f4f4ef]">
        {visible.map(loop => {
          const interest = optimistic[loop.id] !== undefined ? optimistic[loop.id] : loop.founder_interest;
          const badge = interest ? INTEREST_BADGE[interest] : null;
          const typeLabel = LOOP_TYPE_LABEL[loop.loop_type] ?? loop.loop_type;

          const movingToCoS = interest === "interested" && optimistic[loop.id] === "interested";

          return (
            <div key={loop.id} className={`flex items-center gap-3 px-5 py-3.5 transition-colors ${movingToCoS ? "bg-[#0a0a0a]/5" : ""}`}>
              {/* Type badge */}
              <span className="text-[8px] font-bold uppercase tracking-widest text-[#0a0a0a]/30 bg-[#f4f4ef] px-2 py-0.5 rounded-full shrink-0">
                {typeLabel}
              </span>

              {/* Title + entity */}
              <div className="flex-1 min-w-0">
                <a
                  href={loop.notion_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[12px] font-medium text-[#0a0a0a] hover:underline truncate block"
                >
                  {loop.title}
                </a>
                <p className="text-[10px] text-[#0a0a0a]/35 truncate mt-0.5">{loop.linked_entity_name}</p>
                {/* debug strip */}
                <p className="text-[8px] font-mono text-[#0a0a0a]/20 mt-0.5 truncate">
                  radar · passive=yes · interest={interest ?? "none"} · variant={loop.normalized_key.split(":").pop()}
                </p>
              </div>

              {/* Interest state badge */}
              {movingToCoS ? (
                <span className="text-[8px] font-bold px-2 py-0.5 rounded-full shrink-0 bg-[#0a0a0a] text-white">
                  → CoS
                </span>
              ) : badge ? (
                <span className={`text-[8px] font-bold px-2 py-0.5 rounded-full shrink-0 ${badge.cls}`}>
                  {badge.label}
                </span>
              ) : null}

              {/* Action buttons */}
              <div className="flex items-center gap-1.5 shrink-0">
                {interest !== "watching" && (
                  <button
                    onClick={() => handleAction(loop.id, "watching")}
                    className="text-[9px] font-bold px-2.5 py-1 rounded-lg border border-[#e4e4dd] text-[#0a0a0a]/50 hover:bg-[#f4f4ef] transition-colors"
                  >
                    Watch
                  </button>
                )}
                {interest !== "interested" && (
                  <button
                    onClick={() => handleAction(loop.id, "interested")}
                    className="text-[9px] font-bold px-2.5 py-1 rounded-lg bg-[#0a0a0a] text-white hover:bg-[#1f1f24] transition-colors"
                  >
                    Interested
                  </button>
                )}
                <button
                  onClick={() => handleAction(loop.id, "dropped")}
                  className="text-[9px] font-bold px-2.5 py-1 rounded-lg border border-[#e4e4dd] text-[#0a0a0a]/30 hover:bg-red-50 hover:text-red-500 hover:border-red-200 transition-colors"
                >
                  Drop
                </button>
              </div>
              {errs[loop.id] && (
                <span className="text-[9px] text-red-500 ml-2 shrink-0">{errs[loop.id]}</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
