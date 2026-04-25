import Link from "next/link";
import type { CompetitiveIntelRow } from "./CompetitiveIntelPanel";

const RELEVANCE_ORDER: Record<string, number> = { Alta: 0, Media: 1, Baja: 2 };

const TYPE_DOT: Record<string, string> = {
  "Grant":       "#f43f5e",
  "Partnership": "#3b82f6",
  "Hiring":      "#22c55e",
  "Funding":     "#a855f7",
  "Media / PR":  "#94a3b8",
  "Evento":      "#f59e0b",
  "Producto":    "#f97316",
  "Campana":     "#0ea5e9",
  "Contenido":   "#6366f1",
  "Pricing":     "#14b8a6",
};

interface Props {
  rows: CompetitiveIntelRow[];
}

export function CompetitiveIntelSummary({ rows }: Props) {
  const newRows = rows
    .filter((r) => r.status === "New")
    .sort((a, b) => (RELEVANCE_ORDER[a.relevance ?? ""] ?? 3) - (RELEVANCE_ORDER[b.relevance ?? ""] ?? 3))
    .slice(0, 4);

  const altaCount   = rows.filter((r) => r.relevance === "Alta").length;
  const totalNew    = rows.filter((r) => r.status === "New").length;
  const competitors = [...new Set(rows.filter((r) => r.entityType === "Competitor").map((r) => r.entityName))].length;

  if (rows.length === 0) {
    return (
      <div
        className="rounded-xl px-4 py-3 text-center"
        style={{ background: "var(--hall-fill-soft)", color: "var(--hall-muted-2)", fontSize: 11 }}
      >
        Sin señales — lanza un scan desde{" "}
        <Link href="/admin/competitive-intel" className="underline underline-offset-2">
          Competitive Intel
        </Link>
        .
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {/* Mini stats strip */}
      <div
        className="flex items-center gap-0 rounded-xl overflow-hidden"
        style={{ border: "1px solid var(--hall-stroke-0)" }}
      >
        {[
          { val: totalNew,    lbl: "sin revisar" },
          { val: altaCount,   lbl: "alta rel.",  warn: altaCount > 0 },
          { val: competitors, lbl: "competitors" },
        ].map(({ val, lbl, warn }, i) => (
          <div
            key={i}
            className="flex-1 text-center py-2"
            style={{
              borderRight: i < 2 ? "1px solid var(--hall-stroke-0)" : undefined,
              background: "var(--hall-paper-0)",
            }}
          >
            <div
              className="text-[15px] font-black tracking-tight leading-none"
              style={{ color: warn ? "var(--hall-danger)" : "var(--hall-ink-0)" }}
            >
              {val}
            </div>
            <div
              className="text-[8px] font-bold uppercase tracking-wide mt-0.5"
              style={{ color: "var(--hall-muted-2)", fontFamily: "var(--font-hall-mono)" }}
            >
              {lbl}
            </div>
          </div>
        ))}
      </div>

      {/* Top signals */}
      {newRows.length > 0 && (
        <div
          className="rounded-xl overflow-hidden"
          style={{ border: "1px solid var(--hall-stroke-0)" }}
        >
          {newRows.map((r, i) => (
            <div
              key={r.id}
              className="flex items-start gap-2.5 px-3 py-2.5"
              style={{
                borderBottom: i < newRows.length - 1 ? "1px solid var(--hall-stroke-0)" : undefined,
                background: "var(--hall-paper-0)",
              }}
            >
              {/* Signal type dot */}
              <div
                className="flex-shrink-0 mt-[5px] rounded-full"
                style={{
                  width: 6, height: 6,
                  background: TYPE_DOT[r.signalType ?? ""] ?? "#94a3b8",
                }}
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 mb-0.5">
                  {r.entityName && (
                    <span
                      className="text-[9px] font-bold truncate"
                      style={{ color: "var(--hall-muted-2)", fontFamily: "var(--font-hall-mono)" }}
                    >
                      {r.entityName}
                    </span>
                  )}
                  {r.relevance === "Alta" && (
                    <span
                      className="flex-shrink-0 px-1 py-px rounded text-[8px] font-bold"
                      style={{ background: "var(--hall-danger-soft)", color: "var(--hall-danger)" }}
                    >
                      ALTA
                    </span>
                  )}
                </div>
                <div
                  className="text-[11px] font-semibold leading-snug line-clamp-2"
                  style={{ color: "var(--hall-ink-0)" }}
                >
                  {r.title}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Link to full page */}
      <div className="flex justify-end pt-0.5">
        <Link
          href="/admin/competitive-intel"
          className="text-[10px] font-medium underline underline-offset-2"
          style={{ color: "var(--hall-muted-2)" }}
        >
          Ver todos en Competitive Intel →
        </Link>
      </div>
    </div>
  );
}
