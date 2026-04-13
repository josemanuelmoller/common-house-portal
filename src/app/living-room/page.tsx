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
import { checkIsAdmin } from "@/lib/require-admin";

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
    return new Date(iso).toLocaleDateString("en-GB", { month: "short", day: "numeric" });
  } catch { return ""; }
}

function daysSince(dateStr: string | null): number {
  if (!dateStr) return 999;
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function ModuleHeader({
  label,
  count,
  ctaLabel,
  ctaHref,
}: {
  label: string;
  count?: number;
  ctaLabel?: string;
  ctaHref?: string;
}) {
  return (
    <div className="flex items-center gap-3 mb-4">
      <span className="text-[8.5px] font-bold tracking-[2px] uppercase text-[#131218]/28 whitespace-nowrap">
        {label}
      </span>
      <div className="flex-1 h-px bg-[#D8D8D0]" />
      {count !== undefined && (
        <span className="text-[8.5px] font-bold text-[#131218]/18 whitespace-nowrap">
          {count} {count === 1 ? "item" : "items"}
        </span>
      )}
      {ctaLabel && ctaHref && (
        <a
          href={ctaHref}
          className="text-[9.5px] font-bold text-[#131218]/30 hover:text-[#131218] transition-colors whitespace-nowrap"
        >
          {ctaLabel}
        </a>
      )}
    </div>
  );
}

function VisBadge({ vis }: { vis: string }) {
  const cls =
    vis === "public-safe" || vis === "public"
      ? "bg-[rgba(200,245,90,0.18)] text-[#3a6600]"
      : vis === "community"
      ? "bg-blue-50 text-blue-700"
      : "bg-[#f3f4f6] text-[#6b7280]";
  return (
    <span className={`text-[7.5px] font-bold tracking-[0.8px] uppercase px-1.5 py-0.5 rounded shrink-0 ${cls}`}>
      {vis === "public-safe" ? "Public" : vis}
    </span>
  );
}

// ─── Module A: Featured Members ───────────────────────────────────────────────

function MemberRow({ p }: { p: LivingRoomPerson }) {
  return (
    <div className="flex items-center gap-3 py-3 border-b border-[#D8D8D0] last:border-b-0">
      <div className="w-9 h-9 rounded-full bg-[#131218] text-[#B2FF59] text-[11px] font-extrabold flex items-center justify-center shrink-0">
        {initials(p.name)}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[12.5px] font-bold text-[#131218] tracking-tight leading-tight">
          {p.name}
        </div>
        {p.jobTitle && (
          <div className="text-[10px] text-[#6b6b6b] mt-0.5">{p.jobTitle}</div>
        )}
        {p.location && (
          <div className="text-[9.5px] text-[#131218]/30 font-semibold mt-0.5">
            {p.location}
          </div>
        )}
      </div>
      {p.roles.length > 0 && (
        <div className="flex flex-wrap gap-1 ml-auto">
          {p.roles.slice(0, 2).map((r) => (
            <span
              key={r}
              className="text-[8.5px] font-semibold px-2 py-0.5 rounded-full border border-[#D8D8D0] text-[#6b6b6b] bg-[#EFEFEA]"
            >
              {r}
            </span>
          ))}
        </div>
      )}
      {p.visibility === "public-safe" && (
        <VisBadge vis="public-safe" />
      )}
    </div>
  );
}

function MembersSection({ people }: { people: LivingRoomPerson[] }) {
  if (!people.length)
    return (
      <div className="bg-white rounded-2xl border border-[#D8D8D0] px-6 py-8 text-center">
        <p className="text-sm text-[#131218]/30 font-medium">No members flagged as community-visible yet.</p>
      </div>
    );

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-5 items-start">
      {/* Members list card */}
      <div className="bg-white rounded-2xl border border-[#D8D8D0] overflow-hidden">
        <div className="px-5 py-3.5 border-b border-[#D8D8D0] flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-lg bg-[#131218] flex items-center justify-center text-[11px]">
              <span className="text-[#B2FF59]">◉</span>
            </div>
            <span className="text-[12px] font-extrabold text-[#131218] tracking-tight">
              People in the House
            </span>
          </div>
          <VisBadge vis="public-safe" />
        </div>
        <div className="px-5">
          {people.map((p) => (
            <MemberRow key={p.id} p={p} />
          ))}
        </div>
      </div>

      {/* Expertise cluster / dark panel */}
      <ExpertisePanel people={people} />
    </div>
  );
}

// ─── Module G (inline): Expertise Panel ──────────────────────────────────────

function ExpertisePanel({ people }: { people: LivingRoomPerson[] }) {
  const roleCounts: Record<string, number> = {};
  for (const p of people) {
    for (const r of p.roles) {
      roleCounts[r] = (roleCounts[r] || 0) + 1;
    }
  }
  const entries = Object.entries(roleCounts).sort((a, b) => b[1] - a[1]).slice(0, 8);

  return (
    <div className="bg-[#131218] rounded-2xl p-6 flex flex-col gap-4">
      <div className="text-[9px] font-bold tracking-[2px] uppercase text-white/25">
        Expertise in the Room
      </div>
      <div className="flex flex-col gap-3">
        {entries.map(([role, count]) => (
          <div key={role} className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-[#B2FF59] shrink-0" />
            <span className="text-[12.5px] font-bold text-white tracking-tight flex-1">{role}</span>
            <span className="text-[9.5px] font-bold text-white/30">{count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Module C: Milestones ────────────────────────────────────────────────────

const MS_DOT_COLOR: Record<string, string> = {
  "First Revenue":   "bg-[#B2FF59]",
  "Key Partnership": "bg-blue-400",
  "Product Launch":  "bg-amber-400",
  "Funding Closed":  "bg-purple-400",
  "Team Expansion":  "bg-teal-400",
  "Market Entry":    "bg-orange-400",
  "Pilot Complete":  "bg-[#B2FF59]",
  "Pilot":           "bg-[#B2FF59]",
  "Grant win":       "bg-amber-400",
  "Speaking":        "bg-teal-400",
  "Publication":     "bg-blue-400",
};

function MilestoneRow({ m, isLast }: { m: LivingRoomMilestone; isLast: boolean }) {
  const dotColor = MS_DOT_COLOR[m.milestoneType ?? ""] ?? "bg-[#D8D8D0]";
  const days = daysSince(m.lastUpdate);
  const dateStr = m.lastUpdate
    ? days < 7
      ? `${days}d ago`
      : formatDate(m.lastUpdate)
    : "";

  return (
    <div className="flex items-start gap-3.5 py-3.5 border-b border-[#D8D8D0] last:border-b-0">
      {/* dot + line */}
      <div className="flex flex-col items-center gap-1.5 pt-1 shrink-0 w-4">
        <div className={`w-2 h-2 rounded-full shrink-0 ${dotColor}`} />
        {!isLast && <div className="flex-1 w-px bg-[#D8D8D0] min-h-[24px]" />}
      </div>
      <div className="flex-1 min-w-0">
        {m.milestoneType && (
          <div className="text-[8px] font-bold tracking-[1.5px] uppercase text-[#131218]/25 mb-1">
            {m.milestoneType}
          </div>
        )}
        <div className="text-[13px] font-bold text-[#131218] tracking-tight leading-snug mb-1">
          {m.communityTheme ?? m.name}
        </div>
        {m.stage && (
          <div className="text-[10.5px] text-[#666] mb-2">{m.stage}</div>
        )}
        <div className="flex items-center gap-2 flex-wrap">
          {m.geography.length > 0 && (
            <span className="text-[8.5px] font-bold text-[#131218]/22 uppercase tracking-widest">
              {m.geography.join(", ")}
            </span>
          )}
          {dateStr && (
            <span className="text-[9px] text-[#131218]/25 font-semibold ml-auto">
              {dateStr}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function MilestonesSection({ milestones }: { milestones: LivingRoomMilestone[] }) {
  if (!milestones.length)
    return (
      <div className="bg-white rounded-2xl border border-[#D8D8D0] px-6 py-8 text-center">
        <p className="text-sm text-[#131218]/30 font-medium">No milestones shared to the Living Room yet.</p>
      </div>
    );
  return (
    <div className="bg-white rounded-2xl border border-[#D8D8D0] overflow-hidden">
      <div className="px-5 py-3.5 border-b border-[#D8D8D0] flex items-center gap-2">
        <div className="w-6 h-6 rounded-lg bg-[#B2FF59] flex items-center justify-center text-[11px]">🏆</div>
        <span className="text-[12px] font-extrabold text-[#131218] tracking-tight">Recent highlights</span>
      </div>
      <div className="px-5">
        {milestones.map((m, i) => (
          <MilestoneRow key={m.id} m={m} isLast={i === milestones.length - 1} />
        ))}
      </div>
    </div>
  );
}

// ─── Module D: Themes in Motion ──────────────────────────────────────────────

function ThemeCard({ t }: { t: LivingRoomTheme }) {
  return (
    <div className="bg-white border border-[#D8D8D0] rounded-xl p-4 flex flex-col gap-2.5 hover:border-[#aaa] transition-colors">
      <div className="flex items-start justify-between gap-2">
        <div className="text-[13px] font-extrabold text-[#131218] tracking-tight leading-snug">
          {t.name}
        </div>
        {t.category && <VisBadge vis="public-safe" />}
      </div>
      {t.assetType && (
        <div className="text-[10.5px] text-[#666] leading-relaxed">{t.assetType}</div>
      )}
      {t.category && (
        <div className="flex flex-wrap gap-1">
          <span className="text-[8.5px] font-semibold px-2 py-0.5 rounded-full border border-[rgba(200,245,90,0.4)] text-[#2a5500] bg-[rgba(200,245,90,0.15)]">
            {t.category}
          </span>
        </div>
      )}
      <div className="flex items-center gap-2 mt-auto pt-1">
        <span className="text-[8px] font-bold px-2 py-0.5 rounded-full bg-[rgba(200,245,90,0.15)] text-[#2d6a00] border border-[rgba(200,245,90,0.35)]">
          ● Active
        </span>
      </div>
    </div>
  );
}

function ThemesSection({ themes }: { themes: LivingRoomTheme[] }) {
  if (!themes.length)
    return (
      <div className="bg-white rounded-2xl border border-[#D8D8D0] px-6 py-8 text-center">
        <p className="text-sm text-[#131218]/30 font-medium">No themes currently active in the Living Room.</p>
      </div>
    );
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {themes.map((t) => (
        <ThemeCard key={t.id} t={t} />
      ))}
    </div>
  );
}

// ─── Module E: Community Signals ─────────────────────────────────────────────

function SignalRow({ b }: { b: InsightBrief }) {
  return (
    <div className="flex items-start gap-3.5 py-3.5 border-b border-[#D8D8D0] last:border-b-0">
      <div className="w-8 h-8 rounded-lg bg-[#EFEFEA] border border-[#D8D8D0] flex items-center justify-center text-sm shrink-0">
        📡
      </div>
      <div className="flex-1 min-w-0">
        {b.theme.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-1.5">
            {b.theme.slice(0, 2).map((t) => (
              <span
                key={t}
                className="text-[8.5px] font-bold text-[#131218]/35 bg-[#EFEFEA] px-1.5 py-0.5 rounded-full uppercase tracking-widest"
              >
                {t}
              </span>
            ))}
          </div>
        )}
        <div className="text-[12px] font-bold text-[#131218] tracking-tight leading-snug mb-1">
          {b.title}
        </div>
        {b.relevance.length > 0 && (
          <div className="text-[10.5px] text-[#666] leading-snug">
            Relevant to: {b.relevance.join(", ")}
          </div>
        )}
        <div className="flex items-center gap-2 mt-2">
          {b.visibility === "community" ? (
            <VisBadge vis="community" />
          ) : (
            <VisBadge vis="public-safe" />
          )}
          {b.lastEdited && (
            <span className="text-[9px] text-[#131218]/25 font-semibold ml-auto">
              {formatDate(b.lastEdited)}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function SignalsSection({ briefs }: { briefs: InsightBrief[] }) {
  const visible = briefs.filter((b) => b.visibility !== "private");
  if (!visible.length)
    return (
      <div className="bg-white rounded-2xl border border-[#D8D8D0] px-6 py-8 text-center">
        <p className="text-sm text-[#131218]/30 font-medium">No community signals available yet.</p>
      </div>
    );
  return (
    <div className="bg-white rounded-2xl border border-[#D8D8D0] overflow-hidden">
      <div className="px-5 py-3.5 border-b border-[#D8D8D0] flex items-center gap-2">
        <div className="w-6 h-6 rounded-lg bg-[#EFEFEA] border border-[#D8D8D0] flex items-center justify-center text-[11px]">📡</div>
        <span className="text-[12px] font-extrabold text-[#131218] tracking-tight">Community signals</span>
      </div>
      <div className="px-5">
        {visible.map((b) => (
          <SignalRow key={b.id} b={b} />
        ))}
      </div>
    </div>
  );
}

// ─── Module F: Geography ─────────────────────────────────────────────────────

function GeographySection({ projects }: { projects: { geography: string[] }[] }) {
  const geoCounts: Record<string, number> = {};
  for (const p of projects) {
    for (const g of p.geography) {
      geoCounts[g] = (geoCounts[g] || 0) + 1;
    }
  }
  const entries = Object.entries(geoCounts).sort((a, b) => b[1] - a[1]);
  if (!entries.length) return null;
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
      {entries.map(([geo, count]) => (
        <div
          key={geo}
          className="bg-white border border-[#D8D8D0] rounded-xl p-4 flex flex-col gap-2"
        >
          <div className="text-[12px] font-extrabold text-[#131218] tracking-tight">{geo}</div>
          <div className="text-[9px] font-bold text-[#6b6b6b]">
            {count} {count === 1 ? "project" : "projects"}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function LivingRoomPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const isAdmin = await checkIsAdmin();

  const [people, milestones, themes, signals, allProjects] = await Promise.all([
    getLivingRoomPeople(),
    getLivingRoomMilestones(),
    getLivingRoomThemes(),
    getInsightBriefs(true),
    getAllProjects(),
  ]);

  const nav = isAdmin ? LIVING_ROOM_NAV : CLIENT_NAV;
  const visibleSignals = signals.filter((s) => s.visibility !== "private");
  const hasGeo = allProjects.some((p) => p.geography.length > 0);

  return (
    <div className="flex min-h-screen bg-[#EEEEE8]">
      <Sidebar items={nav} isAdmin={isAdmin} />

      <main className="flex-1 ml-[228px] overflow-auto">

        {/* ── Dark header ── */}
        <header className="bg-black px-13 py-10 flex-shrink-0" style={{ padding: "40px 52px 44px" }}>
          <p className="text-[8px] font-bold tracking-[2.5px] uppercase text-white/20 mb-3">
            Community layer · Common House
          </p>
          <div className="flex items-end justify-between gap-6 flex-wrap">
            <div>
              <h1 className="text-[2.6rem] font-light text-white tracking-[-1.5px] leading-none">
                Living{" "}
                <em className="font-black not-italic text-[#B2FF59]">Room</em>
              </h1>
              <p className="text-[12.5px] text-white/38 mt-3 max-w-lg leading-relaxed">
                How life moves inside the House. Members, expertise, themes in motion, and shared
                milestones — curated, not scrolled.
              </p>
            </div>
            <div className="flex gap-7 self-end">
              {[
                { num: people.length, label: "Members" },
                { num: themes.length, label: "Themes" },
                { num: milestones.length, label: "Milestones" },
              ].map((s) => (
                <div key={s.label} className="text-right">
                  <div className="text-[26px] font-black text-[#B2FF59] tracking-tight leading-none">
                    {s.num}
                  </div>
                  <div className="text-[8.5px] font-bold text-white/22 tracking-[1.5px] uppercase mt-1">
                    {s.label}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </header>

        {/* ── Tab bar (on dark) ── */}
        <div
          className="bg-black border-t border-white/7 flex gap-1.5 flex-wrap"
          style={{ padding: "0 52px 14px" }}
        >
          {[
            { label: "All" },
            { label: "Members" },
            { label: "Milestones" },
            { label: "Themes" },
            { label: "Signals" },
            { label: "Geography" },
          ].map((tab, i) => (
            <div
              key={tab.label}
              className={`px-3.5 py-1.5 text-[10.5px] font-semibold border rounded-lg transition-all cursor-default ${
                i === 0
                  ? "text-[#B2FF59] border-[rgba(200,245,90,0.4)] bg-[rgba(200,245,90,0.06)]"
                  : "text-white/28 border-white/10 hover:text-white/65 hover:border-white/20"
              }`}
            >
              {tab.label}
            </div>
          ))}
          {isAdmin && (
            <a
              href="/admin/living-room"
              className="ml-auto text-[9.5px] font-bold text-white/40 border border-white/15 px-3 py-1.5 rounded-lg hover:text-white/70 hover:border-white/30 transition-colors"
            >
              Curate →
            </a>
          )}
        </div>

        {/* ── Content ── */}
        <div style={{ padding: "36px 52px 60px" }} className="flex flex-col gap-8">

          {/* Stats row */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              { label: "Members active", value: people.length, sub: `${themes.length} themes · ${visibleSignals.length} signals` },
              { label: "Themes in motion", value: themes.length, sub: "Active · curated", lime: true },
              { label: "Shareable milestones", value: milestones.length, sub: "Shared to community" },
              { label: "Community signals", value: visibleSignals.length, sub: "Curated · this week" },
            ].map((s) => (
              <div key={s.label} className="bg-white border border-[#D8D8D0] rounded-xl p-4">
                <div className="text-[8px] font-bold tracking-[2px] uppercase text-[#131218]/25 mb-1.5">
                  {s.label}
                </div>
                <div className={`text-[1.6rem] font-black tracking-tight leading-none ${s.lime ? "text-[#3a8c00]" : "text-[#131218]"}`}>
                  {s.value}
                </div>
                <div className="text-[10px] text-[#6b6b6b] mt-1.5">{s.sub}</div>
              </div>
            ))}
          </div>

          {/* Visibility legend */}
          <div className="flex items-center gap-4 bg-white border border-[#D8D8D0] rounded-xl px-4 py-2.5">
            <span className="text-[8px] font-bold tracking-[2px] uppercase text-[#131218]/22 shrink-0">
              Visibility
            </span>
            <div className="w-px h-3.5 bg-[#D8D8D0] shrink-0" />
            {[
              { badge: "Public", cls: "bg-[rgba(200,245,90,0.18)] text-[#3a6600]", desc: "Safe to share externally" },
              { badge: "Community", cls: "bg-blue-50 text-blue-700", desc: "Authenticated members only" },
              { badge: "Private", cls: "bg-[#f3f4f6] text-[#6b7280]", desc: "Never surfaced here" },
            ].map((v) => (
              <div key={v.badge} className="flex items-center gap-1.5 text-[9.5px] font-semibold text-[#6b6b6b]">
                <span className={`text-[7.5px] font-bold tracking-[0.8px] uppercase px-2 py-0.5 rounded ${v.cls}`}>
                  {v.badge}
                </span>
                {v.desc}
              </div>
            ))}
          </div>

          {/* Module A — Featured Members */}
          <section>
            <ModuleHeader label="Featured Members" count={people.length} ctaLabel="Explore all →" ctaHref="#" />
            <MembersSection people={people} />
          </section>

          {/* Module C — Milestones */}
          <section>
            <ModuleHeader label="Shareable Milestones" count={milestones.length} ctaLabel="View all →" ctaHref="#" />
            <MilestonesSection milestones={milestones} />
          </section>

          {/* Module D — Themes in Motion */}
          <section>
            <ModuleHeader label="Themes in Motion" count={themes.length} ctaLabel="Explore →" ctaHref="#" />
            <ThemesSection themes={themes} />
          </section>

          {/* Module E — Community Signals */}
          {signals.length > 0 && (
            <section>
              <ModuleHeader label="Community Signals" count={visibleSignals.length} />
              <SignalsSection briefs={signals} />
            </section>
          )}

          {/* Module F — Geography */}
          {hasGeo && (
            <section>
              <ModuleHeader label="Where We Work" />
              <GeographySection projects={allProjects} />
            </section>
          )}

        </div>
      </main>
    </div>
  );
}
