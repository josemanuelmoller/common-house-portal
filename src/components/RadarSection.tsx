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

const INTEREST_BADGE: Record<string, { label: string; cls: string }> = {
  watching:   { label: "Watching", cls: "bg-amber-50 text-amber-600 border border-amber-200" },
  interested: { label: "Interested", cls: "bg-[#c8f55a]/20 text-[#131218] border border-[#c8f55a]/40" },
};

async function patchInterest(loopId: string, founderInterest: string | null) {
  await fetch("/api/cos-loops", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ loopId, founderInterest }),
  });
}

export function RadarSection({ initialLoops }: { initialLoops: RadarLoop[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [optimistic, setOptimistic] = useState<Record<string, string | null>>({});

  // Derive visible loops: remove items optimistically dropped
  const visible = initialLoops.filter(l => {
    const interest = optimistic[l.id] !== undefined ? optimistic[l.id] : l.founder_interest;
    return interest !== "dropped";
  });

  async function handleAction(loopId: string, founderInterest: string | null) {
    setOptimistic(prev => ({ ...prev, [loopId]: founderInterest }));
    await patchInterest(loopId, founderInterest);
    startTransition(() => { router.refresh(); });
  }

  if (visible.length === 0) {
    return (
      <div className="bg-[#131218]/4 border border-dashed border-[#131218]/10 rounded-2xl px-5 py-4 text-center">
        <p className="text-[11px] text-[#131218]/30 font-medium">Radar clear — no passive discovery items</p>
      </div>
    );
  }

  return (
    <div className={`bg-white rounded-2xl border border-[#E0E0D8] overflow-hidden ${isPending ? "opacity-70" : ""}`}>
      <div className="divide-y divide-[#EFEFEA]">
        {visible.map(loop => {
          const interest = optimistic[loop.id] !== undefined ? optimistic[loop.id] : loop.founder_interest;
          const badge = interest ? INTEREST_BADGE[interest] : null;
          const typeLabel = LOOP_TYPE_LABEL[loop.loop_type] ?? loop.loop_type;

          return (
            <div key={loop.id} className="flex items-center gap-3 px-5 py-3.5">
              {/* Type badge */}
              <span className="text-[8px] font-bold uppercase tracking-widest text-[#131218]/30 bg-[#EFEFEA] px-2 py-0.5 rounded-full shrink-0">
                {typeLabel}
              </span>

              {/* Title + entity */}
              <div className="flex-1 min-w-0">
                <a
                  href={loop.notion_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[12px] font-medium text-[#131218] hover:underline truncate block"
                >
                  {loop.title}
                </a>
                <p className="text-[10px] text-[#131218]/35 truncate mt-0.5">{loop.linked_entity_name}</p>
              </div>

              {/* Interest state badge */}
              {badge && (
                <span className={`text-[8px] font-bold px-2 py-0.5 rounded-full shrink-0 ${badge.cls}`}>
                  {badge.label}
                </span>
              )}

              {/* Action buttons */}
              <div className="flex items-center gap-1.5 shrink-0">
                {interest !== "watching" && (
                  <button
                    onClick={() => handleAction(loop.id, "watching")}
                    className="text-[9px] font-bold px-2.5 py-1 rounded-lg border border-[#E0E0D8] text-[#131218]/50 hover:bg-[#EFEFEA] transition-colors"
                  >
                    Watch
                  </button>
                )}
                {interest !== "interested" && (
                  <button
                    onClick={() => handleAction(loop.id, "interested")}
                    className="text-[9px] font-bold px-2.5 py-1 rounded-lg bg-[#c8f55a] text-[#131218] hover:bg-[#b8e54a] transition-colors"
                  >
                    Interested
                  </button>
                )}
                <button
                  onClick={() => handleAction(loop.id, "dropped")}
                  className="text-[9px] font-bold px-2.5 py-1 rounded-lg border border-[#E0E0D8] text-[#131218]/30 hover:bg-red-50 hover:text-red-500 hover:border-red-200 transition-colors"
                >
                  Drop
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
