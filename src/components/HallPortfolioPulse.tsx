import Link from "next/link";
import { getSupabaseServerClient } from "@/lib/supabase-server";

/**
 * Portfolio pulse — for every Garage project (CH portfolio startup),
 * cross-reference meetings / transcripts / calendar events from the last
 * 21 days by substring-matching the project name in titles.
 *
 * Heat buckets:
 *   hot      3+ events in last 7d
 *   warm     1-2 events in last 14d
 *   cold     0 events in last 21d  ← surfaced as "check-in needed"
 */

type Project = {
  notion_id:     string;
  name:          string;
  current_stage: string | null;
  updated_at:    string;
};

type PortfolioEntry = {
  project:       Project;
  events7d:      number;
  events14d:     number;
  events21d:     number;
  lastEventAt:   string | null;
  lastEventTitle: string | null;
  heat:          "hot" | "warm" | "cold";
};

async function loadPortfolio(): Promise<PortfolioEntry[]> {
  const sb = getSupabaseServerClient();

  const { data: projects } = await sb
    .from("projects")
    .select("notion_id, name, current_stage, updated_at")
    .eq("primary_workspace", "garage")
    .eq("project_status", "Active");

  const projs = (projects ?? []) as Project[];
  if (projs.length === 0) return [];

  // Pull 21-day window of transcripts + calendar events once; match in memory.
  const since21d = new Date(Date.now() - 21 * 86400_000).toISOString();
  const [txRes, calRes] = await Promise.all([
    sb.from("hall_transcript_observations")
      .select("transcript_id, title, meeting_at")
      .gte("meeting_at", since21d)
      .order("meeting_at", { ascending: false }),
    sb.from("hall_calendar_events")
      .select("event_id, event_title, event_start, is_cancelled")
      .gte("event_start", since21d)
      .eq("is_cancelled", false)
      .order("event_start", { ascending: false }),
  ]);

  const now = Date.now();
  const out: PortfolioEntry[] = [];

  for (const p of projs) {
    const needle = p.name.toLowerCase().trim();
    if (!needle || needle.length < 3) continue;

    // Collect hits across both sources with their timestamps.
    type Hit = { at: string; title: string };
    const hits: Hit[] = [];
    for (const r of (txRes.data ?? []) as { title: string; meeting_at: string }[]) {
      if (r.title && r.title.toLowerCase().includes(needle)) hits.push({ at: r.meeting_at, title: r.title });
    }
    for (const r of (calRes.data ?? []) as { event_title: string; event_start: string }[]) {
      if (r.event_title && r.event_title.toLowerCase().includes(needle)) hits.push({ at: r.event_start, title: r.event_title });
    }
    hits.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

    const ms7  = 7  * 86400_000;
    const ms14 = 14 * 86400_000;
    const ms21 = 21 * 86400_000;
    let e7 = 0, e14 = 0, e21 = 0;
    for (const h of hits) {
      const age = now - new Date(h.at).getTime();
      if (age <= ms7)  e7++;
      if (age <= ms14) e14++;
      if (age <= ms21) e21++;
    }
    const last = hits[0] ?? null;

    let heat: PortfolioEntry["heat"];
    if (e7 >= 3)       heat = "hot";
    else if (e14 >= 1) heat = "warm";
    else               heat = "cold";

    out.push({
      project: p,
      events7d:       e7,
      events14d:      e14,
      events21d:      e21,
      lastEventAt:    last?.at ?? null,
      lastEventTitle: last?.title ?? null,
      heat,
    });
  }

  // Sort: cold first (most actionable), then warm, then hot.
  const order = { cold: 0, warm: 1, hot: 2 } as const;
  out.sort((a, b) => order[a.heat] - order[b.heat] || (b.events14d - a.events14d));
  return out;
}

function timeAgo(iso: string | null): string {
  if (!iso) return "never";
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400_000);
  if (d === 0) return "today";
  if (d === 1) return "1d ago";
  if (d < 30)  return `${d}d ago`;
  return `${Math.floor(d / 30)}mo ago`;
}

export async function HallPortfolioPulse() {
  const rows = await loadPortfolio();
  // H1 — only surface cold portfolios as "check-ins needed". Active Portfolio
  // section already covers stage/blockers/warmth for the full list, so keep
  // this widget narrow and actionable (Pareto: 20% that change user behavior).
  const cold = rows.filter(r => r.heat === "cold");

  // U1 — if everything is warm or hot, hide the widget (Active Portfolio
  // already shows the full list).
  if (cold.length === 0) return null;

  return (
    <ul className="flex flex-col">
      {cold.slice(0, 5).map(r => <PulseRow key={r.project.notion_id} entry={r} />)}
    </ul>
  );
}

function PulseRow({ entry }: { entry: PortfolioEntry }) {
  const { project: p, heat } = entry;
  const dotColor = heat === "hot" ? "var(--hall-ok)"
    : heat === "warm" ? "var(--hall-warn)"
    : "var(--hall-danger)";
  const dotLabel = heat === "cold" ? "check-in" : heat === "warm" ? "warm" : "hot";

  return (
    <li style={{ borderTop: "1px solid var(--hall-line-soft)" }}>
      <a
        href={`https://www.notion.so/${p.notion_id.replace(/-/g, "")}`}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-3 py-2.5"
      >
        <span
          className="shrink-0"
          style={{ width: 8, height: 8, borderRadius: "50%", background: dotColor }}
        />
        <div className="flex-1 min-w-0">
          <span
            className="block text-[12px] font-semibold truncate"
            style={{ color: "var(--hall-ink-0)" }}
          >
            {p.name}
          </span>
          <span
            className="block text-[10.5px] mt-0.5"
            style={{ color: "var(--hall-muted-2)" }}
          >
            {p.current_stage ?? "—"}
            {" · "}
            {entry.events14d > 0
              ? `${entry.events14d} event${entry.events14d === 1 ? "" : "s"} · last ${timeAgo(entry.lastEventAt)}`
              : entry.lastEventAt
                ? `last activity ${timeAgo(entry.lastEventAt)}`
                : "no recent activity"}
          </span>
        </div>
        <span
          className="uppercase tracking-[0.08em] shrink-0 font-bold"
          style={{ fontFamily: "var(--font-hall-mono)", fontSize: 9, color: dotColor }}
        >
          {dotLabel}
        </span>
      </a>
    </li>
  );
}
