import { Sidebar } from "@/components/Sidebar";
import { requireAdmin } from "@/lib/require-admin";
import {
  getEligibleObjectivesForV1,
  getObjectiveArtifacts,
  type ArtifactStatus,
} from "@/lib/plan";
import { PlanNav } from "@/components/plan/PlanNav";
import { ArtifactRow } from "@/components/plan/ArtifactRow";
import { CreateDraftPanel } from "@/components/plan/CreateDraftPanel";

export const dynamic = "force-dynamic";

export default async function PlanArtifactsPage() {
  await requireAdmin();

  const [artifacts, eligibleObjectives] = await Promise.all([
    getObjectiveArtifacts(),
    getEligibleObjectivesForV1(),
  ]);

  const counts: Record<ArtifactStatus, number> = {
    draft: 0,
    in_review: 0,
    approved: 0,
    sent: 0,
    archived: 0,
  };
  let totalOpenQuestions = 0;
  let totalAnsweredQuestions = 0;
  for (const a of artifacts) {
    counts[a.status] += 1;
    totalOpenQuestions += a.open_questions_count;
    totalAnsweredQuestions += a.answered_questions_count;
  }

  return (
    <div className="flex min-h-screen bg-[#EFEFEA]">
      <Sidebar adminNav />

      <main className="flex-1 ml-[228px] overflow-auto">
        <header className="bg-[#131218] text-white px-12 pt-10 pb-0">
          <p className="text-[8px] font-bold tracking-[2.5px] uppercase text-white/40 mb-3.5">
            Control Room · Strategic Plan · Artifacts
          </p>
          <div className="flex items-end justify-between gap-6">
            <div>
              <h1 className="text-[2.6rem] font-light tracking-[-1.5px] leading-none">
                Plan <em className="font-black not-italic text-[#B2FF59] italic">Artifacts</em>
              </h1>
              <p className="text-[12px] text-white/60 mt-2.5 max-w-2xl leading-relaxed">
                Drafts producidos por <code className="text-[#B2FF59]">plan-master-agent</code>{" "}
                para mover KPIs del plan. Cada artifact tiene preguntas abiertas que respondes iterativamente —
                el agente regenera el doc cuando acumulas respuestas. Expandí cualquier fila para ver las preguntas.
              </p>
              {(totalOpenQuestions > 0 || totalAnsweredQuestions > 0) && (
                <p className="text-[11px] text-white/80 mt-3 font-semibold">
                  <span className="text-[#FF8A80]">◯ {totalOpenQuestions} open</span>
                  <span className="mx-2 text-white/30">·</span>
                  <span className="text-[#B2FF59]">● {totalAnsweredQuestions} answered</span>
                </p>
              )}
            </div>
            <div className="flex gap-3 text-[11px] text-white/70">
              <Counter label="Draft" value={counts.draft} accent="#EFEFEA" />
              <Counter label="In review" value={counts.in_review} accent="#FFF3C4" />
              <Counter label="Approved" value={counts.approved} accent="#B2FF59" />
              <Counter label="Sent" value={counts.sent} accent="#FFFFFF" />
            </div>
          </div>
          <div className="mt-8 border-b border-white/10">
            <PlanNav active="artifacts" />
          </div>
        </header>

        <div className="px-12 py-7">
          <CreateDraftPanel objectives={eligibleObjectives} />
          {artifacts.length === 0 ? (
            <div className="bg-white rounded-2xl border border-[#E0E0D8] p-12 text-center">
              <p className="text-[14px] font-semibold text-[#131218] mb-2">
                No artifacts yet
              </p>
              <p className="text-[12px] text-[#6B6B60] max-w-md mx-auto">
                Cuando <code>plan-master-agent</code> corra en modo execute y produzca un
                draft, aparecerá acá con su link de Drive y el bloque de calendario.
              </p>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-[#E0E0D8] overflow-hidden">
              <div className="grid grid-cols-[1.6fr_1.4fr_0.7fr_0.9fr_0.9fr_0.9fr_0.4fr] gap-4 px-5 py-3 bg-[#F7F7F3] border-b border-[#E0E0D8]">
                <span className="text-[9px] font-bold text-[#6B6B60] uppercase tracking-wider">
                  Objective
                </span>
                <span className="text-[9px] font-bold text-[#6B6B60] uppercase tracking-wider">
                  Artifact / Questions
                </span>
                <span className="text-[9px] font-bold text-[#6B6B60] uppercase tracking-wider">
                  Created
                </span>
                <span className="text-[9px] font-bold text-[#6B6B60] uppercase tracking-wider">
                  Status
                </span>
                <span className="text-[9px] font-bold text-[#6B6B60] uppercase tracking-wider">
                  Drive
                </span>
                <span className="text-[9px] font-bold text-[#6B6B60] uppercase tracking-wider">
                  Calendar
                </span>
                <span className="text-[9px] font-bold text-[#6B6B60] uppercase tracking-wider text-right">
                  Expand
                </span>
              </div>
              <div className="divide-y divide-[#EFEFEA]">
                {artifacts.map((a) => (
                  <ArtifactRow key={a.id} artifact={a} />
                ))}
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

function Counter({ label, value, accent }: { label: string; value: number; accent: string }) {
  return (
    <div className="flex flex-col items-end">
      <span className="text-[9px] font-bold uppercase tracking-wider text-white/50">
        {label}
      </span>
      <span className="text-[18px] font-light" style={{ color: accent }}>
        {value}
      </span>
    </div>
  );
}
