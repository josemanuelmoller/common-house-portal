import Link from "next/link";
import { notFound } from "next/navigation";
import { Sidebar } from "@/components/Sidebar";
import { MetricCard } from "@/components/MetricCard";
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

function confidenceBadge(conf: string | null, hasExcerpt: boolean): { label: string; cls: string } {
  if (!conf) return { label: "?",  cls: "bg-[#EFEFEA] text-[#131218]/30" };
  if (conf === "High"   && hasExcerpt) return { label: "H", cls: "bg-[#B2FF59] text-[#131218]" };
  if (conf === "High")                 return { label: "H*", cls: "bg-amber-50 text-amber-700" };
  if (conf === "Medium")               return { label: "M", cls: "bg-[#EFEFEA] text-[#131218]/70" };
  if (conf === "Low")                  return { label: "L", cls: "bg-red-50 text-red-600" };
  return { label: "?", cls: "bg-[#EFEFEA] text-[#131218]/30" };
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
    <div className="flex min-h-screen bg-[#EFEFEA]">
      <Sidebar items={NAV} isAdmin />
      <main className="flex-1 ml-[228px] overflow-auto">
        <div className="bg-[#131218] px-10 py-10">
          <Link href="/admin/knowledge/cases" className="text-[10px] text-white/30 font-bold uppercase tracking-widest hover:text-[#c8f55a] transition-colors">
            ← All cases
          </Link>
          <p className="text-[10px] font-bold font-mono text-white/30 uppercase tracking-widest mt-3">{caseData.code}</p>
          <h1 className="text-[2.6rem] font-[300] text-white leading-[1] tracking-[-1.5px] mt-1">
            <em className="font-[900] italic text-[#c8f55a]">{caseData.project_name ?? caseData.code}</em>
          </h1>
          <div className="flex items-center gap-3 mt-3 flex-wrap">
            {caseData.geography && (
              <span className="text-[10px] font-bold bg-white/5 text-white/50 border border-white/10 px-2 py-0.5 rounded-full font-mono">
                {caseData.geography}
              </span>
            )}
            {caseData.year && (
              <span className="text-[10px] text-white/40">{caseData.year}</span>
            )}
            <span className="text-[10px] text-white/40">· {evidence.length} evidence</span>
            <span className="text-[10px] text-white/40">· {leavesReferencing.length} leaves referencing</span>
          </div>
        </div>

        <div className="px-8 py-6 space-y-6 max-w-[960px]">

          {/* Leaves that reference this case */}
          {leavesReferencing.length > 0 && (
            <div className="bg-white rounded-[14px] border border-[#E0E0D8] overflow-hidden">
              <div className="h-1 bg-[#B2FF59]" />
              <div className="px-6 py-4 border-b border-[#EFEFEA]">
                <h2 className="text-sm font-bold text-[#131218] tracking-tight">Leaves that reference this case</h2>
                <p className="text-xs text-[#131218]/40 mt-0.5">Knowledge nodes where this case appears in at least one bullet.</p>
              </div>
              <div className="divide-y divide-[#EFEFEA]">
                {leavesReferencing.map(n => (
                  <Link key={n.id} href={`/admin/knowledge/${n.path}`}
                        className="block px-6 py-3 hover:bg-[#EFEFEA]/40 transition-colors">
                    <p className="text-[10px] font-bold font-mono text-[#131218]/25 uppercase tracking-widest">{n.path}</p>
                    <p className="text-sm font-semibold text-[#131218] mt-0.5">{n.title}</p>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* Evidence grouped by type */}
          <div className="bg-white rounded-[14px] border border-[#E0E0D8] overflow-hidden">
            <div className="h-1 bg-[#131218]" />
            <div className="px-6 py-4 border-b border-[#EFEFEA]">
              <h2 className="text-sm font-bold text-[#131218] tracking-tight">All evidence for this case</h2>
              <p className="text-xs text-[#131218]/40 mt-0.5">{evidence.length} validated evidence records tagged with <code className="text-[11px] bg-[#EFEFEA] px-1 py-0.5 rounded">{caseData.code}</code>.</p>
            </div>
            {evidence.length === 0 ? (
              <div className="px-6 py-10 text-center text-sm text-[#131218]/30">
                No evidence found for this case.
              </div>
            ) : (
              <div className="divide-y divide-[#EFEFEA]">
                {sortedTypes.map(type => (
                  <div key={type}>
                    <div className="px-6 py-2 bg-[#F7F7F2] border-y border-[#EFEFEA]">
                      <p className="text-[10px] font-bold text-[#131218]/40 uppercase tracking-widest">
                        {type} · {byType[type].length}
                      </p>
                    </div>
                    {byType[type].map(e => {
                      const d = e.date_captured ? new Date(e.date_captured) : null;
                      const conf = confidenceBadge(e.confidence_level, Boolean(e.source_excerpt?.trim()));
                      return (
                        <div key={e.notion_id} className="px-6 py-4">
                          <div className="flex items-start gap-3">
                            <div className="shrink-0 w-16 text-[10px] font-bold text-[#131218]/30 uppercase tracking-widest pt-0.5">
                              {d ? d.toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : "—"}
                            </div>
                            <span className={`shrink-0 inline-flex items-center justify-center w-6 h-6 text-[10px] font-bold rounded-full ${conf.cls}`} title={`Confidence: ${e.confidence_level ?? "?"}${e.source_excerpt ? " · has excerpt" : " · no excerpt"}`}>
                              {conf.label}
                            </span>
                            <div className="flex-1 min-w-0">
                              <p className="text-[13px] font-semibold text-[#131218] leading-snug">{e.title}</p>
                              {e.evidence_statement && (
                                <p className="text-[12px] text-[#131218]/60 mt-1 leading-relaxed">
                                  {e.evidence_statement.slice(0, 400)}{e.evidence_statement.length > 400 ? "…" : ""}
                                </p>
                              )}
                              <div className="flex items-center gap-2 mt-2 flex-wrap">
                                {e.workstream && (
                                  <span className="text-[9px] font-bold bg-[#EFEFEA] text-[#131218]/60 px-2 py-0.5 rounded-full uppercase tracking-widest">
                                    {e.workstream}
                                  </span>
                                )}
                                {e.stakeholder_function && (
                                  <span className="text-[9px] font-bold bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full uppercase tracking-widest">
                                    {e.stakeholder_function}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
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
