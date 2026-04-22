import Link from "next/link";
import { Sidebar } from "@/components/Sidebar";
import { MetricCard } from "@/components/MetricCard";
import { ProposalActions } from "@/components/ProposalActions";
import { NAV } from "../page";
import { requireAdmin } from "@/lib/require-admin";
import {
  getTree,
  getRecentChangelog,
  getPendingProposals,
  parseSplitSuggestion,
  type TreeNode,
} from "@/lib/knowledge-nodes";

function daysSince(iso: string | null): number | null {
  if (!iso) return null;
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
}

function TreeRow({ node, depth = 0 }: { node: TreeNode; depth?: number }) {
  const isLeaf = node.children.length === 0;
  const dEvidence = daysSince(node.last_evidence_at);
  const href = `/admin/knowledge/${node.path}`;
  const indent = depth * 16;

  return (
    <>
      <Link
        href={href}
        className={`flex items-center gap-3 pr-6 py-3 border-b border-[#EFEFEA] hover:bg-[#EFEFEA]/40 transition-colors ${
          isLeaf ? "" : "bg-[#F7F7F2]/50"
        }`}
        style={{ paddingLeft: 24 + indent }}
      >
        <span className={`text-xs font-bold shrink-0 ${isLeaf ? "text-[#B2FF59]" : "text-[#131218]/30"}`}>
          {isLeaf ? "◉" : "▸"}
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2 flex-wrap">
            <p className={`truncate ${isLeaf ? "text-sm font-semibold text-[#131218]" : "text-[13px] font-bold text-[#131218]/90 uppercase tracking-wide"}`}>
              {node.title}
            </p>
            {isLeaf && node.tags.slice(0, 3).map(t => (
              <span key={t} className="text-[9px] font-bold bg-[#EFEFEA] text-[#131218]/40 px-2 py-0.5 rounded-full uppercase tracking-widest">
                {t}
              </span>
            ))}
          </div>
          {node.summary && (
            <p className="text-[11px] text-[#131218]/40 truncate mt-0.5">{node.summary}</p>
          )}
        </div>
        {isLeaf && (
          <div className="flex items-center gap-4 shrink-0">
            <div className="text-right">
              <p className={`text-[10px] font-bold uppercase tracking-widest ${dEvidence === null ? "text-[#131218]/20" : dEvidence <= 14 ? "text-[#B2FF59] bg-[#131218] px-2 py-0.5 rounded-full" : "text-[#131218]/30"}`}>
                {dEvidence === null ? "— empty" : dEvidence === 0 ? "Today" : `${dEvidence}d ago`}
              </p>
              <p className="text-[9px] text-[#131218]/30 uppercase tracking-widest mt-0.5">last evidence</p>
            </div>
            <div className="text-right">
              <p className="text-sm font-bold text-[#131218]">{node.reference_count}</p>
              <p className="text-[9px] text-[#131218]/30 uppercase tracking-widest">cited</p>
            </div>
          </div>
        )}
      </Link>
      {node.children.map(c => <TreeRow key={c.id} node={c} depth={depth + 1} />)}
    </>
  );
}

export default async function KnowledgePage() {
  await requireAdmin();

  const [tree, recentLog, proposals] = await Promise.all([
    getTree(),
    getRecentChangelog(7, 40),
    getPendingProposals(),
  ]);

  // Flatten to count leaves + totals
  const allFlat: TreeNode[] = [];
  const walk = (nodes: TreeNode[]) => nodes.forEach(n => { allFlat.push(n); walk(n.children); });
  walk(tree);

  const leaves = allFlat.filter(n => n.children.length === 0);
  const leavesWithEvidence = leaves.filter(n => n.last_evidence_at);
  const totalCitations = allFlat.reduce((sum, n) => sum + n.reference_count, 0);
  const staleLeaves = leaves.filter(n => {
    if (!n.last_evidence_at) return false;
    const d = daysSince(n.last_evidence_at);
    return d !== null && d > 60;
  });

  const appendsThisWeek = recentLog.filter(e => e.action === "APPEND").length;
  const proposalsThisWeek = recentLog.filter(e => e.status === "proposed").length;
  const ignoresThisWeek = recentLog.filter(e => e.action === "IGNORE").length;

  return (
    <div className="flex min-h-screen bg-[#EFEFEA]">
      <Sidebar items={NAV} isAdmin />

      <main className="flex-1 ml-[228px] overflow-auto">
        {/* Header */}
        <div className="bg-[#131218] px-10 py-10">
          <p className="text-[8px] font-bold uppercase tracking-[2.5px] text-white/20 mb-3">
            CONTROL ROOM · KNOWLEDGE
          </p>
          <h1 className="text-[2.6rem] font-[300] text-white leading-[1] tracking-[-1.5px]">
            Knowledge <em className="font-[900] italic text-[#c8f55a]">tree</em>
          </h1>
          <p className="text-[12.5px] text-white/40 mt-3 max-w-[560px] leading-[1.65]">
            Conocimiento destilado por el OS desde reuniones, emails y whatsapp validados. Árbol: themes → subthemes → topics; cada hoja es una página consumible que crece con cada reu.
            Para documentos externos (papers, reports, PDFs subidos), ver <a href="/library" className="underline decoration-[#c8f55a] decoration-2 underline-offset-2 text-white/70 hover:text-[#c8f55a]">Library</a>.
          </p>
        </div>

        <div className="px-8 py-6 space-y-6">

          {/* Metrics */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <MetricCard label="Nodes total"        value={allFlat.length}               />
            <MetricCard label="Leaf pages"         value={leaves.length}                 color="green" sub={`${leavesWithEvidence.length} con evidencia`} />
            <MetricCard label="New this week"      value={appendsThisWeek}               color={appendsThisWeek > 0 ? "green" : "default"} sub="APPENDs aplicados" />
            <MetricCard label="Pending review"     value={proposals.length}              color={proposals.length > 0 ? "yellow" : "default"} sub="SPLIT / AMEND propuestos" />
            <MetricCard label="Stale (60d+)"       value={staleLeaves.length}            color={staleLeaves.length > 0 ? "yellow" : "default"} sub="hojas sin updates" />
          </div>

          {/* Proposals — pending human review */}
          {proposals.length > 0 && (
            <div className="bg-white rounded-2xl border border-amber-200 overflow-hidden">
              <div className="h-1 bg-amber-400" />
              <div className="px-6 py-4 border-b border-[#EFEFEA] flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-bold text-[#131218] tracking-tight">Pending proposals</h2>
                  <p className="text-xs text-[#131218]/40 mt-0.5">
                    El curator propuso crear nodos nuevos (SPLIT) o modificar contenido existente (AMEND). Necesitan tu ojo.
                  </p>
                </div>
                <span className="text-[10px] font-bold bg-amber-100 text-amber-700 px-2.5 py-1 rounded-full uppercase tracking-widest">
                  {proposals.length} pending
                </span>
              </div>
              <div className="divide-y divide-[#EFEFEA]">
                {proposals.map(p => {
                  const split = p.action === "SPLIT" ? parseSplitSuggestion(p.reasoning) : null;
                  return (
                    <div key={p.id} className="px-6 py-4">
                      <div className="flex items-start gap-3">
                        <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full border uppercase tracking-widest shrink-0 ${
                          p.action === "SPLIT" ? "bg-purple-50 text-purple-700 border-purple-200"
                          : "bg-orange-50 text-orange-700 border-orange-200"
                        }`}>
                          {p.action}
                        </span>
                        <div className="flex-1 min-w-0">
                          {p.action === "SPLIT" && split ? (
                            <p className="text-sm font-semibold text-[#131218]">
                              <span className="text-[#131218]/40 font-mono text-xs">{split.path}</span>
                              {" — "}
                              {split.title}
                            </p>
                          ) : (
                            <p className="text-sm font-semibold text-[#131218]">
                              <Link href={`/admin/knowledge/${p.node_path}`} className="hover:underline">
                                {p.node_title}
                              </Link>
                              {p.section && <span className="text-[#131218]/40 ml-2">→ {p.section}</span>}
                            </p>
                          )}
                          <p className="text-[12px] text-[#131218]/60 mt-1 leading-relaxed">{p.reasoning}</p>
                          {p.action === "AMEND" && p.diff_before && (
                            <p className="text-[11px] text-red-600/70 bg-red-50/50 px-3 py-2 rounded-lg border border-red-100 mt-2 line-through">
                              {p.diff_before}
                            </p>
                          )}
                          {p.action === "AMEND" && p.diff_after && (
                            <p className="text-[11px] text-green-700 bg-green-50/50 px-3 py-2 rounded-lg border border-green-100 mt-1">
                              {p.diff_after}
                            </p>
                          )}
                          <ProposalActions
                            changelogId={p.id}
                            action={p.action === "SPLIT" ? "SPLIT" : "AMEND"}
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* What's new — recent curator activity across the tree */}
          {recentLog.length > 0 && (
            <div className="bg-white rounded-2xl border border-[#E0E0D8] overflow-hidden">
              <div className="h-1 bg-[#B2FF59]" />
              <div className="px-6 py-4 border-b border-[#EFEFEA] flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-bold text-[#131218] tracking-tight">What&apos;s new this week</h2>
                  <p className="text-xs text-[#131218]/40 mt-0.5">
                    Últimos cambios del curator: qué se agregó, dónde, con qué razón.
                  </p>
                </div>
                <p className="text-[10px] text-[#131218]/30 font-bold uppercase tracking-widest">
                  {appendsThisWeek} appended · {ignoresThisWeek} ignored · {proposalsThisWeek} proposed
                </p>
              </div>
              <div className="divide-y divide-[#EFEFEA] max-h-[500px] overflow-y-auto">
                {recentLog
                  .filter(e => e.action !== "IGNORE")
                  .slice(0, 30)
                  .map(e => {
                    const d = new Date(e.created_at);
                    return (
                      <Link
                        key={e.id}
                        href={`/admin/knowledge/${e.node_path}`}
                        className="block px-6 py-3 hover:bg-[#EFEFEA]/40 transition-colors"
                      >
                        <div className="flex items-start gap-3">
                          <div className="shrink-0 w-14 text-[10px] font-bold text-[#131218]/30 uppercase tracking-widest pt-0.5">
                            {d.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full uppercase tracking-widest ${
                                e.action === "APPEND" ? "bg-green-50 text-green-700 border border-green-200"
                                : e.action === "AMEND" ? "bg-orange-50 text-orange-700 border border-orange-200"
                                : e.action === "SPLIT" ? "bg-purple-50 text-purple-700 border border-purple-200"
                                : e.action === "CREATED" ? "bg-blue-50 text-blue-700 border border-blue-200"
                                : "bg-[#EFEFEA] text-[#131218]/40"
                              }`}>
                                {e.action}
                              </span>
                              <span className="text-xs font-semibold text-[#131218]">{e.node_title}</span>
                              {e.section && <span className="text-[10px] text-[#131218]/40">→ {e.section}</span>}
                            </div>
                            <p className="text-[12px] text-[#131218]/55 mt-1 line-clamp-2 leading-relaxed">{e.reasoning}</p>
                          </div>
                        </div>
                      </Link>
                    );
                  })}
              </div>
            </div>
          )}

          {/* Tree */}
          <div className="bg-white rounded-2xl border border-[#E0E0D8] overflow-hidden">
            <div className="h-1 bg-[#B2FF59]" />
            <div className="px-6 py-4 border-b border-[#EFEFEA]">
              <h2 className="text-sm font-bold text-[#131218] tracking-tight">Knowledge tree</h2>
              <p className="text-xs text-[#131218]/40 mt-0.5">
                Click en cualquier nodo para abrir. Leaf pages (◉) tienen contenido consumible. Categorías (▸) agrupan.
              </p>
            </div>

            {tree.length === 0 ? (
              <div className="px-6 py-10 text-center">
                <p className="text-sm font-medium text-[#131218]/30">El árbol está vacío.</p>
                <p className="text-xs text-[#131218]/20 mt-1">Seed el schema con nodos iniciales para empezar.</p>
              </div>
            ) : (
              <div>
                {tree.map(root => <TreeRow key={root.id} node={root} depth={0} />)}
              </div>
            )}
          </div>

          {/* How it works */}
          <div className="bg-white rounded-2xl border border-[#E0E0D8] p-6">
            <p className="text-[10px] font-bold text-[#131218]/30 uppercase tracking-widest mb-2">How it works</p>
            <ul className="text-[12px] text-[#131218]/60 space-y-1.5 leading-relaxed">
              <li>• <strong>Cada reu validada</strong> pasa por el <code className="text-[11px] bg-[#EFEFEA] px-1 py-0.5 rounded">knowledge-curator</code> agent.</li>
              <li>• El agent decide si la evidencia contiene un <em>insight de dominio</em> (generaliza) o solo un <em>project fact</em> (se ignora).</li>
              <li>• Los insights se escriben en la hoja relevante bajo la sección correcta (Available solutions / How to implement / Anti-patterns / Case studies).</li>
              <li>• Cada acción del agent queda en el changelog de la hoja con razón, diff y source.</li>
              <li>• Cuando otros agents (proposal-brief, prep-brief) citan una hoja, incrementa <code className="text-[11px] bg-[#EFEFEA] px-1 py-0.5 rounded">reference_count</code> — señal de valor real.</li>
            </ul>
          </div>

        </div>
      </main>
    </div>
  );
}
