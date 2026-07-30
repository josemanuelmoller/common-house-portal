import "server-only";

import { supabaseAdmin } from "@/lib/supabase";
import { clientStageLabel } from "@/lib/client-stage";
import {
  withDraftDefaults,
  type HallDraft,
  type HallDraftProposal,
  type HallDraftTimelineItem,
} from "@/lib/hall-compose-shared";

export type ClientRoomMaterialCategory =
  | "plan_timeline"
  | "deliverable"
  | "presentation"
  | "manual"
  | "working_document"
  | "contract_agreement"
  | "proposal_budget"
  | "purchase_order"
  | "invoice"
  | "multimedia"
  | "other";

export type ClientRoomMaterial = {
  id: string;
  title: string;
  description: string | null;
  category: ClientRoomMaterialCategory;
  documentStatus: string;
  visibility: string;
  url: string;
  mimeType: string | null;
  folderName: string | null;
  versionLabel: string | null;
  linkedMilestone: string | null;
  modifiedAt: string | null;
  /** Display name of whoever shared it, already sanitised — never a raw handle.
   *  Falls back to "Common House" so system writers stay invisible to clients. */
  sharedBy: string;
  /** When it became visible to the client; the honest "hace N días" anchor. */
  clientVisibleAt: string | null;
};

export type BillingAccount = { title: string; details: string };

export type ClientRoomBilling = {
  legalName: string | null;
  companyNumber: string | null;
  vatNumber: string | null;
  address: string | null;
  billingEmail: string | null;
  publicNote: string | null;
  bankAccounts: BillingAccount[]; // populated only when the viewer may see banking (admin or approver)
};

export type ClientBillingProfile = {
  legalName: string | null;
  taxId: string | null;
  address: string | null;
  billingEmail: string | null;
  billingContact: string | null;
  poReference: string | null;
  notes: string | null;
  submittedByEmail: string | null;
  updatedAt: string | null;
};

export type ClientRoomTimelineEvent = {
  id: string;
  eventDate: string;
  kind: "meeting" | "milestone" | "document" | "exchange";
  title: string;
  summary: string | null;
  attendees: string[];
  location: string | null;
  visibility: string;
  sourceId: string | null;
  materialId: string | null;
  agreementId: string | null;
};

export type ClientRoomAgreement = {
  id: string;
  agreementType: string;
  title: string;
  summary: string | null;
  status: string;
  visibility: string;
  dueAt: string | null;
  version: number;
  requestedAt: string | null;
  respondedEmail: string | null;
  respondedAt: string | null;
  responseComment: string | null;
  materialId: string | null;
};

export type ClientRoomProject = {
  id: string;
  notionId: string | null;
  slug: string;
  name: string;
  organizationName: string | null;
  roomLabel: string;
  roomStatus: string;
  roomEnabled: boolean;
  projectStatus: string | null;
  currentStage: string | null;
  geography: string | null;
  themes: string | null;
  clientLogoUrl: string | null;
  welcomeNote: string | null;
  currentFocus: string | null;
  nextMilestone: string | null;
  whatWeHeard: {
    challenge: string | null;
    mattersMost: string | null;
    obstacles: string | null;
    success: string | null;
    heard: Array<{ point: string; speakerName: string | null; sourceId: string | null }>;
    needed: Array<{ point: string; speakerName: string | null; sourceId: string | null }>;
  };
  proposal: HallDraftProposal;
  timeline: HallDraftTimelineItem[];
  timelineEvents: ClientRoomTimelineEvent[];
  materials: ClientRoomMaterial[];
  agreements: ClientRoomAgreement[];
  billing: ClientRoomBilling;
  clientBilling: ClientBillingProfile | null;
  /** Visita anterior de quien mira, para marcar lo que cambió desde entonces.
   *  null la primera vez (nada es "nuevo" si nunca estuviste). */
  lastVisitAt: string | null;
};

export type ClientRoomAdminData = ClientRoomProject & {
  driveFolderId: string | null;
  driveFolderUrl: string | null;
};

type ProjectRow = {
  id: string;
  notion_id: string | null;
  hall_slug: string | null;
  name: string | null;
  organization_id: string | null;
  client_room_label: string | null;
  client_room_status: string | null;
  client_room_enabled: boolean | null;
  project_status: string | null;
  current_stage: string | null;
  client_stage_label: string | null;
  geography: string | null;
  themes: string | null;
  client_logo_url: string | null;
  hall_hero: HallDraft | null;
  hall_welcome_note: string | null;
  hall_current_focus: string | null;
  hall_next_milestone: string | null;
  hall_challenge: string | null;
  hall_matters_most: string | null;
  hall_obstacles: string | null;
  hall_success: string | null;
  drive_folder_id: string | null;
  drive_folder_url: string | null;
};

const PROJECT_SELECT = [
  "id", "notion_id", "hall_slug", "name", "organization_id",
  "client_room_label", "client_room_status", "client_room_enabled",
  "project_status", "current_stage", "client_stage_label", "geography", "themes", "client_logo_url", "hall_hero",
  "hall_welcome_note", "hall_current_focus", "hall_next_milestone",
  "hall_challenge", "hall_matters_most", "hall_obstacles", "hall_success",
  "drive_folder_id", "drive_folder_url",
].join(", ");

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export async function resolveClientRoomProject(
  identifier: string,
  mode: "slug" | "id" = "id"
): Promise<ProjectRow | null> {
  const sb = supabaseAdmin();
  let query = sb.from("projects").select(PROJECT_SELECT);
  if (mode === "slug") query = query.eq("hall_slug", identifier);
  else if (isUuid(identifier)) query = query.eq("id", identifier);
  else query = query.eq("notion_id", identifier);
  const { data, error } = await query.maybeSingle();
  if (error) throw new Error(`client-room project read failed: ${error.message}`);
  return (data as ProjectRow | null) ?? null;
}

async function organizationName(organizationId: string | null): Promise<string | null> {
  if (!organizationId) return null;
  const { data } = await supabaseAdmin()
    .from("organizations")
    .select("name")
    .eq("id", organizationId)
    .maybeSingle();
  return (data?.name as string | undefined) ?? null;
}

/**
 * `project_materials.added_by` stores raw handles, not people: real ones like
 * "josemanuelmoller", but also "admin" and "claude-code (draft)". None of those
 * can ever reach a client, so this resolves what it can against `people` (by the
 * local part of the email) and collapses everything else to "Common House" —
 * which is true, and leaks nothing about how the file got there.
 */
const HOUSE = "Common House";
const SYSTEM_HANDLE = /^(admin|system|cron|service|claude|codex|bot)\b|claude-code/i;

type PersonRow = { email: string | null; display_name: string | null; full_name: string | null };

/** "José Manuel Moller" → "josemanuelmoller". Sin acentos ni separadores, que es
 *  la forma en que el handle guarda el nombre. */
function normalizeName(value: string): string {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/gi, "").toLowerCase();
}

/** full_name trae el correo como nombre en las personas sin higienizar; si no hay
 *  un nombre de verdad, mejor la casa que un handle crudo. */
function pickName(row: PersonRow): string | null {
  if (row.display_name) return row.display_name;
  if (row.full_name && !row.full_name.includes("@")) return row.full_name;
  return null;
}

async function resolveSharers(handles: Array<string | null>): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const real = [...new Set(handles.filter((h): h is string => !!h && !SYSTEM_HANDLE.test(h)))];
  if (real.length === 0) return out;
  const sb = supabaseAdmin();

  // 1) Por la parte local del correo: "josemanuelmoller" → josemanuelmoller@…
  const { data } = await sb
    .from("people")
    .select("email, display_name, full_name")
    .or(real.map((h) => `email.ilike.${h.replace(/[,()]/g, "")}@%`).join(","));
  for (const row of (data ?? []) as PersonRow[]) {
    const local = (row.email ?? "").split("@")[0]?.toLowerCase();
    const name = pickName(row);
    if (local && name) out.set(local, name);
  }

  // 2) Los que quedaron sin resolver. El primer pase falla cuando la persona
  //    está bajo otro correo: "josemanuelmoller" hace match con la cuenta de
  //    gmail, cuyo full_name es el propio correo, mientras el nombre real vive
  //    en josemanuel@wearecommonhouse.com. El handle suele ser el nombre sin
  //    espacios, así que se compara normalizado contra el equipo de la casa —
  //    que es, por definición, quien comparte material en un lobby.
  const missing = real.filter((h) => !out.has(h.toLowerCase()));
  if (missing.length > 0) {
    const { data: staff } = await sb
      .from("people")
      .select("email, display_name, full_name")
      .ilike("email", "%@wearecommonhouse.com");
    for (const row of (staff ?? []) as PersonRow[]) {
      const name = pickName(row);
      if (!name) continue;
      const candidates = [normalizeName(name), normalizeName(row.full_name ?? "")];
      for (const handle of missing) {
        if (candidates.includes(normalizeName(handle))) out.set(handle.toLowerCase(), name);
      }
    }
  }
  return out;
}

async function loadMaterials(projectId: string, includeInternal: boolean): Promise<ClientRoomMaterial[]> {
  let query = supabaseAdmin()
    .from("project_materials")
    .select("id, title, description, category, document_status, visibility, url, mime_type, folder_name, version_label, linked_milestone, modified_at, added_by, client_visible_at")
    .eq("project_id", projectId)
    .neq("document_status", "archived")
    .order("modified_at", { ascending: false, nullsFirst: false });
  if (!includeInternal) query = query.eq("visibility", "client");
  const { data, error } = await query;
  if (error) throw new Error(`client-room materials read failed: ${error.message}`);
  const sharers = await resolveSharers((data ?? []).map((r) => (r.added_by as string | null) ?? null));
  return (data ?? []).map((row) => ({
    id: row.id as string,
    title: row.title as string,
    description: (row.description as string | null) ?? null,
    category: row.category as ClientRoomMaterialCategory,
    documentStatus: row.document_status as string,
    visibility: row.visibility as string,
    url: row.url as string,
    mimeType: (row.mime_type as string | null) ?? null,
    folderName: (row.folder_name as string | null) ?? null,
    versionLabel: (row.version_label as string | null) ?? null,
    linkedMilestone: (row.linked_milestone as string | null) ?? null,
    modifiedAt: (row.modified_at as string | null) ?? null,
    sharedBy: sharers.get(((row.added_by as string | null) ?? "").toLowerCase()) ?? HOUSE,
    clientVisibleAt: (row.client_visible_at as string | null) ?? null,
  }));
}

async function loadAgreements(projectId: string, includeInternal: boolean): Promise<ClientRoomAgreement[]> {
  let query = supabaseAdmin()
    .from("project_agreements")
    .select("id, agreement_type, title, summary, status, visibility, due_at, version, requested_at, responded_email, responded_at, response_comment, material_id")
    .eq("project_id", projectId)
    .neq("status", "archived")
    .order("created_at", { ascending: false });
  if (!includeInternal) query = query.eq("visibility", "client").neq("status", "draft");
  const { data, error } = await query;
  if (error) throw new Error(`client-room agreements read failed: ${error.message}`);
  return (data ?? []).map((row) => ({
    id: row.id as string,
    agreementType: row.agreement_type as string,
    title: row.title as string,
    summary: (row.summary as string | null) ?? null,
    status: row.status as string,
    visibility: row.visibility as string,
    dueAt: (row.due_at as string | null) ?? null,
    version: row.version as number,
    requestedAt: (row.requested_at as string | null) ?? null,
    respondedEmail: (row.responded_email as string | null) ?? null,
    respondedAt: (row.responded_at as string | null) ?? null,
    responseComment: (row.response_comment as string | null) ?? null,
    materialId: (row.material_id as string | null) ?? null,
  }));
}

async function loadTimelineEvents(projectId: string, includeInternal: boolean): Promise<ClientRoomTimelineEvent[]> {
  let query = supabaseAdmin()
    .from("project_timeline_events")
    .select("id, event_date, kind, title, summary, attendees, location, visibility, source_id, material_id, agreement_id")
    .eq("project_id", projectId)
    .neq("visibility", "archived")
    .order("event_date", { ascending: false })
    .order("sort_order", { ascending: true });
  if (!includeInternal) query = query.eq("visibility", "client");
  const { data, error } = await query;
  if (error) throw new Error(`client-room timeline read failed: ${error.message}`);
  return (data ?? []).map((row) => ({
    id: row.id as string,
    eventDate: row.event_date as string,
    kind: row.kind as ClientRoomTimelineEvent["kind"],
    title: row.title as string,
    summary: (row.summary as string | null) ?? null,
    attendees: (row.attendees as string[] | null) ?? [],
    location: (row.location as string | null) ?? null,
    visibility: row.visibility as string,
    sourceId: (row.source_id as string | null) ?? null,
    materialId: (row.material_id as string | null) ?? null,
    agreementId: (row.agreement_id as string | null) ?? null,
  }));
}

async function loadBilling(canSeeBank: boolean): Promise<ClientRoomBilling> {
  const { data } = await supabaseAdmin()
    .from("company_billing")
    .select("legal_name, tax_id, vat_number, address, billing_email, public_note, bank_accounts")
    .eq("id", 1)
    .maybeSingle();
  const rawAccounts = (data?.bank_accounts as Array<{ title?: string; details?: string }> | null) ?? [];
  const accounts: BillingAccount[] = Array.isArray(rawAccounts)
    ? rawAccounts.map((a) => ({ title: String(a?.title ?? "").trim(), details: String(a?.details ?? "").trim() })).filter((a) => a.title || a.details)
    : [];
  return {
    legalName: (data?.legal_name as string | null) ?? null,
    companyNumber: (data?.tax_id as string | null) ?? null,
    vatNumber: (data?.vat_number as string | null) ?? null,
    address: (data?.address as string | null) ?? null,
    billingEmail: (data?.billing_email as string | null) ?? null,
    publicNote: (data?.public_note as string | null) ?? null,
    bankAccounts: canSeeBank ? accounts : [],
  };
}

async function loadClientBilling(projectId: string): Promise<ClientBillingProfile | null> {
  const { data } = await supabaseAdmin()
    .from("client_billing_profiles")
    .select("legal_name, tax_id, address, billing_email, billing_contact, po_reference, notes, submitted_by_email, updated_at")
    .eq("project_id", projectId)
    .maybeSingle();
  if (!data) return null;
  return {
    legalName: (data.legal_name as string | null) ?? null,
    taxId: (data.tax_id as string | null) ?? null,
    address: (data.address as string | null) ?? null,
    billingEmail: (data.billing_email as string | null) ?? null,
    billingContact: (data.billing_contact as string | null) ?? null,
    poReference: (data.po_reference as string | null) ?? null,
    notes: (data.notes as string | null) ?? null,
    submittedByEmail: (data.submitted_by_email as string | null) ?? null,
    updatedAt: (data.updated_at as string | null) ?? null,
  };
}

/**
 * La visita ANTERIOR de esta persona a este lobby — la que fija la línea de
 * "nuevo desde tu última visita".
 *
 * Se ignoran los últimos 30 minutos a propósito: el tracker registra la visita
 * en curso apenas monta, así que sin esa ventana la sesión de ahora se marcaría
 * a sí misma como ya vista y no habría novedades nunca. Las previsualizaciones
 * de admin quedan fuera (is_admin) por la misma razón que en las estadísticas:
 * no son visitas del cliente.
 */
async function loadLastVisit(projectId: string, viewerEmail: string | null): Promise<string | null> {
  if (!viewerEmail) return null;
  const cutoff = new Date(Date.now() - 30 * 60 * 1000).toISOString();
  const { data } = await supabaseAdmin()
    .from("portal_analytics_events")
    .select("occurred_at")
    .eq("project_id", projectId)
    .eq("event_type", "visit")
    .eq("is_admin", false)
    .ilike("actor_email", viewerEmail)
    .lt("occurred_at", cutoff)
    .order("occurred_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data?.occurred_at as string | null) ?? null;
}

async function assembleRoom(row: ProjectRow, includeInternal: boolean, canSeeBank = false, viewerEmail: string | null = null): Promise<ClientRoomProject> {
  const hero = row.hall_hero ? withDraftDefaults(row.hall_hero) : null;
  const [orgName, materials, agreements, timelineEvents, billing, clientBilling] = await Promise.all([
    organizationName(row.organization_id),
    loadMaterials(row.id, includeInternal),
    loadAgreements(row.id, includeInternal),
    loadTimelineEvents(row.id, includeInternal),
    loadBilling(canSeeBank),
    loadClientBilling(row.id),
  ]);
  const lastVisitAt = await loadLastVisit(row.id, viewerEmail);
  return {
    id: row.id,
    notionId: row.notion_id,
    slug: row.hall_slug ?? "",
    name: row.name ?? "Your project",
    organizationName: orgName,
    // "Room" quedó reservado para la sala de trabajo; esta superficie es la
    // propuesta (el lobby), así que el rótulo por defecto la nombra por lo que es.
    roomLabel: row.client_room_label ?? "Propuesta",
    roomStatus: row.client_room_status ?? "preparing",
    roomEnabled: row.client_room_enabled ?? false,
    projectStatus: row.project_status,
    // Traducido: current_stage es interno y no se muestra crudo (ver client-stage.ts).
    currentStage: clientStageLabel(row.current_stage, row.client_stage_label),
    geography: row.geography,
    themes: row.themes,
    clientLogoUrl: row.client_logo_url,
    welcomeNote: row.hall_welcome_note,
    currentFocus: row.hall_current_focus,
    nextMilestone: row.hall_next_milestone,
    whatWeHeard: {
      challenge: row.hall_challenge,
      mattersMost: row.hall_matters_most,
      obstacles: row.hall_obstacles,
      success: row.hall_success,
      heard: (hero?.listening.heard ?? []).map((item) => ({
        point: item.point,
        speakerName: item.speaker_name,
        sourceId: item.source_id,
      })),
      needed: (hero?.listening.needed ?? []).map((item) => ({
        point: item.point,
        speakerName: item.speaker_name,
        sourceId: item.source_id,
      })),
    },
    proposal: hero?.proposal ?? {
      status: "draft", summary: null, file_url: null, file_name: null, sent_at: null,
    },
    timeline: hero?.timeline ?? [],
    timelineEvents,
    materials,
    agreements,
    billing,
    clientBilling,
    lastVisitAt,
  };
}

export async function getClientRoomBySlug(
  slug: string,
  opts?: { canSeeBank?: boolean; viewerEmail?: string | null },
): Promise<ClientRoomProject | null> {
  const row = await resolveClientRoomProject(slug, "slug");
  if (!row || !row.client_room_enabled) return null;
  return assembleRoom(row, false, opts?.canSeeBank ?? false, opts?.viewerEmail ?? null);
}

export async function getClientRoomAdminData(identifier: string): Promise<ClientRoomAdminData | null> {
  const row = await resolveClientRoomProject(identifier, "id");
  if (!row) return null;
  const room = await assembleRoom(row, true, true);
  return {
    ...room,
    driveFolderId: row.drive_folder_id,
    driveFolderUrl: row.drive_folder_url,
  };
}
