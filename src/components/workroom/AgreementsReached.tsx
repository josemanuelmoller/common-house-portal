import type { WorkroomDecision } from "@/types/workroom";

export function AgreementsReached({ decisions }: { decisions: WorkroomDecision[] }) {
  if (decisions.length === 0) return null;

  return (
    <div className="bg-white rounded-2xl border border-[#E0E0D8] overflow-hidden">
      <div className="h-1 bg-[#2563EB]" />
      <div className="px-6 py-5 border-b border-[#EFEFEA]">
        <p className="text-[10px] font-bold text-[#131218]/30 uppercase tracking-widest">
          Agreements reached
        </p>
      </div>
      <div className="divide-y divide-[#EFEFEA]">
        {decisions.map((d) => (
          <div key={d.id} className="px-6 py-4 flex items-start gap-4">
            <span className="w-5 h-5 rounded-full bg-[#2563EB] text-white flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">
              ✓
            </span>
            <div className="flex-1">
              <p className="text-sm font-semibold text-[#131218] leading-snug">
                {d.title}
              </p>
              {d.context && (
                <p className="text-xs text-[#131218]/50 mt-1.5 leading-relaxed">
                  {d.context}
                </p>
              )}
              {d.date && (
                <p className="text-[10px] font-bold text-[#131218]/25 uppercase tracking-widest mt-2">
                  {d.date}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
