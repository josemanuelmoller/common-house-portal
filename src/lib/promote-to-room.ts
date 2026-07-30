import "server-only";

import { supabaseAdmin } from "@/lib/supabase";

/**
 * Pasar un lobby (preventa) a sala de trabajo (ejecución).
 *
 * Esto era ocho tablas a pulso, y por eso salió mal la primera vez: en MPS
 * (2026-07-29) quedó "Ganada" como pill de cara al cliente, la sala arrancó sin
 * miembros ni historia, y las reuniones no aparecían porque ninguna fuente
 * estaba atribuida al proyecto. Ninguno de los tres era un descuido: eran pasos
 * que nadie había escrito en ninguna parte.
 *
 * Qué hace, todo idempotente (se puede correr dos veces sin duplicar):
 *   1. miembros de la sala desde los accesos del lobby, con el mapeo de roles;
 *   2. atribuye al proyecto las fuentes que ya están ligadas a la organización
 *      pero a ningún proyecto — así la sala no nace amnésica;
 *   3. deja los acuerdos ya respondidos del lobby como decisiones cerradas.
 *
 * Qué NO hace, a propósito:
 *   · no toca `current_stage` ni los textos: el rótulo que ve el cliente sale de
 *     clientStageLabel(), y la copia la escribe una persona (draft-first);
 *   · no abre la sala al cliente salvo que se pida explícito. Entrar a una sala
 *     sin fases ni entregables es peor que quedarse en el lobby.
 */

export type PromoteOptions = {
  /** Sumar también a la gente del cliente. Por defecto no: la sala se le abre en
   *  la sesión de inicio, no cuando se gana el trato. */
  includeClient?: boolean;
  /** Sólo calcular y reportar, sin escribir. */
  dryRun?: boolean;
  actorEmail: string;
};

export type PromoteReport = {
  projectId: string;
  membersAdded: Array<{ email: string; role: string }>;
  membersSkipped: Array<{ email: string; reason: string }>;
  sourcesAttributed: number;
  sourcesNeedingReview: number;
  decisionsCreated: number;
  warnings: string[];
};

/** Rol en el lobby → rol en la sala. El aprobador del lobby no es PM: aprueba
 *  comercialmente, no dirige el proyecto. */
function roomRoleFor(email: string, lobbyRole: string, houseDomains: string[]): string {
  const domain = email.split("@")[1]?.toLowerCase() ?? "";
  const isHouse = houseDomains.includes(domain);
  if (isHouse) return lobbyRole === "approver" ? "pm" : "collaborator";
  return lobbyRole === "viewer" ? "reader" : "client";
}

const HOUSE_DOMAINS = ["wearecommonhouse.com"];

export async function promoteLobbyToRoom(
  projectId: string,
  opts: PromoteOptions,
): Promise<PromoteReport> {
  const sb = supabaseAdmin();
  const report: PromoteReport = {
    projectId, membersAdded: [], membersSkipped: [],
    sourcesAttributed: 0, sourcesNeedingReview: 0, decisionsCreated: 0, warnings: [],
  };

  const { data: project } = await sb
    .from("projects")
    .select("id, notion_id, organization_id, current_stage, client_stage_label")
    .eq("id", projectId)
    .maybeSingle();
  if (!project) throw new Error("Project not found");

  // ── 1. Miembros ────────────────────────────────────────────────────────────
  const [{ data: grants }, { data: existing }] = await Promise.all([
    sb.from("client_access").select("granted_email, role").eq("project_id", projectId).is("revoked_at", null),
    sb.from("project_members").select("user_email").eq("project_id", projectId).is("revoked_at", null),
  ]);
  const already = new Set((existing ?? []).map((m) => (m.user_email as string | null)?.toLowerCase()).filter(Boolean));

  for (const g of (grants ?? []) as Array<{ granted_email: string; role: string }>) {
    const email = g.granted_email.toLowerCase();
    if (already.has(email)) { report.membersSkipped.push({ email, reason: "ya es miembro" }); continue; }
    const role = roomRoleFor(email, g.role, HOUSE_DOMAINS);
    const isClientSide = role === "client" || role === "reader";
    if (isClientSide && !opts.includeClient) {
      report.membersSkipped.push({ email, reason: "lado cliente — se suma en la sesión de inicio" });
      continue;
    }
    if (!opts.dryRun) {
      const { data: person } = await sb.from("people").select("id").ilike("email", email).maybeSingle();
      await sb.from("project_members").insert({
        project_id: projectId, person_id: (person?.id as string | null) ?? null,
        user_email: email, role, invited_by: opts.actorEmail,
      });
    }
    report.membersAdded.push({ email, role });
  }

  // ── 2. Historia: atribuir fuentes de la organización ───────────────────────
  // Sólo cuando la organización tiene UN proyecto. Con dos o más no hay forma de
  // saber a cuál pertenece cada reunión, y atribuir mal es peor que no atribuir:
  // mete evidencia ajena en la bandeja de propuestas del proyecto equivocado.
  if (project.organization_id && project.notion_id) {
    const { data: orgProjects } = await sb
      .from("projects").select("id").eq("organization_id", project.organization_id);
    const { data: org } = await sb
      .from("organizations").select("notion_id").eq("id", project.organization_id).maybeSingle();
    const orgNotionId = (org?.notion_id as string | null) ?? null;

    if (orgNotionId) {
      const { data: orphans } = await sb
        .from("sources").select("id").eq("org_notion_id", orgNotionId).is("project_notion_id", null);
      const count = (orphans ?? []).length;

      if ((orgProjects ?? []).length === 1) {
        if (!opts.dryRun && count > 0) {
          await sb.from("sources")
            .update({ project_notion_id: project.notion_id, updated_at: new Date().toISOString() })
            .eq("org_notion_id", orgNotionId).is("project_notion_id", null);
        }
        report.sourcesAttributed = count;
      } else {
        report.sourcesNeedingReview = count;
        report.warnings.push(
          `La organización tiene ${(orgProjects ?? []).length} proyectos: ${count} fuentes sin atribuir quedan para revisión manual.`,
        );
      }
    }
  }

  // ── 3. Historia: acuerdos respondidos → decisiones cerradas ────────────────
  const { data: agreements } = await sb
    .from("project_agreements")
    .select("id, title, summary, responded_at, response_comment")
    .eq("project_id", projectId)
    .not("responded_at", "is", null);
  const { data: existingDecisions } = await sb
    .from("project_decisions").select("source_ref").eq("project_id", projectId);
  const decided = new Set((existingDecisions ?? []).map((d) => d.source_ref as string | null).filter(Boolean));

  for (const a of (agreements ?? []) as Array<Record<string, unknown>>) {
    const ref = `agreement:${a.id as string}`;
    if (decided.has(ref)) continue;
    if (!opts.dryRun) {
      await sb.from("project_decisions").insert({
        project_id: projectId,
        title: a.title as string,
        context: [a.summary as string | null, a.response_comment as string | null].filter(Boolean).join("\n\n") || null,
        status: "closed",
        source_ref: ref,
      });
    }
    report.decisionsCreated += 1;
  }

  if (!project.client_stage_label) {
    report.warnings.push(
      "El proyecto no tiene client_stage_label: el cliente va a ver el rótulo traducido de current_stage, o el genérico si esa etapa no está mapeada.",
    );
  }
  return report;
}
