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

// Fetch the most recent briefing whose Market Signals field is non-empty,
// regardless of date. Used by the Hall so the panel always shows the last
// known signals with a clear "generated on" timestamp.
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
          generatedAt: date(prop(page, "Generated At")),
        };
      }
    }
    return null;
  } catch {
    return null;
  }
}
