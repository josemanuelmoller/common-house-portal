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
              className="text-[10px] tracking-[0.08em] whitespace-nowrap uppercase"
              style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted-2)" }}
            >
              KNOWLEDGE · <b style={{ color: "var(--hall-ink-0)" }}>READING</b>
            </span>
            <h1
              className="text-[16px] font-medium tracking-[-0.01em]"
              style={{ color: "var(--hall-ink-0)" }}
            >
              Reading{" "}
              <em
                style={{
                  fontFamily: "var(--font-hall-display)",
                  fontStyle: "italic",
                  fontWeight: 400,
                }}
              >
                room
              </em>
              .
            </h1>
          </div>
          <Link
            href="/admin/knowledge"
            className="text-[11px]"
            style={{
              fontFamily: "var(--font-hall-mono)",
              color: "var(--hall-muted-2)",
              letterSpacing: "0.06em",
            }}
          >
            ← KNOWLEDGE TREE
          </Link>
        </header>

        <div className="px-9 py-6 space-y-10 max-w-[1000px]">
          <p
            className="text-[12px] leading-relaxed max-w-[620px]"
            style={{ color: "var(--hall-muted-2)" }}
          >
            Lectura curada desde el árbol — qué está fresco, qué se cita más, qué no ha pasado
            por revisión humana. Abre para consumir, no para administrar.
          </p>

          <ReadingLane
            title="Fresh"
            flourish="últimos 14 días"
            description="Leaves con evidencia reciente; probablemente lo que más aporta para una conversación esta semana."
            items={fresh}
            emptyMsg="Nada nuevo en los últimos 14 días."
          />
          <ReadingLane
            title="Most"
            flourish="referenced"
            description="Cuando otros skills (prep-brief, proposal-brief) citan un leaf, incrementan reference_count. Esto muestra lo que realmente aporta."
            items={mostReferenced}
            emptyMsg="Aún no hay citas — los agentes consumidores todavía no están wired."
          />
          <ReadingLane
            title="Needs"
            flourish="human review"
            description="Leaves con contenido pero sin revisión humana todavía. Útil cuando ya hay suficiente evidencia para validar narrativa."
            items={unreviewed}
            emptyMsg="Todo ha sido revisado al menos una vez."
          />
        </div>
      </main>
    </div>
  );
}

function ReadingLane({
  title,
  flourish,
  description,
  items,
  emptyMsg,
}: {
  title: string;
  flourish: string;
  description: string;
  items: KnowledgeNode[];
  emptyMsg: string;
}) {
  return (
    <section>
      <div
        className="flex items-baseline justify-between gap-3 pb-2 mb-3.5"
        style={{ borderBottom: "1px solid var(--hall-ink-0)" }}
      >
        <h2
          className="text-[19px] font-bold leading-none"
          style={{ letterSpacing: "-0.02em", color: "var(--hall-ink-0)" }}
        >
          {title}{" "}
          <em
            style={{
              fontFamily: "var(--font-hall-display)",
              fontStyle: "italic",
              fontWeight: 400,
              color: "var(--hall-ink-0)",
            }}
          >
            {flourish}
          </em>
        </h2>
        <span
          style={{
            fontFamily: "var(--font-hall-mono)",
            fontSize: 10,
            color: "var(--hall-muted-2)",
            letterSpacing: "0.06em",
          }}
        >
          {items.length} NODES
        </span>
      </div>
      <p
        className="text-[12px] mt-1 mb-4 leading-relaxed max-w-[600px]"
        style={{ color: "var(--hall-muted-2)" }}
      >
        {description}
      </p>
      {items.length === 0 ? (
        <div className="text-[12px] italic" style={{ color: "var(--hall-muted-3)" }}>
          {emptyMsg}
        </div>
      ) : (
        <ul className="flex flex-col">
          {items.map(n => {
            const preview = firstParagraph(n.body_md) ?? n.summary;
            const bc = countBullets(n.body_md);
            const hasPlaybook = Boolean(n.playbook_md);
            return (
              <li
                key={n.id}
                style={{ borderTop: "1px solid var(--hall-line-soft)" }}
              >
                <Link
                  href={`/admin/knowledge/${n.path}`}
                  className="group block py-3.5 transition-colors"
                >
                  <p
                    className="text-[10px] uppercase tracking-[0.06em] mb-1"
                    style={{
                      fontFamily: "var(--font-hall-mono)",
                      color: "var(--hall-muted-3)",
                    }}
                  >
                    {n.path}
                  </p>
                  <h3
                    className="text-[16px] font-semibold tracking-tight mb-1"
                    style={{ color: "var(--hall-ink-0)" }}
                  >
                    {n.title}
                  </h3>
                  {preview && (
                    <p
                      className="text-[12px] leading-relaxed line-clamp-3"
                      style={{ color: "var(--hall-ink-3)" }}
                    >
                      {preview}
                    </p>
                  )}
                  <div
                    className="flex items-center gap-3 mt-2 flex-wrap text-[10px] uppercase tracking-[0.06em]"
                    style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted-3)" }}
                  >
                    {hasPlaybook && (
                      <span
                        className="px-2 py-0.5"
                        style={{
                          background: "var(--hall-ink-0)",
                          color: "var(--hall-paper-0)",
                          borderRadius: 3,
                        }}
                      >
                        ✦ PLAYBOOK
                      </span>
                    )}
                    <span>
                      {bc} BULLET{bc !== 1 ? "S" : ""}
                    </span>
                    {n.reference_count > 0 && <span>· {n.reference_count} CITED</span>}
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
