import type { WorkroomBlocker } from "@/types/workroom";

export function ActiveBlockers({ blockers }: { blockers: WorkroomBlocker[] }) {
  if (blockers.length === 0) return null;

  return (
    <div className="bg-white rounded-2xl border border-red-200 overflow-hidden">
      <div className="h-1 bg-red-500" />
      <div className="px-6 py-4 border-b border-[#EFEFEA]">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-red-500 inline-block shrink-0" />
          <p className="text-[10px] font-bold text-red-600 uppercase tracking-widest">
            {blockers.length} Active Blocker{blockers.length > 1 ? "s" : ""} — Needs attention
          </p>
        </div>
      </div>
      <div className="divide-y divide-[#EFEFEA]">
        {blockers.map((b) => (
          <div key={b.id} className="px-6 py-4">
            <p className="text-sm font-semibold text-[#131218]">{b.title}</p>
            {b.excerpt && (
              <p className="text-xs text-[#131218]/50 mt-1.5 leading-relaxed">
                {b.excerpt}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
