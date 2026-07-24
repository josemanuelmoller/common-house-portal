import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUser } from "@clerk/nextjs/server";
import { supabaseAdmin } from "@/lib/supabase";
import { isAdminEmail, isAdminUser } from "@/lib/clients";
import { listRoomsForActor, type RoomActor } from "@/lib/project-roles";

export const dynamic = "force-dynamic";

/**
 * "Mi escritorio" — vista cross-sala. Consolida, a través de todas las salas del
 * usuario: sus salas con pulso, los próximos vencimientos (deadlines) y la
 * bandeja "la IA propone" (sugerencias pendientes del gate). Puerta de entrada
 * a las salas de trabajo.
 */

const C = {
  ink: "var(--hall-ink-0)", paper: "var(--hall-paper-0)", paper1: "var(--hall-paper-1)", paper2: "var(--hall-paper-2)",
  line: "var(--hall-line)", lineSoft: "var(--hall-line-soft)", muted: "var(--hall-muted)", muted2: "var(--hall-muted-2)",
  lime: "var(--hall-lime)", limePaper: "var(--hall-lime-paper)", limeInk: "var(--hall-lime-ink)",
  ok: "var(--hall-ok)", warn: "var(--hall-warn)", warnSoft: "var(--hall-warn-soft)",
};
const label = { fontSize: 9, fontWeight: 700, letterSpacing: "1.5px", textTransform: "uppercase" as const, color: C.muted };

function cleanName(name: string | null): string { return (name ?? "Sala").replace(/^\[[^\]]*\]\s*/, "").trim() || "Sala"; }

export default async function DeskPage() {
  const user = await currentUser();
  if (!user) redirect("/sign-in");

  const email = user.primaryEmailAddress?.emailAddress?.toLowerCase() ?? null;
  const isAdmin = isAdminUser(user.id) || isAdminEmail(email ?? "");
  const actor: RoomActor = { email, clerkId: user.id, personId: null, role: isAdmin ? "pm" : null, isSuperAdmin: isAdmin };

  const rooms = await listRoomsForActor(actor);
  const roomIds = rooms.map((r) => r.id);
  const nameById = Object.fromEntries(rooms.map((r) => [r.id, cleanName(r.name)]));

  const db = supabaseAdmin();

  // persona del usuario (para "tus tareas"); admin no mapea a persona.
  let personId: string | null = null;
  if (!isAdmin && email) {
    const { data } = await db.from("project_members").select("person_id").ilike("user_email", email).not("person_id", "is", null).limit(1).maybeSingle();
    personId = (data?.person_id as string | null) ?? null;
  }

  // Cargas cross-sala.
  const [tasksRes, delivRes, propRes] = roomIds.length
    ? await Promise.all([
        db.from("project_tasks").select("id, title, status, due_date, project_id, owner_person_id").in("project_id", roomIds).neq("status", "done"),
        db.from("project_deliverables").select("id, title, status, due_date, project_id").in("project_id", roomIds).neq("status", "accepted"),
        db.from("project_state_proposals").select("id, summary, project_id, proposal_kind, created_at").in("project_id", roomIds).eq("status", "pending").order("created_at", { ascending: false }).limit(20),
      ])
    : [{ data: [] }, { data: [] }, { data: [] }];

  const openTasks = (tasksRes.data ?? []) as { id: string; title: string; status: string; due_date: string | null; project_id: string; owner_person_id: string | null }[];
  const deliverables = (delivRes.data ?? []) as { id: string; title: string; status: string; due_date: string | null; project_id: string }[];
  const proposals = (propRes.data ?? []) as { id: string; summary: string | null; project_id: string; proposal_kind: string | null; created_at: string }[];

  // Pulso por sala.
  const openByRoom: Record<string, number> = {};
  const blockedByRoom: Record<string, number> = {};
  for (const t of openTasks) {
    openByRoom[t.project_id] = (openByRoom[t.project_id] ?? 0) + 1;
    if (t.status === "blocked") blockedByRoom[t.project_id] = (blockedByRoom[t.project_id] ?? 0) + 1;
  }

  // Feed de vencimientos (tareas + entregables con due_date), próximos primero.
  const deadlines = [
    ...openTasks.filter((t) => t.due_date).map((t) => ({ id: t.id, title: t.title, due: t.due_date as string, room: nameById[t.project_id] ?? "Sala", kind: "tarea" as const })),
    ...deliverables.filter((d) => d.due_date).map((d) => ({ id: d.id, title: d.title, due: d.due_date as string, room: nameById[d.project_id] ?? "Sala", kind: "entregable" as const })),
  ].sort((a, b) => a.due.localeCompare(b.due)).slice(0, 12);

  // Tus tareas (si el usuario mapea a una persona).
  const myTasks = personId ? openTasks.filter((t) => t.owner_person_id === personId) : [];

  const today = new Date().toISOString().slice(0, 10); // render dinámico (force-dynamic): vencido = due < hoy

  return (
    <div style={{ minHeight: "100vh", background: C.paper, fontFamily: "var(--font-hall-sans), 'Inter Tight', sans-serif", color: C.ink }}>
      <div style={{ maxWidth: 960, margin: "0 auto", padding: "28px 22px 64px" }}>
        {/* header */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/isotipo-vivo.svg" alt="Common House" style={{ height: 30, width: "auto", display: "block" }} />
          <div>
            <div style={label}>Mi escritorio</div>
            <h1 style={{ fontSize: 22, fontWeight: 800, letterSpacing: "-.5px", margin: "3px 0 0" }}>
              Hola{user.firstName ? ` ${user.firstName}` : ""}. <span style={{ color: C.muted2, fontWeight: 600 }}>{rooms.length} {rooms.length === 1 ? "sala" : "salas"} en marcha.</span>
            </h1>
          </div>
        </div>

        {rooms.length === 0 && (
          <div style={{ padding: "40px 0", textAlign: "center", color: C.muted, fontSize: 13 }}>Todavía no tenés salas de trabajo asignadas.</div>
        )}

        {/* TUS SALAS */}
        {rooms.length > 0 && (
          <section style={{ marginBottom: 30 }}>
            <div style={{ ...label, marginBottom: 12 }}>Tus salas</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(260px,1fr))", gap: 12 }}>
              {rooms.map((r) => (
                <Link key={r.id} href={`/rooms/${r.id}`} style={{ textDecoration: "none", color: "inherit", background: C.paper, border: `1.5px solid ${C.line}`, borderRadius: 14, padding: "15px 16px", display: "block" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ width: 26, height: 26, borderRadius: 8, background: C.lime, color: "#0a0a0a", display: "grid", placeItems: "center", fontSize: 10, fontWeight: 800, flexShrink: 0 }}>{cleanName(r.name).split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase()}</span>
                    <b style={{ fontSize: 13.5, fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{cleanName(r.name)}</b>
                  </div>
                  {r.stage && <div style={{ fontSize: 11, color: C.muted, marginTop: 8 }}>{r.stage}</div>}
                  <div style={{ display: "flex", gap: 14, marginTop: 12 }}>
                    <span style={{ fontSize: 11.5, color: C.muted2 }}><b style={{ color: C.ink, fontWeight: 800 }}>{openByRoom[r.id] ?? 0}</b> abiertas</span>
                    {(blockedByRoom[r.id] ?? 0) > 0 && <span style={{ fontSize: 11.5, color: C.warn }}><b style={{ fontWeight: 800 }}>{blockedByRoom[r.id]}</b> bloqueadas</span>}
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(300px,1fr))", gap: 24 }}>
          {/* PRÓXIMOS VENCIMIENTOS */}
          <section>
            <div style={{ ...label, marginBottom: 12 }}>Próximos vencimientos</div>
            {deadlines.length === 0 && <div style={{ fontSize: 12.5, color: C.muted, padding: "10px 0" }}>Nada con fecha por ahora.</div>}
            <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
              {deadlines.map((d) => {
                const overdue = today ? d.due < today : false;
                return (
                  <div key={`${d.kind}-${d.id}`} style={{ display: "flex", alignItems: "center", gap: 11, background: C.paper, border: `1.5px solid ${C.line}`, borderRadius: 10, padding: "10px 13px" }}>
                    <span style={{ ...label, fontFamily: "ui-monospace,monospace", minWidth: 64, color: overdue ? C.warn : C.muted }}>{d.due}</span>
                    <span style={{ flex: 1, fontSize: 12.5, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.title}</span>
                    <span style={{ ...label, background: C.paper2, padding: "2px 7px", borderRadius: 6, color: C.muted2 }}>{d.room}</span>
                  </div>
                );
              })}
            </div>
          </section>

          {/* LA IA PROPONE (inbox de sugerencias) */}
          <section>
            <div style={{ display: "flex", alignItems: "baseline", gap: 9, marginBottom: 12 }}>
              <span style={label}>La IA propone</span>
              {proposals.length > 0 && <span style={{ fontSize: 10, fontWeight: 800, background: C.lime, color: "#0a0a0a", padding: "1px 7px", borderRadius: 8 }}>{proposals.length}</span>}
            </div>
            {proposals.length === 0 && <div style={{ fontSize: 12.5, color: C.muted, padding: "10px 0" }}>Sin sugerencias pendientes.</div>}
            <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
              {proposals.map((p) => (
                <Link key={p.id} href={`/rooms/${p.project_id}`} style={{ textDecoration: "none", color: "inherit", background: C.paper, border: `1.5px solid ${C.line}`, borderRadius: 10, padding: "10px 13px", display: "block" }}>
                  <div style={{ fontSize: 12.5, lineHeight: 1.45 }}>{p.summary ?? p.proposal_kind ?? "Sugerencia"}</div>
                  <div style={{ ...label, marginTop: 6, color: C.muted2 }}>{nameById[p.project_id] ?? "Sala"}</div>
                </Link>
              ))}
            </div>
          </section>
        </div>

        {/* TUS TAREAS (si aplica) */}
        {myTasks.length > 0 && (
          <section style={{ marginTop: 30 }}>
            <div style={{ ...label, marginBottom: 12 }}>Tus tareas</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 7, maxWidth: 640 }}>
              {myTasks.map((t) => (
                <Link key={t.id} href={`/rooms/${t.project_id}`} style={{ textDecoration: "none", color: "inherit", display: "flex", alignItems: "center", gap: 11, background: C.paper, border: `1.5px solid ${C.line}`, borderRadius: 10, padding: "10px 13px" }}>
                  <span style={{ width: 6, height: 6, borderRadius: 999, background: t.status === "blocked" ? C.warn : C.limeInk, flexShrink: 0 }} />
                  <span style={{ flex: 1, fontSize: 12.5, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.title}</span>
                  {t.due_date && <span style={{ ...label, fontFamily: "ui-monospace,monospace", color: C.muted }}>{t.due_date}</span>}
                  <span style={{ ...label, background: C.paper2, padding: "2px 7px", borderRadius: 6, color: C.muted2 }}>{nameById[t.project_id] ?? "Sala"}</span>
                </Link>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
