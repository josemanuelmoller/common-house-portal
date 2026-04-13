"use client";
import { useState } from "react";

const BRIEFS = [
  {
    label: "Circular Economy · EU Policy · 8 Apr 2026",
    title: "EU Packaging & Packaging Waste Regulation — Implicaciones para portfolio CH",
    points: [
      "La PPWR obliga a los retailers a ofrecer opciones de refill para ciertos formatos antes de 2030.",
      "Refill.co y Fair Cycle están directamente alineados con los requisitos de la norma.",
      "Auto Mercado podría usar el cumplimiento normativo como palanca comercial para acelerar el piloto.",
      "Ventana de 5 años para diferenciación como «primer mover» en retail CR/LATAM.",
    ],
    source: "PDF · 24 págs · EU Commission",
  },
  {
    label: "Grants · Impact Finance · 5 Apr 2026",
    title: "LIFE Programme 2026 — Fit analysis para portfolio startups",
    points: [
      "Deadline 21 Apr. Eco Loop y Refill.co tienen el mayor fit (78 y 82 puntos).",
      "Los criterios de circularidad medible están bien cubiertos por ambas startups.",
      "CircularWave necesita ajustar framing para encajar en el eje «nature restoration».",
    ],
    source: "URL · LIFE Programme · EC",
  },
  {
    label: "Strategy · Retail · 2 Apr 2026",
    title: "Refill in Supermarkets — Behavioral drivers y barreras de adopción",
    points: [
      "Convenience y pricing son los drivers principales — no el awareness medioambiental.",
      "Los programas de fidelidad multiplican por 3x la tasa de adopción en primeros 90 días.",
      "Packaging aesthetics son barrera #1 para segmentos premium. Implicación directa para Auto Mercado.",
    ],
    source: "PPT · 18 slides · Eunomia Research",
  },
  {
    label: "Investor Intelligence · Series A · 28 Mar 2026",
    title: "CircularWave — Investor landscape y comparable rounds",
    points: [
      "4 impact-first funds activos en el sector con ticket promedio de €3-5M.",
      "CircularWave unit economics superiores a 3 comparables públicos en rondas Serie A 2025.",
    ],
    source: "PDF + URL · CB Insights + Pitchbook",
  },
  {
    label: "Policy · LATAM · 22 Mar 2026",
    title: "Economía circular en LATAM — Estado regulatorio por país",
    points: [
      "Colombia y Chile lideran en legislación EPR — oportunidad para Refill.co.",
      "Costa Rica sin normativa específica pero con voluntad política. Timing favorable para AM.",
    ],
    source: "DOC · 31 págs · CEPAL",
  },
];

const ROUTED = [
  { insight: "PPWR — implicaciones para retailers con refill antes de 2030",          type: "Outcome",    dest: "CH Evidence",    project: "Portfolio",   date: "8 Apr" },
  { insight: "LIFE Programme — deadline 21 Apr, fit Eco Loop 78pts",                  type: "Blocker",    dest: "Decision Center",project: "Grants",      date: "5 Apr" },
  { insight: "Adopción refill: fidelidad x3 en primeros 90 días",                     type: "Insight",    dest: "Knowledge Assets",project: "Retail",     date: "2 Apr" },
  { insight: "CircularWave: 4 impact funds activos, ticket €3-5M",                    type: "Insight",    dest: "CH Evidence",    project: "CircularWave",date: "28 Mar" },
  { insight: "EPR Colombia y Chile — oportunidad Refill.co",                          type: "Outcome",    dest: "Knowledge Assets",project: "Portfolio",  date: "22 Mar" },
];

const TYPE_PILL: Record<string, string> = {
  Outcome: "bg-[rgba(200,245,90,0.25)] text-[#3a6600]",
  Blocker: "bg-red-50 text-red-700",
  Insight: "bg-blue-50 text-blue-700",
};

export function InsightsTabs() {
  const [tab, setTab] = useState<"upload" | "briefs" | "routed">("upload");

  return (
    <>
      {/* Dark header */}
      <header className="bg-[#131218] px-12 pt-10 pb-0">
        <p className="text-[8px] font-bold tracking-[2.5px] uppercase text-white/20 mb-3">Desks · Inteligencia</p>
        <h1 className="text-[2.6rem] font-[300] text-white tracking-[-1.5px] leading-none">
          Insights <em className="font-[900] italic text-[#c8f55a]">Desk</em>
        </h1>
        <p className="text-sm text-white/40 mt-3 leading-relaxed">
          Sube documentos, revisa briefs validados y sigue los outputs enrutados al OS.
        </p>

      {/* Sub-tabs */}
      <div className="flex gap-2 mt-5 pb-0">
        {[
          { id: "upload", label: "Upload & Digest" },
          { id: "briefs", label: "Insight Briefs" },
          { id: "routed", label: "Routed Outputs" },
        ].map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id as typeof tab)}
            className={`px-3.5 py-1.5 text-[10.5px] font-semibold rounded-full border transition-all ${
              tab === t.id
                ? "bg-white text-[#131218] border-white"
                : "border-white/20 text-white/45 hover:text-white/70 hover:border-white/40"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      </header>{/* /dark header */}

      <div className="px-8 py-6">
        <div className="max-w-5xl mx-auto">

          {/* ── Upload & Digest ── */}
          {tab === "upload" && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
              <div className="flex flex-col gap-4">
                {/* Upload zone */}
                <div className="bg-white border-2 border-dashed border-[#E0E0D8] rounded-2xl p-8 text-center hover:border-[#131218]/30 hover:bg-[#f7f7f3] transition-all cursor-pointer">
                  <div className="mb-3 opacity-30 flex justify-center">
                    <svg viewBox="0 0 24 24" width="36" height="36" fill="none" stroke="#131218" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                      <polyline points="17 8 12 3 7 8"/>
                      <line x1="12" y1="3" x2="12" y2="15"/>
                    </svg>
                  </div>
                  <p className="text-sm font-bold text-[#131218] tracking-tight mb-1.5">Subir documento</p>
                  <p className="text-xs text-[#131218]/40 leading-relaxed mb-4">
                    PDF, PPT, DOC o pega una URL.<br/>El Insight Engine lo procesa y extrae los puntos clave.
                  </p>
                  <button className="bg-[#131218] text-white text-xs font-bold px-4 py-2 rounded-lg mx-auto hover:bg-[#131218]/80 transition-colors">
                    Elegir archivo
                  </button>
                  <p className="text-[9px] font-bold tracking-[1px] text-[#131218]/20 uppercase mt-3">PDF · PPT · DOC · URL</p>
                  <div className="flex flex-wrap gap-1.5 mt-3.5 justify-center">
                    {["CH / Portfolio","Startup","Grants","Comms","Open"].map((a, i) => (
                      <button key={a} className={`text-[9.5px] font-semibold px-3 py-1 rounded-full border transition-all ${i === 0 ? "bg-[#131218] text-white border-[#131218]" : "border-[#E0E0D8] text-[#131218]/40 hover:text-[#131218] hover:border-[#131218]/30"}`}>
                        {a}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Cómo funciona */}
                <div className="bg-white border border-[#E0E0D8] rounded-xl px-4 py-4">
                  <p className="text-[9px] font-bold tracking-[1.5px] uppercase text-[#131218]/30 mb-3">Cómo funciona</p>
                  <div className="flex flex-col gap-2.5">
                    {[
                      "Sube el documento y elige el ángulo de análisis",
                      "El agente extrae 4–6 insights atómicos y estructurados",
                      "El brief se crea en CH Evidence [OS v2] listo para validar",
                    ].map((step, i) => (
                      <div key={i} className="flex gap-2.5 items-start text-[11.5px] text-[#131218]/55 leading-relaxed">
                        <span className="text-[10px] font-bold text-[#131218] flex-shrink-0 w-4 text-center">{i + 1}</span>
                        {step}
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Recent briefs */}
              <div className="flex flex-col gap-4">
                <div className="flex items-center gap-3">
                  <p className="text-[9px] font-bold tracking-[1.5px] uppercase text-[#131218]/30">Últimos generados</p>
                  <div className="flex-1 h-px bg-[#E0E0D8]" />
                  <p className="text-[9px] font-bold text-[#131218]/25">2 recientes</p>
                </div>
                {BRIEFS.slice(0, 3).map(b => <BriefCard key={b.title} brief={b} />)}
              </div>
            </div>
          )}

          {/* ── Insight Briefs ── */}
          {tab === "briefs" && (
            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-3">
                <p className="text-[9px] font-bold tracking-[1.5px] uppercase text-[#131218]/30">Todos los briefs</p>
                <div className="flex-1 h-px bg-[#E0E0D8]" />
                <p className="text-[9px] font-bold text-[#131218]/25">{BRIEFS.length} validados</p>
              </div>
              {BRIEFS.map(b => <BriefCard key={b.title} brief={b} />)}
            </div>
          )}

          {/* ── Routed Outputs ── */}
          {tab === "routed" && (
            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-3">
                <p className="text-[9px] font-bold tracking-[1.5px] uppercase text-[#131218]/30">Outputs enrutados</p>
                <div className="flex-1 h-px bg-[#E0E0D8]" />
                <p className="text-[9px] font-bold text-[#131218]/25">{ROUTED.length} items · últimas 2 semanas</p>
              </div>
              <div className="bg-white border border-[#E0E0D8] rounded-2xl overflow-hidden">
                <div className="grid grid-cols-[2fr_90px_130px_100px_60px] px-5 py-3 border-b border-[#E0E0D8]">
                  {["Insight","Tipo","Destino","Proyecto","Fecha"].map(h => (
                    <p key={h} className="text-[8px] font-bold tracking-[2px] uppercase text-[#131218]/25">{h}</p>
                  ))}
                </div>
                {ROUTED.map((row, i) => (
                  <div key={i} className="grid grid-cols-[2fr_90px_130px_100px_60px] px-5 py-3.5 border-b border-[#EFEFEA] last:border-0 hover:bg-[#f9f9f6] transition-colors items-center">
                    <p className="text-[11.5px] font-medium text-[#131218] leading-snug">{row.insight}</p>
                    <span className={`text-[8px] font-bold px-2 py-1 rounded-md w-fit ${TYPE_PILL[row.type] ?? "bg-[#EFEFEA] text-[#131218]/50"}`}>{row.type}</span>
                    <p className="text-[10px] text-[#131218]/50 font-medium">{row.dest}</p>
                    <p className="text-[10px] text-[#131218]/50">{row.project}</p>
                    <p className="text-[10px] text-[#131218]/30">{row.date}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>
      </div>
    </>
  );
}

function BriefCard({ brief }: { brief: typeof BRIEFS[0] }) {
  return (
    <div className="bg-white border border-[#E0E0D8] rounded-xl px-5 py-4">
      <p className="text-[8px] font-bold tracking-[2px] uppercase text-[#131218]/22 mb-2">{brief.label}</p>
      <p className="text-[13.5px] font-bold text-[#131218] tracking-tight leading-snug mb-3">{brief.title}</p>
      <div className="flex flex-col gap-1.5">
        {brief.points.map((pt, i) => (
          <div key={i} className="flex items-start gap-2 text-xs text-[#131218]/55 leading-relaxed">
            <span className="w-1.5 h-1.5 rounded-full bg-[#B2FF59] flex-shrink-0 mt-1" />
            {pt}
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between mt-3.5 pt-3 border-t border-[#E0E0D8]">
        <p className="text-[9px] text-[#131218]/40 font-semibold">{brief.source}</p>
        <span className="text-[8px] font-bold bg-[rgba(200,245,90,0.3)] text-[#3a6600] px-2 py-0.5 rounded-md">Validated</span>
      </div>
    </div>
  );
}
