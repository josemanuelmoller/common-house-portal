/**
 * El rótulo de etapa que ve el cliente — nunca el estado interno crudo.
 *
 * `projects.current_stage` cumple dos papeles a la vez: es el estado de pipeline
 * que usamos internamente Y se renderiza como pill en las dos superficies de
 * cara al cliente (el lobby y la sala). Nada en la base ni en el código avisa de
 * lo segundo, así que escribir "Ganada · contrato en preparación" pensando en
 * pipeline lo puso frente a MPS (2026-07-29). No fue un descuido puntual: el
 * campo invita al error, porque es texto libre sin dueño.
 *
 * Acá se corta con una LISTA BLANCA: si la etapa no está mapeada, se muestra un
 * rótulo neutro en vez del texto interno. Un término nuevo de pipeline —"Won",
 * "Perdida", "Cerrado sin cierre"— no puede filtrarse aunque nadie se acuerde de
 * esta regla, porque no filtra por palabras prohibidas sino por lo permitido.
 *
 * Para decir algo más específico que el mapa, se usa `projects.client_stage_label`,
 * que es el único campo pensado para que el cliente lo lea.
 */

/** Etapas internas → lo que ve el cliente. Sembrado con las que están en uso. */
const CLIENT_SAFE: Record<string, string> = {
  // Preventa
  "Exploring": "Exploración",
  "Discovery": "Diagnóstico",
  "Scoping": "Definición de alcance",
  "Stakeholder Alignment": "Alineación con el equipo",
  "Propuesta en revisión": "Propuesta en revisión",
  "Propuesta aprobada · contrato en preparación": "Propuesta aprobada · contrato en preparación",
  // Ejecución
  "Design": "Diseño",
  "Pilot Planning": "Planificación del piloto",
  "Pilot Live": "Piloto en marcha",
  "In Progress": "En curso",
  "Delivery · thematic deep dives": "En ejecución",
  "Phase 1 · Pre-scope": "Fase 1 · Alcance",
  "Scale": "Escalamiento",
};

/** Lo que se muestra cuando la etapa interna no está mapeada. Neutro a propósito:
 *  decir de menos es recuperable, filtrar lenguaje de pipeline no. */
const FALLBACK = "En curso";

export function clientStageLabel(
  currentStage: string | null | undefined,
  override?: string | null,
): string {
  const explicit = override?.trim();
  if (explicit) return explicit;
  const stage = currentStage?.trim();
  if (!stage) return FALLBACK;
  return CLIENT_SAFE[stage] ?? FALLBACK;
}

/** Para el admin: saber si una etapa se está mostrando como el genérico porque
 *  nadie la mapeó, y poder arreglarlo antes de que el cliente vea "En curso". */
export function isStageMapped(currentStage: string | null | undefined): boolean {
  const stage = currentStage?.trim();
  return !!stage && stage in CLIENT_SAFE;
}
