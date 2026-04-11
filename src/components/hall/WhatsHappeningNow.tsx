import { HallProject } from "@/types/hall";

export function WhatsHappeningNow({ project }: { project: HallProject }) {
  return (
    <div className="bg-white rounded-2xl border border-[#E0E0D8] overflow-hidden h-full">
      <div className="h-1 bg-[#B2FF59]" />
      <div className="px-6 py-5 border-b border-[#EFEFEA]">
        <p className="text-[10px] font-bold text-[#131218]/30 uppercase tracking-widest">
          What&apos;s happening now
        </p>
      </div>
      <div className="px-6 py-5 space-y-5">
        {project.currentFocus ? (
          <div>
            <p className="text-[10px] font-bold text-[#131218]/25 uppercase tracking-widest mb-2">
              Current focus
            </p>
            <p className="text-sm text-[#131218] leading-relaxed font-medium">
              {project.currentFocus}
            </p>
          </div>
        ) : (
          <p className="text-sm text-[#131218]/30 leading-relaxed">
            We&apos;ll update this as the next phase takes shape.
          </p>
        )}
        {project.nextMilestone && (
          <>
            <div className="h-px bg-[#EFEFEA]" />
            <div>
              <p className="text-[10px] font-bold text-[#131218]/25 uppercase tracking-widest mb-2">
                Next milestone
              </p>
              <p className="text-sm text-[#131218] leading-relaxed font-medium">
                {project.nextMilestone}
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
