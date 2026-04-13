import { requireAdmin } from "@/lib/require-admin";
import { Sidebar } from "@/components/Sidebar";
import { ADMIN_NAV } from "@/lib/admin-nav";

const QUEUE = [
  { title: "Post LinkedIn — Lanzamiento Fair Cycle seed round",      meta: "Post · Founder voice · Canal: LinkedIn",      status: "inprogress", label: "In progress" },
  { title: "Newsletter block — Novedades portafolio Abril",          meta: "Newsletter · CH Institucional",               status: "inprogress", label: "In progress" },
  { title: "Artículo — El modelo refill en supermercados LATAM",     meta: "Artículo · CH Insights · Revisión editorial", status: "review",     label: "At review"   },
  { title: "Post — Circular economy policy update EU 2026",          meta: "Post · Publicado 8 Apr",                      status: "delivered",  label: "Published"   },
];

const DOT: Record<string, string> = {
  inprogress: "bg-blue-500",
  review:     "bg-amber-400",
  delivered:  "bg-[#B2FF59]",
};

const PILL: Record<string, string> = {
  inprogress: "bg-blue-50 text-blue-700",
  review:     "bg-amber-50 text-amber-800",
  delivered:  "bg-green-50 text-green-700",
};

export default async function CommsPage() {
  await requireAdmin();

  return (
    <div className="flex min-h-screen bg-[#EFEFEA]">
      <Sidebar adminNav />
      <main className="flex-1 ml-[228px]">

        {/* Dark header */}
        <header className="bg-[#131218] px-12 pt-10 pb-11">
          <p className="text-[8px] font-bold tracking-[2.5px] uppercase text-white/20 mb-3">Desks · Contenido escrito</p>
          <h1 className="text-[2.6rem] font-light text-white tracking-[-1.5px] leading-none">
            Comms <em className="font-black not-italic text-[#B2FF59]">Desk</em>
          </h1>
          <p className="text-sm text-white/40 mt-3 leading-relaxed">
            Posts, newsletters, artículos y voz de fundador. Canal por canal, tono por tono.
          </p>
        </header>

        <div className="px-12 py-9">
          <div className="max-w-5xl grid grid-cols-1 lg:grid-cols-[1fr_2fr] gap-6 items-start">

            {/* Request form */}
            <div className="bg-white border border-[#E0E0D8] rounded-2xl overflow-hidden">
              <div className="px-5 py-4 border-b border-[#E0E0D8]">
                <p className="text-[8px] font-bold tracking-[2px] uppercase text-[#131218]/30 mb-1">Nueva solicitud</p>
                <p className="text-sm font-bold text-[#131218]">Comms Desk</p>
              </div>
              <div className="px-5 py-4 flex flex-col gap-4">
                <div>
                  <p className="text-[9px] font-bold tracking-[1.5px] uppercase text-[#131218]/30 mb-2">Tipo</p>
                  <div className="flex flex-wrap gap-1.5">
                    {["Post","Newsletter","Artículo","Founder voice","CH Institucional"].map((t, i) => (
                      <button key={t} className={`text-[10px] font-semibold px-3 py-1.5 rounded-full border transition-all ${i === 0 ? "bg-[#131218] text-white border-[#131218]" : "border-[#E0E0D8] text-[#131218]/50 hover:border-[#131218]/40 hover:text-[#131218]"}`}>
                        {t}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-[9px] font-bold tracking-[1.5px] uppercase text-[#131218]/30 mb-2">Ángulo / contexto</p>
                  <textarea
                    className="w-full h-24 border border-[#E0E0D8] rounded-lg px-3 py-2.5 text-xs text-[#131218] bg-[#EFEFEA] resize-none outline-none focus:border-[#131218]/40 placeholder-[#131218]/20"
                    placeholder="Qué queremos decir, a quién y en qué tono..."
                  />
                </div>
                <div>
                  <p className="text-[9px] font-bold tracking-[1.5px] uppercase text-[#131218]/30 mb-2">Canal</p>
                  <div className="flex flex-wrap gap-1.5">
                    {["LinkedIn CH","Newsletter","X / Twitter","Founder personal"].map((c, i) => (
                      <button key={c} className={`text-[10px] font-semibold px-3 py-1.5 rounded-full border transition-all ${i === 0 ? "bg-[#131218] text-white border-[#131218]" : "border-[#E0E0D8] text-[#131218]/50 hover:border-[#131218]/40 hover:text-[#131218]"}`}>
                        {c}
                      </button>
                    ))}
                  </div>
                </div>
                <button className="w-full bg-[#131218] text-white text-xs font-bold py-2.5 rounded-xl hover:bg-[#131218]/80 transition-colors">
                  Enviar solicitud →
                </button>
              </div>
            </div>

            {/* Queue */}
            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-3">
                <p className="text-[9px] font-bold tracking-[1.5px] uppercase text-[#131218]/30">Cola de contenido</p>
                <div className="flex-1 h-px bg-[#E0E0D8]" />
                <p className="text-[9px] font-bold text-[#131218]/25">{QUEUE.length} items</p>
              </div>
              {QUEUE.map(item => (
                <div key={item.title} className="bg-white border border-[#E0E0D8] rounded-xl px-4 py-3.5 flex items-start gap-3">
                  <span className={`w-2 h-2 rounded-full flex-shrink-0 mt-1 ${DOT[item.status]}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-[12.5px] font-bold text-[#131218] tracking-tight">{item.title}</p>
                    <p className="text-[10px] text-[#131218]/40 mt-0.5">{item.meta}</p>
                  </div>
                  <span className={`text-[8.5px] font-bold tracking-[0.5px] px-2 py-1 rounded-md whitespace-nowrap flex-shrink-0 ${PILL[item.status]}`}>
                    {item.label}
                  </span>
                </div>
              ))}
            </div>

          </div>
        </div>
      </main>
    </div>
  );
}
