import type { WorkroomProject } from "@/types/workroom";

/**
 * WorkroomHeader — dark treatment matching the House design language.
 *
 * Coherence note: all House page headers use bg-[#0a0a0a] (Hall, Library,
 * Residents, Admin). The Workroom header was previously white, creating
 * a jarring visual split. Dark treatment restores House coherence.
 */
export function WorkroomHeader({ project }: { project: WorkroomProject }) {
  return (
    <div className="bg-[#0a0a0a] px-8 py-8 border-b border-white/8">
      <div className="max-w-4xl mx-auto flex items-start justify-between gap-6 flex-wrap">
        <div>
          <p className="text-[10px] font-bold text-white/25 uppercase tracking-widest mb-2">
            The Workroom
          </p>
          <h1 className="text-3xl font-bold text-white tracking-tight leading-tight">
            {project.name}
          </h1>
          <div className="flex items-center gap-2 mt-3 flex-wrap">
            <span className="text-[10px] font-bold text-[#0a0a0a] bg-[#c6f24a] px-2.5 py-1 rounded-full uppercase tracking-widest">
              {project.stage}
            </span>
            {project.workroomMode && (
              <span className="text-[10px] font-bold text-white/40 border border-white/15 px-2.5 py-1 rounded-full uppercase tracking-widest">
                {project.workroomMode}
              </span>
            )}
          </div>
        </div>
        <div className="text-right shrink-0">
          <p className="text-[10px] text-white/25 uppercase tracking-widest font-bold">
            Last updated
          </p>
          <p className="text-sm font-semibold text-white/40 mt-0.5">
            {project.lastUpdated}
          </p>
        </div>
      </div>
    </div>
  );
}
