import "server-only";

import { supabaseAdmin } from "@/lib/supabase";

const SECTION_LABELS: Record<string, string> = {
  overview: "Resumen", heard: "Lo que escuchamos", proposal: "Propuesta", plan: "Plan",
  together: "Trabajo juntos", documents: "Documentos", agreements: "Acuerdos", admin: "Administrativo",
};
export function sectionLabel(id: string): string {
  return SECTION_LABELS[id] ?? id;
}

type EventRow = {
  occurred_at: string;
  session_id: string;
  actor_email: string | null;
  actor_role: string | null;
  is_admin: boolean;
  event_type: string;
  target: string | null;
  duration_ms: number | null;
  metadata: { sections?: Record<string, number> } | null;
};

export type VisitorSummary = {
  email: string;
  role: string | null;
  visits: number;
  totalMs: number;
  lastSeen: string;
  sectionsViewed: number;
  docsOpened: number;
};

export type SessionSummary = {
  sessionId: string;
  email: string;
  role: string | null;
  startedAt: string;
  durationMs: number | null;
  sectionsViewed: number;
  docsOpened: number;
};

export type RoomAnalytics = {
  totalVisits: number;
  uniqueVisitors: number;
  totalTimeMs: number;
  lastVisitAt: string | null;
  adminPreviews: number;
  visitors: VisitorSummary[];
  recentSessions: SessionSummary[];
  topSections: Array<{ id: string; label: string; views: number; dwellMs: number }>;
  topDocs: Array<{ target: string; opens: number }>;
};

export type RoomOverviewItem = {
  projectId: string;
  slug: string;
  name: string;
  org: string | null;
  enabled: boolean;
  ready: boolean;
  grants: number;
  clientMaterials: number;
  visits: number;
  visitors: number;
  lastVisitAt: string | null;
  totalTimeMs: number;
};

/**
 * Compact cross-room summary for the admin Hall: which client rooms exist,
 * whether each is ready to share (enabled + has access + has client-visible
 * material), and a light analytics roll-up (visits / visitors / last visit /
 * time) excluding admin previews. A few grouped queries, tallied in JS.
 */
export async function getRoomsOverview(): Promise<RoomOverviewItem[]> {
  const sb = supabaseAdmin();
  const { data: rooms } = await sb
    .from("projects")
    .select("id, hall_slug, name, organization_id, client_room_enabled")
    .not("hall_slug", "is", null)
    .order("name", { ascending: true });

  const roomRows = (rooms as Array<{ id: string; hall_slug: string; name: string | null; organization_id: string | null; client_room_enabled: boolean | null }> | null) ?? [];
  if (roomRows.length === 0) return [];
  const ids = roomRows.map((r) => r.id);

  const [{ data: grants }, { data: mats }, { data: orgs }, { data: events }] = await Promise.all([
    sb.from("client_access").select("project_id").in("project_id", ids).is("revoked_at", null),
    sb.from("project_materials").select("project_id").in("project_id", ids).eq("visibility", "client").neq("document_status", "archived"),
    sb.from("organizations").select("id, name").in("id", roomRows.map((r) => r.organization_id).filter(Boolean) as string[]),
    sb.from("portal_analytics_events").select("project_id, session_id, actor_email, occurred_at, event_type, duration_ms").in("project_id", ids).eq("is_admin", false).order("occurred_at", { ascending: false }).limit(10000),
  ]);

  const tally = (rows: Array<{ project_id: string }> | null) => {
    const m = new Map<string, number>();
    for (const r of rows ?? []) m.set(r.project_id, (m.get(r.project_id) ?? 0) + 1);
    return m;
  };
  const grantCounts = tally(grants as Array<{ project_id: string }> | null);
  const matCounts = tally(mats as Array<{ project_id: string }> | null);
  const orgName = new Map<string, string>();
  for (const o of (orgs as Array<{ id: string; name: string }> | null) ?? []) orgName.set(o.id, o.name);

  // analytics roll-up per project
  type Agg = { sessions: Set<string>; visitors: Set<string>; last: string | null; timeMs: number };
  const agg = new Map<string, Agg>();
  const seenSessionTime = new Set<string>();
  for (const e of (events as Array<{ project_id: string; session_id: string; actor_email: string | null; occurred_at: string; event_type: string; duration_ms: number | null }> | null) ?? []) {
    let a = agg.get(e.project_id);
    if (!a) { a = { sessions: new Set(), visitors: new Set(), last: null, timeMs: 0 }; agg.set(e.project_id, a); }
    a.sessions.add(e.session_id);
    if (e.actor_email) a.visitors.add(e.actor_email);
    if (!a.last || e.occurred_at > a.last) a.last = e.occurred_at;
    // Events arrive newest-first, and heartbeat/session_end carry cumulative
    // active time — so the first one seen per session is its largest value.
    if ((e.event_type === "session_end" || e.event_type === "heartbeat") && e.duration_ms && !seenSessionTime.has(e.session_id)) {
      seenSessionTime.add(e.session_id);
      a.timeMs += e.duration_ms;
    }
  }

  return roomRows.map((r) => {
    const grantsN = grantCounts.get(r.id) ?? 0;
    const matsN = matCounts.get(r.id) ?? 0;
    const enabled = !!r.client_room_enabled;
    const a = agg.get(r.id);
    return {
      projectId: r.id,
      slug: r.hall_slug,
      name: r.name ?? "Untitled",
      org: r.organization_id ? orgName.get(r.organization_id) ?? null : null,
      enabled,
      ready: enabled && grantsN > 0 && matsN > 0,
      grants: grantsN,
      clientMaterials: matsN,
      visits: a?.sessions.size ?? 0,
      visitors: a?.visitors.size ?? 0,
      lastVisitAt: a?.last ?? null,
      totalTimeMs: a?.timeMs ?? 0,
    };
  });
}

export async function getRoomAnalytics(projectId: string): Promise<RoomAnalytics> {
  const { data } = await supabaseAdmin()
    .from("portal_analytics_events")
    .select("occurred_at, session_id, actor_email, actor_role, is_admin, event_type, target, duration_ms, metadata")
    .eq("project_id", projectId)
    .order("occurred_at", { ascending: false })
    .limit(8000);

  const rows = (data as EventRow[] | null) ?? [];

  // Group by session.
  type Sess = { email: string; role: string | null; isAdmin: boolean; start: string; end: string; durationMs: number | null; sections: Set<string>; docs: number; sectionMs: Record<string, number> };
  const sessions = new Map<string, Sess>();
  const topSections = new Map<string, number>();
  const topDocs = new Map<string, number>();
  let adminPreviews = 0;

  for (const r of rows) {
    let s = sessions.get(r.session_id);
    if (!s) {
      s = { email: r.actor_email ?? "—", role: r.actor_role, isAdmin: r.is_admin, start: r.occurred_at, end: r.occurred_at, durationMs: null, sections: new Set(), docs: 0, sectionMs: {} };
      sessions.set(r.session_id, s);
    }
    if (r.occurred_at < s.start) s.start = r.occurred_at;
    if (r.occurred_at > s.end) s.end = r.occurred_at;
    if (r.actor_email && s.email === "—") s.email = r.actor_email;
    // Both heartbeat and session_end carry cumulative active time; take the max
    // so a session's length survives even when the final session_end is lost.
    // The per-section dwell snapshot from that same (longest) event wins.
    if ((r.event_type === "session_end" || r.event_type === "heartbeat") && r.duration_ms != null) {
      if (r.duration_ms >= (s.durationMs ?? -1)) {
        s.durationMs = r.duration_ms;
        const secs = r.metadata?.sections;
        if (secs && typeof secs === "object") s.sectionMs = secs;
      }
    }
    if (r.event_type === "section_view" && r.target) {
      s.sections.add(r.target);
      if (!r.is_admin) topSections.set(r.target, (topSections.get(r.target) ?? 0) + 1);
    }
    if (r.event_type === "material_open" && r.target) {
      s.docs += 1;
      if (!r.is_admin) topDocs.set(r.target, (topDocs.get(r.target) ?? 0) + 1);
    }
  }

  // Sum real on-screen dwell per section across client sessions (admin excluded).
  const sectionDwell = new Map<string, number>();
  for (const s of sessions.values()) {
    if (s.isAdmin) continue;
    for (const [id, ms] of Object.entries(s.sectionMs)) {
      if (Number.isFinite(ms) && ms > 0) sectionDwell.set(id, (sectionDwell.get(id) ?? 0) + ms);
    }
  }

  const clientSessions: SessionSummary[] = [];
  const visitorMap = new Map<string, VisitorSummary>();
  let totalTimeMs = 0;
  let lastVisitAt: string | null = null;

  for (const s of sessions.values()) {
    if (s.isAdmin) { adminPreviews += 1; continue; }
    const summary: SessionSummary = {
      sessionId: "", email: s.email, role: s.role, startedAt: s.start,
      durationMs: s.durationMs, sectionsViewed: s.sections.size, docsOpened: s.docs,
    };
    clientSessions.push(summary);
    totalTimeMs += s.durationMs ?? 0;
    if (!lastVisitAt || s.start > lastVisitAt) lastVisitAt = s.start;

    const v = visitorMap.get(s.email) ?? { email: s.email, role: s.role, visits: 0, totalMs: 0, lastSeen: s.start, sectionsViewed: 0, docsOpened: 0 };
    v.visits += 1;
    v.totalMs += s.durationMs ?? 0;
    v.docsOpened += s.docs;
    v.sectionsViewed = Math.max(v.sectionsViewed, s.sections.size);
    if (s.start > v.lastSeen) v.lastSeen = s.start;
    if (s.role) v.role = s.role;
    visitorMap.set(s.email, v);
  }

  clientSessions.sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1));
  const visitors = [...visitorMap.values()].sort((a, b) => (a.lastSeen < b.lastSeen ? 1 : -1));

  return {
    totalVisits: clientSessions.length,
    uniqueVisitors: visitorMap.size,
    totalTimeMs,
    lastVisitAt,
    adminPreviews,
    visitors,
    recentSessions: clientSessions.slice(0, 25),
    topSections: [...new Set([...topSections.keys(), ...sectionDwell.keys()])]
      .map((id) => ({ id, label: sectionLabel(id), views: topSections.get(id) ?? 0, dwellMs: sectionDwell.get(id) ?? 0 }))
      .sort((a, b) => b.dwellMs - a.dwellMs || b.views - a.views)
      .slice(0, 8),
    topDocs: [...topDocs.entries()].map(([target, opens]) => ({ target, opens })).sort((a, b) => b.opens - a.opens).slice(0, 8),
  };
}
