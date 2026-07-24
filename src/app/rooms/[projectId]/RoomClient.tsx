"use client";

import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { UserButton } from "@clerk/nextjs";
import { makeT, type Lang, type TFn } from "@/lib/room-i18n";
import type { SuggestedStructure } from "@/lib/room-structure";

/* ── tipos (espejo de las tablas del Bloque 0) ── */
type Phase = { id: string; title: string; status: string; position: number };
type Deliverable = { id: string; title: string; status: string; progress: number; phase_id: string | null; owner_person_id: string | null; due_date: string | null; position: number };
type Task = { id: string; title: string; status: string; assignee_side: string; deliverable_id: string | null; owner_person_id: string | null; closed_via: string | null; closed_by: string | null; due_date: string | null; position: number };
type Participant = { initials?: string; name?: string; side?: string };
type Decision = { id: string; title: string; context: string | null; status: string; deliverable_id: string | null; participants: Participant[] | null; source_ref: string | null; resolved_by: string | null };
type Material = { id: string; title: string; url: string | null; mime_type: string | null; category: string | null; folder_name: string | null; modified_at: string | null };
type EventRow = { id: string; actor_email: string | null; actor_role: string | null; verb: string; target_type: string; summary: string | null; created_at: string };
type RoomSummary = { id: string; name: string | null; slug: string | null; stage: string | null };
type RoomProjectMeta = { orgName: string | null; orgLocation: string | null; orgWebsite: string | null; engagementModel: string | null; projectType: string | null; geography: string | null; startDate: string | null; targetEndDate: string | null; projectCode: string | null; driveUrl: string | null; presaleSlug: string | null; currentFocus: string | null; nextMilestone: string | null };
type RoomTeamMember = { id: string; name: string; email: string | null; role: string; jobTitle: string | null; photoUrl: string | null; side: "team" | "client" };
type RoomBilling = { company: { legalName: string | null; taxId: string | null; vatNumber: string | null; address: string | null; billingEmail: string | null; publicNote: string | null } | null; client: { legalName: string | null; taxId: string | null; address: string | null; billingEmail: string | null; billingContact: string | null; poReference: string | null } | null };

type Props = {
  projectId: string;
  role: string;
  capabilities: string[];
  personId: string | null;
  defaultLang: Lang;
  emptyRoom: boolean;
  suggestion: SuggestedStructure | null;
  project: { id: string; name: string | null; current_stage: string | null };
  rooms: RoomSummary[];
  meta: RoomProjectMeta;
  team: RoomTeamMember[];
  billing: RoomBilling;
  initialPhases: Phase[];
  initialDeliverables: Deliverable[];
  initialTasks: Task[];
  initialDecisions: Decision[];
  initialMaterials: Material[];
  initialEvents: EventRow[];
};

/* ── tokens del portal ── */
const C = {
  ink: "var(--hall-ink-0)", paper: "var(--hall-paper-0)", paper1: "var(--hall-paper-1)", paper2: "var(--hall-paper-2)",
  line: "var(--hall-line)", lineSoft: "var(--hall-line-soft)", muted: "var(--hall-muted)", muted2: "var(--hall-muted-2)",
  lime: "var(--hall-lime)", limeSoft: "var(--hall-lime-soft)", limePaper: "var(--hall-lime-paper)", limeInk: "var(--hall-lime-ink)",
  ok: "var(--hall-ok)", okSoft: "var(--hall-ok-soft)", warn: "var(--hall-warn)", warnSoft: "var(--hall-warn-soft)",
  danger: "var(--hall-danger)", dangerSoft: "var(--hall-danger-soft)",
};

const DELIV_COLS: { key: string; label: string; dot: string }[] = [
  { key: "not_started", label: "Por iniciar", dot: C.muted },
  { key: "in_progress", label: "En curso", dot: C.limeInk },
  { key: "at_risk", label: "En riesgo", dot: C.warn },
  { key: "delivered", label: "Entregado", dot: C.ok },
  { key: "accepted", label: "Aceptado", dot: C.ok },
];
const TASK_COLS: { key: string; label: string; dot: string }[] = [
  { key: "todo", label: "Por hacer", dot: C.muted },
  { key: "doing", label: "En curso", dot: C.limeInk },
  { key: "blocked", label: "Bloqueada", dot: C.warn },
  { key: "done", label: "Hecha", dot: C.ok },
];

function pill(bg: string, fg: string): CSSProperties {
  return { fontSize: 10, fontWeight: 700, letterSpacing: ".3px", textTransform: "uppercase", padding: "2px 8px", borderRadius: 999, background: bg, color: fg, whiteSpace: "nowrap" };
}
const label: CSSProperties = { fontSize: 9, fontWeight: 700, letterSpacing: "1.5px", textTransform: "uppercase", color: C.muted };
const linkChip: CSSProperties = { fontSize: 11, fontWeight: 700, color: C.muted2, background: C.paper, border: `1.5px solid ${C.line}`, borderRadius: 8, padding: "6px 11px", textDecoration: "none" };

function statusTone(s: string): { bg: string; fg: string } {
  if (s === "doing") return { bg: C.limePaper, fg: C.limeInk };
  if (s === "blocked") return { bg: C.warnSoft, fg: C.warn };
  if (s === "done") return { bg: C.okSoft, fg: C.ok };
  return { bg: C.paper2, fg: C.muted2 };
}

async function api(path: string, method: string, body?: unknown) {
  const res = await fetch(path, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error || `Error ${res.status}`);
  return json;
}

type SectionKey = "mio" | "resumen" | "plan" | "entregables" | "tareas" | "decisiones" | "materiales" | "proyecto" | "actividad";

const NAV: { key: SectionKey; label: string; icon: string; pmOnly?: boolean }[] = [
  { key: "mio", label: "Lo mío", icon: "✦" },
  { key: "resumen", label: "Resumen", icon: "◈" },
  { key: "plan", label: "Plan", icon: "◆" },
  { key: "entregables", label: "Entregables", icon: "◧" },
  { key: "tareas", label: "Tareas", icon: "✓" },
  { key: "decisiones", label: "Decisiones", icon: "◉" },
  { key: "materiales", label: "Materiales", icon: "▤" },
  { key: "proyecto", label: "Proyecto", icon: "◍" },
  { key: "actividad", label: "Actividad", icon: "◫", pmOnly: true },
];

function initialsOf(name: string | null): string {
  if (!name) return "·";
  const clean = name.replace(/^\[[^\]]*\]\s*/, "").trim();
  const parts = clean.split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "·";
}

export function RoomClient({ projectId, role, capabilities, personId, defaultLang, emptyRoom, suggestion, project, rooms, meta, team, billing, initialPhases, initialDeliverables, initialTasks, initialDecisions, initialMaterials, initialEvents }: Props) {
  const router = useRouter();
  const [section, setSection] = useState<SectionKey>("resumen");
  const [approving, setApproving] = useState(false);
  const [deliverables, setDeliverables] = useState<Deliverable[]>(initialDeliverables);
  const [tasks, setTasks] = useState<Task[]>(initialTasks);
  const [decisions, setDecisions] = useState<Decision[]>(initialDecisions);
  const [phases] = useState<Phase[]>(initialPhases);
  const [openPhase, setOpenPhase] = useState<string | null>(initialPhases.find((p) => p.status === "in_progress")?.id ?? null);
  const [dView, setDView] = useState<"list" | "kanban">("kanban");
  const [tView, setTView] = useState<"list" | "kanban">("kanban");
  const [toast, setToast] = useState<{ msg: string; undo?: () => void } | null>(null);
  const [expandedDeliv, setExpandedDeliv] = useState<string | null>(null);
  const [expandedDecision, setExpandedDecision] = useState<string | null>(() => initialDecisions.find((d) => d.status === "open")?.id ?? null);

  /* shell: colapso (desktop, persistido) + drawer (mobile) */
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [lang, setLang] = useState<Lang>(defaultLang);
  useEffect(() => {
    try { setCollapsed(window.localStorage.getItem("room.sidebar.collapsed") === "1"); } catch {}
    try { const s = window.localStorage.getItem("room.lang." + projectId); if (s === "es" || s === "en") setLang(s); } catch {}
    const mq = () => setIsMobile(window.innerWidth < 900);
    mq(); window.addEventListener("resize", mq);
    return () => window.removeEventListener("resize", mq);
  }, [projectId]);
  function switchLang(l: Lang) { setLang(l); try { window.localStorage.setItem("room.lang." + projectId, l); } catch {} }
  function toggleCollapsed() {
    setCollapsed((v) => { const nv = !v; try { window.localStorage.setItem("room.sidebar.collapsed", nv ? "1" : "0"); } catch {} return nv; });
  }

  const can = (c: string) => capabilities.includes(c);
  const base = `/api/rooms/${projectId}`;
  const tr = useMemo(() => makeT(lang), [lang]);
  const delivCols = useMemo(() => DELIV_COLS.map((c) => ({ ...c, label: tr("ds." + c.key) })), [tr]);
  const taskCols = useMemo(() => TASK_COLS.map((c) => ({ ...c, label: tr("ts." + c.key) })), [tr]);

  function flash(msg: string, undo?: () => void) { setToast({ msg, undo }); window.setTimeout(() => setToast((cur) => (cur?.msg === msg ? null : cur)), undo ? 6000 : 3000); }

  /* ── acciones (optimistic + revert) ── */
  async function moveDeliverable(id: string, to: string, from: string) {
    if (!can("deliverable.move")) return;
    setDeliverables((ds) => ds.map((d) => (d.id === id ? { ...d, status: to } : d)));
    try { await api(`${base}/deliverables`, "PATCH", { id, action: "move", status: to }); }
    catch (e) { setDeliverables((ds) => ds.map((d) => (d.id === id ? { ...d, status: from } : d))); flash((e as Error).message); }
  }
  async function acceptDeliverable(id: string) {
    if (!can("deliverable.accept")) return;
    const prev = deliverables;
    setDeliverables((ds) => ds.map((d) => (d.id === id ? { ...d, status: "accepted" } : d)));
    try { await api(`${base}/deliverables`, "PATCH", { id, action: "accept" }); flash(tr("toast.accepted"), () => undoAccept(id)); }
    catch (e) { setDeliverables(prev); flash((e as Error).message); }
  }
  async function undoAccept(id: string) {
    setDeliverables((ds) => ds.map((d) => (d.id === id ? { ...d, status: "delivered" } : d)));
    try { await api(`${base}/deliverables`, "PATCH", { id, action: "revert_accept" }); flash(tr("toast.acceptUndone")); }
    catch (e) { flash((e as Error).message); }
  }
  async function moveTask(id: string, to: string, from: string) {
    if (!can("task.move")) return;
    setTasks((ts) => ts.map((t) => (t.id === id ? { ...t, status: to } : t)));
    try { await api(`${base}/tasks`, "PATCH", { id, action: "move", status: to }); }
    catch (e) { setTasks((ts) => ts.map((t) => (t.id === id ? { ...t, status: from } : t))); flash((e as Error).message); }
  }
  async function closeTask(t: Task) {
    if (!(can("task.manage") || can("task.mark_own"))) return;
    const before = t.status;
    const prev = tasks;
    setTasks((ts) => ts.map((x) => (x.id === t.id ? { ...x, status: "done", closed_via: "attestation" } : x)));
    try { await api(`${base}/tasks`, "PATCH", { id: t.id, action: "close" }); flash(tr("toast.taskClosed"), () => undoClose(t.id, before)); }
    catch (e) { setTasks(prev); flash((e as Error).message); }
  }
  async function undoClose(id: string, before: string) {
    setTasks((ts) => ts.map((x) => (x.id === id ? { ...x, status: before, closed_via: null } : x)));
    try { await api(`${base}/tasks`, "PATCH", { id, action: "reopen" }); flash(tr("toast.taskReopened")); }
    catch (e) { flash((e as Error).message); }
  }
  async function createDeliverable() {
    if (!can("structure.edit")) return;
    const title = window.prompt(tr("prompt.newDeliverable"));
    if (!title?.trim()) return;
    try { const r = await api(`${base}/deliverables`, "POST", { title }); setDeliverables((ds) => [...ds, r.deliverable]); }
    catch (e) { flash((e as Error).message); }
  }
  async function createTask() {
    if (!can("task.crud")) return;
    const title = window.prompt(tr("prompt.newTask"));
    if (!title?.trim()) return;
    try { const r = await api(`${base}/tasks`, "POST", { title }); setTasks((ts) => [...ts, r.task]); }
    catch (e) { flash((e as Error).message); }
  }
  async function resolveDecision(id: string) {
    if (!(can("decision.manage") || can("decision.resolve_own"))) return;
    const prev = decisions;
    setDecisions((ds) => ds.map((d) => (d.id === id ? { ...d, status: "closed" } : d)));
    try { await api(`${base}/decisions`, "PATCH", { id, action: "resolve" }); flash(tr("toast.decisionResolved"), () => undoResolve(id)); }
    catch (e) { setDecisions(prev); flash((e as Error).message); }
  }
  async function undoResolve(id: string) {
    setDecisions((ds) => ds.map((d) => (d.id === id ? { ...d, status: "open" } : d)));
    try { await api(`${base}/decisions`, "PATCH", { id, action: "reopen" }); flash(tr("toast.decisionReopened")); }
    catch (e) { flash((e as Error).message); }
  }
  async function createDecision() {
    if (!can("decision.manage")) return;
    const title = window.prompt(tr("prompt.newDecision"));
    if (!title?.trim()) return;
    try { const r = await api(`${base}/decisions`, "POST", { title }); setDecisions((ds) => [...ds, r.decision]); }
    catch (e) { flash((e as Error).message); }
  }
  async function approveStructure() {
    if (!can("room.configure") || !suggestion) return;
    setApproving(true);
    try {
      await api(`${base}/structure`, "POST", { phases: suggestion.phases.map((p) => ({ title: p.title, deliverables: p.deliverables })) });
      flash(tr("toast.structureCreated"));
      router.refresh();
    } catch (e) { flash((e as Error).message); setApproving(false); }
  }

  /* ── stats ── */
  const stats = useMemo(() => {
    const dDone = deliverables.filter((d) => d.status === "delivered" || d.status === "accepted").length;
    const avance = deliverables.length ? Math.round(deliverables.reduce((a, d) => a + (d.progress || 0), 0) / deliverables.length) : 0;
    const tDone = tasks.filter((t) => t.status === "done").length;
    return { avance, dDone, dTot: deliverables.length, tDone, tTot: tasks.length, blocked: tasks.filter((t) => t.status === "blocked").length };
  }, [deliverables, tasks]);

  const openDecisions = decisions.filter((d) => d.status === "open").length;
  const myTasks = personId ? tasks.filter((t) => t.owner_person_id === personId) : [];
  const myOpenTasks = myTasks.filter((t) => t.status !== "done");
  const myDeliverables = personId ? deliverables.filter((d) => d.owner_person_id === personId) : [];
  const navCount: Partial<Record<SectionKey, number | undefined>> = { mio: myOpenTasks.length || undefined, entregables: deliverables.length, tareas: tasks.length, decisiones: openDecisions || undefined };
  const navItems = NAV.filter((n) => !n.pmOnly || can("analytics.view"));
  const sectionLabel = tr("nav." + section);

  // La sala actual siempre presente en el acordeón (aunque el listado venga vacío).
  const roomList = rooms.some((r) => r.id === projectId)
    ? rooms
    : [{ id: projectId, name: project.name, slug: null, stage: project.current_stage }, ...rooms];

  function pickSection(k: SectionKey) { setSection(k); if (isMobile) setMobileOpen(false); }

  const sidebarWidth = isMobile ? 268 : collapsed ? 66 : 248;
  const showLabels = isMobile || !collapsed;

  const asideStyle: CSSProperties = {
    width: sidebarWidth, flex: "none", background: C.paper1, borderRight: `1px solid ${C.line}`,
    display: "flex", flexDirection: "column", zIndex: 50,
    ...(isMobile
      ? { position: "fixed", top: 0, left: 0, height: "100vh", transform: mobileOpen ? "translateX(0)" : "translateX(-110%)", transition: "transform .22s ease", boxShadow: mobileOpen ? "0 10px 40px rgba(0,0,0,.28)" : "none" }
      : { position: "sticky", top: 0, height: "100vh" }),
  };

  return (
    <div style={{ display: "flex", minHeight: "100vh", fontFamily: "var(--font-hall-sans), 'Inter Tight', sans-serif", color: C.ink, background: C.paper }}>
      {/* hamburguesa (mobile) */}
      {isMobile && !mobileOpen && (
        <button onClick={() => setMobileOpen(true)} aria-label={tr("chrome.openNav")}
          style={{ position: "fixed", top: 12, left: 12, zIndex: 40, width: 40, height: 40, borderRadius: 10, background: C.paper, border: `1px solid ${C.line}`, cursor: "pointer", fontSize: 17, display: "grid", placeItems: "center" }}>≡</button>
      )}
      {/* backdrop (mobile) */}
      {isMobile && mobileOpen && (
        <div onClick={() => setMobileOpen(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.4)", zIndex: 45 }} />
      )}

      {/* ── SIDEBAR ── */}
      <aside style={asideStyle}>
        {/* brand */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: showLabels ? "16px 16px 14px" : "16px 0 14px", justifyContent: showLabels ? "flex-start" : "center", borderBottom: `1px solid ${C.line}` }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/isotipo-vivo.svg" alt="Common House" style={{ height: 26, width: "auto", display: "block", flexShrink: 0 }} />
          {showLabels && <span style={{ fontSize: 13, fontWeight: 800, letterSpacing: "-.2px" }}>Common House</span>}
        </div>

        {/* acordeón de salas */}
        <nav style={{ flex: 1, overflowY: "auto", padding: "12px 0" }}>
          {showLabels && <div style={{ ...label, padding: "0 16px 8px" }}>{tr("chrome.rooms")}</div>}
          {roomList.map((r) => {
            const current = r.id === projectId;
            if (!current) {
              // otras salas: link (navega) — colapsado = inicial, expandido = nombre
              return (
                <Link key={r.id} href={`/rooms/${r.id}`} title={r.name ?? tr("chrome.room")}
                  style={{ display: "flex", alignItems: "center", gap: 10, padding: showLabels ? "8px 16px" : "8px 0", justifyContent: showLabels ? "flex-start" : "center", textDecoration: "none", color: C.muted2, fontSize: 12.5, fontWeight: 600 }}>
                  <span style={{ width: 22, height: 22, borderRadius: 7, flexShrink: 0, background: C.paper2, color: C.muted2, display: "grid", placeItems: "center", fontSize: 9, fontWeight: 800 }}>{initialsOf(r.name)}</span>
                  {showLabels && <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{cleanName(r.name)}</span>}
                </Link>
              );
            }
            // sala actual: nombre + nav de secciones
            return (
              <div key={r.id} style={{ marginBottom: 4 }}>
                {showLabels && (
                  <div style={{ display: "flex", alignItems: "center", gap: 9, padding: "8px 16px 6px" }}>
                    <span style={{ width: 22, height: 22, borderRadius: 7, flexShrink: 0, background: C.lime, color: "#0a0a0a", display: "grid", placeItems: "center", fontSize: 9, fontWeight: 800 }}>{initialsOf(r.name)}</span>
                    <b style={{ fontSize: 12.5, fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{cleanName(r.name)}</b>
                  </div>
                )}
                <div style={{ display: "flex", flexDirection: "column", gap: 1, padding: showLabels ? "2px 8px" : "2px 0" }}>
                  {navItems.map((n) => {
                    const active = section === n.key;
                    const count = navCount[n.key];
                    return (
                      <button key={n.key} onClick={() => pickSection(n.key)} title={tr("nav." + n.key)}
                        style={{
                          display: "flex", alignItems: "center", gap: 10, width: "100%", textAlign: "left",
                          justifyContent: showLabels ? "flex-start" : "center",
                          padding: showLabels ? "7px 12px 7px 14px" : "9px 0", borderRadius: 8, cursor: "pointer",
                          fontFamily: "inherit", fontSize: 12.5, fontWeight: active ? 700 : 600,
                          background: active ? C.lime : "transparent",
                          color: active ? "#0a0a0a" : C.muted2, border: 0, position: "relative",
                        }}>
                        <span style={{ fontSize: 12, opacity: active ? 1 : 0.55, width: 16, textAlign: "center", flexShrink: 0 }}>{n.icon}</span>
                        {showLabels && <span style={{ flex: 1 }}>{tr("nav." + n.key)}</span>}
                        {showLabels && count != null && (
                          <span style={{ fontSize: 10, fontWeight: 800, background: active ? "rgba(0,0,0,.12)" : "rgba(0,0,0,.06)", color: active ? "#0a0a0a" : C.muted2, padding: "1px 7px", borderRadius: 8 }}>{count}</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </nav>

        {/* footer: colapsar (desktop) + user */}
        <div style={{ borderTop: `1px solid ${C.line}`, padding: showLabels ? "10px 14px" : "10px 0", display: "flex", alignItems: "center", gap: 10, justifyContent: showLabels ? "space-between" : "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 9, minWidth: 0 }}>
            <UserButton />
            {showLabels && <span style={{ fontSize: 11, color: C.muted, fontWeight: 600 }} title={tr("chrome.yourRole")}>{tr("role." + role)}</span>}
          </div>
          {showLabels && (
            <div style={{ display: "inline-flex", background: C.paper, border: `1px solid ${C.line}`, borderRadius: 7, padding: 1 }}>
              {(["es", "en"] as const).map((l) => (
                <button key={l} onClick={() => switchLang(l)} style={{ fontFamily: "inherit", fontSize: 9.5, fontWeight: 800, letterSpacing: ".4px", textTransform: "uppercase", border: 0, borderRadius: 5, padding: "3px 7px", cursor: "pointer", background: lang === l ? C.ink : "transparent", color: lang === l ? "#fff" : C.muted }}>{l}</button>
              ))}
            </div>
          )}
          {!isMobile && (
            <button onClick={toggleCollapsed} aria-label={collapsed ? tr("chrome.expand") : tr("chrome.collapse")} title={collapsed ? tr("chrome.expand") : tr("chrome.collapse")}
              style={{ width: 26, height: 26, borderRadius: 7, border: `1px solid ${C.line}`, background: C.paper, color: C.muted, cursor: "pointer", flexShrink: 0, display: showLabels ? "grid" : "none", placeItems: "center", fontSize: 12 }}>‹</button>
          )}
        </div>
        {!isMobile && collapsed && (
          <button onClick={toggleCollapsed} aria-label={tr("chrome.expand")} title={tr("chrome.expand")}
            style={{ margin: "0 auto 12px", width: 26, height: 26, borderRadius: 7, border: `1px solid ${C.line}`, background: C.paper, color: C.muted, cursor: "pointer", display: "grid", placeItems: "center", fontSize: 12 }}>›</button>
        )}
      </aside>

      {/* ── MAIN ── */}
      <main style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
        <header style={{ display: "flex", alignItems: "center", gap: 12, padding: isMobile ? "14px 20px 14px 62px" : "15px 26px", borderBottom: `1px solid ${C.line}`, position: "sticky", top: 0, background: C.paper, zIndex: 10 }}>
          <div style={{ minWidth: 0 }}>
            <div style={label}>{tr("chrome.workRoom")}</div>
            <h1 style={{ fontSize: 17, fontWeight: 800, letterSpacing: "-.3px", margin: "3px 0 0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{sectionLabel}</h1>
          </div>
          <span style={{ flex: 1 }} />
          {project.current_stage && <span style={pill(C.lime, "#0a0a0a")}>{project.current_stage}</span>}
          <span style={pill(C.paper2, C.muted2)} title={tr("chrome.yourRole")}>{tr("role." + role)}</span>
        </header>

        <div style={{ padding: "22px 26px 64px", maxWidth: 1120, width: "100%" }}>
          {/* LO MÍO */}
          {section === "mio" && (
            <div style={{ maxWidth: 720 }}>
              <h3 style={{ fontSize: 16, fontWeight: 800, margin: "0 0 4px" }}>{tr("mio.title")}</h3>
              <div style={{ fontSize: 12.5, color: C.muted2, marginBottom: 16 }}>{tr("mio.desc")}</div>
              {!personId && <Empty text={tr("mio.noPerson")} />}
              {personId && myOpenTasks.length === 0 && myDeliverables.length === 0 && <Empty text={tr("mio.nothing")} />}
              {myOpenTasks.length > 0 && (
                <div style={{ marginBottom: 18 }}>
                  <div style={{ ...label, marginBottom: 8 }}>{tr("mio.myTasks")} · {myOpenTasks.length}</div>
                  {myOpenTasks.map((t) => (
                    <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 11, padding: "11px 13px", background: C.paper, border: `1.5px solid ${C.line}`, borderRadius: 10, marginBottom: 7 }}>
                      {(can("task.manage") || can("task.mark_own"))
                        ? <button onClick={() => closeTask(t)} title={tr("btn.markDone")} style={{ width: 17, height: 17, borderRadius: 5, border: `1.5px solid ${C.muted}`, background: "transparent", cursor: "pointer", flex: "none" }} />
                        : <span style={{ width: 17, height: 17, borderRadius: 5, border: `1.5px solid ${C.line}`, flex: "none" }} />}
                      <span style={{ flex: 1, fontSize: 12.5 }}>{t.title}</span>
                      <span style={pill(statusTone(t.status).bg, statusTone(t.status).fg)}>{tr("ts." + t.status)}</span>
                    </div>
                  ))}
                </div>
              )}
              {myDeliverables.length > 0 && (
                <div>
                  <div style={{ ...label, marginBottom: 8 }}>{tr("mio.myDeliverables")} · {myDeliverables.length}</div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(260px,1fr))", gap: 12 }}>
                    {myDeliverables.map((d) => (
                      <div key={d.id} style={card()}>
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                          <b style={{ fontSize: 14, fontWeight: 800 }}>{d.title}</b>
                          <span style={statusPill(d.status)}>{statusLabel(d.status)}</span>
                        </div>
                        <Progress v={d.progress} />
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* RESUMEN */}
          {section === "resumen" && (emptyRoom ? (
            <div style={{ maxWidth: 720, display: "flex", flexDirection: "column", gap: 18 }}>
              <div>
                <h2 style={{ fontSize: 20, fontWeight: 800, letterSpacing: "-.3px", margin: "0 0 5px" }}>{tr("empty.title")}</h2>
                <div style={{ fontSize: 13, color: C.muted2 }}>{tr("empty.lead")}</div>
              </div>
              {/* heredado de la preventa */}
              <div style={{ background: C.paper, border: `1.5px solid ${C.line}`, borderRadius: 14, padding: "16px 18px" }}>
                <div style={{ ...label, marginBottom: 12 }}>{tr("empty.inheritedTitle")}</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
                  <InheritRow text={`${team.length} ${team.length === 1 ? tr("word.person") : tr("word.people")} ${tr("empty.withAccess")}`} />
                  {meta.driveUrl && <InheritRow text={tr("empty.drive")} />}
                  {meta.presaleSlug && <InheritRow text={tr("empty.presale")} />}
                  <InheritRow text={tr("empty.meetings")} />
                </div>
              </div>
              {/* estructura sugerida */}
              {suggestion && (
                <div style={{ background: C.paper, border: `1.5px solid ${C.line}`, borderRadius: 14, padding: "16px 18px" }}>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
                    <h3 style={{ fontSize: 15, fontWeight: 800, margin: 0 }}>{tr("empty.suggestedTitle")}</h3>
                    <span style={{ fontSize: 11, color: C.muted }}>{tr("empty.suggestedNote")}</span>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 14 }}>
                    {suggestion.phases.map((p, i) => (
                      <div key={i}>
                        <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                          <span style={{ width: 20, height: 20, borderRadius: 999, background: i === 0 ? C.lime : C.paper2, color: i === 0 ? "#0a0a0a" : C.muted2, display: "grid", placeItems: "center", fontSize: 10, fontWeight: 800 }}>{i + 1}</span>
                          <b style={{ fontSize: 13, fontWeight: 800 }}>{p.title}</b>
                        </div>
                        <div style={{ paddingLeft: 29, marginTop: 6, display: "flex", flexDirection: "column", gap: 5 }}>
                          {p.deliverables.map((d, j) => (
                            <div key={j} style={{ fontSize: 12, color: C.muted2, display: "flex", gap: 8, alignItems: "center" }}><span style={{ width: 5, height: 5, borderRadius: 999, background: C.muted, flexShrink: 0 }} />{d}</div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                  {can("room.configure")
                    ? <button onClick={approveStructure} disabled={approving} style={{ ...btn(C.lime, "#0a0a0a"), marginTop: 16, padding: "9px 15px", opacity: approving ? 0.6 : 1, cursor: approving ? "default" : "pointer" }}>{tr("empty.approve")}</button>
                    : <Note text={tr("empty.pmWillApprove")} />}
                </div>
              )}
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 11 }}>
              <Stat l={tr("stat.avance")} v={`${stats.avance}%`} lime animate={{ to: stats.avance, suffix: "%" }} />
              <Stat l={tr("stat.entregables")} v={`${stats.dDone}/${stats.dTot}`} />
              <Stat l={tr("stat.tareasHechas")} v={`${stats.tDone}/${stats.tTot}`} />
              <Stat l={tr("stat.bloqueadas")} v={String(stats.blocked)} warn={stats.blocked > 0} animate={{ to: stats.blocked }} />
            </div>
          ))}

          {/* PLAN */}
          {section === "plan" && (
            <div style={{ maxWidth: 760 }}>
              {phases.length === 0 && <Empty text={tr("plan.noPhases")} />}
              {phases.map((p) => {
                const dels = deliverables.filter((d) => d.phase_id === p.id);
                const st = p.status === "done" ? { i: "✓", bg: C.lime, fg: "#0a0a0a" } : p.status === "in_progress" ? { i: "•", bg: C.paper, fg: C.warn } : { i: "○", bg: C.paper2, fg: C.muted };
                const open = openPhase === p.id;
                return (
                  <div key={p.id} style={{ background: C.paper, border: `1.5px solid ${C.line}`, borderRadius: 12, overflow: "hidden", marginBottom: 10 }}>
                    <button onClick={() => setOpenPhase(open ? null : p.id)} style={{ width: "100%", display: "flex", alignItems: "center", gap: 12, padding: "13px 15px", background: "transparent", border: 0, cursor: "pointer", fontFamily: "inherit" }}>
                      <span style={{ width: 22, height: 22, borderRadius: 999, display: "grid", placeItems: "center", fontSize: 11, fontWeight: 900, background: st.bg, color: st.fg, border: p.status === "in_progress" ? `2px solid ${C.warn}` : "none" }}>{st.i}</span>
                      <b style={{ fontSize: 14, fontWeight: 800 }}>{p.title}</b>
                      <span style={{ ...label, marginLeft: 4 }}>{p.status === "done" ? tr("plan.doneTag") : p.status === "in_progress" ? tr("plan.inProgressTag") : tr("plan.upcomingTag")}</span>
                      <span style={{ flex: 1 }} />
                      <span style={{ color: C.muted, transform: open ? "rotate(90deg)" : "none", transition: "transform .15s" }}>▸</span>
                    </button>
                    {open && (
                      <div style={{ padding: "0 15px 12px 49px" }}>
                        {dels.length === 0 && <div style={{ fontSize: 12, color: C.muted, padding: "6px 0" }}>{tr("plan.noDeliverablesInPhase")}</div>}
                        {dels.map((d) => (
                          <div key={d.id} style={{ display: "flex", alignItems: "center", gap: 9, padding: "8px 0", borderTop: `1px solid ${C.lineSoft}`, fontSize: 12.5, fontWeight: 600 }}>
                            <span style={{ width: 7, height: 7, borderRadius: 999, background: statusDot(d.status) }} />
                            {d.title}<span style={{ marginLeft: "auto", ...label }}>{d.progress}%</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* ENTREGABLES */}
          {section === "entregables" && (
            <Section
              title={tr("nav.entregables")} tr={tr}
              view={dView} setView={setDView}
              onCreate={can("structure.edit") ? createDeliverable : undefined} createLabel={tr("btn.addDeliverable")}
            >
              {dView === "list" ? (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(260px,1fr))", gap: 12 }}>
                  {deliverables.map((d) => {
                    const dTasks = tasks.filter((t) => t.deliverable_id === d.id);
                    const open = expandedDeliv === d.id;
                    return (
                      <div key={d.id} style={card()}>
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                          <b style={{ fontSize: 14, fontWeight: 800 }}>{d.title}</b>
                          <span style={statusPill(d.status)}>{statusLabel(d.status)}</span>
                        </div>
                        <Progress v={d.progress} />
                        {dTasks.length > 0 && (
                          <button onClick={() => setExpandedDeliv(open ? null : d.id)} style={{ display: "flex", alignItems: "center", gap: 6, background: "transparent", border: 0, padding: 0, cursor: "pointer", fontFamily: "inherit", ...label, color: C.muted2 }}>
                            <span style={{ transform: open ? "rotate(90deg)" : "none", transition: "transform .15s" }}>▸</span>
                            {dTasks.filter((t) => t.status === "done").length}/{dTasks.length} {tr("word.tasks")}
                          </button>
                        )}
                        {open && dTasks.length > 0 && (
                          <div style={{ display: "flex", flexDirection: "column", gap: 6, borderTop: `1px solid ${C.lineSoft}`, paddingTop: 9 }}>
                            {dTasks.map((t) => (
                              <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
                                <span style={{ width: 6, height: 6, borderRadius: 999, background: statusTone(t.status).fg, flexShrink: 0 }} />
                                <span style={{ flex: 1, textDecoration: t.status === "done" ? "line-through" : "none", color: t.status === "done" ? C.muted : C.ink }}>{t.title}</span>
                                <span style={label}>{tr("ts." + t.status)}</span>
                              </div>
                            ))}
                          </div>
                        )}
                        {d.status === "delivered" && can("deliverable.accept") && (
                          <button onClick={() => acceptDeliverable(d.id)} style={btn(C.lime, "#0a0a0a")}>{tr("btn.acceptDeliverable")}</button>
                        )}
                      </div>
                    );
                  })}
                  {deliverables.length === 0 && <Empty text={tr("deliv.none")} />}
                </div>
              ) : (
                <Kanban cols={delivCols} items={deliverables} draggable={can("deliverable.move")}
                  onDrop={(id, to) => { const d = deliverables.find((x) => x.id === id); if (d && d.status !== to) moveDeliverable(id, to, d.status); }}
                  renderCard={(d) => (<><div style={{ fontSize: 12, fontWeight: 700 }}>{d.title}</div><div style={{ ...label, marginTop: 6 }}>{d.progress}%</div></>)} />
              )}
              {!can("deliverable.move") && dView === "kanban" && <Note text={tr("deliv.cantMove")} />}
            </Section>
          )}

          {/* TAREAS */}
          {section === "tareas" && (
            <Section
              title={tr("nav.tareas")} tr={tr}
              view={tView} setView={setTView}
              onCreate={can("task.crud") ? createTask : undefined} createLabel={tr("btn.addTask")}
            >
              {tView === "list" ? (
                <div style={{ maxWidth: 680 }}>
                  {["todo", "doing", "blocked", "done"].map((stt) => {
                    const items = tasks.filter((t) => t.status === stt);
                    if (!items.length) return null;
                    return (
                      <div key={stt} style={{ marginBottom: 14 }}>
                        <div style={{ ...label, marginBottom: 7 }}>{tr("ts." + stt)}</div>
                        {items.map((t) => (
                          <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 11, padding: "11px 13px", background: C.paper, border: `1.5px solid ${C.line}`, borderRadius: 10, marginBottom: 7 }}>
                            {t.status !== "done" && (can("task.manage") || can("task.mark_own"))
                              ? <button onClick={() => closeTask(t)} title={tr("btn.markDone")} style={{ width: 17, height: 17, borderRadius: 5, border: `1.5px solid ${C.muted}`, background: "transparent", cursor: "pointer", flex: "none" }} />
                              : <span style={{ width: 17, height: 17, borderRadius: 5, background: t.status === "done" ? C.lime : "transparent", border: `1.5px solid ${t.status === "done" ? C.lime : C.line}`, display: "grid", placeItems: "center", fontSize: 11, fontWeight: 900, color: "#0a0a0a", flex: "none" }}>{t.status === "done" ? "✓" : ""}</span>}
                            <span style={{ flex: 1, fontSize: 12.5, textDecoration: t.status === "done" ? "line-through" : "none", color: t.status === "done" ? C.muted : C.ink }}>{t.title}</span>
                            {t.assignee_side === "client" && <span style={pill(C.paper2, C.muted2)}>{tr("tasks.client")}</span>}
                            {t.closed_via && <span style={{ ...label, color: t.closed_via === "evidence" ? C.limeInk : C.muted }}>{t.closed_via === "evidence" ? tr("tasks.evidence") : tr("tasks.attested")}</span>}
                          </div>
                        ))}
                      </div>
                    );
                  })}
                  {tasks.length === 0 && <Empty text={tr("tasks.none")} />}
                </div>
              ) : (
                <Kanban cols={taskCols} items={tasks} draggable={can("task.move")}
                  onDrop={(id, to) => { const t = tasks.find((x) => x.id === id); if (t && t.status !== to) moveTask(id, to, t.status); }}
                  renderCard={(t) => (<><div style={{ fontSize: 12, fontWeight: 700 }}>{t.title}</div>{t.assignee_side === "client" && <div style={{ ...label, marginTop: 6 }}>{tr("tasks.client")}</div>}</>)} />
              )}
              {!can("task.move") && tView === "kanban" && <Note text={tr("tasks.cantMove")} />}
            </Section>
          )}

          {/* DECISIONES */}
          {section === "decisiones" && (
            <div style={{ maxWidth: 720 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 11, marginBottom: 14 }}>
                <h3 style={{ fontSize: 16, fontWeight: 800, margin: 0 }}>{tr("dec.title")}</h3><span style={{ flex: 1 }} />
                {can("decision.manage") && <button onClick={createDecision} style={btn(C.paper, C.muted2, true)}>{tr("btn.addDecision")}</button>}
              </div>
              {decisions.length === 0 && <Empty text={tr("dec.none")} />}
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {decisions.map((d) => {
                  const del = deliverables.find((x) => x.id === d.deliverable_id);
                  const open = d.status === "open";
                  const exp = expandedDecision === d.id;
                  const hasBody = !!(d.context || d.source_ref || (Array.isArray(d.participants) && d.participants.length > 0));
                  return (
                    <div key={d.id} style={{ background: open ? C.warnSoft : C.paper, border: `1.5px solid ${open ? "#f0e0b0" : C.line}`, borderRadius: 12, padding: "13px 15px" }}>
                      <button onClick={() => setExpandedDecision(exp ? null : d.id)} style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", width: "100%", textAlign: "left", background: "transparent", border: 0, padding: 0, cursor: "pointer", fontFamily: "inherit" }}>
                        {hasBody && <span style={{ color: C.muted, transform: exp ? "rotate(90deg)" : "none", transition: "transform .15s", fontSize: 11 }}>▸</span>}
                        <b style={{ fontSize: 14, fontWeight: 800 }}>{d.title}</b>
                        {del && <span style={{ ...label, color: "#4a5bc0", background: "rgba(91,107,214,.11)", padding: "2px 7px", borderRadius: 5 }}>↳ {del.title}</span>}
                        <span style={{ flex: 1 }} />
                        <span style={pill(open ? C.warnSoft : C.okSoft, open ? C.warn : C.ok)}>{open ? tr("dec.open") : tr("dec.closed")}</span>
                      </button>
                      {exp && (
                        <div style={{ paddingLeft: hasBody ? 19 : 0 }}>
                          {d.context && <div style={{ fontSize: 12.5, color: C.muted2, marginTop: 8, lineHeight: 1.5 }}>{d.context}</div>}
                          {d.source_ref && <div style={{ fontSize: 9, color: C.muted, marginTop: 6, fontWeight: 600, letterSpacing: ".3px", textTransform: "uppercase" }}>↳ {d.source_ref}</div>}
                          {Array.isArray(d.participants) && d.participants.length > 0 && (
                            <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 9, flexWrap: "wrap" }}>
                              <span style={label}>{tr("dec.present")}</span>
                              {d.participants.map((p, i) => <span key={i} style={{ width: 22, height: 22, borderRadius: 999, background: p.side === "client" ? "#495057" : C.limeInk, color: "#fff", display: "grid", placeItems: "center", fontSize: 8, fontWeight: 700 }}>{p.initials || "?"}</span>)}
                            </div>
                          )}
                          {open && (can("decision.manage") || can("decision.resolve_own")) && (
                            <button onClick={() => resolveDecision(d.id)} style={{ ...btn(C.lime, "#0a0a0a"), marginTop: 11 }}>{tr("btn.resolveDecision")}</button>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* MATERIALES */}
          {section === "materiales" && (
            <div>
              <h3 style={{ fontSize: 16, fontWeight: 800, margin: "0 0 14px" }}>{tr("mat.title")}</h3>
              {initialMaterials.length === 0 && <Empty text={tr("mat.none")} />}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(240px,1fr))", gap: 10 }}>
                {initialMaterials.map((m) => (
                  <a key={m.id} href={m.url ?? undefined} target="_blank" rel="noreferrer"
                    style={{ display: "flex", alignItems: "center", gap: 11, background: C.paper, border: `1.5px solid ${C.line}`, borderRadius: 12, padding: "11px 14px", textDecoration: "none", color: "inherit", cursor: m.url ? "pointer" : "default" }}>
                    <span style={{ width: 32, height: 32, borderRadius: 7, background: C.paper2, display: "grid", placeItems: "center", fontSize: 8, fontWeight: 800, color: C.muted2 }}>{(m.mime_type || "DOC").split("/").pop()?.slice(0, 4).toUpperCase()}</span>
                    <span style={{ flex: 1, minWidth: 0 }}><b style={{ fontSize: 12.5, fontWeight: 700, display: "block", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{m.title}</b><small style={{ fontSize: 10, color: C.muted }}>{m.category ? tr("matcat." + m.category, m.category.replace(/_/g, " ")) : (m.folder_name || "")}</small></span>
                    {m.url ? <span style={{ color: C.muted }}>↗</span> : <span style={label}>{tr("mat.readonly")}</span>}
                  </a>
                ))}
              </div>
            </div>
          )}

          {/* PROYECTO (Origen · Equipo · Administrativo) */}
          {section === "proyecto" && (
            <div style={{ maxWidth: 860, display: "flex", flexDirection: "column", gap: 22 }}>
              {/* ORIGEN */}
              <Block title={tr("proj.origin")} note={tr("proj.originNote")}>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(220px,1fr))", gap: "14px 22px" }}>
                  <Field k={tr("field.org")} v={meta.orgName} />
                  <Field k={tr("field.location")} v={meta.orgLocation} />
                  <Field k={tr("field.engagement")} v={meta.engagementModel} />
                  <Field k={tr("field.type")} v={meta.projectType} />
                  <Field k={tr("field.geography")} v={meta.geography} />
                  <Field k={tr("field.start")} v={meta.startDate} />
                  <Field k={tr("field.end")} v={meta.targetEndDate} />
                  <Field k={tr("field.code")} v={meta.projectCode} />
                  <Field k={tr("field.focus")} v={meta.currentFocus} />
                  <Field k={tr("field.milestone")} v={meta.nextMilestone} />
                </div>
                {(meta.driveUrl || meta.presaleSlug || meta.orgWebsite) && (
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 15 }}>
                    {meta.driveUrl && <a href={meta.driveUrl} target="_blank" rel="noreferrer" style={linkChip}>{tr("proj.driveFolder")}</a>}
                    {meta.presaleSlug && <a href={`/hall/${meta.presaleSlug}`} style={linkChip}>{tr("proj.presaleRoom")}</a>}
                    {meta.orgWebsite && <a href={meta.orgWebsite} target="_blank" rel="noreferrer" style={linkChip}>{tr("proj.clientWeb")}</a>}
                  </div>
                )}
              </Block>

              {/* EQUIPO */}
              <Block title={tr("proj.team")} note={`${team.length} ${team.length === 1 ? tr("word.person") : tr("word.people")} ${tr("word.access")}`}>
                {team.length === 0 && <Empty text={tr("proj.noMembers")} />}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(240px,1fr))", gap: 10 }}>
                  {team.map((m) => (
                    <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 11, background: C.paper, border: `1.5px solid ${C.line}`, borderRadius: 12, padding: "11px 13px" }}>
                      <Avatar name={m.name} photoUrl={m.photoUrl} side={m.side} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <b style={{ fontSize: 12.5, fontWeight: 700, display: "block", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{m.name}</b>
                        <small style={{ fontSize: 10.5, color: C.muted }}>{m.jobTitle || (m.side === "client" ? tr("side.client") : tr("side.team"))}</small>
                      </div>
                      <span style={pill(m.side === "client" ? C.paper2 : C.limePaper, m.side === "client" ? C.muted2 : C.limeInk)}>{tr("role." + m.role)}</span>
                    </div>
                  ))}
                </div>
              </Block>

              {/* ADMINISTRATIVO */}
              <Block title={tr("proj.admin")}>
                {billing.company && (
                  <div style={{ marginBottom: billing.client ? 18 : 0 }}>
                    <div style={{ ...label, marginBottom: 10 }}>{tr("proj.chTitle")}</div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(220px,1fr))", gap: "14px 22px" }}>
                      <Field k={tr("bill.legalName")} v={billing.company.legalName} />
                      <Field k={tr("bill.taxId")} v={billing.company.taxId} />
                      <Field k={tr("bill.vat")} v={billing.company.vatNumber} />
                      <Field k={tr("bill.address")} v={billing.company.address} />
                      <Field k={tr("bill.billingEmail")} v={billing.company.billingEmail} />
                    </div>
                    {billing.company.publicNote && <div style={{ fontSize: 11.5, color: C.muted2, marginTop: 10, lineHeight: 1.5 }}>{billing.company.publicNote}</div>}
                  </div>
                )}
                {billing.client ? (
                  <div>
                    <div style={{ ...label, marginBottom: 10 }}>{tr("proj.clientBillingTitle")}</div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(220px,1fr))", gap: "14px 22px" }}>
                      <Field k={tr("bill.legalName")} v={billing.client.legalName} />
                      <Field k={tr("bill.taxId")} v={billing.client.taxId} />
                      <Field k={tr("bill.address")} v={billing.client.address} />
                      <Field k={tr("bill.billingEmail")} v={billing.client.billingEmail} />
                      <Field k={tr("bill.contact")} v={billing.client.billingContact} />
                      <Field k={tr("bill.po")} v={billing.client.poReference} />
                    </div>
                  </div>
                ) : (can("internal.view") || role === "client") ? (
                  <Note text={tr("proj.clientBillingEmpty")} />
                ) : null}
                {!billing.company && !billing.client && <Empty text={tr("proj.noAdmin")} />}
              </Block>
            </div>
          )}

          {/* ACTIVIDAD (solo PM) */}
          {section === "actividad" && can("analytics.view") && (
            <div style={{ maxWidth: 720 }}>
              <h3 style={{ fontSize: 16, fontWeight: 800, margin: "0 0 6px" }}>{tr("act.title")}</h3>
              <div style={{ fontSize: 12.5, color: C.muted2, marginBottom: 16 }}>{tr("act.desc")}</div>
              {initialEvents.length === 0 && <Empty text={tr("act.none")} />}
              <div style={{ background: C.paper, border: `1.5px solid ${C.line}`, borderRadius: 12, padding: "6px 16px" }}>
                {initialEvents.map((e) => (
                  <div key={e.id} style={{ display: "flex", alignItems: "flex-start", gap: 11, padding: "10px 0", borderTop: `1px solid ${C.lineSoft}` }}>
                    <span style={{ ...label, fontFamily: "ui-monospace,monospace", minWidth: 74, paddingTop: 1 }}>{e.created_at.slice(0, 10)}</span>
                    <span style={{ flex: 1, fontSize: 12.5 }}>{e.summary || `${e.verb} ${e.target_type}`}</span>
                    <span style={label}>{e.actor_role || ""}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </main>

      {toast && (
        <div style={{ position: "fixed", left: "50%", bottom: 24, transform: "translateX(-50%)", display: "flex", alignItems: "center", gap: 14, background: C.ink, color: "#fff", padding: "10px 12px 10px 16px", borderRadius: 11, fontSize: 12.5, fontWeight: 600, boxShadow: "0 10px 30px rgba(0,0,0,.3)", zIndex: 100 }}>
          <span>{toast.msg}</span>
          {toast.undo && (
            <button onClick={() => { const u = toast.undo; setToast(null); u?.(); }}
              style={{ fontFamily: "inherit", fontSize: 11, fontWeight: 800, letterSpacing: ".3px", textTransform: "uppercase", color: "#0a0a0a", background: C.lime, border: 0, borderRadius: 7, padding: "5px 11px", cursor: "pointer" }}>{tr("btn.undo")}</button>
          )}
        </div>
      )}
    </div>
  );

  /* ── helpers de color ── */
  function statusDot(s: string) { return s === "at_risk" ? C.warn : s === "delivered" || s === "accepted" ? C.ok : s === "in_progress" ? C.limeInk : C.muted; }
  function statusLabel(s: string) { return tr("ds." + s); }
  function statusPill(s: string): CSSProperties {
    if (s === "at_risk") return pill(C.warnSoft, C.warn);
    if (s === "delivered" || s === "accepted") return pill(C.okSoft, C.ok);
    if (s === "in_progress") return pill(C.limePaper, C.limeInk);
    return pill(C.paper2, C.muted2);
  }
}

/* ── helpers de presentación ── */
function cleanName(name: string | null): string { return (name ?? "Sala").replace(/^\[[^\]]*\]\s*/, "").trim() || "Sala"; }

/* ── sub-componentes ── */
function Stat({ l, v, lime, warn, animate }: { l: string; v: string; lime?: boolean; warn?: boolean; animate?: { to: number; suffix?: string } }) {
  return (
    <div style={{ background: C.paper, border: `1.5px solid ${C.line}`, borderRadius: 12, padding: "15px 16px" }}>
      <div style={label}>{l}</div>
      <div style={{ fontSize: "1.5rem", fontWeight: 900, letterSpacing: "-1px", marginTop: 8, color: lime ? C.limeInk : warn ? C.warn : C.ink }}>
        {animate ? <AnimatedNumber to={animate.to} suffix={animate.suffix} /> : v}
      </div>
    </div>
  );
}
function AnimatedNumber({ to, suffix = "" }: { to: number; suffix?: string }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    let raf = 0; let start = 0;
    const tick = (now: number) => {
      if (!start) start = now;
      const p = Math.min(1, (now - start) / 600);
      setN(Math.round(to * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [to]);
  return <>{n}{suffix}</>;
}
function Section({ title, tr, view, setView, onCreate, createLabel, children }: { title: string; tr: TFn; view: "list" | "kanban"; setView: (v: "list" | "kanban") => void; onCreate?: () => void; createLabel: string; children: ReactNode }) {
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 11, marginBottom: 14 }}>
        <h3 style={{ fontSize: 16, fontWeight: 800, margin: 0 }}>{title}</h3>
        <span style={{ flex: 1 }} />
        <div style={{ display: "inline-flex", background: C.paper, border: `1.5px solid ${C.line}`, borderRadius: 8, padding: 2 }}>
          {(["list", "kanban"] as const).map((v) => (
            <button key={v} onClick={() => setView(v)} style={{ fontFamily: "inherit", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".3px", border: 0, borderRadius: 6, padding: "5px 11px", cursor: "pointer", background: view === v ? C.ink : "transparent", color: view === v ? "#fff" : C.muted }}>{v === "list" ? tr("view.list") : tr("view.kanban")}</button>
          ))}
        </div>
        {onCreate && <button onClick={onCreate} style={btn(C.paper, C.muted2, true)}>{createLabel}</button>}
      </div>
      {children}
    </div>
  );
}
function Kanban<T extends { id: string; status: string }>({ cols, items, draggable, onDrop, renderCard }: { cols: { key: string; label: string; dot: string }[]; items: T[]; draggable: boolean; onDrop: (id: string, to: string) => void; renderCard: (item: T) => ReactNode }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: `repeat(${cols.length},minmax(150px,1fr))`, gap: 11, alignItems: "start", overflowX: "auto" }}>
      {cols.map((col) => {
        const its = items.filter((i) => i.status === col.key);
        return (
          <div key={col.key}
            onDragOver={(e) => { if (draggable) e.preventDefault(); }}
            onDrop={(e) => { if (!draggable) return; const id = e.dataTransfer.getData("text/plain"); if (id) onDrop(id, col.key); }}
            style={{ background: C.paper2, border: `1.5px solid ${C.line}`, borderRadius: 12, padding: 8, minHeight: 60 }}>
            <div style={{ ...label, padding: "6px 7px 10px", display: "flex", alignItems: "center", gap: 7 }}>
              <span style={{ width: 8, height: 8, borderRadius: 999, background: col.dot }} />{col.label}<span style={{ marginLeft: "auto", background: "rgba(0,0,0,.08)", padding: "1px 7px", borderRadius: 8 }}>{its.length}</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
              {its.map((i) => (
                <div key={i.id} draggable={draggable}
                  onDragStart={(e) => e.dataTransfer.setData("text/plain", i.id)}
                  style={{ background: C.paper, border: `1.5px solid ${C.line}`, borderRadius: 9, padding: "10px 11px", cursor: draggable ? "grab" : "default" }}>
                  {renderCard(i)}
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
function Progress({ v }: { v: number }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
      <div style={{ flex: 1, height: 6, background: C.paper2, borderRadius: 4, overflow: "hidden" }}><div style={{ width: `${v}%`, height: "100%", background: C.lime }} /></div>
      <span style={{ fontSize: 11, fontWeight: 800, color: C.muted2 }}>{v}%</span>
    </div>
  );
}
function Empty({ text }: { text: string }) { return <div style={{ padding: "26px 0", textAlign: "center", color: C.muted, fontSize: 13 }}>{text}</div>; }
function InheritRow({ text }: { text: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 12.5, color: C.ink }}>
      <span style={{ width: 18, height: 18, borderRadius: 999, background: C.lime, color: "#0a0a0a", display: "grid", placeItems: "center", fontSize: 10, fontWeight: 900, flexShrink: 0 }}>✓</span>
      {text}
    </div>
  );
}
function Block({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <div style={{ background: C.paper, border: `1.5px solid ${C.line}`, borderRadius: 14, padding: "17px 18px" }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 14 }}>
        <h3 style={{ fontSize: 15, fontWeight: 800, margin: 0 }}>{title}</h3>
        {note && <span style={{ fontSize: 11, color: C.muted }}>{note}</span>}
      </div>
      {children}
    </div>
  );
}
function Field({ k, v }: { k: string; v: string | null | undefined }) {
  if (!v) return null;
  return (
    <div>
      <div style={label}>{k}</div>
      <div style={{ fontSize: 12.5, fontWeight: 600, color: C.ink, marginTop: 3, lineHeight: 1.45, wordBreak: "break-word" }}>{v}</div>
    </div>
  );
}
function Avatar({ name, photoUrl, side }: { name: string; photoUrl: string | null; side: "team" | "client" }) {
  const init = name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "·";
  if (photoUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={photoUrl} alt="" style={{ width: 34, height: 34, borderRadius: 999, objectFit: "cover", flexShrink: 0 }} />;
  }
  return <span style={{ width: 34, height: 34, borderRadius: 999, flexShrink: 0, background: side === "client" ? "#495057" : C.limeInk, color: "#fff", display: "grid", placeItems: "center", fontSize: 11, fontWeight: 700 }}>{init}</span>;
}
function Note({ text }: { text: string }) { return <div style={{ marginTop: 11, fontSize: 11, color: C.muted, fontWeight: 600 }}>{text}</div>; }
function card(): CSSProperties { return { background: C.paper, border: `1.5px solid ${C.line}`, borderRadius: 12, padding: 15, display: "flex", flexDirection: "column", gap: 10 }; }
function btn(bg: string, fg: string, bordered?: boolean): CSSProperties { return { fontFamily: "inherit", fontSize: 11, fontWeight: 800, letterSpacing: ".3px", textTransform: "uppercase", padding: "7px 13px", borderRadius: 8, border: bordered ? `1.5px solid ${C.line}` : "none", background: bg, color: fg, cursor: "pointer" }; }
