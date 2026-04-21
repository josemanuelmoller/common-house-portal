import { Sidebar } from "@/components/Sidebar";
import { requireAdmin } from "@/lib/require-admin";
import { NetworkGraph } from "@/components/NetworkGraph";

export const dynamic = "force-dynamic";

export default async function NetworkPage() {
  await requireAdmin();

  return (
    <div className="flex min-h-screen bg-white">
      <Sidebar adminNav />
      <main className="flex-1 ml-[228px]">
        <header className="px-12 pt-10 pb-6 border-b-2 border-black">
          <div className="flex items-end justify-between">
            <div>
              <p className="text-[9px] font-bold tracking-[2px] uppercase text-black/60 mb-2">Hall · Network</p>
              <h1 className="text-[2.4rem] font-light text-black tracking-[-1px] leading-none">
                Relationship <em className="font-black italic">Map</em>
              </h1>
            </div>
            <span className="inline-block bg-[#c8f55a] text-black text-[9px] font-bold tracking-[1.8px] uppercase rounded-full px-2.5 py-1">
              Co-attendance · 180d
            </span>
          </div>
          <p className="text-[13px] text-[#444] mt-4 max-w-2xl leading-relaxed">
            Contacts grouped by relationship class. Edges connect people who shared ≥ 2 meetings in the last 180 days. Hover any bubble to isolate its immediate network.
          </p>
        </header>

        <div className="px-6 py-8">
          <NetworkGraph />
        </div>
      </main>
    </div>
  );
}
