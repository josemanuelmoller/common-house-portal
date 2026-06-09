import { requireAdmin } from "@/lib/require-admin";
import { Sidebar } from "@/components/Sidebar";
import { InsightsTabs, type InsightBriefRow } from "./InsightsTabs";
import { getSupabaseServerClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

/**
 * Insight Briefs reader — pulls from the `notion_insight_briefs` Supabase
 * mirror (sync runs daily from Notion). Returns the rows shape the client
 * tab component expects. Best-effort: a transient failure renders an empty
 * state instead of crashing the page.
 */
async function loadBriefs(): Promise<InsightBriefRow[]> {
  try {
    const sb = getSupabaseServerClient();
    const { data, error } = await sb
      .from("notion_insight_briefs")
      .select("id, title, source_link, notion_url, theme, source_type, last_edited_at")
      .order("last_edited_at", { ascending: false })
      .limit(50);
    if (error || !data) return [];
    return (data as Array<{
      id: string;
      title: string | null;
      source_link: string | null;
      notion_url: string | null;
      theme: string | string[] | null;
      source_type: string | null;
      last_edited_at: string | null;
    }>).map(r => ({
      id: r.id,
      title: r.title ?? "Untitled brief",
      sourceLink: r.source_link,
      notionUrl: r.notion_url ?? "",
      theme: Array.isArray(r.theme) ? r.theme : r.theme ? [r.theme] : [],
      sourceType: r.source_type,
      lastEditedAt: r.last_edited_at,
    }));
  } catch (e) {
    console.error("[admin/insights] loadBriefs failed:", e);
    return [];
  }
}

export default async function InsightsPage() {
  await requireAdmin();
  const briefs = await loadBriefs();

  return (
    <div className="flex min-h-screen" style={{ background: "var(--hall-paper-0)" }}>
      <Sidebar adminNav />
      <main
        className="flex-1 md:ml-[228px]"
        style={{ fontFamily: "var(--font-hall-sans)", background: "var(--hall-paper-0)" }}
      >
        {/* InsightsTabs renders its own header + tab bar + content. Briefs
            come from notion_insight_briefs (Supabase mirror), no more
            hardcoded DUMMY arrays. */}
        <InsightsTabs briefs={briefs} />
      </main>
    </div>
  );
}
