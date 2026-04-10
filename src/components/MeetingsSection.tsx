import type { MeetingItem } from "@/lib/notion";
import { MeetingDetailModal } from "@/components/MeetingDetailModal";

type Props = {
  meetings: MeetingItem[];
};

function platformBadge(platform: string): string {
  if (platform === "Fireflies") return "bg-purple-100 text-purple-700";
  if (platform === "Gmail")     return "bg-red-100 text-red-700";
  return "bg-[#EFEFEA] text-[#131218]/40";
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function MeetingsSection({ meetings }: Props) {
  if (!meetings.length) return null;

  const visible = meetings.slice(0, 3);

  return (
    <div className="bg-white rounded-2xl border border-[#E0E0D8] overflow-hidden">
      <div className="h-1 bg-[#131218]" />
      <div className="px-6 py-4 border-b border-[#EFEFEA]">
        <p className="text-[10px] font-bold text-[#131218]/30 uppercase tracking-widest">Últimas Reuniones</p>
        <p className="text-[10px] text-[#131218]/20 mt-0.5">Clic en cualquier reunión para ver detalle</p>
      </div>
      <div className="divide-y divide-[#EFEFEA]">
        {visible.map(meeting => (
          <MeetingDetailModal key={meeting.id} meetingId={meeting.id}>
            <div className="flex items-center gap-4 px-6 py-4 hover:bg-[#EFEFEA]/40 transition-colors group cursor-pointer">
              {/* Date */}
              <p className="text-xs text-[#131218]/40 shrink-0 w-24">
                {formatDate(meeting.date)}
              </p>

              {/* Title */}
              <p className="text-sm font-semibold text-[#131218] flex-1 min-w-0 truncate group-hover:underline underline-offset-2">
                {meeting.title}
              </p>

              {/* Platform badge */}
              {meeting.platform && (
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${platformBadge(meeting.platform)}`}>
                  {meeting.platform}
                </span>
              )}

              {/* Chevron */}
              <span className="text-[#131218]/20 group-hover:text-[#131218]/50 transition-colors shrink-0 text-sm">
                →
              </span>
            </div>
          </MeetingDetailModal>
        ))}
      </div>
    </div>
  );
}
