"use client";

import { useEffect, useState, type ReactNode } from "react";

/**
 * A1 — Hall tab shell.
 *
 * Wraps pre-rendered server content. Each major section inside `children`
 * must declare its tab membership with `data-hall-tab="today|signals|relationships|portfolio"`.
 *
 * Sections without `data-hall-tab` stay visible on every tab (global: header, hero).
 *
 * URL hash (#today, #signals, …) persists the active tab across refresh.
 * Default: today.
 */

type TabKey = "today" | "signals" | "relationships" | "portfolio";

const TABS: { key: TabKey; label: string; meta: string }[] = [
  { key: "today",         label: "Today",         meta: "What needs your attention now" },
  { key: "signals",       label: "Signals",       meta: "Market, inbox, pipeline" },
  { key: "relationships", label: "Relationships", meta: "Network + time allocation" },
  { key: "portfolio",     label: "Portfolio",     meta: "Projects + opportunities" },
];

type Props = {
  children: ReactNode;
  badges?: Partial<Record<TabKey, number>>;
};

function readHash(): TabKey {
  if (typeof window === "undefined") return "today";
  const raw = window.location.hash.replace(/^#/, "").toLowerCase();
  if (raw === "signals" || raw === "relationships" || raw === "portfolio") return raw;
  return "today";
}

export function HallTabs({ children, badges = {} }: Props) {
  const [active, setActive] = useState<TabKey>("today");

  useEffect(() => { setActive(readHash()); }, []);
  useEffect(() => {
    const onHash = () => setActive(readHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const select = (k: TabKey) => {
    setActive(k);
    if (typeof window !== "undefined") {
      history.replaceState(null, "", `#${k}`);
      // Scroll to the top of the tab content so the user lands at the start.
      window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
    }
  };

  return (
    <>
      {/* CSS — hide sections whose data-hall-tab does NOT contain the active tab token.
          `~=` matches space-separated tokens so data-hall-tab="today signals" shows on both.
          Sections without data-hall-tab (e.g. the header) are unaffected. */}
      <style>{`
        [data-hall-active-tab="today"]         [data-hall-tab]:not([data-hall-tab~="today"])         { display: none !important; }
        [data-hall-active-tab="signals"]       [data-hall-tab]:not([data-hall-tab~="signals"])       { display: none !important; }
        [data-hall-active-tab="relationships"] [data-hall-tab]:not([data-hall-tab~="relationships"]) { display: none !important; }
        [data-hall-active-tab="portfolio"]     [data-hall-tab]:not([data-hall-tab~="portfolio"])     { display: none !important; }
      `}</style>

      {/* Sticky tab bar */}
      <div className="sticky top-0 z-20 bg-[#EFEFEA]/95 backdrop-blur border-b border-[#E0E0D8]">
        <div className="flex items-end gap-1 px-8 max-w-6xl mx-auto">
          {TABS.map(t => {
            const isActive = t.key === active;
            const badge = badges[t.key] ?? 0;
            return (
              <button
                key={t.key}
                onClick={() => select(t.key)}
                className={`relative px-4 py-3 text-[11px] font-bold uppercase tracking-[1.5px] transition-colors
                  ${isActive ? "text-[#131218]" : "text-[#131218]/40 hover:text-[#131218]/80"}`}
                aria-current={isActive ? "page" : undefined}
              >
                <span className="flex items-center gap-2">
                  {t.label}
                  {badge > 0 && (
                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${
                      isActive
                        ? "bg-[#131218] text-white"
                        : "bg-[#131218]/10 text-[#131218]/60"
                    }`}>{badge}</span>
                  )}
                </span>
                {isActive && (
                  <span className="absolute left-0 right-0 -bottom-px h-0.5 bg-[#c8f55a]" />
                )}
              </button>
            );
          })}
          <span className="ml-4 pb-3 text-[10px] text-[#131218]/35 truncate hidden md:inline">
            {TABS.find(t => t.key === active)?.meta}
          </span>
        </div>
      </div>

      {/* Tab-aware content wrapper */}
      <div data-hall-active-tab={active}>
        {children}
      </div>
    </>
  );
}
