"use client";

import { useState } from "react";
import type { Project, EvidenceItem, SourceItem, DecisionItem } from "@/lib/notion";

// ─── Types ─────────────────────────────────────────────────────────────────────

type Tab = "pulse" | "financials" | "valuation" | "captable" | "funding" | "dataroom";

type Props = {
  project: Project;
  evidence: EvidenceItem[];
  sources: SourceItem[];
  decisions: DecisionItem[];
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

const PRIORITY_COLORS: Record<string, string> = {
  "P1 Critical": "text-red-600 bg-red-50 border-red-200",
  "High":        "text-orange-600 bg-orange-50 border-orange-200",
  "Medium":      "text-amber-600 bg-amber-50 border-amber-200",
  "Low":         "text-[#131218]/40 bg-[#EFEFEA] border-[#E0E0D8]",
};

// ─── Placeholder card ──────────────────────────────────────────────────────────

function PlaceholderCard({ title, dbHint }: { title: string; dbHint: string }) {
  return (
    <div className="bg-white border border-[#E0E0D8] rounded-2xl p-10 flex flex-col items-center gap-4 text-center">
      <div className="w-12 h-12 rounded-full bg-[#EFEFEA] border border-[#E0E0D8] flex items-center justify-center">
        <span className="text-[#131218]/25 text-xl">○</span>
      </div>
      <div>
        <p className="text-sm font-bold text-[#131218]/60 mb-1">{title} data not yet connected</p>
        <p className="text-xs text-[#131218]/35 max-w-xs leading-relaxed">
          Connect the <strong className="font-semibold text-[#131218]/50">{dbHint}</strong> Notion database to this portal to surface {title.toLowerCase()} data here.
        </p>
      </div>
      <div className="mt-2 px-4 py-2 rounded-lg bg-[#EFEFEA] border border-[#E0E0D8]">
        <p className="text-[10px] font-mono text-[#131218]/30">Wire in <code>src/lib/notion.ts</code> → add DB ID + query fn</p>
      </div>
    </div>
  );
}

// ─── Pulse tab ─────────────────────────────────────────────────────────────────

function PulseTab({ project, evidence, sources, decisions }: Props) {
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

// ─── Main client component ─────────────────────────────────────────────────────

const TABS: { id: Tab; label: string }[] = [
  { id: "pulse",      label: "Pulse"      },
  { id: "financials", label: "Financials" },
  { id: "valuation",  label: "Valuation"  },
  { id: "captable",   label: "Cap Table"  },
  { id: "funding",    label: "Funding"    },
  { id: "dataroom",   label: "Data Room"  },
];

export function GarageDetailClient({ project, evidence, sources, decisions }: Props) {
  const [tab, setTab] = useState<Tab>("pulse");

  return (
    <>
      {/* Tab nav */}
      <div className="bg-white border-b border-[#E0E0D8] px-12">
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
      </div>

      {/* Tab content */}
      <div className="px-12 py-8">
        {tab === "pulse" && (
          <PulseTab project={project} evidence={evidence} sources={sources} decisions={decisions} />
        )}
        {tab === "financials" && (
          <PlaceholderCard title="Financials" dbHint="CH Financials [OS v2]" />
        )}
        {tab === "valuation" && (
          <PlaceholderCard title="Valuation" dbHint="CH Valuations [OS v2]" />
        )}
        {tab === "captable" && (
          <PlaceholderCard title="Cap Table" dbHint="CH Cap Table [OS v2]" />
        )}
        {tab === "funding" && (
          <PlaceholderCard title="Funding" dbHint="CH Funding Rounds [OS v2]" />
        )}
        {tab === "dataroom" && (
          <PlaceholderCard title="Data Room" dbHint="CH Data Room [OS v2]" />
        )}
      </div>
    </>
  );
}
