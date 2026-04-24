import { HallDecision } from "@/types/hall";

const STATUS_STYLES: Record<
  HallDecision["status"],
  { bar: string; badge: string; label: string }
> = {
  confirmed: {
    bar: "bg-[#c6f24a]",
    badge: "bg-[#c6f24a] text-[#0a0a0a]",
    label: "Agreed",
  },
  pending: {
    bar: "bg-amber-400",
    badge: "bg-amber-100 text-amber-700",
    label: "In discussion",
  },
  revisited: {
    bar: "bg-[#f4f4ef]",
    badge: "bg-[#f4f4ef] text-[#0a0a0a]/50",
    label: "Revisited",
  },
};

export function HallDecisions({ decisions }: { decisions: HallDecision[] }) {
  if (decisions.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-[#e4e4dd] overflow-hidden">
        <div className="h-1 bg-[#c6f24a]" />
        <div className="px-6 py-5 border-b border-[#f4f4ef]">
          <p className="text-[10px] font-bold text-[#0a0a0a]/30 uppercase tracking-widest">
            Decisions
          </p>
        </div>
        <div className="px-6 py-10 text-center">
          <p className="text-sm text-[#0a0a0a]/40 leading-relaxed">
            Agreements reached together will appear here as the work moves forward.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-[#e4e4dd] overflow-hidden">
      <div className="h-1 bg-[#c6f24a]" />
      <div className="px-6 py-5 border-b border-[#f4f4ef]">
        <p className="text-[10px] font-bold text-[#0a0a0a]/30 uppercase tracking-widest">
          What we&apos;ve agreed
        </p>
      </div>
      <div className="divide-y divide-[#f4f4ef]">
        {decisions.map((dec) => {
          const s = STATUS_STYLES[dec.status];
          return (
            <div key={dec.id} className="px-6 py-4 flex gap-4">
              <span
                className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5 ${s.badge}`}
              >
                ✓
              </span>
              <div className="flex-1">
                <p className="text-sm font-semibold text-[#0a0a0a] leading-snug">
                  {dec.title}
                </p>
                {dec.context && (
                  <p className="text-xs text-[#0a0a0a]/50 mt-1.5 leading-relaxed">
                    {dec.context}
                  </p>
                )}
                <div className="flex items-center gap-3 mt-2">
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-widest ${s.badge}`}
                  >
                    {s.label}
                  </span>
                  <span className="text-[10px] font-bold text-[#0a0a0a]/25 uppercase tracking-widest">
                    {dec.date}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
