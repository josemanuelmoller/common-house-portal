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
  // Source of truth for EIR / Core Team distinction is the `Rol interno`
  // single-select on each Person record in Notion. Co-founders are still
  // derived from Internal + Founder role since there's no explicit value.
  const coFounders = people
    .filter((p) => p.classification === "Internal" && p.roles.includes("Founder"))
    .sort((a, b) => a.name.localeCompare(b.name));

  const coreTeam = people
    .filter((p) => p.classification === "Internal" && p.rolInterno === "Core Team")
    .sort((a, b) => a.name.localeCompare(b.name));

  const eirs = people
    .filter((p) => p.rolInterno === "EIR")
    .sort((a, b) => a.name.localeCompare(b.name));

  const humanCount = coFounders.length + coreTeam.length + eirs.length;

  return (
    <div className="flex min-h-screen" style={{ background: "var(--hall-paper-0)" }}>
      <Sidebar items={NAV} isAdmin />

      <main
        className="flex-1 overflow-auto md:ml-[228px]"
        style={{ fontFamily: "var(--font-hall-sans)" }}
      >
        {/* K-v2 thin 1-line header */}
        <header
          className="flex items-center justify-between gap-6 px-9 py-3.5"
          style={{ borderBottom: "1px solid var(--hall-ink-0)" }}
        >
          <div className="flex items-baseline gap-4 min-w-0">
            <span
              className="text-[10px] tracking-[0.08em] whitespace-nowrap uppercase"
              style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted-2)" }}
            >
              COMMON HOUSE · <b style={{ color: "var(--hall-ink-0)" }}>DIRECTORY</b>
            </span>
            <h1
              className="text-[16px] font-medium tracking-[-0.01em]"
              style={{ color: "var(--hall-ink-0)" }}
            >
              The{" "}
              <em style={{ fontFamily: "var(--font-hall-display)", fontStyle: "italic", fontWeight: 400 }}>
                residents
              </em>
              .
            </h1>
          </div>
          <span
            className="text-[10px] font-bold tracking-[0.14em] uppercase whitespace-nowrap"
            style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted-2)" }}
          >
            {humanCount} HUMANS
          </span>
        </header>

        <p
          className="px-9 py-4 text-[11.5px] max-w-[640px] leading-relaxed"
          style={{ color: "var(--hall-muted-2)" }}
        >
          Humans and digital agents that make the House run. A living directory of activatable capabilities.
        </p>

        {/* Client: filter pills + content sections */}
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
