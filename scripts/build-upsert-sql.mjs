/**
 * build-upsert-sql.mjs
 * Reads scripts/opps_temp.json and writes scripts/migration_upsert.sql
 *
 * Wave 1 hardening — full column set per spec.
 */
import { readFileSync, writeFileSync } from "fs";

const data = JSON.parse(readFileSync("scripts/opps_temp.json", "utf8"));

function esc(val) {
  if (val === null || val === undefined) return "NULL";
  const s = String(val).replaceAll("'", "''");
  return `'${s}'`;
}

function escNum(val) {
  if (val === null || val === undefined) return "NULL";
  const n = Number(val);
  return isNaN(n) ? "NULL" : String(n);
}

const valueClauses = data.map(r => {
  const cols = [
    esc(r.notion_id),
    esc(r.title),
    // Pipeline
    esc(r.status),
    esc(r.opportunity_type),
    esc(r.scope),
    esc(r.qualification_status),
    esc(r.priority),
    esc(r.probability),
    // Relationship
    esc(r.org_notion_id),
    esc(r.org_name),
    // Signal and next action
    esc(r.trigger_signal),
    esc(r.source_evidence),
    esc(r.source_url),
    esc(r.suggested_next_step),
    esc(r.notes),
    esc(r.why_there_is_fit),
    // Commercial and timing
    escNum(r.value_estimate),
    esc(r.expected_close_date),
    // Legacy
    esc(r.follow_up_status),
    escNum(r.opportunity_score),
    esc(r.pending_action),
    esc(r.review_url),
    esc(r.notion_created_at),
    esc(r.created_at),
    esc(r.updated_at),
  ];
  return `(${cols.join(", ")})`;
});

const sql = `INSERT INTO opportunities (
  notion_id, title,
  status, opportunity_type, scope, qualification_status, priority, probability,
  org_notion_id, org_name,
  trigger_signal, source_evidence, source_url, suggested_next_step, notes, why_there_is_fit,
  value_estimate, expected_close_date,
  follow_up_status, opportunity_score, pending_action, review_url,
  notion_created_at, created_at, updated_at
) VALUES
${valueClauses.join(",\n")}
ON CONFLICT (notion_id) DO UPDATE SET
  title                = EXCLUDED.title,
  status               = EXCLUDED.status,
  opportunity_type     = EXCLUDED.opportunity_type,
  scope                = EXCLUDED.scope,
  qualification_status = EXCLUDED.qualification_status,
  priority             = EXCLUDED.priority,
  probability          = EXCLUDED.probability,
  org_notion_id        = EXCLUDED.org_notion_id,
  org_name             = EXCLUDED.org_name,
  trigger_signal       = EXCLUDED.trigger_signal,
  source_evidence      = EXCLUDED.source_evidence,
  source_url           = EXCLUDED.source_url,
  suggested_next_step  = EXCLUDED.suggested_next_step,
  notes                = EXCLUDED.notes,
  why_there_is_fit     = EXCLUDED.why_there_is_fit,
  value_estimate       = EXCLUDED.value_estimate,
  expected_close_date  = EXCLUDED.expected_close_date,
  follow_up_status     = EXCLUDED.follow_up_status,
  opportunity_score    = EXCLUDED.opportunity_score,
  pending_action       = EXCLUDED.pending_action,
  review_url           = EXCLUDED.review_url,
  notion_created_at    = EXCLUDED.notion_created_at,
  updated_at           = EXCLUDED.updated_at;`;

writeFileSync("scripts/migration_upsert.sql", sql);
console.log(`SQL written: ${sql.length} chars, ${data.length} rows`);
console.log("Preview (first 500 chars):");
console.log(sql.slice(0, 500));

// ── Also write batched files for large upserts ────────────────────────────────
const BATCH_SIZE = 20;
for (let i = 0; i < data.length; i += BATCH_SIZE) {
  const batchData = data.slice(i, i + BATCH_SIZE);
  const batchNum = Math.floor(i / BATCH_SIZE) + 1;

  const batchValueClauses = batchData.map(r => {
    const cols = [
      esc(r.notion_id), esc(r.title),
      esc(r.status), esc(r.opportunity_type), esc(r.scope), esc(r.qualification_status),
      esc(r.priority), esc(r.probability),
      esc(r.org_notion_id), esc(r.org_name),
      esc(r.trigger_signal), esc(r.source_evidence), esc(r.source_url),
      esc(r.suggested_next_step), esc(r.notes), esc(r.why_there_is_fit),
      escNum(r.value_estimate), esc(r.expected_close_date),
      esc(r.follow_up_status), escNum(r.opportunity_score), esc(r.pending_action),
      esc(r.review_url), esc(r.notion_created_at), esc(r.created_at), esc(r.updated_at),
    ];
    return `(${cols.join(", ")})`;
  });

  const batchSql = `INSERT INTO opportunities (
  notion_id, title,
  status, opportunity_type, scope, qualification_status, priority, probability,
  org_notion_id, org_name,
  trigger_signal, source_evidence, source_url, suggested_next_step, notes, why_there_is_fit,
  value_estimate, expected_close_date,
  follow_up_status, opportunity_score, pending_action, review_url,
  notion_created_at, created_at, updated_at
) VALUES
${batchValueClauses.join(",\n")}
ON CONFLICT (notion_id) DO UPDATE SET
  title                = EXCLUDED.title,
  status               = EXCLUDED.status,
  opportunity_type     = EXCLUDED.opportunity_type,
  scope                = EXCLUDED.scope,
  qualification_status = EXCLUDED.qualification_status,
  priority             = EXCLUDED.priority,
  probability          = EXCLUDED.probability,
  org_notion_id        = EXCLUDED.org_notion_id,
  org_name             = EXCLUDED.org_name,
  trigger_signal       = EXCLUDED.trigger_signal,
  source_evidence      = EXCLUDED.source_evidence,
  source_url           = EXCLUDED.source_url,
  suggested_next_step  = EXCLUDED.suggested_next_step,
  notes                = EXCLUDED.notes,
  why_there_is_fit     = EXCLUDED.why_there_is_fit,
  value_estimate       = EXCLUDED.value_estimate,
  expected_close_date  = EXCLUDED.expected_close_date,
  follow_up_status     = EXCLUDED.follow_up_status,
  opportunity_score    = EXCLUDED.opportunity_score,
  pending_action       = EXCLUDED.pending_action,
  review_url           = EXCLUDED.review_url,
  notion_created_at    = EXCLUDED.notion_created_at,
  updated_at           = EXCLUDED.updated_at;`;

  writeFileSync(`scripts/migration_upsert_batch${batchNum}.sql`, batchSql);
  console.log(`Batch ${batchNum}: ${batchData.length} rows → migration_upsert_batch${batchNum}.sql (${batchSql.length} chars)`);
}
