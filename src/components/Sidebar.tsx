"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { UserButton, useUser, SignOutButton } from "@clerk/nextjs";

// ── Types ────────────────────────────────────────────────────────────────────

type NavItem = {
  label: string;
  href: string;
  badge?: number;
  badgeRed?: boolean;
  disabled?: boolean;
};

type NavGroup = {
  kind: "group";
  label: string;
  icon: string;
  badge?: number;
  badgeRed?: boolean;
  items: NavItem[];
};

type NavLink = {
  kind: "link";
  label: string;
  href: string;
  icon: string;
  badge?: number;
  badgeRed?: boolean;
};

type NavEntry = NavGroup | NavLink;

// ── Admin nav definition (mirrors platform-admin.html sidebar exactly) ───────

export const ADMIN_NAV_V2: NavEntry[] = [
  { kind: "link",  label: "The Hall",    href: "/admin",         icon: "◈" },
  { kind: "link",  label: "The Plan",    href: "/admin/plan",    icon: "◆" },
  { kind: "link",  label: "Residents",   href: "/residents",     icon: "◍" },
  {
    kind: "group", label: "Portfolio", icon: "◧",
    items: [
      { label: "Workrooms", href: "/admin/workrooms" },
      { label: "Garage",    href: "/admin/garage-view" },
      { label: "Investors", href: "/admin/investors" },
    ],
  },
  {
    kind: "group", label: "Commercial", icon: "◉",
    items: [
      { label: "Opportunities",  href: "/admin/opportunities" },
      { label: "Pipeline",       href: "/admin/pipeline" },
      { label: "Grants",         href: "/admin/grants" },
      { label: "Investor Match", href: "/admin/investors" },
    ],
  },
  {
    kind: "group", label: "Desks", icon: "◒",
    items: [
      { label: "Design",             href: "/admin/design" },
      { label: "Comms",              href: "/admin/comms" },
      { label: "Insights",           href: "/admin/insights" },
      { label: "Offers & Proposals", href: "/admin/offers" },
    ],
  },
  { kind: "link",  label: "Library",      href: "/library",       icon: "▤" },
  {
    kind: "group", label: "Control Room", icon: "◫",
    items: [
      { label: "Agents",          href: "/admin/agents" },
      { label: "Intake / Decisions", href: "/admin/os" },
      { label: "Content",         href: "/admin/content" },
      { label: "Knowledge",       href: "/admin/knowledge" },
      { label: "Contacts",        href: "/admin/hall/contacts" },
      { label: "Orphan matches",  href: "/admin/hall/orphans"  },
      { label: "Organizations",   href: "/admin/hall/organizations" },
      { label: "Network",         href: "/admin/hall/network" },
      { label: "Commitments",     href: "/admin/hall/commitments" },
      { label: "System Health",   href: "/admin/health" },
    ],
  },
  { kind: "link",  label: "Living Room",  href: "/living-room",   icon: "◐" },
  { kind: "link",  label: "Curate",       href: "/admin/living-room", icon: "◑" },
];

// ── Sidebar component ────────────────────────────────────────────────────────

type Props = {
  /** Legacy flat nav — used by client-facing pages (Hall, Workroom, Garage) */
  items?: { label: string; href: string; icon: string; section?: string }[];
  projectName?: string;
  isAdmin?: boolean;
  /** Use new collapsible admin nav */
  adminNav?: boolean;
};

export function Sidebar({ items, projectName, isAdmin, adminNav }: Props) {
  const pathname = usePathname();
  const { user } = useUser();

  const displayName = user?.firstName
    ? `${user.firstName}${user.lastName ? ` ${user.lastName}` : ""}`
    : user?.emailAddresses?.[0]?.emailAddress?.split("@")[0] ?? "";
  const email = user?.emailAddresses?.[0]?.emailAddress ?? "";

  // Determine which groups start open (any child is active)
  const initialOpen = (adminNav ?? isAdmin)
    ? Object.fromEntries(
        ADMIN_NAV_V2.filter((e): e is NavGroup => e.kind === "group").map((g) => [
          g.label,
          g.items.some((item) => pathname === item.href || pathname.startsWith(item.href + "/")),
        ])
      )
    : {};

  const [open, setOpen] = useState<Record<string, boolean>>(initialOpen);

  const toggle = (label: string) =>
    setOpen((prev) => ({ ...prev, [label]: !prev[label] }));

  const useCollapsible = adminNav ?? isAdmin;

  return (
    <aside className="w-[228px] min-h-screen bg-white border-r border-[#d8d8d0] flex flex-col flex-shrink-0 fixed top-0 left-0 z-10 overflow-y-auto">

      {/* Logo */}
      <div className="px-[18px] pt-5 pb-[18px] border-b border-[#d8d8d0] mb-3">
        <div className="flex items-center gap-2.5">
          {/* CO mark */}
          <svg viewBox="0 0 40 18" fill="none" className="w-8 h-auto flex-shrink-0">
            <path d="M7 2 A7 7 0 1 0 7 16" stroke="#0e0e0e" strokeWidth="3.5" strokeLinecap="butt"/>
            <circle cx="31" cy="9" r="7" stroke="#0e0e0e" strokeWidth="3.5"/>
          </svg>
          <div className="flex flex-col leading-tight">
            <span className="text-[11px] font-medium text-[#0e0e0e] tracking-[0.2px]">common</span>
            <span className="text-[11px] font-medium text-[#0e0e0e] tracking-[0.2px]">house</span>
          </div>
        </div>
        {projectName && (
          <p className="text-[#0e0e0e]/40 text-xs mt-2 truncate font-medium">{projectName}</p>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 py-1">
        {useCollapsible ? (
          // ── Admin collapsible nav ──
          ADMIN_NAV_V2.map((entry) => {
            if (entry.kind === "link") {
              const active = pathname === entry.href;
              return (
                <Link
                  key={entry.href}
                  href={entry.href}
                  className={`flex items-center gap-[9px] px-[18px] py-[7px] text-[11.5px] font-semibold border-l-2 transition-all ${
                    active
                      ? "border-[#B2FF59] bg-[rgba(178,255,89,0.14)] text-[#0e0e0e]"
                      : "border-transparent text-[#0e0e0e]/42 hover:text-[#0e0e0e] hover:bg-[rgba(0,0,0,0.03)]"
                  }`}
                >
                  <span className={`text-[13px] flex-shrink-0 ${active ? "opacity-100" : "opacity-50"}`}>{entry.icon}</span>
                  {entry.label}
                  {entry.badge != null && (
                    <span className={`ml-auto text-[8.5px] font-bold px-1.5 py-0.5 rounded-lg flex-shrink-0 ${
                      entry.badgeRed ? "bg-red-50 text-red-600" : "bg-black/7 text-black/38"
                    }`}>{entry.badge}</span>
                  )}
                </Link>
              );
            }

            // Group
            const isGroupOpen = open[entry.label] ?? false;
            const anyChildActive = entry.items.some(
              (item) => pathname === item.href || pathname.startsWith(item.href + "/")
            );

            return (
              <div key={entry.label}>
                <button
                  onClick={() => toggle(entry.label)}
                  className={`w-full flex items-center justify-between px-[18px] py-[7px] text-[11.5px] font-semibold transition-all ${
                    anyChildActive ? "text-[#0e0e0e]" : "text-[#0e0e0e]/42 hover:text-[#0e0e0e] hover:bg-[rgba(0,0,0,0.025)]"
                  }`}
                >
                  <span className="flex items-center gap-[9px]">
                    <span className="text-[13px] opacity-50 flex-shrink-0">{entry.icon}</span>
                    {entry.label}
                    {entry.badge != null && (
                      <span className={`text-[8.5px] font-bold px-1.5 py-0.5 rounded-lg flex-shrink-0 ${
                        entry.badgeRed ? "bg-red-50 text-red-600" : "bg-black/7 text-black/38"
                      }`}>{entry.badge}</span>
                    )}
                  </span>
                  <span className={`text-[9px] opacity-30 transition-transform duration-200 ${isGroupOpen ? "" : "-rotate-90"}`}>▾</span>
                </button>

                {isGroupOpen && (
                  <div>
                    {entry.items.map((item) => {
                      const active = pathname === item.href || pathname.startsWith(item.href + "/");
                      if (item.disabled) {
                        return (
                          <span
                            key={item.href}
                            className="flex items-center gap-2 pl-[34px] pr-[18px] py-1.5 text-[11px] font-medium border-l-2 border-transparent"
                            style={{ opacity: 0.4, cursor: "default" }}
                          >
                            <span className="flex-1">{item.label}</span>
                            <span className="text-[8px] font-bold px-1.5 py-0.5 rounded-lg bg-black/7 text-black/38 flex-shrink-0">
                              Próximamente
                            </span>
                          </span>
                        );
                      }
                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          className={`flex items-center gap-2 pl-[34px] pr-[18px] py-1.5 text-[11px] font-medium border-l-2 transition-all ${
                            active
                              ? "border-[#B2FF59] bg-[rgba(178,255,89,0.12)] text-[#0e0e0e] font-semibold"
                              : "border-transparent text-[#0e0e0e]/38 hover:text-[#0e0e0e] hover:bg-[rgba(0,0,0,0.025)]"
                          }`}
                        >
                          <span className="flex-1">{item.label}</span>
                          {item.badge != null && (
                            <span className={`text-[8.5px] font-bold px-1.5 py-0.5 rounded-lg flex-shrink-0 ${
                              item.badgeRed ? "bg-red-50 text-red-600" : "bg-black/7 text-black/38"
                            }`}>{item.badge}</span>
                          )}
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })
        ) : (
          // ── Legacy flat nav (client-facing pages) ──
          <div className="space-y-0.5 px-3 py-1">
            {(items ?? []).map((item, i) => {
              const active = pathname === item.href;
              const showSection =
                item.section && (i === 0 || (items ?? [])[i - 1].section !== item.section);
              return (
                <div key={item.href}>
                  {showSection && (
                    <div className="pt-4 pb-1.5 px-3">
                      <div className="h-px bg-[#E0E0D8] mb-3" />
                      <p className="text-[10px] font-bold text-[#131218]/25 uppercase tracking-widest">
                        {item.section}
                      </p>
                    </div>
                  )}
                  <Link
                    href={item.href}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                      active
                        ? "bg-[#131218] text-white"
                        : "text-[#131218]/50 hover:text-[#131218] hover:bg-[#131218]/5"
                    }`}
                  >
                    <span className="text-base">{item.icon}</span>
                    {item.label}
                  </Link>
                </div>
              );
            })}
          </div>
        )}
      </nav>

      {/* Account */}
      <div className="px-[18px] py-3.5 border-t border-[#d8d8d0] mt-auto">
        <div className="flex items-center gap-2.5 min-w-0">
          <UserButton />
          <div className="flex-1 min-w-0">
            {displayName && (
              <p className="text-[#0e0e0e]/70 text-xs font-semibold truncate leading-snug">{displayName}</p>
            )}
            {email && (
              <p className="text-[#0e0e0e]/30 text-[10px] font-medium truncate">{email}</p>
            )}
          </div>
        </div>
        <SignOutButton redirectUrl="/sign-in">
          <button className="mt-2.5 w-full text-left text-[#0e0e0e]/22 text-[8.5px] font-bold uppercase tracking-widest hover:text-[#0e0e0e]/50 transition-colors">
            Sign out →
          </button>
        </SignOutButton>
      </div>
    </aside>
  );
}
