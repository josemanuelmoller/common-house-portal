import { redirect } from "next/navigation";
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

const SURFACE_LABEL: Record<string, string> = {
  hall: "Hall",
  workroom: "Workroom",
  garage: "Garage",
  control_room: "Control Room",
};

// ─── Human Resident Card ──────────────────────────────────────────────────────

type CardVariant = "cofounder" | "internal" | "eir";

function PersonCard({ person, variant }: { person: PersonRecord; variant: CardVariant }) {
  const ini = initials(person.name);
  const avatarStyle =
    variant === "cofounder" || variant === "internal"
      ? "bg-[#131218] text-[#B2FF59]"
      : "bg-[#EFEFEA] text-[#131218]/50";

  return (
    <div className="bg-white rounded-2xl border border-[#E0E0D8] p-5 flex gap-4">
      <div className={`w-11 h-11 rounded-xl flex items-center justify-center text-sm font-bold shrink-0 ${avatarStyle}`}>
        {ini}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-sm font-bold text-[#131218] tracking-tight">{person.name}</p>
            {person.jobTitle && (
              <p className="text-xs text-[#131218]/40 mt-0.5">{person.jobTitle}</p>
            )}
          </div>
          {variant === "cofounder" && (
            <span className="text-[9px] font-bold text-[#B2FF59] bg-[#131218] px-2 py-0.5 rounded-full uppercase tracking-widest shrink-0">
              Co-Founder
            </span>
          )}
        </div>
        {person.location && (
          <p className="text-[10px] text-[#131218]/30 font-medium mt-1.5">
            ◎ {person.location}
          </p>
        )}
        <div className="flex items-center gap-3 mt-2 flex-wrap">
          {person.linkedin && (
            <a
              href={person.linkedin}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[10px] font-bold text-[#131218]/30 hover:text-[#131218]/70 uppercase tracking-widest transition-colors"
            >
              LinkedIn ↗
            </a>
          )}
          {person.email && !person.linkedin && (
            <a
              href={`mailto:${person.email}`}
              className="text-[10px] text-[#131218]/20 hover:text-[#131218]/50 transition-colors font-medium"
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

function DigitalResidentCard({ resident }: { resident: DigitalResidentProfile }) {
  const surfaces = resident.surfaces
    .map((s) => SURFACE_LABEL[s] ?? s)
    .join(" · ");

  return (
    <div className="bg-white rounded-2xl border border-[#E0E0D8] p-5">
      {/* Name + visibility badge */}
      <div className="flex items-start justify-between gap-2 mb-3">
        <p className="text-sm font-bold text-[#131218] tracking-tight leading-snug">
          {resident.displayName}
        </p>
        {resident.clientVisible ? (
          <span className="text-[9px] font-bold text-[#131218] bg-[#B2FF59] px-2 py-0.5 rounded-full uppercase tracking-widest shrink-0">
            Client-facing
          </span>
        ) : (
          <span className="text-[9px] font-bold text-[#131218]/30 bg-[#EFEFEA] px-2 py-0.5 rounded-full uppercase tracking-widest shrink-0">
            Internal
          </span>
        )}
      </div>

      {/* Tagline */}
      <p className="text-xs text-[#131218]/50 leading-relaxed">
        {resident.tagline}
      </p>

      {/* Signals */}
      <div className="mt-3 pt-3 border-t border-[#EFEFEA]">
        <p className="text-[10px] font-bold text-[#131218]/20 uppercase tracking-widest mb-1">
          Reads from
        </p>
        <p className="text-[10px] text-[#131218]/35 leading-relaxed">
          {resident.signals.join(" · ")}
        </p>
      </div>

      {/* Surfaces */}
      <p className="text-[10px] text-[#131218]/20 font-medium mt-2">
        Active in: {surfaces}
      </p>
    </div>
  );
}

// ─── Section components ───────────────────────────────────────────────────────

function SectionHeader({
  label,
  count,
  descriptor,
}: {
  label: string;
  count?: number;
  descriptor?: string;
}) {
  return (
    <div className="mb-4">
      <div className="flex items-center gap-3 mb-1">
        <p className="text-[10px] font-bold text-[#131218]/30 uppercase tracking-widest">
          {label}
        </p>
        {count !== undefined && (
          <span className="text-[10px] font-bold text-[#131218] bg-[#B2FF59] px-2 py-0.5 rounded-full">
            {count}
          </span>
        )}
      </div>
      {descriptor && (
        <p className="text-xs text-[#131218]/35 leading-relaxed">{descriptor}</p>
      )}
    </div>
  );
}

/** Subtle horizontal rule separating the Human and Digital layers */
function LayerDivider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-4 pt-2">
      <p className="text-[10px] font-bold text-[#131218]/18 uppercase tracking-widest whitespace-nowrap">
        {label}
      </p>
      <div className="flex-1 h-px bg-[#E0E0D8]" />
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

  // ── Digital sections ────────────────────────────────────────────────────────
  // Admin view: show all 5 roles — client-facing + internal
  const clientFacingDigital = DIGITAL_RESIDENTS.filter((r) => r.clientVisible);
  const internalDigital = DIGITAL_RESIDENTS.filter((r) => !r.clientVisible);

  const humanCount = coFounders.length + coreTeam.length + eirs.length;
  const digitalCount = DIGITAL_RESIDENTS.length;

  return (
    <div className="flex min-h-screen bg-[#EFEFEA]">
      <Sidebar items={NAV} isAdmin />

      <main className="flex-1 overflow-auto">

        {/* Header */}
        <div className="bg-[#131218] px-8 py-8 border-b border-white/8">
          <div className="max-w-4xl mx-auto">
            <p className="text-[10px] font-bold text-white/25 uppercase tracking-widest mb-4">
              The Residents
            </p>
            <h1 className="text-3xl font-bold text-white tracking-tight">
              Who inhabits the House
            </h1>
            <p className="text-white/35 text-sm mt-2 max-w-xl leading-relaxed">
              The people behind Common House and the capabilities that power it —
              human residents and digital residents, in one layer.
            </p>
            <div className="flex items-center gap-2 mt-5">
              <span className="text-[10px] font-bold text-white/40 border border-white/15 px-3 py-1.5 rounded-full uppercase tracking-widest">
                {humanCount} human
              </span>
              <span className="text-[10px] font-bold text-white/40 border border-white/15 px-3 py-1.5 rounded-full uppercase tracking-widest">
                {digitalCount} digital
              </span>
            </div>
          </div>
        </div>

        <div className="px-8 py-6">
          <div className="max-w-4xl mx-auto space-y-8">

            {/* ── HUMAN RESIDENTS ──────────────────────────────────────────── */}
            <LayerDivider label="Human Residents" />

            {/* Co-Founders */}
            {coFounders.length > 0 && (
              <section>
                <SectionHeader
                  label="Co-Founders"
                  count={coFounders.length}
                  descriptor="The people who built Common House."
                />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {coFounders.map((p) => (
                    <PersonCard key={p.id} person={p} variant="cofounder" />
                  ))}
                </div>
              </section>
            )}

            {/* Core Team */}
            {coreTeam.length > 0 && (
              <section>
                <SectionHeader
                  label="Core Team"
                  count={coreTeam.length}
                  descriptor="The people running the work."
                />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {coreTeam.map((p) => (
                    <PersonCard key={p.id} person={p} variant="internal" />
                  ))}
                </div>
              </section>
            )}

            {/* Entrepreneurs in Residence */}
            {eirs.length > 0 && (
              <section>
                <SectionHeader
                  label="Entrepreneurs in Residence"
                  count={eirs.length}
                  descriptor={
                    eirCountries.length > 1
                      ? `Founders building circular economy and reuse ventures within the Common House network — across ${eirCountries.join(", ")}.`
                      : "Founders building circular economy and reuse ventures within the Common House network."
                  }
                />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {eirs.map((p) => (
                    <PersonCard key={p.id} person={p} variant="eir" />
                  ))}
                </div>
              </section>
            )}

            {humanCount === 0 && (
              <div className="bg-white rounded-2xl border border-[#E0E0D8] p-8 text-center">
                <p className="text-sm font-bold text-[#131218]">No human residents found</p>
                <p className="text-xs text-[#131218]/40 mt-1">
                  People are pulled from CH People [OS v2] in Notion.
                </p>
              </div>
            )}

            {/* ── DIGITAL RESIDENTS ────────────────────────────────────────── */}
            <LayerDivider label="Digital Residents" />

            <section>
              <SectionHeader
                label="Client-Facing Capabilities"
                count={clientFacingDigital.length}
                descriptor="The operational roles that are visible to clients in Hall and Workroom — the part of the OS they experience directly."
              />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {clientFacingDigital.map((r) => (
                  <DigitalResidentCard key={r.role} resident={r} />
                ))}
              </div>
            </section>

            <section>
              <SectionHeader
                label="Internal Capabilities"
                count={internalDigital.length}
                descriptor="The operational roles that run inside the system — not visible to clients, but essential to how the House functions."
              />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {internalDigital.map((r) => (
                  <DigitalResidentCard key={r.role} resident={r} />
                ))}
              </div>
            </section>

            {/* Footer note */}
            <div className="pb-2">
              <p className="text-[10px] text-[#131218]/20 leading-relaxed max-w-xl">
                Digital residents are operational roles built from real project signals.
                They support the work — they do not replace judgment, conversation,
                or leadership. They also appear contextually in The Hall, The Workroom,
                and the Control Room, but this page is their canonical home.
              </p>
            </div>

          </div>
        </div>
      </main>
    </div>
  );
}
