import { redirect } from "next/navigation";
import { Sidebar } from "@/components/Sidebar";
import { getDecisionItems, type DecisionItem } from "@/lib/notion";
import { ADMIN_NAV as NAV } from "@/lib/admin-nav";
import { requireAdmin } from "@/lib/require-admin";
import { DecisionActions } from "@/components/DecisionActions";

/**
 * /admin/decisions — Decision Center view.
 *
 * Surfaces all Decision Items [OS v2] from Notion.
 * Read-only in the portal — writes are done in Notion directly or via agents.
 *
 * Priority signals: P1 Critical items shown at top with red accent.
 * Execute gate: items with Requires Execute = true + Execute Approved = false
 *               are flagged prominently — agents MUST NOT proceed without approval.
 */

function daysSince(dateStr: string | null): number {
  if (!dateStr) return 999;
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  } catch { return "—"; }
}

const PRIORITY_CONFIG: Record<string, { dot: string; badge: string; label: string }> = {
  "P1 Critical": { dot: "bg-red-500",    badge: "bg-red-100 text-red-700 border-red-200",    label: "P1" },
  "High":        { dot: "bg-amber-400",  badge: "bg-amber-50 text-amber-700 border-amber-200", label: "High" },
  "Medium":      { dot: "bg-blue-400",   badge: "bg-blue-50 text-blue-700 border-blue-200",   label: "Med" },
  "Low":         { dot: "bg-[#131218]/15", badge: "bg-[#EFEFEA] text-[#131218]/40 border-[#E0E0D8]", label: "Low" },
};

const TYPE_CONFIG: Record<string, { icon: string; color: string }> = {
  "Approval":                   { icon: "✓", color: "text-green-600 bg-green-50" },
  "Missing Input":              { icon: "?", color: "text-amber-600 bg-amber-50" },
  "Ambiguity Resolution":       { icon: "⊡", color: "text-blue-600 bg-blue-50" },
  "Policy/Automation Decision": { icon: "◎", color: "text-purple-600 bg-purple-50" },
  "Draft Review":               { icon: "▤", color: "text-[#131218] bg-[#EFEFEA]" },
};

function DecisionRow({ item }: { item: DecisionItem }) {
  const pCfg = PRIORITY_CONFIG[item.priority] ?? PRIORITY_CONFIG["Low"];
  const tCfg = TYPE_CONFIG[item.decisionType] ?? { icon: "·", color: "text-[#131218]/40 bg-[#EFEFEA]" };
  const needsExecuteApproval = item.requiresExecute && !item.executeApproved;
  const overdue = item.dueDate && daysSince(item.dueDate) > 0;

  return (
    <div className={`px-6 py-4 flex items-start gap-4 hover:bg-[#EFEFEA]/40 transition-colors ${
      needsExecuteApproval ? "bg-red-50/30" : ""
    }`}>
      {/* Priority dot */}
      <div className="mt-1 shrink-0">
        <span className={`w-2 h-2 rounded-full inline-block ${pCfg.dot}`} />
      </div>

      {/* Type icon */}
      <div className={`w-6 h-6 rounded-lg flex items-center justify-center text-[11px] font-bold shrink-0 ${tCfg.color}`}>
        {tCfg.icon}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-start gap-2 flex-wrap">
          <p className="text-sm font-semibold text-[#131218] leading-snug">{item.title}</p>
          {needsExecuteApproval && (
            <span className="text-[9px] font-bold bg-red-100 text-red-700 border border-red-200 px-2 py-0.5 rounded-full uppercase tracking-widest">
              × Execute blocked
            </span>
          )}
          {item.executeApproved && (
            <span className="text-[9px] font-bold bg-green-100 text-green-700 border border-green-200 px-2 py-0.5 rounded-full uppercase tracking-widest">
              ✓ Execute approved
            </span>
          )}
        </div>
        <div className="flex items-center gap-3 mt-1.5 flex-wrap">
          <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full border uppercase tracking-widest ${pCfg.badge}`}>
            {pCfg.label}
          </span>
          <span className="text-[10px] text-[#131218]/30 font-medium">{item.decisionType}</span>
          {item.sourceAgent && (
            <span className="text-[10px] text-[#131218]/25 font-medium">via {item.sourceAgent}</span>
          )}
          {item.dueDate && (
            <span className={`text-[10px] font-bold ${overdue ? "text-red-500" : "text-[#131218]/25"}`}>
              {overdue ? "! Overdue · " : "Due "}
              {formatDate(item.dueDate)}
            </span>
          )}
        </div>
        {item.notes ? (
          <p className="text-[12px] text-[#131218]/65 mt-2 leading-relaxed">
            {item.notes}
          </p>
        ) : (
          <p className="text-[11px] text-[#131218]/25 italic mt-1.5">No context provided — open in Notion for details.</p>
        )}
        {item.category && (
          <span className="inline-block mt-1.5 text-[9px] font-bold text-[#131218]/35 bg-[#EFEFEA] px-2 py-0.5 rounded-full uppercase tracking-widest">
            {item.category}
          </span>
        )}
        <DecisionActions
          id={item.id}
          requiresExecute={item.requiresExecute}
          executeApproved={item.executeApproved}
          status={item.status}
        />
      </div>

      {/* Open in Notion */}
      {item.notionUrl && (
        <a
          href={item.notionUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[10px] font-bold text-[#131218]/20 hover:text-[#131218]/60 transition-colors shrink-0 mt-0.5"
        >
          Notion →
        </a>
      )}
    </div>
  );
}

export default async function DecisionsPage() {
  await requireAdmin();

  const allItems = await getDecisionItems();

  const open      = allItems.filter(d => d.status === "Open" || !d.status);
  const resolved  = allItems.filter(d => d.status === "Resolved");
  const dismissed = allItems.filter(d => d.status === "Dismissed");

  const p1Items       = open.filter(d => d.priority === "P1 Critical");
  const executeGate   = open.filter(d => d.requiresExecute && !d.executeApproved);
  const approvals     = open.filter(d => d.decisionType === "Approval");
  const missingInput  = open.filter(d => d.decisionType === "Missing Input");
  const policyItems   = open.filter(d => d.decisionType === "Policy/Automation Decision" || d.decisionType === "Ambiguity Resolution");
  const draftReviews  = open.filter(d => d.decisionType === "Draft Review");

  return (
    <div className="flex min-h-screen bg-[#EFEFEA]">
      <Sidebar items={NAV} isAdmin />

      <main className="flex-1 ml-[228px] overflow-auto">

        {/* Header */}
        <div className="bg-[#131218] px-10 py-10">
          <p className="text-[8px] font-bold uppercase tracking-[2.5px] text-white/20 mb-3">
            CONTROL ROOM · DECISION CENTER
          </p>
          <h1 className="text-[2.6rem] font-[300] text-white leading-[1] tracking-[-1.5px]">
            Open <em className="font-[900] italic text-[#c8f55a]">Decisions</em>
          </h1>
          <p className="text-[12.5px] text-white/40 mt-3 max-w-[520px] leading-[1.65]">
            Pending approvals, execute gates, and items requiring your attention.
          </p>
        </div>

        {/* Stats row */}
        <div className="bg-white border-b border-[#E0E0D8] px-8 py-4">
          <div className="grid grid-cols-5 gap-px bg-[#E0E0D8] rounded-2xl overflow-hidden">
            <div className="bg-white px-5 py-4">
              {p1Items.length > 0 ? (
                <p className="text-2xl font-bold text-red-500">{p1Items.length}</p>
              ) : (
                <p className="text-2xl font-bold text-[#131218]/15">0</p>
              )}
              <p className="text-[10px] font-bold text-[#131218]/30 uppercase tracking-widest mt-1">P1 Critical</p>
            </div>
            <div className="bg-white px-5 py-4">
              {executeGate.length > 0 ? (
                <p className="text-2xl font-bold text-red-500">{executeGate.length}</p>
              ) : (
                <p className="text-2xl font-bold text-[#B2FF59] bg-[#131218] w-fit px-2 rounded-lg">✓</p>
              )}
              <p className="text-[10px] font-bold text-[#131218]/30 uppercase tracking-widest mt-1">Execute gate</p>
            </div>
            <div className="bg-white px-5 py-4">
              <p className="text-2xl font-bold text-[#131218]">{open.length}</p>
              <p className="text-[10px] font-bold text-[#131218]/30 uppercase tracking-widest mt-1">Open</p>
            </div>
            <div className="bg-white px-5 py-4">
              <p className="text-2xl font-bold text-[#131218]/30">{resolved.length}</p>
              <p className="text-[10px] font-bold text-[#131218]/30 uppercase tracking-widest mt-1">Resolved</p>
            </div>
            <div className="bg-white px-5 py-4">
              <p className="text-2xl font-bold text-[#131218]">{allItems.length}</p>
              <p className="text-[10px] font-bold text-[#131218]/30 uppercase tracking-widest mt-1">Total</p>
            </div>
          </div>
        </div>

        <div className="px-8 py-6 space-y-6">

          {/* Execute Gate — most critical, always first */}
          {executeGate.length > 0 && (
            <div className="bg-white rounded-2xl border border-red-200 overflow-hidden">
              <div className="h-1 bg-red-500" />
              <div className="px-6 py-4 border-b border-red-100 bg-red-50/30 flex items-center justify-between">
                <div>
                  <p className="text-[10px] font-bold text-red-600 uppercase tracking-widest">× Execute Gate</p>
                  <p className="text-sm font-bold text-[#131218] mt-0.5">Agents blocked — approve before running</p>
                </div>
                <span className="text-[10px] font-bold bg-red-100 text-red-700 border border-red-200 px-2.5 py-1 rounded-full uppercase tracking-widest">
                  {executeGate.length} blocked
                </span>
              </div>
              <div className="divide-y divide-[#EFEFEA]">
                {executeGate.map(d => <DecisionRow key={d.id} item={d} />)}
              </div>
            </div>
          )}

          {/* P1 Critical */}
          {p1Items.length > 0 && (
            <div className="bg-white rounded-2xl border border-[#E0E0D8] overflow-hidden">
              <div className="h-1 bg-red-400" />
              <div className="px-6 py-4 border-b border-[#EFEFEA] flex items-center justify-between">
                <div>
                  <p className="text-[10px] font-bold text-red-500 uppercase tracking-widest">P1 Critical</p>
                  <p className="text-sm font-bold text-[#131218] mt-0.5">Immediate attention required</p>
                </div>
                <span className="text-[10px] font-bold bg-red-50 text-red-600 border border-red-200 px-2.5 py-1 rounded-full">
                  {p1Items.length}
                </span>
              </div>
              <div className="divide-y divide-[#EFEFEA]">
                {p1Items.map(d => <DecisionRow key={d.id} item={d} />)}
              </div>
            </div>
          )}

          {/* Approvals */}
          {approvals.length > 0 && (
            <div className="bg-white rounded-2xl border border-[#E0E0D8] overflow-hidden">
              <div className="h-1 bg-[#B2FF59]" />
              <div className="px-6 py-4 border-b border-[#EFEFEA] flex items-center justify-between">
                <div>
                  <p className="text-[10px] font-bold text-[#131218]/30 uppercase tracking-widest">Needs Approval</p>
                  <p className="text-sm font-bold text-[#131218] mt-0.5">Decisions awaiting your sign-off</p>
                </div>
                <span className="text-[10px] font-bold bg-[#EFEFEA] text-[#131218]/50 px-2.5 py-1 rounded-full">{approvals.length}</span>
              </div>
              <div className="divide-y divide-[#EFEFEA]">
                {approvals.map(d => <DecisionRow key={d.id} item={d} />)}
              </div>
            </div>
          )}

          {/* Missing Input */}
          {missingInput.length > 0 && (
            <div className="bg-white rounded-2xl border border-[#E0E0D8] overflow-hidden">
              <div className="h-1 bg-amber-400" />
              <div className="px-6 py-4 border-b border-[#EFEFEA] flex items-center justify-between">
                <div>
                  <p className="text-[10px] font-bold text-[#131218]/30 uppercase tracking-widest">Needs Input</p>
                  <p className="text-sm font-bold text-[#131218] mt-0.5">Agents waiting for information</p>
                </div>
                <span className="text-[10px] font-bold bg-[#EFEFEA] text-[#131218]/50 px-2.5 py-1 rounded-full">{missingInput.length}</span>
              </div>
              <div className="divide-y divide-[#EFEFEA]">
                {missingInput.map(d => <DecisionRow key={d.id} item={d} />)}
              </div>
            </div>
          )}

          {/* Policy + Ambiguity */}
          {policyItems.length > 0 && (
            <div className="bg-white rounded-2xl border border-[#E0E0D8] overflow-hidden">
              <div className="h-1 bg-purple-400" />
              <div className="px-6 py-4 border-b border-[#EFEFEA] flex items-center justify-between">
                <div>
                  <p className="text-[10px] font-bold text-[#131218]/30 uppercase tracking-widest">Policy & Ambiguity</p>
                  <p className="text-sm font-bold text-[#131218] mt-0.5">Systemic decisions to resolve</p>
                </div>
                <span className="text-[10px] font-bold bg-[#EFEFEA] text-[#131218]/50 px-2.5 py-1 rounded-full">{policyItems.length}</span>
              </div>
              <div className="divide-y divide-[#EFEFEA]">
                {policyItems.map(d => <DecisionRow key={d.id} item={d} />)}
              </div>
            </div>
          )}

          {/* Draft Reviews */}
          {draftReviews.length > 0 && (
            <div className="bg-white rounded-2xl border border-[#E0E0D8] overflow-hidden">
              <div className="h-1 bg-[#131218]" />
              <div className="px-6 py-4 border-b border-[#EFEFEA] flex items-center justify-between">
                <div>
                  <p className="text-[10px] font-bold text-[#131218]/30 uppercase tracking-widest">Draft Reviews</p>
                  <p className="text-sm font-bold text-[#131218] mt-0.5">Content awaiting editorial review</p>
                </div>
                <span className="text-[10px] font-bold bg-[#EFEFEA] text-[#131218]/50 px-2.5 py-1 rounded-full">{draftReviews.length}</span>
              </div>
              <div className="divide-y divide-[#EFEFEA]">
                {draftReviews.map(d => <DecisionRow key={d.id} item={d} />)}
              </div>
            </div>
          )}

          {/* Resolved (collapsed) */}
          {resolved.length > 0 && (
            <div className="bg-white rounded-2xl border border-[#E0E0D8] overflow-hidden opacity-60">
              <div className="px-6 py-4 flex items-center justify-between">
                <p className="text-[10px] font-bold text-[#131218]/30 uppercase tracking-widest">
                  {resolved.length} Resolved
                </p>
              </div>
            </div>
          )}

          {open.length === 0 && (
            <div className="bg-white rounded-2xl border border-[#E0E0D8] px-8 py-12 text-center">
              <p className="text-2xl font-bold text-[#B2FF59] bg-[#131218] w-fit mx-auto px-4 py-2 rounded-xl mb-4">✓</p>
              <p className="text-sm font-bold text-[#131218]">All clear</p>
              <p className="text-xs text-[#131218]/30 font-medium mt-1">No open decisions right now.</p>
            </div>
          )}

        </div>
      </main>
    </div>
  );
}
