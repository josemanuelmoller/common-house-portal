import type { GarageBlocker } from "@/types/garage";

/**
 * GarageBlockers — what is currently in the way.
 *
 * Source: Blocker evidence (Validated) from CH Evidence [OS v2].
 * In a startup context, blockers are often external: a decision not made,
 * a partnership not closed, a regulatory hurdle, a dependency not resolved.
 *
 * Placement: immediately after GarageSnapshot — blockers are urgent.
 * Returns null if no validated blockers exist.
 */
export function GarageBlockers({ blockers }: { blockers: GarageBlocker[] }) {
  if (blockers.length === 0) return null;

  return (
    <div className="bg-white rounded-2xl border border-[#E0E0D8] overflow-hidden">
      <div className="h-1 bg-[#131218]" />
      <div className="px-6 py-5 border-b border-[#EFEFEA]">
        <div className="flex items-center gap-3">
          <p className="text-[10px] font-bold text-[#131218]/30 uppercase tracking-widest">
            Blockers
          </p>
          <span className="text-[10px] font-bold text-white bg-[#131218] px-2 py-0.5 rounded-full">
            {blockers.length}
          </span>
        </div>
        <p className="text-sm text-[#131218]/40 mt-1.5 leading-relaxed">
          What is currently in the way — confirmed by the OS.
        </p>
      </div>
      <div className="divide-y divide-[#EFEFEA]">
        {blockers.map((b) => (
          <div key={b.id} className="px-6 py-4">
            <p className="text-sm font-semibold text-[#131218] leading-snug">
              {b.title}
            </p>
            {b.excerpt && (
              <p className="text-sm text-[#131218]/50 mt-1.5 leading-relaxed">
                {b.excerpt}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
