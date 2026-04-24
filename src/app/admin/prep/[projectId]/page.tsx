import Link from "next/link";
import { notFound } from "next/navigation";
import { Sidebar } from "@/components/Sidebar";
import { HallSection } from "@/components/HallSection";
import { NAV } from "../../page";
import { requireAdmin } from "@/lib/require-admin";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { GenerateBriefButton } from "@/components/GenerateBriefButton";

// Simple markdown renderer (same style as /admin/knowledge/[...path])
function renderInline(text: string): string {
  let out = text
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  out = out.replace(/`([^`]+)`/g, '<code class="text-[11px] px-1 py-0.5 rounded" style="background: var(--hall-fill-soft); font-family: var(--font-hall-mono);">$1</code>');
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong class="font-semibold" style="color: var(--hall-ink-0);">$1</strong>');
  out = out.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '<em class="italic">$1</em>');
  out = out.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" class="underline underline-offset-2" style="color: var(--hall-ink-0); text-decoration-color: var(--hall-ink-0);">$1</a>');
  return out;
}

function renderMarkdown(md: string): string {
  if (!md.trim()) return '<p class="text-sm italic" style="color: var(--hall-muted-3);">(sin contenido)</p>';
  const lines = md.split(/\r?\n/);
  const out: string[] = [];
  let inList = false;
  for (const line of lines) {
    if (/^#\s+/.test(line)) {
      if (inList) { out.push("</ul>"); inList = false; }
      out.push(`<h1 class="text-xl font-bold mt-4 mb-3" style="color: var(--hall-ink-0);">${renderInline(line.replace(/^#\s+/, ""))}</h1>`);
      continue;
    }
    if (/^##\s+/.test(line)) {
      if (inList) { out.push("</ul>"); inList = false; }
      out.push(`<h2 class="text-[11px] font-bold uppercase tracking-widest mt-6 mb-2" style="color: var(--hall-muted-2); font-family: var(--font-hall-mono);">${renderInline(line.replace(/^##\s+/, ""))}</h2>`);
      continue;
    }
    if (/^###\s+/.test(line)) {
      if (inList) { out.push("</ul>"); inList = false; }
      out.push(`<h3 class="text-sm font-semibold mt-4 mb-1.5" style="color: var(--hall-ink-0);">${renderInline(line.replace(/^###\s+/, ""))}</h3>`);
      continue;
    }
    if (/^[-*]\s+/.test(line)) {
      if (!inList) { out.push('<ul class="space-y-1.5 my-2">'); inList = true; }
      out.push(`<li class="text-[13px] leading-relaxed pl-4 relative before:content-['•'] before:absolute before:left-0" style="color: var(--hall-ink-3);">${renderInline(line.replace(/^[-*]\s+/, ""))}</li>`);
      continue;
    }
    if (line.trim() === "") {
      if (inList) { out.push("</ul>"); inList = false; }
      continue;
    }
    if (inList) { out.push("</ul>"); inList = false; }
    out.push(`<p class="text-[13px] leading-relaxed my-2" style="color: var(--hall-ink-3);">${renderInline(line)}</p>`);
  }
  if (inList) out.push("</ul>");
  return out.join("");
}

function daysSince(iso: string | null): number | null {
  if (!iso) return null;
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
}

type Brief = {
  id: string;
  generated_at: string;
  content_md: string;
  signals_summary: Record<string, unknown>;
  meeting_datetime: string | null;
};

export default async function PrepDetailPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  await requireAdmin();

  const { projectId } = await params;
  const sb = getSupabaseServerClient();

  const [{ data: proj }, { data: briefs }] = await Promise.all([
    sb.from("projects").select("notion_id, name, current_stage, primary_workspace")
      .eq("notion_id", projectId).maybeSingle(),
    sb.from("prep_briefs").select("id, generated_at, content_md, signals_summary, meeting_datetime")
      .eq("project_notion_id", projectId)
      .order("generated_at", { ascending: false })
      .limit(10),
  ]);

  if (!proj) notFound();

  const briefList = (briefs as Brief[] | null) ?? [];
  const latest = briefList[0] ?? null;
  const history = briefList.slice(1);

  const projectSlug = (proj.name ?? projectId)
    .toString()
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 40) || projectId.slice(0, 8);

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
              className="text-[10px] tracking-[0.08em] uppercase whitespace-nowrap"
              style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted-2)" }}
            >
              PREP · <b style={{ color: "var(--hall-ink-0)" }}>{projectSlug}</b>
            </span>
            <h1
              className="text-[16px] font-medium tracking-[-0.01em] truncate"
              style={{ color: "var(--hall-ink-0)" }}
            >
              {proj.name ?? projectId}{" "}
              <em
                style={{
                  fontFamily: "var(--font-hall-display)",
                  fontStyle: "italic",
                  fontWeight: 400,
                }}
              >
                brief
              </em>
            </h1>
          </div>
          <div className="flex items-center gap-4">
            <Link
              href="/admin/prep"
              className="text-[10px] uppercase tracking-widest"
              style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted-2)" }}
            >
              ← All
            </Link>
            <GenerateBriefButton projectId={projectId} />
          </div>
        </header>

        <div className="px-9 py-6 space-y-7 max-w-[960px]">

          {/* Meta row */}
          <div
            className="flex items-center gap-3 flex-wrap"
            style={{ fontFamily: "var(--font-hall-mono)", fontSize: 10, color: "var(--hall-muted-2)", letterSpacing: "0.06em" }}
          >
            {proj.current_stage && (
              <span
                className="px-2 py-0.5 rounded-full uppercase tracking-widest font-bold"
                style={{
                  background: "var(--hall-fill-soft)",
                  color: "var(--hall-muted-2)",
                }}
              >
                {proj.current_stage}
              </span>
            )}
            {latest && (
              <span style={{ color: "var(--hall-muted-2)" }}>
                LAST BRIEF {daysSince(latest.generated_at) === 0 ? "TODAY" : `${daysSince(latest.generated_at)}D AGO`}
              </span>
            )}
          </div>

          {/* Latest brief */}
          {latest ? (
            <HallSection
              title="Latest"
              flourish="brief"
              meta={new Date(latest.generated_at).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).toUpperCase()}
            >
              {latest.signals_summary && typeof latest.signals_summary === "object" && (
                <div
                  className="flex gap-3 flex-wrap mb-4"
                  style={{ fontFamily: "var(--font-hall-mono)", fontSize: 10, color: "var(--hall-muted-2)", letterSpacing: "0.04em" }}
                >
                  {(["sources_count","evidence_count","open_questions","stale_questions","commitments"] as const).map(k => {
                    const v = (latest.signals_summary as Record<string, unknown>)[k];
                    return typeof v === "number" ? (
                      <span key={k}>
                        {k.replace(/_/g," ")}: <strong style={{ color: "var(--hall-ink-0)" }}>{v}</strong>
                      </span>
                    ) : null;
                  })}
                </div>
              )}
              <div
                className="py-2"
                dangerouslySetInnerHTML={{ __html: renderMarkdown(latest.content_md) }}
              />
            </HallSection>
          ) : (
            <HallSection title="Latest" flourish="brief">
              <div className="py-8 text-center">
                <p className="text-sm font-semibold" style={{ color: "var(--hall-ink-0)" }}>Aún no hay brief generado</p>
                <p
                  className="text-xs mt-1"
                  style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted-2)" }}
                >
                  Click en &quot;Generate brief&quot; arriba para crear el primero.
                </p>
              </div>
            </HallSection>
          )}

          {/* History */}
          {history.length > 0 && (
            <HallSection title="History" flourish="briefs" meta={`${history.length} PREVIOUS`}>
              <ul className="flex flex-col">
                {history.map(b => (
                  <li
                    key={b.id}
                    className="px-1 py-3 text-xs"
                    style={{
                      borderTop: "1px solid var(--hall-line-soft)",
                      fontFamily: "var(--font-hall-mono)",
                      color: "var(--hall-muted-2)",
                    }}
                  >
                    <span style={{ color: "var(--hall-ink-0)" }}>
                      {new Date(b.generated_at).toLocaleString("en-GB")}
                    </span>{" "}
                    — {b.content_md.slice(0, 120)}…
                  </li>
                ))}
              </ul>
            </HallSection>
          )}

        </div>
      </main>
    </div>
  );
}
