"use client";

import { useState } from "react";
import { CandidateSection } from "@/components/CandidateSection";
import { RadarSection } from "@/components/RadarSection";
import type { CandidateItem, RadarLoop } from "@/lib/notion";

type Tab = "candidates" | "radar";

interface Props {
  candidates: CandidateItem[];
  radarLoops: RadarLoop[];
}

export function DiscoverySection({ candidates, radarLoops }: Props) {
  const [tab, setTab] = useState<Tab>(
    candidates.length > 0 ? "candidates" : radarLoops.length > 0 ? "radar" : "candidates"
  );

  const tabs: { id: Tab; label: string; count: number }[] = [
    { id: "candidates", label: "Candidates", count: candidates.length },
    { id: "radar",      label: "Radar",      count: radarLoops.length },
  ];

  return (
    <div>
      <div className="flex items-center gap-1 mb-3">
        {tabs.map(t => {
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={active ? "hall-btn-primary" : "hall-btn-outline"}
              style={{ padding: "4px 10px", fontSize: 10 }}
            >
              {t.label}
              <span
                className="ml-1.5"
                style={{
                  fontFamily: "var(--font-hall-mono)",
                  color: active ? "rgba(255,255,255,0.6)" : "var(--hall-muted-3)",
                }}
              >
                {t.count}
              </span>
            </button>
          );
        })}
        <p
          className="ml-3 text-[9px] leading-snug"
          style={{ color: "var(--hall-muted-3)" }}
        >
          {tab === "candidates"
            ? "Unreviewed opportunity candidates — use Scan inbox or the + on inbox rows."
            : "Grants and low-signal opportunities — not in CoS until you mark them Interested."}
        </p>
      </div>

      <div className={tab === "candidates" ? "block" : "hidden"}>
        <CandidateSection candidates={candidates} />
      </div>
      <div className={tab === "radar" ? "block" : "hidden"}>
        <RadarSection initialLoops={radarLoops} />
      </div>
    </div>
  );
}
