"use client";

import { useEffect, useState, type ReactNode } from "react";

/**
 * Hall tab shell — K-v2 visual.
 *
 * Wraps pre-rendered server content. Each major section inside `children`
 * must declare its tab membership with `data-hall-tab="today|signals|relationships|portfolio"`.
 *
 * Sections without `data-hall-tab` stay visible on every tab (global: header, hero).
 *
 * URL hash (#today, #signals, …) persists the active tab across refresh.
 * Default: today.
 *
 * Visual system:
 *   - 38px bar on paper-1 background, border-bottom ink line
 *   - Active tab has 2px solid-ink border-bottom (no lime — lime is reserved)
 *   - Counter is mono 10px. Set `alerts.signals = true` to render Signals counter red.
 */

type TabKey = "today" | "signals" | "relationships" | "portfolio";

const TABS: { key: TabKey; label: string }[] = [
  { key: "today",         label: "Today" },
  { key: "signals",       label: "Signals" },
  { key: "relationships", label: "Relationships" },
  { key: "portfolio",     label: "Portfolio" },
];

type Props = {
  children: ReactNode;
  badges?: Partial<Record<TabKey, number | string>>;
  alerts?: Partial<Record<TabKey, boolean>>;
};

function readHash(): TabKey {
  if (typeof window === "undefined") return "today";
  const raw = window.location.hash.replace(/^#/, "").toLowerCase();
  if (raw === "signals" || raw === "relationships" || raw === "portfolio") return raw;
  return "today";
}

export function HallTabs({ children, badges = {}, alerts = {} }: Props) {
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
      window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
    }
  };

  return (
    <>
      {/* CSS — hide sections whose data-hall-tab does NOT contain the active
          tab token. Sections without data-hall-tab are unaffected. */}
      <style>{`
        [data-hall-active-tab="today"]         [data-hall-tab]:not([data-hall-tab~="today"])         { display: none !important; }
        [data-hall-active-tab="signals"]       [data-hall-tab]:not([data-hall-tab~="signals"])       { display: none !important; }
        [data-hall-active-tab="relationships"] [data-hall-tab]:not([data-hall-tab~="relationships"]) { display: none !important; }
        [data-hall-active-tab="portfolio"]     [data-hall-tab]:not([data-hall-tab~="portfolio"])     { display: none !important; }
      `}</style>

      <div
        className="sticky top-0 z-20"
        style={{
          background: "var(--hall-paper-1)",
          borderBottom: "1px solid var(--hall-line)",
          fontFamily: "var(--font-hall-sans)",
        }}
      >
        <div className="flex items-center gap-6 px-9 py-2.5">
          {TABS.map((t) => {
            const isActive = t.key === active;
            const badge = badges[t.key];
            const isAlert = alerts[t.key] === true;
            return (
              <button
                key={t.key}
                onClick={() => select(t.key)}
                className="relative flex items-baseline gap-1.5 py-[3px] text-[11.5px] font-semibold tracking-[0.01em] transition-colors cursor-pointer bg-transparent border-0"
                style={{
                  color: isActive ? "var(--hall-ink-0)" : "var(--hall-muted-2)",
                  borderBottom: isActive ? "2px solid var(--hall-ink-0)" : "2px solid transparent",
                  paddingBottom: "1px",
                }}
                aria-current={isActive ? "page" : undefined}
              >
                <span>{t.label}</span>
                {badge !== undefined && badge !== null && (
                  <span
                    style={{
                      fontFamily: "var(--font-hall-mono)",
                      fontSize: "10px",
                      fontWeight: isActive ? 600 : 400,
                      color: isAlert
                        ? "var(--hall-danger)"
                        : isActive
                        ? "var(--hall-ink-0)"
                        : "var(--hall-muted-3)",
                    }}
                  >
                    {badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div data-hall-active-tab={active}>{children}</div>
    </>
  );
}
