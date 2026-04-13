import { requireAdmin } from "@/lib/require-admin";
import { Sidebar } from "@/components/Sidebar";
import { ADMIN_NAV } from "@/lib/admin-nav";

const QUEUE = [
  { title: "Pitch deck — Fair Cycle Serie A",        meta: "Deck · AP · Para 16 Apr",          status: "inprogress", label: "In progress" },
  { title: "One-pager — Pilot Scope Auto Mercado",   meta: "One-pager · AP · Para 15 Apr",     status: "inprogress", label: "In progress" },
  { title: "Investor brief — CircularWave",          meta: "Brief · AP · Revisión pendiente",  status: "review",     label: "At review"   },
  { title: "Informe ejecutivo — LATAM NGO Q1",       meta: "Informe · AP · Entregado 5 Apr",   status: "delivered",  label: "Delivered"   },
  { title: "Propuesta — BioPackaging Discovery",     meta: "Propuesta · AP · Entregado 3 Apr", status: "delivered",  label: "Delivered"   },
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

export default async function DesignPage() {
  await requireAdmin();

  return (
    <div className="flex min-h-screen bg-[#EFEFEA]">
      <Sidebar adminNav />
      <main className="flex-1 ml-[228px]">

        {/* Dark header — matches platform-admin.html page-header pattern */}
        <header className="bg-[#131218] px-12 pt-10 pb-11">
          <p className="text-[8px] font-bold tracking-[2.5px] uppercase text-white/20 mb-3">Desks · Producción visual</p>
          <h1 className="text-[2.6rem] font-light text-white tracking-[-1.5px] leading-none">
            Design <em className="font-black not-italic text-[#B2FF59]">Desk</em>
          </h1>
          <p className="text-sm text-white/40 mt-3 leading-relaxed">
            Solicitudes, producción y entrega de piezas visuales — decks, one-pagers, propuestas, informes.
          </p>
        </header>

        {/* Content */}
        <div className="px-12 py-9">
          <div className="max-w-5xl grid grid-cols-1 lg:grid-cols-[1fr_2fr] gap-6 items-start">

            {/* Request form */}
            <div className="bg-white border border-[#E0E0D8] rounded-[14px] overflow-hidden">
              <div className="px-5 py-4 border-b border-[#E0E0D8]">
                <p className="text-[8px] font-bold tracking-[2px] uppercase text-[#0e0e0e]/28 mb-1">Nueva solicitud</p>
                <p className="text-sm font-bold text-[#0e0e0e] tracking-[-0.3px]">Design Desk</p>
              </div>
              <div className="px-5 py-4 flex flex-col gap-4">
                <div>
                  <p className="text-[9px] font-bold tracking-[1.5px] uppercase text-[#0e0e0e]/30 mb-2">Tipo</p>
                  <div className="flex flex-wrap gap-1.5">
                    {["Deck","One-pager","Propuesta","Investor brief","Informe"].map((t, i) => (
                      <button key={t} className={`text-[10px] font-semibold px-3 py-1.5 rounded-full border transition-all ${i === 0 ? "bg-[#131218] text-white border-[#131218]" : "border-[#E0E0D8] text-[#0e0e0e]/50 hover:border-[#0e0e0e]/40 hover:text-[#0e0e0e]"}`}>
                        {t}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-[9px] font-bold tracking-[1.5px] uppercase text-[#0e0e0e]/30 mb-2">Descripción</p>
                  <textarea
                    className="w-full h-24 border border-[#E0E0D8] rounded-lg px-3 py-2.5 text-xs text-[#0e0e0e] bg-[#EFEFEA] resize-none outline-none focus:border-[#0e0e0e]/40 placeholder-[#0e0e0e]/20"
                    placeholder="Qué necesitas, para quién y cuándo..."
                  />
                </div>
                <div>
                  <p className="text-[9px] font-bold tracking-[1.5px] uppercase text-[#0e0e0e]/30 mb-2">Proyecto</p>
                  <div className="flex flex-wrap gap-1.5">
                    {["Auto Mercado","Fair Cycle","LATAM NGO","CH Institucional"].map((p, i) => (
                      <button key={p} className={`text-[10px] font-semibold px-3 py-1.5 rounded-full border transition-all ${i === 0 ? "bg-[#131218] text-white border-[#131218]" : "border-[#E0E0D8] text-[#0e0e0e]/50 hover:border-[#0e0e0e]/40 hover:text-[#0e0e0e]"}`}>
                        {p}
                      </button>
                    ))}
                  </div>
                </div>
                <button className="w-full bg-[#B2FF59] text-[#131218] text-xs font-bold py-2.5 rounded-lg hover:opacity-85 transition-opacity">
                  Enviar solicitud →
                </button>
              </div>
            </div>

            {/* Queue */}
            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-3">
                <p className="text-[9px] font-bold tracking-[1.5px] uppercase text-[#0e0e0e]/30">Cola de producción</p>
                <div className="flex-1 h-px bg-[#E0E0D8]" />
                <p className="text-[9px] font-bold text-[#0e0e0e]/25">{QUEUE.length} items</p>
              </div>
              {QUEUE.map(item => (
                <div key={item.title} className="bg-white border border-[#E0E0D8] rounded-[12px] px-4 py-3.5 flex items-start gap-3 hover:border-[#aaa] hover:-translate-y-0.5 transition-all">
                  <span className={`w-2 h-2 rounded-full flex-shrink-0 mt-1 ${DOT[item.status]}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-[12.5px] font-bold text-[#0e0e0e] tracking-[-0.2px]">{item.title}</p>
                    <p className="text-[10px] text-[#6b6b6b] mt-0.5">{item.meta}</p>
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
