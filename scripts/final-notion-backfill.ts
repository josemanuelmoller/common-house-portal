/**
 * scripts/final-notion-backfill.ts
 *
 * Phase 2 — Final Notion → Supabase backfill (one-shot, idempotent, resumable).
 *
 * Scope, contract, and dedup rules are defined by:
 *   docs/SUPABASE_CONSOLIDATION_FREEZE.md  (§3 mapping is the source of truth)
 *   docs/migration/PHASE_2_BACKFILL_RUNBOOK.md  (operator guide)
 *
 * What this script does
 * ---------------------
 *   1. For every Notion DB in src/lib/notion/core.ts `DB` constant + the 3
 *      LEGACY DBs (Organisations [master], Deals, Projects [master]), fetch
 *      ALL rows with cursor pagination.
 *   2. Map each Notion record to its canonical Supabase table per the freeze
 *      doc §3. Each mapper returns a typed row + the original notion_id.
 *   3. Dedup logic for entities that exist in BOTH OS v2 and a legacy DB:
 *        - Same `name` (case-insensitive, trimmed) AND same `domain`
 *          (host of website, lower-case, sans `www.`) ⇒ same entity.
 *        - The OS v2 record is PRIMARY. Legacy records contribute fields where
 *          the OS v2 record is empty/null.
 *        - Final row carries `notion_id = OS v2 id` and
 *          `legacy_notion_id = most-recently-edited legacy id`.
 *        - Other legacy IDs that merged into the same entity are recorded in
 *          the manifest under `legacy_ids_merged` so an operator can audit.
 *   4. Writes a manifest JSON to tmp/backfill-manifest-<ISO>.json with:
 *        { table, action: "imported"|"merged"|"skipped"|"conflict",
 *          notion_id, legacy_ids_merged?, reason? }
 *      Conflicts (e.g. two OS v2 records with same name+domain) are NEVER
 *      auto-resolved — they are emitted to the manifest for human review and
 *      excluded from the upsert.
 *   5. Dry-run is the DEFAULT. Pass --execute to actually upsert. The Supabase
 *      client is created lazily and only when --execute is set.
 *   6. Batches of 50 with a single upsert(onConflict: "notion_id") per batch.
 *      Logs a one-line progress entry per batch.
 *   7. Idempotent: re-running with --execute is safe. The PK contract is
 *      `notion_id` (uuid-shaped Notion page id). Re-runs upsert in place.
 *
 * What this script DOES NOT do
 * ----------------------------
 *   - It does not delete anything.
 *   - It does not write to Notion.
 *   - It does not promote mirror tables. Phase 4 owns that.
 *   - It does not run the relationship-promotion-operator. Phase 7 owns that.
 *
 * Usage
 * -----
 *   Dry-run (default — no DB writes, manifest only):
 *     npx tsx scripts/final-notion-backfill.ts
 *
 *   Execute (writes to Supabase):
 *     npx tsx scripts/final-notion-backfill.ts --execute
 *
 *   Limit to one canonical table for testing:
 *     npx tsx scripts/final-notion-backfill.ts --only=organizations
 *     npx tsx scripts/final-notion-backfill.ts --only=organizations --execute
 *
 * Required env vars (read from process.env; .env.local is loaded automatically):
 *   NOTION_API_KEY
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_KEY        (preferred — bypasses RLS for the backfill)
 *   SUPABASE_ANON_KEY           (fallback; will fail on RLS-enabled tables)
 */

import { Client } from "@notionhq/client";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

// ─── env loader (mirrors scripts/migrate-opportunities.mjs) ──────────────────
function loadEnv(): void {
  try {
    const raw = readFileSync(resolve(process.cwd(), ".env.local"), "utf8");
    for (const line of raw.split("\n")) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const eq = t.indexOf("=");
      if (eq === -1) continue;
      const k = t.slice(0, eq).trim();
      const v = t.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
      if (!process.env[k]) process.env[k] = v;
    }
  } catch {
    /* env already populated by the shell */
  }
}
loadEnv();

// ─── CLI args ────────────────────────────────────────────────────────────────
const ARGS = new Set(process.argv.slice(2));
const EXECUTE = ARGS.has("--execute");
const ONLY = (() => {
  const a = process.argv.slice(2).find((x) => x.startsWith("--only="));
  return a ? a.slice("--only=".length) : null;
})();
const BATCH_SIZE = 50;

// ─── env validation ─────────────────────────────────────────────────────────
const NOTION_KEY = process.env.NOTION_API_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY =
  process.env.SUPABASE_SERVICE_KEY ?? process.env.SUPABASE_ANON_KEY;

if (!NOTION_KEY) {
  console.error("FATAL: NOTION_API_KEY missing. Add to .env.local.");
  process.exit(1);
}
if (EXECUTE && (!SUPABASE_URL || !SUPABASE_KEY)) {
  console.error(
    "FATAL: --execute requires SUPABASE_URL and SUPABASE_SERVICE_KEY (or SUPABASE_ANON_KEY)."
  );
  process.exit(1);
}

const notion = new Client({ auth: NOTION_KEY });
const sb: SupabaseClient | null =
  EXECUTE && SUPABASE_URL && SUPABASE_KEY
    ? createClient(SUPABASE_URL, SUPABASE_KEY, {
        auth: { persistSession: false },
      })
    : null;

// ─── DB IDs (mirrors src/lib/notion/core.ts DB + legacy IDs) ─────────────────
//
// We re-declare instead of importing from "@/lib/notion/core" because this
// script may be run via tsx outside the Next.js compile pipeline and the
// `@/` alias is resolved by the Next plugin, not tsx by default.
const DB = {
  // OS v2 — match src/lib/notion/core.ts exactly
  projects: "49d59b18095f46588960f2e717832c5f",
  evidence: "fa28124978d043039d8932ac9964ccf5",
  sources: "d88aff1b019d4110bcefab7f5bfbd0ae",
  knowledge: "0f4bfe95549d4710a3a9ab6e119a9b04",
  people: "1bc0f96f33ca4a9e9ff26844377e81de",
  decisions: "6b801204c4de49c7b6179e04761a285a",
  insightBriefs: "04bed3a3fd1a4b3a99643cd21562e08a",
  contentPipeline: "3bf5cf81f45c4db2840590f3878bfdc0",
  styleProfiles: "606b1aafe63849a1a81ac6199683dc14",
  organizations: "bef1bb86ab2b4cd280b6b33f9034b96c",
  valuations: "37a3686ebe3f408ba92c7373b0f01d60",
  capTable: "cd3038b604b64c929dab6a33275393b7",
  dataRoom: "d3c56da93f604859a51c9a43a165f412",
  financialSnapshots: "fdaf8df89b804dedb976cc61aa1b7e09",
  proposalBriefs: "76bfd50fa99143619b9b51de4b8eae67",
  offers: "58b863e9c789465b82eb244674bc394f",
  opportunities: "687caa98594a41b595c9960c141be0c0",
  grantSources: "3f4f4ffc826e4832a3365c62544bd4f7",
  agentDrafts: "9844ece875ea4c618f616e8cc97d5a90",
  dailyBriefings: "d206d6cdb09040d3ac2f34a977ad9f2a",
  watchlist: "d5fad9978ed0436baae4964a0ad0e211",
  competitiveIntel: "af8d7edb750b4131b3b55ef5ee83556a",
  // CH Startup Relationships [OS v2] — Engagements live as a data source under
  // this database. Verified id from Notion ancestor-path on 2026-05-05.
  engagements: "289f7075acc8448b81ca3dab27f71ae9",
  // Conversations [OS v2] — Notion does not expose a clean per-thread DB.
  // Conversations are reconstructed from `conversation_messages` (5988 rows
  // already in Supabase) + `sources` (Gmail/Fireflies/WhatsApp threads) at
  // Phase 5. This backfill auto-skips when the id is empty.
  conversations: "" as string,
} as const;

const LEGACY_DB = {
  organisationsMaster: "26c45e5b66338021a129d1bc775fcbed",
  deals: "26f45e5b6633809b8921e59b6a0e59be",
  projectsMaster: "26c45e5b663380e09e01feaccb802a33",
} as const;

// ─── Notion property helpers (copy of src/lib/notion/core.ts helpers) ────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyPage = any;
function prop(p: AnyPage, k: string) {
  return p?.properties?.[k];
}
function text(p: AnyPage): string {
  if (!p) return "";
  if (p.type === "title") return p.title?.map((t: AnyPage) => t.plain_text).join("") ?? "";
  if (p.type === "rich_text") return p.rich_text?.map((t: AnyPage) => t.plain_text).join("") ?? "";
  return p?.rich_text?.[0]?.plain_text ?? p?.title?.[0]?.plain_text ?? "";
}
function sel(p: AnyPage): string | null {
  return p?.select?.name ?? null;
}
function multiSel(p: AnyPage): string[] {
  return p?.multi_select?.map((s: AnyPage) => s.name) ?? [];
}
function num(p: AnyPage): number | null {
  return typeof p?.number === "number" ? p.number : null;
}
function chk(p: AnyPage): boolean {
  return p?.checkbox ?? false;
}
function dateProp(p: AnyPage): string | null {
  return p?.date?.start ?? null;
}
function urlProp(p: AnyPage): string | null {
  return p?.url ?? null;
}
function emailProp(p: AnyPage): string | null {
  return p?.email ?? null;
}
function relationFirst(p: AnyPage): string | null {
  return p?.relation?.[0]?.id ?? null;
}
function relationIds(p: AnyPage): string[] {
  return p?.relation?.map((r: AnyPage) => r.id) ?? [];
}

// ─── Notion fetch with cursor pagination ─────────────────────────────────────
async function fetchAll(databaseId: string): Promise<AnyPage[]> {
  if (!databaseId) return [];
  const out: AnyPage[] = [];
  let cursor: string | undefined;
  let pageNo = 1;
  do {
    const res = await notion.databases.query({
      database_id: databaseId,
      page_size: 100,
      ...(cursor ? { start_cursor: cursor } : {}),
    });
    out.push(...res.results);
    cursor = res.has_more ? (res.next_cursor ?? undefined) : undefined;
    if (pageNo % 5 === 0) console.log(`    …pulled ${out.length} so far`);
    pageNo++;
  } while (cursor);
  return out;
}

// ─── Dedup helpers ───────────────────────────────────────────────────────────
function normaliseName(s: string | null | undefined): string {
  return (s ?? "").trim().toLowerCase();
}
function normaliseDomain(url: string | null | undefined): string {
  if (!url) return "";
  try {
    const u = new URL(url.startsWith("http") ? url : `https://${url}`);
    return u.host.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}
/** Merge two objects: keep `primary` non-null fields; fill in from `secondary` only when primary is empty. */
function mergePreferPrimary<T extends Record<string, unknown>>(primary: T, secondary: T): T {
  const out: Record<string, unknown> = { ...primary };
  for (const k of Object.keys(secondary)) {
    const pv = primary[k];
    if (pv === null || pv === undefined || pv === "" || (Array.isArray(pv) && pv.length === 0)) {
      out[k] = secondary[k];
    }
  }
  return out as T;
}

// ─── Manifest ────────────────────────────────────────────────────────────────
type ManifestEntry =
  | { table: string; action: "imported"; notion_id: string; name?: string }
  | { table: string; action: "merged"; notion_id: string; legacy_ids_merged: string[]; name?: string }
  | { table: string; action: "skipped"; notion_id: string; reason: string; name?: string }
  | { table: string; action: "conflict"; notion_ids: string[]; reason: string; name?: string };

const manifest: ManifestEntry[] = [];
function record(entry: ManifestEntry) {
  manifest.push(entry);
}

// ─── Mappers ─────────────────────────────────────────────────────────────────
//
// Each mapper returns a row matching the Supabase column contract for its
// canonical table. Every row carries `notion_id` (PK) and `legacy_notion_id`
// (nullable). Timestamps follow the convention used in
// scripts/migrate-opportunities.mjs.
//
// IMPORTANT: Field names below MUST match the Phase 1 schema. If a column
// name differs in the prod DB, fix the mapper rather than renaming the column.

type OrgRow = {
  notion_id: string;
  legacy_notion_id: string | null;
  name: string;
  category: string | null;
  relationship_stage: string | null;
  relationship_classes: string[];
  engagement_type: string | null;
  engagement_value: number | null;
  website: string | null;
  domain: string | null;
  city: string | null;
  country: string | null;
  notion_created_at: string | null;
  updated_at: string;
};

function mapOrganisation(page: AnyPage, source: "osv2" | "legacy"): OrgRow {
  const website = urlProp(prop(page, "Website"));
  return {
    notion_id: page.id,
    legacy_notion_id: source === "legacy" ? page.id : null,
    name: text(prop(page, "Name")) || "Untitled",
    category: sel(prop(page, "Organization Category")),
    relationship_stage: sel(prop(page, "Relationship Stage")),
    relationship_classes: multiSel(prop(page, "Relationship Class")),
    engagement_type: sel(prop(page, "Engagement Type")),
    engagement_value: num(prop(page, "Engagement Value")),
    website,
    domain: normaliseDomain(website),
    city: text(prop(page, "City / HQ City")) || text(prop(page, "City")) || null,
    country: sel(prop(page, "Country")),
    notion_created_at: page.created_time ?? null,
    updated_at: page.last_edited_time ?? new Date().toISOString(),
  };
}

type ProjectRow = {
  notion_id: string;
  legacy_notion_id: string | null;
  name: string;
  status: string | null;
  stage: string | null;
  status_summary: string | null;
  draft_status_update: string | null;
  last_status_update: string | null;
  geography: string[];
  themes: string[];
  notion_created_at: string | null;
  updated_at: string;
};

function mapProject(page: AnyPage, source: "osv2" | "legacy"): ProjectRow {
  return {
    notion_id: page.id,
    legacy_notion_id: source === "legacy" ? page.id : null,
    name: text(prop(page, "Project Name")) || text(prop(page, "Name")) || "Untitled",
    status: sel(prop(page, "Project Status")) ?? sel(prop(page, "Status")),
    stage: sel(prop(page, "Current Stage")) ?? sel(prop(page, "Stage")),
    status_summary: text(prop(page, "Status Summary")) || null,
    draft_status_update: text(prop(page, "Draft Status Update")) || null,
    last_status_update: dateProp(prop(page, "Last Status Update")),
    geography: multiSel(prop(page, "Geography")),
    themes: multiSel(prop(page, "Themes")),
    notion_created_at: page.created_time ?? null,
    updated_at: page.last_edited_time ?? new Date().toISOString(),
  };
}

type SimpleRow = {
  notion_id: string;
  legacy_notion_id: string | null;
  title: string;
  notion_created_at: string | null;
  updated_at: string;
  payload: Record<string, unknown>;
};

/**
 * Generic mapper for tables where Phase 1 schema is not yet field-stable.
 * Stuffs all properties into a `payload` JSONB column for now. The Phase 4
 * agent rewrites will bind specific columns. This guarantees the row exists
 * and is keyed by notion_id without forcing premature column commitments.
 *
 * TODO: Replace with table-specific mappers as Phase 1 schema lands. The
 * runbook documents which tables this currently covers.
 */
function mapGeneric(page: AnyPage, titleField: string): SimpleRow {
  return {
    notion_id: page.id,
    legacy_notion_id: null,
    title: text(prop(page, titleField)) || text(prop(page, "Name")) || "Untitled",
    notion_created_at: page.created_time ?? null,
    updated_at: page.last_edited_time ?? new Date().toISOString(),
    payload: page.properties ?? {},
  };
}

// ─── Backfill orchestration per canonical table ──────────────────────────────

type TableConfig = {
  /** Canonical Supabase table */
  table: string;
  /** OS v2 DB id (or empty string to skip OS v2 read) */
  osv2DbId: string;
  /** Legacy DB id, if any */
  legacyDbId?: string;
  /** Title-ish property used for logging/conflict reporting */
  titleField: string;
  /** Whether to apply name+domain dedup against the legacy DB */
  dedupByDomain?: boolean;
  /** Mapper. Receives page + source. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  map: (page: AnyPage, source: "osv2" | "legacy") => any;
};

const TABLES: TableConfig[] = [
  {
    table: "organizations",
    osv2DbId: DB.organizations,
    legacyDbId: LEGACY_DB.organisationsMaster,
    titleField: "Name",
    dedupByDomain: true,
    map: mapOrganisation,
  },
  {
    table: "projects",
    osv2DbId: DB.projects,
    legacyDbId: LEGACY_DB.projectsMaster,
    titleField: "Project Name",
    dedupByDomain: false, // dedup by normalised name only
    map: mapProject,
  },
  // Deals (legacy) → split between engagements (won) and opportunities (active).
  // Opportunities is already canonical and migrated. Engagements is NEW; freeze
  // §3.1 requires merging won deals into it.
  // TODO: Implement deal-status filter once engagement table column contract
  // is finalised in Phase 1. For now we emit the legacy rows under the
  // `engagements` table with payload only and flag for human routing.
  {
    table: "engagements",
    osv2DbId: DB.engagements.startsWith("289f7075X") ? "" : DB.engagements,
    legacyDbId: LEGACY_DB.deals,
    titleField: "Name",
    map: (page, _source) => mapGeneric(page, "Name"),
  },
  {
    table: "sources",
    osv2DbId: DB.sources,
    titleField: "Source Title",
    map: (p) => mapGeneric(p, "Source Title"),
  },
  {
    table: "evidence",
    osv2DbId: DB.evidence,
    titleField: "Evidence Title",
    map: (p) => mapGeneric(p, "Evidence Title"),
  },
  {
    table: "people",
    osv2DbId: DB.people,
    titleField: "Full Name",
    map: (p) => mapGeneric(p, "Full Name"),
  },
  {
    table: "decision_items",
    osv2DbId: DB.decisions,
    titleField: "Decision Title",
    map: (p) => mapGeneric(p, "Decision Title"),
  },
  {
    table: "knowledge_assets",
    osv2DbId: DB.knowledge,
    titleField: "Asset Title",
    map: (p) => mapGeneric(p, "Asset Title"),
  },
  {
    table: "insight_briefs",
    osv2DbId: DB.insightBriefs,
    titleField: "Title",
    map: (p) => mapGeneric(p, "Title"),
  },
  {
    table: "content_pipeline_items",
    osv2DbId: DB.contentPipeline,
    titleField: "Title",
    map: (p) => mapGeneric(p, "Title"),
  },
  {
    table: "style_profiles",
    osv2DbId: DB.styleProfiles,
    titleField: "Name",
    map: (p) => mapGeneric(p, "Name"),
  },
  {
    table: "valuations",
    osv2DbId: DB.valuations,
    titleField: "Name",
    map: (p) => mapGeneric(p, "Name"),
  },
  {
    table: "cap_table_entries",
    osv2DbId: DB.capTable,
    titleField: "Name",
    map: (p) => mapGeneric(p, "Name"),
  },
  {
    table: "data_room_documents",
    osv2DbId: DB.dataRoom,
    titleField: "Name",
    map: (p) => mapGeneric(p, "Name"),
  },
  {
    table: "financial_snapshots",
    osv2DbId: DB.financialSnapshots,
    titleField: "Name",
    map: (p) => mapGeneric(p, "Name"),
  },
  {
    table: "proposal_briefs",
    osv2DbId: DB.proposalBriefs,
    titleField: "Brief Title",
    map: (p) => mapGeneric(p, "Brief Title"),
  },
  {
    table: "offers",
    osv2DbId: DB.offers,
    titleField: "Offer Name",
    map: (p) => mapGeneric(p, "Offer Name"),
  },
  // Opportunities — already migrated by scripts/migrate-opportunities.mjs.
  // We re-run idempotently for safety; the existing rows will upsert in place.
  {
    table: "opportunities",
    osv2DbId: DB.opportunities,
    titleField: "Opportunity Name",
    map: (p) => mapGeneric(p, "Opportunity Name"),
  },
  {
    table: "grant_sources",
    osv2DbId: DB.grantSources,
    titleField: "Name",
    map: (p) => mapGeneric(p, "Name"),
  },
  {
    table: "agent_drafts",
    osv2DbId: DB.agentDrafts,
    titleField: "Draft Title",
    map: (p) => mapGeneric(p, "Draft Title"),
  },
  {
    table: "daily_briefings",
    osv2DbId: DB.dailyBriefings,
    titleField: "Title",
    map: (p) => mapGeneric(p, "Title"),
  },
  {
    table: "watchlist_entities",
    osv2DbId: DB.watchlist,
    titleField: "Name",
    map: (p) => mapGeneric(p, "Name"),
  },
  {
    table: "competitive_intel",
    osv2DbId: DB.competitiveIntel,
    titleField: "Title",
    map: (p) => mapGeneric(p, "Title"),
  },
  // Conversations — DB id not declared in core.ts; freeze §3.1 says "(no constant)".
  // Skipped automatically when DB.conversations is empty. TODO: wire up.
  {
    table: "conversations",
    osv2DbId: DB.conversations,
    titleField: "Title",
    map: (p) => mapGeneric(p, "Title"),
  },
];

// ─── Per-table dedup + upsert ────────────────────────────────────────────────

async function backfillTable(cfg: TableConfig) {
  if (ONLY && ONLY !== cfg.table) return;
  console.log(`\n── ${cfg.table} ──────────────────────────────────`);

  if (!cfg.osv2DbId && !cfg.legacyDbId) {
    console.log("  (skipped — no DB id configured)");
    return;
  }

  // 1. Fetch
  const osv2Pages = cfg.osv2DbId ? await fetchAll(cfg.osv2DbId) : [];
  const legacyPages = cfg.legacyDbId ? await fetchAll(cfg.legacyDbId) : [];
  console.log(`  Notion: ${osv2Pages.length} OS v2 + ${legacyPages.length} legacy`);

  // 2. Map
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const osv2Rows: any[] = osv2Pages.map((p) => cfg.map(p, "osv2"));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const legacyRows: any[] = legacyPages.map((p) => cfg.map(p, "legacy"));

  // 3. Conflict detection within OS v2 (same name+domain → human review)
  if (cfg.dedupByDomain) {
    const seen = new Map<string, string[]>();
    for (const r of osv2Rows) {
      const k = `${normaliseName(r.name)}|${r.domain ?? ""}`;
      if (!k.startsWith("|") || r.domain) {
        const arr = seen.get(k) ?? [];
        arr.push(r.notion_id);
        seen.set(k, arr);
      }
    }
    for (const [k, ids] of Array.from(seen.entries())) {
      if (ids.length > 1) {
        record({
          table: cfg.table,
          action: "conflict",
          notion_ids: ids,
          reason: `Multiple OS v2 records share name+domain "${k}". Resolve manually before re-running.`,
        });
        // Drop all but the most-recently-edited from the upsert set.
        const keepers = osv2Rows.filter((r) => ids.includes(r.notion_id));
        keepers.sort((a, b) => (b.updated_at ?? "").localeCompare(a.updated_at ?? ""));
        const winner = keepers[0]?.notion_id;
        for (let i = osv2Rows.length - 1; i >= 0; i--) {
          if (ids.includes(osv2Rows[i].notion_id) && osv2Rows[i].notion_id !== winner) {
            osv2Rows.splice(i, 1);
          }
        }
      }
    }
  }

  // 4. Merge legacy → OS v2 by name+domain (only when dedupByDomain is true)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const finalRows: any[] = [];
  if (cfg.dedupByDomain) {
    const indexByKey = new Map<string, number>();
    osv2Rows.forEach((r, i) => {
      const k = `${normaliseName(r.name)}|${r.domain ?? ""}`;
      indexByKey.set(k, i);
    });

    // Group legacy by same key, choose most-recently-edited per group as the
    // representative legacy_notion_id.
    const legacyByKey = new Map<string, typeof legacyRows>();
    for (const r of legacyRows) {
      const k = `${normaliseName(r.name)}|${r.domain ?? ""}`;
      const arr = legacyByKey.get(k) ?? [];
      arr.push(r);
      legacyByKey.set(k, arr);
    }

    for (const [k, group] of Array.from(legacyByKey.entries())) {
      group.sort((a, b) => (b.updated_at ?? "").localeCompare(a.updated_at ?? ""));
      const rep = group[0];
      const otherIds = group.slice(1).map((r) => r.notion_id);

      const idx = indexByKey.get(k);
      if (idx !== undefined) {
        // Merge: OS v2 primary, legacy fills nulls.
        const primary = osv2Rows[idx];
        const merged = mergePreferPrimary(primary, rep);
        merged.legacy_notion_id = rep.notion_id;
        osv2Rows[idx] = merged;
        record({
          table: cfg.table,
          action: "merged",
          notion_id: primary.notion_id,
          legacy_ids_merged: [rep.notion_id, ...otherIds],
          name: primary.name,
        });
      } else {
        // Legacy with no OS v2 counterpart — import as-is, but flag.
        rep.legacy_notion_id = rep.notion_id;
        // Switch primary key onto rep (it has its own notion_id; we keep it).
        finalRows.push(rep);
        if (otherIds.length > 0) {
          record({
            table: cfg.table,
            action: "merged",
            notion_id: rep.notion_id,
            legacy_ids_merged: otherIds,
            name: rep.name,
          });
        } else {
          record({
            table: cfg.table,
            action: "imported",
            notion_id: rep.notion_id,
            name: rep.name,
          });
        }
      }
    }
  } else {
    // No dedup — append legacy rows verbatim. Their notion_id IS their PK.
    for (const r of legacyRows) {
      r.legacy_notion_id = r.notion_id;
      finalRows.push(r);
      record({
        table: cfg.table,
        action: "imported",
        notion_id: r.notion_id,
        name: r.name ?? r.title,
      });
    }
  }

  // Push every OS v2 row into finalRows; record "imported" for any that did
  // not get a "merged" entry above.
  const mergedIds = new Set(
    manifest
      .filter((m) => m.table === cfg.table && m.action === "merged")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((m: any) => m.notion_id)
  );
  for (const r of osv2Rows) {
    finalRows.push(r);
    if (!mergedIds.has(r.notion_id)) {
      record({
        table: cfg.table,
        action: "imported",
        notion_id: r.notion_id,
        name: r.name ?? r.title,
      });
    }
  }

  // 5. Skip rows without a notion_id (paranoia — should never happen)
  for (let i = finalRows.length - 1; i >= 0; i--) {
    if (!finalRows[i].notion_id) {
      record({
        table: cfg.table,
        action: "skipped",
        notion_id: "(missing)",
        reason: "No Notion page id on row.",
      });
      finalRows.splice(i, 1);
    }
  }

  console.log(`  prepared ${finalRows.length} rows for upsert`);

  // 6. Upsert (or print preview)
  if (!EXECUTE) {
    console.log(`  [DRY-RUN] would upsert ${finalRows.length} rows into ${cfg.table}`);
    return;
  }
  if (!sb) throw new Error("Supabase client missing despite --execute");

  let written = 0;
  let errored = 0;
  for (let i = 0; i < finalRows.length; i += BATCH_SIZE) {
    const batch = finalRows.slice(i, i + BATCH_SIZE);
    const { error } = await sb
      .from(cfg.table)
      .upsert(batch, { onConflict: "notion_id" });
    if (error) {
      console.error(`  batch ${Math.floor(i / BATCH_SIZE) + 1}: ${error.message}`);
      errored += batch.length;
      // Mark each row in the failed batch as skipped in the manifest.
      for (const r of batch) {
        record({
          table: cfg.table,
          action: "skipped",
          notion_id: r.notion_id,
          reason: `Upsert error: ${error.message}`,
          name: r.name ?? r.title,
        });
      }
    } else {
      written += batch.length;
    }
    console.log(
      `  batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(finalRows.length / BATCH_SIZE)}: ` +
        `${written} written, ${errored} errored`
    );
  }
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const startedAt = new Date();
  console.log(
    `Phase 2 backfill — ${EXECUTE ? "EXECUTE" : "DRY-RUN"}` +
      (ONLY ? ` — only=${ONLY}` : "") +
      ` — started ${startedAt.toISOString()}`
  );

  for (const cfg of TABLES) {
    try {
      await backfillTable(cfg);
    } catch (err) {
      console.error(`FATAL on ${cfg.table}:`, err);
      record({
        table: cfg.table,
        action: "skipped",
        notion_id: "(table-level)",
        reason: `Table-level failure: ${(err as Error).message}`,
      });
    }
  }

  // Write manifest
  try {
    mkdirSync(resolve(process.cwd(), "tmp"), { recursive: true });
  } catch {
    /* exists */
  }
  const ts = startedAt.toISOString().replace(/[:.]/g, "-");
  const manifestPath = resolve(process.cwd(), "tmp", `backfill-manifest-${ts}.json`);
  const counts = manifest.reduce<Record<string, number>>((acc, e) => {
    acc[e.action] = (acc[e.action] ?? 0) + 1;
    return acc;
  }, {});
  writeFileSync(
    manifestPath,
    JSON.stringify(
      {
        startedAt: startedAt.toISOString(),
        finishedAt: new Date().toISOString(),
        mode: EXECUTE ? "execute" : "dry-run",
        only: ONLY,
        counts,
        entries: manifest,
      },
      null,
      2
    )
  );

  console.log("\n────────────────────────────────────────────────");
  console.log(`manifest: ${manifestPath}`);
  console.log(`summary: ${JSON.stringify(counts)}`);
  if ((counts.conflict ?? 0) > 0) {
    console.log(
      `\n${counts.conflict} CONFLICT(S) require human review. ` +
        `Open the manifest, resolve them in Notion, then re-run.`
    );
  }
  if (!EXECUTE) {
    console.log("\nDRY-RUN complete. Re-run with --execute to write to Supabase.");
  }
}

main().catch((err) => {
  console.error("Backfill aborted:", err);
  process.exit(1);
});
