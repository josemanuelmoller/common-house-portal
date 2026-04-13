import Link from "next/link";
import { Sidebar } from "@/components/Sidebar";
import { getPipelineOpportunities, PipelineOpportunity } from "@/lib/notion";
import { requireAdmin } from "@/lib/require-admin";

// ── Dummy data for UI testing ─────────────────────────────────────────────────
const DUMMY_ACTIVE: PipelineOpportunity[] = [
  { id: "a1", name: "Retail Refill — Co-op", orgName: "Co-op", type: "CH Sale", stage: "Active", scope: "CH", followUpStatus: "Needed", score: 59, qualificationStatus: "Needs Review", lastEdited: "2026-04-10", notionUrl: "#", daysInStage: 8 },
  { id: "a2", name: "ZWF Forum 2026 — Strategy", orgName: "Zero Waste Forum", type: "Partnership", stage: "Active", scope: "CH", followUpStatus: "Waiting", score: 74, qualificationStatus: "Qualified", lastEdited: "2026-04-11", notionUrl: "#", daysInStage: 3 },
  { id: "a3", name: "SUFI — Fair4All Finance", orgName: "SUFI", type: "Grant", stage: "Active", scope: "Portfolio", followUpStatus: "Needed", score: 71, qualificationStatus: "Qualified", lastEdited: "2026-04-12", notionUrl: "#", daysInStage: 1 },
];
const DUMMY_PROPOSAL: PipelineOpportunity[] = [
  { id: "p1", name: "Waitrose Refill Pilot", orgName: "Waitrose", type: "CH Sale", stage: "Proposal Sent", scope: "CH", followUpStatus: "Sent", score: 53, qualificationStatus: "Needs Review", lastEdited: "2026-04-07", notionUrl: "#", daysInStage: 6 },
  { id: "p2", name: "Beeok — Series A (Circularity Capital)", orgName: "Beeok", type: "Investor Match", stage: "Proposal Sent", scope: "Portfolio", followUpStatus: "Waiting", score: 88, qualificationStatus: "Qualified", lastEdited: "2026-04-09", notionUrl: "#", daysInStage: 4 },
];
const DUMMY_NEGOTIATION: PipelineOpportunity[] = [
  { id: "n1", name: "LIFE Programme — ENV-CIR Call", orgName: "European Commission", type: "Grant", stage: "Negotiation", scope: "CH", followUpStatus: "None", score: 82, qualificationStatus: "Qualified", lastEdited: "2026-04-12", notionUrl: "#", daysInStage: 2 },
];
const DUMMY_CLOSED: PipelineOpportunity[] = [
  { id: "c1", name: "Auto Mercado Fase 2", orgName: "Auto Mercado", type: "CH Sale", stage: "Won", scope: "CH", followUpStatus: "None", score: 91, qualificationStatus: "Qualified", lastEdited: "2026-04-05", notionUrl: "#", daysInStage: null },
  { id: "c2", name: "COP31 Activation Brief", orgName: "UNFCCC", type: "Partnership", stage: "Lost", scope: "CH", followUpStatus: "None", score: 44, qualificationStatus: "Needs Review", lastEdited: "2026-04-03", notionUrl: "#", daysInStage: null },
];

// ── Sub-components ────────────────────────────────────────────────────────────

function ScoreBadge({ score }: { score: number | null }) {
  if (score === null) return <span className="text-[9px] font-bold text-[#131218]/20">—</span>;
  const cls = score >= 70
    ? "bg-[#B2FF59]/25 text-green-800"
    : score >= 50
    ? "bg-amber-100 text-amber-800"
    : "bg-red-50 text-red-600";
  return <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full tabular-nums ${cls}`}>{score}</span>;
}

function FollowUpDot({ status }: { status: string }) {
  if (status === "Needed")  return <span className="w-1.5 h-1.5 rounded-full bg-red-400 shrink-0" title="Follow-up needed" />;
  if (status === "Sent")    return <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" title="Sent" />;
  if (status === "Waiting") return <span className="w-1.5 h-1.5 rounded-full bg-blue-400 shrink-0" title="Waiting" />;
  return <span className="w-1.5 h-1.5 shrink-0" />;
}

function TypePill({ type }: { type: string }) {
  const colours: Record<string, string> = {
    "CH Sale":       "bg-[#131218]/8 text-[#131218]/50",
    "Grant":         "bg-[#B2FF59]/15 text-green-800",
    "Partnership":   "bg-blue-50 text-blue-700",
    "Investor Match":"bg-purple-50 text-purple-700",
  };
  return (
    <span className={`text-[7.5px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wide ${colours[type] ?? "bg-[#EFEFEA] text-[#131218]/40"}`}>
      {type}
    </span>
  );
}

function OppCard({ opp }: { opp: PipelineOpportunity }) {
  return (
    <Link
      href={opp.notionUrl || "#"}
      target={opp.notionUrl && opp.notionUrl !== "#" ? "_blank" : undefined}
      rel="noopener noreferrer"
      className="group bg-white rounded-xl border border-[#E0E0D8] px-3.5 py-3 hover:border-[#131218]/20 hover:-translate-y-0.5 transition-all duration-150 flex flex-col gap-2"
    >
      <div className="flex items-start gap-2">
        <FollowUpDot status={opp.followUpStatus} />
        <p className="text-[11.5px] font-bold text-[#131218] leading-tight flex-1 line-clamp-2">{opp.name}</p>
        <span className="text-[#131218]/15 group-hover:text-[#131218]/40 transition-colors text-xs shrink-0">↗</span>
      </div>
      <div className="flex items-center justify-between gap-2 pl-3.5">
        <div className="flex items-center gap-1.5 flex-wrap">
          {opp.orgName && <span className="text-[9px] text-[#131218]/35 font-medium">{opp.orgName}</span>}
          <TypePill type={opp.type} />
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {opp.daysInStage !== null && (
            <span className={`text-[8.5px] font-bold ${opp.daysInStage > 14 ? "text-red-400" : "text-[#131218]/25"}`}>
              {opp.daysInStage}d
            </span>
          )}
          <ScoreBadge score={opp.score} />
        </div>
      </div>
    </Link>
  );
}

function KanbanCol({ label, items, accent }: { label: string; items: PipelineOpportunity[]; accent: string }) {
  return (
    <div className="flex flex-col gap-3 min-w-0">
      <div className="flex items-center gap-2">
        <span className={`w-2 h-2 rounded-full shrink-0 ${accent}`} />
        <p className="text-[9px] font-bold tracking-widest uppercase text-[#131218]/40">{label}</p>
        <div className="flex-1 h-px bg-[#E0E0D8]" />
        <span className="text-[9px] font-bold text-[#131218]/25">{items.length}</span>
      </div>
      {items.length === 0 ? (
        <div className="bg-white/60 rounded-xl border border-dashed border-[#E0E0D8] px-4 py-6 text-center">
          <p className="text-[10px] text-[#131218]/20">—</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {items.map(opp => <OppCard key={opp.id} opp={opp} />)}
        </div>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function PipelinePage() {
  await requireAdmin();

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _live = await getPipelineOpportunities();
  // TODO: replace with live data once Opportunity Score field is populated in Notion
  const active       = DUMMY_ACTIVE;
  const proposalSent = DUMMY_PROPOSAL;
  const negotiation  = DUMMY_NEGOTIATION;
  const recentlyClosed = DUMMY_CLOSED;

  const total   = active.length + proposalSent.length + negotiation.length;
  const wonCount  = recentlyClosed.filter(o => o.stage === "Won").length;
  const lostCount = recentlyClosed.filter(o => o.stage === "Lost").length;

  return (
    <div className="flex min-h-screen bg-[#EFEFEA]">
      <Sidebar adminNav />

      <main className="flex-1 ml-[228px]">

        {/* Dark header */}
        <header className="bg-[#131218] px-12 pt-10 pb-11">
          <p className="text-[8px] font-bold tracking-[2.5px] uppercase text-white/20 mb-3">
            Commercial · Pursuit
          </p>
          <div className="flex items-end justify-between">
            <div>
              <h1 className="text-[2.6rem] font-light text-white tracking-[-1.5px] leading-none">
                Commercial <em className="font-black italic text-[#c8f55a]">Pipeline.</em>
              </h1>
              <p className="text-sm text-white/40 mt-3">
                Opportunities in active pursuit. Won → Workroom. Lost → out.
              </p>
            </div>
            <div className="flex items-center gap-4 pb-1">
              <div className="text-right">
                <p className="text-[2rem] font-black text-white tracking-tight leading-none">{total}</p>
                <p className="text-[9px] font-bold tracking-[1.5px] uppercase text-white/30 mt-0.5">In pursuit</p>
              </div>
              <div className="w-px h-10 bg-white/10" />
              <div className="text-right">
                <p className={`text-[2rem] font-black tracking-tight leading-none ${wonCount > 0 ? "text-[#c8f55a]" : "text-white/20"}`}>
                  {wonCount}
                </p>
                <p className="text-[9px] font-bold tracking-[1.5px] uppercase text-white/30 mt-0.5">Won (30d)</p>
              </div>
              <div className="w-px h-10 bg-white/10" />
              <div className="text-right">
                <p className={`text-[2rem] font-black tracking-tight leading-none ${lostCount > 0 ? "text-red-400" : "text-white/20"}`}>
                  {lostCount}
                </p>
                <p className="text-[9px] font-bold tracking-[1.5px] uppercase text-white/30 mt-0.5">Lost (30d)</p>
              </div>
            </div>
          </div>
        </header>

        <div className="px-12 py-9 max-w-6xl space-y-8">

          {/* Kanban */}
          <div className="grid grid-cols-3 gap-5 items-start">
            <KanbanCol label="Active"        items={active}       accent="bg-[#B2FF59]" />
            <KanbanCol label="Proposal Sent" items={proposalSent} accent="bg-amber-400" />
            <KanbanCol label="Negotiation"   items={negotiation}  accent="bg-orange-400" />
          </div>

          {/* Recently closed */}
          {recentlyClosed.length > 0 && (
            <div>
              <div className="flex items-center gap-3 mb-3">
                <p className="text-[9px] font-bold tracking-widest uppercase text-[#131218]/25">Recently closed (30d)</p>
                <div className="flex-1 h-px bg-[#E0E0D8]" />
              </div>
              <div className="flex flex-col gap-2">
                {recentlyClosed.map(opp => (
                  <Link
                    key={opp.id}
                    href={opp.notionUrl || "#"}
                    target={opp.notionUrl && opp.notionUrl !== "#" ? "_blank" : undefined}
                    rel="noopener noreferrer"
                    className="group bg-white/60 rounded-xl border border-[#E0E0D8] px-4 py-2.5 flex items-center gap-3 hover:bg-white transition-colors"
                  >
                    <span className={`text-[8px] font-bold px-2 py-0.5 rounded-full ${opp.stage === "Won" ? "bg-[#B2FF59]/30 text-green-800" : "bg-red-50 text-red-500"}`}>
                      {opp.stage === "Won" ? "WON → Workroom" : "LOST"}
                    </span>
                    <p className="text-[11px] font-semibold text-[#131218]/50 flex-1 truncate">{opp.name}</p>
                    <span className="text-[9px] text-[#131218]/25">{opp.orgName}</span>
                    <ScoreBadge score={opp.score} />
                  </Link>
                ))}
              </div>
            </div>
          )}

        </div>
      </main>
    </div>
  );
}
