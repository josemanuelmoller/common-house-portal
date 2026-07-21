// ─── Core (client · DB · helpers) ────────────────────────────────────────────
// Extracted to src/lib/notion/core.ts per docs/NOTION_LAYER_REFACTOR_PLAN.md.
// Re-exported here so all existing imports from "@/lib/notion" keep working.
// Domain modules will be extracted incrementally; this file shrinks over time.
export * from "./notion/core";
import { notion, DB, prop, text, select, multiSelect, num, checkbox, date, relationFirst, relationIds } from "./notion/core";
import { getSupabaseServerClient } from "@/lib/supabase-server";

// ─── Supabase read helpers (Notion-cutoff migration) ─────────────────────────
// Non-Garage getters below read canonical rows from Supabase instead of Notion.
// A record's `id` is the source Notion page id (notion_id), falling back to the
// row uuid only when notion_id is null. Notion URLs are reconstructed
// deterministically from notion_id.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function sbId(row: any): string {
  return row?.notion_id ?? row?.id ?? "";
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function sbNotionUrl(row: any): string {
  const nid: string | null = row?.notion_id ?? null;
  return nid ? `https://www.notion.so/${String(nid).replace(/-/g, "")}` : "";
}

// Wrap a Supabase row's `payload` jsonb (raw Notion property objects) so the
// existing prop()/text()/select()/date() helpers read it unchanged. Only valid
// for tables whose payload preserves Notion-format properties (offers,
// proposal_briefs, style_profiles). content_pipeline_items stores a flat payload.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function payloadPage(row: any): any {
  return { properties: row?.payload ?? {} };
}

// ─── Agent Drafts ─────────────────────────────────────────────────────────────
// Extracted to src/lib/notion/drafts.ts per docs/NOTION_LAYER_REFACTOR_PLAN.md.
export * from "./notion/drafts";

// ─── Daily Briefings ──────────────────────────────────────────────────────────
// Extracted to src/lib/notion/briefings.ts per docs/NOTION_LAYER_REFACTOR_PLAN.md.
export * from "./notion/briefings";

// ─── Insight Briefs ───────────────────────────────────────────────────────────
// Extracted to src/lib/notion/insights.ts per docs/NOTION_LAYER_REFACTOR_PLAN.md.
export * from "./notion/insights";

// ─── Knowledge Assets ─────────────────────────────────────────────────────────
// Extracted to src/lib/notion/knowledge.ts per docs/NOTION_LAYER_REFACTOR_PLAN.md.
export * from "./notion/knowledge";

// ─── Decision Items ───────────────────────────────────────────────────────────
// Extracted to src/lib/notion/decisions.ts per docs/NOTION_LAYER_REFACTOR_PLAN.md.
export * from "./notion/decisions";

// ─── Living Room ──────────────────────────────────────────────────────────────
// Extracted to src/lib/notion/living-room.ts per docs/NOTION_LAYER_REFACTOR_PLAN.md.
export * from "./notion/living-room";

// ─── Evidence ─────────────────────────────────────────────────────────────────
// Extracted to src/lib/notion/evidence.ts per docs/NOTION_LAYER_REFACTOR_PLAN.md.
export * from "./notion/evidence";

// ─── Sources ──────────────────────────────────────────────────────────────────
// Extracted to src/lib/notion/sources.ts per docs/NOTION_LAYER_REFACTOR_PLAN.md.
export * from "./notion/sources";

// ─── Projects ─────────────────────────────────────────────────────────────────
// Extracted to src/lib/notion/projects.ts per docs/NOTION_LAYER_REFACTOR_PLAN.md.
// Includes: Project, ProjectCard, DashboardStats types; parseProject (private),
// getAllProjects, getProjectById, getProjectsOverview, getDashboardStats.
// fetchAllEvidence (previously private here) is now exported from notion/evidence.ts.
export * from "./notion/projects";

// ─── People & Orgs ────────────────────────────────────────────────────────────
// Extracted to src/lib/notion/people.ts per docs/NOTION_LAYER_REFACTOR_PLAN.md.
// Includes: PersonRecord, OrgRecord, ProjectPeople, ResidentRecord, WarmthRecord types;
// resolvePerson/resolveOrg (private), getProjectPeople, getAllPeople, getAllResidents,
// getColdRelationships. WarmthRecord moved here from the commercial section (queries DB.people).
export * from "./notion/people";

// ─── Competitive Intel ────────────────────────────────────────────────────────
// CH Competitive Intel records written by /api/competitive-monitor, joined
// with CH Watchlist entity names/types so the Hall panel can group signals
// into Competitor Pulse vs Sector Signal vs Other.
export * from "./notion/competitive";

// ─── Content Pipeline ─────────────────────────────────────────────────────────

export type StyleProfile = {
  id: string;
  name: string;
  styleType: string;    // Voice / Tone | Deck Style | Proposal Style | etc.
  scope: string;        // Common House | JMM | Portfolio Startup | Cross-entity
  status: string;       // Active | Draft | Archived
  masterPrompt: string;
  toneSummary: string;
  structuralRules: string;
  vocabularyPatterns: string;
  forbiddenPatterns: string;
  ctaStyle: string;
  firstPersonAllowed: boolean;
};

export type ContentPipelineItem = {
  id: string;
  title: string;
  status: string;       // Draft | Review | Approved | Published | Archived
  contentType: string;  // Post | Newsletter | Article | Report | Investor Update | Proposal
  channel: string;      // LinkedIn | Newsletter | Internal | etc.
  desk: string;         // Comms | Design | Insights | Grants | ""
  projectId: string | null;
  projectName: string;
  draftDate: string | null;
  publishDate: string | null;
  notionUrl: string;
  draftText: string;    // AI-generated draft (Draft Text property, multi-chunk rich_text)
  slideHtml: string;    // HTML slide deck for Deck/One-pager/Proposal content types
};

export async function getContentPipeline(statusFilter?: string): Promise<ContentPipelineItem[]> {
  try {
    const sb = getSupabaseServerClient();
    let query = sb
      .from("content_pipeline_items")
      .select("*")
      .order("updated_at", { ascending: false })
      .limit(100);
    if (statusFilter) query = query.eq("status", statusFilter);

    const { data, error } = await query;
    if (error || !data) return [];

    // content_pipeline_items.payload is a FLAT object: { platform, notion_url,
    // content_type, publish_window } — not Notion-format properties.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (data as any[]).map(row => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const p: any = row.payload ?? {};
      return {
        id:          sbId(row),
        title:       row.title || "Untitled",
        status:      row.status || "",
        contentType: p.content_type ?? "",
        channel:     row.channel ?? p.platform ?? "",
        desk:        "",
        projectId:   null,
        projectName: "",
        draftDate:   null,
        publishDate: row.published_at ?? row.scheduled_for ?? null,
        notionUrl:   sbNotionUrl(row),
        draftText:   row.body_md ?? "",
        slideHtml:   "",
      };
    });
  } catch {
    return [];
  }
}

// ─── Style Profiles ───────────────────────────────────────────────────────────

export async function getStyleProfiles(): Promise<StyleProfile[]> {
  try {
    const sb = getSupabaseServerClient();
    const { data, error } = await sb
      .from("style_profiles")
      .select("*")
      .limit(200);
    if (error || !data) return [];

    // style_profiles.payload preserves Notion-format properties. Status is stored
    // only inside payload (no dedicated column), so filter/sort in JS to preserve
    // the original "Active only, ordered by Scope ascending" behavior.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows = (data as any[]).map(row => {
      const pg = payloadPage(row);
      return {
        id:                  sbId(row),
        name:                row.name || text(prop(pg, "Name")) || "Untitled",
        styleType:           select(prop(pg, "Style Type")),
        scope:               select(prop(pg, "Scope")),
        status:              select(prop(pg, "Status")),
        masterPrompt:        text(prop(pg, "Master Prompt")),
        toneSummary:         text(prop(pg, "Tone Summary")),
        structuralRules:     text(prop(pg, "Structural Rules")),
        vocabularyPatterns:  text(prop(pg, "Vocabulary Patterns")),
        forbiddenPatterns:   text(prop(pg, "Forbidden Patterns")),
        ctaStyle:            text(prop(pg, "CTA Style")),
        firstPersonAllowed:  prop(pg, "First Person Allowed")?.checkbox ?? false,
      };
    });

    return rows
      .filter(r => r.status === "Active")
      .sort((a, b) => a.scope.localeCompare(b.scope));
  } catch {
    return [];
  }
}

// ─── Garage financial layer ───────────────────────────────────────────────────
//
// Architecture: Valuations, Cap Table, and Data Room relate to CH Organizations
// (not CH Projects) via a "Startup" relation field. Financial Snapshots can link
// to CH Projects directly via "Scope Project". The bridge is the project's
// "Primary Organization" relation field.

async function getPrimaryOrgIds(projectId: string): Promise<string[]> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const page: any = await notion.pages.retrieve({ page_id: projectId });
    const ids = relationIds(prop(page, "Primary Organization"));
    if (ids.length) return ids;

    // Fallback: if "Primary Organization" is not filled, search CH Organizations by
    // project name. Normalise both sides (lowercase, strip spaces/hyphens) so
    // "Way Out" matches "Wayout", "Fair Cycle" matches "faircycle", etc.
    const projectName: string = text(prop(page, "Project Name")) ?? "";
    if (!projectName) return [];

    const normalize = (s: string) => s.toLowerCase().replace(/[\s\-_.]/g, "");
    const needle = normalize(projectName);

    // Notion title `contains` filter is case-insensitive — get candidates, then fuzzy-match
    const res = await notion.databases.query({
      database_id: DB.organizations,
      filter: { property: "Name", title: { contains: projectName.split(" ")[0] } },
      page_size: 10,
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const org of res.results as any[]) {
      const orgName = text(prop(org, "Name")) ?? "";
      const hay = normalize(orgName);
      if (hay === needle || hay.includes(needle) || needle.includes(hay)) {
        return [org.id];
      }
    }

    return [];
  } catch {
    return [];
  }
}

export type StartupOrgData = {
  id: string;
  name: string;
  mrr: string;
  fundingRound: string;
  investmentStatus: string;
  teamSize: string;
  website: string;
  stage: string;
};

export async function getStartupOrgData(projectId: string): Promise<StartupOrgData | null> {
  try {
    const orgIds = await getPrimaryOrgIds(projectId);
    if (!orgIds.length) return null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const page: any = await notion.pages.retrieve({ page_id: orgIds[0] });
    return {
      id:               page.id,
      name:             text(prop(page, "Name")),
      mrr:              text(prop(page, "Startup MRR")),
      fundingRound:     select(prop(page, "Startup Funding Round")),
      investmentStatus: select(prop(page, "Startup Investment Status")),
      teamSize:         text(prop(page, "Startup Team Size")),
      website:          page.properties?.["Website"]?.url ?? "",
      stage:            select(prop(page, "Startup Stage")),
    };
  } catch {
    return null;
  }
}

export type FinancialSnapshot = {
  id: string;
  name: string;
  revenue: number | null;
  cost: number | null;
  grossMargin: number | null;
  burn: number | null;
  cash: number | null;
  ar: number | null;
  ap: number | null;
  runway: number | null;
  period: string | null;
};

export async function getFinancialsForProject(projectId: string): Promise<FinancialSnapshot[]> {
  try {
    const res = await notion.databases.query({
      database_id: DB.financialSnapshots,
      filter: { property: "Scope Project", relation: { contains: projectId } },
      sorts: [{ property: "Period", direction: "descending" }],
      page_size: 12,
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (res.results as any[]).map(page => ({
      id:          page.id,
      name:        text(prop(page, "Snapshot Name")),
      revenue:     prop(page, "Revenue")?.number ?? null,
      cost:        prop(page, "Cost")?.number ?? null,
      grossMargin: prop(page, "Gross Margin")?.number ?? null,
      burn:        prop(page, "Burn")?.number ?? null,
      cash:        prop(page, "Cash")?.number ?? null,
      ar:          prop(page, "AR")?.number ?? null,
      ap:          prop(page, "AP")?.number ?? null,
      runway:      prop(page, "Runway")?.number ?? null,
      period:      date(prop(page, "Period")),
    }));
  } catch {
    return [];
  }
}

export type ValuationRecord = {
  id: string;
  name: string;
  method: string;
  status: string;
  preMoneyMin: number | null;
  preMoneyMax: number | null;
  confidence: string;
  period: string | null;
  keyAssumptions: string;
};

export async function getValuationsForProject(projectId: string): Promise<ValuationRecord[]> {
  try {
    const orgIds = await getPrimaryOrgIds(projectId);
    if (!orgIds.length) return [];
    const res = await notion.databases.query({
      database_id: DB.valuations,
      filter: { property: "Startup", relation: { contains: orgIds[0] } },
      sorts: [{ property: "Period", direction: "descending" }],
      page_size: 20,
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (res.results as any[]).map(page => ({
      id:             page.id,
      name:           text(prop(page, "Valuation Name")),
      method:         select(prop(page, "Method")),
      status:         select(prop(page, "Status")),
      preMoneyMin:    prop(page, "Pre-money Min (£)")?.number ?? null,
      preMoneyMax:    prop(page, "Pre-money Max (£)")?.number ?? null,
      confidence:     select(prop(page, "Confidence")),
      period:         date(prop(page, "Period")),
      keyAssumptions: text(prop(page, "Key Assumptions")),
    }));
  } catch {
    return [];
  }
}

export type CapTableEntry = {
  id: string;
  name: string;
  shareholderName: string;
  shareholderType: string;
  shareClass: string;
  round: string;
  shares: number | null;
  ownershipPct: number | null;
  dilutedPct: number | null;
  investedAmount: number | null;
  investmentDate: string | null;
};

export async function getCapTableForProject(projectId: string): Promise<CapTableEntry[]> {
  try {
    const orgIds = await getPrimaryOrgIds(projectId);
    if (!orgIds.length) return [];
    const res = await notion.databases.query({
      database_id: DB.capTable,
      filter: { property: "Startup", relation: { contains: orgIds[0] } },
      sorts: [{ property: "Investment Date", direction: "descending" }],
      page_size: 50,
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (res.results as any[]).map(page => ({
      id:              page.id,
      name:            text(prop(page, "Entry Name")),
      shareholderName: text(prop(page, "Shareholder Name")),
      shareholderType: select(prop(page, "Shareholder Type")),
      shareClass:      select(prop(page, "Share Class")),
      round:           select(prop(page, "Round")),
      shares:          prop(page, "Shares")?.number ?? null,
      ownershipPct:    prop(page, "Ownership Pct")?.number ?? null,
      dilutedPct:      prop(page, "Diluted Pct")?.number ?? null,
      investedAmount:  prop(page, "Invested Amount (£)")?.number ?? null,
      investmentDate:  date(prop(page, "Investment Date")),
    }));
  } catch {
    return [];
  }
}

export type DataRoomItem = {
  id: string;
  name: string;
  category: string;
  documentType: string;
  fileUrl: string;
  status: string;
  priority: string;
  vcRelevance: string;
  notes: string;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapDataRoomPage(page: any): DataRoomItem {
  return {
    id:           page.id,
    name:         text(prop(page, "Item Name")),
    category:     select(prop(page, "Category")),
    documentType: select(prop(page, "Document Type")),
    fileUrl:      page.properties?.["File URL"]?.url ?? "",
    status:       select(prop(page, "Status")),
    priority:     select(prop(page, "Priority")),
    vcRelevance:  select(prop(page, "VC Relevance")),
    notes:        text(prop(page, "Notes")),
  };
}

export async function getDataRoomForProject(projectId: string): Promise<DataRoomItem[]> {
  try {
    const orgIds = await getPrimaryOrgIds(projectId);

    // Run both queries in parallel: items linked via Startup relation AND items
    // uploaded before the org was linked (stored by projectId in Notes). This
    // ensures legacy records are never lost when the org relation is later set.
    const [orgRes, notesRes] = await Promise.all([
      orgIds.length
        ? notion.databases.query({
            database_id: DB.dataRoom,
            filter: { property: "Startup", relation: { contains: orgIds[0] } },
            sorts: [{ property: "Priority", direction: "ascending" }],
            page_size: 50,
          })
        : Promise.resolve({ results: [] }),
      notion.databases.query({
        database_id: DB.dataRoom,
        filter: { property: "Notes", rich_text: { contains: projectId } },
        sorts: [{ property: "Priority", direction: "ascending" }],
        page_size: 50,
      }),
    ]);

    // Merge and deduplicate by page id
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const seen = new Set<string>();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const merged: any[] = [];
    for (const page of [...orgRes.results, ...notesRes.results]) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if (!seen.has((page as any).id)) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        seen.add((page as any).id);
        merged.push(page);
      }
    }

    return merged.map(mapDataRoomPage);
  } catch {
    return [];
  }
}

// ─── Commercial: Proposals & Offers ──────────────────────────────────────────

export type ProposalBrief = {
  id: string;
  title: string;
  status: string;        // Draft | In Review | Approved | Sent | Won | Lost | Archived
  proposalType: string;  // Exploratory | Scoped | Phased | etc.
  budgetRange: string;   // Under £5k | £5k–£15k | £30k–£75k | etc.
  clientName: string;    // from related project or free text
  geography: string;
  createdDate: string | null;
  notionUrl: string;
};

export type CommercialOffer = {
  id: string;
  title: string;
  offerStatus: string;   // Active | In Development | Deprecated
  offerCategory: string;
  notionUrl: string;
};

export async function getProposalBriefs(): Promise<ProposalBrief[]> {
  try {
    const sb = getSupabaseServerClient();
    const { data, error } = await sb
      .from("proposal_briefs")
      .select("*")
      .order("updated_at", { ascending: false })
      .limit(50);
    if (error || !data) return [];

    // proposal_briefs.payload preserves Notion-format properties.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (data as any[]).map(row => {
      const pg = payloadPage(row);
      return {
        id:           sbId(row),
        title:        row.title || text(prop(pg, "Title")) || text(prop(pg, "Name")) || "Untitled",
        status:       row.status || select(prop(pg, "Status")),
        proposalType: select(prop(pg, "Proposal Type")),
        budgetRange:  select(prop(pg, "Budget Range")),
        clientName:   text(prop(pg, "Client Name")) || text(prop(pg, "Client")) || "",
        geography:    select(prop(pg, "Geography")) || select(prop(pg, "Region")) || "",
        createdDate:  (row.notion_created_at ?? row.created_at)?.slice(0, 10) ?? null,
        notionUrl:    sbNotionUrl(row),
      };
    });
  } catch {
    return [];
  }
}

export async function getCommercialOffers(): Promise<CommercialOffer[]> {
  try {
    const sb = getSupabaseServerClient();
    const { data, error } = await sb
      .from("offers")
      .select("*")
      .order("updated_at", { ascending: false })
      .limit(50);
    if (error || !data) return [];

    // offers.status column is unpopulated; the real Offer Status lives in payload
    // (Notion-format). Filter out Deprecated in JS to preserve original behavior.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (data as any[])
      .map(row => {
        const pg = payloadPage(row);
        return {
          id:            sbId(row),
          title:         row.title || text(prop(pg, "Offer Name")) || text(prop(pg, "Name")) || "Untitled",
          offerStatus:   row.status || select(prop(pg, "Offer Status")),
          offerCategory: select(prop(pg, "Offer Category")),
          notionUrl:     sbNotionUrl(row),
        };
      })
      .filter(o => o.offerStatus !== "Deprecated");
  } catch {
    return [];
  }
}

// ─── Hall v2 — Opportunities by scope ────────────────────────────────────────

export type OpportunityItem = {
  id: string;
  name: string;
  stage: string;               // New | Exploring | Qualifying | Active | Proposal Sent | Negotiation | Won | Lost | Archived
  scope: string;               // CH | Portfolio | Both
  followUpStatus: string;      // None | Needed | Sent | Waiting
  type: string;                // CH Sale | Grant | Partnership | Investor Match
  orgName: string;
  lastEdited: string | null;
  notionUrl: string;
  score: number | null;        // 0–100 qualification score
  qualificationStatus: string; // Qualified | Needs Review | Below Threshold | Not Scored
};

// Shared mapper: opportunities row (Supabase) → OpportunityItem.
// `status` is the canonical stage field (canonical_stage is unpopulated).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapOpportunityRow(row: any): OpportunityItem {
  return {
    id:                   sbId(row),
    name:                 row.title || "Untitled",
    stage:                row.status ?? "",
    scope:                row.scope ?? "",
    followUpStatus:       row.follow_up_status ?? "",
    type:                 row.opportunity_type ?? "",
    orgName:              row.org_name ?? "",
    lastEdited:           row.updated_at?.slice(0, 10) ?? null,
    notionUrl:            sbNotionUrl(row),
    score:                typeof row.opportunity_score === "number" ? row.opportunity_score : null,
    qualificationStatus:  row.qualification_status || "Not Scored",
  };
}

export async function getOpportunitiesByScope(): Promise<{ ch: OpportunityItem[]; portfolio: OpportunityItem[] }> {
  try {
    const sb = getSupabaseServerClient();
    const { data, error } = await sb
      .from("opportunities")
      .select("*")
      .not("status", "in", "(Closed Won,Closed Lost,Stalled)")
      .order("updated_at", { ascending: false })
      .limit(50);
    if (error || !data) return { ch: [], portfolio: [] };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const all = (data as any[]).map(mapOpportunityRow);

    return {
      ch:        all.filter(o => o.scope === "CH" || o.scope === "Both"),
      portfolio: all.filter(o => o.scope === "Portfolio" || o.scope === "Both"),
    };
  } catch {
    return { ch: [], portfolio: [] };
  }
}

// Opportunities where follow-up is needed (opted-in, active pipeline)
// Kept for backwards compat — new callers should use getCoSTasks()
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getFollowUpOpportunities(): Promise<any[]> {
  return getCoSTasks();
}

// ─── Chief-of-Staff Task Layer ───────────────────────────────────────────────
//
// ARCHITECTURE: Two distinct layers.
//
//   Opportunities [OS v2] = strategic/commercial pipeline layer.
//     Records: grants, partnerships, funders, startup matches, collaborations.
//     Stage: Candidate → Active → Proposal Sent → Negotiation → Won / Lost / Archived.
//
//   CoS Tasks = derived action layer (no new DB — derived from Opportunities).
//     A task is generated from an Opportunity ONLY when there is a concrete next
//     action: explicit Pending Action text, an imminent meeting, or a review URL.
//     A single Opportunity can generate 0 or 1 task in v1; future: 1-to-many.
//     Task status stored in Follow-up Status field (extended values).
//
// Required Notion fields on Opportunities [OS v2] (add if not present):
//   • "Next Meeting Date"  — Date
//   • "Review URL"         — URL
//   • "Pending Action"     — Text (rich_text)
// All three are optional; graceful null if the field is not yet in the schema.

// ─── CoS Task type ────────────────────────────────────────────────────────────
//
// Open-loop model: CoS surfaces UNRESOLVED IMPORTANT ISSUES, not meetings.
// A meeting is only a vehicle for intervention — it is never itself the task.
//
// loopType  = the nature of the work (blocker, commitment, decision, prep, follow-up, review)
// interventionMoment = the best vehicle to resolve it (next_meeting, email, review doc, urgent)
//
// entrySignal is retained for internal classification and backwards-compat.
// The component shows loopType as the primary badge.

export type CoSTask = {
  // Identity
  id: string;
  notionUrl: string;

  // Task layer — primary display
  taskTitle: string;          // WHAT TO DO — specific issue, not a meeting reminder
  taskStatus: "todo" | "in-progress" | "waiting" | "done" | "dropped";
  dueDate: string | null;     // ISO date — used for "raise in this meeting"
  urgency: "critical" | "high" | "normal";

  // Loop classification — drives the primary badge and hint text
  loopType: "blocker" | "commitment" | "decision" | "prep" | "follow-up" | "review";
  interventionMoment: "urgent" | "next_meeting" | "email_this_week" | "review_this_week" | "this_week";

  // Source context — secondary display
  opportunityName: string;
  opportunityStage: string;
  orgName: string;
  opportunityType: string;

  // Action signals (internal)
  reviewUrl: string | null;
  entrySignal: "meeting_soon" | "proposal_pending" | "negotiation" | "manual" | "review_needed" | "inbound";
  signalReason: string;       // short hint shown under task title
  calendarBlockUrl: string | null;

  // Raw context (expanded view)
  pendingAction: string | null;

  // Source discriminator — controls which API is called on status change.
  // "opportunity": writes Follow-up Status field via /api/followup-status
  // "project":     no Notion field; hides locally + refreshes on next load
  // "evidence":    no Notion field; hides locally + refreshes on next load
  taskSource?: "opportunity" | "project" | "evidence";

  // Loop Engine discriminator. Set ONLY when the task came from the Supabase loops
  // table (mapLoopToCoSTask). Undefined for Notion-fallback tasks.
  // The component uses this — not the UUID regex — to decide whether to call
  // /api/cos-loops (loop engine) vs /api/followup-status (Notion).
  loopEngineId?: string;

  // Notion page ID of the linked opportunity (opportunity-type loops only).
  // Used by the Opportunities Explorer dedup: when the loop engine is active,
  // task.id is a Supabase UUID — not a Notion page ID — so dedup must use this field.
  linkedEntityId?: string;
  // Track A: true when this loop was classified as passive discovery at sync time
  isPassiveDiscovery?: boolean;
  founderOwned?: boolean;

  // Lifecycle observability (loop-engine tasks only)
  reopenCount?: number;     // > 0 means this topic was previously resolved/dismissed
  loopStatus?: string;      // raw DB status: open | in_progress | waiting | reopened | …
};

// ─── Supabase read ────────────────────────────────────────────────────────────
// Reads from the loops table (populated by /api/sync-loops). Returns null if
// Supabase is unavailable or the table is empty (cold start); getCoSTasks then
// yields an empty list.

async function getCoSTasksFromLoops(): Promise<CoSTask[] | null> {
  try {
    const { getSupabaseServerClient } = await import("@/lib/supabase-server");
    const { mapLoopToCoSTask, ACTIVE_LOOP_STATUSES } = await import("@/lib/loops");
    const sb = getSupabaseServerClient();

    // ACTIVE_LOOP_STATUSES = ['open','in_progress','reopened'].
    // 'waiting' is intentionally excluded — parked items render in a separate
    // compact Parked section, not mixed into the urgent CoS surface.
    const { data, error } = await sb
      .from("loops")
      .select("*")
      .in("status", ACTIVE_LOOP_STATUSES)
      // Track A: gate — passive discovery stays in Radar unless founder marked it interested.
      // Safety net: blockers + commitments always reach CoS regardless of passive flag,
      // because a misclassified blocker going missing is worse than a false-positive.
      .or("is_passive_discovery.eq.false,founder_interest.eq.interested,loop_type.eq.blocker,loop_type.eq.commitment")
      .order("priority_score", { ascending: false })
      .order("first_seen_at",  { ascending: true })
      .limit(50);

    if (error) {
      console.warn("[getCoSTasks] Supabase unavailable, falling back to Notion:", error.message);
      return null;
    }

    if (!data || data.length === 0) {
      return null;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (data as any[]).map(mapLoopToCoSTask);
  } catch (err) {
    console.warn("[getCoSTasks] Supabase error, falling back to Notion:", String(err));
    return null;
  }
}

// ─── Radar loops — passive discovery items not yet dismissed ─────────────────

export type RadarLoop = {
  id: string;
  normalized_key: string;
  title: string;
  loop_type: string;
  linked_entity_name: string;
  notion_url: string;
  founder_interest: string | null;
  priority_score: number;
};

export async function getRadarLoops(): Promise<RadarLoop[]> {
  try {
    const { getSupabaseServerClient } = await import("@/lib/supabase-server");
    const sb = getSupabaseServerClient();

    const { data, error } = await sb
      .from("loops")
      .select("id, normalized_key, title, loop_type, linked_entity_name, notion_url, founder_interest, priority_score")
      .eq("is_passive_discovery", true)
      .in("status", ["open", "in_progress"])
      // NULL founder_interest must be included — .neq() excludes NULLs in PostgreSQL
      .or("founder_interest.neq.dropped,founder_interest.is.null")
      // Also surface 'watching' loops — they stay in Radar until marked interested/dropped
      .order("priority_score", { ascending: false })
      .order("first_seen_at",  { ascending: true })
      .limit(30);

    if (error || !data) return [];
    return data as RadarLoop[];
  } catch {
    return [];
  }
}

// ─── Parked loops — user-paused ("Waiting") items ────────────────────────────
//
// Rendered in a compact Parked strip in Hall, separate from the active CoS desk.
// Returning the same CoSTask shape keeps the frontend uniform.

export async function getParkedLoops(): Promise<CoSTask[]> {
  try {
    const { getSupabaseServerClient } = await import("@/lib/supabase-server");
    const { mapLoopToCoSTask, PARKED_LOOP_STATUSES } = await import("@/lib/loops");
    const sb = getSupabaseServerClient();

    const { data, error } = await sb
      .from("loops")
      .select("*")
      .in("status", PARKED_LOOP_STATUSES)
      .order("last_action_at", { ascending: false, nullsFirst: false })
      .order("updated_at",     { ascending: false })
      .limit(30);

    if (error || !data) return [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (data as any[]).map(mapLoopToCoSTask);
  } catch {
    return [];
  }
}

export async function getCoSTasks(): Promise<CoSTask[]> {
  // Supabase-only (Loop Engine). The loops table is the single source of truth;
  // the former Notion-derived fallback has been removed.
  const fromLoops = await getCoSTasksFromLoops();
  return fromLoops ?? [];
}

// ─── Backward compat shims ────────────────────────────────────────────────────
// FollowUpDeskItem and getFollowUpDeskItems are superseded by CoSTask/getCoSTasks.
// Kept so any remaining callers compile without changes.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type FollowUpDeskItem = CoSTask & Record<string, any>;

export async function getFollowUpDeskItems(): Promise<CoSTask[]> {
  return getCoSTasks();
}

// ─── Opportunity Candidates — signals-detected, not yet promoted ─────────────
//
// Candidates are Opportunities with Stage = "Candidate".
// Created by:
//   1. /api/scan-opportunity-candidates  — automatic Gmail scan + Claude
//   2. /api/create-candidate             — quick-create from an inbox item
// Actions: Promote → Active, Ignore → Archived.
// Stored in the same Opportunities [OS v2] DB — no new schema needed.

export type CandidateItem = {
  id: string;
  name: string;
  orgName: string;
  type: string;
  notionUrl: string;
  signalContext: string | null;                           // human-readable context (after prefix stripped)
  sourceUrl: string | null;                              // from "Review URL" field (Gmail thread or doc)
  createdTime: string | null;
  // Parsed from structured "SIGNALS:|REF:|DATE:|" prefix in "Pending Action"
  signalOrigins: ("meeting" | "email" | "doc")[];       // all sources that contributed
  signalRef: string | null;                              // meeting title / email subject / doc name
  signalDate: string | null;                             // ISO date of most recent signal
};

/**
 * Parse the structured signal prefix stored in "Pending Action":
 *   SIGNALS:meeting,email|REF:Title|DATE:2026-04-15|Plain context text here
 * Returns null for all parsed fields when the prefix is absent (legacy records).
 */
function parseSignalPrefix(raw: string | null): {
  origins: ("meeting" | "email" | "doc")[];
  ref: string | null;
  signalDate: string | null;
  context: string | null;
} {
  if (!raw) return { origins: [], ref: null, signalDate: null, context: null };
  if (!raw.startsWith("SIGNALS:")) {
    // Legacy format — no prefix, use raw as context
    return { origins: [], ref: null, signalDate: null, context: raw || null };
  }
  // Split on | — first segment is "SIGNALS:...", then REF:..., DATE:..., then plain text
  const parts = raw.split("|");
  const origins: ("meeting" | "email" | "doc")[] = [];
  let ref: string | null = null;
  let signalDate: string | null = null;
  let contextParts: string[] = [];

  for (const part of parts) {
    if (part.startsWith("SIGNALS:")) {
      const signalStr = part.slice("SIGNALS:".length);
      for (const s of signalStr.split(",")) {
        const t = s.trim() as "meeting" | "email" | "doc";
        if (t === "meeting" || t === "email" || t === "doc") origins.push(t);
      }
    } else if (part.startsWith("REF:")) {
      ref = part.slice("REF:".length).trim() || null;
    } else if (part.startsWith("DATE:")) {
      signalDate = part.slice("DATE:".length).trim() || null;
    } else {
      contextParts.push(part);
    }
  }

  return { origins, ref, signalDate, context: contextParts.join(" ").trim() || null };
}

export async function getCandidateOpportunities(): Promise<CandidateItem[]> {
  try {
    // status = "New" maps to unreviewed candidates (canonical stage field).
    const sb = getSupabaseServerClient();
    const { data, error } = await sb
      .from("opportunities")
      .select("*")
      .eq("status", "New")
      .order("notion_created_at", { ascending: false, nullsFirst: false })
      .limit(15);
    if (error || !data) return [];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (data as any[]).map(row => {
      const rawSignal = row.trigger_signal ?? null;
      const { origins, ref, signalDate, context } = parseSignalPrefix(rawSignal);
      return {
        id:             sbId(row),
        name:           row.title || "Untitled",
        orgName:        row.org_name ?? "",
        type:           row.opportunity_type ?? "",
        notionUrl:      sbNotionUrl(row),
        signalContext:  context,
        sourceUrl:      row.source_url ?? null,
        createdTime:    (row.notion_created_at ?? row.created_at)?.slice(0, 10) ?? null,
        signalOrigins:  origins,
        signalRef:      ref,
        signalDate,
      };
    });
  } catch {
    return [];
  }
}

// ─── Commercial Pipeline — active pursuit only ───────────────────────────────
// Stages shown: Active | Proposal Sent | Negotiation
// Won/Lost/Archived are excluded (Won → Workroom, Lost/Archived → done)

export type PipelineOpportunity = OpportunityItem & {
  daysInStage: number | null;
};

export async function getPipelineOpportunities(): Promise<{
  active:       PipelineOpportunity[];
  proposalSent: PipelineOpportunity[];
  negotiation:  PipelineOpportunity[];
  recentlyClosed: PipelineOpportunity[]; // Won or Lost in last 30 days
}> {
  try {
    const sb = getSupabaseServerClient();
    const { data, error } = await sb
      .from("opportunities")
      .select("*")
      .in("status", ["Active", "Proposal Sent", "Negotiation", "Won", "Lost", "Closed Won", "Closed Lost"])
      .order("opportunity_score", { ascending: false, nullsFirst: false })
      .limit(100);
    if (error || !data) return { active: [], proposalSent: [], negotiation: [], recentlyClosed: [] };

    const cutoffMs = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const CLOSED_STAGES = new Set(["Won", "Lost", "Closed Won", "Closed Lost"]);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const all: PipelineOpportunity[] = (data as any[]).map(row => {
      const editedMs = row.updated_at ? new Date(row.updated_at).getTime() : null;
      return {
        ...mapOpportunityRow(row),
        daysInStage: editedMs !== null
          ? Math.floor((Date.now() - editedMs) / 86400000)
          : null,
      };
    });

    return {
      active:         all.filter(o => o.stage === "Active"),
      proposalSent:   all.filter(o => o.stage === "Proposal Sent"),
      negotiation:    all.filter(o => o.stage === "Negotiation"),
      recentlyClosed: all.filter(o =>
        CLOSED_STAGES.has(o.stage) &&
        o.lastEdited !== null &&
        new Date(o.lastEdited).getTime() >= cutoffMs
      ),
    };
  } catch {
    return { active: [], proposalSent: [], negotiation: [], recentlyClosed: [] };
  }
}

// ─── Hall v2 — Content ready to publish ──────────────────────────────────────

export type ReadyContent = {
  id: string;
  title: string;
  platform: string;
  contentType: string;
  publishWindow: string;
  notionUrl: string;
};

export async function getReadyContent(): Promise<ReadyContent[]> {
  try {
    const sb = getSupabaseServerClient();
    const { data, error } = await sb
      .from("content_pipeline_items")
      .select("*")
      .eq("status", "Ready to Publish")
      .order("updated_at", { ascending: false })
      .limit(10);
    if (error || !data) return [];

    // content_pipeline_items.payload is flat: { platform, content_type, publish_window }.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (data as any[]).map(row => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const p: any = row.payload ?? {};
      return {
        id:            sbId(row),
        title:         row.title || "Untitled",
        platform:      row.channel ?? p.platform ?? "",
        contentType:   p.content_type ?? "",
        publishWindow: p.publish_window ?? (row.published_at ? String(row.published_at) : ""),
        notionUrl:     sbNotionUrl(row),
      };
    });
  } catch {
    return [];
  }
}

// ─── Garage — Portfolio opportunities for a startup ──────────────────────────

export async function getPortfolioOpportunities(orgName?: string): Promise<OpportunityItem[]> {
  try {
    const sb = getSupabaseServerClient();
    const { data, error } = await sb
      .from("opportunities")
      .select("*")
      .in("scope", ["Portfolio", "Both"])
      .neq("status", "Archived")
      .order("updated_at", { ascending: false })
      .limit(50);
    if (error || !data) return [];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const all: OpportunityItem[] = (data as any[]).map(mapOpportunityRow);

    // If orgName provided, prefer matches — show matched first, then all if none match
    if (orgName) {
      const lower = orgName.toLowerCase();
      const matched = all.filter(o =>
        o.orgName.toLowerCase().includes(lower) ||
        o.name.toLowerCase().includes(lower)
      );
      return matched.length > 0 ? matched : all;
    }
    return all;
  } catch {
    return [];
  }
}

