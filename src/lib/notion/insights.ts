// ─── Insight Briefs ───────────────────────────────────────────────────────────
//
// Supabase-backed (post-Notion cutoff). Reads the canonical `insight_briefs`
// table. No Notion API usage. Return shape is identical to the pre-migration
// Notion reader so downstream callers are unaffected.
//
// Data note: `theme` lives in `payload.theme` (single value → 1-element array).
// `relevance`, `communityRelevant` and `visibility` have no canonical column or
// payload key post-migration, so they default to empty / false / "". The
// `communityOnly` filter is applied in-memory to preserve the original
// signature and behaviour without querying a non-existent column.

type InsightBriefPayload = {
  theme?: string | null;
  source_link?: string | null;
  notion_url?: string | null;
};

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
    const { getSupabaseServerClient } = await import("../supabase-server");
    const sb = getSupabaseServerClient();

    const { data, error } = await sb
      .from("insight_briefs")
      .select("id, notion_id, title, brief_type, status, scope, payload, updated_at, notion_created_at")
      .order("updated_at", { ascending: false })
      .limit(50);

    if (error || !data) return [];

    const briefs: InsightBrief[] = (data as Record<string, unknown>[]).map(r => {
      const p = (r.payload && typeof r.payload === "object" ? r.payload : {}) as InsightBriefPayload;
      return {
        id:                ((r.notion_id as string | null) ?? (r.id as string)),
        title:             (r.title as string | null) || "Untitled",
        theme:             p.theme ? [p.theme] : [],
        relevance:         [],
        status:            (r.status as string | null) ?? "",
        communityRelevant: false,
        visibility:        (r.scope as string | null) ?? "",
        lastEdited:        (r.updated_at as string | null) ?? (r.notion_created_at as string | null) ?? null,
      };
    });

    return communityOnly ? briefs.filter(b => b.communityRelevant) : briefs;
  } catch {
    return [];
  }
}
