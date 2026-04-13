"use client";

import { useEffect, useState, useCallback } from "react";
import { Sidebar } from "@/components/Sidebar";
import { ADMIN_NAV } from "@/lib/admin-nav";
import type { LivingRoomPerson, LivingRoomMilestone, LivingRoomTheme, InsightBrief } from "@/lib/notion";

/**
 * /admin/living-room — Living Room editorial curation UI.
 *
 * Lets the CH team control what appears in /living-room without touching Notion directly.
 * Writes go through /api/living-room (PATCH) → Notion.
 *
 * Tabs:
 *   1. People Visibility  — per-person select: public-safe / community / private
 *   2. Milestones         — toggle "Share to Living Room" per project
 *   3. Signals            — toggle "Community Relevant" per insight brief
 *   4. Themes in Motion   — toggle "Living Room Theme" per knowledge asset
 */

type Tab = "people" | "milestones" | "signals" | "themes";

type PeopleData   = LivingRoomPerson[];
type MilestonesData = (LivingRoomMilestone & { shareToLivingRoom?: boolean })[];
type SignalsData  = InsightBrief[];
type ThemesData   = (LivingRoomTheme & { active?: boolean })[];

type DirtyState = {
  people:     Record<string, string>;              // personId → new visibility
  milestones: Record<string, boolean>;             // projectId → share flag
  signals:    Record<string, boolean>;             // briefId → communityRelevant
  themes:     Record<string, boolean>;             // assetId → active
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function InfoNote({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-2.5 items-start bg-[rgba(200,245,90,0.08)] border border-[rgba(200,245,90,0.3)] rounded-xl px-4 py-3 text-[11px] text-[#3a6600] leading-relaxed mb-6">
      <span className="shrink-0 mt-0.5">ℹ</span>
      <span>{children}</span>
    </div>
  );
}

function StatPill({
  label,
  value,
  sub,
  color,
}: {
  label: string;
  value: number | string;
  sub: string;
  color?: "lime" | "red" | "amber";
}) {
  const valCls =
    color === "lime"
      ? "text-[#3a8c00]"
      : color === "red"
      ? "text-red-500"
      : color === "amber"
      ? "text-amber-500"
      : "text-[#131218]";
  return (
    <div className="bg-white border border-[#D8D8D0] rounded-xl p-4">
      <div className="text-[8px] font-bold tracking-[2px] uppercase text-[#131218]/25 mb-1.5">
        {label}
      </div>
      <div className={`text-[1.6rem] font-black tracking-tight leading-none ${valCls}`}>
        {value}
      </div>
      <div className="text-[10px] text-[#6b6b6b] mt-1.5">{sub}</div>
    </div>
  );
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <button
      onClick={onChange}
      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors shrink-0 ${
        checked ? "bg-[#3a8c00]" : "bg-[#D1D5DB]"
      }`}
      aria-checked={checked}
      role="switch"
    >
      <span
        className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
          checked ? "translate-x-4" : "translate-x-0.5"
        }`}
      />
    </button>
  );
}

function ColHeader({ labels }: { labels: string[] }) {
  return (
    <div className="flex gap-3.5 pb-2.5 border-b border-[#D8D8D0] mb-0.5">
      {labels.map((l) => (
        <span
          key={l}
          className="text-[8px] font-bold tracking-[1.8px] uppercase text-[#131218]/22 flex-1 first:flex-[1.8]"
        >
          {l}
        </span>
      ))}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function LivingRoomAdminPage() {
  const [tab, setTab]       = useState<Tab>("people");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved]   = useState(false);
  const [error, setError]   = useState<string | null>(null);

  const [people,     setPeople]     = useState<PeopleData>([]);
  const [milestones, setMilestones] = useState<MilestonesData>([]);
  const [signals,    setSignals]    = useState<SignalsData>([]);
  const [themes,     setThemes]     = useState<ThemesData>([]);
  const [loading,    setLoading]    = useState(true);

  const [dirty, setDirty] = useState<DirtyState>({
    people: {}, milestones: {}, signals: {}, themes: {},
  });

  const dirtyCount = (
    Object.keys(dirty.people).length +
    Object.keys(dirty.milestones).length +
    Object.keys(dirty.signals).length +
    Object.keys(dirty.themes).length
  );

  // ── Load data from Notion (via our own API endpoints) ───────────────────
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [pRes, mRes, sRes, tRes] = await Promise.all([
        fetch("/api/living-room/people"),
        fetch("/api/living-room/milestones"),
        fetch("/api/living-room/signals"),
        fetch("/api/living-room/themes"),
      ]);
      if (pRes.ok) setPeople(await pRes.json());
      if (mRes.ok) setMilestones(await mRes.json());
      if (sRes.ok) setSignals(await sRes.json());
      if (tRes.ok) setThemes(await tRes.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // ── Dirty tracking helpers ───────────────────────────────────────────────
  function markPersonVisibility(id: string, vis: string) {
    setDirty(d => ({ ...d, people: { ...d.people, [id]: vis } }));
    setPeople(prev => prev.map(p => p.id === id ? { ...p, visibility: vis } : p));
  }

  function markMilestoneShare(id: string, share: boolean) {
    setDirty(d => ({ ...d, milestones: { ...d.milestones, [id]: share } }));
    setMilestones(prev => prev.map(m => m.id === id ? { ...m, shareToLivingRoom: share } : m));
  }

  function markSignalRelevant(id: string, relevant: boolean) {
    setDirty(d => ({ ...d, signals: { ...d.signals, [id]: relevant } }));
    setSignals(prev => prev.map(s => s.id === id ? { ...s, communityRelevant: relevant } : s));
  }

  function markThemeActive(id: string, active: boolean) {
    setDirty(d => ({ ...d, themes: { ...d.themes, [id]: active } }));
    setThemes(prev => prev.map(t => t.id === id ? { ...t, active } : t));
  }

  // ── Save all dirty changes ───────────────────────────────────────────────
  async function saveAll() {
    setSaving(true);
    setError(null);
    try {
      const writes: Promise<Response>[] = [];

      for (const [id, visibility] of Object.entries(dirty.people)) {
        writes.push(fetch("/api/living-room", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type: "person-visibility", id, visibility }),
        }));
      }
      for (const [id, share] of Object.entries(dirty.milestones)) {
        writes.push(fetch("/api/living-room", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type: "project-share", id, share }),
        }));
      }
      for (const [id, communityRelevant] of Object.entries(dirty.signals)) {
        writes.push(fetch("/api/living-room", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type: "signal-visibility", id, communityRelevant }),
        }));
      }
      for (const [id, active] of Object.entries(dirty.themes)) {
        writes.push(fetch("/api/living-room", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type: "theme-active", id, active }),
        }));
      }

      const results = await Promise.all(writes);
      const failed  = results.filter(r => !r.ok);
      if (failed.length > 0) throw new Error(`${failed.length} write(s) failed`);

      setDirty({ people: {}, milestones: {}, signals: {}, themes: {} });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  const TABS: { id: Tab; label: string; emoji: string; count: number }[] = [
    { id: "people",     label: "People Visibility",  emoji: "👤", count: people.length },
    { id: "milestones", label: "Milestones",          emoji: "🏆", count: milestones.length },
    { id: "signals",    label: "Community Signals",   emoji: "📡", count: signals.length },
    { id: "themes",     label: "Themes in Motion",    emoji: "🌊", count: themes.length },
  ];

  const VIS_OPTS = ["public-safe", "community", "private"] as const;

  return (
    <div className="flex min-h-screen bg-[#EEEEE8]">
      <Sidebar adminNav />

      <main className="flex-1 overflow-auto flex flex-col">

        {/* ── Dark header ── */}
        <header className="bg-black flex-shrink-0" style={{ padding: "40px 52px 44px" }}>
          <p className="text-[8px] font-bold tracking-[2.5px] uppercase text-white/20 mb-3">
            Living Room · Editorial Curator
          </p>
          <div className="flex items-end justify-between gap-5 flex-wrap">
            <div>
              <h1 className="text-[2.6rem] font-light text-white tracking-[-1.5px] leading-none">
                Curate the{" "}
                <em className="font-black not-italic text-[#B2FF59]">community</em>
                <br />
                layer.
              </h1>
              <p className="text-[12.5px] text-white/38 mt-3 max-w-xl leading-relaxed">
                Control who appears, which milestones surface, which signals are shared,
                and what themes are in motion — without touching Notion directly.
              </p>
            </div>
            <div className="flex gap-2.5 flex-wrap items-end">
              <a
                href="/living-room"
                className="text-[10.5px] font-bold px-4 py-2 rounded-lg border border-white/18 text-white/70 hover:text-white hover:border-white/35 transition-colors"
              >
                ↗ Preview Living Room
              </a>
              {dirtyCount > 0 && (
                <button
                  onClick={saveAll}
                  disabled={saving}
                  className="text-[10.5px] font-bold px-4 py-2 rounded-lg bg-[#B2FF59] text-black hover:bg-[#c8f55a] transition-colors disabled:opacity-50"
                >
                  {saving ? "Saving…" : "Save all changes"}
                </button>
              )}
            </div>
          </div>
        </header>

        {/* ── White tab bar ── */}
        <div className="bg-white border-b border-[#D8D8D0] flex gap-0 flex-shrink-0" style={{ padding: "0 52px" }}>
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-5 py-4 text-[11.5px] font-semibold border-b-2 transition-colors whitespace-nowrap ${
                tab === t.id
                  ? "text-[#131218] border-[#B2FF59]"
                  : "text-[#131218]/38 border-transparent hover:text-[#131218]"
              }`}
            >
              {t.emoji} {t.label}
              <span className={`ml-1.5 text-[9px] px-1.5 py-0.5 rounded-full font-bold ${
                tab === t.id ? "bg-[#EFEFEA] text-[#131218]/50" : "bg-[#EFEFEA] text-[#131218]/25"
              }`}>
                {t.count}
              </span>
            </button>
          ))}
        </div>

        {/* ── Content ── */}
        <div className="flex-1" style={{ padding: "36px 52px 60px" }}>
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <p className="text-sm text-[#131218]/30 font-medium">Loading from Notion…</p>
            </div>
          ) : (
            <>

              {/* ── Tab: People ── */}
              {tab === "people" && (
                <div>
                  <InfoNote>
                    Set who is visible in Living Room.{" "}
                    <strong>Public-safe</strong> members appear in Featured Members, Geography, and Hall teasers.{" "}
                    <strong>Community</strong> members appear to authenticated users only.{" "}
                    <strong>Private</strong> members are never shown.
                  </InfoNote>

                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
                    <StatPill label="Total Members" value={people.length} sub="In CH People OS v2" />
                    <StatPill
                      label="Public-Safe"
                      value={people.filter(p => p.visibility === "public-safe").length}
                      sub="Visible externally"
                      color="lime"
                    />
                    <StatPill
                      label="Community"
                      value={people.filter(p => p.visibility === "community").length}
                      sub="Authenticated only"
                    />
                    <StatPill
                      label="Private / Unset"
                      value={people.filter(p => !p.visibility || p.visibility === "private").length}
                      sub="Not surfaced"
                      color="red"
                    />
                  </div>

                  <div className="bg-white rounded-2xl border border-[#D8D8D0] overflow-hidden">
                    <div className="px-5 py-4 border-b border-[#D8D8D0] flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-lg bg-[#B2FF59] flex items-center justify-center text-[11px]">👤</div>
                        <span className="text-[12px] font-extrabold text-[#131218] tracking-tight">People Visibility</span>
                      </div>
                    </div>

                    {people.length === 0 ? (
                      <div className="px-6 py-10 text-center">
                        <p className="text-sm text-[#131218]/30">
                          No people records found. Add people to CH People [OS v2] in Notion.
                        </p>
                      </div>
                    ) : (
                      <div className="px-5 divide-y divide-[#EFEFEA]">
                        {/* Header row */}
                        <div className="grid gap-3.5 py-2.5 items-center" style={{ gridTemplateColumns: "1.8fr 1.2fr 1fr 160px" }}>
                          {["Name", "Role", "Location", "Visibility"].map(l => (
                            <span key={l} className="text-[8px] font-bold tracking-[1.8px] uppercase text-[#131218]/22">{l}</span>
                          ))}
                        </div>
                        {people.map(p => (
                          <div
                            key={p.id}
                            className="grid gap-3.5 py-3 items-center"
                            style={{ gridTemplateColumns: "1.8fr 1.2fr 1fr 160px" }}
                          >
                            <div>
                              <div className="text-[13px] font-bold text-[#131218] tracking-tight">{p.name}</div>
                              <div className="text-[10px] text-[#6b6b6b] mt-0.5">{p.jobTitle || "—"}</div>
                            </div>
                            <div className="text-[10.5px] text-[#555]">
                              {p.roles.slice(0, 1).join(", ") || "—"}
                            </div>
                            <div className="text-[10.5px] text-[#555]">{p.location || "—"}</div>
                            <div className="flex gap-1">
                              {VIS_OPTS.map(v => {
                                const isActive = p.visibility === v;
                                const activeCls =
                                  v === "public-safe"
                                    ? "bg-[rgba(200,245,90,0.25)] text-[#3a6600] border-[rgba(200,245,90,0.5)]"
                                    : v === "community"
                                    ? "bg-blue-50 text-blue-700 border-blue-200"
                                    : "bg-[#f3f4f6] text-[#6b7280] border-[#e5e7eb]";
                                return (
                                  <button
                                    key={v}
                                    onClick={() => markPersonVisibility(p.id, v)}
                                    className={`text-[8px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide border transition-all ${
                                      isActive
                                        ? activeCls
                                        : "bg-white text-[#131218]/25 border-[#E0E0D8] hover:border-[#131218]/20"
                                    }`}
                                  >
                                    {v === "public-safe" ? "Public" : v}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* ── Tab: Milestones ── */}
              {tab === "milestones" && (
                <div>
                  <InfoNote>
                    Toggle <strong>Share to Living Room</strong> to surface a project milestone in
                    the community feed. Only items marked <em>Share = Yes</em> appear in Living Room
                    Module C.
                  </InfoNote>

                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
                    <StatPill label="Active Projects" value={milestones.length} sub="In CH Projects OS v2" />
                    <StatPill
                      label="Shared to LR"
                      value={milestones.filter(m => m.shareToLivingRoom).length}
                      sub="Live in community feed"
                      color="lime"
                    />
                    <StatPill
                      label="Not shared"
                      value={milestones.filter(m => !m.shareToLivingRoom).length}
                      sub="Hidden from feed"
                    />
                    <StatPill
                      label="With milestone type"
                      value={milestones.filter(m => m.milestoneType).length}
                      sub="Typed entries"
                    />
                  </div>

                  <div className="bg-white rounded-2xl border border-[#D8D8D0] overflow-hidden">
                    <div className="px-5 py-4 border-b border-[#D8D8D0] flex items-center gap-2">
                      <div className="w-6 h-6 rounded-lg bg-[#B2FF59] flex items-center justify-center text-[11px]">🏆</div>
                      <span className="text-[12px] font-extrabold text-[#131218] tracking-tight">Milestone Curator</span>
                    </div>

                    {milestones.length === 0 ? (
                      <div className="px-6 py-10 text-center">
                        <p className="text-sm text-[#131218]/30">No active projects found.</p>
                      </div>
                    ) : (
                      <div className="px-5 divide-y divide-[#EFEFEA]">
                        {/* Header */}
                        <div className="grid gap-3.5 py-2.5 items-center" style={{ gridTemplateColumns: "2fr 110px 72px 80px" }}>
                          {["Project", "Milestone type", "Share", "Status"].map(l => (
                            <span key={l} className="text-[8px] font-bold tracking-[1.8px] uppercase text-[#131218]/22">{l}</span>
                          ))}
                        </div>
                        {milestones.map(m => (
                          <div
                            key={m.id}
                            className="grid gap-3.5 py-3 items-center"
                            style={{ gridTemplateColumns: "2fr 110px 72px 80px" }}
                          >
                            <div>
                              <div className="text-[13px] font-bold text-[#131218] tracking-tight">{m.name}</div>
                              <div className="flex items-center gap-2 mt-0.5">
                                {m.stage && <span className="text-[10px] text-[#6b6b6b]">{m.stage}</span>}
                                {m.geography.length > 0 && (
                                  <span className="text-[9px] font-bold text-[#131218]/30">
                                    {m.geography.join(", ")}
                                  </span>
                                )}
                              </div>
                            </div>
                            <div>
                              {m.milestoneType ? (
                                <span className="text-[8.5px] font-bold text-[#131218]/40 bg-[#EFEFEA] px-2 py-0.5 rounded-full uppercase tracking-widest">
                                  {m.milestoneType}
                                </span>
                              ) : (
                                <span className="text-[10px] text-[#131218]/20">—</span>
                              )}
                            </div>
                            <div className="flex items-center gap-2">
                              <Toggle
                                checked={!!m.shareToLivingRoom}
                                onChange={() => markMilestoneShare(m.id, !m.shareToLivingRoom)}
                              />
                            </div>
                            <span className={`text-[10px] font-bold ${m.shareToLivingRoom ? "text-[#3a8c00]" : "text-[#131218]/20"}`}>
                              {m.shareToLivingRoom ? "Shared" : "Hidden"}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* ── Tab: Signals ── */}
              {tab === "signals" && (
                <div>
                  <InfoNote>
                    Mark Insight Briefs as <strong>Community Relevant</strong> to surface them in
                    Living Room Module E (Community Signals). Only curated items appear — this is
                    not automated scraping.
                  </InfoNote>

                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
                    <StatPill label="Insight Briefs" value={signals.length} sub="Total in system" />
                    <StatPill
                      label="Community Relevant"
                      value={signals.filter(s => s.communityRelevant).length}
                      sub="Tagged for Living Room"
                      color="lime"
                    />
                    <StatPill
                      label="Showing in LR"
                      value={signals.filter(s => s.communityRelevant && s.visibility !== "private").length}
                      sub="Active in feed"
                    />
                    <StatPill
                      label="Not classified"
                      value={signals.filter(s => !s.communityRelevant).length}
                      sub="Awaiting review"
                      color="amber"
                    />
                  </div>

                  <div className="bg-white rounded-2xl border border-[#D8D8D0] overflow-hidden">
                    <div className="px-5 py-4 border-b border-[#D8D8D0] flex items-center gap-2">
                      <div className="w-6 h-6 rounded-lg bg-blue-100 flex items-center justify-center text-[11px]">📡</div>
                      <span className="text-[12px] font-extrabold text-[#131218] tracking-tight">Signal Curator</span>
                    </div>

                    {signals.length === 0 ? (
                      <div className="px-6 py-10 text-center">
                        <p className="text-sm text-[#131218]/30">No insight briefs found.</p>
                      </div>
                    ) : (
                      <div className="px-5 divide-y divide-[#EFEFEA]">
                        {/* Header */}
                        <div className="grid gap-3.5 py-2.5 items-center" style={{ gridTemplateColumns: "2.2fr 1fr 80px 80px" }}>
                          {["Brief", "Theme", "Community", "Status"].map(l => (
                            <span key={l} className="text-[8px] font-bold tracking-[1.8px] uppercase text-[#131218]/22">{l}</span>
                          ))}
                        </div>
                        {signals.map(s => (
                          <div
                            key={s.id}
                            className="grid gap-3.5 py-3 items-center"
                            style={{ gridTemplateColumns: "2.2fr 1fr 80px 80px" }}
                          >
                            <div>
                              <div className="text-[13px] font-bold text-[#131218] tracking-tight">{s.title}</div>
                              <div className="flex items-center gap-1.5 mt-0.5">
                                <span className="text-[10px] text-[#6b6b6b]">{s.status}</span>
                              </div>
                            </div>
                            <div className="flex flex-wrap gap-1">
                              {s.theme.slice(0, 2).map(t => (
                                <span key={t} className="text-[8.5px] font-bold text-[#131218]/35 bg-[#EFEFEA] px-1.5 py-0.5 rounded-full uppercase tracking-widest">
                                  {t}
                                </span>
                              ))}
                            </div>
                            <div className="flex items-center">
                              <Toggle
                                checked={!!s.communityRelevant}
                                onChange={() => markSignalRelevant(s.id, !s.communityRelevant)}
                              />
                            </div>
                            <span className={`text-[10px] font-bold ${s.communityRelevant ? "text-blue-600" : "text-[#131218]/20"}`}>
                              {s.communityRelevant ? "On" : "Off"}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* ── Tab: Themes ── */}
              {tab === "themes" && (
                <div>
                  <InfoNote>
                    Activate or deactivate themes shown in the Living Room (Module D). Only{" "}
                    <strong>Active</strong> themes surface in the community layer. Set a theme to{" "}
                    <em>Off</em> to hide it without deleting the knowledge asset.
                  </InfoNote>

                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
                    <StatPill label="Knowledge Assets" value={themes.length} sub="Total in system" />
                    <StatPill
                      label="Active Themes"
                      value={themes.filter(t => t.active).length}
                      sub="Shown in Living Room"
                      color="lime"
                    />
                    <StatPill
                      label="Inactive"
                      value={themes.filter(t => !t.active).length}
                      sub="Hidden from feed"
                    />
                    <StatPill
                      label="With category"
                      value={themes.filter(t => t.category).length}
                      sub="Categorised"
                    />
                  </div>

                  <div className="bg-white rounded-2xl border border-[#D8D8D0] overflow-hidden">
                    <div className="px-5 py-4 border-b border-[#D8D8D0] flex items-center gap-2">
                      <div className="w-6 h-6 rounded-lg bg-amber-100 flex items-center justify-center text-[11px]">🌊</div>
                      <span className="text-[12px] font-extrabold text-[#131218] tracking-tight">Theme Curator</span>
                    </div>

                    {themes.length === 0 ? (
                      <div className="px-6 py-10 text-center">
                        <p className="text-sm text-[#131218]/30">No knowledge assets found.</p>
                      </div>
                    ) : (
                      <div className="px-5 divide-y divide-[#EFEFEA]">
                        {/* Header */}
                        <div className="grid gap-3.5 py-2.5 items-center" style={{ gridTemplateColumns: "2fr 1fr 72px 80px" }}>
                          {["Theme", "Category", "Active", "Status"].map(l => (
                            <span key={l} className="text-[8px] font-bold tracking-[1.8px] uppercase text-[#131218]/22">{l}</span>
                          ))}
                        </div>
                        {themes.map(t => (
                          <div
                            key={t.id}
                            className="grid gap-3.5 py-3 items-center"
                            style={{ gridTemplateColumns: "2fr 1fr 72px 80px" }}
                          >
                            <div>
                              <div className="text-[13px] font-bold text-[#131218] tracking-tight">{t.name}</div>
                              {t.assetType && (
                                <div className="text-[10px] text-[#6b6b6b] mt-0.5">{t.assetType}</div>
                              )}
                            </div>
                            <div className="text-[10.5px] text-[#555]">{t.category || "—"}</div>
                            <div className="flex items-center">
                              <Toggle
                                checked={!!t.active}
                                onChange={() => markThemeActive(t.id, !t.active)}
                              />
                            </div>
                            <span className={`text-[10px] font-bold ${t.active ? "text-amber-600" : "text-[#131218]/20"}`}>
                              {t.active ? "Active" : "Off"}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

            </>
          )}
        </div>

        {/* ── Fixed save bar ── */}
        {dirtyCount > 0 && (
          <div className="fixed bottom-7 left-1/2 -translate-x-1/2 z-50">
            <div className="bg-black text-white rounded-xl px-6 py-3.5 flex items-center gap-4 shadow-2xl whitespace-nowrap">
              <span className="text-[12px] font-semibold text-white/60">
                <span className="text-[#B2FF59] font-extrabold">{dirtyCount}</span>{" "}
                unsaved change{dirtyCount !== 1 ? "s" : ""}
              </span>
              {error && <span className="text-xs font-bold text-red-400">{error}</span>}
              <button
                onClick={saveAll}
                disabled={saving}
                className="bg-[#B2FF59] text-black text-xs font-bold px-4 py-2 rounded-lg hover:bg-[#c8f55a] transition-colors disabled:opacity-50"
              >
                {saving ? "Saving…" : "Save to Notion →"}
              </button>
            </div>
          </div>
        )}

        {saved && (
          <div className="fixed bottom-7 left-1/2 -translate-x-1/2 z-50">
            <div className="bg-[#B2FF59] text-black rounded-xl px-6 py-3.5 text-xs font-extrabold shadow-2xl">
              ✓ All changes saved to Notion
            </div>
          </div>
        )}

      </main>
    </div>
  );
}
