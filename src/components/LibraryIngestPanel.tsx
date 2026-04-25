"use client";

import { useState, useRef } from "react";
import type {
  DigestProposal,
  ProposalAnswers,
  ProposalQuestion,
} from "@/types/digest-proposal";

const FULL_DIGEST_EXTS = [".pdf", ".docx", ".pptx"];
// Vercel serverless body cap is ~4.5 MB. Anything bigger goes through
// /api/ingest-library/upload-url (signed-URL → Supabase) instead of multipart.
const LARGE_FILE_THRESHOLD = 4 * 1024 * 1024;

function isFullDigestAllowed(file: File | null): file is File {
  if (!file) return false;
  const lower = file.name.toLowerCase();
  return FULL_DIGEST_EXTS.some((ext) => lower.endsWith(ext));
}

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
  proposal: DigestProposal;
  proposalMarkdown: string;
  proposalLengthChars: number;
  modelUsed: string;
  inputTokens: number;
  cachedTokens: number;
  outputTokens: number;
  fileName: string;
  fileSize: number;
  storagePath: string | null;
};

type PushStatus = "idle" | "pushing" | "done" | "error";

function QuestionInput({
  question,
  value,
  onChange,
}: {
  question: ProposalQuestion;
  value: string | boolean | undefined;
  onChange: (v: string | boolean) => void;
}) {
  const required = question.required !== false;
  const labelEl = (
    <div className="flex flex-col gap-0.5 mb-2">
      <p className="text-[11px] font-bold text-[#0a0a0a] leading-snug">
        {question.question}
        {required && <span className="text-red-500 ml-1">*</span>}
      </p>
      {question.affects && (
        <p className="text-[9px] text-[#0a0a0a]/40 italic">Afecta: {question.affects}</p>
      )}
      {question.hint && (
        <p className="text-[9px] text-[#0a0a0a]/40">{question.hint}</p>
      )}
    </div>
  );

  if (question.type === "single_choice" && question.options && question.options.length > 0) {
    return (
      <div>
        {labelEl}
        <div className="flex flex-col gap-1.5">
          {question.options.map((opt) => (
            <label
              key={opt}
              className={`flex items-start gap-2 px-3 py-2 rounded-md border cursor-pointer transition-colors text-[10.5px] leading-snug ${
                value === opt
                  ? "border-[#0a0a0a] bg-[#0a0a0a]/5"
                  : "border-[#e4e4dd] hover:border-[#0a0a0a]/30"
              }`}
            >
              <input
                type="radio"
                name={question.id}
                value={opt}
                checked={value === opt}
                onChange={(e) => onChange(e.target.value)}
                className="mt-0.5 accent-[#0a0a0a]"
              />
              <span className="text-[#0a0a0a]/85">{opt}</span>
            </label>
          ))}
        </div>
      </div>
    );
  }

  if (question.type === "boolean") {
    const v = typeof value === "boolean" ? value : value === "true";
    return (
      <div>
        {labelEl}
        <label className="flex items-center gap-2 px-3 py-2 rounded-md border border-[#e4e4dd] cursor-pointer text-[10.5px]">
          <input
            type="checkbox"
            checked={v}
            onChange={(e) => onChange(e.target.checked)}
            className="accent-[#0a0a0a]"
          />
          <span className="text-[#0a0a0a]/85">Sí</span>
        </label>
      </div>
    );
  }

  if (question.type === "date") {
    return (
      <div>
        {labelEl}
        <input
          type="date"
          value={typeof value === "string" ? value : ""}
          onChange={(e) => onChange(e.target.value)}
          className="w-full px-3 py-2 rounded-md border border-[#e4e4dd] text-[10.5px] focus:outline-none focus:border-[#0a0a0a]/40"
        />
      </div>
    );
  }

  // text fallback
  return (
    <div>
      {labelEl}
      <textarea
        value={typeof value === "string" ? value : ""}
        onChange={(e) => onChange(e.target.value)}
        rows={2}
        className="w-full px-3 py-2 rounded-md border border-[#e4e4dd] text-[10.5px] focus:outline-none focus:border-[#0a0a0a]/40 resize-y"
        placeholder="Tu respuesta..."
      />
    </div>
  );
}

export function LibraryIngestPanel() {
  const [digestMode, setDigestMode] = useState<"quick" | "full">("quick");
  const [mode, setMode] = useState<"paste" | "upload">("paste");
  const [text, setText] = useState("");
  const [source, setSource] = useState("");
  const [scopeHintsText, setScopeHintsText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<"idle" | "processing" | "done" | "error">("idle");
  const [uploadPhase, setUploadPhase] = useState<"" | "uploading" | "digesting">("");
  const [quickResult, setQuickResult] = useState<QuickResult | null>(null);
  const [digestResult, setDigestResult] = useState<DigestResult | null>(null);
  const [error, setError] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [proposalCopied, setProposalCopied] = useState(false);
  const [answers, setAnswers] = useState<ProposalAnswers>({});
  const [pushStatus, setPushStatus] = useState<PushStatus>("idle");
  const [pushError, setPushError] = useState("");
  const [pushResult, setPushResult] = useState<{
    sourceUrl?: string;
    evidenceCount?: number;
    kaCount?: number;
    linkedOrgs?: { name: string; id: string }[];
  } | null>(null);
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
    setAnswers({});
    setPushStatus("idle");
    setPushError("");
    setPushResult(null);
  }

  function seedAnswersFromProposal(proposal: DigestProposal): ProposalAnswers {
    const seeded: ProposalAnswers = {};
    for (const q of proposal.questions ?? []) {
      if (q.default_value !== undefined) {
        seeded[q.id] = q.default_value;
      } else if (q.type === "boolean") {
        seeded[q.id] = false;
      }
    }
    return seeded;
  }

  function isPushReady(proposal: DigestProposal | undefined, current: ProposalAnswers): boolean {
    if (!proposal) return false;
    for (const q of proposal.questions ?? []) {
      if (q.required === false) continue;
      const v = current[q.id];
      if (v === undefined || v === null || v === "") return false;
    }
    return true;
  }

  function pendingRefinements(
    proposal: DigestProposal | undefined,
    current: ProposalAnswers,
  ): ProposalQuestion[] {
    if (!proposal) return [];
    return (proposal.questions ?? []).filter((q) => {
      if (!q.triggers_refinement) return false;
      const v = current[q.id];
      return v !== undefined && v !== null && v !== "";
    });
  }

  async function handleRefine() {
    if (!digestResult || !digestResult.storagePath) return;
    const refinements = pendingRefinements(digestResult.proposal, answers);
    if (refinements.length === 0) return;

    setStatus("processing");
    setUploadPhase("digesting");
    setError("");

    // Build refinement context out of the answered triggers_refinement questions.
    const refinementContext = refinements.map((q) => ({
      directive: q.question,
      answer: String(answers[q.id]),
      affects: q.affects,
    }));

    // Merge into scopeHints so the drafter sees this as part of the user's intent.
    let baseHints: Record<string, unknown> = {};
    if (scopeHintsText.trim()) {
      try {
        baseHints = JSON.parse(scopeHintsText.trim());
      } catch {
        baseHints = { ch_relevance: scopeHintsText.trim() };
      }
    }
    const mergedHints = {
      ...baseHints,
      _refinement_round: 1,
      _previous_proposal_summary: {
        evidence_count: digestResult.proposal?.evidence?.length ?? 0,
        ka_count: digestResult.proposal?.knowledge_assets?.length ?? 0,
      },
      _user_refinement_directives: refinementContext,
    };

    try {
      const res = await fetch("/api/ingest-library/digest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          storagePath: digestResult.storagePath,
          fileName: digestResult.fileName,
          source: source || undefined,
          scopeHints: mergedHints,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Re-extract failed");
      setDigestResult(data as DigestResult);
      if ((data as DigestResult).proposal) {
        setAnswers(seedAnswersFromProposal((data as DigestResult).proposal));
      }
      setStatus("done");
      setUploadPhase("");
      // Reset push state since we have a fresh proposal
      setPushStatus("idle");
      setPushError("");
      setPushResult(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Re-extract failed");
      setStatus("error");
      setUploadPhase("");
    }
  }

  async function handlePushToNotion() {
    if (!digestResult) return;
    setPushStatus("pushing");
    setPushError("");
    setPushResult(null);
    try {
      const res = await fetch("/api/ingest-library/digest/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          proposal: digestResult.proposal,
          answers,
          storagePath: digestResult.storagePath,
          pipelineMeta: {
            model: digestResult.modelUsed,
            inputTokens: digestResult.inputTokens,
            outputTokens: digestResult.outputTokens,
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setPushResult({
        sourceUrl: data.sourceUrl,
        evidenceCount: data.evidenceCount,
        kaCount: data.kaCount,
        linkedOrgs: data.linkedOrgs ?? [],
      });
      setPushStatus("done");
    } catch (err) {
      setPushError(err instanceof Error ? err.message : "Push failed");
      setPushStatus("error");
    }
  }

  function setDigestModeAndReset(m: "quick" | "full") {
    setDigestMode(m);
    if (m === "full") setMode("upload");
    reset();
  }

  async function handleIngest() {
    if (digestMode === "full") {
      if (!isFullDigestAllowed(file)) return;
      setStatus("processing");
      setQuickResult(null);
      setDigestResult(null);
      setError("");

      // Build scopeHints JSON once (reused in both paths)
      let scopeJson: string | null = null;
      if (scopeHintsText.trim()) {
        const raw = scopeHintsText.trim();
        try {
          JSON.parse(raw);
          scopeJson = raw;
        } catch {
          scopeJson = JSON.stringify({ ch_relevance: raw });
        }
      }

      try {
        let data: DigestResult & { ok: boolean; error?: string };

        if (file.size > LARGE_FILE_THRESHOLD) {
          // Path 2 — direct-to-Supabase via signed upload URL (bypasses Vercel 4.5 MB cap)
          setUploadPhase("uploading");
          const urlRes = await fetch("/api/ingest-library/upload-url", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ fileName: file.name }),
          });
          const urlData = await urlRes.json();
          if (!urlRes.ok || !urlData.ok) {
            throw new Error(urlData.error ?? "Failed to get upload URL");
          }

          const putRes = await fetch(urlData.signedUrl, {
            method: "PUT",
            body: file,
            headers: {
              "Content-Type": file.type || "application/octet-stream",
            },
          });
          if (!putRes.ok) {
            throw new Error(`Supabase upload failed (${putRes.status})`);
          }

          setUploadPhase("digesting");
          const digestRes = await fetch("/api/ingest-library/digest", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              storagePath: urlData.storagePath,
              fileName: file.name,
              source: source || undefined,
              scopeHints: scopeJson ? JSON.parse(scopeJson) : undefined,
            }),
          });
          data = await digestRes.json();
          if (!digestRes.ok || !data.ok) throw new Error(data.error ?? "Unknown error");
        } else {
          // Path 1 — small files via multipart
          setUploadPhase("digesting");
          const fd = new FormData();
          fd.append("file", file);
          if (source) fd.append("source", source);
          if (scopeJson) fd.append("scopeHints", scopeJson);
          const res = await fetch("/api/ingest-library/digest", { method: "POST", body: fd });
          data = await res.json();
          if (!res.ok || !data.ok) throw new Error(data.error ?? "Unknown error");
        }

        setDigestResult(data as DigestResult);
        if ((data as DigestResult).proposal) {
          setAnswers(seedAnswersFromProposal((data as DigestResult).proposal));
        }
        setStatus("done");
        setUploadPhase("");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error");
        setStatus("error");
        setUploadPhase("");
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
      ? isFullDigestAllowed(file)
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
              Subí un documento estratégico (PDF, DOCX o PPTX). El sistema genera una <strong>propuesta de digestion completa</strong> (Source + ~50 Evidence + 6-8 Knowledge Assets). El push final a Notion lo hace el agente después de tu review. ~30 segundos. Para DOCX/PPTX: extraemos sólo texto (layout, slides, charts no llegan al modelo).
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
              accept={isFull ? ".pdf,.docx,.pptx" : ".pdf,.txt,.md,.docx,.csv"}
              className="hidden"
              onChange={e => setFile(e.target.files?.[0] ?? null)}
            />
            {file ? (
              <div>
                <p className="text-sm font-bold text-[#0a0a0a]">{file.name}</p>
                <p className="text-[10px] text-[#0a0a0a]/35 mt-1">
                  {(file.size / 1024).toFixed(0)} KB · {file.type || "unknown type"}
                </p>
                {isFull && !isFullDigestAllowed(file) && (
                  <p className="text-[10px] text-red-500 mt-1 font-bold">Full Digest acepta PDF, DOCX o PPTX</p>
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
                  {isFull ? "PDF, DOCX, PPTX · máx 50 MB" : "PDF, TXT, MD, DOCX, CSV · máx 50 MB"}
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
              ? uploadPhase === "uploading"
                ? `Subiendo archivo a Supabase... (${file ? (file.size / 1024 / 1024).toFixed(1) : "?"} MB)`
                : "Generando propuesta de digestion... (~30s)"
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
        {digestResult && isFull && status !== "processing" && (
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

            {/* Proposal contents summary */}
            {digestResult.proposal && (
              <div className="flex items-center gap-3 text-[10px] text-[#0a0a0a]/60 flex-wrap">
                <span>
                  <strong className="text-[#0a0a0a]">{digestResult.proposal.evidence?.length ?? 0}</strong> Evidence
                </span>
                <span>·</span>
                <span>
                  <strong className="text-[#0a0a0a]">{digestResult.proposal.knowledge_assets?.length ?? 0}</strong> Knowledge Assets
                </span>
                <span>·</span>
                <span>
                  <strong className="text-[#0a0a0a]">{digestResult.proposal.questions?.length ?? 0}</strong> preguntas pendientes
                </span>
              </div>
            )}

            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={handleCopyProposal}
                className="text-[10px] font-bold bg-[#0a0a0a]/10 text-[#0a0a0a] px-3 py-1.5 rounded-lg hover:bg-[#0a0a0a]/15 transition-colors"
              >
                {proposalCopied ? "✓ Copiado" : "Copiar markdown"}
              </button>
              <button
                onClick={handleDownloadProposal}
                className="text-[10px] font-bold border border-[#e4e4dd] text-[#0a0a0a] px-3 py-1.5 rounded-lg hover:border-[#0a0a0a]/30 transition-colors"
              >
                Descargar .md
              </button>
            </div>

            {/* Questions form */}
            {digestResult.proposal?.questions && digestResult.proposal.questions.length > 0 && pushStatus !== "done" && (
              <div className="bg-white border border-[#e4e4dd] rounded-lg px-4 py-4 flex flex-col gap-4">
                <div>
                  <p className="text-[8px] font-bold tracking-[2px] uppercase text-[#0a0a0a]/30 mb-1">Open questions</p>
                  <p className="text-[10px] text-[#0a0a0a]/60 leading-relaxed">
                    Respondé antes de pushear a Notion. Estas respuestas afectan campos del Source / Evidence / KAs.
                  </p>
                </div>
                {digestResult.proposal.questions.map((q: ProposalQuestion) => (
                  <QuestionInput
                    key={q.id}
                    question={q}
                    value={answers[q.id]}
                    onChange={(v) => setAnswers((prev) => ({ ...prev, [q.id]: v }))}
                  />
                ))}
              </div>
            )}

            {/* Push to Notion + Re-extract */}
            {pushStatus !== "done" && (
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    onClick={handlePushToNotion}
                    disabled={pushStatus === "pushing" || !isPushReady(digestResult.proposal, answers)}
                    className={`text-[11px] font-bold px-4 py-2 rounded-lg transition-all ${
                      pushStatus === "pushing"
                        ? "bg-[#0a0a0a]/40 text-white cursor-not-allowed"
                        : isPushReady(digestResult.proposal, answers)
                        ? "bg-[#c6f24a] text-[#0a0a0a] hover:bg-[#b8e636]"
                        : "bg-[#e4e4dd] text-[#0a0a0a]/30 cursor-not-allowed"
                    }`}
                  >
                    {pushStatus === "pushing"
                      ? "Pusheando a Notion... (~30-60s)"
                      : isPushReady(digestResult.proposal, answers)
                      ? "Pushear Source + Evidence + KAs a Notion →"
                      : "Respondé las preguntas para activar"}
                  </button>
                  {/* Re-extract button — shows when an answered question requires regenerating evidence */}
                  {pendingRefinements(digestResult.proposal, answers).length > 0 && digestResult.storagePath && (
                    <button
                      onClick={handleRefine}
                      disabled={pushStatus === "pushing"}
                      className="text-[11px] font-bold px-4 py-2 rounded-lg border border-[#0a0a0a] text-[#0a0a0a] hover:bg-[#0a0a0a]/5 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                      title="Re-corre Phase B con tus respuestas como contexto adicional. Genera nueva propuesta con Evidence/KAs ajustados."
                    >
                      Re-extract con respuestas ({pendingRefinements(digestResult.proposal, answers).length}) ↻
                    </button>
                  )}
                </div>
                {pushStatus === "error" && (
                  <span className="text-[10px] font-bold text-red-600">Error: {pushError}</span>
                )}
                {status === "error" && error && (
                  <span className="text-[10px] font-bold text-red-600">Error: {error}</span>
                )}
              </div>
            )}

            {/* Push success card */}
            {pushStatus === "done" && (
              <div className="bg-[#c6f24a]/20 border border-[#c6f24a] rounded-lg px-4 py-3 flex flex-col gap-2">
                <p className="text-[11px] font-bold text-[#0a0a0a]">✓ Pusheado a Notion</p>
                <div className="flex items-center gap-3 text-[10px] text-[#0a0a0a]/70 flex-wrap">
                  <span>
                    <strong>{pushResult?.evidenceCount ?? 0}</strong> Evidence
                  </span>
                  <span>·</span>
                  <span>
                    <strong>{pushResult?.kaCount ?? 0}</strong> KAs
                  </span>
                  {(pushResult?.linkedOrgs?.length ?? 0) > 0 && (
                    <>
                      <span>·</span>
                      <span>
                        <strong>{pushResult?.linkedOrgs?.length}</strong> Orgs linkeadas
                      </span>
                    </>
                  )}
                  {pushResult?.sourceUrl && (
                    <>
                      <span>·</span>
                      <a
                        href={pushResult.sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline hover:text-[#0a0a0a] font-bold"
                      >
                        Ver Source en Notion ↗
                      </a>
                    </>
                  )}
                </div>
                {(pushResult?.linkedOrgs?.length ?? 0) > 0 && (
                  <p className="text-[9px] text-[#0a0a0a]/50">
                    Linked: {pushResult?.linkedOrgs?.map((o) => o.name).join(", ")}
                  </p>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
