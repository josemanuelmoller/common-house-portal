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
    <div className="flex min-h-screen bg-[#EFEFEA]">
      <Sidebar items={nav} isAdmin={isAdmin} />

      <main className="flex-1 ml-[228px] overflow-auto">

        {/* ── Dark header ── */}
        <header className="bg-[#131218] flex-shrink-0" style={{ padding: "40px 52px 44px" }}>
          <p className="text-[8px] font-bold tracking-[2.5px] uppercase text-white/20 mb-3">
            COMMUNITY LAYER · COMMON HOUSE
          </p>
          <div className="flex items-end justify-between gap-6 flex-wrap">
            <div>
              <h1 className="text-[2.6rem] font-[300] text-white tracking-[-1.5px] leading-none">
                Living <em className="font-[900] italic text-[#c8f55a]">Room</em>
              </h1>
              <p className="text-[12.5px] text-white/40 mt-3 max-w-lg leading-relaxed">
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
