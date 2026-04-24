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

function ScoreBadge({ score }: { score: number | null; status: string }) {
  if (score === null) {
    return (
      <span
        className="text-[9px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap"
        style={{
          fontFamily: "var(--font-hall-mono)",
          background: "var(--hall-fill-soft)",
          color: "var(--hall-muted-3)",
        }}
      >
        Not scored
      </span>
    );
  }
  if (score >= 70) {
    return (
      <span
        className="text-[9px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap tabular-nums"
        style={{
          fontFamily: "var(--font-hall-mono)",
          background: "var(--hall-ok-soft)",
          color: "var(--hall-ok)",
        }}
      >
        {score} · Qualified
      </span>
    );
  }
  if (score >= 50) {
    return (
      <span
        className="text-[9px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap tabular-nums"
        style={{
          fontFamily: "var(--font-hall-mono)",
          background: "var(--hall-warn-soft)",
          color: "var(--hall-warn)",
        }}
      >
        {score} · Review
      </span>
    );
  }
  return (
    <span
      className="text-[9px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap tabular-nums"
      style={{
        fontFamily: "var(--font-hall-mono)",
        background: "var(--hall-danger-soft)",
        color: "var(--hall-danger)",
      }}
    >
      {score} · Below
    </span>
  );
}

function StagePill({ stage }: { stage: string }) {
  return (
    <span
      className="text-[8.5px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider"
      style={{
        fontFamily: "var(--font-hall-mono)",
        background: "var(--hall-fill-soft)",
        color: "var(--hall-ink-3)",
      }}
    >
      {stage || "—"}
    </span>
  );
}

function FollowUpDot({ status }: { status: string }) {
  if (status === "Needed")  return <span className="w-1.5 h-1.5 rounded-full shrink-0" title="Follow-up needed" style={{background: "var(--hall-danger)"}} />;
  if (status === "Sent")    return <span className="w-1.5 h-1.5 rounded-full shrink-0" title="Follow-up sent" style={{background: "var(--hall-warn)"}} />;
  if (status === "Waiting") return <span className="w-1.5 h-1.5 rounded-full shrink-0" title="Waiting for reply" style={{background: "var(--hall-info)"}} />;
  return null;
}

// ── Opp list ──────────────────────────────────────────────────────────────────

function OppList({ items, emptyMsg }: { items: OppDisplayItem[]; emptyMsg: string }) {
  if (items.length === 0) {
    return (
      <div
        className="px-6 py-10 text-center"
        style={{ border: "1px solid var(--hall-line-soft)", borderRadius: 3 }}
      >
        <p className="text-sm" style={{color: "var(--hall-muted-3)"}}>{emptyMsg}</p>
      </div>
    );
  }
  return (
    <ul className="flex flex-col">
      {items.map((opp, idx) => (
        <li
          key={opp.id}
          style={idx === 0 ? undefined : { borderTop: "1px solid var(--hall-line-soft)" }}
        >
          <Link
            href={opp.notionUrl || "#"}
            target={opp.notionUrl ? "_blank" : undefined}
            rel="noopener noreferrer"
            className="group flex items-center gap-3 py-3 transition-colors"
          >
            <FollowUpDot status={opp.followUpStatus} />
            <div className="flex-1 min-w-0">
              <p className="text-[12.5px] font-bold truncate leading-tight" style={{color: "var(--hall-ink-0)"}}>{opp.name}</p>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                {opp.orgName && (
                  <span className="text-[9px] font-medium" style={{color: "var(--hall-muted-3)"}}>{opp.orgName}</span>
                )}
                {opp.type && (
                  <span
                    className="text-[8.5px] font-bold uppercase tracking-wider"
                    style={{fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted-3)"}}
                  >
                    {opp.type}
                  </span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <StagePill stage={opp.stage} />
              <ScoreBadge score={opp.score} status={opp.qualificationStatus} />
            </div>
            <span className="transition-colors text-sm" style={{color: "var(--hall-muted-3)"}}>↗</span>
          </Link>
        </li>
      ))}
    </ul>
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

  const eyebrowDate = new Date()
    .toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })
    .toUpperCase();

  return (
    <div className="flex min-h-screen" style={{ background: "var(--hall-paper-0)" }}>
      <Sidebar adminNav />

      <main
        className="flex-1 ml-[228px]"
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
              OPPORTUNITIES · <b style={{ color: "var(--hall-ink-0)" }}>{eyebrowDate}</b>
            </span>
            <h1
              className="text-[16px] font-medium tracking-[-0.01em] truncate"
              style={{ color: "var(--hall-ink-0)" }}
            >
              Opportunities <em className="hall-flourish">pipeline</em>
            </h1>
          </div>
          <div
            className="flex items-center gap-4"
            style={{ fontFamily: "var(--font-hall-mono)", fontSize: 10, color: "var(--hall-muted-2)", letterSpacing: "0.06em" }}
          >
            <span>{qualified} QUAL</span>
            <span style={{color: needsReview > 0 ? "var(--hall-warn)" : "var(--hall-muted-3)"}}>{needsReview} REVIEW</span>
            <span style={{color: followUpNeeded > 0 ? "var(--hall-danger)" : "var(--hall-muted-3)"}}>{followUpNeeded} FOLLOW-UP</span>
          </div>
        </header>

        <div className="px-9 py-6 max-w-6xl space-y-7">

          {/* Error state */}
          {error && (
            <div
              className="px-5 py-4"
              style={{ border: "1px solid var(--hall-danger)", background: "var(--hall-danger-soft)", borderRadius: 3 }}
            >
              <p
                className="text-[10px] font-bold uppercase tracking-wider mb-1"
                style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-danger)" }}
              >
                Supabase error
              </p>
              <p className="text-[10.5px]" style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-danger)" }}>{error}</p>
            </div>
          )}

          {/* Score legend */}
          <div
            className="flex items-center gap-4 text-[9px] font-bold uppercase tracking-widest"
            style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted-3)" }}
          >
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full" style={{background: "var(--hall-ok)"}} /> ≥ 70 Qualified
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full" style={{background: "var(--hall-warn)"}} /> 50–69 Needs review
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full" style={{background: "var(--hall-danger)"}} /> Follow-up needed
            </span>
            <div className="flex-1 h-px" style={{background: "var(--hall-line-soft)"}} />
            <Link href="/admin/decisions" className="hall-btn-ghost" style={{padding: 0}}>
              Open decisions →
            </Link>
          </div>

          {/* Two-column: CH | Portfolio */}
          <div className="grid grid-cols-2 gap-7 items-start">

            {/* CH column */}
            <section>
              <div
                className="flex items-baseline justify-between gap-3 pb-2 mb-3.5"
                style={{borderBottom: "1px solid var(--hall-ink-0)"}}
              >
                <h2
                  className="text-[19px] font-bold leading-none"
                  style={{letterSpacing: "-0.02em", color: "var(--hall-ink-0)"}}
                >
                  Common House <em className="hall-flourish">opps</em>
                </h2>
                <span
                  style={{fontFamily: "var(--font-hall-mono)", fontSize: 10, color: "var(--hall-muted-2)", letterSpacing: "0.06em"}}
                >
                  {chSorted.length} ACTIVE
                </span>
              </div>
              <OppList
                items={chSorted}
                emptyMsg="No active CH opportunities. Legacy and archived records excluded."
              />
            </section>

            {/* Portfolio column */}
            <section>
              <div
                className="flex items-baseline justify-between gap-3 pb-2 mb-3.5"
                style={{borderBottom: "1px solid var(--hall-ink-0)"}}
              >
                <h2
                  className="text-[19px] font-bold leading-none"
                  style={{letterSpacing: "-0.02em", color: "var(--hall-ink-0)"}}
                >
                  Portfolio <em className="hall-flourish">opps</em>
                </h2>
                <span
                  style={{fontFamily: "var(--font-hall-mono)", fontSize: 10, color: "var(--hall-muted-2)", letterSpacing: "0.06em"}}
                >
                  {portfolioSorted.length} ACTIVE
                </span>
              </div>
              <OppList
                items={portfolioSorted}
                emptyMsg="No active portfolio opportunities. Use Deal Flow or Grant Desk to identify new ones."
              />
            </section>

          </div>

          {/* Footer meta */}
          <p
            className="text-[8.5px] font-medium text-right"
            style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted-3)", letterSpacing: "0.06em" }}
          >
            {all.length} ROWS · SUPABASE · LEGACY + ARCHIVED EXCLUDED
          </p>

        </div>
      </main>
    </div>
  );
}
