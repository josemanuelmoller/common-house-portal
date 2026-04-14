import { notion, DB, prop, text, select, multiSelect, checkbox } from "./core";

// ─── Insight Briefs ───────────────────────────────────────────────────────────

export type InsightBrief = {
  id: string;
  title: string;
  theme: string[];
  relevance: string[];
  status: string;
  communityRelevant: boolean;
  visibility: string;
  lastEdited: string | null;
};

export async function getInsightBriefs(communityOnly = false): Promise<InsightBrief[]> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const filter: any = communityOnly
      ? { property: "Community Relevant", checkbox: { equals: true } }
      : undefined;

    const res = await notion.databases.query({
      database_id: DB.insightBriefs,
      filter,
      sorts: [{ timestamp: "last_edited_time", direction: "descending" }],
      page_size: 50,
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return res.results.map((page: any) => ({
      id: page.id,
      title: text(prop(page, "Brief Title")) || text(prop(page, "Name")) || "Untitled",
      theme: multiSelect(prop(page, "Theme")),
      relevance: multiSelect(prop(page, "Relevance")),
      status: select(prop(page, "Status")),
      communityRelevant: checkbox(prop(page, "Community Relevant")),
      visibility: select(prop(page, "Visibility")),
      lastEdited: page.last_edited_time ?? null,
    }));
  } catch {
    return [];
  }
}
