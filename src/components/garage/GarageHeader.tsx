import type { GarageProject } from "@/types/garage";

/**
 * GarageHeader — dark treatment, builder mood.
 *
 * The Garage is where startups build. The header signals that:
 * raw, energetic, focused on the work. Same dark pattern as
 * Workroom / Library / Residents / Admin — House coherence.
 *
 * The "◧" icon distinguishes The Garage from other surfaces.
 */
export function GarageHeader({ project }: { project: GarageProject }) {
  return (
    <div className="bg-[#0a0a0a] px-8 py-8 border-b border-white/8">
      <div className="max-w-4xl mx-auto flex items-start justify-between gap-6 flex-wrap">
        <div>
          <p className="text-[10px] font-bold text-white/25 uppercase tracking-widest mb-2">
            The Garage
          </p>
          <h1 className="text-3xl font-bold text-white tracking-tight leading-tight">
            {project.name}
          </h1>
          <div className="flex items-center gap-2 mt-3 flex-wrap">
            <span className="text-[10px] font-bold text-[#0a0a0a] bg-[#c6f24a] px-2.5 py-1 rounded-full uppercase tracking-widest">
              {project.stage}
            </span>
            {project.garageMode && (
              <span className="text-[10px] font-bold text-white/40 border border-white/15 px-2.5 py-1 rounded-full uppercase tracking-widest">
                {project.garageMode}
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
