import { requireAdmin } from "@/lib/require-admin";
import { Sidebar } from "@/components/Sidebar";
import { InsightsTabs, type InsightBriefRow } from "./InsightsTabs";
import { getSupabaseServerClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

/**
 * Insight Briefs reader — CANONICAL `insight_briefs` table. (Until 2026-06-10
 * this read the notion_insight_briefs mirror, slated for DROP at Phase 6 —
 * the page would have gone blank at the drop.) source_link / theme /
 * notion_url live in payload; brief_type maps to the old source_type chip.
 * Best-effort: a transient failure renders an empty state, not a crash.
 */
async function loadBriefs(): Promise<InsightBriefRow[]> {
  try {
    const sb = getSupabaseServerClient();
    const { data, error } = await sb
      .from("insight_briefs")
      .select("id, title, brief_type, payload, updated_at, notion_created_at")
      .order("updated_at", { ascending: false })
      .limit(50);
    if (error || !data) return [];
    return (data as Array<{
      id: string;
      title: string | null;
      brief_type: string | null;
      payload: { source_link?: string | null; notion_url?: string | null; theme?: string | string[] | null } | null;
      updated_at: string | null;
      notion_created_at: string | null;
    }>).map(r => {
      const p = r.payload ?? {};
      return {
        id: r.id,
        title: r.title ?? "Untitled brief",
        sourceLink: p.source_link ?? null,
        notionUrl: p.notion_url ?? "",
        theme: Array.isArray(p.theme) ? p.theme : p.theme ? [p.theme] : [],
        sourceType: r.brief_type,
        lastEditedAt: r.updated_at ?? r.notion_created_at,
      };
    });
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
            come from the canonical insight_briefs table. */}
        <InsightsTabs briefs={briefs} />
      </main>
    </div>
  );
}
