import Link from "next/link";
import { Sidebar } from "@/components/Sidebar";
import { HallSection } from "@/components/HallSection";
import { MetricCard } from "@/components/MetricCard";
import { ProposalActions } from "@/components/ProposalActions";
import { KnowledgeSearch } from "@/components/KnowledgeSearch";
import { NAV } from "../page";
import { requireAdmin } from "@/lib/require-admin";
import {
  getTree,
  getRecentChangelog,
  getPendingProposals,
  parseSplitSuggestion,
  type TreeNode,
} from "@/lib/knowledge-nodes";
import { getSupabaseServerClient } from "@/lib/supabase-server";

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

function freshnessStyle(dEvidence: number | null): { style: React.CSSProperties; label: string } {
  if (dEvidence === null) return {
    style: { background: "var(--hall-fill-soft)", color: "var(--hall-muted-3)" },
    label: "empty",
  };
  if (dEvidence === 0) return {
    style: { background: "var(--hall-ink-0)", color: "var(--hall-paper-0)" },
    label: "Today",
  };
  if (dEvidence <= 7) return {
    style: { background: "var(--hall-ok-soft)", color: "var(--hall-ok)" },
    label: `${dEvidence}d ago`,
  };
  if (dEvidence <= 30) return {
    style: { background: "var(--hall-fill-soft)", color: "var(--hall-ink-3)" },
    label: `${dEvidence}d ago`,
  };
  if (dEvidence <= 60) return {
    style: { background: "var(--hall-warn-paper)", color: "var(--hall-warn)" },
    label: `${dEvidence}d ago`,
  };
  return {
    style: { background: "var(--hall-danger-soft)", color: "var(--hall-danger)" },
    label: `${dEvidence}d · stale`,
  };
}

// Modality glyphs — Unicode icons that visually encode the node type.
// Uses platform-agnostic geometric glyphs that render consistently across OS.
function glyphForNode(path: string): string {
  // Refill modalities
  if (path.endsWith("/refill/on-the-go"))       return "◐"; // half-filled circle = liquid dispenser
  if (path.endsWith("/refill/at-home"))         return "◘"; // solid block = solid refill cartridge
  if (path.endsWith("/refill"))                 return "◉"; // generic refill category
  // Return modalities
  if (path.endsWith("/return/on-the-go"))       return "▲"; // drop-off (hand up)
  if (path.endsWith("/return/from-home"))       return "▼"; // pickup (come down)
  if (path.endsWith("/return"))                 return "⟲"; // generic return category
  // Other packaging
  if (path.endsWith("/transit"))                return "▦"; // pallet / transit
  // Themes/subthemes
  if (path === "reuse")                         return "◎";
  if (path === "organics")                      return "◈";
  if (path === "new-materials")                 return "◇";
  if (path.startsWith("reuse/packaging"))       return "▤";
  if (path.startsWith("reuse/electronics"))     return "◫";
  if (path.startsWith("reuse/textile"))         return "◪";
  if (path.startsWith("reuse/construction"))    return "◧";
  if (path.startsWith("organics/compost"))      return "⬢";
  if (path.startsWith("organics/biodigestor"))  return "⬣";
  if (path.startsWith("new-materials/biomaterials")) return "◆";
  return "◉";
}

/** Populated leaf — full card with preview + cases + meta. */
function LeafCard({ leaf }: { leaf: TreeNode }) {
  const dEvidence = daysSince(leaf.last_evidence_at);
  const freshness = freshnessStyle(dEvidence);
  const preview = extractOverviewPreview(leaf.body_md);
  const cases = extractCaseCodes(leaf.body_md);
  const bulletCount = countBullets(leaf.body_md);
  const isHot = dEvidence !== null && dEvidence <= 7;
  const isStale = dEvidence !== null && dEvidence > 60;
  const hasChildren = leaf.children.length > 0;

  return (
    <div
      className="group relative flex flex-col transition-all duration-150 ease-out hover:-translate-y-[2px]"
      style={{
        border: `1px solid ${isStale ? "var(--hall-warn)" : "var(--hall-line)"}`,
        background: "var(--hall-paper-0)",
      }}
    >
      {/* Card-wide navigation overlay (behind interactive children) */}
      <Link
        href={`/admin/knowledge/${leaf.path}`}
        aria-label={`Open ${leaf.title}`}
        className="absolute inset-0 z-0"
      />
      {isHot && (
        <div
          className="absolute top-0 left-0 right-0 h-[2px] pointer-events-none"
          style={{ background: "var(--hall-ok)" }}
        />
      )}
      <div className="relative p-5 flex-1 flex flex-col min-h-0 pointer-events-none">
        {/* Path breadcrumb with modality glyph */}
        <div className="flex items-center gap-2 mb-2">
          <span className="text-[14px] leading-none" style={{ color: "var(--hall-muted-3)" }}>{glyphForNode(leaf.path)}</span>
          <p
            className="text-[9px] font-bold uppercase tracking-widest truncate"
            style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted-3)" }}
          >
            {leaf.path.split("/").slice(0, -1).join(" › ") || leaf.path}
          </p>
        </div>

        {/* Title */}
        <div className="flex items-start justify-between gap-2 mb-3">
          <h3
            className="text-[22px] font-semibold tracking-tight leading-[1.15]"
            style={{ color: "var(--hall-ink-0)" }}
          >
            {leaf.title}
          </h3>
          {hasChildren && (
            <span
              className="shrink-0 text-[9px] font-bold px-2 py-0.5 rounded-full uppercase tracking-widest"
              style={{ background: "var(--hall-ink-0)", color: "var(--hall-paper-0)", fontFamily: "var(--font-hall-mono)" }}
            >
              {leaf.children.length} modes
            </span>
          )}
        </div>

        {/* Preview or summary */}
        <p
          className="text-[12.5px] leading-relaxed line-clamp-3 flex-1"
          style={{ color: "var(--hall-muted-2)" }}
        >
          {preview ?? leaf.summary ?? "—"}
        </p>

        {/* Sub-mode chips (when this card is a category with children) */}
        {hasChildren && (
          <div className="mt-4 flex items-center gap-1.5 flex-wrap">
            {leaf.children.map(c => (
              <span
                key={c.id}
                className="inline-flex items-center gap-1.5 text-[10px] font-semibold pl-2 pr-2.5 py-1 rounded-full"
                style={{
                  background: "var(--hall-fill-soft)",
                  border: "1px solid var(--hall-line)",
                  color: "var(--hall-ink-0)",
                }}
              >
                <span className="text-[12px] leading-none" style={{ color: "var(--hall-muted-2)" }}>{glyphForNode(c.path)}</span>
                {c.title}
              </span>
            ))}
          </div>
        )}

        {/* Case chips — clickable to pivot to case detail (pointer-events re-enabled) */}
        {!hasChildren && cases.length > 0 && (
          <div className="mt-4 flex items-center gap-1.5 flex-wrap pointer-events-auto relative z-10">
            {cases.slice(0, 3).map(c => (
              <Link
                key={c}
                href={`/admin/knowledge/cases/${encodeURIComponent(c)}`}
                className="text-[9.5px] font-medium px-2 py-0.5 tracking-tight transition-colors uppercase"
                style={{
                  fontFamily: "var(--font-hall-mono)",
                  color: "var(--hall-ink-0)",
                  background: "var(--hall-paper-0)",
                  border: "1px solid var(--hall-ink-0)",
                }}
              >
                {c}
              </Link>
            ))}
            {cases.length > 3 && (
              <span
                className="text-[9.5px]"
                style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted-3)" }}
              >
                +{cases.length - 3}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Footer meta */}
      <div
        className="relative px-5 py-3 flex items-center justify-between gap-3 pointer-events-none"
        style={{ borderTop: "1px solid var(--hall-line-soft)" }}
      >
        <div
          className="flex items-center gap-3 text-[10px] uppercase tracking-widest"
          style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted-3)" }}
        >
          <span>{bulletCount} bullet{bulletCount !== 1 ? "s" : ""}</span>
          {cases.length > 0 && <span style={{ color: "var(--hall-line)" }}>·</span>}
          {cases.length > 0 && <span>{cases.length} case{cases.length !== 1 ? "s" : ""}</span>}
          {leaf.reference_count > 0 && <span style={{ color: "var(--hall-line)" }}>·</span>}
          {leaf.reference_count > 0 && <span>{leaf.reference_count} cited</span>}
        </div>
        <span
          className="text-[9px] font-bold px-2 py-0.5 rounded-full uppercase tracking-widest"
          style={{ ...freshness.style, fontFamily: "var(--font-hall-mono)" }}
        >
          {freshness.label}
        </span>
      </div>
    </div>
  );
}

/** Empty leaf — slim chip, collapsed visual weight. */
function EmptyLeafChip({ leaf }: { leaf: TreeNode }) {
  return (
    <Link
      href={`/admin/knowledge/${leaf.path}`}
      className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full transition-colors"
      style={{
        background: "var(--hall-fill-soft)",
        border: "1px dashed var(--hall-line-strong)",
      }}
    >
      <span
        className="text-[9px] font-bold uppercase tracking-widest"
        style={{ color: "var(--hall-muted-3)", fontFamily: "var(--font-hall-mono)" }}
      >
        {leaf.title}
      </span>
      <span
        className="text-[8px] font-bold uppercase tracking-widest"
        style={{ color: "var(--hall-muted-3)", fontFamily: "var(--font-hall-mono)" }}
      >
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
      <header
        className="flex items-baseline justify-between gap-4 pb-2"
        style={{ borderBottom: "1px solid var(--hall-ink-0)" }}
      >
        <div>
          <h2
            className="text-[19px] font-bold leading-none"
            style={{ letterSpacing: "-0.02em", color: "var(--hall-ink-0)" }}
          >
            <em
              style={{
                fontFamily: "var(--font-hall-display)",
                fontStyle: "italic",
                fontWeight: 400,
                color: "var(--hall-ink-0)",
              }}
            >
              {theme.title}
            </em>
          </h2>
          {theme.summary && (
            <p
              className="text-[12px] mt-1.5 leading-relaxed max-w-[560px]"
              style={{ color: "var(--hall-muted-2)" }}
            >
              {theme.summary}
            </p>
          )}
        </div>
        <div className="shrink-0 text-right">
          <p
            className="text-[10px] font-bold uppercase tracking-widest"
            style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted-2)" }}
          >
            {populatedTotal}/{totalLeaves} populated
          </p>
          <p
            className="text-[10px] mt-0.5"
            style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted-3)" }}
          >
            {totalBullets} bullets · {uniqueCases.size} case{uniqueCases.size !== 1 ? "s" : ""}
          </p>
        </div>
      </header>

      {groups.map(g => (
        <div key={g.subtheme.id} className="space-y-3">
          <div className="flex items-baseline justify-between">
            <Link
              href={`/admin/knowledge/${g.subtheme.path}`}
              className="text-[10px] font-bold uppercase tracking-[2px] transition-colors"
              style={{ color: "var(--hall-muted-2)", fontFamily: "var(--font-hall-mono)" }}
            >
              {g.subtheme.title}
            </Link>
            <p
              className="text-[9px]"
              style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted-3)" }}
            >
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

  const sb = getSupabaseServerClient();
  const [tree, recentLog, proposals, { data: casesForSearch }] = await Promise.all([
    getTree(),
    getRecentChangelog(7, 40),
    getPendingProposals(),
    sb.from("knowledge_cases").select("code, title, project_name, geography, year"),
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

  // Build search index (nodes + cases)
  const searchItems: Array<{ path: string; title: string; summary: string; body_preview: string; kind: "node" | "case"; case_code?: string }> = [
    ...allFlat.map(n => ({
      path: n.path,
      title: n.title,
      summary: n.summary,
      body_preview: n.body_md.slice(0, 400),
      kind: "node" as const,
    })),
    ...(((casesForSearch as { code: string; title: string; project_name: string | null; geography: string | null; year: number | null }[] | null) ?? []).map(c => ({
      path: c.code,
      title: `${c.project_name ?? c.code}${c.geography ? ` · ${c.geography}` : ""}${c.year ? ` · ${c.year}` : ""}`,
      summary: c.title,
      body_preview: "",
      kind: "case" as const,
      case_code: c.code,
    }))),
  ];

  return (
    <div className="flex min-h-screen bg-[#f4f4ef]">
      <Sidebar items={NAV} isAdmin />

      <main
        className="flex-1 ml-[228px] overflow-auto"
        style={{ fontFamily: "var(--font-hall-sans)", background: "var(--hall-paper-0)" }}
      >
        <header
          className="flex items-center justify-between gap-6 px-9 py-3.5"
          style={{ borderBottom: "1px solid var(--hall-ink-0)" }}
        >
          <div className="flex items-baseline gap-4 min-w-0">
            <span
              className="text-[10px] tracking-[0.08em] whitespace-nowrap uppercase"
              style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted-2)" }}
            >
              KNOWLEDGE · <b style={{ color: "var(--hall-ink-0)" }}>{allFlat.length} NODES</b>
            </span>
            <h1
              className="text-[16px] font-medium tracking-[-0.01em] truncate"
              style={{ color: "var(--hall-ink-0)" }}
            >
              Knowledge{" "}
              <em style={{ fontFamily: "var(--font-hall-display)", fontStyle: "italic", fontWeight: 400 }}>
                tree
              </em>.
            </h1>
          </div>
          <Link
            href="/admin/knowledge/add"
            className="hall-btn-primary"
            style={{ padding: "6px 12px", fontSize: 12 }}
          >
            + Add external
          </Link>
        </header>

        <div className="px-9 py-6 space-y-6">

          {/* Metrics — compact strip */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <MetricCard label="Nodes total"        value={allFlat.length}               />
            <MetricCard label="Leaf pages"         value={leaves.length}                 color="green" sub={`${leavesWithEvidence.length} con evidencia`} />
            <MetricCard label="New this week"      value={appendsThisWeek}               color={appendsThisWeek > 0 ? "green" : "default"} sub="APPENDs aplicados" />
            <MetricCard label="Pending review"     value={proposals.length}              color={proposals.length > 0 ? "yellow" : "default"} sub="SPLIT / AMEND propuestos" />
            <MetricCard label="Stale (60d+)"       value={staleLeaves.length}            color={staleLeaves.length > 0 ? "yellow" : "default"} sub="hojas sin updates" />
          </div>

          {/* Quick links row */}
          <div className="flex items-center gap-2 flex-wrap">
            <KnowledgeSearch items={searchItems} />
            <Link
              href="/admin/knowledge/cases"
              className="hall-btn-outline"
              style={{ padding: "6px 12px", fontSize: 12 }}
            >
              <span className="mr-1" style={{ color: "var(--hall-muted-3)" }}>◆</span>
              Cases
            </Link>
            <Link
              href="/admin/knowledge/reading-room"
              className="hall-btn-outline"
              style={{ padding: "6px 12px", fontSize: 12 }}
            >
              <span className="mr-1" style={{ color: "var(--hall-muted-3)" }}>◫</span>
              Reading room
            </Link>
          </div>

          <p
            className="text-[12px] leading-relaxed max-w-[720px]"
            style={{ color: "var(--hall-muted-2)" }}
          >
            Conocimiento destilado por el OS desde reuniones, emails y whatsapp validados. Árbol: themes → subthemes → topics; cada hoja es una página consumible que crece con cada reu.
            Para documentos externos (papers, reports, PDFs subidos), ver{" "}
            <a href="/library" className="underline underline-offset-2" style={{ color: "var(--hall-ink-0)" }}>Library</a>.
          </p>

          {/* Themes — primary surface. Theme sections with leaf cards. */}
          {tree.length === 0 ? (
            <div
              className="px-6 py-10 text-center"
              style={{ border: "1px solid var(--hall-line)", background: "var(--hall-paper-1)" }}
            >
              <p className="text-sm font-medium" style={{ color: "var(--hall-muted-3)" }}>El árbol está vacío.</p>
              <p className="text-xs mt-1" style={{ color: "var(--hall-muted-3)" }}>Seed el schema con nodos iniciales para empezar.</p>
            </div>
          ) : (
            <div className="space-y-10">
              {tree.map(root => <ThemeSection key={root.id} theme={root} />)}
            </div>
          )}

          {/* Activity — everything operational lives here, collapsed by default */}
          {(proposals.length > 0 || recentLog.length > 0) && (
            <HallSection title="Activity">
              <div className="space-y-3">

              {/* Pending proposals — open by default if there are any */}
              {proposals.length > 0 && (
                <details open className="overflow-hidden group" style={{ border: "1px solid var(--hall-warn)", background: "var(--hall-warn-paper)" }}>
                  <summary className="px-6 py-3 cursor-pointer list-none flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] group-open:rotate-90 transition-transform" style={{ color: "var(--hall-muted-3)" }}>▶</span>
                      <span className="text-sm font-bold tracking-tight" style={{ color: "var(--hall-ink-0)" }}>Pending proposals</span>
                      <span className="text-xs" style={{ color: "var(--hall-muted-2)" }}>— SPLIT / AMEND del curator</span>
                    </div>
                    <span
                      className="text-[10px] font-bold px-2.5 py-1 rounded-full uppercase tracking-widest"
                      style={{ background: "var(--hall-warn-soft)", color: "var(--hall-warn)", fontFamily: "var(--font-hall-mono)" }}
                    >
                      {proposals.length} pending
                    </span>
                  </summary>
                  <div style={{ borderTop: "1px solid var(--hall-line-soft)", background: "var(--hall-paper-0)" }}>
                    {proposals.map(p => {
                      const split = p.action === "SPLIT" ? parseSplitSuggestion(p.reasoning) : null;
                      return (
                        <div
                          key={p.id}
                          className="px-6 py-4"
                          style={{ borderBottom: "1px solid var(--hall-line-soft)" }}
                        >
                          <div className="flex items-start gap-3">
                            <span
                              className="text-[9px] font-bold px-2 py-0.5 rounded-full border uppercase tracking-widest shrink-0"
                              style={{
                                fontFamily: "var(--font-hall-mono)",
                                background: "var(--hall-fill-soft)",
                                color: "var(--hall-muted-2)",
                                borderColor: "var(--hall-line)",
                              }}
                            >
                              {p.action}
                            </span>
                            <div className="flex-1 min-w-0">
                              {p.action === "SPLIT" && split ? (
                                <p className="text-sm font-semibold" style={{ color: "var(--hall-ink-0)" }}>
                                  <span className="text-xs" style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted-3)" }}>{split.path}</span>
                                  {" — "}
                                  {split.title}
                                </p>
                              ) : (
                                <p className="text-sm font-semibold" style={{ color: "var(--hall-ink-0)" }}>
                                  <Link href={`/admin/knowledge/${p.node_path}`} className="hover:underline">
                                    {p.node_title}
                                  </Link>
                                  {p.section && <span className="ml-2" style={{ color: "var(--hall-muted-3)" }}>→ {p.section}</span>}
                                </p>
                              )}
                              <p
                                className="text-[12px] mt-1 leading-relaxed line-clamp-2"
                                style={{ color: "var(--hall-muted-2)" }}
                              >
                                {p.reasoning}
                              </p>
                              {p.action === "AMEND" && p.diff_before && (
                                <p
                                  className="text-[11px] px-3 py-2 mt-2 line-through"
                                  style={{ color: "var(--hall-danger)", background: "var(--hall-danger-soft)", border: "1px solid var(--hall-danger-soft)" }}
                                >
                                  {p.diff_before}
                                </p>
                              )}
                              {p.action === "AMEND" && p.diff_after && (
                                <p
                                  className="text-[11px] px-3 py-2 mt-1"
                                  style={{ color: "var(--hall-ok)", background: "var(--hall-ok-soft)", border: "1px solid var(--hall-ok-soft)" }}
                                >
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
                  <details className="overflow-hidden group" style={{ border: "1px solid var(--hall-line)" }}>
                    <summary className="px-6 py-3 cursor-pointer list-none flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] group-open:rotate-90 transition-transform" style={{ color: "var(--hall-muted-3)" }}>▶</span>
                        <span className="text-sm font-bold tracking-tight" style={{ color: "var(--hall-ink-0)" }}>What&apos;s new this week</span>
                        <span className="text-xs" style={{ color: "var(--hall-muted-2)" }}>— últimos cambios del curator</span>
                      </div>
                      <span
                        className="text-[10px] uppercase tracking-widest"
                        style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted-2)" }}
                      >
                        {appendsThisWeek} appended · {ignoresThisWeek} ignored · {proposalsThisWeek} proposed
                      </span>
                    </summary>

                    {/* Preview strip — first 5 always visible when the details is open */}
                    <div style={{ borderTop: "1px solid var(--hall-line-soft)" }}>
                      {preview.map(e => {
                        const d = new Date(e.created_at);
                        return (
                          <Link
                            key={e.id}
                            href={`/admin/knowledge/${e.node_path}`}
                            className="block px-6 py-3 transition-colors"
                            style={{ borderBottom: "1px solid var(--hall-line-soft)" }}
                          >
                            <div className="flex items-start gap-3">
                              <div
                                className="shrink-0 w-14 text-[10px] font-bold uppercase tracking-widest pt-0.5"
                                style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted-3)" }}
                              >
                                {d.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span
                                    className="text-[9px] font-bold px-2 py-0.5 rounded-full uppercase tracking-widest"
                                    style={{
                                      fontFamily: "var(--font-hall-mono)",
                                      ...(e.action === "APPEND" ? { background: "var(--hall-ok-soft)", color: "var(--hall-ok)", border: "1px solid var(--hall-ok-soft)" }
                                      : e.action === "AMEND" ? { background: "var(--hall-warn-soft)", color: "var(--hall-warn)", border: "1px solid var(--hall-warn-soft)" }
                                      : e.action === "SPLIT" ? { background: "var(--hall-fill-soft)", color: "var(--hall-muted-2)", border: "1px solid var(--hall-line)" }
                                      : e.action === "CREATED" ? { background: "var(--hall-info-soft)", color: "var(--hall-info)", border: "1px solid var(--hall-info-soft)" }
                                      : { background: "var(--hall-fill-soft)", color: "var(--hall-muted-3)" }),
                                    }}
                                  >
                                    {e.action}
                                  </span>
                                  <span className="text-xs font-semibold" style={{ color: "var(--hall-ink-0)" }}>{e.node_title}</span>
                                  {e.section && <span className="text-[10px]" style={{ color: "var(--hall-muted-3)" }}>→ {e.section}</span>}
                                </div>
                                <p
                                  className="text-[12px] mt-1 line-clamp-1 leading-relaxed"
                                  style={{ color: "var(--hall-muted-2)" }}
                                >
                                  {e.reasoning}
                                </p>
                              </div>
                            </div>
                          </Link>
                        );
                      })}

                      {/* Remaining entries inside a nested details */}
                      {rest.length > 0 && (
                        <details className="group/more">
                          <summary
                            className="px-6 py-2 cursor-pointer list-none text-[10px] font-bold uppercase tracking-widest"
                            style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted-2)" }}
                          >
                            + {rest.length} more
                          </summary>
                          <div>
                            {rest.map(e => {
                              const d = new Date(e.created_at);
                              return (
                                <Link
                                  key={e.id}
                                  href={`/admin/knowledge/${e.node_path}`}
                                  className="block px-6 py-3 transition-colors"
                                  style={{ borderBottom: "1px solid var(--hall-line-soft)" }}
                                >
                                  <div className="flex items-start gap-3">
                                    <div
                                      className="shrink-0 w-14 text-[10px] font-bold uppercase tracking-widest pt-0.5"
                                      style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted-3)" }}
                                    >
                                      {d.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-center gap-2 flex-wrap">
                                        <span
                                          className="text-[9px] font-bold px-2 py-0.5 rounded-full uppercase tracking-widest"
                                          style={{
                                            fontFamily: "var(--font-hall-mono)",
                                            ...(e.action === "APPEND" ? { background: "var(--hall-ok-soft)", color: "var(--hall-ok)", border: "1px solid var(--hall-ok-soft)" }
                                            : e.action === "AMEND" ? { background: "var(--hall-warn-soft)", color: "var(--hall-warn)", border: "1px solid var(--hall-warn-soft)" }
                                            : e.action === "SPLIT" ? { background: "var(--hall-fill-soft)", color: "var(--hall-muted-2)", border: "1px solid var(--hall-line)" }
                                            : e.action === "CREATED" ? { background: "var(--hall-info-soft)", color: "var(--hall-info)", border: "1px solid var(--hall-info-soft)" }
                                            : { background: "var(--hall-fill-soft)", color: "var(--hall-muted-3)" }),
                                          }}
                                        >
                                          {e.action}
                                        </span>
                                        <span className="text-xs font-semibold" style={{ color: "var(--hall-ink-0)" }}>{e.node_title}</span>
                                        {e.section && <span className="text-[10px]" style={{ color: "var(--hall-muted-3)" }}>→ {e.section}</span>}
                                      </div>
                                      <p
                                        className="text-[12px] mt-1 line-clamp-1 leading-relaxed"
                                        style={{ color: "var(--hall-muted-2)" }}
                                      >
                                        {e.reasoning}
                                      </p>
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
            </HallSection>
          )}

          {/* How it works — collapsed, foot-of-page reference */}
          <details style={{ border: "1px solid var(--hall-line)" }} className="group">
            <summary className="px-6 py-3 cursor-pointer list-none flex items-center gap-2">
              <span className="text-[10px] group-open:rotate-90 transition-transform" style={{ color: "var(--hall-muted-3)" }}>▶</span>
              <span
                className="text-[10px] font-bold uppercase tracking-widest"
                style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted-2)" }}
              >
                How it works
              </span>
            </summary>
            <ul
              className="px-6 pb-5 pt-1 text-[12px] space-y-1.5 leading-relaxed"
              style={{ borderTop: "1px solid var(--hall-line-soft)", color: "var(--hall-muted-2)" }}
            >
              <li>• <strong style={{ color: "var(--hall-ink-0)" }}>Cada reu validada</strong> pasa por el <code className="text-[11px] px-1 py-0.5" style={{ fontFamily: "var(--font-hall-mono)", background: "var(--hall-fill-soft)" }}>knowledge-curator</code> agent.</li>
              <li>• El agent decide si la evidencia contiene un <em>insight de dominio</em> (generaliza) o solo un <em>project fact</em> (se ignora).</li>
              <li>• Cada bullet lleva un código de case (ej. <code className="text-[11px] px-1 py-0.5" style={{ fontFamily: "var(--font-hall-mono)", background: "var(--hall-fill-soft)" }}>[AUTOMERCADO-CR-2026]</code>) para identificar la instancia concreta.</li>
              <li>• El synthesizer genera playbooks prosa agrupando por modalidad y case. El árbol acumula bullets; el playbook narra.</li>
              <li>• Cuando otros agents (prep-brief, proposal-brief) citan una hoja, incrementa <code className="text-[11px] px-1 py-0.5" style={{ fontFamily: "var(--font-hall-mono)", background: "var(--hall-fill-soft)" }}>reference_count</code> — señal de valor real.</li>
            </ul>
          </details>

        </div>
      </main>
    </div>
  );
}
