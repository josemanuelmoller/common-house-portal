import type { GarageSession } from "@/types/garage";

/**
 * GarageSessions — working session recaps.
 *
 * Source: CH Sources [OS v2] meetings with a processedSummary.
 * These are the working sessions between Common House and the startup team —
 * where commitments are made, decisions land, and the build advances.
 *
 * Framing note: "Working sessions" (not "session log") — the Garage is builder-oriented.
 * The recaps exist not as a record of what happened but as a thread of where the build went.
 *
 * Placement: lower half of Garage, after commitments and materials.
 * Returns null if no sessions with summaries exist.
 */
export function GarageSessions({ sessions }: { sessions: GarageSession[] }) {
  if (sessions.length === 0) return null;

  return (
    <div className="bg-white rounded-2xl border border-[#E0E0D8] overflow-hidden">
      <div className="h-1 bg-[#EFEFEA]" />
      <div className="px-6 py-5 border-b border-[#EFEFEA]">
        <div className="flex items-center justify-between">
          <p className="text-[10px] font-bold text-[#131218]/30 uppercase tracking-widest">
            Working Sessions
          </p>
          <span className="text-[10px] font-bold text-[#131218]/30 bg-[#EFEFEA] border border-[#E0E0D8] px-2 py-0.5 rounded-full">
            {sessions.length}
          </span>
        </div>
      </div>
      <div className="divide-y divide-[#EFEFEA]">
        {sessions.map((s) => (
          <div key={s.id} className="px-6 py-5">
            <div className="flex items-start justify-between gap-4 mb-2">
              <p className="text-sm font-semibold text-[#131218] leading-snug">
                {s.title}
              </p>
              <p className="text-[10px] text-[#131218]/30 font-medium uppercase tracking-widest shrink-0 pt-0.5">
                {s.date}
              </p>
            </div>
            <p className="text-sm text-[#131218]/55 leading-relaxed">
              {s.summary}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
