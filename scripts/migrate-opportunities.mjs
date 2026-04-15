/**
 * migrate-opportunities.mjs
 * Wave 1 migration: Notion Opportunities [OS v2] → Supabase opportunities table
 *
 * Usage: node scripts/migrate-opportunities.mjs
 *
 * This is a ONE-WAY, READ-ONLY migration script.
 * It reads from Notion, writes to Supabase.
 * It does NOT modify any production portal code or routes.
 * It does NOT touch the Hall UI or any live reads.
 */

import { Client } from "@notionhq/client";
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { resolve } from "path";

// ─── Load env vars from .env.local ────────────────────────────────────────────
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
  } catch {
    // env vars already set
  }
}
loadEnv();

// ─── Constants ────────────────────────────────────────────────────────────────
const NOTION_DB_OPPORTUNITIES = "687caa98594a41b595c9960c141be0c0";
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const NOTION_KEY = process.env.NOTION_API_KEY;

// ─── Helpers (mirrors src/lib/notion/core.ts) ─────────────────────────────────
function prop(page, name) {
  return page.properties?.[name];
}
function text(p) {
  if (!p) return "";
  if (p.type === "title") return p.title?.map(t => t.plain_text).join("") ?? "";
  if (p.type === "rich_text") return p.rich_text?.map(t => t.plain_text).join("") ?? "";
  return "";
}
function sel(p) {
  if (!p) return null;
  return p.select?.name ?? null;
}
function urlProp(p) {
  if (!p) return null;
  return p.url ?? null;
}
function numProp(p) {
  if (!p) return null;
  return p.number ?? null;
}
function dateProp(p) {
  if (!p) return null;
  return p.date?.start ?? null;
}
function relationFirst(p) {
  if (!p) return null;
  return p.relation?.[0]?.id ?? null;
}

// ─── Transform a Notion page → Supabase row ───────────────────────────────────
function transform(page) {
  const notionId = page.id;                                    // bridge key
  const title    = text(prop(page, "Opportunity Name"))
                || text(prop(page, "Name"))
                || "Untitled";

  // Status field: verified as "Opportunity Status" in production code
  const status           = sel(prop(page, "Opportunity Status")) ?? "New";
  const scope            = sel(prop(page, "Scope"));           // CH | Portfolio | Both
  const followUpStatus   = sel(prop(page, "Follow-up Status")); // None | Needed | Sent | Waiting | Done | Dropped
  const opportunityType  = sel(prop(page, "Opportunity Type")); // CH Sale | Grant | Partnership | Investor Match
  const opportunityScore = numProp(prop(page, "Opportunity Score")); // 0-100
  const qualStatus       = sel(prop(page, "Qualification Status")) ?? "Not Scored";

  // "Account / Organization" is a relation — extract the first related page ID
  const orgNotionId = relationFirst(prop(page, "Account / Organization"));
  // org_name cannot be derived without a second Notion API call — leave null
  const orgName = null;

  // URL fields
  const sourceUrl  = urlProp(prop(page, "Source URL"));   // verified field name
  // "Review URL" was planned but not confirmed as separate field — using Notion page URL
  const reviewUrl  = page.url ?? null;

  // Text / signal fields
  const triggerSignal = text(prop(page, "Trigger / Signal")) || null;  // verified
  const pendingAction = triggerSignal; // same field — mapped to both columns

  // Date fields
  const nextMeetingAt   = dateProp(prop(page, "Next Meeting Date"));
  const notionCreatedAt = page.created_time ?? null;

  // We preserve Notion timestamps: notion_created_at = Notion's created_time
  // created_at / updated_at in Supabase are set to Notion's timestamps on insert,
  // but on conflict (upsert) we update updated_at to Notion's last_edited_time
  const notionLastEdited = page.last_edited_time ?? null;

  return {
    notion_id:            notionId,
    title,
    status,
    scope,
    follow_up_status:     followUpStatus,
    opportunity_type:     opportunityType,
    opportunity_score:    opportunityScore,
    qualification_status: qualStatus,
    org_name:             orgName,
    org_notion_id:        orgNotionId,
    source_url:           sourceUrl,
    review_url:           reviewUrl,
    trigger_signal:       triggerSignal,
    pending_action:       pendingAction,
    next_meeting_at:      nextMeetingAt,
    summary:              null,         // no summary field in Notion schema
    notion_created_at:    notionCreatedAt,
    // On insert: use Notion's created_time. On conflict: updated_at gets last_edited_time.
    _notion_last_edited:  notionLastEdited, // internal — used for updated_at on upsert
  };
}

// ─── Fetch ALL pages from Notion (handles pagination) ────────────────────────
async function fetchAllOpportunities(notion) {
  const allPages = [];
  let cursor;
  let page = 1;

  do {
    console.log(`  Fetching Notion page ${page}...`);
    const res = await notion.databases.query({
      database_id: NOTION_DB_OPPORTUNITIES,
      page_size: 100,
      ...(cursor ? { start_cursor: cursor } : {}),
    });
    allPages.push(...res.results);
    cursor = res.has_more ? res.next_cursor : null;
    page++;
  } while (cursor);

  return allPages;
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  // Validate credentials
  const missing = [];
  if (!NOTION_KEY)        missing.push("NOTION_API_KEY");
  if (!SUPABASE_URL)      missing.push("SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL");
  if (!SUPABASE_SERVICE_KEY) missing.push("SUPABASE_SERVICE_ROLE_KEY");

  if (missing.length > 0) {
    console.error("Missing env vars:", missing.join(", "));
    console.error("Add them to .env.local and retry.");
    process.exit(1);
  }

  const notion   = new Client({ auth: NOTION_KEY });
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  // ── Step 1: Fetch from Notion ──────────────────────────────────────────────
  console.log("\n[1/4] Fetching ALL Opportunities from Notion...");
  let rawPages;
  try {
    rawPages = await fetchAllOpportunities(notion);
  } catch (err) {
    console.error("Notion fetch failed:", err.message);
    process.exit(1);
  }
  console.log(`  → Fetched ${rawPages.length} pages from Notion`);

  // ── Step 2: Transform ──────────────────────────────────────────────────────
  console.log("\n[2/4] Transforming records...");
  const rows = rawPages.map(transform);

  // Data quality report
  const issues = [];
  const untitled = rows.filter(r => r.title === "Untitled");
  const noStatus = rows.filter(r => !r.status);
  const noNotionId = rows.filter(r => !r.notion_id);
  if (untitled.length)  issues.push(`${untitled.length} records with "Untitled" name`);
  if (noStatus.length)  issues.push(`${noStatus.length} records with null status`);
  if (noNotionId.length) issues.push(`${noNotionId.length} records with missing notion_id (CRITICAL)`);

  if (noNotionId.length > 0) {
    console.error("CRITICAL: Records with no notion_id found. Cannot safely upsert. Aborting.");
    process.exit(1);
  }

  const statusCounts = {};
  const typeCounts = {};
  const scopeCounts = {};
  for (const r of rows) {
    statusCounts[r.status] = (statusCounts[r.status] || 0) + 1;
    typeCounts[r.opportunity_type || "(none)"] = (typeCounts[r.opportunity_type || "(none)"] || 0) + 1;
    scopeCounts[r.scope || "(none)"] = (scopeCounts[r.scope || "(none)"] || 0) + 1;
  }
  console.log("  Status distribution:", statusCounts);
  console.log("  Type distribution:", typeCounts);
  console.log("  Scope distribution:", scopeCounts);
  if (issues.length > 0) {
    console.warn("  Data quality issues found:");
    issues.forEach(i => console.warn("   ⚠", i));
  } else {
    console.log("  Data quality: clean");
  }

  // ── Step 3: Upsert into Supabase ──────────────────────────────────────────
  console.log("\n[3/4] Upserting into Supabase...");
  const BATCH_SIZE = 50;
  let inserted = 0;
  let errors = 0;

  // Prepare rows for upsert — strip internal fields
  const supabaseRows = rows.map(r => {
    const { _notion_last_edited, ...rest } = r;
    // Set created_at from Notion created time (only on first insert)
    // Set updated_at from Notion last edited time
    return {
      ...rest,
      created_at: r.notion_created_at ?? new Date().toISOString(),
      updated_at: _notion_last_edited ?? new Date().toISOString(),
    };
  });

  // Process in batches
  for (let i = 0; i < supabaseRows.length; i += BATCH_SIZE) {
    const batch = supabaseRows.slice(i, i + BATCH_SIZE);
    const { error, count } = await supabase
      .from("opportunities")
      .upsert(batch, {
        onConflict: "notion_id",
        count: "exact",
      });

    if (error) {
      console.error(`  Batch ${Math.floor(i/BATCH_SIZE)+1} error:`, error.message);
      errors += batch.length;
    } else {
      inserted += batch.length;
      process.stdout.write(`  Batch ${Math.floor(i/BATCH_SIZE)+1}: ${batch.length} rows upserted\n`);
    }
  }

  console.log(`\n  → ${inserted} rows upserted successfully`);
  if (errors > 0) console.warn(`  → ${errors} rows had errors`);

  // ── Step 4: Verify ────────────────────────────────────────────────────────
  console.log("\n[4/4] Verifying Supabase...");

  const { count: totalCount } = await supabase
    .from("opportunities")
    .select("*", { count: "exact", head: true });
  console.log(`  Total rows in Supabase: ${totalCount}`);

  const { data: sample } = await supabase
    .from("opportunities")
    .select("notion_id, title, status, scope, opportunity_type, source_url, next_meeting_at, created_at")
    .order("created_at", { ascending: false })
    .limit(5);
  console.log("\n  Sample (5 most recent):");
  sample?.forEach(r => {
    console.log(`   - [${r.status}] ${r.title} (${r.scope ?? "no-scope"} | ${r.opportunity_type ?? "no-type"})`);
    console.log(`     notion_id: ${r.notion_id}`);
    if (r.source_url) console.log(`     source_url: ${r.source_url.slice(0, 60)}...`);
    if (r.next_meeting_at) console.log(`     next_meeting_at: ${r.next_meeting_at}`);
  });

  // Status breakdown in Supabase
  const { data: statusData } = await supabase
    .from("opportunities")
    .select("status");
  const sbStatusCounts = {};
  statusData?.forEach(r => {
    sbStatusCounts[r.status] = (sbStatusCounts[r.status] || 0) + 1;
  });
  console.log("\n  Status breakdown in Supabase:", sbStatusCounts);

  // Null-title check
  const { count: nullTitles } = await supabase
    .from("opportunities")
    .select("*", { count: "exact", head: true })
    .eq("title", "Untitled");
  if (nullTitles > 0) {
    console.warn(`  ⚠ ${nullTitles} rows have title "Untitled"`);
  }

  // notion_id coverage
  const { count: withNotionId } = await supabase
    .from("opportunities")
    .select("*", { count: "exact", head: true })
    .not("notion_id", "is", null);
  console.log(`  notion_id populated: ${withNotionId}/${totalCount}`);

  console.log("\n✓ Migration complete.");
  console.log("  Production portal is unchanged — still reading from Notion.");
  console.log("  Next step: add SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY to .env.local,");
  console.log("             then plan the dual-read switchover.");
}

main().catch(err => {
  console.error("Unexpected error:", err);
  process.exit(1);
});
