import Link from "next/link";
import { PortalShell } from "@/components/PortalShell";
import { HallSection } from "@/components/HallSection";
import { NowProposalPackages, NowClaims } from "@/components/now/NowQueue";
import { requireAdmin } from "@/lib/require-admin";
import { getOperatingSignals, getUpcomingMeetings, getNowClaims } from "@/lib/operating-signals";
import { getNowProposalPackages } from "@/lib/state-proposals";

export const dynamic = "force-dynamic";

function formatTime(value: string) {
  return new Intl.DateTimeFormat("en-GB", { weekday: "short", hour: "2-digit", minute: "2-digit", day: "numeric", month: "short" }).format(new Date(value));
}

export default async function NowPage() {
  await requireAdmin();
  const [packages, claims, signals, meetings] = await Promise.all([
    getNowProposalPackages(),
    getNowClaims(),
    getOperatingSignals(),
    getUpcomingMeetings(),
  ]);

  const proposalTotal = packages.reduce((sum, p) => sum + p.total, 0);
  const queueEmpty = packages.length === 0 && claims.length === 0 && signals.length === 0;

  return <PortalShell
    eyebrow={{ label: "THE HALL", accent: "NOW" }}
    title="What needs your"
    flourish="attention"
    subtitle="A small operating queue, not your inbox. Decide, confirm or deliberately forget — inline. State changes only when you accept them."
    meta={`${proposalTotal + claims.length + signals.length} OPEN`}
    narrow
    bodySpacing={8}
  >
    {packages.length > 0 && (
      <HallSection title="Decide" flourish="state proposals" meta={`${proposalTotal} ACROSS ${packages.length} ${packages.length === 1 ? "PROJECT" : "PROJECTS"}`}>
        <NowProposalPackages packages={packages} />
      </HallSection>
    )}

    {claims.length > 0 && (
      <HallSection title="Confirm" flourish="or resolve" meta={`${claims.length} CLAIM${claims.length === 1 ? "" : "S"}`}>
        <NowClaims claims={claims} />
      </HallSection>
    )}

    {signals.length > 0 && (
      <HallSection title="Also" flourish="on your desk" meta={`${signals.length} SIGNAL${signals.length === 1 ? "" : "S"}`}>
        <div>{signals.map((signal) => <Link key={signal.id} href={signal.href} className="block py-4 hover:opacity-70" style={{ borderBottom: "1px solid var(--hall-line-soft)" }}><div className="flex flex-wrap items-start gap-3"><span className={signal.urgency === "critical" ? "hall-chip-dark" : "hall-chip-outline"}>{signal.urgency}</span><div className="flex-1 min-w-[220px]"><p className="text-[14px] font-bold">{signal.title}</p><p className="mt-1 text-[12px] leading-relaxed" style={{ color: "var(--hall-ink-3)" }}>{signal.detail}</p><p className="mt-1.5 text-[10px] uppercase tracking-[0.07em]" style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted-2)" }}>{signal.projectName ?? "Personal operating queue"} · {signal.kind.replaceAll("_", " ")}</p></div><span className="text-[11px]">Open →</span></div></Link>)}</div>
      </HallSection>
    )}

    {queueEmpty && (
      <HallSection title="Clear" flourish="for now" meta="0 OPEN">
        <p className="text-[12px]" style={{ color: "var(--hall-muted-2)" }}>Nothing has crossed the operating threshold. The inbox may still contain mail, but no stateful signal needs a decision.</p>
      </HallSection>
    )}

    <HallSection title="Next" flourish="conversations" meta={`${meetings.length} IN 48H`}>
      {meetings.length === 0 ? <p className="text-[12px]" style={{ color: "var(--hall-muted-2)" }}>No upcoming meetings in the next 48 hours.</p> : <div>{meetings.map((meeting) => <div key={meeting.id} className="flex flex-wrap items-center gap-4 py-3" style={{ borderBottom: "1px solid var(--hall-line-soft)" }}><span className="min-w-[130px] text-[10px] uppercase tracking-[0.06em]" style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted-2)" }}>{formatTime(meeting.startsAt)}</span><strong className="flex-1 text-[13px]">{meeting.title}</strong>{meeting.href && <a className="hall-btn-ghost" href={meeting.href} target="_blank" rel="noreferrer">Open ↗</a>}</div>)}</div>}
    </HallSection>
  </PortalShell>;
}
