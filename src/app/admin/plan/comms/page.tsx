import { Sidebar } from "@/components/Sidebar";
import { requireAdmin } from "@/lib/require-admin";
import {
  getActivePillars,
  getActiveAudiences,
  getActiveChannels,
  getPitchesForWindow,
} from "@/lib/comms-strategy";
import CommsView from "@/components/plan/CommsView";
import { PlanNav } from "@/components/plan/PlanNav";

export const dynamic = "force-dynamic";

export default async function PlanCommsPage() {
  await requireAdmin();

  const [pillars, audiences, channels, pitches] = await Promise.all([
    getActivePillars(),
    getActiveAudiences(),
    getActiveChannels(),
    getPitchesForWindow(), // default: today → +30d
  ]);

  return (
    <div className="flex min-h-screen bg-[#EFEFEA]">
      <Sidebar adminNav />

      <main className="flex-1 ml-[228px] overflow-auto">
        <header className="bg-[#131218] text-white px-12 pt-10 pb-0">
          <p className="text-[8px] font-bold tracking-[2.5px] uppercase text-white/40 mb-3.5">
            Control Room · Strategic Plan
          </p>
          <div className="flex items-end justify-between gap-6">
            <div>
              <h1 className="text-[2.6rem] font-light tracking-[-1.5px] leading-none">
                The <em className="font-black not-italic text-[#B2FF59] italic">Plan</em>
              </h1>
              <p className="text-[12px] text-white/60 mt-2.5 max-w-2xl leading-relaxed">
                Estrategia de comunicación. Pilares, audiencias y canales definen qué contenido
                propone el sistema. El agente <code className="text-white/80">propose-content-pitches</code>{" "}
                corre el último viernes de cada mes.
              </p>
            </div>
          </div>
          <div className="mt-8 border-b border-white/10">
            <PlanNav active="comms" />
          </div>
        </header>

        <div className="px-12 py-7">
          <CommsView
            pillars={pillars}
            audiences={audiences}
            channels={channels}
            pitches={pitches}
          />
        </div>
      </main>
    </div>
  );
}
