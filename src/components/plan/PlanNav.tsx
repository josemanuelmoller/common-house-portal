import Link from "next/link";

/**
 * Sub-navigation for /admin/plan. Two top-level views: Objectives (strategic
 * plan) and Comms (content strategy + pitch queue). Rendered above each page's
 * content.
 */
export function PlanNav({ active }: { active: "objectives" | "comms" }) {
  const tabStyle = (key: "objectives" | "comms") =>
    active === key
      ? "text-[12px] font-bold text-white border-b-2 border-[#B2FF59] px-3 pb-2 pt-1"
      : "text-[12px] font-semibold text-white/50 hover:text-white/80 border-b-2 border-transparent px-3 pb-2 pt-1 transition-colors";

  return (
    <nav className="flex gap-1 -mb-px">
      <Link href="/admin/plan" className={tabStyle("objectives")}>
        Objectives
      </Link>
      <Link href="/admin/plan/comms" className={tabStyle("comms")}>
        Comms
      </Link>
    </nav>
  );
}
