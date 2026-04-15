"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { OpportunityItem } from "@/lib/notion";

type FlagState = "idle" | "loading" | "done" | "error";

function OppRow({ opp }: { opp: OpportunityItem }) {
  const router = useRouter();
  const [flagState, setFlagState] = useState<FlagState>("idle");

  const isAlreadyFlagged =
    opp.followUpStatus === "Needed" ||
    opp.followUpStatus === "In Progress" ||
    opp.followUpStatus === "Waiting" ||
    opp.followUpStatus === "Sent";

  async function handleFlag() {
    setFlagState("loading");
    try {
      const res = await fetch("/api/flag-opportunity", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ opportunityId: opp.id }),
      });
      if (res.ok) {
        setFlagState("done");
        router.refresh();
      } else {
        setFlagState("error");
      }
    } catch {
      setFlagState("error");
    }
  }

  return (
    <div className="flex items-center gap-3 px-4 py-2.5 hover:bg-[#EFEFEA]/40 transition-colors group">
      <a
        href={opp.notionUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="flex-1 min-w-0"
      >
        <p className="text-[11.5px] font-semibold text-[#131218] truncate">{opp.name}</p>
        <p className="text-[10px] text-[#131218]/35 mt-0.5">
          {opp.stage}{opp.type ? ` · ${opp.type}` : ""}
          {opp.orgName ? ` · ${opp.orgName}` : ""}
        </p>
      </a>

      {/* Follow-up status badge */}
      {isAlreadyFlagged && flagState !== "done" && (
        <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded-full uppercase tracking-wide shrink-0 ${
          opp.followUpStatus === "Needed"
            ? "bg-amber-50 text-amber-600 border border-amber-200"
            : opp.followUpStatus === "Waiting" || opp.followUpStatus === "Sent"
            ? "bg-blue-50 text-blue-600 border border-blue-200"
            : "bg-[#EFEFEA] text-[#131218]/30"
        }`}>
          {opp.followUpStatus}
        </span>
      )}

      {/* Flag button */}
      {flagState === "done" ? (
        <span className="text-[8px] font-bold px-1.5 py-0.5 rounded-full uppercase tracking-wide shrink-0 bg-lime-50 text-lime-600 border border-lime-200">
          Flagged ✓
        </span>
      ) : flagState === "error" ? (
        <span className="text-[8px] font-bold px-1.5 py-0.5 rounded-full uppercase tracking-wide shrink-0 bg-red-50 text-red-600 border border-red-200">
          Error
        </span>
      ) : !isAlreadyFlagged ? (
        <button
          onClick={handleFlag}
          disabled={flagState === "loading"}
          className="opacity-0 group-hover:opacity-100 transition-opacity text-[9px] font-bold px-2 py-0.5 rounded-full bg-[#131218] text-white hover:bg-[#131218]/80 disabled:opacity-40 shrink-0"
        >
          {flagState === "loading" ? "…" : "Flag →"}
        </button>
      ) : (
        <button
          onClick={handleFlag}
          disabled={flagState === "loading"}
          className="opacity-0 group-hover:opacity-100 transition-opacity text-[9px] font-bold px-2 py-0.5 rounded-full border border-[#131218]/20 text-[#131218]/50 hover:border-[#131218]/40 disabled:opacity-40 shrink-0"
        >
          {flagState === "loading" ? "…" : "Re-flag"}
        </button>
      )}
    </div>
  );
}

export default function OpportunityExplorer({
  ch,
  portfolio,
}: {
  ch: OpportunityItem[];
  portfolio: OpportunityItem[];
}) {
  return (
    <div className="grid grid-cols-2 gap-4">
      {/* CH Opportunities */}
      <div className="bg-white rounded-2xl border border-[#E0E0D8] overflow-hidden">
        <div className="px-4 py-3 border-b border-[#EFEFEA]">
          <p className="text-[9px] font-bold uppercase tracking-widest text-[#131218]/30">Common House</p>
        </div>
        <div className="divide-y divide-[#EFEFEA]">
          {ch.slice(0, 6).map(o => (
            <OppRow key={o.id} opp={o} />
          ))}
          {ch.length === 0 && (
            <div className="px-4 py-5 text-center">
              <p className="text-[11px] text-[#131218]/25">No CH opportunities</p>
            </div>
          )}
        </div>
      </div>

      {/* Portfolio Opportunities */}
      <div className="bg-white rounded-2xl border border-[#E0E0D8] overflow-hidden">
        <div className="px-4 py-3 border-b border-[#EFEFEA]">
          <p className="text-[9px] font-bold uppercase tracking-widest text-[#131218]/30">Portfolio</p>
        </div>
        <div className="divide-y divide-[#EFEFEA]">
          {portfolio.slice(0, 6).map(o => (
            <OppRow key={o.id} opp={o} />
          ))}
          {portfolio.length === 0 && (
            <div className="px-4 py-5 text-center">
              <p className="text-[11px] text-[#131218]/25">No portfolio opportunities</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
