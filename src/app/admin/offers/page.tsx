import { requireAdmin } from "@/lib/require-admin";
import { Sidebar } from "@/components/Sidebar";
import {
  getContentPipeline,
  getStyleProfiles,
  getAllProjects,
  getProposalBriefs,
  getCommercialOffers,
} from "@/lib/notion";
import DeskRequestForm from "@/components/DeskRequestForm";
import { DeskQueueSection } from "@/components/ContentCard";

const COMMERCIAL_TYPES = ["Proposal", "One-pager", "Offer Deck", "Exec Summary", "Scope Document"];
const COMMERCIAL_VISUAL_TYPES = new Set(["Proposal", "One-pager", "Offer Deck", "Exec Summary"]);

// ── Column mapping (for the Kanban pipeline section) ──────────────────────────

const PROPOSAL_TO_COL: Record<string, string> = {
  "Draft":     "Drafting",
  "In Review": "Drafting",
  "Approved":  "Sent",
  "Sent":      "Sent",
  "Won":       "Signed",
  "Lost":      "Archived",
  "Archived":  "Archived",
};

const OFFER_TO_COL: Record<string, string> = {
  "Active":         "Sent",
  "In Development": "Drafting",
};

const COLUMNS = ["Drafting", "Sent", "Signed"];

const COL_STYLE: Record<string, { header: string; dot: string; cardBorder: string }> = {
  "Drafting": { header: "text-[#131218]/40", dot: "bg-[#131218]/25",    cardBorder: "border-[#E0E0D8]" },
  "Sent":     { header: "text-amber-600",    dot: "bg-amber-500",       cardBorder: "border-amber-200" },
  "Signed":   { header: "text-[#131218]",    dot: "bg-[#c8f55a]",       cardBorder: "border-[#c8f55a]/60" },
};

export default async function OffersPage() {
  await requireAdmin();

  const [allContent, styleProfiles, allProjects, proposals, offers] = await Promise.all([
    getContentPipeline(),
    getStyleProfiles(),
    getAllProjects(),
    getProposalBriefs(),
    getCommercialOffers(),
  ]);

  // ── Content Pipeline queue (same pattern as Design/Comms) ────────────────────
  const deskItems = allContent.filter(item =>
    item.desk === "Commercial" ||
    (!item.desk && (
      COMMERCIAL_VISUAL_TYPES.has(item.contentType) ||
      item.contentType?.toLowerCase().includes("proposal") ||
      item.contentType?.toLowerCase().includes("offer deck")
    ))
  );

  const pending   = deskItems.filter(i => !i.draftText && !i.slideHtml);
  const generated = deskItems.filter(i => i.draftText || i.slideHtml);

  // Deck + Proposal style profiles only
  const commercialStyleProfiles = styleProfiles.filter(p =>
    p.styleType === "Proposal Style" ||
    p.styleType === "Deck Style" ||
    p.styleType === "One-pager Style"
  );

  const projectNames = allProjects.map(p => p.name).filter(Boolean).sort();

  // ── Kanban pipeline (proposals + offers from Notion DB) ──────────────────────
  const byCol: Record<string, typeof proposals[0][]> = {};
  for (const col of COLUMNS) byCol[col] = [];

  for (const p of proposals) {
    const col = PROPOSAL_TO_COL[p.status] ?? "Drafting";
    if (col !== "Archived") (byCol[col] as typeof proposals).push(p);
  }

  const signed   = proposals.filter(p => p.status === "Won");
  const pending2 = proposals.filter(p => p.status === "Sent" || p.status === "Approved");

  return (
    <div className="flex min-h-screen bg-[#EFEFEA]">
      <Sidebar adminNav />
      <main className="flex-1 ml-[228px]">

        {/* ── Dark header ─────────────────────────────────────────────────── */}
        <header className="bg-[#131218] px-12 pt-10 pb-11">
          <p className="text-[8px] font-bold tracking-[2.5px] uppercase text-white/20 mb-3">
            Desks · Ofertas y propuestas
          </p>
          <div className="flex items-end justify-between">
            <div>
              <h1 className="text-[2.6rem] font-light text-white tracking-[-1.5px] leading-none">
                Commercial <em className="font-black italic text-[#c8f55a]">Desk</em>
              </h1>
              <p className="text-sm text-white/40 mt-3 leading-relaxed">
                Propuestas, offer decks y scope documents — generados con el brand de CH, listos para presentar.
              </p>
            </div>
            <div className="flex items-center gap-4 pb-1">
              <div className="text-right">
                <p className="text-[2rem] font-black text-white tracking-tight leading-none">{generated.length}</p>
                <p className="text-[9px] font-bold tracking-[1.5px] uppercase text-white/30 mt-0.5">Generados</p>
              </div>
              <div className="w-px h-10 bg-white/10" />
              <div className="text-right">
                <p className="text-[2rem] font-black text-[#c8f55a] tracking-tight leading-none">{signed.length}</p>
                <p className="text-[9px] font-bold tracking-[1.5px] uppercase text-white/30 mt-0.5">Firmados</p>
              </div>
            </div>
          </div>
        </header>

        <div className="px-12 py-9 space-y-8">
          <div className="max-w-6xl grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6 items-start">

            {/* ── Request form ──────────────────────────────────────────────── */}
            <div className="bg-white border border-[#E0E0D8] rounded-[14px] overflow-hidden sticky top-8">
              <div className="px-5 py-4 border-b border-[#E0E0D8]">
                <p className="text-[8px] font-bold tracking-[2px] uppercase text-[#131218]/28 mb-1">Nueva solicitud</p>
                <p className="text-sm font-bold text-[#131218] tracking-[-0.3px]">Commercial Desk</p>
              </div>
              <DeskRequestForm
                deskType="commercial"
                contentTypes={COMMERCIAL_TYPES}
                channelOrProjectOptions={projectNames.length > 0 ? projectNames : ["Common House", "CH Portfolio", "Greenleaf Retail", "SUFI", "Fair Cycle"]}
                channelOrProjectLabel="Cliente / Proyecto"
                styleProfiles={commercialStyleProfiles}
              />
            </div>

            {/* ── Queue + Generated ─────────────────────────────────────────── */}
            <DeskQueueSection pending={pending} generated={generated} />

          </div>

          {/* ── Pipeline Notion (propuestas en curso) ────────────────────────── */}
          {(proposals.length > 0 || offers.filter(o => o.offerStatus !== "Deprecated").length > 0) && (
            <div className="max-w-6xl">
              <div className="flex items-center gap-3 mb-5">
                <p className="text-[9px] font-bold tracking-widest uppercase text-[#131218]/30">Pipeline comercial</p>
                <div className="flex-1 h-px bg-[#E0E0D8]" />
                <p className="text-[9px] font-bold text-[#131218]/25">
                  {proposals.length + offers.filter(o => o.offerStatus !== "Deprecated").length} docs en Notion
                </p>
              </div>

              <div className="grid grid-cols-3 gap-4">
                {COLUMNS.map(col => {
                  const cards = byCol[col] ?? [];
                  const offerCards = col === "Sent"
                    ? offers.filter(o => OFFER_TO_COL[o.offerStatus] === "Sent")
                    : col === "Drafting"
                    ? offers.filter(o => OFFER_TO_COL[o.offerStatus] === "Drafting")
                    : [];
                  const style = COL_STYLE[col];
                  const allCards = [...cards, ...offerCards];

                  return (
                    <div key={col}>
                      <div className="flex items-center gap-2 mb-3">
                        <span className={`w-2 h-2 rounded-full shrink-0 ${style.dot}`} />
                        <p className={`text-[10px] font-bold uppercase tracking-widest ${style.header}`}>{col}</p>
                        <span className="ml-auto text-[10px] font-bold text-[#131218]/25">{allCards.length}</span>
                      </div>
                      <div className="flex flex-col gap-2">
                        {cards.map(p => (
                          <a
                            key={p.id}
                            href={p.notionUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={`bg-white rounded-xl border-[1.5px] ${style.cardBorder} px-3 py-3 hover:border-[#131218]/30 hover:-translate-y-0.5 transition-all block`}
                          >
                            <span className="inline-block text-[8px] font-bold uppercase tracking-widest mb-1.5 px-1.5 py-0.5 rounded bg-[#EFEFEA] text-[#131218]/50">
                              {p.proposalType || "Proposal"}
                            </span>
                            <p className="text-[11px] font-bold text-[#131218] leading-snug">{p.title}</p>
                            {p.clientName && (
                              <p className="text-[9px] text-[#131218]/40 mt-1">{p.clientName}</p>
                            )}
                            {p.budgetRange && (
                              <p className="text-[11px] font-black text-[#131218] mt-1.5 tracking-tight">{p.budgetRange}</p>
                            )}
                            {col === "Signed" && (
                              <span className="inline-block mt-2 text-[8px] font-bold bg-[#c8f55a] text-[#131218] px-2 py-0.5 rounded-full">
                                Firmado
                              </span>
                            )}
                          </a>
                        ))}
                        {offerCards.map(o => (
                          <a
                            key={o.id}
                            href={o.notionUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={`bg-white rounded-xl border-[1.5px] ${style.cardBorder} px-3 py-3 hover:border-[#131218]/30 hover:-translate-y-0.5 transition-all block`}
                          >
                            <span className="inline-block text-[8px] font-bold uppercase tracking-widest mb-1.5 px-1.5 py-0.5 rounded bg-[#131218] text-[#c8f55a]">
                              Offer
                            </span>
                            <p className="text-[11px] font-bold text-[#131218] leading-snug">{o.title}</p>
                            {o.offerCategory && (
                              <p className="text-[9px] text-[#131218]/40 mt-1">{o.offerCategory}</p>
                            )}
                          </a>
                        ))}
                        {allCards.length === 0 && (
                          <div className="bg-white rounded-xl border border-dashed border-[#E0E0D8] px-3 py-4 text-center">
                            <p className="text-[9px] text-[#131218]/20 font-medium">Vacío</p>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Revenue snapshot */}
              <div className="mt-4 bg-white rounded-2xl border border-[#E0E0D8] overflow-hidden">
                <div className="grid grid-cols-4 divide-x divide-[#EFEFEA]">
                  {[
                    { label: "Firmado",        value: signed.length,                              color: "text-[#131218]",  sub: "contratos activos" },
                    { label: "Pendiente firma", value: pending2.length,                            color: "text-amber-500", sub: "en negociación"    },
                    { label: "En borrador",     value: proposals.filter(p => p.status === "Draft" || p.status === "In Review").length, color: "text-[#131218]/30", sub: "en preparación" },
                    { label: "Ofertas activas", value: offers.filter(o => o.offerStatus === "Active").length, color: "text-blue-500", sub: "en catálogo" },
                  ].map(stat => (
                    <div key={stat.label} className="px-5 py-4">
                      <p className={`text-[1.4rem] font-black tracking-tight leading-none ${stat.color}`}>{stat.value}</p>
                      <p className="text-[9px] font-bold text-[#131218]/30 uppercase tracking-widest mt-1">{stat.label}</p>
                      <p className="text-[9px] text-[#131218]/25 mt-0.5">{stat.sub}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

        </div>
      </main>
    </div>
  );
}
