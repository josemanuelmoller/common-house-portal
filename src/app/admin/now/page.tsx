import Link from "next/link";
import { PortalShell } from "@/components/PortalShell";
import { HallSection } from "@/components/HallSection";
import { requireAdmin } from "@/lib/require-admin";
import { getOperatingSignals, getUpcomingMeetings } from "@/lib/operating-signals";

export const dynamic = "force-dynamic";

function formatTime(value: string) {
  return new Intl.DateTimeFormat("en-GB", { weekday: "short", hour: "2-digit", minute: "2-digit", day: "numeric", month: "short" }).format(new Date(value));
}

export default async function NowPage() {
  await requireAdmin();
  const [signals, meetings] = await Promise.all([getOperatingSignals(), getUpcomingMeetings()]);
  return <PortalShell
    eyebrow={{ label: "THE HALL", accent: "NOW" }}
    title="What needs your"
    flourish="attention"
    subtitle="This is a small operating queue, not your inbox. A signal enters only when a current project claim, client agreement or high-priority message needs a decision, confirmation or deliberate forgetting."
    meta={`${signals.length} SIGNAL${signals.length === 1 ? "" : "S"}`}
    narrow
    bodySpacing={8}
  >
    <HallSection title="Decide, confirm" flourish="or forget" meta={`${signals.length} OPEN`}>
      {signals.length === 0 ? <p className="text-[12px]" style={{ color: "var(--hall-muted-2)" }}>Nothing has crossed the operating threshold. The inbox may still contain mail, but no stateful signal needs attention.</p> : <div>{signals.map((signal) => <Link key={signal.id} href={signal.href} className="block py-4 hover:opacity-70" style={{ borderBottom: "1px solid var(--hall-line-soft)" }}><div className="flex flex-wrap items-start gap-3"><span className={signal.urgency === "critical" ? "hall-chip-dark" : "hall-chip-outline"}>{signal.urgency}</span><div className="flex-1 min-w-[220px]"><p className="text-[14px] font-bold">{signal.title}</p><p className="mt-1 text-[12px] leading-relaxed" style={{ color: "var(--hall-ink-3)" }}>{signal.detail}</p><p className="mt-1.5 text-[10px] uppercase tracking-[0.07em]" style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted-2)" }}>{signal.projectName ?? "Personal operating queue"} · {signal.kind.replaceAll("_", " ")}</p></div><span className="text-[11px]">Open →</span></div></Link>)}</div>}
    </HallSection>
    <HallSection title="Next" flourish="conversations" meta={`${meetings.length} IN 48H`}>
      {meetings.length === 0 ? <p className="text-[12px]" style={{ color: "var(--hall-muted-2)" }}>No upcoming meetings in the next 48 hours.</p> : <div>{meetings.map((meeting) => <div key={meeting.id} className="flex flex-wrap items-center gap-4 py-3" style={{ borderBottom: "1px solid var(--hall-line-soft)" }}><span className="min-w-[130px] text-[10px] uppercase tracking-[0.06em]" style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted-2)" }}>{formatTime(meeting.startsAt)}</span><strong className="flex-1 text-[13px]">{meeting.title}</strong>{meeting.href && <a className="hall-btn-ghost" href={meeting.href} target="_blank" rel="noreferrer">Open ↗</a>}</div>)}</div>}
    </HallSection>
  </PortalShell>;
}
