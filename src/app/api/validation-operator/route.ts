import { NextRequest, NextResponse } from "next/server";
// notion-cutoff-2026-06-02: both read and write paths are now Supabase-native.
// The previous Notion read (getAllEvidence) could not see Supabase-native
// evidence — e.g. meeting evidence written directly by extract-meeting-evidence
// — so that evidence never left the New queue and the Fireflies action-item
// ingestor (which needs Validated rows) stayed empty.
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { withRoutineLog } from "@/lib/routine-log";

export const maxDuration = 180;

// Validation operator — two-pass sweep.
//
// Pass 1 (New → Validated / Reviewed): aggressive auto-validation of freshly
// created evidence that matches AUTO_VALIDATE criteria from the agent spec.
// Goal: New queue only contains items that genuinely need human judgment.
//
// Pass 2 (Reviewed → Validated / Archived): auto-validate reviewed items with
// High/Medium confidence + excerpt, and archive aged low-value Reviewed items
// (14+ days old, operational types only) so the "Passing through" queue stays
// small.
//
// Called by Vercel cron daily at 03:00 UTC (weekdays).
// Also callable manually — requires x-agent-key or Authorization: Bearer <CRON_SECRET>.

// Cuántas filas se leen por corrida y de a cuántas se escribe. El caudal de
// entrada ronda las 300/día, así que 4.000 vacía el atraso acumulado en pocas
// corridas y después sobra de largo.
const READ_BATCH  = 4000;
const WRITE_CHUNK = 500;

const AUTO_VALIDATE_TYPES = new Set([
  "Process Step",
  "Outcome",
  "Dependency",
  "Requirement",
]);

const ARCHIVE_ELIGIBLE_TYPES = new Set([
  "Process Step",
  "Outcome",
  "Dependency",
]);

const SPECULATIVE_TOKENS = [
  "may ",
  "might ",
  "could ",
  "likely ",
  "appears to",
  "suggests",
  "seems",
];

function hasSpeculativePhrasing(title: string): boolean {
  const lower = (title || "").toLowerCase();
  return SPECULATIVE_TOKENS.some(t => lower.includes(t));
}

function daysBetween(iso: string | null | undefined): number {
  if (!iso) return 0;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return 0;
  return Math.floor((Date.now() - t) / 86400000);
}

function isAuthorized(req: NextRequest): boolean {
  const agentKey = req.headers.get("x-agent-key");
  const cronKey  = req.headers.get("authorization");
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;
  return agentKey === expected || cronKey === `Bearer ${expected}`;
}

type EvidenceLike = {
  id: string;
  title: string;
  type: string;
  confidence: string;
  excerpt: string;
  projectId: string | null;
  dateCaptured: string | null;
  // Meeting transcripts are high-trust sources — a clear excerpt is enough
  // to validate even without a project link (many ecosystem meetings belong
  // to no garage project).
  isMeeting: boolean;
};

// Supabase-native read. Covers both Supabase-native evidence (meeting
// evidence, etc.) AND Notion-origin evidence, which sync-evidence mirrors
// into the same table — so this is strictly more complete than the old
// Notion-only read.
async function getEvidenceByStatus(status: "New" | "Reviewed"): Promise<EvidenceLike[]> {
  const sb = getSupabaseServerClient();
  const { data, error } = await sb
    .from("evidence")
    .select("id, title, evidence_type, confidence_level, source_excerpt, project_notion_id, date_captured, legacy_source_db")
    .eq("validation_status", status)
    // Más viejas primero: sin orden explícito el lote es arbitrario y la cola
    // se muere de hambre — una fila puede quedar sin mirar indefinidamente
    // mientras entra material nuevo.
    .order("created_at", { ascending: true })
    .limit(READ_BATCH);
  if (error) {
    // Antes esto devolvía [] y la rutina reportaba éxito con cero trabajo: 200 OK
    // y nada hecho. Un fallo de lectura tiene que romper, no disfrazarse.
    throw new Error(`read ${status} failed: ${error.message}`);
  }
  return ((data ?? []) as Array<{
    id: string;
    title: string | null;
    evidence_type: string | null;
    confidence_level: string | null;
    source_excerpt: string | null;
    project_notion_id: string | null;
    date_captured: string | null;
    legacy_source_db: string | null;
  }>).map(r => ({
    id:           r.id,
    title:        r.title ?? "",
    type:         r.evidence_type ?? "",
    confidence:   r.confidence_level ?? "",
    excerpt:      r.source_excerpt ?? "",
    projectId:    r.project_notion_id,
    dateCaptured: r.date_captured,
    isMeeting:    r.legacy_source_db === "Meetings [master]",
  }));
}

type Classification =
  | { tier: "AUTO_VALIDATE"; reason: string }
  | { tier: "AUTO_REVIEW"; reason: string }
  | { tier: "ARCHIVE"; reason: string }
  | { tier: "KEEP_NEW"; reason: string }
  | { tier: "KEEP_REVIEWED"; reason: string };

function classifyNew(ev: EvidenceLike): Classification {
  const hasExcerpt = Boolean(ev.excerpt?.trim());
  const hasProject = Boolean(ev.projectId);
  const conf = ev.confidence;

  if (!hasExcerpt) {
    return { tier: "KEEP_NEW", reason: "missing excerpt — needs human" };
  }
  // Meeting transcripts are high-trust: a clear excerpt is enough even with
  // no project link. Non-meeting evidence still needs a project to auto-clear.
  if (!hasProject && !ev.isMeeting) {
    return { tier: "KEEP_NEW", reason: "missing project — needs human" };
  }
  if (conf === "Low" || !conf) {
    return { tier: "KEEP_NEW", reason: "Low confidence — needs human" };
  }
  if (hasSpeculativePhrasing(ev.title)) {
    return { tier: "AUTO_REVIEW", reason: "speculative phrasing — engine re-check" };
  }
  if (AUTO_VALIDATE_TYPES.has(ev.type) && (conf === "High" || conf === "Medium")) {
    return { tier: "AUTO_VALIDATE", reason: `${ev.type} + ${conf} conf — operational fact` };
  }
  if (ev.type === "Decision" && conf === "High") {
    return { tier: "AUTO_VALIDATE", reason: "Decision + High conf — grounded" };
  }
  if (ev.type === "Blocker" && conf === "High") {
    return { tier: "AUTO_VALIDATE", reason: "Blocker + High conf — escalated downstream" };
  }
  // Everything else → promote to Reviewed (cheaper for engine to re-score later)
  return { tier: "AUTO_REVIEW", reason: "defer to engine re-check" };
}

function classifyReviewed(ev: EvidenceLike): Classification {
  const hasExcerpt = Boolean(ev.excerpt?.trim());
  const conf = ev.confidence;
  const age = daysBetween(ev.dateCaptured);

  // Primary path: auto-validate if excerpt + Med/High confidence
  if (hasExcerpt && (conf === "High" || conf === "Medium")) {
    return { tier: "AUTO_VALIDATE", reason: `${conf} conf + excerpt` };
  }

  // Archive aged low-value Reviewed that will never clear:
  // - 14+ days old
  // - operational/low-signal type (no decisions or blockers)
  // - either no excerpt or Low confidence (i.e., blocked from auto-validate)
  if (age >= 14 && ARCHIVE_ELIGIBLE_TYPES.has(ev.type)) {
    return { tier: "ARCHIVE", reason: `aged ${age}d + ${ev.type} (low-signal) — archived` };
  }

  // Otherwise keep as Reviewed for human/next sweep
  return { tier: "KEEP_REVIEWED", reason: "held for human review" };
}

async function _POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [newItems, reviewedItems] = await Promise.all([
    getEvidenceByStatus("New"),
    getEvidenceByStatus("Reviewed"),
  ]);
  const sb = getSupabaseServerClient();

  const results = {
    new_total: newItems.length,
    reviewed_total: reviewedItems.length,
    validated_from_new: 0,
    promoted_to_reviewed: 0,
    kept_new: 0,
    validated_from_reviewed: 0,
    archived: 0,
    kept_reviewed: 0,
    records_written: 0,
    backlog_new_remaining: 0,
    errors: 0,
  };

  /**
   * Escritura por lote. Antes esto era un UPDATE por fila en serie: con 2.000
   * elegibles son 2.000 viajes de red dentro de una función de 180s, así que la
   * cola avanzaba unas decenas por día mientras entraban cientos. Agrupar por
   * estado destino baja eso a un puñado de requests.
   *
   * notion-cutoff-2026-06-02: la escritura canónica es Supabase. `id` es el PK
   * uuid de evidence — notion_id viene NULL en las filas nativas, así que no
   * sirve como clave.
   */
  async function writeStatusBulk(ids: string[], status: "Validated" | "Reviewed" | "Superseded") {
    if (ids.length === 0) return 0;
    const nowIso = new Date().toISOString();
    const update: Record<string, unknown> = { validation_status: status, updated_at: nowIso };
    if (status === "Reviewed" || status === "Validated") update.reviewed_at = nowIso.slice(0, 10);

    let written = 0;
    for (let i = 0; i < ids.length; i += WRITE_CHUNK) {
      const chunk = ids.slice(i, i + WRITE_CHUNK);
      const { error } = await sb.from("evidence").update(update).in("id", chunk);
      if (error) {
        // Un chunk que falla no puede llevarse la corrida entera: se cuenta y
        // se sigue, y el resto avanza igual.
        console.error(`[validation-operator] bulk ${status} failed:`, error.message);
        results.errors += chunk.length;
        continue;
      }
      written += chunk.length;
    }
    return written;
  }

  // Pass 1 — New items
  const toValidate: string[] = [];
  const toReview: string[] = [];
  for (const item of newItems) {
    const c = classifyNew(item);
    if (c.tier === "AUTO_VALIDATE") toValidate.push(item.id);
    else if (c.tier === "AUTO_REVIEW") toReview.push(item.id);
    else results.kept_new++;
  }
  results.validated_from_new   = await writeStatusBulk(toValidate, "Validated");
  results.promoted_to_reviewed = await writeStatusBulk(toReview, "Reviewed");

  // Pass 2 — Reviewed items
  const revValidate: string[] = [];
  const revArchive: string[] = [];
  for (const item of reviewedItems) {
    const c = classifyReviewed(item);
    if (c.tier === "AUTO_VALIDATE") revValidate.push(item.id);
    // "Superseded" ya existe en el enum de Validation Status y es lo más
    // cercano a archivar sin tocar el esquema.
    else if (c.tier === "ARCHIVE") revArchive.push(item.id);
    else results.kept_reviewed++;
  }
  results.validated_from_reviewed = await writeStatusBulk(revValidate, "Validated");
  results.archived                = await writeStatusBulk(revArchive, "Superseded");

  results.records_written =
    results.validated_from_new + results.promoted_to_reviewed +
    results.validated_from_reviewed + results.archived;

  // Cuánto queda sin mirar: si esto no baja corrida a corrida, el lote es chico
  // para el caudal de entrada y hay que subirlo — visible en /admin/agents/health.
  const { count } = await sb.from("evidence")
    .select("id", { count: "exact", head: true })
    .eq("validation_status", "New");
  results.backlog_new_remaining = Math.max(0, (count ?? 0) - results.kept_new);

  console.log("[validation-operator]", results);
  return NextResponse.json(results);
}

export const POST = withRoutineLog("validation-operator", _POST);
// Vercel cron calls GET — delegate to the same wrapped handler
export const GET = POST;
