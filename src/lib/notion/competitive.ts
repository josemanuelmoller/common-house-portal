/**
 * CH Competitive Intel reader — surfaces recent entries written by
 * /api/competitive-monitor on the Hall.
 *
 * Migrated OFF Notion (2026-06 cutoff). All data now comes from Supabase:
 *   - competitive_intel  → recent signals
 *   - watchlist_entities → entity name/type lookup
 *
 * Two-query design:
 *   1. One query to competitive_intel for recent rows (last 30 days)
 *   2. One query to watchlist_entities for all entries → ID→{name, type} map
 *   3. Join in memory so each signal carries its entity's name and type
 *      without N extra row lookups.
 *
 * Record `id` is the row `notion_id`; the Notion URL is reconstructed from it.
 */

export type CompetitiveIntelRow = {
  id: string;
  notionUrl: string;
  title: string;
  summary: string;
  signalType: string | null;   // Producto | Pricing | Campana | Contenido | Partnership | Hiring | Funding | Evento | Grant | Media / PR
  relevance: string | null;    // Alta | Media | Baja
  status: string | null;       // New | Reviewed | Archived
  sourceUrl: string | null;
  dateCaptured: string | null;
  entityName: string | null;   // name of the Watchlist entry (competitor / sector body)
  entityType: string | null;   // Competitor | Sector | Partner | Referente | Cliente potencial
};

export type WatchlistEntity = {
  id: string;
  name: string;
  type: string | null;
  website: string | null;
  scanFrequency: string | null;
};

type WatchlistLite = { name: string; type: string | null };

function notionUrlFrom(notionId: string): string {
  return `https://www.notion.so/${notionId.replace(/-/g, "")}`;
}

export async function getWatchlistEntities(): Promise<WatchlistEntity[]> {
  try {
    const { getSupabaseServerClient } = await import("../supabase-server");
    const sb = getSupabaseServerClient();

    const { data, error } = await sb
      .from("watchlist_entities")
      .select("notion_id, name, watch_type, url")
      .order("name", { ascending: true })
      .limit(100);

    if (error || !data) return [];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (data as any[]).map((p) => ({
      id:            p.notion_id,
      name:          p.name || "Unknown",
      type:          p.watch_type ?? null,
      website:       typeof p.url === "string" && p.url.length > 0 ? p.url : null,
      scanFrequency: null,
    }));
  } catch {
    return [];
  }
}

async function fetchWatchlistMap(): Promise<Map<string, WatchlistLite>> {
  const map = new Map<string, WatchlistLite>();
  try {
    const { getSupabaseServerClient } = await import("../supabase-server");
    const sb = getSupabaseServerClient();

    const { data, error } = await sb
      .from("watchlist_entities")
      .select("notion_id, name, watch_type")
      .limit(100);

    if (error || !data) return map;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const p of data as any[]) {
      map.set(p.notion_id, {
        name: p.name || "Unknown",
        type: p.watch_type ?? null,
      });
    }
  } catch {
    // fall through with empty map — panel still renders without entity names
  }
  return map;
}

export async function getRecentCompetitiveIntel(lookbackDays = 30): Promise<CompetitiveIntelRow[]> {
  try {
    const { getSupabaseServerClient } = await import("../supabase-server");
    const sb = getSupabaseServerClient();

    const since = new Date(Date.now() - lookbackDays * 86400_000).toISOString().slice(0, 10);
    const [intel, watchlist] = await Promise.all([
      sb
        .from("competitive_intel")
        .select(
          "notion_id, watchlist_entity_notion_id, signal_date, signal_type, title, body_md, url, notion_created_at"
        )
        .gte("signal_date", since)
        .order("signal_date", { ascending: false })
        .limit(50),
      fetchWatchlistMap(),
    ]);

    if (intel.error || !intel.data) return [];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (intel.data as any[]).map((p) => {
      const entityId: string | null = p.watchlist_entity_notion_id ?? null;
      const entity = entityId ? watchlist.get(entityId) ?? null : null;
      const sourceUrl = p.url ?? null;
      const createdAt: string | null = p.notion_created_at ?? null;
      return {
        id:           p.notion_id,
        notionUrl:    p.notion_id ? notionUrlFrom(p.notion_id) : "",
        title:        p.title || "Untitled signal",
        summary:      p.body_md ?? "",
        signalType:   p.signal_type ?? null,
        relevance:    null,
        status:       null,
        sourceUrl:    typeof sourceUrl === "string" && sourceUrl.length > 0 ? sourceUrl : null,
        dateCaptured: p.signal_date ?? (createdAt ? createdAt.slice(0, 10) : null),
        entityName:   entity?.name ?? null,
        entityType:   entity?.type ?? null,
      };
    });
  } catch {
    return [];
  }
}
