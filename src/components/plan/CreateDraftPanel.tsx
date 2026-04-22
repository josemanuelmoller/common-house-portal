"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { EligibleObjectiveForV1 } from "@/lib/plan";

const TIER_PILL: Record<string, string> = {
  high: "bg-[#B2FF59] text-[#131218]",
  mid: "bg-[#FFC773] text-[#131218]",
  low: "bg-[#E0E0D8] text-[#6B6B60]",
};

export function CreateDraftPanel({
  objectives,
}: {
  objectives: EligibleObjectiveForV1[];
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<string>("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<{
    stage: string;
    chars?: number;
    tokens?: number;
  } | null>(null);

  const chosen = objectives.find((o) => o.id === selected) ?? null;
  const eligible =
    chosen !== null && chosen.has_description === true && !pending;

  async function generate() {
    if (!chosen || !eligible) return;
    setPending(true);
    setError(null);
    setProgress({ stage: "connecting" });

    try {
      const res = await fetch(
        `/api/plan/objectives/${chosen.id}/generate-v1`,
        { method: "POST" }
      );
      if (!res.ok || !res.body) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop() ?? "";

        for (const raw of parts) {
          if (!raw.trim()) continue;
          const lines = raw.split("\n");
          const eventLine = lines.find((l) => l.startsWith("event: "));
          const dataLine = lines.find((l) => l.startsWith("data: "));
          if (!eventLine || !dataLine) continue;
          const event = eventLine.slice(7).trim();
          let data: Record<string, unknown>;
          try {
            data = JSON.parse(dataLine.slice(6));
          } catch {
            continue;
          }

          switch (event) {
            case "start":
              setProgress({ stage: "generating" });
              break;
            case "token":
              setProgress({
                stage: "generating",
                chars: typeof data.chars === "number" ? data.chars : undefined,
              });
              break;
            case "parsing":
              setProgress({
                stage: "parsing",
                chars: typeof data.total_chars === "number" ? data.total_chars : undefined,
                tokens: typeof data.tokens === "number" ? data.tokens : undefined,
              });
              break;
            case "saving":
              setProgress({
                stage:
                  typeof data.stage === "string" ? `saving:${data.stage}` : "saving",
              });
              break;
            case "done":
              setProgress(null);
              setSelected("");
              router.refresh();
              break;
            case "error":
              throw new Error(
                (typeof data.error === "string" ? data.error : "v1 generation failed") +
                  (data.detail ? ` — ${data.detail}` : "")
              );
          }
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setPending(false);
      setProgress(null);
    }
  }

  if (objectives.length === 0) {
    return null;
  }

  return (
    <div className="bg-white rounded-2xl border border-[#E0E0D8] p-5 mb-5">
      <div className="flex items-start justify-between gap-6">
        <div className="flex-1 min-w-0">
          <h2 className="text-[14px] font-bold text-[#131218] mb-1">
            Create new draft
          </h2>
          <p className="text-[11px] text-[#6B6B60] leading-relaxed">
            Elegí un objetivo activo sin artifact para que el agente produzca v1.
            El agente escribe el primer draft estructurado, crea la carpeta en
            Drive, y surfacea 6-10 preguntas foundational para que las respondas
            y regenere v2.
          </p>
        </div>
        <span className="text-[10px] font-bold text-[#6B6B60] uppercase tracking-wider whitespace-nowrap">
          {objectives.length} eligible
        </span>
      </div>

      <div className="flex gap-3 mt-4 items-stretch">
        <select
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
          disabled={pending}
          className="flex-1 text-[12px] border border-[#E0E0D8] rounded-md px-3 py-2 bg-white focus:outline-none focus:border-[#131218] disabled:opacity-50"
        >
          <option value="">— Seleccionar objetivo —</option>
          {objectives.map((o) => {
            const q = o.quarter ? `${o.year}-Q${o.quarter}` : `${o.year}`;
            const desc = o.has_description ? "" : " · ⚠ sin description";
            return (
              <option key={o.id} value={o.id}>
                [{o.tier.toUpperCase()}] {q} · {o.area} · {o.objective_type} — {o.title}
                {desc}
              </option>
            );
          })}
        </select>

        <button
          onClick={generate}
          disabled={!eligible}
          className="text-[11px] font-bold text-[#131218] bg-[#B2FF59] hover:bg-[#a3ef50] disabled:opacity-30 disabled:cursor-not-allowed px-4 py-2 rounded-md whitespace-nowrap"
          title={
            chosen && !chosen.has_description
              ? "Este objetivo no tiene description — agrégasela antes de generar v1"
              : undefined
          }
        >
          {pending ? "Working…" : "Generate v1"}
        </button>
      </div>

      {chosen && (
        <div className="mt-3 flex items-center gap-2">
          <span
            className={`text-[8px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${TIER_PILL[chosen.tier]}`}
          >
            {chosen.tier}
          </span>
          {chosen.has_description ? (
            <p className="text-[11px] text-[#6B6B60] italic truncate">
              {chosen.description}
            </p>
          ) : (
            <p className="text-[11px] text-[#C62828] font-semibold">
              ⚠ Sin description. El agente no podría grounding el draft —
              agregá 1-2 líneas en /admin/plan antes de generar v1.
            </p>
          )}
        </div>
      )}

      {progress && (
        <div className="mt-3 text-[10px] font-mono text-[#1F5200] bg-[#B2FF59]/20 rounded-md px-3 py-2">
          {progress.stage === "connecting" && "◉ connecting to agent…"}
          {progress.stage === "generating" && (
            <>
              ◉ generating
              {typeof progress.chars === "number" &&
                ` · ${progress.chars.toLocaleString()} chars`}
            </>
          )}
          {progress.stage === "parsing" && (
            <>
              ◉ parsing
              {typeof progress.tokens === "number" &&
                ` · ${progress.tokens.toLocaleString()} tokens`}
            </>
          )}
          {progress.stage.startsWith("saving") && (
            <>◉ saving {progress.stage.split(":")[1] ?? ""}</>
          )}
        </div>
      )}

      {error && (
        <p className="mt-3 text-[11px] text-[#C62828] leading-relaxed">{error}</p>
      )}
    </div>
  );
}
