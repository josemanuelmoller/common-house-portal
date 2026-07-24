import type { Lang } from "@/lib/room-i18n";

/**
 * Estructura inicial sugerida para una sala recién abierta. La sala NO parte de
 * cero: hereda personas/Drive/reuniones de la preventa, y se le propone una
 * estructura de fases + entregables que el PM aprueba (o edita) para arrancar.
 *
 * Se deriva de la PROPUESTA real (hall_draft):
 *   - hitos futuros del timeline → fase "Definición" (próximos pasos concretos)
 *   - topics/workstreams → fase "Ejecución"
 * Si el draft no trae señal, cae a un template localizado (draft-first).
 */

export type SuggestedPhase = { title: string; deliverables: string[] };
export type SuggestedStructure = { phases: SuggestedPhase[]; source: "proposal" | "template" };

type HallDraftLike = {
  timeline?: { label?: string | null; type?: string | null }[] | null;
  topics?: { name?: string | null }[] | null;
} | null;

const TEMPLATES: Record<Lang, SuggestedPhase[]> = {
  es: [
    { title: "Fase 1 · Diagnóstico", deliverables: ["Diagnóstico línea base", "Mapa de oportunidades"] },
    { title: "Fase 2 · Diseño", deliverables: ["Modelo operativo", "Business case"] },
    { title: "Fase 3 · Ejecución", deliverables: ["Plan de implementación", "Medición y aprendizajes"] },
  ],
  en: [
    { title: "Phase 1 · Diagnosis", deliverables: ["Baseline diagnosis", "Opportunity map"] },
    { title: "Phase 2 · Design", deliverables: ["Operating model", "Business case"] },
    { title: "Phase 3 · Delivery", deliverables: ["Implementation plan", "Measurement & learnings"] },
  ],
};

const PHASE_TITLES: Record<Lang, { definition: string; delivery: string }> = {
  es: { definition: "Definición", delivery: "Ejecución" },
  en: { definition: "Definition", delivery: "Delivery" },
};

// Los hitos del timeline suelen venir prefijados ("Próxima sesión: …"); se limpian
// para que sirvan como título de entregable.
function cleanLabel(s: string): string {
  return s
    .replace(/^(pr[oó]xim[ao]s?\s+(sesi[oó]n|paso|reuni[oó]n)|next\s+(session|step|meeting))\s*:?\s*/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function suggestRoomStructure(lang: Lang, draft?: HallDraftLike): SuggestedStructure {
  const timeline = Array.isArray(draft?.timeline) ? draft!.timeline! : [];
  const topics = Array.isArray(draft?.topics) ? draft!.topics! : [];

  const future = timeline
    .filter((i) => i?.type === "future" && typeof i?.label === "string")
    .map((i) => cleanLabel(i!.label as string))
    .filter((s) => s.length > 0)
    .slice(0, 6);
  const topicNames = topics
    .map((t) => (typeof t?.name === "string" ? t!.name!.trim() : ""))
    .filter((s) => s.length > 0)
    .slice(0, 8);

  if (future.length > 0 || topicNames.length > 0) {
    const phases: SuggestedPhase[] = [];
    if (future.length > 0) phases.push({ title: PHASE_TITLES[lang].definition, deliverables: future });
    if (topicNames.length > 0) phases.push({ title: PHASE_TITLES[lang].delivery, deliverables: topicNames });
    return { phases, source: "proposal" };
  }

  return { phases: TEMPLATES[lang] ?? TEMPLATES.es, source: "template" };
}
