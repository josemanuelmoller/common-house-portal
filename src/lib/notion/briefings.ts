import { notion, DB, prop, text, select, date } from "./core";

// ─── Hall v2 — Daily Briefing ─────────────────────────────────────────────────

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

export async function getDailyBriefing(dateStr?: string): Promise<DailyBriefing | null> {
  try {
    const target = dateStr ?? new Date().toISOString().slice(0, 10);
    const res = await notion.databases.query({
      database_id: DB.dailyBriefings,
      filter: { property: "Date", date: { equals: target } },
      page_size: 1,
    });
    if (!res.results.length) return null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const page: any = res.results[0];
    return {
      id:             page.id,
      date:           date(prop(page, "Date")),
      focusOfDay:     text(prop(page, "Focus of the Day")),
      meetingPrep:    text(prop(page, "Meeting Prep")),
      myCommitments:  text(prop(page, "My Commitments")),
      followUpQueue:  text(prop(page, "Follow-up Queue")),
      agentQueue:     text(prop(page, "Agent Queue")),
      marketSignals:  text(prop(page, "Market Signals")),
      readyToPublish: text(prop(page, "Ready to Publish")),
      generatedAt:    date(prop(page, "Generated At")),
      status:         select(prop(page, "Status")),
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

export async function getRecentInsightBriefBriefs(): Promise<MarketSignalBrief[]> {
  try {
    const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
    const res = await notion.databases.query({
      database_id: DB.insightBriefs,
      filter: {
        timestamp: "last_edited_time",
        last_edited_time: { on_or_after: since },
      },
      sorts: [{ timestamp: "last_edited_time", direction: "descending" }],
      page_size: 20,
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (res.results as any[]).map(page => {
      const url = page.properties?.["Source Link"]?.url ?? null;
      const themeName = select(prop(page, "Theme"));
      return {
        id:         page.id,
        title:      text(prop(page, "Title")) || "Untitled",
        sourceLink: typeof url === "string" && url.length > 0 ? url : null,
        notionUrl:  page.url ?? "",
        theme:      themeName ? [themeName] : [],
        sourceType: select(prop(page, "Source Type")) || null,
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
// Timestamp logic: prefer the explicit "Generated At" property when populated;
// otherwise fall back to the page's last_edited_time so the panel always has
// a freshness cue, even if legacy briefings never set Generated At.
export async function getLatestMarketSignals(): Promise<{ text: string; date: string | null; generatedAt: string | null } | null> {
  try {
    const res = await notion.databases.query({
      database_id: DB.dailyBriefings,
      sorts: [{ property: "Date", direction: "descending" }],
      page_size: 14, // look at the last ~2 weeks
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const page of res.results as any[]) {
      const signals = text(prop(page, "Market Signals"));
      if (signals && signals.trim().length > 0) {
        return {
          text:        signals,
          date:        date(prop(page, "Date")),
          generatedAt: date(prop(page, "Generated At")) ?? page.last_edited_time ?? null,
        };
      }
    }
    return null;
  } catch {
    return null;
  }
}
