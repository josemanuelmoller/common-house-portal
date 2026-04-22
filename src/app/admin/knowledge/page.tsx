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

// Extract the first paragraph under "## Overview" as a preview (first 240 chars).
function extractOverviewPreview(body_md: string): string | null {
  const m = body_md.match(/^##\s+Overview\s*\n+([^\n#][\s\S]*?)(?=\n##\s|\n$)/m);
  if (!m) return null;
  const cleaned = m[1]
    .replace(/_\([^)]*\)_/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (cleaned.length < 20) return null;
  return cleaned.length > 240 ? cleaned.slice(0, 240).trimEnd() + "…" : cleaned;
}

// Parse case codes from a body_md to show chips on the leaf card.
function extractCaseCodes(body_md: string): string[] {
  const matches = body_md.match(/\[[A-Z0-9]+-[A-Z]{2,3}-\d{4}\]/g) ?? [];
  return [...new Set(matches.map(c => c.slice(1, -1)))].sort();
}

// Count bullets: lines starting with "-" at any indent.
function countBullets(body_md: string): number {
  return (body_md.match(/^[ \t]*-\s+/gm) ?? []).length;
}

function freshnessClass(dEvidence: number | null): { pill: string; label: string } {
  if (dEvidence === null) return { pill: "bg-[#EFEFEA] text-[#131218]/25", label: "empty" };
  if (dEvidence === 0)    return { pill: "bg-[#131218] text-[#B2FF59]",    label: "Today" };
  if (dEvidence <= 7)     return { pill: "bg-[#B2FF59] text-[#131218]",    label: `${dEvidence}d ago` };
  if (dEvidence <= 30)    return { pill: "bg-[#EFEFEA] text-[#131218]/70", label: `${dEvidence}d ago` };
  if (dEvidence <= 60)    return { pill: "bg-amber-50 text-amber-700",     label: `${dEvidence}d ago` };
  return { pill: "bg-red-50 text-red-600",                                 label: `${dEvidence}d · stale` };
}

/** Populated leaf — full card with preview + cases + meta. */
function LeafCard({ leaf }: { leaf: TreeNode }) {
  const dEvidence = daysSince(leaf.last_evidence_at);
  const freshness = freshnessClass(dEvidence);
  const preview = extractOverviewPreview(leaf.body_md);
  const cases = extractCaseCodes(leaf.body_md);
  const bulletCount = countBullets(leaf.body_md);
  const isHot = dEvidence !== null && dEvidence <= 7;
  const isStale = dEvidence !== null && dEvidence > 60;

  return (
    <Link
      href={`/admin/knowledge/${leaf.path}`}
      className={`group relative flex flex-col bg-white rounded-[14px] border transition-all duration-150 ease-out hover:-translate-y-[2px] hover:border-[#131218]/30 ${
        isStale ? "border-amber-200" : "border-[#E0E0D8]"
      }`}
    >
      {isHot && (
        <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-[#B2FF59] via-[#B2FF59] to-transparent rounded-t-[14px]" />
      )}
      <div className="p-5 flex-1 flex flex-col min-h-0">
        {/* Path breadcrumb */}
        <p className="text-[9px] font-bold font-mono text-[#131218]/25 uppercase tracking-widest mb-2 truncate">
          {leaf.path.split("/").slice(0, -1).join(" › ") || leaf.path}
        </p>

        {/* Title */}
        <h3 className="text-[22px] font-semibold tracking-tight text-[#131218] leading-tight mb-3 group-hover:text-[#131218]">
          {leaf.title}
        </h3>

        {/* Preview or summary */}
        <p className="text-[12.5px] text-[#131218]/55 leading-relaxed line-clamp-3 flex-1">
          {preview ?? leaf.summary ?? "—"}
        </p>

        {/* Case chips */}
        {cases.length > 0 && (
          <div className="mt-4 flex items-center gap-1.5 flex-wrap">
            {cases.slice(0, 3).map(c => (
              <span
                key={c}
                className="text-[9.5px] font-mono font-medium text-[#131218]/55 bg-[#F7F7F2] px-2 py-0.5 rounded border border-[#EFEFEA] tracking-tight"
              >
                {c}
              </span>
            ))}
            {cases.length > 3 && (
              <span className="text-[9.5px] font-mono text-[#131218]/40">+{cases.length - 3}</span>
            )}
          </div>
        )}
      </div>

      {/* Footer meta */}
      <div className="px-5 py-3 border-t border-[#EFEFEA] flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 text-[10px] font-bold uppercase tracking-widest text-[#131218]/35">
          <span>{bulletCount} bullet{bulletCount !== 1 ? "s" : ""}</span>
          {cases.length > 0 && <span className="text-[#131218]/15">·</span>}
          {cases.length > 0 && <span>{cases.length} case{cases.length !== 1 ? "s" : ""}</span>}
          {leaf.reference_count > 0 && <span className="text-[#131218]/15">·</span>}
          {leaf.reference_count > 0 && <span>{leaf.reference_count} cited</span>}
        </div>
        <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full uppercase tracking-widest ${freshness.pill}`}>
          {freshness.label}
        </span>
      </div>
    </Link>
  );
}

/** Empty leaf — slim chip, collapsed visual weight. */
function EmptyLeafChip({ leaf }: { leaf: TreeNode }) {
  return (
    <Link
      href={`/admin/knowledge/${leaf.path}`}
      className="inline-flex items-center gap-2 px-3 py-1.5 bg-[#EFEFEA]/60 border border-dashed border-[#E0E0D8] rounded-full hover:bg-[#EFEFEA] transition-colors"
    >
      <span className="text-[9px] font-bold text-[#131218]/25 uppercase tracking-widest">
        {leaf.title}
      </span>
      <span className="text-[8px] font-bold text-[#131218]/20 uppercase tracking-widest">
        empty
      </span>
    </Link>
  );
}

type SubthemeGroup = { subtheme: TreeNode; populatedLeaves: TreeNode[]; emptyLeaves: TreeNode[] };

function ThemeSection({ theme }: { theme: TreeNode }) {
  // Flatten this theme's descendants and organise by subtheme
  const groups: SubthemeGroup[] = [];
  const orphans: TreeNode[] = [];

  for (const child of theme.children) {
    if (child.children.length > 0) {
      // Treat this child as a subtheme; its children are leaves
      const populatedLeaves = child.children.filter(l => l.body_md.trim().length > 200 || l.last_evidence_at);
      const emptyLeaves     = child.children.filter(l => !(l.body_md.trim().length > 200 || l.last_evidence_at));
      groups.push({ subtheme: child, populatedLeaves, emptyLeaves });
    } else {
      // Child is itself a leaf (direct under the theme)
      orphans.push(child);
    }
  }

  // Stats
  const allLeaves = theme.children.flatMap(c => c.children.length > 0 ? c.children : [c]);
  const populatedTotal = allLeaves.filter(l => l.body_md.trim().length > 200 || l.last_evidence_at).length;
  const totalLeaves = allLeaves.length;
  const totalBullets = allLeaves.reduce((sum, l) => sum + countBullets(l.body_md), 0);
  const uniqueCases = new Set(allLeaves.flatMap(l => extractCaseCodes(l.body_md)));

  return (
    <section className="space-y-5">
      <header className="flex items-baseline justify-between gap-4 pb-2 border-b-2 border-[#131218]">
        <div>
          <h2 className="text-[28px] font-[300] tracking-tight text-[#131218] leading-none">
            <em className="font-[900] italic text-[#131218]">{theme.title}</em>
          </h2>
          {theme.summary && (
            <p className="text-[12px] text-[#131218]/45 mt-1.5 leading-relaxed max-w-[560px]">
              {theme.summary}
            </p>
          )}
        </div>
        <div className="shrink-0 text-right">
          <p className="text-[10px] font-bold text-[#131218]/30 uppercase tracking-widest">
            {populatedTotal}/{totalLeaves} populated
          </p>
          <p className="text-[10px] text-[#131218]/25 mt-0.5 font-mono">
            {totalBullets} bullets · {uniqueCases.size} case{uniqueCases.size !== 1 ? "s" : ""}
          </p>
        </div>
      </header>

      {groups.map(g => (
        <div key={g.subtheme.id} className="space-y-3">
          <div className="flex items-baseline justify-between">
            <Link href={`/admin/knowledge/${g.subtheme.path}`} className="text-[10px] font-bold text-[#131218]/40 uppercase tracking-[2px] hover:text-[#131218] transition-colors">
              {g.subtheme.title}
            </Link>
            <p className="text-[9px] text-[#131218]/25 font-mono">
              {g.populatedLeaves.length}/{g.populatedLeaves.length + g.emptyLeaves.length}
            </p>
          </div>
          {g.populatedLeaves.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {g.populatedLeaves.map(l => <LeafCard key={l.id} leaf={l} />)}
            </div>
          )}
          {g.emptyLeaves.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap">
              {g.emptyLeaves.map(l => <EmptyLeafChip key={l.id} leaf={l} />)}
            </div>
          )}
        </div>
      ))}

      {/* Orphan leaves (direct children of the theme with no subtheme) */}
      {orphans.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {orphans.map(l => (l.body_md.trim().length > 200 || l.last_evidence_at)
            ? <LeafCard key={l.id} leaf={l} />
            : <EmptyLeafChip key={l.id} leaf={l} />
          )}
        </div>
      )}
    </section>
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

          {/* Metrics — compact strip */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <MetricCard label="Nodes total"        value={allFlat.length}               />
            <MetricCard label="Leaf pages"         value={leaves.length}                 color="green" sub={`${leavesWithEvidence.length} con evidencia`} />
            <MetricCard label="New this week"      value={appendsThisWeek}               color={appendsThisWeek > 0 ? "green" : "default"} sub="APPENDs aplicados" />
            <MetricCard label="Pending review"     value={proposals.length}              color={proposals.length > 0 ? "yellow" : "default"} sub="SPLIT / AMEND propuestos" />
            <MetricCard label="Stale (60d+)"       value={staleLeaves.length}            color={staleLeaves.length > 0 ? "yellow" : "default"} sub="hojas sin updates" />
          </div>

          {/* Themes — primary surface. Theme sections with leaf cards. */}
          {tree.length === 0 ? (
            <div className="bg-white rounded-[14px] border border-[#E0E0D8] px-6 py-10 text-center">
              <p className="text-sm font-medium text-[#131218]/30">El árbol está vacío.</p>
              <p className="text-xs text-[#131218]/20 mt-1">Seed el schema con nodos iniciales para empezar.</p>
            </div>
          ) : (
            <div className="space-y-10">
              {tree.map(root => <ThemeSection key={root.id} theme={root} />)}
            </div>
          )}

          {/* Activity — everything operational lives here, collapsed by default */}
          {(proposals.length > 0 || recentLog.length > 0) && (
            <div className="space-y-3">
              <p className="text-[10px] font-bold text-[#131218]/30 uppercase tracking-widest px-1">
                Activity
              </p>

              {/* Pending proposals — open by default if there are any */}
              {proposals.length > 0 && (
                <details open className="bg-white rounded-2xl border border-amber-200 overflow-hidden group">
                  <summary className="px-6 py-3 cursor-pointer list-none flex items-center justify-between hover:bg-amber-50/30 transition-colors">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] opacity-40 group-open:rotate-90 transition-transform">▶</span>
                      <span className="text-sm font-bold text-[#131218] tracking-tight">Pending proposals</span>
                      <span className="text-xs text-[#131218]/40">— SPLIT / AMEND del curator</span>
                    </div>
                    <span className="text-[10px] font-bold bg-amber-100 text-amber-700 px-2.5 py-1 rounded-full uppercase tracking-widest">
                      {proposals.length} pending
                    </span>
                  </summary>
                  <div className="divide-y divide-[#EFEFEA] border-t border-[#EFEFEA]">
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
                              <p className="text-[12px] text-[#131218]/60 mt-1 leading-relaxed line-clamp-2">{p.reasoning}</p>
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
                </details>
              )}

              {/* What's new — collapsed by default, preview 5 inside */}
              {recentLog.length > 0 && (() => {
                const items = recentLog.filter(e => e.action !== "IGNORE");
                const preview = items.slice(0, 5);
                const rest    = items.slice(5);
                return (
                  <details className="bg-white rounded-2xl border border-[#E0E0D8] overflow-hidden group">
                    <summary className="px-6 py-3 cursor-pointer list-none flex items-center justify-between hover:bg-[#EFEFEA]/40 transition-colors">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] opacity-40 group-open:rotate-90 transition-transform">▶</span>
                        <span className="text-sm font-bold text-[#131218] tracking-tight">What&apos;s new this week</span>
                        <span className="text-xs text-[#131218]/40">— últimos cambios del curator</span>
                      </div>
                      <span className="text-[10px] font-bold text-[#131218]/40 uppercase tracking-widest">
                        {appendsThisWeek} appended · {ignoresThisWeek} ignored · {proposalsThisWeek} proposed
                      </span>
                    </summary>

                    {/* Preview strip — first 5 always visible when the details is open */}
                    <div className="divide-y divide-[#EFEFEA] border-t border-[#EFEFEA]">
                      {preview.map(e => {
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
                                <p className="text-[12px] text-[#131218]/55 mt-1 line-clamp-1 leading-relaxed">{e.reasoning}</p>
                              </div>
                            </div>
                          </Link>
                        );
                      })}

                      {/* Remaining entries inside a nested details */}
                      {rest.length > 0 && (
                        <details className="group/more">
                          <summary className="px-6 py-2 cursor-pointer list-none text-[10px] font-bold text-[#131218]/40 uppercase tracking-widest hover:bg-[#EFEFEA]/40 transition-colors">
                            + {rest.length} more
                          </summary>
                          <div className="divide-y divide-[#EFEFEA]">
                            {rest.map(e => {
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
                                      <p className="text-[12px] text-[#131218]/55 mt-1 line-clamp-1 leading-relaxed">{e.reasoning}</p>
                                    </div>
                                  </div>
                                </Link>
                              );
                            })}
                          </div>
                        </details>
                      )}
                    </div>
                  </details>
                );
              })()}
            </div>
          )}

          {/* How it works — collapsed, foot-of-page reference */}
          <details className="bg-white rounded-[14px] border border-[#E0E0D8] group">
            <summary className="px-6 py-3 cursor-pointer list-none flex items-center gap-2 hover:bg-[#EFEFEA]/40 transition-colors">
              <span className="text-[10px] opacity-40 group-open:rotate-90 transition-transform">▶</span>
              <span className="text-[10px] font-bold text-[#131218]/40 uppercase tracking-widest">How it works</span>
            </summary>
            <ul className="px-6 pb-5 pt-1 text-[12px] text-[#131218]/60 space-y-1.5 leading-relaxed border-t border-[#EFEFEA]">
              <li>• <strong>Cada reu validada</strong> pasa por el <code className="text-[11px] bg-[#EFEFEA] px-1 py-0.5 rounded">knowledge-curator</code> agent.</li>
              <li>• El agent decide si la evidencia contiene un <em>insight de dominio</em> (generaliza) o solo un <em>project fact</em> (se ignora).</li>
              <li>• Cada bullet lleva un código de case (ej. <code className="text-[11px] bg-[#EFEFEA] px-1 py-0.5 rounded">[AUTOMERCADO-CR-2026]</code>) para identificar la instancia concreta.</li>
              <li>• El synthesizer genera playbooks prosa agrupando por modalidad y case. El árbol acumula bullets; el playbook narra.</li>
              <li>• Cuando otros agents (prep-brief, proposal-brief) citan una hoja, incrementa <code className="text-[11px] bg-[#EFEFEA] px-1 py-0.5 rounded">reference_count</code> — señal de valor real.</li>
            </ul>
          </details>

        </div>
      </main>
    </div>
  );
}
