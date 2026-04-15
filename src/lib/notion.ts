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
          { property: "Stage", select: { does_not_equal: "Won" } },
          { property: "Stage", select: { does_not_equal: "Lost" } },
          { property: "Stage", select: { does_not_equal: "Archived" } },
        ],
      },
      sorts: [{ timestamp: "last_edited_time", direction: "descending" }],
      page_size: 50,
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const all = (res.results as any[]).map(page => ({
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

    return {
      ch:        all.filter(o => o.scope === "CH" || o.scope === "Both"),
      portfolio: all.filter(o => o.scope === "Portfolio" || o.scope === "Both"),
    };
  } catch {
    return { ch: [], portfolio: [] };
  }
}

// Opportunities where follow-up is needed (opted-in, active pipeline)
// Kept for backwards compat — new callers should use getFollowUpDeskItems()
export async function getFollowUpOpportunities(): Promise<OpportunityItem[]> {
  return getFollowUpDeskItems();
}

// ─── Chief-of-Staff Follow-up Desk ───────────────────────────────────────────
//
// Replaces the narrow manual-flag queue with signals-based detection.
// Entry signals (OR):
//   1. Follow-up Status = "Needed"  (manual)
//   2. Stage = Active / Proposal Sent / Negotiation  (auto)
//
// Enrichment fields on Opportunities [OS v2] — add these in Notion if not present:
//   • "Next Meeting Date"  — Date
//   • "Review URL"         — URL
//   • "Pending Action"     — Text (rich_text)
// All three are optional; graceful null if the field is not yet in the schema.

export type FollowUpDeskItem = OpportunityItem & {
  // From Notion (optional fields — null until added to schema + populated)
  nextMeetingDate: string | null;   // "Next Meeting Date" — date field
  reviewUrl: string | null;         // "Review URL" — url field
  pendingAction: string | null;     // "Pending Action" — rich_text field
  // Computed
  entrySignal: "manual" | "active_stale" | "proposal_stale" | "negotiation_stale" | "has_meeting";
  entryReason: string;              // "Meeting in 3 days" / "Proposal sent · 12d no reply"
  pendingActionLabel: string;       // "Review proposal before Fri 18 Apr"
  urgencyLevel: "urgent" | "high" | "normal";
  recommendedMove: "review_doc" | "draft_followup" | "schedule_meeting" | "advance_negotiation";
  calendarBlockUrl: string | null;  // parameterized Google Calendar link for 1-hour block
};

function computeDeskItem(raw: OpportunityItem & {
  nextMeetingDate: string | null;
  reviewUrl: string | null;
  pendingAction: string | null;
}): FollowUpDeskItem {
  const now = Date.now();

  const daysSinceEdit = raw.lastEdited
    ? Math.floor((now - new Date(raw.lastEdited).getTime()) / 86400000)
    : null;

  const meetingMs      = raw.nextMeetingDate ? new Date(raw.nextMeetingDate).getTime() : null;
  const daysToMeeting  = meetingMs !== null ? Math.floor((meetingMs - now) / 86400000) : null;
  const meetingImminent = daysToMeeting !== null && daysToMeeting >= 0 && daysToMeeting <= 7;
  const meetingLabel   = raw.nextMeetingDate && daysToMeeting !== null
    ? daysToMeeting === 0 ? "Today"
    : daysToMeeting === 1 ? "Tomorrow"
    : new Date(raw.nextMeetingDate).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })
    : null;

  // Entry signal — first match wins in priority order
  let entrySignal: FollowUpDeskItem["entrySignal"];
  let entryReason: string;
  if (meetingImminent) {
    entrySignal = "has_meeting";
    entryReason = `Meeting ${meetingLabel}`;
  } else if (raw.followUpStatus === "Needed") {
    entrySignal = "manual";
    entryReason = "Follow-up flagged";
  } else if (raw.stage === "Negotiation") {
    entrySignal = "negotiation_stale";
    entryReason = `In negotiation${daysSinceEdit !== null ? ` · ${daysSinceEdit}d since last update` : ""}`;
  } else if (raw.stage === "Proposal Sent") {
    entrySignal = "proposal_stale";
    entryReason = `Proposal sent${daysSinceEdit !== null ? ` · ${daysSinceEdit}d no reply recorded` : ""}`;
  } else {
    entrySignal = "active_stale";
    entryReason = `Active${daysSinceEdit !== null ? ` · ${daysSinceEdit}d since last update` : ""}`;
  }

  // Pending action label
  let pendingActionLabel: string;
  if (raw.pendingAction) {
    pendingActionLabel = raw.pendingAction;
  } else if (meetingImminent && raw.reviewUrl) {
    pendingActionLabel = `Review before meeting — ${meetingLabel}`;
  } else if (raw.reviewUrl) {
    pendingActionLabel = "Review shared document";
  } else if (raw.stage === "Proposal Sent") {
    pendingActionLabel = `Follow up on proposal${raw.orgName ? ` with ${raw.orgName}` : ""}`;
  } else if (raw.stage === "Negotiation") {
    pendingActionLabel = "Advance negotiation — check for reply or update";
  } else {
    pendingActionLabel = `Follow up${raw.orgName ? ` with ${raw.orgName}` : ""}`;
  }

  // Urgency
  let urgencyLevel: FollowUpDeskItem["urgencyLevel"];
  if (daysToMeeting !== null && daysToMeeting >= 0 && daysToMeeting <= 2) urgencyLevel = "urgent";
  else if (meetingImminent || raw.stage === "Negotiation") urgencyLevel = "high";
  else urgencyLevel = "normal";

  // Recommended move
  let recommendedMove: FollowUpDeskItem["recommendedMove"];
  if (raw.reviewUrl && (meetingImminent || raw.stage === "Proposal Sent")) recommendedMove = "review_doc";
  else if (raw.stage === "Negotiation") recommendedMove = "advance_negotiation";
  else if (!raw.nextMeetingDate) recommendedMove = "schedule_meeting";
  else recommendedMove = "draft_followup";

  // Calendar block URL — 1-hour review block, pre-populated
  const calendarBlockUrl = (raw.reviewUrl || meetingImminent)
    ? `https://calendar.google.com/calendar/r/eventedit?text=${encodeURIComponent(`Review: ${raw.name}`)}&details=${encodeURIComponent(pendingActionLabel)}&dur=0100`
    : null;

  return { ...raw, entrySignal, entryReason, pendingActionLabel, urgencyLevel, recommendedMove, calendarBlockUrl };
}

export async function getFollowUpDeskItems(): Promise<FollowUpDeskItem[]> {
  try {
    const res = await notion.databases.query({
      database_id: DB.opportunities,
      filter: {
        and: [
          { property: "Stage", select: { does_not_equal: "Won" } },
          { property: "Stage", select: { does_not_equal: "Lost" } },
          { property: "Stage", select: { does_not_equal: "Archived" } },
          {
            or: [
              { property: "Follow-up Status", select: { equals: "Needed" } },
              { property: "Stage",            select: { equals: "Active" } },
              { property: "Stage",            select: { equals: "Proposal Sent" } },
              { property: "Stage",            select: { equals: "Negotiation" } },
            ],
          },
        ],
      },
      sorts: [{ timestamp: "last_edited_time", direction: "ascending" }],
      page_size: 30,
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const raw = (res.results as any[]).map(page => ({
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
      // Enrichment fields — gracefully null if not yet in Notion schema
      nextMeetingDate:     date(prop(page, "Next Meeting Date")),
      reviewUrl:           page.properties["Review URL"]?.url ?? null,
      pendingAction:       text(prop(page, "Pending Action")) || null,
    }));

    const items = raw.map(computeDeskItem);

    // Sort: urgent first, then high, then normal; within tier by meeting date proximity
    const TIER: Record<string, number> = { urgent: 0, high: 1, normal: 2 };
    items.sort((a, b) => {
      const tierDiff = (TIER[a.urgencyLevel] ?? 2) - (TIER[b.urgencyLevel] ?? 2);
      if (tierDiff !== 0) return tierDiff;
      // Earlier meeting date wins
      if (a.nextMeetingDate && b.nextMeetingDate) return a.nextMeetingDate.localeCompare(b.nextMeetingDate);
      if (a.nextMeetingDate) return -1;
      if (b.nextMeetingDate) return 1;
      return 0;
    });

    return items;
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

