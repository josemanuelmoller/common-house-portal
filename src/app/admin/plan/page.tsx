import { Sidebar } from "@/components/Sidebar";
import { requireAdmin } from "@/lib/require-admin";
import {
  getObjectivesForYear,
  getRevenueEventsForYear,
  summarizeRevenue,
  currentQuarter,
} from "@/lib/plan";
import PlanView from "@/components/plan/PlanView";

export const dynamic = "force-dynamic";

export default async function PlanPage() {
  await requireAdmin();

  const [objectives2026, objectives2027, revenueEvents2026] = await Promise.all([
    getObjectivesForYear(2026),
    getObjectivesForYear(2027),
    getRevenueEventsForYear(2026),
  ]);

  const revenue2026 = summarizeRevenue(objectives2026, revenueEvents2026);
  const { quarter } = currentQuarter();

  return (
    <div className="flex min-h-screen bg-[#EFEFEA]">
      <Sidebar adminNav />

      <main className="flex-1 ml-[228px] overflow-auto">
        <header className="bg-[#131218] text-white px-12 pt-10 pb-11">
          <p className="text-[8px] font-bold tracking-[2.5px] uppercase text-white/40 mb-3.5">
            Control Room · Strategic Plan
          </p>
          <div className="flex items-end justify-between gap-6">
            <div>
              <h1 className="text-[2.6rem] font-light tracking-[-1.5px] leading-none">
                The <em className="font-black not-italic text-[#B2FF59] italic">Plan</em>
              </h1>
              <p className="text-[12px] text-white/60 mt-2.5 max-w-2xl leading-relaxed">
                Plan estratégico 2026 → Q1 2027. El sistema usa estos objetivos para filtrar señales
                y priorizar el weekly synthesis. Editá un objetivo, cambiá su tier, y toda la capa
                de agentes recalibra en la próxima corrida.
              </p>
            </div>
            <div className="flex gap-2">
              <button
                disabled
                className="text-[11px] font-semibold px-4 py-2 rounded-md border border-white/20 text-white/60 cursor-not-allowed"
                title="Próximo sprint"
              >
                ▲ Quarter Close
              </button>
            </div>
          </div>
        </header>

        <div className="px-12 py-7">
          <PlanView
            objectives2026={objectives2026}
            objectives2027={objectives2027}
            revenue2026={revenue2026}
            currentQuarter={quarter ?? 2}
          />
        </div>
      </main>
    </div>
  );
}
