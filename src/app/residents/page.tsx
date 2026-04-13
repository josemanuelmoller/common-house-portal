import { Sidebar } from "@/components/Sidebar";
import { getAllPeople } from "@/lib/notion";
import { ADMIN_NAV as NAV } from "@/lib/admin-nav";
import { requireAdmin } from "@/lib/require-admin";
import ResidentsClient from "./ResidentsClient";

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function ResidentsPage() {
  await requireAdmin();

  const people = await getAllPeople();

  // ── Human sections ─────────────────────────────────────────────────────────
  const coFounders = people
    .filter((p) => p.classification === "Internal" && p.roles.includes("Founder"))
    .sort((a, b) => a.name.localeCompare(b.name));

  const coreTeam = people
    .filter((p) => p.classification === "Internal" && !p.roles.includes("Founder"))
    .sort((a, b) => a.name.localeCompare(b.name));

  const eirs = people
    .filter((p) => p.classification === "External" && p.roles.includes("Startup Founder"))
    .sort((a, b) => a.name.localeCompare(b.name));

  const humanCount = coFounders.length + coreTeam.length + eirs.length;

  return (
    <div className="flex min-h-screen bg-[#eeeee8]">
      <Sidebar items={NAV} isAdmin />

      <main className="flex-1 overflow-auto ml-[220px]">

        {/* ── Page header ──────────────────────────────────────────────────── */}
        <header className="bg-black px-14 pt-12 pb-[52px]">
          <p className="text-[8.5px] font-bold tracking-[2.5px] uppercase text-white/20 mb-3.5">
            Directorio vivo de capacidades
          </p>
          <div className="flex items-end justify-between gap-6 flex-wrap">
            <div>
              <h1 className="text-[2.8rem] font-light text-white tracking-[-1.5px] leading-none">
                Residents
              </h1>
              <p className="text-[13px] text-white/40 mt-3.5 max-w-[500px] leading-[1.65]">
                Humans and digital agents that make the House run. Not a team page — a living directory of activatable capabilities.
              </p>
            </div>
          </div>
        </header>

        {/* ── Client: filter pills + content sections ───────────────────── */}
        <ResidentsClient
          coFounders={coFounders}
          eirs={eirs}
          coreTeam={coreTeam}
          humanCount={humanCount}
        />

      </main>
    </div>
  );
}
