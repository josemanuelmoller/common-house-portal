import type { WorkroomProject } from "@/types/workroom";

export function WorkroomHeader({ project }: { project: WorkroomProject }) {
  return (
    <div className="bg-white border-b border-[#E0E0D8] px-8 py-6">
      <div className="flex items-start justify-between gap-6 flex-wrap">
        <div>
          <p className="text-[10px] font-bold text-[#131218]/25 uppercase tracking-widest mb-2">
            The Workroom
          </p>
          <h1 className="text-3xl font-bold text-[#131218] tracking-tight leading-tight">
            {project.name}
          </h1>
          <div className="flex items-center gap-2 mt-3 flex-wrap">
            <span className="text-[10px] font-bold text-white bg-[#2563EB] px-2.5 py-1 rounded-full uppercase tracking-widest">
              {project.stage}
            </span>
            {project.workroomMode && (
              <span className="text-[10px] font-bold text-[#131218]/40 bg-[#EFEFEA] px-2.5 py-1 rounded-full uppercase tracking-widest">
                {project.workroomMode}
              </span>
            )}
          </div>
        </div>
        <div className="text-right shrink-0">
          <p className="text-[10px] text-[#131218]/25 uppercase tracking-widest font-bold">
            Last updated
          </p>
          <p className="text-sm font-semibold text-[#131218]/40 mt-0.5">
            {project.lastUpdated}
          </p>
        </div>
      </div>
    </div>
  );
}
