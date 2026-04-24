import Link from "next/link";
import { notFound } from "next/navigation";
import { Sidebar } from "@/components/Sidebar";
import { NAV } from "../../../page";
import { requireAdmin } from "@/lib/require-admin";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { getAllNodes } from "@/lib/knowledge-nodes";

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

type EvidenceRow = {
  notion_id: string;
  title: string;
  evidence_type: string | null;
  evidence_statement: string | null;
  confidence_level: string | null;
  source_excerpt: string | null;
  workstream: string | null;
  stakeholder_function: string | null;
  project_notion_id: string | null;
  source_notion_id: string | null;
  date_captured: string | null;
};

function confidenceBadge(conf: string | null, hasExcerpt: boolean): { label: string; bg: string; fg: string } {
  if (!conf) return { label: "?",  bg: "var(--hall-fill-soft)", fg: "var(--hall-muted-3)" };
  if (conf === "High"   && hasExcerpt) return { label: "H",  bg: "var(--hall-ok-soft)",     fg: "var(--hall-ok)" };
  if (conf === "High")                 return { label: "H*", bg: "var(--hall-warn-soft)",   fg: "var(--hall-warn)" };
  if (conf === "Medium")               return { label: "M",  bg: "var(--hall-fill-soft)",   fg: "var(--hall-ink-3)" };
  if (conf === "Low")                  return { label: "L",  bg: "var(--hall-danger-soft)", fg: "var(--hall-danger)" };
  return { label: "?", bg: "var(--hall-fill-soft)", fg: "var(--hall-muted-3)" };
}

export default async function CaseDetailPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  await requireAdmin();
  const { code: rawCode } = await params;
  const code = decodeURIComponent(rawCode);

  const sb = getSupabaseServerClient();
  const [{ data: caseRow }, { data: evidenceRows }, allNodes] = await Promise.all([
    sb.from("knowledge_cases").select("*").eq("code", code).maybeSingle(),
    sb.from("evidence")
      .select("notion_id, title, evidence_type, evidence_statement, confidence_level, source_excerpt, workstream, stakeholder_function, project_notion_id, source_notion_id, date_captured")
      .eq("case_code", code)
      .eq("validation_status", "Validated")
      .order("date_captured", { ascending: false }),
    getAllNodes(),
  ]);

  if (!caseRow) notFound();
  const caseData = caseRow as CaseRow;
  const evidence = (evidenceRows as EvidenceRow[] | null) ?? [];

  // Find which leaves contain bullets with this case code
  const leavesReferencing = allNodes.filter(n =>
    n.body_md.includes(`[${code}]`)
  );

  // Group evidence by evidence_type
  const byType: Record<string, EvidenceRow[]> = {};
  for (const e of evidence) {
    const t = e.evidence_type ?? "Other";
    if (!byType[t]) byType[t] = [];
    byType[t].push(e);
  }
  const typeOrder = ["Decision","Outcome","Requirement","Blocker","Concern","Risk","Objection","Process Step","Dependency","Stakeholder","Assumption","Contradiction","Insight Candidate","Other"];
  const sortedTypes = Object.keys(byType).sort((a, b) => {
    const ai = typeOrder.indexOf(a); const bi = typeOrder.indexOf(b);
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });

  return (
    <div className="flex min-h-screen" style={{ background: "var(--hall-paper-0)" }}>
      <Sidebar items={NAV} isAdmin />
      <main
        className="flex-1 md:ml-[228px] overflow-auto"
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
              CASE · <b style={{ color: "var(--hall-ink-0)" }}>{caseData.code}</b>
            </span>
            <h1
              className="text-[16px] font-medium tracking-[-0.01em] truncate"
              style={{ color: "var(--hall-ink-0)" }}
            >
              <em
                style={{
                  fontFamily: "var(--font-hall-display)",
                  fontStyle: "italic",
                  fontWeight: 400,
                }}
              >
                {caseData.project_name ?? caseData.code}
              </em>
              .
            </h1>
          </div>
          <Link
            href="/admin/knowledge/cases"
            className="text-[11px]"
            style={{
              fontFamily: "var(--font-hall-mono)",
              color: "var(--hall-muted-2)",
              letterSpacing: "0.06em",
            }}
          >
            ← ALL CASES
          </Link>
        </header>

        <div className="px-9 py-6 space-y-7 max-w-[960px]">

          {/* Case meta strip */}
          <div
            className="flex items-center gap-4 flex-wrap pb-3"
            style={{
              borderBottom: "1px solid var(--hall-line-soft)",
              fontFamily: "var(--font-hall-mono)",
              fontSize: 10,
              color: "var(--hall-muted-2)",
              letterSpacing: "0.06em",
            }}
          >
            {caseData.geography && (
              <span
                className="px-2 py-0.5 uppercase"
                style={{
                  border: "1px solid var(--hall-line-strong)",
                  color: "var(--hall-ink-0)",
                  borderRadius: 3,
                }}
              >
                {caseData.geography}
              </span>
            )}
            {caseData.year && <span>{caseData.year}</span>}
            <span>· {evidence.length} EVIDENCE</span>
            <span>· {leavesReferencing.length} LEAVES REFERENCING</span>
          </div>

          {/* Leaves that reference this case */}
          {leavesReferencing.length > 0 && (
            <div>
              <div
                className="flex items-baseline justify-between gap-3 pb-2 mb-3.5"
                style={{ borderBottom: "1px solid var(--hall-ink-0)" }}
              >
                <h2
                  className="text-[19px] font-bold leading-none"
                  style={{ letterSpacing: "-0.02em", color: "var(--hall-ink-0)" }}
                >
                  Leaves that{" "}
                  <em
                    style={{
                      fontFamily: "var(--font-hall-display)",
                      fontStyle: "italic",
                      fontWeight: 400,
                      color: "var(--hall-ink-0)",
                    }}
                  >
                    reference
                  </em>{" "}
                  this case
                </h2>
                <span
                  style={{
                    fontFamily: "var(--font-hall-mono)",
                    fontSize: 10,
                    color: "var(--hall-muted-2)",
                    letterSpacing: "0.06em",
                  }}
                >
                  {leavesReferencing.length} NODES
                </span>
              </div>
              <ul className="flex flex-col">
                {leavesReferencing.map(n => (
                  <li
                    key={n.id}
                    style={{ borderTop: "1px solid var(--hall-line-soft)" }}
                  >
                    <Link
                      href={`/admin/knowledge/${n.path}`}
                      className="block py-2.5 transition-colors"
                    >
                      <p
                        className="text-[10px] uppercase tracking-[0.06em]"
                        style={{
                          fontFamily: "var(--font-hall-mono)",
                          color: "var(--hall-muted-3)",
                        }}
                      >
                        {n.path}
                      </p>
                      <p
                        className="text-sm font-semibold mt-0.5"
                        style={{ color: "var(--hall-ink-0)" }}
                      >
                        {n.title}
                      </p>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Evidence grouped by type */}
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
                  evidence
                </em>{" "}
                for this case
              </h2>
              <span
                style={{
                  fontFamily: "var(--font-hall-mono)",
                  fontSize: 10,
                  color: "var(--hall-muted-2)",
                  letterSpacing: "0.06em",
                }}
              >
                {evidence.length} VALIDATED
              </span>
            </div>

            {evidence.length === 0 ? (
              <div
                className="px-6 py-10 text-center text-sm"
                style={{ color: "var(--hall-muted-3)" }}
              >
                No evidence found for this case.
              </div>
            ) : (
              <div>
                {sortedTypes.map(type => (
                  <div key={type}>
                    <div
                      className="py-2 mt-2"
                      style={{
                        borderTop: "1px solid var(--hall-line-soft)",
                        borderBottom: "1px solid var(--hall-line-soft)",
                      }}
                    >
                      <p
                        className="text-[10px] uppercase tracking-[0.08em]"
                        style={{
                          fontFamily: "var(--font-hall-mono)",
                          color: "var(--hall-muted-2)",
                        }}
                      >
                        {type} · {byType[type].length}
                      </p>
                    </div>
                    <ul className="flex flex-col">
                      {byType[type].map(e => {
                        const d = e.date_captured ? new Date(e.date_captured) : null;
                        const conf = confidenceBadge(e.confidence_level, Boolean(e.source_excerpt?.trim()));
                        return (
                          <li
                            key={e.notion_id}
                            className="py-3"
                            style={{ borderTop: "1px solid var(--hall-line-soft)" }}
                          >
                            <div className="flex items-start gap-3">
                              <div
                                className="shrink-0 w-16 text-[10px] uppercase tracking-[0.06em] pt-0.5"
                                style={{
                                  fontFamily: "var(--font-hall-mono)",
                                  color: "var(--hall-muted-3)",
                                }}
                              >
                                {d ? d.toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : "—"}
                              </div>
                              <span
                                className="shrink-0 inline-flex items-center justify-center w-6 h-6 text-[10px] font-bold"
                                style={{
                                  background: conf.bg,
                                  color: conf.fg,
                                  borderRadius: 3,
                                  fontFamily: "var(--font-hall-mono)",
                                }}
                                title={`Confidence: ${e.confidence_level ?? "?"}${e.source_excerpt ? " · has excerpt" : " · no excerpt"}`}
                              >
                                {conf.label}
                              </span>
                              <div className="flex-1 min-w-0">
                                <p
                                  className="text-[13px] font-semibold leading-snug"
                                  style={{ color: "var(--hall-ink-0)" }}
                                >
                                  {e.title}
                                </p>
                                {e.evidence_statement && (
                                  <p
                                    className="text-[12px] mt-1 leading-relaxed"
                                    style={{ color: "var(--hall-ink-3)" }}
                                  >
                                    {e.evidence_statement.slice(0, 400)}
                                    {e.evidence_statement.length > 400 ? "…" : ""}
                                  </p>
                                )}
                                <div className="flex items-center gap-2 mt-2 flex-wrap">
                                  {e.workstream && (
                                    <span
                                      className="text-[9px] px-2 py-0.5 uppercase tracking-[0.06em]"
                                      style={{
                                        fontFamily: "var(--font-hall-mono)",
                                        background: "var(--hall-fill-soft)",
                                        color: "var(--hall-ink-3)",
                                        borderRadius: 3,
                                      }}
                                    >
                                      {e.workstream}
                                    </span>
                                  )}
                                  {e.stakeholder_function && (
                                    <span
                                      className="text-[9px] px-2 py-0.5 uppercase tracking-[0.06em]"
                                      style={{
                                        fontFamily: "var(--font-hall-mono)",
                                        border: "1px solid var(--hall-line-strong)",
                                        color: "var(--hall-ink-3)",
                                        borderRadius: 3,
                                      }}
                                    >
                                      {e.stakeholder_function}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>
      </main>
    </div>
  );
}
