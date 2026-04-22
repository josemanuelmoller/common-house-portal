/**
 * POST /api/synthesize-leaf
 *
 * Reads a knowledge leaf's source bullets (body_md) plus its context_axes and
 * facets, and generates a prose playbook (playbook_md) that:
 *   - Organises insights as narrative, not a wall of bullets.
 *   - Respects modality subsections declared via facets (never mixes them).
 *   - Detects convergence vs. divergence across context_axes (geography,
 *     vertical, regulatory_regime, etc.) and writes a "Patterns across
 *     contexts" section when ≥2 evidence points exist.
 *   - GROUNDS every claim in evidence — never invents. If no evidence for a
 *     dimension, omits it rather than inferring.
 *   - Cites sources inline via [evidence: id] footnote-style markers.
 *
 * Auth: admin session OR CRON_SECRET.
 *
 * Input body:
 *   { node_id?: string, path?: string, dry_run?: boolean }
 *   (must provide one of node_id / path)
 */

import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import {
  getNodeByPath,
  writePlaybook,
  type KnowledgeNode,
} from "@/lib/knowledge-nodes";
import { withRoutineLog } from "@/lib/routine-log";
import { adminGuardApi } from "@/lib/require-admin";

export const maxDuration = 300;

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
// Sonnet 4.6 — narrative synthesis benefits from stronger reasoning than Haiku.
const MODEL = "claude-sonnet-4-6";

async function isAuthorized(req: NextRequest): Promise<boolean> {
  const agentKey = req.headers.get("x-agent-key");
  const cronKey  = req.headers.get("authorization");
  const expected = process.env.CRON_SECRET;
  if (expected && (agentKey === expected || cronKey === `Bearer ${expected}`)) return true;
  const denied = await adminGuardApi();
  return denied === null;
}

function countBullets(body_md: string): number {
  return (body_md.match(/^[ \t]*-\s+/gm) ?? []).length;
}

function buildFacetsBlock(node: KnowledgeNode): string {
  if (!node.facets || node.facets.length === 0) return "(no facets declared)";
  return node.facets.map(f =>
    `Section "${f.section}" splits into:\n` +
    f.subsections.map(s => `  - ${s.title} (key=${s.key}) — ${s.hint}`).join("\n")
  ).join("\n\n");
}

function buildContextAxesBlock(node: KnowledgeNode): string {
  if (!node.context_axes || node.context_axes.length === 0) {
    return "(no axes declared — no convergence/divergence analysis required)";
  }
  return node.context_axes.map(a => `- ${a}`).join("\n");
}

async function _POST(req: NextRequest) {
  if (!(await isAuthorized(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const nodeId = body.node_id as string | undefined;
  const path   = body.path as string | undefined;
  const dryRun = Boolean(body.dry_run);

  if (!nodeId && !path) {
    return NextResponse.json({ error: "node_id or path required" }, { status: 400 });
  }

  // Fetch the node
  const sb = getSupabaseServerClient();
  let node: KnowledgeNode | null = null;
  if (nodeId) {
    const { data } = await sb.from("knowledge_nodes").select("*").eq("id", nodeId).maybeSingle();
    node = (data as KnowledgeNode) ?? null;
  } else if (path) {
    node = await getNodeByPath(path);
  }
  if (!node) return NextResponse.json({ error: "Node not found" }, { status: 404 });

  const sourceCount = countBullets(node.body_md);
  if (sourceCount === 0) {
    return NextResponse.json({
      error: "Leaf has no source bullets yet — nothing to synthesise",
      hint: "Run the knowledge-curator first or write bullets manually",
    }, { status: 400 });
  }

  const facetsBlock = buildFacetsBlock(node);
  const axesBlock   = buildContextAxesBlock(node);

  const sys = `You are a senior knowledge synthesiser for Common House. Your job: read raw evidence bullets captured from validated meetings/emails/whatsapp across multiple projects and produce ONE cohesive prose playbook that a Common House team member can read in 3 minutes before a conversation.

HARD RULES — follow without exception:

1. GROUND every claim in the source bullets. If a bullet doesn't support a claim, don't make it. NEVER invent, infer, or generalise beyond the evidence.

2. CITE each claim inline using [evidence: <notion_id>] at the end of the sentence or clause. If a claim is supported by multiple bullets, cite all of them.

3. RESPECT the facet structure. When the leaf declares facets (modality subsections), organise the playbook sections around those facets. Do NOT mix modalities into the same paragraph. Example: Dispenser (in-store) and Applicator + solid refill must be discussed separately — they are different architectures.

4. DETECT convergence vs. divergence along the declared context_axes. After the per-facet sections, include a "Patterns across contexts" section that explicitly states:
   - What converges across evidence (claims supported by multiple projects/geographies/etc.)
   - What varies by which axis ("in LATAM X, in Africa Y")
   - What is only a single data point (flag as hypothesis, not principle)

5. NARRATIVE, not bullets. Write flowing paragraphs. Use sub-headings (### ) to structure. Bullets only where a genuine list is clearer (e.g., step-by-step implementation sequences, or a short enumeration). The WHOLE document must not read as a pile of bullets.

6. OMIT dimensions without evidence. If the leaf has a "Case studies" facet but no actual case study evidence, skip it entirely. Do NOT write "(no data yet)" — just omit.

7. USE the original language / register of the domain. Spanish terms (refill, envase, piloto, retail) can stay in Spanish if they are the natural vocabulary. No over-translation.

8. LENGTH: target 800-1800 words depending on how much evidence you have. Fewer bullets → shorter playbook. More evidence → more detail, up to the cap.

OUTPUT: pure markdown, starting with a top-level # title, then sections. No wrapping prose, no code fence.`;

  const user = `Synthesise a playbook for this leaf.

=== LEAF METADATA ===
Title: ${node.title}
Path: ${node.path}
Summary: ${node.summary}
Tags: ${node.tags.join(", ") || "—"}

=== FACETS (use as section structure when organising) ===
${facetsBlock}

=== CONTEXT AXES (detect convergence/divergence along these) ===
${axesBlock}

=== SOURCE BULLETS (the ONLY material you may use) ===
${node.body_md}

=== INSTRUCTIONS ===
Write the playbook now. Remember: prose with ### sub-headings where useful. Every claim cited with [evidence: <id>]. Respect facets as section structure. Conclude with "## Patterns across contexts" when ≥2 distinct contexts exist in the evidence.`;

  const res = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 4000,
    system: sys,
    messages: [{ role: "user", content: user }],
  });

  const block = res.content.find(b => b.type === "text");
  if (!block || block.type !== "text") {
    return NextResponse.json({ error: "No text response from Claude" }, { status: 500 });
  }
  const playbook_md = block.text.trim();

  if (!dryRun) {
    await writePlaybook(node.id, playbook_md, sourceCount);
  }

  return NextResponse.json({
    node_id: node.id,
    path: node.path,
    source_count: sourceCount,
    playbook_length: playbook_md.length,
    tokens_in: res.usage?.input_tokens,
    tokens_out: res.usage?.output_tokens,
    playbook_md,
  });
}

export const POST = withRoutineLog("synthesize-leaf", _POST);
// Vercel cron fires GET; delegate
export const GET = POST;
