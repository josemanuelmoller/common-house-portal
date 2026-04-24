/**
 * WorkroomDelta — Activity pulse for the Workroom.
 *
 * Shows a compact summary of recorded activity: sessions, decisions, and
 * any active blockers. Derived entirely from the evidence + session arrays
 * already loaded by workroom/page.tsx — no additional data fetching.
 *
 * The "last session" signal surfaces the most recent working session title
 * and date, giving the client immediate context for what happened most recently.
 *
 * Only renders if there is at least one session or one decision recorded.
 */

export type WorkroomActivitySummary = {
  sessionCount: number;
  decisionCount: number;
  blockerCount: number;
  lastSession?: { title: string; date: string };
};

export function WorkroomDelta({ activity }: { activity: WorkroomActivitySummary }) {
  if (activity.sessionCount === 0 && activity.decisionCount === 0) return null;

  return (
    <div className="bg-white rounded-2xl border border-[#e4e4dd] overflow-hidden">
      <div className="h-1 bg-[#c6f24a]" />
      <div className="px-6 py-5">
        <div className="flex items-start justify-between gap-6 flex-wrap">

          {/* Stats */}
          <div>
            <p className="text-[10px] font-bold text-[#0a0a0a]/30 uppercase tracking-widest mb-3">
              Activity on record
            </p>
            <div className="flex items-end gap-6">
              {activity.sessionCount > 0 && (
                <div>
                  <p className="text-2xl font-bold text-[#0a0a0a] tracking-tight leading-none">
                    {activity.sessionCount}
                  </p>
                  <p className="text-[10px] font-medium text-[#0a0a0a]/40 uppercase tracking-widest mt-1">
                    session{activity.sessionCount !== 1 ? "s" : ""}
                  </p>
                </div>
              )}
              {activity.decisionCount > 0 && (
                <div>
                  <p className="text-2xl font-bold text-[#0a0a0a] tracking-tight leading-none">
                    {activity.decisionCount}
                  </p>
                  <p className="text-[10px] font-medium text-[#0a0a0a]/40 uppercase tracking-widest mt-1">
                    decision{activity.decisionCount !== 1 ? "s" : ""}
                  </p>
                </div>
              )}
              {activity.blockerCount > 0 && (
                <div>
                  <p className="text-2xl font-bold text-red-500 tracking-tight leading-none">
                    {activity.blockerCount}
                  </p>
                  <p className="text-[10px] font-medium text-red-400 uppercase tracking-widest mt-1">
                    blocker{activity.blockerCount !== 1 ? "s" : ""}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Last session signal */}
          {activity.lastSession && (
            <div className="text-right">
              <p className="text-[10px] font-bold text-[#0a0a0a]/20 uppercase tracking-widest mb-1.5">
                Last session
              </p>
              <p className="text-sm font-semibold text-[#0a0a0a]/55 leading-snug max-w-[220px]">
                {activity.lastSession.title}
              </p>
              <p className="text-[10px] text-[#0a0a0a]/25 font-medium mt-0.5">
                {activity.lastSession.date}
              </p>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
