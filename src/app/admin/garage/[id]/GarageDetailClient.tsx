"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import type {
  Project,
  EvidenceItem,
  SourceItem,
  DecisionItem,
  StartupOrgData,
  FinancialSnapshot,
  ValuationRecord,
  CapTableEntry,
  DataRoomItem,
  OpportunityItem,
  MeetingItem,
} from "@/lib/notion";

// ─── Types ─────────────────────────────────────────────────────────────────────

type Tab = "pulse" | "financials" | "valuation" | "captable" | "funding" | "commercial" | "investorupdate" | "dataroom";

// Garage ingest types
interface ExtractedData {
  organization: {
    description: string;
    sector_tags: string[];
    geography: string;
    founding_year: number | null;
    website: string;
    team: { name: string; role: string }[];
  };
  evidence: { title: string; type: string; statement: string; date: string | null; confidence: string }[];
  financials: { period: string; revenue: number | null; burn: number | null; gross_margin_pct: number | null; cash: number | null; runway_months: number | null; arr: number | null; mrr: number | null; confidence: string }[];
  cap_table: { shareholder_name: string; type: string; share_class: string; ownership_pct: number | null; invested_amount: number | null; round: string; confidence: string }[];
  valuations: { round: string; pre_money_min: number | null; pre_money_max: number | null; method: string; confidence: string }[];
  knowledge_assets: { title: string; asset_type: string; summary: string; key_points: string[]; tags: string[]; confidence: string }[];
  insight_briefs: { title: string; theme: string[]; summary: string; confidence: string }[];
  decision_items: { title: string; category: string; priority: string; notes: string }[];
  draft_status_update: string;
}

interface IngestResults {
  evidence: number;
  financials: number;
  cap_table: number;
  valuations: number;
  knowledge_assets: number;
  insight_briefs: number;
  decision_items: number;
  org_updated: boolean;
  project_updated: boolean;
  errors: string[];
}

type IngestState =
  | { status: "idle" }
  | { status: "processing"; fileId: string }
  | { status: "preview"; fileId: string; extraction: ExtractedData }
  | { status: "executing"; fileId: string }
  | { status: "done"; fileId: string; results: IngestResults };

type Props = {
  project: Project;
  evidence: EvidenceItem[];
  sources: SourceItem[];
  decisions: DecisionItem[];
  orgData: StartupOrgData | null;
  financials: FinancialSnapshot[];
  valuations: ValuationRecord[];
  capTable: CapTableEntry[];
  dataRoom: DataRoomItem[];
  orgId?: string;
  opportunities: OpportunityItem[];
  meetings: MeetingItem[];
};

// ─── Helpers ───────────────────────────────────────────────────────────────────

const EVIDENCE_TYPE_COLORS: Record<string, string> = {
  "Milestone":     "bg-green-50  text-green-700  border-green-200",
  "Traction":      "bg-blue-50   text-blue-700   border-blue-200",
  "Risk":          "bg-red-50    text-red-600    border-red-200",
  "Blocker":       "bg-red-100   text-red-700    border-red-300",
  "Insight":       "bg-purple-50 text-purple-700 border-purple-200",
  "Decision":      "bg-amber-50  text-amber-700  border-amber-200",
  "Dependency":    "bg-orange-50 text-orange-700 border-orange-200",
  "Outcome":       "bg-teal-50   text-teal-700   border-teal-200",
  "Assumption":    "bg-slate-50  text-slate-600  border-slate-200",
};

function evidenceTypeBadge(type: string) {
  const cls = EVIDENCE_TYPE_COLORS[type] ?? "bg-[#EFEFEA] text-[#131218]/50 border-[#E0E0D8]";
  return `text-[8.5px] font-bold px-2 py-0.5 rounded-full border ${cls}`;
}

function validationDot(status: string) {
  if (status === "Validated") return "bg-green-400";
  if (status === "New")       return "bg-amber-400";
  if (status === "Rejected")  return "bg-red-400";
  if (status === "Reviewed")  return "bg-blue-400";
  return "bg-[#131218]/15";
}

function fmtDate(d: string | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function fmtMoney(n: number | null, prefix = "£"): string {
  if (n === null || n === undefined) return "—";
  if (n >= 1_000_000) return `${prefix}${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${prefix}${(n / 1_000).toFixed(0)}k`;
  return `${prefix}${n.toLocaleString()}`;
}

function fmtPct(n: number | null): string {
  if (n === null || n === undefined) return "—";
  return `${(n * 100).toFixed(1)}%`;
}

const PRIORITY_COLORS: Record<string, string> = {
  "P1 Critical": "text-red-600 bg-red-50 border-red-200",
  "High":        "text-orange-600 bg-orange-50 border-orange-200",
  "Medium":      "text-amber-600 bg-amber-50 border-amber-200",
  "Low":         "text-[#131218]/40 bg-[#EFEFEA] border-[#E0E0D8]",
};

const STATUS_COLORS: Record<string, string> = {
  "Complete": "text-green-700 bg-green-50 border-green-200",
  "Partial":  "text-amber-700 bg-amber-50 border-amber-200",
  "Missing":  "text-red-600   bg-red-50   border-red-200",
};

const CONFIDENCE_COLORS: Record<string, string> = {
  "High":   "text-green-700",
  "Medium": "text-amber-600",
  "Low":    "text-red-500",
};

// ─── Empty state ───────────────────────────────────────────────────────────────

function EmptyState({ label }: { label: string }) {
  return (
    <div className="bg-white border border-[#E0E0D8] rounded-2xl p-12 text-center">
      <p className="text-sm font-bold text-[#131218]/25 mb-1">No {label} records yet</p>
      <p className="text-xs text-[#131218]/20">Add entries in Notion to surface them here.</p>
    </div>
  );
}

// ─── Pulse tab ─────────────────────────────────────────────────────────────────

function PulseTab({ project, evidence, sources, decisions, meetings }: {
  project: Project;
  evidence: EvidenceItem[];
  sources: SourceItem[];
  decisions: DecisionItem[];
  meetings: MeetingItem[];
}) {
  const recent    = evidence.slice(0, 6);
  const openDecs  = decisions.filter(d => d.status === "Open");

  return (
    <div className="grid grid-cols-3 gap-5">

      {/* Left column: evidence + decisions */}
      <div className="col-span-2 space-y-5">

        {/* Recent evidence */}
        <div className="bg-white border border-[#E0E0D8] rounded-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-[#EFEFEA]">
            <p className="text-[9px] font-bold tracking-widest uppercase text-[#131218]/30">Recent Evidence</p>
            <p className="text-sm font-bold text-[#131218] mt-0.5">{evidence.length} items total</p>
          </div>
          {recent.length > 0 ? (
            <div className="divide-y divide-[#EFEFEA]">
              {recent.map(ev => (
                <div key={ev.id} className="px-5 py-3.5 flex items-start gap-3">
                  <span className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${validationDot(ev.validationStatus)}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      {ev.type && (
                        <span className={evidenceTypeBadge(ev.type)}>{ev.type}</span>
                      )}
                      <span className="text-[8px] text-[#131218]/30 font-medium">{fmtDate(ev.dateCaptured)}</span>
                    </div>
                    <p className="text-[12.5px] font-medium text-[#131218] leading-snug line-clamp-2">
                      {ev.title || ev.excerpt || "—"}
                    </p>
                    {ev.excerpt && ev.title && (
                      <p className="text-[11px] text-[#131218]/40 mt-0.5 line-clamp-1">{ev.excerpt}</p>
                    )}
                  </div>
                  <span className="text-[9px] font-medium text-[#131218]/25 shrink-0 mt-0.5">{ev.validationStatus}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="px-5 py-8 text-center">
              <p className="text-xs text-[#131218]/25">No evidence captured yet</p>
            </div>
          )}
        </div>

        {/* Open decisions */}
        <div className="bg-white border border-[#E0E0D8] rounded-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-[#EFEFEA]">
            <p className="text-[9px] font-bold tracking-widest uppercase text-[#131218]/30">Open Decisions</p>
            <p className="text-sm font-bold text-[#131218] mt-0.5">
              {openDecs.length > 0 ? `${openDecs.length} open` : "No open decisions"}
            </p>
          </div>
          {openDecs.length > 0 ? (
            <div className="divide-y divide-[#EFEFEA]">
              {openDecs.slice(0, 5).map(dec => (
                <div key={dec.id} className="px-5 py-3.5 flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className={`text-[8.5px] font-bold px-2 py-0.5 rounded-full border ${PRIORITY_COLORS[dec.priority] ?? "bg-[#EFEFEA] text-[#131218]/40 border-[#E0E0D8]"}`}>
                        {dec.priority}
                      </span>
                      {dec.decisionType && (
                        <span className="text-[8px] text-[#131218]/30 font-medium">{dec.decisionType}</span>
                      )}
                    </div>
                    <p className="text-[12.5px] font-medium text-[#131218] leading-snug line-clamp-2">{dec.title}</p>
                    {dec.dueDate && (
                      <p className="text-[10px] text-amber-600 font-medium mt-0.5">Due {fmtDate(dec.dueDate)}</p>
                    )}
                  </div>
                  {dec.notionUrl && (
                    <a
                      href={dec.notionUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[#131218]/20 hover:text-[#131218]/60 transition-colors text-sm shrink-0"
                    >
                      →
                    </a>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="px-5 py-8 text-center">
              <p className="text-xs text-[#131218]/25">No open decisions</p>
            </div>
          )}
        </div>

      </div>

      {/* Right column: status summary + sources */}
      <div className="space-y-5">

        {/* Status summary */}
        <div className="bg-white border border-[#E0E0D8] rounded-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-[#EFEFEA]">
            <p className="text-[9px] font-bold tracking-widest uppercase text-[#131218]/30">Status Summary</p>
          </div>
          <div className="px-5 py-4">
            {project.statusSummary ? (
              <p className="text-[12.5px] text-[#131218]/75 leading-relaxed">{project.statusSummary}</p>
            ) : (
              <p className="text-xs text-[#131218]/25 italic">No summary written yet</p>
            )}
          </div>
        </div>

        {/* Draft update */}
        {project.draftUpdate && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-amber-100">
              <p className="text-[9px] font-bold tracking-widest uppercase text-amber-600/60">Draft Update</p>
            </div>
            <div className="px-5 py-4">
              <p className="text-[12.5px] text-amber-800/80 leading-relaxed">{project.draftUpdate}</p>
            </div>
          </div>
        )}

        {/* Sessions / meetings */}
        <div className="bg-white border border-[#E0E0D8] rounded-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-[#EFEFEA]">
            <p className="text-[9px] font-bold tracking-widest uppercase text-[#131218]/30">Sessions</p>
            <p className="text-sm font-bold text-[#131218] mt-0.5">{meetings.length} meeting{meetings.length !== 1 ? "s" : ""}</p>
          </div>
          {meetings.length > 0 ? (
            <div className="divide-y divide-[#EFEFEA]">
              {meetings.slice(0, 5).map(m => (
                <div key={m.id} className="px-5 py-3">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-[12px] font-medium text-[#131218] leading-snug line-clamp-2 flex-1">{m.title}</p>
                    {m.url && (
                      <a
                        href={m.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[#131218]/20 hover:text-[#131218]/60 transition-colors text-sm shrink-0"
                      >
                        →
                      </a>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    {m.platform && (
                      <span className="text-[9px] text-[#131218]/30 font-medium">{m.platform}</span>
                    )}
                    {m.platform && m.date && <span className="text-[#131218]/15">·</span>}
                    {m.date && (
                      <span className="text-[9px] text-[#131218]/25">{fmtDate(m.date)}</span>
                    )}
                  </div>
                  {m.processedSummary && (
                    <p className="text-[10.5px] text-[#131218]/50 mt-1.5 leading-snug line-clamp-3 italic">
                      {m.processedSummary}
                    </p>
                  )}
                </div>
              ))}
              {meetings.length > 5 && (
                <div className="px-5 py-2.5">
                  <p className="text-[10px] text-[#131218]/30">+{meetings.length - 5} more sessions</p>
                </div>
              )}
            </div>
          ) : (
            <div className="px-5 py-6 text-center">
              <p className="text-xs text-[#131218]/25">No meetings linked</p>
            </div>
          )}
        </div>

        {/* Sources breakdown */}
        <div className="bg-white border border-[#E0E0D8] rounded-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-[#EFEFEA]">
            <p className="text-[9px] font-bold tracking-widest uppercase text-[#131218]/30">Sources</p>
            <p className="text-sm font-bold text-[#131218] mt-0.5">{sources.length} total</p>
          </div>
          {sources.length > 0 ? (
            <div className="divide-y divide-[#EFEFEA]">
              {sources.slice(0, 5).map(src => (
                <div key={src.id} className="px-5 py-2.5">
                  <p className="text-[12px] font-medium text-[#131218] truncate">{src.title}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[9px] text-[#131218]/30 font-medium">{src.sourceType}</span>
                    <span className="text-[#131218]/15">·</span>
                    <span className="text-[9px] text-[#131218]/25">{fmtDate(src.dateIngested)}</span>
                  </div>
                </div>
              ))}
              {sources.length > 5 && (
                <div className="px-5 py-2.5">
                  <p className="text-[10px] text-[#131218]/30">+{sources.length - 5} more sources</p>
                </div>
              )}
            </div>
          ) : (
            <div className="px-5 py-6 text-center">
              <p className="text-xs text-[#131218]/25">No sources linked</p>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}

// ─── Contextual upload trigger ─────────────────────────────────────────────────

function UploadCTA({ label, onUpload }: { label: string; onUpload: () => void }) {
  return (
    <button
      onClick={onUpload}
      className="w-full flex items-center gap-3 border-2 border-dashed border-[#E0E0D8] rounded-2xl px-6 py-5 text-left hover:border-[#131218]/25 hover:bg-[#EFEFEA]/50 transition-all group"
    >
      <span className="text-[#131218]/20 text-xl group-hover:text-[#131218]/40 transition-colors">↑</span>
      <div>
        <p className="text-[11.5px] font-semibold text-[#131218]/40 group-hover:text-[#131218]/70 transition-colors">{label}</p>
        <p className="text-[10px] text-[#131218]/25 mt-0.5">PDF · XLSX · PPTX · DOCX</p>
      </div>
    </button>
  );
}

// ─── Stage badge colours ────────────────────────────────────────────────────────

const OPP_STAGE_COLORS: Record<string, string> = {
  "New":           "bg-[#EFEFEA] text-[#131218]/40 border-[#E0E0D8]",
  "Exploring":     "bg-blue-50 text-blue-600 border-blue-200",
  "Qualifying":    "bg-amber-50 text-amber-700 border-amber-200",
  "Active":        "bg-green-50 text-green-700 border-green-200",
  "Proposal Sent": "bg-purple-50 text-purple-700 border-purple-200",
  "Negotiation":   "bg-orange-50 text-orange-700 border-orange-200",
  "Won":           "bg-[#c8f55a]/30 text-[#2d6a00] border-[#b2ff59]",
  "Lost":          "bg-red-50 text-red-500 border-red-200",
};

// ─── Financials tab ────────────────────────────────────────────────────────────

function FinancialsTab({ orgData, financials, onUpload }: { orgData: StartupOrgData | null; financials: FinancialSnapshot[]; onUpload: () => void }) {
  const latest = financials[0] ?? null;

  return (
    <div className="space-y-5">

      {/* Org-level metrics (from CH Organizations) */}
      {orgData && (
        <div className="grid grid-cols-4 gap-4">
          {[
            { label: "MRR",               value: orgData.mrr              || "—" },
            { label: "Funding Round",     value: orgData.fundingRound     || "—" },
            { label: "Investment Status", value: orgData.investmentStatus || "—" },
            { label: "Team Size",         value: orgData.teamSize         || "—" },
          ].map(s => (
            <div key={s.label} className="bg-white border border-[#E0E0D8] rounded-2xl px-5 py-4">
              <p className="text-[9px] font-bold tracking-widest uppercase text-[#131218]/30 mb-1">{s.label}</p>
              <p className="text-[15px] font-bold text-[#131218] tracking-tight">{s.value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Latest snapshot headline */}
      {latest && (
        <div className="bg-white border border-[#E0E0D8] rounded-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-[#EFEFEA] flex items-center justify-between">
            <div>
              <p className="text-[9px] font-bold tracking-widest uppercase text-[#131218]/30">Latest Snapshot</p>
              <p className="text-sm font-bold text-[#131218] mt-0.5">{latest.name || fmtDate(latest.period)}</p>
            </div>
            {latest.period && (
              <span className="text-[10px] font-medium text-[#131218]/40">{fmtDate(latest.period)}</span>
            )}
          </div>
          <div className="grid grid-cols-4 divide-x divide-[#EFEFEA]">
            {[
              { label: "Revenue",      value: fmtMoney(latest.revenue)     },
              { label: "Burn",         value: fmtMoney(latest.burn)        },
              { label: "Cash",         value: fmtMoney(latest.cash)        },
              { label: "Runway (mo)",  value: latest.runway !== null ? `${latest.runway}mo` : "—" },
            ].map(s => (
              <div key={s.label} className="px-5 py-4">
                <p className="text-[8px] font-bold tracking-wider uppercase text-[#131218]/25 mb-0.5">{s.label}</p>
                <p className="text-[15px] font-bold text-[#131218] tracking-tight">{s.value}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* All snapshots table */}
      {financials.length > 0 ? (
        <div className="bg-white border border-[#E0E0D8] rounded-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-[#EFEFEA]">
            <p className="text-[9px] font-bold tracking-widest uppercase text-[#131218]/30">All Snapshots ({financials.length})</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-[11.5px]">
              <thead>
                <tr className="border-b border-[#EFEFEA]">
                  {["Period", "Revenue", "Cost", "Gross Margin", "Burn", "Cash", "Runway"].map(h => (
                    <th key={h} className="text-left px-5 py-2.5 text-[8px] font-bold tracking-wider uppercase text-[#131218]/25">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EFEFEA]">
                {financials.map(snap => (
                  <tr key={snap.id} className="hover:bg-[#EFEFEA]/40 transition-colors">
                    <td className="px-5 py-3 font-medium text-[#131218]">{fmtDate(snap.period)}</td>
                    <td className="px-5 py-3 text-[#131218]/70">{fmtMoney(snap.revenue)}</td>
                    <td className="px-5 py-3 text-[#131218]/70">{fmtMoney(snap.cost)}</td>
                    <td className="px-5 py-3 text-[#131218]/70">{fmtPct(snap.grossMargin)}</td>
                    <td className="px-5 py-3 text-[#131218]/70">{fmtMoney(snap.burn)}</td>
                    <td className="px-5 py-3 text-[#131218]/70">{fmtMoney(snap.cash)}</td>
                    <td className="px-5 py-3 text-[#131218]/70">{snap.runway !== null ? `${snap.runway}mo` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <EmptyState label="financial snapshot" />
      )}

      {/* Contextual upload */}
      <UploadCTA label="Upload financial documents — model, P&L, projections, cap table" onUpload={onUpload} />
    </div>
  );
}

// ─── Valuation tab ─────────────────────────────────────────────────────────────

function ValuationTab({ valuations }: { valuations: ValuationRecord[] }) {
  if (!valuations.length) return <EmptyState label="valuation" />;

  return (
    <div className="space-y-4">
      {valuations.map(v => (
        <div key={v.id} className="bg-white border border-[#E0E0D8] rounded-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-[#EFEFEA] flex items-center justify-between">
            <div>
              <p className="text-[9px] font-bold tracking-widest uppercase text-[#131218]/30 mb-0.5">{v.method}</p>
              <p className="text-sm font-bold text-[#131218]">{v.name || "Unnamed valuation"}</p>
            </div>
            <div className="flex items-center gap-3">
              {v.status && (
                <span className="text-[8.5px] font-bold px-2 py-0.5 rounded-full bg-[#EFEFEA] text-[#131218]/50 border border-[#E0E0D8]">
                  {v.status}
                </span>
              )}
              {v.confidence && (
                <span className={`text-[10px] font-bold ${CONFIDENCE_COLORS[v.confidence] ?? "text-[#131218]/40"}`}>
                  {v.confidence} confidence
                </span>
              )}
            </div>
          </div>
          <div className="grid grid-cols-3 divide-x divide-[#EFEFEA]">
            <div className="px-5 py-4">
              <p className="text-[8px] font-bold tracking-wider uppercase text-[#131218]/25 mb-1">Pre-money Min</p>
              <p className="text-[17px] font-bold text-[#131218] tracking-tight">{fmtMoney(v.preMoneyMin)}</p>
            </div>
            <div className="px-5 py-4">
              <p className="text-[8px] font-bold tracking-wider uppercase text-[#131218]/25 mb-1">Pre-money Max</p>
              <p className="text-[17px] font-bold text-[#131218] tracking-tight">{fmtMoney(v.preMoneyMax)}</p>
            </div>
            <div className="px-5 py-4">
              <p className="text-[8px] font-bold tracking-wider uppercase text-[#131218]/25 mb-1">Period</p>
              <p className="text-[13px] font-bold text-[#131218]">{fmtDate(v.period)}</p>
            </div>
          </div>
          {v.keyAssumptions && (
            <div className="px-5 py-4 border-t border-[#EFEFEA]">
              <p className="text-[8px] font-bold tracking-wider uppercase text-[#131218]/25 mb-1">Key Assumptions</p>
              <p className="text-[12px] text-[#131218]/65 leading-relaxed">{v.keyAssumptions}</p>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Cap Table tab ─────────────────────────────────────────────────────────────

function CapTableTab({ capTable }: { capTable: CapTableEntry[] }) {
  if (!capTable.length) return <EmptyState label="cap table" />;

  const totalInvested = capTable.reduce((sum, e) => sum + (e.investedAmount ?? 0), 0);

  return (
    <div className="space-y-5">

      {/* Summary */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white border border-[#E0E0D8] rounded-2xl px-5 py-4">
          <p className="text-[9px] font-bold tracking-widest uppercase text-[#131218]/30 mb-1">Shareholders</p>
          <p className="text-3xl font-bold text-[#131218] tracking-tight">{capTable.length}</p>
        </div>
        <div className="bg-white border border-[#E0E0D8] rounded-2xl px-5 py-4">
          <p className="text-[9px] font-bold tracking-widest uppercase text-[#131218]/30 mb-1">Total Invested</p>
          <p className="text-3xl font-bold text-[#131218] tracking-tight">{fmtMoney(totalInvested || null)}</p>
        </div>
        <div className="bg-white border border-[#E0E0D8] rounded-2xl px-5 py-4">
          <p className="text-[9px] font-bold tracking-widest uppercase text-[#131218]/30 mb-1">Share Classes</p>
          <p className="text-3xl font-bold text-[#131218] tracking-tight">
            {[...new Set(capTable.map(e => e.shareClass).filter(Boolean))].length || "—"}
          </p>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white border border-[#E0E0D8] rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-[11.5px]">
            <thead>
              <tr className="border-b border-[#E0E0D8]">
                {["Shareholder", "Type", "Class", "Round", "Shares", "Ownership", "Diluted", "Invested", "Date"].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-[8px] font-bold tracking-wider uppercase text-[#131218]/25">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#EFEFEA]">
              {capTable.map(e => (
                <tr key={e.id} className="hover:bg-[#EFEFEA]/40 transition-colors">
                  <td className="px-4 py-3 font-semibold text-[#131218]">{e.shareholderName || e.name || "—"}</td>
                  <td className="px-4 py-3 text-[#131218]/50">{e.shareholderType || "—"}</td>
                  <td className="px-4 py-3 text-[#131218]/50">{e.shareClass || "—"}</td>
                  <td className="px-4 py-3 text-[#131218]/50">{e.round || "—"}</td>
                  <td className="px-4 py-3 text-[#131218]/70">{e.shares?.toLocaleString() ?? "—"}</td>
                  <td className="px-4 py-3 font-medium text-[#131218]">{fmtPct(e.ownershipPct)}</td>
                  <td className="px-4 py-3 text-[#131218]/60">{fmtPct(e.dilutedPct)}</td>
                  <td className="px-4 py-3 font-medium text-[#131218]">{fmtMoney(e.investedAmount)}</td>
                  <td className="px-4 py-3 text-[#131218]/40">{fmtDate(e.investmentDate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─── Data Room tab ─────────────────────────────────────────────────────────────

const DR_STATUS_ORDER = ["Missing", "Partial", "Complete"];

function extractStoragePath(notes: string): string {
  const match = notes.match(/Storage path:\s*(.+)/);
  return match ? match[1].trim() : "";
}

function DataRoomTab({
  dataRoom,
  onDelete,
  ingestState,
  onIngest,
  onIngestConfirm,
  onIngestCancel,
}: {
  dataRoom: DataRoomItem[];
  onDelete?: (notionId: string, storagePath: string) => Promise<void>;
  ingestState: IngestState;
  onIngest: (fileId: string, fileUrl: string, fileName: string) => void;
  onIngestConfirm: (fileId: string, fileUrl: string, fileName: string) => void;
  onIngestCancel: () => void;
}) {
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const uploadedFiles = dataRoom.filter(d => d.fileUrl && d.notes.includes("Storage path:"));
  const checklistItems = dataRoom.filter(d => !d.notes.includes("Storage path:") || !d.fileUrl || d.status === "Missing" || d.status === "Partial");

  // For the checklist, show all items (Complete items from upload will also appear there, which is fine)
  const allItems = dataRoom;

  if (!allItems.length) return <EmptyState label="data room" />;

  const complete = allItems.filter(d => d.status === "Complete").length;
  const partial  = allItems.filter(d => d.status === "Partial").length;
  const missing  = allItems.filter(d => d.status === "Missing").length;
  const readinessPct = allItems.length ? Math.round((complete / allItems.length) * 100) : 0;

  // Group by category
  const groups = allItems.reduce<Record<string, DataRoomItem[]>>((acc, item) => {
    const key = item.category || "Other";
    if (!acc[key]) acc[key] = [];
    acc[key].push(item);
    return acc;
  }, {});

  // Sort items within each group by status order
  Object.values(groups).forEach(items =>
    items.sort((a, b) => DR_STATUS_ORDER.indexOf(a.status) - DR_STATUS_ORDER.indexOf(b.status))
  );

  return (
    <div className="space-y-5">

      {/* Uploaded files panel */}
      {uploadedFiles.length > 0 && (
        <div className="bg-white border border-[#E0E0D8] rounded-2xl overflow-hidden">
          <div className="px-5 py-3.5 border-b border-[#EFEFEA] flex items-center justify-between">
            <p className="text-[10px] font-bold tracking-widest uppercase text-[#131218]/40">Uploaded Files</p>
            <span className="text-[9px] text-[#131218]/25">{uploadedFiles.length} stored</span>
          </div>
          <div className="divide-y divide-[#EFEFEA]">
            {uploadedFiles.map(item => {
              const storagePath = extractStoragePath(item.notes);
              const isDeleting  = deletingId === item.id;
              const processableExts = [".pdf", ".xlsx", ".xls", ".xlsm", ".xlsb", ".csv", ".docx", ".doc", ".pptx", ".ppt"];
              // Check extension from storagePath or fileUrl (item.name is Notion-formatted, has no extension)
              const checkStr = (storagePath || item.fileUrl || item.name || "").toLowerCase();
              const isPdf    = processableExts.some(e => checkStr.includes(e));
              // Derive actual filename with extension (item.name has no extension after Notion formatting)
              const actualFileName = storagePath
                ? storagePath.split("/").pop() ?? item.name
                : item.fileUrl
                  ? decodeURIComponent((item.fileUrl.split("/").pop() ?? "").split("?")[0]) || item.name
                  : item.name;
              const isThisProcessing = ingestState.status === "processing" && ingestState.fileId === item.id;
              const isThisPreview    = ingestState.status === "preview"    && ingestState.fileId === item.id;
              const isThisExecuting  = ingestState.status === "executing"  && ingestState.fileId === item.id;
              const isThisDone       = ingestState.status === "done"       && ingestState.fileId === item.id;
              const anyBusy = ingestState.status === "processing" || ingestState.status === "executing";

              return (
                <div key={item.id}>
                  {/* File row */}
                  <div className="px-5 py-3 flex items-center gap-3">
                    <div className="w-8 text-center shrink-0">
                      <span className="text-[8px] font-bold text-[#131218]/25 uppercase">
                        {item.documentType?.split(" ")[0]?.slice(0, 3) || "DOC"}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[12.5px] font-medium text-[#131218] truncate">{item.name}</p>
                      <p className="text-[9.5px] text-[#131218]/35 mt-0.5">{item.documentType} · {item.category}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {/* Procesar button — PDF, Excel, CSV */}
                      {isPdf && !isThisDone && (
                        <button
                          onClick={() => onIngest(item.id, item.fileUrl!, actualFileName)}
                          disabled={anyBusy || isThisPreview}
                          className={`text-[10px] font-bold px-2.5 py-1 rounded-lg transition-all ${
                            isThisProcessing
                              ? "bg-[#EFEFEA] text-[#131218]/40 cursor-wait"
                              : isThisPreview
                              ? "bg-[#131218]/5 text-[#131218]/30 cursor-default"
                              : anyBusy
                              ? "bg-[#EFEFEA] text-[#131218]/20 cursor-not-allowed"
                              : "bg-[#c8f55a] text-[#131218] hover:bg-[#b8e84a]"
                          }`}
                        >
                          {isThisProcessing ? "Analizando…" : "Procesar"}
                        </button>
                      )}
                      {/* Done badge */}
                      {isThisDone && (
                        <span className="text-[10px] font-bold px-2.5 py-1 rounded-lg bg-green-50 text-green-700 border border-green-200">
                          ✓ Procesado
                        </span>
                      )}
                      <a
                        href={item.fileUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[10px] font-bold px-2.5 py-1 rounded-lg bg-[#EFEFEA] text-[#131218]/50 hover:bg-[#131218] hover:text-white transition-all"
                      >
                        ↓ Download
                      </a>
                      {onDelete && (
                        <button
                          onClick={async () => {
                            if (!confirm("Delete this file from storage and Data Room?")) return;
                            setDeletingId(item.id);
                            await onDelete(item.id, storagePath);
                            setDeletingId(null);
                          }}
                          disabled={isDeleting}
                          className="text-[10px] font-bold px-2.5 py-1 rounded-lg text-red-400 hover:bg-red-50 hover:text-red-600 transition-all disabled:opacity-40"
                        >
                          {isDeleting ? "…" : "Delete"}
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Inline preview panel */}
                  {(isThisPreview || isThisExecuting || isThisDone) && (
                    <div className={`mx-4 mb-4 rounded-xl border p-4 ${
                      isThisDone
                        ? "bg-green-50 border-green-200"
                        : "bg-[#EFEFEA] border-[#E0E0D8]"
                    }`}>
                      {isThisPreview && ingestState.status === "preview" && (
                        <>
                          <p className="text-[9px] font-bold tracking-widest uppercase text-[#131218]/40 mb-3">
                            Extracción AI — Vista previa
                          </p>
                          {/* Section breakdown grid */}
                          <div className="grid grid-cols-3 gap-1.5 mb-3">
                            {([
                              { label: "Evidence",       count: ingestState.extraction.evidence?.length ?? 0 },
                              { label: "Financials",     count: ingestState.extraction.financials?.length ?? 0 },
                              { label: "Cap Table",      count: ingestState.extraction.cap_table?.length ?? 0 },
                              { label: "Valuations",     count: ingestState.extraction.valuations?.length ?? 0 },
                              { label: "Knowledge",      count: ingestState.extraction.knowledge_assets?.length ?? 0 },
                              { label: "Decisions",      count: ingestState.extraction.decision_items?.length ?? 0 },
                            ] as { label: string; count: number }[]).map(s => (
                              <div key={s.label} className={`rounded-lg px-2.5 py-1.5 ${s.count > 0 ? "bg-white border border-[#c8f55a]/40" : "bg-[#131218]/5 border border-transparent"}`}>
                                <p className={`text-[8px] font-bold tracking-widest uppercase ${s.count > 0 ? "text-[#131218]/50" : "text-[#131218]/20"}`}>{s.label}</p>
                                <p className={`text-[13px] font-bold ${s.count > 0 ? "text-[#131218]" : "text-[#131218]/20"}`}>{s.count > 0 ? s.count : "—"}</p>
                              </div>
                            ))}
                          </div>
                          {ingestState.extraction.draft_status_update && (
                            <p className="text-[11px] text-[#131218]/50 italic mb-3 leading-relaxed border-l-2 border-[#131218]/15 pl-3">
                              {ingestState.extraction.draft_status_update}
                            </p>
                          )}
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => onIngestConfirm(item.id, item.fileUrl!, actualFileName)}
                              className="text-[10.5px] font-bold px-3 py-1.5 rounded-lg bg-[#c8f55a] text-[#131218] hover:bg-[#b8e84a] transition-all"
                            >
                              Confirmar y ejecutar
                            </button>
                            <button
                              onClick={onIngestCancel}
                              className="text-[10.5px] font-bold px-3 py-1.5 rounded-lg bg-white border border-[#E0E0D8] text-[#131218]/50 hover:text-[#131218] transition-all"
                            >
                              Cancelar
                            </button>
                          </div>
                        </>
                      )}
                      {isThisExecuting && (
                        <p className="text-[11px] font-medium text-[#131218]/60">
                          Escribiendo en Notion…
                        </p>
                      )}
                      {isThisDone && ingestState.status === "done" && (
                        <>
                          <p className="text-[9px] font-bold tracking-widest uppercase text-green-600/70 mb-3">
                            Escrito en Notion
                          </p>
                          <div className="grid grid-cols-3 gap-1.5 mb-3">
                            {([
                              { label: "Evidence",   count: ingestState.results.evidence },
                              { label: "Financials", count: ingestState.results.financials },
                              { label: "Cap Table",  count: ingestState.results.cap_table },
                              { label: "Valuations", count: ingestState.results.valuations },
                              { label: "Knowledge",  count: ingestState.results.knowledge_assets },
                              { label: "Decisions",  count: ingestState.results.decision_items },
                            ] as { label: string; count: number }[]).map(s => (
                              <div key={s.label} className={`rounded-lg px-2.5 py-1.5 ${s.count > 0 ? "bg-white border border-green-200" : "bg-green-50/50 border border-transparent"}`}>
                                <p className={`text-[8px] font-bold tracking-widest uppercase ${s.count > 0 ? "text-green-700/60" : "text-green-600/30"}`}>{s.label}</p>
                                <p className={`text-[13px] font-bold ${s.count > 0 ? "text-green-800" : "text-green-600/30"}`}>{s.count > 0 ? s.count : "—"}</p>
                              </div>
                            ))}
                          </div>
                          {ingestState.results.errors?.length > 0 && (
                            <div className="bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                              <p className="text-[8px] font-bold tracking-widest uppercase text-amber-600/70 mb-1">Avisos</p>
                              {ingestState.results.errors.map((e, i) => (
                                <p key={i} className="text-[10px] text-amber-700 leading-relaxed">{e}</p>
                              ))}
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Summary bar */}
      <div className="bg-white border border-[#E0E0D8] rounded-2xl overflow-hidden">
        <div className="grid grid-cols-4 divide-x divide-[#EFEFEA]">
          <div className="px-5 py-4">
            <p className="text-[8px] font-bold tracking-wider uppercase text-[#131218]/25 mb-1">Readiness</p>
            <p className="text-[17px] font-bold text-[#131218] tracking-tight">{readinessPct}%</p>
            <div className="mt-2 h-1 bg-[#EFEFEA] rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full ${readinessPct >= 80 ? "bg-[#c8f55a]" : readinessPct >= 50 ? "bg-amber-400" : "bg-red-400"}`}
                style={{ width: `${readinessPct}%` }}
              />
            </div>
          </div>
          <div className="px-5 py-4">
            <p className="text-[8px] font-bold tracking-wider uppercase text-[#131218]/25 mb-1">Complete</p>
            <p className="text-[17px] font-bold text-green-600 tracking-tight">{complete}</p>
          </div>
          <div className="px-5 py-4">
            <p className="text-[8px] font-bold tracking-wider uppercase text-[#131218]/25 mb-1">Partial</p>
            <p className="text-[17px] font-bold text-amber-500 tracking-tight">{partial}</p>
          </div>
          <div className="px-5 py-4">
            <p className="text-[8px] font-bold tracking-wider uppercase text-[#131218]/25 mb-1">Missing</p>
            <p className="text-[17px] font-bold text-red-500 tracking-tight">{missing}</p>
          </div>
        </div>
      </div>

      {/* Grouped items */}
      {Object.entries(groups).map(([category, items]) => (
        <div key={category} className="bg-white border border-[#E0E0D8] rounded-2xl overflow-hidden">
          <div className="px-5 py-3.5 border-b border-[#EFEFEA] flex items-center justify-between">
            <p className="text-[10px] font-bold tracking-widest uppercase text-[#131218]/40">{category}</p>
            <span className="text-[9px] text-[#131218]/25">{items.length} items</span>
          </div>
          <div className="divide-y divide-[#EFEFEA]">
            {items.map(item => (
              <div key={item.id} className="px-5 py-3 flex items-center gap-3">
                <span className={`text-[8.5px] font-bold px-2 py-0.5 rounded-full border shrink-0 ${STATUS_COLORS[item.status] ?? "bg-[#EFEFEA] text-[#131218]/40 border-[#E0E0D8]"}`}>
                  {item.status || "—"}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-[12.5px] font-medium text-[#131218] truncate">{item.name}</p>
                  {item.documentType && (
                    <p className="text-[9.5px] text-[#131218]/35 mt-0.5">{item.documentType}</p>
                  )}
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  {item.vcRelevance && (
                    <span className="text-[8.5px] font-medium text-[#131218]/30">{item.vcRelevance}</span>
                  )}
                  {item.fileUrl && (
                    <a
                      href={item.fileUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[10px] font-bold text-[#131218]/25 hover:text-[#131218]/70 transition-colors"
                    >
                      →
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Funding tab ───────────────────────────────────────────────────────────────

function FundingTab({
  orgData,
  opportunities,
}: {
  orgData: StartupOrgData | null;
  opportunities: OpportunityItem[];
}) {
  const investorOpps = opportunities.filter(o => o.type === "Investor Match");
  const grantOpps    = opportunities.filter(o => o.type === "Grant");

  return (
    <div className="space-y-5">

      {/* Org headline stats */}
      {orgData && (orgData.fundingRound || orgData.investmentStatus || orgData.mrr) && (
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: "Current Round",      value: orgData.fundingRound     || "—" },
            { label: "Investment Status",  value: orgData.investmentStatus || "—" },
            { label: "MRR",                value: orgData.mrr              || "—" },
          ].map(s => (
            <div key={s.label} className="bg-white border border-[#E0E0D8] rounded-2xl px-5 py-4">
              <p className="text-[9px] font-bold tracking-widest uppercase text-[#131218]/30 mb-1">{s.label}</p>
              <p className="text-xl font-bold text-[#131218] tracking-tight">{s.value}</p>
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-2 gap-5">

        {/* Investor pipeline */}
        <div className="bg-white border border-[#E0E0D8] rounded-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-[#EFEFEA]">
            <p className="text-[9px] font-bold tracking-widest uppercase text-[#131218]/30">Investor Pipeline</p>
            <p className="text-sm font-bold text-[#131218] mt-0.5">
              {investorOpps.length > 0 ? `${investorOpps.length} active` : "No matches logged"}
            </p>
          </div>
          {investorOpps.length > 0 ? (
            <div className="divide-y divide-[#EFEFEA]">
              {investorOpps.map(opp => (
                <div key={opp.id} className="px-5 py-3.5 flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-[12.5px] font-semibold text-[#131218] truncate">{opp.name}</p>
                    {opp.orgName && (
                      <p className="text-[9.5px] text-[#131218]/35 mt-0.5">{opp.orgName}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {opp.score !== null && (
                      <span className="text-[10px] font-bold text-[#2d6a00]">{opp.score}</span>
                    )}
                    <span className={`text-[8.5px] font-bold px-2 py-0.5 rounded-full border ${OPP_STAGE_COLORS[opp.stage] ?? "bg-[#EFEFEA] text-[#131218]/40 border-[#E0E0D8]"}`}>
                      {opp.stage}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="px-5 py-8 text-center">
              <p className="text-xs text-[#131218]/25">No investor matches logged yet</p>
              <p className="text-[10px] text-[#131218]/20 mt-1">Add Investor Match opportunities in Notion with Portfolio scope</p>
            </div>
          )}
        </div>

        {/* Grants as non-dilutive funding */}
        <div className="bg-white border border-[#E0E0D8] rounded-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-[#EFEFEA]">
            <p className="text-[9px] font-bold tracking-widest uppercase text-[#131218]/30">Grant Pipeline — Non-dilutive</p>
            <p className="text-sm font-bold text-[#131218] mt-0.5">
              {grantOpps.length > 0 ? `${grantOpps.length} opportunities` : "No grants tracked"}
            </p>
          </div>
          {grantOpps.length > 0 ? (
            <div className="divide-y divide-[#EFEFEA]">
              {grantOpps.map(opp => (
                <div key={opp.id} className="px-5 py-3.5 flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-[12.5px] font-semibold text-[#131218] truncate">{opp.name}</p>
                    {opp.orgName && (
                      <p className="text-[9.5px] text-[#131218]/35 mt-0.5">{opp.orgName}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {opp.score !== null && (
                      <span className="text-[10px] font-bold text-green-700 bg-green-50 px-1.5 py-0.5 rounded-md">{opp.score}</span>
                    )}
                    <span className={`text-[8.5px] font-bold px-2 py-0.5 rounded-full border ${OPP_STAGE_COLORS[opp.stage] ?? "bg-[#EFEFEA] text-[#131218]/40 border-[#E0E0D8]"}`}>
                      {opp.stage}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="px-5 py-8 text-center">
              <p className="text-xs text-[#131218]/25">No grant opportunities tracked</p>
              <p className="text-[10px] text-[#131218]/20 mt-1">Add Grant opportunities in Notion with Portfolio scope</p>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}

// ─── Commercial tab ────────────────────────────────────────────────────────────

function CommercialTab({
  evidence,
  opportunities,
  onUpload,
}: {
  evidence: EvidenceItem[];
  opportunities: OpportunityItem[];
  onUpload: () => void;
}) {
  const traction    = evidence.filter(e => e.type === "Traction" || e.type === "Milestone" || e.type === "Outcome");
  const commercialOpps = opportunities.filter(o => o.type === "CH Sale" || o.type === "Partnership");

  return (
    <div className="space-y-5">

      <div className="grid grid-cols-2 gap-5">

        {/* Traction signals */}
        <div className="bg-white border border-[#E0E0D8] rounded-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-[#EFEFEA]">
            <p className="text-[9px] font-bold tracking-widest uppercase text-[#131218]/30">Traction Signals</p>
            <p className="text-sm font-bold text-[#131218] mt-0.5">
              {traction.length > 0 ? `${traction.length} validated signals` : "No traction logged yet"}
            </p>
          </div>
          {traction.length > 0 ? (
            <div className="divide-y divide-[#EFEFEA]">
              {traction.slice(0, 6).map(ev => (
                <div key={ev.id} className="px-5 py-3.5 flex items-start gap-3">
                  <span className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${ev.validationStatus === "Validated" ? "bg-green-400" : "bg-amber-400"}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-0.5">
                      <span className={`text-[8.5px] font-bold px-2 py-0.5 rounded-full border ${EVIDENCE_TYPE_COLORS[ev.type] ?? "bg-[#EFEFEA] text-[#131218]/50 border-[#E0E0D8]"}`}>
                        {ev.type}
                      </span>
                      <span className="text-[8px] text-[#131218]/30">{fmtDate(ev.dateCaptured)}</span>
                    </div>
                    <p className="text-[12px] font-medium text-[#131218] leading-snug line-clamp-2">
                      {ev.title || ev.excerpt || "—"}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="px-5 py-8 text-center">
              <p className="text-xs text-[#131218]/25">No traction evidence captured yet</p>
              <p className="text-[10px] text-[#131218]/20 mt-1">Upload commercial documents to extract signals</p>
            </div>
          )}
        </div>

        {/* Commercial opportunities */}
        <div className="space-y-4">
          <div className="bg-white border border-[#E0E0D8] rounded-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-[#EFEFEA]">
              <p className="text-[9px] font-bold tracking-widest uppercase text-[#131218]/30">Active Opportunities</p>
              <p className="text-sm font-bold text-[#131218] mt-0.5">
                {commercialOpps.length > 0 ? `${commercialOpps.length} tracked` : "No commercial opportunities"}
              </p>
            </div>
            {commercialOpps.length > 0 ? (
              <div className="divide-y divide-[#EFEFEA]">
                {commercialOpps.map(opp => (
                  <div key={opp.id} className="px-5 py-3.5 flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-[12.5px] font-semibold text-[#131218] truncate">{opp.name}</p>
                      <p className="text-[9.5px] text-[#131218]/35 mt-0.5">{opp.type} {opp.orgName ? `· ${opp.orgName}` : ""}</p>
                    </div>
                    <span className={`text-[8.5px] font-bold px-2 py-0.5 rounded-full border shrink-0 ${OPP_STAGE_COLORS[opp.stage] ?? "bg-[#EFEFEA] text-[#131218]/40 border-[#E0E0D8]"}`}>
                      {opp.stage}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="px-5 py-6 text-center">
                <p className="text-xs text-[#131218]/25">No commercial opportunities logged</p>
              </div>
            )}
          </div>

          {/* Upload zone */}
          <UploadCTA label="Upload commercial documents — deck, one-pager, contracts, case studies" onUpload={onUpload} />
        </div>

      </div>
    </div>
  );
}

// ─── Investor Update tab ───────────────────────────────────────────────────────

type UpdateConfig = {
  period: string;
  tone: string;
  include: string[];
};

type UpdateState =
  | { status: "idle" }
  | { status: "generating" }
  | { status: "done"; draft: string }
  | { status: "error"; message: string };

function InvestorUpdateTab({ project }: { project: Project }) {
  const periods = ["Last 30 days", "Last quarter", "Last 6 months", "Custom"];
  const tones   = ["Confident", "Transparent", "Technical", "Executive"];
  const includeOptions = [
    { id: "kpis",        label: "Financial KPIs"    },
    { id: "fundraising", label: "Fundraising update" },
    { id: "grants",      label: "Grants progress"   },
    { id: "milestones",  label: "Key milestones"     },
    { id: "nextsteps",   label: "Next steps"         },
  ];

  const [config, setConfig] = useState<UpdateConfig>({
    period:  periods[0],
    tone:    tones[0],
    include: ["kpis", "fundraising", "grants"],
  });
  const [state, setState] = useState<UpdateState>({ status: "idle" });

  function toggleInclude(id: string) {
    setConfig(prev => ({
      ...prev,
      include: prev.include.includes(id)
        ? prev.include.filter(x => x !== id)
        : [...prev.include, id],
    }));
  }

  async function generate() {
    setState({ status: "generating" });
    try {
      const res = await fetch("/api/garage-investor-update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: project.id, ...config }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? `HTTP ${res.status}`);
      }
      const data = await res.json();
      setState({ status: "done", draft: data.draft });
    } catch (err) {
      setState({ status: "error", message: err instanceof Error ? err.message : "Generation failed" });
    }
  }

  return (
    <div className="grid grid-cols-[320px_1fr] gap-6 items-start">

      {/* Left: config panel */}
      <div className="space-y-4">
        <div className="bg-white border border-[#E0E0D8] rounded-2xl p-5 space-y-5">
          <p className="text-[9px] font-bold tracking-widest uppercase text-[#131218]/30">Generate Investor Update</p>

          {/* Period */}
          <div>
            <p className="text-[9px] font-bold tracking-widest uppercase text-[#131218]/30 mb-2">Period</p>
            <div className="flex flex-wrap gap-1.5">
              {periods.map(p => (
                <button key={p} onClick={() => setConfig(c => ({ ...c, period: p }))}
                  className={`text-[10px] font-semibold px-3 py-1.5 rounded-lg border transition-all ${
                    config.period === p
                      ? "bg-[#131218] text-white border-[#131218]"
                      : "bg-white text-[#131218]/50 border-[#E0E0D8] hover:border-[#131218]/30"
                  }`}>
                  {p}
                </button>
              ))}
            </div>
          </div>

          {/* Tone */}
          <div>
            <p className="text-[9px] font-bold tracking-widest uppercase text-[#131218]/30 mb-2">Tone</p>
            <div className="flex flex-wrap gap-1.5">
              {tones.map(t => (
                <button key={t} onClick={() => setConfig(c => ({ ...c, tone: t }))}
                  className={`text-[10px] font-semibold px-3 py-1.5 rounded-lg border transition-all ${
                    config.tone === t
                      ? "bg-[#131218] text-white border-[#131218]"
                      : "bg-white text-[#131218]/50 border-[#E0E0D8] hover:border-[#131218]/30"
                  }`}>
                  {t}
                </button>
              ))}
            </div>
          </div>

          {/* Include */}
          <div>
            <p className="text-[9px] font-bold tracking-widest uppercase text-[#131218]/30 mb-2">Include</p>
            <div className="space-y-2">
              {includeOptions.map(opt => (
                <label key={opt.id} className="flex items-center gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={config.include.includes(opt.id)}
                    onChange={() => toggleInclude(opt.id)}
                    className="w-3.5 h-3.5 rounded accent-[#c8f55a]"
                  />
                  <span className="text-[11.5px] text-[#131218]/70">{opt.label}</span>
                </label>
              ))}
            </div>
          </div>

          <button
            onClick={generate}
            disabled={state.status === "generating"}
            className={`w-full py-2.5 rounded-xl text-[11.5px] font-bold transition-all ${
              state.status === "generating"
                ? "bg-[#EFEFEA] text-[#131218]/30 cursor-wait"
                : "bg-[#c8f55a] text-[#131218] hover:bg-[#b8e84a]"
            }`}
          >
            {state.status === "generating" ? "Generating…" : "⚡ Generate draft"}
          </button>
        </div>
      </div>

      {/* Right: preview */}
      <div>
        {state.status === "idle" && (
          <div className="bg-white border border-[#E0E0D8] rounded-2xl p-12 text-center">
            <p className="text-sm font-bold text-[#131218]/25 mb-1">Configure and generate</p>
            <p className="text-xs text-[#131218]/20">
              Select period, tone and content — then click Generate draft to build the investor update from your OS data.
            </p>
          </div>
        )}
        {state.status === "generating" && (
          <div className="bg-white border border-[#E0E0D8] rounded-2xl p-12 text-center">
            <p className="text-sm font-bold text-[#131218]/30 animate-pulse">Building investor update…</p>
            <p className="text-xs text-[#131218]/20 mt-2">Reading evidence, financials and milestones from Notion</p>
          </div>
        )}
        {state.status === "error" && (
          <div className="bg-red-50 border border-red-200 rounded-2xl p-6">
            <p className="text-sm font-bold text-red-600 mb-1">Generation failed</p>
            <p className="text-xs text-red-500">{state.message}</p>
            <button onClick={() => setState({ status: "idle" })} className="text-[10px] font-bold text-red-600 mt-3 hover:underline">Try again</button>
          </div>
        )}
        {state.status === "done" && (
          <div className="bg-white border-2 border-[#c8f55a] rounded-2xl overflow-hidden">
            <div className="bg-[#c8f55a] px-5 py-3 flex items-center justify-between">
              <span className="text-[10px] font-bold text-[#131218]">DRAFT GENERATED · {config.period}</span>
              <div className="flex gap-2">
                <button
                  onClick={() => navigator.clipboard.writeText(state.draft)}
                  className="text-[9px] font-bold px-3 py-1 bg-white/60 rounded-md hover:bg-white transition-all"
                >
                  Copy
                </button>
                <button
                  onClick={() => setState({ status: "idle" })}
                  className="text-[9px] font-bold px-3 py-1 bg-[#131218] text-white rounded-md hover:bg-black transition-all"
                >
                  Regenerate
                </button>
              </div>
            </div>
            <div className="px-6 py-5">
              <pre className="text-[12px] text-[#131218]/80 leading-relaxed whitespace-pre-wrap font-sans">
                {state.draft}
              </pre>
            </div>
          </div>
        )}
      </div>

    </div>
  );
}

// ─── Upload modal ─────────────────────────────────────────────────────────────

type UploadResult = { name: string; url: string; category: string; documentType: string; storagePath: string; notionId?: string };

type UploadStatus = "idle" | "uploading" | "success" | "error";

function UploadModal({ projectId, projectName, orgId, onDone }: {
  projectId: string;
  projectName: string;
  orgId?: string;
  onDone: (results: UploadResult[]) => void;
}) {
  const [dragging, setDragging] = useState(false);
  const [files, setFiles]       = useState<File[]>([]);
  const [status, setStatus]     = useState<UploadStatus>("idle");
  const [errors, setErrors]     = useState<string[]>([]);

  function addFiles(incoming: FileList | null) {
    if (!incoming) return;
    setFiles(prev => {
      const names = new Set(prev.map(f => f.name));
      return [...prev, ...Array.from(incoming).filter(f => !names.has(f.name))];
    });
  }

  async function handleUpload() {
    if (!files.length) return;
    setStatus("uploading");
    setErrors([]);

    try {
      // Step 1 — get signed upload URLs (tiny JSON request, no file bytes)
      const presignRes = await fetch("/api/garage-upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          files: files.map(f => ({ name: f.name, type: f.type || "application/octet-stream" })),
        }),
      });
      if (!presignRes.ok) throw new Error(`Presign error ${presignRes.status}`);
      const { results: presigned } = await presignRes.json() as {
        results: { name: string; storagePath: string; signedUrl: string; error?: string }[]
      };

      const failed = presigned.filter(r => r.error);
      if (failed.length) setErrors(failed.map(r => `${r.name}: ${r.error ?? "failed"}`));

      const ready = presigned.filter(r => !r.error && r.signedUrl);
      if (!ready.length) throw new Error("No files could be prepared for upload");

      // Step 2 — upload each file directly to Supabase (browser → Supabase, no Next.js limit)
      await Promise.all(ready.map(async ({ name, signedUrl }) => {
        const file = files.find(f => f.name === name)!;
        const putRes = await fetch(signedUrl, {
          method: "PUT",
          headers: {
            "Content-Type": file.type || "application/octet-stream",
            "x-upsert": "false",
          },
          body: file,
        });
        if (!putRes.ok) {
          const detail = await putRes.text().catch(() => "");
          throw new Error(`${name}: upload failed (${putRes.status})${detail ? ` — ${detail}` : ""}`);
        }
      }));

      // Step 3 — finalize: create signed read URLs + Notion Data Room records
      const finalizeRes = await fetch("/api/garage-upload/finalize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectName,
          projectId,
          orgId,
          uploads: ready.map(r => ({ name: r.name, storagePath: r.storagePath })),
        }),
      });
      if (!finalizeRes.ok) throw new Error(`Finalize error ${finalizeRes.status}`);
      const data = await finalizeRes.json();
      if (data.errors?.length) setErrors(prev => [...prev, ...data.errors]);

      setStatus("success");
      setTimeout(() => onDone(data.results ?? []), 1500);
    } catch (err) {
      setErrors(prev => [...prev, err instanceof Error ? err.message : "Upload failed"]);
      setStatus("error");
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={e => { if (e.target === e.currentTarget) onDone([]); }}>
      <div className="bg-white rounded-2xl border border-[#E0E0D8] p-8 w-full max-w-lg">

        {/* Header */}
        <div className="flex items-start justify-between mb-5">
          <div>
            <p className="text-[9px] font-bold tracking-widest uppercase text-[#131218]/30 mb-1">Garage · {projectName}</p>
            <p className="text-lg font-bold text-[#131218]">Upload documents</p>
            <p className="text-xs text-[#131218]/40 mt-1">Pitch deck, financial model, cap table, one-pager…</p>
          </div>
          <button onClick={() => onDone([])} className="text-[#131218]/30 hover:text-[#131218] text-xl leading-none mt-1">×</button>
        </div>

        {/* Success state */}
        {status === "success" && (
          <div>
            <div className="flex items-center gap-3 bg-green-50 border border-green-100 rounded-xl px-5 py-4 mb-2">
              <span className="text-green-600 text-lg">✓</span>
              <div>
                <p className="text-[11.5px] font-bold text-green-800">{files.length} file{files.length > 1 ? "s" : ""} stored</p>
                <p className="text-[10px] text-green-700/70 mt-0.5">Saved to Data Room. Closing…</p>
              </div>
            </div>
            {errors.length > 0 && (
              <div className="bg-amber-50 border border-amber-100 rounded-xl px-4 py-3 mb-2">
                <p className="text-[9px] font-bold tracking-widest uppercase text-amber-700/60 mb-1">Partial errors</p>
                {errors.map((e, i) => <p key={i} className="text-[10px] text-amber-700">{e}</p>)}
              </div>
            )}
          </div>
        )}

        {/* Error state */}
        {status === "error" && (
          <div className="bg-red-50 border border-red-100 rounded-xl px-4 py-3 mb-4">
            {errors.map(e => <p key={e} className="text-[10.5px] text-red-600">{e}</p>)}
            <button onClick={() => setStatus("idle")} className="text-[10px] font-bold text-red-700 mt-2 hover:underline">Try again</button>
          </div>
        )}

        {status !== "success" && (
          <>
            {/* Drop zone */}
            <div
              onDragOver={e => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={e => { e.preventDefault(); setDragging(false); addFiles(e.dataTransfer.files); }}
              className={`border-2 border-dashed rounded-xl px-6 py-9 text-center cursor-pointer transition-colors ${
                dragging ? "border-[#131218] bg-[#EFEFEA]" : "border-[#E0E0D8] hover:border-[#131218]/30"
              }`}
              onClick={() => document.getElementById("garage-file-input")?.click()}
            >
              <p className="text-sm font-semibold text-[#131218]/40">Drop files here or click to browse</p>
              <p className="text-[10px] text-[#131218]/25 mt-1">PDF · PPTX · XLSX · DOCX — up to 200 MB each</p>
              <input id="garage-file-input" type="file" multiple accept=".pdf,.pptx,.xlsx,.docx,.xls,.ppt"
                className="hidden" onChange={e => addFiles(e.target.files)} />
            </div>

            {/* File list */}
            {files.length > 0 && (
              <div className="mt-3 space-y-1.5 max-h-40 overflow-y-auto">
                {files.map(f => (
                  <div key={f.name} className="flex items-center gap-2 bg-[#EFEFEA] rounded-lg px-3 py-2">
                    <span className="text-[9px] font-bold text-[#131218]/30 uppercase w-8 shrink-0">{f.name.split(".").pop()}</span>
                    <span className="text-[11px] text-[#131218] font-medium flex-1 truncate">{f.name}</span>
                    <button onClick={() => setFiles(prev => prev.filter(x => x.name !== f.name))}
                      className="text-[#131218]/20 hover:text-[#131218]/60 text-base leading-none">×</button>
                  </div>
                ))}
              </div>
            )}

            <button
              onClick={handleUpload}
              disabled={!files.length || status === "uploading"}
              className={`mt-4 w-full py-2.5 rounded-xl text-[11.5px] font-bold transition-all ${
                files.length && status !== "uploading"
                  ? "bg-[#c8f55a] text-[#131218] hover:bg-[#b8e84a]"
                  : "bg-[#EFEFEA] text-[#131218]/30 cursor-not-allowed"
              }`}
            >
              {status === "uploading" ? "Uploading…" : `Upload ${files.length ? `${files.length} file${files.length > 1 ? "s" : ""}` : "files"}`}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Main client component ─────────────────────────────────────────────────────

const TABS: { id: Tab; label: string }[] = [
  { id: "pulse",         label: "Pulse"           },
  { id: "financials",    label: "Financials"      },
  { id: "valuation",     label: "Valuation"       },
  { id: "captable",      label: "Cap Table"       },
  { id: "funding",       label: "Funding"         },
  { id: "commercial",    label: "Commercial"      },
  { id: "investorupdate", label: "Investor Update" },
  { id: "dataroom",      label: "Data Room"       },
];

export function GarageDetailClient({
  project, evidence, sources, decisions,
  orgData, financials, valuations, capTable, dataRoom, orgId, opportunities, meetings,
}: Props) {
  const [tab, setTab]               = useState<Tab>("pulse");
  const [showUpload, setShowUpload] = useState(false);
  const router = useRouter();
  const { getToken } = useAuth();
  const [localDataRoom, setLocalDataRoom] = useState<DataRoomItem[]>(dataRoom);
  const [ingestState, setIngestState] = useState<IngestState>({ status: "idle" });

  async function handleIngest(fileId: string, fileUrl: string, fileName: string) {
    setIngestState({ status: "processing", fileId });
    try {
      const token = await getToken();
      const res = await fetch("/api/garage-ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { "Authorization": `Bearer ${token}` } : {}) },
        body: JSON.stringify({
          fileUrl,
          fileName,
          projectId: project.id,
          projectName: project.name,
          orgId,
          mode: "dry_run",
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? `HTTP ${res.status}`);
      }
      const data = await res.json();
      setIngestState({ status: "preview", fileId, extraction: data.extraction });
    } catch (err) {
      setIngestState({ status: "idle" });
      alert(`Extracción fallida: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  async function handleIngestConfirm(fileId: string, fileUrl: string, fileName: string) {
    setIngestState({ status: "executing", fileId });
    try {
      const token = await getToken();
      const res = await fetch("/api/garage-ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { "Authorization": `Bearer ${token}` } : {}) },
        body: JSON.stringify({
          fileUrl,
          fileName,
          projectId: project.id,
          projectName: project.name,
          orgId,
          mode: "execute",
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? `HTTP ${res.status}`);
      }
      const data = await res.json();
      setIngestState({ status: "done", fileId, results: data.results });
      // Re-fetch server data so Evidence, Financials, Cap Table etc. reflect new Notion records
      router.refresh();
      // Reset to idle after 6s so the Procesar button reappears (allows re-processing)
      setTimeout(() => setIngestState({ status: "idle" }), 6000);
    } catch (err) {
      setIngestState({ status: "idle" });
      alert(`Ejecución fallida: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  function handleIngestCancel() {
    setIngestState({ status: "idle" });
  }

  function handleUploadDone(results: UploadResult[]) {
    if (results.length) {
      const newItems: DataRoomItem[] = results.map(r => ({
        id:           r.notionId ?? `local-${Date.now()}-${r.name}`,
        name:         r.name,
        category:     r.category,
        documentType: r.documentType,
        fileUrl:      r.url,
        status:       "Complete",
        priority:     "",
        vcRelevance:  "",
        notes:        `Uploaded via portal. Storage path: ${r.storagePath}`,
      }));
      setLocalDataRoom(prev => [...newItems, ...prev]);
    }
    setShowUpload(false);
  }

  async function handleDelete(notionId: string, storagePath: string) {
    try {
      await fetch("/api/garage-upload", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notionId, storagePath }),
      });
      setLocalDataRoom(prev => prev.filter(d => d.id !== notionId));
    } catch {
      alert("Delete failed — please try again.");
    }
  }

  return (
    <>
      {showUpload && (
        <UploadModal
          projectId={project.id}
          projectName={project.name}
          orgId={orgId}
          onDone={handleUploadDone}
        />
      )}

      {/* Tab nav */}
      <div className="bg-white border-b border-[#E0E0D8] px-12">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-0">
            {TABS.map(t => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`px-4 py-3.5 text-[11.5px] font-semibold border-b-2 transition-all ${
                  tab === t.id
                    ? "border-[#131218] text-[#131218]"
                    : "border-transparent text-[#131218]/38 hover:text-[#131218] hover:border-[#131218]/20"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
          <button
            onClick={() => setShowUpload(true)}
            className="flex items-center gap-1.5 text-[10.5px] font-bold text-[#131218]/40 hover:text-[#131218] hover:bg-[#EFEFEA] px-3 py-1.5 rounded-lg transition-all"
          >
            ↑ Upload docs
          </button>
        </div>
      </div>

      {/* Tab content */}
      <div className="px-12 py-8">
        {tab === "pulse" && (
          <PulseTab project={project} evidence={evidence} sources={sources} decisions={decisions} meetings={meetings} />
        )}
        {tab === "financials" && (
          <FinancialsTab orgData={orgData} financials={financials} onUpload={() => setShowUpload(true)} />
        )}
        {tab === "valuation" && (
          <ValuationTab valuations={valuations} />
        )}
        {tab === "captable" && (
          <CapTableTab capTable={capTable} />
        )}
        {tab === "funding" && (
          <FundingTab orgData={orgData} opportunities={opportunities} />
        )}
        {tab === "commercial" && (
          <CommercialTab evidence={evidence} opportunities={opportunities} onUpload={() => setShowUpload(true)} />
        )}
        {tab === "investorupdate" && (
          <InvestorUpdateTab project={project} />
        )}
        {tab === "dataroom" && (
          <DataRoomTab
            dataRoom={localDataRoom}
            onDelete={handleDelete}
            ingestState={ingestState}
            onIngest={handleIngest}
            onIngestConfirm={handleIngestConfirm}
            onIngestCancel={handleIngestCancel}
          />
        )}
      </div>
    </>
  );
}
