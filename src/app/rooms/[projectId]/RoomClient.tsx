"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import Link from "next/link";
import { UserButton } from "@clerk/nextjs";
import { makeT, type Lang, type TFn } from "@/lib/room-i18n";
import type { SuggestedStructure } from "@/lib/room-structure";

/* ── tipos (espejo de las tablas del Bloque 0) ── */
type Phase = { id: string; title: string; status: string; position: number };
type Deliverable = { id: string; title: string; description: string | null; status: string; progress: number; phase_id: string | null; owner_person_id: string | null; due_date: string | null; accepted_at: string | null; accepted_by: string | null; position: number };
type Task = { id: string; title: string; status: string; assignee_side: string; deliverable_id: string | null; owner_person_id: string | null; closed_via: string | null; closed_by: string | null; evidence_ref: string | null; start_date: string | null; due_date: string | null; depends_on: string | null; position: number };
type Participant = { initials?: string; name?: string; side?: string };
type Decision = { id: string; title: string; context: string | null; status: string; deliverable_id: string | null; participants: Participant[] | null; source_ref: string | null; resolved_by: string | null };
type Material = { id: string; title: string; url: string | null; mime_type: string | null; category: string | null; folder_name: string | null; modified_at: string | null };
type DetailTarget = { kind: "task"; id: string } | { kind: "deliverable"; id: string } | null;
type EventRow = { id: string; actor_email: string | null; actor_role: string | null; verb: string; target_type: string; summary: string | null; created_at: string };
type RoomSummary = { id: string; name: string | null; slug: string | null; stage: string | null };
type RoomProjectMeta = { orgName: string | null; orgLocation: string | null; orgWebsite: string | null; engagementModel: string | null; projectType: string | null; geography: string | null; startDate: string | null; targetEndDate: string | null; projectCode: string | null; driveUrl: string | null; presaleSlug: string | null; currentFocus: string | null; nextMilestone: string | null };
type RoomTeamMember = { id: string; name: string; email: string | null; role: string; jobTitle: string | null; photoUrl: string | null; side: "team" | "client" };
type RoomBilling = { company: { legalName: string | null; taxId: string | null; vatNumber: string | null; address: string | null; billingEmail: string | null; publicNote: string | null } | null; client: { legalName: string | null; taxId: string | null; address: string | null; billingEmail: string | null; billingContact: string | null; poReference: string | null } | null };
type Meeting = { id: string; title: string; date: string | null; summary: string | null; url: string | null; platform: string | null; kind: string; durationMinutes: number | null; attendees: string[] };
type EvidenceItem = { id: string; sourceId: string; statement: string | null; type: string | null; workstream: string | null; people: string[] };
type Suggestion = { id: string; proposal_kind: string | null; item_type: string | null; summary: string | null; rationale: string | null; source_refs: string[] | null; created_at: string };

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
  meetings: Meeting[];
  evidence: EvidenceItem[];
  suggestions: Suggestion[];
  heroNote: string | null;
  initialPhases: Phase[];
  initialDeliverables: Deliverable[];
  initialTasks: Task[];
  initialDecisions: Decision[];
  initialMaterials: Material[];
  initialEvents: EventRow[];
};

/* tipografía calcada de room-full.html (--sans / --mono) */
const FONT_SANS = `-apple-system, "Inter", "Segoe UI", Roboto, system-ui, sans-serif`;
const FONT_MONO = `ui-monospace, Consolas, "SF Mono", monospace`;

/* ── tokens de la sala (calcados de la maqueta room-full.html) ── */
const C = {
  ink: "#0e0e0e", paper: "#ffffff", paper1: "#ffffff", paper2: "#ecece4", bg: "#eeeee8",
  line: "#d8d8d0", lineSoft: "#ececE4", muted: "#6b6b6b", muted2: "#4a4a44",
  lime: "#c8f55a", limeSoft: "#e7f9a8", limePaper: "rgba(200,245,90,.32)", limeInk: "#3a8c00",
  ok: "#166534", okSoft: "#dcfce7", warn: "#b45309", warnSoft: "#fff3cd",
  danger: "#991b1b", dangerSoft: "#fee2e2", mine: "#4258c9", minePaper: "rgba(66,88,201,.12)",
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
/* título de tarjeta que abre el detalle sin romper el arrastre del kanban */
const cardTitleBtn: CSSProperties = { font: "inherit", color: "inherit", background: "transparent", border: 0, padding: 0, textAlign: "left", cursor: "pointer" };
const linkChip: CSSProperties = { fontSize: 11, fontWeight: 700, color: C.muted2, background: C.paper, border: `1.5px solid ${C.line}`, borderRadius: 8, padding: "6px 11px", textDecoration: "none" };

function statusTone(s: string): { bg: string; fg: string } {
  if (s === "doing") return { bg: C.limePaper, fg: C.limeInk };
  if (s === "blocked") return { bg: C.warnSoft, fg: C.warn };
  if (s === "done") return { bg: C.okSoft, fg: C.ok };
  return { bg: C.paper2, fg: C.muted2 };
}

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);

async function api(path: string, method: string, body?: unknown) {
  const res = await fetch(path, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error || `Error ${res.status}`);
  return json;
}

type SectionKey = "mio" | "resumen" | "plan" | "entregables" | "tareas" | "decisiones" | "materiales" | "reuniones" | "proyecto" | "actividad";

const NAV: { key: SectionKey; label: string; icon: string; pmOnly?: boolean }[] = [
  { key: "mio", label: "Lo mío", icon: "✦" },
  { key: "resumen", label: "Resumen", icon: "◈" },
  { key: "plan", label: "Plan", icon: "◆" },
  { key: "entregables", label: "Entregables", icon: "◧" },
  { key: "tareas", label: "Tareas", icon: "✓" },
  { key: "decisiones", label: "Decisiones", icon: "◉" },
  { key: "materiales", label: "Materiales", icon: "▤" },
  { key: "actividad", label: "Actividad", icon: "◫", pmOnly: true },
  { key: "proyecto", label: "Proyecto", icon: "◍" },
];

/* íconos SVG del sidebar — calcados de room-full.html */
const ICON_PATHS: Record<string, ReactNode> = {
  desk: <><path d="M2.5 7 8 2.5 13.5 7" /><path d="M4 6.5V13h8V6.5" /></>,
  mio: <path d="M8 2.5l1.6 3.3 3.6.5-2.6 2.5.6 3.6L8 10.7 4.8 12.4l.6-3.6L2.8 6.3l3.6-.5z" />,
  resumen: <><rect x="2.5" y="2.5" width="4.5" height="4.5" rx="1" /><rect x="9" y="2.5" width="4.5" height="4.5" rx="1" /><rect x="2.5" y="9" width="4.5" height="4.5" rx="1" /><rect x="9" y="9" width="4.5" height="4.5" rx="1" /></>,
  plan: <><rect x="2.5" y="3.5" width="11" height="10" rx="1.5" /><path d="M2.5 6.5h11" /><path d="M5.5 2v3M10.5 2v3" /></>,
  entregables: <><path d="M8 2.5 14 5.5 8 8.5 2 5.5z" /><path d="M2 8.5 8 11.5 14 8.5" /><path d="M2 11 8 14 14 11" /></>,
  tareas: <><rect x="2.5" y="2.5" width="11" height="11" rx="2.5" /><path d="M5.4 8.2 7.2 10 10.7 6" /></>,
  decisiones: <><path d="M4 14V2.5" /><path d="M4 3.2h7.5l-1.7 2.4 1.7 2.4H4" /></>,
  materiales: <path d="M2.5 5.4c0-.8.6-1.4 1.4-1.4h2.1l1.4 1.5h4.7c.8 0 1.4.6 1.4 1.4v4.9c0 .8-.6 1.4-1.4 1.4H3.9c-.8 0-1.4-.6-1.4-1.4z" />,
  reuniones: <><circle cx="8" cy="8" r="5.5" /><path d="M8 4.8V8l2.2 1.3" /></>,
  proyecto: <><circle cx="8" cy="8" r="5.5" /><path d="M8 7.4v3.3M8 5.2v.1" /></>,
  actividad: <path d="M2.5 13.5V9.5M6 13.5V4.5M9.5 13.5V7.5M13 13.5V2.5" />,
};
function NavIcon({ k }: { k: string }) {
  return (
    <svg viewBox="0 0 16 16" style={{ width: 16, height: 16, stroke: "currentColor", fill: "none", strokeWidth: 1.5, strokeLinecap: "round", strokeLinejoin: "round" }}>
      {ICON_PATHS[k] ?? ICON_PATHS.resumen}
    </svg>
  );
}

/* matriz de capacidades por rol (espejo client de src/lib/project-roles.ts) — para el "Ver como" */
const CLIENT_MATRIX: Record<string, string[]> = {
  pm: ["room.view", "internal.view", "financial.view", "analytics.view", "task.mark_own", "task.manage", "task.move", "task.crud", "deliverable.move", "deliverable.accept", "structure.edit", "structure.suggest", "decision.comment", "decision.resolve_own", "decision.manage", "suggestion.view", "suggestion.confirm", "material.view", "material.download", "material.upload", "member.manage", "room.configure"],
  collaborator: ["room.view", "internal.view", "task.mark_own", "task.manage", "task.move", "task.crud", "deliverable.move", "structure.suggest", "decision.comment", "decision.resolve_own", "decision.manage", "suggestion.view", "material.view", "material.download", "material.upload"],
  client: ["room.view", "task.mark_own", "deliverable.accept", "decision.comment", "decision.resolve_own", "material.view", "material.download", "material.upload"],
  reader: ["room.view", "material.view"],
};
const ROLE_TABS: { key: string; label: string }[] = [
  { key: "pm", label: "PM" }, { key: "collaborator", label: "Colab" }, { key: "client", label: "Cliente" }, { key: "reader", label: "Lector" },
];

export function RoomClient({ projectId, role, capabilities, personId, defaultLang, emptyRoom, suggestion, project, rooms, meta, team, billing, meetings, evidence, suggestions, heroNote, initialPhases, initialDeliverables, initialTasks, initialDecisions, initialMaterials, initialEvents }: Props) {
  const [section, setSection] = useState<SectionKey>("resumen");
  const [suggs, setSuggs] = useState<Suggestion[]>(suggestions);
  const [approving, setApproving] = useState(false);
  const [deliverables, setDeliverables] = useState<Deliverable[]>(initialDeliverables);
  const [tasks, setTasks] = useState<Task[]>(initialTasks);
  const [decisions, setDecisions] = useState<Decision[]>(initialDecisions);
  const [phases, setPhases] = useState<Phase[]>(initialPhases);
  const [openPhase, setOpenPhase] = useState<string | null>(initialPhases.find((p) => p.status === "in_progress")?.id ?? null);
  const [dView, setDView] = useState<"list" | "kanban">("kanban");
  const [tView, setTView] = useState<"list" | "kanban">("kanban");
  const [toast, setToast] = useState<{ msg: string; undo?: () => void } | null>(null);
  const [expandedDeliv, setExpandedDeliv] = useState<string | null>(null);
  const [expandedDecision, setExpandedDecision] = useState<string | null>(() => initialDecisions.find((d) => d.status === "open")?.id ?? null);
  const [materials, setMaterials] = useState<Material[]>(initialMaterials);
  const [detail, setDetail] = useState<DetailTarget>(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

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

  const [viewRole, setViewRole] = useState(role);
  const effCaps = viewRole === role ? capabilities : (CLIENT_MATRIX[viewRole] ?? capabilities);
  const can = (c: string) => effCaps.includes(c);
  const base = `/api/rooms/${projectId}`;
  const tr = useMemo(() => makeT(lang), [lang]);
  const delivCols = useMemo(() => DELIV_COLS.map((c) => ({ ...c, label: tr("ds." + c.key) })), [tr]);
  const taskCols = useMemo(() => TASK_COLS.map((c) => ({ ...c, label: tr("ts." + c.key) })), [tr]);

  /* evidencia por reunión (source_id → items) para el detalle expandible */
  const [expandedMeeting, setExpandedMeeting] = useState<string | null>(null);
  const [showAllMeetings, setShowAllMeetings] = useState(false);
  const [showAllSuggestions, setShowAllSuggestions] = useState(false);
  const totalMeetingMinutes = useMemo(() => meetings.reduce((a, m) => a + (m.durationMinutes ?? 0), 0), [meetings]);
  const evidenceByMeeting = useMemo(() => {
    const m = new Map<string, EvidenceItem[]>();
    evidence.forEach((e) => { if (!m.has(e.sourceId)) m.set(e.sourceId, []); m.get(e.sourceId)!.push(e); });
    return m;
  }, [evidence]);
  const curatedSuggestions = useMemo(() => dedupeSuggestions(suggs), [suggs]);
  const visibleSuggestions = showAllSuggestions ? curatedSuggestions : curatedSuggestions.slice(0, 5);

  /* resolución de responsable (owner_person_id → miembro del equipo) para avatares */
  const memberById = useMemo(() => { const m = new Map<string, RoomTeamMember>(); team.forEach((x) => m.set(x.id, x)); return m; }, [team]);
  const ownerOf = (id: string | null) => (id ? memberById.get(id) ?? null : null);

  /* Materiales agrupados por categoría (calco .matg de la maqueta) */
  const matGroups = useMemo(() => {
    const map = new Map<string, Material[]>();
    materials.forEach((m) => { const c = m.category ?? "other"; if (!map.has(c)) map.set(c, []); map.get(c)!.push(m); });
    return [...map.entries()].map(([cat, items]) => ({ cat, label: cat === "other" ? (lang === "es" ? "Otros" : "Other") : tr("matcat." + cat, cat.replace(/_/g, " ")), items }));
  }, [materials, tr, lang]);

  /* Tareas agrupadas por responsable; sin responsable, por entregable (calco .owner) */
  const taskGroups = useMemo(() => {
    const groups: { key: string; name: string; color: string; init: string; tag: string; items: Task[] }[] = [];
    const idx = new Map<string, number>();
    for (const t of tasks) {
      const owner = t.owner_person_id ? memberById.get(t.owner_person_id) ?? null : null;
      const del = t.deliverable_id ? deliverables.find((d) => d.id === t.deliverable_id) : null;
      const key = owner ? "p:" + owner.id : del ? "d:" + del.id : t.assignee_side === "client" ? "client" : "un";
      if (!idx.has(key)) {
        const name = owner ? owner.name : del ? del.title : t.assignee_side === "client" ? tr("tasks.client") : (lang === "es" ? "Sin asignar" : "Unassigned");
        groups.push({
          key, name,
          color: owner ? avColor(owner.name) : del ? "#495057" : "#8a8a82",
          init: owner ? avInit(owner.name) : del ? "◧" : "·",
          tag: owner && del ? "· " + del.title : del ? (lang === "es" ? "· entregable" : "· deliverable") : "",
          items: [],
        });
        idx.set(key, groups.length - 1);
      }
      groups[idx.get(key)!].items.push(t);
    }
    return groups;
  }, [tasks, deliverables, memberById, tr, lang]);

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
    const prev = deliverables;
    setDeliverables((ds) => ds.map((d) => (d.id === id ? { ...d, status: "delivered" } : d)));
    try { await api(`${base}/deliverables`, "PATCH", { id, action: "revert_accept" }); flash(tr("toast.acceptUndone")); }
    catch (e) { setDeliverables(prev); flash((e as Error).message); }
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
    const prev = tasks;
    setTasks((ts) => ts.map((x) => (x.id === id ? { ...x, status: before, closed_via: null } : x)));
    try { await api(`${base}/tasks`, "PATCH", { id, action: "reopen" }); flash(tr("toast.taskReopened")); }
    catch (e) { setTasks(prev); flash((e as Error).message); }
  }
  async function createDeliverable() {
    if (!can("structure.edit")) return;
    const title = window.prompt(tr("prompt.newDeliverable"));
    if (!title?.trim()) return;
    try { const r = await api(`${base}/deliverables`, "POST", { title }); setDeliverables((ds) => [...ds, r.deliverable]); }
    catch (e) { flash((e as Error).message); }
  }
  async function createPhase() {
    if (!can("structure.edit")) return;
    const title = window.prompt(tr("prompt.newPhase"));
    if (!title?.trim()) return;
    try {
      const r = await api(`${base}/phases`, "POST", { title, position: phases.length });
      setPhases((ps) => [...ps, r.phase]);
    } catch (e) { flash((e as Error).message); }
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
    const prev = decisions;
    setDecisions((ds) => ds.map((d) => (d.id === id ? { ...d, status: "open" } : d)));
    try { await api(`${base}/decisions`, "PATCH", { id, action: "reopen" }); flash(tr("toast.decisionReopened")); }
    catch (e) { setDecisions(prev); flash((e as Error).message); }
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
      // Reload duro: la estructura recién materializada entra por SSR (el estado
      // cliente se inicializa una sola vez, así que un refresh no alcanza).
      window.location.reload();
    } catch (e) { flash((e as Error).message); setApproving(false); }
  }
  /* ── panel de detalle: guardar campos ── */
  // Sólo se mandan las claves que cambiaron: la API trata "ausente" como
  // "no tocar" y null como "limpiar", así que mandar el objeto entero borraría
  // lo que el usuario nunca abrió.
  async function saveTask(id: string, patch: Record<string, string | null>) {
    const r = await api(`${base}/tasks`, "PATCH", { id, action: "update", ...patch });
    setTasks((ts) => ts.map((t) => (t.id === id ? (r.task as Task) : t)));
    flash(tr("toast.saved"));
  }
  async function saveDeliverable(id: string, patch: Record<string, string | number | null>) {
    const r = await api(`${base}/deliverables`, "PATCH", { id, action: "update", ...patch });
    setDeliverables((ds) => ds.map((d) => (d.id === id ? (r.deliverable as Deliverable) : d)));
    flash(tr("toast.saved"));
  }

  /* ── materiales: subir ── */
  async function uploadMaterial(file: File) {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("title", file.name.replace(/\.[^.]+$/, ""));
      const res = await fetch(`${base}/materials`, { method: "POST", body: fd, headers: { "x-csrf-portal": "1" } });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || `Error ${res.status}`);
      setMaterials((ms) => [json.material as Material, ...ms]);
      flash(tr("toast.uploaded"));
    } catch (e) { flash((e as Error).message); }
    finally { setUploading(false); }
  }

  async function resolveSugg(id: string, action: "confirm" | "dismiss") {
    if (!can("suggestion.confirm")) return;
    const prev = suggs;
    setSuggs((s) => s.filter((x) => x.id !== id));
    try {
      const r = await api(`${base}/suggestions`, "PATCH", { id, action });
      if (action !== "confirm") return;
      // Confirmar aplica el cambio al estado: el toast dice qué quedó distinto.
      const c = r?.change as { before?: string | null; after?: string | null } | null;
      const detail = c?.after ? (c.before ? `${c.before} → ${c.after}` : c.after) : null;
      flash(detail ? `${tr("toast.suggConfirmed")} · ${clip(detail, 110)}` : tr("toast.suggConfirmed"));
    }
    catch (e) { setSuggs(prev); flash((e as Error).message); }
  }

  /* ── stats ── */
  const stats = useMemo(() => {
    const dDone = deliverables.filter((d) => d.status === "delivered" || d.status === "accepted").length;
    const avance = deliverables.length ? Math.round(deliverables.reduce((a, d) => a + (d.progress || 0), 0) / deliverables.length) : 0;
    const tDone = tasks.filter((t) => t.status === "done").length;
    return { avance, dDone, dTot: deliverables.length, tDone, tTot: tasks.length, blocked: tasks.filter((t) => t.status === "blocked").length };
  }, [deliverables, tasks]);

  const upcoming = useMemo(() => {
    const items: { key: string; title: string; due: string; kind: "deliverable" | "task" }[] = [];
    deliverables.forEach((d) => { if (d.due_date && d.status !== "accepted") items.push({ key: "d" + d.id, title: d.title, due: d.due_date, kind: "deliverable" }); });
    tasks.forEach((t) => { if (t.due_date && t.status !== "done") items.push({ key: "t" + t.id, title: t.title, due: t.due_date, kind: "task" }); });
    return items.sort((a, b) => a.due.localeCompare(b.due)).slice(0, 6);
  }, [deliverables, tasks]);
  const heroTitle = meta.currentFocus ?? cleanName(project.name);
  const heroSub = heroNote ?? (meta.nextMilestone ? `${tr("field.milestone")}: ${meta.nextMilestone}` : "");
  const gantt = useMemo(() => {
    // Rango completo del proyecto (inicio → fin + margen); la vista scrollea y se centra en HOY (±3 meses visibles).
    const dated = deliverables.map((d) => d.due_date).filter((x): x is string => !!x).map((x) => new Date(x).getTime());
    const now = Date.now();
    const rawS = meta.startDate ? new Date(meta.startDate).getTime() : (dated.length ? Math.min(...dated) : now);
    const rawE = Math.max(
      meta.targetEndDate ? new Date(meta.targetEndDate).getTime() : 0,
      dated.length ? Math.max(...dated) : 0,
      now,
    ) || rawS + 90 * 864e5;
    // Redondear a meses calendario, con 1 mes de aire a cada lado.
    const s = new Date(rawS); s.setUTCDate(1); s.setUTCHours(0, 0, 0, 0); s.setUTCMonth(s.getUTCMonth() - 1);
    const e = new Date(rawE); e.setUTCDate(1); e.setUTCHours(0, 0, 0, 0); e.setUTCMonth(e.getUTCMonth() + 2);
    const s0 = s.getTime(), e0 = e.getTime();
    const span = Math.max(864e5, e0 - s0);
    const PX_PER_MONTH = 90; // ~6 meses visibles en el viewport (~540px)
    const totalMonths = Math.max(1, Math.round(span / (30.44 * 864e5)));
    const width = totalMonths * PX_PER_MONTH;
    const px = (dateStr: string) => Math.round(Math.max(0, Math.min(1, (new Date(dateStr).getTime() - s0) / span)) * width);
    const months: { label: string; leftPx: number }[] = [];
    const cur = new Date(s0);
    while (cur.getTime() < e0 && months.length < 48) {
      const opts: Intl.DateTimeFormatOptions = cur.getUTCMonth() === 0 || months.length === 0
        ? { month: "short", year: "2-digit", timeZone: "UTC" } : { month: "short", timeZone: "UTC" };
      months.push({ label: cur.toLocaleDateString(lang === "es" ? "es-ES" : "en-US", opts), leftPx: Math.round((cur.getTime() - s0) / span * width) });
      cur.setUTCMonth(cur.getUTCMonth() + 1);
    }
    const todayPx = Math.round(Math.max(0, Math.min(1, (now - s0) / span)) * width);
    const rangeLabel = `${new Date(s0).toLocaleDateString(lang === "es" ? "es-ES" : "en-US", { month: "short", year: "numeric", timeZone: "UTC" })} – ${new Date(e0 - 864e5).toLocaleDateString(lang === "es" ? "es-ES" : "en-US", { month: "short", year: "numeric", timeZone: "UTC" })}`;
    return { px, months, todayPx, width, pxPerMonth: PX_PER_MONTH, rangeLabel };
  }, [meta.startDate, meta.targetEndDate, deliverables, lang]);
  /* auto-scroll del gantt: centrar HOY (deja ~3 meses de pasado visibles) */
  const ganttScrollRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = ganttScrollRef.current;
    if (el) el.scrollLeft = Math.max(0, gantt.todayPx - 3 * gantt.pxPerMonth);
  }, [section, gantt.todayPx, gantt.pxPerMonth]);

  const openDecisions = decisions.filter((d) => d.status === "open").length;
  const myTasks = personId ? tasks.filter((t) => t.owner_person_id === personId) : [];
  const myOpenTasks = myTasks.filter((t) => t.status !== "done");
  const myDeliverables = personId ? deliverables.filter((d) => d.owner_person_id === personId) : [];
  const navCount: Partial<Record<SectionKey, number | undefined>> = { mio: myOpenTasks.length || undefined, entregables: deliverables.length, tareas: tasks.length, decisiones: openDecisions || undefined, reuniones: meetings.length || undefined };
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
    display: "flex", flexDirection: "column", zIndex: 50, minHeight: 0,
    ...(isMobile
      ? { position: "fixed", top: 0, left: 0, height: "100vh", transform: mobileOpen ? "translateX(0)" : "translateX(-110%)", transition: "transform .22s ease", boxShadow: mobileOpen ? "0 10px 40px rgba(0,0,0,.28)" : "none" }
      : {}),
  };

  return (
    <div style={{ minHeight: "100vh", fontFamily: FONT_SANS, fontSize: 14, lineHeight: 1.5, color: C.ink, background: "#e2e2da", padding: isMobile ? 0 : "22px 16px 40px" }}>
      {/* app enmarcada (calcada de la maqueta) */}
      <div style={{ maxWidth: 1160, margin: "0 auto", display: "flex", height: isMobile ? "100vh" : "calc(100vh - 62px)", background: C.bg, border: isMobile ? "none" : `1.5px solid ${C.line}`, borderRadius: isMobile ? 0 : 16, overflow: "hidden" }}>
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
          <Link href="/rooms" title={tr("chrome.myDesk")}
            style={{ display: "flex", alignItems: "center", gap: 10, padding: showLabels ? "8px 14px" : "8px 0", margin: showLabels ? "0 8px 6px" : "0 0 6px", justifyContent: showLabels ? "flex-start" : "center", textDecoration: "none", color: C.muted2, fontSize: 11.5, fontWeight: 600, borderRadius: 8 }}>
            <span style={{ width: 16, height: 16, flexShrink: 0, display: "grid", placeItems: "center" }}><NavIcon k="desk" /></span>
            {showLabels && <span>{tr("chrome.myDesk")}</span>}
          </Link>
          {showLabels && <div style={{ ...label, padding: "0 16px 8px" }}>{tr("chrome.rooms")}</div>}
          {roomList.map((r) => {
            const current = r.id === projectId;
            if (!current) {
              // otras salas: link (navega) — colapsado = inicial, expandido = nombre
              return (
                <Link key={r.id} href={`/rooms/${r.id}`} title={r.name ?? tr("chrome.room")}
                  style={{ display: "flex", alignItems: "center", gap: 8, padding: showLabels ? "7px 12px" : "7px 0", margin: showLabels ? "2px 8px" : "2px 0", borderRadius: 8, textDecoration: "none", color: "inherit", justifyContent: showLabels ? "flex-start" : "center", opacity: 0.72 }}>
                  <span style={{ width: 7, height: 7, borderRadius: 2, background: C.muted, flexShrink: 0 }} />
                  {showLabels && <div style={{ minWidth: 0 }}><b style={{ fontSize: 11, fontWeight: 800, display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{cleanName(r.name)}</b>{r.stage && <small style={{ fontSize: 9, color: C.muted, display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.stage}</small>}</div>}
                </Link>
              );
            }
            // sala actual: nombre + nav de secciones
            return (
              <div key={r.id} style={{ marginBottom: 4 }}>
                {showLabels && (
                  <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 12px", margin: "2px 8px 4px", borderRadius: 8, background: C.bg }}>
                    <span style={{ width: 7, height: 7, borderRadius: 2, background: C.lime, flexShrink: 0 }} />
                    <div style={{ minWidth: 0 }}>
                      <b style={{ fontSize: 11, fontWeight: 800, display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{cleanName(r.name)}</b>
                      {r.stage && <small style={{ fontSize: 9, color: C.muted, display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.stage}</small>}
                    </div>
                  </div>
                )}
                <div style={{ display: "flex", flexDirection: "column", gap: 1, padding: showLabels ? "2px 8px" : "2px 0" }}>
                  {navItems.map((n) => {
                    const active = section === n.key;
                    const count = navCount[n.key];
                    const isMine = n.key === "mio";
                    const warmBadge = n.key === "decisiones";
                    const onBg = active ? (isMine ? C.minePaper : C.limePaper) : "transparent";
                    const fg = active ? (isMine ? "#3346a8" : C.ink) : (isMine ? C.mine : "rgba(0,0,0,.52)");
                    return (
                      <button key={n.key} onClick={() => pickSection(n.key)} title={tr("nav." + n.key)}
                        style={{
                          display: "flex", alignItems: "center", gap: 10, width: "100%", textAlign: "left",
                          justifyContent: showLabels ? "flex-start" : "center",
                          padding: showLabels ? "8px" : "9px 0", borderRadius: 8, cursor: "pointer",
                          fontFamily: "inherit", fontSize: 11.5, fontWeight: active ? 700 : 600,
                          background: onBg, color: fg, border: 0, position: "relative",
                        }}>
                        <span style={{ width: 16, height: 16, flexShrink: 0, display: "grid", placeItems: "center" }}><NavIcon k={n.key} /></span>
                        {showLabels && <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{tr("nav." + n.key)}</span>}
                        {showLabels && count != null && (
                          <span style={{ fontSize: 8.5, fontWeight: 700, background: warmBadge ? C.warnSoft : "rgba(0,0,0,.08)", color: warmBadge ? "#7a5800" : "rgba(0,0,0,.42)", padding: "1px 6px", borderRadius: 8 }}>{count}</span>
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
            {showLabels && <span style={{ fontSize: 11, color: C.muted, fontWeight: 600 }} title={tr("chrome.yourRole")}>{tr("role." + viewRole)}</span>}
          </div>
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
      <main style={{ flex: 1, minWidth: 0, minHeight: 0, display: "flex", flexDirection: "column" }}>
        <header style={{ display: "flex", alignItems: "center", gap: 10, padding: isMobile ? "12px 16px 12px 60px" : "12px 20px", borderBottom: `1.5px solid ${C.line}`, position: "sticky", top: 0, background: C.bg, zIndex: 10, flexWrap: "wrap" }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 8, fontWeight: 700, letterSpacing: "2px", textTransform: "uppercase", color: "rgba(0,0,0,.3)" }}>Common House × {(meta.orgName ?? cleanName(project.name)).toUpperCase()}</div>
            <h2 style={{ fontSize: 17, fontWeight: 800, letterSpacing: "-.4px", margin: "1px 0 0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{sectionLabel}</h2>
          </div>
          <span style={{ flex: 1 }} />
          {!isMobile && role === "pm" && (
            <>
              <span style={{ ...label, letterSpacing: "1px" }}>{tr("chrome.viewAs")}</span>
              <div style={{ display: "inline-flex", background: C.paper, border: `1.5px solid ${C.line}`, borderRadius: 8, padding: 3 }}>
                {ROLE_TABS.map((rt) => (
                  <button key={rt.key} onClick={() => setViewRole(rt.key)} style={{ fontFamily: "inherit", fontSize: 9.5, fontWeight: 700, letterSpacing: ".4px", textTransform: "uppercase", border: 0, borderRadius: 5, padding: "5px 10px", cursor: "pointer", background: viewRole === rt.key ? C.ink : "transparent", color: viewRole === rt.key ? "#fff" : C.muted }}>{rt.label}</button>
                ))}
              </div>
            </>
          )}
          <div style={{ display: "inline-flex", background: C.paper, border: `1px solid ${C.line}`, borderRadius: 7, padding: 1 }}>
            {(["es", "en"] as const).map((l) => (
              <button key={l} onClick={() => switchLang(l)} style={{ fontFamily: "inherit", fontSize: 9.5, fontWeight: 800, letterSpacing: ".4px", textTransform: "uppercase", border: 0, borderRadius: 5, padding: "3px 8px", cursor: "pointer", background: lang === l ? C.ink : "transparent", color: lang === l ? "#fff" : C.muted }}>{l}</button>
            ))}
          </div>
          {project.current_stage && <span style={pill(C.lime, "#000")}>{project.current_stage}</span>}
          {!isMobile && team.length > 0 && (
            <div style={{ display: "flex" }}>
              {team.slice(0, 3).map((m, i) => (
                <span key={m.id} title={m.name} style={{ width: 26, height: 26, borderRadius: "50%", marginLeft: i ? -6 : 0, border: `2px solid ${C.bg}`, display: "grid", placeItems: "center", fontSize: 9, fontWeight: 700, color: "#fff", background: ["#3B5BDB", "#0C8599", "#9C36B5"][i % 3] }}>{m.name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase()}</span>
              ))}
            </div>
          )}
        </header>

        <div style={{ padding: "20px", flex: 1, overflowY: "auto", minHeight: 0 }}>
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
                    <span style={{ ...pill(suggestion.source === "proposal" ? C.limePaper : C.paper2, suggestion.source === "proposal" ? C.limeInk : C.muted2) }}>{tr(suggestion.source === "proposal" ? "empty.fromProposal" : "empty.fromTemplate")}</span>
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
            <div>
              {/* hero */}
              {meta.projectType && <div style={label}>{meta.projectType.toUpperCase()}</div>}
              <h1 style={{ fontSize: 26, fontWeight: 300, letterSpacing: "-1px", lineHeight: 1.1, maxWidth: "22ch", margin: "9px 0 0" }}>{renderHero(heroTitle)}</h1>
              {heroSub && <p style={{ color: C.muted, fontSize: 14, maxWidth: "64ch", margin: "12px 0 0", lineHeight: 1.6 }}>{heroSub}</p>}
              {/* stats */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 11, marginTop: 20 }}>
                <Stat l={tr("stat.avance")} v={`${stats.avance}%`} lime animate={{ to: stats.avance, suffix: "%" }} />
                <Stat l={tr("stat.entregables")} v={`${stats.dDone}/${stats.dTot}`} />
                <Stat l={lang === "es" ? "Próximo hito" : "Next milestone"} v={upcoming.length ? `${fmtDay(upcoming[0].due, lang)} · ${upcoming[0].title}` : (meta.nextMilestone ?? "—")} sm />
                <Stat l={lang === "es" ? "Decisión pendiente" : "Pending decision"} v={String(openDecisions)} warn={openDecisions > 0} />
              </div>
              {/* inbox — la IA propone (gate) */}
              {suggs.length > 0 && (
                <div style={{ background: C.paper, border: `1.5px solid ${C.line}`, borderRadius: 14, overflow: "hidden", marginTop: 20 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", borderBottom: `1px solid ${C.line}`, background: "rgba(200,245,90,.09)" }}>
                    <span style={{ width: 24, height: 24, borderRadius: 7, background: C.lime, display: "grid", placeItems: "center", fontSize: 12, flexShrink: 0 }}>✦</span>
                    <div style={{ minWidth: 0 }}>
                      <b style={{ fontSize: 11.5, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".3px" }}>{lang === "es" ? "La IA leyó tus reuniones · para confirmar" : "The AI read your meetings · to confirm"}</b>
                      <small style={{ display: "block", fontSize: 10, color: C.muted }}>{lang === "es" ? "Propone estos cambios — nada se aplica sin tu ✓." : "It proposes these changes — nothing applies without your ✓."}</small>
                    </div>
                    <span style={{ flex: 1 }} />
                    <span style={label}>{suggs.length}</span>
                  </div>
                  {visibleSuggestions.map((s) => {
                    const k = suggLabel(s.item_type, lang);
                    return (
                      <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 16px", borderTop: `1px solid ${C.lineSoft}` }}>
                        <span style={{ fontSize: 8, fontWeight: 800, letterSpacing: ".8px", textTransform: "uppercase", padding: "3px 8px", borderRadius: 6, whiteSpace: "nowrap", background: k.warm ? C.warnSoft : "rgba(0,0,0,.07)", color: k.warm ? "#7a5800" : "#555" }}>{k.label}</span>
                        <div style={{ flex: 1, fontSize: 12.5, minWidth: 0 }}>{s.summary}{s.rationale && <small style={{ display: "block", color: C.muted, fontSize: 10.5, marginTop: 1 }}>{s.rationale}</small>}</div>
                        {can("suggestion.confirm")
                          ? (<div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                              <button onClick={() => resolveSugg(s.id, "confirm")} style={{ fontFamily: "inherit", fontSize: 9.5, fontWeight: 800, letterSpacing: ".4px", textTransform: "uppercase", cursor: "pointer", borderRadius: 6, padding: "5px 10px", border: 0, background: C.lime, color: "#000" }}>{lang === "es" ? "Confirmar" : "Confirm"}</button>
                              <button onClick={() => resolveSugg(s.id, "dismiss")} style={{ fontFamily: "inherit", fontSize: 9.5, fontWeight: 800, letterSpacing: ".4px", textTransform: "uppercase", cursor: "pointer", borderRadius: 6, padding: "5px 10px", border: `1.5px solid ${C.line}`, background: C.paper, color: C.muted }}>{lang === "es" ? "Descartar" : "Dismiss"}</button>
                            </div>)
                          : <span style={{ ...label }}>{lang === "es" ? "Confirma el PM" : "PM confirms"}</span>}
                      </div>
                    );
                  })}
                  {curatedSuggestions.length > 5 && (
                    <div style={{ padding: "10px 16px", borderTop: `1px solid ${C.lineSoft}`, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                      <button onClick={() => setShowAllSuggestions((v) => !v)} style={{ ...btn(C.paper, C.muted2, true), fontSize: 10 }}>
                        {showAllSuggestions
                          ? (lang === "es" ? "Ver menos" : "Show less")
                          : `${lang === "es" ? "Ver todas" : "Show all"} (${curatedSuggestions.length})`}
                      </button>
                      {!showAllSuggestions && <span style={{ fontSize: 10.5, color: C.muted }}>{lang === "es" ? "Mostrando las 5 propuestas más recientes y sin duplicados." : "Showing the 5 most recent, non-duplicate proposals."}</span>}
                    </div>
                  )}
                </div>
              )}
              {/* reuniones */}
              {meetings.length > 0 && (
                <div style={{ background: C.paper, border: `1.5px solid ${C.line}`, borderRadius: 14, overflow: "hidden", marginTop: 16 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "13px 17px 12px", borderBottom: `1px solid ${C.line}` }}>
                    <span style={{ width: 26, height: 26, borderRadius: 7, background: C.lime, display: "grid", placeItems: "center", flexShrink: 0 }}>
                      <svg viewBox="0 0 16 16" style={{ width: 14, height: 14, stroke: "#000", fill: "none", strokeWidth: 1.6, strokeLinecap: "round", strokeLinejoin: "round" }}><rect x="2.5" y="3.5" width="11" height="10" rx="1.5" /><path d="M2.5 6.5h11" /><path d="M5.5 2v3M10.5 2v3" /></svg>
                    </span>
                    <b style={{ fontSize: 11.5, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".2px" }}>{tr("nav.reuniones")}</b>
                    <span style={{ flex: 1 }} />
                    <span style={{ fontSize: 10, color: C.muted, fontWeight: 600 }}>
                      {meetings.length} {lang === "es" ? "en total" : "total"}
                      {totalMeetingMinutes > 0 && ` · ${fmtTotalTime(totalMeetingMinutes, lang)} ${lang === "es" ? "dedicadas a" : "spent on"} ${meta.orgName ?? cleanName(project.name)}`}
                    </span>
                  </div>
                  <div style={{ padding: "6px 17px 14px" }}>
                    {(showAllMeetings ? meetings : meetings.slice(0, 5)).map((m) => {
                      const ev = evidenceByMeeting.get(m.id) ?? [];
                      const exp = expandedMeeting === m.id;
                      const hasBody = !!(m.summary || ev.length);
                      return (
                        <div key={m.id} style={{ borderTop: `1px solid ${C.lineSoft}` }}>
                          <div onClick={() => hasBody && setExpandedMeeting(exp ? null : m.id)} style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 0", cursor: hasBody ? "pointer" : "default" }}>
                            <span style={{ fontFamily: "ui-monospace,Consolas,'SF Mono',monospace", fontSize: 10, color: C.muted, minWidth: 42, fontWeight: 700, flexShrink: 0 }}>{fmtDay(m.date, lang)}</span>
                            <div style={{ flex: 1, minWidth: 0, fontSize: 12.5, fontWeight: 600 }}>
                              {m.title}
                              <small style={{ display: "block", color: C.muted, fontSize: 10.5, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                {[m.platform, ev.length ? `${ev.length} ${lang === "es" ? "evidencias" : "evidence"}` : null, m.durationMinutes == null ? (lang === "es" ? "sin transcripción" : "no transcript") : null].filter(Boolean).join(" · ")}
                              </small>
                            </div>
                            {m.attendees.length > 0 && (
                              <div style={{ display: "flex", flexShrink: 0 }}>
                                {m.attendees.slice(0, 4).map((a, i) => { const c = attendeeChip(a, team); return (
                                  <i key={i} title={a} style={{ width: 20, height: 20, borderRadius: "50%", marginLeft: i === 0 ? 0 : -5, border: `2px solid ${C.paper}`, fontSize: 8, fontWeight: 700, color: "#fff", display: "grid", placeItems: "center", fontStyle: "normal", background: c.bg }}>{c.initials}</i>
                                ); })}
                                {m.attendees.length > 4 && <i style={{ width: 20, height: 20, borderRadius: "50%", marginLeft: -5, border: `2px solid ${C.paper}`, fontSize: 7.5, fontWeight: 700, color: C.muted2, display: "grid", placeItems: "center", fontStyle: "normal", background: C.paper2 }}>+{m.attendees.length - 4}</i>}
                              </div>
                            )}
                            <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: ".4px", textTransform: "uppercase", color: C.muted, minWidth: 34, textAlign: "right", flexShrink: 0 }}>{m.durationMinutes != null ? `${Math.round(m.durationMinutes)}m` : "—"}</span>
                            {hasBody && <span style={{ color: C.muted, fontSize: 11, flexShrink: 0, transform: exp ? "rotate(90deg)" : "none", transition: "transform .15s" }}>▸</span>}
                          </div>
                          {exp && (
                            <div style={{ padding: "0 0 12px 56px" }}>
                              {m.summary && <div style={{ fontSize: 12, color: C.muted2, lineHeight: 1.55, whiteSpace: "pre-wrap" }}>{m.summary}</div>}
                              {ev.length > 0 && (
                                <div style={{ marginTop: m.summary ? 10 : 0 }}>
                                  <div style={{ ...label, marginBottom: 6 }}>{lang === "es" ? "Evidencia extraída" : "Extracted evidence"} · {ev.length}</div>
                                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                                    {ev.map((e) => (
                                      <div key={e.id} style={{ display: "flex", gap: 8, alignItems: "flex-start", background: C.paper2, borderRadius: 8, padding: "7px 10px" }}>
                                        <span style={{ width: 6, height: 6, borderRadius: 999, background: C.limeInk, flexShrink: 0, marginTop: 5 }} />
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                          <span style={{ fontSize: 11.5, color: C.ink, lineHeight: 1.45 }}>{e.statement}</span>
                                          <div style={{ display: "flex", gap: 6, marginTop: 3, flexWrap: "wrap" }}>
                                            {e.type && <span style={{ fontSize: 8, fontWeight: 800, letterSpacing: ".4px", textTransform: "uppercase", color: C.muted, background: "rgba(0,0,0,.05)", padding: "1px 6px", borderRadius: 5 }}>{e.type}</span>}
                                            {e.workstream && <span style={{ fontSize: 8, fontWeight: 800, letterSpacing: ".4px", textTransform: "uppercase", color: "#4a5bc0", background: "rgba(91,107,214,.11)", padding: "1px 6px", borderRadius: 5 }}>{e.workstream}</span>}
                                            {e.people.length > 0 && <span style={{ fontSize: 8, fontWeight: 700, color: C.muted, padding: "1px 0" }}>{e.people.slice(0, 3).join(", ")}{e.people.length > 3 ? "…" : ""}</span>}
                                          </div>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                    {meetings.length > 5 && (
                      <button onClick={() => setShowAllMeetings((v) => !v)} style={{ ...btn(C.paper, C.muted2, true), marginTop: 10, fontSize: 10 }}>
                        {showAllMeetings ? (lang === "es" ? "Ver menos" : "Show less") : `${lang === "es" ? "Ver todas" : "Show all"} (${meetings.length})`}
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}

          {/* PLAN */}
          {section === "plan" && (
            <div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 11, marginBottom: 14 }}>
                <h3 style={{ fontSize: 16, fontWeight: 800, margin: 0 }}>{tr("nav.plan")}</h3>
                {(meta.startDate || meta.targetEndDate) && <span style={{ fontSize: 11, color: C.muted, fontWeight: 600, textTransform: "capitalize" }}>{gantt.rangeLabel}</span>}
                <span style={{ flex: 1 }} />
                {can("structure.edit") && <button onClick={createPhase} style={btn(C.paper, C.muted2, true)}>{lang === "es" ? "+ Fase" : "+ Phase"}</button>}
              </div>
              <div style={{ maxWidth: 760 }}>
                {phases.length === 0 && <Empty text={tr("plan.noPhases")} />}
                {phases.map((p) => {
                  const dels = deliverables.filter((d) => d.phase_id === p.id);
                  const open = openPhase === p.id;
                  const pct = dels.length ? Math.round(dels.reduce((a, d) => a + (d.progress || 0), 0) / dels.length) : (p.status === "done" ? 100 : 0);
                  const stat = p.status === "done" ? { icon: "✓", bg: C.lime, fg: "#0a0a0a", brd: "none" } : p.status === "in_progress" ? { icon: "•", bg: C.paper, fg: C.warn, brd: `2px solid ${C.warn}` } : { icon: "○", bg: C.paper2, fg: C.muted, brd: "none" };
                  const statusText = p.status === "done" ? tr("plan.doneTag") : p.status === "in_progress" ? `${tr("plan.inProgressTag")} · ${pct}%` : tr("plan.upcomingTag");
                  return (
                    <div key={p.id} style={{ background: C.paper, border: `1.5px solid ${C.line}`, borderRadius: 12, overflow: "hidden", marginBottom: 10 }}>
                      <button onClick={() => setOpenPhase(open ? null : p.id)} style={{ width: "100%", display: "flex", alignItems: "center", gap: 12, padding: "12px 15px", background: "transparent", border: 0, cursor: "pointer", fontFamily: "inherit" }}>
                        <span style={{ width: 22, height: 22, borderRadius: 999, display: "grid", placeItems: "center", fontSize: 11, fontWeight: 900, background: stat.bg, color: stat.fg, border: stat.brd, flexShrink: 0 }}>{stat.icon}</span>
                        <div style={{ textAlign: "left", minWidth: 0 }}>
                          <b style={{ fontSize: 14, fontWeight: 800 }}>{p.title}</b>
                          <div style={{ fontSize: 11, color: C.muted, fontWeight: 600, marginTop: 1, textTransform: "capitalize" }}>{statusText}</div>
                        </div>
                        <span style={{ flex: 1 }} />
                        <span style={{ color: C.muted, transform: open ? "rotate(90deg)" : "none", transition: "transform .15s" }}>▸</span>
                      </button>
                      {open && (
                        <div style={{ padding: "0 15px 12px 49px" }}>
                          {dels.length === 0 && <div style={{ fontSize: 12, color: C.muted, padding: "6px 0" }}>{tr("plan.noDeliverablesInPhase")}</div>}
                          {dels.map((d) => (
                            <div key={d.id} style={{ display: "flex", alignItems: "center", gap: 9, padding: "8px 0", borderTop: `1px solid ${C.lineSoft}`, fontSize: 12.5, fontWeight: 600 }}>
                              <span style={{ width: 7, height: 7, borderRadius: 999, background: statusDot(d.status), flexShrink: 0 }} />
                              <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.title}</span>
                              <span style={{ marginLeft: "auto", ...label, whiteSpace: "nowrap" }}>{statusLabel(d.status)}{d.due_date ? ` · ${d.due_date.slice(5)}` : ` · ${d.progress}%`}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              {/* línea de tiempo (gantt) */}
              {gantt.months.length > 0 && deliverables.some((d) => d.due_date) && (
                <div style={{ marginTop: 22 }}>
                  <div style={{ ...label, marginBottom: 10 }}>{lang === "es" ? "Línea de tiempo" : "Timeline"} <span style={{ fontWeight: 600, letterSpacing: ".3px", textTransform: "none", color: "rgba(0,0,0,.35)" }}>· {lang === "es" ? "desplazá para ver pasado y futuro" : "scroll to see past and future"}</span></div>
                  <div style={{ background: C.paper, border: `1.5px solid ${C.line}`, borderRadius: 14, overflow: "hidden", display: "flex" }}>
                    {/* columna fija de nombres */}
                    <div style={{ width: 160, flexShrink: 0, borderRight: `1.5px solid ${C.line}`, zIndex: 2, background: C.paper }}>
                      <div style={{ height: 26, borderBottom: `1.5px solid ${C.line}` }} />
                      {deliverables.filter((d) => d.due_date).map((d) => (
                        <div key={d.id} style={{ borderTop: `1px solid ${C.lineSoft}`, minHeight: 36, display: "flex", alignItems: "center", padding: "8px 12px", fontSize: 11.5, fontWeight: 600, color: C.muted2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.title}</div>
                      ))}
                    </div>
                    {/* pista scrolleable (auto-centrada en HOY: ~3 meses atrás / 3 adelante) */}
                    <div ref={ganttScrollRef} style={{ flex: 1, overflowX: "auto", position: "relative" }}>
                      <div style={{ width: gantt.width, position: "relative" }}>
                        <div style={{ position: "relative", height: 26, borderBottom: `1.5px solid ${C.line}` }}>
                          {gantt.months.map((m, i) => (<span key={i} style={{ position: "absolute", left: m.leftPx, top: 8, fontSize: 8, fontWeight: 700, letterSpacing: "1.5px", textTransform: "uppercase", color: "rgba(0,0,0,.3)", paddingLeft: 6, whiteSpace: "nowrap", borderLeft: "1px solid rgba(0,0,0,.07)" }}>{m.label}</span>))}
                        </div>
                        {deliverables.filter((d) => d.due_date).map((d) => {
                          const end = gantt.px(d.due_date!); const start = Math.max(0, end - Math.round(1.5 * gantt.pxPerMonth));
                          const tone = d.status === "at_risk" ? C.warn : (d.status === "delivered" || d.status === "accepted") ? C.ok : d.status === "in_progress" ? C.lime : C.paper2;
                          const barTxt = (d.status === "delivered" || d.status === "accepted") ? statusLabel(d.status) : `${d.progress}%`;
                          return (
                            <div key={d.id} style={{ position: "relative", borderTop: `1px solid ${C.lineSoft}`, minHeight: 36 }}>
                              <div title={`${d.title} · ${d.due_date} · ${d.progress}%`} style={{ position: "absolute", top: "50%", transform: "translateY(-50%)", left: start, width: Math.max(52, end - start), height: 21, borderRadius: 6, background: tone, display: "flex", alignItems: "center", padding: "0 8px", fontSize: 9, fontWeight: 800, letterSpacing: ".4px", textTransform: "uppercase", color: "#3a3a34", overflow: "hidden", whiteSpace: "nowrap" }}>{barTxt}</div>
                            </div>
                          );
                        })}
                        <div style={{ position: "absolute", top: 0, bottom: 0, left: gantt.todayPx, width: 2, background: C.danger, zIndex: 3 }}>
                          <span style={{ position: "absolute", top: 0, left: "50%", transform: "translateX(-50%)", background: C.danger, color: "#fff", fontSize: 7, fontWeight: 800, padding: "1px 4px", borderRadius: "0 0 4px 4px", letterSpacing: ".5px" }}>{lang === "es" ? "HOY" : "NOW"}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
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
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(280px,1fr))", gap: 12, alignItems: "start" }}>
                  {deliverables.map((d) => {
                    const dTasks = tasks.filter((t) => t.deliverable_id === d.id);
                    const done = dTasks.filter((t) => t.status === "done").length;
                    const open = expandedDeliv === d.id;
                    const owner = ownerOf(d.owner_person_id);
                    const day = fmtDay(d.due_date, lang);
                    const whenTxt = d.status === "delivered" || d.status === "accepted"
                      ? (day || tr("ds." + d.status))
                      : d.status === "not_started"
                        ? (day ? (lang === "es" ? "inicia " : "starts ") + day : tr("ds." + d.status))
                        : (day ? (lang === "es" ? "vence " : "due ") + day : tr("ds." + d.status));
                    const phase = d.phase_id ? phases.find((p) => p.id === d.phase_id) : null;
                    return (
                      <div key={d.id} style={{ background: C.paper, border: `1.5px solid ${C.line}`, borderRadius: 14, padding: "15px 16px", display: "flex", flexDirection: "column", gap: 11 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
                          <h4 style={{ fontSize: 14, fontWeight: 800, letterSpacing: "-.2px", lineHeight: 1.3, margin: 0 }}>
                            <button onClick={() => setDetail({ kind: "deliverable", id: d.id })} title={tr("detail.open")}
                              style={{ font: "inherit", color: "inherit", background: "transparent", border: 0, padding: 0, textAlign: "left", cursor: "pointer" }}>{d.title}</button>
                          </h4>
                          <span style={statusPill(d.status)}>{statusLabel(d.status)}</span>
                        </div>
                        <div style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11.5, color: C.muted }}>
                          {owner && <span style={{ width: 19, height: 19, borderRadius: 999, display: "grid", placeItems: "center", fontSize: 9, fontWeight: 700, color: "#fff", flex: "none", background: avColor(owner.name) }}>{avInit(owner.name)}</span>}
                          <span>{owner ? owner.name.split(" ")[0] + " · " + whenTxt : whenTxt}</span>
                        </div>
                        <Progress v={d.progress} />
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: `1px solid ${C.line}`, paddingTop: 11, fontSize: 10.5, color: C.muted, fontWeight: 600 }}>
                          {dTasks.length > 0
                            ? <button onClick={() => setExpandedDeliv(open ? null : d.id)} style={{ display: "inline-flex", alignItems: "center", gap: 5, background: "transparent", border: 0, padding: 0, cursor: "pointer", fontFamily: "inherit", fontSize: 9, fontWeight: 800, letterSpacing: ".5px", textTransform: "uppercase", color: C.muted }}>
                                <span style={{ transform: open ? "rotate(90deg)" : "none", transition: "transform .15s" }}>▸</span>{done}/{dTasks.length} {tr("word.tasks")}
                              </button>
                            : <span>0 {tr("word.tasks")}</span>}
                          {phase && <span>{phase.title}</span>}
                        </div>
                        {open && dTasks.length > 0 && (
                          <div style={{ borderTop: "1px solid #eee", paddingTop: 8, marginTop: -2 }}>
                            {dTasks.map((t) => { const td = fmtDay(t.due_date, lang); const isDone = t.status === "done"; return (
                              <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 0", fontSize: 11.5 }}>
                                <span style={{ width: 13, height: 13, borderRadius: 4, border: `1.5px solid ${isDone ? C.lime : "#c4c4ba"}`, background: isDone ? C.lime : "transparent", flex: "none", display: "grid", placeItems: "center", fontSize: 8, fontWeight: 900, color: "#000" }}>{isDone ? "✓" : ""}</span>
                                <span style={{ color: isDone ? C.muted : C.ink, textDecoration: isDone ? "line-through" : "none" }}>{t.title}</span>
                                {!isDone && td && <span style={{ marginLeft: "auto", color: t.status === "blocked" ? C.warn : C.muted, fontSize: 10, fontWeight: 700 }}>{t.status === "blocked" ? (lang === "es" ? "bloqueada" : "blocked") : td}</span>}
                              </div>
                            ); })}
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
                  renderCard={(d) => { const o = ownerOf(d.owner_person_id); return (<><div style={{ fontSize: 12, fontWeight: 700 }}><button onClick={() => setDetail({ kind: "deliverable", id: d.id })} title={tr("detail.open")} style={cardTitleBtn}>{d.title}</button></div><div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 7 }}>{o && <span style={{ width: 17, height: 17, borderRadius: 999, display: "grid", placeItems: "center", fontSize: 8, fontWeight: 700, color: "#fff", background: avColor(o.name) }}>{avInit(o.name)}</span>}<span style={label}>{d.progress}%</span></div></>); }} />
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
                <div style={{ maxWidth: 700 }}>
                  {taskGroups.map((g) => (
                    <div key={g.key} style={{ background: C.paper, border: `1.5px solid ${C.line}`, borderRadius: 14, overflow: "hidden", marginBottom: 12 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 9, padding: "11px 15px", borderBottom: "1px solid #eee" }}>
                        <span style={{ width: 19, height: 19, borderRadius: 999, display: "grid", placeItems: "center", fontSize: g.init.length > 2 ? 7 : 9, fontWeight: 700, color: "#fff", flex: "none", background: g.color }}>{g.init}</span>
                        <b style={{ fontSize: 12, fontWeight: 800 }}>{g.name}</b>
                        {g.tag && <span style={{ fontSize: 9, color: C.muted, fontWeight: 700, letterSpacing: "1px", textTransform: "uppercase" }}>{g.tag}</span>}
                      </div>
                      {g.items.map((t, i) => { const isDone = t.status === "done"; const td = fmtDay(t.due_date, lang); const late = !isDone && isPast(t.due_date); return (
                        <div key={t.id} style={{ display: "flex", alignItems: "flex-start", gap: 11, padding: "11px 15px", ...(i > 0 ? { borderTop: "1px solid #eee" } : {}) }}>
                          {!isDone && (can("task.manage") || can("task.mark_own"))
                            ? <button onClick={() => closeTask(t)} title={tr("btn.markDone")} style={{ width: 17, height: 17, borderRadius: 5, border: `1.5px solid #c4c4ba`, background: "transparent", cursor: "pointer", flex: "none", marginTop: 1 }} />
                            : <span style={{ width: 17, height: 17, borderRadius: 5, background: isDone ? C.lime : "transparent", border: `1.5px solid ${isDone ? C.lime : "#c4c4ba"}`, display: "grid", placeItems: "center", fontSize: 11, fontWeight: 900, color: "#0a0a0a", flex: "none", marginTop: 1 }}>{isDone ? "✓" : ""}</span>}
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <button onClick={() => setDetail({ kind: "task", id: t.id })} title={tr("detail.open")}
                              style={{ font: "inherit", background: "transparent", border: 0, padding: 0, textAlign: "left", cursor: "pointer", fontSize: 12.5, color: isDone ? C.muted : C.ink, textDecoration: isDone ? "line-through" : "none" }}>{t.title}</button>
                            {t.closed_via && (
                              <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 9, fontWeight: 700, letterSpacing: ".6px", textTransform: "uppercase", marginTop: 4, flexWrap: "wrap", color: t.closed_via === "evidence" ? C.limeInk : C.muted }}>
                                {t.closed_via === "evidence" ? "✓ " + tr("tasks.evidence") : "✍ " + tr("tasks.attested")}
                                {t.closed_via !== "evidence" && <span style={{ fontSize: 8, background: "rgba(0,0,0,.06)", color: "rgba(0,0,0,.42)", padding: "1px 6px", borderRadius: 6 }}>{lang === "es" ? "sin evidencia" : "no evidence"}</span>}
                              </span>
                            )}
                          </div>
                          {t.assignee_side === "client" && !g.key.startsWith("d:") && g.key !== "client" && <span style={pill(C.paper2, C.muted2)}>{tr("tasks.client")}</span>}
                          {td && <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: ".6px", textTransform: "uppercase", color: late ? "#b91c1c" : C.muted, whiteSpace: "nowrap", marginTop: 2 }}>{late ? (lang === "es" ? "vencida" : "overdue") : td}</span>}
                        </div>
                      ); })}
                    </div>
                  ))}
                  {tasks.length === 0 && <Empty text={tr("tasks.none")} />}
                </div>
              ) : (
                <Kanban cols={taskCols} items={tasks} draggable={can("task.move")}
                  onDrop={(id, to) => { const t = tasks.find((x) => x.id === id); if (t && t.status !== to) moveTask(id, to, t.status); }}
                  renderCard={(t) => { const o = ownerOf(t.owner_person_id); const td = fmtDay(t.due_date, lang); const late = t.status !== "done" && isPast(t.due_date); return (<><div style={{ fontSize: 12, fontWeight: 700 }}><button onClick={() => setDetail({ kind: "task", id: t.id })} title={tr("detail.open")} style={cardTitleBtn}>{t.title}</button></div><div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 7 }}>{o && <span style={{ width: 17, height: 17, borderRadius: 999, display: "grid", placeItems: "center", fontSize: 8, fontWeight: 700, color: "#fff", background: avColor(o.name) }}>{avInit(o.name)}</span>}{t.assignee_side === "client" && !o && <span style={label}>{tr("tasks.client")}</span>}<span style={{ ...label, marginLeft: "auto", color: late ? "#b91c1c" : C.muted }}>{late ? (lang === "es" ? "vencida" : "overdue") : td}</span></div></>); }} />
              )}
              {!can("task.move") && tView === "kanban" && <Note text={tr("tasks.cantMove")} />}
            </Section>
          )}

          {/* DECISIONES — calco .rowc (columna "when" + dec-exp expandible) */}
          {section === "decisiones" && (
            <div style={{ maxWidth: 740 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 11, marginBottom: 7 }}>
                <h3 style={{ fontSize: 16, fontWeight: 800, margin: 0 }}>{tr("dec.title")}</h3>
                <span style={{ fontSize: 11, color: C.muted, fontWeight: 600 }}>{decisions.filter((d) => d.status === "open").length} {lang === "es" ? "abierta" : "open"} · {decisions.filter((d) => d.status !== "open").length} {lang === "es" ? "cerradas" : "closed"}</span>
                <span style={{ flex: 1 }} />
                {can("decision.manage") && <button onClick={createDecision} style={btn(C.paper, C.muted2, true)}>{tr("btn.addDecision")}</button>}
              </div>
              <p style={{ color: C.muted, fontSize: 13, maxWidth: "72ch", margin: "-2px 0 18px", lineHeight: 1.6 }}>{lang === "es" ? "Cada decisión queda anclada al entregable que afecta y a la reunión donde salió. Clickeá una para ver el contexto y quién estuvo presente." : "Each decision is anchored to the deliverable it affects and the meeting it came from. Click one to see the context and who was present."}</p>
              {decisions.length === 0 && <Empty text={tr("dec.none")} />}
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {decisions.map((d) => {
                  const del = deliverables.find((x) => x.id === d.deliverable_id);
                  const open = d.status === "open";
                  const exp = expandedDecision === d.id;
                  const hasBody = !!(d.context || (Array.isArray(d.participants) && d.participants.length > 0));
                  return (
                    <div key={d.id} onClick={() => hasBody && setExpandedDecision(exp ? null : d.id)}
                      style={{ display: "flex", gap: 13, background: open ? C.warnSoft : C.paper, border: `1.5px solid ${open ? "#f0e0b0" : C.line}`, borderRadius: 12, padding: "13px 15px", cursor: hasBody ? "pointer" : "default" }}>
                      <span style={{ fontFamily: "ui-monospace,monospace", fontSize: 9, fontWeight: 700, letterSpacing: ".5px", textTransform: "uppercase", color: open ? C.warn : C.muted, whiteSpace: "nowrap", minWidth: 52, paddingTop: 2 }}>{open ? tr("dec.open") : tr("dec.closed")}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                          <b style={{ fontSize: 13, fontWeight: 800 }}>{d.title}</b>
                          {del && <span style={{ fontSize: 8, fontWeight: 800, letterSpacing: ".4px", textTransform: "uppercase", color: "#4a5bc0", background: "rgba(91,107,214,.11)", padding: "2px 7px", borderRadius: 5, whiteSpace: "nowrap" }}>↳ {del.title}</span>}
                        </div>
                        {d.source_ref && <div style={{ fontSize: 9, color: "rgba(0,0,0,.4)", marginTop: 6, fontWeight: 600, letterSpacing: ".3px" }}>↳ {d.source_ref}</div>}
                        {exp && hasBody && (
                          <div style={{ marginTop: 11, paddingTop: 11, borderTop: "1px solid #eee", fontSize: 12, color: C.muted, lineHeight: 1.55 }}>
                            {d.context && <span><b style={{ color: C.ink }}>{lang === "es" ? "Por qué importa: " : "Why it matters: "}</b>{d.context}</span>}
                            {Array.isArray(d.participants) && d.participants.length > 0 && (
                              <div style={{ display: "flex", alignItems: "center", gap: 7, marginTop: 10, flexWrap: "wrap" }}>
                                <span style={{ fontSize: 8, fontWeight: 800, letterSpacing: "1px", textTransform: "uppercase", color: "rgba(0,0,0,.4)" }}>{tr("dec.present")}</span>
                                {d.participants.map((p, i) => <span key={i} style={{ width: 24, height: 24, borderRadius: 999, background: p.side === "client" ? "#495057" : "#3B5BDB", color: "#fff", display: "grid", placeItems: "center", fontSize: 8, fontWeight: 700, ...(p.side === "client" ? { outline: `2px solid ${C.lime}`, outlineOffset: 1 } : {}) }}>{p.initials || "?"}</span>)}
                              </div>
                            )}
                            {open && (can("decision.manage") || can("decision.resolve_own")) && (
                              <button onClick={(e) => { e.stopPropagation(); resolveDecision(d.id); }} style={{ ...btn(C.lime, "#0a0a0a"), marginTop: 11 }}>{tr("btn.resolveDecision")}</button>
                            )}
                          </div>
                        )}
                      </div>
                      {hasBody && <span style={{ marginLeft: "auto", color: C.muted, transform: exp ? "rotate(90deg)" : "none", transition: "transform .15s", fontSize: 11, alignSelf: "flex-start", paddingTop: 2 }}>▸</span>}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* MATERIALES — agrupados por categoría (calco .matg) */}
          {section === "materiales" && (
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 11, marginBottom: 7 }}>
                <h3 style={{ fontSize: 16, fontWeight: 800, margin: 0 }}>{tr("mat.title")}</h3>
                <span style={{ fontSize: 11, color: C.muted, fontWeight: 600 }}>{materials.length} {lang === "es" ? "archivos" : "files"}</span>
                <span style={{ flex: 1 }} />
                {can("material.upload") && (
                  <>
                    <input ref={fileRef} type="file" accept="application/pdf,application/vnd.openxmlformats-officedocument.presentationml.presentation"
                      style={{ display: "none" }}
                      onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) uploadMaterial(f); }} />
                    <button onClick={() => fileRef.current?.click()} disabled={uploading} style={{ ...btn(C.paper, C.muted2, true), opacity: uploading ? .55 : 1, cursor: uploading ? "default" : "pointer" }}>
                      {uploading ? tr("mat.uploading") : (lang === "es" ? "+ Subir" : "+ Upload")}
                    </button>
                  </>
                )}
              </div>
              <p style={{ color: C.muted, fontSize: 13, maxWidth: "72ch", margin: "-2px 0 18px", lineHeight: 1.6 }}>
                {lang === "es" ? "Agrupados por área de trabajo. Lo que subas aquí queda interno hasta que se marque visible para el cliente." : "Grouped by work area. What you upload stays internal until it's marked client-visible."}
              </p>
              {materials.length === 0 && <Empty text={tr("mat.none")} />}
              {matGroups.map((g) => (
                <div key={g.cat} style={{ marginBottom: 18 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 10 }}>
                    <span style={label}>{g.label}</span>
                    <span style={{ fontSize: 8.5, fontWeight: 700, background: "rgba(0,0,0,.06)", color: "rgba(0,0,0,.4)", padding: "1px 7px", borderRadius: 8 }}>{g.items.length}</span>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(228px,1fr))", gap: 8 }}>
                    {g.items.map((m) => { const f = fileIcon(m.mime_type); return (
                      <a key={m.id} href={m.url ?? undefined} target="_blank" rel="noreferrer"
                        style={{ display: "flex", alignItems: "center", gap: 12, background: C.paper, border: `1.5px solid ${C.line}`, borderRadius: 12, padding: "11px 15px", textDecoration: "none", color: "inherit", cursor: m.url ? "pointer" : "default" }}>
                        <span style={{ width: 32, height: 32, borderRadius: 7, display: "grid", placeItems: "center", fontSize: 8, fontWeight: 900, color: "#fff", flexShrink: 0, letterSpacing: ".3px", background: f.bg }}>{f.label}</span>
                        <span style={{ flex: 1, minWidth: 0 }}>
                          <b style={{ fontSize: 12.5, fontWeight: 700, display: "block", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{m.title}</b>
                          <small style={{ fontSize: 10, color: C.muted }}>{m.modified_at ? fmtDay(m.modified_at, lang) : (m.folder_name || "Drive")}</small>
                        </span>
                        {m.url ? <span style={{ color: C.muted }}>↗</span> : <span style={label}>{tr("mat.readonly")}</span>}
                      </a>
                    ); })}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* REUNIONES */}
          {section === "reuniones" && (
            <div style={{ maxWidth: 760 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 11, marginBottom: 6 }}>
                <h3 style={{ fontSize: 16, fontWeight: 800, margin: 0 }}>{tr("nav.reuniones")}</h3>
                <span style={{ fontSize: 11, color: C.muted, fontWeight: 600 }}>
                  {meetings.length} {lang === "es" ? "en total" : "total"}
                  {totalMeetingMinutes > 0 && ` · ${fmtTotalTime(totalMeetingMinutes, lang)} ${lang === "es" ? "dedicadas a" : "spent on"} ${meta.orgName ?? cleanName(project.name)}`}
                </span>
              </div>
              <div style={{ fontSize: 12.5, color: C.muted2, marginBottom: 16 }}>{tr("meet.desc")}</div>
              {meetings.length === 0 && <Empty text={tr("meet.none")} />}
              {meetings.length > 0 && (
                <div style={{ background: C.paper, border: `1.5px solid ${C.line}`, borderRadius: 14, padding: "4px 17px 10px" }}>
                  {meetings.map((m, idx) => {
                    const ev = evidenceByMeeting.get(m.id) ?? [];
                    const exp = expandedMeeting === m.id;
                    const hasBody = !!(m.summary || ev.length);
                    return (
                      <div key={m.id} style={{ borderTop: idx === 0 ? 0 : "1px solid #eee" }}>
                        <div onClick={() => hasBody && setExpandedMeeting(exp ? null : m.id)} style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 0", cursor: hasBody ? "pointer" : "default" }}>
                          <span style={{ fontFamily: FONT_MONO, fontSize: 10, color: C.muted, minWidth: 42, fontWeight: 700, flexShrink: 0 }}>{fmtDay(m.date, lang)}</span>
                          <div style={{ flex: 1, minWidth: 0, fontSize: 12.5, fontWeight: 600 }}>
                            {m.title}
                            <small style={{ display: "block", color: C.muted, fontSize: 10.5, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {[m.platform, ev.length ? `${ev.length} ${lang === "es" ? "evidencias" : "evidence"}` : null, m.durationMinutes == null ? (lang === "es" ? "sin transcripción" : "no transcript") : null].filter(Boolean).join(" · ")}
                            </small>
                          </div>
                          {m.attendees.length > 0 && (
                            <div style={{ display: "flex", flexShrink: 0 }}>
                              {m.attendees.slice(0, 4).map((a, i) => { const c = attendeeChip(a, team); return (
                                <i key={i} title={a} style={{ width: 20, height: 20, borderRadius: "50%", marginLeft: i === 0 ? 0 : -5, border: `2px solid ${C.paper}`, fontSize: 8, fontWeight: 700, color: "#fff", display: "grid", placeItems: "center", fontStyle: "normal", background: c.bg }}>{c.initials}</i>
                              ); })}
                              {m.attendees.length > 4 && <i style={{ width: 20, height: 20, borderRadius: "50%", marginLeft: -5, border: `2px solid ${C.paper}`, fontSize: 7.5, fontWeight: 700, color: C.muted2, display: "grid", placeItems: "center", fontStyle: "normal", background: C.paper2 }}>+{m.attendees.length - 4}</i>}
                            </div>
                          )}
                          <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: ".4px", textTransform: "uppercase", color: C.muted, minWidth: 34, textAlign: "right", flexShrink: 0 }}>{m.durationMinutes != null ? `${Math.round(m.durationMinutes)}m` : "—"}</span>
                          {m.url && <a href={m.url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} style={{ color: C.muted, flexShrink: 0, textDecoration: "none" }}>↗</a>}
                          {hasBody && <span style={{ color: C.muted, fontSize: 11, flexShrink: 0, transform: exp ? "rotate(90deg)" : "none", transition: "transform .15s" }}>▸</span>}
                        </div>
                        {exp && (
                          <div style={{ padding: "0 0 12px 54px" }}>
                            {m.summary && <div style={{ fontSize: 12, color: C.muted2, lineHeight: 1.55, whiteSpace: "pre-wrap" }}>{m.summary}</div>}
                            {ev.length > 0 && (
                              <div style={{ marginTop: m.summary ? 10 : 0 }}>
                                <div style={{ ...label, marginBottom: 6 }}>{lang === "es" ? "Evidencia extraída" : "Extracted evidence"} · {ev.length}</div>
                                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                                  {ev.map((e) => (
                                    <div key={e.id} style={{ display: "flex", gap: 8, alignItems: "flex-start", background: C.paper2, borderRadius: 8, padding: "7px 10px" }}>
                                      <span style={{ width: 6, height: 6, borderRadius: 999, background: C.limeInk, flexShrink: 0, marginTop: 5 }} />
                                      <div style={{ flex: 1, minWidth: 0 }}>
                                        <span style={{ fontSize: 11.5, color: C.ink, lineHeight: 1.45 }}>{e.statement}</span>
                                        <div style={{ display: "flex", gap: 6, marginTop: 3, flexWrap: "wrap" }}>
                                          {e.type && <span style={{ fontSize: 8, fontWeight: 800, letterSpacing: ".4px", textTransform: "uppercase", color: C.muted, background: "rgba(0,0,0,.05)", padding: "1px 6px", borderRadius: 5 }}>{e.type}</span>}
                                          {e.workstream && <span style={{ fontSize: 8, fontWeight: 800, letterSpacing: ".4px", textTransform: "uppercase", color: "#4a5bc0", background: "rgba(91,107,214,.11)", padding: "1px 6px", borderRadius: 5 }}>{e.workstream}</span>}
                                        </div>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
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
      </div>{/* /app enmarcada */}

      {detail && (
        <DetailPanel
          target={detail}
          tasks={tasks}
          deliverables={deliverables}
          phases={phases}
          team={team}
          lang={lang}
          tr={tr}
          canEditTask={can("task.crud")}
          canEditDeliverableOps={can("deliverable.move")}
          canEditDeliverableStructure={can("structure.edit")}
          onClose={() => setDetail(null)}
          onSaveTask={saveTask}
          onSaveDeliverable={saveDeliverable}
        />
      )}

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
function fileIcon(mime: string | null): { bg: string; label: string } {
  const m = (mime ?? "").toLowerCase();
  if (m.includes("pdf")) return { bg: "#d33a34", label: "PDF" };
  if (m.includes("sheet") || m.includes("excel") || m.includes("csv")) return { bg: "#1f9d57", label: "XLS" };
  if (m.includes("presentation") || m.includes("slides") || m.includes("powerpoint")) return { bg: "#c67a0a", label: "DECK" };
  if (m.includes("word") || m.includes("document")) return { bg: "#3b5bdb", label: "DOC" };
  return { bg: "#6b6b6b", label: (m.split("/").pop() ?? "DOC").slice(0, 4).toUpperCase() || "DOC" };
}
const AV_COLORS = ["#3B5BDB", "#0C8599", "#9C36B5", "#495057", "#c67a0a"];
function avInit(name: string): string { return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "·"; }
function avColor(seed: string): string { let h = 0; for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0; return AV_COLORS[h % AV_COLORS.length]; }
/* duración total de reuniones, formato "11h 20m" (calco de la maqueta) */
function fmtTotalTime(mins: number, lang: string): string {
  const h = Math.floor(mins / 60), m = Math.round(mins % 60);
  if (h === 0) return `${m}m`;
  return lang === "es" ? `${h}h ${m}m` : `${h}h ${m}m`;
}
/* avatar de asistente: iniciales desde el email + color por dominio (equipo/cliente) */
function attendeeChip(email: string, team: RoomTeamMember[]): { initials: string; bg: string } {
  const member = team.find((t) => t.email?.toLowerCase() === email.toLowerCase());
  if (member) return { initials: avInit(member.name), bg: avColor(member.name) };
  const local = email.split("@")[0].replace(/[._-]+/g, " ").trim();
  const parts = local.split(/\s+/).filter(Boolean);
  const initials = (parts.length > 1 ? parts[0][0] + parts[1][0] : local.slice(0, 2)).toUpperCase();
  return { initials, bg: avColor(email) };
}
function fmtDay(iso: string | null, lang: string): string {
  if (!iso) return "";
  const d = new Date(iso.length <= 10 ? iso + "T00:00:00" : iso);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleDateString(lang === "en" ? "en-GB" : "es-ES", { day: "numeric", month: "short" });
}
function isPast(iso: string | null): boolean {
  if (!iso) return false;
  const d = new Date(iso.length <= 10 ? iso + "T23:59:59" : iso);
  return !isNaN(d.getTime()) && d.getTime() < Date.now();
}

const SUGGESTION_STOP_WORDS = new Set([
  "a", "an", "and", "are", "as", "at", "be", "by", "for", "from", "has", "in", "is", "of", "on", "or", "the", "to", "with",
  "de", "del", "el", "en", "la", "las", "los", "para", "por", "que", "se", "un", "una", "y",
  "blocker", "decision", "dependency", "milestone", "outcome", "project", "state", "status", "suggestion", "update",
]);

function suggestionTokens(s: Suggestion): Set<string> {
  const text = `${s.summary ?? ""} ${s.rationale ?? ""}`
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, " ");
  const aliases: Record<string, string> = {
    arrived: "arrival", arrives: "arrival", arriving: "arrival", delivery: "arrival",
    delayed: "delay", delays: "delay", shifted: "delay",
    approvals: "approval", approved: "approval",
    locations: "location", stores: "location", tiendas: "location",
    regulations: "regulation", regulatory: "regulation",
  };
  return new Set(text.split(/\s+/).filter((w) => w.length > 2 && !SUGGESTION_STOP_WORDS.has(w)).map((w) => aliases[w] ?? w));
}

function suggestionsOverlap(a: Suggestion, b: Suggestion): boolean {
  const kind = (s: Suggestion) => {
    const value = (s.item_type ?? "").toLowerCase();
    if (value.includes("decision")) return "decision";
    if (value.includes("status") || value.includes("state")) return "state";
    if (value.includes("task")) return "task";
    return "suggestion";
  };
  if (kind(a) !== kind(b)) return false;
  const aa = suggestionTokens(a), bb = suggestionTokens(b);
  if (!aa.size || !bb.size) return false;
  let shared = 0;
  aa.forEach((token) => { if (bb.has(token)) shared += 1; });
  const union = aa.size + bb.size - shared;
  const containment = shared / Math.min(aa.size, bb.size);
  return shared >= 3 && (shared / union >= 0.42 || containment >= 0.6);
}

function dedupeSuggestions(items: Suggestion[]): Suggestion[] {
  const newestFirst = [...items].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
  return newestFirst.filter((candidate, index) => !newestFirst.slice(0, index).some((kept) => suggestionsOverlap(candidate, kept)));
}

/* ── sub-componentes ── */
function Stat({ l, v, lime, warn, sm, animate }: { l: string; v: string; lime?: boolean; warn?: boolean; sm?: boolean; animate?: { to: number; suffix?: string } }) {
  return (
    <div style={{ background: C.paper, border: `1.5px solid ${C.line}`, borderRadius: 12, padding: "15px 16px" }}>
      <div style={label}>{l}</div>
      <div style={{ fontSize: sm ? "1.05rem" : "1.5rem", fontWeight: 900, letterSpacing: sm ? "-.3px" : "-1px", marginTop: 8, color: lime ? C.limeInk : warn ? C.warn : C.ink, whiteSpace: sm ? "normal" : "nowrap", overflow: sm ? "visible" : "hidden", textOverflow: "ellipsis", lineHeight: sm ? 1.25 : undefined }}>
        {animate ? <AnimatedNumber to={animate.to} suffix={animate.suffix} /> : v}
      </div>
    </div>
  );
}
/* hero: resalta el texto entre *asteriscos* en lime itálica (como la maqueta) */
function renderHero(text: string): ReactNode {
  return text.split(/(\*[^*]+\*)/g).map((part, i) => part.startsWith("*") && part.endsWith("*")
    ? <em key={i} style={{ fontWeight: 900, fontStyle: "italic", color: C.limeInk }}>{part.slice(1, -1)}</em>
    : <span key={i}>{part}</span>);
}
function suggLabel(itemType: string | null, lang: Lang): { label: string; warm: boolean } {
  const it = (itemType ?? "").toLowerCase();
  if (it.includes("decision")) return { label: lang === "es" ? "+ Decisión" : "+ Decision", warm: true };
  if (it.includes("status") || it.includes("state")) return { label: lang === "es" ? "↑ Estado" : "↑ Status", warm: false };
  if (it.includes("task")) return { label: lang === "es" ? "+ Tarea" : "+ Task", warm: false };
  return { label: lang === "es" ? "Sugerencia" : "Suggestion", warm: false };
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

/* ── panel de detalle (tarea / entregable) ─────────────────────────────── */

const dpRow: CSSProperties = { marginBottom: 15 };
const dpLabel: CSSProperties = { ...label, display: "block", marginBottom: 5 };
const dpInput: CSSProperties = {
  width: "100%", fontFamily: "inherit", fontSize: 13, color: C.ink, background: C.paper,
  padding: "8px 10px", borderRadius: 8, border: `1.5px solid ${C.line}`, boxSizing: "border-box",
};

function DetailPanel({
  target, tasks, deliverables, phases, team, lang, tr,
  canEditTask, canEditDeliverableOps, canEditDeliverableStructure,
  onClose, onSaveTask, onSaveDeliverable,
}: {
  target: NonNullable<DetailTarget>;
  tasks: Task[];
  deliverables: Deliverable[];
  phases: Phase[];
  team: RoomTeamMember[];
  lang: Lang;
  tr: TFn;
  canEditTask: boolean;
  canEditDeliverableOps: boolean;
  canEditDeliverableStructure: boolean;
  onClose: () => void;
  onSaveTask: (id: string, patch: Record<string, string | null>) => Promise<void>;
  onSaveDeliverable: (id: string, patch: Record<string, string | number | null>) => Promise<void>;
}) {
  const task = target.kind === "task" ? tasks.find((t) => t.id === target.id) ?? null : null;
  const deliv = target.kind === "deliverable" ? deliverables.find((d) => d.id === target.id) ?? null : null;

  // El borrador arranca del objeto guardado; cuando el padre lo reemplaza tras
  // guardar, la identidad cambia y el efecto de abajo lo vuelve a sincronizar.
  const initial = useMemo<Record<string, string>>((): Record<string, string> => {
    if (task) return {
      title: task.title,
      assigneeSide: task.assignee_side,
      ownerPersonId: task.owner_person_id ?? "",
      deliverableId: task.deliverable_id ?? "",
      dependsOn: task.depends_on ?? "",
      startDate: task.start_date ?? "",
      dueDate: task.due_date ?? "",
    };
    if (deliv) return {
      title: deliv.title,
      description: deliv.description ?? "",
      phaseId: deliv.phase_id ?? "",
      ownerPersonId: deliv.owner_person_id ?? "",
      dueDate: deliv.due_date ?? "",
      progress: String(deliv.progress ?? 0),
    };
    return {};
  }, [task, deliv]);

  const [draft, setDraft] = useState<Record<string, string>>(initial);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { setDraft(initial); setErr(null); }, [initial]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const changed = Object.keys(draft).filter((k) => draft[k] !== initial[k]);
  const editable = task ? canEditTask : canEditDeliverableStructure || canEditDeliverableOps;
  const set = (k: string, v: string) => setDraft((d) => ({ ...d, [k]: v }));

  async function save() {
    if (!changed.length) { onClose(); return; }
    setSaving(true); setErr(null);
    try {
      if (task) {
        const patch: Record<string, string | null> = {};
        changed.forEach((k) => { patch[k] = draft[k] === "" ? null : draft[k]; });
        await onSaveTask(task.id, patch);
      } else if (deliv) {
        const patch: Record<string, string | number | null> = {};
        changed.forEach((k) => { patch[k] = k === "progress" ? Number(draft[k]) : (draft[k] === "" ? null : draft[k]); });
        await onSaveDeliverable(deliv.id, patch);
      }
      onClose();
    } catch (e) { setErr((e as Error).message); }
    finally { setSaving(false); }
  }

  const kindLabel = task ? tr("detail.task") : tr("detail.deliverable");

  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.32)", zIndex: 110 }} />
      <aside role="dialog" aria-modal="true" aria-label={kindLabel}
        style={{ position: "fixed", top: 0, right: 0, height: "100vh", width: "min(460px,100vw)", background: C.paper, borderLeft: `1.5px solid ${C.line}`, zIndex: 111, display: "flex", flexDirection: "column", boxShadow: "-14px 0 44px rgba(0,0,0,.16)" }}>
        <header style={{ display: "flex", alignItems: "center", gap: 10, padding: "16px 18px", borderBottom: `1px solid ${C.line}` }}>
          <span style={label}>{kindLabel}</span>
          <span style={{ flex: 1 }} />
          <button onClick={onClose} aria-label={tr("detail.close")} style={{ background: "transparent", border: 0, fontSize: 19, lineHeight: 1, cursor: "pointer", color: C.muted }}>×</button>
        </header>

        <div style={{ flex: 1, overflowY: "auto", padding: "18px" }}>
          {!task && !deliv && <Empty text={tr("detail.gone")} />}

          {task && (
            <>
              <div style={dpRow}>
                <label style={dpLabel} htmlFor="dp-title">{tr("field.title")}</label>
                <input id="dp-title" style={dpInput} value={draft.title ?? ""} disabled={!canEditTask} onChange={(e) => set("title", e.target.value)} />
              </div>
              <div style={dpRow}>
                <label style={dpLabel} htmlFor="dp-side">{tr("field.side")}</label>
                <select id="dp-side" style={dpInput} value={draft.assigneeSide ?? "team"} disabled={!canEditTask} onChange={(e) => set("assigneeSide", e.target.value)}>
                  <option value="team">{tr("side.team")}</option>
                  <option value="client">{tr("side.client")}</option>
                </select>
              </div>
              <div style={dpRow}>
                <label style={dpLabel} htmlFor="dp-owner">{tr("field.owner")}</label>
                <select id="dp-owner" style={dpInput} value={draft.ownerPersonId ?? ""} disabled={!canEditTask} onChange={(e) => set("ownerPersonId", e.target.value)}>
                  <option value="">{tr("detail.unassigned")}</option>
                  {team.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
              </div>
              <div style={dpRow}>
                <label style={dpLabel} htmlFor="dp-deliv">{tr("field.deliverable")}</label>
                <select id="dp-deliv" style={dpInput} value={draft.deliverableId ?? ""} disabled={!canEditTask} onChange={(e) => set("deliverableId", e.target.value)}>
                  <option value="">{tr("detail.none")}</option>
                  {deliverables.map((d) => <option key={d.id} value={d.id}>{d.title}</option>)}
                </select>
              </div>
              <div style={dpRow}>
                <label style={dpLabel} htmlFor="dp-dep">{tr("field.dependsOn")}</label>
                <select id="dp-dep" style={dpInput} value={draft.dependsOn ?? ""} disabled={!canEditTask} onChange={(e) => set("dependsOn", e.target.value)}>
                  <option value="">{tr("detail.none")}</option>
                  {tasks.filter((t) => t.id !== task.id).map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
                </select>
              </div>
              <div style={{ display: "flex", gap: 12 }}>
                <div style={{ ...dpRow, flex: 1 }}>
                  <label style={dpLabel} htmlFor="dp-start">{tr("field.start")}</label>
                  <input id="dp-start" type="date" style={dpInput} value={draft.startDate ?? ""} disabled={!canEditTask} onChange={(e) => set("startDate", e.target.value)} />
                </div>
                <div style={{ ...dpRow, flex: 1 }}>
                  <label style={dpLabel} htmlFor="dp-due">{tr("field.due")}</label>
                  <input id="dp-due" type="date" style={dpInput} value={draft.dueDate ?? ""} disabled={!canEditTask} onChange={(e) => set("dueDate", e.target.value)} />
                </div>
              </div>
              <div style={{ borderTop: `1px solid ${C.lineSoft}`, paddingTop: 14, display: "grid", gap: 10 }}>
                <Field k={tr("field.state")} v={tr("ts." + task.status, task.status)} />
                <Field k={tr("field.closure")} v={task.closed_via ? `${task.closed_via === "evidence" ? tr("tasks.evidence") : tr("tasks.attested")}${task.closed_by ? " · " + task.closed_by : ""}` : null} />
                <Field k={tr("field.evidence")} v={task.evidence_ref} />
              </div>
            </>
          )}

          {deliv && (
            <>
              <div style={dpRow}>
                <label style={dpLabel} htmlFor="dp-dtitle">{tr("field.title")}</label>
                <input id="dp-dtitle" style={dpInput} value={draft.title ?? ""} disabled={!canEditDeliverableStructure} onChange={(e) => set("title", e.target.value)} />
              </div>
              <div style={dpRow}>
                <label style={dpLabel} htmlFor="dp-desc">{tr("field.description")}</label>
                <textarea id="dp-desc" rows={4} style={{ ...dpInput, resize: "vertical", lineHeight: 1.5 }} value={draft.description ?? ""} disabled={!canEditDeliverableStructure} onChange={(e) => set("description", e.target.value)} />
              </div>
              <div style={dpRow}>
                <label style={dpLabel} htmlFor="dp-phase">{tr("field.phase")}</label>
                <select id="dp-phase" style={dpInput} value={draft.phaseId ?? ""} disabled={!canEditDeliverableStructure} onChange={(e) => set("phaseId", e.target.value)}>
                  <option value="">{tr("detail.noPhase")}</option>
                  {phases.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
                </select>
              </div>
              <div style={dpRow}>
                <label style={dpLabel} htmlFor="dp-downer">{tr("field.owner")}</label>
                <select id="dp-downer" style={dpInput} value={draft.ownerPersonId ?? ""} disabled={!canEditDeliverableOps} onChange={(e) => set("ownerPersonId", e.target.value)}>
                  <option value="">{tr("detail.unassigned")}</option>
                  {team.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
              </div>
              <div style={{ display: "flex", gap: 12 }}>
                <div style={{ ...dpRow, flex: 1 }}>
                  <label style={dpLabel} htmlFor="dp-ddue">{tr("field.due")}</label>
                  <input id="dp-ddue" type="date" style={dpInput} value={draft.dueDate ?? ""} disabled={!canEditDeliverableOps} onChange={(e) => set("dueDate", e.target.value)} />
                </div>
                <div style={{ ...dpRow, flex: 1 }}>
                  <label style={dpLabel} htmlFor="dp-prog">{tr("field.progress")} · {draft.progress ?? 0}%</label>
                  <input id="dp-prog" type="range" min={0} max={100} step={5} style={{ width: "100%", accentColor: C.limeInk }} value={Number(draft.progress ?? 0)} disabled={!canEditDeliverableOps} onChange={(e) => set("progress", e.target.value)} />
                </div>
              </div>
              <div style={{ borderTop: `1px solid ${C.lineSoft}`, paddingTop: 14, display: "grid", gap: 10 }}>
                <Field k={tr("field.state")} v={tr("ds." + deliv.status, deliv.status)} />
                <Field k={tr("field.acceptedBy")} v={deliv.accepted_by ? `${deliv.accepted_by}${deliv.accepted_at ? " · " + fmtDay(deliv.accepted_at, lang) : ""}` : null} />
              </div>
            </>
          )}
        </div>

        <footer style={{ borderTop: `1px solid ${C.line}`, padding: "13px 18px", display: "flex", alignItems: "center", gap: 10 }}>
          {err && <span style={{ fontSize: 11.5, color: "#b91c1c", fontWeight: 600, flex: 1 }}>{err}</span>}
          {!err && !editable && <span style={{ fontSize: 11, color: C.muted, fontWeight: 600, flex: 1 }}>{tr("detail.readonly")}</span>}
          {!err && editable && <span style={{ flex: 1 }} />}
          <button onClick={onClose} style={btn(C.paper, C.muted2, true)}>{tr("detail.cancel")}</button>
          {editable && (
            <button onClick={save} disabled={saving || changed.length === 0}
              style={{ ...btn(C.lime, "#0a0a0a"), opacity: saving || changed.length === 0 ? .45 : 1, cursor: saving || changed.length === 0 ? "default" : "pointer" }}>
              {tr("detail.save")}
            </button>
          )}
        </footer>
      </aside>
    </>
  );
}
function card(): CSSProperties { return { background: C.paper, border: `1.5px solid ${C.line}`, borderRadius: 12, padding: 15, display: "flex", flexDirection: "column", gap: 10 }; }
function btn(bg: string, fg: string, bordered?: boolean): CSSProperties { return { fontFamily: "inherit", fontSize: 11, fontWeight: 800, letterSpacing: ".3px", textTransform: "uppercase", padding: "7px 13px", borderRadius: 8, border: bordered ? `1.5px solid ${C.line}` : "none", background: bg, color: fg, cursor: "pointer" }; }
