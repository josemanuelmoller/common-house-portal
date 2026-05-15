#!/usr/bin/env node
/**
 * For each zero-coverage knowledge_nodes leaf with atlas rows, generate v1
 * of its playbook by sending a structured facts pack to Claude and writing
 * the result to:
 *   - knowledge_nodes.playbook_md / playbook_source_count / playbook_generated_at
 *   - playbook_versions (version 1)
 *   - knowledge_node_changelog (audit row)
 *
 * Usage:
 *   node tools/synthesize-landscape-playbooks.mjs              # all 3 leaves
 *   node tools/synthesize-landscape-playbooks.mjs --path=reuse/enablers/apps   # single leaf
 *   node tools/synthesize-landscape-playbooks.mjs --dry-run    # facts only, no write
 *
 * Reads SUPABASE_URL, SUPABASE_SERVICE_KEY, ANTHROPIC_API_KEY from .env.local.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";

// ---- env loader (no clobber)
function loadEnv(file) {
  try {
    for (const ln of readFileSync(file, "utf8").split(/\r?\n/)) {
      const m = ln.match(/^([A-Z0-9_]+)=(.*)$/);
      if (!m) continue;
      const [, k] = m;
      let v = m[2];
      if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
      // vercel env pull escapes trailing newlines as literal "\n"; strip them.
      v = v.replace(/\\n$/g, "").replace(/\s+$/g, "");
      if (!process.env[k]) process.env[k] = v;
    }
  } catch {}
}
loadEnv(resolve(".env"));
loadEnv(resolve(".env.local"));

const need = (k) => {
  if (!process.env[k]) { console.error(`missing ${k}`); process.exit(1); }
  return process.env[k];
};
const sb = createClient(need("SUPABASE_URL"), need("SUPABASE_SERVICE_KEY"), { auth: { persistSession: false }});
const anthropic = new Anthropic({ apiKey: need("ANTHROPIC_API_KEY") });

const args = process.argv.slice(2);
const onePath = args.find((a) => a.startsWith("--path="))?.split("=")[1];
const dryRun  = args.includes("--dry-run");
const MODEL   = "claude-opus-4-7";

const LEAVES = onePath
  ? [onePath]
  : ["reuse/enablers/advocacy", "reuse/packaging/transit", "reuse/enablers/apps"];

const SYSTEM_CREATE = `You are the Knowledge Curator for Common House OS v2.

You are writing v1 of a playbook for a leaf node in the Common House knowledge tree, sourced exclusively from a structured external reference dataset (PR3/EMF reuse atlas). You are NOT writing CH-specific strategy — you are summarizing what the atlas reveals about this category as a domain.

Voice and conventions:
- Markdown only.
- Plain, declarative, evidence-anchored. Never speculate beyond the data provided.
- When you cite a number ("60% of operators are in Europe"), make sure it is reconstructable from the JSON facts.
- Name specific organizations when illustrating a pattern. Use the format "{Organization} ({Country}, founded {year})".
- Spanish is fine for narrative sections; technical terms (refill, return-on-the-go, transit packaging) stay in English.
- Do NOT include a top H1 title (the node title is rendered separately above the playbook).
- Length target: 1500–3000 words.

Required sections (use H2 ##):
1. **Overview** — what the category IS in plain language, who's in it, what unifies it.
2. **Sub-category map** — breakdown with counts and representative examples for each sub_category.
3. **Geographic concentration** — where the activity clusters, with country counts and what that says about adoption.
4. **Notable operators** — 8-12 standout operators chosen for variety (different sub-categories, geographies, stages). Use the format "**{Org}** — {Country}, founded {year}. {1-2 sentence what they do}". Skip operators with thin data.
5. **Maturity distribution** — Concept/Pilot/Growth/Established split. What does this say about whether the category is exploratory vs established?
6. **Failure modes** — inactive operators in the dataset. What do we know about why they ended (year_ended, end_date)? If we don't know the cause, say so.
7. **Open questions for Common House** — 4-6 questions the atlas alone can't answer that a CH-specific research pass would. Examples: economics per operator, regulatory dependencies, the role of the brand or retailer in the value chain.
8. **Methodology & provenance** — single short paragraph: "This v1 playbook was synthesized from {N} atlas rows ({active} active, {inactive} inactive) on {date}. Source: public.reuse_landscape filtered by knowledge_node_id. Each operator above is a row keyable from solution_name and organization_name."

Boundaries:
- Do not invent data. If the dataset doesn't have funding/revenue info for most operators, say "Funding data is missing for most rows in this leaf — see open questions."
- Do not export your own opinions on whether CH should pursue this category. That's downstream.
- Do not duplicate the node summary (it's already on the node).`;

const SYSTEM_AMEND = `You are the Knowledge Curator for Common House OS v2.

You are producing the NEXT VERSION of an existing playbook for a leaf node in the Common House knowledge tree. A prior version already exists, anchored in operational case-study material (typically deep Slack distillation from a specific operator, e.g. Algramo). You now have access to a structured external reference dataset (PR3/EMF reuse atlas) covering hundreds of operators worldwide.

Your job is to MERGE — not replace. Preserve the operational depth from the prior version (specific failure modes, store-by-store learnings, vendor names, retailer interactions, financial signals) AND add what the atlas provides (universe scope, geographic distribution, sub-category breakdown, alternative business models the prior version didn't see).

Voice and conventions (same as before):
- Markdown only.
- Plain, declarative, evidence-anchored. Never speculate beyond the data provided.
- Specific organizations cited as "{Organization} ({Country}, founded {year})".
- Spanish narrative fine; technical terms in English.
- No top H1 title.
- Length target: 2500–4500 words (longer than v1 because you're merging two evidence bases).

Section structure for the merged version:
1. **Overview** — refined definition that takes both case-study depth and atlas scope into account.
2. **Landscape map** — sub-category breakdown from the atlas (with counts) PLUS where the prior version's case studies fit in that map.
3. **Geographic concentration** — atlas-derived country distribution. Note where the case studies sit and where coverage is thinner.
4. **Operational playbook** — preserve the deep "how to actually run this" content from v1 (store ops, customer behavior, P&L signals). This is the section where the prior version's value lives.
5. **Notable operators (atlas additions)** — operators the prior version didn't cover, chosen for variety. Format "**{Org}** — {Country}, founded {year}. {1-2 sentences}".
6. **Maturity distribution** — Concept/Pilot/Growth/Established breakdown from atlas + observed maturity arc from case studies.
7. **Failure modes** — combine: case-study failure modes from v1 (deep) + atlas inactive operators (broad).
8. **Open questions for Common House** — refined questions that bridge case-study depth and atlas breadth. The atlas reveals 'who exists' — the open questions should be about 'what's true across them'.
9. **Provenance & methodology** — short paragraph naming both source bases: "This v{N} playbook merges {prior_source_count} operator-specific sources (Slack-distilled, deep case studies) with {atlas_count} atlas rows (PR3/EMF, structured) on {date}. The operational playbook section is preserved from prior versions; landscape, geography, and atlas operators are new in this version."

Boundaries:
- DO NOT delete or summarize away the operational depth of the prior version. The case-study material is rare; the atlas material is reproducible.
- If the prior version's claims conflict with the atlas, surface the tension explicitly rather than silently picking one.
- Do not invent numbers. If you cite a percentage, it must be reconstructable from the facts pack.
- Do not export your own opinions on whether CH should pursue this category.
- Do not duplicate the node summary.`;

function buildPromptCreate(facts) {
  return `Write v1 of the playbook for the knowledge node: **${facts.node_path}** ("${facts.node_title}").

Node summary (already on the node, do not duplicate verbatim):
> ${facts.node_summary}

Context axes the tree expects this leaf to be readable on: ${(facts.context_axes ?? []).join(", ") || "(none)"}.

Facts pack (the ONLY evidence you may use):

${JSON.stringify(facts, null, 2)}

Generate the playbook now, following the section structure in your system prompt.`;
}

function buildPromptAmend(facts, priorPlaybook, priorVersion, priorSourceCount) {
  return `Produce v${priorVersion + 1} of the playbook for **${facts.node_path}** ("${facts.node_title}").

You are merging the prior v${priorVersion} playbook (below, ${priorPlaybook.length} chars, anchored in ${priorSourceCount ?? "an unknown number of"} deep case-study sources) with a new atlas evidence base (${facts.total_operators} operators, ${facts.active_count} active).

═══════════════ PRIOR v${priorVersion} PLAYBOOK ═══════════════
${priorPlaybook}
═══════════════ END PRIOR PLAYBOOK ═══════════════

═══════════════ NEW ATLAS FACTS ═══════════════
Node summary (do not duplicate verbatim):
> ${facts.node_summary}

Context axes: ${(facts.context_axes ?? []).join(", ") || "(none)"}.

Atlas facts pack:
${JSON.stringify(facts, null, 2)}
═══════════════ END ATLAS FACTS ═══════════════

Produce the merged v${priorVersion + 1} now. Preserve the operational depth of the prior version (especially any 'how-to' or P&L content). Add the atlas dimension. Surface tensions if any. Follow the merged section structure in your system prompt.`;
}

function countBy(rows, key) {
  const m = new Map();
  for (const r of rows) {
    const v = r[key];
    if (!v) continue;
    m.set(v, (m.get(v) ?? 0) + 1);
  }
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
}

function sample(rows, kind, n) {
  const scored = rows.map((r) => {
    let s = 0;
    if (r.description) s += 2;
    if (r.year_founded && r.year_founded >= 2018) s += 2;
    if (r.year_founded && r.year_founded >= 2015) s += 1;
    if (r.employees_band && r.employees_band !== "1-10") s += 1;
    if (r.impact_description) s += 1;
    if (kind === "inactive" && r.end_date) s += 2;
    return { r, s };
  });
  scored.sort((a, b) => b.s - a.s || ((b.r.year_founded ?? 0) - (a.r.year_founded ?? 0)));
  return scored.slice(0, n).map(({ r }) => ({
    name: `${r.organization_name} — ${r.solution_name}`,
    country: r.hq_country,
    founded: r.year_founded,
    ended: r.year_ended,
    sub_category: r.sub_category,
    stage: r.stage,
    fee_type: r.fee_type,
    description: trim(r.description, 180),
    impact: trim(r.impact_description, 120),
    employees: r.employees_band,
    website: r.website,
  }));
}

function trim(s, n) {
  if (!s) return null;
  const t = s.replace(/\s+/g, " ").trim();
  return t.length > n ? t.slice(0, n - 1) + "…" : t;
}

console.log(`Synthesizing ${LEAVES.length} playbook(s) via ${MODEL}${dryRun ? " [DRY-RUN]" : ""}\n`);

for (const path of LEAVES) {
  console.log(`━━━ ${path} ━━━`);

  // 1) Load node (including existing playbook + version count)
  const { data: node, error: nErr } = await sb
    .from("knowledge_nodes")
    .select("id, path, title, summary, context_axes, playbook_md, playbook_source_count")
    .eq("path", path)
    .single();
  if (nErr || !node) { console.error(`  node not found: ${nErr?.message}`); continue; }

  const isAmend = (node.playbook_md ?? "").length > 200;
  const { data: priorVersionRow } = await sb
    .from("playbook_versions")
    .select("version")
    .eq("node_id", node.id)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  const priorVersion   = (priorVersionRow?.version ?? 0);
  const nextVersion    = priorVersion + 1;
  const mode           = isAmend ? "AMEND" : "CREATED";
  console.log(`  mode: ${mode} (prior v${priorVersion} → next v${nextVersion})`);

  // 2) Load atlas rows attached to this leaf
  const { data: rows, error: rErr } = await sb
    .from("reuse_landscape")
    .select("solution_name, organization_name, website, description, mission, solution_category, sub_category, stage, status, year_founded, year_ended, hq_country, headquarters, active_regions, active_countries, materials, channels, fee_type, wash_party, return_rate, employees_band, funding_received, impact_description, tons_plastic_avoided_2020, users_2020, products_circulated_2020, key_leadership, partner_orgs, end_date, languages")
    .eq("knowledge_node_id", node.id);
  if (rErr) { console.error(`  query failed: ${rErr.message}`); continue; }

  const all = rows ?? [];
  const active = all.filter((r) => r.status === "Active");
  const inactive = all.filter((r) => r.status === "Inactive");

  // 3) Build a structured facts pack
  const byCountry = countBy(all, "hq_country");
  const bySub     = countBy(all, "sub_category");
  const byStage   = countBy(all, "stage");
  const byForP    = countBy(all, "solution_category"); // single value for these leaves; we use sub_category mostly
  const yearActive = all.filter((r) => r.year_founded && r.status === "Active");
  const avgFounded = yearActive.length
    ? Math.round(yearActive.reduce((s, r) => s + r.year_founded, 0) / yearActive.length)
    : null;

  const facts = {
    node_path: node.path,
    node_title: node.title,
    node_summary: node.summary,
    context_axes: node.context_axes,
    total_operators: all.length,
    active_count: active.length,
    inactive_count: inactive.length,
    avg_founded_year_among_active: avgFounded,
    sub_category_breakdown: bySub.slice(0, 12),
    top_countries: byCountry.slice(0, 15),
    stage_breakdown: byStage,
    notable_active: sample(active, "active", 30),
    notable_inactive: sample(inactive, "inactive", 10),
  };

  console.log(`  rows: ${all.length} (${active.length} active, ${inactive.length} inactive)`);
  console.log(`  top countries: ${byCountry.slice(0, 5).map(([k, n]) => `${k}:${n}`).join(", ")}`);
  console.log(`  sub_cats: ${bySub.slice(0, 5).map(([k, n]) => `${k}:${n}`).join(", ")}`);

  if (dryRun) { continue; }

  // 4) Call Claude — pick prompt + system based on mode
  const prompt = isAmend
    ? buildPromptAmend(facts, node.playbook_md, priorVersion, node.playbook_source_count)
    : buildPromptCreate(facts);
  const system = isAmend ? SYSTEM_AMEND : SYSTEM_CREATE;
  const t0 = Date.now();
  const resp = await anthropic.messages.create({
    model: MODEL,
    max_tokens: isAmend ? 10000 : 6000, // amends are longer
    system,
    messages: [{ role: "user", content: prompt }],
  });
  const content = resp.content.filter((b) => b.type === "text").map((b) => b.text).join("\n").trim();
  const elapsedMs = Date.now() - t0;
  console.log(`  Claude responded in ${elapsedMs}ms, ${content.length} chars`);

  if (content.length < 800) {
    console.error("  response suspiciously short — skipping write");
    continue;
  }

  // 5) Write to knowledge_nodes, playbook_versions, changelog (sequential, no transaction
  //    available across supabase-js calls — but each is idempotent enough).
  const now = new Date().toISOString();

  // Source count for amends = prior_sources + atlas_rows (deduped against the
  // landscape table — they're different evidence bases that don't overlap by row).
  const newSourceCount = isAmend
    ? (node.playbook_source_count ?? 0) + all.length
    : all.length;

  const { error: uErr } = await sb
    .from("knowledge_nodes")
    .update({
      playbook_md: content,
      playbook_source_count: newSourceCount,
      playbook_generated_at: now,
    })
    .eq("id", node.id);
  if (uErr) { console.error(`  update node failed: ${uErr.message}`); continue; }

  const { error: vErr } = await sb
    .from("playbook_versions")
    .insert({
      node_id: node.id,
      version: nextVersion,
      content_md: content,
      source_count: newSourceCount,
      generated_at: now,
      generated_by: `reuse-landscape-synthesizer/v${nextVersion}`,
    });
  if (vErr) { console.error(`  insert version failed: ${vErr.message}`); }

  const reasoning = isAmend
    ? `v${nextVersion} playbook AMENDED — merged prior v${priorVersion} (${node.playbook_source_count ?? "?"} deep sources) with ${all.length} atlas rows (${active.length} active, ${inactive.length} inactive). Operational depth from v${priorVersion} preserved; atlas adds universe scope + geographic distribution. Model: ${MODEL}.`
    : `v1 playbook synthesized from ${all.length} atlas rows (${active.length} active, ${inactive.length} inactive). Source: public.reuse_landscape filtered by knowledge_node_id. Model: ${MODEL}. No evidence rows involved; this is a first-pass bootstrap from the PR3/EMF reuse atlas.`;
  const { error: cErr } = await sb
    .from("knowledge_node_changelog")
    .insert({
      node_id: node.id,
      action: isAmend ? "AMEND" : "CREATED", // allowed: CREATED, APPEND, AMEND, SPLIT, IGNORE
      section: "playbook_md",
      diff_before: isAmend ? (node.playbook_md ?? "").slice(0, 300) + "…" : null,
      diff_after: content.slice(0, 500) + (content.length > 500 ? "…" : ""),
      reasoning,
      status: "applied", // allowed: applied, proposed, rejected
      applied_by: "reuse-landscape-synthesizer",
      applied_at: now,
    });
  if (cErr) { console.error(`  changelog insert failed: ${cErr.message}`); }

  console.log(`  ✓ written: playbook_md (${content.length} chars), v${nextVersion}, changelog ${isAmend ? "AMEND" : "CREATED"}`);
}

console.log("\nDone.");
