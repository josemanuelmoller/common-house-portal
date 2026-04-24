import { HallProject } from "@/types/hall";

export function WhatsHappeningNow({ project }: { project: HallProject }) {
  const hasContent = !!(project.currentFocus || project.nextMilestone);

  return (
    <div className="bg-white rounded-2xl border border-[#e4e4dd] overflow-hidden h-full">
      {/* Lime accent bar */}
      <div className="h-[3px] bg-[#c6f24a]" />

      {/* Card header */}
      <div className="px-6 py-5 border-b border-[#e4e4dd] flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          {/* Lime icon */}
          <div className="w-7 h-7 rounded-lg bg-[#c6f24a] flex items-center justify-center flex-shrink-0">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="#000" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/>
              <polyline points="12 6 12 12 16 14"/>
            </svg>
          </div>
          <span className="text-[13px] font-[900] text-[#0a0a0a] tracking-tight">
            What&apos;s happening now
          </span>
        </div>
        {hasContent && (
          <span className="inline-block bg-[#c6f24a] text-[#0a0a0a] text-[8px] font-bold uppercase tracking-[1.8px] rounded-full px-2.5 py-1">
            Active
          </span>
        )}
      </div>

      {/* Two-column body */}
      <div className="grid grid-cols-1 sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-[#e4e4dd]">
        {/* Current focus */}
        <div className="px-6 py-5">
          <p className="text-[8.5px] font-bold uppercase tracking-[2px] text-[#0a0a0a]/22 mb-2.5">
            Current focus
          </p>
          {project.currentFocus ? (
            <>
              <p className="text-[13.5px] font-semibold text-[#0a0a0a] leading-[1.55]">
                {project.currentFocus}
              </p>
              <div className="inline-flex items-center gap-1.5 mt-2.5 border border-[#E0E0E0] rounded-full px-2.5 py-1">
                <span className="w-[5px] h-[5px] rounded-full bg-[#c6f24a] flex-shrink-0" />
                <span className="text-[9px] font-semibold text-[#888]">In progress</span>
              </div>
            </>
          ) : (
            <p className="text-sm text-[#0a0a0a]/30 leading-relaxed">
              We&apos;ll update this as the next phase takes shape.
            </p>
          )}
        </div>

        {/* Next milestone */}
        <div className="px-6 py-5">
          <p className="text-[8.5px] font-bold uppercase tracking-[2px] text-[#0a0a0a]/22 mb-2.5">
            Next milestone
          </p>
          {project.nextMilestone ? (
            <>
              <p className="text-[13.5px] font-semibold text-[#0a0a0a] leading-[1.55]">
                {project.nextMilestone}
              </p>
              <div className="inline-flex items-center gap-1.5 mt-2.5 border border-[#EEEEEE] rounded-full px-2.5 py-1">
                <span className="w-[5px] h-[5px] rounded-full bg-[#DDDDDD] flex-shrink-0" />
                <span className="text-[9px] font-semibold text-[#AAA]">Upcoming</span>
              </div>
            </>
          ) : (
            <p className="text-sm text-[#0a0a0a]/30 leading-relaxed">
              Next milestone to be confirmed.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
