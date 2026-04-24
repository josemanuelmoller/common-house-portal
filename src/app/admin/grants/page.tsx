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

// ─── Pill helpers ──────────────────────────────────────────────────────────────

function statusStyle(status: string): { bg: string; color: string } {
  if (status === "Qualifying" || status === "Active") return { bg: "var(--hall-ok-soft)", color: "var(--hall-ok)" };
  if (status === "Stalled")                           return { bg: "var(--hall-warn-soft)", color: "var(--hall-warn)" };
  return { bg: "var(--hall-fill-soft)", color: "var(--hall-muted-2)" };
}

function priorityStyle(p: string): { bg: string; color: string } {
  if (p === "P1") return { bg: "var(--hall-danger-soft)", color: "var(--hall-danger)" };
  if (p === "P2") return { bg: "var(--hall-warn-soft)", color: "var(--hall-warn)" };
  return { bg: "var(--hall-fill-soft)", color: "var(--hall-muted-3)" };
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
              GRANTS · <b style={{ color: "var(--hall-ink-0)" }}>{eyebrowDate}</b>
            </span>
            <h1
              className="text-[16px] font-medium tracking-[-0.01em] truncate"
              style={{ color: "var(--hall-ink-0)" }}
            >
              Grants <em className="hall-flourish">Desk</em>
            </h1>
          </div>
          <div
            className="flex items-center gap-4"
            style={{ fontFamily: "var(--font-hall-mono)", fontSize: 10, color: "var(--hall-muted-2)", letterSpacing: "0.06em" }}
          >
            <span>{grants.length} ACTIVE</span>
            {urgentGrants.length > 0 && (
              <span style={{color: "var(--hall-danger)"}}>{urgentGrants.length} P1</span>
            )}
          </div>
        </header>

        <div className="px-9 py-6 max-w-6xl space-y-7">

          {/* P1 banner */}
          {(p1Decisions.length > 0 || withDeadlines.length > 0) && (
            <div
              className="flex items-center gap-3 px-5 py-3.5"
              style={{ border: "1px solid var(--hall-danger)", background: "var(--hall-danger-soft)", borderRadius: 3 }}
            >
              <span className="w-2 h-2 rounded-full shrink-0 animate-pulse" style={{background: "var(--hall-danger)"}} />
              <p className="text-sm flex-1 min-w-0" style={{color: "var(--hall-ink-0)"}}>
                {p1Decisions.length > 0 && (
                  <><strong>{p1Decisions.length} urgent decision{p1Decisions.length !== 1 ? "s" : ""}</strong>{" — "}{p1Decisions[0].title}</>
                )}
                {withDeadlines.length > 0 && (
                  <>{p1Decisions.length > 0 ? " · " : ""}
                  <strong>{withDeadlines.length} deadline{withDeadlines.length !== 1 ? "s" : ""}</strong>
                  {" — "}{withDeadlines[0].title}{withDeadlines[0].dueDate ? ` closes ${new Date(withDeadlines[0].dueDate).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}` : ""}</>
                )}
              </p>
              <Link
                href="/admin/decisions"
                className="text-[11px] font-bold shrink-0 whitespace-nowrap"
                style={{color: "var(--hall-danger)"}}
              >
                Review →
              </Link>
            </div>
          )}

          {/* Stats row */}
          <div className="grid grid-cols-4 gap-4">
            {[
              { label: "Grant pipeline", value: grants.length, sub: "Active opportunities", color: "var(--hall-ink-0)" },
              { label: "Following", value: followedGrants.length, sub: "In Hall / Suggested Blocks", color: followedGrants.length > 0 ? "var(--hall-ok)" : "var(--hall-muted-3)" },
              { label: "P1 — Act Now", value: urgentGrants.length, sub: "Require immediate action", color: urgentGrants.length > 0 ? "var(--hall-danger)" : "var(--hall-muted-3)" },
              { label: "Open decisions", value: grantDecisions.length, sub: "Approvals / inputs pending", color: grantDecisions.length > 0 ? "var(--hall-warn)" : "var(--hall-muted-3)" },
            ].map(s => (
              <div
                key={s.label}
                className="px-5 py-4"
                style={{ border: "1px solid var(--hall-line-soft)", borderRadius: 3, background: "var(--hall-paper-0)" }}
              >
                <p
                  className="text-[9px] font-bold tracking-widest uppercase mb-2"
                  style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted-3)" }}
                >
                  {s.label}
                </p>
                <p className="text-3xl font-bold tracking-tight tabular-nums" style={{color: s.color}}>{s.value}</p>
                <p className="text-[11px] font-medium mt-1.5" style={{color: "var(--hall-muted-2)"}}>{s.sub}</p>
              </div>
            ))}
          </div>

          {/* Activation model notice */}
          <div
            className="px-5 py-3.5"
            style={{ border: "1px solid var(--hall-line-soft)", borderRadius: 3, background: "var(--hall-paper-1)" }}
          >
            <p className="text-[11px] leading-snug" style={{color: "var(--hall-ink-3)"}}>
              <strong style={{color: "var(--hall-ink-0)"}}>Grants are passive by default.</strong>{" "}
              System-discovered grants stay here until you <em>Follow</em> one. Only followed grants enter the Hall,
              Suggested Time Blocks and Chief-of-Staff. Unfollow or Dismiss to suppress re-surfacing.
            </p>
          </div>

          {/* Pipeline table + decisions side panel */}
          <div className="grid grid-cols-[1fr_320px] gap-6 items-start">

            {/* Grant opportunity pipeline table */}
            <section>
              <div
                className="flex items-baseline justify-between gap-3 pb-2 mb-3.5"
                style={{borderBottom: "1px solid var(--hall-ink-0)"}}
              >
                <h2
                  className="text-[19px] font-bold leading-none"
                  style={{letterSpacing: "-0.02em", color: "var(--hall-ink-0)"}}
                >
                  Grant <em className="hall-flourish">pipeline</em>
                </h2>
                <a
                  href="https://www.notion.so/687caa98594a41b595c9960c141be0c0"
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    fontFamily: "var(--font-hall-mono)",
                    fontSize: 10,
                    color: "var(--hall-muted-2)",
                    letterSpacing: "0.06em",
                  }}
                >
                  OPEN IN NOTION →
                </a>
              </div>

              {grants.length === 0 ? (
                <div
                  className="px-5 py-10 text-center"
                  style={{ border: "1px solid var(--hall-line-soft)", borderRadius: 3 }}
                >
                  <p className="text-sm" style={{color: "var(--hall-muted-3)"}}>No active grant opportunities.</p>
                </div>
              ) : (
                <table className="w-full text-left">
                  <thead>
                    <tr style={{ borderBottom: "1px solid var(--hall-line-soft)", background: "var(--hall-paper-1)" }}>
                      {["Funder / Program", "Status", "Priority", "For", "Activation"].map(h => (
                        <th
                          key={h}
                          className="px-4 py-2.5 text-[8.5px] font-bold tracking-widest uppercase first:pl-5 last:pr-5"
                          style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted-3)" }}
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {[...grants].sort((a, b) => Number(b.isFollowed) - Number(a.isFollowed)).map(g => {
                      const sStyle = statusStyle(g.status);
                      const pStyle = priorityStyle(g.priority);
                      return (
                        <tr
                          key={g.id}
                          className="group"
                          style={{ borderTop: "1px solid var(--hall-line-soft)" }}
                        >
                          <td className="pl-5 pr-4 py-3.5">
                            <div className="flex items-center gap-2">
                              <p className="text-[12px] font-bold leading-tight" style={{color: "var(--hall-ink-0)"}}>{g.funder || g.program}</p>
                              {g.isFollowed && (
                                <span
                                  className="inline-flex items-center gap-1 text-[8px] font-bold px-1.5 py-0.5 rounded"
                                  style={{
                                    fontFamily: "var(--font-hall-mono)",
                                    background: "var(--hall-ok-soft)",
                                    color: "var(--hall-ok)",
                                    letterSpacing: "0.06em",
                                  }}
                                  title="Explicitly followed by Jose"
                                >
                                  <span className="w-1 h-1 rounded-full" style={{background: "var(--hall-ok)"}} />
                                  FOLLOWING
                                </span>
                              )}
                            </div>
                            {g.program && g.program !== g.funder && (
                              <p className="text-[10px] mt-0.5 font-medium" style={{color: "var(--hall-muted-3)"}}>{g.program}</p>
                            )}
                            {!g.isFollowed && g.unfollowReason && (
                              <p className="text-[9px] mt-0.5 italic" style={{color: "var(--hall-muted-3)"}} title="Dismiss reason">
                                Dismissed: {g.unfollowReason}
                              </p>
                            )}
                          </td>
                          <td className="px-4 py-3.5">
                            <span
                              className="inline-flex text-[9px] font-bold px-2 py-0.5 rounded-full"
                              style={{
                                fontFamily: "var(--font-hall-mono)",
                                background: sStyle.bg,
                                color: sStyle.color,
                              }}
                            >
                              {g.statusLabel}
                            </span>
                          </td>
                          <td className="px-4 py-3.5">
                            {g.priority ? (
                              <span
                                className="inline-flex text-[9px] font-bold px-2 py-0.5 rounded-full"
                                style={{
                                  fontFamily: "var(--font-hall-mono)",
                                  background: pStyle.bg,
                                  color: pStyle.color,
                                }}
                              >
                                {g.priority}
                              </span>
                            ) : (
                              <span className="text-[10px]" style={{color: "var(--hall-muted-3)"}}>—</span>
                            )}
                          </td>
                          <td className="px-4 py-3.5">
                            <span className="text-[10px] font-semibold" style={{color: "var(--hall-muted-2)"}}>
                              {g.startup || "—"}
                            </span>
                          </td>
                          <td className="px-4 py-3.5 pr-5">
                            <GrantFollowButton opportunityId={g.id} initialFollowed={g.isFollowed} />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </section>

            {/* Grant decisions */}
            <section>
              <div
                className="flex items-baseline justify-between gap-3 pb-2 mb-3.5"
                style={{borderBottom: "1px solid var(--hall-ink-0)"}}
              >
                <h2
                  className="text-[19px] font-bold leading-none"
                  style={{letterSpacing: "-0.02em", color: "var(--hall-ink-0)"}}
                >
                  Open <em className="hall-flourish">decisions</em>
                </h2>
                {grantDecisions.length > 0 && (
                  <span
                    style={{fontFamily: "var(--font-hall-mono)", fontSize: 10, color: "var(--hall-warn)", letterSpacing: "0.06em"}}
                  >
                    {grantDecisions.length} OPEN
                  </span>
                )}
              </div>

              <ul className="flex flex-col">
                {grantDecisions.slice(0, 8).map((d, idx) => {
                  const isUrgent = d.priority === "P1" || d.priority === "P1 Critical" || d.priority === "Urgent";
                  return (
                    <li
                      key={d.id}
                      style={idx === 0 ? undefined : {borderTop: "1px solid var(--hall-line-soft)"}}
                    >
                      <Link href="/admin/decisions" className="flex items-start gap-3 py-3 transition-colors">
                        <div
                          className="w-5 h-5 rounded flex items-center justify-center shrink-0 mt-0.5"
                          style={{
                            background: isUrgent ? "var(--hall-danger-soft)" : "var(--hall-fill-soft)",
                          }}
                        >
                          <span
                            className="text-[8px] font-bold"
                            style={{
                              fontFamily: "var(--font-hall-mono)",
                              color: isUrgent ? "var(--hall-danger)" : "var(--hall-muted-3)",
                            }}
                          >
                            {d.priority?.startsWith("P1") || d.priority === "Urgent" ? "P1" : "·"}
                          </span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[11px] font-semibold leading-snug line-clamp-2" style={{color: "var(--hall-ink-0)"}}>{d.title}</p>
                          <p
                            className="text-[9px] mt-0.5"
                            style={{fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted-3)", letterSpacing: "0.06em"}}
                          >
                            {d.decisionType || "Decision"}
                            {d.dueDate && ` · Closes ${new Date(d.dueDate).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`}
                          </p>
                        </div>
                      </Link>
                    </li>
                  );
                })}
                {grantDecisions.length === 0 && (
                  <li className="py-6 text-center">
                    <p className="text-[11px] font-medium" style={{color: "var(--hall-muted-3)"}}>No open grant decisions</p>
                  </li>
                )}
              </ul>
              <div className="pt-3 mt-2" style={{borderTop: "1px solid var(--hall-line-soft)"}}>
                <Link
                  href="/admin/decisions"
                  style={{fontFamily: "var(--font-hall-mono)", fontSize: 10, color: "var(--hall-muted-2)", letterSpacing: "0.06em"}}
                >
                  ALL DECISIONS →
                </Link>
              </div>
            </section>

          </div>
        </div>
      </main>
    </div>
  );
}
