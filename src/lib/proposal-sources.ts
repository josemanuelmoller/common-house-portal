import "server-only";

import { supabaseAdmin } from "@/lib/supabase";

/**
 * Resuelve los `source_refs` de una propuesta a la evidencia que la justifica.
 *
 * Por qué existe: la bandeja "la IA propone" mostraba la afirmación y el
 * razonamiento del modelo, pero no de dónde salían. `source_refs` llegaba hasta
 * el cliente y no se renderizaba en ninguna parte. Aceptar era entonces avalar
 * a ciegas dos cosas que nadie más mira: que la evidencia es real
 * (validation_status tiene 3.681 'Validated' contra 1 'Rejected' — es una
 * etiqueta, no un filtro) y que era de ESTE proyecto (el 25% de la evidencia
 * validada no tiene proyecto asignado y nunca llega a ninguna sala).
 *
 * Mostrar la fuente no arregla esos dos gates, pero convierte el tercero —el
 * único que un humano ejerce— en una decisión informada: si la reunión que
 * respalda la afirmación es de otro cliente, ahora se ve antes de aceptar.
 */

export type ProposalSource = {
  id: string;
  title: string;
  type: string | null;
  /** Fecha en que se capturó (fecha de la reunión/correo), no la de ingesta. */
  date: string | null;
  /** Del proyecto correcto, o de otro. `null` cuando la evidencia no tiene
   *  proyecto asignado — que es su propia señal de alarma. */
  belongsToProject: boolean | null;
};

export type SuggestionRow = {
  id: string;
  proposal_kind: string | null;
  item_type: string | null;
  summary: string | null;
  rationale: string | null;
  source_refs: string[] | null;
  created_at: string;
};

export type SuggestionWithSources = SuggestionRow & { sources: ProposalSource[] };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function attachSources(
  rows: SuggestionRow[],
  projectNotionId: string | null,
): Promise<SuggestionWithSources[]> {
  const ids = [...new Set(rows.flatMap((r) => r.source_refs ?? []).filter((r) => UUID.test(r)))];
  if (ids.length === 0) return rows.map((r) => ({ ...r, sources: [] }));

  const { data } = await supabaseAdmin()
    .from("evidence")
    .select("id, title, evidence_type, date_captured, created_at, project_notion_id")
    .in("id", ids);

  const byId = new Map<string, ProposalSource>();
  for (const row of (data ?? []) as Array<Record<string, unknown>>) {
    const evProject = (row.project_notion_id as string | null) ?? null;
    byId.set(row.id as string, {
      id: row.id as string,
      title: ((row.title as string | null) ?? "").trim() || "(sin título)",
      type: (row.evidence_type as string | null) ?? null,
      date: ((row.date_captured as string | null) ?? (row.created_at as string | null) ?? null)?.slice(0, 10) ?? null,
      belongsToProject: evProject === null ? null : evProject === projectNotionId,
    });
  }

  return rows.map((r) => ({
    ...r,
    sources: (r.source_refs ?? []).map((ref) => byId.get(ref)).filter((s): s is ProposalSource => !!s),
  }));
}
