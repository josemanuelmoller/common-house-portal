import { HallOpportunity } from "@/types/hall";

export function OpportunityView({
  opportunities,
}: {
  opportunities: HallOpportunity[];
}) {
  if (opportunities.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-[#E0E0D8] overflow-hidden">
        <div className="h-1 bg-[#B2FF59]" />
        <div className="px-6 py-5 border-b border-[#EFEFEA]">
          <p className="text-[10px] font-bold text-[#131218]/30 uppercase tracking-widest">
            Opportunities
          </p>
        </div>
        <div className="px-6 py-10 text-center">
          <p className="text-sm text-[#131218]/40 leading-relaxed">
            Opportunities take shape as we dig in. Check back after the first
            findings session.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-[#E0E0D8] overflow-hidden">
      <div className="h-1 bg-[#B2FF59]" />
      <div className="px-6 py-5 border-b border-[#EFEFEA]">
        <p className="text-[10px] font-bold text-[#131218]/30 uppercase tracking-widest">
          Opportunities
        </p>
      </div>
      <div className="divide-y divide-[#EFEFEA]">
        {opportunities.map((opp, i) => (
          <div key={opp.id} className="px-6 py-4 flex gap-4">
            <span className="text-[10px] font-bold text-[#131218]/20 w-4 shrink-0 mt-0.5 tabular-nums">
              {String(i + 1).padStart(2, "0")}
            </span>
            <div>
              <p className="text-sm font-semibold text-[#131218]">
                {opp.title}
              </p>
              <p className="text-xs text-[#131218]/50 mt-1 leading-relaxed">
                {opp.summary}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
