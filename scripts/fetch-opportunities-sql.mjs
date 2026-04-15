/**
 * fetch-opportunities-sql.mjs
 * Fetches ALL Opportunities from Notion [OS v2] and writes scripts/opps_temp.json.
 *
 * Wave 1 hardening — includes:
 *   - all required columns per Wave 1 spec
 *   - org_name resolution via extra API calls for related org pages
 *   - extraction rules: trim strings, empty strings → null
 *
 * Usage: node scripts/fetch-opportunities-sql.mjs
 */

import { Client } from "@notionhq/client";
import { readFileSync, writeFileSync } from "fs";
import { resolve } from "path";

// ── Load env ──────────────────────────────────────────────────────────────────
function loadEnv() {
  try {
    const raw = readFileSync(resolve(process.cwd(), ".env.local"), "utf8");
    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      const val = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
      if (!process.env[key]) process.env[key] = val;
    }
  } catch { /* already set */ }
}
loadEnv();

const NOTION_DB_OPPORTUNITIES = "687caa98594a41b595c9960c141be0c0";

// ── Property accessors ────────────────────────────────────────────────────────
function prop(page, name) { return page.properties?.[name]; }

/** Extract plain text from title or rich_text property. Trims result. */
function text(p) {
  if (!p) return null;
  let raw = "";
  if (p.type === "title")     raw = p.title?.map(t => t.plain_text).join("") ?? "";
  if (p.type === "rich_text") raw = p.rich_text?.map(t => t.plain_text).join("") ?? "";
  const trimmed = raw.trim();
  return trimmed === "" ? null : trimmed;
}

/** Extract select option name. */
function sel(p) { return p?.select?.name?.trim() || null; }

/** Extract URL property. */
function urlProp(p) { return p?.url?.trim() || null; }

/** Extract number property. */
function numProp(p) {
  if (p?.number === null || p?.number === undefined) return null;
  const n = Number(p.number);
  return isNaN(n) ? null : n;
}

/** Extract date start. */
function dateProp(p) { return p?.date?.start ?? null; }

/** First relation page id. */
function relFirst(p) { return p?.relation?.[0]?.id ?? null; }

// ── Transform ─────────────────────────────────────────────────────────────────
function transform(page, orgMap) {
  const orgNotionId = relFirst(prop(page, "Account / Organization"));

  return {
    notion_id:            page.id,
    title:                text(prop(page, "Opportunity Name")) || text(prop(page, "Name")) || "Untitled",

    // Pipeline
    status:               sel(prop(page, "Opportunity Status")) ?? "New",
    opportunity_type:     sel(prop(page, "Opportunity Type")),
    scope:                sel(prop(page, "Scope")),
    qualification_status: sel(prop(page, "Qualification Status")) ?? "Not Scored",
    priority:             sel(prop(page, "Priority")),
    probability:          sel(prop(page, "Probability")),

    // Relationship
    org_notion_id:        orgNotionId,
    org_name:             orgNotionId ? (orgMap[orgNotionId] ?? null) : null,

    // Signal and next action
    trigger_signal:       text(prop(page, "Trigger / Signal")),
    source_evidence:      text(prop(page, "Source / Evidence")),
    source_url:           urlProp(prop(page, "Source URL")),
    suggested_next_step:  text(prop(page, "Suggested Next Step")),
    notes:                text(prop(page, "Notes")),
    why_there_is_fit:     text(prop(page, "Why There Is Fit")),

    // Commercial and timing
    value_estimate:       numProp(prop(page, "Value Estimate")),
    expected_close_date:  dateProp(prop(page, "Expected Close Date")),

    // Legacy / meta (kept for backward compat — not removed)
    follow_up_status:     sel(prop(page, "Follow-up Status")),
    opportunity_score:    numProp(prop(page, "Opportunity Score")),
    pending_action:       text(prop(page, "Trigger / Signal")),  // same field as trigger_signal
    review_url:           page.url ?? null,
    notion_created_at:    page.created_time ?? null,
    created_at:           page.created_time ?? new Date().toISOString(),
    updated_at:           page.last_edited_time ?? new Date().toISOString(),
  };
}

// ── Fetch all pages (paginated) ───────────────────────────────────────────────
async function fetchAllOpportunities(notion) {
  const all = [];
  let cursor;
  let pageNum = 1;

  do {
    process.stderr.write(`  Fetching Notion page ${pageNum}...\n`);
    const res = await notion.databases.query({
      database_id: NOTION_DB_OPPORTUNITIES,
      page_size: 100,
      ...(cursor ? { start_cursor: cursor } : {}),
    });
    // Exclude archived pages (Notion soft-deletes)
    const active = res.results.filter(p => !p.archived);
    const archived = res.results.length - active.length;
    if (archived > 0) process.stderr.write(`    (excluded ${archived} archived pages)\n`);
    all.push(...active);
    cursor = res.has_more ? res.next_cursor : null;
    pageNum++;
  } while (cursor);

  return all;
}

// ── Resolve org names ─────────────────────────────────────────────────────────
async function resolveOrgNames(notion, pages) {
  const orgIds = [...new Set(
    pages
      .map(p => relFirst(prop(p, "Account / Organization")))
      .filter(Boolean)
  )];

  if (orgIds.length === 0) {
    process.stderr.write("  No org relations to resolve.\n");
    return {};
  }

  process.stderr.write(`  Resolving ${orgIds.length} unique org IDs...\n`);
  const orgMap = {};
  let resolved = 0;
  let failed = 0;

  await Promise.all(orgIds.map(async (id) => {
    try {
      const page = await notion.pages.retrieve({ page_id: id });
      // Org title is in the title property (any key of type "title")
      const titleEntry = Object.values(page.properties || {}).find(p => p.type === "title");
      const name = titleEntry?.title?.map(t => t.plain_text).join("").trim() || null;
      orgMap[id] = name;
      resolved++;
    } catch (err) {
      process.stderr.write(`    WARN: could not resolve org ${id}: ${err.message}\n`);
      orgMap[id] = null;
      failed++;
    }
  }));

  process.stderr.write(`  Org resolution: ${resolved} resolved, ${failed} failed\n`);
  return orgMap;
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  const key = process.env.NOTION_API_KEY;
  if (!key) { process.stderr.write("NOTION_API_KEY not set\n"); process.exit(1); }

  const notion = new Client({ auth: key });

  process.stderr.write("\n[1/3] Fetching opportunities from Notion...\n");
  const rawPages = await fetchAllOpportunities(notion);
  process.stderr.write(`  → ${rawPages.length} active pages fetched\n`);

  process.stderr.write("\n[2/3] Resolving org names...\n");
  const orgMap = await resolveOrgNames(notion, rawPages);

  process.stderr.write("\n[3/3] Transforming records...\n");
  const rows = rawPages.map(p => transform(p, orgMap));

  // Data quality report to stderr
  const noNotionId = rows.filter(r => !r.notion_id);
  if (noNotionId.length > 0) {
    process.stderr.write(`CRITICAL: ${noNotionId.length} rows missing notion_id — aborting\n`);
    process.exit(1);
  }
  const untitled = rows.filter(r => r.title === "Untitled").length;
  const withOrg  = rows.filter(r => r.org_notion_id).length;
  const withOrgName = rows.filter(r => r.org_name).length;
  const valueParseErrors = rows.filter(r =>
    prop(rawPages.find(p => p.id === r.notion_id), "Value Estimate")?.number !== undefined &&
    prop(rawPages.find(p => p.id === r.notion_id), "Value Estimate")?.number !== null &&
    r.value_estimate === null
  ).length;

  process.stderr.write(`  Total rows:       ${rows.length}\n`);
  process.stderr.write(`  Untitled:         ${untitled}\n`);
  process.stderr.write(`  With org rel:     ${withOrg}\n`);
  process.stderr.write(`  Org names resolved: ${withOrgName}/${withOrg}\n`);
  if (valueParseErrors > 0) process.stderr.write(`  Value parse errors: ${valueParseErrors}\n`);

  // Write to file (not stdout to avoid mixing with stderr progress)
  writeFileSync("scripts/opps_temp.json", JSON.stringify(rows, null, 2));
  process.stderr.write(`\n✓ Written scripts/opps_temp.json (${rows.length} rows)\n`);
}

main().catch(e => { process.stderr.write(`${e}\n`); process.exit(1); });
