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
    <div
      className="flex gap-2.5 items-start px-4 py-3 text-[11px] leading-relaxed mb-6"
      style={{
        background: "var(--hall-warn-paper)",
        border: "1px solid var(--hall-warn)",
        color: "var(--hall-ink-3)",
      }}
    >
      <span className="shrink-0 mt-0.5" style={{ color: "var(--hall-warn)" }}>ℹ</span>
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
  const valColor =
    color === "lime"
      ? "var(--hall-ok)"
      : color === "red"
      ? "var(--hall-danger)"
      : color === "amber"
      ? "var(--hall-warn)"
      : "var(--hall-ink-0)";
  return (
    <div className="p-4" style={{ border: "1px solid var(--hall-line)", background: "var(--hall-paper-0)" }}>
      <div
        className="mb-1.5"
        style={{
          fontFamily: "var(--font-hall-mono)",
          fontSize: 10,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: "var(--hall-muted-2)",
        }}
      >
        {label}
      </div>
      <div className="text-[1.6rem] font-black tracking-tight leading-none" style={{ color: valColor }}>
        {value}
      </div>
      <div style={{ fontFamily: "var(--font-hall-mono)", fontSize: 10, color: "var(--hall-muted-2)", marginTop: 6 }}>
        {sub}
      </div>
    </div>
  );
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <button
      onClick={onChange}
      className="relative inline-flex h-5 w-9 items-center rounded-full transition-colors shrink-0"
      style={{ background: checked ? "var(--hall-ok)" : "var(--hall-muted-3)" }}
      aria-checked={checked}
      role="switch"
    >
      <span
        className={`inline-block h-3.5 w-3.5 transform rounded-full shadow transition-transform ${
          checked ? "translate-x-4" : "translate-x-0.5"
        }`}
        style={{ background: "var(--hall-paper-0)" }}
      />
    </button>
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
    { id: "people",     label: "People Visibility",  emoji: "○", count: people.length },
    { id: "milestones", label: "Milestones",          emoji: "◈", count: milestones.length },
    { id: "signals",    label: "Community Signals",   emoji: "◎", count: signals.length },
    { id: "themes",     label: "Themes in Motion",    emoji: "◦", count: themes.length },
  ];

  const VIS_OPTS = ["public-safe", "community", "private"] as const;

  const todayLabel = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

  return (
    <div className="flex min-h-screen" style={{ background: "var(--hall-paper-0)" }}>
      <Sidebar adminNav />

      <main
        className="flex-1 ml-[228px] overflow-auto flex flex-col"
        style={{ fontFamily: "var(--font-hall-sans)", background: "var(--hall-paper-0)" }}
      >

        {/* K-v2 thin header */}
        <header
          className="flex items-center justify-between gap-6 px-9 py-3.5 flex-shrink-0"
          style={{ borderBottom: "1px solid var(--hall-ink-0)" }}
        >
          <div className="flex items-baseline gap-4 min-w-0">
            <span
              className="text-[10px] tracking-[0.08em] whitespace-nowrap"
              style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted-2)" }}
            >
              LIVING ROOM · EDITORIAL CURATOR ·{" "}
              <b style={{ color: "var(--hall-ink-0)" }}>{todayLabel}</b>
            </span>
            <h1
              className="text-[16px] font-medium tracking-[-0.01em]"
              style={{ color: "var(--hall-ink-0)" }}
            >
              Curate the{" "}
              <em
                style={{
                  fontFamily: "var(--font-hall-display)",
                  fontStyle: "italic",
                  fontWeight: 400,
                  color: "var(--hall-ink-0)",
                }}
              >
                community
              </em>
              {" "}layer
            </h1>
          </div>
          <div className="flex gap-2 flex-wrap items-center">
            <a
              href="/living-room"
              className="hall-btn-outline"
              style={{ padding: "6px 12px", fontSize: 12 }}
            >
              ↗ Preview Living Room
            </a>
            {dirtyCount > 0 && (
              <button
                onClick={saveAll}
                disabled={saving}
                className="hall-btn-primary disabled:opacity-50"
                style={{ padding: "6px 12px", fontSize: 12 }}
              >
                {saving ? "Saving…" : "Save all changes"}
              </button>
            )}
          </div>
        </header>

        {/* ── Tab bar ── */}
        <div
          className="flex gap-0 flex-shrink-0"
          style={{ padding: "0 36px", borderBottom: "1px solid var(--hall-line)" }}
        >
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className="px-5 py-4 text-[11.5px] font-semibold border-b-2 transition-colors whitespace-nowrap"
              style={{
                color: tab === t.id ? "var(--hall-ink-0)" : "var(--hall-muted-2)",
                borderBottomColor: tab === t.id ? "var(--hall-ink-0)" : "transparent",
              }}
            >
              {t.emoji} {t.label}
              <span
                className="ml-1.5 px-1.5 py-0.5 rounded-full font-bold"
                style={{
                  fontFamily: "var(--font-hall-mono)",
                  fontSize: 9,
                  background: "var(--hall-fill-soft)",
                  color: tab === t.id ? "var(--hall-ink-0)" : "var(--hall-muted-3)",
                }}
              >
                {t.count}
              </span>
            </button>
          ))}
        </div>

        {/* ── Content ── */}
        <div className="flex-1" style={{ padding: "28px 36px 60px" }}>
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <p className="text-sm" style={{ color: "var(--hall-muted-3)" }}>Loading from Notion…</p>
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

                  <section>
                    <div
                      className="flex items-baseline justify-between gap-3 pb-2 mb-3.5"
                      style={{ borderBottom: "1px solid var(--hall-ink-0)" }}
                    >
                      <h2
                        className="text-[19px] font-bold leading-none"
                        style={{ letterSpacing: "-0.02em", color: "var(--hall-ink-0)" }}
                      >
                        People{" "}
                        <em
                          style={{
                            fontFamily: "var(--font-hall-display)",
                            fontStyle: "italic",
                            fontWeight: 400,
                            color: "var(--hall-ink-0)",
                          }}
                        >
                          visibility
                        </em>
                      </h2>
                    </div>

                    {people.length === 0 ? (
                      <div className="px-6 py-10 text-center">
                        <p className="text-sm" style={{ color: "var(--hall-muted-3)" }}>
                          No people records found. Add people to CH People [OS v2] in Notion.
                        </p>
                      </div>
                    ) : (
                      <div>
                        {/* Header row */}
                        <div
                          className="grid gap-3.5 py-2.5 items-center"
                          style={{ gridTemplateColumns: "1.8fr 1.2fr 1fr 160px", borderBottom: "1px solid var(--hall-line)" }}
                        >
                          {["Name", "Role", "Location", "Visibility"].map(l => (
                            <span
                              key={l}
                              style={{
                                fontFamily: "var(--font-hall-mono)",
                                fontSize: 10,
                                letterSpacing: "0.08em",
                                textTransform: "uppercase",
                                color: "var(--hall-muted-2)",
                              }}
                            >
                              {l}
                            </span>
                          ))}
                        </div>
                        {people.map(p => (
                          <div
                            key={p.id}
                            className="grid gap-3.5 py-3 items-center"
                            style={{ gridTemplateColumns: "1.8fr 1.2fr 1fr 160px", borderTop: "1px solid var(--hall-line-soft)" }}
                          >
                            <div>
                              <div className="text-[13px] font-bold tracking-tight" style={{ color: "var(--hall-ink-0)" }}>{p.name}</div>
                              <div className="mt-0.5" style={{ fontFamily: "var(--font-hall-mono)", fontSize: 10, color: "var(--hall-muted-2)" }}>
                                {p.jobTitle || "—"}
                              </div>
                            </div>
                            <div style={{ fontSize: 10.5, color: "var(--hall-ink-3)" }}>
                              {p.roles.slice(0, 1).join(", ") || "—"}
                            </div>
                            <div style={{ fontSize: 10.5, color: "var(--hall-ink-3)" }}>{p.location || "—"}</div>
                            <div className="flex gap-1">
                              {VIS_OPTS.map(v => {
                                const isActive = p.visibility === v;
                                const activeStyle =
                                  v === "public-safe"
                                    ? { background: "var(--hall-ok-soft)", color: "var(--hall-ok)", borderColor: "var(--hall-ok)" }
                                    : v === "community"
                                    ? { background: "var(--hall-info-soft)", color: "var(--hall-info)", borderColor: "var(--hall-info)" }
                                    : { background: "var(--hall-fill-soft)", color: "var(--hall-muted-3)", borderColor: "var(--hall-line)" };
                                const inactiveStyle = {
                                  background: "var(--hall-paper-0)",
                                  color: "var(--hall-muted-3)",
                                  borderColor: "var(--hall-line)",
                                };
                                return (
                                  <button
                                    key={v}
                                    onClick={() => markPersonVisibility(p.id, v)}
                                    className="rounded-full border transition-all"
                                    style={{
                                      fontFamily: "var(--font-hall-mono)",
                                      fontSize: 9,
                                      fontWeight: 700,
                                      letterSpacing: "0.06em",
                                      textTransform: "uppercase",
                                      padding: "2px 8px",
                                      ...(isActive ? activeStyle : inactiveStyle),
                                    }}
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
                  </section>
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

                  <section>
                    <div
                      className="flex items-baseline justify-between gap-3 pb-2 mb-3.5"
                      style={{ borderBottom: "1px solid var(--hall-ink-0)" }}
                    >
                      <h2
                        className="text-[19px] font-bold leading-none"
                        style={{ letterSpacing: "-0.02em", color: "var(--hall-ink-0)" }}
                      >
                        Milestone{" "}
                        <em
                          style={{
                            fontFamily: "var(--font-hall-display)",
                            fontStyle: "italic",
                            fontWeight: 400,
                            color: "var(--hall-ink-0)",
                          }}
                        >
                          curator
                        </em>
                      </h2>
                    </div>

                    {milestones.length === 0 ? (
                      <div className="px-6 py-10 text-center">
                        <p className="text-sm" style={{ color: "var(--hall-muted-3)" }}>No active projects found.</p>
                      </div>
                    ) : (
                      <div>
                        {/* Header */}
                        <div
                          className="grid gap-3.5 py-2.5 items-center"
                          style={{ gridTemplateColumns: "2fr 110px 72px 80px", borderBottom: "1px solid var(--hall-line)" }}
                        >
                          {["Project", "Milestone type", "Share", "Status"].map(l => (
                            <span
                              key={l}
                              style={{
                                fontFamily: "var(--font-hall-mono)",
                                fontSize: 10,
                                letterSpacing: "0.08em",
                                textTransform: "uppercase",
                                color: "var(--hall-muted-2)",
                              }}
                            >
                              {l}
                            </span>
                          ))}
                        </div>
                        {milestones.map(m => (
                          <div
                            key={m.id}
                            className="grid gap-3.5 py-3 items-center"
                            style={{ gridTemplateColumns: "2fr 110px 72px 80px", borderTop: "1px solid var(--hall-line-soft)" }}
                          >
                            <div>
                              <div className="text-[13px] font-bold tracking-tight" style={{ color: "var(--hall-ink-0)" }}>{m.name}</div>
                              <div className="flex items-center gap-2 mt-0.5">
                                {m.stage && <span style={{ fontFamily: "var(--font-hall-mono)", fontSize: 10, color: "var(--hall-muted-2)" }}>{m.stage}</span>}
                                {m.geography.length > 0 && (
                                  <span
                                    style={{
                                      fontFamily: "var(--font-hall-mono)",
                                      fontSize: 9.5,
                                      fontWeight: 700,
                                      color: "var(--hall-muted-3)",
                                    }}
                                  >
                                    {m.geography.join(", ")}
                                  </span>
                                )}
                              </div>
                            </div>
                            <div>
                              {m.milestoneType ? (
                                <span
                                  className="px-2 py-0.5 rounded-full"
                                  style={{
                                    fontFamily: "var(--font-hall-mono)",
                                    fontSize: 9.5,
                                    fontWeight: 700,
                                    background: "var(--hall-fill-soft)",
                                    color: "var(--hall-muted-2)",
                                    letterSpacing: "0.06em",
                                    textTransform: "uppercase",
                                  }}
                                >
                                  {m.milestoneType}
                                </span>
                              ) : (
                                <span style={{ fontSize: 10, color: "var(--hall-muted-3)" }}>—</span>
                              )}
                            </div>
                            <div className="flex items-center gap-2">
                              <Toggle
                                checked={!!m.shareToLivingRoom}
                                onChange={() => markMilestoneShare(m.id, !m.shareToLivingRoom)}
                              />
                            </div>
                            <span
                              style={{
                                fontFamily: "var(--font-hall-mono)",
                                fontSize: 10,
                                fontWeight: 700,
                                color: m.shareToLivingRoom ? "var(--hall-ok)" : "var(--hall-muted-3)",
                              }}
                            >
                              {m.shareToLivingRoom ? "Shared" : "Hidden"}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </section>
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

                  <section>
                    <div
                      className="flex items-baseline justify-between gap-3 pb-2 mb-3.5"
                      style={{ borderBottom: "1px solid var(--hall-ink-0)" }}
                    >
                      <h2
                        className="text-[19px] font-bold leading-none"
                        style={{ letterSpacing: "-0.02em", color: "var(--hall-ink-0)" }}
                      >
                        Signal{" "}
                        <em
                          style={{
                            fontFamily: "var(--font-hall-display)",
                            fontStyle: "italic",
                            fontWeight: 400,
                            color: "var(--hall-ink-0)",
                          }}
                        >
                          curator
                        </em>
                      </h2>
                    </div>

                    {signals.length === 0 ? (
                      <div className="px-6 py-10 text-center">
                        <p className="text-sm" style={{ color: "var(--hall-muted-3)" }}>No insight briefs found.</p>
                      </div>
                    ) : (
                      <div>
                        {/* Header */}
                        <div
                          className="grid gap-3.5 py-2.5 items-center"
                          style={{ gridTemplateColumns: "2.2fr 1fr 80px 80px", borderBottom: "1px solid var(--hall-line)" }}
                        >
                          {["Brief", "Theme", "Community", "Status"].map(l => (
                            <span
                              key={l}
                              style={{
                                fontFamily: "var(--font-hall-mono)",
                                fontSize: 10,
                                letterSpacing: "0.08em",
                                textTransform: "uppercase",
                                color: "var(--hall-muted-2)",
                              }}
                            >
                              {l}
                            </span>
                          ))}
                        </div>
                        {signals.map(s => (
                          <div
                            key={s.id}
                            className="grid gap-3.5 py-3 items-center"
                            style={{ gridTemplateColumns: "2.2fr 1fr 80px 80px", borderTop: "1px solid var(--hall-line-soft)" }}
                          >
                            <div>
                              <div className="text-[13px] font-bold tracking-tight" style={{ color: "var(--hall-ink-0)" }}>{s.title}</div>
                              <div className="flex items-center gap-1.5 mt-0.5">
                                <span style={{ fontFamily: "var(--font-hall-mono)", fontSize: 10, color: "var(--hall-muted-2)" }}>
                                  {s.status}
                                </span>
                              </div>
                            </div>
                            <div className="flex flex-wrap gap-1">
                              {s.theme.slice(0, 2).map(t => (
                                <span
                                  key={t}
                                  className="px-1.5 py-0.5 rounded-full"
                                  style={{
                                    fontFamily: "var(--font-hall-mono)",
                                    fontSize: 9.5,
                                    fontWeight: 700,
                                    color: "var(--hall-muted-3)",
                                    background: "var(--hall-fill-soft)",
                                    letterSpacing: "0.06em",
                                    textTransform: "uppercase",
                                  }}
                                >
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
                            <span
                              style={{
                                fontFamily: "var(--font-hall-mono)",
                                fontSize: 10,
                                fontWeight: 700,
                                color: s.communityRelevant ? "var(--hall-info)" : "var(--hall-muted-3)",
                              }}
                            >
                              {s.communityRelevant ? "On" : "Off"}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </section>
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

                  <section>
                    <div
                      className="flex items-baseline justify-between gap-3 pb-2 mb-3.5"
                      style={{ borderBottom: "1px solid var(--hall-ink-0)" }}
                    >
                      <h2
                        className="text-[19px] font-bold leading-none"
                        style={{ letterSpacing: "-0.02em", color: "var(--hall-ink-0)" }}
                      >
                        Theme{" "}
                        <em
                          style={{
                            fontFamily: "var(--font-hall-display)",
                            fontStyle: "italic",
                            fontWeight: 400,
                            color: "var(--hall-ink-0)",
                          }}
                        >
                          curator
                        </em>
                      </h2>
                    </div>

                    {themes.length === 0 ? (
                      <div className="px-6 py-10 text-center">
                        <p className="text-sm" style={{ color: "var(--hall-muted-3)" }}>No knowledge assets found.</p>
                      </div>
                    ) : (
                      <div>
                        {/* Header */}
                        <div
                          className="grid gap-3.5 py-2.5 items-center"
                          style={{ gridTemplateColumns: "2fr 1fr 72px 80px", borderBottom: "1px solid var(--hall-line)" }}
                        >
                          {["Theme", "Category", "Active", "Status"].map(l => (
                            <span
                              key={l}
                              style={{
                                fontFamily: "var(--font-hall-mono)",
                                fontSize: 10,
                                letterSpacing: "0.08em",
                                textTransform: "uppercase",
                                color: "var(--hall-muted-2)",
                              }}
                            >
                              {l}
                            </span>
                          ))}
                        </div>
                        {themes.map(t => (
                          <div
                            key={t.id}
                            className="grid gap-3.5 py-3 items-center"
                            style={{ gridTemplateColumns: "2fr 1fr 72px 80px", borderTop: "1px solid var(--hall-line-soft)" }}
                          >
                            <div>
                              <div className="text-[13px] font-bold tracking-tight" style={{ color: "var(--hall-ink-0)" }}>{t.name}</div>
                              {t.assetType && (
                                <div className="mt-0.5" style={{ fontFamily: "var(--font-hall-mono)", fontSize: 10, color: "var(--hall-muted-2)" }}>
                                  {t.assetType}
                                </div>
                              )}
                            </div>
                            <div style={{ fontSize: 10.5, color: "var(--hall-ink-3)" }}>{t.category || "—"}</div>
                            <div className="flex items-center">
                              <Toggle
                                checked={!!t.active}
                                onChange={() => markThemeActive(t.id, !t.active)}
                              />
                            </div>
                            <span
                              style={{
                                fontFamily: "var(--font-hall-mono)",
                                fontSize: 10,
                                fontWeight: 700,
                                color: t.active ? "var(--hall-warn)" : "var(--hall-muted-3)",
                              }}
                            >
                              {t.active ? "Active" : "Off"}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </section>
                </div>
              )}

            </>
          )}
        </div>

        {/* ── Fixed save bar ── */}
        {dirtyCount > 0 && (
          <div className="fixed bottom-7 left-1/2 -translate-x-1/2 z-50">
            <div
              className="px-6 py-3.5 flex items-center gap-4 whitespace-nowrap"
              style={{
                background: "var(--hall-ink-0)",
                color: "var(--hall-paper-0)",
                border: "1px solid var(--hall-ink-0)",
              }}
            >
              <span className="text-[12px] font-semibold" style={{ color: "var(--hall-muted-3)" }}>
                <b style={{ color: "var(--hall-paper-0)" }}>{dirtyCount}</b>{" "}
                unsaved change{dirtyCount !== 1 ? "s" : ""}
              </span>
              {error && <span className="text-xs font-bold" style={{ color: "var(--hall-danger)" }}>{error}</span>}
              <button
                onClick={saveAll}
                disabled={saving}
                className="disabled:opacity-50"
                style={{
                  background: "var(--hall-paper-0)",
                  color: "var(--hall-ink-0)",
                  fontSize: 12,
                  fontWeight: 700,
                  padding: "6px 14px",
                  borderRadius: 3,
                }}
              >
                {saving ? "Saving…" : "Save to Notion →"}
              </button>
            </div>
          </div>
        )}

        {saved && (
          <div className="fixed bottom-7 left-1/2 -translate-x-1/2 z-50">
            <div
              className="px-6 py-3.5 text-xs font-extrabold"
              style={{
                background: "var(--hall-ok-soft)",
                color: "var(--hall-ok)",
                border: "1px solid var(--hall-ok)",
              }}
            >
              ✓ All changes saved to Notion
            </div>
          </div>
        )}

      </main>
    </div>
  );
}
