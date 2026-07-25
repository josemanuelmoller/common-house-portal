import { redirect } from "next/navigation";
import { currentUser } from "@clerk/nextjs/server";
import { supabaseAdmin } from "@/lib/supabase";
import { listRoomsForActor, resolveRoomActor } from "@/lib/project-roles";
import { DeskClient, type DeskDeadline, type DeskDeliverable, type DeskProposal, type DeskRoom, type DeskTask } from "./DeskClient";

export const dynamic = "force-dynamic";

/**
 * "Mi escritorio" — vista cross-sala. Consolida, a través de todas las salas del
 * usuario: el gantt de deadlines, la bandeja "la IA propone" (gate humano), y
 * sus tareas / entregables. El render vive en DeskClient (calco de la maqueta).
 */

function cleanName(name: string | null): string { return (name ?? "Sala").replace(/^\[[^\]]*\]\s*/, "").trim() || "Sala"; }

export default async function DeskPage() {
  const user = await currentUser();
  if (!user) redirect("/sign-in");

  // El actor se resuelve contra una sala; para el escritorio necesitamos la
  // identidad global, así que resolvemos con la primera sala disponible y
  // reutilizamos su personId (resolveRoomActor ya resuelve persona por email).
  const db = supabaseAdmin();
  const bootstrap = await resolveRoomActor("00000000-0000-0000-0000-000000000000");
  const actor = { ...bootstrap, role: bootstrap.role ?? (bootstrap.isSuperAdmin ? ("pm" as const) : null) };

  const roomsRaw = await listRoomsForActor(actor);
  const roomIds = roomsRaw.map((r) => r.id);

  const [tasksRes, delivRes, propRes] = roomIds.length
    ? await Promise.all([
        db.from("project_tasks").select("id, title, status, due_date, project_id, owner_person_id").in("project_id", roomIds).neq("status", "done"),
        db.from("project_deliverables").select("id, title, status, due_date, progress, project_id, owner_person_id").in("project_id", roomIds).neq("status", "accepted"),
        db.from("project_state_proposals").select("id, summary, rationale, item_type, source_refs, project_id, created_at").in("project_id", roomIds).eq("status", "pending").order("created_at", { ascending: false }).limit(20),
      ])
    : [{ data: [] }, { data: [] }, { data: [] }];

  type TaskRow = { id: string; title: string; status: string; due_date: string | null; project_id: string; owner_person_id: string | null };
  type DelivRow = { id: string; title: string; status: string; due_date: string | null; progress: number | null; project_id: string; owner_person_id: string | null };
  type PropRow = { id: string; summary: string | null; rationale: string | null; item_type: string | null; source_refs: string[] | null; project_id: string; created_at: string };

  const openTasks = (tasksRes.data ?? []) as TaskRow[];
  const openDelivs = (delivRes.data ?? []) as DelivRow[];
  const props = (propRes.data ?? []) as PropRow[];

  const openByRoom: Record<string, number> = {};
  const blockedByRoom: Record<string, number> = {};
  for (const t of openTasks) {
    openByRoom[t.project_id] = (openByRoom[t.project_id] ?? 0) + 1;
    if (t.status === "blocked") blockedByRoom[t.project_id] = (blockedByRoom[t.project_id] ?? 0) + 1;
  }

  const rooms: DeskRoom[] = roomsRaw.map((r) => ({
    id: r.id, name: cleanName(r.name), slug: r.slug, stage: r.stage,
    open: openByRoom[r.id] ?? 0, blocked: blockedByRoom[r.id] ?? 0,
  }));

  const deadlines: DeskDeadline[] = [
    ...openTasks.filter((t) => t.due_date).map((t) => ({ id: t.id, title: t.title, due: t.due_date as string, roomId: t.project_id, kind: "tarea" as const, status: t.status, progress: null })),
    ...openDelivs.filter((d) => d.due_date).map((d) => ({ id: d.id, title: d.title, due: d.due_date as string, roomId: d.project_id, kind: "entregable" as const, status: d.status, progress: d.progress ?? null })),
  ].sort((a, b) => a.due.localeCompare(b.due));

  const proposals: DeskProposal[] = props.map((p) => ({
    id: p.id, summary: p.summary, rationale: p.rationale, itemType: p.item_type,
    roomId: p.project_id, sourceRefs: p.source_refs, createdAt: p.created_at,
  }));

  const pid = actor.personId;
  const myTasks: DeskTask[] = (pid ? openTasks.filter((t) => t.owner_person_id === pid) : [])
    .map((t) => ({ id: t.id, title: t.title, due: t.due_date, roomId: t.project_id, status: t.status }))
    .sort((a, b) => (a.due ?? "9999").localeCompare(b.due ?? "9999"));

  const myDeliverables: DeskDeliverable[] = (pid ? openDelivs.filter((d) => d.owner_person_id === pid) : [])
    .map((d) => ({ id: d.id, title: d.title, status: d.status, progress: d.progress ?? 0, roomId: d.project_id, owned: true }));

  const userName = user.fullName || user.firstName || user.primaryEmailAddress?.emailAddress?.split("@")[0] || "Vos";
  const todayISO = new Date().toISOString().slice(0, 10);

  return (
    <DeskClient
      userName={userName}
      todayISO={todayISO}
      rooms={rooms}
      deadlines={deadlines}
      proposals={proposals}
      myTasks={myTasks}
      myDeliverables={myDeliverables}
      canConfirm={actor.role === "pm"}
    />
  );
}
