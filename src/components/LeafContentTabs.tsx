"use client";

import { useState } from "react";

type Props = {
  playbookHtml: string | null;
  bulletsHtml: string;
  playbookGeneratedAt: string | null;
  playbookSourceCount: number | null;
  currentSourceCount: number;
  leafPath: string;
};

function daysSince(iso: string | null): number | null {
  if (!iso) return null;
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
}

export function LeafContentTabs({
  playbookHtml,
  bulletsHtml,
  playbookGeneratedAt,
  playbookSourceCount,
  currentSourceCount,
  leafPath,
}: Props) {
  const hasPlaybook = Boolean(playbookHtml);
  const [tab, setTab] = useState<"playbook" | "bullets">(hasPlaybook ? "playbook" : "bullets");
  const stale = hasPlaybook && playbookSourceCount !== null && playbookSourceCount < currentSourceCount;
  const playbookAge = daysSince(playbookGeneratedAt);

  return (
    <div className="bg-white rounded-2xl border border-[#e4e4dd] overflow-hidden">
      <div className="h-1 bg-[#c6f24a]" />
      <div className="px-6 py-3 border-b border-[#f4f4ef] flex items-center justify-between gap-4">
        <div className="flex items-center gap-1">
          <button
            onClick={() => setTab("playbook")}
            className={`text-[11px] font-bold uppercase tracking-widest px-3 py-1.5 rounded-full transition-colors ${
              tab === "playbook"
                ? "bg-[#0a0a0a] text-white"
                : "text-[#0a0a0a]/40 hover:text-[#0a0a0a]"
            }`}
          >
            ✦ Playbook
            {hasPlaybook && stale && (
              <span className="ml-1.5 text-amber-400">●</span>
            )}
          </button>
          <button
            onClick={() => setTab("bullets")}
            className={`text-[11px] font-bold uppercase tracking-widest px-3 py-1.5 rounded-full transition-colors ${
              tab === "bullets"
                ? "bg-[#0a0a0a] text-white"
                : "text-[#0a0a0a]/40 hover:text-[#0a0a0a]"
            }`}
          >
            ☰ Source bullets ({currentSourceCount})
          </button>
        </div>
        <div className="flex items-center gap-3">
          {tab === "playbook" && hasPlaybook && (
            <span className="text-[10px] text-[#0a0a0a]/30 font-medium">
              {playbookAge === 0 ? "Generated today" : `Generated ${playbookAge}d ago`}
              {" · "}
              {playbookSourceCount} bullets{stale ? ` → ${currentSourceCount} now` : ""}
            </span>
          )}
          <span className="text-[10px] text-[#0a0a0a]/25 font-mono">{leafPath}</span>
        </div>
      </div>

      {tab === "playbook" && (
        <>
          {hasPlaybook ? (
            <>
              {stale && (
                <div className="px-8 py-3 bg-amber-50/60 border-b border-amber-100 flex items-center gap-3">
                  <span className="text-[9px] font-bold text-amber-700 uppercase tracking-widest">
                    Stale
                  </span>
                  <p className="text-[11px] text-amber-700/80">
                    Hay {currentSourceCount - (playbookSourceCount ?? 0)} bullets nuevos desde el último playbook. Regenerar para incorporarlos.
                  </p>
                </div>
              )}
              <div
                className="px-8 py-6 leaf-playbook"
                dangerouslySetInnerHTML={{ __html: playbookHtml! }}
              />
            </>
          ) : (
            <div className="px-8 py-12 text-center">
              <p className="text-sm font-semibold text-[#0a0a0a]">Sin playbook todavía</p>
              <p className="text-xs text-[#0a0a0a]/40 mt-1 max-w-sm mx-auto">
                Hay {currentSourceCount} bullets acumulados. Click en &quot;Generar playbook&quot; arriba
                para que el synthesizer produzca un documento narrativo a partir de la evidencia.
              </p>
            </div>
          )}
        </>
      )}

      {tab === "bullets" && (
        <div
          className="px-8 py-6"
          dangerouslySetInnerHTML={{ __html: bulletsHtml }}
        />
      )}
    </div>
  );
}
