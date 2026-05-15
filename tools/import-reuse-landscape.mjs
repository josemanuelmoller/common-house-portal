#!/usr/bin/env node
/**
 * Parse reuse-landscape-database.csv (PR3 / Ellen MacArthur reuse atlas style)
 * and emit batched SQL files for upsert into public.reuse_landscape.
 *
 * Usage:
 *   node tools/import-reuse-landscape.mjs <path-to-csv> [--batch-size=100]
 *
 * Output:
 *   tmp/reuse-landscape/parsed.json     full parsed records (for inspection)
 *   tmp/reuse-landscape/sql/NNN.sql     batched UPSERT statements
 *
 * The SQL files are intended to be executed one at a time via the Supabase
 * MCP execute_sql tool (commonhouse project id rjcsasbaxihaubkkkxrt).
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

// ---------- CLI ----------
const args = process.argv.slice(2);
const csvPath = args.find((a) => !a.startsWith("--"));
if (!csvPath) {
  console.error("usage: node tools/import-reuse-landscape.mjs <csv> [--batch-size=100]");
  process.exit(1);
}
const batchSize = Number(args.find((a) => a.startsWith("--batch-size="))?.split("=")[1] || 100);

// ---------- CSV parser (RFC 4180-ish, handles quoted multi-line cells) ----------
function parseCsv(text) {
  // Strip BOM
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);

  const records = [];
  let row = [];
  let cell = "";
  let inQuotes = false;
  let i = 0;
  const n = text.length;

  while (i < n) {
    const c = text[i];

    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      cell += c;
      i++;
      continue;
    }

    if (c === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (c === ",") {
      row.push(cell);
      cell = "";
      i++;
      continue;
    }
    if (c === "\r") {
      i++;
      continue;
    }
    if (c === "\n") {
      row.push(cell);
      records.push(row);
      row = [];
      cell = "";
      i++;
      continue;
    }
    cell += c;
    i++;
  }
  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    records.push(row);
  }
  return records;
}

// ---------- Header normalization ----------
function normalizeHeader(h) {
  return (h || "")
    .replace(/\s+/g, " ")
    .replace(/ /g, " ")
    .trim();
}

// ---------- Header → column mapping ----------
// We match on the *first* informative tokens, since some headers wrap.
const HEADER_MAP = [
  ["Solution",                                    "solution_name"],
  ["Organization",                                "organization_name"],
  ["Website",                                     "website"],
  ["Name(s) of picture",                          "_skip_picture"],
  ["Solution Category",                           "solution_category"],
  ["Solution Sub-Category",                       "sub_category"],
  ["What is this a solution for",                 "waste_types_raw"],
  ["Solution Description",                        "description"],
  ["Organization Description",                    "mission"],
  ["EMF quadrant",                                "emf_quadrant"],
  ["Reusable item material",                      "reusable_item_material"],
  ["Material - Clean Categories",                 "materials_raw"],
  ["Reusable item belongs to",                    "reusable_item_belongs_to"],
  ["Type of Fee",                                 "fee_type"],
  ["Incentive Program",                           "incentive_program"],
  ["Membership/ Subscription Program",            "subscription_type"],
  ["Who washes reusable item",                    "wash_party"],
  ["Return Rate as a percentage",                 "return_rate"],
  ["Second Use Rate of Program",                  "second_use_rate"],
  ["Restaurants /Cafes",                          "_ch_restaurants"],
  ["Cities",                                      "_ch_cities"],
  ["Events",                                      "_ch_events"],
  ["Corporate (Cafeterias",                       "_ch_corporate"],
  ["Festivals",                                   "_ch_festivals"],
  ["Stadiums",                                    "_ch_stadiums"],
  ["Package- Free Shop - Food & Bev",             "_ch_pkgfree_food"],
  ["Package - Free Shop - Home & Personal Care",  "_ch_pkgfree_home"],
  ["Local Delivery",                              "_ch_local_delivery"],
  ["Delivery by Mail",                            "_ch_delivery_mail"],
  ["Could this solution be used at a small store","small_store_compatible"],
  ["Is this solution accessible to people who earn below average income", "low_income_accessible"],
  ["Could this solution employ informal sector workers","informal_sector_compatible"],
  ["For-Profit or Non-profit",                    "for_profit"],
  ["For Profit Engaged in Advocacy Work",         "for_profit_advocacy"],
  ["Nature of Advocacy Work",                     "advocacy_nature"],
  ["Program/Campaign Type",                       "stage"],
  ["Year Founded",                                "year_founded"],
  ["Year Activity Started",                       "year_started"],
  ["Status of identifying years",                 "year_status_note"],
  ["Headquarters",                                "headquarters"],
  ["HQ Country",                                  "hq_country"],
  ["Active Regions",                              "active_regions_raw"],
  ["Website/ Social Media Language",              "languages_raw"],
  ["2020 Project Budget",                         "budget_2020_usd"],
  ["2020 Organization Budget",                    "org_budget_2020_usd"],
  ["No. of Employees",                            "employees_band"],
  ["Funding Received by Organization",            "funding_received"],
  ["Impact Measured",                             "impact_description"],
  ["2020 Impact (Tons of Plastic Avoided)",       "tons_plastic_avoided_2020"],
  ["2020 Impact (GHG Emissions Avoided)",         "ghg_avoided_2020"],
  ["2020 Reach (No. of Users)",                   "users_2020"],
  ["2020 Reach (No. of products circulated)",     "products_circulated_2020"],
  ["Key Leadership",                              "key_leadership"],
  ["Active/Inactive",                             "status"],
  ["Date Program/ Campaign Ended",                "end_date"],
  ["Year Activity Ended",                         "year_ended"],
  ["Actively seeking funding",                    "seeking_funding"],
  ["Actively seeking advisors",                   "seeking_advisors"],
  ["Actively hiring",                             "actively_hiring"],
  ["Partner Organizations",                       "partner_orgs"],
  ["Data Validated by Organization",              "data_validated_by_org"],
  ["Date Entry Last Updated",                     "data_last_updated"],
];

// Sort prefixes DESC so longer/more-specific match first ("Solution Description"
// must beat "Solution"). Build once at module load.
const HEADER_MAP_SORTED = [...HEADER_MAP].sort((a, b) => b[0].length - a[0].length);

function mapHeader(h) {
  const norm = normalizeHeader(h).toLowerCase();
  for (const [prefix, key] of HEADER_MAP_SORTED) {
    if (norm.startsWith(prefix.toLowerCase())) return key;
  }
  return null; // → country column candidate
}

// ---------- Helpers ----------
const truthyMark = (v) => {
  const s = (v ?? "").toString().trim().toLowerCase();
  return s === "x" || s === "y" || s === "yes" || s === "true";
};

const splitMulti = (v) => {
  if (!v) return [];
  return v
    .toString()
    .split(/[\n,;/]+/g)
    .map((s) => s.trim())
    .filter(Boolean);
};

const parseYear = (v) => {
  const m = (v ?? "").toString().match(/\b(19|20)\d{2}\b/);
  return m ? Number(m[0]) : null;
};

// SQL literal: dollar-quoted to avoid any escape pain
function sqlText(v) {
  if (v === null || v === undefined) return "NULL";
  const s = v.toString();
  if (s === "") return "NULL";
  return `$q$${s.replace(/\$q\$/g, "$q\\$")}$q$`;
}
function sqlInt(v) {
  if (v === null || v === undefined || v === "") return "NULL";
  const n = Number(v);
  return Number.isFinite(n) ? String(Math.trunc(n)) : "NULL";
}
function sqlArr(arr) {
  if (!arr || arr.length === 0) return "NULL";
  const items = arr.map((s) => `"${String(s).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`).join(",");
  return `$q${items.length}$ARR{${items}}$q${items.length}$ARR::text[]`;
}
// Simpler array literal — use PG array constructor instead, less fragile
function sqlArrLit(arr) {
  if (!arr || arr.length === 0) return "NULL";
  const items = arr.map(sqlText).join(",");
  return `ARRAY[${items}]::text[]`;
}
function sqlJsonb(obj) {
  if (!obj) return "NULL";
  const s = JSON.stringify(obj);
  return `${sqlText(s)}::jsonb`;
}

// ---------- Main ----------
const raw = readFileSync(resolve(csvPath), "utf8");
const records = parseCsv(raw);
console.log(`parsed ${records.length} raw rows`);

// The first record is the header.
const headerRow = records[0].map(normalizeHeader);
console.log(`header has ${headerRow.length} columns`);

// Build column index map.
const colMap = headerRow.map(mapHeader);
const countryCols = [];
for (let i = 0; i < headerRow.length; i++) {
  if (colMap[i] === null) countryCols.push({ idx: i, name: headerRow[i] });
}
console.log(`detected ${countryCols.length} country columns`);

const channelKeys = {
  _ch_restaurants:     "Restaurants/Cafes",
  _ch_cities:          "Cities",
  _ch_events:          "Events",
  _ch_corporate:       "Corporate (Cafeterias, Universities)",
  _ch_festivals:       "Festivals",
  _ch_stadiums:        "Stadiums",
  _ch_pkgfree_food:    "Package-Free Shop - Food & Bev",
  _ch_pkgfree_home:    "Package-Free Shop - Home & Personal Care",
  _ch_local_delivery:  "Local Delivery",
  _ch_delivery_mail:   "Delivery by Mail",
};

const dataRows = records.slice(1);
const out = [];
let skipped = 0;

for (const r of dataRows) {
  // Skip empty rows
  const solIdx = colMap.indexOf("solution_name");
  const orgIdx = colMap.indexOf("organization_name");
  const solName = normalizeHeader(r[solIdx] || "");
  const orgName = normalizeHeader(r[orgIdx] || "");
  if (!solName || !orgName) { skipped++; continue; }

  const obj = {
    solution_name: solName,
    organization_name: orgName,
    channels: [],
    active_countries: [],
    raw_payload: {},
  };

  for (let i = 0; i < headerRow.length; i++) {
    const key = colMap[i];
    const val = r[i] ?? "";
    if (key === null) {
      // Country column
      if (truthyMark(val)) obj.active_countries.push(headerRow[i]);
      continue;
    }
    if (key === "_skip_picture") continue;
    if (key && channelKeys[key]) {
      if (truthyMark(val)) obj.channels.push(channelKeys[key]);
      continue;
    }
    obj[key] = val.toString().trim() || null;
  }

  // Derived/cleaned fields
  obj.waste_types = splitMulti(obj.waste_types_raw);
  obj.materials = splitMulti(obj.materials_raw);
  obj.active_regions = splitMulti(obj.active_regions_raw);
  obj.languages = splitMulti(obj.languages_raw);
  delete obj.waste_types_raw;
  delete obj.materials_raw;
  delete obj.active_regions_raw;
  delete obj.languages_raw;

  obj.year_founded = parseYear(obj.year_founded);
  obj.year_started = parseYear(obj.year_started);
  obj.year_ended = parseYear(obj.year_ended);

  // Preserve full raw row for forensic re-parse
  const rawRowObj = {};
  for (let i = 0; i < headerRow.length; i++) {
    if (r[i] && String(r[i]).trim()) rawRowObj[headerRow[i]] = r[i];
  }
  obj.raw_payload = rawRowObj;

  out.push(obj);
}

console.log(`built ${out.length} import records (skipped ${skipped} empty/incomplete)`);

// Write parsed.json for inspection
mkdirSync("tmp/reuse-landscape/sql", { recursive: true });
writeFileSync("tmp/reuse-landscape/parsed.json", JSON.stringify(out, null, 2));

// ---------- Emit SQL batches ----------
const COLS = [
  "solution_name","organization_name","website","description","mission",
  "solution_category","sub_category","waste_types","emf_quadrant",
  "reusable_item_material","materials","reusable_item_belongs_to",
  "fee_type","incentive_program","subscription_type","wash_party",
  "return_rate","second_use_rate","channels",
  "small_store_compatible","low_income_accessible","informal_sector_compatible",
  "for_profit","for_profit_advocacy","advocacy_nature","stage",
  "year_founded","year_started","year_status_note",
  "headquarters","hq_country","active_regions","active_countries","languages",
  "budget_2020_usd","org_budget_2020_usd","employees_band","funding_received",
  "impact_description","tons_plastic_avoided_2020","ghg_avoided_2020",
  "users_2020","products_circulated_2020",
  "key_leadership","status","end_date","year_ended",
  "seeking_funding","seeking_advisors","actively_hiring","partner_orgs",
  "data_validated_by_org","data_last_updated","raw_payload"
];

function rowSql(o) {
  const parts = COLS.map((c) => {
    if (c === "waste_types" || c === "materials" || c === "active_regions" ||
        c === "active_countries" || c === "languages" || c === "channels") {
      return sqlArrLit(o[c] || []);
    }
    if (c === "year_founded" || c === "year_started" || c === "year_ended") {
      return sqlInt(o[c]);
    }
    if (c === "raw_payload") return sqlJsonb(o[c]);
    return sqlText(o[c] ?? null);
  });
  return `(${parts.join(",")})`;
}

const updateSets = COLS
  .filter((c) => c !== "solution_name" && c !== "organization_name")
  .map((c) => `${c} = EXCLUDED.${c}`)
  .join(",\n    ");

let batchIdx = 0;
for (let start = 0; start < out.length; start += batchSize) {
  batchIdx++;
  const chunk = out.slice(start, start + batchSize);
  const sql =
    `-- batch ${batchIdx}: rows ${start + 1}..${start + chunk.length}\n` +
    `INSERT INTO public.reuse_landscape (\n  ${COLS.join(",\n  ")}\n) VALUES\n` +
    chunk.map(rowSql).join(",\n") +
    `\nON CONFLICT (organization_name, solution_name) DO UPDATE SET\n    ${updateSets};\n`;
  const file = `tmp/reuse-landscape/sql/${String(batchIdx).padStart(3, "0")}.sql`;
  writeFileSync(file, sql);
}

console.log(`wrote ${batchIdx} batch SQL files to tmp/reuse-landscape/sql/`);
console.log("next: execute each batch via supabase MCP execute_sql");
