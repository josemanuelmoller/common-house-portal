"use client";

import { useState } from "react";

// ─── Simple markdown renderer ─────────────────────────────────────────────────

function renderMarkdown(md: string): React.ReactNode[] {
  const lines = md.split("\n");
  const nodes: React.ReactNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (line.startsWith("# ")) {
      nodes.push(
        <h1 key={i} className="text-[15px] font-black text-[#131218] mt-4 mb-1 tracking-tight">
          {inlineFormat(line.slice(2))}
        </h1>
      );
      i++; continue;
    }

    if (line.startsWith("## ")) {
      nodes.push(
        <h2 key={i} className="text-[13px] font-bold text-[#131218] mt-4 mb-1 tracking-tight">
          {inlineFormat(line.slice(3))}
        </h2>
      );
      i++; continue;
    }

    if (line.startsWith("### ")) {
      nodes.push(
        <h3 key={i} className="text-[12px] font-bold text-[#131218]/80 mt-3 mb-0.5">
          {inlineFormat(line.slice(4))}
        </h3>
      );
      i++; continue;
    }

    if (/^[-*] /.test(line)) {
      const bullets: string[] = [];
      while (i < lines.length && /^[-*] /.test(lines[i])) { bullets.push(lines[i].slice(2)); i++; }
      nodes.push(
        <ul key={`ul-${i}`} className="my-1.5 space-y-0.5 pl-4">
          {bullets.map((b, j) => (
            <li key={j} className="text-[11.5px] text-[#131218]/75 leading-relaxed list-disc">{inlineFormat(b)}</li>
          ))}
        </ul>
      );
      continue;
    }

    if (/^- \[[ x]\] /.test(line)) {
      const items: { checked: boolean; text: string }[] = [];
      while (i < lines.length && /^- \[[ x]\] /.test(lines[i])) {
        items.push({ checked: lines[i][3] === "x", text: lines[i].slice(6) }); i++;
      }
      nodes.push(
        <ul key={`cb-${i}`} className="my-1.5 space-y-0.5 pl-2">
          {items.map((item, j) => (
            <li key={j} className="flex items-start gap-2 text-[11.5px] text-[#131218]/75">
              <span className={`mt-0.5 w-3.5 h-3.5 rounded border flex-shrink-0 flex items-center justify-center text-[8px] ${item.checked ? "bg-[#131218] border-[#131218] text-white" : "border-[#131218]/30"}`}>
                {item.checked ? "✓" : ""}
              </span>
              <span className={item.checked ? "line-through opacity-50" : ""}>{inlineFormat(item.text)}</span>
            </li>
          ))}
        </ul>
      );
      continue;
    }

    if (line.trim() === "") { nodes.push(<div key={i} className="h-2" />); i++; continue; }
    if (/^---+$/.test(line.trim())) { nodes.push(<hr key={i} className="my-3 border-[#E0E0D8]" />); i++; continue; }

    nodes.push(
      <p key={i} className="text-[11.5px] text-[#131218]/80 leading-relaxed">{inlineFormat(line)}</p>
    );
    i++;
  }

  return nodes;
}

function inlineFormat(text: string): React.ReactNode {
  const parts: React.ReactNode[] = [];
  const regex = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g;
  let last = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > last) parts.push(text.slice(last, match.index));
    const raw = match[0];
    if (raw.startsWith("**")) parts.push(<strong key={match.index} className="font-bold text-[#131218]">{raw.slice(2, -2)}</strong>);
    else if (raw.startsWith("*")) parts.push(<em key={match.index} className="italic">{raw.slice(1, -1)}</em>);
    else if (raw.startsWith("`")) parts.push(<code key={match.index} className="bg-[#EFEFEA] px-1 py-0.5 rounded text-[10px] font-mono text-[#131218]">{raw.slice(1, -1)}</code>);
    last = match.index + raw.length;
  }

  if (last < text.length) parts.push(text.slice(last));
  return parts.length === 1 && typeof parts[0] === "string" ? parts[0] : <>{parts}</>;
}

// ─── Status styles ─────────────────────────────────────────────────────────────

const STATUS_PILL: Record<string, string> = {
  "Draft":            "bg-[#EFEFEA] text-[#131218]/50 border border-[#E0E0D8]",
  "Briefed":          "bg-purple-50 text-purple-700 border border-purple-200",
  "Signal":           "bg-sky-50 text-sky-700 border border-sky-200",
  "Topic Brief":      "bg-sky-50 text-sky-700 border border-sky-200",
  "In Progress":      "bg-amber-50 text-amber-700 border border-amber-200",
  "Review":           "bg-amber-50 text-amber-700 border border-amber-200",
  "Approved":         "bg-blue-50 text-blue-700 border border-blue-200",
  "Ready to Publish": "bg-green-50 text-green-700 border border-green-200",
  "Published":        "bg-[#B2FF59]/30 text-green-800 border border-[#B2FF59]",
  "Archived":         "bg-gray-50 text-gray-400 border border-gray-200",
};

const STATUS_DOT: Record<string, string> = {
  "Draft":            "bg-[#131218]/20",
  "Briefed":          "bg-purple-400",
  "Signal":           "bg-sky-400",
  "Topic Brief":      "bg-sky-400",
  "In Progress":      "bg-amber-400",
  "Review":           "bg-amber-400",
  "Approved":         "bg-blue-500",
  "Ready to Publish": "bg-green-500",
  "Published":        "bg-[#B2FF59]",
  "Archived":         "bg-gray-300",
};

// ─── Types ────────────────────────────────────────────────────────────────────

export type ContentCardItem = {
  id: string;
  title: string;
  status: string;
  contentType: string;
  channel: string;
  desk: string;
  projectName: string;
  notionUrl: string;
  draftText: string;
  slideHtml: string;
};

// ─── ContentCard ──────────────────────────────────────────────────────────────

export function ContentCard({ item, onArchive }: { item: ContentCardItem; onArchive: (id: string) => void }) {
  const [expanded, setExpanded] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [localStatus, setLocalStatus] = useState(item.status);

  const pillClass  = STATUS_PILL[localStatus] ?? STATUS_PILL["Draft"];
  const dotClass   = STATUS_DOT[localStatus]  ?? STATUS_DOT["Draft"];
  const hasSlides  = Boolean(item.slideHtml);
  const hasContent = Boolean(item.draftText || item.slideHtml);

  async function handleArchive(e: React.MouseEvent) {
    e.stopPropagation();
    if (archiving) return;
    setArchiving(true);
    try {
      await fetch(`/api/content/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "archive" }),
      });
      setLocalStatus("Archived");
      onArchive(item.id);
    } catch { /* silently fail */ } finally { setArchiving(false); }
  }

  function handleCopy(e: React.MouseEvent) {
    e.stopPropagation();
    navigator.clipboard.writeText(item.draftText || "").then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  function handleDownload(e: React.MouseEvent) {
    e.stopPropagation();
    if (hasSlides) {
      const blob = new Blob([item.slideHtml], { type: "text/html" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${item.title.slice(0, 60).replace(/[^a-z0-9 ]/gi, "_")}.html`;
      a.click();
      URL.revokeObjectURL(url);
    } else {
      const blob = new Blob([item.draftText], { type: "text/plain" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${item.title.slice(0, 60).replace(/[^a-z0-9 ]/gi, "_")}.txt`;
      a.click();
      URL.revokeObjectURL(url);
    }
  }

  return (
    <>
      {/* Fullscreen slide overlay */}
      {fullscreen && hasSlides && (
        <div className="fixed inset-0 z-50 bg-black flex flex-col">
          <div className="flex items-center justify-between px-4 py-2 bg-[#131218] border-b border-white/10 flex-shrink-0">
            <p className="text-[10px] font-bold text-white/40 truncate max-w-[60%]">{item.title}</p>
            <div className="flex items-center gap-2">
              <button onClick={handleDownload} className="text-[9px] font-bold px-2.5 py-1 rounded-md border border-white/20 text-white/50 hover:text-white hover:border-white/40 transition-all">
                Descargar .html
              </button>
              <button onClick={() => setFullscreen(false)} className="text-[9px] font-bold px-3 py-1 rounded-md bg-white/10 text-white hover:bg-white/20 transition-all">
                ✕ Cerrar
              </button>
            </div>
          </div>
          <iframe srcDoc={item.slideHtml} className="flex-1 w-full border-0" sandbox="allow-scripts allow-same-origin" title={item.title} />
        </div>
      )}

      <div className={`bg-white border rounded-[12px] overflow-hidden transition-all ${localStatus === "Archived" ? "opacity-50" : ""} border-[#E0E0D8]`}>
        <button
          onClick={() => setExpanded(v => !v)}
          className="w-full text-left px-4 py-3.5 flex items-center gap-3 hover:bg-[#FAFAF8] transition-colors"
        >
          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${dotClass}`} />
          <div className="flex-1 min-w-0">
            <p className="text-[12.5px] font-bold text-[#131218] tracking-[-0.2px] truncate">{item.title}</p>
            <p className="text-[10px] text-[#131218]/40 mt-0.5">
              {item.contentType || "—"}
              {item.channel ? ` · ${item.channel}` : ""}
              {item.projectName ? ` · ${item.projectName}` : ""}
              {hasSlides && <span className="ml-1.5 text-purple-500 font-bold">· Slides HTML</span>}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <span className={`text-[8.5px] font-bold tracking-[0.5px] px-2 py-0.5 rounded-full ${pillClass}`}>
              {localStatus || "—"}
            </span>
            {hasContent && (
              <span className="text-[9px] font-bold text-[#131218]/20 tracking-wide">{expanded ? "▲" : "▼"}</span>
            )}
          </div>
        </button>

        {expanded && (
          <div className="border-t border-[#EFEFEA]">
            {hasContent ? (
              <>
                <div className="flex items-center justify-between px-4 py-2.5 bg-[#FAFAF8] border-b border-[#EFEFEA]">
                  <p className="text-[9px] font-bold tracking-[1.5px] uppercase text-[#131218]/25">
                    {hasSlides ? "Vista previa — Slides" : "Vista previa del draft"}
                  </p>
                  <div className="flex items-center gap-2">
                    {hasSlides && (
                      <button
                        onClick={e => { e.stopPropagation(); setFullscreen(true); }}
                        className="text-[9px] font-bold px-2.5 py-1 rounded-md bg-[#131218] text-[#B2FF59] border border-[#131218] hover:bg-[#131218]/80 transition-all"
                      >
                        ⛶ Presentar
                      </button>
                    )}
                    {!hasSlides && (
                      <button onClick={handleCopy} className="text-[9px] font-bold px-2.5 py-1 rounded-md border border-[#E0E0D8] text-[#131218]/50 hover:text-[#131218] hover:border-[#131218]/30 transition-all">
                        {copied ? "✓ Copiado" : "Copiar texto"}
                      </button>
                    )}
                    <button onClick={handleDownload} className="text-[9px] font-bold px-2.5 py-1 rounded-md border border-[#E0E0D8] text-[#131218]/50 hover:text-[#131218] hover:border-[#131218]/30 transition-all">
                      {hasSlides ? "Descargar .html" : "Descargar .txt"}
                    </button>
                    {item.notionUrl && (
                      <a href={item.notionUrl} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
                        className="text-[9px] font-bold px-2.5 py-1 rounded-md border border-[#E0E0D8] text-[#131218]/50 hover:text-[#131218] hover:border-[#131218]/30 transition-all">
                        Notion ↗
                      </a>
                    )}
                    {localStatus !== "Archived" && (
                      <button onClick={handleArchive} disabled={archiving}
                        className="text-[9px] font-bold px-2.5 py-1 rounded-md border border-red-200 text-red-400 hover:text-red-600 hover:border-red-300 transition-all disabled:opacity-40">
                        {archiving ? "Archivando…" : "Archivar"}
                      </button>
                    )}
                  </div>
                </div>

                {hasSlides ? (
                  <div className="relative bg-[#131218]">
                    <iframe srcDoc={item.slideHtml} className="w-full h-[480px] border-0" sandbox="allow-scripts allow-same-origin" title={item.title} />
                    <div className="absolute bottom-2 right-3 text-[9px] text-white/30 font-bold">← → para navegar · click para avanzar</div>
                  </div>
                ) : (
                  <div className="px-5 py-4 max-h-[560px] overflow-y-auto">
                    {renderMarkdown(item.draftText)}
                  </div>
                )}
              </>
            ) : (
              <div className="px-4 py-6 text-center">
                <p className="text-[11px] text-[#131218]/25">No hay draft generado aún.</p>
                <p className="text-[10px] text-[#131218]/20 mt-1">El AI draft aparecerá aquí una vez generado (~30–60s).</p>
                {item.notionUrl && (
                  <a href={item.notionUrl} target="_blank" rel="noopener noreferrer"
                    className="inline-block mt-3 text-[10px] font-bold text-[#131218]/40 underline hover:text-[#131218]">
                    Ver en Notion →
                  </a>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}

// ─── DeskQueueSection — used in Comms/Design desk pages ──────────────────────
// Shows two sections: "En cola" (pending, no draft) + "Generados" (has draft)

const DESK_MAX = 5;

export function DeskQueueSection({
  pending,
  generated,
}: {
  pending: ContentCardItem[];
  generated: ContentCardItem[];
}) {
  const [hiddenIds, setHiddenIds]       = useState<Set<string>>(new Set());
  const [showAllPending, setShowAllPending]     = useState(false);
  const [showAllGenerated, setShowAllGenerated] = useState(false);

  const visible   = generated.filter(i => !hiddenIds.has(i.id) && i.status !== "Archived");
  const shownPending   = showAllPending   ? pending : pending.slice(0, DESK_MAX);
  const shownGenerated = showAllGenerated ? visible  : visible.slice(0, DESK_MAX);

  return (
    <div className="grid grid-cols-2 gap-4 items-start">

      {/* En cola */}
      <div>
        <div className="flex items-center gap-3 mb-3">
          <p className="text-[9px] font-bold tracking-[1.5px] uppercase text-[#131218]/30">En cola</p>
          <div className="flex-1 h-px bg-[#E0E0D8]" />
          <p className="text-[9px] font-bold text-[#131218]/25">{pending.length} items</p>
        </div>
        {pending.length > 0 ? (
          <>
            <div className="flex flex-col gap-2">
              {shownPending.map(item => (
                <div key={item.id} className="bg-white border border-[#E0E0D8] rounded-[12px] px-4 py-3 flex items-center gap-3">
                  <span className="w-2 h-2 rounded-full flex-shrink-0 bg-[#131218]/15 animate-pulse" />
                  <div className="flex-1 min-w-0">
                    <p className="text-[12px] font-bold text-[#131218] truncate">{item.title}</p>
                    <p className="text-[10px] text-[#131218]/35 mt-0.5">{item.contentType || "—"}</p>
                  </div>
                  <span className="text-[8.5px] font-bold px-2 py-0.5 rounded-full bg-[#EFEFEA] text-[#131218]/40 border border-[#E0E0D8]">
                    Generando…
                  </span>
                </div>
              ))}
            </div>
            {pending.length > DESK_MAX && (
              <button
                onClick={() => setShowAllPending(v => !v)}
                className="mt-2 w-full text-[9px] font-bold text-[#131218]/30 hover:text-[#131218]/60 py-1.5 transition-colors"
              >
                {showAllPending ? "▲ Ver menos" : `▼ Ver ${pending.length - DESK_MAX} más`}
              </button>
            )}
          </>
        ) : (
          <div className="bg-white border border-dashed border-[#E0E0D8] rounded-[12px] px-4 py-5 text-center">
            <p className="text-[11px] text-[#131218]/20">Cola vacía — las solicitudes nuevas aparecerán aquí.</p>
          </div>
        )}
      </div>

      {/* Generados */}
      <div>
        <div className="flex items-center gap-3 mb-3">
          <p className="text-[9px] font-bold tracking-[1.5px] uppercase text-[#131218]/30">Generados</p>
          <div className="flex-1 h-px bg-[#E0E0D8]" />
          <p className="text-[9px] font-bold text-[#131218]/25">{visible.length} items</p>
        </div>
        {visible.length > 0 ? (
          <>
            <div className="flex flex-col gap-2.5">
              {shownGenerated.map(item => (
                <ContentCard
                  key={item.id}
                  item={item}
                  onArchive={id => setHiddenIds(prev => new Set([...prev, id]))}
                />
              ))}
            </div>
            {visible.length > DESK_MAX && (
              <button
                onClick={() => setShowAllGenerated(v => !v)}
                className="mt-2 w-full text-[9px] font-bold text-[#131218]/30 hover:text-[#131218]/60 py-1.5 transition-colors"
              >
                {showAllGenerated ? "▲ Ver menos" : `▼ Ver ${visible.length - DESK_MAX} más`}
              </button>
            )}
          </>
        ) : (
          <div className="bg-white border border-dashed border-[#E0E0D8] rounded-[12px] px-4 py-5 text-center">
            <p className="text-[11px] text-[#131218]/20">Los drafts generados aparecerán aquí.</p>
          </div>
        )}
      </div>

    </div>
  );
}

// ─── ContentList — used in /admin/content ─────────────────────────────────────

export default function ContentList({ items }: { items: ContentCardItem[] }) {
  const [hiddenIds, setHiddenIds]   = useState<Set<string>>(new Set());
  const [deskFilter, setDeskFilter] = useState<"all" | "comms" | "design">("all");
  const [showArchived, setShowArchived] = useState(false);

  const filtered = items.filter(item => {
    if (hiddenIds.has(item.id)) return false;
    if (deskFilter === "comms")  return item.desk === "Comms";
    if (deskFilter === "design") return item.desk === "Design";
    return true;
  });

  const active   = filtered.filter(i => i.status !== "Archived");
  const archived = filtered.filter(i => i.status === "Archived");

  const DESK_TABS: { id: "all" | "comms" | "design"; label: string }[] = [
    { id: "all",    label: "Todo" },
    { id: "comms",  label: "Comms" },
    { id: "design", label: "Design" },
  ];

  return (
    <div className="space-y-6">

      {/* Desk filter */}
      <div className="flex items-center gap-2">
        {DESK_TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setDeskFilter(tab.id)}
            className={`text-[10px] font-bold px-3.5 py-1.5 rounded-full border transition-all ${
              deskFilter === tab.id
                ? "bg-[#131218] text-white border-[#131218]"
                : "border-[#E0E0D8] text-[#131218]/50 hover:border-[#131218]/30 hover:text-[#131218] bg-white"
            }`}
          >
            {tab.label}
          </button>
        ))}
        <span className="ml-auto text-[9px] font-bold text-[#131218]/25">{active.length} activos</span>
      </div>

      {/* Active items */}
      {active.length > 0 ? (
        <div className="flex flex-col gap-2.5">
          {active.map(item => (
            <ContentCard
              key={item.id}
              item={item}
              onArchive={id => setHiddenIds(prev => new Set([...prev, id]))}
            />
          ))}
        </div>
      ) : (
        <div className="bg-white border border-[#E0E0D8] rounded-2xl p-12 text-center">
          <p className="text-sm font-bold text-[#131218]/25 mb-2">No hay documentos activos</p>
          <p className="text-xs text-[#131218]/20">Las solicitudes del Design y Comms Desk aparecerán aquí con su draft generado.</p>
        </div>
      )}

      {/* Archived section */}
      {archived.length > 0 && (
        <div>
          <button
            onClick={() => setShowArchived(v => !v)}
            className="flex items-center gap-3 w-full group mb-3"
          >
            <p className="text-[9px] font-bold tracking-[1.5px] uppercase text-[#131218]/25 group-hover:text-[#131218]/50 transition-colors">
              Archivados
            </p>
            <div className="flex-1 h-px bg-[#E0E0D8]" />
            <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-gray-100 text-gray-400">
              {archived.length}
            </span>
            <span className="text-[9px] text-[#131218]/25 group-hover:text-[#131218]/50">
              {showArchived ? "▲" : "▼"}
            </span>
          </button>

          {showArchived && (
            <div className="flex flex-col gap-2.5 opacity-60">
              {archived.map(item => (
                <ContentCard
                  key={item.id}
                  item={item}
                  onArchive={id => setHiddenIds(prev => new Set([...prev, id]))}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
