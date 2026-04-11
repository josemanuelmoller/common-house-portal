import type { HallProject } from "@/types/hall";

interface GarageActivationProps {
  project: HallProject;
  lastSession?: { title: string; date: string };
}

/**
 * GarageActivation — Hall → Garage threshold block.
 *
 * Onboarding moment: "garage_activation"
 * Triggered when: project is live + primaryWorkspace === "garage" + WORKSPACE_READY.garage = true
 *
 * Placement: top of Hall content area — the first thing a startup founder sees
 * when their engagement has activated to The Garage.
 *
 * Message: "The build is active. The Garage is where the work happens."
 * CTA: "Open The Garage →" links to /garage.
 *
 * The Hall does NOT disappear or redirect. This is an additive CTA —
 * the client can always stay in The Hall for context and narrative.
 * The Garage is for execution. The Hall is for orientation.
 *
 * Mirrors WorkspaceActivation (Hall → Workroom) but with Garage framing.
 */
export function GarageActivation({ project: _project, lastSession }: GarageActivationProps) {
  return (
    <div className="bg-[#131218] rounded-2xl overflow-hidden">
      <div className="h-1 bg-[#B2FF59]" />
      <div className="px-6 py-6">
        <p className="text-[10px] font-bold text-white/25 uppercase tracking-widest mb-3">
          The Garage is live
        </p>
        <h3 className="text-lg font-bold text-white tracking-tight leading-snug">
          The build is active.
        </h3>
        <p className="text-sm text-white/50 mt-2 leading-relaxed max-w-md">
          The Garage is where the work happens — commitments, decisions, working sessions,
          and materials all in one place. The Hall stays available for context and narrative.
        </p>

        <div className="mt-5">
          <a
            href="/garage"
            className="inline-flex items-center gap-2 bg-[#B2FF59] text-[#131218] text-xs font-bold px-4 py-2.5 rounded-full uppercase tracking-widest hover:bg-[#c5ff7a] transition-colors"
          >
            Open The Garage →
          </a>
        </div>

        {lastSession && (
          <div className="mt-5 pt-5 border-t border-white/10">
            <p className="text-[10px] font-bold text-white/20 uppercase tracking-widest mb-1">
              Last session
            </p>
            <p className="text-sm font-semibold text-white/60 leading-snug">
              {lastSession.title}
            </p>
            <p className="text-[10px] text-white/25 font-medium mt-0.5">
              {lastSession.date}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
