import Link from "next/link";
import { Sidebar } from "@/components/Sidebar";
import { KnowledgeIngestForm } from "@/components/KnowledgeIngestForm";
import { NAV } from "../../page";
import { requireAdmin } from "@/lib/require-admin";

export default async function AddKnowledgePage() {
  await requireAdmin();

  return (
    <div className="flex min-h-screen bg-[#EFEFEA]">
      <Sidebar items={NAV} isAdmin />
      <main className="flex-1 ml-[228px] overflow-auto">
        <div className="bg-[#131218] px-10 py-10">
          <Link href="/admin/knowledge" className="text-[10px] text-white/30 font-bold uppercase tracking-widest hover:text-[#c8f55a] transition-colors">
            ← Knowledge tree
          </Link>
          <h1 className="text-[2.6rem] font-[300] text-white leading-[1] tracking-[-1.5px] mt-3">
            Add <em className="font-[900] italic text-[#c8f55a]">external knowledge</em>
          </h1>
          <p className="text-[12.5px] text-white/40 mt-3 max-w-[620px] leading-[1.65]">
            Tercer riel de ingesta — docs externos (PDF, Word, URL, texto pegado) se convierten en evidence y fluyen al árbol. Útil para guías antiguas (ej. operational guide de Algramo 2020), reports de industria (EMF, McKinsey), case studies de otras marcas (Wild, Loop), regulaciones, etc.
          </p>
        </div>

        <div className="px-8 py-6 max-w-[960px]">
          <KnowledgeIngestForm />

          <div className="mt-6 bg-white rounded-[14px] border border-[#E0E0D8] p-5">
            <p className="text-[10px] font-bold text-[#131218]/30 uppercase tracking-widest mb-2">Cómo funciona</p>
            <ol className="text-[12px] text-[#131218]/60 space-y-1.5 leading-relaxed list-decimal list-inside">
              <li>Tu archivo se sube a Supabase Storage para trazabilidad.</li>
              <li>Claude Sonnet 4.6 extrae 3-15 insights atómicos (no resumen, sí atoms).</li>
              <li>Cada insight se guarda como Evidence validado, con tu <code className="text-[11px] bg-[#EFEFEA] px-1 py-0.5 rounded font-mono">case_code</code> como prefix.</li>
              <li>El knowledge-curator rutea cada insight al leaf correcto (usando el hint del extractor + su propio criterio).</li>
              <li>En segundos ves el resultado: qué se agregó al árbol, qué se propuso como SPLIT, qué se ignoró.</li>
            </ol>

            <div className="mt-4 pt-4 border-t border-[#EFEFEA]">
              <p className="text-[10px] font-bold text-[#131218]/30 uppercase tracking-widest mb-2">Familia de códigos</p>
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
      <span className="text-[10px] font-mono font-bold text-[#131218] bg-[#EFEFEA] px-1.5 py-0.5 rounded">{prefix}:</span>
      <span className="text-[10px] text-[#131218]/50">{label}</span>
      <span className="text-[9px] font-mono text-[#131218]/35 ml-auto">{ex}</span>
    </div>
  );
}
