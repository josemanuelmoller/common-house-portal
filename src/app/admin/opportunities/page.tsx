import Link from "next/link";
import { Sidebar } from "@/components/Sidebar";
import { requireAdmin } from "@/lib/require-admin";
import {
  fetchCleanOpportunitiesFromSupabase,
  OpportunityRowFull,
} from "@/lib/supabase-server";

// ── Local display type (decoupled from Notion) ────────────────────────────────

type OppDisplayItem = {
  id: string;
  name: string;
  orgName: string | null;
  type: string | null;
  stage: string;
  scope: string;
  followUpStatus: string;
  score: number | null;
  qualificationStatus: string;
  lastEdited: string;
  notionUrl: string;
};

function rowToDisplay(r: OpportunityRowFull): OppDisplayItem {
  return {
    id:                 r.notion_id,
    name:               r.title,
    orgName:            r.org_name ?? null,
    type:               r.opportunity_type ?? null,
    stage:              r.status ?? "New",
    scope:              r.scope ?? "CH",
    followUpStatus:     r.follow_up_status ?? "",
    score:              r.opportunity_score ?? null,
    qualificationStatus: r.qualification_status ?? "",
    lastEdited:         r.updated_at ? r.updated_at.slice(0, 10) : "",
    notionUrl:          r.review_url ?? "",
  };
}

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
  if (status === "Needed")  return <span className="w-1.5 h-1.5 rounded-full bg-red-400 shrink-0" title="Follow-up needed" />;
  if (status === "Sent")    return <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" title="Follow-up sent" />;
  if (status === "Waiting") return <span className="w-1.5 h-1.5 rounded-full bg-blue-400 shrink-0" title="Waiting for reply" />;
  return null;
}

// ── Opp list ──────────────────────────────────────────────────────────────────

function OppList({ items, emptyMsg }: { items: OppDisplayItem[]; emptyMsg: string }) {
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

  const { rows, error } = await fetchCleanOpportunitiesFromSupabase();
  const all = rows.map(rowToDisplay);

  // Scope split: anything not explicitly "Portfolio" falls into CH
  const chSorted        = all.filter(o => o.scope !== "Portfolio");
  const portfolioSorted = all.filter(o => o.scope === "Portfolio");

  const qualified      = all.filter(o => (o.score ?? 0) >= 70).length;
  const needsReview    = all.filter(o => (o.score ?? -1) >= 50 && (o.score ?? 0) < 70).length;
  const followUpNeeded = all.filter(o => o.followUpStatus === "Needed").length;

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

          {/* Error state */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl px-5 py-4">
              <p className="text-[10px] font-bold text-red-700 uppercase tracking-wider mb-1">Supabase error</p>
              <p className="text-[10.5px] text-red-600 font-mono">{error}</p>
            </div>
          )}

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
                emptyMsg="No active CH opportunities. Legacy and archived records excluded."
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
                emptyMsg="No active portfolio opportunities. Use Deal Flow or Grant Desk to identify new ones."
              />
            </div>

          </div>

          {/* Footer meta */}
          <p className="text-[8.5px] text-[#131218]/20 font-medium text-right">
            {all.length} rows · Supabase · legacy + archived excluded
          </p>

        </div>
      </main>
    </div>
  );
}
