import { DIGITAL_RESIDENTS } from "@/types/house";

/**
 * WorkroomDigitalResidents — Workroom contextual preview.
 *
 * Surfaces the three client-facing digital roles operating inside the Workroom:
 * Memory Keeper, Decision Keeper, Progress Keeper.
 *
 * Same underlying roles as in The Hall — different framing. In the Hall, the
 * message is "the system listens and records". In the Workroom, the message is
 * "the system is tracking this engagement so nothing slips between sessions."
 *
 * This is a surface-specific preview. The canonical home for all Digital Residents
 * (including internal roles) is /residents — The Residents layer.
 *
 * Placement: bottom of Workroom, after session log and agreements.
 * Part of the Residents unified layer (see src/types/house.ts).
 */
export function WorkroomDigitalResidents() {
  const workroomRoles = DIGITAL_RESIDENTS.filter(
    (r) => r.surfaces.includes("workroom") && r.clientVisible
  );

  return (
    <div className="bg-white rounded-2xl border border-[#E0E0D8] overflow-hidden">
      <div className="h-1 bg-[#131218]" />
      <div className="px-6 py-5 border-b border-[#EFEFEA]">
        <p className="text-[10px] font-bold text-[#131218]/30 uppercase tracking-widest">
          System support
        </p>
        <p className="text-sm text-[#131218]/40 mt-1.5 leading-relaxed">
          The OS tracks this engagement continuously — so nothing slips between sessions.
        </p>
      </div>

      <div className="divide-y divide-[#EFEFEA]">
        {workroomRoles.map((resident) => (
          <div key={resident.role} className="px-6 py-4 flex items-start gap-6">
            <p className="text-sm font-semibold text-[#131218] w-44 shrink-0 pt-0.5">
              {resident.displayName}
            </p>
            <div className="flex-1 min-w-0">
              <p className="text-sm text-[#131218]/55 leading-relaxed">{resident.tagline}</p>
              <p className="text-[10px] text-[#131218]/22 font-medium uppercase tracking-widest mt-1">
                {resident.signals.join(" · ")}
              </p>
            </div>
          </div>
        ))}
      </div>

      <div className="px-6 py-4 border-t border-[#EFEFEA]">
        <p className="text-[10px] text-[#131218]/20 leading-relaxed max-w-lg">
          These are digital roles built from real project signals. They support the work —
          they do not replace judgment, conversation, or decisions made by the team.
        </p>
      </div>
    </div>
  );
}
