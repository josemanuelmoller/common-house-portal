"use client";

/**
 * CandidateSection — Opportunity Candidate Deck
 *
 * Shows unreviewed opportunity candidates (Stage = "Candidate") with
 * three actions per item:
 *   • Create Opportunity  — promotes to Stage = "Active"
 *   • Ignore              — moves to Stage = "Archived"
 *   • View in Notion      — open record directly
 *
 * Also includes a "Scan for new candidates" button that triggers the
 * Gmail scan + Claude classification pipeline on demand.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { CandidateItem } from "@/lib/notion";

const ORIGIN_LABEL: Record<string, string> = {
  meeting: "📋 Meeting",
  email:   "📧 Email",
  doc:     "📄 Doc",
};

function OriginBadges({ origins }: { origins: ("meeting" | "email" | "doc")[] }) {
  if (!origins || origins.length === 0) return null;
  return (
    <div className="flex items-center gap-1 flex-wrap mt-0.5 mb-1">
      {origins.map(o => (
        <span
          key={o}
          className="text-[8px] font-semibold px-1.5 py-0.5 rounded-full bg-[#f4f4ef] text-[#0a0a0a]/50 border border-[#e4e4dd]"
        >
          {ORIGIN_LABEL[o] ?? o}
        </span>
      ))}
    </div>
  );
}

function typeColor(type: string): string {
  if (type === "Grant")       return "bg-green-50 text-green-600 border-green-200";
  if (type === "Investment")  return "bg-purple-50 text-purple-600 border-purple-200";
  if (type === "Consulting")  return "bg-blue-50 text-blue-600 border-blue-200";
  if (type === "Partnership") return "bg-amber-50 text-amber-600 border-amber-200";
  return "bg-[#f4f4ef] text-[#0a0a0a]/40 border-[#e4e4dd]";
}

interface Props {
  candidates: CandidateItem[];
}

type ScanResult = {
  found: number;
  created: number;
  enriched: number;
  gmailScanned: number;
  meetingsScanned: number;
};

export function CandidateSection({ candidates }: Props) {
  const router = useRouter();
  const [acting, setActing]     = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  async function handleAction(candidateId: string, action: "promote" | "ignore") {
    setActing(candidateId);
    try {
      await fetch("/api/promote-candidate", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          candidateId,
          action,
          ...(action === "ignore" ? { reason: "Ignored via Hall review" } : {}),
        }),
      });
      // Optimistic: remove from view immediately
      setDismissed(prev => new Set(prev).add(candidateId));
      router.refresh(); // re-fetch server data in background
    } catch { /* silent */ } finally {
      setActing(null);
    }
  }

  async function handleScan() {
    setScanning(true);
    setScanResult(null);
    try {
      const res = await fetch("/api/scan-opportunity-candidates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "execute", lookback_days: 14 }),
      });
      const data = await res.json();
      setScanResult({
        found:           data.candidates?.length ?? 0,
        created:         data.created   ?? 0,
        enriched:        data.enriched  ?? 0,
        gmailScanned:    data.gmail_scanned    ?? 0,
        meetingsScanned: data.meetings_scanned ?? 0,
      });
      if ((data.created ?? 0) > 0 || (data.enriched ?? 0) > 0) router.refresh();
    } catch {
      setScanResult({ found: 0, created: 0, enriched: 0, gmailScanned: 0, meetingsScanned: 0 });
    } finally {
      setScanning(false);
    }
  }

  const visible = candidates.filter(c => !dismissed.has(c.id));

  return (
    <div className="space-y-2">
      {/* Scan trigger */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {scanResult !== null && (
            <span className="text-[9px] text-[#0a0a0a]/35 font-medium">
              {scanResult.created > 0 || scanResult.enriched > 0
                ? [
                    scanResult.created  > 0 && `${scanResult.created} new`,
                    scanResult.enriched > 0 && `${scanResult.enriched} enriched`,
                  ].filter(Boolean).join(", ") + " · scanned " +
                  [
                    scanResult.gmailScanned    > 0 && `${scanResult.gmailScanned} emails`,
                    scanResult.meetingsScanned > 0 && `${scanResult.meetingsScanned} meetings`,
                  ].filter(Boolean).join(" + ")
                : scanResult.found > 0
                  ? `${scanResult.found} signal${scanResult.found !== 1 ? "s" : ""} — already tracked`
                  : `No new candidates · scanned ${[
                      scanResult.gmailScanned    > 0 && `${scanResult.gmailScanned} emails`,
                      scanResult.meetingsScanned > 0 && `${scanResult.meetingsScanned} meetings`,
                    ].filter(Boolean).join(" + ") || "0 sources"}`}
            </span>
          )}
        </div>
        <button
          onClick={handleScan}
          disabled={scanning}
          className="text-[9px] font-bold text-[#0a0a0a]/30 hover:text-[#0a0a0a] transition-colors uppercase tracking-widest disabled:opacity-40 flex items-center gap-1.5"
        >
          {scanning ? (
            <>
              <span className="w-1.5 h-1.5 rounded-full bg-[#0a0a0a]/30 animate-pulse" />
              Scanning…
            </>
          ) : "Scan inbox →"}
        </button>
      </div>

      {/* Empty state — compact */}
      {visible.length === 0 && !scanning && (
        <div className="flex items-center gap-3 bg-white/50 border border-dashed border-[#e4e4dd] rounded-xl px-4 py-2">
          <span className="w-1.5 h-1.5 rounded-full bg-[#0a0a0a]/15 shrink-0" />
          <p className="text-[11px] text-[#0a0a0a]/40 flex-1 min-w-0 truncate">
            No unreviewed candidates — use <span className="font-semibold text-[#0a0a0a]/55">Scan inbox</span> above or the &ldquo;+&rdquo; button on inbox rows.
          </p>
        </div>
      )}

      {/* Candidate cards */}
      {visible.map(c => {
        const isActing = acting === c.id;
        return (
          <div
            key={c.id}
            className="bg-white rounded-xl border border-amber-200 px-4 py-3.5 flex items-start gap-3"
          >
            {/* Indicator */}
            <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0 mt-1.5" />

            <div className="flex-1 min-w-0">
              {/* Badges */}
              <div className="flex items-center gap-1.5 mb-1">
                <span className="text-[8px] font-bold uppercase tracking-widest text-amber-600 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded-full">
                  Candidate
                </span>
                {c.type && (
                  <span className={`text-[8px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded-full border ${typeColor(c.type)}`}>
                    {c.type}
                  </span>
                )}
              </div>

              {/* Name */}
              <p className="text-[12.5px] font-semibold text-[#0a0a0a] leading-snug">{c.name}</p>
              {c.orgName && (
                <p className="text-[10.5px] text-[#0a0a0a]/40 mt-0.5">{c.orgName}</p>
              )}
              {c.signalRef && c.signalRef !== c.orgName && (
                <p className="text-[9.5px] text-[#0a0a0a]/30 mt-0.5 truncate max-w-[360px]" title={c.signalRef}>
                  {c.signalRef}
                </p>
              )}

              {/* Signal origins */}
              <OriginBadges origins={c.signalOrigins} />

              {/* Signal context */}
              {c.signalContext && (
                <p className="text-[10px] text-[#0a0a0a]/45 mt-1 leading-snug italic">
                  {c.signalContext.slice(0, 200)}
                </p>
              )}

              {/* Source link */}
              {c.sourceUrl && (
                <a
                  href={c.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[9.5px] text-blue-600 hover:text-blue-800 font-medium mt-1 inline-block transition-colors"
                >
                  View source →
                </a>
              )}

              {/* Actions */}
              <div className="flex items-center gap-2 mt-2.5">
                <button
                  onClick={() => handleAction(c.id, "promote")}
                  disabled={isActing}
                  className="text-[9px] font-bold text-white bg-[#0a0a0a] hover:bg-[#0a0a0a]/80 px-2.5 py-1.5 rounded-lg transition-colors disabled:opacity-40"
                >
                  {isActing ? "…" : "✓ Create Opportunity"}
                </button>
                <button
                  onClick={() => handleAction(c.id, "ignore")}
                  disabled={isActing}
                  className="text-[9px] font-bold text-[#0a0a0a]/40 hover:text-[#0a0a0a] bg-[#f4f4ef] hover:bg-[#e4e4dd] px-2.5 py-1.5 rounded-lg transition-colors disabled:opacity-40"
                >
                  Ignore
                </button>
                <a
                  href={c.notionUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[9px] font-bold text-[#0a0a0a]/25 hover:text-[#0a0a0a]/60 transition-colors ml-auto"
                >
                  Notion →
                </a>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
