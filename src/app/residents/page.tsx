import { Sidebar } from "@/components/Sidebar";
import { getAllPeople, type PersonRecord } from "@/lib/notion";
import { ADMIN_NAV as NAV } from "@/lib/admin-nav";
import { requireAdmin } from "@/lib/require-admin";
import { DIGITAL_RESIDENTS, type DigitalResidentProfile } from "@/types/house";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function initials(name: string): string {
  const words = name.trim().split(/\s+/);
  if (words.length >= 2) return (words[0][0] + words[words.length - 1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

// ─── Section bar ─────────────────────────────────────────────────────────────

function ResSectionBar({
  label,
  count,
}: {
  label: string;
  count: string | number;
}) {
  return (
    <div className="flex items-center gap-3.5 mb-6 mt-10 first:mt-0">
      <span className="text-[9px] font-bold tracking-[2px] uppercase text-black/30 whitespace-nowrap">
        {label}
      </span>
      <div className="flex-1 h-px bg-[#d8d8d0]" />
      <span className="text-[9px] font-bold text-black/20 whitespace-nowrap">{count}</span>
    </div>
  );
}

// ─── Human Person Card ────────────────────────────────────────────────────────

type CardVariant = "cofounder" | "internal" | "eir";

function PersonCard({ person, variant }: { person: PersonRecord; variant: CardVariant }) {
  const ini = initials(person.name);
  const isEir = variant === "eir";

  const badgeLabel = variant === "cofounder" ? "Co-founder" : variant === "eir" ? "EIR" : "Core team";

  return (
    <div
      className={`rounded-2xl overflow-hidden border-[1.5px] transition-all ${
        isEir
          ? "border-[#ccc] bg-white hover:border-[#aaa] hover:-translate-y-0.5"
          : "border-[#d8d8d0] bg-white hover:border-[#aaa] hover:-translate-y-0.5"
      }`}
    >
      {/* Card top */}
      <div
        className={`px-[22px] pt-[22px] pb-[18px] border-b flex items-center gap-3.5 ${
          isEir
            ? "bg-[#0e0e0e] border-b-white/8"
            : "bg-white border-[#d8d8d0]"
        }`}
      >
        <div
          className={`w-[46px] h-[46px] rounded-full flex items-center justify-center text-[14px] font-extrabold shrink-0 tracking-[-0.5px] ${
            isEir
              ? "bg-white/10 border border-white/15 text-white"
              : variant === "cofounder"
              ? "bg-[#c8f55a] text-black"
              : "bg-[#c8f55a] text-black"
          }`}
        >
          {ini}
        </div>
        <div className="flex-1 min-w-0">
          <p
            className={`text-[14px] font-extrabold tracking-[-0.3px] leading-[1.2] ${
              isEir ? "text-white" : "text-[#0e0e0e]"
            }`}
          >
            {person.name}
          </p>
          {person.jobTitle && (
            <p
              className={`text-[10.5px] font-medium mt-0.5 ${
                isEir ? "text-white/45" : "text-[#6b6b6b]"
              }`}
            >
              {person.jobTitle}
            </p>
          )}
        </div>
        <span
          className={`text-[8px] font-bold tracking-[1px] uppercase rounded-full px-2 py-0.5 border shrink-0 self-start ml-auto ${
            isEir
              ? "bg-white/7 text-white/35 border-white/10"
              : "bg-[#eeeee8] text-black/25 border-[#d8d8d0]"
          }`}
        >
          {badgeLabel}
        </span>
      </div>

      {/* Card body */}
      <div className="px-[22px] pt-[18px] pb-5">
        {person.location && (
          <p className="text-[10px] text-[#6b6b6b]/70 font-medium mb-2">◎ {person.location}</p>
        )}
        <div className="flex items-center gap-3 flex-wrap mt-1">
          {person.linkedin && (
            <a
              href={person.linkedin}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[9.5px] font-bold text-[#0e0e0e] bg-[#eeeee8] border border-[#d8d8d0] rounded-lg px-[11px] py-1.5 no-underline hover:bg-black hover:text-white hover:border-black transition-all tracking-[0.2px]"
            >
              LinkedIn ↗
            </a>
          )}
          {person.email && !person.linkedin && (
            <a
              href={`mailto:${person.email}`}
              className="text-[9.5px] font-medium text-[#6b6b6b] no-underline hover:text-[#0e0e0e] transition-colors"
            >
              {person.email}
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Digital Resident Card ────────────────────────────────────────────────────

const DIGITAL_ICONS: Record<string, React.ReactNode> = {
  "information-coordinator": (
    <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="#555" strokeWidth="1.8" strokeLinecap="round">
      <path d="M2 2h12v8H2z" /><path d="M5 12h6M8 10v2" />
    </svg>
  ),
  "intelligence-analyst": (
    <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="#555" strokeWidth="1.8" strokeLinecap="round">
      <circle cx="8" cy="8" r="6" /><path d="M8 5v3l2 1.5" />
    </svg>
  ),
  "project-manager": (
    <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="#555" strokeWidth="1.8" strokeLinecap="round">
      <polyline points="3 6 8 10 13 6" /><rect x="2" y="3" width="12" height="10" rx="1" />
    </svg>
  ),
  "internal-auditor": (
    <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="#555" strokeWidth="1.8" strokeLinecap="round">
      <path d="M8 14s-6-3-6-7.5A3.5 3.5 0 0 1 8 3a3.5 3.5 0 0 1 6 3.5C14 11 8 14 8 14z" />
    </svg>
  ),
  "portfolio-director": (
    <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="#555" strokeWidth="1.8" strokeLinecap="round">
      <polyline points="1 4 8 10 15 4" /><path d="M1 4h14v9a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1z" />
    </svg>
  ),
  "chief-of-staff": (
    <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="#555" strokeWidth="1.8" strokeLinecap="round">
      <line x1="15" y1="1" x2="8" y2="8" /><polygon points="15 1 11 15 8 8 1 5 15 1" />
    </svg>
  ),
};

function DigitalCard({ resident }: { resident: DigitalResidentProfile }) {
  const iconKey = resident.role.toLowerCase().replace(/\s+/g, "-");
  const icon = DIGITAL_ICONS[iconKey] ?? (
    <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="#555" strokeWidth="1.8" strokeLinecap="round">
      <circle cx="8" cy="8" r="6" />
    </svg>
  );

  return (
    <div className="bg-white border-[1.5px] border-dashed border-[#d8d8d0] rounded-2xl p-[22px] flex items-start gap-3.5">
      <div className="w-10 h-10 rounded-full bg-[#eeeee8] border-[1.5px] border-[#d8d8d0] flex items-center justify-center shrink-0">
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[12.5px] font-extrabold text-[#0e0e0e] tracking-[-0.2px] mb-0.5">{resident.displayName}</p>
        <p className="text-[10.5px] text-[#6b6b6b] leading-[1.55] mb-2.5">{resident.tagline}</p>
        <p className="text-[9px] font-semibold text-black/20 tracking-[0.5px]">
          Feeds: {resident.signals.slice(0, 3).join(" · ")}
        </p>
      </div>
    </div>
  );
}

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

  const eirCountries = [
    ...new Set(eirs.map((p) => p.location?.split(", ").pop() ?? "").filter(Boolean)),
  ];

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
            <div className="flex gap-2 flex-wrap flex-shrink-0 self-end">
              <span className="text-[10px] font-bold px-3.5 py-[7px] rounded-full border border-white/12 text-white/40">All</span>
              <span className="text-[10px] font-bold px-3.5 py-[7px] rounded-full border border-white/12 text-white/40">Co-founders</span>
              <span className="text-[10px] font-bold px-3.5 py-[7px] rounded-full border border-white/12 text-white/40">EIRs</span>
              <span className="text-[10px] font-bold px-3.5 py-[7px] rounded-full border border-white/12 text-white/40">Core team</span>
              <span className="text-[10px] font-bold px-3.5 py-[7px] rounded-full border border-white/12 text-white/40">Digital</span>
            </div>
          </div>
        </header>

        {/* ── Content ──────────────────────────────────────────────────────── */}
        <div className="px-14 py-10 pb-16">

          {/* Co-founders */}
          {coFounders.length > 0 && (
            <>
              <ResSectionBar label="Co-founders" count={coFounders.length} />
              <div className="grid grid-cols-3 gap-4 mb-2">
                {coFounders.map((p) => (
                  <PersonCard key={p.id} person={p} variant="cofounder" />
                ))}
              </div>
            </>
          )}

          {/* EIRs */}
          {eirs.length > 0 && (
            <>
              <ResSectionBar
                label="Entrepreneurs in Residence"
                count={`${eirs.length} EIRs`}
              />
              <div className="bg-white border-[1.5px] border-[#ccc] rounded-2xl px-[22px] py-4 mb-4 flex items-center gap-3">
                <div className="w-[7px] h-[7px] rounded-full bg-[#0e0e0e] shrink-0" />
                <p className="text-[11.5px] text-[#444] leading-[1.6]">
                  EIRs are senior operators embedded in the House. They bring deep domain expertise, active networks, and a track record that CH&apos;s clients can access directly — not just as advisors, but as strategic partners on specific engagements.
                </p>
              </div>
              <div className="grid grid-cols-3 gap-4 mb-2">
                {eirs.map((p) => (
                  <PersonCard key={p.id} person={p} variant="eir" />
                ))}
              </div>
            </>
          )}

          {/* Core team */}
          {coreTeam.length > 0 && (
            <>
              <ResSectionBar label="Core team" count={coreTeam.length} />
              <div className="grid grid-cols-3 gap-4 mb-2">
                {coreTeam.map((p) => (
                  <PersonCard key={p.id} person={p} variant="internal" />
                ))}
              </div>
            </>
          )}

          {humanCount === 0 && (
            <div className="bg-white rounded-2xl border border-[#d8d8d0] p-8 text-center mb-4">
              <p className="text-sm font-bold text-[#0e0e0e]">No human residents found</p>
              <p className="text-xs text-[#6b6b6b] mt-1">
                People are pulled from CH People [OS v2] in Notion.
              </p>
            </div>
          )}

          {/* Digital Residents */}
          <div className="mt-12">
            <ResSectionBar
              label="Digital Residents"
              count={`${DIGITAL_RESIDENTS.length} agents · always on`}
            />
            <div className="bg-white border-[1.5px] border-dashed border-[#d8d8d0] rounded-2xl px-6 py-5 mb-5 flex items-center gap-3.5">
              <div className="w-2 h-2 rounded-full bg-[#c8f55a] shrink-0" />
              <p className="text-[12px] text-[#555] leading-[1.6]">
                Digital residents operate continuously — capturing, classifying, auditing, and maintaining the OS while humans focus on strategy and output. They&apos;re listed here without gimmick: these are functional agents, each with a specific scope.
              </p>
            </div>
            <div className="grid grid-cols-3 gap-4">
              {DIGITAL_RESIDENTS.map((r) => (
                <DigitalCard key={r.role} resident={r} />
              ))}
            </div>
          </div>

          {/* Footer note */}
          <div className="pt-10">
            <p className="text-[10px] text-[#0e0e0e]/20 leading-relaxed max-w-xl">
              Digital residents are operational roles built from real project signals.
              They support the work — they do not replace judgment, conversation,
              or leadership. They also appear contextually in The Hall, The Workroom,
              and the Control Room, but this page is their canonical home.
            </p>
          </div>

        </div>
      </main>
    </div>
  );
}
