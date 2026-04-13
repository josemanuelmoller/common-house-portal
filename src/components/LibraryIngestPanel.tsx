"use client";

import { useState, useRef } from "react";

type Result = {
  title: string;
  assetType: string;
  tags: string[];
  summary: string;
  notionId: string;
};

export function LibraryIngestPanel() {
  const [mode, setMode] = useState<"paste" | "upload">("paste");
  const [text, setText] = useState("");
  const [source, setSource] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<"idle" | "processing" | "done" | "error">("idle");
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleIngest() {
    if (mode === "paste" && !text.trim()) return;
    if (mode === "upload" && !file) return;
    setStatus("processing");
    setResult(null);
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
      setResult(data);
      setStatus("done");
      setText("");
      setFile(null);
      setSource("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
      setStatus("error");
    }
  }

  const canSubmit = status !== "processing" &&
    (mode === "paste" ? text.trim().length > 0 : file !== null);

  return (
    <div className="bg-white rounded-2xl border border-[#E0E0D8] overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-[#E0E0D8] flex items-center justify-between">
        <div>
          <p className="text-[8px] font-bold tracking-[2px] uppercase text-[#131218]/30 mb-0.5">Library Ingest</p>
          <p className="text-sm font-bold text-[#131218]">Añadir conocimiento</p>
        </div>
        <div className="flex gap-1.5">
          {(["paste", "upload"] as const).map(m => (
            <button
              key={m}
              onClick={() => { setMode(m); setFile(null); setText(""); }}
              className={`text-[10px] font-bold px-3 py-1.5 rounded-lg border transition-all ${
                mode === m
                  ? "bg-[#131218] text-white border-[#131218]"
                  : "border-[#E0E0D8] text-[#131218]/40 hover:text-[#131218] hover:border-[#131218]/30"
              }`}
            >
              {m === "paste" ? "Pegar texto" : "Subir archivo"}
            </button>
          ))}
        </div>
      </div>

      <div className="px-6 py-5 flex flex-col gap-3">

        {/* Input */}
        {mode === "paste" ? (
          <textarea
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder="Pega aquí un artículo, reporte, extracto, regulación, análisis... Claude lo clasificará y creará el Knowledge Asset."
            className="w-full h-36 border border-[#E0E0D8] rounded-xl px-4 py-3 text-sm text-[#131218] bg-[#FAFAF8] resize-none outline-none focus:border-[#131218]/30 placeholder-[#131218]/20 leading-relaxed"
          />
        ) : (
          <div
            onClick={() => fileRef.current?.click()}
            className="border-2 border-dashed border-[#E0E0D8] rounded-xl px-6 py-8 text-center cursor-pointer hover:border-[#131218]/30 hover:bg-[#FAFAF8] transition-all"
          >
            <input
              ref={fileRef}
              type="file"
              accept=".pdf,.txt,.md,.docx,.csv"
              className="hidden"
              onChange={e => setFile(e.target.files?.[0] ?? null)}
            />
            {file ? (
              <div>
                <p className="text-sm font-bold text-[#131218]">{file.name}</p>
                <p className="text-[10px] text-[#131218]/35 mt-1">
                  {(file.size / 1024).toFixed(0)} KB · {file.type || "unknown type"}
                </p>
                <button
                  onClick={e => { e.stopPropagation(); setFile(null); }}
                  className="mt-2 text-[9px] font-bold text-[#131218]/30 hover:text-red-500 transition-colors"
                >
                  Quitar
                </button>
              </div>
            ) : (
              <>
                <p className="text-2xl mb-2 text-[#131218]/20">↑</p>
                <p className="text-sm font-semibold text-[#131218]/50">Subir archivo</p>
                <p className="text-[10px] text-[#131218]/25 mt-1">PDF, TXT, MD, DOCX, CSV</p>
              </>
            )}
          </div>
        )}

        {/* Source / attribution */}
        <input
          value={source}
          onChange={e => setSource(e.target.value)}
          placeholder="Fuente / URL / referencia (opcional)"
          className="w-full border border-[#E0E0D8] rounded-lg px-4 py-2.5 text-xs text-[#131218] bg-[#FAFAF8] outline-none focus:border-[#131218]/30 placeholder-[#131218]/20"
        />

        {/* Submit */}
        <button
          onClick={handleIngest}
          disabled={!canSubmit}
          className={`w-full text-xs font-bold py-3 rounded-xl transition-all ${
            status === "processing"
              ? "bg-[#131218]/40 text-white cursor-not-allowed"
              : status === "done"
              ? "bg-[#B2FF59] text-[#131218]"
              : status === "error"
              ? "bg-red-100 text-red-700"
              : canSubmit
              ? "bg-[#131218] text-white hover:bg-[#131218]/80"
              : "bg-[#E0E0D8] text-[#131218]/30 cursor-not-allowed"
          }`}
        >
          {status === "processing"
            ? "Procesando con Claude... (~20s)"
            : status === "done"
            ? "✓ Añadido como Draft en Knowledge Assets"
            : status === "error"
            ? `Error: ${error}`
            : "Procesar y clasificar →"}
        </button>

        {/* Result card */}
        {status === "done" && result && (
          <div className="bg-[#FAFAF8] border border-[#E0E0D8] rounded-xl px-4 py-4">
            <div className="flex items-start justify-between gap-3 mb-2">
              <p className="text-[11px] font-bold text-[#131218] leading-snug flex-1">{result.title}</p>
              <span className="text-[9px] font-bold bg-[#EFEFEA] text-[#131218]/50 px-2 py-0.5 rounded-full shrink-0">
                {result.assetType}
              </span>
            </div>
            <p className="text-[10px] text-[#131218]/50 leading-relaxed mb-2">{result.summary}</p>
            <div className="flex flex-wrap gap-1">
              {result.tags.map(t => (
                <span key={t} className="text-[8px] font-semibold bg-[#131218]/5 text-[#131218]/40 px-2 py-0.5 rounded-full">
                  {t}
                </span>
              ))}
            </div>
            <p className="text-[8px] text-[#131218]/20 mt-2">Draft creado en Notion · revisar antes de publicar</p>
          </div>
        )}

      </div>
    </div>
  );
}
