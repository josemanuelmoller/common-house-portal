import type { WorkroomProject } from "@/types/workroom";

/**
 * ExecutiveSnapshot — the OS-written status update.
 *
 * Shows draftUpdate only — the latest state written by the Common House system.
 * This is distinct from currentFocus (the editorial focus written by the CH team),
 * which surfaces in WhatsInMotion.
 *
 * If draftUpdate is empty, this component returns null — the block is genuinely
 * optional and only appears when the OS has produced a status.
 */
export function ExecutiveSnapshot({ project }: { project: WorkroomProject }) {
  if (!project.draftUpdate) return null;

  return (
    <div className="bg-white rounded-2xl border border-[#E0E0D8] overflow-hidden">
      <div className="h-1 bg-[#131218]" />
      <div className="px-6 py-4 border-b border-[#EFEFEA]">
        <p className="text-[10px] font-bold text-[#131218]/30 uppercase tracking-widest">
          Latest status
        </p>
        <p className="text-[10px] text-[#131218]/20 mt-0.5">
          Common House system — most recent assessment
        </p>
      </div>
      <div className="px-6 py-5">
        <p className="text-sm text-[#131218]/70 leading-relaxed">{project.draftUpdate}</p>
      </div>
    </div>
  );
}
