import { HallTimelineItem } from "@/types/hall";

const STATUS_DOT: Record<HallTimelineItem["status"], string> = {
  done: "bg-[#c6f24a]",
  current: "bg-[#0a0a0a]",
  upcoming: "bg-[#e4e4dd]",
};

const STATUS_LABEL: Record<HallTimelineItem["status"], string> = {
  done: "Done",
  current: "Now",
  upcoming: "",
};

export function HallTimeline({ timeline }: { timeline: HallTimelineItem[] }) {
  if (timeline.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-[#e4e4dd] overflow-hidden">
        <div className="h-1 bg-[#c6f24a]" />
        <div className="px-6 py-5 border-b border-[#f4f4ef]">
          <p className="text-[10px] font-bold text-[#0a0a0a]/30 uppercase tracking-widest">
            Timeline
          </p>
        </div>
        <div className="px-6 py-10 text-center">
          <p className="text-sm text-[#0a0a0a]/40 leading-relaxed">
            Milestones will appear here once the timeline is confirmed.
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
          Timeline
        </p>
      </div>
      <div className="px-6 py-5">
        {/* TODO: wire to project timeline data — no direct Notion source yet, populate from HallData manually */}
        <div className="relative">
          {/* Track line */}
          <div className="absolute left-[7px] top-2 bottom-2 w-px bg-[#e4e4dd]" />
          <div className="space-y-0">
            {timeline.map((item, i) => {
              const isLast = i === timeline.length - 1;
              return (
                <div
                  key={item.id}
                  className={`flex items-start gap-4 ${isLast ? "" : "pb-5"}`}
                >
                  {/* Dot */}
                  <div
                    className={`w-3.5 h-3.5 rounded-full shrink-0 mt-0.5 z-10 border-2 border-white ${STATUS_DOT[item.status]}`}
                  />
                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 flex-wrap">
                      <p
                        className={`text-sm font-semibold ${
                          item.status === "upcoming"
                            ? "text-[#0a0a0a]/40"
                            : "text-[#0a0a0a]"
                        }`}
                      >
                        {item.label}
                      </p>
                      {STATUS_LABEL[item.status] && (
                        <span
                          className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full uppercase tracking-widest ${
                            item.status === "current"
                              ? "bg-[#0a0a0a] text-[#c6f24a]"
                              : "bg-[#c6f24a] text-[#0a0a0a]"
                          }`}
                        >
                          {STATUS_LABEL[item.status]}
                        </span>
                      )}
                    </div>
                    <p className="text-[10px] font-bold text-[#0a0a0a]/25 uppercase tracking-widest mt-0.5">
                      {item.date}
                    </p>
                    {item.note && (
                      <p className="text-xs text-[#0a0a0a]/40 mt-1 leading-snug">
                        {item.note}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
