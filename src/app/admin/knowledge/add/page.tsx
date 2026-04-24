import Link from "next/link";
import { Sidebar } from "@/components/Sidebar";
import { KnowledgeIngestForm } from "@/components/KnowledgeIngestForm";
import { NAV } from "../../page";
import { requireAdmin } from "@/lib/require-admin";

export default async function AddKnowledgePage() {
  await requireAdmin();

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
              KNOWLEDGE · <b style={{ color: "var(--hall-ink-0)" }}>ADD</b>
            </span>
            <h1
              className="text-[16px] font-medium tracking-[-0.01em]"
              style={{ color: "var(--hall-ink-0)" }}
            >
              Add{" "}
              <em
                style={{
                  fontFamily: "var(--font-hall-display)",
                  fontStyle: "italic",
                  fontWeight: 400,
                }}
              >
                external
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

        <div className="px-9 py-6 max-w-[960px]">
          <p
            className="text-[12px] leading-relaxed max-w-[620px] mb-6"
            style={{ color: "var(--hall-muted-2)" }}
          >
            Tercer riel de ingesta — docs externos (PDF, Word, URL, texto pegado) se convierten
            en evidence y fluyen al árbol. Útil para guías antiguas (ej. operational guide de
            Algramo 2020), reports de industria (EMF, McKinsey), case studies de otras marcas
            (Wild, Loop), regulaciones, etc.
          </p>

          <KnowledgeIngestForm />

          <div className="mt-7">
            <div
              className="flex items-baseline justify-between gap-3 pb-2 mb-3.5"
              style={{ borderBottom: "1px solid var(--hall-ink-0)" }}
            >
              <h2
                className="text-[19px] font-bold leading-none"
                style={{ letterSpacing: "-0.02em", color: "var(--hall-ink-0)" }}
              >
                Cómo{" "}
                <em
                  style={{
                    fontFamily: "var(--font-hall-display)",
                    fontStyle: "italic",
                    fontWeight: 400,
                    color: "var(--hall-ink-0)",
                  }}
                >
                  funciona
                </em>
              </h2>
            </div>
            <ol
              className="text-[12px] space-y-1.5 leading-relaxed list-decimal list-inside"
              style={{ color: "var(--hall-ink-3)" }}
            >
              <li>Tu archivo se sube a Supabase Storage para trazabilidad.</li>
              <li>Claude Sonnet 4.6 extrae 3-15 insights atómicos (no resumen, sí atoms).</li>
              <li>
                Cada insight se guarda como Evidence validado, con tu{" "}
                <code
                  className="text-[11px] px-1 py-0.5"
                  style={{
                    fontFamily: "var(--font-hall-mono)",
                    background: "var(--hall-fill-soft)",
                    borderRadius: 3,
                  }}
                >
                  case_code
                </code>{" "}
                como prefix.
              </li>
              <li>
                El knowledge-curator rutea cada insight al leaf correcto (usando el hint del
                extractor + su propio criterio).
              </li>
              <li>
                En segundos ves el resultado: qué se agregó al árbol, qué se propuso como SPLIT,
                qué se ignoró.
              </li>
            </ol>

            <div
              className="mt-6 pt-5"
              style={{ borderTop: "1px solid var(--hall-line-soft)" }}
            >
              <p
                className="text-[10px] uppercase tracking-[0.08em] mb-3"
                style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted-2)" }}
              >
                Familia de códigos
              </p>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-[11px]">
                <Code prefix="PRJ" label="Project instance" ex="ALGRAMO-CL-2020" />
                <Code prefix="DOC" label="Reference doc" ex="EMF-UK-2023" />
                <Code prefix="REG" label="Regulation" ex="EPR-UK-2024" />
                <Code prefix="STD" label="Standard" ex="BPI-US-2023" />
                <Code prefix="BCH" label="Benchmark" ex="IDEMAT-INT-2022" />
                <Code prefix="BOK" label="Book" ex="RAWORTH-UK-2017" />
                <Code prefix="NEW" label="News / article" ex="FASTCO-US-2024" />
                <Code prefix="ITV" label="Interview" ex="BOCKEN-NL-2024" />
                <Code prefix="INT" label="Internal CH" ex="CH-UK-2024" />
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

function Code({ prefix, label, ex }: { prefix: string; label: string; ex: string }) {
  return (
    <div className="flex items-baseline gap-2">
      <span
        className="text-[10px] font-bold px-1.5 py-0.5"
        style={{
          fontFamily: "var(--font-hall-mono)",
          color: "var(--hall-ink-0)",
          background: "var(--hall-fill-soft)",
          borderRadius: 3,
        }}
      >
        {prefix}:
      </span>
      <span className="text-[10px]" style={{ color: "var(--hall-muted-2)" }}>
        {label}
      </span>
      <span
        className="text-[9px] ml-auto"
        style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted-3)" }}
      >
        {ex}
      </span>
    </div>
  );
}
