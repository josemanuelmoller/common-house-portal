import Link from "next/link";
import { Sidebar } from "@/components/Sidebar";
import { NAV } from "../../page";
import { requireAdmin } from "@/lib/require-admin";
import { getSupabaseServerClient } from "@/lib/supabase-server";

type CaseRow = {
  code: string;
  title: string;
  project_name: string | null;
  geography: string | null;
  year: number | null;
  facet_key: string | null;
  evidence_count: number;
  first_seen: string | null;
  last_seen: string | null;
};

export default async function CasesListPage() {
  await requireAdmin();

  const sb = getSupabaseServerClient();
  const { data } = await sb.from("knowledge_cases")
    .select("*")
    .order("last_seen", { ascending: false, nullsFirst: false });
  const cases = (data as CaseRow[] | null) ?? [];

  // Stats
  const countries = new Set(cases.map(c => c.geography).filter((x): x is string => Boolean(x)));
  const projects  = new Set(cases.map(c => c.project_name).filter((x): x is string => Boolean(x)));
  const totalBullets = cases.reduce((n, c) => n + c.evidence_count, 0);

  return (
    <div className="flex min-h-screen" style={{ background: "var(--hall-paper-0)" }}>
      <Sidebar items={NAV} isAdmin />
      <main
        className="flex-1 ml-[228px] overflow-auto"
        style={{ fontFamily: "var(--font-hall-sans)", background: "var(--hall-paper-0)" }}
      >
        {/* K-v2 collapsed header */}
        <header
          className="flex items-center justify-between gap-6 px-9 py-3.5"
          style={{ borderBottom: "1px solid var(--hall-ink-0)" }}
        >
          <div className="flex items-baseline gap-4 min-w-0">
            <span
              className="text-[10px] tracking-[0.08em] whitespace-nowrap uppercase"
              style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted-2)" }}
            >
              KNOWLEDGE · <b style={{ color: "var(--hall-ink-0)" }}>{cases.length} CASES</b>
            </span>
            <h1
              className="text-[16px] font-medium tracking-[-0.01em]"
              style={{ color: "var(--hall-ink-0)" }}
            >
              Project{" "}
              <em
                style={{
                  fontFamily: "var(--font-hall-display)",
                  fontStyle: "italic",
                  fontWeight: 400,
                }}
              >
                cases
              </em>
              .
            </h1>
          </div>
          <Link
            href="/admin/knowledge"
            className="text-[11px]"
            style={{
              fontFamily: "var(--font-hall-mono)",
              color: "var(--hall-muted-2)",
              letterSpacing: "0.06em",
            }}
          >
            ← KNOWLEDGE TREE
          </Link>
        </header>

        <div className="px-9 py-6 space-y-6">
          <p
            className="text-[12px] leading-relaxed max-w-[560px]"
            style={{ color: "var(--hall-muted-2)" }}
          >
            Cada case (SUFI-AR-2026, AUTOMERCADO-CR-2026, …) agrupa todo lo que se sabe sobre
            un piloto concreto, independiente de qué leaf del árbol lo use. Click para ver el
            perfil completo.
          </p>

          {/* Metric strip (mono, flat) */}
          <div
            className="flex items-baseline gap-8 pb-3"
            style={{
              borderBottom: "1px solid var(--hall-line-soft)",
              fontFamily: "var(--font-hall-mono)",
            }}
          >
            <Metric label="Cases" value={cases.length} />
            <Metric label="Countries" value={countries.size} />
            <Metric label="Projects" value={projects.size} />
            <Metric label="Total bullets" value={totalBullets} />
          </div>

          <div>
            <div
              className="flex items-baseline justify-between gap-3 pb-2 mb-3.5"
              style={{ borderBottom: "1px solid var(--hall-ink-0)" }}
            >
              <h2
                className="text-[19px] font-bold leading-none"
                style={{ letterSpacing: "-0.02em", color: "var(--hall-ink-0)" }}
              >
                All{" "}
                <em
                  style={{
                    fontFamily: "var(--font-hall-display)",
                    fontStyle: "italic",
                    fontWeight: 400,
                    color: "var(--hall-ink-0)",
                  }}
                >
                  cases
                </em>
              </h2>
              <span
                style={{
                  fontFamily: "var(--font-hall-mono)",
                  fontSize: 10,
                  color: "var(--hall-muted-2)",
                  letterSpacing: "0.06em",
                }}
              >
                {cases.length} TOTAL
              </span>
            </div>
            {cases.length === 0 ? (
              <div
                className="px-6 py-12 text-center text-sm"
                style={{ color: "var(--hall-muted-3)" }}
              >
                No cases tracked yet. Run{" "}
                <code
                  className="text-[11px] px-1 py-0.5"
                  style={{
                    fontFamily: "var(--font-hall-mono)",
                    background: "var(--hall-fill-soft)",
                    borderRadius: 3,
                  }}
                >
                  /api/backfill-case-codes
                </code>{" "}
                to populate.
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--hall-line-soft)" }}>
                    <th
                      className="text-left py-2 text-[10px] uppercase tracking-[0.06em]"
                      style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted-2)" }}
                    >
                      Case code
                    </th>
                    <th
                      className="text-left py-2 text-[10px] uppercase tracking-[0.06em]"
                      style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted-2)" }}
                    >
                      Project
                    </th>
                    <th
                      className="text-center py-2 text-[10px] uppercase tracking-[0.06em]"
                      style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted-2)" }}
                    >
                      Geo
                    </th>
                    <th
                      className="text-center py-2 text-[10px] uppercase tracking-[0.06em]"
                      style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted-2)" }}
                    >
                      Year
                    </th>
                    <th
                      className="text-center py-2 text-[10px] uppercase tracking-[0.06em]"
                      style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted-2)" }}
                    >
                      Bullets
                    </th>
                    <th
                      className="text-right py-2 text-[10px] uppercase tracking-[0.06em]"
                      style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted-2)" }}
                    >
                      Last seen
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {cases.map(c => (
                    <tr
                      key={c.code}
                      style={{ borderTop: "1px solid var(--hall-line-soft)" }}
                    >
                      <td className="py-2.5">
                        <Link
                          href={`/admin/knowledge/cases/${encodeURIComponent(c.code)}`}
                          className="text-sm font-semibold hover:underline"
                          style={{
                            fontFamily: "var(--font-hall-mono)",
                            color: "var(--hall-ink-0)",
                          }}
                        >
                          {c.code}
                        </Link>
                      </td>
                      <td
                        className="py-2.5 text-sm"
                        style={{ color: "var(--hall-ink-3)" }}
                      >
                        {c.project_name ?? "—"}
                      </td>
                      <td
                        className="py-2.5 text-center text-[11px]"
                        style={{
                          fontFamily: "var(--font-hall-mono)",
                          color: "var(--hall-muted-2)",
                        }}
                      >
                        {c.geography ?? "—"}
                      </td>
                      <td
                        className="py-2.5 text-center text-xs"
                        style={{
                          fontFamily: "var(--font-hall-mono)",
                          color: "var(--hall-muted-2)",
                        }}
                      >
                        {c.year ?? "—"}
                      </td>
                      <td
                        className="py-2.5 text-center text-sm font-semibold"
                        style={{
                          fontFamily: "var(--font-hall-mono)",
                          color: "var(--hall-ink-0)",
                        }}
                      >
                        {c.evidence_count}
                      </td>
                      <td
                        className="py-2.5 text-right text-[10px]"
                        style={{
                          fontFamily: "var(--font-hall-mono)",
                          color: "var(--hall-muted-3)",
                        }}
                      >
                        {c.last_seen ? new Date(c.last_seen).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "2-digit" }) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex flex-col">
      <span
        className="text-[9px] uppercase tracking-[0.08em]"
        style={{ color: "var(--hall-muted-3)" }}
      >
        {label}
      </span>
      <span
        className="text-[22px] font-medium leading-none mt-1"
        style={{ color: "var(--hall-ink-0)" }}
      >
        {value}
      </span>
    </div>
  );
}
