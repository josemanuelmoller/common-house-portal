import Link from "next/link";
import { notFound } from "next/navigation";
import { Sidebar } from "@/components/Sidebar";
import { HallSection } from "@/components/HallSection";
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
  out = out.replace(/`([^`]+)`/g, '<code class="text-[11px] bg-[#f4f4ef] px-1 py-0.5 rounded">$1</code>');
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong class="font-semibold text-[#0a0a0a]">$1</strong>');
  out = out.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '<em class="italic">$1</em>');
  // Markdown links [text](url)
  out = out.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" class="text-[#0a0a0a] underline decoration-[#c6f24a] decoration-2 underline-offset-2 hover:text-[#c6f24a]">$1</a>');
  // Case code chips: [AUTOMERCADO-CR-2026] → small pill linking to case page
  out = out.replace(/\[([A-Z0-9]+-[A-Z]{2,3}-\d{4})\]/g,
    '<a href="/admin/knowledge/cases/$1" class="inline-block text-[10px] font-mono font-semibold text-[#0a0a0a]/70 bg-[#F7F7F2] px-1.5 py-0.5 rounded border border-[#f4f4ef] hover:bg-[#0a0a0a] hover:text-[#c6f24a] hover:border-[#0a0a0a] transition-colors align-middle no-underline">$1</a>');
  // Cross-references to other leaves: `path/like/this` → link. The code regex
  // above has already transformed unrelated backtick content into <code>, so
  // we operate on remaining inline backticks that look like a knowledge path.
  // Matches patterns like reuse/packaging/refill/at-home inside existing code blocks.
  out = out.replace(
    /<code class="[^"]+">((?:reuse|organics|new-materials)\/[a-z0-9-]+(?:\/[a-z0-9-]+)*)<\/code>/g,
    '<a href="/admin/knowledge/$1" class="inline-block text-[11px] font-mono font-semibold text-[#0a0a0a]/70 bg-[#f4f4ef] px-1.5 py-0.5 rounded border border-[#e4e4dd] hover:bg-[#0a0a0a] hover:text-[#c6f24a] hover:border-[#0a0a0a] transition-colors no-underline">→ $1</a>',
  );
  return out;
}

function renderMarkdown(md: string): string {
  if (!md.trim()) return '<p class="text-sm text-[#0a0a0a]/30 italic">(sin contenido todavía)</p>';
  const lines = md.split(/\r?\n/);
  const out: string[] = [];
  let inList = false;
  for (const line of lines) {
    if (/^##\s+/.test(line)) {
      if (inList) { out.push("</ul>"); inList = false; }
      const h = line.replace(/^##\s+/, "");
      out.push(`<h2 class="text-[11px] font-bold text-[#0a0a0a]/40 uppercase tracking-widest mt-6 mb-2">${renderInline(h)}</h2>`);
      continue;
    }
    if (/^###\s+/.test(line)) {
      if (inList) { out.push("</ul>"); inList = false; }
      const h = line.replace(/^###\s+/, "");
      out.push(`<h3 class="text-sm font-semibold text-[#0a0a0a] mt-4 mb-1.5">${renderInline(h)}</h3>`);
      continue;
    }
    if (/^-\s+/.test(line)) {
      if (!inList) { out.push('<ul class="space-y-1.5 my-2">'); inList = true; }
      const li = line.replace(/^-\s+/, "");
      out.push(`<li class="text-[13px] text-[#0a0a0a]/80 leading-relaxed pl-4 relative before:content-['•'] before:absolute before:left-0 before:text-[#0a0a0a]/30">${renderInline(li)}</li>`);
      continue;
    }
    if (line.trim() === "") {
      if (inList) { out.push("</ul>"); inList = false; }
      continue;
    }
    if (inList) { out.push("</ul>"); inList = false; }
    out.push(`<p class="text-[13px] text-[#0a0a0a]/80 leading-relaxed my-2">${renderInline(line)}</p>`);
  }
  if (inList) out.push("</ul>");
  return out.join("");
}

function actionStyle(action: string, status: string): React.CSSProperties {
  if (status === "proposed") return { background: "var(--hall-warn-paper)", color: "var(--hall-warn)", border: "1px solid var(--hall-warn-soft)" };
  if (action === "APPEND")   return { background: "var(--hall-ok-soft)", color: "var(--hall-ok)", border: "1px solid var(--hall-ok-soft)" };
  if (action === "AMEND")    return { background: "var(--hall-warn-soft)", color: "var(--hall-warn)", border: "1px solid var(--hall-warn-soft)" };
  if (action === "SPLIT")    return { background: "var(--hall-fill-soft)", color: "var(--hall-muted-2)", border: "1px solid var(--hall-line)" };
  if (action === "IGNORE")   return { background: "var(--hall-fill-soft)", color: "var(--hall-muted-3)", border: "1px solid var(--hall-line)" };
  if (action === "CREATED")  return { background: "var(--hall-info-soft)", color: "var(--hall-info)", border: "1px solid var(--hall-info-soft)" };
  return { background: "var(--hall-fill-soft)", color: "var(--hall-muted-3)", border: "1px solid var(--hall-line)" };
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
    <nav
      className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest"
      style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted-2)" }}
    >
      <Link href="/admin/knowledge" className="hover:underline" style={{ color: "var(--hall-muted-2)" }}>Knowledge</Link>
      {trail.map((t, i) => (
        <span key={t.path} className="flex items-center gap-2">
          <span style={{ color: "var(--hall-muted-3)" }}>/</span>
          {i === trail.length - 1 ? (
            <span style={{ color: "var(--hall-ink-0)" }}>{t.title}</span>
          ) : (
            <Link href={`/admin/knowledge/${t.path}`} className="hover:underline" style={{ color: "var(--hall-muted-2)" }}>{t.title}</Link>
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
    <div
      className="px-6 py-4 flex items-start gap-4"
      style={{ borderBottom: "1px solid var(--hall-line-soft)" }}
    >
      <div className="shrink-0 w-20">
        <p
          className="text-[10px] font-bold uppercase tracking-widest"
          style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted-2)" }}
        >
          {d.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
        </p>
        <p
          className="text-[9px] mt-0.5"
          style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted-3)" }}
        >
          {d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
        </p>
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span
            className="text-[9px] font-bold px-2 py-0.5 rounded-full uppercase tracking-widest"
            style={{ fontFamily: "var(--font-hall-mono)", ...actionStyle(entry.action, entry.status) }}
          >
            {entry.action}
          </span>
          {entry.status === "proposed" && (
            <span
              className="text-[9px] font-bold px-2 py-0.5 rounded-full uppercase tracking-widest"
              style={{
                fontFamily: "var(--font-hall-mono)",
                background: "var(--hall-warn-soft)",
                color: "var(--hall-warn)",
                border: "1px solid var(--hall-warn-soft)",
              }}
            >
              needs review
            </span>
          )}
          {entry.section && (
            <span className="text-[10px] font-medium" style={{ color: "var(--hall-muted-2)" }}>→ {entry.section}</span>
          )}
          <span
            className="text-[10px] font-medium"
            style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted-3)" }}
          >
            via {entry.applied_by}
          </span>
        </div>
        <p className="text-[12px] mt-1.5 leading-relaxed" style={{ color: "var(--hall-ink-3)" }}>{entry.reasoning}</p>
        {entry.diff_after && entry.action === "APPEND" && (
          <p
            className="text-[11px] mt-2 px-3 py-2 line-clamp-3"
            style={{ color: "var(--hall-muted-2)", background: "var(--hall-paper-1)", border: "1px solid var(--hall-line-soft)" }}
          >
            {entry.diff_after}
          </p>
        )}
        {entry.diff_before && entry.action === "AMEND" && (
          <div className="mt-2 space-y-1">
            <p
              className="text-[11px] px-3 py-2 line-through line-clamp-2"
              style={{ color: "var(--hall-danger)", background: "var(--hall-danger-soft)", border: "1px solid var(--hall-danger-soft)" }}
            >
              {entry.diff_before}
            </p>
            <p
              className="text-[11px] px-3 py-2 line-clamp-2"
              style={{ color: "var(--hall-ok)", background: "var(--hall-ok-soft)", border: "1px solid var(--hall-ok-soft)" }}
            >
              {entry.diff_after}
            </p>
          </div>
        )}
        {entry.evidence_notion_id && (
          <p
            className="text-[9px] mt-2 truncate"
            style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted-3)" }}
          >
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
    <div className="flex min-h-screen bg-[#f4f4ef]">
      <Sidebar items={NAV} isAdmin />

      <main
        className="flex-1 md:ml-[228px] overflow-auto"
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
              KNOWLEDGE · <b style={{ color: "var(--hall-ink-0)" }}>{node.path}</b>
            </span>
            <h1
              className="text-[16px] font-medium tracking-[-0.01em] truncate"
              style={{ color: "var(--hall-ink-0)" }}
            >
              {isLeaf ? (
                <em style={{ fontFamily: "var(--font-hall-display)", fontStyle: "italic", fontWeight: 400 }}>
                  {node.title}
                </em>
              ) : (
                node.title
              )}
            </h1>
          </div>
          {isLeaf && currentSourceCount > 0 && (
            <SynthesizeLeafButton path={node.path} hasPlaybook={Boolean(node.playbook_md)} />
          )}
        </header>

        {/* Meta / trail sub-header */}
        <div
          className="px-9 py-4 space-y-2"
          style={{ borderBottom: "1px solid var(--hall-line-soft)", background: "var(--hall-paper-1)" }}
        >
          <BreadcrumbTrail path={node.path} allNodes={allNodes} />
          {node.summary && (
            <p className="text-[12.5px] max-w-[620px] leading-[1.65]" style={{ color: "var(--hall-muted-2)" }}>
              {node.summary}
            </p>
          )}
          <div className="flex items-center gap-3 flex-wrap">
            <span
              className="text-[9px] font-bold px-2 py-0.5 rounded-full uppercase tracking-widest"
              style={{
                fontFamily: "var(--font-hall-mono)",
                ...(node.status === "Active"
                  ? { background: "var(--hall-ok-soft)", color: "var(--hall-ok)" }
                  : node.status === "Stale"
                  ? { background: "var(--hall-warn-soft)", color: "var(--hall-warn)" }
                  : { background: "var(--hall-fill-soft)", color: "var(--hall-muted-3)" }),
              }}
            >
              {node.status}
            </span>
            {node.tags.map(t => (
              <span
                key={t}
                className="text-[9px] font-bold px-2 py-0.5 rounded-full uppercase tracking-widest"
                style={{
                  fontFamily: "var(--font-hall-mono)",
                  background: "var(--hall-fill-soft)",
                  color: "var(--hall-muted-2)",
                  border: "1px solid var(--hall-line)",
                }}
              >
                {t}
              </span>
            ))}
            <span
              className="text-[10px] font-medium"
              style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted-2)" }}
            >
              {node.reference_count} citation{node.reference_count !== 1 ? "s" : ""}
            </span>
            {evidenceAge !== null && (
              <span
                className="text-[10px] font-medium"
                style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted-2)" }}
              >
                Last evidence {evidenceAge === 0 ? "today" : `${evidenceAge}d ago`}
              </span>
            )}
            {reviewAge !== null ? (
              <span
                className="text-[10px] font-medium"
                style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted-2)" }}
              >
                Reviewed {reviewAge === 0 ? "today" : `${reviewAge}d ago`}
              </span>
            ) : (
              <span
                className="text-[10px] font-medium"
                style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-warn)" }}
              >
                Never reviewed by human
              </span>
            )}
          </div>
        </div>

        <div className="px-9 py-6 max-w-[960px]">

          {/* Children (only if this is a category node) */}
          {!isLeaf && (
            <HallSection
              title="Sub-" flourish="topics"
              meta={`${children.length} CHILD${children.length !== 1 ? "REN" : ""}`}
            >
              <ul className="flex flex-col">
                {children.map(c => (
                  <li key={c.id} style={{ borderTop: "1px solid var(--hall-line-soft)" }}>
                    <Link
                      href={`/admin/knowledge/${c.path}`}
                      className="flex items-center gap-3 py-3 transition-colors"
                    >
                      <span className="text-xs font-bold" style={{ color: "var(--hall-muted-3)" }}>▸</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold" style={{ color: "var(--hall-ink-0)" }}>{c.title}</p>
                        {c.summary && (
                          <p className="text-[11px] mt-0.5 truncate" style={{ color: "var(--hall-muted-2)" }}>
                            {c.summary}
                          </p>
                        )}
                      </div>
                      <span
                        className="text-[10px] font-bold uppercase tracking-widest"
                        style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted-3)" }}
                      >
                        {c.reference_count > 0 ? `${c.reference_count} cited` : "—"}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </HallSection>
          )}

          {/* Content — Playbook (default) / Source bullets tabs for leaves */}
          {(isLeaf || node.body_md.trim().length > 100) && (
            isLeaf ? (
              <HallSection title="Content">
                <LeafContentTabs
                  playbookHtml={playbookHtml}
                  bulletsHtml={bulletsHtml}
                  playbookGeneratedAt={node.playbook_generated_at}
                  playbookSourceCount={node.playbook_source_count}
                  currentSourceCount={currentSourceCount}
                  leafPath={node.path}
                />
              </HallSection>
            ) : (
              <HallSection title="Content" meta={node.path.toUpperCase()}>
                <div className="py-4" dangerouslySetInnerHTML={{ __html: bulletsHtml }} />
              </HallSection>
            )
          )}

          {/* Changelog */}
          <HallSection
            title="Changelog"
            meta={`${changelog.length} ENTRIES`}
          >
            <p className="text-xs mb-2" style={{ color: "var(--hall-muted-2)" }}>
              Cada acción del knowledge-curator (aplicada o propuesta) con razón.
            </p>
            {changelog.length === 0 ? (
              <div className="px-6 py-10 text-center" style={{ border: "1px solid var(--hall-line-soft)" }}>
                <p className="text-sm font-medium" style={{ color: "var(--hall-muted-3)" }}>Sin cambios todavía.</p>
                <p className="text-xs mt-1" style={{ color: "var(--hall-muted-3)" }}>
                  Cuando el curator procese evidencia relacionada, aparecerán aquí sus decisiones.
                </p>
              </div>
            ) : (
              <div>
                {changelog.map(entry => <ChangelogRow key={entry.id} entry={entry} />)}
              </div>
            )}
          </HallSection>

        </div>
      </main>
    </div>
  );
}
