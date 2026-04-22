import Link from "next/link";
import { notFound } from "next/navigation";
import { Sidebar } from "@/components/Sidebar";
import { NAV } from "../../page";
import { requireAdmin } from "@/lib/require-admin";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { GenerateBriefButton } from "@/components/GenerateBriefButton";

// Simple markdown renderer (same style as /admin/knowledge/[...path])
function renderInline(text: string): string {
  let out = text
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  out = out.replace(/`([^`]+)`/g, '<code class="text-[11px] bg-[#EFEFEA] px-1 py-0.5 rounded">$1</code>');
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong class="font-semibold text-[#131218]">$1</strong>');
  out = out.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '<em class="italic">$1</em>');
  out = out.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" class="text-[#131218] underline decoration-[#B2FF59] decoration-2 underline-offset-2 hover:text-[#B2FF59]">$1</a>');
  return out;
}

function renderMarkdown(md: string): string {
  if (!md.trim()) return '<p class="text-sm text-[#131218]/30 italic">(sin contenido)</p>';
  const lines = md.split(/\r?\n/);
  const out: string[] = [];
  let inList = false;
  for (const line of lines) {
    if (/^#\s+/.test(line)) {
      if (inList) { out.push("</ul>"); inList = false; }
      out.push(`<h1 class="text-xl font-bold text-[#131218] mt-4 mb-3">${renderInline(line.replace(/^#\s+/, ""))}</h1>`);
      continue;
    }
    if (/^##\s+/.test(line)) {
      if (inList) { out.push("</ul>"); inList = false; }
      out.push(`<h2 class="text-[11px] font-bold text-[#131218]/40 uppercase tracking-widest mt-6 mb-2">${renderInline(line.replace(/^##\s+/, ""))}</h2>`);
      continue;
    }
    if (/^###\s+/.test(line)) {
      if (inList) { out.push("</ul>"); inList = false; }
      out.push(`<h3 class="text-sm font-semibold text-[#131218] mt-4 mb-1.5">${renderInline(line.replace(/^###\s+/, ""))}</h3>`);
      continue;
    }
    if (/^[-*]\s+/.test(line)) {
      if (!inList) { out.push('<ul class="space-y-1.5 my-2">'); inList = true; }
      out.push(`<li class="text-[13px] text-[#131218]/80 leading-relaxed pl-4 relative before:content-['•'] before:absolute before:left-0 before:text-[#131218]/30">${renderInline(line.replace(/^[-*]\s+/, ""))}</li>`);
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

  return (
    <div className="flex min-h-screen bg-[#EFEFEA]">
      <Sidebar items={NAV} isAdmin />

      <main className="flex-1 ml-[228px] overflow-auto">
        <div className="bg-[#131218] px-10 py-10">
          <Link href="/admin/prep" className="text-[10px] text-white/30 font-bold uppercase tracking-widest hover:text-[#c8f55a] transition-colors">
            ← All projects
          </Link>
          <h1 className="text-[2.6rem] font-[300] text-white leading-[1] tracking-[-1.5px] mt-3">
            <em className="font-[900] italic text-[#c8f55a]">{proj.name ?? projectId}</em>
          </h1>
          <div className="flex items-center gap-3 mt-3 flex-wrap">
            {proj.current_stage && (
              <span className="text-[9px] font-bold bg-white/5 text-white/50 border border-white/10 px-2 py-0.5 rounded-full uppercase tracking-widest">
                {proj.current_stage}
              </span>
            )}
            {latest && (
              <span className="text-[10px] text-white/40 font-medium">
                Último brief {daysSince(latest.generated_at) === 0 ? "hoy" : `${daysSince(latest.generated_at)}d ago`}
              </span>
            )}
          </div>
          <div className="mt-5">
            <GenerateBriefButton projectId={projectId} />
          </div>
        </div>

        <div className="px-8 py-6 space-y-6 max-w-[960px]">

          {/* Latest brief */}
          {latest ? (
            <div className="bg-white rounded-2xl border border-[#E0E0D8] overflow-hidden">
              <div className="h-1 bg-[#B2FF59]" />
              <div className="px-6 py-4 border-b border-[#EFEFEA] flex items-center justify-between">
                <div>
                  <p className="text-[10px] font-bold text-[#131218]/30 uppercase tracking-widest">Latest brief</p>
                  <p className="text-sm font-bold text-[#131218] mt-0.5">
                    {new Date(latest.generated_at).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                  </p>
                </div>
                {latest.signals_summary && typeof latest.signals_summary === "object" && (
                  <div className="flex gap-3 text-[10px] text-[#131218]/40 font-medium">
                    {(["sources_count","evidence_count","open_questions","stale_questions","commitments"] as const).map(k => {
                      const v = (latest.signals_summary as Record<string, unknown>)[k];
                      return typeof v === "number" ? (
                        <span key={k}>{k.replace(/_/g," ")}: <strong className="text-[#131218]">{v}</strong></span>
                      ) : null;
                    })}
                  </div>
                )}
              </div>
              <div
                className="px-8 py-6"
                dangerouslySetInnerHTML={{ __html: renderMarkdown(latest.content_md) }}
              />
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-[#E0E0D8] px-8 py-12 text-center">
              <p className="text-sm font-semibold text-[#131218]">Aún no hay brief generado</p>
              <p className="text-xs text-[#131218]/40 mt-1">Click en &quot;Generate brief&quot; arriba para crear el primero.</p>
            </div>
          )}

          {/* History */}
          {history.length > 0 && (
            <div className="bg-white rounded-2xl border border-[#E0E0D8] overflow-hidden">
              <div className="px-6 py-4 border-b border-[#EFEFEA]">
                <p className="text-[10px] font-bold text-[#131218]/30 uppercase tracking-widest">History</p>
                <p className="text-xs text-[#131218]/40 mt-0.5">Previous briefs for this project</p>
              </div>
              <div className="divide-y divide-[#EFEFEA]">
                {history.map(b => (
                  <div key={b.id} className="px-6 py-3 text-xs text-[#131218]/50 font-medium">
                    {new Date(b.generated_at).toLocaleString("en-GB")} — {b.content_md.slice(0, 120)}…
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>
      </main>
    </div>
  );
}
