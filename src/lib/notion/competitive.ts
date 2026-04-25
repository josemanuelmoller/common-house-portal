/**
 * CH Competitive Intel reader — surfaces recent entries written by
 * /api/competitive-monitor on the Hall.
 *
 * Two-query design:
 *   1. One query to Intel for recent rows (last 30 days, Status != Archived)
 *   2. One query to Watchlist for all Active entries → ID→{name, type} map
 *   3. Join in memory so each signal carries its entity's name and type
 *      without N extra pages.retrieve calls.
 */

import { notion, DB, prop, text, select, date } from "./core";

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

export async function getWatchlistEntities(): Promise<WatchlistEntity[]> {
  try {
    const res = await notion.databases.query({
      database_id: DB.watchlist,
      filter: { property: "Active", checkbox: { equals: true } },
      sorts: [{ property: "Name", direction: "ascending" }],
      page_size: 100,
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (res.results as any[]).map((p) => ({
      id:            p.id,
      name:          text(prop(p, "Name")) || "Unknown",
      type:          select(prop(p, "Type")) || null,
      website:       p.properties?.["Website"]?.url ?? null,
      scanFrequency: select(prop(p, "Scan Frequency")) || null,
    }));
  } catch {
    return [];
  }
}

async function fetchWatchlistMap(): Promise<Map<string, WatchlistLite>> {
  const map = new Map<string, WatchlistLite>();
  try {
    const res = await notion.databases.query({
      database_id: DB.watchlist,
      filter: { property: "Active", checkbox: { equals: true } },
      page_size: 100,
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const p of res.results as any[]) {
      map.set(p.id, {
        name: text(prop(p, "Name")) || "Unknown",
        type: select(prop(p, "Type")) || null,
      });
    }
  } catch {
    // fall through with empty map — panel still renders without entity names
  }
  return map;
}

export async function getRecentCompetitiveIntel(lookbackDays = 30): Promise<CompetitiveIntelRow[]> {
  try {
    const since = new Date(Date.now() - lookbackDays * 86400_000).toISOString().slice(0, 10);
    const [intel, watchlist] = await Promise.all([
      notion.databases.query({
        database_id: DB.competitiveIntel,
        filter: {
          and: [
            { property: "Status", select: { does_not_equal: "Archived" } },
            { property: "Date Captured", date: { on_or_after: since } },
          ],
        },
        sorts: [{ property: "Date Captured", direction: "descending" }],
        page_size: 50,
      }),
      fetchWatchlistMap(),
    ]);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (intel.results as any[]).map((p) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rel = (p.properties?.["Watchlist Entry"]?.relation ?? []) as Array<{ id: string }>;
      const entity = rel[0]?.id ? watchlist.get(rel[0].id) ?? null : null;
      const sourceUrl = p.properties?.["Source URL"]?.url ?? null;
      return {
        id:           p.id,
        notionUrl:    p.url ?? "",
        title:        text(prop(p, "Title")) || "Untitled signal",
        summary:      text(prop(p, "Summary")),
        signalType:   select(prop(p, "Signal Type")) || null,
        relevance:    select(prop(p, "Relevance")) || null,
        status:       select(prop(p, "Status")) || null,
        sourceUrl:    typeof sourceUrl === "string" && sourceUrl.length > 0 ? sourceUrl : null,
        dateCaptured: date(prop(p, "Date Captured")) ?? p.created_time?.slice(0, 10) ?? null,
        entityName:   entity?.name ?? null,
        entityType:   entity?.type ?? null,
      };
    });
  } catch {
    return [];
  }
}
