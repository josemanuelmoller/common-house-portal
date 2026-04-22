import Link from "next/link";
import { Sidebar } from "@/components/Sidebar";
import { MetricCard } from "@/components/MetricCard";
import { NAV } from "../page";
import { requireAdmin } from "@/lib/require-admin";
import { getTree, type TreeNode } from "@/lib/knowledge-nodes";

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

  const tree = await getTree();

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
            Themes → subthemes → topics. Cada hoja es una página consumible que se va nutriendo con insights de las reuniones y evidencias validadas.
          </p>
        </div>

        <div className="px-8 py-6 space-y-6">

          {/* Metrics */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <MetricCard label="Nodes total"        value={allFlat.length}               />
            <MetricCard label="Leaf pages"         value={leaves.length}                 color="green" sub={`${leavesWithEvidence.length} con evidencia`} />
            <MetricCard label="Citations"          value={totalCitations}                color="blue"  sub="veces leídas por agentes" />
            <MetricCard label="Stale (60d+)"       value={staleLeaves.length}            color={staleLeaves.length > 0 ? "yellow" : "default"} sub="hojas sin updates" />
          </div>

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
