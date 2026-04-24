import type { GarageDecision } from "@/types/garage";

/**
 * GarageDecisions — decisions locked during the build.
 *
 * Source: Decision evidence (Validated) from CH Evidence [OS v2].
 * These are the things the team agreed on — product direction, partnerships,
 * structural choices, positioning — recorded and confirmed by the OS.
 *
 * Not a meeting notes dump. Not a task list.
 * A clean record of what has been decided — so the build can move on from them.
 *
 * Placement: bottom of Garage content area, before Digital Residents.
 * Returns null if no validated decisions exist.
 */
export function GarageDecisions({ decisions }: { decisions: GarageDecision[] }) {
  if (decisions.length === 0) return null;

  return (
    <div className="bg-white rounded-2xl border border-[#e4e4dd] overflow-hidden">
      <div className="h-1 bg-[#f4f4ef]" />
      <div className="px-6 py-5 border-b border-[#f4f4ef]">
        <div className="flex items-center justify-between">
          <p className="text-[10px] font-bold text-[#0a0a0a]/30 uppercase tracking-widest">
            Decisions Locked
          </p>
          <span className="text-[10px] font-bold text-[#0a0a0a]/30 bg-[#f4f4ef] border border-[#e4e4dd] px-2 py-0.5 rounded-full">
            {decisions.length}
          </span>
        </div>
        <p className="text-sm text-[#0a0a0a]/40 mt-1.5 leading-relaxed">
          What the team has agreed on — recorded and confirmed.
        </p>
      </div>
      <div className="divide-y divide-[#f4f4ef]">
        {decisions.map((d) => (
          <div key={d.id} className="px-6 py-4">
            <div className="flex items-start justify-between gap-4">
              <p className="text-sm font-semibold text-[#0a0a0a] leading-snug">
                {d.title}
              </p>
              <p className="text-[10px] text-[#0a0a0a]/25 font-medium uppercase tracking-widest shrink-0 pt-0.5">
                {d.date}
              </p>
            </div>
            {d.context && (
              <p className="text-sm text-[#0a0a0a]/50 mt-2 leading-relaxed">
                {d.context}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
