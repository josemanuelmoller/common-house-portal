import Link from "next/link";
import { Sidebar } from "@/components/Sidebar";
import { NAV } from "../../page";
import { requireAdmin } from "@/lib/require-admin";
import { getAllNodes, type KnowledgeNode } from "@/lib/knowledge-nodes";

function daysSince(iso: string | null): number | null {
  if (!iso) return null;
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
}

function countBullets(body_md: string): number {
  return (body_md.match(/^[ \t]*-\s+/gm) ?? []).length;
}

function firstParagraph(body_md: string): string | null {
  const m = body_md.match(/^##\s+Overview\s*\n+([^\n#][\s\S]*?)(?=\n##\s|\n$)/m);
  if (!m) return null;
  return m[1].replace(/_\([^)]*\)_/g, "").replace(/\s+/g, " ").trim().slice(0, 320);
}

export default async function ReadingRoomPage() {
  await requireAdmin();
  const all = await getAllNodes();

  // Only nodes with body (either playbook or substantial bullets)
  const readable = all.filter(n =>
    (n.playbook_md && n.playbook_md.length > 200) || countBullets(n.body_md) >= 2
  );

  // Three lanes:
  // 1. Fresh reading — updated in last 14d, has playbook or ≥3 bullets
  // 2. Most referenced — by reference_count desc
  // 3. Never reviewed by human — last_reviewed_at null, has content
  const fresh = readable
    .filter(n => n.last_evidence_at && (daysSince(n.last_evidence_at) ?? 999) <= 14)
    .sort((a, b) => new Date(b.last_evidence_at!).getTime() - new Date(a.last_evidence_at!).getTime())
    .slice(0, 8);

  const mostReferenced = [...readable]
    .filter(n => n.reference_count > 0)
    .sort((a, b) => b.reference_count - a.reference_count)
    .slice(0, 8);

  const unreviewed = readable
    .filter(n => !n.last_reviewed_at && (n.playbook_md || countBullets(n.body_md) >= 3))
    .slice(0, 8);

  return (
    <div className="flex min-h-screen bg-[#EFEFEA]">
      <Sidebar items={NAV} isAdmin />
      <main className="flex-1 ml-[228px] overflow-auto">
        <div className="bg-[#131218] px-10 py-10">
          <Link href="/admin/knowledge" className="text-[10px] text-white/30 font-bold uppercase tracking-widest hover:text-[#c8f55a] transition-colors">
            ← Knowledge tree
          </Link>
          <h1 className="text-[2.6rem] font-[300] text-white leading-[1] tracking-[-1.5px] mt-3">
            Reading <em className="font-[900] italic text-[#c8f55a]">room</em>
          </h1>
          <p className="text-[12.5px] text-white/40 mt-3 max-w-[620px] leading-[1.65]">
            Lectura curada desde el árbol — qué está fresco, qué se cita más, qué no ha pasado por revisión humana. Abre para consumir, no para administrar.
          </p>
        </div>

        <div className="px-8 py-8 space-y-10 max-w-[1000px]">
          <ReadingLane
            title="Fresh — actualizado en últimos 14 días"
            description="Leaves con evidencia reciente; probablemente lo que más aporta para una conversación esta semana."
            items={fresh}
            emptyMsg="Nada nuevo en los últimos 14 días."
          />
          <ReadingLane
            title="Most referenced — usado por otros agentes"
            description="Cuando otros skills (prep-brief, proposal-brief) citan un leaf, incrementan reference_count. Esto muestra lo que realmente aporta."
            items={mostReferenced}
            emptyMsg="Aún no hay citas — los agentes consumidores todavía no están wired."
          />
          <ReadingLane
            title="Needs human review"
            description="Leaves con contenido pero sin revisión humana todavía. Útil cuando ya hay suficiente evidencia para validar narrativa."
            items={unreviewed}
            emptyMsg="Todo ha sido revisado al menos una vez."
          />
        </div>
      </main>
    </div>
  );
}

function ReadingLane({ title, description, items, emptyMsg }: {
  title: string;
  description: string;
  items: KnowledgeNode[];
  emptyMsg: string;
}) {
  return (
    <section>
      <header className="mb-4">
        <h2 className="text-[18px] font-semibold tracking-tight text-[#131218]">{title}</h2>
        <p className="text-[12px] text-[#131218]/45 mt-1 leading-relaxed max-w-[600px]">{description}</p>
      </header>
      {items.length === 0 ? (
        <div className="text-[12px] text-[#131218]/25 italic">{emptyMsg}</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {items.map(n => {
            const preview = firstParagraph(n.body_md) ?? n.summary;
            const bc = countBullets(n.body_md);
            const hasPlaybook = Boolean(n.playbook_md);
            return (
              <Link
                key={n.id}
                href={`/admin/knowledge/${n.path}`}
                className="group block bg-white rounded-[14px] border border-[#E0E0D8] hover:border-[#131218]/30 hover:-translate-y-[2px] transition-all duration-150 p-5"
              >
                <p className="text-[9px] font-bold font-mono text-[#131218]/25 uppercase tracking-widest mb-2">{n.path}</p>
                <h3 className="text-[17px] font-semibold tracking-tight text-[#131218] mb-2">{n.title}</h3>
                {preview && (
                  <p className="text-[12px] text-[#131218]/55 leading-relaxed line-clamp-3">{preview}</p>
                )}
                <div className="flex items-center gap-2 mt-3 flex-wrap text-[9px] font-bold uppercase tracking-widest">
                  {hasPlaybook && (
                    <span className="bg-[#B2FF59] text-[#131218] px-2 py-0.5 rounded-full">✦ playbook</span>
                  )}
                  <span className="text-[#131218]/35">{bc} bullet{bc !== 1 ? "s" : ""}</span>
                  {n.reference_count > 0 && (
                    <span className="text-[#131218]/35">· {n.reference_count} cited</span>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </section>
  );
}
