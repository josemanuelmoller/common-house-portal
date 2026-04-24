"use client";

/**
 * CommsView v2 — /admin/plan Comms tab.
 *
 * Strategy header (read-only, quarterly) + pitch queue for the next 30 days,
 * grouped by week, with bulk approve, inline edit, and post-publication
 * outcome logging. Also exposes a manual trigger for the generator (Preview
 * shows JSON from dry_run; Generate inserts persistent pitches).
 *
 * Writes:
 *  - /api/approve-pitch       (single or bulk approve/skip/reject)
 *  - /api/edit-pitch          (update angle + headline)
 *  - /api/mark-pitch-outcome  (mark worth_repeating + numbers after publish)
 *  - /api/propose-content-pitches?force=1[&mode=dry_run] (manual trigger)
 */

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import type {
  Pillar,
  Audience,
  Channel,
  PitchWithContext,
  PitchStatus,
  PitchOutcome,
} from "@/lib/comms-strategy";

type Props = {
  pillars:   Pillar[];
  audiences: Audience[];
  channels:  Channel[];
  pitches:   PitchWithContext[];
  outcomes:  Record<string, PitchOutcome>;
};

const TIER_LABEL: Record<string, string> = {
  core:         "Core",
  building:     "Building",
  experimental: "Experimental",
};

const TIER_COLOR: Record<string, string> = {
  core:         "bg-[#0a0a0a] text-white",
  building:     "bg-[#c6f24a] text-[#0a0a0a]",
  experimental: "bg-[#f4f4ef] text-[#0a0a0a]/60",
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
  published: "text-[#0a0a0a] bg-[#c6f24a]/30 border-[#c6f24a]",
  skipped:   "text-[#0a0a0a]/40 bg-[#f4f4ef] border-[#e4e4dd]",
  rejected:  "text-[#0a0a0a]/40 bg-[#f4f4ef] border-[#e4e4dd]",
};

// ─── Date helpers ─────────────────────────────────────────────────────────────

function parseDate(iso: string): Date { return new Date(iso + "T00:00:00"); }

function fmtDate(iso: string): string {
  return parseDate(iso).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
}

// ISO week start (Monday) for a given date — used to bucket pitches.
function weekStart(d: Date): string {
  const copy = new Date(d);
  const day = copy.getDay(); // 0 Sun .. 6 Sat
  const offsetToMon = day === 0 ? -6 : 1 - day;
  copy.setDate(copy.getDate() + offsetToMon);
  return copy.toISOString().slice(0, 10);
}

function weekLabel(isoMonday: string, thisMonday: string): string {
  const diffDays = Math.round((parseDate(isoMonday).getTime() - parseDate(thisMonday).getTime()) / 86400_000);
  if (diffDays === 0) return "Esta semana";
  if (diffDays === 7) return "Próxima semana";
  if (diffDays < 0)   return "Pasada";
  const d = parseDate(isoMonday);
  return `Semana del ${d.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function CommsView({ pillars, audiences, channels, pitches, outcomes }: Props) {
  const router = useRouter();

  // Optimistic overrides while server data refetches.
  const [localStatus,  setLocalStatus]  = useState<Record<string, PitchStatus>>({});
  const [localAngle,   setLocalAngle]   = useState<Record<string, { angle: string; headline: string | null }>>({});
  const [actingId,     setActingId]     = useState<string | null>(null);
  const [rejectingId,  setRejectingId]  = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [editingId,    setEditingId]    = useState<string | null>(null);
  const [editAngle,    setEditAngle]    = useState("");
  const [editHeadline, setEditHeadline] = useState("");
  const [outcomeId,    setOutcomeId]    = useState<string | null>(null);
  const [outcomeForm,  setOutcomeForm]  = useState<{ worth_repeating: boolean | null; impressions: string; comments: string; dms: string; notes: string }>({
    worth_repeating: null, impressions: "", comments: "", dms: "", notes: "",
  });
  // Staging = dry_run pitches that haven't been persisted yet. User can strike
  // individual ones with ✕ and then Save the remainder, Regenerate the batch,
  // or Discard entirely.
  type StagingPitch = {
    proposed_for_date: string;
    pillar_id:         string | null;
    audience_id:       string | null;
    channel_id:        string | null;
    trigger:           string | null;
    angle:             string;
    headline:          string | null;
    pillar_name:       string | null;
    pillar_tier:       string | null;
    audience_name:     string | null;
    channel_name:      string | null;
  };

  const [generating,      setGenerating]      = useState<"generate" | "save" | null>(null);
  const [staging,         setStaging]         = useState<StagingPitch[] | null>(null);
  const [strikeIdx,       setStrikeIdx]       = useState<Set<number>>(new Set());
  const [genError,        setGenError]        = useState<string | null>(null);

  const primaryChannel = channels.find(c => c.active) ?? channels[0];
  const today = new Date();
  const thisMonday = weekStart(today);

  // ─── Bucket pitches by week ────────────────────────────────────────────────
  const weekBuckets = useMemo(() => {
    const buckets = new Map<string, PitchWithContext[]>();
    for (const p of pitches) {
      const wk = weekStart(parseDate(p.proposed_for_date));
      if (!buckets.has(wk)) buckets.set(wk, []);
      buckets.get(wk)!.push(p);
    }
    return [...buckets.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [pitches]);

  const proposedCount = useMemo(
    () => pitches.filter(p => (localStatus[p.id] ?? p.status) === "proposed").length,
    [pitches, localStatus]
  );

  // ─── Action handlers ───────────────────────────────────────────────────────
  async function handleAction(
    pitchIds: string[],
    action: "approve" | "skip" | "reject",
    reason?: string
  ) {
    const idForSpinner = pitchIds[0] ?? "bulk";
    setActingId(idForSpinner);
    try {
      const res = await fetch("/api/approve-pitch", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ pitchIds, action, reason }),
      });
      if (res.ok) {
        const newStatus: PitchStatus =
          action === "approve" ? "approved" :
          action === "skip"    ? "skipped"  : "rejected";
        setLocalStatus(prev => {
          const next = { ...prev };
          for (const id of pitchIds) next[id] = newStatus;
          return next;
        });
        setRejectingId(null);
        setRejectReason("");
        router.refresh();
      }
    } finally {
      setActingId(null);
    }
  }

  function startEdit(p: PitchWithContext) {
    const working = localAngle[p.id] ?? { angle: p.angle, headline: p.headline };
    setEditingId(p.id);
    setEditAngle(working.angle);
    setEditHeadline(working.headline ?? "");
  }

  async function saveEdit(pitchId: string) {
    if (editAngle.trim().length === 0) return;
    setActingId(pitchId);
    try {
      const res = await fetch("/api/edit-pitch", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ pitchId, angle: editAngle, headline: editHeadline || null }),
      });
      if (res.ok) {
        setLocalAngle(prev => ({ ...prev, [pitchId]: { angle: editAngle, headline: editHeadline || null } }));
        setEditingId(null);
        router.refresh();
      }
    } finally {
      setActingId(null);
    }
  }

  function openOutcome(p: PitchWithContext) {
    const existing = outcomes[p.id];
    setOutcomeId(p.id);
    setOutcomeForm({
      worth_repeating: existing?.worth_repeating ?? null,
      impressions:     existing?.impressions?.toString()    ?? "",
      comments:        existing?.comments_count?.toString() ?? "",
      dms:             existing?.dms_received?.toString()   ?? "",
      notes:           existing?.notes ?? "",
    });
  }

  async function saveOutcome(pitchId: string, advanceStatus = false) {
    setActingId(pitchId);
    try {
      const payload: Record<string, unknown> = {
        pitchId,
        worth_repeating: outcomeForm.worth_repeating,
        impressions:     outcomeForm.impressions ? Number(outcomeForm.impressions) : null,
        comments_count:  outcomeForm.comments    ? Number(outcomeForm.comments)    : null,
        dms_received:    outcomeForm.dms         ? Number(outcomeForm.dms)         : null,
        notes:           outcomeForm.notes || null,
      };
      if (advanceStatus) payload.advance_status = true;
      const res = await fetch("/api/mark-pitch-outcome", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(payload),
      });
      if (res.ok) {
        if (advanceStatus) setLocalStatus(prev => ({ ...prev, [pitchId]: "published" }));
        setOutcomeId(null);
        router.refresh();
      }
    } finally {
      setActingId(null);
    }
  }

  async function runGenerate() {
    setGenerating("generate");
    setGenError(null);
    try {
      const res  = await fetch("/api/propose-content-pitches?force=1&mode=dry_run", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setGenError(data?.error ?? `HTTP ${res.status}`);
        return;
      }
      const batch: StagingPitch[] = Array.isArray(data?.pitches) ? data.pitches : [];
      setStaging(batch);
      setStrikeIdx(new Set());
    } catch (e) {
      setGenError(String(e));
    } finally {
      setGenerating(null);
    }
  }

  async function saveStaging() {
    if (!staging) return;
    const keep = staging.filter((_, i) => !strikeIdx.has(i));
    if (keep.length === 0) { setStaging(null); setStrikeIdx(new Set()); return; }
    setGenerating("save");
    setGenError(null);
    try {
      const res = await fetch("/api/save-pitch-batch", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ pitches: keep }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setGenError(data?.error ?? `HTTP ${res.status}`);
        return;
      }
      setStaging(null);
      setStrikeIdx(new Set());
      router.refresh();
    } catch (e) {
      setGenError(String(e));
    } finally {
      setGenerating(null);
    }
  }

  function discardStaging() {
    setStaging(null);
    setStrikeIdx(new Set());
  }

  function toggleStrike(idx: number) {
    setStrikeIdx(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx); else next.add(idx);
      return next;
    });
  }

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-8">

      {/* ── Strategy header ──────────────────────────────────────────────── */}
      <section className="bg-white rounded-2xl border border-[#e4e4dd] overflow-hidden">
        <div className="px-6 py-4 border-b border-[#f4f4ef]">
          <h2 className="text-[13px] font-bold text-[#0a0a0a]">Strategy · revised quarterly</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-0 divide-x divide-[#f4f4ef]">

          <div className="px-6 py-4">
            <p className="text-[9px] font-bold uppercase tracking-[2.5px] text-[#0a0a0a]/40 mb-3">
              Pilares · {pillars.length}
            </p>
            <ul className="space-y-2">
              {pillars.map(p => (
                <li key={p.id} className="flex items-start gap-2.5">
                  <span className={`text-[8.5px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded shrink-0 ${TIER_COLOR[p.tier]}`}>
                    {TIER_LABEL[p.tier]}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[12px] font-semibold text-[#0a0a0a] leading-tight">{p.name}</p>
                    {p.description && (
                      <p className="text-[10px] text-[#0a0a0a]/50 leading-snug mt-0.5">{p.description}</p>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </div>

          <div className="px-6 py-4">
            <p className="text-[9px] font-bold uppercase tracking-[2.5px] text-[#0a0a0a]/40 mb-3">
              Audiencias · {audiences.length}
            </p>
            <ul className="space-y-2">
              {audiences.map(a => (
                <li key={a.id} className="flex items-start gap-2.5">
                  <span className="text-[8.5px] font-bold text-[#0a0a0a]/40 shrink-0 w-4 text-right">
                    P{a.priority}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[12px] font-semibold text-[#0a0a0a] leading-tight">{a.name}</p>
                    {a.description && (
                      <p className="text-[10px] text-[#0a0a0a]/50 leading-snug mt-0.5">{a.description}</p>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </div>

          <div className="px-6 py-4">
            <p className="text-[9px] font-bold uppercase tracking-[2.5px] text-[#0a0a0a]/40 mb-3">
              Canales · {channels.length}
            </p>
            <ul className="space-y-2">
              {channels.map(c => (
                <li key={c.id}>
                  <p className="text-[12px] font-semibold text-[#0a0a0a] leading-tight">{c.name}</p>
                  <p className="text-[10px] text-[#0a0a0a]/50 leading-snug">
                    {c.monthly_cadence}/mes · {Object.entries(c.format_mix).map(([k, v]) => `${v} ${k}`).join(" · ")}
                  </p>
                </li>
              ))}
            </ul>
          </div>

        </div>
      </section>

      {/* ── Generator controls ──────────────────────────────────────────── */}
      {staging === null && (
        <section className="bg-white rounded-2xl border border-[#e4e4dd] px-5 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <span className="text-[9px] font-bold uppercase tracking-[2.5px] text-[#0a0a0a]/40">Generator</span>
            <p className="text-[11px] text-[#0a0a0a]/55">
              Corre automático el último viernes de mes. Dispará manual si ocurre algo digno de postear antes.
            </p>
          </div>
          <button
            onClick={runGenerate}
            disabled={generating !== null}
            className="text-[10px] font-bold bg-[#0a0a0a] text-white rounded-lg px-3 py-1.5 hover:bg-[#2a2938] transition-colors disabled:opacity-50"
          >
            {generating === "generate" ? "Generating…" : "Generate batch"}
          </button>
        </section>
      )}

      {genError && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-2 text-[11px] text-red-700">
          Error: {genError}
        </div>
      )}

      {/* ── Staging area (dry_run batch awaiting Save / Regenerate / Discard) ── */}
      {staging !== null && (
        <section className="bg-[#FAF8EE] border-2 border-dashed border-[#c6f24a] rounded-2xl overflow-hidden">
          <div className="px-5 py-3 border-b border-dashed border-[#c6f24a]/50 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <span className="text-[9px] font-bold uppercase tracking-[2.5px] text-[#0a0a0a] bg-[#c6f24a] px-2 py-0.5 rounded">
                Preview · sin guardar
              </span>
              <p className="text-[11px] text-[#0a0a0a]/60">
                {staging.length - strikeIdx.size} de {staging.length} se guardarán · usa ✕ para excluir alguno
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={runGenerate}
                disabled={generating !== null}
                className="text-[10px] font-bold text-[#0a0a0a]/60 hover:text-[#0a0a0a] border border-[#0a0a0a]/20 rounded-lg px-3 py-1.5 transition-colors disabled:opacity-50"
              >
                {generating === "generate" ? "…" : "Regenerate"}
              </button>
              <button
                onClick={discardStaging}
                disabled={generating !== null}
                className="text-[10px] font-bold text-[#0a0a0a]/60 hover:text-red-600 border border-[#0a0a0a]/20 rounded-lg px-3 py-1.5 transition-colors disabled:opacity-50"
              >
                Discard
              </button>
              <button
                onClick={saveStaging}
                disabled={generating !== null || staging.length - strikeIdx.size === 0}
                className="text-[10px] font-bold bg-[#0a0a0a] text-white rounded-lg px-3 py-1.5 hover:bg-[#2a2938] transition-colors disabled:opacity-50"
              >
                {generating === "save" ? "Saving…" : `Save ${staging.length - strikeIdx.size}`}
              </button>
            </div>
          </div>

          <ul className="divide-y divide-[#c6f24a]/30">
            {staging.map((p, i) => {
              const struck = strikeIdx.has(i);
              return (
                <li key={i} className={`px-5 py-3 flex items-start gap-4 ${struck ? "opacity-40" : ""}`}>
                  <div className="shrink-0 w-24">
                    <p className={`text-[11px] font-bold text-[#0a0a0a] ${struck ? "line-through" : ""}`}>
                      {fmtDate(p.proposed_for_date)}
                    </p>
                    {p.channel_name && (
                      <p className="text-[9px] text-[#0a0a0a]/40 mt-0.5">{p.channel_name}</p>
                    )}
                  </div>
                  <div className="shrink-0 flex flex-col gap-1">
                    {p.pillar_tier && p.pillar_name && (
                      <span className={`text-[8.5px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded w-fit ${TIER_COLOR[p.pillar_tier]}`}>
                        {p.pillar_name}
                      </span>
                    )}
                    {p.audience_name && (
                      <span className="text-[9px] text-[#0a0a0a]/50 bg-white/60 px-1.5 py-0.5 rounded w-fit">
                        → {p.audience_name}
                      </span>
                    )}
                  </div>
                  <div className={`flex-1 min-w-0 ${struck ? "line-through" : ""}`}>
                    {p.headline && (
                      <p className="text-[12.5px] font-semibold text-[#0a0a0a] leading-snug">{p.headline}</p>
                    )}
                    <p className="text-[11px] text-[#0a0a0a]/65 leading-[1.55] mt-1">{p.angle}</p>
                    {p.trigger && (
                      <p className="text-[9.5px] text-[#0a0a0a]/35 leading-snug mt-1.5">
                        <span className="font-bold uppercase tracking-wider">Trigger</span> · {p.trigger}
                      </p>
                    )}
                  </div>
                  <button
                    onClick={() => toggleStrike(i)}
                    className={`shrink-0 text-[12px] font-bold w-7 h-7 rounded-full flex items-center justify-center transition-colors ${
                      struck
                        ? "bg-[#0a0a0a] text-white hover:bg-[#2a2938]"
                        : "text-[#0a0a0a]/30 hover:text-red-600 hover:bg-red-50"
                    }`}
                    title={struck ? "Re-incluir este pitch" : "Excluir este pitch del save"}
                  >
                    {struck ? "↺" : "✕"}
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* ── Pitch queue (weekly buckets) ────────────────────────────────── */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <h2 className="text-[13px] font-bold text-[#0a0a0a]">Próximos 30 días</h2>
            {proposedCount > 0 && (
              <span className="text-[10px] font-bold text-amber-600 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
                {proposedCount} por revisar
              </span>
            )}
          </div>
          <p className="text-[10px] text-[#0a0a0a]/40">
            Canal activo: {primaryChannel?.name ?? "—"}
          </p>
        </div>

        {pitches.length === 0 ? (
          <div className="bg-white rounded-2xl border border-[#e4e4dd] px-6 py-10 text-center">
            <p className="text-[12px] font-semibold text-[#0a0a0a] mb-1">Sin pitches todavía</p>
            <p className="text-[11px] text-[#0a0a0a]/50 leading-relaxed max-w-md mx-auto">
              Usá <span className="font-bold">Generate now</span> arriba para crear un batch ya, o esperá al cron del último viernes de mes.
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {weekBuckets.map(([wk, weekPitches]) => {
              const proposedInWeek = weekPitches.filter(p => (localStatus[p.id] ?? p.status) === "proposed");
              const canBulkApprove = proposedInWeek.length > 1;
              return (
                <div key={wk}>
                  <div className="flex items-center justify-between mb-2 px-1">
                    <p className="text-[10px] font-bold uppercase tracking-[2.5px] text-[#0a0a0a]/40">
                      {weekLabel(wk, thisMonday)} · {weekPitches.length} pitch{weekPitches.length === 1 ? "" : "es"}
                    </p>
                    {canBulkApprove && (
                      <button
                        disabled={actingId !== null}
                        onClick={() => handleAction(proposedInWeek.map(p => p.id), "approve")}
                        className="text-[10px] font-bold bg-[#c6f24a] text-[#0a0a0a] rounded px-2.5 py-1 hover:bg-[#b8e54a] transition-colors disabled:opacity-50"
                      >
                        ✓ Aprobar {proposedInWeek.length} de esta semana
                      </button>
                    )}
                  </div>

                  <ul className="space-y-2">
                    {weekPitches.map(p => {
                      const status       = localStatus[p.id] ?? p.status;
                      const isActing     = actingId === p.id;
                      const isRejecting  = rejectingId === p.id;
                      const isEditing    = editingId === p.id;
                      const isMarking    = outcomeId === p.id;
                      const working      = localAngle[p.id];
                      const displayAngle    = working?.angle    ?? p.angle;
                      const displayHeadline = working?.headline ?? p.headline;
                      const outcome      = outcomes[p.id];

                      return (
                        <li key={p.id} className="bg-white rounded-2xl border border-[#e4e4dd] overflow-hidden">
                          <div className="px-5 py-4">
                            <div className="flex items-start gap-4">

                              <div className="shrink-0 w-24">
                                <p className="text-[11px] font-bold text-[#0a0a0a]">{fmtDate(p.proposed_for_date)}</p>
                                {p.channel_name && (
                                  <p className="text-[9px] text-[#0a0a0a]/40 mt-0.5">{p.channel_name}</p>
                                )}
                              </div>

                              <div className="shrink-0 flex flex-col gap-1">
                                {p.pillar_tier && p.pillar_name && (
                                  <span className={`text-[8.5px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded w-fit ${TIER_COLOR[p.pillar_tier]}`}>
                                    {p.pillar_name}
                                  </span>
                                )}
                                {p.audience_name && (
                                  <span className="text-[9px] text-[#0a0a0a]/50 bg-[#f4f4ef] px-1.5 py-0.5 rounded w-fit">
                                    → {p.audience_name}
                                  </span>
                                )}
                              </div>

                              <div className="flex-1 min-w-0">
                                {isEditing ? (
                                  <div className="space-y-2">
                                    <input
                                      autoFocus
                                      type="text"
                                      value={editHeadline}
                                      onChange={e => setEditHeadline(e.target.value)}
                                      placeholder="Headline (optional)"
                                      className="w-full text-[12.5px] font-semibold text-[#0a0a0a] border border-[#0a0a0a]/20 rounded px-2 py-1 outline-none focus:border-[#0a0a0a]"
                                    />
                                    <textarea
                                      value={editAngle}
                                      onChange={e => setEditAngle(e.target.value)}
                                      className="w-full text-[11px] text-[#0a0a0a] leading-[1.55] border border-[#0a0a0a]/20 rounded px-2 py-1.5 outline-none focus:border-[#0a0a0a] min-h-[80px] resize-y"
                                    />
                                    <div className="flex items-center gap-3">
                                      <button
                                        disabled={isActing}
                                        onClick={() => saveEdit(p.id)}
                                        className="text-[10px] font-bold text-[#0a0a0a] hover:text-emerald-700 transition-colors disabled:opacity-50"
                                      >
                                        {isActing ? "Saving…" : "Save edit"}
                                      </button>
                                      <button
                                        disabled={isActing}
                                        onClick={() => setEditingId(null)}
                                        className="text-[10px] font-bold text-[#0a0a0a]/30 hover:text-[#0a0a0a] transition-colors disabled:opacity-50"
                                      >
                                        Cancel
                                      </button>
                                    </div>
                                  </div>
                                ) : (
                                  <>
                                    {displayHeadline && (
                                      <p className="text-[12.5px] font-semibold text-[#0a0a0a] leading-snug">{displayHeadline}</p>
                                    )}
                                    <p className="text-[11px] text-[#0a0a0a]/60 leading-[1.55] mt-1">{displayAngle}</p>
                                    {p.trigger && (
                                      <p className="text-[9.5px] text-[#0a0a0a]/35 leading-snug mt-1.5">
                                        <span className="font-bold uppercase tracking-wider">Trigger</span> · {p.trigger}
                                      </p>
                                    )}
                                    {(status === "drafted" || status === "published") && outcome && (
                                      <p className="text-[9.5px] text-[#0a0a0a]/50 leading-snug mt-1.5">
                                        <span className="font-bold uppercase tracking-wider">Outcome</span>
                                        {outcome.worth_repeating === true  && " · 👍 worth repeating"}
                                        {outcome.worth_repeating === false && " · 👎 skip next time"}
                                        {outcome.impressions    != null && ` · ${outcome.impressions} impressions`}
                                        {outcome.comments_count != null && ` · ${outcome.comments_count} comments`}
                                        {outcome.dms_received   != null && ` · ${outcome.dms_received} DMs`}
                                      </p>
                                    )}
                                  </>
                                )}
                              </div>

                              <div className="shrink-0 flex flex-col items-end gap-1.5 min-w-[140px]">
                                <span className={`text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border ${STATUS_COLOR[status]}`}>
                                  {STATUS_LABEL[status]}
                                </span>

                                {status === "proposed" && !isRejecting && !isEditing && (
                                  <div className="flex flex-col items-end gap-1 mt-1">
                                    <div className="flex gap-1">
                                      <button
                                        disabled={isActing}
                                        onClick={() => handleAction([p.id], "approve")}
                                        className="text-[10px] font-bold bg-[#c6f24a] text-[#0a0a0a] rounded px-2 py-1 hover:bg-[#b8e54a] transition-colors disabled:opacity-50"
                                      >
                                        Approve
                                      </button>
                                      <button
                                        disabled={isActing}
                                        onClick={() => startEdit(p)}
                                        className="text-[10px] font-bold text-[#0a0a0a]/70 hover:text-[#0a0a0a] border border-[#e4e4dd] rounded px-2 py-1 transition-colors disabled:opacity-50"
                                      >
                                        Edit
                                      </button>
                                    </div>
                                    <div className="flex gap-1">
                                      <button
                                        disabled={isActing}
                                        onClick={() => handleAction([p.id], "skip")}
                                        className="text-[10px] font-bold text-[#0a0a0a]/50 hover:text-[#0a0a0a] border border-[#e4e4dd] rounded px-2 py-1 transition-colors disabled:opacity-50"
                                      >
                                        Skip
                                      </button>
                                      <button
                                        disabled={isActing}
                                        onClick={() => setRejectingId(p.id)}
                                        className="text-[10px] font-bold text-red-500/70 hover:text-red-600 border border-[#e4e4dd] rounded px-2 py-1 transition-colors disabled:opacity-50"
                                      >
                                        Reject
                                      </button>
                                    </div>
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
                                      className="text-[10px] border border-[#e4e4dd] rounded px-2 py-1 outline-none focus:border-[#0a0a0a]"
                                    />
                                    <div className="flex gap-1">
                                      <button
                                        disabled={isActing}
                                        onClick={() => handleAction([p.id], "reject", rejectReason)}
                                        className="flex-1 text-[10px] font-bold bg-red-500 text-white rounded px-2 py-1 hover:bg-red-600 transition-colors disabled:opacity-50"
                                      >
                                        Reject
                                      </button>
                                      <button
                                        disabled={isActing}
                                        onClick={() => { setRejectingId(null); setRejectReason(""); }}
                                        className="text-[10px] font-bold text-[#0a0a0a]/40 hover:text-[#0a0a0a] transition-colors"
                                      >
                                        Cancel
                                      </button>
                                    </div>
                                  </div>
                                )}

                                {status === "drafted" && p.draft_notion_id && (
                                  <div className="flex flex-col items-end gap-1 mt-1">
                                    <a
                                      href={`https://www.notion.so/${p.draft_notion_id.replace(/-/g, "")}`}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-[10px] font-bold text-[#0a0a0a] hover:text-[#0a0a0a]/70 transition-colors"
                                    >
                                      Open in Notion ↗
                                    </a>
                                    <button
                                      onClick={() => openOutcome(p)}
                                      className="text-[10px] font-bold text-[#0a0a0a]/60 hover:text-[#0a0a0a] border border-[#e4e4dd] rounded px-2 py-1 transition-colors"
                                    >
                                      {outcome ? "Edit outcome" : "Mark outcome"}
                                    </button>
                                  </div>
                                )}

                                {status === "published" && (
                                  <button
                                    onClick={() => openOutcome(p)}
                                    className="text-[10px] font-bold text-[#0a0a0a]/60 hover:text-[#0a0a0a] border border-[#e4e4dd] rounded px-2 py-1 transition-colors mt-1"
                                  >
                                    {outcome ? "Edit outcome" : "Log outcome"}
                                  </button>
                                )}

                                {p.rejected_reason && status === "rejected" && (
                                  <p className="text-[9px] text-[#0a0a0a]/40 italic leading-tight mt-1 max-w-[140px] text-right">
                                    &ldquo;{p.rejected_reason}&rdquo;
                                  </p>
                                )}
                              </div>

                            </div>

                            {/* Outcome form — expands below the row when active */}
                            {isMarking && (
                              <div className="mt-4 pt-4 border-t border-[#f4f4ef] space-y-3">
                                <div className="flex items-center gap-3">
                                  <p className="text-[10px] font-bold uppercase tracking-widest text-[#0a0a0a]/40">
                                    Outcome
                                  </p>
                                  <div className="flex gap-1.5">
                                    <button
                                      onClick={() => setOutcomeForm(f => ({ ...f, worth_repeating: f.worth_repeating === true ? null : true }))}
                                      className={`text-[10px] font-bold px-2.5 py-1 rounded border transition-colors ${
                                        outcomeForm.worth_repeating === true
                                          ? "bg-emerald-500 text-white border-emerald-500"
                                          : "text-[#0a0a0a]/60 border-[#e4e4dd] hover:text-[#0a0a0a]"
                                      }`}
                                    >
                                      👍 Worth repeating
                                    </button>
                                    <button
                                      onClick={() => setOutcomeForm(f => ({ ...f, worth_repeating: f.worth_repeating === false ? null : false }))}
                                      className={`text-[10px] font-bold px-2.5 py-1 rounded border transition-colors ${
                                        outcomeForm.worth_repeating === false
                                          ? "bg-red-500 text-white border-red-500"
                                          : "text-[#0a0a0a]/60 border-[#e4e4dd] hover:text-[#0a0a0a]"
                                      }`}
                                    >
                                      👎 Skip next time
                                    </button>
                                  </div>
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                  <label className="flex flex-col gap-1">
                                    <span className="text-[9px] font-bold uppercase tracking-wider text-[#0a0a0a]/40">Impressions</span>
                                    <input type="number" value={outcomeForm.impressions} onChange={e => setOutcomeForm(f => ({ ...f, impressions: e.target.value }))} className="text-[11px] border border-[#e4e4dd] rounded px-2 py-1 outline-none focus:border-[#0a0a0a]" />
                                  </label>
                                  <label className="flex flex-col gap-1">
                                    <span className="text-[9px] font-bold uppercase tracking-wider text-[#0a0a0a]/40">Comments</span>
                                    <input type="number" value={outcomeForm.comments} onChange={e => setOutcomeForm(f => ({ ...f, comments: e.target.value }))} className="text-[11px] border border-[#e4e4dd] rounded px-2 py-1 outline-none focus:border-[#0a0a0a]" />
                                  </label>
                                  <label className="flex flex-col gap-1">
                                    <span className="text-[9px] font-bold uppercase tracking-wider text-[#0a0a0a]/40">DMs</span>
                                    <input type="number" value={outcomeForm.dms} onChange={e => setOutcomeForm(f => ({ ...f, dms: e.target.value }))} className="text-[11px] border border-[#e4e4dd] rounded px-2 py-1 outline-none focus:border-[#0a0a0a]" />
                                  </label>
                                </div>
                                <textarea
                                  value={outcomeForm.notes}
                                  onChange={e => setOutcomeForm(f => ({ ...f, notes: e.target.value }))}
                                  placeholder="What happened? Lessons?"
                                  className="w-full text-[11px] border border-[#e4e4dd] rounded px-2 py-1.5 outline-none focus:border-[#0a0a0a] min-h-[48px] resize-y"
                                />
                                <div className="flex items-center gap-3 justify-end">
                                  {status === "drafted" && (
                                    <button
                                      disabled={isActing}
                                      onClick={() => saveOutcome(p.id, true)}
                                      className="text-[10px] font-bold bg-[#0a0a0a] text-white rounded px-3 py-1.5 hover:bg-[#2a2938] transition-colors disabled:opacity-50"
                                    >
                                      Mark published + save
                                    </button>
                                  )}
                                  <button
                                    disabled={isActing}
                                    onClick={() => saveOutcome(p.id, false)}
                                    className="text-[10px] font-bold text-[#0a0a0a] border border-[#e4e4dd] rounded px-3 py-1.5 hover:bg-[#f4f4ef] transition-colors disabled:opacity-50"
                                  >
                                    Save
                                  </button>
                                  <button
                                    disabled={isActing}
                                    onClick={() => setOutcomeId(null)}
                                    className="text-[10px] font-bold text-[#0a0a0a]/40 hover:text-[#0a0a0a] transition-colors"
                                  >
                                    Close
                                  </button>
                                </div>
                              </div>
                            )}

                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              );
            })}
          </div>
        )}
      </section>

    </div>
  );
}
