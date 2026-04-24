"use client";

import { useState, useRef } from "react";

// ─── Simple markdown renderer ─────────────────────────────────────────────────

function renderMarkdown(md: string): React.ReactNode[] {
  const lines = md.split("\n");
  const nodes: React.ReactNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (line.startsWith("# ")) {
      nodes.push(
        <h1 key={i} className="text-[15px] font-black text-[#0a0a0a] mt-4 mb-1 tracking-tight">
          {inlineFormat(line.slice(2))}
        </h1>
      );
      i++; continue;
    }

    if (line.startsWith("## ")) {
      nodes.push(
        <h2 key={i} className="text-[13px] font-bold text-[#0a0a0a] mt-4 mb-1 tracking-tight">
          {inlineFormat(line.slice(3))}
        </h2>
      );
      i++; continue;
    }

    if (line.startsWith("### ")) {
      nodes.push(
        <h3 key={i} className="text-[12px] font-bold text-[#0a0a0a]/80 mt-3 mb-0.5">
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
            <li key={j} className="text-[11.5px] text-[#0a0a0a]/75 leading-relaxed list-disc">{inlineFormat(b)}</li>
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
            <li key={j} className="flex items-start gap-2 text-[11.5px] text-[#0a0a0a]/75">
              <span className={`mt-0.5 w-3.5 h-3.5 rounded border flex-shrink-0 flex items-center justify-center text-[8px] ${item.checked ? "bg-[#0a0a0a] border-[#0a0a0a] text-white" : "border-[#0a0a0a]/30"}`}>
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
    if (/^---+$/.test(line.trim())) { nodes.push(<hr key={i} className="my-3 border-[#e4e4dd]" />); i++; continue; }

    nodes.push(
      <p key={i} className="text-[11.5px] text-[#0a0a0a]/80 leading-relaxed">{inlineFormat(line)}</p>
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
    if (raw.startsWith("**")) parts.push(<strong key={match.index} className="font-bold text-[#0a0a0a]">{raw.slice(2, -2)}</strong>);
    else if (raw.startsWith("*")) parts.push(<em key={match.index} className="italic">{raw.slice(1, -1)}</em>);
    else if (raw.startsWith("`")) parts.push(<code key={match.index} className="bg-[#f4f4ef] px-1 py-0.5 rounded text-[10px] font-mono text-[#0a0a0a]">{raw.slice(1, -1)}</code>);
    last = match.index + raw.length;
  }

  if (last < text.length) parts.push(text.slice(last));
  return parts.length === 1 && typeof parts[0] === "string" ? parts[0] : <>{parts}</>;
}

// ─── Status styles ─────────────────────────────────────────────────────────────

const STATUS_PILL: Record<string, string> = {
  "Draft":            "bg-[#f4f4ef] text-[#0a0a0a]/50 border border-[#e4e4dd]",
  "Briefed":          "bg-purple-50 text-purple-700 border border-purple-200",
  "Signal":           "bg-sky-50 text-sky-700 border border-sky-200",
  "Topic Brief":      "bg-sky-50 text-sky-700 border border-sky-200",
  "In Progress":      "bg-amber-50 text-amber-700 border border-amber-200",
  "Review":           "bg-amber-50 text-amber-700 border border-amber-200",
  "Approved":         "bg-blue-50 text-blue-700 border border-blue-200",
  "Ready to Publish": "bg-green-50 text-green-700 border border-green-200",
  "Published":        "bg-[#c6f24a]/30 text-green-800 border border-[#c6f24a]",
  "Archived":         "bg-gray-50 text-gray-400 border border-gray-200",
};

const STATUS_DOT: Record<string, string> = {
  "Draft":            "bg-[#0a0a0a]/20",
  "Briefed":          "bg-purple-400",
  "Signal":           "bg-sky-400",
  "Topic Brief":      "bg-sky-400",
  "In Progress":      "bg-amber-400",
  "Review":           "bg-amber-400",
  "Approved":         "bg-blue-500",
  "Ready to Publish": "bg-green-500",
  "Published":        "bg-[#c6f24a]",
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
  const [jpgLoading, setJpgLoading] = useState(false);
  const [pptLoading, setPptLoading] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const pillClass  = STATUS_PILL[localStatus] ?? STATUS_PILL["Draft"];
  const dotClass   = STATUS_DOT[localStatus]  ?? STATUS_DOT["Draft"];
  const hasSlides  = Boolean(item.slideHtml);
  const hasContent = Boolean(item.draftText || item.slideHtml);
  // Detect document mode: One-pager type OR generated HTML has no slide navigation
  const isDocumentMode = item.contentType === "One-pager" ||
    (hasSlides && !item.slideHtml.includes("nextSlide") && !item.slideHtml.includes("addEventListener(\"keydown"));

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

  const slug = item.title.slice(0, 60).replace(/[^a-z0-9 ]/gi, "_");

  function handleDownloadHtml(e: React.MouseEvent) {
    e.stopPropagation();
    const blob = new Blob([item.slideHtml], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `${slug}.html`; a.click();
    URL.revokeObjectURL(url);
  }

  function handleDownloadTxt(e: React.MouseEvent) {
    e.stopPropagation();
    const blob = new Blob([item.draftText], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `${slug}.txt`; a.click();
    URL.revokeObjectURL(url);
  }

  function handleDownloadPdf(e: React.MouseEvent) {
    e.stopPropagation();
    // Inject auto-print trigger and open in new tab — browser saves as PDF
    const printHtml = item.slideHtml.replace(
      "</body>",
      `<script>window.onload=function(){setTimeout(function(){window.print();},400);}</script></body>`
    );
    const blob = new Blob([printHtml], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank");
    setTimeout(() => URL.revokeObjectURL(url), 15000);
  }

  async function handleDownloadPpt(e: React.MouseEvent) {
    e.stopPropagation();
    setPptLoading(true);
    try {
      const res = await fetch("/api/export-pptx", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pageId: item.id }),
      });
      if (!res.ok) throw new Error("PPT export failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.download = `${slug}.pptx`; a.href = url; a.click();
      URL.revokeObjectURL(url);
    } catch (err) { console.error("PPT export failed", err); }
    finally { setPptLoading(false); }
  }

  async function handleDownloadJpg(e: React.MouseEvent) {
    e.stopPropagation();
    const iframe = iframeRef.current;
    if (!iframe?.contentDocument || !iframe?.contentWindow) return;
    setJpgLoading(true);
    try {
      const iw = iframe.contentWindow as Window & { html2canvas?: (el: HTMLElement, opts: object) => Promise<HTMLCanvasElement> };
      if (!iw.html2canvas) {
        await new Promise<void>((resolve, reject) => {
          const s = iframe.contentDocument!.createElement("script");
          s.src = "https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js";
          s.onload = () => resolve(); s.onerror = reject;
          iframe.contentDocument!.head.appendChild(s);
        });
      }
      const canvas = await iw.html2canvas!(iframe.contentDocument.documentElement, { scale: 2, useCORS: true });
      const a = document.createElement("a"); a.download = `${slug}.jpg`;
      a.href = canvas.toDataURL("image/jpeg", 0.93); a.click();
    } catch (err) { console.error("JPG export failed", err); }
    finally { setJpgLoading(false); }
  }

  return (
    <>
      {/* Fullscreen overlay */}
      {fullscreen && hasSlides && (
        <div className="fixed inset-0 z-50 bg-black flex flex-col">
          <div className="flex items-center justify-between px-4 py-2 bg-[#0a0a0a] border-b border-white/10 flex-shrink-0">
            <p className="text-[10px] font-bold text-white/40 truncate max-w-[50%]">{item.title}</p>
            <div className="flex items-center gap-2">
              <button onClick={handleDownloadPdf} className="text-[9px] font-bold px-2.5 py-1 rounded-md border border-white/20 text-white/50 hover:text-white hover:border-white/40 transition-all">PDF</button>
              <button onClick={handleDownloadPpt} disabled={pptLoading} className="text-[9px] font-bold px-2.5 py-1 rounded-md border border-white/20 text-white/50 hover:text-white hover:border-white/40 transition-all disabled:opacity-40">
                {pptLoading ? "…" : "PPT"}
              </button>
              <button onClick={handleDownloadJpg} disabled={jpgLoading} className="text-[9px] font-bold px-2.5 py-1 rounded-md border border-white/20 text-white/50 hover:text-white hover:border-white/40 transition-all disabled:opacity-40">
                {jpgLoading ? "…" : "JPG"}
              </button>
              <button onClick={handleDownloadHtml} className="text-[9px] font-bold px-2.5 py-1 rounded-md border border-white/20 text-white/50 hover:text-white hover:border-white/40 transition-all">.html</button>
              <button onClick={() => setFullscreen(false)} className="text-[9px] font-bold px-3 py-1 rounded-md bg-white/10 text-white hover:bg-white/20 transition-all">✕</button>
            </div>
          </div>
          <iframe srcDoc={item.slideHtml} className="flex-1 w-full border-0" sandbox="allow-scripts allow-same-origin" title={item.title} />
        </div>
      )}

      <div className={`bg-white border rounded-[12px] overflow-hidden transition-all ${localStatus === "Archived" ? "opacity-50" : ""} border-[#e4e4dd]`}>
        <button
          onClick={() => setExpanded(v => !v)}
          className="w-full text-left px-4 py-3.5 flex items-center gap-3 hover:bg-[#FAFAF8] transition-colors"
        >
          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${dotClass}`} />
          <div className="flex-1 min-w-0">
            <p className="text-[12.5px] font-bold text-[#0a0a0a] tracking-[-0.2px] truncate">{item.title}</p>
            <p className="text-[10px] text-[#0a0a0a]/40 mt-0.5">
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
              <span className="text-[9px] font-bold text-[#0a0a0a]/20 tracking-wide">{expanded ? "▲" : "▼"}</span>
            )}
          </div>
        </button>

        {expanded && (
          <div className="border-t border-[#f4f4ef]">
            {hasContent ? (
              <>
                <div className="flex items-center justify-between px-4 py-2.5 bg-[#FAFAF8] border-b border-[#f4f4ef]">
                  <p className="text-[9px] font-bold tracking-[1.5px] uppercase text-[#0a0a0a]/25">
                    {hasSlides ? (isDocumentMode ? "Documento" : "Slides") : "Draft"}
                  </p>
                  <div className="flex items-center gap-2">
                    {hasSlides && (
                      <button onClick={e => { e.stopPropagation(); setFullscreen(true); }}
                        className="text-[9px] font-bold px-2.5 py-1 rounded-md bg-[#0a0a0a] text-[#c6f24a] border border-[#0a0a0a] hover:bg-[#0a0a0a]/80 transition-all">
                        Expandir
                      </button>
                    )}
                    {!hasSlides && (
                      <button onClick={handleCopy} className="text-[9px] font-bold px-2.5 py-1 rounded-md border border-[#e4e4dd] text-[#0a0a0a]/50 hover:text-[#0a0a0a] hover:border-[#0a0a0a]/30 transition-all">
                        {copied ? "✓ Copiado" : "Copiar"}
                      </button>
                    )}
                    {hasSlides ? (
                      <>
                        <button onClick={handleDownloadPdf} className="text-[9px] font-bold px-2.5 py-1 rounded-md border border-[#e4e4dd] text-[#0a0a0a]/50 hover:text-[#0a0a0a] hover:border-[#0a0a0a]/30 transition-all">PDF</button>
                        <button onClick={handleDownloadPpt} disabled={pptLoading} className="text-[9px] font-bold px-2.5 py-1 rounded-md border border-[#e4e4dd] text-[#0a0a0a]/50 hover:text-[#0a0a0a] hover:border-[#0a0a0a]/30 transition-all disabled:opacity-40">
                          {pptLoading ? "…" : "PPT"}
                        </button>
                        <button onClick={handleDownloadJpg} disabled={jpgLoading} className="text-[9px] font-bold px-2.5 py-1 rounded-md border border-[#e4e4dd] text-[#0a0a0a]/50 hover:text-[#0a0a0a] hover:border-[#0a0a0a]/30 transition-all disabled:opacity-40">
                          {jpgLoading ? "…" : "JPG"}
                        </button>
                        <button onClick={handleDownloadHtml} className="text-[9px] font-bold px-2.5 py-1 rounded-md border border-[#e4e4dd] text-[#0a0a0a]/50 hover:text-[#0a0a0a] hover:border-[#0a0a0a]/30 transition-all">.html</button>
                      </>
                    ) : (
                      <button onClick={handleDownloadTxt} className="text-[9px] font-bold px-2.5 py-1 rounded-md border border-[#e4e4dd] text-[#0a0a0a]/50 hover:text-[#0a0a0a] hover:border-[#0a0a0a]/30 transition-all">.txt</button>
                    )}
                    {item.notionUrl && (
                      <a href={item.notionUrl} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
                        className="text-[9px] font-bold px-2.5 py-1 rounded-md border border-[#e4e4dd] text-[#0a0a0a]/50 hover:text-[#0a0a0a] hover:border-[#0a0a0a]/30 transition-all">
                        Notion ↗
                      </a>
                    )}
                    {localStatus !== "Archived" && (
                      <button onClick={handleArchive} disabled={archiving}
                        className="text-[9px] font-bold px-2.5 py-1 rounded-md border border-red-200 text-red-400 hover:text-red-600 hover:border-red-300 transition-all disabled:opacity-40">
                        {archiving ? "…" : "Archivar"}
                      </button>
                    )}
                  </div>
                </div>

                {hasSlides ? (
                  <div className={`relative ${isDocumentMode ? "bg-[#EEEEE8]" : "bg-[#0a0a0a]"}`}>
                    <iframe
                      ref={iframeRef}
                      srcDoc={item.slideHtml}
                      className={`w-full border-0 ${isDocumentMode ? "h-[700px]" : "h-[480px]"}`}
                      sandbox="allow-scripts allow-same-origin"
                      title={item.title}
                    />
                    {!isDocumentMode && (
                      <>
                        <button
                          onClick={e => { e.stopPropagation(); (iframeRef.current?.contentWindow as any)?.prevSlide?.(); }}
                          className="absolute left-3 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-white/10 hover:bg-white/25 text-white/60 hover:text-white flex items-center justify-center text-sm transition-all"
                        >‹</button>
                        <button
                          onClick={e => { e.stopPropagation(); (iframeRef.current?.contentWindow as any)?.nextSlide?.(); }}
                          className="absolute right-3 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-white/10 hover:bg-white/25 text-white/60 hover:text-white flex items-center justify-center text-sm transition-all"
                        >›</button>
                      </>
                    )}
                  </div>
                ) : (
                  <div className="px-5 py-4 max-h-[560px] overflow-y-auto">
                    {renderMarkdown(item.draftText)}
                  </div>
                )}
              </>
            ) : (
              <div className="px-4 py-6 text-center">
                <p className="text-[11px] text-[#0a0a0a]/25">No hay draft generado aún.</p>
                <p className="text-[10px] text-[#0a0a0a]/20 mt-1">El AI draft aparecerá aquí una vez generado (~30–60s).</p>
                {item.notionUrl && (
                  <a href={item.notionUrl} target="_blank" rel="noopener noreferrer"
                    className="inline-block mt-3 text-[10px] font-bold text-[#0a0a0a]/40 underline hover:text-[#0a0a0a]">
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

// ─── DeskQueueSection — unified production list with status badges ─────────────

const DESK_MAX = 5;

type ItemPhase = "draft" | "review" | "ready" | "archived" | "no-content";

function getPhase(item: ContentCardItem): ItemPhase {
  const s = item.status?.toLowerCase() ?? "";
  if (s === "archived") return "archived";
  if (s === "published" || s === "ready" || s === "approved") return "ready";
  if (s === "review" || s === "briefed" || s === "in review") return "review";
  if (item.draftText || item.slideHtml) return "draft";
  return "no-content";
}

const PHASE_BADGE: Record<ItemPhase, { label: string; className: string }> = {
  "no-content": { label: "Sin draft",    className: "bg-[#f4f4ef] text-[#0a0a0a]/35 border border-[#e4e4dd]" },
  "draft":      { label: "Borrador",     className: "bg-amber-50 text-amber-700 border border-amber-200" },
  "review":     { label: "En revisión",  className: "bg-blue-50 text-blue-700 border border-blue-200" },
  "ready":      { label: "Listo",        className: "bg-[#c6f24a]/20 text-[#3a6600] border border-[#c6f24a]/50" },
  "archived":   { label: "Archivado",    className: "bg-[#f4f4ef] text-[#0a0a0a]/25 border border-[#e4e4dd]" },
};

export function DeskQueueSection({
  items,
}: {
  items: ContentCardItem[];
}) {
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set());
  const [showArchived, setShowArchived] = useState(false);
  const [showAll, setShowAll] = useState(false);

  const active   = items.filter(i => !hiddenIds.has(i.id) && getPhase(i) !== "archived");
  const archived = items.filter(i => !hiddenIds.has(i.id) && getPhase(i) === "archived");
  const shown    = showAll ? active : active.slice(0, DESK_MAX);

  return (
    <div className="flex flex-col gap-4">

      {/* Header */}
      <div className="flex items-center gap-3">
        <p className="text-[9px] font-bold tracking-[1.5px] uppercase text-[#0a0a0a]/30">Producción</p>
        <div className="flex-1 h-px bg-[#e4e4dd]" />
        <p className="text-[9px] font-bold text-[#0a0a0a]/25">{active.length} items</p>
      </div>

      {/* Items — single column */}
      {active.length > 0 ? (
        <>
          <div className="grid grid-cols-1 gap-2.5">
            {shown.map(item => {
              const phase = getPhase(item);
              const badge = PHASE_BADGE[phase];
              const hasContent = phase !== "no-content";

              if (hasContent) {
                return (
                  <ContentCard
                    key={item.id}
                    item={item}
                    onArchive={id => setHiddenIds(prev => new Set([...prev, id]))}
                  />
                );
              }

              // No-content row (item exists but draft not generated yet)
              return (
                <div key={item.id} className="bg-white border border-[#e4e4dd] rounded-[12px] px-4 py-3 flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-[12px] font-bold text-[#0a0a0a] truncate">{item.title}</p>
                    <p className="text-[10px] text-[#0a0a0a]/35 mt-0.5">{item.contentType || "—"}</p>
                  </div>
                  <span className={`text-[8.5px] font-bold px-2 py-0.5 rounded-full flex-shrink-0 ${badge.className}`}>
                    {badge.label}
                  </span>
                </div>
              );
            })}
          </div>

          {active.length > DESK_MAX && (
            <button
              onClick={() => setShowAll(v => !v)}
              className="text-[9px] font-bold text-[#0a0a0a]/30 hover:text-[#0a0a0a]/60 py-1 transition-colors text-left"
            >
              {showAll ? "▲ Mostrar menos" : `▼ Expandir (${active.length - DESK_MAX} más)`}
            </button>
          )}
        </>
      ) : (
        <div className="bg-white border border-dashed border-[#e4e4dd] rounded-[12px] px-4 py-6 text-center">
          <p className="text-[11px] text-[#0a0a0a]/20">Los items generados aparecerán aquí.</p>
        </div>
      )}

      {/* Archived toggle */}
      {archived.length > 0 && (
        <div>
          <button
            onClick={() => setShowArchived(v => !v)}
            className="text-[9px] font-bold text-[#0a0a0a]/25 hover:text-[#0a0a0a]/50 transition-colors"
          >
            {showArchived ? "▲ Ocultar archivados" : `▼ ${archived.length} archivado${archived.length > 1 ? "s" : ""}`}
          </button>
          {showArchived && (
            <div className="flex flex-col gap-2 mt-2">
              {archived.map(item => (
                <div key={item.id} className="bg-[#FAFAF8] border border-[#e4e4dd] rounded-[12px] px-4 py-3 flex items-center gap-3 opacity-50">
                  <div className="flex-1 min-w-0">
                    <p className="text-[12px] font-bold text-[#0a0a0a] truncate">{item.title}</p>
                    <p className="text-[10px] text-[#0a0a0a]/35 mt-0.5">{item.contentType || "—"}</p>
                  </div>
                  <span className="text-[8.5px] font-bold px-2 py-0.5 rounded-full bg-[#f4f4ef] text-[#0a0a0a]/30 border border-[#e4e4dd]">
                    Archivado
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

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
                ? "bg-[#0a0a0a] text-white border-[#0a0a0a]"
                : "border-[#e4e4dd] text-[#0a0a0a]/50 hover:border-[#0a0a0a]/30 hover:text-[#0a0a0a] bg-white"
            }`}
          >
            {tab.label}
          </button>
        ))}
        <span className="ml-auto text-[9px] font-bold text-[#0a0a0a]/25">{active.length} activos</span>
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
        <div className="bg-white border border-[#e4e4dd] rounded-2xl p-12 text-center">
          <p className="text-sm font-bold text-[#0a0a0a]/25 mb-2">No hay documentos activos</p>
          <p className="text-xs text-[#0a0a0a]/20">Las solicitudes del Design y Comms Desk aparecerán aquí con su draft generado.</p>
        </div>
      )}

      {/* Archived section */}
      {archived.length > 0 && (
        <div>
          <button
            onClick={() => setShowArchived(v => !v)}
            className="flex items-center gap-3 w-full group mb-3"
          >
            <p className="text-[9px] font-bold tracking-[1.5px] uppercase text-[#0a0a0a]/25 group-hover:text-[#0a0a0a]/50 transition-colors">
              Archivados
            </p>
            <div className="flex-1 h-px bg-[#e4e4dd]" />
            <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-gray-100 text-gray-400">
              {archived.length}
            </span>
            <span className="text-[9px] text-[#0a0a0a]/25 group-hover:text-[#0a0a0a]/50">
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
