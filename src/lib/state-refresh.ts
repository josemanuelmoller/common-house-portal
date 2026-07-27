import "server-only";

import Anthropic from "@anthropic-ai/sdk";
import { supabaseAdmin } from "@/lib/supabase";
import { loadActiveProjects } from "@/lib/project-context";
import {
  makeUsageAccumulator,
  addUsage,
  computeAnthropicCost,
  type AnthropicUsage,
} from "@/lib/anthropic-cost";
import {
  HEALTH,
  IMPACT,
  ITEM_RESOLVE_STATUSES,
  ITEM_UPDATE_STATUSES,
  LEARNING_TYPES,
  PROPOSAL_KINDS,
  STATE_ITEM_TYPES,
  partitionApplicable,
} from "@/lib/state-proposal-insert";

/**
 * Incremental project state-refresh job.
 *
 * Reads only NEW validated evidence since the last accepted state change and
 * PROPOSES updates to a project's current state. It never writes project_states
 * or project_state_items directly, and never promotes an observation to a
 * knowledge asset. A human accepts each proposal (see the proposals API), and
 * acceptance is what mutates state.
 *
 * Guardrails encoded here:
 *  - delta-only: window starts at the last accepted revision or the last
 *    proposal window, never re-reading evidence already considered;
 *  - proposal-first: output rows land in project_state_proposals at status
 *    'pending' and touch nothing else;
 *  - source-preserving: every proposal carries the evidence IDs that justify it;
 *  - no uuid hallucination: the model references items/evidence by safe labels
 *    that are mapped back to IDs server-side;
 *  - enum-safe: every model-provided type/status is whitelist-validated.
 */

const STATE_MODEL = "claude-sonnet-4-6";
const DEFAULT_LOOKBACK_DAYS = 30;
const MAX_EVIDENCE_PER_PROJECT = 40;
const DAY_MS = 86_400_000;
const ZERO_UUID = "00000000-0000-0000-0000-000000000000";
// Calibration: at most this many proposals per project per run, and the trigram
// similarity at/above which an add_item is treated as a duplicate.
const MAX_PROPOSALS_PER_RUN = 8;
// Bajado de 0.5 a 0.45 el 2026-07-28. A 0.5 pasaban duplicados evidentes:
// "Product launch will occur at PDX Guayabos and Moravia…" (17 jul) contra
// "Product launch will take place at both PDX Guayabos and Mo…" (20 jul) da
// 0.49 — la misma afirmación reescrita, propuesta dos veces al PM.
//
// 0.45 es el piso, no una preferencia. Medido contra la bandeja del 28 jul:
// los tres duplicados reales caían entre 0.46 y 0.49, y la pareja distinta más
// parecida daba 0.42 ("retrasos en materiales de diseño" vs "evento presencial
// del 10-11 de agosto"). Bajar más empieza a suprimir afirmaciones legítimas.
//
// LÍMITE CONOCIDO — trigram no alcanza para el resto. En los mismos datos,
// "Each container requires a unique QR code label" y "Each container must carry
// a unique label with QR code" son el MISMO hecho y puntúan 0.38: por debajo de
// esa pareja distinta de 0.42. Las bandas se cruzan, así que ningún umbral
// separa los dos casos. Cazar esos duplicados pide comparación semántica
// (embeddings sobre statement, o que el modelo vea las pendientes al proponer),
// no calibración. No mover este número esperando resolverlo.
const SIMILARITY_THRESHOLD = 0.45;
const IMPACT_RANK: Record<string, number> = { critical: 3, high: 2, medium: 1, low: 0 };

function normalizeStatement(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9áéíóúñü ]+/gi, "").replace(/\s+/g, " ").trim();
}

// ─── Contract sets ────────────────────────────────────────────────────────────
// Owned by state-proposal-insert, which is where they are kept in sync with the
// project_state_proposals_applicable CHECK and with apply_state_proposal.

// ─── Types ────────────────────────────────────────────────────────────────────

export type EvidenceDeltaRow = {
  id: string;
  type: string;
  title: string;
  statement: string;
  confidenceLevel: string | null;
  dateCaptured: string | null;
  resolutionStatus: string | null;
  createdAt: string;
  updatedAt: string;
};

type EvidenceCursor = { at: string; id: string };

type ActiveItem = {
  id: string;
  itemType: string;
  statement: string;
  status: string;
  ownerLabel: string | null;
  stakeholderLabel: string | null;
};

type ProjectContext = {
  id: string;
  notionId: string | null;
  name: string;
  state: {
    currentSummary: string | null;
    currentPhase: string | null;
    currentFocus: string | null;
    health: string;
    confidence: number;
  } | null;
  items: ActiveItem[];
  /** Lo ya propuesto y todavía sin revisar. Sin esto el job es ciego a su
   *  propia cola: sólo ve lo que un humano aceptó, y con la aceptación al 12%
   *  vuelve a derivar de evidencia solapada lo que ya había propuesto. */
  pending: PendingProposal[];
};

type PendingProposal = {
  id: string;
  kind: string;
  itemType: string | null;
  statement: string;
  createdAt: string;
};

export type ProjectRefreshResult = {
  projectId: string;
  projectName: string;
  windowStart: string;
  windowEnd: string;
  evidenceConsidered: number;
  /** How many proposals the model returned before server-side validation. */
  modelProposed: number;
  /**
   * Returned by the model but dropped by server-side validation: unknown kind,
   * no traceable evidence, or a payload the apply path could not act on (see
   * normalizeProposal). Historically zero — a run that starts discarding is the
   * signal to look at the model output.
   */
  discarded: number;
  /** Dropped after validation by dedup (duplicate of an active claim / pending proposal) or the per-run cap. */
  suppressed: number;
  proposalsCreated: number;
  skippedReason?: string;
};

export type StateRefreshSummary = {
  projectsChecked: number;
  proposalsCreated: number;
  results: ProjectRefreshResult[];
  costUsd: number;
  errors: string[];
};

// Confidence words → the 0-100 smallint the state layer stores.
function mapConfidence(level: string | null): number {
  switch ((level ?? "").toLowerCase()) {
    case "high": return 85;
    case "medium": return 60;
    case "low": return 35;
    default: return 50;
  }
}

function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * DAY_MS).toISOString();
}

// ─── Delta boundary + evidence read ───────────────────────────────────────────

/**
 * The per-project keyset cursor over (updated_at, id) of Validated evidence. On
 * the first run (no cursor row) it starts at a lookback so we don't reprocess the
 * project's entire history. The migration-seeded last_state_change_at is NOT used
 * as a boundary — it was stamped now() at migration time and marks no evidence
 * review. updated_at (not validated_at) is deliberate: it moves on any
 * operational change while the evidence stays Validated, so a later
 * resolve/revert/correction is re-seen — the reversal we want to detect.
 */
async function resolveCursor(projectId: string, lookbackDays: number): Promise<EvidenceCursor> {
  const { data, error } = await supabaseAdmin()
    .from("project_evidence_cursors")
    .select("cursor_updated_at, cursor_id")
    .eq("project_id", projectId)
    .maybeSingle();
  if (error) throw new Error(`cursor read failed: ${error.message}`);
  if (!data) return { at: isoDaysAgo(lookbackDays), id: ZERO_UUID };
  return { at: data.cursor_updated_at as string, id: (data.cursor_id as string) ?? ZERO_UUID };
}

// Cursor advance is no longer a separate write: commit_state_proposals inserts
// the proposals AND advances the cursor in one transaction (advisory-locked +
// optimistic), so a crash between the two is impossible and concurrent runs can't
// double-insert. See runStateRefreshForProject.

export async function getEvidenceDelta(
  projectNotionId: string,
  cursor: EvidenceCursor,
): Promise<EvidenceDeltaRow[]> {
  // Keyset read via RPC: (updated_at, id) > cursor, ascending, capped. Row-value
  // comparison is correct at the boundary and index-backed.
  const { data, error } = await supabaseAdmin().rpc("next_evidence_batch", {
    p_project_notion_id: projectNotionId,
    p_cursor_at: cursor.at,
    p_cursor_id: cursor.id,
    p_limit: MAX_EVIDENCE_PER_PROJECT,
  });
  if (error) throw new Error(`evidence delta read failed: ${error.message}`);
  return ((data ?? []) as Record<string, unknown>[]).map((row) => ({
    id: row.id as string,
    type: (row.evidence_type as string | null) ?? "",
    title: (row.title as string | null) ?? "",
    statement: (row.evidence_statement as string | null) ?? "",
    confidenceLevel: (row.confidence_level as string | null) ?? null,
    dateCaptured: (row.date_captured as string | null) ?? null,
    resolutionStatus: (row.resolution_status as string | null) ?? null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  }));
}

async function loadProjectContext(projectId: string): Promise<ProjectContext | null> {
  const sb = supabaseAdmin();
  const [projectRes, stateRes, itemsRes, pendingRes] = await Promise.all([
    sb.from("projects").select("id, notion_id, name").eq("id", projectId).maybeSingle(),
    sb.from("project_states")
      .select("current_summary, current_phase, current_focus, health, confidence")
      .eq("project_id", projectId).maybeSingle(),
    sb.from("project_state_items")
      .select("id, item_type, statement, status, owner_label, stakeholder_label")
      .eq("project_id", projectId).eq("status", "active")
      .order("updated_at", { ascending: false }).limit(60),
    sb.from("project_state_proposals")
      .select("id, proposal_kind, item_type, summary, payload, created_at")
      .eq("project_id", projectId).eq("status", "pending")
      .order("created_at", { ascending: false }).limit(40),
  ]);
  if (projectRes.error) throw new Error(`project read failed: ${projectRes.error.message}`);
  if (!projectRes.data) return null;
  const s = stateRes.data;
  return {
    id: projectRes.data.id as string,
    notionId: (projectRes.data.notion_id as string | null) ?? null,
    name: (projectRes.data.name as string | null) ?? "Untitled project",
    state: s ? {
      currentSummary: (s.current_summary as string | null) ?? null,
      currentPhase: (s.current_phase as string | null) ?? null,
      currentFocus: (s.current_focus as string | null) ?? null,
      health: (s.health as string | null) ?? "unknown",
      confidence: (s.confidence as number | null) ?? 50,
    } : null,
    items: (itemsRes.data ?? []).map((row) => ({
      id: row.id as string,
      itemType: row.item_type as string,
      statement: row.statement as string,
      status: row.status as string,
      ownerLabel: (row.owner_label as string | null) ?? null,
      stakeholderLabel: (row.stakeholder_label as string | null) ?? null,
    })),
    pending: (pendingRes.data ?? []).map((row) => ({
      id: row.id as string,
      kind: row.proposal_kind as string,
      itemType: (row.item_type as string | null) ?? null,
      statement: ((row.payload as Record<string, unknown> | null)?.statement as string | null)
        ?? (row.summary as string | null) ?? "",
      createdAt: row.created_at as string,
    })).filter((p) => p.statement.trim() !== ""),
  };
}

// ─── Model call (forced structured output) ────────────────────────────────────

const PROPOSAL_TOOL: Anthropic.Tool = {
  name: "record_state_proposals",
  description: "Record the proposed changes to the project's current operating state. Return an empty array if the new evidence does not materially change the state.",
  input_schema: {
    type: "object",
    properties: {
      proposals: {
        type: "array",
        items: {
          type: "object",
          properties: {
            kind: { type: "string", enum: ["add_item", "update_item", "resolve_item", "state_summary", "add_learning"] },
            target_ref: { type: "string", description: "For update_item/resolve_item: the A-label of the existing active item this changes (e.g. 'A2')." },
            supersedes: { type: "string", description: "P-label of a pending proposal that this one makes obsolete (e.g. 'P3'). Use when new evidence corrects or updates something already queued, instead of adding a second entry that contradicts it." },
            item_type: { type: "string", enum: ["decision", "commitment", "risk", "dependency", "question", "milestone", "stakeholder_signal", "assumption", "outcome"], description: "For add_item: the claim type." },
            summary: { type: "string", description: "One-line headline of the proposed change." },
            rationale: { type: "string", description: "Why the new evidence justifies this, in one or two sentences." },
            impact: { type: "string", enum: ["low", "medium", "high", "critical"] },
            source_evidence_refs: { type: "array", items: { type: "string" }, description: "E-labels of the evidence that justifies this (e.g. ['E1','E4'])." },
            proposed: {
              type: "object",
              description: "Concrete proposed field values. Shape depends on kind.",
              properties: {
                statement: { type: "string" },
                owner_label: { type: "string" },
                stakeholder_label: { type: "string" },
                due_at: { type: "string", description: "ISO date, if a deadline is implied." },
                status: { type: "string" },
                resolution_note: { type: "string" },
                current_summary: { type: "string" },
                current_phase: { type: "string" },
                current_focus: { type: "string" },
                health: { type: "string", enum: ["on_track", "watch", "blocked", "paused", "unknown"] },
                learning_type: { type: "string", enum: ["implementation_question", "stakeholder_need", "friction", "decision_pattern", "operating_pattern", "outcome"] },
                area: { type: "string" },
                title: { type: "string" },
                observation: { type: "string" },
                implication: { type: "string" },
              },
            },
          },
          required: ["kind", "summary", "rationale", "impact", "source_evidence_refs", "proposed"],
        },
      },
    },
    required: ["proposals"],
  },
};

type RawProposal = {
  kind?: string;
  target_ref?: string;
  supersedes?: string;
  item_type?: string;
  summary?: string;
  rationale?: string;
  impact?: string;
  source_evidence_refs?: string[];
  proposed?: Record<string, unknown>;
};

function buildPrompt(ctx: ProjectContext, evidence: EvidenceDeltaRow[], itemLabels: Map<string, string>): string {
  const stateBlock = ctx.state
    ? [
        `Summary: ${ctx.state.currentSummary ?? "(none)"}`,
        `Phase: ${ctx.state.currentPhase ?? "(none)"} · Focus: ${ctx.state.currentFocus ?? "(none)"}`,
        `Health: ${ctx.state.health} · Confidence: ${ctx.state.confidence}`,
      ].join("\n")
    : "(no current state recorded yet)";

  const itemLines = ctx.items.length
    ? ctx.items.map((it) => `${itemLabels.get(it.id)} [${it.itemType}] ${it.statement}${it.ownerLabel ? ` — owner: ${it.ownerLabel}` : ""}`).join("\n")
    : "(no active claims yet)";

  // La cola pendiente entra al prompt como P-labels. El modelo puede así no
  // repetir lo que ya propuso, y sobre todo declarar que una propuesta nueva
  // REEMPLAZA a una pendiente cuando la evidencia fresca la deja obsoleta: es
  // el caso "la máquina llega en mayo" → "se retrasó a agosto", que hoy entra
  // como dos afirmaciones que conviven y se contradicen.
  const pendingLines = ctx.pending.length
    ? ctx.pending.map((pp, i) => `P${i + 1} [${pp.kind}${pp.itemType ? `/${pp.itemType}` : ""}] (propuesta ${pp.createdAt.slice(0, 10)}) ${pp.statement}`).join("\n")
    : "(nothing queued)";

  const evLines = evidence.map((e, i) =>
    `E${i + 1} [${e.type}${e.resolutionStatus ? `/${e.resolutionStatus}` : ""}] (${e.confidenceLevel ?? "conf?"}, ${e.dateCaptured ?? e.createdAt.slice(0, 10)}) ${e.title}: ${e.statement}`
  ).join("\n");

  return `You maintain the CURRENT OPERATING STATE of a Common House project — the short, reviewable model an operator acts on, not a transcript. You are given the current state, the active claims, and only the NEW validated evidence since the last review. Propose the smallest set of changes that keep the state true.

PROJECT: ${ctx.name}

CURRENT STATE:
${stateBlock}

ACTIVE CLAIMS (reference by A-label for update_item/resolve_item):
${itemLines}

ALREADY PROPOSED, AWAITING HUMAN REVIEW (reference by P-label in supersedes):
${pendingLines}

NEW VALIDATED EVIDENCE (reference by E-label in source_evidence_refs):
${evLines}

RULES:
- Propose ONLY what the new evidence materially changes. If nothing material changed, return an empty proposals array.
- The P-list is work you already proposed that nobody has reviewed yet. Treat it as known, not as missing:
  - Do NOT re-propose something a P-item already says. Restating it in different words creates two queue entries for one decision.
  - If new evidence makes a P-item WRONG or OUT OF DATE, propose the corrected version and set "supersedes" to that P-label. The stale one is then closed automatically instead of sitting next to yours contradicting it.
  - A P-item is not an active claim: never target it with update_item/resolve_item (those take A-labels).
- Prefer resolving or updating an existing active claim over adding a duplicate. Use resolve_item when evidence shows a claim is done, reversed, or no longer relevant (set proposed.status to resolved/superseded/expired/unknown and give a resolution_note).
- add_item for a genuinely new decision, commitment, risk, dependency, question, milestone, stakeholder signal, assumption or outcome.
- state_summary only when the overall summary/phase/focus/health should change.
- add_learning for reusable implementation insight (a question from Quality/Marketing/Ops, a friction, a decision or operating pattern) — this is an OBSERVATION, never institutional knowledge, and must not restate a one-off project fact.
- Every proposal MUST cite the E-labels that justify it in source_evidence_refs.
- Do not invent evidence. Do not propose reviving anything without fresh evidence in this batch.
- Keep summaries and statements concise and factual.`;
}

async function proposeStateChanges(
  ctx: ProjectContext,
  evidence: EvidenceDeltaRow[],
  anthropic: Anthropic,
  usageAcc: AnthropicUsage,
): Promise<RawProposal[]> {
  const itemLabels = new Map<string, string>();
  ctx.items.forEach((it, i) => itemLabels.set(it.id, `A${i + 1}`));

  const msg = await anthropic.messages.create({
    model: STATE_MODEL,
    max_tokens: 8000,
    tools: [PROPOSAL_TOOL],
    tool_choice: { type: "tool", name: "record_state_proposals" },
    messages: [{ role: "user", content: buildPrompt(ctx, evidence, itemLabels) }],
  });
  addUsage(usageAcc, msg.usage);

  const toolUse = msg.content.find(
    (block): block is Anthropic.ToolUseBlock => block.type === "tool_use",
  );
  const input = (toolUse?.input ?? {}) as { proposals?: RawProposal[] };
  // A max_tokens stop truncates the tool JSON to an unparseable {}. Surface it —
  // silently returning [] would masquerade as a healthy "nothing to propose".
  if (msg.stop_reason === "max_tokens" && !Array.isArray(input.proposals)) {
    throw new Error(`state proposal generation truncated (max_tokens) for ${ctx.name}`);
  }
  return Array.isArray(input.proposals) ? input.proposals : [];
}

// ─── Normalize + persist (whitelist everything the model returned) ────────────

type ProposalInsert = {
  project_id: string;
  proposal_kind: string;
  target_item_id: string | null;
  item_type: string | null;
  summary: string;
  rationale: string;
  impact: string;
  confidence: number;
  source_refs: string[];
  payload: Record<string, unknown>;
  status: "pending";
  evidence_window_start: string;
  evidence_window_end: string;
  generated_by: string;
  model: string;
  /** Propuesta pendiente que ésta deja obsoleta. La resuelve el servidor desde
   *  la P-label: el modelo nunca ve ni escribe uuids. */
  supersedes_proposal_id: string | null;
};

function normalizeProposal(
  raw: RawProposal,
  ctx: ProjectContext,
  evidence: EvidenceDeltaRow[],
  labelToItemId: Map<string, string>,
  labelToPendingId: Map<string, string>,
  windowStart: string,
  windowEnd: string,
): ProposalInsert | null {
  const kind = typeof raw.kind === "string" ? raw.kind : "";
  if (!PROPOSAL_KINDS.has(kind)) return null;
  const summary = typeof raw.summary === "string" ? raw.summary.trim() : "";
  const rationale = typeof raw.rationale === "string" ? raw.rationale.trim() : "";
  if (!summary || !rationale) return null;

  // Map E-labels → real evidence UUIDs; drop anything that isn't in this batch.
  const evByLabel = new Map<string, string>();
  evidence.forEach((e, i) => evByLabel.set(`E${i + 1}`, e.id));
  const sourceRefs = [...new Set((raw.source_evidence_refs ?? [])
    .map((ref) => evByLabel.get(String(ref).trim().toUpperCase()))
    .filter((v): v is string => typeof v === "string"))];
  // A proposal with no traceable evidence violates the source-preserving rule.
  if (sourceRefs.length === 0) return null;

  const impact = IMPACT.has(raw.impact ?? "") ? raw.impact! : "medium";
  const proposedIn = (raw.proposed ?? {}) as Record<string, unknown>;
  const str = (k: string) => (typeof proposedIn[k] === "string" ? (proposedIn[k] as string).trim() || undefined : undefined);

  // Aggregate confidence for the proposal from the cited evidence.
  const citedConfidence = evidence
    .filter((e, i) => sourceRefs.includes(e.id) && evByLabel.get(`E${i + 1}`) === e.id)
    .map((e) => mapConfidence(e.confidenceLevel));
  const confidence = citedConfidence.length
    ? Math.round(citedConfidence.reduce((a, b) => a + b, 0) / citedConfidence.length)
    : 50;

  let targetItemId: string | null = null;
  let itemType: string | null = null;
  const payload: Record<string, unknown> = {};

  switch (kind) {
    case "add_item": {
      const t = STATE_ITEM_TYPES.has(raw.item_type ?? "") ? raw.item_type! : "assumption";
      const statement = str("statement");
      if (!statement) return null;
      itemType = t;
      payload.statement = statement;
      if (str("owner_label")) payload.owner_label = str("owner_label");
      if (str("stakeholder_label")) payload.stakeholder_label = str("stakeholder_label");
      if (str("due_at")) payload.due_at = str("due_at");
      break;
    }
    case "update_item":
    case "resolve_item": {
      const ref = typeof raw.target_ref === "string" ? raw.target_ref.trim().toUpperCase() : "";
      const id = labelToItemId.get(ref);
      if (!id) return null;
      targetItemId = id;
      const statusRaw = str("status");
      if (kind === "resolve_item") {
        payload.status = statusRaw && ITEM_RESOLVE_STATUSES.has(statusRaw) ? statusRaw : "resolved";
      } else if (statusRaw && ITEM_UPDATE_STATUSES.has(statusRaw)) {
        payload.status = statusRaw;
      }
      if (str("owner_label")) payload.owner_label = str("owner_label");
      if (str("stakeholder_label")) payload.stakeholder_label = str("stakeholder_label");
      if (str("due_at")) payload.due_at = str("due_at");
      if (str("resolution_note")) payload.resolution_note = str("resolution_note");
      break;
    }
    case "state_summary": {
      if (str("current_summary")) payload.current_summary = str("current_summary");
      if (str("current_phase")) payload.current_phase = str("current_phase");
      if (str("current_focus")) payload.current_focus = str("current_focus");
      if (HEALTH.has(str("health") ?? "")) payload.health = str("health");
      break; // the shared empty-payload guard below covers this case too
    }
    case "add_learning": {
      const title = str("title");
      const observation = str("observation");
      if (!title || !observation) return null;
      payload.learning_type = LEARNING_TYPES.has(str("learning_type") ?? "") ? str("learning_type") : "implementation_question";
      payload.title = title;
      payload.observation = observation;
      if (str("area")) payload.area = str("area");
      if (str("implication")) payload.implication = str("implication");
      break;
    }
    default:
      return null;
  }

  // An empty payload is not a proposal. It was only guarded for state_summary,
  // so an update_item whose model output carried no status/label/due_at/note fell
  // through: apply_state_proposal coalesces every field over its current value, so
  // accepting it succeeds and changes nothing.
  //
  // This guard also has to stay once the DB-side applicability constraint lands.
  // commit_state_proposals inserts the whole batch in ONE transaction, so a single
  // rejected row would abort the commit — losing every good proposal in that batch
  // and leaving the cursor unadvanced, to fail again on the next run. Dropping the
  // row here keeps the failure per-proposal instead of per-project.
  if (Object.keys(payload).length === 0) return null;

  return {
    project_id: ctx.id,
    proposal_kind: kind,
    target_item_id: targetItemId,
    item_type: itemType,
    summary,
    rationale,
    impact,
    confidence,
    source_refs: sourceRefs,
    payload,
    status: "pending",
    evidence_window_start: windowStart,
    evidence_window_end: windowEnd,
    generated_by: "job:state-refresh",
    model: STATE_MODEL,
    // P-label → uuid acá, no en el modelo: misma regla que A/E labels.
    supersedes_proposal_id: typeof raw.supersedes === "string"
      ? labelToPendingId.get(raw.supersedes.trim().toUpperCase()) ?? null
      : null,
  };
}

/**
 * Calibration gate applied after validation, before insert:
 *  - drop an add_item whose statement duplicates an active claim or a pending
 *    add_item proposal (trigram, server-side), or duplicates another add_item
 *    already kept in this same batch (normalized-string guard);
 *  - keep only the highest-impact / highest-confidence proposals up to the
 *    per-run cap so a single run cannot flood the review queue.
 */
async function dedupeAndCap(projectId: string, inserts: ProposalInsert[]): Promise<ProposalInsert[]> {
  const sb = supabaseAdmin();
  const kept: ProposalInsert[] = [];
  const keptStatements: string[] = [];
  for (const ins of inserts) {
    if (ins.proposal_kind === "add_item") {
      const statement = typeof ins.payload.statement === "string" ? ins.payload.statement : "";
      if (statement) {
        const norm = normalizeStatement(statement);
        if (keptStatements.includes(norm)) continue; // duplicate within this batch
        const { data, error } = await sb.rpc("similar_state_claim", {
          p_project_id: projectId, p_statement: statement, p_threshold: SIMILARITY_THRESHOLD,
        });
        if (error) throw new Error(`dedup check failed: ${error.message}`);
        if (data === true) continue; // duplicate of an existing active claim / pending proposal
        keptStatements.push(norm);
      }
    }
    kept.push(ins);
  }
  kept.sort((a, b) => (IMPACT_RANK[b.impact] - IMPACT_RANK[a.impact]) || (b.confidence - a.confidence));
  return kept.slice(0, MAX_PROPOSALS_PER_RUN);
}

// ─── Orchestration ────────────────────────────────────────────────────────────

export async function runStateRefreshForProject(
  projectId: string,
  opts: { lookbackDays?: number; anthropic: Anthropic; usageAcc: AnthropicUsage },
): Promise<ProjectRefreshResult> {
  const lookbackDays = opts.lookbackDays ?? DEFAULT_LOOKBACK_DAYS;
  const nowIso = new Date().toISOString();
  const ctx = await loadProjectContext(projectId);
  if (!ctx) {
    return { projectId, projectName: "(unknown)", windowStart: nowIso, windowEnd: nowIso, evidenceConsidered: 0, modelProposed: 0, discarded: 0, suppressed: 0, proposalsCreated: 0, skippedReason: "project not found" };
  }
  const base = { projectId, projectName: ctx.name };
  if (!ctx.notionId) {
    return { ...base, windowStart: nowIso, windowEnd: nowIso, evidenceConsidered: 0, modelProposed: 0, discarded: 0, suppressed: 0, proposalsCreated: 0, skippedReason: "no notion_id link for evidence lookup" };
  }

  const cursor = await resolveCursor(projectId, lookbackDays);
  const evidence = await getEvidenceDelta(ctx.notionId, cursor);
  if (evidence.length === 0) {
    // Nothing new — cursor stays exactly where it was.
    return { ...base, windowStart: cursor.at, windowEnd: cursor.at, evidenceConsidered: 0, modelProposed: 0, discarded: 0, suppressed: 0, proposalsCreated: 0, skippedReason: "no new validated evidence" };
  }

  // Evidence is ascending; the last row is the max (updated_at, id) in this batch.
  const last = evidence[evidence.length - 1];
  const next: EvidenceCursor = { at: last.updatedAt, id: last.id };

  // If the model call throws (e.g. truncation), we do NOT advance — the batch is
  // retried next run rather than silently skipped.
  const raw = await proposeStateChanges(ctx, evidence, opts.anthropic, opts.usageAcc);

  const labelToItemId = new Map<string, string>();
  ctx.items.forEach((it, i) => labelToItemId.set(`A${i + 1}`, it.id));
  const labelToPendingId = new Map<string, string>();
  ctx.pending.forEach((pp, i) => labelToPendingId.set(`P${i + 1}`, pp.id));

  const validated = raw
    .map((p) => normalizeProposal(p, ctx, evidence, labelToItemId, labelToPendingId, cursor.at, next.at))
    .filter((v): v is ProposalInsert => v !== null);
  // Model output the apply path could not have acted on. Counted, not swallowed —
  // this is what makes the guard above visible instead of a silent drop.
  const discarded = raw.length - validated.length;
  const capped = await dedupeAndCap(projectId, validated);
  // Last gate before the transactional commit. commit_state_proposals inserts
  // the batch AND advances the cursor in one transaction, so a single row
  // violating project_state_proposals_applicable would roll back both — leaving
  // this project re-reading the same evidence, and failing, on every later run.
  const { applicable: inserts, rejected: inapplicable } = partitionApplicable(capped);
  for (const { proposal, reason } of inapplicable) {
    console.warn(`state-refresh: dropped inapplicable ${proposal.proposal_kind} proposal for project ${projectId}: ${reason}`);
  }
  const suppressed = validated.length - inserts.length;

  // Atomic commit: insert the (deduped/capped) proposals AND advance the cursor
  // in one transaction, under a per-project advisory lock + optimistic cursor
  // check. If a concurrent run already advanced past our cursor, the RPC aborts
  // and we skip — no duplicates. An empty proposal set still advances the cursor.
  const { data: committed, error } = await supabaseAdmin().rpc("commit_state_proposals", {
    p_project_id: projectId,
    p_expected_cursor_at: cursor.at,
    p_expected_cursor_id: cursor.id,
    p_next_cursor_at: next.at,
    p_next_cursor_id: next.id,
    p_proposals: inserts,
  });
  if (error) {
    if (error.code === "55000" || /cursor moved/i.test(error.message)) {
      return { ...base, windowStart: cursor.at, windowEnd: cursor.at, evidenceConsidered: evidence.length, modelProposed: raw.length, discarded, suppressed, proposalsCreated: 0, skippedReason: "concurrent run handled this delta" };
    }
    throw new Error(`commit failed: ${error.message}`);
  }
  const proposalsCreated = (committed as number | null) ?? inserts.length;

  const result = { ...base, windowStart: cursor.at, windowEnd: next.at, evidenceConsidered: evidence.length, modelProposed: raw.length, discarded, suppressed, proposalsCreated };
  if (proposalsCreated === 0) {
    // modelProposed > 0 with everything suppressed/failed is observable, not a
    // silent "nothing new".
    const reason = raw.length === 0 ? "no material proposals"
      : validated.length === 0 ? `${discarded} proposal${discarded === 1 ? "" : "s"} discarded as inapplicable (nothing the state layer could write)`
      : "all proposals were duplicates or capped";
    return { ...result, skippedReason: reason };
  }
  return result;
}

/**
 * Runs the refresh across the given projects (default: every live project, plus
 * any project that already carries a project_states row). Proposal-only; never
 * mutates state.
 *
 * El default se elegía leyendo project_states, y eso era un huevo-y-gallina:
 * un proyecto sin fila de estado nunca entraba al refresco, así que nunca
 * generaba propuestas, así que nunca conseguía estado. Zero Waste Districts y
 * Upstream PAS quedaron fuera de forma permanente con 277 y 213 evidencias sin
 * mirar. La lista viva manda; project_states se une por si quedó estado de un
 * proyecto ya cerrado que igual conviene seguir refrescando.
 *
 * Sin notion_id no hay forma de buscar la evidencia, así que esos se descartan
 * acá en vez de gastarles una vuelta (runStateRefreshForProject los saltea
 * igual, pero reportándolo como skip y no como "no elegible").
 */
export async function runStateRefresh(
  opts: { projectIds?: string[]; lookbackDays?: number } = {},
): Promise<StateRefreshSummary> {
  const sb = supabaseAdmin();
  let projectIds = opts.projectIds ?? [];
  if (projectIds.length === 0) {
    const [live, withState] = await Promise.all([
      loadActiveProjects(),
      sb.from("project_states").select("project_id"),
    ]);
    if (withState.error) throw new Error(`project_states scan failed: ${withState.error.message}`);
    const ids = new Set(live.filter((p) => p.notion_id).map((p) => p.id));
    for (const r of (withState.data ?? [])) ids.add(r.project_id as string);
    projectIds = [...ids];
  }

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const usageAcc = makeUsageAccumulator();
  const results: ProjectRefreshResult[] = [];
  const errors: string[] = [];

  for (const id of projectIds) {
    try {
      results.push(await runStateRefreshForProject(id, { lookbackDays: opts.lookbackDays, anthropic, usageAcc }));
    } catch (err) {
      errors.push(`${id}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return {
    projectsChecked: projectIds.length,
    proposalsCreated: results.reduce((sum, r) => sum + r.proposalsCreated, 0),
    results,
    costUsd: computeAnthropicCost(usageAcc, STATE_MODEL),
    errors,
  };
}
