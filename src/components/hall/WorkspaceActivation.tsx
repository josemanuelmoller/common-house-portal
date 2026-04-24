import Link from "next/link";
import type { HallProject } from "@/types/hall";

interface WorkspaceActivationProps {
  project: HallProject;
  /** Most recent working session — creates a "the work is already moving" signal */
  lastSession?: { title: string; date: string };
}

/**
 * WorkspaceActivation — Hall → Workroom threshold block.
 *
 * Appears in The Hall when the project's primary workspace is "workroom" and the
 * project is live. Marks the transition from relationship/orientation mode into
 * active delivery — the Hall remains accessible, the Workroom is now the live surface.
 *
 * The block conveys three things:
 *   1. The work has moved — this is not a starting point, it's a transition
 *   2. The Hall stays — context, team, and history remain here
 *   3. Something is already happening — surfaced via lastSession or nextMilestone
 *
 * Part of the Onboarding lifecycle layer (see src/types/house.ts).
 * Onboarding moment: workroom_activation.
 */
export function WorkspaceActivation({ project, lastSession }: WorkspaceActivationProps) {
  return (
    <div className="bg-[#0a0a0a] rounded-2xl overflow-hidden">
      <div className="h-1 bg-[#c6f24a]" />
      <div className="px-6 py-6">
        <div className="flex items-start justify-between gap-6 flex-wrap">
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-bold text-[#c6f24a]/60 uppercase tracking-widest mb-3">
              Execution is live
            </p>
            <h3 className="text-base font-bold text-white tracking-tight">
              The work has moved into The Workroom
            </h3>
            <p className="text-sm text-white/45 mt-2 leading-relaxed max-w-lg">
              This Hall stays as your relationship layer — the context, the team, and the
              history of the work live here. The Workroom is where the delivery now happens:
              what&apos;s moving, what&apos;s blocked, and what has been decided.
            </p>
          </div>
          <Link
            href="/workroom"
            className="shrink-0 self-center inline-flex items-center gap-2 bg-[#c6f24a] text-[#0a0a0a] text-[11px] font-bold px-4 py-2.5 rounded-xl hover:bg-white transition-colors uppercase tracking-widest whitespace-nowrap"
          >
            Open The Workroom →
          </Link>
        </div>

        {/* Contextual signal: last session and/or next milestone */}
        {(lastSession || project.nextMilestone) && (
          <div className="mt-5 pt-5 border-t border-white/8 flex items-start gap-10 flex-wrap">
            {lastSession && (
              <div>
                <p className="text-[10px] font-bold text-white/20 uppercase tracking-widest mb-1.5">
                  Last session
                </p>
                <p className="text-sm text-white/40 font-medium leading-snug">{lastSession.title}</p>
                <p className="text-[10px] text-white/20 mt-0.5">{lastSession.date}</p>
              </div>
            )}
            {project.nextMilestone && (
              <div>
                <p className="text-[10px] font-bold text-white/20 uppercase tracking-widest mb-1.5">
                  Next milestone
                </p>
                <p className="text-sm text-white/40 font-medium leading-snug">{project.nextMilestone}</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
