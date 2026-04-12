import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { Sidebar } from "@/components/Sidebar";
import {
  getLivingRoomPeople,
  getLivingRoomMilestones,
  getLivingRoomThemes,
  getInsightBriefs,
  getAllProjects,
  type LivingRoomPerson,
  type LivingRoomMilestone,
  type LivingRoomTheme,
  type InsightBrief,
} from "@/lib/notion";
import { isAdminUser } from "@/lib/clients";

/**
 * /living-room — Community showcase layer.
 *
 * Public-safe view of the CH network: people, milestones, themes, signals.
 * Privacy gate: only shows data flagged as "public-safe" or "community" visible.
 * No client names, investor data, grant amounts, or pipeline stages exposed.
 *
 * Data sources:
 *   - Featured Members → CH People [OS v2] (Visibility = public-safe | community)
 *   - Milestones       → CH Projects [OS v2] (Share to Living Room = true)
 *   - Themes in Motion → CH Knowledge Assets [OS v2] (Living Room Theme = true)
 *   - Community Signals→ Insight Briefs [OS v2] (Community Relevant = true)
 *   - Portfolio Map    → CH Projects [OS v2] geography field
 */

const LIVING_ROOM_NAV = [
  { label: "Living Room",    href: "/living-room",  icon: "◈" },
  { label: "House View",     href: "/admin",        icon: "◫", section: "Admin" },
];

const CLIENT_NAV = [
  { label: "The Hall",    href: "/hall",         icon: "◈" },
  { label: "Living Room", href: "/living-room",  icon: "◉" },
  { label: "Overview",    href: "/dashboard",    icon: "◫" },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function initials(name: string): string {
  const words = name.trim().split(/\s+/);
  return words.length >= 2
    ? (words[0][0] + words[words.length - 1][0]).toUpperCase()
    : name.slice(0, 2).toUpperCase();
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString("en-GB", { month: "short", year: "numeric" });
  } catch { return ""; }
}

function daysSince(dateStr: string | null): number {
  if (!dateStr) return 999;
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionHeader({ label, title, count }: { label: string; title: string; count?: number }) {
  return (
    <div className="flex items-end justify-between mb-5">
      <div>
        <p className="text-[10px] font-bold text-[#131218]/30 uppercase tracking-widest mb-1">{label}</p>
        <h2 className="text-xl font-bold text-[#131218] tracking-tight">{title}</h2>
      </div>
      {count !== undefined && (
        <span className="text-[10px] font-bold text-[#131218]/25 uppercase tracking-widest">
          {count} {count === 1 ? "item" : "items"}
        </span>
      )}
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="bg-white rounded-2xl border border-[#E0E0D8] px-8 py-10 text-center">
      <p className="text-sm text-[#131218]/30 font-medium">{message}</p>
    </div>
  );
}

// ─── Module A: Featured Members ───────────────────────────────────────────────

function MembersGrid({ people }: { people: LivingRoomPerson[] }) {
  if (!people.length) return <EmptyState message="No members flagged as community-visible yet." />;
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
      {people.map(p => (
        <div key={p.id} className="bg-white rounded-2xl border border-[#E0E0D8] p-5 flex flex-col items-start">
          <div className="w-10 h-10 rounded-xl bg-[#131218] flex items-center justify-center text-[#B2FF59] text-xs font-bold mb-3">
            {initials(p.name)}
          </div>
          <p className="text-sm font-bold text-[#131218] tracking-tight leading-snug">{p.name}</p>
          {p.jobTitle && (
            <p className="text-[11px] text-[#131218]/40 font-medium mt-0.5 leading-snug">{p.jobTitle}</p>
          )}
          {p.location && (
            <p className="text-[10px] text-[#131218]/25 font-medium mt-2">{p.location}</p>
          )}
          {p.roles.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-3">
              {p.roles.slice(0, 2).map(r => (
                <span key={r} className="text-[9px] font-bold text-[#131218]/40 bg-[#EFEFEA] px-2 py-0.5 rounded-full uppercase tracking-widest">
                  {r}
                </span>
              ))}
            </div>
          )}
          {p.linkedin && (
            <a
              href={p.linkedin}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 text-[10px] font-bold text-[#131218]/30 hover:text-[#131218] transition-colors"
            >
              LinkedIn →
            </a>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Module C: Milestones ────────────────────────────────────────────────────

const MILESTONE_COLORS: Record<string, string> = {
  "First Revenue":     "bg-[#B2FF59] text-[#131218]",
  "Key Partnership":   "bg-blue-100 text-blue-700",
  "Product Launch":    "bg-amber-100 text-amber-700",
  "Funding Closed":    "bg-purple-100 text-purple-700",
  "Team Expansion":    "bg-teal-100 text-teal-700",
  "Market Entry":      "bg-orange-100 text-orange-700",
  "Pilot Complete":    "bg-[#B2FF59] text-[#131218]",
};

function MilestonesList({ milestones }: { milestones: LivingRoomMilestone[] }) {
  if (!milestones.length) return <EmptyState message="No milestones shared to the Living Room yet." />;
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      {milestones.map(m => {
        const colorClass = MILESTONE_COLORS[m.milestoneType] ?? "bg-[#EFEFEA] text-[#131218]/50";
        const days = daysSince(m.lastUpdate);
        return (
          <div key={m.id} className="bg-white rounded-2xl border border-[#E0E0D8] p-5">
            <div className="flex items-start justify-between gap-2 mb-3">
              {m.milestoneType && (
                <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full uppercase tracking-widest ${colorClass}`}>
                  {m.milestoneType}
                </span>
              )}
              {m.lastUpdate && (
                <span className="text-[9px] font-medium text-[#131218]/25 shrink-0">
                  {days < 7 ? `${days}d ago` : formatDate(m.lastUpdate)}
                </span>
              )}
            </div>
            {m.communityTheme ? (
              <p className="text-sm font-bold text-[#131218] tracking-tight leading-snug">{m.communityTheme}</p>
            ) : (
              <p className="text-sm font-bold text-[#131218] tracking-tight leading-snug">{m.name}</p>
            )}
            {m.stage && (
              <p className="text-[11px] text-[#131218]/35 font-medium mt-2">{m.stage}</p>
            )}
            {m.geography.length > 0 && (
              <p className="text-[10px] text-[#131218]/25 font-medium mt-2">
                {m.geography.join(", ")}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Module D: Themes in Motion ──────────────────────────────────────────────

function ThemesList({ themes }: { themes: LivingRoomTheme[] }) {
  if (!themes.length) return <EmptyState message="No themes currently active in the Living Room." />;
  return (
    <div className="flex flex-wrap gap-3">
      {themes.map((t, i) => (
        <div key={t.id} className={`rounded-2xl border px-6 py-4 flex items-center gap-3 ${
          i % 3 === 0 ? "bg-[#131218] border-[#131218]" :
          i % 3 === 1 ? "bg-[#B2FF59] border-[#B2FF59]" :
          "bg-white border-[#E0E0D8]"
        }`}>
          <div>
            <p className={`text-sm font-bold tracking-tight ${
              i % 3 === 0 ? "text-white" :
              i % 3 === 1 ? "text-[#131218]" :
              "text-[#131218]"
            }`}>{t.name}</p>
            {t.category && (
              <p className={`text-[10px] font-medium mt-0.5 ${
                i % 3 === 0 ? "text-white/40" :
                i % 3 === 1 ? "text-[#131218]/50" :
                "text-[#131218]/35"
              }`}>{t.category}</p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Module E: Community Signals ─────────────────────────────────────────────

function SignalsList({ briefs }: { briefs: InsightBrief[] }) {
  // Strip private visibility
  const visible = briefs.filter(b => b.visibility !== "private");
  if (!visible.length) return <EmptyState message="No community signals available yet." />;
  return (
    <div className="space-y-3">
      {visible.map(b => (
        <div key={b.id} className="bg-white rounded-2xl border border-[#E0E0D8] px-6 py-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap gap-1.5 mb-2">
                {b.theme.slice(0, 3).map(t => (
                  <span key={t} className="text-[9px] font-bold text-[#131218]/40 bg-[#EFEFEA] px-2 py-0.5 rounded-full uppercase tracking-widest">
                    {t}
                  </span>
                ))}
              </div>
              <p className="text-sm font-bold text-[#131218] tracking-tight">{b.title}</p>
              {b.relevance.length > 0 && (
                <p className="text-[11px] text-[#131218]/35 font-medium mt-1">
                  Relevant to: {b.relevance.join(", ")}
                </p>
              )}
            </div>
            {b.lastEdited && (
              <p className="text-[10px] text-[#131218]/25 font-medium shrink-0">
                {formatDate(b.lastEdited)}
              </p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Module F: Geography ─────────────────────────────────────────────────────

function GeographyPanel({ projects }: { projects: { geography: string[] }[] }) {
  const geoCounts: Record<string, number> = {};
  for (const p of projects) {
    for (const g of p.geography) {
      geoCounts[g] = (geoCounts[g] || 0) + 1;
    }
  }
  const entries = Object.entries(geoCounts).sort((a, b) => b[1] - a[1]);
  if (!entries.length) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {entries.map(([geo, count]) => (
        <div key={geo} className="bg-white rounded-full border border-[#E0E0D8] px-4 py-2 flex items-center gap-2">
          <span className="text-sm font-bold text-[#131218]">{geo}</span>
          <span className="text-[10px] font-bold text-[#131218]/30 bg-[#EFEFEA] px-1.5 py-0.5 rounded-full">{count}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Module G: Expertise ─────────────────────────────────────────────────────

function ExpertiseTags({ people }: { people: LivingRoomPerson[] }) {
  const roleCounts: Record<string, number> = {};
  for (const p of people) {
    for (const r of p.roles) {
      roleCounts[r] = (roleCounts[r] || 0) + 1;
    }
  }
  const entries = Object.entries(roleCounts).sort((a, b) => b[1] - a[1]);
  if (!entries.length) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {entries.map(([role, count]) => (
        <div key={role} className="bg-white rounded-full border border-[#E0E0D8] px-4 py-2 flex items-center gap-2">
          <span className="text-sm font-medium text-[#131218]">{role}</span>
          <span className="text-[10px] font-bold text-[#131218]/30 bg-[#EFEFEA] px-1.5 py-0.5 rounded-full">{count}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function LivingRoomPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const isAdmin = isAdminUser(userId);

  const [people, milestones, themes, signals, allProjects] = await Promise.all([
    getLivingRoomPeople(),
    getLivingRoomMilestones(),
    getLivingRoomThemes(),
    getInsightBriefs(true),
    getAllProjects(),
  ]);

  const nav = isAdmin ? LIVING_ROOM_NAV : CLIENT_NAV;

  return (
    <div className="flex min-h-screen bg-[#EFEFEA]">
      <Sidebar items={nav} isAdmin={isAdmin} />

      <main className="flex-1 overflow-auto">

        {/* Header */}
        <div className="bg-white border-b border-[#E0E0D8] px-8 py-8">
          <div className="flex items-end justify-between">
            <div>
              <p className="text-[10px] font-bold text-[#131218]/25 uppercase tracking-widest mb-2">
                Common House · Community
              </p>
              <h1 className="text-3xl font-bold text-[#131218] tracking-tight">The Living Room</h1>
              <p className="text-sm text-[#131218]/40 font-medium mt-2">
                What's moving in the network — people, milestones, themes, signals.
              </p>
            </div>
            {isAdmin && (
              <a
                href="/admin/living-room"
                className="text-[10px] font-bold text-[#131218]/30 bg-[#EFEFEA] hover:bg-[#E0E0D8] border border-[#E0E0D8] px-3 py-2 rounded-xl uppercase tracking-widest transition-colors"
              >
                Curate →
              </a>
            )}
          </div>

          {/* Quick stats */}
          <div className="grid grid-cols-4 gap-px bg-[#E0E0D8] rounded-2xl overflow-hidden mt-6">
            {[
              { label: "Members", value: people.length },
              { label: "Milestones", value: milestones.length },
              { label: "Themes", value: themes.length },
              { label: "Signals", value: signals.filter(s => s.visibility !== "private").length },
            ].map(stat => (
              <div key={stat.label} className="bg-white px-6 py-4">
                <p className="text-2xl font-bold text-[#131218] tracking-tight">{stat.value}</p>
                <p className="text-[10px] font-bold text-[#131218]/30 uppercase tracking-widest mt-1">{stat.label}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="px-8 py-8 space-y-12">

          {/* Module A — Featured Members */}
          <section>
            <SectionHeader label="Module A" title="Featured Members" count={people.length} />
            <MembersGrid people={people} />
          </section>

          {/* Module C — Milestones */}
          <section>
            <SectionHeader label="Module C" title="What's Moving" count={milestones.length} />
            <MilestonesList milestones={milestones} />
          </section>

          {/* Module D — Themes in Motion + Module G Expertise */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <section>
              <SectionHeader label="Module D" title="Themes in Motion" count={themes.length} />
              <ThemesList themes={themes} />
            </section>
            <section>
              <SectionHeader label="Module G" title="Expertise in the Room" />
              <ExpertiseTags people={people} />
            </section>
          </div>

          {/* Module E — Community Signals */}
          {signals.length > 0 && (
            <section>
              <SectionHeader label="Module E" title="Community Signals" count={signals.filter(s => s.visibility !== "private").length} />
              <SignalsList briefs={signals} />
            </section>
          )}

          {/* Module F — Geography */}
          {allProjects.some(p => p.geography.length > 0) && (
            <section>
              <SectionHeader label="Module F" title="Where We Work" />
              <GeographyPanel projects={allProjects} />
            </section>
          )}

        </div>
      </main>
    </div>
  );
}
