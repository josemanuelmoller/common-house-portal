// ─── Core (client · DB · helpers) ────────────────────────────────────────────
// Extracted to src/lib/notion/core.ts per docs/NOTION_LAYER_REFACTOR_PLAN.md.
// Re-exported here so all existing imports from "@/lib/notion" keep working.
// Domain modules will be extracted incrementally; this file shrinks over time.
export * from "./notion/core";
import { notion, DB, prop, text, select, multiSelect, num, checkbox, date, relationFirst, relationIds } from "./notion/core";

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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const filter: any = statusFilter
      ? { property: "Status", select: { equals: statusFilter } }
      : undefined;

    const res = await notion.databases.query({
      database_id: DB.contentPipeline,
      filter,
      sorts: [{ timestamp: "last_edited_time", direction: "descending" }],
      page_size: 100,
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (res.results as any[]).map(page => ({
      id:          page.id,
      title:       text(prop(page, "Title")) || text(prop(page, "Name")) || "Untitled",
      status:      select(prop(page, "Status")),
      contentType: select(prop(page, "Content Type")),
      // "Platform" is the canonical channel field in Content Pipeline [OS v2].
      // desk-request, generate-draft, and getReadyContent() all use "Platform".
      channel:     select(prop(page, "Platform")),
      desk:        select(prop(page, "Desk")),
      projectId:   relationFirst(prop(page, "Projects")) ?? relationFirst(prop(page, "Project")),
      projectName: text(prop(page, "Project Name")) || "",
      draftDate:   date(prop(page, "Draft Date")) ?? date(prop(page, "Created Date")),
      publishDate: date(prop(page, "Publish Date")) ?? date(prop(page, "Published Date")),
      notionUrl:   page.url ?? "",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      draftText:   (prop(page, "Draft Text")?.rich_text ?? []).map((r: any) => r.plain_text).join(""),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      slideHtml:   (prop(page, "Slide HTML")?.rich_text ?? []).map((r: any) => r.plain_text).join(""),
    }));
  } catch {
    return [];
  }
}

// ─── Style Profiles ───────────────────────────────────────────────────────────

export async function getStyleProfiles(): Promise<StyleProfile[]> {
  try {
    const res = await notion.databases.query({
      database_id: DB.styleProfiles,
      filter: { property: "Status", select: { equals: "Active" } },
      sorts: [{ property: "Scope", direction: "ascending" }],
      page_size: 50,
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (res.results as any[]).map(page => ({
      id:                  page.id,
      name:                text(prop(page, "Name")) || "Untitled",
      styleType:           select(prop(page, "Style Type")),
      scope:               select(prop(page, "Scope")),
      status:              select(prop(page, "Status")),
      masterPrompt:        text(prop(page, "Master Prompt")),
      toneSummary:         text(prop(page, "Tone Summary")),
      structuralRules:     text(prop(page, "Structural Rules")),
      vocabularyPatterns:  text(prop(page, "Vocabulary Patterns")),
      forbiddenPatterns:   text(prop(page, "Forbidden Patterns")),
      ctaStyle:            text(prop(page, "CTA Style")),
      firstPersonAllowed:  prop(page, "First Person Allowed")?.checkbox ?? false,
    }));
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
    const res = await notion.databases.query({
      database_id: DB.proposalBriefs,
      sorts: [{ timestamp: "last_edited_time", direction: "descending" }],
      page_size: 50,
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (res.results as any[]).map(page => ({
      id:           page.id,
      title:        text(prop(page, "Title")) || text(prop(page, "Name")) || "Untitled",
      status:       select(prop(page, "Status")),
      proposalType: select(prop(page, "Proposal Type")),
      budgetRange:  select(prop(page, "Budget Range")),
      clientName:   text(prop(page, "Client Name")) || text(prop(page, "Client")) || "",
      geography:    select(prop(page, "Geography")) || select(prop(page, "Region")) || "",
      createdDate:  date(prop(page, "Created Date")) ?? (page.created_time?.slice(0, 10) ?? null),
      notionUrl:    page.url ?? "",
    }));
  } catch {
    return [];
  }
}

export async function getCommercialOffers(): Promise<CommercialOffer[]> {
  try {
    const res = await notion.databases.query({
      database_id: DB.offers,
      filter: { property: "Offer Status", select: { does_not_equal: "Deprecated" } },
      sorts: [{ timestamp: "last_edited_time", direction: "descending" }],
      page_size: 50,
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (res.results as any[]).map(page => ({
      id:           page.id,
      title:        text(prop(page, "Offer Name")) || text(prop(page, "Name")) || "Untitled",
      offerStatus:  select(prop(page, "Offer Status")),
      offerCategory: select(prop(page, "Offer Category")),
      notionUrl:    page.url ?? "",
    }));
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

export async function getOpportunitiesByScope(): Promise<{ ch: OpportunityItem[]; portfolio: OpportunityItem[] }> {
  try {
    const res = await notion.databases.query({
      database_id: DB.opportunities,
      filter: {
        and: [
          // Verified field name: "Opportunity Status" (not "Stage") — schema 2026-04-13
          { property: "Opportunity Status", select: { does_not_equal: "Closed Won" } },
          { property: "Opportunity Status", select: { does_not_equal: "Closed Lost" } },
          { property: "Opportunity Status", select: { does_not_equal: "Stalled" } },
        ],
      },
      sorts: [{ timestamp: "last_edited_time", direction: "descending" }],
      page_size: 50,
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const all = (res.results as any[]).map(page => ({
      id:                   page.id,
      name:                 text(prop(page, "Opportunity Name")) || text(prop(page, "Name")) || "Untitled",
      stage:                select(prop(page, "Opportunity Status")),
      scope:                select(prop(page, "Scope")),
      followUpStatus:       select(prop(page, "Follow-up Status")),
      type:                 select(prop(page, "Opportunity Type")) || "",
      orgName:              "",  // "Account / Organization" is a relation — not readable as plain text
      lastEdited:           page.last_edited_time?.slice(0, 10) ?? null,
      notionUrl:            page.url ?? "",
      score:                num(prop(page, "Opportunity Score")),
      qualificationStatus:  select(prop(page, "Qualification Status")) || "Not Scored",
    }));

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
// Task-centric view: WHAT needs to happen, BY WHEN, FOR which opportunity.
// Opportunity details are secondary context, not the primary display.

export type CoSTask = {
  // Identity
  id: string;
  notionUrl: string;

  // Task layer — primary display
  taskTitle: string;          // WHAT TO DO (from Pending Action or computed)
  taskStatus: "todo" | "in-progress" | "waiting" | "done" | "dropped";
  dueDate: string | null;     // ISO date — Next Meeting Date used as proxy deadline
  urgency: "critical" | "high" | "normal";

  // Opportunity context — secondary
  opportunityName: string;
  opportunityStage: string;
  orgName: string;
  opportunityType: string;

  // Action signals
  reviewUrl: string | null;
  entrySignal: "meeting_soon" | "proposal_pending" | "negotiation" | "manual" | "review_needed" | "inbound";
  signalReason: string;       // "Meeting tomorrow" / "Proposal sent 5d ago"
  calendarBlockUrl: string | null;

  // Raw pending action (for display in expanded view)
  pendingAction: string | null;
};

function mapFollowUpStatus(raw: string): CoSTask["taskStatus"] {
  switch (raw) {
    case "In Progress": return "in-progress";
    case "Waiting":
    case "Sent":        return "waiting";
    case "Done":        return "done";
    case "Dropped":     return "dropped";
    case "Needed":
    default:            return "todo";
  }
}

function computeCoSTask(opp: {
  id: string;
  name: string;
  stage: string;
  scope: string;
  followUpStatus: string;
  type: string;
  orgName: string;
  lastEdited: string | null;
  notionUrl: string;
  score: number | null;
  qualificationStatus: string;
  nextMeetingDate: string | null;
  reviewUrl: string | null;
  pendingAction: string | null;
}): CoSTask {
  const now = Date.now();

  const meetingMs       = opp.nextMeetingDate ? new Date(opp.nextMeetingDate).getTime() : null;
  const daysToMeeting   = meetingMs !== null ? Math.floor((meetingMs - now) / 86400000) : null;
  const meetingImminent = daysToMeeting !== null && daysToMeeting >= 0 && daysToMeeting <= 7;
  const meetingLabel    = opp.nextMeetingDate && daysToMeeting !== null
    ? daysToMeeting === 0 ? "today"
    : daysToMeeting === 1 ? "tomorrow"
    : new Date(opp.nextMeetingDate).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })
    : null;

  const daysSinceEdit = opp.lastEdited
    ? Math.floor((now - new Date(opp.lastEdited).getTime()) / 86400000)
    : null;

  const isNew = opp.stage === "New";
  const isGrant = opp.type === "Grant";
  const hasExplicitPending = !!opp.pendingAction &&
    !opp.pendingAction.startsWith("SIGNALS:") &&
    !opp.pendingAction.startsWith("Inbox signal:");

  // Source URL can be a Gmail thread (from inbox candidate creation) or a real doc.
  // These require different task types: email → "follow up", doc → "review document".
  const reviewIsGmail = !!opp.reviewUrl && opp.reviewUrl.includes("mail.google.com");
  const reviewIsDoc   = !!opp.reviewUrl && !reviewIsGmail;

  // Stale-active: Active deal not touched in > 14 days, no explicit signal — safety-net check-in.
  const isStaleActive = opp.stage === "Active" && !isGrant
    && daysSinceEdit !== null && daysSinceEdit > 14
    && !["Needed", "Waiting", "Sent"].includes(opp.followUpStatus)
    && !opp.nextMeetingDate
    && !opp.reviewUrl
    && !hasExplicitPending;

  // ─── Entry signal ────────────────────────────────────────────────────────
  let entrySignal: CoSTask["entrySignal"];
  let signalReason: string;
  if (meetingImminent) {
    entrySignal  = "meeting_soon";
    signalReason = `Meeting ${meetingLabel}`;
  } else if (reviewIsDoc && isNew) {
    entrySignal  = "review_needed";
    signalReason = "Review document — inbound";
  } else if (reviewIsDoc) {
    entrySignal  = "review_needed";
    signalReason = `Review doc — ${opp.stage === "Active" ? "active deal" : opp.stage?.toLowerCase() ?? "pipeline"}`;
  } else if (reviewIsGmail) {
    // Gmail thread used as source — this is a follow-up signal, not a document review
    entrySignal  = "inbound";
    signalReason = isNew ? "Inbound email — review and qualify" : "Email thread — follow up";
  } else if (isNew && opp.type === "Grant") {
    entrySignal  = "inbound";
    signalReason = "Grant match — review fit and decide";
  } else if (isNew) {
    entrySignal  = "inbound";
    signalReason = hasExplicitPending ? "Action needed" : "Inbound — review and qualify";
  } else if (opp.stage === "Active" && hasExplicitPending) {
    entrySignal  = "negotiation";
    signalReason = "Action flagged on active deal";
  } else if (isStaleActive) {
    entrySignal  = "manual";
    signalReason = `Stale — no update in ${daysSinceEdit}d`;
  } else if (opp.stage === "Active") {
    entrySignal  = "manual";
    signalReason = `Active · follow-up flagged`;
  } else if (opp.stage === "Qualifying" && opp.followUpStatus === "Waiting") {
    entrySignal  = "proposal_pending";
    signalReason = "Waiting for reply";
  } else if (opp.stage === "Qualifying") {
    entrySignal  = "proposal_pending";
    signalReason = `Qualifying — follow-up needed`;
  } else {
    entrySignal  = "manual";
    signalReason = "Follow-up flagged";
  }

  // ─── Task title (WHAT TO DO) ─────────────────────────────────────────────
  let taskTitle: string;
  if (hasExplicitPending) {
    // Explicit human-written pending action — use directly
    taskTitle = opp.pendingAction!.slice(0, 140);
  } else if (meetingImminent && reviewIsDoc) {
    taskTitle = `Review doc before meeting${meetingLabel ? ` — ${meetingLabel}` : ""}${opp.name ? ` · ${opp.name}` : ""}`;
  } else if (meetingImminent) {
    taskTitle = `Prepare for meeting${meetingLabel ? ` — ${meetingLabel}` : ""}${opp.name ? ` · ${opp.name}` : ""}`;
  } else if (reviewIsDoc) {
    taskTitle = `Review document: ${opp.name}`;
  } else if (reviewIsGmail) {
    taskTitle = `Follow up on ${opp.name}`;
  } else if (isNew && opp.type === "Grant") {
    const fitMatch = opp.pendingAction?.match(/fit score (\d+)\/100/);
    const fitScore = fitMatch ? ` — fit ${fitMatch[1]}/100` : "";
    taskTitle = `Review grant match${fitScore}: ${opp.name.slice(0, 70)}`;
  } else if (isNew) {
    taskTitle = `Review & qualify: ${opp.name.slice(0, 80)}`;
  } else if (isStaleActive) {
    taskTitle = `Check in — ${opp.name} (no update in ${daysSinceEdit}d)`;
  } else if (opp.stage === "Active") {
    taskTitle = `Advance deal — ${opp.name}`;
  } else if (opp.stage === "Qualifying") {
    taskTitle = `Follow up on ${opp.name}`;
  } else {
    taskTitle = `Follow up — ${opp.name}`;
  }

  // ─── Urgency ─────────────────────────────────────────────────────────────
  // Urgency reflects time pressure, not just pipeline stage.
  // Active stage alone no longer inflates to "high" — that caused every stale
  // pipeline record to show as high priority.
  let urgency: CoSTask["urgency"];
  if (daysToMeeting !== null && daysToMeeting >= 0 && daysToMeeting <= 1) urgency = "critical";
  else if (meetingImminent) urgency = "high";
  else if (opp.followUpStatus === "Needed") urgency = "high";
  else if (hasExplicitPending && opp.stage === "Active") urgency = "high";
  else urgency = "normal";

  // ─── Calendar block ───────────────────────────────────────────────────────
  const calendarBlockUrl = (opp.reviewUrl || meetingImminent)
    ? `https://calendar.google.com/calendar/r/eventedit?text=${encodeURIComponent(`Prep: ${opp.name}`)}&details=${encodeURIComponent(taskTitle)}&dur=0100`
    : null;

  return {
    id:               opp.id,
    notionUrl:        opp.notionUrl,
    taskTitle,
    taskStatus:       mapFollowUpStatus(opp.followUpStatus),
    dueDate:          opp.nextMeetingDate,
    urgency,
    opportunityName:  opp.name,
    opportunityStage: opp.stage,
    orgName:          opp.orgName,
    opportunityType:  opp.type,
    reviewUrl:        opp.reviewUrl,
    entrySignal,
    signalReason,
    calendarBlockUrl,
    pendingAction:    opp.pendingAction,
  };
}

export async function getCoSTasks(): Promise<CoSTask[]> {
  try {
    const res = await notion.databases.query({
      database_id: DB.opportunities,
      // Fetch all actionable stages — terminal state exclusion is handled client-side.
      // A flat OR is used because Notion's compound AND+OR filter with does_not_equal
      // returns 0 results in practice (confirmed in production 2026-04-15).
      filter: {
        or: [
          // Note: "In Progress" omitted — that select option does not yet exist in Notion.
          // Notion's databases.query throws if a filter references a non-existent select value.
          // Once a record is set to "In Progress" via pages.update (which auto-creates the option),
          // this filter can be extended to include it.
          { property: "Follow-up Status", select: { equals: "Needed"  } },
          { property: "Follow-up Status", select: { equals: "Waiting" } },
          { property: "Follow-up Status", select: { equals: "Sent"    } },
          { property: "Opportunity Status", select: { equals: "Active"     } },
          { property: "Opportunity Status", select: { equals: "Qualifying" } },
          { property: "Opportunity Status", select: { equals: "New"        } },
        ],
      },
      sorts: [{ timestamp: "last_edited_time", direction: "ascending" }],
      page_size: 30,
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const raw = (res.results as any[]).map(page => ({
      id:                  page.id,
      name:                text(prop(page, "Opportunity Name")) || text(prop(page, "Name")) || "Untitled",
      stage:               select(prop(page, "Opportunity Status")),  // verified field name
      scope:               select(prop(page, "Scope")),
      followUpStatus:      select(prop(page, "Follow-up Status")),
      type:                select(prop(page, "Opportunity Type")) || "",
      orgName:             "",  // "Account / Organization" is a relation — not plain text
      lastEdited:          page.last_edited_time?.slice(0, 10) ?? null,
      notionUrl:           page.url ?? "",
      score:               num(prop(page, "Opportunity Score")),
      qualificationStatus: select(prop(page, "Qualification Status")) || "Not Scored",
      nextMeetingDate:     date(prop(page, "Next Meeting Date")),      // optional; null if field absent
      reviewUrl:           page.properties["Source URL"]?.url ?? null, // verified field name
      pendingAction:       text(prop(page, "Trigger / Signal")) || null, // verified field name
    }));

    // ── Client-side signal gate ────────────────────────────────────────────────
    // RULE: stage alone (Active, Qualifying, New) is NOT a sufficient condition.
    // Every CoS task must have at least one concrete, verifiable action signal.
    // This prevents long-running projects and stale pipeline records from showing
    // as "tasks to do" just because they exist in the pipeline.
    //
    // Valid signals:
    //   1. Explicit Follow-up Status = Needed / Waiting / Sent (human flag, OR auto-set by scan)
    //   2. Next Meeting Date is set (time-bound prep action)
    //   3. Source URL set (document to review)
    //   4. Trigger/Signal text, recently edited, on a non-Grant record
    //      — Grant records use this field for sourcing context, not actions.
    //      — 30-day recency gate prevents stale context from surfacing.
    //   5. (Safety net) Active opportunity with no edit in > 14 days — stale, needs check.
    //      This catches deals that drift without action and have no other signal set.
    //      Qualifying stage is intentionally excluded: those are in active correspondence
    //      and usually surface through Follow-up Status.
    const TERMINAL_STAGES  = new Set(["Closed Won", "Closed Lost", "Stalled"]);
    const TERMINAL_STATUSES = new Set(["Done", "Dropped"]);
    const filtered = raw.filter(opp => {
      if (TERMINAL_STAGES.has(opp.stage))            return false;
      if (TERMINAL_STATUSES.has(opp.followUpStatus)) return false;

      const hasExplicitStatus = ["Needed", "Waiting", "Sent"].includes(opp.followUpStatus);
      const hasMeeting        = !!opp.nextMeetingDate;
      const hasReview         = !!opp.reviewUrl;

      // Pending action is only valid when human-written (not scan-generated),
      // on a non-Grant record (grant-radar fills this with sourcing context),
      // and the record has been touched recently (< 30 days).
      const daysSinceEdit = opp.lastEdited
        ? Math.floor((Date.now() - new Date(opp.lastEdited).getTime()) / 86400000)
        : 999;
      const isGrant = opp.type === "Grant";
      const hasActionablePending = !!opp.pendingAction
        && !opp.pendingAction.startsWith("SIGNALS:")
        && !opp.pendingAction.startsWith("Inbox signal:")
        && !isGrant
        && daysSinceEdit <= 30;

      // Safety net: Active deal not touched in > 14 days — surface as stale check-in.
      // This is the fallback for opportunities like Neil/COP that exist in the pipeline
      // but drift invisible because no explicit signal was ever set or re-set after completion.
      const isStaleActive = opp.stage === "Active" && !isGrant && daysSinceEdit > 14;

      return hasExplicitStatus || hasMeeting || hasReview || hasActionablePending || isStaleActive;
    });

    const tasks = filtered.map(computeCoSTask);

    // Sort: critical → high → normal; within tier by due date proximity
    const TIER: Record<string, number> = { critical: 0, high: 1, normal: 2 };
    tasks.sort((a, b) => {
      const td = (TIER[a.urgency] ?? 2) - (TIER[b.urgency] ?? 2);
      if (td !== 0) return td;
      if (a.dueDate && b.dueDate) return a.dueDate.localeCompare(b.dueDate);
      if (a.dueDate) return -1;
      if (b.dueDate) return 1;
      return 0;
    });

    return tasks;
  } catch {
    return [];
  }
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
    // Verified field name: "Opportunity Status" = "New" maps to unreviewed candidates (schema 2026-04-13)
    const res = await notion.databases.query({
      database_id: DB.opportunities,
      filter: { property: "Opportunity Status", select: { equals: "New" } },
      sorts: [{ timestamp: "created_time", direction: "descending" }],
      page_size: 15,
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (res.results as any[]).map(page => {
      const rawSignal = text(prop(page, "Trigger / Signal")) || null; // verified field name
      const { origins, ref, signalDate, context } = parseSignalPrefix(rawSignal);
      return {
        id:             page.id,
        name:           text(prop(page, "Opportunity Name")) || text(prop(page, "Name")) || "Untitled",
        orgName:        "",  // "Account / Organization" is a relation — not plain text
        type:           select(prop(page, "Opportunity Type")) || "",
        notionUrl:      page.url ?? "",
        signalContext:  context,
        sourceUrl:      page.properties["Source URL"]?.url ?? null, // verified field name
        createdTime:    page.created_time?.slice(0, 10) ?? null,
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
    const res = await notion.databases.query({
      database_id: DB.opportunities,
      filter: {
        or: [
          { property: "Stage", select: { equals: "Active" } },
          { property: "Stage", select: { equals: "Proposal Sent" } },
          { property: "Stage", select: { equals: "Negotiation" } },
          { property: "Stage", select: { equals: "Won" } },
          { property: "Stage", select: { equals: "Lost" } },
        ],
      },
      sorts: [{ property: "Opportunity Score", direction: "descending" }],
      page_size: 100,
    });

    const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const all: PipelineOpportunity[] = (res.results as any[]).map(page => ({
      id:                  page.id,
      name:                text(prop(page, "Opportunity Name")) || text(prop(page, "Name")) || "Untitled",
      stage:               select(prop(page, "Stage")),
      scope:               select(prop(page, "Scope")),
      followUpStatus:      select(prop(page, "Follow-up Status")),
      type:                select(prop(page, "Type")) || select(prop(page, "Opportunity Type")) || "",
      orgName:             text(prop(page, "Organization")) || "",
      lastEdited:          page.last_edited_time?.slice(0, 10) ?? null,
      notionUrl:           page.url ?? "",
      score:               num(prop(page, "Opportunity Score")),
      qualificationStatus: select(prop(page, "Qualification Status")) || "Not Scored",
      daysInStage:         page.last_edited_time
        ? Math.floor((Date.now() - new Date(page.last_edited_time).getTime()) / 86400000)
        : null,
    }));

    return {
      active:         all.filter(o => o.stage === "Active"),
      proposalSent:   all.filter(o => o.stage === "Proposal Sent"),
      negotiation:    all.filter(o => o.stage === "Negotiation"),
      recentlyClosed: all.filter(o =>
        (o.stage === "Won" || o.stage === "Lost") &&
        page_last_edited_after(res.results, o.id, cutoff)
      ),
    };
  } catch {
    return { active: [], proposalSent: [], negotiation: [], recentlyClosed: [] };
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function page_last_edited_after(results: any[], id: string, cutoff: string): boolean {
  const page = results.find((p: any) => p.id === id);
  return page ? page.last_edited_time >= cutoff : false;
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
    const res = await notion.databases.query({
      database_id: DB.contentPipeline,
      filter: { property: "Status", select: { equals: "Ready to Publish" } },
      sorts: [{ timestamp: "last_edited_time", direction: "descending" }],
      page_size: 10,
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (res.results as any[]).map(page => ({
      id:            page.id,
      title:         text(prop(page, "Title")) || text(prop(page, "Name")) || "Untitled",
      platform:      select(prop(page, "Platform")) || select(prop(page, "Channel")) || "",
      contentType:   select(prop(page, "Content Type")),
      publishWindow: text(prop(page, "Publish Window")) || date(prop(page, "Publish Date")) || "",
      notionUrl:     page.url ?? "",
    }));
  } catch {
    return [];
  }
}

// ─── Garage — Portfolio opportunities for a startup ──────────────────────────

export async function getPortfolioOpportunities(orgName?: string): Promise<OpportunityItem[]> {
  try {
    const res = await notion.databases.query({
      database_id: DB.opportunities,
      filter: {
        and: [
          {
            or: [
              { property: "Scope", select: { equals: "Portfolio" } },
              { property: "Scope", select: { equals: "Both" } },
            ],
          },
          { property: "Stage", select: { does_not_equal: "Archived" } },
        ],
      },
      sorts: [{ timestamp: "last_edited_time", direction: "descending" }],
      page_size: 50,
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const all: OpportunityItem[] = (res.results as any[]).map(page => ({
      id:                   page.id,
      name:                 text(prop(page, "Opportunity Name")) || text(prop(page, "Name")) || "Untitled",
      stage:                select(prop(page, "Stage")),
      scope:                select(prop(page, "Scope")),
      followUpStatus:       select(prop(page, "Follow-up Status")),
      type:                 select(prop(page, "Type")) || select(prop(page, "Opportunity Type")) || "",
      orgName:              text(prop(page, "Organization")) || "",
      lastEdited:           page.last_edited_time?.slice(0, 10) ?? null,
      notionUrl:            page.url ?? "",
      score:                num(prop(page, "Opportunity Score")),
      qualificationStatus:  select(prop(page, "Qualification Status")) || "Not Scored",
    }));

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

