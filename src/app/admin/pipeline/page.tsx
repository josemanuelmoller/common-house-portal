import Link from "next/link";
import { Sidebar } from "@/components/Sidebar";
import { getPipelineOpportunities, PipelineOpportunity } from "@/lib/notion";
import { requireAdmin } from "@/lib/require-admin";

export const dynamic = "force-dynamic";

// ── Sub-components ────────────────────────────────────────────────────────────

function ScoreBadge({ score }: { score: number | null }) {
  if (score === null) return <span className="text-[9px] font-bold" style={{fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted-3)"}}>—</span>;
  const bg = score >= 70
    ? "var(--hall-ok-soft)"
    : score >= 50
    ? "var(--hall-warn-soft)"
    : "var(--hall-danger-soft)";
  const fg = score >= 70
    ? "var(--hall-ok)"
    : score >= 50
    ? "var(--hall-warn)"
    : "var(--hall-danger)";
  return (
    <span
      className="text-[9px] font-bold px-1.5 py-0.5 rounded-full tabular-nums"
      style={{ fontFamily: "var(--font-hall-mono)", background: bg, color: fg }}
    >
      {score}
    </span>
  );
}

function FollowUpDot({ status }: { status: string }) {
  if (status === "Needed")  return <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{background: "var(--hall-danger)"}} title="Follow-up needed" />;
  if (status === "Sent")    return <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{background: "var(--hall-warn)"}} title="Sent" />;
  if (status === "Waiting") return <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{background: "var(--hall-info)"}} title="Waiting" />;
  return <span className="w-1.5 h-1.5 shrink-0" />;
}

function TypePill({ type }: { type: string }) {
  return (
    <span
      className="text-[7.5px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider"
      style={{ fontFamily: "var(--font-hall-mono)", background: "var(--hall-fill-soft)", color: "var(--hall-ink-3)" }}
    >
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
      className="group px-3.5 py-3 transition-all duration-150 flex flex-col gap-2"
      style={{
        background: "var(--hall-paper-0)",
        border: "1px solid var(--hall-line-soft)",
        borderRadius: 3,
      }}
    >
      <div className="flex items-start gap-2">
        <FollowUpDot status={opp.followUpStatus} />
        <p className="text-[11.5px] font-bold leading-tight flex-1 line-clamp-2" style={{color: "var(--hall-ink-0)"}}>{opp.name}</p>
        <span className="text-xs shrink-0" style={{color: "var(--hall-muted-3)"}}>↗</span>
      </div>
      <div className="flex items-center justify-between gap-2 pl-3.5">
        <div className="flex items-center gap-1.5 flex-wrap">
          {opp.orgName && <span className="text-[9px] font-medium" style={{color: "var(--hall-muted-3)"}}>{opp.orgName}</span>}
          <TypePill type={opp.type} />
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {opp.daysInStage !== null && (
            <span
              className="text-[8.5px] font-bold tabular-nums"
              style={{
                fontFamily: "var(--font-hall-mono)",
                color: opp.daysInStage > 14 ? "var(--hall-danger)" : "var(--hall-muted-3)",
              }}
            >
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
      <div
        className="flex items-baseline justify-between gap-3 pb-2"
        style={{borderBottom: "1px solid var(--hall-ink-0)"}}
      >
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full shrink-0" style={{background: accent}} />
          <h2
            className="text-[19px] font-bold leading-none"
            style={{letterSpacing: "-0.02em", color: "var(--hall-ink-0)"}}
          >
            {label}
          </h2>
        </div>
        <span
          style={{fontFamily: "var(--font-hall-mono)", fontSize: 10, color: "var(--hall-muted-2)", letterSpacing: "0.06em"}}
        >
          {items.length}
        </span>
      </div>
      {items.length === 0 ? (
        <div
          className="px-4 py-6 text-center"
          style={{ border: "1px dashed var(--hall-line-soft)", borderRadius: 3 }}
        >
          <p className="text-[10px]" style={{color: "var(--hall-muted-3)"}}>—</p>
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

  // Live read — replaces the DUMMY_* arrays that were rendering fake
  // opportunities in production. getPipelineOpportunities already returns
  // the four buckets pre-shaped; on failure we degrade to empty (the
  // KanbanCol empty-state renders "—" instead of crashing the page).
  let active: PipelineOpportunity[] = [];
  let proposalSent: PipelineOpportunity[] = [];
  let negotiation: PipelineOpportunity[] = [];
  let recentlyClosed: PipelineOpportunity[] = [];
  try {
    const data = await getPipelineOpportunities();
    active = data.active;
    proposalSent = data.proposalSent;
    negotiation = data.negotiation;
    recentlyClosed = data.recentlyClosed;
  } catch (e) {
    console.error("[admin/pipeline] getPipelineOpportunities failed:", e);
  }

  const total   = active.length + proposalSent.length + negotiation.length;
  const wonCount  = recentlyClosed.filter(o => o.stage === "Won").length;
  const lostCount = recentlyClosed.filter(o => o.stage === "Lost").length;

  const eyebrowDate = new Date()
    .toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })
    .toUpperCase();

  return (
    <div className="flex min-h-screen" style={{ background: "var(--hall-paper-0)" }}>
      <Sidebar adminNav />

      <main
        className="flex-1 md:ml-[228px]"
        style={{ fontFamily: "var(--font-hall-sans)", background: "var(--hall-paper-0)" }}
      >

        {/* K-v2 collapsed header */}
        <header
          className="flex items-center justify-between gap-6 px-9 py-3.5"
          style={{ borderBottom: "1px solid var(--hall-ink-0)" }}
        >
          <div className="flex items-baseline gap-4 min-w-0">
            <span
              className="text-[10px] tracking-[0.08em] whitespace-nowrap"
              style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted-2)" }}
            >
              PIPELINE · <b style={{ color: "var(--hall-ink-0)" }}>{eyebrowDate}</b>
            </span>
            <h1
              className="text-[16px] font-medium tracking-[-0.01em] truncate"
              style={{ color: "var(--hall-ink-0)" }}
            >
              Commercial <em className="hall-flourish">pipeline</em>
            </h1>
          </div>
          <div
            className="flex items-center gap-4"
            style={{ fontFamily: "var(--font-hall-mono)", fontSize: 10, color: "var(--hall-muted-2)", letterSpacing: "0.06em" }}
          >
            <span>{total} IN PURSUIT</span>
            <span style={{color: wonCount > 0 ? "var(--hall-ok)" : "var(--hall-muted-3)"}}>{wonCount} WON (30d)</span>
            <span style={{color: lostCount > 0 ? "var(--hall-danger)" : "var(--hall-muted-3)"}}>{lostCount} LOST (30d)</span>
          </div>
        </header>

        <div className="px-9 py-6 max-w-6xl space-y-8">

          {/* Kanban */}
          <div className="grid grid-cols-3 gap-5 items-start">
            <KanbanCol label="Active"        items={active}       accent="var(--hall-ok)" />
            <KanbanCol label="Proposal Sent" items={proposalSent} accent="var(--hall-warn)" />
            <KanbanCol label="Negotiation"   items={negotiation}  accent="var(--hall-info)" />
          </div>

          {/* Recently closed */}
          {recentlyClosed.length > 0 && (
            <section>
              <div
                className="flex items-baseline justify-between gap-3 pb-2 mb-3.5"
                style={{borderBottom: "1px solid var(--hall-ink-0)"}}
              >
                <h2
                  className="text-[19px] font-bold leading-none"
                  style={{letterSpacing: "-0.02em", color: "var(--hall-ink-0)"}}
                >
                  Recently <em className="hall-flourish">closed</em>
                </h2>
                <span
                  style={{fontFamily: "var(--font-hall-mono)", fontSize: 10, color: "var(--hall-muted-2)", letterSpacing: "0.06em"}}
                >
                  LAST 30 DAYS
                </span>
              </div>
              <ul className="flex flex-col">
                {recentlyClosed.map((opp, idx) => (
                  <li
                    key={opp.id}
                    style={idx === 0 ? undefined : { borderTop: "1px solid var(--hall-line-soft)" }}
                  >
                    <Link
                      href={opp.notionUrl || "#"}
                      target={opp.notionUrl && opp.notionUrl !== "#" ? "_blank" : undefined}
                      rel="noopener noreferrer"
                      className="group flex items-center gap-3 py-2.5 transition-colors"
                    >
                      <span
                        className="text-[8px] font-bold px-2 py-0.5 rounded-full"
                        style={{
                          fontFamily: "var(--font-hall-mono)",
                          letterSpacing: "0.06em",
                          background: opp.stage === "Won" ? "var(--hall-ok-soft)" : "var(--hall-danger-soft)",
                          color: opp.stage === "Won" ? "var(--hall-ok)" : "var(--hall-danger)",
                        }}
                      >
                        {opp.stage === "Won" ? "WON → WORKROOM" : "LOST"}
                      </span>
                      <p className="text-[11px] font-semibold flex-1 truncate" style={{color: "var(--hall-muted-2)"}}>{opp.name}</p>
                      <span className="text-[9px]" style={{color: "var(--hall-muted-3)"}}>{opp.orgName}</span>
                      <ScoreBadge score={opp.score} />
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

        </div>
      </main>
    </div>
  );
}
