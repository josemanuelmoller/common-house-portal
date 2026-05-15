#!/usr/bin/env node
/**
 * tools/backfill-fireflies-entities.mjs
 *
 * One-off audit / backfill for sources rows from Fireflies that lack an
 * org_notion_id (the symptom of the pre-resolver pipeline). For each row
 * it re-queries Fireflies for the transcript's participants, runs the
 * shared resolver, and either reports (dry-run) or updates the row.
 *
 * Usage:
 *   node tools/backfill-fireflies-entities.mjs            # dry-run, default
 *   node tools/backfill-fireflies-entities.mjs --apply    # write updates
 *   node tools/backfill-fireflies-entities.mjs --apply --limit 5
 *
 * Loads .env.local from the current directory automatically.
 *
 * NOT a long-term tool — once Phase 4 fireflies-sync has run with a 60-day
 * backfill, this script becomes a no-op. Keep it around as evidence of the
 * one-time migration and for re-running if Fireflies API changes break the
 * delta cron mid-flight.
 */

import fs from "node:fs";
import path from "node:path";
import process from "node:process";

// ── Tiny .env.local loader (no dotenv dep) ──────────────────────────────────
const ENV_PATH = path.join(process.cwd(), ".env.local");
if (fs.existsSync(ENV_PATH)) {
  for (const line of fs.readFileSync(ENV_PATH, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/i);
    if (!m) continue;
    const [, k, raw] = m;
    if (process.env[k]) continue;
    let v = raw;
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    process.env[k] = v;
  }
}

const args  = new Set(process.argv.slice(2));
const APPLY = args.has("--apply");
const LIMIT = (() => {
  const i = process.argv.indexOf("--limit");
  if (i < 0) return null;
  const n = parseInt(process.argv[i + 1] ?? "", 10);
  return Number.isFinite(n) && n > 0 ? n : null;
})();

const SUPABASE_URL  = process.env.SUPABASE_URL;
const SUPABASE_KEY  = process.env.SUPABASE_SERVICE_KEY ?? process.env.SUPABASE_ANON_KEY;
const FIREFLIES_KEY = process.env.FIREFLIES_API_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("Missing SUPABASE_URL / SUPABASE_SERVICE_KEY in .env.local");
  process.exit(1);
}
if (!FIREFLIES_KEY) {
  console.error("Missing FIREFLIES_API_KEY in .env.local");
  process.exit(1);
}

// ── Supabase REST helpers (no SDK) ──────────────────────────────────────────
async function sb(path, init = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      ...(init.headers ?? {}),
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      "Content-Type": "application/json",
    },
  });
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${await res.text()}`);
  return res.json();
}

// ── Load entity index ───────────────────────────────────────────────────────
async function loadSelfEmails() {
  const rows = await sb("hall_self_identities?select=email");
  return new Set(rows.map(r => (r.email ?? "").toLowerCase()).filter(Boolean));
}

async function loadIndex() {
  const [orgs, people, projects] = await Promise.all([
    sb("organizations?select=notion_id,name,org_domains"),
    sb("people?select=email,org_notion_id&email=not.is.null&org_notion_id=not.is.null"),
    sb("projects?select=notion_id,name,project_status,primary_org_notion_id,last_meeting_date&order=last_meeting_date.desc.nullslast"),
  ]);

  const emailToOrg  = new Map();
  const domainToOrg = new Map();
  const orgsByName  = [];
  const projectsByOrg = new Map();
  const projectsByName = [];

  for (const o of orgs) {
    if (!o.notion_id) continue;
    if (o.name) orgsByName.push({ name: o.name.toLowerCase(), notionId: o.notion_id });
    if (o.org_domains) {
      try {
        const arr = JSON.parse(o.org_domains);
        if (Array.isArray(arr)) {
          for (const d of arr) {
            if (typeof d !== "string") continue;
            const clean = d.toLowerCase().replace(/^@/, "").trim();
            if (clean && !domainToOrg.has(clean)) domainToOrg.set(clean, o.notion_id);
          }
        }
      } catch {}
    }
  }
  orgsByName.sort((a, b) => b.name.length - a.name.length);

  // Frequency vote on email→org
  const votes = new Map();
  for (const p of people) {
    const e = p.email?.toLowerCase().trim();
    if (!e || !p.org_notion_id) continue;
    let bucket = votes.get(e);
    if (!bucket) { bucket = new Map(); votes.set(e, bucket); }
    bucket.set(p.org_notion_id, (bucket.get(p.org_notion_id) ?? 0) + 1);
  }
  for (const [email, bucket] of votes) {
    let best = null, bestCount = -1;
    for (const [org, c] of bucket) {
      if (c > bestCount || (c === bestCount && best && org < best)) { bestCount = c; best = org; }
    }
    if (best) emailToOrg.set(email, best);
  }

  for (const p of projects) {
    if (!p.notion_id) continue;
    if (p.name) projectsByName.push({ name: p.name.toLowerCase(), notionId: p.notion_id });
    if (p.primary_org_notion_id) {
      let bucket = projectsByOrg.get(p.primary_org_notion_id);
      if (!bucket) { bucket = []; projectsByOrg.set(p.primary_org_notion_id, bucket); }
      bucket.push({ notionId: p.notion_id, name: p.name ?? "", status: p.project_status, lastMeetingDate: p.last_meeting_date });
    }
  }
  projectsByName.sort((a, b) => b.name.length - a.name.length);

  return { emailToOrg, domainToOrg, orgsByName, projectsByOrg, projectsByName };
}

function domainOf(email) {
  const at = email.lastIndexOf("@");
  if (at < 0 || at === email.length - 1) return null;
  return email.slice(at + 1).toLowerCase().trim();
}

function findByName(corpus, list) {
  if (!corpus.trim()) return null;
  const hay = corpus.toLowerCase();
  for (const it of list) {
    if (it.name.length < 4) continue;
    if (hay.includes(it.name)) return it.notionId;
  }
  return null;
}

function resolveOrgId(idx, { title = "", participantEmails = [], orgNameHint = "", selfEmails = new Set() }) {
  const all = participantEmails.map(e => e?.toLowerCase().trim()).filter(e => e && e.includes("@"));
  const nonSelf = all.filter(e => !selfEmails.has(e));
  const selfHit = all.filter(e =>  selfEmails.has(e));
  for (const e of nonSelf) {
    const hit = idx.emailToOrg.get(e);
    if (hit) return { orgNotionId: hit, matchPath: `email:${e}` };
  }
  for (const e of nonSelf) {
    const d = domainOf(e);
    if (!d) continue;
    const hit = idx.domainToOrg.get(d);
    if (hit) return { orgNotionId: hit, matchPath: `domain:${d}` };
  }
  const corpus = `${title} ${orgNameHint}`.trim();
  const nameHit = findByName(corpus, idx.orgsByName);
  if (nameHit) return { orgNotionId: nameHit, matchPath: "name-substring" };
  for (const e of selfHit) {
    const hit = idx.emailToOrg.get(e);
    if (hit) return { orgNotionId: hit, matchPath: `self-email:${e}` };
  }
  return { orgNotionId: null, matchPath: "miss" };
}

function resolveProjectId(idx, orgNotionId, { title = "" }) {
  const t = title.toLowerCase().trim();
  if (orgNotionId) {
    const projects = idx.projectsByOrg.get(orgNotionId) ?? [];
    for (const p of projects) {
      if (p.name.length >= 4 && t.includes(p.name.toLowerCase())) {
        return { projectNotionId: p.notionId, matchPath: `org+title:${p.name}` };
      }
    }
    if (projects.length === 1) return { projectNotionId: projects[0].notionId, matchPath: "org-single" };
    if (projects.length > 1)   return { projectNotionId: projects[0].notionId, matchPath: "org-recent" };
  }
  const hit = findByName(t, idx.projectsByName);
  if (hit) return { projectNotionId: hit, matchPath: "title-substring" };
  return { projectNotionId: null, matchPath: "miss" };
}

// ── Fireflies fetch (single bulk query for a date window) ───────────────────
// Per-id `transcript(id:)` queries hit the per-call rate budget hard. The
// bulk `transcripts(fromDate:, toDate:)` query returns up to ~50 transcripts
// in one shot and counts as a single hit — far cheaper for backfill.
async function fetchTranscriptsBulk(fromIso, toIso) {
  const query = `query Bulk($fromDate: DateTime, $toDate: DateTime) {
    transcripts(fromDate: $fromDate, toDate: $toDate) { id title date participants }
  }`;
  const res = await fetch("https://api.fireflies.ai/graphql", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${FIREFLIES_KEY}` },
    body: JSON.stringify({ query, variables: { fromDate: fromIso, toDate: toIso } }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json?.errors) {
    return { error: json?.errors ?? `HTTP ${res.status}`, transcripts: [] };
  }
  return { error: null, transcripts: json?.data?.transcripts ?? [] };
}

// ── Main ────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`Mode: ${APPLY ? "APPLY (writes)" : "dry-run (no writes)"}${LIMIT ? ` · limit ${LIMIT}` : ""}`);
  console.log("Loading entity index + self identities...");
  const [idx, selfEmails] = await Promise.all([loadIndex(), loadSelfEmails()]);
  console.log(`  emailToOrg: ${idx.emailToOrg.size}, domainToOrg: ${idx.domainToOrg.size}, orgsByName: ${idx.orgsByName.length}, projects: ${idx.projectsByName.length}, selfEmails: ${selfEmails.size}`);

  const filter = "source_platform=eq.Fireflies&org_notion_id=is.null&source_external_id=not.is.null";
  const select = "id,title,source_date,source_external_id,org_notion_id,project_notion_id";
  let rows = await sb(`sources?${filter}&select=${select}&order=source_date.desc.nullslast&limit=${LIMIT ?? 200}`);
  console.log(`Orphan Fireflies sources: ${rows.length}`);
  if (rows.length === 0) {
    console.log("Nothing to do.");
    return;
  }

  // Build participant lookup with a single bulk Fireflies query over the
  // span of the orphan rows' dates. One API call instead of N.
  const dates = rows.map(r => r.source_date).filter(Boolean).sort();
  const fromIso = new Date(`${dates[0]}T00:00:00Z`).toISOString();
  const toIso   = new Date(`${dates[dates.length - 1]}T23:59:59Z`).toISOString();
  console.log(`Fetching transcripts bulk: ${fromIso.slice(0,10)} → ${toIso.slice(0,10)}`);

  const { error: bulkErr, transcripts: bulkT } = await fetchTranscriptsBulk(fromIso, toIso);
  if (bulkErr) {
    console.error("Fireflies bulk failed:", JSON.stringify(bulkErr).slice(0, 400));
    process.exit(2);
  }
  console.log(`Fireflies returned ${bulkT.length} transcripts in window.`);
  const partById = new Map();
  for (const t of bulkT) partById.set(t.id, (t.participants ?? []).filter(p => typeof p === "string"));

  const stats = { resolved_org: 0, resolved_proj: 0, miss: 0, applied: 0, no_transcript: 0, by_path: {} };
  const samples = { resolved: [], miss: [] };

  for (const row of rows) {
    const participants = partById.get(row.source_external_id) ?? null;
    if (!participants) {
      stats.no_transcript++;
      continue;
    }

    const orgR  = resolveOrgId(idx, { title: row.title ?? "", participantEmails: participants, selfEmails });
    const projR = resolveProjectId(idx, orgR.orgNotionId, { title: row.title ?? "" });

    const pathKey = orgR.matchPath.split(":")[0];
    stats.by_path[pathKey] = (stats.by_path[pathKey] ?? 0) + 1;

    if (orgR.orgNotionId) {
      stats.resolved_org++;
      if (projR.projectNotionId) stats.resolved_proj++;
      if (samples.resolved.length < 8) {
        samples.resolved.push({
          title:     row.title?.slice(0, 60),
          date:      row.source_date,
          org:       orgR.orgNotionId,
          orgPath:   orgR.matchPath,
          proj:      projR.projectNotionId,
          projPath:  projR.matchPath,
          parts:     participants.slice(0, 4),
        });
      }
      if (APPLY) {
        const patch = { org_notion_id: orgR.orgNotionId };
        if (projR.projectNotionId && !row.project_notion_id) patch.project_notion_id = projR.projectNotionId;
        const res = await fetch(`${SUPABASE_URL}/rest/v1/sources?id=eq.${row.id}`, {
          method: "PATCH",
          headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, "Content-Type": "application/json", Prefer: "return=minimal" },
          body: JSON.stringify(patch),
        });
        if (res.ok) stats.applied++;
        else console.error(`update failed for ${row.id}: ${res.status} ${await res.text()}`);
      }
    } else {
      stats.miss++;
      if (samples.miss.length < 8) {
        samples.miss.push({
          title:    row.title?.slice(0, 60),
          date:     row.source_date,
          parts:    participants.slice(0, 4),
        });
      }
    }
  }

  console.log("\n=== Summary ===");
  console.log(JSON.stringify(stats, null, 2));
  console.log("\nSample resolved (first 8):");
  for (const s of samples.resolved) console.log(`  · ${s.date} | ${s.orgPath} → org=${s.org?.slice(0,8)} proj=${s.proj?.slice(0,8) ?? "—"} (${s.projPath}) | ${s.title}`);
  console.log("\nSample miss (first 8):");
  for (const s of samples.miss) console.log(`  · ${s.date} | parts=${s.parts.join(",")} | ${s.title}`);
}

main().catch(e => { console.error(e); process.exit(1); });
