import { HallOpportunity } from "@/types/hall";

export function OpportunityView({
  opportunities,
}: {
  opportunities: HallOpportunity[];
}) {
  if (opportunities.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-[#e4e4dd] overflow-hidden">
        <div className="h-1 bg-[#c6f24a]" />
        <div className="px-6 py-5 border-b border-[#f4f4ef]">
          <p className="text-[10px] font-bold text-[#0a0a0a]/30 uppercase tracking-widest">
            Opportunities
          </p>
        </div>
        <div className="px-6 py-10 text-center">
          <p className="text-sm text-[#0a0a0a]/40 leading-relaxed">
            Opportunities take shape as we dig in. Check back after the first
            findings session.
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
          Opportunities
        </p>
      </div>
      <div className="divide-y divide-[#f4f4ef]">
        {opportunities.map((opp, i) => (
          <div key={opp.id} className="px-6 py-4 flex gap-4">
            <span className="text-[10px] font-bold text-[#0a0a0a]/20 w-4 shrink-0 mt-0.5 tabular-nums">
              {String(i + 1).padStart(2, "0")}
            </span>
            <div>
              <p className="text-sm font-semibold text-[#0a0a0a]">
                {opp.title}
              </p>
              <p className="text-xs text-[#0a0a0a]/50 mt-1 leading-relaxed">
                {opp.summary}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
