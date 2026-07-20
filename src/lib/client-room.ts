import "server-only";

import { supabaseAdmin } from "@/lib/supabase";
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
  "project_status", "current_stage", "geography", "themes", "client_logo_url", "hall_hero",
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

async function loadMaterials(projectId: string, includeInternal: boolean): Promise<ClientRoomMaterial[]> {
  let query = supabaseAdmin()
    .from("project_materials")
    .select("id, title, description, category, document_status, visibility, url, mime_type, folder_name, version_label, linked_milestone, modified_at")
    .eq("project_id", projectId)
    .neq("document_status", "archived")
    .order("modified_at", { ascending: false, nullsFirst: false });
  if (!includeInternal) query = query.eq("visibility", "client");
  const { data, error } = await query;
  if (error) throw new Error(`client-room materials read failed: ${error.message}`);
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

async function assembleRoom(row: ProjectRow, includeInternal: boolean): Promise<ClientRoomProject> {
  const hero = row.hall_hero ? withDraftDefaults(row.hall_hero) : null;
  const [orgName, materials, agreements, timelineEvents] = await Promise.all([
    organizationName(row.organization_id),
    loadMaterials(row.id, includeInternal),
    loadAgreements(row.id, includeInternal),
    loadTimelineEvents(row.id, includeInternal),
  ]);
  return {
    id: row.id,
    notionId: row.notion_id,
    slug: row.hall_slug ?? "",
    name: row.name ?? "Your project",
    organizationName: orgName,
    roomLabel: row.client_room_label ?? "Project room",
    roomStatus: row.client_room_status ?? "preparing",
    roomEnabled: row.client_room_enabled ?? false,
    projectStatus: row.project_status,
    currentStage: row.current_stage,
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
  };
}

export async function getClientRoomBySlug(slug: string): Promise<ClientRoomProject | null> {
  const row = await resolveClientRoomProject(slug, "slug");
  if (!row || !row.client_room_enabled) return null;
  return assembleRoom(row, false);
}

export async function getClientRoomAdminData(identifier: string): Promise<ClientRoomAdminData | null> {
  const row = await resolveClientRoomProject(identifier, "id");
  if (!row) return null;
  const room = await assembleRoom(row, true);
  return {
    ...room,
    driveFolderId: row.drive_folder_id,
    driveFolderUrl: row.drive_folder_url,
  };
}
