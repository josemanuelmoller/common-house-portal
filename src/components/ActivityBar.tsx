import type { SourceActivity } from "@/lib/notion";

type Props = {
  activity: SourceActivity;
};

export function ActivityBar({ activity }: Props) {
  const { meetings, emailCount, documentCount, otherCount } = activity;

  const pills = [
    { icon: "🎙", count: meetings.length, label: "Reuniones" },
    { icon: "✉️", count: emailCount,      label: "Emails" },
    { icon: "📄", count: documentCount,   label: "Documentos" },
    ...(otherCount > 0 ? [{ icon: "◈", count: otherCount, label: "Otros" }] : []),
  ];

  return (
    <div>
      <p className="text-[10px] font-bold text-[#131218]/30 uppercase tracking-widest mb-2">
        Actividad registrada
      </p>
      <div className="flex flex-wrap gap-2">
        {pills.map(pill => (
          <span
            key={pill.label}
            className="inline-flex items-center gap-1.5 bg-[#131218] text-white text-[10px] font-bold uppercase tracking-widest px-3 py-1.5 rounded-full"
          >
            <span>{pill.icon}</span>
            <span>{pill.count}</span>
            <span>{pill.label}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
