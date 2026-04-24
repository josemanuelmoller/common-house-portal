import Link from "next/link";
import { getSupabaseServerClient } from "@/lib/supabase-server";

/**
 * Opps going cold — ranks open opportunities by a staleness × value score
 * so Jose can see where the pipeline is quietly dying.
 *
 * Scoring heuristic (deterministic, no LLM):
 *   base           = 30
 *   days_stale²    *= 1.2                    → staleness compounds
 *   value boost    + log10(value) × 4        → bigger deals weigh more
 *   follow-up Needed + 40                    → explicit ask already parked
 *   Priority P1    + 40, P2 + 20             → user-marked urgency
 *   Done / Sent    -25                       → if waiting on them, lower the alarm
 *   Next meeting <7d  -30                   → something already scheduled
 *
 * Grants excluded — /admin/grants handles them explicitly.
 */
async function loadColdOpps(): Promise<ColdOpp[]> {
  const sb = getSupabaseServerClient();
  const { data } = await sb
    .from("opportunities")
    .select("notion_id, title, org_name, review_url, opportunity_type, status, follow_up_status, priority, value_estimate, next_meeting_at, updated_at")
    .eq("is_active", true)
    .eq("is_archived", false)
    .in("status", ["New", "Qualifying", "Active"])
    .not("opportunity_type", "eq", "Grant")
    .limit(120);

  const now = Date.now();
  const out: ColdOpp[] = [];
  for (const r of (data ?? []) as RawOpp[]) {
    const daysStale = r.updated_at ? Math.floor((now - new Date(r.updated_at).getTime()) / 86400_000) : 0;
    const daysToNextMeeting = r.next_meeting_at
      ? Math.floor((new Date(r.next_meeting_at).getTime() - now) / 86400_000)
      : null;

    const value = Number(r.value_estimate ?? 0);
    let score = 30;
    score += Math.min(50, (daysStale * daysStale) / 12);
    if (value > 0)                                 score += Math.min(35, Math.log10(value) * 4);
    if (r.follow_up_status === "Needed")           score += 40;
    if (r.follow_up_status === "Sent" || r.follow_up_status === "Waiting") score -= 25;
    if (r.follow_up_status === "Done")             score -= 30;
    if ((r.priority ?? "").startsWith("P1"))       score += 40;
    else if ((r.priority ?? "").startsWith("P2"))  score += 20;
    if (daysToNextMeeting !== null && daysToNextMeeting >= 0 && daysToNextMeeting <= 7) score -= 30;

    // Do not surface opps touched in the last 3 days unless explicitly 'Needed'.
    if (daysStale < 3 && r.follow_up_status !== "Needed") continue;

    out.push({
      id: r.notion_id,
      title: r.title,
      orgName: r.org_name,
      type: r.opportunity_type,
      status: r.status,
      followUp: r.follow_up_status,
      priority: r.priority,
      value,
      daysStale,
      daysToNextMeeting,
      reviewUrl: r.review_url,
      score,
    });
  }
  out.sort((a, b) => b.score - a.score);
  return out.slice(0, 8);
}

type RawOpp = {
  notion_id: string;
  title: string;
  org_name: string | null;
  review_url: string | null;
  opportunity_type: string | null;
  status: string;
  follow_up_status: string | null;
  priority: string | null;
  value_estimate: string | number | null;
  next_meeting_at: string | null;
  updated_at: string | null;
};

type ColdOpp = {
  id: string;
  title: string;
  orgName: string | null;
  type: string | null;
  status: string;
  followUp: string | null;
  priority: string | null;
  value: number;
  daysStale: number;
  daysToNextMeeting: number | null;
  reviewUrl: string | null;
  score: number;
};

function formatValue(v: number): string {
  if (!v)                  return "";
  if (v >= 1_000_000)      return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000)          return `$${Math.round(v / 1_000)}k`;
  return `$${v}`;
}

export async function HallOppFreshnessRadar() {
  const opps = await loadColdOpps();

  // U1 — hide widget entirely when pipeline is hot. No empty card taking up space.
  if (opps.length === 0) return null;

  return (
    <ul className="flex flex-col">
      {opps.map(o => <OppRow key={o.id} opp={o} />)}
    </ul>
  );
}

function OppRow({ opp }: { opp: ColdOpp }) {
  const ageColor = opp.daysStale >= 30 ? "var(--hall-danger)"
    : opp.daysStale >= 14 ? "var(--hall-warn)"
    : "var(--hall-muted-3)";
  return (
    <li style={{ borderTop: "1px solid var(--hall-line-soft)" }}>
      <a
        href={opp.reviewUrl ?? `https://www.notion.so/${opp.id.replace(/-/g, "")}`}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-start gap-3 py-2.5 transition-colors"
      >
        <div className="flex-1 min-w-0">
          <span
            className="block text-[12px] font-semibold truncate"
            style={{ color: "var(--hall-ink-0)" }}
          >
            {opp.title}
          </span>
          <span
            className="block text-[10.5px] mt-0.5 flex items-center gap-1.5 flex-wrap"
            style={{ color: "var(--hall-muted-2)" }}
          >
            {opp.orgName && <span>{opp.orgName}</span>}
            {opp.orgName && <span style={{ color: "var(--hall-muted-3)" }}>·</span>}
            <span>{opp.status}</span>
            {opp.priority && (
              <>
                <span style={{ color: "var(--hall-muted-3)" }}>·</span>
                <span style={{ color: opp.priority.startsWith("P1") ? "var(--hall-danger)" : undefined, fontWeight: opp.priority.startsWith("P1") ? 700 : undefined }}>
                  {opp.priority.split(" ")[0]}
                </span>
              </>
            )}
            {opp.followUp === "Needed" && (
              <>
                <span style={{ color: "var(--hall-muted-3)" }}>·</span>
                <span style={{ color: "var(--hall-warn)", fontWeight: 700 }}>follow-up needed</span>
              </>
            )}
            {opp.value > 0 && (
              <>
                <span style={{ color: "var(--hall-muted-3)" }}>·</span>
                <span className="font-semibold" style={{ color: "var(--hall-ink-3)" }}>{formatValue(opp.value)}</span>
              </>
            )}
          </span>
        </div>
        <span
          className="font-semibold shrink-0"
          style={{ fontFamily: "var(--font-hall-mono)", fontSize: 10, color: ageColor }}
        >
          {opp.daysStale}d
        </span>
      </a>
    </li>
  );
}
