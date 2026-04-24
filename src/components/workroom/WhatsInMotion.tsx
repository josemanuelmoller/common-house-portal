import type { WorkroomProject } from "@/types/workroom";

export function WhatsInMotion({ project }: { project: WorkroomProject }) {
  if (!project.currentFocus) return null;

  return (
    <div className="bg-white rounded-2xl border border-[#e4e4dd] overflow-hidden">
      <div className="h-1 bg-[#2563EB]" />
      <div className="px-6 py-5 border-b border-[#f4f4ef]">
        <p className="text-[10px] font-bold text-[#0a0a0a]/30 uppercase tracking-widest">
          What&apos;s in motion
        </p>
      </div>
      <div className="px-6 py-5">
        <p className="text-sm text-[#0a0a0a] font-medium leading-relaxed">
          {project.currentFocus}
        </p>
      </div>
    </div>
  );
}
