"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";

type IngestResult = {
  ok: boolean;
  case_code?: string;
  source_file_url?: string;
  insights_extracted?: number;
  evidence_ids?: string[];
  curator_summary?: {
    total?: number;
    applied_append?: number;
    proposed_amend?: number;
    proposed_split?: number;
    ignored?: number;
  };
  error?: string;
};

const CASE_TYPES = [
  { value: "DOC", label: "Reference doc" },
  { value: "PRJ", label: "Project instance" },
  { value: "REG", label: "Regulation" },
  { value: "STD", label: "Standard" },
  { value: "BCH", label: "Benchmark / dataset" },
  { value: "BOK", label: "Book" },
  { value: "NEW", label: "News / article" },
  { value: "ITV", label: "Interview" },
  { value: "INT", label: "Internal CH" },
];

const TYPE_EXAMPLE: Record<string, string> = {
  DOC: "EMF · UK · 2023",
  PRJ: "ALGRAMO · CL · 2020",
  REG: "EPR · UK · 2024",
  STD: "BPI · US · 2023",
  BCH: "IDEMAT · INT · 2022",
  BOK: "RAWORTH · UK · 2017",
  NEW: "FASTCO · US · 2024",
  ITV: "BOCKEN · NL · 2024",
  INT: "CH · UK · 2024",
};

export function KnowledgeIngestForm() {
  const router = useRouter();
  const [mode, setMode] = useState<"file" | "text" | "url">("file");
  const [file, setFile] = useState<File | null>(null);
  const [text, setText] = useState("");
  const [url, setUrl] = useState("");
  const [caseType, setCaseType] = useState("DOC");
  const [identifier, setIdentifier] = useState("");
  const [scope, setScope] = useState("");
  const [year, setYear] = useState<string>(new Date().getFullYear().toString());
  const [title, setTitle] = useState("");
  const [status, setStatus] = useState<"idle" | "processing" | "done" | "error">("idle");
  const [result, setResult] = useState<IngestResult | null>(null);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const inputOk =
    (mode === "file" && file) ||
    (mode === "text" && text.trim().length > 50) ||
    (mode === "url" && /^https?:\/\//.test(url.trim()));
  const metadataOk = identifier.trim().length >= 2 && /^\d{4}$/.test(year);
  const canSubmit = inputOk && metadataOk && status !== "processing";

  async function handleSubmit() {
    if (!canSubmit) return;
    setStatus("processing");
    setResult(null);
    setError("");
    try {
      const fd = new FormData();
      fd.append("case_type", caseType);
      fd.append("case_identifier", identifier);
      if (scope) fd.append("case_scope", scope);
      fd.append("case_year", year);
      if (title) fd.append("case_title", title);
      if (mode === "file" && file) fd.append("file", file);
      if (mode === "text") fd.append("text", text);
      if (mode === "url") fd.append("url", url);

      const res = await fetch("/api/library/ingest-to-tree", {
        method: "POST",
        body: fd,
      });
      const payload: IngestResult = await res.json();
      if (!res.ok) {
        setStatus("error");
        setError(payload.error ?? `HTTP ${res.status}`);
        return;
      }
      setStatus("done");
      setResult(payload);
      router.refresh();
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  function reset() {
    setStatus("idle");
    setResult(null);
    setError("");
    setFile(null);
    setText("");
    setUrl("");
    setIdentifier("");
    setTitle("");
    if (fileRef.current) fileRef.current.value = "";
  }

  return (
    <div className="bg-white rounded-[14px] border border-[#E0E0D8] overflow-hidden">
      <div className="h-1 bg-[#B2FF59]" />
      <div className="px-6 py-4 border-b border-[#EFEFEA]">
        <h2 className="text-sm font-bold text-[#131218] tracking-tight">Add external knowledge</h2>
        <p className="text-xs text-[#131218]/40 mt-0.5 leading-relaxed max-w-[620px]">
          Sube un PDF / Word, pega texto, o pega URL. El extractor saca insights atómicos, les asigna case code, y el curator los rutea al leaf correcto del árbol.
        </p>
      </div>

      {status === "done" && result ? (
        <div className="p-6 space-y-4">
          <div className="rounded-[14px] border border-[#B2FF59] bg-[#B2FF59]/10 p-5">
            <p className="text-[10px] font-bold text-[#131218] uppercase tracking-widest">✓ Ingested</p>
            <p className="text-[22px] font-semibold text-[#131218] tracking-tight mt-1">
              {result.insights_extracted} insights extracted
            </p>
            <p className="text-[10px] font-mono font-bold text-[#131218]/70 mt-2">
              {result.case_code}
            </p>
            {result.curator_summary && (
              <div className="mt-4 grid grid-cols-4 gap-3">
                <Stat label="Appended" value={result.curator_summary.applied_append ?? 0} />
                <Stat label="Amend proposed" value={result.curator_summary.proposed_amend ?? 0} />
                <Stat label="Split proposed" value={result.curator_summary.proposed_split ?? 0} />
                <Stat label="Ignored" value={result.curator_summary.ignored ?? 0} />
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button onClick={reset} className="text-[11px] font-bold uppercase tracking-widest bg-[#131218] text-white px-3 py-2 rounded-full hover:bg-[#131218]/80 transition-colors">
              Add another
            </button>
            {result.case_code && (
              <a href={`/admin/knowledge/cases/${encodeURIComponent(result.case_code)}`}
                 className="text-[11px] font-bold uppercase tracking-widest bg-white border border-[#E0E0D8] text-[#131218]/70 hover:text-[#131218] px-3 py-2 rounded-full transition-colors">
                → View case
              </a>
            )}
          </div>
        </div>
      ) : (
        <div className="p-6 space-y-5">
          {/* Source selector */}
          <div>
            <p className="text-[10px] font-bold text-[#131218]/50 uppercase tracking-widest mb-2">Source</p>
            <div className="flex gap-2">
              {(["file", "text", "url"] as const).map(m => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  className={`text-[11px] font-bold uppercase tracking-widest px-3 py-2 rounded-full transition-colors ${
                    mode === m
                      ? "bg-[#131218] text-white"
                      : "bg-white border border-[#E0E0D8] text-[#131218]/60 hover:text-[#131218]"
                  }`}
                >
                  {m === "file" ? "📄 File (PDF / Word)" : m === "text" ? "✎ Paste text" : "🔗 URL"}
                </button>
              ))}
            </div>

            <div className="mt-3">
              {mode === "file" && (
                <div>
                  <input
                    ref={fileRef}
                    type="file"
                    accept=".pdf,.docx,.doc,.txt,.md,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
                    onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                    className="block w-full text-sm text-[#131218]/70 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:bg-[#EFEFEA] file:text-[#131218] file:text-[11px] file:font-bold file:uppercase file:tracking-widest hover:file:bg-[#E0E0D8]"
                  />
                  {file && (
                    <p className="text-[11px] text-[#131218]/50 mt-2">
                      {file.name} · {(file.size / 1024).toFixed(1)} KB
                    </p>
                  )}
                </div>
              )}
              {mode === "text" && (
                <textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  rows={8}
                  placeholder="Pega el texto del documento o artículo aquí…"
                  className="w-full text-[13px] text-[#131218] border border-[#E0E0D8] rounded-[14px] px-4 py-3 outline-none focus:border-[#131218]/40 placeholder:text-[#131218]/25 resize-y font-sans"
                />
              )}
              {mode === "url" && (
                <input
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  type="url"
                  placeholder="https://..."
                  className="w-full text-sm text-[#131218] border border-[#E0E0D8] rounded-full px-4 py-2 outline-none focus:border-[#131218]/40 placeholder:text-[#131218]/25"
                />
              )}
            </div>
          </div>

          {/* Case metadata */}
          <div className="pt-3 border-t border-[#EFEFEA]">
            <p className="text-[10px] font-bold text-[#131218]/50 uppercase tracking-widest mb-2">Case code</p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div>
                <label className="text-[9px] font-bold text-[#131218]/40 uppercase tracking-widest block mb-1">Type</label>
                <select
                  value={caseType}
                  onChange={(e) => setCaseType(e.target.value)}
                  className="w-full text-[12px] text-[#131218] border border-[#E0E0D8] rounded-full px-3 py-2 outline-none focus:border-[#131218]/40 bg-white"
                >
                  {CASE_TYPES.map(t => <option key={t.value} value={t.value}>{t.value} — {t.label}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[9px] font-bold text-[#131218]/40 uppercase tracking-widest block mb-1">Identifier</label>
                <input
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value.toUpperCase())}
                  placeholder={TYPE_EXAMPLE[caseType].split(" · ")[0]}
                  className="w-full text-[12px] font-mono text-[#131218] border border-[#E0E0D8] rounded-full px-3 py-2 outline-none focus:border-[#131218]/40 placeholder:text-[#131218]/20 uppercase"
                />
              </div>
              <div>
                <label className="text-[9px] font-bold text-[#131218]/40 uppercase tracking-widest block mb-1">Scope</label>
                <input
                  value={scope}
                  onChange={(e) => setScope(e.target.value.toUpperCase())}
                  placeholder={TYPE_EXAMPLE[caseType].split(" · ")[1]}
                  className="w-full text-[12px] font-mono text-[#131218] border border-[#E0E0D8] rounded-full px-3 py-2 outline-none focus:border-[#131218]/40 placeholder:text-[#131218]/20 uppercase"
                />
              </div>
              <div>
                <label className="text-[9px] font-bold text-[#131218]/40 uppercase tracking-widest block mb-1">Year</label>
                <input
                  value={year}
                  onChange={(e) => setYear(e.target.value)}
                  inputMode="numeric"
                  placeholder={TYPE_EXAMPLE[caseType].split(" · ")[2]}
                  className="w-full text-[12px] font-mono text-[#131218] border border-[#E0E0D8] rounded-full px-3 py-2 outline-none focus:border-[#131218]/40 placeholder:text-[#131218]/20"
                />
              </div>
            </div>
            <div className="mt-3">
              <label className="text-[9px] font-bold text-[#131218]/40 uppercase tracking-widest block mb-1">Title (optional — shown in Cases list)</label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder='ej. "Algramo operational guide"'
                className="w-full text-[12px] text-[#131218] border border-[#E0E0D8] rounded-full px-3 py-2 outline-none focus:border-[#131218]/40 placeholder:text-[#131218]/25"
              />
            </div>
            <p className="text-[11px] font-mono text-[#131218]/30 mt-3">
              Final code: <span className="text-[#131218]/70 font-semibold">{caseType}:{identifier || "?"}-{scope || "X"}-{year || "????"}</span>
            </p>
          </div>

          <div className="flex items-center gap-3 pt-2">
            <button
              onClick={handleSubmit}
              disabled={!canSubmit}
              className="inline-flex items-center gap-2 bg-[#B2FF59] text-[#131218] text-[11px] font-bold uppercase tracking-widest px-4 py-2.5 rounded-full hover:bg-[#9ee84a] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {status === "processing" ? "Procesando…" : "✦ Process + classify"}
            </button>
            {status === "error" && error && (
              <span className="text-[11px] text-red-600 font-medium">Error: {error}</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <p className="text-[22px] font-bold text-[#131218] tracking-tight">{value}</p>
      <p className="text-[9px] font-bold text-[#131218]/30 uppercase tracking-widest mt-0.5">{label}</p>
    </div>
  );
}
