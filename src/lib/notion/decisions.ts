import { notion, DB, prop, text, select, checkbox, date } from "./core";

// ─── Decision Items ───────────────────────────────────────────────────────────

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

export async function getDecisionItems(statusFilter?: string): Promise<DecisionItem[]> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const filter: any = statusFilter
      ? { property: "Status", select: { equals: statusFilter } }
      : undefined;

    const res = await notion.databases.query({
      database_id: DB.decisions,
      filter,
      sorts: [{ property: "Priority", direction: "ascending" }],
      page_size: 100,
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return res.results.map((page: any) => {
      // Notion title property can be named anything — find it by type
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const titleProp = Object.values(page.properties as Record<string, any>).find((p: any) => p.type === "title");
      const pageTitle = titleProp?.title?.[0]?.plain_text ?? text(prop(page, "Decision Title")) ?? text(prop(page, "Name")) ?? "Untitled";
      return ({
      id: page.id,
      title: pageTitle,
      decisionType: select(prop(page, "Decision Type")),
      priority: select(prop(page, "Priority")),
      status: select(prop(page, "Status")),
      sourceAgent: select(prop(page, "Source Agent")),
      requiresExecute: checkbox(prop(page, "Requires Execute")),
      executeApproved: checkbox(prop(page, "Execute Approved")),
      dueDate: date(prop(page, "Decision Due Date")),
      ...(() => {
        const raw = text(prop(page, "Proposed Action")) ?? "";
        // Parse embedded agent metadata markers
        const entityMatch        = raw.match(/\[ENTITY_ID:([^\]]+)\]/);
        const fieldMatch         = raw.match(/\[RESOLUTION_FIELD:([^\]]+)\]/);
        const fieldsMatch        = raw.match(/\[RESOLUTION_FIELDS:([^\]]+)\]/);
        const typeMatch          = raw.match(/\[RESOLUTION_TYPE:([^\]]+)\]/);
        const dbMatch            = raw.match(/\[RESOLUTION_DB:([^\]]+)\]/);
        const entityActionMatch  = raw.match(/\[ENTITY_ACTION:([^\]]+)\]/);
        const orgNameMatch       = raw.match(/\[ORG_NAME:([^\]]+)\]/);
        const orgDomainMatch     = raw.match(/\[ORG_DOMAIN:([^\]]+)\]/);
        const orgCategoryMatch   = raw.match(/\[ORG_CATEGORY:([^\]]+)\]/);
        const contactNameMatch   = raw.match(/\[CONTACT_NAME:([^\]]+)\]/);
        const contactEmailMatch  = raw.match(/\[CONTACT_EMAIL:([^\]]+)\]/);
        const personNameMatch    = raw.match(/\[PERSON_NAME:([^\]]+)\]/);
        const personEmailMatch   = raw.match(/\[PERSON_EMAIL:([^\]]+)\]/);
        const personOrgIdMatch   = raw.match(/\[PERSON_ORG_ID:([^\]]+)\]/);
        const personOrgNameMatch = raw.match(/\[PERSON_ORG_NAME:([^\]]+)\]/);
        const stripped = raw
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
      })(),
      notionUrl: page.url ?? "",
      category: page.properties["Decision Category"]?.select?.name ?? undefined,
    }); });
  } catch {
    return [];
  }
}
