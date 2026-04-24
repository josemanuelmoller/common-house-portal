import { HallConversation } from "@/types/hall";

export function Conversations({
  conversations,
}: {
  conversations: HallConversation[];
}) {
  if (conversations.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-[#e4e4dd] overflow-hidden">
        <div className="h-1 bg-[#0a0a0a]" />
        <div className="px-6 py-5 border-b border-[#f4f4ef]">
          <p className="text-[10px] font-bold text-[#0a0a0a]/30 uppercase tracking-widest">
            What we&apos;ve covered
          </p>
          <p className="text-xs text-[#0a0a0a]/30 mt-0.5">Recaps from our sessions together</p>
        </div>
        <div className="px-6 py-10 text-center">
          <p className="text-sm text-[#0a0a0a]/40 leading-relaxed">
            Session recaps will appear here as the work progresses.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-[#e4e4dd] overflow-hidden">
      <div className="h-1 bg-[#0a0a0a]" />
      <div className="px-6 py-5 border-b border-[#f4f4ef]">
        <p className="text-[10px] font-bold text-[#0a0a0a]/30 uppercase tracking-widest">
          What we&apos;ve covered
        </p>
        <p className="text-xs text-[#0a0a0a]/30 mt-0.5">Recaps from our sessions together</p>
      </div>
      <div className="divide-y divide-[#f4f4ef]">
        {conversations.map((conv) => (
          <div key={conv.id} className="px-6 py-5">
            <div className="flex items-start justify-between gap-4 flex-wrap mb-2">
              <p className="text-sm font-semibold text-[#0a0a0a]">
                {conv.title}
              </p>
              <p className="text-[10px] font-bold text-[#0a0a0a]/25 uppercase tracking-widest shrink-0">
                {conv.date}
              </p>
            </div>
            {conv.summary ? (
              <p className="text-sm text-[#0a0a0a]/60 leading-relaxed">
                {conv.summary}
              </p>
            ) : (
              <p className="text-xs text-[#0a0a0a]/25 leading-relaxed italic">
                Recap pending.
              </p>
            )}
            {conv.takeaway && (
              <div className="mt-3 flex items-start gap-2.5">
                <span className="text-[#c6f24a] bg-[#0a0a0a] rounded-full w-4 h-4 flex items-center justify-center text-[9px] font-bold shrink-0 mt-0.5">
                  →
                </span>
                <p className="text-xs text-[#0a0a0a]/50 leading-relaxed">
                  {conv.takeaway}
                </p>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
