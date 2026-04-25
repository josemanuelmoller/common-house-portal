"use client";

import { useState, useRef } from "react";

type QuickResult = {
  title: string;
  assetType: string;
  tags: string[];
  summary: string;
  notionId: string;
  sourceFileUrl?: string;
  storagePath?: string;
};

type DigestResult = {
  proposalMarkdown: string;
  proposalLengthChars: number;
  modelUsed: string;
  inputTokens: number;
  cachedTokens: number;
  outputTokens: number;
  fileName: string;
  fileSize: number;
};

export function LibraryIngestPanel() {
  const [digestMode, setDigestMode] = useState<"quick" | "full">("quick");
  const [mode, setMode] = useState<"paste" | "upload">("paste");
  const [text, setText] = useState("");
  const [source, setSource] = useState("");
  const [scopeHintsText, setScopeHintsText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<"idle" | "processing" | "done" | "error">("idle");
  const [quickResult, setQuickResult] = useState<QuickResult | null>(null);
  const [digestResult, setDigestResult] = useState<DigestResult | null>(null);
  const [error, setError] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [proposalCopied, setProposalCopied] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  function reset() {
    setText("");
    setFile(null);
    setSource("");
    setScopeHintsText("");
    setQuickResult(null);
    setDigestResult(null);
    setStatus("idle");
    setError("");
  }

  function setDigestModeAndReset(m: "quick" | "full") {
    setDigestMode(m);
    if (m === "full") setMode("upload");
    reset();
  }

  async function handleIngest() {
    if (digestMode === "full") {
      if (!file || file.type !== "application/pdf") return;
      setStatus("processing");
      setQuickResult(null);
      setDigestResult(null);
      setError("");

      try {
        const fd = new FormData();
        fd.append("file", file);
        if (source) fd.append("source", source);
        if (scopeHintsText.trim()) {
          let scopeJson = scopeHintsText.trim();
          try {
            JSON.parse(scopeJson);
          } catch {
            // Treat as ch_relevance free-text if not valid JSON
            scopeJson = JSON.stringify({ ch_relevance: scopeHintsText.trim() });
          }
          fd.append("scopeHints", scopeJson);
        }
        const res = await fetch("/api/ingest-library/digest", { method: "POST", body: fd });
        const data = await res.json();
        if (!res.ok || !data.ok) throw new Error(data.error ?? "Unknown error");
        setDigestResult(data as DigestResult);
        setStatus("done");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error");
        setStatus("error");
      }
      return;
    }

    // Quick classify path (existing)
    if (mode === "paste" && !text.trim()) return;
    if (mode === "upload" && !file) return;
    setStatus("processing");
    setQuickResult(null);
    setDigestResult(null);
    setError("");

    try {
      let res: Response;
      if (mode === "upload" && file) {
        const fd = new FormData();
        fd.append("file", file);
        if (source) fd.append("source", source);
        res = await fetch("/api/ingest-library", { method: "POST", body: fd });
      } else {
        res = await fetch("/api/ingest-library", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text, source }),
        });
      }
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Unknown error");
      setQuickResult(data);
      setStatus("done");
      setText("");
      setFile(null);
      setSource("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
      setStatus("error");
    }
  }

  async function handleDelete() {
    if (!quickResult?.notionId) return;
    setDeleting(true);
    try {
      await fetch("/api/ingest-library", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notionId: quickResult.notionId, storagePath: quickResult.storagePath }),
      });
      setQuickResult(null);
      setStatus("idle");
    } finally {
      setDeleting(false);
    }
  }

  function handleCopyProposal() {
    if (!digestResult?.proposalMarkdown) return;
    navigator.clipboard.writeText(digestResult.proposalMarkdown).then(() => {
      setProposalCopied(true);
      setTimeout(() => setProposalCopied(false), 2000);
    });
  }

  function handleDownloadProposal() {
    if (!digestResult?.proposalMarkdown) return;
    const slug = digestResult.fileName
      .replace(/\.pdf$/i, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
    const blob = new Blob([digestResult.proposalMarkdown], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${slug || "digestion"}-proposal.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  const canSubmit = status !== "processing" && (
    digestMode === "full"
      ? file !== null && file.type === "application/pdf"
      : mode === "paste" ? text.trim().length > 0 : file !== null
  );

  const isFull = digestMode === "full";

  return (
    <div className="bg-white rounded-2xl border border-[#e4e4dd] overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-[#e4e4dd] flex items-center justify-between gap-3 flex-wrap">
        <div>
          <p className="text-[8px] font-bold tracking-[2px] uppercase text-[#0a0a0a]/30 mb-0.5">Library Ingest</p>
          <p className="text-sm font-bold text-[#0a0a0a]">Añadir conocimiento</p>
        </div>
        <div className="flex flex-col gap-1.5 items-end">
          {/* Digest-mode toggle (Quick vs Full) */}
          <div className="flex gap-1.5">
            <button
              onClick={() => setDigestModeAndReset("quick")}
              className={`text-[10px] font-bold px-3 py-1.5 rounded-lg border transition-all ${
                digestMode === "quick"
                  ? "bg-[#0a0a0a] text-white border-[#0a0a0a]"
                  : "border-[#e4e4dd] text-[#0a0a0a]/40 hover:text-[#0a0a0a] hover:border-[#0a0a0a]/30"
              }`}
              title="Auto-clasifica como un Knowledge Asset draft (~20s)"
            >
              Quick classify
            </button>
            <button
              onClick={() => setDigestModeAndReset("full")}
              className={`text-[10px] font-bold px-3 py-1.5 rounded-lg border transition-all ${
                digestMode === "full"
                  ? "bg-[#c6f24a] text-[#0a0a0a] border-[#c6f24a]"
                  : "border-[#e4e4dd] text-[#0a0a0a]/40 hover:text-[#0a0a0a] hover:border-[#0a0a0a]/30"
              }`}
              title="Genera la propuesta de digestion completa (Source + Evidence + KAs) para revisar"
            >
              Full digest
            </button>
          </div>
          {/* Sub-mode toggle (paste/upload) only relevant for Quick mode */}
          {!isFull && (
            <div className="flex gap-1.5">
              {(["paste", "upload"] as const).map(m => (
                <button
                  key={m}
                  onClick={() => { setMode(m); reset(); }}
                  className={`text-[10px] font-bold px-3 py-1.5 rounded-lg border transition-all ${
                    mode === m
                      ? "bg-[#0a0a0a]/80 text-white border-[#0a0a0a]/80"
                      : "border-[#e4e4dd] text-[#0a0a0a]/40 hover:text-[#0a0a0a] hover:border-[#0a0a0a]/30"
                  }`}
                >
                  {m === "paste" ? "Pegar texto" : "Subir archivo"}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="px-6 py-5 flex flex-col gap-3">
        {/* Mode hint banner for Full digest */}
        {isFull && (
          <div className="rounded-xl bg-[#FAFAF8] border border-[#e4e4dd] px-4 py-3">
            <p className="text-[10px] font-bold tracking-[1px] uppercase text-[#0a0a0a]/40 mb-1">Full digest mode</p>
            <p className="text-[11px] text-[#0a0a0a]/70 leading-relaxed">
              Subí un PDF estratégico (paper, whitepaper, industry report). El sistema genera una <strong>propuesta de digestion completa</strong> (Source + ~50 Evidence + 6-8 Knowledge Assets). El push final a Notion lo hace el agente después de tu review. ~30 segundos.
            </p>
          </div>
        )}

        {/* Input */}
        {isFull || mode === "upload" ? (
          <div
            onClick={() => fileRef.current?.click()}
            className="border-2 border-dashed border-[#e4e4dd] rounded-xl px-6 py-8 text-center cursor-pointer hover:border-[#0a0a0a]/30 hover:bg-[#FAFAF8] transition-all"
          >
            <input
              ref={fileRef}
              type="file"
              accept={isFull ? ".pdf" : ".pdf,.txt,.md,.docx,.csv"}
              className="hidden"
              onChange={e => setFile(e.target.files?.[0] ?? null)}
            />
            {file ? (
              <div>
                <p className="text-sm font-bold text-[#0a0a0a]">{file.name}</p>
                <p className="text-[10px] text-[#0a0a0a]/35 mt-1">
                  {(file.size / 1024).toFixed(0)} KB · {file.type || "unknown type"}
                </p>
                {isFull && file.type !== "application/pdf" && (
                  <p className="text-[10px] text-red-500 mt-1 font-bold">Full Digest sólo acepta PDF</p>
                )}
                <button
                  onClick={e => { e.stopPropagation(); setFile(null); }}
                  className="mt-2 text-[9px] font-bold text-[#0a0a0a]/30 hover:text-red-500 transition-colors"
                >
                  Quitar
                </button>
              </div>
            ) : (
              <>
                <p className="text-2xl mb-2 text-[#0a0a0a]/20">↑</p>
                <p className="text-sm font-semibold text-[#0a0a0a]/50">Subir archivo</p>
                <p className="text-[10px] text-[#0a0a0a]/25 mt-1">
                  {isFull ? "Sólo PDF · máx 50 MB" : "PDF, TXT, MD, DOCX, CSV · máx 50 MB"}
                </p>
              </>
            )}
          </div>
        ) : (
          <textarea
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder="Pega aquí un artículo, reporte, extracto, regulación, análisis... Claude lo clasificará y creará el Knowledge Asset."
            className="w-full h-36 border border-[#e4e4dd] rounded-xl px-4 py-3 text-sm text-[#0a0a0a] bg-[#FAFAF8] resize-none outline-none focus:border-[#0a0a0a]/30 placeholder-[#0a0a0a]/20 leading-relaxed"
          />
        )}

        {/* Source / attribution */}
        <input
          value={source}
          onChange={e => setSource(e.target.value)}
          placeholder="Fuente / URL / referencia (opcional)"
          className="w-full border border-[#e4e4dd] rounded-lg px-4 py-2.5 text-xs text-[#0a0a0a] bg-[#FAFAF8] outline-none focus:border-[#0a0a0a]/30 placeholder-[#0a0a0a]/20"
        />

        {/* Scope hints (Full mode only) */}
        {isFull && (
          <textarea
            value={scopeHintsText}
            onChange={e => setScopeHintsText(e.target.value)}
            placeholder='Scope hints opcionales: por qué importa para CH, partner Org, geographic scope, link a deal/proyecto activo. Texto libre o JSON {"ch_relevance":"...", "partner_org":"...", "geographic_scope":"..."}'
            className="w-full h-20 border border-[#e4e4dd] rounded-lg px-4 py-2.5 text-[11px] text-[#0a0a0a] bg-[#FAFAF8] resize-none outline-none focus:border-[#0a0a0a]/30 placeholder-[#0a0a0a]/20 leading-relaxed"
          />
        )}

        {/* Submit */}
        <button
          onClick={handleIngest}
          disabled={!canSubmit}
          className={`w-full text-xs font-bold py-3 rounded-xl transition-all ${
            status === "processing"
              ? "bg-[#0a0a0a]/40 text-white cursor-not-allowed"
              : status === "done"
              ? "bg-[#c6f24a] text-[#0a0a0a]"
              : status === "error"
              ? "bg-red-100 text-red-700"
              : canSubmit
              ? "bg-[#0a0a0a] text-white hover:bg-[#0a0a0a]/80"
              : "bg-[#e4e4dd] text-[#0a0a0a]/30 cursor-not-allowed"
          }`}
        >
          {status === "processing"
            ? isFull
              ? "Generando propuesta de digestion... (~30s)"
              : "Procesando con Claude... (~20s)"
            : status === "done"
            ? isFull
              ? "✓ Propuesta de digestion lista — revisar abajo"
              : "✓ Añadido como Draft en Knowledge Assets"
            : status === "error"
            ? `Error: ${error}`
            : isFull
              ? "Generar propuesta de digestion →"
              : "Procesar y clasificar →"}
        </button>

        {/* Quick result card */}
        {status === "done" && quickResult && !isFull && (
          <div className="bg-[#FAFAF8] border border-[#e4e4dd] rounded-xl px-4 py-4">
            <div className="flex items-start justify-between gap-3 mb-2">
              <p className="text-[11px] font-bold text-[#0a0a0a] leading-snug flex-1">{quickResult.title}</p>
              <span className="text-[9px] font-bold bg-[#f4f4ef] text-[#0a0a0a]/50 px-2 py-0.5 rounded-full shrink-0">
                {quickResult.assetType}
              </span>
            </div>
            <p className="text-[10px] text-[#0a0a0a]/50 leading-relaxed mb-2">{quickResult.summary}</p>
            <div className="flex flex-wrap gap-1 mb-3">
              {quickResult.tags.map(t => (
                <span key={t} className="text-[8px] font-semibold bg-[#0a0a0a]/5 text-[#0a0a0a]/40 px-2 py-0.5 rounded-full">
                  {t}
                </span>
              ))}
            </div>
            <div className="flex items-center justify-between pt-2.5 border-t border-[#e4e4dd]">
              <div className="flex items-center gap-3">
                {quickResult.sourceFileUrl ? (
                  <a
                    href={quickResult.sourceFileUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[9px] font-bold text-[#0a0a0a]/50 hover:text-[#0a0a0a] transition-colors flex items-center gap-1"
                  >
                    ↓ Descargar archivo original
                  </a>
                ) : (
                  <p className="text-[8px] text-[#0a0a0a]/20">Texto procesado · sin archivo adjunto</p>
                )}
              </div>
              <div className="flex items-center gap-2">
                <p className="text-[8px] text-[#0a0a0a]/20">Draft en Notion · revisar antes de publicar</p>
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  className="text-[9px] font-bold text-[#0a0a0a]/25 hover:text-red-500 transition-colors"
                >
                  {deleting ? "..." : "Descartar"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Full digest result card */}
        {status === "done" && digestResult && isFull && (
          <div className="bg-[#FAFAF8] border border-[#e4e4dd] rounded-xl px-4 py-4 flex flex-col gap-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[8px] font-bold tracking-[2px] uppercase text-[#0a0a0a]/30 mb-0.5">Propuesta de digestion</p>
                <p className="text-[11px] font-bold text-[#0a0a0a]">{digestResult.fileName}</p>
              </div>
              <span className="text-[9px] font-bold bg-[#c6f24a] text-[#0a0a0a] px-2 py-0.5 rounded-full shrink-0">
                {digestResult.modelUsed}
              </span>
            </div>
            <div className="flex items-center gap-3 text-[9px] text-[#0a0a0a]/40">
              <span>{(digestResult.fileSize / 1024).toFixed(0)} KB PDF</span>
              <span>·</span>
              <span>in: {digestResult.inputTokens.toLocaleString()} tok</span>
              {digestResult.cachedTokens > 0 && (
                <>
                  <span>·</span>
                  <span>cached: {digestResult.cachedTokens.toLocaleString()}</span>
                </>
              )}
              <span>·</span>
              <span>out: {digestResult.outputTokens.toLocaleString()} tok</span>
              <span>·</span>
              <span>{(digestResult.proposalLengthChars / 1000).toFixed(1)}K chars</span>
            </div>

            {/* Proposal preview (collapsible scroll area) */}
            <details className="bg-white border border-[#e4e4dd] rounded-lg overflow-hidden">
              <summary className="px-4 py-2.5 text-[10px] font-bold text-[#0a0a0a] cursor-pointer select-none hover:bg-[#FAFAF8]">
                Ver propuesta (markdown) ↓
              </summary>
              <pre className="text-[10px] text-[#0a0a0a]/80 leading-relaxed px-4 py-3 max-h-96 overflow-auto whitespace-pre-wrap font-mono bg-[#FAFAF8] border-t border-[#e4e4dd]">
                {digestResult.proposalMarkdown}
              </pre>
            </details>

            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={handleCopyProposal}
                className="text-[10px] font-bold bg-[#0a0a0a] text-white px-3 py-1.5 rounded-lg hover:bg-[#0a0a0a]/80 transition-colors"
              >
                {proposalCopied ? "✓ Copiado" : "Copiar markdown"}
              </button>
              <button
                onClick={handleDownloadProposal}
                className="text-[10px] font-bold border border-[#e4e4dd] text-[#0a0a0a] px-3 py-1.5 rounded-lg hover:border-[#0a0a0a]/30 transition-colors"
              >
                Descargar .md
              </button>
              <p className="text-[9px] text-[#0a0a0a]/35 ml-auto">
                Próximo paso: el agente revisa y pushea Source + Evidence + KAs a Notion
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
