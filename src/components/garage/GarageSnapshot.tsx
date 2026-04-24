import type { GarageProject } from "@/types/garage";

/**
 * GarageSnapshot — the 60-second truth for a startup engagement.
 *
 * Answers one question: where is the build right now?
 *
 * Signal source priority:
 *   1. draftUpdate   — OS-written assessment (most recent system read)
 *   2. currentFocus  — editorial framing of where the work is
 *
 * If neither exists, returns null. The Garage doesn't fake signals.
 *
 * Placement: top of Garage content area, immediately below the header.
 */
export function GarageSnapshot({ project }: { project: GarageProject }) {
  const signal = project.draftUpdate || project.currentFocus;
  if (!signal) return null;

  return (
    <div className="bg-white rounded-2xl border border-[#e4e4dd] overflow-hidden">
      <div className="h-1 bg-[#0a0a0a]" />
      <div className="px-6 py-5">
        <p className="text-[10px] font-bold text-[#0a0a0a]/30 uppercase tracking-widest mb-3">
          Where the build is right now
        </p>
        <p className="text-sm text-[#0a0a0a]/70 leading-relaxed">
          {signal}
        </p>
        <p className="text-[10px] text-[#0a0a0a]/20 font-medium mt-3">
          Common House OS · most recent assessment
        </p>
      </div>
    </div>
  );
}
