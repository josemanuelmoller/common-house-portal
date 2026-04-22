"use client";

/**
 * CommsView — /admin/plan Comms tab.
 *
 * Read-only strategy header (pillars · audiences · channels) plus the 30-day
 * pitch queue from Supabase content_pitches. Each pitch at status=proposed
 * shows [Approve] [Skip] [Reject]; approved/drafted/published are surfaced as
 * terminal states with the right affordance.
 *
 * Writes go through /api/approve-pitch. After a successful write, we do an
 * optimistic local status update + router.refresh() to re-pull server data.
 */

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import type {
  Pillar,
  Audience,
  Channel,
  PitchWithContext,
  PitchStatus,
} from "@/lib/comms-strategy";

type Props = {
  pillars:   Pillar[];
  audiences: Audience[];
  channels:  Channel[];
  pitches:   PitchWithContext[];
};

const TIER_LABEL: Record<string, string> = {
  core:         "Core",
  building:     "Building",
  experimental: "Experimental",
};

const TIER_COLOR: Record<string, string> = {
  core:         "bg-[#131218] text-white",
  building:     "bg-[#c8f55a] text-[#131218]",
  experimental: "bg-[#EFEFEA] text-[#131218]/60",
};

const STATUS_LABEL: Record<PitchStatus, string> = {
  proposed:  "Proposed",
  approved:  "Approved",
  drafting:  "Drafting…",
  drafted:   "Drafted",
  published: "Published",
  skipped:   "Skipped",
  rejected:  "Rejected",
};

const STATUS_COLOR: Record<PitchStatus, string> = {
  proposed:  "text-amber-600 bg-amber-50 border-amber-200",
  approved:  "text-emerald-700 bg-emerald-50 border-emerald-200",
  drafting:  "text-blue-700 bg-blue-50 border-blue-200",
  drafted:   "text-emerald-700 bg-emerald-50 border-emerald-200",
  published: "text-[#131218] bg-[#c8f55a]/30 border-[#c8f55a]",
  skipped:   "text-[#131218]/40 bg-[#EFEFEA] border-[#E0E0D8]",
  rejected:  "text-[#131218]/40 bg-[#EFEFEA] border-[#E0E0D8]",
};

function fmtDate(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
}

export default function CommsView({ pillars, audiences, channels, pitches }: Props) {
  const router = useRouter();

  // Per-pitch local status for optimistic updates while the server refetch is in flight.
  const [localStatus,  setLocalStatus]  = useState<Record<string, PitchStatus>>({});
  const [actingId,     setActingId]     = useState<string | null>(null);
  const [rejectingId,  setRejectingId]  = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  const primaryChannel = channels.find(c => c.active) ?? channels[0];

  // Count proposed pitches — used for the prompt at the top.
  const proposedCount = useMemo(
    () => pitches.filter(p => (localStatus[p.id] ?? p.status) === "proposed").length,
    [pitches, localStatus]
  );

  async function handleAction(pitchId: string, action: "approve" | "skip" | "reject", reason?: string) {
    setActingId(pitchId);
    try {
      const res = await fetch("/api/approve-pitch", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ pitchId, action, reason }),
      });
      if (res.ok) {
        const newStatus: PitchStatus =
          action === "approve" ? "approved" :
          action === "skip"    ? "skipped"  : "rejected";
        setLocalStatus(s => ({ ...s, [pitchId]: newStatus }));
        setRejectingId(null);
        setRejectReason("");
        router.refresh();
      }
    } finally {
      setActingId(null);
    }
  }

  return (
    <div className="space-y-8">

      {/* ── Strategy header ──────────────────────────────────────────────── */}
      <section className="bg-white rounded-2xl border border-[#E0E0D8] overflow-hidden">
        <div className="px-6 py-4 border-b border-[#EFEFEA]">
          <h2 className="text-[13px] font-bold text-[#131218]">Strategy · revised quarterly</h2>
        </div>
        <div className="grid grid-cols-[1fr_1fr_1fr] gap-0 divide-x divide-[#EFEFEA]">

          {/* Pillars */}
          <div className="px-6 py-4">
            <p className="text-[9px] font-bold uppercase tracking-[2.5px] text-[#131218]/40 mb-3">
              Pilares · {pillars.length}
            </p>
            <ul className="space-y-2">
              {pillars.map(p => (
                <li key={p.id} className="flex items-start gap-2.5">
                  <span className={`text-[8.5px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded shrink-0 ${TIER_COLOR[p.tier]}`}>
                    {TIER_LABEL[p.tier]}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[12px] font-semibold text-[#131218] leading-tight">{p.name}</p>
                    {p.description && (
                      <p className="text-[10px] text-[#131218]/50 leading-snug mt-0.5">{p.description}</p>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </div>

          {/* Audiences */}
          <div className="px-6 py-4">
            <p className="text-[9px] font-bold uppercase tracking-[2.5px] text-[#131218]/40 mb-3">
              Audiencias · {audiences.length}
            </p>
            <ul className="space-y-2">
              {audiences.map(a => (
                <li key={a.id} className="flex items-start gap-2.5">
                  <span className="text-[8.5px] font-bold text-[#131218]/40 shrink-0 w-4 text-right">
                    P{a.priority}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[12px] font-semibold text-[#131218] leading-tight">{a.name}</p>
                    {a.description && (
                      <p className="text-[10px] text-[#131218]/50 leading-snug mt-0.5">{a.description}</p>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </div>

          {/* Channels */}
          <div className="px-6 py-4">
            <p className="text-[9px] font-bold uppercase tracking-[2.5px] text-[#131218]/40 mb-3">
              Canales · {channels.length}
            </p>
            <ul className="space-y-2">
              {channels.map(c => (
                <li key={c.id}>
                  <p className="text-[12px] font-semibold text-[#131218] leading-tight">{c.name}</p>
                  <p className="text-[10px] text-[#131218]/50 leading-snug">
                    {c.monthly_cadence}/mes · {Object.entries(c.format_mix).map(([k, v]) => `${v} ${k}`).join(" · ")}
                  </p>
                </li>
              ))}
            </ul>
          </div>

        </div>
      </section>

      {/* ── Pitch queue ──────────────────────────────────────────────────── */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <h2 className="text-[13px] font-bold text-[#131218]">Próximos 30 días</h2>
            {proposedCount > 0 && (
              <span className="text-[10px] font-bold text-amber-600 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
                {proposedCount} por revisar
              </span>
            )}
          </div>
          <p className="text-[10px] text-[#131218]/40">
            Canal activo: {primaryChannel?.name ?? "—"}
          </p>
        </div>

        {pitches.length === 0 ? (
          <div className="bg-white rounded-2xl border border-[#E0E0D8] px-6 py-10 text-center">
            <p className="text-[12px] font-semibold text-[#131218] mb-1">Sin pitches todavía</p>
            <p className="text-[11px] text-[#131218]/50 leading-relaxed max-w-md mx-auto">
              El agente <code className="bg-[#EFEFEA] px-1 rounded">propose-content-pitches</code> corre
              el último viernes de cada mes. También podés invocarlo manualmente cuando quieras ver
              propuestas antes.
            </p>
          </div>
        ) : (
          <ul className="space-y-2">
            {pitches.map(p => {
              const status = localStatus[p.id] ?? p.status;
              const isActing = actingId === p.id;
              const isRejecting = rejectingId === p.id;

              return (
                <li key={p.id} className="bg-white rounded-2xl border border-[#E0E0D8] overflow-hidden">
                  <div className="px-5 py-4">
                    <div className="flex items-start gap-4">

                      {/* Date */}
                      <div className="shrink-0 w-24">
                        <p className="text-[11px] font-bold text-[#131218]">{fmtDate(p.proposed_for_date)}</p>
                        {p.channel_name && (
                          <p className="text-[9px] text-[#131218]/40 mt-0.5">{p.channel_name}</p>
                        )}
                      </div>

                      {/* Tags */}
                      <div className="shrink-0 flex flex-col gap-1">
                        {p.pillar_tier && p.pillar_name && (
                          <span className={`text-[8.5px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded w-fit ${TIER_COLOR[p.pillar_tier]}`}>
                            {p.pillar_name}
                          </span>
                        )}
                        {p.audience_name && (
                          <span className="text-[9px] text-[#131218]/50 bg-[#EFEFEA] px-1.5 py-0.5 rounded w-fit">
                            → {p.audience_name}
                          </span>
                        )}
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        {p.headline && (
                          <p className="text-[12.5px] font-semibold text-[#131218] leading-snug">{p.headline}</p>
                        )}
                        <p className="text-[11px] text-[#131218]/60 leading-[1.55] mt-1">{p.angle}</p>
                        {p.trigger && (
                          <p className="text-[9.5px] text-[#131218]/35 leading-snug mt-1.5">
                            <span className="font-bold uppercase tracking-wider">Trigger</span> · {p.trigger}
                          </p>
                        )}
                      </div>

                      {/* Status + actions */}
                      <div className="shrink-0 flex flex-col items-end gap-1.5 min-w-[130px]">
                        <span className={`text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border ${STATUS_COLOR[status]}`}>
                          {STATUS_LABEL[status]}
                        </span>

                        {status === "proposed" && !isRejecting && (
                          <div className="flex gap-1 mt-1">
                            <button
                              disabled={isActing}
                              onClick={() => handleAction(p.id, "approve")}
                              className="text-[10px] font-bold bg-[#c8f55a] text-[#131218] rounded px-2 py-1 hover:bg-[#b8e54a] transition-colors disabled:opacity-50"
                            >
                              Approve
                            </button>
                            <button
                              disabled={isActing}
                              onClick={() => handleAction(p.id, "skip")}
                              className="text-[10px] font-bold text-[#131218]/50 hover:text-[#131218] border border-[#E0E0D8] rounded px-2 py-1 transition-colors disabled:opacity-50"
                            >
                              Skip
                            </button>
                            <button
                              disabled={isActing}
                              onClick={() => setRejectingId(p.id)}
                              className="text-[10px] font-bold text-red-500/70 hover:text-red-600 border border-[#E0E0D8] rounded px-2 py-1 transition-colors disabled:opacity-50"
                            >
                              Reject
                            </button>
                          </div>
                        )}

                        {status === "proposed" && isRejecting && (
                          <div className="flex flex-col gap-1 mt-1 w-full">
                            <input
                              autoFocus
                              type="text"
                              value={rejectReason}
                              onChange={e => setRejectReason(e.target.value)}
                              placeholder="Why?"
                              className="text-[10px] border border-[#E0E0D8] rounded px-2 py-1 outline-none focus:border-[#131218]"
                            />
                            <div className="flex gap-1">
                              <button
                                disabled={isActing}
                                onClick={() => handleAction(p.id, "reject", rejectReason)}
                                className="flex-1 text-[10px] font-bold bg-red-500 text-white rounded px-2 py-1 hover:bg-red-600 transition-colors disabled:opacity-50"
                              >
                                Reject
                              </button>
                              <button
                                disabled={isActing}
                                onClick={() => { setRejectingId(null); setRejectReason(""); }}
                                className="text-[10px] font-bold text-[#131218]/40 hover:text-[#131218] transition-colors"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        )}

                        {status === "drafted" && p.draft_notion_id && (
                          <a
                            href={`https://www.notion.so/${p.draft_notion_id.replace(/-/g, "")}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[10px] font-bold text-[#131218] hover:text-[#131218]/70 transition-colors mt-1"
                          >
                            Open in Notion ↗
                          </a>
                        )}

                        {p.rejected_reason && status === "rejected" && (
                          <p className="text-[9px] text-[#131218]/40 italic leading-tight mt-1 max-w-[130px] text-right">
                            &ldquo;{p.rejected_reason}&rdquo;
                          </p>
                        )}
                      </div>

                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

    </div>
  );
}
