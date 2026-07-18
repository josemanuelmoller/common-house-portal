import "server-only";

import { getSupabaseServerClient } from "@/lib/supabase-server";

export type OperatingSignal = {
  id: string;
  kind: "health" | "review" | "claim" | "agreement" | "inbox" | "proposal";
  title: string;
  detail: string;
  projectName: string | null;
  projectId: string | null;
  href: string;
  urgency: "critical" | "high" | "normal";
  occurredAt: string | null;
};

export type UpcomingMeeting = {
  id: string;
  title: string;
  startsAt: string;
  href: string | null;
};

function projectLink(project: { id?: string | null; notion_id?: string | null } | { id?: string | null; notion_id?: string | null }[] | null | undefined) {
  const row = Array.isArray(project) ? project[0] : project;
  // Use the Supabase uuid — the whole /admin/projects/[id] route family is keyed
  // by it (workrooms, health, my-rooms…), and the state page's "← Project" back
  // link relies on it too. notion_id is only a fallback.
  const id = row?.id || row?.notion_id || null;
  return id ? { projectId: id, href: `/admin/projects/${id}/state` } : { projectId: null, href: "/admin/workrooms" };
}

function ageDays(value: string | null) {
  if (!value) return 0;
  return Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 86_400_000));
}

export async function getOperatingSignals(limit = 12): Promise<OperatingSignal[]> {
  const sb = getSupabaseServerClient();
  const now = new Date();
  const nowIso = now.toISOString();
  // Proposals and claims are handled as interactive packages/claims (see
  // getNowProposalPackages / getNowClaims); this returns the remaining
  // project/inbox signals rendered as links.
  const [states, agreements, inbox] = await Promise.all([
    sb.from("project_states").select("project_id, health, state_status, stale_after, updated_at, projects(id, notion_id, name)").in("state_status", ["current", "stale"]).limit(100),
    sb.from("project_agreements").select("id, project_id, title, agreement_type, status, requested_at, projects(id, notion_id, name)").in("status", ["shared", "changes_requested"]).eq("visibility", "client").limit(100),
    sb.from("action_items").select("id, subject, next_action, priority_score, last_motion_at, source_url").eq("status", "open").eq("ball_in_court", "jose").gte("priority_score", 70).order("priority_score", { ascending: false }).limit(5),
  ]);
  const signals: OperatingSignal[] = [];
  for (const row of states.data ?? []) {
    const project = projectLink(row.projects as { id?: string; notion_id?: string } | null);
    const projectName = ((Array.isArray(row.projects) ? row.projects[0] : row.projects)?.name as string | undefined) ?? null;
    if (row.health === "blocked" || row.health === "watch") signals.push({
      id: `health:${row.project_id}`, kind: "health", title: row.health === "blocked" ? "Project is blocked" : "Project needs attention",
      detail: "Review the current state before the risk becomes another inbox item.", projectName, projectId: project.projectId, href: project.href,
      urgency: row.health === "blocked" ? "critical" : "high", occurredAt: row.updated_at as string,
    });
    if (row.state_status === "stale" || (row.stale_after && row.stale_after <= nowIso)) signals.push({
      id: `state:${row.project_id}`, kind: "review", title: "Current project state needs confirmation",
      detail: "The operating model is past its review date; confirm what is still true or let it expire.", projectName, projectId: project.projectId, href: project.href,
      urgency: "high", occurredAt: row.stale_after as string | null,
    });
  }
  for (const row of agreements.data ?? []) {
    const project = projectLink(row.projects as { id?: string; notion_id?: string } | null);
    const projectName = ((Array.isArray(row.projects) ? row.projects[0] : row.projects)?.name as string | undefined) ?? null;
    const days = ageDays(row.requested_at as string | null);
    signals.push({
      id: `agreement:${row.id}`, kind: "agreement", title: row.title as string,
      detail: `${String(row.agreement_type).replaceAll("_", " ")} awaiting client response${days ? ` for ${days}d` : ""}.`,
      projectName, projectId: project.projectId, href: project.href.replace("/state", "/client-room"),
      urgency: days >= 7 ? "high" : "normal", occurredAt: row.requested_at as string | null,
    });
  }
  for (const row of inbox.data ?? []) {
    signals.push({
      id: `inbox:${row.id}`, kind: "inbox", title: (row.next_action || row.subject) as string,
      detail: "High-priority message. It appears here only because it clears the operating threshold.", projectName: null, projectId: null,
      href: (row.source_url as string | null) || "/admin/inbox", urgency: "normal", occurredAt: row.last_motion_at as string | null,
    });
  }
  const rank = { critical: 0, high: 1, normal: 2 };
  return signals.sort((a, b) => rank[a.urgency] - rank[b.urgency] || new Date(a.occurredAt ?? 0).getTime() - new Date(b.occurredAt ?? 0).getTime()).slice(0, limit);
}

export type NowClaim = {
  id: string;
  projectId: string;
  projectName: string;
  projectHref: string;
  statement: string;
  itemType: string;
  urgency: "critical" | "high" | "normal";
  occurredAt: string | null;
};

/** Active claims due or stale within 7 days, for inline Confirm/Resolve on /admin/now. */
export async function getNowClaims(limit = 8): Promise<NowClaim[]> {
  const sb = getSupabaseServerClient();
  const now = new Date();
  const soon = new Date(now.getTime() + 7 * 86_400_000).toISOString();
  const nowIso = now.toISOString();
  const { data, error } = await sb
    .from("project_state_items")
    .select("id, project_id, item_type, statement, due_at, stale_after, updated_at, projects(id, notion_id, name)")
    .eq("status", "active").or(`due_at.lte.${soon},stale_after.lte.${soon}`).limit(100);
  if (error) throw new Error(`now claims read failed: ${error.message}`);
  const claims: NowClaim[] = (data ?? []).map((row) => {
    const proj = (Array.isArray(row.projects) ? row.projects[0] : row.projects) as { id?: string; notion_id?: string; name?: string } | null;
    const pid = proj?.id || proj?.notion_id || (row.project_id as string);
    const overdue = !!row.due_at && (row.due_at as string) <= nowIso;
    const stale = !!row.stale_after && (row.stale_after as string) <= nowIso;
    return {
      id: row.id as string,
      projectId: pid,
      projectName: proj?.name ?? "Untitled project",
      projectHref: `/admin/projects/${pid}/state`,
      statement: row.statement as string,
      itemType: row.item_type as string,
      urgency: overdue ? "critical" : stale ? "high" : "normal",
      occurredAt: (row.due_at || row.stale_after || row.updated_at) as string,
    };
  });
  const rank = { critical: 0, high: 1, normal: 2 };
  return claims.sort((a, b) => rank[a.urgency] - rank[b.urgency]).slice(0, limit);
}

// The calendar is synced from the Common House work Google account, so the
// event's html_link only resolves when opened in THAT account. Google picks the
// account from the `authuser` param; without it the browser opens the user's
// default (personal) account and reports "event not found". Force the work
// account. Overridable via env for a different operator.
const CALENDAR_ACCOUNT_EMAIL = process.env.PORTAL_CALENDAR_ACCOUNT || "josemanuel@wearecommonhouse.com";

function withAuthUser(url: string): string {
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}authuser=${encodeURIComponent(CALENDAR_ACCOUNT_EMAIL)}`;
}

function googleCalendarDayHref(iso: string): string {
  const d = new Date(iso);
  return `https://calendar.google.com/calendar/r/day/${d.getUTCFullYear()}/${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
}

export async function getUpcomingMeetings(limit = 5): Promise<UpcomingMeeting[]> {
  const now = new Date();
  const end = new Date(now.getTime() + 2 * 86_400_000);
  const { data } = await getSupabaseServerClient().from("hall_calendar_events")
    .select("event_id, event_title, event_start, html_link")
    .gte("event_start", now.toISOString()).lte("event_start", end.toISOString())
    .eq("is_cancelled", false).order("event_start", { ascending: true }).limit(limit);
  return (data ?? []).map((row) => {
    const link = (row.html_link as string | null) || googleCalendarDayHref(row.event_start as string);
    return {
      id: row.event_id as string,
      title: row.event_title as string,
      startsAt: row.event_start as string,
      href: withAuthUser(link),
    };
  });
}
