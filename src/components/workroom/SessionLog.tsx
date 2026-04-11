import type { WorkroomSession } from "@/types/workroom";

export function SessionLog({ sessions }: { sessions: WorkroomSession[] }) {
  if (sessions.length === 0) return null;

  return (
    <div className="bg-white rounded-2xl border border-[#E0E0D8] overflow-hidden">
      <div className="h-1 bg-[#131218]" />
      <div className="px-6 py-5 border-b border-[#EFEFEA]">
        <p className="text-[10px] font-bold text-[#131218]/30 uppercase tracking-widest">
          Session log
        </p>
        <p className="text-xs text-[#131218]/30 mt-0.5">
          Recaps from working sessions
        </p>
      </div>
      <div className="divide-y divide-[#EFEFEA]">
        {sessions.map((s) => (
          <div key={s.id} className="px-6 py-5">
            <div className="flex items-start justify-between gap-4 flex-wrap mb-2">
              <p className="text-sm font-semibold text-[#131218]">{s.title}</p>
              <p className="text-[10px] font-bold text-[#131218]/25 uppercase tracking-widest shrink-0">
                {s.date}
              </p>
            </div>
            <p className="text-sm text-[#131218]/60 leading-relaxed">{s.summary}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
