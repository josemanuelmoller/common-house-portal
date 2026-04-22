/**
 * knowledge-nodes.ts — Supabase helpers for the hierarchical knowledge tree.
 *
 * Server-only module. Do NOT import from "use client" components.
 *
 * Schema (migration replace_playbooks_with_knowledge_nodes):
 *   - public.knowledge_nodes            — tree of themes → subthemes → topics (leaves)
 *   - public.knowledge_node_changelog   — every curator action, with reasoning
 *   - public.knowledge_node_citations   — when other agents/skills read a node
 *
 * Path convention:
 *   Theme   (depth 0) — "reuse"
 *   Subtheme (depth 1) — "reuse/packaging"
 *   Leaf    (depth 2+) — "reuse/packaging/refill"
 */

import { getSupabaseServerClient } from "./supabase-server";

export type NodeStatus = "Active" | "Stale" | "Archived";
export type ChangelogAction = "CREATED" | "APPEND" | "AMEND" | "SPLIT" | "IGNORE";
export type ChangelogStatus = "applied" | "proposed" | "rejected";

export type FacetSubsection = {
  key: string;     // stable identifier, e.g. "dispenser-in-store"
  title: string;   // human-readable header written into the body, e.g. "Dispenser (in-store)"
  hint: string;    // signal vocabulary the curator uses to classify evidence
};

export type Facet = {
  section: string;                  // parent section heading (## heading)
  subsections: FacetSubsection[];   // required vocabulary for ### subsections
};

export type KnowledgeNode = {
  id: string;
  path: string;
  slug: string;
  parent_id: string | null;
  depth: number;
  title: string;
  summary: string;
  body_md: string;
  tags: string[];
  facets: Facet[];
  status: NodeStatus;
  reference_count: number;
  last_evidence_at: string | null;
  last_reviewed_at: string | null;
  created_at: string;
  updated_at: string;
};

/** Returns the facet for a given section, or null if the section isn't facetted. */
export function findFacet(node: KnowledgeNode, sectionHeading: string): Facet | null {
  if (!node.facets || node.facets.length === 0) return null;
  return node.facets.find(f => f.section.toLowerCase() === sectionHeading.toLowerCase()) ?? null;
}

export type NodeChangelogEntry = {
  id: string;
  node_id: string;
  evidence_notion_id: string | null;
  action: ChangelogAction;
  section: string | null;
  diff_before: string | null;
  diff_after: string | null;
  reasoning: string;
  status: ChangelogStatus;
  applied_by: string;
  created_at: string;
  applied_at: string | null;
};

/** Tree node for UI rendering — same shape + children array + has_body indicator. */
export type TreeNode = KnowledgeNode & {
  children: TreeNode[];
};

/** Fetch all active nodes, flat. Sorted by path (hierarchical order). */
export async function getAllNodes(): Promise<KnowledgeNode[]> {
  const sb = getSupabaseServerClient();
  const { data, error } = await sb
    .from("knowledge_nodes")
    .select("*")
    .neq("status", "Archived")
    .order("path", { ascending: true });
  if (error) {
    console.error("[knowledge-nodes] getAllNodes:", error.message);
    return [];
  }
  return (data as KnowledgeNode[]) ?? [];
}

/** Fetch the full tree (nested). Roots first. */
export async function getTree(): Promise<TreeNode[]> {
  const flat = await getAllNodes();
  const byId = new Map<string, TreeNode>();
  for (const n of flat) byId.set(n.id, { ...n, children: [] });
  const roots: TreeNode[] = [];
  for (const n of flat) {
    const node = byId.get(n.id)!;
    if (n.parent_id && byId.has(n.parent_id)) {
      byId.get(n.parent_id)!.children.push(node);
    } else {
      roots.push(node);
    }
  }
  return roots;
}

/** Fetch a single node by path. Returns null if missing. */
export async function getNodeByPath(path: string): Promise<KnowledgeNode | null> {
  const sb = getSupabaseServerClient();
  const { data, error } = await sb
    .from("knowledge_nodes")
    .select("*")
    .eq("path", path)
    .maybeSingle();
  if (error) {
    console.error("[knowledge-nodes] getNodeByPath:", error.message);
    return null;
  }
  return (data as KnowledgeNode) ?? null;
}

/** Fetch direct children of a node (for breadcrumb siblings / category views). */
export async function getChildren(parentId: string): Promise<KnowledgeNode[]> {
  const sb = getSupabaseServerClient();
  const { data, error } = await sb
    .from("knowledge_nodes")
    .select("*")
    .eq("parent_id", parentId)
    .neq("status", "Archived")
    .order("slug", { ascending: true });
  if (error) {
    console.error("[knowledge-nodes] getChildren:", error.message);
    return [];
  }
  return (data as KnowledgeNode[]) ?? [];
}

/** Fetch changelog entries for a node. Most recent first. */
export async function getNodeChangelog(
  nodeId: string,
  limit = 30,
): Promise<NodeChangelogEntry[]> {
  const sb = getSupabaseServerClient();
  const { data, error } = await sb
    .from("knowledge_node_changelog")
    .select("*")
    .eq("node_id", nodeId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) {
    console.error("[knowledge-nodes] getNodeChangelog:", error.message);
    return [];
  }
  return (data as NodeChangelogEntry[]) ?? [];
}

/** Append a changelog entry. Status "applied" by default; pass "proposed" for human-review path. */
export async function appendChangelog(entry: {
  node_id: string;
  evidence_notion_id?: string | null;
  action: ChangelogAction;
  section?: string | null;
  diff_before?: string | null;
  diff_after?: string | null;
  reasoning: string;
  status?: ChangelogStatus;
  applied_by?: string;
}): Promise<void> {
  const sb = getSupabaseServerClient();
  const { error } = await sb.from("knowledge_node_changelog").insert({
    node_id: entry.node_id,
    evidence_notion_id: entry.evidence_notion_id ?? null,
    action: entry.action,
    section: entry.section ?? null,
    diff_before: entry.diff_before ?? null,
    diff_after: entry.diff_after ?? null,
    reasoning: entry.reasoning,
    status: entry.status ?? "applied",
    applied_by: entry.applied_by ?? "agent:knowledge-curator",
    applied_at: entry.status === "proposed" ? null : new Date().toISOString(),
  });
  if (error) {
    console.error("[knowledge-nodes] appendChangelog:", error.message);
    throw error;
  }
}

/** Overwrite body_md + mark last_evidence_at. Trigger keeps updated_at fresh. */
export async function updateNodeBody(
  id: string,
  body_md: string,
  options?: { summary?: string; markEvidenceAt?: boolean },
): Promise<void> {
  const sb = getSupabaseServerClient();
  const patch: Record<string, unknown> = { body_md };
  if (options?.summary !== undefined) patch.summary = options.summary;
  if (options?.markEvidenceAt) patch.last_evidence_at = new Date().toISOString();

  const { error } = await sb.from("knowledge_nodes").update(patch).eq("id", id);
  if (error) {
    console.error("[knowledge-nodes] updateNodeBody:", error.message);
    throw error;
  }
}

/** Mark a node as reviewed by a human — resets the "stale" clock. */
export async function markReviewed(id: string): Promise<void> {
  const sb = getSupabaseServerClient();
  const { error } = await sb
    .from("knowledge_nodes")
    .update({ last_reviewed_at: new Date().toISOString() })
    .eq("id", id);
  if (error) console.error("[knowledge-nodes] markReviewed:", error.message);
}

/** Log a citation — called when another agent/skill loads a node for context. */
export async function logCitation(
  nodeId: string,
  citedBy: string,
  context?: string,
): Promise<void> {
  const sb = getSupabaseServerClient();
  const { error } = await sb.from("knowledge_node_citations").insert({
    node_id: nodeId,
    cited_by: citedBy,
    context: context ?? null,
  });
  if (error) console.error("[knowledge-nodes] logCitation:", error.message);
}

/** Leaves only — nodes with no children (the consumable product pages). */
export async function getLeafNodes(): Promise<KnowledgeNode[]> {
  const flat = await getAllNodes();
  const hasChildren = new Set(flat.map(n => n.parent_id).filter(Boolean));
  return flat.filter(n => !hasChildren.has(n.id));
}

// ─── Markdown section helpers (used by the curator) ────────────────────────────

/** Split body_md into ordered {heading, body} sections (headings by `##`).
 *  `###` subheadings are preserved inside the section body. */
export function parseSections(body_md: string): { heading: string; body: string }[] {
  const lines = body_md.split(/\r?\n/);
  const sections: { heading: string; body: string }[] = [];
  let current: { heading: string; body: string } | null = null;
  for (const line of lines) {
    const m = line.match(/^##\s+(?!#)(.+)$/);
    if (m) {
      if (current) sections.push(current);
      current = { heading: m[1].trim(), body: "" };
    } else if (current) {
      current.body += (current.body ? "\n" : "") + line;
    } else {
      current = { heading: "Overview", body: line };
    }
  }
  if (current) sections.push(current);
  return sections;
}

/** Serialise sections back to markdown. */
export function serializeSections(sections: { heading: string; body: string }[]): string {
  return sections
    .map(s => `## ${s.heading}\n\n${s.body.trim()}\n`)
    .join("\n");
}

/** Parse a section body into ordered {subheading, body} blocks (by `###`).
 *  Content before the first `###` is kept under the synthetic subheading "_preamble". */
function parseSubsections(body: string): { subheading: string; body: string }[] {
  const lines = body.split(/\r?\n/);
  const out: { subheading: string; body: string }[] = [];
  let current: { subheading: string; body: string } = { subheading: "_preamble", body: "" };
  for (const line of lines) {
    const m = line.match(/^###\s+(.+)$/);
    if (m) {
      out.push(current);
      current = { subheading: m[1].trim(), body: "" };
    } else {
      current.body += (current.body ? "\n" : "") + line;
    }
  }
  out.push(current);
  return out;
}

function serializeSubsections(subs: { subheading: string; body: string }[]): string {
  return subs
    .map(s => s.subheading === "_preamble"
      ? s.body.trim()
      : `### ${s.subheading}\n\n${s.body.trim()}\n`)
    .filter(Boolean)
    .join("\n\n");
}

/**
 * Append a bullet under a target section heading. Idempotent: if the same bullet
 * text already exists, no duplicate is added (returns false).
 *
 * Strips placeholder lines like `_(Por construir.)_` or `_(Por poblar.)_` when
 * the first real content is added, so leaves stop looking empty.
 */
export function appendBullet(
  body_md: string,
  heading: string,
  bullet: string,
): { body: string; changed: boolean; before: string | null; after: string | null } {
  const sections = parseSections(body_md);
  let target = sections.find(s => s.heading.toLowerCase() === heading.toLowerCase());
  if (!target) {
    // Fall back to References
    target = sections.find(s => s.heading.toLowerCase() === "references");
    if (!target) {
      // Create References at end
      target = { heading: "References", body: "" };
      sections.push(target);
    }
  }

  const bulletLine = bullet.startsWith("- ") ? bullet : `- ${bullet}`;

  // Dedup: exact substring OR fuzzy (normalised numbers + tokens ≥ 70% overlap)
  if (target.body.includes(bulletLine) || isFuzzyDuplicate(target.body, bulletLine)) {
    return { body: body_md, changed: false, before: null, after: null };
  }

  // Strip placeholder text when adding first real content. Convention: seed
  // stubs are italic parentheticals on their own line (e.g. "_(Por construir.)_").
  // Match any line that is exclusively such a marker.
  const placeholder = /^[ \t]*_\([^\n)]*\)_[ \t]*$/gm;
  const strippedBody = target.body.replace(placeholder, "").replace(/\n{3,}/g, "\n\n").trim();

  const before = target.body;
  target.body = strippedBody
    ? `${strippedBody}\n${bulletLine}`
    : bulletLine;

  return {
    body: serializeSections(sections),
    changed: true,
    before,
    after: target.body,
  };
}

/** Normalise a bullet for fuzzy comparison: lowercase, strip punctuation,
 *  collapse numbers to "#" so "0.16–0.20" ≈ "0.155–0.197", drop Source refs. */
function normaliseForFuzzy(text: string): string {
  return text
    .toLowerCase()
    .replace(/\(source:[^)]*\)/g, "")               // drop Source: ... cite
    .replace(/\d+(?:[.,]\d+)?/g, "#")               // collapse numbers
    .replace(/[^\p{L}\p{N}\s#]/gu, " ")             // drop punctuation
    .replace(/\s+/g, " ")
    .trim();
}

/** Bag-of-tokens overlap after normalisation. Returns true when the new bullet
 *  matches an existing one with ≥70% token overlap AND the existing one is at
 *  least 30 characters (to avoid flagging short bullets like "- note"). */
function isFuzzyDuplicate(body: string, newBullet: string): boolean {
  const newNorm = normaliseForFuzzy(newBullet);
  const newTokens = new Set(newNorm.split(" ").filter(t => t.length >= 4));
  if (newTokens.size < 4) return false;

  for (const line of body.split(/\r?\n/)) {
    if (!line.trim().startsWith("- ")) continue;
    if (line.length < 30) continue;
    const existingNorm = normaliseForFuzzy(line);
    const existingTokens = new Set(existingNorm.split(" ").filter(t => t.length >= 4));
    if (existingTokens.size < 4) continue;

    let overlap = 0;
    for (const t of newTokens) if (existingTokens.has(t)) overlap++;
    const smaller = Math.min(newTokens.size, existingTokens.size);
    if (overlap / smaller >= 0.7) return true;
  }
  return false;
}

/**
 * Append a bullet inside a nested subsection (### subheading) under a parent
 * section (## heading). Used by the curator to group Concern-type evidence
 * under "Stakeholder concerns > IT", "... > Quality", etc.
 *
 * If the parent section doesn't exist → falls back to appendBullet.
 * If the subsection doesn't exist → creates it under the parent section.
 * Dedup-aware: if the same bullet line already exists anywhere inside the
 * parent section, returns changed=false.
 */
export function appendBulletInSubsection(
  body_md: string,
  heading: string,
  subheading: string,
  bullet: string,
): { body: string; changed: boolean; before: string | null; after: string | null } {
  const sections = parseSections(body_md);
  const target = sections.find(s => s.heading.toLowerCase() === heading.toLowerCase());
  if (!target) return appendBullet(body_md, heading, bullet);

  const bulletLine = bullet.startsWith("- ") ? bullet : `- ${bullet}`;

  // Dedup across the whole parent section body (exact + fuzzy)
  if (target.body.includes(bulletLine) || isFuzzyDuplicate(target.body, bulletLine)) {
    return { body: body_md, changed: false, before: null, after: null };
  }

  // Strip italic placeholder lines inside this section first
  const placeholder = /^[ \t]*_\([^\n)]*\)_[ \t]*$/gm;
  const cleaned = target.body.replace(placeholder, "").replace(/\n{3,}/g, "\n\n").trim();

  const before = target.body;

  const subs = parseSubsections(cleaned);
  const sub = subs.find(s => s.subheading.toLowerCase() === subheading.toLowerCase());
  if (sub) {
    sub.body = sub.body.trim()
      ? `${sub.body.trim()}\n${bulletLine}`
      : bulletLine;
  } else {
    subs.push({ subheading, body: bulletLine });
  }

  target.body = serializeSubsections(subs);

  return {
    body: serializeSections(sections),
    changed: true,
    before,
    after: target.body,
  };
}
