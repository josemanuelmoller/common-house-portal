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

function CHIsotipo({ size = 16, className }: { size?: number; className?: string }) {
  return (
    <svg width={size * 2} height={size} viewBox="0 0 120 60" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      <path d="M46 8 C26 8 12 18 12 30 C12 42 26 52 46 52" stroke="currentColor" strokeWidth="9" strokeLinecap="round" />
      <circle cx="85" cy="30" r="20" stroke="currentColor" strokeWidth="9" />
    </svg>
  );
}

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

  const TABS: { id: Tab; label: string; count: number }[] = [
    { id: "people",     label: "People Visibility",  count: people.length },
    { id: "milestones", label: "Milestones",          count: milestones.length },
    { id: "signals",    label: "Signals",             count: signals.length },
    { id: "themes",     label: "Themes in Motion",    count: themes.length },
  ];

  const VIS_OPTS = ["public-safe", "community", "private"] as const;
  const VIS_COLORS: Record<string, string> = {
    "public-safe": "bg-[#B2FF59] text-[#131218]",
    "community":   "bg-blue-100 text-blue-700",
    "private":     "bg-[#EFEFEA] text-[#131218]/40",
  };

  return (
    <div className="flex min-h-screen bg-[#EFEFEA]">
      <Sidebar items={ADMIN_NAV} isAdmin />

      <main className="flex-1 overflow-auto">

        {/* Header */}
        <div className="bg-white border-b border-[#E0E0D8] px-8 py-6">
          <div className="flex items-end justify-between">
            <div>
              <div className="flex items-center gap-3 mb-3">
                <CHIsotipo size={14} className="text-[#131218]" />
                <p className="text-[10px] font-bold text-[#131218]/25 uppercase tracking-widest">
                  Control Room · Living Room
                </p>
              </div>
              <h1 className="text-2xl font-bold text-[#131218] tracking-tight">Living Room — Curation</h1>
              <p className="text-xs text-[#131218]/40 font-medium mt-1">
                Control what the community sees. Changes write directly to Notion.
              </p>
            </div>
            <a
              href="/living-room"
              className="text-[10px] font-bold text-[#131218]/30 bg-[#EFEFEA] hover:bg-[#E0E0D8] border border-[#E0E0D8] px-3 py-2 rounded-xl uppercase tracking-widest transition-colors"
            >
              Preview →
            </a>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 mt-5">
            {TABS.map(t => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                  tab === t.id
                    ? "bg-[#131218] text-white"
                    : "text-[#131218]/40 hover:text-[#131218]/80 hover:bg-[#EFEFEA]"
                }`}
              >
                {t.label}
                <span className={`ml-1.5 text-[9px] px-1.5 py-0.5 rounded-full ${
                  tab === t.id ? "bg-white/20 text-white" : "bg-[#EFEFEA] text-[#131218]/30"
                }`}>{t.count}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="px-8 py-6">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <p className="text-sm text-[#131218]/30 font-medium">Loading from Notion…</p>
            </div>
          ) : (
            <>
              {/* Tab: People Visibility */}
              {tab === "people" && (
                <div className="bg-white rounded-2xl border border-[#E0E0D8] overflow-hidden">
                  <div className="h-1 bg-[#131218]" />
                  <div className="px-6 py-4 border-b border-[#EFEFEA]">
                    <p className="text-[10px] font-bold text-[#131218]/30 uppercase tracking-widest">People visibility</p>
                    <p className="text-sm font-bold text-[#131218] mt-0.5">Choose who appears in the Living Room</p>
                  </div>
                  {people.length === 0 ? (
                    <div className="px-6 py-8 text-center">
                      <p className="text-sm text-[#131218]/30">No people records found. Add people to CH People [OS v2] in Notion.</p>
                    </div>
                  ) : (
                    <div className="divide-y divide-[#EFEFEA]">
                      {people.map(p => (
                        <div key={p.id} className="flex items-center gap-4 px-6 py-3.5">
                          <div className="w-8 h-8 rounded-lg bg-[#EFEFEA] flex items-center justify-center text-[10px] font-bold text-[#131218]/40 shrink-0">
                            {p.name.slice(0, 2).toUpperCase()}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-[#131218] truncate">{p.name}</p>
                            <p className="text-[11px] text-[#131218]/30 font-medium truncate">{p.jobTitle || "—"}</p>
                          </div>
                          <div className="flex gap-1.5">
                            {VIS_OPTS.map(v => (
                              <button
                                key={v}
                                onClick={() => markPersonVisibility(p.id, v)}
                                className={`text-[9px] font-bold px-2.5 py-1 rounded-full uppercase tracking-widest transition-all border ${
                                  p.visibility === v
                                    ? `${VIS_COLORS[v]} border-transparent`
                                    : "bg-white text-[#131218]/25 border-[#E0E0D8] hover:border-[#131218]/20"
                                }`}
                              >
                                {v}
                              </button>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Tab: Milestones */}
              {tab === "milestones" && (
                <div className="bg-white rounded-2xl border border-[#E0E0D8] overflow-hidden">
                  <div className="h-1 bg-[#B2FF59]" />
                  <div className="px-6 py-4 border-b border-[#EFEFEA]">
                    <p className="text-[10px] font-bold text-[#131218]/30 uppercase tracking-widest">Project milestones</p>
                    <p className="text-sm font-bold text-[#131218] mt-0.5">Toggle which projects share to the Living Room</p>
                  </div>
                  {milestones.length === 0 ? (
                    <div className="px-6 py-8 text-center">
                      <p className="text-sm text-[#131218]/30">No active projects found.</p>
                    </div>
                  ) : (
                    <div className="divide-y divide-[#EFEFEA]">
                      {milestones.map(m => (
                        <div key={m.id} className="flex items-center gap-4 px-6 py-3.5">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-[#131218] truncate">{m.name}</p>
                            <div className="flex items-center gap-2 mt-0.5">
                              {m.stage && <span className="text-[10px] text-[#131218]/30 font-medium">{m.stage}</span>}
                              {m.milestoneType && (
                                <span className="text-[9px] font-bold text-[#131218]/40 bg-[#EFEFEA] px-1.5 py-0.5 rounded-full uppercase tracking-widest">
                                  {m.milestoneType}
                                </span>
                              )}
                            </div>
                          </div>
                          <button
                            onClick={() => markMilestoneShare(m.id, !m.shareToLivingRoom)}
                            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                              m.shareToLivingRoom ? "bg-[#B2FF59]" : "bg-[#E0E0D8]"
                            }`}
                          >
                            <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
                              m.shareToLivingRoom ? "translate-x-4" : "translate-x-0.5"
                            }`} />
                          </button>
                          <span className={`text-[10px] font-bold w-10 ${m.shareToLivingRoom ? "text-[#131218]" : "text-[#131218]/20"}`}>
                            {m.shareToLivingRoom ? "Shared" : "Hidden"}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Tab: Signals */}
              {tab === "signals" && (
                <div className="bg-white rounded-2xl border border-[#E0E0D8] overflow-hidden">
                  <div className="h-1 bg-blue-400" />
                  <div className="px-6 py-4 border-b border-[#EFEFEA]">
                    <p className="text-[10px] font-bold text-[#131218]/30 uppercase tracking-widest">Insight briefs</p>
                    <p className="text-sm font-bold text-[#131218] mt-0.5">Toggle which briefs appear as community signals</p>
                  </div>
                  {signals.length === 0 ? (
                    <div className="px-6 py-8 text-center">
                      <p className="text-sm text-[#131218]/30">No insight briefs found.</p>
                    </div>
                  ) : (
                    <div className="divide-y divide-[#EFEFEA]">
                      {signals.map(s => (
                        <div key={s.id} className="flex items-center gap-4 px-6 py-3.5">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-[#131218] truncate">{s.title}</p>
                            <div className="flex items-center gap-2 mt-0.5">
                              {s.theme.slice(0, 2).map(t => (
                                <span key={t} className="text-[9px] font-bold text-[#131218]/35 bg-[#EFEFEA] px-1.5 py-0.5 rounded-full uppercase tracking-widest">
                                  {t}
                                </span>
                              ))}
                              <span className="text-[10px] text-[#131218]/25 font-medium">{s.status}</span>
                            </div>
                          </div>
                          <button
                            onClick={() => markSignalRelevant(s.id, !s.communityRelevant)}
                            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                              s.communityRelevant ? "bg-blue-400" : "bg-[#E0E0D8]"
                            }`}
                          >
                            <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
                              s.communityRelevant ? "translate-x-4" : "translate-x-0.5"
                            }`} />
                          </button>
                          <span className={`text-[10px] font-bold w-10 ${s.communityRelevant ? "text-blue-600" : "text-[#131218]/20"}`}>
                            {s.communityRelevant ? "On" : "Off"}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Tab: Themes */}
              {tab === "themes" && (
                <div className="bg-white rounded-2xl border border-[#E0E0D8] overflow-hidden">
                  <div className="h-1 bg-amber-400" />
                  <div className="px-6 py-4 border-b border-[#EFEFEA]">
                    <p className="text-[10px] font-bold text-[#131218]/30 uppercase tracking-widest">Knowledge assets</p>
                    <p className="text-sm font-bold text-[#131218] mt-0.5">Activate or deactivate themes shown in the Living Room</p>
                  </div>
                  {themes.length === 0 ? (
                    <div className="px-6 py-8 text-center">
                      <p className="text-sm text-[#131218]/30">No knowledge assets found.</p>
                    </div>
                  ) : (
                    <div className="divide-y divide-[#EFEFEA]">
                      {themes.map(t => (
                        <div key={t.id} className="flex items-center gap-4 px-6 py-3.5">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-[#131218] truncate">{t.name}</p>
                            <p className="text-[11px] text-[#131218]/30 font-medium mt-0.5">{t.category || t.assetType || "—"}</p>
                          </div>
                          <button
                            onClick={() => markThemeActive(t.id, !t.active)}
                            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                              t.active ? "bg-amber-400" : "bg-[#E0E0D8]"
                            }`}
                          >
                            <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
                              t.active ? "translate-x-4" : "translate-x-0.5"
                            }`} />
                          </button>
                          <span className={`text-[10px] font-bold w-10 ${t.active ? "text-amber-600" : "text-[#131218]/20"}`}>
                            {t.active ? "Active" : "Off"}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* Fixed save bar */}
        {dirtyCount > 0 && (
          <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50">
            <div className="bg-[#131218] text-white rounded-2xl px-6 py-3.5 flex items-center gap-4 shadow-2xl">
              <span className="text-xs font-medium text-white/60">
                {dirtyCount} unsaved change{dirtyCount !== 1 ? "s" : ""}
              </span>
              {error && <span className="text-xs font-bold text-red-400">{error}</span>}
              <button
                onClick={saveAll}
                disabled={saving}
                className="bg-[#B2FF59] text-[#131218] text-xs font-bold px-4 py-2 rounded-xl hover:bg-[#c8ff7a] transition-colors disabled:opacity-50"
              >
                {saving ? "Saving…" : "Save to Notion →"}
              </button>
            </div>
          </div>
        )}

        {saved && (
          <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50">
            <div className="bg-[#B2FF59] text-[#131218] rounded-2xl px-6 py-3.5 text-xs font-bold shadow-2xl">
              ✓ All changes saved to Notion
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
