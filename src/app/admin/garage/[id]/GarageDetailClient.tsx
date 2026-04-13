"use client";

import { useState } from "react";
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
} from "@/lib/notion";

// ─── Types ─────────────────────────────────────────────────────────────────────

type Tab = "pulse" | "financials" | "valuation" | "captable" | "funding" | "dataroom";

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

function PulseTab({ project, evidence, sources, decisions }: {
  project: Project;
  evidence: EvidenceItem[];
  sources: SourceItem[];
  decisions: DecisionItem[];
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

// ─── Financials tab ────────────────────────────────────────────────────────────

function FinancialsTab({ orgData, financials }: { orgData: StartupOrgData | null; financials: FinancialSnapshot[] }) {
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
}: {
  dataRoom: DataRoomItem[];
  onDelete?: (notionId: string, storagePath: string) => Promise<void>;
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
              const isDeleting = deletingId === item.id;
              return (
                <div key={item.id} className="px-5 py-3 flex items-center gap-3">
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

// ─── Funding tab (placeholder — no DB wired yet) ───────────────────────────────

function FundingTab({ orgData }: { orgData: StartupOrgData | null }) {
  return (
    <div className="space-y-4">
      {orgData && (orgData.fundingRound || orgData.investmentStatus) && (
        <div className="grid grid-cols-2 gap-4">
          {orgData.fundingRound && (
            <div className="bg-white border border-[#E0E0D8] rounded-2xl px-5 py-4">
              <p className="text-[9px] font-bold tracking-widest uppercase text-[#131218]/30 mb-1">Current Round</p>
              <p className="text-xl font-bold text-[#131218]">{orgData.fundingRound}</p>
            </div>
          )}
          {orgData.investmentStatus && (
            <div className="bg-white border border-[#E0E0D8] rounded-2xl px-5 py-4">
              <p className="text-[9px] font-bold tracking-widest uppercase text-[#131218]/30 mb-1">Investment Status</p>
              <p className="text-xl font-bold text-[#131218]">{orgData.investmentStatus}</p>
            </div>
          )}
        </div>
      )}
      <div className="bg-white border border-[#E0E0D8] rounded-2xl p-10 text-center">
        <p className="text-sm font-bold text-[#131218]/25 mb-1">Funding rounds detail coming soon</p>
        <p className="text-xs text-[#131218]/20">
          A dedicated Funding Rounds DB will surface investor names, amounts, and closing dates.
        </p>
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
          headers: { "Content-Type": file.type || "application/octet-stream" },
          body: file,
        });
        if (!putRes.ok) throw new Error(`${name}: upload failed (${putRes.status})`);
      }));

      // Step 3 — finalize: create signed read URLs + Notion Data Room records
      const finalizeRes = await fetch("/api/garage-upload/finalize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectName,
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
          <div className="flex items-center gap-3 bg-green-50 border border-green-100 rounded-xl px-5 py-4 mb-4">
            <span className="text-green-600 text-lg">✓</span>
            <div>
              <p className="text-[11.5px] font-bold text-green-800">{files.length} file{files.length > 1 ? "s" : ""} stored</p>
              <p className="text-[10px] text-green-700/70 mt-0.5">Saved to Data Room. Closing…</p>
            </div>
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
              <p className="text-[10px] text-[#131218]/25 mt-1">PDF · PPTX · XLSX · DOCX — up to 50 MB each</p>
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
  { id: "pulse",      label: "Pulse"      },
  { id: "financials", label: "Financials" },
  { id: "valuation",  label: "Valuation"  },
  { id: "captable",   label: "Cap Table"  },
  { id: "funding",    label: "Funding"    },
  { id: "dataroom",   label: "Data Room"  },
];

export function GarageDetailClient({
  project, evidence, sources, decisions,
  orgData, financials, valuations, capTable, dataRoom, orgId,
}: Props) {
  const [tab, setTab]               = useState<Tab>("pulse");
  const [showUpload, setShowUpload] = useState(false);
  const [localDataRoom, setLocalDataRoom] = useState<DataRoomItem[]>(dataRoom);

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
          <PulseTab project={project} evidence={evidence} sources={sources} decisions={decisions} />
        )}
        {tab === "financials" && (
          <FinancialsTab orgData={orgData} financials={financials} />
        )}
        {tab === "valuation" && (
          <ValuationTab valuations={valuations} />
        )}
        {tab === "captable" && (
          <CapTableTab capTable={capTable} />
        )}
        {tab === "funding" && (
          <FundingTab orgData={orgData} />
        )}
        {tab === "dataroom" && (
          <DataRoomTab dataRoom={localDataRoom} onDelete={handleDelete} />
        )}
      </div>
    </>
  );
}
