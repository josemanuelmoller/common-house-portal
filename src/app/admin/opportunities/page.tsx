import Link from "next/link";
import { Sidebar } from "@/components/Sidebar";
import { getOpportunitiesByScope, OpportunityItem } from "@/lib/notion";
import { requireAdmin } from "@/lib/require-admin";

// ── Score badge ───────────────────────────────────────────────────────────────

function ScoreBadge({ score, status }: { score: number | null; status: string }) {
  if (score === null) {
    return (
      <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-[#EFEFEA] text-[#131218]/30 whitespace-nowrap">
        Not scored
      </span>
    );
  }
  if (score >= 70) {
    return (
      <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-[#B2FF59]/25 text-green-800 whitespace-nowrap tabular-nums">
        {score} · Qualified
      </span>
    );
  }
  if (score >= 50) {
    return (
      <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 whitespace-nowrap tabular-nums">
        {score} · Review
      </span>
    );
  }
  return (
    <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-red-50 text-red-600 whitespace-nowrap tabular-nums">
      {score} · Below
    </span>
  );
}

function StagePill({ stage }: { stage: string }) {
  const colours: Record<string, string> = {
    "New":           "bg-slate-100 text-slate-600",
    "Qualifying":    "bg-blue-50 text-blue-700",
    "Exploring":     "bg-blue-50 text-blue-700",
    "Active":        "bg-[#B2FF59]/20 text-green-800",
    "Proposal Sent": "bg-amber-50 text-amber-700",
    "Negotiation":   "bg-orange-50 text-orange-700",
  };
  return (
    <span className={`text-[8.5px] font-bold px-1.5 py-0.5 rounded ${colours[stage] ?? "bg-[#EFEFEA] text-[#131218]/40"}`}>
      {stage || "—"}
    </span>
  );
}

function FollowUpDot({ status }: { status: string }) {
  if (status === "Needed") return <span className="w-1.5 h-1.5 rounded-full bg-red-400 shrink-0" title="Follow-up needed" />;
  if (status === "Sent")   return <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" title="Follow-up sent" />;
  if (status === "Waiting") return <span className="w-1.5 h-1.5 rounded-full bg-blue-400 shrink-0" title="Waiting for reply" />;
  return null;
}

// ── Opp list ──────────────────────────────────────────────────────────────────

function OppList({ items, emptyMsg }: { items: OpportunityItem[]; emptyMsg: string }) {
  if (items.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-[#E0E0D8] px-6 py-10 text-center">
        <p className="text-sm text-[#131218]/25">{emptyMsg}</p>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      {items.map(opp => (
        <Link
          key={opp.id}
          href={opp.notionUrl || "#"}
          target={opp.notionUrl ? "_blank" : undefined}
          rel="noopener noreferrer"
          className="group bg-white rounded-xl border border-[#E0E0D8] px-4 py-3 hover:border-[#131218]/20 hover:-translate-y-0.5 transition-all duration-150 flex items-center gap-3"
        >
          <FollowUpDot status={opp.followUpStatus} />
          <div className="flex-1 min-w-0">
            <p className="text-[12.5px] font-bold text-[#131218] truncate leading-tight">{opp.name}</p>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              {opp.orgName && (
                <span className="text-[9px] text-[#131218]/40 font-medium">{opp.orgName}</span>
              )}
              {opp.type && (
                <span className="text-[8.5px] font-bold text-[#131218]/25 uppercase tracking-wide">{opp.type}</span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <StagePill stage={opp.stage} />
            <ScoreBadge score={opp.score} status={opp.qualificationStatus} />
          </div>
          <span className="text-[#131218]/15 group-hover:text-[#131218]/40 transition-colors text-sm">↗</span>
        </Link>
      ))}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function OpportunitiesPage() {
  await requireAdmin();

  const { ch, portfolio } = await getOpportunitiesByScope();

  // Sort by score descending (null scores last)
  const sortByScore = (a: OpportunityItem, b: OpportunityItem) => {
    if (a.score === null && b.score === null) return 0;
    if (a.score === null) return 1;
    if (b.score === null) return -1;
    return b.score - a.score;
  };

  const chSorted        = [...ch].sort(sortByScore);
  const portfolioSorted = [...portfolio].sort(sortByScore);

  const qualified = [...ch, ...portfolio].filter(o => (o.score ?? 0) >= 70).length;
  const needsReview = [...ch, ...portfolio].filter(o => (o.score ?? -1) >= 50 && (o.score ?? 0) < 70).length;
  const followUpNeeded = [...ch, ...portfolio].filter(o => o.followUpStatus === "Needed").length;

  return (
    <div className="flex min-h-screen bg-[#EFEFEA]">
      <Sidebar adminNav />

      <main className="flex-1 ml-[228px]">

        {/* Dark header */}
        <header className="bg-[#131218] px-12 pt-10 pb-11">
          <p className="text-[8px] font-bold tracking-[2.5px] uppercase text-white/20 mb-3">
            Commercial · Pipeline
          </p>
          <div className="flex items-end justify-between">
            <div>
              <h1 className="text-[2.6rem] font-light text-white tracking-[-1.5px] leading-none">
                Opportunities <em className="font-black italic text-[#c8f55a]">pipeline.</em>
              </h1>
              <p className="text-sm text-white/40 mt-3">
                Active opportunities scored ≥ 50. Split by CH and Portfolio scope.
              </p>
            </div>
            <div className="flex items-center gap-4 pb-1">
              <div className="text-right">
                <p className="text-[2rem] font-black text-[#c8f55a] tracking-tight leading-none">{qualified}</p>
                <p className="text-[9px] font-bold tracking-[1.5px] uppercase text-white/30 mt-0.5">Qualified</p>
              </div>
              <div className="w-px h-10 bg-white/10" />
              <div className="text-right">
                <p className={`text-[2rem] font-black tracking-tight leading-none ${needsReview > 0 ? "text-amber-400" : "text-white/20"}`}>
                  {needsReview}
                </p>
                <p className="text-[9px] font-bold tracking-[1.5px] uppercase text-white/30 mt-0.5">Needs review</p>
              </div>
              <div className="w-px h-10 bg-white/10" />
              <div className="text-right">
                <p className={`text-[2rem] font-black tracking-tight leading-none ${followUpNeeded > 0 ? "text-red-400" : "text-white/20"}`}>
                  {followUpNeeded}
                </p>
                <p className="text-[9px] font-bold tracking-[1.5px] uppercase text-white/30 mt-0.5">Follow-up due</p>
              </div>
            </div>
          </div>
        </header>

        <div className="px-12 py-9 max-w-6xl space-y-8">

          {/* Score legend */}
          <div className="flex items-center gap-4 text-[9px] font-bold text-[#131218]/30 uppercase tracking-widest">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-[#B2FF59]" /> ≥ 70 Qualified
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-amber-400" /> 50–69 Needs review
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-red-400" /> Follow-up needed
            </span>
            <div className="flex-1 h-px bg-[#E0E0D8]" />
            <Link href="/admin/decisions" className="hover:text-[#131218]/60 transition-colors">
              Open decisions →
            </Link>
          </div>

          {/* Two-column: CH | Portfolio */}
          <div className="grid grid-cols-2 gap-6 items-start">

            {/* CH column */}
            <div>
              <div className="flex items-center gap-3 mb-3">
                <p className="text-[9px] font-bold tracking-widest uppercase text-[#131218]/30">Common House</p>
                <div className="flex-1 h-px bg-[#E0E0D8]" />
                <span className="text-[9px] font-bold text-[#131218]/25">{chSorted.length}</span>
              </div>
              <OppList
                items={chSorted}
                emptyMsg="No active CH opportunities ≥ 50. Cues below threshold sit in the Offer System."
              />
            </div>

            {/* Portfolio column */}
            <div>
              <div className="flex items-center gap-3 mb-3">
                <p className="text-[9px] font-bold tracking-widest uppercase text-[#131218]/30">Portfolio</p>
                <div className="flex-1 h-px bg-[#E0E0D8]" />
                <span className="text-[9px] font-bold text-[#131218]/25">{portfolioSorted.length}</span>
              </div>
              <OppList
                items={portfolioSorted}
                emptyMsg="No active portfolio opportunities ≥ 50. Use Deal Flow or Grant Desk to identify new ones."
              />
            </div>

          </div>

        </div>
      </main>
    </div>
  );
}
