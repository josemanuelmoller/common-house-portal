import type { GarageCommitment } from "@/types/garage";

/**
 * GarageCommitments — what the team said it would do.
 *
 * Source: Action Item evidence (Validated) from CH Evidence [OS v2].
 * These are commitments captured from working sessions — things said explicitly,
 * recorded by the OS, and confirmed as real. Not tasks. Not a backlog.
 * A record of what was committed to — so nothing slips between sessions.
 *
 * Placement: mid-Garage, after blockers. Paired with GarageMaterials.
 * Returns null if no validated action items exist.
 */
export function GarageCommitments({ commitments }: { commitments: GarageCommitment[] }) {
  if (commitments.length === 0) return null;

  return (
    <div className="bg-white rounded-2xl border border-[#e4e4dd] overflow-hidden">
      <div className="h-1 bg-[#c6f24a]" />
      <div className="px-6 py-5 border-b border-[#f4f4ef]">
        <div className="flex items-center justify-between">
          <p className="text-[10px] font-bold text-[#0a0a0a]/30 uppercase tracking-widest">
            Commitments
          </p>
          <span className="text-[10px] font-bold text-[#0a0a0a] bg-[#c6f24a] px-2 py-0.5 rounded-full">
            {commitments.length}
          </span>
        </div>
        <p className="text-sm text-[#0a0a0a]/40 mt-1.5 leading-relaxed">
          What the team said it would do — captured and confirmed.
        </p>
      </div>
      <div className="divide-y divide-[#f4f4ef]">
        {commitments.map((c) => (
          <div key={c.id} className="px-6 py-4">
            <p className="text-sm font-semibold text-[#0a0a0a] leading-snug">
              {c.title}
            </p>
            {c.excerpt && (
              <p className="text-sm text-[#0a0a0a]/50 mt-1.5 leading-relaxed">
                {c.excerpt}
              </p>
            )}
            {c.date && (
              <p className="text-[10px] text-[#0a0a0a]/25 font-medium uppercase tracking-widest mt-2">
                Captured {c.date}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
