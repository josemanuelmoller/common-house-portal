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
    <li
      className="flex items-center gap-3 py-2.5 group"
      style={{ borderTop: "1px solid var(--hall-line-soft)" }}
    >
      <a
        href={opp.notionUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="flex-1 min-w-0"
      >
        <p
          className="text-[11.5px] font-semibold truncate"
          style={{ color: "var(--hall-ink-0)" }}
        >
          {opp.name}
        </p>
        <p
          className="text-[10px] mt-0.5"
          style={{ color: "var(--hall-muted-2)" }}
        >
          {opp.stage}{opp.type ? ` · ${opp.type}` : ""}
          {opp.orgName ? ` · ${opp.orgName}` : ""}
        </p>
      </a>

      {/* Follow-up status badge */}
      {isAlreadyFlagged && flagState !== "done" && (
        <span
          className="text-[8px] font-bold px-1.5 py-0.5 rounded-full uppercase tracking-wide shrink-0"
          style={{
            fontFamily: "var(--font-hall-mono)",
            ...(opp.followUpStatus === "Needed"
              ? { color: "var(--hall-warn)", background: "var(--hall-warn-paper)", border: "1px solid var(--hall-warn)" }
              : opp.followUpStatus === "Waiting" || opp.followUpStatus === "Sent"
              ? { color: "var(--hall-ink-3)", background: "var(--hall-fill-soft)", border: "1px solid var(--hall-line)" }
              : { color: "var(--hall-muted-3)", background: "var(--hall-fill-soft)" }),
          }}
        >
          {opp.followUpStatus}
        </span>
      )}

      {/* Flag button */}
      {flagState === "done" ? (
        <span
          className="text-[8px] font-bold px-1.5 py-0.5 rounded-full uppercase tracking-wide shrink-0"
          style={{
            fontFamily: "var(--font-hall-mono)",
            color: "var(--hall-ok)",
            background: "var(--hall-fill-soft)",
            border: "1px solid var(--hall-ok)",
          }}
        >
          Flagged ✓
        </span>
      ) : flagState === "error" ? (
        <span
          className="text-[8px] font-bold px-1.5 py-0.5 rounded-full uppercase tracking-wide shrink-0"
          style={{
            fontFamily: "var(--font-hall-mono)",
            color: "var(--hall-danger)",
            border: "1px solid var(--hall-danger)",
          }}
        >
          Error
        </span>
      ) : !isAlreadyFlagged ? (
        <button
          onClick={handleFlag}
          disabled={flagState === "loading"}
          className="hall-btn-primary opacity-0 group-hover:opacity-100 transition-opacity shrink-0 disabled:opacity-40"
          style={{ padding: "2px 8px", fontSize: 9 }}
        >
          {flagState === "loading" ? "…" : "Flag →"}
        </button>
      ) : (
        <button
          onClick={handleFlag}
          disabled={flagState === "loading"}
          className="hall-btn-outline opacity-0 group-hover:opacity-100 transition-opacity shrink-0 disabled:opacity-40"
          style={{ padding: "2px 8px", fontSize: 9 }}
        >
          {flagState === "loading" ? "…" : "Re-flag"}
        </button>
      )}
    </li>
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
      <div>
        <p
          className="text-[10px] font-bold uppercase tracking-widest mb-1.5"
          style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted-2)" }}
        >
          Common House
        </p>
        <ul className="flex flex-col">
          {ch.slice(0, 6).map(o => (
            <OppRow key={o.id} opp={o} />
          ))}
          {ch.length === 0 && (
            <li
              className="py-5 text-center"
              style={{ borderTop: "1px solid var(--hall-line-soft)" }}
            >
              <p
                className="text-[11px]"
                style={{ color: "var(--hall-muted-3)" }}
              >
                No CH opportunities
              </p>
            </li>
          )}
        </ul>
      </div>

      {/* Portfolio Opportunities */}
      <div>
        <p
          className="text-[10px] font-bold uppercase tracking-widest mb-1.5"
          style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted-2)" }}
        >
          Portfolio
        </p>
        <ul className="flex flex-col">
          {portfolio.slice(0, 6).map(o => (
            <OppRow key={o.id} opp={o} />
          ))}
          {portfolio.length === 0 && (
            <li
              className="py-5 text-center"
              style={{ borderTop: "1px solid var(--hall-line-soft)" }}
            >
              <p
                className="text-[11px]"
                style={{ color: "var(--hall-muted-3)" }}
              >
                No portfolio opportunities
              </p>
            </li>
          )}
        </ul>
      </div>
    </div>
  );
}
