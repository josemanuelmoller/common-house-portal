import "server-only";
import { supabaseAdmin } from "@/lib/supabase";
import type { Capability, RoomActor } from "@/lib/project-roles";

/**
 * Contexto de la sala para la sección "Proyecto" (Origen · Equipo · Administrativo).
 * Origen y Equipo salen de datos que la sala HEREDA de la preventa (proyecto/org/
 * miembros ya resueltos). Administrativo está gateado: el perfil de facturación del
 * cliente sólo lo ve el equipo interno o el propio cliente; los datos de cobro de
 * Common House los ve cualquiera de la sala (es cómo se le paga).
 */

export type RoomProjectMeta = {
  orgName: string | null;
  orgLocation: string | null;
  orgWebsite: string | null;
  engagementModel: string | null;
  projectType: string | null;
  geography: string | null;
  startDate: string | null;
  targetEndDate: string | null;
  projectCode: string | null;
  driveUrl: string | null;
  presaleSlug: string | null;
  currentFocus: string | null;
  nextMilestone: string | null;
};

export type RoomTeamMember = {
  id: string;
  name: string;
  email: string | null;
  role: string;
  jobTitle: string | null;
  photoUrl: string | null;
  side: "team" | "client";
};

export type RoomBilling = {
  company: {
    legalName: string | null; taxId: string | null; vatNumber: string | null;
    address: string | null; billingEmail: string | null; publicNote: string | null;
  } | null;
  client: {
    legalName: string | null; taxId: string | null; address: string | null;
    billingEmail: string | null; billingContact: string | null; poReference: string | null;
  } | null;
};

export type RoomContext = { meta: RoomProjectMeta; team: RoomTeamMember[]; billing: RoomBilling };

export async function loadRoomContext(projectId: string, actor: RoomActor, caps: Capability[]): Promise<RoomContext> {
  const db = supabaseAdmin();

  const [projRes, membersRes, companyRes] = await Promise.all([
    db.from("projects").select("current_stage, start_date, target_end_date, hall_slug, organization_id, drive_folder_url, engagement_model, project_type, geography, hall_current_focus, hall_next_milestone, canonical_project_code").eq("id", projectId).maybeSingle(),
    db.from("project_members").select("person_id, user_email, role, created_at").eq("project_id", projectId).is("revoked_at", null).order("created_at", { ascending: true }),
    db.from("company_billing").select("legal_name, tax_id, vat_number, address, billing_email, public_note").limit(1).maybeSingle(),
  ]);

  const proj = projRes.data;

  // Organización (Origen).
  let orgName: string | null = null, orgLocation: string | null = null, orgWebsite: string | null = null;
  if (proj?.organization_id) {
    const { data: org } = await db.from("organizations").select("name, city, country, website").eq("id", proj.organization_id).maybeSingle();
    orgName = (org?.name as string | null) ?? null;
    orgLocation = [org?.city, org?.country].filter(Boolean).join(", ") || null;
    orgWebsite = (org?.website as string | null) ?? null;
  }

  const meta: RoomProjectMeta = {
    orgName, orgLocation, orgWebsite,
    engagementModel: (proj?.engagement_model as string | null) ?? null,
    projectType: (proj?.project_type as string | null) ?? null,
    geography: (proj?.geography as string | null) ?? null,
    startDate: (proj?.start_date as string | null) ?? null,
    targetEndDate: (proj?.target_end_date as string | null) ?? null,
    projectCode: (proj?.canonical_project_code as string | null) ?? null,
    driveUrl: (proj?.drive_folder_url as string | null) ?? null,
    presaleSlug: (proj?.hall_slug as string | null) ?? null,
    currentFocus: (proj?.hall_current_focus as string | null) ?? null,
    nextMilestone: (proj?.hall_next_milestone as string | null) ?? null,
  };

  // Equipo — miembros con nombre/persona resuelta.
  const members = membersRes.data ?? [];
  const personIds = members.map((m) => m.person_id as string | null).filter((x): x is string => !!x);
  const peopleById: Record<string, { full_name: string | null; display_name: string | null; email: string | null; job_title: string | null; photo_url: string | null }> = {};
  if (personIds.length) {
    const { data: ppl } = await db.from("people").select("id, full_name, display_name, email, job_title, photo_url").in("id", personIds);
    (ppl ?? []).forEach((p) => { peopleById[p.id as string] = p as never; });
  }
  const team: RoomTeamMember[] = members.map((m, i) => {
    const p = m.person_id ? peopleById[m.person_id as string] : null;
    const email = (p?.email as string | null) ?? (m.user_email as string | null) ?? null;
    const name = (p?.display_name as string | null) || (p?.full_name as string | null) || email?.split("@")[0] || "Sin nombre";
    return {
      id: (m.person_id as string | null) ?? (m.user_email as string | null) ?? `m${i}`,
      name, email,
      role: m.role as string,
      jobTitle: (p?.job_title as string | null) ?? null,
      photoUrl: (p?.photo_url as string | null) ?? null,
      side: m.role === "client" ? "client" : "team",
    };
  });

  // Administrativo — company billing (visible a la sala) + client billing (gateado).
  const comp = companyRes.data;
  const company = comp
    ? {
        legalName: (comp.legal_name as string | null) ?? null,
        taxId: (comp.tax_id as string | null) ?? null,
        vatNumber: (comp.vat_number as string | null) ?? null,
        address: (comp.address as string | null) ?? null,
        billingEmail: (comp.billing_email as string | null) ?? null,
        publicNote: (comp.public_note as string | null) ?? null,
      }
    : null;

  let client: RoomBilling["client"] = null;
  const canSeeClientBilling = caps.includes("internal.view") || actor.role === "client";
  if (canSeeClientBilling) {
    const { data } = await db.from("client_billing_profiles").select("legal_name, tax_id, address, billing_email, billing_contact, po_reference").eq("project_id", projectId).maybeSingle();
    if (data) {
      client = {
        legalName: (data.legal_name as string | null) ?? null,
        taxId: (data.tax_id as string | null) ?? null,
        address: (data.address as string | null) ?? null,
        billingEmail: (data.billing_email as string | null) ?? null,
        billingContact: (data.billing_contact as string | null) ?? null,
        poReference: (data.po_reference as string | null) ?? null,
      };
    }
  }

  return { meta, team, billing: { company, client } };
}
