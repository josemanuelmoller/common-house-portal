/**
 * POST /api/knowledge-curator
 *
 * Mines validated evidence for domain insights and writes them into the
 * matching leaf node of the knowledge tree (public.knowledge_nodes).
 *
 * Three phases per evidence record:
 *   MINE  — extract 1-line domain insight (not project-specific)
 *   ROUTE — pick target leaf by path / title / tag match
 *   WRITE — APPEND under the right section, or AMEND / SPLIT / IGNORE
 *
 * Every action recorded in public.knowledge_node_changelog with reasoning.
 *
 * Auth: x-agent-key OR Authorization: Bearer <CRON_SECRET>.
 *
 * Input body (all optional):
 *   {
 *     evidence_ids?: string[]   // Notion IDs. If present, only these are processed.
 *     since_days?: number       // Default 7. Used only when evidence_ids not provided.
 *     dry_run?: boolean         // Default false. When true, no writes — returns plan.
 *   }
 */

import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import {
  getAllNodes,
  appendChangelog,
  updateNodeBody,
  appendBullet,
  appendBulletInSubsection,
  type KnowledgeNode,
  type ChangelogAction,
  type ChangelogStatus,
} from "@/lib/knowledge-nodes";
import { withRoutineLog } from "@/lib/routine-log";

export const maxDuration = 300;

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL = "claude-haiku-4-5-20251001";

const VALID_SECTIONS = [
  "Overview",
  "Available solutions",
  "How to implement",
  "Anti-patterns",
  "Case studies",
  "Stakeholder concerns",
  "References",
] as const;

const STAKEHOLDER_FUNCTIONS = [
  "IT", "Quality", "Operations", "Legal", "Finance", "Marketing",
  "Executive", "Procurement", "Sales", "Customer Service", "Supply Chain", "Other",
] as const;

type EvidenceRow = {
  notion_id: string;
  title: string;
  evidence_type: string | null;
  validation_status: string | null;
  confidence_level: string | null;
  reusability_level: string | null;
  evidence_statement: string | null;
  source_excerpt: string | null;
  topics: string | null;
  affected_theme: string | null;
  geography: string | null;
  stakeholder_function: string | null;
  workstream: string | null;
  project_notion_id: string | null;
  source_notion_id: string | null;
  date_captured: string | null;
};

type Classification = {
  action: ChangelogAction;
  target_path: string | null;    // null if SPLIT (new node) or IGNORE
  suggested_path?: string;       // only when SPLIT
  suggested_title?: string;      // only when SPLIT
  section: string | null;        // target section for APPEND/AMEND
  subsection?: string | null;    // for "Stakeholder concerns" grouping by function
  bullet: string | null;         // 1-line synthesis for APPEND
  replaces: string | null;       // AMEND: original bullet to replace
  reasoning: string;
};

function isAuthorized(req: NextRequest): boolean {
  const agentKey = req.headers.get("x-agent-key");
  const cronKey  = req.headers.get("authorization");
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;
  return agentKey === expected || cronKey === `Bearer ${expected}`;
}

async function fetchEvidence(
  evidenceIds: string[] | null,
  sinceDays: number,
): Promise<EvidenceRow[]> {
  const sb = getSupabaseServerClient();

  let q = sb.from("evidence")
    .select("notion_id, title, evidence_type, validation_status, confidence_level, reusability_level, evidence_statement, source_excerpt, topics, affected_theme, geography, stakeholder_function, workstream, project_notion_id, source_notion_id, date_captured")
    .eq("validation_status", "Validated");

  if (evidenceIds && evidenceIds.length > 0) {
    q = q.in("notion_id", evidenceIds);
  } else {
    const since = new Date(Date.now() - sinceDays * 86_400_000).toISOString().slice(0, 10);
    q = q.gte("date_captured", since);
  }

  const { data, error } = await q.order("date_captured", { ascending: false }).limit(100);
  if (error) {
    console.error("[knowledge-curator] fetchEvidence:", error.message);
    return [];
  }
  return (data as EvidenceRow[]) ?? [];
}

function buildTreeSummary(nodes: KnowledgeNode[]): string {
  // Only include Active nodes, sorted by path. Show path + title + summary (short).
  return nodes
    .filter(n => n.status !== "Archived")
    .map(n => {
      const indent = "  ".repeat(n.depth);
      const tags = n.tags.length ? ` [${n.tags.join(", ")}]` : "";
      return `${indent}- ${n.path} | ${n.title}${tags} — ${n.summary}`;
    })
    .join("\n");
}

function buildLeafBodyPreview(node: KnowledgeNode | undefined): string {
  if (!node) return "(no leaf selected)";
  // Trim to ~1500 chars so we don't blow the prompt budget
  const trimmed = node.body_md.length > 1500
    ? node.body_md.slice(0, 1500) + "\n...[truncated]"
    : node.body_md;
  return trimmed;
}

async function classifyEvidence(
  ev: EvidenceRow,
  tree: KnowledgeNode[],
): Promise<Classification> {
  const treeSummary = buildTreeSummary(tree);
  const leafPaths = tree.filter(n => {
    // A leaf = node with no children
    const hasChild = tree.some(c => c.parent_id === n.id);
    return !hasChild;
  }).map(n => n.path);

  const sys = `You are the knowledge curator for Common House. Your job is to decide if a piece of evidence contains reusable DOMAIN KNOWLEDGE as opposed to a one-off PROJECT FACT.

Two kinds of domain knowledge matter:

1) DOMAIN INSIGHTS — statements about how the domain works ("refill retention drops below 20% without in-store education"). Route these to Available solutions / How to implement / Anti-patterns / Case studies / References as appropriate.

2) STAKEHOLDER CONCERNS — worries, open questions, or apprehensions raised by a function/role. These are HIGHLY reusable because they repeat across clients (IT always asks similar integration questions, Quality always raises contamination, etc.).
   - Detect from evidence_type=Concern or evidence_type=Objection/Risk, or from Q&A phrasing ("what if", "how will you", "I'm worried that", "my concern is", "not sure if")
   - For these: action=APPEND, section="Stakeholder concerns", subsection = stakeholder_function (IT / Quality / Operations / Legal / Finance / Marketing / Executive / Procurement / Sales / Customer Service / Supply Chain / Other)
   - If stakeholder_function on the evidence is populated, USE IT as subsection
   - If it's null, INFER from evidence_statement / source_excerpt / topics. Only pick a function name you can justify from content. If nothing supports a specific function, use "Other"

Sections for APPEND/AMEND (pick one):
${VALID_SECTIONS.map(s => `- ${s}`).join("\n")}

Subsection is REQUIRED when section = "Stakeholder concerns", and must be one of:
${STAKEHOLDER_FUNCTIONS.map(f => `- ${f}`).join("\n")}

Rules:
- Pure project fact with no generalisation → IGNORE
- Concern / apprehension / open question from a function → APPEND to "Stakeholder concerns" with subsection
- Domain insight → APPEND to the appropriate section (no subsection)
- Contradicts existing content → AMEND, specify 'replaces'
- No matching leaf exists → SPLIT, name closest parent path + suggested new slug
- Low confidence → IGNORE with reason "low confidence"
- Respond with strict JSON only, no prose wrapper.`;

  const user = `Evidence:
- Title: ${ev.title}
- Type: ${ev.evidence_type ?? "—"}
- Statement: ${ev.evidence_statement ?? "—"}
- Source excerpt: ${ev.source_excerpt ?? "—"}
- Affected theme: ${ev.affected_theme ?? "—"}
- Topics: ${ev.topics ?? "—"}
- Geography: ${ev.geography ?? "—"}
- Workstream (sub-team this evidence comes from): ${ev.workstream ?? "—"}
- Stakeholder function (if pre-tagged): ${ev.stakeholder_function ?? "—"}
- Confidence: ${ev.confidence_level ?? "—"}
- Notion ID: ${ev.notion_id}
- Source Notion ID: ${ev.source_notion_id ?? "—"}

Knowledge tree (leaves are marked with no children below them):
${treeSummary}

Leaves available for APPEND/AMEND target_path:
${leafPaths.map(p => `- ${p}`).join("\n")}

Respond with JSON:
{
  "action": "APPEND" | "AMEND" | "SPLIT" | "IGNORE",
  "target_path": "reuse/packaging/refill" | null,
  "suggested_path": "reuse/packaging/refill" (only for SPLIT),
  "suggested_title": "Refill" (only for SPLIT),
  "section": "Available solutions" | "Stakeholder concerns" | ... | null,
  "subsection": "IT" | "Quality" | ... | null   // REQUIRED when section = "Stakeholder concerns"
  "bullet": "1-line synthesis (no Source Excerpt verbatim). (Source: <source_notion_id>/<evidence_notion_id>)" | null,
  "replaces": "original bullet text to replace" | null,
  "reasoning": "1-2 sentences why"
}`;

  const res = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 700,
    system: sys,
    messages: [{ role: "user", content: user }],
  });

  const textBlock = res.content.find(b => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("No text response from Claude");
  }
  const raw = textBlock.text.trim();
  // Strip code fences if present
  const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "");
  let parsed: Classification;
  try {
    parsed = JSON.parse(cleaned);
  } catch (err) {
    throw new Error(`Claude did not return valid JSON: ${cleaned.slice(0, 200)}`);
  }

  // Validate action
  if (!["APPEND", "AMEND", "SPLIT", "IGNORE"].includes(parsed.action)) {
    throw new Error(`Invalid action: ${parsed.action}`);
  }
  return parsed;
}

type RunResult = {
  total: number;
  applied_append: number;
  proposed_amend: number;
  proposed_split: number;
  ignored: number;
  errors: number;
  items: Array<{
    evidence_id: string;
    action: ChangelogAction;
    path: string | null;
    section: string | null;
    reasoning: string;
    status: ChangelogStatus | "error";
    error?: string;
  }>;
};

async function _POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { evidence_ids?: string[]; since_days?: number; dry_run?: boolean } = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const evidenceIds = Array.isArray(body.evidence_ids) && body.evidence_ids.length > 0
    ? body.evidence_ids
    : null;
  const sinceDays = body.since_days ?? 7;
  const dryRun = Boolean(body.dry_run);

  const [evidence, tree] = await Promise.all([
    fetchEvidence(evidenceIds, sinceDays),
    getAllNodes(),
  ]);

  const nodeByPath = new Map(tree.map(n => [n.path, n]));

  const result: RunResult = {
    total: evidence.length,
    applied_append: 0,
    proposed_amend: 0,
    proposed_split: 0,
    ignored: 0,
    errors: 0,
    items: [],
  };

  for (const ev of evidence) {
    try {
      const c = await classifyEvidence(ev, tree);

      const item: RunResult["items"][number] = {
        evidence_id: ev.notion_id,
        action: c.action,
        path: c.target_path ?? c.suggested_path ?? null,
        section: c.section,
        reasoning: c.reasoning,
        status: "error",
      };

      if (c.action === "IGNORE") {
        if (!dryRun) {
          // Still log an IGNORE against a meta-bucket? We need a node_id — skip if no target.
          // If target_path provided, log against it. Otherwise, skip the changelog entry.
          if (c.target_path && nodeByPath.has(c.target_path)) {
            await appendChangelog({
              node_id: nodeByPath.get(c.target_path)!.id,
              evidence_notion_id: ev.notion_id,
              action: "IGNORE",
              reasoning: c.reasoning,
              status: "applied",
            });
          }
        }
        item.status = "applied";
        result.ignored++;
      }
      else if (c.action === "APPEND" && c.target_path && c.section && c.bullet) {
        const node = nodeByPath.get(c.target_path);
        if (!node) throw new Error(`target_path not found: ${c.target_path}`);

        const isConcernSection = c.section.toLowerCase() === "stakeholder concerns";
        // Preference order for the subsection when writing a Concern:
        //   1) explicit subsection from the classifier response
        //   2) stakeholder_function already on the evidence row
        //   3) workstream on the evidence row (matches canonical function, e.g. "Quality")
        //   4) "Other"
        const STD_FNS = new Set([
          "IT","Quality","Operations","Legal","Finance","Marketing",
          "Executive","Procurement","Sales","Customer Service","Supply Chain","Other",
        ]);
        const workstreamAsFn = ev.workstream && STD_FNS.has(ev.workstream) ? ev.workstream : null;
        const subsection = isConcernSection
          ? (c.subsection ?? ev.stakeholder_function ?? workstreamAsFn ?? "Other")
          : null;

        const writeResult = isConcernSection && subsection
          ? appendBulletInSubsection(node.body_md, c.section, subsection, c.bullet)
          : appendBullet(node.body_md, c.section, c.bullet);
        const { body: newBody, changed, before, after } = writeResult;

        // Reflect subsection in the logged section string so the UI shows it
        const sectionLabel = subsection ? `${c.section} > ${subsection}` : c.section;

        if (!changed) {
          // Dedup → downgrade to IGNORE
          if (!dryRun) {
            await appendChangelog({
              node_id: node.id,
              evidence_notion_id: ev.notion_id,
              action: "IGNORE",
              section: sectionLabel,
              reasoning: "duplicate — already present in section",
              status: "applied",
            });
          }
          item.action = "IGNORE";
          item.status = "applied";
          item.section = sectionLabel;
          result.ignored++;
        } else {
          if (!dryRun) {
            await updateNodeBody(node.id, newBody, { markEvidenceAt: true });
            await appendChangelog({
              node_id: node.id,
              evidence_notion_id: ev.notion_id,
              action: "APPEND",
              section: sectionLabel,
              diff_before: before,
              diff_after: after,
              reasoning: c.reasoning,
              status: "applied",
            });
            // Reflect the write back onto the in-memory node so subsequent
            // APPENDs within the same run build on top of it (instead of
            // starting from the original body and overwriting each other).
            node.body_md = newBody;
          }
          item.status = "applied";
          item.section = sectionLabel;
          result.applied_append++;
        }
      }
      else if (c.action === "AMEND" && c.target_path) {
        const node = nodeByPath.get(c.target_path);
        if (!node) throw new Error(`target_path not found: ${c.target_path}`);
        if (!dryRun) {
          await appendChangelog({
            node_id: node.id,
            evidence_notion_id: ev.notion_id,
            action: "AMEND",
            section: c.section ?? null,
            diff_before: c.replaces ?? null,
            diff_after: c.bullet ?? null,
            reasoning: c.reasoning,
            status: "proposed",
          });
        }
        item.status = "proposed";
        result.proposed_amend++;
      }
      else if (c.action === "SPLIT" && c.suggested_path) {
        // Log against the nearest existing parent so it's findable in the UI.
        const parts = c.suggested_path.split("/");
        let parent: KnowledgeNode | undefined;
        for (let i = parts.length - 1; i >= 1 && !parent; i--) {
          parent = nodeByPath.get(parts.slice(0, i).join("/"));
        }
        if (!parent) throw new Error(`no parent found for suggested path ${c.suggested_path}`);
        if (!dryRun) {
          await appendChangelog({
            node_id: parent.id,
            evidence_notion_id: ev.notion_id,
            action: "SPLIT",
            reasoning: `Proposed new leaf: ${c.suggested_path} (${c.suggested_title ?? "—"}). ${c.reasoning}`,
            status: "proposed",
          });
        }
        item.status = "proposed";
        item.path = c.suggested_path;
        result.proposed_split++;
      }
      else {
        throw new Error(`classification returned incomplete payload: ${JSON.stringify(c)}`);
      }

      result.items.push(item);
    } catch (err) {
      result.errors++;
      result.items.push({
        evidence_id: ev.notion_id,
        action: "IGNORE",
        path: null,
        section: null,
        reasoning: "error during classification or write",
        status: "error",
        error: String(err).slice(0, 400),
      });
    }
  }

  console.log("[knowledge-curator]", {
    total: result.total,
    applied_append: result.applied_append,
    proposed_amend: result.proposed_amend,
    proposed_split: result.proposed_split,
    ignored: result.ignored,
    errors: result.errors,
    dry_run: dryRun,
  });

  return NextResponse.json(result);
}

export const POST = withRoutineLog("knowledge-curator", _POST);
// Vercel cron fires GET — delegate to the same wrapped handler
export const GET = POST;
