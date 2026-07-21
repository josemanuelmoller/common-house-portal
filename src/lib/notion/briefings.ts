// ─── Hall v2 — Daily Briefing ─────────────────────────────────────────────────
//
// Supabase-backed (post-Notion cutoff). Reads the canonical `daily_briefings`
// and `insight_briefs` tables. No Notion API usage. Return shapes are identical
// to the pre-migration Notion reader so downstream callers are unaffected.
//
// `daily_briefings` stores the 7 named sections plus status + generated_at
// under `payload` (payload.sections.{focus_of_day,…}, payload.status,
// payload.generated_at). `insight_briefs` keeps title + brief_type as columns
// with theme / source_link / notion_url under `payload`.

export type DailyBriefing = {
  id: string;
  date: string | null;
  focusOfDay: string;
  meetingPrep: string;
  myCommitments: string;
  followUpQueue: string;
  agentQueue: string;
  marketSignals: string;
  readyToPublish: string;
  generatedAt: string | null;
  status: string;  // Fresh | Stale | Generating
};

type DailyBriefingPayload = {
  status?: string | null;
  generated_at?: string | null;
  sections?: Partial<Record<
    "focus_of_day" | "meeting_prep" | "my_commitments" |
    "follow_up_queue" | "agent_queue" | "market_signals" | "ready_to_publish",
    string | null
  >>;
};

function sectionsOf(payload: unknown): DailyBriefingPayload {
  if (!payload || typeof payload !== "object") return {};
  return payload as DailyBriefingPayload;
}

/** Reconstruct a Notion deep-link from a stored notion_id (dashes stripped). */
function notionUrlFromId(notionId: string | null | undefined): string {
  if (!notionId) return "";
  return `https://www.notion.so/${notionId.replace(/-/g, "")}`;
}

export async function getDailyBriefing(dateStr?: string): Promise<DailyBriefing | null> {
  try {
    const { getSupabaseServerClient } = await import("../supabase-server");
    const sb = getSupabaseServerClient();

    const target = dateStr ?? new Date().toISOString().slice(0, 10);
    const { data, error } = await sb
      .from("daily_briefings")
      .select("id, notion_id, briefing_date, payload")
      .eq("briefing_date", target)
      .limit(1)
      .maybeSingle();
    if (error || !data) return null;

    const r = data as Record<string, unknown>;
    const p = sectionsOf(r.payload);
    const sec = p.sections ?? {};
    return {
      id:             ((r.notion_id as string | null) ?? (r.id as string)),
      date:           (r.briefing_date as string | null) ?? null,
      focusOfDay:     sec.focus_of_day     ?? "",
      meetingPrep:    sec.meeting_prep     ?? "",
      myCommitments:  sec.my_commitments   ?? "",
      followUpQueue:  sec.follow_up_queue  ?? "",
      agentQueue:     sec.agent_queue      ?? "",
      marketSignals:  sec.market_signals   ?? "",
      readyToPublish: sec.ready_to_publish ?? "",
      generatedAt:    p.generated_at ?? null,
      status:         p.status       ?? "",
    };
  } catch {
    return null;
  }
}

// Lightweight snapshot of a recent Insight Brief — used as the Sources strip
// under the Market Signals panel so the user can jump to the original source.
export type MarketSignalBrief = {
  id: string;
  title: string;
  sourceLink: string | null;   // URL to the original news / report
  notionUrl: string;           // fallback — opens the brief in Notion
  theme: string[];
  sourceType: string | null;   // "Report" | "Policy Doc" | "Article" | …
};

type InsightBriefPayload = {
  source_link?: string | null;
  theme?: string | null;
  notion_url?: string | null;
};

export async function getRecentInsightBriefBriefs(): Promise<MarketSignalBrief[]> {
  try {
    const { getSupabaseServerClient } = await import("../supabase-server");
    const sb = getSupabaseServerClient();

    const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
    const { data, error } = await sb
      .from("insight_briefs")
      .select("id, notion_id, title, brief_type, payload, updated_at")
      .gte("updated_at", since)
      .order("updated_at", { ascending: false })
      .limit(20);
    if (error || !data) return [];

    return (data as Record<string, unknown>[]).map(r => {
      const notionId = (r.notion_id as string | null) ?? null;
      const p = (r.payload && typeof r.payload === "object" ? r.payload : {}) as InsightBriefPayload;
      const url = p.source_link ?? null;
      return {
        id:         (notionId ?? (r.id as string)),
        title:      (r.title as string | null) || "Untitled",
        sourceLink: typeof url === "string" && url.length > 0 ? url : null,
        notionUrl:  p.notion_url ?? notionUrlFromId(notionId),
        theme:      p.theme ? [p.theme] : [],
        sourceType: (r.brief_type as string | null) || null,
      };
    });
  } catch {
    return [];
  }
}

// Fetch the most recent briefing whose Market Signals field is non-empty,
// regardless of date. Used by the Hall so the panel always shows the last
// known signals with a clear "generated on" timestamp.
//
// Timestamp logic: prefer the explicit payload.generated_at when populated;
// otherwise fall back to the row's updated_at so the panel always has a
// freshness cue, even if legacy briefings never set generated_at.
export async function getLatestMarketSignals(): Promise<{ text: string; date: string | null; generatedAt: string | null } | null> {
  try {
    const { getSupabaseServerClient } = await import("../supabase-server");
    const sb = getSupabaseServerClient();

    const { data, error } = await sb
      .from("daily_briefings")
      .select("briefing_date, payload, updated_at")
      .order("briefing_date", { ascending: false })
      .limit(14); // look at the last ~2 weeks
    if (error || !data) return null;

    for (const row of (data as Record<string, unknown>[])) {
      const p = sectionsOf(row.payload);
      const signals = p.sections?.market_signals ?? null;
      if (signals && signals.trim().length > 0) {
        return {
          text:        signals,
          date:        (row.briefing_date as string | null) ?? null,
          generatedAt: p.generated_at ?? (row.updated_at as string | null) ?? null,
        };
      }
    }
    return null;
  } catch {
    return null;
  }
}
