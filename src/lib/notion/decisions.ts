// ─── Decision Items ───────────────────────────────────────────────────────────
//
// Supabase-backed (post-Notion cutoff). Reads the canonical `decision_items`
// table. No Notion API usage. Return shapes are identical to the pre-migration
// Notion reader so downstream callers are unaffected.

export type DecisionItem = {
  id: string;
  title: string;
  decisionType: string;   // "Approval" | "Missing Input" | "Ambiguity Resolution" | "Policy/Automation Decision" | "Draft Review"
  priority: string;       // "P1 Critical" | "High" | "Medium" | "Low"
  status: string;         // "Open" | "Resolved" | "Dismissed"
  sourceAgent: string;
  requiresExecute: boolean;
  executeApproved: boolean;
  dueDate: string | null;
  notes: string;
  notionUrl: string;
  category?: string;
  // Structured metadata embedded by agents in Proposed Action
  // Format: [ENTITY_ID:page_id][RESOLUTION_FIELD:PropertyName][RESOLUTION_TYPE:text|relation][RESOLUTION_DB:db_id]
  relatedEntityId?: string;
  relatedField?: string;          // Notion property name to write to (default: "Notes")
  relatedResolutionType?: string;              // "text" (default) | "relation"
  relatedSearchDb?: string;                    // DB ID for relation searches
  relatedFields?: { field: string; label: string }[]; // multiple fields from [RESOLUTION_FIELDS:f1:l1|f2:l2]
  // Entity creation proposal — from [ENTITY_ACTION:create_org] or [ENTITY_ACTION:create_person] marker
  entityAction?: "create_org" | "create_person";
  // create_org fields
  entityName?: string;
  entityDomain?: string;
  entityCategory?: string;
  contactName?: string;
  contactEmail?: string;
  // create_person fields
  personName?: string;
  personEmail?: string;
  personOrgId?: string;    // Notion page ID of existing CH Organizations record
  personOrgName?: string;  // Human-readable org name for display
};

/** Reconstruct a Notion deep-link from a stored notion_id (dashes stripped). */
function notionUrlFromId(notionId: string | null | undefined): string {
  if (!notionId) return "";
  return `https://www.notion.so/${notionId.replace(/-/g, "")}`;
}

/**
 * Parse the embedded [MARKER:value] tags that agents write into the
 * "Proposed Action" field (stored as `notes_raw`). Returns the stripped human
 * notes plus every structured field. Mirrors the original Notion parser exactly.
 */
function parseProposedAction(raw: string | null | undefined) {
  const source = raw ?? "";
  const entityMatch        = source.match(/\[ENTITY_ID:([^\]]+)\]/);
  const fieldMatch         = source.match(/\[RESOLUTION_FIELD:([^\]]+)\]/);
  const fieldsMatch        = source.match(/\[RESOLUTION_FIELDS:([^\]]+)\]/);
  const typeMatch          = source.match(/\[RESOLUTION_TYPE:([^\]]+)\]/);
  const dbMatch            = source.match(/\[RESOLUTION_DB:([^\]]+)\]/);
  const entityActionMatch  = source.match(/\[ENTITY_ACTION:([^\]]+)\]/);
  const orgNameMatch       = source.match(/\[ORG_NAME:([^\]]+)\]/);
  const orgDomainMatch     = source.match(/\[ORG_DOMAIN:([^\]]+)\]/);
  const orgCategoryMatch   = source.match(/\[ORG_CATEGORY:([^\]]+)\]/);
  const contactNameMatch   = source.match(/\[CONTACT_NAME:([^\]]+)\]/);
  const contactEmailMatch  = source.match(/\[CONTACT_EMAIL:([^\]]+)\]/);
  const personNameMatch    = source.match(/\[PERSON_NAME:([^\]]+)\]/);
  const personEmailMatch   = source.match(/\[PERSON_EMAIL:([^\]]+)\]/);
  const personOrgIdMatch   = source.match(/\[PERSON_ORG_ID:([^\]]+)\]/);
  const personOrgNameMatch = source.match(/\[PERSON_ORG_NAME:([^\]]+)\]/);
  const stripped = source
    .replace(/\[ENTITY_ID:[^\]]+\]/g, "")
    .replace(/\[RESOLUTION_FIELD:[^\]]+\]/g, "")
    .replace(/\[RESOLUTION_FIELDS:[^\]]+\]/g, "")
    .replace(/\[RESOLUTION_TYPE:[^\]]+\]/g, "")
    .replace(/\[RESOLUTION_DB:[^\]]+\]/g, "")
    .replace(/\[ENTITY_ACTION:[^\]]+\]/g, "")
    .replace(/\[ORG_NAME:[^\]]+\]/g, "")
    .replace(/\[ORG_DOMAIN:[^\]]+\]/g, "")
    .replace(/\[ORG_CATEGORY:[^\]]+\]/g, "")
    .replace(/\[CONTACT_NAME:[^\]]+\]/g, "")
    .replace(/\[CONTACT_EMAIL:[^\]]+\]/g, "")
    .replace(/\[PERSON_NAME:[^\]]+\]/g, "")
    .replace(/\[PERSON_EMAIL:[^\]]+\]/g, "")
    .replace(/\[PERSON_ORG_ID:[^\]]+\]/g, "")
    .replace(/\[PERSON_ORG_NAME:[^\]]+\]/g, "")
    .trimStart();
  // Parse RESOLUTION_FIELDS: "fieldName1:Label 1|fieldName2:Label 2"
  const relatedFields = fieldsMatch
    ? fieldsMatch[1].split("|").map(pair => {
        const sep = pair.indexOf(":");
        return sep === -1
          ? { field: pair, label: pair }
          : { field: pair.slice(0, sep), label: pair.slice(sep + 1) };
      })
    : undefined;
  return {
    notes: stripped,
    relatedEntityId:       entityMatch       ? entityMatch[1]       : undefined,
    relatedField:          fieldMatch        ? fieldMatch[1]        : undefined,
    relatedResolutionType: typeMatch         ? typeMatch[1]         : undefined,
    relatedSearchDb:       dbMatch           ? dbMatch[1]           : undefined,
    relatedFields,
    entityAction:   entityActionMatch ? (entityActionMatch[1] as "create_org" | "create_person") : undefined,
    entityName:     orgNameMatch      ? orgNameMatch[1]      : undefined,
    entityDomain:   orgDomainMatch    ? orgDomainMatch[1]    : undefined,
    entityCategory: orgCategoryMatch  ? orgCategoryMatch[1]  : undefined,
    contactName:    contactNameMatch  ? contactNameMatch[1]  : undefined,
    contactEmail:   contactEmailMatch ? contactEmailMatch[1] : undefined,
    personName:     personNameMatch   ? personNameMatch[1]   : undefined,
    personEmail:    personEmailMatch  ? personEmailMatch[1]  : undefined,
    personOrgId:    personOrgIdMatch  ? personOrgIdMatch[1]  : undefined,
    personOrgName:  personOrgNameMatch ? personOrgNameMatch[1] : undefined,
  };
}

export async function getDecisionItems(statusFilter?: string): Promise<DecisionItem[]> {
  try {
    const { getSupabaseServerClient } = await import("../supabase-server");
    const sb = getSupabaseServerClient();

    let q = sb
      .from("decision_items")
      .select("*")
      .order("priority", { ascending: true })
      .limit(100);
    if (statusFilter) q = q.eq("status", statusFilter);

    const { data, error } = await q;
    if (error || !data) return [];

    return (data as Record<string, unknown>[]).map(r => {
      const notionId = (r.notion_id as string | null) ?? null;
      const parsed = parseProposedAction(r.notes_raw as string | null);
      return {
        id:               notionId ?? (r.id as string),
        title:            (r.title as string | null) ?? "Untitled",
        decisionType:     (r.decision_type as string | null) ?? "",
        priority:         (r.priority as string | null) ?? "",
        status:           (r.status as string | null) ?? "",
        sourceAgent:      (r.source_agent as string | null) ?? "",
        requiresExecute:  Boolean(r.requires_execute),
        executeApproved:  Boolean(r.execute_approved),
        dueDate:          (r.due_date as string | null) ?? null,
        notionUrl:        (r.notion_url as string | null) || notionUrlFromId(notionId),
        category:         (r.category as string | null) ?? undefined,
        ...parsed,
      };
    });
  } catch {
    return [];
  }
}
