"use client";
import { useState } from "react";

// Insight Brief row shape (real, from notion_insight_briefs via getRecentInsightBriefBriefs).
// Note: `points` (atomic insight bullets) is NOT in the current schema; the
// page used to render hardcoded sample bullets, which we removed in favour
// of the real metadata (theme, source type, last edited date).
export type InsightBriefRow = {
  id: string;
  title: string;
  sourceLink: string | null;
  notionUrl: string;
  theme: string[];
  sourceType: string | null;
  lastEditedAt: string | null;
};

export function InsightsTabs({ briefs }: { briefs: InsightBriefRow[] }) {
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
                    {briefs.length === 0 ? "0 BRIEFS" : `${Math.min(3, briefs.length)} OF ${briefs.length}`}
                  </span>
                </div>
                <div className="flex flex-col gap-4">
                  {briefs.length === 0 ? (
                    <EmptyState label="No briefs ingested yet. Upload a document to generate the first one." />
                  ) : (
                    briefs.slice(0, 3).map(b => <BriefCard key={b.id} brief={b} />)
                  )}
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
                  {briefs.length} TOTAL
                </span>
              </div>
              <div className="flex flex-col gap-4">
                {briefs.length === 0 ? (
                  <EmptyState label="No briefs ingested yet. Upload a document to generate the first one." />
                ) : (
                  briefs.map(b => <BriefCard key={b.id} brief={b} />)
                )}
              </div>
            </section>
          )}

          {/* ── Routed Outputs ──
              Not yet implemented: there is no canonical Supabase table that
              records insight → destination routing (CH Evidence / Decision
              Center / Knowledge Assets). Shown as an honest empty state
              instead of fake rows. Add a routing record when the upstream
              writer ships. */}
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
                  NOT WIRED
                </span>
              </div>
              <EmptyState label="Insight routing isn't wired yet — once briefs route to CH Evidence / Decision Center / Knowledge Assets, the destination ledger renders here." />
            </section>
          )}

        </div>
      </div>
    </div>
  );
}

function EmptyState({ label }: { label: string }) {
  return (
    <div
      className="px-5 py-6 text-center"
      style={{ border: "1px dashed var(--hall-line-soft)", borderRadius: 3 }}
    >
      <p className="text-[11px] leading-relaxed" style={{ color: "var(--hall-muted-3)" }}>
        {label}
      </p>
    </div>
  );
}

function formatBriefLabel(brief: InsightBriefRow): string {
  const themePart = brief.theme.length > 0 ? brief.theme.join(" · ") : "Brief";
  const sourcePart = brief.sourceType ?? "Document";
  const datePart = brief.lastEditedAt
    ? new Date(brief.lastEditedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
    : "—";
  return `${themePart} · ${sourcePart} · ${datePart}`;
}

function BriefCard({ brief }: { brief: InsightBriefRow }) {
  const label = formatBriefLabel(brief);
  const hasSource = !!brief.sourceLink || !!brief.notionUrl;
  return (
    <div
      className="px-5 py-4"
      style={{ border: "1px solid var(--hall-line-soft)", borderRadius: 3 }}
    >
      <p
        className="text-[8px] font-bold uppercase mb-2"
        style={{ fontFamily: "var(--font-hall-mono)", letterSpacing: "0.08em", color: "var(--hall-muted-3)" }}
      >
        {label}
      </p>
      <p className="text-[13.5px] font-bold tracking-tight leading-snug" style={{color: "var(--hall-ink-0)"}}>
        {brief.title || "Untitled brief"}
      </p>
      <div className="flex items-center justify-between mt-3.5 pt-3" style={{borderTop: "1px solid var(--hall-line-soft)"}}>
        {hasSource ? (
          <a
            href={brief.sourceLink ?? brief.notionUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[9px] font-semibold hover:underline"
            style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted-2)", letterSpacing: "0.06em" }}
          >
            {brief.sourceLink ? "OPEN SOURCE ↗" : "OPEN IN NOTION ↗"}
          </a>
        ) : (
          <span
            className="text-[9px] font-semibold"
            style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted-3)", letterSpacing: "0.06em" }}
          >
            NO SOURCE LINK
          </span>
        )}
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
