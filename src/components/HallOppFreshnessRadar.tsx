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
    <div className="bg-white rounded-2xl border border-[#E0E0D8] overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3 border-b border-[#EFEFEA]">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold tracking-widest uppercase text-[#131218]/50">Opps going cold</span>
          <span className="text-[9px] font-bold bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full">{opps.length}</span>
        </div>
        <Link href="/admin/opportunities" className="text-[9px] font-bold tracking-widest uppercase text-[#131218]/40 hover:text-[#131218]/80">
          All opps →
        </Link>
      </div>
      <div className="divide-y divide-[#EFEFEA]">
        {opps.map(o => <OppRow key={o.id} opp={o} />)}
      </div>
    </div>
  );
}

function OppRow({ opp }: { opp: ColdOpp }) {
  const staleColor = opp.daysStale >= 30 ? "text-red-600" : opp.daysStale >= 14 ? "text-amber-700" : "text-[#131218]/60";
  return (
    <a
      href={opp.reviewUrl ?? `https://www.notion.so/${opp.id.replace(/-/g, "")}`}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-start gap-3 px-5 py-2.5 hover:bg-[#EFEFEA]/40 transition-colors"
    >
      <div className="flex-1 min-w-0">
        <p className="text-[11px] font-bold text-[#131218] truncate">{opp.title}</p>
        <p className="text-[9px] text-[#131218]/45 mt-0.5 flex items-center gap-1.5 flex-wrap">
          {opp.orgName && <span>{opp.orgName}</span>}
          {opp.orgName && <span className="text-[#131218]/20">·</span>}
          <span>{opp.status}</span>
          {opp.priority && (
            <>
              <span className="text-[#131218]/20">·</span>
              <span className={opp.priority.startsWith("P1") ? "text-red-600 font-bold" : ""}>
                {opp.priority.split(" ")[0]}
              </span>
            </>
          )}
          {opp.followUp === "Needed" && (
            <>
              <span className="text-[#131218]/20">·</span>
              <span className="text-amber-700 font-bold">follow-up needed</span>
            </>
          )}
          {opp.value > 0 && (
            <>
              <span className="text-[#131218]/20">·</span>
              <span className="font-semibold text-[#131218]/70">{formatValue(opp.value)}</span>
            </>
          )}
        </p>
      </div>
      <span className={`text-[10px] font-bold shrink-0 ${staleColor}`}>
        {opp.daysStale}d
      </span>
    </a>
  );
}
