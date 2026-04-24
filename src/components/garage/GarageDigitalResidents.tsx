import { DIGITAL_RESIDENTS } from "@/types/house";

/**
 * GarageDigitalResidents — Garage contextual preview.
 *
 * Surfaces the three client-facing digital roles operating inside the Garage:
 * Memory Keeper, Decision Keeper, Progress Keeper.
 *
 * Same underlying roles as in The Hall and The Workroom — different framing.
 * In the Garage, the message is "the system is tracking the build —
 * commitments, decisions, and momentum don't get lost between sessions."
 *
 * This is a surface-specific preview. The canonical home for all Digital Residents
 * (including internal roles) is /residents — The Residents layer.
 *
 * Placement: bottom of Garage, closes the page.
 * Part of the Residents unified layer (see src/types/house.ts).
 */
export function GarageDigitalResidents() {
  const garageRoles = DIGITAL_RESIDENTS.filter(
    (r) => r.surfaces.includes("garage") && r.clientVisible
  );

  return (
    <div className="bg-white rounded-2xl border border-[#e4e4dd] overflow-hidden">
      <div className="h-1 bg-[#0a0a0a]" />
      <div className="px-6 py-5 border-b border-[#f4f4ef]">
        <p className="text-[10px] font-bold text-[#0a0a0a]/30 uppercase tracking-widest">
          System support
        </p>
        <p className="text-sm text-[#0a0a0a]/40 mt-1.5 leading-relaxed">
          The OS tracks this build continuously — commitments, decisions, and momentum stay intact between sessions.
        </p>
      </div>

      <div className="divide-y divide-[#f4f4ef]">
        {garageRoles.map((resident) => (
          <div key={resident.role} className="px-6 py-4 flex items-start gap-6">
            <p className="text-sm font-semibold text-[#0a0a0a] w-44 shrink-0 pt-0.5">
              {resident.displayName}
            </p>
            <div className="flex-1 min-w-0">
              <p className="text-sm text-[#0a0a0a]/55 leading-relaxed">{resident.tagline}</p>
              <p className="text-[10px] text-[#0a0a0a]/22 font-medium uppercase tracking-widest mt-1">
                {resident.signals.join(" · ")}
              </p>
            </div>
          </div>
        ))}
      </div>

      <div className="px-6 py-4 border-t border-[#f4f4ef]">
        <p className="text-[10px] text-[#0a0a0a]/20 leading-relaxed max-w-lg">
          These are digital roles built from real project signals. They support the build —
          they do not replace judgment, conversation, or decisions made by the team.
        </p>
      </div>
    </div>
  );
}
