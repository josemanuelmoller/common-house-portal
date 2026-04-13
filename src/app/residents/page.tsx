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
    <div className="flex min-h-screen bg-[#EFEFEA]">
      <Sidebar items={NAV} isAdmin />

      <main className="flex-1 overflow-auto ml-[228px]">

        {/* ── Page header ──────────────────────────────────────────────────── */}
        <header className="bg-[#131218] px-10 pt-10 pb-11">
          <p className="text-[8px] font-bold tracking-[2.5px] uppercase text-white/20 mb-3">
            COMMON HOUSE · DIRECTORY
          </p>
          <h1 className="text-[2.6rem] font-[300] text-white tracking-[-1.5px] leading-none">
            The <em className="font-[900] italic text-[#c8f55a]">Residents</em>
          </h1>
          <p className="text-[12.5px] text-white/40 mt-3 max-w-[520px] leading-[1.65]">
            Humans and digital agents that make the House run. A living directory of activatable capabilities.
          </p>
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
