"use client";

import { useState } from "react";

type StyleProfileOption = {
  id: string;
  name: string;
  styleType: string;
  scope: string;
  toneSummary: string;
};

type DeskRequestFormProps = {
  deskType: "design" | "comms" | "commercial";
  deskLabel: string;
  contentTypes: string[];
  channelOrProjectOptions: string[];
  channelOrProjectLabel: string;
  styleProfiles?: StyleProfileOption[];
};

// ─── Voice mode selector (Comms Desk only) ───────────────────────────────────

type VoiceMode = "founder" | "institutional" | "startup";

function CommsVoiceSelector({
  profiles,
  selectedProfileId,
  onChange,
}: {
  profiles: StyleProfileOption[];
  selectedProfileId: string;
  onChange: (id: string) => void;
}) {
  const founderProfiles  = profiles.filter(p => p.scope === "JMM");
  const chProfiles       = profiles.filter(p => p.scope === "Common House");
  const startupProfiles  = profiles.filter(p => p.scope === "Portfolio Startup");

  const activeMode: VoiceMode =
    founderProfiles.some(p => p.id === selectedProfileId) ? "founder" :
    chProfiles.some(p => p.id === selectedProfileId)      ? "institutional" :
    startupProfiles.some(p => p.id === selectedProfileId) ? "startup" :
    "founder";

  function selectMode(mode: VoiceMode) {
    if (mode === "founder" && founderProfiles.length > 0) {
      onChange(founderProfiles[0].id);
    } else if (mode === "institutional" && chProfiles.length > 0) {
      onChange(chProfiles[0].id);
    } else if (mode === "startup" && startupProfiles.length > 0) {
      onChange(startupProfiles[0].id);
    } else {
      onChange("");
    }
  }

  const MODES: { id: VoiceMode; label: string; sublabel: string }[] = [
    { id: "founder",       label: "Founder",       sublabel: "JMM" },
    { id: "institutional", label: "Institucional",  sublabel: "Common House" },
    { id: "startup",       label: "Startup",        sublabel: "Portfolio" },
  ];

  const activeProfile = profiles.find(p => p.id === selectedProfileId);

  return (
    <div>
      <p className="text-[9px] font-bold tracking-[1.5px] uppercase text-[#131218]/30 mb-2">Voz</p>
      <div className="flex gap-2 mb-3">
        {MODES.map(mode => (
          <button
            key={mode.id}
            onClick={() => selectMode(mode.id)}
            className={`flex-1 text-center py-2.5 px-2 rounded-xl border transition-all ${
              activeMode === mode.id
                ? "bg-[#131218] text-white border-[#131218]"
                : "border-[#E0E0D8] text-[#131218]/50 hover:border-[#131218]/30 hover:text-[#131218] bg-white"
            }`}
          >
            <p className={`text-[11px] font-bold ${activeMode === mode.id ? "text-white" : "text-[#131218]"}`}>
              {mode.label}
            </p>
            <p className={`text-[9px] font-medium mt-0.5 ${activeMode === mode.id ? "text-white/50" : "text-[#131218]/30"}`}>
              {mode.sublabel}
            </p>
          </button>
        ))}
      </div>

      {activeMode === "startup" && startupProfiles.length > 1 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {startupProfiles.map(p => (
            <button
              key={p.id}
              onClick={() => onChange(p.id)}
              className={`text-[10px] font-semibold px-3 py-1.5 rounded-full border transition-all ${
                selectedProfileId === p.id
                  ? "bg-[#131218] text-white border-[#131218]"
                  : "border-[#E0E0D8] text-[#131218]/50 hover:border-[#131218]/40"
              }`}
            >
              {p.name.replace(" Brand", "").replace(" Voice", "")}
            </button>
          ))}
        </div>
      )}

      {activeProfile?.toneSummary && (
        <div className="bg-[#FAFAF8] border border-[#E0E0D8] rounded-lg px-3 py-2">
          <p className="text-[9px] text-[#131218]/40 leading-relaxed">
            {activeProfile.toneSummary.slice(0, 120)}{activeProfile.toneSummary.length > 120 ? "…" : ""}
          </p>
        </div>
      )}
    </div>
  );
}

// ─── Canal → Formato map (Comms Desk) ────────────────────────────────────────

const CANAL_FORMAT_MAP: Record<string, string[]> = {
  "LinkedIn":   ["Post corto", "Artículo", "Commentary"],
  "Instagram":  ["Caption", "Carrusel"],
  "Newsletter": ["Bloque", "Intro", "Full Issue"],
  "Web":        ["Artículo", "Blog post"],
};

const CANALES = Object.keys(CANAL_FORMAT_MAP);

// ─── Main form ────────────────────────────────────────────────────────────────

export default function DeskRequestForm({
  deskType,
  deskLabel,
  contentTypes,
  channelOrProjectOptions,
  channelOrProjectLabel,
  styleProfiles = [],
}: DeskRequestFormProps) {
  const [selectedCanal,   setSelectedCanal]   = useState(CANALES[0]);
  const [selectedFormato, setSelectedFormato] = useState(CANAL_FORMAT_MAP[CANALES[0]][0]);

  const [selectedType,   setSelectedType]   = useState(contentTypes[0]);
  const [selectedOption, setSelectedOption] = useState("");

  const [description, setDescription] = useState("");
  const [audience, setAudience] = useState<string>("Inversor");
  const [outputMode, setOutputMode] = useState<"slides" | "document">("slides");
  const [status, setStatus] = useState<"idle" | "loading" | "generating" | "success" | "error">("idle");

  function handleCanalChange(canal: string) {
    setSelectedCanal(canal);
    setSelectedFormato(CANAL_FORMAT_MAP[canal][0]);
  }

  const isVisual = ["Deck", "One-pager", "Proposal", "Offer Deck", "Exec Summary"].includes(selectedType);
  const effectiveOutputMode = selectedType === "One-pager" ? "document" : outputMode;

  const textareaLabel = deskType === "comms" ? "Ángulo / contexto"
    : deskType === "commercial" ? "Scope del cliente"
    : "Descripción";

  const textareaPlaceholder = deskType === "comms"
    ? "Qué queremos decir, a quién y en qué tono..."
    : deskType === "commercial"
    ? "Para quién, qué alcance, entregables clave, presupuesto estimado..."
    : "Qué necesitas, para quién y cuándo...";

  async function handleSubmit() {
    if (!description.trim()) return;
    setStatus("loading");
    try {
      const res = await fetch("/api/desk-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          deskType,
          contentType: deskType === "comms" ? selectedFormato : selectedType,
          description,
          ...(deskType === "comms"
            ? { channel: selectedCanal }
            : { project: selectedOption || "Common House" }),
          audience,
        }),
      });
      if (!res.ok) throw new Error("Request failed");
      const { id: pageId } = await res.json();

      setStatus("generating");
      setDescription("");
      const genRes = await fetch("/api/generate-draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pageId, audience, outputMode: effectiveOutputMode }),
      });
      if (!genRes.ok) throw new Error("Generation failed");

      setStatus("success");
      setTimeout(() => setStatus("idle"), 5000);
    } catch {
      setStatus("error");
      setTimeout(() => setStatus("idle"), 3000);
    }
  }

  return (
    <div className="bg-white border border-[#E0E0D8] rounded-[14px] overflow-hidden flex">

      {/* ── LEFT PANEL: selectors ── */}
      <div className="w-[260px] flex-shrink-0 border-r border-[#E0E0D8] flex flex-col">
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-[#E0E0D8]">
          <p className="text-[8px] font-bold tracking-[2px] uppercase text-[#131218]/30 mb-0.5">Nueva solicitud</p>
          <p className="text-sm font-bold text-[#131218]">{deskLabel}</p>
        </div>

        <div className="px-4 py-4 flex flex-col gap-4 overflow-y-auto">

          {/* Comms: Canal → Formato */}
          {deskType === "comms" ? (
            <>
              <div>
                <p className="text-[9px] font-bold tracking-[1.5px] uppercase text-[#131218]/30 mb-2">Canal</p>
                <div className="flex gap-1.5">
                  {CANALES.map((canal) => (
                    <button
                      key={canal}
                      onClick={() => handleCanalChange(canal)}
                      className={`flex-1 text-center py-2 px-1 rounded-xl border transition-all ${
                        selectedCanal === canal
                          ? "bg-[#131218] text-white border-[#131218]"
                          : "border-[#E0E0D8] text-[#131218]/50 hover:border-[#131218]/30 hover:text-[#131218] bg-white"
                      }`}
                    >
                      <p className={`text-[10px] font-bold ${selectedCanal === canal ? "text-white" : "text-[#131218]"}`}>
                        {canal}
                      </p>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <p className="text-[9px] font-bold tracking-[1.5px] uppercase text-[#131218]/30 mb-2">Formato</p>
                <div className="flex flex-wrap gap-1.5">
                  {(CANAL_FORMAT_MAP[selectedCanal] ?? []).map((fmt) => (
                    <button
                      key={fmt}
                      onClick={() => setSelectedFormato(fmt)}
                      className={`text-[10px] font-semibold px-3 py-1.5 rounded-full border transition-all ${
                        selectedFormato === fmt
                          ? "bg-[#131218] text-white border-[#131218]"
                          : "border-[#E0E0D8] text-[#131218]/50 hover:border-[#131218]/40 hover:text-[#131218]"
                      }`}
                    >
                      {fmt}
                    </button>
                  ))}
                </div>
              </div>

              {/* Voice selector */}
              {styleProfiles.length > 0 && (
                <CommsVoiceSelector profiles={styleProfiles} selectedProfileId="" onChange={() => {}} />
              )}
            </>
          ) : (
            /* Design: Tipo + output mode + audience + project */
            <>
              <div>
                <p className="text-[9px] font-bold tracking-[1.5px] uppercase text-[#131218]/30 mb-2">Tipo</p>
                <div className="flex flex-wrap gap-1.5">
                  {contentTypes.map((t) => (
                    <button
                      key={t}
                      onClick={() => setSelectedType(t)}
                      className={`text-[10px] font-semibold px-3 py-1.5 rounded-full border transition-all ${
                        selectedType === t
                          ? "bg-[#131218] text-white border-[#131218]"
                          : "border-[#E0E0D8] text-[#131218]/50 hover:border-[#131218]/40 hover:text-[#131218]"
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>

              {/* Formato de salida — visual types only, except One-pager */}
              {isVisual && selectedType !== "One-pager" && (
                <div>
                  <p className="text-[9px] font-bold tracking-[1.5px] uppercase text-[#131218]/30 mb-2">Formato de salida</p>
                  <div className="grid grid-cols-2 gap-2">
                    {(["slides", "document"] as const).map((mode) => {
                      const active = outputMode === mode;
                      return (
                        <button key={mode} onClick={() => setOutputMode(mode)}
                          className={`text-left px-3 py-2.5 rounded-xl border transition-all ${
                            active ? "bg-[#131218] border-[#131218] text-white" : "border-[#E0E0D8] text-[#131218]/50 hover:border-[#131218]/30 hover:text-[#131218] bg-white"
                          }`}
                        >
                          <p className={`text-[13px] mb-0.5 ${active ? "text-[#c8f55a]" : "text-[#131218]/30"}`}>{mode === "slides" ? "◳" : "▤"}</p>
                          <p className={`text-[11px] font-bold leading-tight ${active ? "text-white" : "text-[#131218]"}`}>{mode === "slides" ? "Presentación" : "Documento"}</p>
                          <p className={`text-[9px] mt-0.5 leading-snug ${active ? "text-white/50" : "text-[#131218]/30"}`}>{mode === "slides" ? "Carrusel · pantalla" : "Página única · PDF"}</p>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Audiencia */}
              <div>
                <p className="text-[9px] font-bold tracking-[1.5px] uppercase text-[#131218]/30 mb-2">Audiencia</p>
                <div className="flex flex-wrap gap-1.5">
                  {[
                    { id: "Inversor",        sub: "Pitch · data-forward" },
                    { id: "Cliente",         sub: "Propuesta · persuasivo" },
                    { id: "Equipo interno",  sub: "Brief · directo" },
                    { id: "Institución",     sub: "Funder · formal" },
                  ].map(({ id, sub }) => (
                    <button key={id} onClick={() => setAudience(id)}
                      className={`text-left px-3 py-2 rounded-xl border transition-all ${
                        audience === id ? "bg-[#131218] border-[#131218] text-white" : "border-[#E0E0D8] text-[#131218]/50 hover:border-[#131218]/30 hover:text-[#131218] bg-white"
                      }`}
                    >
                      <p className={`text-[10px] font-bold ${audience === id ? "text-white" : "text-[#131218]"}`}>{id}</p>
                      <p className={`text-[9px] ${audience === id ? "text-white/50" : "text-[#131218]/30"}`}>{sub}</p>
                    </button>
                  ))}
                </div>
              </div>

              {/* Proyecto — optional */}
              <div>
                <p className="text-[9px] font-bold tracking-[1.5px] uppercase text-[#131218]/30 mb-2">
                  {channelOrProjectLabel}
                  <span className="ml-1.5 text-[8px] font-bold text-[#131218]/20 normal-case tracking-normal">opcional</span>
                </p>
                <div className="relative">
                  <select value={selectedOption} onChange={(e) => setSelectedOption(e.target.value)}
                    className="w-full border border-[#E0E0D8] rounded-lg px-3 py-2.5 text-xs font-semibold text-[#131218] bg-[#EFEFEA] outline-none focus:border-[#131218]/40 appearance-none cursor-pointer"
                  >
                    <option value="">Common House (default)</option>
                    {channelOrProjectOptions.map((opt) => (
                      <option key={opt} value={opt}>{opt}</option>
                    ))}
                  </select>
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[#131218]/30 text-[10px]">▾</span>
                </div>
              </div>
            </>
          )}

        </div>
      </div>

      {/* ── RIGHT PANEL: textarea + submit ── */}
      <div className="w-[280px] flex-shrink-0 flex flex-col">
        <div className="px-5 py-3.5 border-b border-[#E0E0D8]">
          <p className="text-[8px] font-bold tracking-[2px] uppercase text-[#131218]/30 mb-0.5">{textareaLabel}</p>
          <p className="text-[11px] text-[#131218]/40">Qué, para quién, en qué tono</p>
        </div>

        <div className="px-4 py-4 flex flex-col gap-3 flex-1">
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="flex-1 min-h-[140px] border border-[#E0E0D8] rounded-lg px-3 py-2.5 text-xs text-[#131218] bg-[#EFEFEA] resize-none outline-none focus:border-[#131218]/40 placeholder-[#131218]/20"
            placeholder={textareaPlaceholder}
          />

          <button
            onClick={handleSubmit}
            disabled={status === "loading" || status === "generating" || !description.trim()}
            className={`w-full text-xs font-bold py-2.5 rounded-xl transition-all ${
              status === "success"
                ? "bg-[#B2FF59] text-[#131218]"
                : status === "error"
                ? "bg-red-100 text-red-700"
                : status === "loading" || status === "generating"
                ? "bg-[#131218]/40 text-white cursor-not-allowed"
                : deskType === "comms"
                ? "bg-[#131218] text-white hover:bg-[#131218]/80"
                : "bg-[#B2FF59] text-[#131218] hover:opacity-85"
            }`}
          >
            {status === "success"
              ? "✓ Listo — recarga para ver"
              : status === "error"
              ? "Error — intenta de nuevo"
              : status === "loading"
              ? "Creando solicitud..."
              : status === "generating"
              ? isVisual
                ? effectiveOutputMode === "document" ? "Generando documento... (~60s)" : "Generando slides... (~60s)"
                : "Generando draft... (~30s)"
              : deskType === "commercial"
              ? "Generar propuesta →"
              : isVisual
              ? effectiveOutputMode === "document" ? "Generar documento →" : "Generar slides →"
              : "Generar draft →"}
          </button>
        </div>
      </div>

    </div>
  );
}
