import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { Sidebar } from "@/components/Sidebar";
import {
  getLivingRoomPeople,
  getLivingRoomMilestones,
  getLivingRoomThemes,
  getInsightBriefs,
  getAllProjects,
} from "@/lib/notion";
import { checkIsAdmin } from "@/lib/require-admin";
import LivingRoomClient from "./LivingRoomClient";

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

  return (
    <div className="flex min-h-screen" style={{ background: "var(--hall-paper-0)" }}>
      <Sidebar items={nav} isAdmin={isAdmin} />

      <main className="flex-1 md:ml-[228px] overflow-auto" style={{ fontFamily: "var(--font-hall-sans)" }}>

        {/* K-v2 thin header */}
        <header
          className="flex items-center justify-between gap-6 px-9 py-3.5"
          style={{ borderBottom: "1px solid var(--hall-ink-0)" }}
        >
          <div className="flex items-baseline gap-4 min-w-0">
            <span
              className="text-[10px] tracking-[0.08em] whitespace-nowrap uppercase"
              style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted-2)" }}
            >
              COMMON HOUSE ·{" "}
              <b style={{ color: "var(--hall-ink-0)" }}>LIVING ROOM</b>
            </span>
            <h1
              className="text-[16px] font-medium tracking-[-0.01em]"
              style={{ color: "var(--hall-ink-0)" }}
            >
              The{" "}
              <em
                style={{
                  fontFamily: "var(--font-hall-display)",
                  fontStyle: "italic",
                  fontWeight: 400,
                }}
              >
                living room
              </em>
              .
            </h1>
          </div>
          <div className="flex items-center gap-5 shrink-0">
            {[
              { num: people.length, label: "Members" },
              { num: themes.length, label: "Themes" },
              { num: milestones.length, label: "Milestones" },
            ].map((s) => (
              <div key={s.label} className="flex items-baseline gap-1.5">
                <span
                  className="text-[13px] font-semibold"
                  style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-ink-0)" }}
                >
                  {s.num}
                </span>
                <span
                  className="text-[10px] uppercase tracking-[0.08em]"
                  style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted-2)" }}
                >
                  {s.label}
                </span>
              </div>
            ))}
          </div>
        </header>

        {/* Subheader tagline */}
        <div className="px-9 py-5" style={{ borderBottom: "1px solid var(--hall-line-soft)" }}>
          <p
            className="text-[13px] leading-relaxed max-w-2xl"
            style={{ color: "var(--hall-muted-2)" }}
          >
            How life moves inside the House. Members, expertise, themes in motion, and shared
            milestones — curated, not scrolled.
          </p>
        </div>

        <LivingRoomClient
          people={people}
          milestones={milestones}
          themes={themes}
          signals={signals}
          allProjects={allProjects}
          isAdmin={isAdmin}
        />
      </main>
    </div>
  );
}
