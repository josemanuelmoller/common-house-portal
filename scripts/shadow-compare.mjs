/**
 * shadow-compare.mjs
 * Read-only shadow comparison: Notion source vs Supabase mirror.
 *
 * Produces:
 *   A. Coverage report (total, missing, orphans, duplicates)
 *   B. Field mismatch counts for 17 comparison fields
 *   C. 10 sample mismatches (worst-drift field)
 *   D. 10 sample perfect matches
 *   E. Recommendation table: field, safe for Supabase read now?, reason
 *
 * DOES NOT modify any data. Read-only.
 *
 * Usage: node scripts/shadow-compare.mjs
 */

import { readFileSync } from "fs";
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

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  process.stderr.write("SUPABASE_URL or SUPABASE_ANON_KEY not set\n");
  process.exit(1);
}

// ── Fields to compare ─────────────────────────────────────────────────────────
const COMPARE_FIELDS = [
  "title",
  "status",
  "opportunity_type",
  "scope",
  "qualification_status",
  "priority",
  "probability",
  "org_notion_id",
  "org_name",
  "trigger_signal",
  "source_evidence",
  "source_url",
  "suggested_next_step",
  "notes",
  "why_there_is_fit",
  "value_estimate",
  "expected_close_date",
];

// ── Normalizers ───────────────────────────────────────────────────────────────
function normText(val) {
  if (val === null || val === undefined) return null;
  const s = String(val).trim();
  return s === "" ? null : s;
}

function normNum(val) {
  if (val === null || val === undefined) return null;
  const n = Number(val);
  return isNaN(n) ? null : n;
}

function normDate(val) {
  // Compare only date part (YYYY-MM-DD) — Supabase stores timestamptz, Notion stores date string
  if (val === null || val === undefined) return null;
  const s = String(val).trim();
  if (s === "") return null;
  return s.slice(0, 10); // "2026-05-13 00:00:00+00" → "2026-05-13"
}

function normalizeField(field, val) {
  if (field === "value_estimate") return normNum(val);
  if (field === "expected_close_date") return normDate(val);
  return normText(val);
}

// ── Fetch all Supabase rows via REST API ──────────────────────────────────────
async function fetchSupabase() {
  const fields = [
    "notion_id",
    ...COMPARE_FIELDS,
  ].join(",");

  const url = `${SUPABASE_URL}/rest/v1/opportunities?select=${fields}&order=notion_id&limit=200`;

  const res = await fetch(url, {
    headers: {
      "apikey": SUPABASE_ANON_KEY,
      "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
      "Accept": "application/json",
    },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Supabase REST error ${res.status}: ${body}`);
  }

  return await res.json();
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  process.stderr.write("[1/3] Loading Notion data from scripts/opps_temp.json...\n");
  const notionRows = JSON.parse(readFileSync("scripts/opps_temp.json", "utf8"));
  process.stderr.write(`  → ${notionRows.length} Notion rows loaded\n`);

  process.stderr.write("[2/3] Fetching Supabase rows via REST API...\n");
  const sbRows = await fetchSupabase();
  process.stderr.write(`  → ${sbRows.length} Supabase rows fetched\n`);

  process.stderr.write("[3/3] Running comparison...\n\n");

  // ── A. Coverage ─────────────────────────────────────────────────────────────
  const notionMap = Object.fromEntries(notionRows.map(r => [r.notion_id, r]));
  const sbMap     = Object.fromEntries(sbRows.map(r => [r.notion_id, r]));

  const notionIds = new Set(notionRows.map(r => r.notion_id));
  const sbIds     = new Set(sbRows.map(r => r.notion_id));

  const missing  = [...notionIds].filter(id => !sbIds.has(id));
  const orphans  = [...sbIds].filter(id => !notionIds.has(id));
  const matched  = [...notionIds].filter(id => sbIds.has(id));

  // Duplicate check in Supabase
  const sbIdList = sbRows.map(r => r.notion_id);
  const sbDuplicates = sbIdList.filter((id, i) => sbIdList.indexOf(id) !== i);

  console.log("══════════════════════════════════════════════════════════");
  console.log("  SHADOW COMPARISON: Notion → Supabase");
  console.log("══════════════════════════════════════════════════════════");
  console.log("\n── A. COVERAGE ──────────────────────────────────────────");
  console.log(`  Notion rows:       ${notionRows.length}`);
  console.log(`  Supabase rows:     ${sbRows.length}`);
  console.log(`  Matched (both):    ${matched.length}`);
  console.log(`  Missing in SB:     ${missing.length}${missing.length ? "\n    → " + missing.join("\n    → ") : ""}`);
  console.log(`  Orphans in SB:     ${orphans.length}${orphans.length ? "\n    → " + orphans.join("\n    → ") : ""}`);
  console.log(`  SB Duplicates:     ${sbDuplicates.length}${sbDuplicates.length ? " → " + sbDuplicates.join(", ") : ""}`);

  // ── B. Field-level mismatch counts ─────────────────────────────────────────
  const mismatches = {};
  for (const field of COMPARE_FIELDS) mismatches[field] = [];

  const perfectMatchIds = [];

  for (const id of matched) {
    const n = notionMap[id];
    const s = sbMap[id];
    let allMatch = true;

    for (const field of COMPARE_FIELDS) {
      const nVal = normalizeField(field, n[field]);
      const sVal = normalizeField(field, s[field]);
      if (nVal !== sVal) {
        mismatches[field].push({
          notion_id: id,
          title: n.title,
          notion_val: nVal,
          sb_val: sVal,
        });
        allMatch = false;
      }
    }

    if (allMatch) perfectMatchIds.push(id);
  }

  console.log(`\n── B. FIELD MISMATCH COUNTS (${matched.length} matched rows) ──────────────`);
  console.log(`  ${"Field".padEnd(28)} ${"Mismatches".padEnd(12)} %`);
  console.log(`  ${"─".repeat(50)}`);
  for (const field of COMPARE_FIELDS) {
    const count = mismatches[field].length;
    const pct   = ((count / matched.length) * 100).toFixed(1);
    const bar   = count === 0 ? "✓" : count === matched.length ? "✗ ALL" : `${count}`;
    console.log(`  ${field.padEnd(28)} ${String(bar).padEnd(12)} ${pct}%`);
  }
  console.log(`\n  Perfect match rows: ${perfectMatchIds.length}/${matched.length} (${((perfectMatchIds.length / matched.length) * 100).toFixed(1)}%)`);

  // ── C. 10 sample mismatches (worst field) ──────────────────────────────────
  const worstField = COMPARE_FIELDS.reduce((a, b) =>
    mismatches[a].length >= mismatches[b].length ? a : b
  );

  const worstCount = mismatches[worstField].length;
  console.log(`\n── C. SAMPLE MISMATCHES (field: "${worstField}", ${worstCount} total, showing first 10) ──`);

  if (worstCount === 0) {
    console.log("  No mismatches in any field.");
  } else {
    mismatches[worstField].slice(0, 10).forEach(m => {
      const nStr = m.notion_val === null ? "null" : JSON.stringify(String(m.notion_val).slice(0, 80));
      const sStr = m.sb_val     === null ? "null" : JSON.stringify(String(m.sb_val).slice(0, 80));
      console.log(`  [${m.notion_id}] "${(m.title || "Untitled").slice(0, 45)}"`);
      console.log(`    Notion: ${nStr}`);
      console.log(`    SB:     ${sStr}`);
    });
  }

  // Also show a second field if first has too many to be informative
  const secondWorstField = COMPARE_FIELDS
    .filter(f => f !== worstField && mismatches[f].length > 0)
    .sort((a, b) => mismatches[b].length - mismatches[a].length)[0];

  if (secondWorstField && mismatches[secondWorstField].length > 0 && mismatches[secondWorstField].length < worstCount) {
    const sw = mismatches[secondWorstField];
    console.log(`\n  Also: field "${secondWorstField}" — ${sw.length} mismatches, first 3:`);
    sw.slice(0, 3).forEach(m => {
      const nStr = m.notion_val === null ? "null" : JSON.stringify(String(m.notion_val).slice(0, 80));
      const sStr = m.sb_val     === null ? "null" : JSON.stringify(String(m.sb_val).slice(0, 80));
      console.log(`    [${m.notion_id}] "${(m.title || "").slice(0, 40)}"`);
      console.log(`      Notion: ${nStr}  →  SB: ${sStr}`);
    });
  }

  // ── D. 10 sample perfect matches ──────────────────────────────────────────
  console.log(`\n── D. SAMPLE PERFECT MATCHES (first 10 of ${perfectMatchIds.length}) ──────────────`);
  perfectMatchIds.slice(0, 10).forEach(id => {
    const n = notionMap[id];
    console.log(`  ✓ [${id}] "${(n.title || "Untitled").slice(0, 50)}" — ${n.status} / ${n.opportunity_type || "no type"}`);
  });

  // ── E. Recommendation table ────────────────────────────────────────────────
  console.log(`\n── E. RECOMMENDATION TABLE ──────────────────────────────`);
  console.log(`  ${"Field".padEnd(28)} ${"Safe now?".padEnd(11)} Reason`);
  console.log(`  ${"─".repeat(80)}`);

  for (const field of COMPARE_FIELDS) {
    const count = mismatches[field].length;
    let safe, reason;

    if (count === 0) {
      safe   = "YES";
      reason = "0 mismatches — 100% match";
    } else if (count <= 3) {
      safe   = "REVIEW";
      reason = `${count}/${matched.length} rows differ — spot-check before enabling`;
    } else if (count < matched.length * 0.1) {
      safe   = "REVIEW";
      reason = `${count}/${matched.length} rows differ (<10%) — minor drift`;
    } else if (count < matched.length * 0.5) {
      safe   = "NO";
      reason = `${count}/${matched.length} rows differ — significant drift`;
    } else {
      safe   = "NO";
      reason = `${count}/${matched.length} rows differ — majority or all wrong`;
    }

    console.log(`  ${field.padEnd(28)} ${safe.padEnd(11)} ${reason}`);
  }

  console.log("\n══════════════════════════════════════════════════════════");
  console.log("  END OF SHADOW COMPARISON REPORT");
  console.log("══════════════════════════════════════════════════════════\n");
}

main().catch(e => {
  process.stderr.write(`FATAL: ${e.message}\n${e.stack}\n`);
  process.exit(1);
});
