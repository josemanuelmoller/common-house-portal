import type { Lang } from "@/lib/room-i18n";

/**
 * Estructura inicial sugerida para una sala recién abierta. La sala NO parte de
 * cero: hereda personas/Drive/reuniones de la preventa, y se le propone una
 * estructura de fases + entregables que el PM aprueba (o edita) para arrancar.
 *
 * Por ahora es un template localizado (draft-first, edición humana antes de
 * publicar). La costura queda lista para, más adelante, derivar la estructura
 * de la propuesta real (hall_draft / project_state_proposals) sin tocar el resto.
 */

export type SuggestedPhase = { title: string; deliverables: string[] };
export type SuggestedStructure = { phases: SuggestedPhase[]; source: "template" };

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

export function suggestRoomStructure(lang: Lang): SuggestedStructure {
  return { phases: TEMPLATES[lang] ?? TEMPLATES.es, source: "template" };
}
