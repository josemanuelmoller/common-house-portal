"use client";

import { useState } from "react";

export type RenderedPlaybookVersion = {
  version: number;
  generated_at: string;
  generated_by: string;
  source_count: number | null;
  html: string;
};

type Props = {
  playbookHtml: string | null;
  bulletsHtml: string;
  playbookGeneratedAt: string | null;
  playbookSourceCount: number | null;
  currentSourceCount: number;
  leafPath: string;
  /** Prior playbook versions (most recent first). When > 1, a version selector
   *  is rendered in the tabs bar. The first entry's html should match the
   *  current `playbookHtml` (it is the latest version on the node). */
  versions?: RenderedPlaybookVersion[];
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
  versions,
}: Props) {
  const hasPlaybook = Boolean(playbookHtml);
  const [tab, setTab] = useState<"playbook" | "bullets">(hasPlaybook ? "playbook" : "bullets");
  // Version selector: defaults to the latest version (index 0). Falls back to
  // the page-supplied `playbookHtml` when no version history exists (e.g. older
  // playbooks pre-versioning).
  const allVersions = versions ?? [];
  const [versionIdx, setVersionIdx] = useState<number>(0);
  const activeVersion = allVersions[versionIdx];
  const renderedHtml  = activeVersion?.html ?? playbookHtml;
  const isViewingPrior = versionIdx > 0;
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
          {tab === "playbook" && hasPlaybook && allVersions.length > 1 && (
            <select
              value={versionIdx}
              onChange={(e) => setVersionIdx(Number(e.target.value))}
              className="text-[10px] font-mono px-2 py-1 bg-[#f4f4ef] border border-[#e4e4dd] rounded hover:border-[#0a0a0a]/30 cursor-pointer"
              style={{ color: "#0a0a0a" }}
              title="Switch between playbook versions"
            >
              {allVersions.map((v, i) => (
                <option key={v.version} value={i}>
                  v{v.version}
                  {i === 0 ? " (latest)" : ""}
                  {" · "}
                  {new Date(v.generated_at).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}
                  {v.source_count ? ` · ${v.source_count} src` : ""}
                </option>
              ))}
            </select>
          )}
          {tab === "playbook" && hasPlaybook && allVersions.length <= 1 && (
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
              {isViewingPrior && activeVersion && (
                <div className="px-8 py-2.5 bg-[#0a0a0a]/[0.03] border-b border-[#e4e4dd] flex items-center gap-3 text-[11px]">
                  <span className="font-bold text-[9px] uppercase tracking-widest text-[#0a0a0a]/60">
                    Viewing prior version
                  </span>
                  <span className="text-[#0a0a0a]/60">
                    v{activeVersion.version} · generated {new Date(activeVersion.generated_at).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}
                    {" · "}by {activeVersion.generated_by}
                  </span>
                  <button
                    onClick={() => setVersionIdx(0)}
                    className="ml-auto text-[10px] font-mono underline hover:text-[#c6f24a] text-[#0a0a0a]/50"
                  >
                    back to latest →
                  </button>
                </div>
              )}
              {stale && !isViewingPrior && (
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
                dangerouslySetInnerHTML={{ __html: renderedHtml! }}
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
