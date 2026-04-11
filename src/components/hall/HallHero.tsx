import { HallProject } from "@/types/hall";

export function HallHero({ project }: { project: HallProject }) {
  return (
    <div className="bg-[#131218] px-8 py-10">
      <div className="max-w-4xl mx-auto">
        {/* Eyebrow */}
        <p className="text-[10px] font-bold text-white/30 uppercase tracking-widest mb-6">
          Welcome to The Hall
        </p>

        {/* Project name + stage */}
        <div className="flex items-start justify-between gap-6 flex-wrap">
          <div>
            <h1 className="text-4xl font-bold text-white tracking-tight leading-tight">
              {project.name}
            </h1>
            <div className="flex items-center gap-3 mt-3 flex-wrap">
              <span className="text-[10px] font-bold text-[#131218] bg-[#B2FF59] px-2.5 py-1 rounded-full uppercase tracking-widest">
                {project.stage}
              </span>
              {project.statusLine && (
                <span className="text-xs text-white/40 font-medium">
                  {project.statusLine}
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

        {/* Divider */}
        <div className="h-px bg-white/8 my-7" />

        {/* Welcome note */}
        <p className="text-white/70 text-base leading-relaxed max-w-2xl">
          {project.welcomeNote}
        </p>

        {/* Prepared note */}
        <p className="text-white/25 text-xs mt-5 font-medium">
          {project.preparedNote}
        </p>
      </div>
    </div>
  );
}
