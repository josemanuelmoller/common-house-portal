#!/usr/bin/env node
/**
 * Bulk-loads tmp/reuse-landscape/parsed.json into public.reuse_landscape
 * using @supabase/supabase-js with the service-role key.
 *
 * Why this exists: the MCP execute_sql path hits per-call file/token limits
 * when each row carries a fat raw_payload JSONB. A single direct connection
 * is much cheaper and atomic.
 *
 * Usage:
 *   SUPABASE_SERVICE_KEY=... node tools/load-reuse-landscape.mjs
 *
 * Or via .env.local — the script reads it via dotenv-style fallback.
 *
 * Behaviour:
 *   - Reads tmp/reuse-landscape/parsed.json
 *   - Upserts by (organization_name, solution_name)
 *   - Batches of 200 rows per request
 *   - Reports inserted/updated count
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

// --- Minimal env loader: read .env.local + .env + process.env, last wins
function loadEnvFile(file) {
  try {
    const txt = readFileSync(file, "utf8");
    for (const line of txt.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (!m) continue;
      const [, k, vRaw] = m;
      if (process.env[k]) continue; // do not clobber real env
      let v = vRaw;
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1);
      }
      process.env[k] = v;
    }
  } catch {
    /* file missing — fine */
  }
}
loadEnvFile(resolve(".env"));
loadEnvFile(resolve(".env.local"));

const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_KEY;
if (!url || !serviceKey) {
  console.error("missing SUPABASE_URL or SUPABASE_SERVICE_KEY env. add to .env.local or export inline.");
  process.exit(1);
}

const sb = createClient(url, serviceKey, { auth: { persistSession: false } });

const rawRecords = JSON.parse(readFileSync(resolve("tmp/reuse-landscape/parsed.json"), "utf8"));
// Dedupe by composite natural key (org, solution) — last-wins. The source CSV
// has ~7 duplicate (org,solution) pairs which would crash a single-statement
// UPSERT with "ON CONFLICT DO UPDATE command cannot affect row a second time".
const dedup = new Map();
for (const r of rawRecords) dedup.set(`${r.organization_name}||${r.solution_name}`, r);
const records = [...dedup.values()];
console.log(`loading ${records.length} unique records (raw ${rawRecords.length}, deduped ${rawRecords.length - records.length})...`);

const BATCH = 200;
let upserted = 0, errors = 0;

for (let i = 0; i < records.length; i += BATCH) {
  const slice = records.slice(i, i + BATCH);
  const { error, count } = await sb
    .from("reuse_landscape")
    .upsert(slice, { onConflict: "organization_name,solution_name", count: "exact" });
  if (error) {
    console.error(`batch ${i / BATCH + 1}: ${error.message}`);
    errors++;
  } else {
    upserted += count ?? slice.length;
    process.stdout.write(`batch ${Math.floor(i / BATCH) + 1}: ${slice.length} ok  `);
  }
}
console.log(`\ndone. upserted≈${upserted}, errored batches=${errors}`);
