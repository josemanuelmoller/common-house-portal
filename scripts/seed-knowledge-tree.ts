/**
 * scripts/seed-knowledge-tree.ts
 *
 * Idempotent bootstrap of the Common House domain knowledge taxonomy
 * (`public.knowledge_nodes`). Mirrors `docs/CH_KNOWLEDGE_TREE.md`.
 *
 * Why this exists: the tree was originally created manually in production
 * via a one-off migration that was never checked into the repo. A fresh
 * environment (CI, local dev, a future prod restore) needs a deterministic
 * way to recreate the canonical shape. This script does that without
 * touching any node that already exists (insert-only, ON CONFLICT (path)
 * DO NOTHING).
 *
 * Run:
 *   tsx scripts/seed-knowledge-tree.ts            # dry-run, prints diff
 *   tsx scripts/seed-knowledge-tree.ts --execute  # actually insert
 *
 * Env required: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (server-only).
 */

import { createClient } from "@supabase/supabase-js";

type SeedNode = {
  path: string;
  title: string;
  summary: string;
  tags?: string[];
  context_axes?: string[];
};

// ─── Canonical taxonomy ─────────────────────────────────────────────────────
// Source of truth: docs/CH_KNOWLEDGE_TREE.md. Keep both in sync.
const SEED: SeedNode[] = [
  // Theme: Reuse
  { path: "reuse",                                    title: "Reuse",
    summary: "Cómo se diseña, opera y escala el reuso en distintos verticales." },
  { path: "reuse/packaging",                          title: "Packaging",
    summary: "Empaques reutilizables — refill, retornables, transporte reutilizable.",
    tags: ["stream:upstream"] },
  { path: "reuse/packaging/refill",                   title: "Refill",
    summary: "Refill (EMF taxonomy) — el usuario rellena su propio envase. Dos modos: on the go (fuera del hogar) y at home (en el hogar). No incluye return (sistema industrial) ni concentrate sin envase reusable (reduction, no reuse).",
    tags: ["stream:upstream"], context_axes: ["geography","format","consumer-type","regulatory-region"] },
  { path: "reuse/packaging/refill/on-the-go",         title: "Refill on the go",
    summary: "Refill que ocurre fuera del hogar — dispenser in-store, bulk stations, BYO container. EMF: Refill on the go. Ejemplos: AutoMercado detergente, Algramo, bulk grocery.",
    tags: ["stream:upstream"], context_axes: ["geography","format","consumer-type","regulatory-region"] },
  { path: "reuse/packaging/refill/at-home",           title: "Refill at home",
    summary: "Refill que ocurre en el hogar — aplicador reutilizable + refill sólido/concentrado. EMF: Refill at home. Ejemplos: SUFI desodorante, Wild, Blueland tabletas.",
    tags: ["stream:upstream"], context_axes: ["geography","format","consumer-type","regulatory-region"] },
  { path: "reuse/packaging/return",                   title: "Return",
    summary: "Return (EMF taxonomy) — el envase regresa al productor. Dos modos: on the go (drop-off por el cliente) y from home (pickup del domicilio).",
    tags: ["stream:upstream"] },
  { path: "reuse/packaging/return/on-the-go",         title: "Return on the go",
    summary: "Return donde el cliente deja el envase vacío en un punto de drop-off (tienda, RVM, deposit scheme). EMF: Return on the go. Ejemplos: DRS UK, botella de vidrio retornable LATAM.",
    tags: ["stream:upstream"], context_axes: ["geography","format","consumer-type","regulatory-region"] },
  { path: "reuse/packaging/return/from-home",         title: "Return from home",
    summary: "Return donde el envase vacío es recogido del domicilio del cliente. EMF: Return from home. Ejemplos: Loop (TerraCycle), leche a domicilio, direct-to-consumer pickup.",
    tags: ["stream:upstream"], context_axes: ["geography","format","consumer-type","regulatory-region"] },
  { path: "reuse/packaging/transit",                  title: "Transit packaging",
    summary: "Packaging de transporte reutilizable — cajas, pallets, totes, containers.",
    tags: ["stream:upstream"] },
  { path: "reuse/construction",                       title: "Construction",
    summary: "Reuso de materiales de construcción — demolición selectiva, mercados de segunda." },
  { path: "reuse/electronics",                        title: "Electronics",
    summary: "Reuso de electrónica — refurb, partes, segunda vida." },
  { path: "reuse/secondhand",                         title: "Secondhand & peer-to-peer — Resale and peer-to-peer trading platforms for used products",
    summary: "" },
  { path: "reuse/textile",                            title: "Textile",
    summary: "Reuso textil — reventa, remake, alquiler." },

  // Theme: Organics
  { path: "organics",                                 title: "Organics",
    summary: "Tratamiento y valorización de orgánicos — de fuente doméstica a industrial." },
  { path: "organics/biodigestor",                     title: "Biodigestor",
    summary: "Digestión anaeróbica — biogás y digestato." },
  { path: "organics/compost",                         title: "Compost",
    summary: "Compostaje — aeróbico, tambor, industrial." },
  { path: "organics/compost/bsf",                     title: "BSF composting",
    summary: "Black Soldier Fly — bioconversión de orgánicos a proteína animal.",
    tags: ["stream:organics"] },

  // Theme: New materials
  { path: "new-materials",                            title: "New materials",
    summary: "Materiales alternativos — biomateriales, sustitutos de plásticos y compuestos emergentes." },
  { path: "new-materials/biomaterials",               title: "Biomaterials",
    summary: "Materiales derivados de fuentes biológicas — PHA, PLA, micelio, algas." },
  { path: "new-materials/biomaterials/certification-standards",
    title: "Certification standards and regulatory frameworks",
    summary: "" },
];

// ─── Stub body for a fresh leaf (idempotent — only inserted on create) ──────
const STUB_BODY = [
  "## Overview",
  "",
  "_(Por construir.)_",
  "",
  "## Available solutions",
  "",
  "_(Por construir.)_",
  "",
  "## How to implement",
  "",
  "_(Por construir.)_",
  "",
  "## Anti-patterns",
  "",
  "_(Por construir.)_",
  "",
  "## Case studies",
  "",
  "_(Por poblar.)_",
  "",
  "## Stakeholder concerns",
  "",
  "_(Preguntas y preocupaciones agrupadas por función.)_",
  "",
  "## References",
  "",
  "_(Por poblar.)_",
  "",
].join("\n");

function isLeaf(node: SeedNode): boolean {
  // Heuristic: a leaf is a node with no other node having `path` starting
  // with `node.path + "/"`. Computed at script time over the SEED array.
  return !SEED.some((other) => other.path !== node.path && other.path.startsWith(node.path + "/"));
}

async function main() {
  const execute = process.argv.includes("--execute");
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("[seed-knowledge-tree] missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
  }
  const sb = createClient(url, key);

  // Sort by depth so parents land first (FK on parent_id is SET NULL on
  // delete, so missing parents would just leave the FK null — but the path
  // resolution needs the parent in the same run when we backfill parent_id).
  const sorted = [...SEED].sort((a, b) => a.path.split("/").length - b.path.split("/").length);

  // Pre-fetch existing paths to compute the diff.
  const { data: existing, error: exErr } = await sb
    .from("knowledge_nodes")
    .select("path,id")
    .in("path", sorted.map((n) => n.path));
  if (exErr) {
    console.error("[seed-knowledge-tree] fetch existing failed:", exErr.message);
    process.exit(1);
  }
  const existingPaths = new Set((existing ?? []).map((r: { path: string }) => r.path));
  const existingIdByPath = new Map<string, string>(
    (existing ?? []).map((r: { path: string; id: string }) => [r.path, r.id]),
  );

  const toInsert = sorted.filter((n) => !existingPaths.has(n.path));
  console.log(`[seed-knowledge-tree] ${SEED.length} canonical, ${existingPaths.size} already present, ${toInsert.length} to insert`);

  if (toInsert.length === 0) {
    console.log("[seed-knowledge-tree] nothing to do.");
    return;
  }

  if (!execute) {
    console.log("[seed-knowledge-tree] DRY RUN — pass --execute to actually insert");
    for (const n of toInsert) console.log(`  + ${n.path} (${n.title})`);
    return;
  }

  // Insert in dependency order so parent_id can be resolved against rows
  // we just inserted.
  for (const node of toInsert) {
    const parts = node.path.split("/");
    const slug = parts[parts.length - 1];
    const depth = parts.length - 1;
    let parentId: string | null = null;
    if (depth > 0) {
      const parentPath = parts.slice(0, -1).join("/");
      parentId = existingIdByPath.get(parentPath) ?? null;
      if (!parentId) {
        // Look it up live in case a previous loop iteration just inserted it.
        const { data: p } = await sb
          .from("knowledge_nodes")
          .select("id")
          .eq("path", parentPath)
          .maybeSingle();
        parentId = (p as { id: string } | null)?.id ?? null;
      }
    }

    const body_md = isLeaf(node) ? STUB_BODY : "";
    const { data: ins, error } = await sb
      .from("knowledge_nodes")
      .insert({
        path: node.path,
        slug,
        parent_id: parentId,
        depth,
        title: node.title,
        summary: node.summary,
        body_md,
        tags: node.tags ?? [],
        context_axes: node.context_axes ?? [],
      })
      .select("id")
      .single();

    if (error) {
      console.error(`[seed-knowledge-tree] insert ${node.path} failed:`, error.message);
      process.exit(1);
    }
    existingIdByPath.set(node.path, (ins as { id: string }).id);
    console.log(`  ✓ ${node.path}`);
  }

  console.log(`[seed-knowledge-tree] inserted ${toInsert.length} nodes.`);
}

main().catch((err) => {
  console.error("[seed-knowledge-tree] fatal:", err);
  process.exit(1);
});
