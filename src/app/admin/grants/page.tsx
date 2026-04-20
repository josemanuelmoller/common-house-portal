import Link from "next/link";
import { Sidebar } from "@/components/Sidebar";
import { notion, DB, getDecisionItems } from "@/lib/notion";
import { requireAdmin } from "@/lib/require-admin";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { GrantFollowButton } from "@/components/GrantFollowButton";

// ─── Types ───────────────────────────────────────────────────────────────────

interface GrantOpportunity {
  id: string;
  notionUrl: string;
  name: string;
  funder: string;
  program: string;
  startup: string;
  status: string;
  statusLabel: string;
  priority: string;   // "P1" | "P2" | "P3" | "P4" | ""
  orgId: string;
  isFollowed: boolean;
  followedAt: string | null;
  unfollowReason: string | null;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function titleOf(page: any): string {
  for (const val of Object.values(page.properties ?? {}) as any[]) {
    if (val?.type === "title" && val?.title?.[0]?.plain_text) {
      return val.title[0].plain_text;
    }
  }
  return "Untitled";
}

function parseOpportunityName(name: string): { program: string; startup: string } {
  const stripped = name.replace(/^Grant\s*—\s*/i, "");
  const midDot = stripped.lastIndexOf("·");
  if (midDot !== -1) {
    return { program: stripped.slice(0, midDot).trim(), startup: stripped.slice(midDot + 1).trim() };
  }
  const dashIdx = stripped.lastIndexOf(" — ");
  if (dashIdx !== -1) {
    return { program: stripped.slice(0, dashIdx).trim(), startup: stripped.slice(dashIdx + 3).trim() };
  }
  return { program: stripped, startup: "" };
}

const STATUS_LABEL: Record<string, string> = {
  "New": "New", "Qualifying": "Qualifying", "Active": "Active", "Stalled": "Stalled",
};

const PRIORITY_SHORT: Record<string, string> = {
  "P1 — Act Now": "P1", "P2 — This Quarter": "P2", "P3 — Backlog": "P3", "P4 — Watch": "P4",
};

const STATUS_COLOR: Record<string, string> = {
  "Qualifying": "bg-[#B2FF59]/20 text-green-800",
  "Active":     "bg-[#B2FF59]/20 text-green-800",
  "New":        "bg-[#131218]/6 text-[#131218]/50",
  "Stalled":    "bg-amber-100 text-amber-700",
};

const PRIORITY_COLOR: Record<string, string> = {
  "P1": "bg-red-100 text-red-700",
  "P2": "bg-amber-100 text-amber-700",
  "P3": "bg-[#131218]/6 text-[#131218]/40",
  "P4": "bg-[#131218]/6 text-[#131218]/30",
};

// ─── Data fetching ────────────────────────────────────────────────────────────

async function getGrantOpportunities(): Promise<GrantOpportunity[]> {
  const res = await notion.databases.query({
    database_id: DB.opportunities,
    filter: {
      and: [
        { property: "Opportunity Type", select: { equals: "Grant" } },
        { property: "Opportunity Status", select: { does_not_equal: "Closed Lost" } },
        { property: "Opportunity Status", select: { does_not_equal: "Closed Won" } },
      ],
    },
    sorts: [
      { property: "Priority", direction: "ascending" },
      { timestamp: "last_edited_time", direction: "descending" },
    ],
    page_size: 50,
  });

  // Resolve org names
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const orgIds = [...new Set((res.results as any[])
    .map(p => p.properties["Account / Organization"]?.relation?.[0]?.id)
    .filter(Boolean)
  )];
  const orgNames: Record<string, string> = {};
  await Promise.all(orgIds.map(async (id) => {
    try {
      const page = await notion.pages.retrieve({ page_id: id as string });
      orgNames[id as string] = titleOf(page);
    } catch { /* skip */ }
  }));

  // Pull follow state from Supabase (source of truth for human activation).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pageIds = (res.results as any[]).map(p => p.id);
  const followState: Record<string, { is_followed: boolean; followed_at: string | null; unfollow_reason: string | null }> = {};
  try {
    const sb = getSupabaseServerClient();
    const { data } = await sb
      .from("opportunities")
      .select("notion_id, is_followed, followed_at, unfollow_reason")
      .in("notion_id", pageIds);
    for (const row of (data ?? []) as { notion_id: string; is_followed: boolean | null; followed_at: string | null; unfollow_reason: string | null }[]) {
      followState[row.notion_id] = {
        is_followed:     row.is_followed === true,
        followed_at:     row.followed_at,
        unfollow_reason: row.unfollow_reason,
      };
    }
  } catch { /* supabase unavailable — treat all as not followed */ }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (res.results as any[]).map((page) => {
    const props = page.properties;
    const name    = titleOf(page);
    const parsed  = parseOpportunityName(name);
    const status  = props["Opportunity Status"]?.select?.name ?? "New";
    const priority = props["Priority"]?.select?.name ?? "";
    const orgId   = props["Account / Organization"]?.relation?.[0]?.id ?? "";
    const fs      = followState[page.id];
    return {
      id: page.id,
      notionUrl: page.url ?? "",
      name,
      funder: orgNames[orgId] ?? parsed.program,
      program: parsed.program,
      startup: parsed.startup,
      status,
      statusLabel: STATUS_LABEL[status] ?? status,
      priority: PRIORITY_SHORT[priority] ?? priority,
      orgId,
      isFollowed:     fs?.is_followed ?? false,
      followedAt:     fs?.followed_at ?? null,
      unfollowReason: fs?.unfollow_reason ?? null,
    };
  });
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function GrantsPage() {
  await requireAdmin();

  const [grants, decisions] = await Promise.all([
    getGrantOpportunities(),
    getDecisionItems(),
  ]);

  const grantDecisions = decisions.filter(d => d.category === "Grants");
  const urgentGrants   = grants.filter(g => g.priority === "P1");
  const followedGrants = grants.filter(g => g.isFollowed);
  const p1Decisions    = grantDecisions.filter(d =>
    d.priority === "P1" || d.priority === "P1 Critical" || d.priority === "Urgent"
  );
  const withDeadlines  = grantDecisions.filter(d => d.dueDate);

  return (
    <div className="flex min-h-screen bg-[#EFEFEA]">
      <Sidebar adminNav />

      <main className="flex-1 ml-[228px]">

        {/* Dark header */}
        <header className="bg-[#131218] px-12 pt-10 pb-11">
          <p className="text-[8px] font-bold tracking-[2.5px] uppercase text-white/20 mb-3">
            Commercial · Funding
          </p>
          <div className="flex items-end justify-between">
            <div>
              <h1 className="text-[2.6rem] font-light text-white tracking-[-1.5px] leading-none">
                Grants <em className="font-black italic text-[#c8f55a]">Desk</em>
              </h1>
              <p className="text-sm text-white/40 mt-3">
                Grant pipeline — funder, program, startup fit and application status.
              </p>
            </div>
            <div className="flex items-center gap-4 pb-1">
              <div className="text-right">
                <p className="text-[2rem] font-black text-white tracking-tight leading-none">{grants.length}</p>
                <p className="text-[9px] font-bold tracking-[1.5px] uppercase text-white/30 mt-0.5">Active</p>
              </div>
              {urgentGrants.length > 0 && (
                <>
                  <div className="w-px h-10 bg-white/10" />
                  <div className="text-right">
                    <p className="text-[2rem] font-black text-red-400 tracking-tight leading-none">{urgentGrants.length}</p>
                    <p className="text-[9px] font-bold tracking-[1.5px] uppercase text-white/30 mt-0.5">P1 urgent</p>
                  </div>
                </>
              )}
            </div>
          </div>
        </header>

        <div className="px-12 py-9 max-w-6xl space-y-6">

          {/* P1 banner */}
          {(p1Decisions.length > 0 || withDeadlines.length > 0) && (
            <div className="flex items-center gap-3 bg-red-50 border border-red-200 rounded-xl px-5 py-3.5">
              <span className="w-2 h-2 rounded-full bg-red-500 shrink-0 animate-pulse" />
              <p className="text-sm text-[#131218] flex-1 min-w-0">
                {p1Decisions.length > 0 && (
                  <><strong>{p1Decisions.length} urgent decision{p1Decisions.length !== 1 ? "s" : ""}</strong>{" — "}{p1Decisions[0].title}</>
                )}
                {withDeadlines.length > 0 && (
                  <>{p1Decisions.length > 0 ? " · " : ""}
                  <strong>{withDeadlines.length} deadline{withDeadlines.length !== 1 ? "s" : ""}</strong>
                  {" — "}{withDeadlines[0].title}{withDeadlines[0].dueDate ? ` closes ${new Date(withDeadlines[0].dueDate).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}` : ""}</>
                )}
              </p>
              <Link href="/admin/decisions" className="text-[11px] font-bold text-red-600 shrink-0 hover:text-red-800 transition-colors whitespace-nowrap">
                Review →
              </Link>
            </div>
          )}

          {/* Stats row */}
          <div className="grid grid-cols-4 gap-4">
            <div className="bg-white rounded-2xl border border-[#E0E0D8] px-5 py-4">
              <p className="text-[9px] font-bold tracking-widest uppercase text-[#131218]/30 mb-2">Grant pipeline</p>
              <p className="text-3xl font-bold text-[#131218] tracking-tight">{grants.length}</p>
              <p className="text-[11px] text-[#131218]/40 font-medium mt-1.5">Active opportunities</p>
            </div>
            <div className="bg-white rounded-2xl border border-[#E0E0D8] px-5 py-4">
              <p className="text-[9px] font-bold tracking-widest uppercase text-[#131218]/30 mb-2">Following</p>
              {followedGrants.length > 0
                ? <p className="text-3xl font-bold text-green-600 tracking-tight">{followedGrants.length}</p>
                : <p className="text-3xl font-bold text-[#131218]/15 tracking-tight">0</p>
              }
              <p className="text-[11px] text-[#131218]/40 font-medium mt-1.5">In Hall / Suggested Blocks</p>
            </div>
            <div className="bg-white rounded-2xl border border-[#E0E0D8] px-5 py-4">
              <p className="text-[9px] font-bold tracking-widest uppercase text-[#131218]/30 mb-2">P1 — Act Now</p>
              {urgentGrants.length > 0
                ? <p className="text-3xl font-bold text-red-500 tracking-tight">{urgentGrants.length}</p>
                : <p className="text-3xl font-bold text-[#131218]/15 tracking-tight">0</p>
              }
              <p className="text-[11px] text-[#131218]/40 font-medium mt-1.5">Require immediate action</p>
            </div>
            <div className="bg-white rounded-2xl border border-[#E0E0D8] px-5 py-4">
              <p className="text-[9px] font-bold tracking-widest uppercase text-[#131218]/30 mb-2">Open decisions</p>
              {grantDecisions.length > 0
                ? <p className="text-3xl font-bold text-amber-500 tracking-tight">{grantDecisions.length}</p>
                : <p className="text-3xl font-bold text-[#131218]/15 tracking-tight">0</p>
              }
              <p className="text-[11px] text-[#131218]/40 font-medium mt-1.5">Approvals / inputs pending</p>
            </div>
          </div>

          {/* Activation model notice */}
          <div className="bg-white rounded-2xl border border-[#E0E0D8] px-5 py-3.5">
            <p className="text-[11px] text-[#131218]/60 leading-snug">
              <strong className="text-[#131218]">Grants are passive by default.</strong>{" "}
              System-discovered grants stay here until you <em>Follow</em> one. Only followed grants enter the Hall,
              Suggested Time Blocks and Chief-of-Staff. Unfollow or Dismiss to suppress re-surfacing.
            </p>
          </div>

          {/* Pipeline table + decisions side panel */}
          <div className="grid grid-cols-[1fr_320px] gap-6 items-start">

            {/* Grant opportunity pipeline table */}
            <div className="bg-white rounded-2xl border border-[#E0E0D8] overflow-hidden">
              <div className="flex items-center justify-between px-5 py-3.5 border-b border-[#EFEFEA]">
                <div className="flex items-center gap-2">
                  <div className="w-5 h-5 rounded-md bg-[#B2FF59] flex items-center justify-center">
                    <svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="#000" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                    </svg>
                  </div>
                  <span className="text-[11px] font-bold text-[#131218]/60 tracking-wide">Grant pipeline</span>
                </div>
                <a
                  href="https://www.notion.so/687caa98594a41b595c9960c141be0c0"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[9px] font-bold text-[#131218]/30 hover:text-[#131218]/60 transition-colors uppercase tracking-widest"
                >
                  Open in Notion →
                </a>
              </div>

              {grants.length === 0 ? (
                <div className="px-5 py-10 text-center">
                  <p className="text-sm text-[#131218]/25">No active grant opportunities.</p>
                </div>
              ) : (
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b border-[#EFEFEA]">
                      {["Funder / Program", "Status", "Priority", "For", "Activation"].map(h => (
                        <th key={h} className="px-4 py-2.5 text-[8.5px] font-bold tracking-widest uppercase text-[#131218]/25 first:pl-5 last:pr-5">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#EFEFEA]">
                    {[...grants].sort((a, b) => Number(b.isFollowed) - Number(a.isFollowed)).map(g => (
                      <tr key={g.id} className={`hover:bg-[#EFEFEA]/40 transition-colors group ${g.isFollowed ? "bg-[#B2FF59]/5" : ""}`}>
                        <td className="pl-5 pr-4 py-3.5">
                          <div className="flex items-center gap-2">
                            <p className="text-[12px] font-bold text-[#131218] leading-tight">{g.funder || g.program}</p>
                            {g.isFollowed && (
                              <span className="inline-flex items-center gap-1 text-[8px] font-bold px-1.5 py-0.5 rounded bg-[#B2FF59]/30 text-green-900" title="Explicitly followed by Jose">
                                <span className="w-1 h-1 rounded-full bg-green-600" />
                                FOLLOWING
                              </span>
                            )}
                          </div>
                          {g.program && g.program !== g.funder && (
                            <p className="text-[10px] text-[#131218]/40 mt-0.5 font-medium">{g.program}</p>
                          )}
                          {!g.isFollowed && g.unfollowReason && (
                            <p className="text-[9px] text-[#131218]/30 mt-0.5 italic" title="Dismiss reason">
                              Dismissed: {g.unfollowReason}
                            </p>
                          )}
                        </td>
                        <td className="px-4 py-3.5">
                          <span className={`inline-flex text-[9px] font-bold px-2 py-0.5 rounded-full ${STATUS_COLOR[g.status] ?? "bg-[#131218]/6 text-[#131218]/40"}`}>
                            {g.statusLabel}
                          </span>
                        </td>
                        <td className="px-4 py-3.5">
                          {g.priority ? (
                            <span className={`inline-flex text-[9px] font-bold px-2 py-0.5 rounded-full ${PRIORITY_COLOR[g.priority] ?? "bg-[#131218]/6 text-[#131218]/40"}`}>
                              {g.priority}
                            </span>
                          ) : (
                            <span className="text-[10px] text-[#131218]/20">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3.5">
                          <span className="text-[10px] font-semibold text-[#131218]/50">
                            {g.startup || "—"}
                          </span>
                        </td>
                        <td className="px-4 py-3.5 pr-5">
                          <GrantFollowButton opportunityId={g.id} initialFollowed={g.isFollowed} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* Grant decisions */}
            <div>
              <div className="flex items-center gap-3 mb-3">
                <p className="text-[9px] font-bold tracking-widest uppercase text-[#131218]/30">Open decisions</p>
                <div className="flex-1 h-px bg-[#E0E0D8]" />
                {grantDecisions.length > 0 && (
                  <span className="text-[9px] font-bold bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">{grantDecisions.length}</span>
                )}
              </div>

              <div className="bg-white rounded-2xl border border-[#E0E0D8] overflow-hidden">
                <div className="divide-y divide-[#EFEFEA]">
                  {grantDecisions.slice(0, 8).map(d => (
                    <Link key={d.id} href="/admin/decisions" className="flex items-start gap-3 px-4 py-3 hover:bg-[#EFEFEA]/40 transition-colors">
                      <div className={`w-5 h-5 rounded-md flex items-center justify-center shrink-0 mt-0.5 ${
                        d.priority === "P1" || d.priority === "P1 Critical" || d.priority === "Urgent"
                          ? "bg-red-100" : "bg-[#EFEFEA]"
                      }`}>
                        <span className={`text-[8px] font-bold ${
                          d.priority === "P1" || d.priority === "P1 Critical" || d.priority === "Urgent"
                            ? "text-red-600" : "text-[#131218]/30"
                        }`}>
                          {d.priority?.startsWith("P1") || d.priority === "Urgent" ? "P1" : "·"}
                        </span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[11px] font-semibold text-[#131218] leading-snug line-clamp-2">{d.title}</p>
                        <p className="text-[9px] text-[#131218]/35 mt-0.5">
                          {d.decisionType || "Decision"}
                          {d.dueDate && ` · Closes ${new Date(d.dueDate).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`}
                        </p>
                      </div>
                    </Link>
                  ))}
                  {grantDecisions.length === 0 && (
                    <div className="px-4 py-6 text-center">
                      <p className="text-[11px] text-[#131218]/25 font-medium">No open grant decisions</p>
                    </div>
                  )}
                </div>
                <div className="px-4 py-2.5 border-t border-[#EFEFEA]">
                  <Link href="/admin/decisions" className="text-[9px] font-bold text-[#131218]/30 hover:text-[#131218]/60 transition-colors uppercase tracking-widest">
                    All decisions →
                  </Link>
                </div>
              </div>
            </div>

          </div>
        </div>
      </main>
    </div>
  );
}
