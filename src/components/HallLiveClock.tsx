"use client";

import { useEffect, useState } from "react";

/**
 * HallLiveClock — K-v2 header clock + "N AGENTS ONLINE" readout.
 *
 * Ticks every 30 seconds. Uses a small client island so the rest of the
 * Hall page can stay server-rendered.
 *
 * To avoid hydration mismatch, server renders an initial time snapshot
 * (passed in via initialIso) and the client replaces it on mount — same
 * string format, so no visual flash.
 */

type Props = {
  initialIso: string;
  agentsOnline?: number;
};

function formatHM(d: Date): string {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function HallLiveClock({ initialIso, agentsOnline }: Props) {
  const [hm, setHm] = useState<string>(() => formatHM(new Date(initialIso)));

  useEffect(() => {
    const tick = () => setHm(formatHM(new Date()));
    tick();
    const id = setInterval(tick, 30_000);
    return () => clearInterval(id);
  }, []);

  return (
    <div
      className="flex items-center gap-2.5"
      style={{ fontFamily: "var(--font-hall-mono)" }}
    >
      <span
        className="text-[13px] font-medium"
        style={{ color: "var(--hall-ink-0)" }}
      >
        {hm}
      </span>
      {typeof agentsOnline === "number" && (
        <>
          <span
            className="w-[3px] h-[3px] rounded-full"
            style={{ background: "#c2c2c2" }}
            aria-hidden
          />
          <span
            className="text-[10.5px] uppercase tracking-[0.08em]"
            style={{ color: "var(--hall-muted-2)" }}
          >
            {agentsOnline} AGENTS ONLINE
          </span>
        </>
      )}
    </div>
  );
}
