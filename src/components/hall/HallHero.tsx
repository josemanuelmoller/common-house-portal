import { HallProject } from "@/types/hall";

interface HallHeroProps {
  project: HallProject;
  /** Primary CTA. When present, renders a lime button under the welcome note. */
  cta?: {
    label: string;
    href: string;
  };
}

export function HallHero({ project, cta }: HallHeroProps) {
  return (
    <div className="bg-[#0a0a0a] px-14 py-12">
      <div className="max-w-4xl">
        {/* Eyebrow */}
        <p className="text-[11px] font-bold text-white/30 uppercase tracking-[2.5px] mb-5">
          Welcome to The Hall
        </p>

        {/* Project name + stage + last updated */}
        <div className="flex items-start justify-between gap-6 flex-wrap">
          <div>
            <h1 className="text-[3rem] font-[900] text-white tracking-[-2px] leading-none">
              {project.name}
            </h1>
            <span className="inline-block bg-[#c6f24a] text-[#0a0a0a] text-[11px] font-bold uppercase tracking-[1.5px] rounded-full px-3 py-1 mt-3.5">
              {project.stage}
            </span>
            {project.statusLine && (
              <span className="text-xs text-white/50 font-medium ml-3">
                {project.statusLine}
              </span>
            )}
          </div>
          <div className="text-right shrink-0">
            <p className="text-[11px] font-bold text-white/30 uppercase tracking-[1.5px]">
              Last updated
            </p>
            <p className="text-[13px] font-semibold text-white/55 mt-1">
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

        {/* Primary CTA — only renders when caller provides one (Zeigarnik/Flow).
            Reserved lime applies here: this is the single accent colour used for the
            one action we want the client to take right now. */}
        {cta && (
          <a
            href={cta.href}
            className="inline-flex items-center gap-2 mt-6 bg-[#c6f24a] text-[#0a0a0a] text-[12px] font-bold px-4 py-2.5 rounded-full uppercase tracking-[1.5px] hover:bg-white transition-colors"
          >
            {cta.label}
            <span aria-hidden="true">→</span>
          </a>
        )}

        {/* Prepared note */}
        <p className="text-[11px] text-white/25 font-semibold mt-5 tracking-[0.3px]">
          {project.preparedNote}
        </p>
      </div>
    </div>
  );
}
