/**
 * /admin/watchlist — mini-CRUD for the canonical Supabase
 * `watchlist_entities` table.
 *
 * Phase-5 surface. Read path is server-side; mutations go through the
 * <WatchlistEditor> client component which calls /api/admin/watchlist*.
 */

import { requireAdmin } from "@/lib/require-admin";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { PortalShell } from "@/components/PortalShell";
import { HallSection } from "@/components/HallSection";
import { WatchlistEditor, type WatchlistRow } from "@/components/WatchlistEditor";

export const dynamic = "force-dynamic";

type RowFromDb = WatchlistRow & {
  payload: Record<string, unknown> | null;
};

export default async function WatchlistPage() {
  await requireAdmin();

  const sb = getSupabaseServerClient();
  const { data, error } = await sb
    .from("watchlist_entities")
    .select(
      "id, notion_id, name, watch_type, url, themes, notes, payload, created_at, updated_at"
    )
    .order("updated_at", { ascending: false });

  // Filter out soft-archived rows (payload.archived === true) — see freeze §10.3
  // for why archive lives in `payload` until a dedicated status column lands.
  const allRows = (data as RowFromDb[] | null) ?? [];
  const rows: WatchlistRow[] = allRows
    .filter((r) => r.payload?.archived !== true)
    .map((r) => {
      const { payload: _ignored, ...rest } = r;
      void _ignored;
      return rest;
    });

  return (
    <PortalShell
      eyebrow={{ label: "WATCHLIST", accent: `${rows.length} ACTIVE` }}
      title="Watchlist"
      flourish="entities"
      subtitle="Competitors, trends, regulators, funders, and partners we are tracking. Archive removes from view but keeps the row for audit."
      meta={
        <span
          className="text-[10px]"
          style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted-2)" }}
        >
          {rows.length} ACTIVE
        </span>
      }
      metaMobile={
        <span
          className="text-[10px]"
          style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted-2)" }}
        >
          <b style={{ color: "var(--hall-ink-0)" }}>{rows.length}</b>
        </span>
      }
    >
      {error && (
        <p
          className="text-[11px]"
          style={{ color: "var(--hall-danger)", fontFamily: "var(--font-hall-mono)" }}
        >
          Error loading watchlist: {error.message}
        </p>
      )}

      <HallSection title="Entities" flourish="we are watching">
        <WatchlistEditor initialRows={rows} />
      </HallSection>
    </PortalShell>
  );
}
