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
  deskType: "design" | "comms";
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

  // Derive active voice mode from selected profile
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

      {/* Primary mode buttons */}
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

      {/* Startup sub-selector */}
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

      {/* Active profile tone hint */}
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
  contentTypes,
  channelOrProjectOptions,
  channelOrProjectLabel,
  styleProfiles = [],
}: DeskRequestFormProps) {
  // Comms: canal + formato replace the old selectedType + selectedOption
  const [selectedCanal,   setSelectedCanal]   = useState(CANALES[0]);
  const [selectedFormato, setSelectedFormato] = useState(CANAL_FORMAT_MAP[CANALES[0]][0]);

  // Design: type + project (unchanged)
  const [selectedType,   setSelectedType]   = useState(contentTypes[0]);
  const [selectedOption, setSelectedOption] = useState(channelOrProjectOptions[0]);

  const [description, setDescription] = useState("");
  const [selectedProfile, setSelectedProfile] = useState<string>(() => {
    if (deskType === "comms") {
      const jmm = styleProfiles.find(p => p.scope === "JMM");
      return jmm?.id ?? "";
    }
    return "";
  });
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");

  function handleCanalChange(canal: string) {
    setSelectedCanal(canal);
    setSelectedFormato(CANAL_FORMAT_MAP[canal][0]); // auto-select first format
  }

  const isVisual = ["Deck", "One-pager", "Proposal", "Exec Summary"].includes(selectedType);

  async function handleSubmit() {
    if (!description.trim()) return;
    setStatus("loading");
    try {
      const res = await fetch("/api/desk-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          deskType,
          // Comms: contentType = formato, channel = canal
          contentType: deskType === "comms" ? selectedFormato : selectedType,
          description,
          ...(deskType === "comms"
            ? { channel: selectedCanal }
            : { project: selectedOption }),
          ...(selectedProfile ? { styleProfileId: selectedProfile } : {}),
        }),
      });
      if (!res.ok) throw new Error("Request failed");
      setStatus("success");
      setDescription("");
      setTimeout(() => setStatus("idle"), 4000);
    } catch {
      setStatus("error");
      setTimeout(() => setStatus("idle"), 3000);
    }
  }

  return (
    <div className="px-5 py-4 flex flex-col gap-4">

      {/* Comms: Canal → Formato (replaces Tipo + Plataforma) */}
      {deskType === "comms" ? (
        <>
          {/* Canal selector */}
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

          {/* Formato selector — dynamic based on canal */}
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
        </>
      ) : (
        /* Design: Tipo selector (unchanged) */
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
      )}

      {/* Voice selector — Comms Desk only */}
      {deskType === "comms" && styleProfiles.length > 0 && (
        <CommsVoiceSelector
          profiles={styleProfiles}
          selectedProfileId={selectedProfile}
          onChange={setSelectedProfile}
        />
      )}

      {/* Description / brief */}
      <div>
        <p className="text-[9px] font-bold tracking-[1.5px] uppercase text-[#131218]/30 mb-2">
          {deskType === "comms" ? "Ángulo / contexto" : "Descripción"}
        </p>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="w-full h-24 border border-[#E0E0D8] rounded-lg px-3 py-2.5 text-xs text-[#131218] bg-[#EFEFEA] resize-none outline-none focus:border-[#131218]/40 placeholder-[#131218]/20"
          placeholder={
            deskType === "comms"
              ? "Qué queremos decir, a quién y en qué tono..."
              : "Qué necesitas, para quién y cuándo..."
          }
        />
      </div>

      {/* Project selector — Design Desk only */}
      {deskType === "design" && (
        <div>
          <p className="text-[9px] font-bold tracking-[1.5px] uppercase text-[#131218]/30 mb-2">
            {channelOrProjectLabel}
          </p>
          <div className="relative">
            <select
              value={selectedOption}
              onChange={(e) => setSelectedOption(e.target.value)}
              className="w-full border border-[#E0E0D8] rounded-lg px-3 py-2.5 text-xs font-semibold text-[#131218] bg-[#EFEFEA] outline-none focus:border-[#131218]/40 appearance-none cursor-pointer"
            >
              {channelOrProjectOptions.map((opt) => (
                <option key={opt} value={opt}>{opt}</option>
              ))}
            </select>
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[#131218]/30 text-[10px]">▾</span>
          </div>
        </div>
      )}

      {/* Style profile selector — Design Desk only (generic) */}
      {deskType === "design" && styleProfiles.length > 0 && (
        <div>
          <p className="text-[9px] font-bold tracking-[1.5px] uppercase text-[#131218]/30 mb-2">
            Perfil de estilo
            {isVisual && (
              <span className="ml-2 text-[8px] font-bold text-purple-500 normal-case tracking-normal">
                · aplica al deck/slide
              </span>
            )}
          </p>
          <div className="flex flex-col gap-1.5">
            <button
              onClick={() => setSelectedProfile("")}
              className={`text-left text-[10px] font-semibold px-3 py-2 rounded-lg border transition-all ${
                selectedProfile === ""
                  ? "bg-[#131218] text-white border-[#131218]"
                  : "border-[#E0E0D8] text-[#131218]/50 hover:border-[#131218]/40 hover:text-[#131218]"
              }`}
            >
              CH Brand (default)
            </button>
            {styleProfiles.map((p) => (
              <button
                key={p.id}
                onClick={() => setSelectedProfile(p.id)}
                className={`text-left px-3 py-2 rounded-lg border transition-all ${
                  selectedProfile === p.id
                    ? "bg-[#131218] text-white border-[#131218]"
                    : "border-[#E0E0D8] text-[#131218]/40 hover:border-[#131218]/40 hover:text-[#131218]"
                }`}
              >
                <p className={`text-[10px] font-semibold ${selectedProfile === p.id ? "text-white" : "text-[#131218]"}`}>{p.name}</p>
                {p.toneSummary && (
                  <p className={`text-[9px] mt-0.5 ${selectedProfile === p.id ? "text-white/60" : "text-[#131218]/35"}`}>
                    {p.toneSummary.slice(0, 80)}{p.toneSummary.length > 80 ? "…" : ""}
                  </p>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Visual type hint (Design Desk) */}
      {deskType === "design" && isVisual && (
        <div className="bg-purple-50 border border-purple-100 rounded-lg px-3 py-2.5">
          <p className="text-[9px] font-bold text-purple-600 uppercase tracking-wide mb-0.5">Generación visual</p>
          <p className="text-[10px] text-purple-700/70 leading-relaxed">
            Este tipo genera un <strong>deck HTML completo</strong> con slides navegables — listo para presentar en el portal (~60s).
          </p>
        </div>
      )}

      {/* Submit */}
      <button
        onClick={handleSubmit}
        disabled={status === "loading" || !description.trim()}
        className={`w-full text-xs font-bold py-2.5 rounded-xl transition-all ${
          status === "success"
            ? "bg-[#B2FF59] text-[#131218]"
            : status === "error"
            ? "bg-red-100 text-red-700"
            : status === "loading"
            ? "bg-[#131218]/40 text-white cursor-not-allowed"
            : deskType === "comms"
            ? "bg-[#131218] text-white hover:bg-[#131218]/80"
            : "bg-[#B2FF59] text-[#131218] hover:opacity-85"
        }`}
      >
        {status === "success"
          ? isVisual
            ? "✓ Slides en camino — revisa el portal en ~60s"
            : "✓ Draft en camino — revisa el portal en ~30s"
          : status === "error"
          ? "Error — intenta de nuevo"
          : status === "loading"
          ? "Generando..."
          : isVisual
          ? "Generar slides →"
          : "Generar draft →"}
      </button>
    </div>
  );
}
