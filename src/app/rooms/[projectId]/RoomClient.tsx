"use client";

import { useMemo, useState, type CSSProperties, type ReactNode } from "react";

/* ── tipos (espejo de las tablas del Bloque 0) ── */
type Phase = { id: string; title: string; status: string; position: number };
type Deliverable = { id: string; title: string; status: string; progress: number; phase_id: string | null; owner_person_id: string | null; due_date: string | null; position: number };
type Task = { id: string; title: string; status: string; assignee_side: string; deliverable_id: string | null; closed_via: string | null; closed_by: string | null; due_date: string | null; position: number };

type Props = {
  projectId: string;
  role: string;
  capabilities: string[];
  project: { id: string; name: string | null; current_stage: string | null };
  initialPhases: Phase[];
  initialDeliverables: Deliverable[];
  initialTasks: Task[];
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

async function api(path: string, method: string, body?: unknown) {
  const res = await fetch(path, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error || `Error ${res.status}`);
  return json;
}

export function RoomClient({ projectId, role, capabilities, project, initialPhases, initialDeliverables, initialTasks }: Props) {
  const [section, setSection] = useState<"resumen" | "plan" | "entregables" | "tareas">("resumen");
  const [deliverables, setDeliverables] = useState<Deliverable[]>(initialDeliverables);
  const [tasks, setTasks] = useState<Task[]>(initialTasks);
  const [phases] = useState<Phase[]>(initialPhases);
  const [openPhase, setOpenPhase] = useState<string | null>(initialPhases.find((p) => p.status === "in_progress")?.id ?? null);
  const [dView, setDView] = useState<"list" | "kanban">("kanban");
  const [tView, setTView] = useState<"list" | "kanban">("kanban");
  const [toast, setToast] = useState<string | null>(null);
  const can = (c: string) => capabilities.includes(c);
  const base = `/api/rooms/${projectId}`;

  function flash(msg: string) { setToast(msg); window.setTimeout(() => setToast(null), 3000); }

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
    try { await api(`${base}/deliverables`, "PATCH", { id, action: "accept" }); flash("Entregable aceptado"); }
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
    const prev = tasks;
    setTasks((ts) => ts.map((x) => (x.id === t.id ? { ...x, status: "done", closed_via: "attestation" } : x)));
    try { await api(`${base}/tasks`, "PATCH", { id: t.id, action: "close" }); flash("Tarea cerrada · atestiguada por ti"); }
    catch (e) { setTasks(prev); flash((e as Error).message); }
  }
  async function createDeliverable() {
    if (!can("structure.edit")) return;
    const title = window.prompt("Nuevo entregable:");
    if (!title?.trim()) return;
    try { const r = await api(`${base}/deliverables`, "POST", { title }); setDeliverables((ds) => [...ds, r.deliverable]); }
    catch (e) { flash((e as Error).message); }
  }
  async function createTask() {
    if (!can("task.crud")) return;
    const title = window.prompt("Nueva tarea:");
    if (!title?.trim()) return;
    try { const r = await api(`${base}/tasks`, "POST", { title }); setTasks((ts) => [...ts, r.task]); }
    catch (e) { flash((e as Error).message); }
  }

  /* ── stats ── */
  const stats = useMemo(() => {
    const dDone = deliverables.filter((d) => d.status === "delivered" || d.status === "accepted").length;
    const avance = deliverables.length ? Math.round(deliverables.reduce((a, d) => a + (d.progress || 0), 0) / deliverables.length) : 0;
    const tDone = tasks.filter((t) => t.status === "done").length;
    return { avance, dDone, dTot: deliverables.length, tDone, tTot: tasks.length, blocked: tasks.filter((t) => t.status === "blocked").length };
  }, [deliverables, tasks]);

  const roleLabel: Record<string, string> = { pm: "PM", collaborator: "Colaborador", client: "Cliente", reader: "Lector" };

  return (
    <div style={{ maxWidth: 1120, margin: "0 auto", padding: "20px 18px 60px", fontFamily: "var(--font-hall-sans), 'Inter Tight', sans-serif", color: C.ink }}>
      {/* header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 18 }}>
        <div>
          <div style={label}>Sala de trabajo</div>
          <h1 style={{ fontSize: 22, fontWeight: 800, letterSpacing: "-.4px", margin: "4px 0 0" }}>{project.name ?? "Proyecto"}</h1>
        </div>
        <span style={{ flex: 1 }} />
        {project.current_stage && <span style={pill(C.lime, "#0a0a0a")}>{project.current_stage}</span>}
        <span style={pill(C.paper2, C.muted2)} title="Tu rol en esta sala">{roleLabel[role] ?? role}</span>
      </div>

      {/* nav */}
      <div style={{ display: "flex", gap: 4, borderBottom: `1.5px solid ${C.line}`, marginBottom: 20 }}>
        {(["resumen", "plan", "entregables", "tareas"] as const).map((s) => (
          <button key={s} onClick={() => setSection(s)} style={{
            fontFamily: "inherit", fontSize: 13, fontWeight: section === s ? 700 : 600, textTransform: "capitalize",
            color: section === s ? C.ink : C.muted, background: "transparent", border: 0, borderBottom: `2px solid ${section === s ? C.limeInk : "transparent"}`,
            padding: "10px 12px", cursor: "pointer", marginBottom: -1.5,
          }}>{s}{s === "entregables" ? ` (${deliverables.length})` : s === "tareas" ? ` (${tasks.length})` : ""}</button>
        ))}
      </div>

      {/* RESUMEN */}
      {section === "resumen" && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 11 }}>
          <Stat l="Avance" v={`${stats.avance}%`} lime />
          <Stat l="Entregables" v={`${stats.dDone}/${stats.dTot}`} />
          <Stat l="Tareas hechas" v={`${stats.tDone}/${stats.tTot}`} />
          <Stat l="Bloqueadas" v={String(stats.blocked)} warn={stats.blocked > 0} />
        </div>
      )}

      {/* PLAN */}
      {section === "plan" && (
        <div style={{ maxWidth: 760 }}>
          {phases.length === 0 && <Empty text="Todavía no hay fases." />}
          {phases.map((p) => {
            const dels = deliverables.filter((d) => d.phase_id === p.id);
            const st = p.status === "done" ? { i: "✓", bg: C.lime, fg: "#0a0a0a" } : p.status === "in_progress" ? { i: "•", bg: C.paper, fg: C.warn } : { i: "○", bg: C.paper2, fg: C.muted };
            const open = openPhase === p.id;
            return (
              <div key={p.id} style={{ background: C.paper, border: `1.5px solid ${C.line}`, borderRadius: 12, overflow: "hidden", marginBottom: 10 }}>
                <button onClick={() => setOpenPhase(open ? null : p.id)} style={{ width: "100%", display: "flex", alignItems: "center", gap: 12, padding: "13px 15px", background: "transparent", border: 0, cursor: "pointer", fontFamily: "inherit" }}>
                  <span style={{ width: 22, height: 22, borderRadius: 999, display: "grid", placeItems: "center", fontSize: 11, fontWeight: 900, background: st.bg, color: st.fg, border: p.status === "in_progress" ? `2px solid ${C.warn}` : "none" }}>{st.i}</span>
                  <b style={{ fontSize: 14, fontWeight: 800 }}>{p.title}</b>
                  <span style={{ ...label, marginLeft: 4 }}>{p.status === "done" ? "cumplida" : p.status === "in_progress" ? "en curso" : "por venir"}</span>
                  <span style={{ flex: 1 }} />
                  <span style={{ color: C.muted, transform: open ? "rotate(90deg)" : "none", transition: "transform .15s" }}>▸</span>
                </button>
                {open && (
                  <div style={{ padding: "0 15px 12px 49px" }}>
                    {dels.length === 0 && <div style={{ fontSize: 12, color: C.muted, padding: "6px 0" }}>Sin entregables en esta fase.</div>}
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
          title="Entregables"
          view={dView} setView={setDView}
          onCreate={can("structure.edit") ? createDeliverable : undefined} createLabel="+ Entregable"
        >
          {dView === "list" ? (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(260px,1fr))", gap: 12 }}>
              {deliverables.map((d) => (
                <div key={d.id} style={card()}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                    <b style={{ fontSize: 14, fontWeight: 800 }}>{d.title}</b>
                    <span style={statusPill(d.status)}>{statusLabel(d.status)}</span>
                  </div>
                  <Progress v={d.progress} />
                  {d.status === "delivered" && can("deliverable.accept") && (
                    <button onClick={() => acceptDeliverable(d.id)} style={btn(C.lime, "#0a0a0a")}>Aceptar entregable</button>
                  )}
                </div>
              ))}
              {deliverables.length === 0 && <Empty text="Todavía no hay entregables." />}
            </div>
          ) : (
            <Kanban cols={DELIV_COLS} items={deliverables} draggable={can("deliverable.move")}
              onDrop={(id, to) => { const d = deliverables.find((x) => x.id === id); if (d && d.status !== to) moveDeliverable(id, to, d.status); }}
              renderCard={(d) => (<><div style={{ fontSize: 12, fontWeight: 700 }}>{d.title}</div><div style={{ ...label, marginTop: 6 }}>{d.progress}%</div></>)} />
          )}
          {!can("deliverable.move") && dView === "kanban" && <Note text="Tu rol no puede mover entregables (solo mirar)." />}
        </Section>
      )}

      {/* TAREAS */}
      {section === "tareas" && (
        <Section
          title="Tareas"
          view={tView} setView={setTView}
          onCreate={can("task.crud") ? createTask : undefined} createLabel="+ Tarea"
        >
          {tView === "list" ? (
            <div style={{ maxWidth: 680 }}>
              {["todo", "doing", "blocked", "done"].map((stt) => {
                const items = tasks.filter((t) => t.status === stt);
                if (!items.length) return null;
                return (
                  <div key={stt} style={{ marginBottom: 14 }}>
                    <div style={{ ...label, marginBottom: 7 }}>{TASK_COLS.find((c) => c.key === stt)?.label}</div>
                    {items.map((t) => (
                      <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 11, padding: "11px 13px", background: C.paper, border: `1.5px solid ${C.line}`, borderRadius: 10, marginBottom: 7 }}>
                        {t.status !== "done" && (can("task.manage") || can("task.mark_own"))
                          ? <button onClick={() => closeTask(t)} title="Marcar hecha" style={{ width: 17, height: 17, borderRadius: 5, border: `1.5px solid ${C.muted}`, background: "transparent", cursor: "pointer", flex: "none" }} />
                          : <span style={{ width: 17, height: 17, borderRadius: 5, background: t.status === "done" ? C.lime : "transparent", border: `1.5px solid ${t.status === "done" ? C.lime : C.line}`, display: "grid", placeItems: "center", fontSize: 11, fontWeight: 900, color: "#0a0a0a", flex: "none" }}>{t.status === "done" ? "✓" : ""}</span>}
                        <span style={{ flex: 1, fontSize: 12.5, textDecoration: t.status === "done" ? "line-through" : "none", color: t.status === "done" ? C.muted : C.ink }}>{t.title}</span>
                        {t.assignee_side === "client" && <span style={pill(C.paper2, C.muted2)}>cliente</span>}
                        {t.closed_via && <span style={{ ...label, color: t.closed_via === "evidence" ? C.limeInk : C.muted }}>{t.closed_via === "evidence" ? "✓ evidencia" : "✍ atestiguada"}</span>}
                      </div>
                    ))}
                  </div>
                );
              })}
              {tasks.length === 0 && <Empty text="Todavía no hay tareas." />}
            </div>
          ) : (
            <Kanban cols={TASK_COLS} items={tasks} draggable={can("task.move")}
              onDrop={(id, to) => { const t = tasks.find((x) => x.id === id); if (t && t.status !== to) moveTask(id, to, t.status); }}
              renderCard={(t) => (<><div style={{ fontSize: 12, fontWeight: 700 }}>{t.title}</div>{t.assignee_side === "client" && <div style={{ ...label, marginTop: 6 }}>cliente</div>}</>)} />
          )}
          {!can("task.move") && tView === "kanban" && <Note text="Tu rol no puede mover tareas (solo mirar)." />}
        </Section>
      )}

      {toast && (
        <div style={{ position: "fixed", left: "50%", bottom: 24, transform: "translateX(-50%)", background: C.ink, color: "#fff", padding: "10px 15px", borderRadius: 11, fontSize: 12.5, fontWeight: 600, boxShadow: "0 10px 30px rgba(0,0,0,.3)", zIndex: 100 }}>{toast}</div>
      )}
    </div>
  );

  /* ── helpers de color ── */
  function statusDot(s: string) { return s === "at_risk" ? C.warn : s === "delivered" || s === "accepted" ? C.ok : s === "in_progress" ? C.limeInk : C.muted; }
  function statusLabel(s: string) { return ({ not_started: "Por iniciar", in_progress: "En curso", at_risk: "En riesgo", delivered: "Entregado", accepted: "Aceptado" } as Record<string, string>)[s] ?? s; }
  function statusPill(s: string): CSSProperties {
    if (s === "at_risk") return pill(C.warnSoft, C.warn);
    if (s === "delivered" || s === "accepted") return pill(C.okSoft, C.ok);
    if (s === "in_progress") return pill(C.limePaper, C.limeInk);
    return pill(C.paper2, C.muted2);
  }
}

/* ── sub-componentes ── */
function Stat({ l, v, lime, warn }: { l: string; v: string; lime?: boolean; warn?: boolean }) {
  return (
    <div style={{ background: C.paper, border: `1.5px solid ${C.line}`, borderRadius: 12, padding: "15px 16px" }}>
      <div style={label}>{l}</div>
      <div style={{ fontSize: "1.5rem", fontWeight: 900, letterSpacing: "-1px", marginTop: 8, color: lime ? C.limeInk : warn ? C.warn : C.ink }}>{v}</div>
    </div>
  );
}
function Section({ title, view, setView, onCreate, createLabel, children }: { title: string; view: "list" | "kanban"; setView: (v: "list" | "kanban") => void; onCreate?: () => void; createLabel: string; children: ReactNode }) {
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 11, marginBottom: 14 }}>
        <h3 style={{ fontSize: 16, fontWeight: 800, margin: 0 }}>{title}</h3>
        <span style={{ flex: 1 }} />
        <div style={{ display: "inline-flex", background: C.paper, border: `1.5px solid ${C.line}`, borderRadius: 8, padding: 2 }}>
          {(["list", "kanban"] as const).map((v) => (
            <button key={v} onClick={() => setView(v)} style={{ fontFamily: "inherit", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".3px", border: 0, borderRadius: 6, padding: "5px 11px", cursor: "pointer", background: view === v ? C.ink : "transparent", color: view === v ? "#fff" : C.muted }}>{v === "list" ? "Lista" : "Kanban"}</button>
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
    <div style={{ display: "grid", gridTemplateColumns: `repeat(${cols.length},1fr)`, gap: 11, alignItems: "start" }}>
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
function Note({ text }: { text: string }) { return <div style={{ marginTop: 11, fontSize: 11, color: C.muted, fontWeight: 600 }}>{text}</div>; }
function card(): CSSProperties { return { background: C.paper, border: `1.5px solid ${C.line}`, borderRadius: 12, padding: 15, display: "flex", flexDirection: "column", gap: 10 }; }
function btn(bg: string, fg: string, bordered?: boolean): CSSProperties { return { fontFamily: "inherit", fontSize: 11, fontWeight: 800, letterSpacing: ".3px", textTransform: "uppercase", padding: "7px 13px", borderRadius: 8, border: bordered ? `1.5px solid ${C.line}` : "none", background: bg, color: fg, cursor: "pointer" }; }
