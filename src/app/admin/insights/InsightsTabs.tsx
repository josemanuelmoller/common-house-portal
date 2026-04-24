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

function typePillStyle(type: string): { bg: string; color: string } {
  if (type === "Outcome") return { bg: "var(--hall-ok-soft)",   color: "var(--hall-ok)" };
  if (type === "Blocker") return { bg: "var(--hall-danger-soft)", color: "var(--hall-danger)" };
  if (type === "Insight") return { bg: "var(--hall-info-soft)", color: "var(--hall-info)" };
  return { bg: "var(--hall-fill-soft)", color: "var(--hall-muted-2)" };
}

export function InsightsTabs() {
  const [tab, setTab] = useState<"upload" | "briefs" | "routed">("upload");

  const eyebrowDate = new Date()
    .toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })
    .toUpperCase();

  return (
    <div style={{ fontFamily: "var(--font-hall-sans)", background: "var(--hall-paper-0)" }}>
      {/* K-v2 collapsed header */}
      <header
        className="flex items-center justify-between gap-6 px-9 py-3.5"
        style={{ borderBottom: "1px solid var(--hall-ink-0)" }}
      >
        <div className="flex items-baseline gap-4 min-w-0">
          <span
            className="text-[10px] tracking-[0.08em] whitespace-nowrap"
            style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted-2)" }}
          >
            INSIGHTS · <b style={{ color: "var(--hall-ink-0)" }}>{eyebrowDate}</b>
          </span>
          <h1
            className="text-[16px] font-medium tracking-[-0.01em] truncate"
            style={{ color: "var(--hall-ink-0)" }}
          >
            Insights <em className="hall-flourish">Desk</em>
          </h1>
        </div>

        {/* Sub-tabs */}
        <div className="flex gap-2">
          {[
            { id: "upload", label: "Upload & Digest" },
            { id: "briefs", label: "Insight Briefs" },
            { id: "routed", label: "Routed Outputs" },
          ].map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id as typeof tab)}
              className="px-3 py-1.5 text-[10.5px] font-semibold transition-all"
              style={{
                fontFamily: "var(--font-hall-mono)",
                letterSpacing: "0.06em",
                borderRadius: 3,
                border: tab === t.id ? "1px solid var(--hall-ink-0)" : "1px solid var(--hall-line-soft)",
                background: tab === t.id ? "var(--hall-ink-0)" : "transparent",
                color: tab === t.id ? "var(--hall-paper-0)" : "var(--hall-muted-2)",
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
      </header>

      <div className="px-9 py-7">
        <div className="max-w-5xl mx-auto">

          {/* ── Upload & Digest ── */}
          {tab === "upload" && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
              <div className="flex flex-col gap-4">
                {/* Upload zone */}
                <div
                  className="p-8 text-center transition-all cursor-pointer"
                  style={{
                    border: "2px dashed var(--hall-line-soft)",
                    borderRadius: 3,
                  }}
                >
                  <div className="mb-3 flex justify-center" style={{opacity: 0.5}}>
                    <svg viewBox="0 0 24 24" width="36" height="36" fill="none" stroke="var(--hall-ink-0)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                      <polyline points="17 8 12 3 7 8"/>
                      <line x1="12" y1="3" x2="12" y2="15"/>
                    </svg>
                  </div>
                  <p className="text-sm font-bold tracking-tight mb-1.5" style={{color: "var(--hall-ink-0)"}}>Subir documento</p>
                  <p className="text-xs leading-relaxed mb-4" style={{color: "var(--hall-muted-3)"}}>
                    PDF, PPT, DOC o pega una URL.<br/>El Insight Engine lo procesa y extrae los puntos clave.
                  </p>
                  <button className="hall-btn-primary mx-auto">
                    Elegir archivo
                  </button>
                  <p
                    className="text-[9px] font-bold uppercase mt-3"
                    style={{fontFamily: "var(--font-hall-mono)", letterSpacing: "0.08em", color: "var(--hall-muted-3)"}}
                  >
                    PDF · PPT · DOC · URL
                  </p>
                  <div className="flex flex-wrap gap-1.5 mt-3.5 justify-center">
                    {["CH / Portfolio","Startup","Grants","Comms","Open"].map((a, i) => (
                      <button
                        key={a}
                        className="text-[9.5px] font-semibold px-3 py-1 transition-all"
                        style={{
                          fontFamily: "var(--font-hall-mono)",
                          letterSpacing: "0.06em",
                          borderRadius: 3,
                          border: i === 0 ? "1px solid var(--hall-ink-0)" : "1px solid var(--hall-line-soft)",
                          background: i === 0 ? "var(--hall-ink-0)" : "transparent",
                          color: i === 0 ? "var(--hall-paper-0)" : "var(--hall-muted-2)",
                        }}
                      >
                        {a}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Cómo funciona */}
                <div
                  className="px-4 py-4"
                  style={{ border: "1px solid var(--hall-line-soft)", borderRadius: 3 }}
                >
                  <p
                    className="text-[9px] font-bold uppercase mb-3"
                    style={{ fontFamily: "var(--font-hall-mono)", letterSpacing: "0.08em", color: "var(--hall-muted-3)" }}
                  >
                    Cómo funciona
                  </p>
                  <div className="flex flex-col gap-2.5">
                    {[
                      "Sube el documento y elige el ángulo de análisis",
                      "El agente extrae 4–6 insights atómicos y estructurados",
                      "El brief se crea en CH Evidence [OS v2] listo para validar",
                    ].map((step, i) => (
                      <div
                        key={i}
                        className="flex gap-2.5 items-start text-[11.5px] leading-relaxed"
                        style={{color: "var(--hall-ink-3)"}}
                      >
                        <span
                          className="text-[10px] font-bold flex-shrink-0 w-4 text-center"
                          style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-ink-0)" }}
                        >
                          {i + 1}
                        </span>
                        {step}
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Recent briefs */}
              <section>
                <div
                  className="flex items-baseline justify-between gap-3 pb-2 mb-3.5"
                  style={{borderBottom: "1px solid var(--hall-ink-0)"}}
                >
                  <h2
                    className="text-[19px] font-bold leading-none"
                    style={{letterSpacing: "-0.02em", color: "var(--hall-ink-0)"}}
                  >
                    Últimos <em className="hall-flourish">generados</em>
                  </h2>
                  <span
                    style={{fontFamily: "var(--font-hall-mono)", fontSize: 10, color: "var(--hall-muted-2)", letterSpacing: "0.06em"}}
                  >
                    2 RECENT
                  </span>
                </div>
                <div className="flex flex-col gap-4">
                  {BRIEFS.slice(0, 3).map(b => <BriefCard key={b.title} brief={b} />)}
                </div>
              </section>
            </div>
          )}

          {/* ── Insight Briefs ── */}
          {tab === "briefs" && (
            <section>
              <div
                className="flex items-baseline justify-between gap-3 pb-2 mb-3.5"
                style={{borderBottom: "1px solid var(--hall-ink-0)"}}
              >
                <h2
                  className="text-[19px] font-bold leading-none"
                  style={{letterSpacing: "-0.02em", color: "var(--hall-ink-0)"}}
                >
                  All <em className="hall-flourish">briefs</em>
                </h2>
                <span
                  style={{fontFamily: "var(--font-hall-mono)", fontSize: 10, color: "var(--hall-muted-2)", letterSpacing: "0.06em"}}
                >
                  {BRIEFS.length} VALIDATED
                </span>
              </div>
              <div className="flex flex-col gap-4">
                {BRIEFS.map(b => <BriefCard key={b.title} brief={b} />)}
              </div>
            </section>
          )}

          {/* ── Routed Outputs ── */}
          {tab === "routed" && (
            <section>
              <div
                className="flex items-baseline justify-between gap-3 pb-2 mb-3.5"
                style={{borderBottom: "1px solid var(--hall-ink-0)"}}
              >
                <h2
                  className="text-[19px] font-bold leading-none"
                  style={{letterSpacing: "-0.02em", color: "var(--hall-ink-0)"}}
                >
                  Routed <em className="hall-flourish">outputs</em>
                </h2>
                <span
                  style={{fontFamily: "var(--font-hall-mono)", fontSize: 10, color: "var(--hall-muted-2)", letterSpacing: "0.06em"}}
                >
                  {ROUTED.length} ITEMS · LAST 2 WEEKS
                </span>
              </div>
              <div style={{ border: "1px solid var(--hall-line-soft)", borderRadius: 3, overflow: "hidden" }}>
                <div
                  className="grid grid-cols-[2fr_90px_130px_100px_60px] px-5 py-3"
                  style={{
                    borderBottom: "1px solid var(--hall-line-soft)",
                    background: "var(--hall-paper-1)",
                  }}
                >
                  {["Insight","Tipo","Destino","Proyecto","Fecha"].map(h => (
                    <p
                      key={h}
                      className="text-[9px] font-bold uppercase tracking-widest"
                      style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted-3)" }}
                    >
                      {h}
                    </p>
                  ))}
                </div>
                {ROUTED.map((row, i) => {
                  const ts = typePillStyle(row.type);
                  return (
                    <div
                      key={i}
                      className="grid grid-cols-[2fr_90px_130px_100px_60px] px-5 py-3.5 transition-colors items-center"
                      style={i === 0 ? undefined : { borderTop: "1px solid var(--hall-line-soft)" }}
                    >
                      <p className="text-[11.5px] font-medium leading-snug" style={{color: "var(--hall-ink-0)"}}>{row.insight}</p>
                      <span
                        className="text-[8px] font-bold px-2 py-1 w-fit"
                        style={{
                          fontFamily: "var(--font-hall-mono)",
                          letterSpacing: "0.06em",
                          borderRadius: 3,
                          background: ts.bg,
                          color: ts.color,
                        }}
                      >
                        {row.type}
                      </span>
                      <p className="text-[10px] font-medium" style={{color: "var(--hall-muted-2)"}}>{row.dest}</p>
                      <p className="text-[10px]" style={{color: "var(--hall-muted-2)"}}>{row.project}</p>
                      <p
                        className="text-[10px]"
                        style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted-3)", letterSpacing: "0.06em" }}
                      >
                        {row.date}
                      </p>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

        </div>
      </div>
    </div>
  );
}

function BriefCard({ brief }: { brief: typeof BRIEFS[0] }) {
  return (
    <div
      className="px-5 py-4"
      style={{ border: "1px solid var(--hall-line-soft)", borderRadius: 3 }}
    >
      <p
        className="text-[8px] font-bold uppercase mb-2"
        style={{ fontFamily: "var(--font-hall-mono)", letterSpacing: "0.08em", color: "var(--hall-muted-3)" }}
      >
        {brief.label}
      </p>
      <p className="text-[13.5px] font-bold tracking-tight leading-snug mb-3" style={{color: "var(--hall-ink-0)"}}>{brief.title}</p>
      <div className="flex flex-col gap-1.5">
        {brief.points.map((pt, i) => (
          <div
            key={i}
            className="flex items-start gap-2 text-xs leading-relaxed"
            style={{color: "var(--hall-ink-3)"}}
          >
            <span className="w-1.5 h-1.5 rounded-full flex-shrink-0 mt-1" style={{background: "var(--hall-ink-0)"}} />
            {pt}
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between mt-3.5 pt-3" style={{borderTop: "1px solid var(--hall-line-soft)"}}>
        <p
          className="text-[9px] font-semibold"
          style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted-2)", letterSpacing: "0.06em" }}
        >
          {brief.source}
        </p>
        <span
          className="text-[8px] font-bold px-2 py-0.5"
          style={{
            fontFamily: "var(--font-hall-mono)",
            letterSpacing: "0.06em",
            borderRadius: 3,
            background: "var(--hall-ok-soft)",
            color: "var(--hall-ok)",
          }}
        >
          VALIDATED
        </span>
      </div>
    </div>
  );
}
