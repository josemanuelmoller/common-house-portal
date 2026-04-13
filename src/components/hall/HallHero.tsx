import { HallProject } from "@/types/hall";

export function HallHero({ project }: { project: HallProject }) {
  return (
    <div className="bg-[#131218] px-14 py-12">
      <div className="max-w-4xl">
        {/* Eyebrow */}
        <p className="text-[9px] font-bold text-white/22 uppercase tracking-[2.5px] mb-5">
          Welcome to The Hall
        </p>

        {/* Project name + stage + last updated */}
        <div className="flex items-start justify-between gap-6 flex-wrap">
          <div>
            <h1 className="text-[3rem] font-[900] text-white tracking-[-2px] leading-none">
              {project.name}
            </h1>
            <span className="inline-block bg-[#B2FF59] text-[#131218] text-[8.5px] font-bold uppercase tracking-[2px] rounded-full px-3 py-1 mt-3.5">
              {project.stage}
            </span>
            {project.statusLine && (
              <span className="text-xs text-white/40 font-medium ml-3">
                {project.statusLine}
              </span>
            )}
          </div>
          <div className="text-right shrink-0">
            <p className="text-[8.5px] font-bold text-white/18 uppercase tracking-[2px]">
              Last updated
            </p>
            <p className="text-xs font-semibold text-white/35 mt-1">
              {project.lastUpdated}
            </p>
          </div>
        </div>

        {/* Divider */}
        <div className="h-px bg-white/7 my-7" />

        {/* Welcome note */}
        <p className="text-[15px] text-white/65 leading-[1.7] max-w-[660px] font-normal">
          {project.welcomeNote}
        </p>

        {/* Prepared note */}
        <p className="text-[10px] text-white/18 font-semibold mt-5 tracking-[0.3px]">
          {project.preparedNote}
        </p>
      </div>
    </div>
  );
}
