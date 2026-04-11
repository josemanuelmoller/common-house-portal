import { HallAsk } from "@/types/hall";

export function NeedsYourInput({ asks }: { asks: HallAsk[] }) {
  if (asks.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-[#E0E0D8] overflow-hidden">
        <div className="h-1 bg-[#131218]" />
        <div className="px-6 py-5 border-b border-[#EFEFEA]">
          <p className="text-[10px] font-bold text-[#131218]/30 uppercase tracking-widest">
            Needs your input
          </p>
        </div>
        <div className="px-6 py-10 text-center">
          <p className="text-sm text-[#131218]/40 leading-relaxed">
            Nothing open right now. We&apos;ll flag anything the moment it
            needs your attention.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-[#E0E0D8] overflow-hidden">
      <div className="h-1 bg-[#131218]" />
      <div className="px-6 py-5 border-b border-[#EFEFEA]">
        <div className="flex items-center justify-between">
          <p className="text-[10px] font-bold text-[#131218]/30 uppercase tracking-widest">
            Needs your input
          </p>
          <span className="text-[10px] font-bold text-[#131218] bg-[#B2FF59] px-2 py-0.5 rounded-full uppercase tracking-widest">
            {asks.length} open
          </span>
        </div>
      </div>
      <div className="divide-y divide-[#EFEFEA]">
        {asks.map((ask) => (
          <div key={ask.id} className="px-6 py-4">
            <p className="text-sm font-semibold text-[#131218] leading-snug">
              {ask.question}
            </p>
            {ask.context && (
              <p className="text-xs text-[#131218]/50 mt-1.5 leading-relaxed">
                {ask.context}
              </p>
            )}
            {ask.dueDate && (
              <p className="text-[10px] font-bold text-[#131218]/25 uppercase tracking-widest mt-2.5">
                By {ask.dueDate}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
