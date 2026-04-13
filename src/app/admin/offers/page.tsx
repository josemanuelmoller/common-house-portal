"use client";

import { useEffect, useState } from "react";
import { Sidebar } from "@/components/Sidebar";
import { ADMIN_NAV } from "@/lib/admin-nav";
import Link from "next/link";

// ── Types ─────────────────────────────────────────────────────────────────────

type ProposalItem = {
  id: string;
  title: string;
  status: string;
  proposalType: string;
  budgetRange: string;
  clientName: string;
  geography: string;
  createdDate: string | null;
  notionUrl: string;
  kind: "proposal";
};

type OfferItem = {
  id: string;
  title: string;
  offerStatus: string;
  offerCategory: string;
  notionUrl: string;
  kind: "offer";
};

type KanbanCard = ProposalItem | OfferItem;

// ── Column mapping ─────────────────────────────────────────────────────────────

const PROPOSAL_TO_COL: Record<string, string> = {
  "Draft":      "Drafting",
  "In Review":  "Drafting",
  "Approved":   "Sent",
  "Sent":       "Sent",
  "Won":        "Signed",
  "Lost":       "Archived",
  "Archived":   "Archived",
};

const OFFER_TO_COL: Record<string, string> = {
  "Active":         "Sent",
  "In Development": "Drafting",
};

const COLUMNS = ["Drafting", "Sent", "Signed", "Archived"];

const COL_STYLE: Record<string, { header: string; dot: string; cardBorder: string }> = {
  "Drafting": { header: "text-[#131218]/40", dot: "bg-[#131218]/25",  cardBorder: "border-[#E0E0D8]" },
  "Sent":     { header: "text-amber-600",    dot: "bg-amber-500",     cardBorder: "border-amber-200" },
  "Signed":   { header: "text-[#131218]",    dot: "bg-[#c8f55a]",     cardBorder: "border-[#c8f55a]/60" },
  "Archived": { header: "text-[#131218]/25", dot: "bg-[#131218]/10",  cardBorder: "border-[#E0E0D8]" },
};

// ── Doc type pills ────────────────────────────────────────────────────────────

const DOC_TYPES = ["Offer", "Proposal", "Scope", "Amendment", "Renewal"];

// ── Main page ─────────────────────────────────────────────────────────────────

export default function OffersPage() {
  const [proposals, setProposals] = useState<ProposalItem[]>([]);
  const [offers, setOffers]       = useState<OfferItem[]>([]);
  const [loading, setLoading]     = useState(true);

  // Form state
  const [docType,      setDocType]      = useState("Offer");
  const [description,  setDescription]  = useState("");
  const [valueEst,     setValueEst]     = useState("");
  const [submitting,   setSubmitting]   = useState<"idle" | "loading" | "ok" | "err">("idle");

  useEffect(() => {
    fetch("/api/offers-data")
      .then(r => r.json())
      .then(d => {
        setProposals((d.proposals ?? []).map((p: ProposalItem) => ({ ...p, kind: "proposal" })));
        setOffers((d.offers ?? []).map((o: OfferItem) => ({ ...o, kind: "offer" })));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // Group into columns
  const byCol: Record<string, KanbanCard[]> = {};
  for (const col of COLUMNS) byCol[col] = [];

  for (const p of proposals) {
    const col = PROPOSAL_TO_COL[p.status] ?? "Drafting";
    byCol[col].push(p);
  }
  for (const o of offers) {
    const col = OFFER_TO_COL[o.offerStatus] ?? "Drafting";
    byCol[col].push(o);
  }

  const totalDocs = proposals.length + offers.length;

  // Revenue snapshot (rough from proposals)
  const signed   = proposals.filter(p => p.status === "Won");
  const pending  = proposals.filter(p => p.status === "Sent" || p.status === "Approved");
  const drafting = proposals.filter(p => p.status === "Draft" || p.status === "In Review");

  async function handleCreate() {
    if (!description.trim()) return;
    setSubmitting("loading");
    try {
      const res = await fetch("/api/offers-create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ docType, description, valueEst }),
      });
      if (!res.ok) throw new Error();
      setSubmitting("ok");
      setDescription("");
      setValueEst("");
      setTimeout(() => setSubmitting("idle"), 3000);
    } catch {
      setSubmitting("err");
      setTimeout(() => setSubmitting("idle"), 2500);
    }
  }

  return (
    <div className="flex min-h-screen bg-[#EFEFEA]">
      <Sidebar adminNav />

      <main className="flex-1 ml-[228px] flex flex-col">

        {/* Dark header */}
        <header className="bg-[#131218] px-12 pt-10 pb-11 flex-shrink-0">
          <p className="text-[8px] font-bold tracking-[2.5px] uppercase text-white/20 mb-3">
            Desks · Ofertas y propuestas
          </p>
          <div className="flex items-end justify-between">
            <div>
              <h1 className="text-[2.6rem] font-light text-white tracking-[-1.5px] leading-none">
                Commercial <em className="font-black italic text-[#c8f55a]">Desk</em>
              </h1>
              <p className="text-sm text-white/40 mt-3">
                Crea y gestiona ofertas, propuestas y scope documents. De borrador a firma.
              </p>
            </div>
            <div className="flex items-center gap-4 pb-1">
              <div className="text-right">
                <p className="text-[2rem] font-black text-white tracking-tight leading-none">{totalDocs}</p>
                <p className="text-[9px] font-bold tracking-[1.5px] uppercase text-white/30 mt-0.5">Docs activos</p>
              </div>
              <div className="w-px h-10 bg-white/10" />
              <div className="text-right">
                <p className="text-[2rem] font-black text-[#c8f55a] tracking-tight leading-none">{signed.length}</p>
                <p className="text-[9px] font-bold tracking-[1.5px] uppercase text-white/30 mt-0.5">Firmados</p>
              </div>
            </div>
          </div>
        </header>

        <div className="flex-1 px-12 py-9">
          <div className="grid grid-cols-[300px_1fr] gap-8 items-start">

            {/* ── Left: New doc form ─────────────────────────────────────── */}
            <div className="bg-white rounded-2xl border border-[#E0E0D8] overflow-hidden sticky top-8">
              <div className="bg-[#131218] px-5 py-4">
                <p className="text-[9px] font-bold tracking-[2px] uppercase text-white/30">Nueva solicitud</p>
                <p className="text-sm font-bold text-white mt-0.5">Commercial Desk</p>
              </div>

              <div className="px-5 py-4 flex flex-col gap-4">

                {/* Doc type */}
                <div>
                  <p className="text-[9px] font-bold tracking-[1.5px] uppercase text-[#131218]/30 mb-2">Tipo de documento</p>
                  <div className="flex flex-wrap gap-1.5">
                    {DOC_TYPES.map(t => (
                      <button
                        key={t}
                        onClick={() => setDocType(t)}
                        className={`text-[10px] font-bold px-3 py-1.5 rounded-full border transition-all ${
                          docType === t
                            ? "bg-[#131218] text-white border-[#131218]"
                            : "border-[#E0E0D8] text-[#131218]/40 hover:border-[#131218]/30"
                        }`}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Description */}
                <div>
                  <p className="text-[9px] font-bold tracking-[1.5px] uppercase text-[#131218]/30 mb-2">Descripción del scope</p>
                  <textarea
                    value={description}
                    onChange={e => setDescription(e.target.value)}
                    rows={4}
                    className="w-full border border-[#E0E0D8] rounded-lg px-3 py-2.5 text-xs text-[#131218] bg-[#EFEFEA] resize-none outline-none focus:border-[#131218]/40 placeholder-[#131218]/20"
                    placeholder="Qué incluye, entregables, timeline estimado, valor..."
                  />
                </div>

                {/* Value */}
                <div>
                  <p className="text-[9px] font-bold tracking-[1.5px] uppercase text-[#131218]/30 mb-2">Valor estimado (USD)</p>
                  <input
                    type="text"
                    value={valueEst}
                    onChange={e => setValueEst(e.target.value)}
                    className="w-full border border-[#E0E0D8] rounded-lg px-3 py-2.5 text-xs font-semibold text-[#131218] bg-[#EFEFEA] outline-none focus:border-[#131218]/40 placeholder-[#131218]/20"
                    placeholder="e.g. 18,500"
                  />
                </div>

                {/* Submit */}
                <button
                  onClick={handleCreate}
                  disabled={submitting === "loading" || !description.trim()}
                  className={`w-full text-xs font-bold py-2.5 rounded-xl transition-all ${
                    submitting === "ok"      ? "bg-[#c8f55a] text-[#131218]" :
                    submitting === "err"     ? "bg-red-100 text-red-700" :
                    submitting === "loading" ? "bg-[#131218]/40 text-white cursor-not-allowed" :
                    "bg-[#c8f55a] text-[#131218] hover:opacity-85"
                  }`}
                >
                  {submitting === "ok"      ? "✓ Borrador creado en Notion" :
                   submitting === "err"     ? "Error — intenta de nuevo" :
                   submitting === "loading" ? "Creando..." :
                   "Crear borrador →"}
                </button>
              </div>
            </div>

            {/* ── Right: Kanban + revenue ────────────────────────────────── */}
            <div className="flex flex-col gap-6">

              {/* Section label */}
              <div className="flex items-center gap-3">
                <p className="text-[9px] font-bold tracking-widest uppercase text-[#131218]/30">Pipeline comercial</p>
                <div className="flex-1 h-px bg-[#E0E0D8]" />
                <p className="text-[9px] font-bold text-[#131218]/25">{totalDocs} docs</p>
              </div>

              {/* Kanban board */}
              {loading ? (
                <div className="grid grid-cols-4 gap-3">
                  {COLUMNS.map(col => (
                    <div key={col} className="flex flex-col gap-2">
                      <div className="flex items-center gap-2 px-1">
                        <div className="w-2 h-2 rounded-full bg-[#131218]/10" />
                        <p className="text-[10px] font-bold uppercase tracking-widest text-[#131218]/20">{col}</p>
                      </div>
                      <div className="bg-white rounded-xl border border-[#E0E0D8] h-16 animate-pulse" />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="grid grid-cols-4 gap-3">
                  {COLUMNS.map(col => {
                    const cards = byCol[col] ?? [];
                    const style = COL_STYLE[col];
                    return (
                      <div key={col} className="flex flex-col gap-2">
                        {/* Column header */}
                        <div className="flex items-center gap-2 px-1">
                          <span className={`w-2 h-2 rounded-full shrink-0 ${style.dot}`} />
                          <p className={`text-[10px] font-bold uppercase tracking-widest ${style.header}`}>{col}</p>
                          <span className="ml-auto text-[10px] font-bold text-[#131218]/25">{cards.length}</span>
                        </div>

                        {/* Cards */}
                        <div className="flex flex-col gap-2">
                          {cards.map(card => (
                            <a
                              key={card.id}
                              href={card.kind === "proposal" ? card.notionUrl : card.notionUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className={`bg-white rounded-xl border-[1.5px] ${style.cardBorder} px-3 py-3 hover:border-[#131218]/30 hover:translate-y-[-2px] transition-all block ${col === "Archived" ? "opacity-50" : ""}`}
                            >
                              <span className={`inline-block text-[8px] font-bold uppercase tracking-widest mb-1.5 px-1.5 py-0.5 rounded ${
                                card.kind === "proposal"
                                  ? "bg-[#EFEFEA] text-[#131218]/50"
                                  : "bg-[#131218] text-[#c8f55a]"
                              }`}>
                                {card.kind === "proposal" ? (card as ProposalItem).proposalType || "Proposal" : "Offer"}
                              </span>
                              <p className="text-[11px] font-bold text-[#131218] leading-snug">
                                {card.title}
                              </p>
                              {card.kind === "proposal" && (card as ProposalItem).clientName && (
                                <p className="text-[9px] text-[#131218]/40 mt-1">
                                  {(card as ProposalItem).clientName}
                                  {(card as ProposalItem).geography && ` · ${(card as ProposalItem).geography}`}
                                </p>
                              )}
                              {card.kind === "proposal" && (card as ProposalItem).budgetRange && (
                                <p className="text-[11px] font-black text-[#131218] mt-2 tracking-tight">
                                  {(card as ProposalItem).budgetRange}
                                </p>
                              )}
                              {card.kind === "proposal" && (card as ProposalItem).createdDate && (
                                <p className="text-[9px] text-[#131218]/30 mt-0.5">
                                  {(card as ProposalItem).status} · {new Date((card as ProposalItem).createdDate!).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                                </p>
                              )}
                              {card.kind === "offer" && (
                                <p className="text-[9px] text-[#131218]/40 mt-1">
                                  {(card as OfferItem).offerCategory}
                                </p>
                              )}
                              {col === "Signed" && (
                                <span className="inline-block mt-2 text-[8px] font-bold bg-[#c8f55a] text-[#131218] px-2 py-0.5 rounded-full">
                                  Signed
                                </span>
                              )}
                              {col === "Sent" && card.kind === "proposal" && (card as ProposalItem).status === "Approved" && (
                                <span className="inline-block mt-2 text-[8px] font-bold bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">
                                  Awaiting PO
                                </span>
                              )}
                            </a>
                          ))}
                          {cards.length === 0 && (
                            <div className="bg-white rounded-xl border border-dashed border-[#E0E0D8] px-3 py-4 text-center">
                              <p className="text-[9px] text-[#131218]/20 font-medium">Empty</p>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Revenue snapshot */}
              <div className="bg-white rounded-2xl border border-[#E0E0D8] overflow-hidden">
                <div className="px-5 py-3 border-b border-[#EFEFEA] flex items-center gap-2">
                  <div className="w-6 h-6 bg-[#c8f55a] rounded-lg flex items-center justify-center">
                    <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="#000" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
                    </svg>
                  </div>
                  <p className="text-[11px] font-bold text-[#131218] tracking-tight">Revenue snapshot</p>
                </div>
                <div className="grid grid-cols-4 divide-x divide-[#EFEFEA]">
                  {[
                    { label: "Firmado",        value: signed.length,   sub: "contratos activos",    color: "text-[#131218]" },
                    { label: "Pendiente firma", value: pending.length,  sub: "en negociación",       color: "text-amber-500" },
                    { label: "En borrador",     value: drafting.length, sub: "en preparación",       color: "text-[#131218]/30" },
                    { label: "Ofertas activas", value: offers.filter(o => o.offerStatus === "Active").length, sub: "en catálogo", color: "text-blue-500" },
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
          </div>
        </div>
      </main>
    </div>
  );
}
