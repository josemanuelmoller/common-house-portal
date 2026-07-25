"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import Link from "next/link";
import { UserButton } from "@clerk/nextjs";

/**
 * "Mi escritorio" — vista cross-sala, calcada de room-full.html (panel data-p="desk").
 * Cuatro bloques: hero, gantt consolidado de deadlines (todas las salas), bandeja
 * "la IA propone" (expandible, con la cita de origen) y grid Tus tareas /
 * Tus entregables. Vive dentro del mismo shell que las salas.
 */

export type DeskRoom = { id: string; name: string; slug: string | null; stage: string | null; open: number; blocked: number };
export type DeskDeadline = { id: string; title: string; due: string; roomId: string; kind: "tarea" | "entregable"; status: string; progress: number | null };
export type DeskProposal = { id: string; summary: string | null; rationale: string | null; itemType: string | null; roomId: string; sourceRefs: string[] | null; createdAt: string };
export type DeskTask = { id: string; title: string; due: string | null; roomId: string; status: string };
export type DeskDeliverable = { id: string; title: string; status: string; progress: number; roomId: string; owned: boolean };

type Props = {
  userName: string;
  todayISO: string;
  rooms: DeskRoom[];
  deadlines: DeskDeadline[];
  proposals: DeskProposal[];
  myTasks: DeskTask[];
  myDeliverables: DeskDeliverable[];
  canConfirm: boolean;
};

const FONT_SANS = `-apple-system, "Inter", "Segoe UI", Roboto, system-ui, sans-serif`;

const C = {
  ink: "#0e0e0e", paper: "#ffffff", paper2: "#ecece4", bg: "#eeeee8",
  line: "#d8d8d0", muted: "#6b6b6b", muted2: "#4a4a44",
  lime: "#c8f55a", limePaper: "rgba(200,245,90,.32)", limeInk: "#3a8c00",
  ok: "#166534", okSoft: "#dcfce7", warn: "#b45309", warnSoft: "#fff3cd",
  cold: "#c0392b", mine: "#4258c9",
};

/* tonos por sala — calcados de .pr-mps / .pr-oce / .pr-int y sus barras */
const ROOM_TONES = [
  { chipBg: "rgba(0,0,0,.08)", chipFg: "#555", barBg: "#dfe3ea", barFg: "#3c4552" },
  { chipBg: "#dcfce7", chipFg: "#166534", barBg: "#d3edda", barFg: "#1c5a37" },
  { chipBg: "#ede9fe", chipFg: "#6d28d9", barBg: "#e6ddf7", barFg: "#5b3a9e" },
  { chipBg: "rgba(200,245,90,.35)", chipFg: "#3a6b00", barBg: "#e4f7bb", barFg: "#3a6b00" },
  { chipBg: "#e0f2fe", chipFg: "#075985", barBg: "#d6ecf9", barFg: "#075985" },
];
const URGENT = { barBg: "#fadbd8", barFg: "#9b2c26" };

const label: CSSProperties = { fontSize: 9, fontWeight: 700, letterSpacing: "1.5px", textTransform: "uppercase", color: C.muted };

function shortRoom(name: string): string {
  const clean = name.replace(/^\[[^\]]*\]\s*/, "").replace(/\s*[-—]\s*Fase.*$/i, "").trim();
  const words = clean.split(/\s+/).filter((w) => w.length > 2);
  if (words.length === 1) return words[0].slice(0, 6).toUpperCase();
  return words.slice(0, 2).map((w) => w[0]).join("").toUpperCase() + (words[1] ? words[1].slice(1, 3).toUpperCase() : "");
}
function fmtDay(iso: string, lang: string): string {
  const d = new Date(iso.length <= 10 ? iso + "T00:00:00" : iso);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleDateString(lang === "es" ? "es-ES" : "en-GB", { day: "numeric", month: "short" });
}
function proposalKind(itemType: string | null, lang: string): { label: string; bg: string; fg: string } {
  const it = (itemType ?? "").toLowerCase();
  if (it.includes("decision")) return { label: lang === "es" ? "+ Decisión" : "+ Decision", bg: C.warnSoft, fg: C.warn };
  if (it.includes("status") || it.includes("state")) return { label: lang === "es" ? "↑ Estado" : "↑ Status", bg: "#e0f2fe", fg: "#075985" };
  if (it.includes("task")) return { label: lang === "es" ? "+ Tarea" : "+ Task", bg: C.limePaper, fg: C.limeInk };
  return { label: lang === "es" ? "Sugerencia" : "Suggestion", bg: C.paper2, fg: C.muted2 };
}

export function DeskClient({ userName, todayISO, rooms, deadlines, proposals, myTasks, myDeliverables, canConfirm }: Props) {
  const [lang, setLang] = useState<"es" | "en">("es");
  const [collapsed, setCollapsed] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [expandedProp, setExpandedProp] = useState<string | null>(null);
  const [resolved, setResolved] = useState<Record<string, "accepted" | "rejected">>({});
  const [busy, setBusy] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    try { setCollapsed(window.localStorage.getItem("room.sidebar.collapsed") === "1"); } catch {}
    try { const s = window.localStorage.getItem("desk.lang"); if (s === "es" || s === "en") setLang(s); } catch {}
    const mq = () => setIsMobile(window.innerWidth < 900);
    mq(); window.addEventListener("resize", mq);
    return () => window.removeEventListener("resize", mq);
  }, []);
  function switchLang(l: "es" | "en") { setLang(l); try { window.localStorage.setItem("desk.lang", l); } catch {} }

  const toneOf = useMemo(() => {
    const m = new Map<string, typeof ROOM_TONES[number]>();
    rooms.forEach((r, i) => m.set(r.id, ROOM_TONES[i % ROOM_TONES.length]));
    return m;
  }, [rooms]);
  const roomName = useMemo(() => Object.fromEntries(rooms.map((r) => [r.id, r.name])), [rooms]);
  const roomShort = useMemo(() => Object.fromEntries(rooms.map((r) => [r.id, shortRoom(r.name)])), [rooms]);

  const pending = proposals.filter((p) => !resolved[p.id]);

  /* gantt consolidado: ventana de meses centrada en hoy, scrolleable */
  const MONTH_W = 118, NAME_W = 180;
  const gantt = useMemo(() => {
    const today = new Date(todayISO + "T00:00:00Z").getTime();
    const dues = deadlines.map((d) => new Date(d.due + "T00:00:00Z").getTime()).filter((n) => !isNaN(n));
    const minD = dues.length ? Math.min(...dues, today) : today;
    const maxD = dues.length ? Math.max(...dues, today) : today;
    const start = new Date(minD); start.setUTCDate(1); start.setUTCMonth(start.getUTCMonth() - 1);
    const end = new Date(maxD); end.setUTCDate(1); end.setUTCMonth(end.getUTCMonth() + 2);
    const months: { label: string; year: number }[] = [];
    const cur = new Date(start);
    while (cur.getTime() < end.getTime() && months.length < 40) {
      months.push({ label: cur.toLocaleDateString(lang === "es" ? "es-ES" : "en-GB", { month: "short", timeZone: "UTC" }), year: cur.getUTCFullYear() });
      cur.setUTCMonth(cur.getUTCMonth() + 1);
    }
    const s0 = start.getTime(), span = Math.max(1, end.getTime() - s0);
    const totalW = months.length * MONTH_W;
    const xOf = (ms: number) => Math.round(((ms - s0) / span) * totalW);
    return { months, totalW, xOf, todayX: xOf(today), startMs: s0 };
  }, [deadlines, todayISO, lang]);

  /* centrar el scroll en HOY al montar */
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollLeft = Math.max(0, gantt.todayX - el.clientWidth / 2);
  }, [gantt.todayX]);

  /* deadlines agrupados por sala (una fila por sala, como la maqueta) */
  const rowsByRoom = useMemo(() => {
    const m = new Map<string, DeskDeadline[]>();
    deadlines.forEach((d) => { if (!m.has(d.roomId)) m.set(d.roomId, []); m.get(d.roomId)!.push(d); });
    return [...m.entries()];
  }, [deadlines]);

  /* semana pico: mes donde se apilan más entregas */
  const peak = useMemo(() => {
    const byMonth = new Map<string, number>();
    deadlines.forEach((d) => { const k = d.due.slice(0, 7); byMonth.set(k, (byMonth.get(k) ?? 0) + 1); });
    let best: [string, number] | null = null;
    byMonth.forEach((n, k) => { if (!best || n > best[1]) best = [k, n]; });
    if (!best || best[1] < 3) return null;
    const [k, n] = best as [string, number];
    const dt = new Date(k + "-01T00:00:00Z");
    const roomsInMonth = new Set(deadlines.filter((d) => d.due.slice(0, 7) === k).map((d) => d.roomId)).size;
    return { month: dt.toLocaleDateString(lang === "es" ? "es-ES" : "en-GB", { month: "long", year: "numeric", timeZone: "UTC" }), n, rooms: roomsInMonth };
  }, [deadlines, lang]);

  async function resolveProp(p: DeskProposal, action: "confirm" | "dismiss") {
    setBusy(p.id);
    try {
      const res = await fetch(`/api/rooms/${p.roomId}/suggestions`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: p.id, action }),
      });
      if (res.ok) setResolved((r) => ({ ...r, [p.id]: action === "confirm" ? "accepted" : "rejected" }));
    } finally { setBusy(null); }
  }

  const overdue = (due: string) => due < todayISO;
  const sidebarW = collapsed && !isMobile ? 66 : 202;

  return (
    <div style={{ minHeight: "100vh", fontFamily: FONT_SANS, fontSize: 14, lineHeight: 1.5, color: C.ink, background: C.bg, padding: isMobile ? 0 : "22px 16px 40px" }}>
      <div style={{ maxWidth: 1160, margin: "0 auto", background: C.bg, border: isMobile ? "none" : `1.5px solid ${C.line}`, borderRadius: isMobile ? 0 : 16, overflow: "hidden", display: "flex", height: isMobile ? "auto" : "calc(100vh - 62px)" }}>
        {/* ── SIDEBAR ── */}
        {(!isMobile || mobileOpen) && (
          <aside style={{ width: sidebarW, flexShrink: 0, background: C.paper, borderRight: `1.5px solid ${C.line}`, display: "flex", flexDirection: "column", position: isMobile ? "fixed" : "relative", inset: isMobile ? 0 : undefined, zIndex: isMobile ? 50 : undefined }}>
            <div style={{ display: "flex", alignItems: "center", gap: 9, padding: "16px 14px", borderBottom: `1px solid ${C.line}` }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/brand/isotipo-vivo.svg" alt="" style={{ height: 26, width: "auto", flexShrink: 0 }} />
              {!collapsed && <b style={{ fontSize: 13.5, fontWeight: 800, letterSpacing: "-.3px" }}>Common House</b>}
            </div>
            <div style={{ flex: 1, overflowY: "auto", padding: "10px 8px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 9, padding: "9px 10px", borderRadius: 9, background: C.paper2, fontWeight: 700, fontSize: 12.5 }}>
                <svg viewBox="0 0 16 16" style={{ width: 16, height: 16, stroke: "currentColor", fill: "none", strokeWidth: 1.5, strokeLinecap: "round", strokeLinejoin: "round", flexShrink: 0 }}><path d="M2.5 7 8 2.5 13.5 7" /><path d="M4 6.5V13h8V6.5" /></svg>
                {!collapsed && (lang === "es" ? "Mi escritorio" : "My desk")}
              </div>
              {!collapsed && <div style={{ ...label, padding: "16px 10px 7px" }}>{lang === "es" ? "Salas" : "Rooms"}</div>}
              {rooms.map((r) => (
                <Link key={r.id} href={`/rooms/${r.id}`} style={{ display: "flex", alignItems: "flex-start", gap: 9, padding: "8px 10px", borderRadius: 9, textDecoration: "none", color: "inherit" }}>
                  <span style={{ width: 7, height: 7, borderRadius: 999, background: C.muted, flexShrink: 0, marginTop: 5 }} />
                  {!collapsed && (
                    <span style={{ minWidth: 0 }}>
                      <b style={{ fontSize: 12, fontWeight: 700, display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.name}</b>
                      {r.stage && <small style={{ fontSize: 9.5, color: C.muted }}>{r.stage}</small>}
                    </span>
                  )}
                </Link>
              ))}
            </div>
            <div style={{ borderTop: `1px solid ${C.line}`, padding: "10px 12px", display: "flex", alignItems: "center", gap: 9 }}>
              <UserButton />
              {!collapsed && <span style={{ fontSize: 11, color: C.muted2, fontWeight: 600, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{userName}</span>}
              {!isMobile && <button onClick={() => setCollapsed((v) => { const nv = !v; try { window.localStorage.setItem("room.sidebar.collapsed", nv ? "1" : "0"); } catch {} return nv; })} style={{ background: "transparent", border: `1px solid ${C.line}`, borderRadius: 6, width: 22, height: 22, cursor: "pointer", color: C.muted, fontSize: 10 }}>{collapsed ? "›" : "‹"}</button>}
            </div>
          </aside>
        )}

        {/* ── MAIN ── */}
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", background: C.bg }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "13px 22px", borderBottom: `1.5px solid ${C.line}`, background: C.bg }}>
            {isMobile && <button onClick={() => setMobileOpen((v) => !v)} style={{ background: "transparent", border: `1px solid ${C.line}`, borderRadius: 7, padding: "4px 9px", cursor: "pointer" }}>☰</button>}
            <div style={{ minWidth: 0 }}>
              <div style={{ ...label, fontSize: 8.5 }}>Portal · {userName.split(" ")[0]}</div>
              <h2 style={{ fontSize: 17, fontWeight: 800, letterSpacing: "-.4px", margin: "2px 0 0" }}>{lang === "es" ? "Mi escritorio" : "My desk"}</h2>
            </div>
            <span style={{ flex: 1 }} />
            <div style={{ display: "inline-flex", background: C.paper, border: `1.5px solid ${C.line}`, borderRadius: 8, padding: 2 }}>
              {(["es", "en"] as const).map((l) => (
                <button key={l} onClick={() => switchLang(l)} style={{ fontFamily: "inherit", fontSize: 9.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".3px", border: 0, borderRadius: 6, padding: "4px 9px", cursor: "pointer", background: lang === l ? C.ink : "transparent", color: lang === l ? "#fff" : C.muted }}>{l}</button>
              ))}
            </div>
          </div>

          <div style={{ flex: 1, overflowY: "auto", padding: "22px 22px 40px" }}>
            {/* ── HERO ── */}
            <div style={label}>{lang === "es" ? "Tu escritorio · todas las salas" : "Your desk · all rooms"}</div>
            <h1 style={{ fontSize: 26, fontWeight: 300, letterSpacing: "-1px", lineHeight: 1.1, maxWidth: "20ch", margin: "8px 0 0" }}>
              {lang === "es" ? "Hola, " : "Hi, "}<em style={{ fontWeight: 900, fontStyle: "italic", color: C.limeInk }}>{userName.split(" ")[0]}</em>
            </h1>
            <p style={{ color: C.muted, fontSize: 14, maxWidth: "64ch", marginTop: 12, lineHeight: 1.6 }}>
              {new Date(todayISO + "T00:00:00").toLocaleDateString(lang === "es" ? "es-ES" : "en-GB", { weekday: "long", day: "numeric", month: "short" })}.{" "}
              {lang === "es" ? "Hoy te toca avanzar " : "Today you have "}<b style={{ color: C.ink, fontWeight: 700 }}>{myTasks.length} {lang === "es" ? "tareas" : "tasks"}</b>
              {pending.length > 0 && <> {lang === "es" ? "y revisar " : "and "}<b style={{ color: C.ink, fontWeight: 700 }}>{pending.length} {lang === "es" ? "propuestas" : "proposals"}</b> {lang === "es" ? "que las salas dejaron listas para tu visto bueno." : "waiting for your sign-off."}</>}
              {pending.length === 0 && <>{lang === "es" ? ". Sin propuestas pendientes." : ". No pending proposals."}</>}
            </p>

            {/* ── GANTT CONSOLIDADO ── */}
            {rowsByRoom.length > 0 && (
              <div style={{ marginTop: 20 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 11, marginBottom: 13 }}>
                  <h3 style={{ fontSize: 15, fontWeight: 800, letterSpacing: "-.3px", margin: 0 }}>{lang === "es" ? "Tus deadlines" : "Your deadlines"}</h3>
                  <span style={{ fontSize: 11, color: C.muted, fontWeight: 600 }}>{lang === "es" ? "todas las salas" : "all rooms"} · {deadlines.length}</span>
                </div>
                <p style={{ color: C.muted, fontSize: 13, maxWidth: "72ch", margin: "-6px 0 14px", lineHeight: 1.6 }}>
                  {lang === "es" ? "Dónde se te juntan las entregas. Cada barra termina en su fecha límite — mirá dónde se apilan." : "Where your deliveries pile up. Each bar ends on its due date."}
                </p>
                <div style={{ background: C.paper, border: `1.5px solid ${C.line}`, borderRadius: 14, overflow: "hidden" }}>
                  <div style={{ display: "flex" }}>
                    <div style={{ width: NAME_W, flexShrink: 0, borderRight: `1px solid ${C.line}`, background: C.paper, zIndex: 2 }}>
                      <div style={{ height: 30, borderBottom: `1.5px solid ${C.line}` }} />
                      {rowsByRoom.map(([rid]) => (
                        <div key={rid} style={{ minHeight: 38, display: "flex", alignItems: "center", padding: "0 12px", borderTop: `1px solid #eee` }}>
                          <span style={{ fontSize: 8, fontWeight: 800, letterSpacing: ".5px", textTransform: "uppercase", padding: "2px 6px", borderRadius: 5, background: toneOf.get(rid)?.chipBg, color: toneOf.get(rid)?.chipFg }}>{roomShort[rid]}</span>
                        </div>
                      ))}
                    </div>
                    <div ref={scrollRef} style={{ flex: 1, overflowX: "auto", position: "relative" }}>
                      <div style={{ width: gantt.totalW, position: "relative" }}>
                        <div style={{ display: "flex", height: 30, borderBottom: `1.5px solid ${C.line}` }}>
                          {gantt.months.map((m, i) => (
                            <div key={i} style={{ width: MONTH_W, flexShrink: 0, borderLeft: i === 0 ? 0 : "1px solid #eee", padding: "9px 0 7px 10px", fontSize: 8, fontWeight: 700, letterSpacing: "1.5px", textTransform: "uppercase", color: "rgba(0,0,0,.3)", whiteSpace: "nowrap" }}>{m.label} {i === 0 || m.label.startsWith("ene") || m.label.startsWith("jan") ? `’${String(m.year).slice(2)}` : ""}</div>
                          ))}
                        </div>
                        {rowsByRoom.map(([rid, items]) => {
                          const tone = toneOf.get(rid) ?? ROOM_TONES[0];
                          return (
                            <div key={rid} style={{ minHeight: 38, position: "relative", borderTop: "1px solid #eee" }}>
                              {items.map((d) => {
                                const x = gantt.xOf(new Date(d.due + "T00:00:00Z").getTime());
                                const late = overdue(d.due);
                                const bg = late ? URGENT.barBg : tone.barBg, fg = late ? URGENT.barFg : tone.barFg;
                                return (
                                  <div key={`${d.kind}-${d.id}`} title={`${roomName[rid]} · ${d.title} · ${lang === "es" ? "vence" : "due"} ${fmtDay(d.due, lang)}${d.progress != null ? ` · ${d.progress}%` : ""}`}
                                    style={{ position: "absolute", top: "50%", transform: "translateY(-50%)", left: Math.max(0, x - 74), width: 74, height: 21, borderRadius: 6, background: bg, color: fg, display: "flex", alignItems: "center", justifyContent: "flex-end", padding: "0 8px", fontSize: 9, fontWeight: 800, letterSpacing: ".4px", textTransform: "uppercase", whiteSpace: "nowrap", overflow: "hidden" }}>
                                    {fmtDay(d.due, lang)}
                                  </div>
                                );
                              })}
                            </div>
                          );
                        })}
                        <div style={{ position: "absolute", top: 2, bottom: 2, left: gantt.todayX, width: 2, background: C.cold, zIndex: 6, pointerEvents: "none" }}>
                          <span style={{ position: "absolute", top: 0, left: "50%", transform: "translateX(-50%)", background: C.cold, color: "#fff", fontSize: 7, fontWeight: 800, padding: "1px 5px", borderRadius: "0 0 5px 5px", letterSpacing: ".5px" }}>{lang === "es" ? "HOY" : "NOW"}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                {peak && (
                  <div style={{ marginTop: 9, fontSize: 11, color: C.warn, fontWeight: 700 }}>
                    <span style={{ display: "inline-block", width: 8, height: 8, background: "#f59e0b", borderRadius: 2, marginRight: 6, verticalAlign: "middle" }} />
                    {lang === "es" ? `Mes pico · ${peak.month}: se apilan ${peak.n} entregas de ${peak.rooms} sala${peak.rooms === 1 ? "" : "s"}.` : `Peak month · ${peak.month}: ${peak.n} deliveries from ${peak.rooms} room(s).`}
                  </div>
                )}
              </div>
            )}

            {/* ── LA IA PROPONE ── */}
            <div style={{ background: C.paper, border: `1.5px solid ${C.line}`, borderRadius: 14, overflow: "hidden", marginTop: 20 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", borderBottom: `1px solid ${C.line}`, background: "rgba(200,245,90,.09)" }}>
                <span style={{ width: 24, height: 24, borderRadius: 7, background: C.lime, display: "grid", placeItems: "center", fontSize: 12, flexShrink: 0 }}>✦</span>
                <div>
                  <b style={{ fontSize: 11.5, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".3px" }}>{lang === "es" ? "La IA propone" : "The AI proposes"}</b>
                  <small style={{ fontSize: 10, color: C.muted, display: "block", fontWeight: 500 }}>{lang === "es" ? "Nada se aplica sin tu ✓." : "Nothing applies without your ✓."}</small>
                </div>
                <span style={{ flex: 1 }} />
                <span style={{ ...label, background: C.paper2, padding: "2px 8px", borderRadius: 8 }}>{pending.length}</span>
              </div>
              {pending.length === 0 && <div style={{ padding: "22px 16px", textAlign: "center", color: C.muted, fontSize: 12.5 }}>{lang === "es" ? "Sin propuestas pendientes." : "No pending proposals."}</div>}
              {pending.map((p, i) => {
                const k = proposalKind(p.itemType, lang);
                const exp = expandedProp === p.id;
                const tone = toneOf.get(p.roomId) ?? ROOM_TONES[0];
                return (
                  <div key={p.id} style={{ borderTop: i === 0 ? 0 : "1px solid #eee" }}>
                    <div onClick={() => setExpandedProp(exp ? null : p.id)} style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 16px", cursor: "pointer" }}>
                      <span style={{ fontSize: 8, fontWeight: 800, letterSpacing: ".5px", textTransform: "uppercase", padding: "2px 6px", borderRadius: 5, background: tone.chipBg, color: tone.chipFg, flexShrink: 0 }}>{roomShort[p.roomId]}</span>
                      <div style={{ flex: 1, minWidth: 0, fontSize: 12.5 }}>
                        {p.summary ?? k.label}
                        <small style={{ display: "block", color: C.muted, fontSize: 10.5, marginTop: 1 }}>{roomName[p.roomId]}</small>
                      </div>
                      <span style={{ fontSize: 7.5, fontWeight: 800, letterSpacing: ".4px", textTransform: "uppercase", padding: "2px 6px", borderRadius: 5, background: k.bg, color: k.fg, whiteSpace: "nowrap" }}>{k.label}</span>
                      {canConfirm && (
                        <div style={{ display: "flex", gap: 6, flexShrink: 0 }} onClick={(e) => e.stopPropagation()}>
                          <button disabled={busy === p.id} onClick={() => resolveProp(p, "confirm")} style={{ fontFamily: "inherit", fontSize: 9.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".3px", border: 0, borderRadius: 7, padding: "5px 10px", cursor: "pointer", background: C.lime, color: "#0a0a0a" }}>{lang === "es" ? "Confirmar" : "Confirm"}</button>
                          <button disabled={busy === p.id} onClick={() => resolveProp(p, "dismiss")} style={{ fontFamily: "inherit", fontSize: 9.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".3px", border: `1.5px solid ${C.line}`, borderRadius: 7, padding: "5px 10px", cursor: "pointer", background: C.paper, color: C.muted2 }}>{lang === "es" ? "Descartar" : "Dismiss"}</button>
                        </div>
                      )}
                      <span style={{ color: C.muted, fontSize: 11, flexShrink: 0, transform: exp ? "rotate(90deg)" : "none", transition: "transform .18s" }}>▸</span>
                    </div>
                    {exp && (
                      <div style={{ padding: "2px 16px 14px", background: "#fbfbf7", borderTop: "1px solid #eee" }}>
                        {p.rationale && (
                          <div style={{ margin: "12px 0", padding: "11px 14px", borderLeft: `3px solid ${C.lime}`, background: C.paper, borderRadius: "0 8px 8px 0", fontSize: 12.5, color: "#444", fontStyle: "italic", lineHeight: 1.55 }}>
                            {p.rationale}
                            {p.sourceRefs && p.sourceRefs.length > 0 && <span style={{ display: "block", fontStyle: "normal", fontSize: 8.5, fontWeight: 700, letterSpacing: ".6px", textTransform: "uppercase", color: C.muted, marginTop: 7 }}>{p.sourceRefs.join(" · ")}</span>}
                          </div>
                        )}
                        <Link href={`/rooms/${p.roomId}`} style={{ fontSize: 11, fontWeight: 700, color: C.mine, textDecoration: "none" }}>{lang === "es" ? "Abrir la sala →" : "Open room →"}</Link>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* ── TUS TAREAS / TUS ENTREGABLES ── */}
            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1.4fr 1fr", gap: 16, alignItems: "start", marginTop: 20 }}>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 11, marginBottom: 13 }}>
                  <h3 style={{ fontSize: 15, fontWeight: 800, letterSpacing: "-.3px", margin: 0 }}>{lang === "es" ? "Tus tareas" : "Your tasks"}</h3>
                  <span style={{ fontSize: 11, color: C.muted, fontWeight: 600 }}>{lang === "es" ? "todas las salas" : "all rooms"}</span>
                </div>
                {myTasks.length === 0 ? (
                  <div style={{ background: C.paper, border: `1.5px solid ${C.line}`, borderRadius: 14, padding: "22px 16px", textAlign: "center", color: C.muted, fontSize: 12.5 }}>{lang === "es" ? "Nada asignado a vos ahora." : "Nothing assigned to you."}</div>
                ) : (
                  <div style={{ background: C.paper, border: `1.5px solid ${C.line}`, borderRadius: 14, overflow: "hidden" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 9, padding: "11px 15px", borderBottom: "1px solid #eee" }}>
                      <b style={{ fontSize: 12, fontWeight: 800 }}>{lang === "es" ? "Ordenadas por vencimiento" : "Sorted by due date"}</b>
                    </div>
                    {myTasks.map((t, i) => {
                      const tone = toneOf.get(t.roomId) ?? ROOM_TONES[0];
                      const late = t.due ? overdue(t.due) : false;
                      return (
                        <Link key={t.id} href={`/rooms/${t.roomId}`} style={{ display: "flex", alignItems: "flex-start", gap: 11, padding: "11px 15px", borderTop: i === 0 ? 0 : "1px solid #eee", textDecoration: "none", color: "inherit" }}>
                          <span style={{ width: 17, height: 17, border: `1.5px solid #c4c4ba`, borderRadius: 5, flexShrink: 0, marginTop: 1 }} />
                          <span style={{ flex: 1, minWidth: 0, fontSize: 12.5 }}>
                            <span style={{ fontSize: 8, fontWeight: 800, letterSpacing: ".5px", textTransform: "uppercase", padding: "2px 6px", borderRadius: 5, marginRight: 7, background: tone.chipBg, color: tone.chipFg }}>{roomShort[t.roomId]}</span>
                            {t.title}
                          </span>
                          {t.due && <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: ".6px", textTransform: "uppercase", color: late ? C.cold : C.muted, whiteSpace: "nowrap", marginTop: 2 }}>{late ? (lang === "es" ? "vencida" : "overdue") : fmtDay(t.due, lang)}</span>}
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 11, marginBottom: 13 }}>
                  <h3 style={{ fontSize: 15, fontWeight: 800, letterSpacing: "-.3px", margin: 0 }}>{lang === "es" ? "Tus entregables" : "Your deliverables"}</h3>
                  <span style={{ fontSize: 11, color: C.muted, fontWeight: 600 }}>{lang === "es" ? "donde estás vinculado" : "where you're linked"}</span>
                </div>
                {myDeliverables.length === 0 ? (
                  <div style={{ background: C.paper, border: `1.5px solid ${C.line}`, borderRadius: 14, padding: "22px 16px", textAlign: "center", color: C.muted, fontSize: 12.5 }}>{lang === "es" ? "Sin entregables a tu nombre." : "No deliverables assigned."}</div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {myDeliverables.map((d) => {
                      const tone = toneOf.get(d.roomId) ?? ROOM_TONES[0];
                      const done = d.status === "delivered" || d.status === "accepted";
                      return (
                        <Link key={d.id} href={`/rooms/${d.roomId}`} style={{ background: C.paper, border: `1.5px solid ${C.line}`, borderRadius: 12, padding: "11px 15px", display: "flex", alignItems: "center", gap: 12, textDecoration: "none", color: "inherit" }}>
                          <span style={{ fontSize: 8, fontWeight: 800, letterSpacing: ".5px", textTransform: "uppercase", padding: "2px 6px", borderRadius: 5, background: tone.chipBg, color: tone.chipFg, flexShrink: 0 }}>{roomShort[d.roomId]}</span>
                          <span style={{ flex: 1, minWidth: 0 }}>
                            <b style={{ fontSize: 12.5, fontWeight: 700, display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.title}</b>
                            <small style={{ fontSize: 10, color: C.muted }}>{d.owned ? (lang === "es" ? "Responsable" : "Owner") : (lang === "es" ? "Contribuís" : "Contributor")} · {done ? (lang === "es" ? "aceptado" : "accepted") : `${d.progress}% ${lang === "es" ? "en curso" : "in progress"}`}</small>
                          </span>
                          <span style={{ fontSize: 8, fontWeight: 700, letterSpacing: "1.5px", textTransform: "uppercase", borderRadius: 20, padding: "4px 10px", whiteSpace: "nowrap", background: done ? "transparent" : C.lime, border: done ? `1.5px solid ${C.line}` : 0, color: done ? "#8a8a82" : "#000" }}>{done ? (lang === "es" ? "Entregado" : "Delivered") : (lang === "es" ? "En curso" : "In progress")}</span>
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {rooms.length === 0 && <div style={{ padding: "40px 0", textAlign: "center", color: C.muted, fontSize: 13 }}>{lang === "es" ? "Todavía no tenés salas de trabajo asignadas." : "You have no work rooms yet."}</div>}
          </div>
        </div>
      </div>
    </div>
  );
}
