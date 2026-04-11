import { DIGITAL_RESIDENTS } from "@/types/house";

/**
 * DigitalResidents — Hall contextual preview.
 *
 * Surfaces the three client-facing digital roles relevant to The Hall:
 * Memory Keeper, Decision Keeper, Progress Keeper.
 *
 * This is a surface-specific preview. The canonical home for all Digital Residents
 * (including internal roles) is /residents — The Residents layer.
 *
 * Part of the Residents unified layer (see src/types/house.ts).
 * Placement: bottom of Hall, when project is live.
 */
export function DigitalResidents() {
  const hallRoles = DIGITAL_RESIDENTS.filter(
    r => r.surfaces.includes("hall") && r.clientVisible
  );

  return (
    <div className="bg-white rounded-2xl border border-[#E0E0D8] overflow-hidden">
      <div className="h-1 bg-[#EFEFEA]" />
      <div className="px-6 py-5 border-b border-[#EFEFEA]">
        <p className="text-[10px] font-bold text-[#131218]/30 uppercase tracking-widest">
          Digital support
        </p>
        <p className="text-sm text-[#131218]/40 mt-1.5 leading-relaxed">
          The system listens, records, and synthesises — so the team can stay in the work.
        </p>
      </div>

      <div className="divide-y divide-[#EFEFEA]">
        {hallRoles.map(resident => (
          <div key={resident.role} className="px-6 py-4 flex items-start gap-6">
            <p className="text-sm font-semibold text-[#131218] w-44 shrink-0 pt-0.5">
              {resident.displayName}
            </p>
            <div className="flex-1 min-w-0">
              <p className="text-sm text-[#131218]/55 leading-relaxed">
                {resident.tagline}
              </p>
              <p className="text-[10px] text-[#131218]/22 font-medium uppercase tracking-widest mt-1">
                {resident.signals.join(" · ")}
              </p>
            </div>
          </div>
        ))}
      </div>

      <div className="px-6 py-4 border-t border-[#EFEFEA]">
        <p className="text-[10px] text-[#131218]/20 leading-relaxed max-w-lg">
          These are digital roles built from real project signals. They support the team —
          they do not replace judgment, conversation, or leadership.
        </p>
      </div>
    </div>
  );
}
