import type { WorkroomProject } from "@/types/workroom";

export function ExecutiveSnapshot({ project }: { project: WorkroomProject }) {
  const summary = project.currentFocus || project.draftUpdate;
  if (!summary) return null;

  return (
    <div className="bg-white rounded-2xl border border-[#E0E0D8] overflow-hidden">
      <div className="h-1 bg-[#2563EB]" />
      <div className="px-6 py-5 border-b border-[#EFEFEA]">
        <p className="text-[10px] font-bold text-[#131218]/30 uppercase tracking-widest">
          Where we stand
        </p>
      </div>
      <div className="px-6 py-5">
        <p className="text-sm text-[#131218]/70 leading-relaxed">{summary}</p>
      </div>
    </div>
  );
}
