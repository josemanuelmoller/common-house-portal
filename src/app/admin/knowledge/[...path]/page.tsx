import Link from "next/link";
import { notFound } from "next/navigation";
import { Sidebar } from "@/components/Sidebar";
import { LeafContentTabs } from "@/components/LeafContentTabs";
import { SynthesizeLeafButton } from "@/components/SynthesizeLeafButton";
import { NAV } from "../../page";
import { requireAdmin } from "@/lib/require-admin";
import {
  getAllNodes,
  getNodeByPath,
  getChildren,
  getNodeChangelog,
  type KnowledgeNode,
  type NodeChangelogEntry,
} from "@/lib/knowledge-nodes";

// ─── Minimal markdown renderer (headings, bullets, bold/italic/code, links) ──
// Good enough for curator-written content. Replace with react-markdown if
// user-authored content grows more complex.

function renderInline(text: string): string {
  // Escape HTML first
  let out = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  // Bold + italic + code (order matters)
  out = out.replace(/`([^`]+)`/g, '<code class="text-[11px] bg-[#EFEFEA] px-1 py-0.5 rounded">$1</code>');
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong class="font-semibold text-[#131218]">$1</strong>');
  out = out.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '<em class="italic">$1</em>');
  // Markdown links [text](url)
  out = out.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" class="text-[#131218] underline decoration-[#B2FF59] decoration-2 underline-offset-2 hover:text-[#B2FF59]">$1</a>');
  // Case code chips: [AUTOMERCADO-CR-2026] → small pill linking to case page
  out = out.replace(/\[([A-Z0-9]+-[A-Z]{2,3}-\d{4})\]/g,
    '<a href="/admin/knowledge/cases/$1" class="inline-block text-[10px] font-mono font-semibold text-[#131218]/70 bg-[#F7F7F2] px-1.5 py-0.5 rounded border border-[#EFEFEA] hover:bg-[#131218] hover:text-[#B2FF59] hover:border-[#131218] transition-colors align-middle no-underline">$1</a>');
  // Cross-references to other leaves: `path/like/this` → link. The code regex
  // above has already transformed unrelated backtick content into <code>, so
  // we operate on remaining inline backticks that look like a knowledge path.
  // Matches patterns like reuse/packaging/refill/at-home inside existing code blocks.
  out = out.replace(
    /<code class="[^"]+">((?:reuse|organics|new-materials)\/[a-z0-9-]+(?:\/[a-z0-9-]+)*)<\/code>/g,
    '<a href="/admin/knowledge/$1" class="inline-block text-[11px] font-mono font-semibold text-[#131218]/70 bg-[#EFEFEA] px-1.5 py-0.5 rounded border border-[#E0E0D8] hover:bg-[#131218] hover:text-[#B2FF59] hover:border-[#131218] transition-colors no-underline">→ $1</a>',
  );
  return out;
}

function renderMarkdown(md: string): string {
  if (!md.trim()) return '<p class="text-sm text-[#131218]/30 italic">(sin contenido todavía)</p>';
  const lines = md.split(/\r?\n/);
  const out: string[] = [];
  let inList = false;
  for (const line of lines) {
    if (/^##\s+/.test(line)) {
      if (inList) { out.push("</ul>"); inList = false; }
      const h = line.replace(/^##\s+/, "");
      out.push(`<h2 class="text-[11px] font-bold text-[#131218]/40 uppercase tracking-widest mt-6 mb-2">${renderInline(h)}</h2>`);
      continue;
    }
    if (/^###\s+/.test(line)) {
      if (inList) { out.push("</ul>"); inList = false; }
      const h = line.replace(/^###\s+/, "");
      out.push(`<h3 class="text-sm font-semibold text-[#131218] mt-4 mb-1.5">${renderInline(h)}</h3>`);
      continue;
    }
    if (/^-\s+/.test(line)) {
      if (!inList) { out.push('<ul class="space-y-1.5 my-2">'); inList = true; }
      const li = line.replace(/^-\s+/, "");
      out.push(`<li class="text-[13px] text-[#131218]/80 leading-relaxed pl-4 relative before:content-['•'] before:absolute before:left-0 before:text-[#131218]/30">${renderInline(li)}</li>`);
      continue;
    }
    if (line.trim() === "") {
      if (inList) { out.push("</ul>"); inList = false; }
      continue;
    }
    if (inList) { out.push("</ul>"); inList = false; }
    out.push(`<p class="text-[13px] text-[#131218]/80 leading-relaxed my-2">${renderInline(line)}</p>`);
  }
  if (inList) out.push("</ul>");
  return out.join("");
}

function actionColor(action: string, status: string): string {
  if (status === "proposed") return "bg-amber-50 text-amber-700 border-amber-200";
  if (action === "APPEND")   return "bg-green-50 text-green-700 border-green-200";
  if (action === "AMEND")    return "bg-orange-50 text-orange-700 border-orange-200";
  if (action === "SPLIT")    return "bg-purple-50 text-purple-700 border-purple-200";
  if (action === "IGNORE")   return "bg-[#EFEFEA] text-[#131218]/40 border-[#E0E0D8]";
  if (action === "CREATED")  return "bg-blue-50 text-blue-700 border-blue-200";
  return "bg-[#EFEFEA] text-[#131218]/40 border-[#E0E0D8]";
}

function BreadcrumbTrail({ path, allNodes }: { path: string; allNodes: KnowledgeNode[] }) {
  const parts = path.split("/");
  const trail: { path: string; title: string }[] = [];
  for (let i = 1; i <= parts.length; i++) {
    const p = parts.slice(0, i).join("/");
    const node = allNodes.find(n => n.path === p);
    if (node) trail.push({ path: p, title: node.title });
  }
  return (
    <nav className="flex items-center gap-2 text-[10px] text-white/30 font-bold uppercase tracking-widest">
      <Link href="/admin/knowledge" className="hover:text-[#c8f55a] transition-colors">Knowledge</Link>
      {trail.map((t, i) => (
        <span key={t.path} className="flex items-center gap-2">
          <span className="opacity-30">/</span>
          {i === trail.length - 1 ? (
            <span className="text-white/80">{t.title}</span>
          ) : (
            <Link href={`/admin/knowledge/${t.path}`} className="hover:text-[#c8f55a] transition-colors">{t.title}</Link>
          )}
        </span>
      ))}
    </nav>
  );
}

function daysSince(iso: string | null): number | null {
  if (!iso) return null;
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
}

function ChangelogRow({ entry }: { entry: NodeChangelogEntry }) {
  const d = new Date(entry.created_at);
  return (
    <div className="px-6 py-4 border-b border-[#EFEFEA] flex items-start gap-4">
      <div className="shrink-0 w-20">
        <p className="text-[10px] font-bold text-[#131218]/40 uppercase tracking-widest">
          {d.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
        </p>
        <p className="text-[9px] text-[#131218]/25 mt-0.5">
          {d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
        </p>
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full border uppercase tracking-widest ${actionColor(entry.action, entry.status)}`}>
            {entry.action}
          </span>
          {entry.status === "proposed" && (
            <span className="text-[9px] font-bold bg-amber-100 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-full uppercase tracking-widest">
              needs review
            </span>
          )}
          {entry.section && (
            <span className="text-[10px] text-[#131218]/40 font-medium">→ {entry.section}</span>
          )}
          <span className="text-[10px] text-[#131218]/25 font-medium">via {entry.applied_by}</span>
        </div>
        <p className="text-[12px] text-[#131218]/70 mt-1.5 leading-relaxed">{entry.reasoning}</p>
        {entry.diff_after && entry.action === "APPEND" && (
          <p className="text-[11px] text-[#131218]/50 mt-2 bg-[#F7F7F2] px-3 py-2 rounded-lg border border-[#EFEFEA] line-clamp-3">
            {entry.diff_after}
          </p>
        )}
        {entry.diff_before && entry.action === "AMEND" && (
          <div className="mt-2 space-y-1">
            <p className="text-[11px] text-red-600/70 bg-red-50/50 px-3 py-2 rounded-lg border border-red-100 line-through line-clamp-2">
              {entry.diff_before}
            </p>
            <p className="text-[11px] text-green-700 bg-green-50/50 px-3 py-2 rounded-lg border border-green-100 line-clamp-2">
              {entry.diff_after}
            </p>
          </div>
        )}
        {entry.evidence_notion_id && (
          <p className="text-[9px] text-[#131218]/20 font-mono mt-2 truncate">
            evidence: {entry.evidence_notion_id}
          </p>
        )}
      </div>
    </div>
  );
}

export default async function KnowledgeDetailPage({
  params,
}: {
  params: Promise<{ path: string[] }>;
}) {
  await requireAdmin();

  const { path: pathSegments } = await params;
  const path = pathSegments.join("/");

  const [node, allNodes] = await Promise.all([
    getNodeByPath(path),
    getAllNodes(),
  ]);

  if (!node) notFound();

  const [children, changelog] = await Promise.all([
    getChildren(node.id),
    getNodeChangelog(node.id, 30),
  ]);

  const isLeaf = children.length === 0;
  const evidenceAge = daysSince(node.last_evidence_at);
  const reviewAge   = daysSince(node.last_reviewed_at);

  const bulletsHtml   = renderMarkdown(node.body_md);
  const playbookHtml  = node.playbook_md ? renderMarkdown(node.playbook_md) : null;
  const currentSourceCount = (node.body_md.match(/^[ \t]*-\s+/gm) ?? []).length;

  return (
    <div className="flex min-h-screen bg-[#EFEFEA]">
      <Sidebar items={NAV} isAdmin />

      <main className="flex-1 ml-[228px] overflow-auto">
        {/* Header */}
        <div className="bg-[#131218] px-10 py-10">
          <BreadcrumbTrail path={node.path} allNodes={allNodes} />
          <h1 className="text-[2.6rem] font-[300] text-white leading-[1] tracking-[-1.5px] mt-3">
            {isLeaf ? (
              <span className="font-[900] italic text-[#c8f55a]">{node.title}</span>
            ) : (
              node.title
            )}
          </h1>
          {node.summary && (
            <p className="text-[12.5px] text-white/40 mt-3 max-w-[620px] leading-[1.65]">
              {node.summary}
            </p>
          )}
          <div className="flex items-center gap-4 mt-4 flex-wrap">
            <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full uppercase tracking-widest ${
              node.status === "Active" ? "bg-[#B2FF59] text-[#131218]" :
              node.status === "Stale"  ? "bg-amber-400 text-[#131218]" :
              "bg-white/10 text-white/40"
            }`}>
              {node.status}
            </span>
            {node.tags.map(t => (
              <span key={t} className="text-[9px] font-bold bg-white/5 text-white/40 border border-white/10 px-2 py-0.5 rounded-full uppercase tracking-widest">
                {t}
              </span>
            ))}
            <span className="text-[10px] text-white/30 font-medium">
              {node.reference_count} citation{node.reference_count !== 1 ? "s" : ""}
            </span>
            {evidenceAge !== null && (
              <span className="text-[10px] text-white/30 font-medium">
                Last evidence {evidenceAge === 0 ? "today" : `${evidenceAge}d ago`}
              </span>
            )}
            {reviewAge !== null ? (
              <span className="text-[10px] text-white/30 font-medium">
                Reviewed {reviewAge === 0 ? "today" : `${reviewAge}d ago`}
              </span>
            ) : (
              <span className="text-[10px] text-amber-300/70 font-medium">Never reviewed by human</span>
            )}
          </div>
          {isLeaf && currentSourceCount > 0 && (
            <div className="mt-5">
              <SynthesizeLeafButton path={node.path} hasPlaybook={Boolean(node.playbook_md)} />
            </div>
          )}
        </div>

        <div className="px-8 py-6 space-y-6 max-w-[960px]">

          {/* Children (only if this is a category node) */}
          {!isLeaf && (
            <div className="bg-white rounded-2xl border border-[#E0E0D8] overflow-hidden">
              <div className="h-1 bg-[#131218]" />
              <div className="px-6 py-4 border-b border-[#EFEFEA]">
                <h2 className="text-sm font-bold text-[#131218] tracking-tight">Sub-topics</h2>
                <p className="text-xs text-[#131218]/40 mt-0.5">{children.length} child{children.length !== 1 ? "ren" : ""}</p>
              </div>
              <div>
                {children.map(c => (
                  <Link
                    key={c.id}
                    href={`/admin/knowledge/${c.path}`}
                    className="flex items-center gap-3 px-6 py-3 border-b border-[#EFEFEA] hover:bg-[#EFEFEA]/40 transition-colors"
                  >
                    <span className="text-xs font-bold text-[#131218]/30">▸</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-[#131218]">{c.title}</p>
                      {c.summary && <p className="text-[11px] text-[#131218]/40 mt-0.5 truncate">{c.summary}</p>}
                    </div>
                    <span className="text-[10px] text-[#131218]/30 font-bold uppercase tracking-widest">
                      {c.reference_count > 0 ? `${c.reference_count} cited` : "—"}
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* Content — Playbook (default) / Source bullets tabs for leaves */}
          {(isLeaf || node.body_md.trim().length > 100) && (
            isLeaf ? (
              <LeafContentTabs
                playbookHtml={playbookHtml}
                bulletsHtml={bulletsHtml}
                playbookGeneratedAt={node.playbook_generated_at}
                playbookSourceCount={node.playbook_source_count}
                currentSourceCount={currentSourceCount}
                leafPath={node.path}
              />
            ) : (
              <div className="bg-white rounded-2xl border border-[#E0E0D8] overflow-hidden">
                <div className="h-1 bg-[#B2FF59]" />
                <div className="px-6 py-4 border-b border-[#EFEFEA] flex items-center justify-between">
                  <h2 className="text-sm font-bold text-[#131218] tracking-tight">Content</h2>
                  <span className="text-[10px] text-[#131218]/25 font-mono">{node.path}</span>
                </div>
                <div className="px-8 py-6" dangerouslySetInnerHTML={{ __html: bulletsHtml }} />
              </div>
            )
          )}

          {/* Changelog */}
          <div className="bg-white rounded-2xl border border-[#E0E0D8] overflow-hidden">
            <div className="h-1 bg-[#EFEFEA]" />
            <div className="px-6 py-4 border-b border-[#EFEFEA] flex items-center justify-between">
              <div>
                <h2 className="text-sm font-bold text-[#131218] tracking-tight">Changelog</h2>
                <p className="text-xs text-[#131218]/40 mt-0.5">
                  Cada acción del knowledge-curator (aplicada o propuesta) con razón.
                </p>
              </div>
              <span className="text-[10px] text-[#131218]/30 font-bold uppercase tracking-widest">
                {changelog.length} entries
              </span>
            </div>
            {changelog.length === 0 ? (
              <div className="px-6 py-10 text-center">
                <p className="text-sm font-medium text-[#131218]/30">Sin cambios todavía.</p>
                <p className="text-xs text-[#131218]/20 mt-1">
                  Cuando el curator procese evidencia relacionada, aparecerán aquí sus decisiones.
                </p>
              </div>
            ) : (
              <div>
                {changelog.map(entry => <ChangelogRow key={entry.id} entry={entry} />)}
              </div>
            )}
          </div>

        </div>
      </main>
    </div>
  );
}
