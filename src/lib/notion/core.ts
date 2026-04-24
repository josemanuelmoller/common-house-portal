import { Client } from "@notionhq/client";

export const notion = new Client({ auth: process.env.NOTION_API_KEY });

// Notion database PAGE IDs — used by the @notionhq/client SDK (databases.query, pages.create, etc.)
// These differ from the collection/data-source IDs used by Notion MCP tools (collection://...).
// Both ID formats resolve to the same live databases in the "Common House Notion" workspace.
//   SDK page ID   ↔  MCP collection ID
//   49d59b18...   ↔  collection://5ef16ab9-e762-4548-b6c9-f386da4f6b29  (CH Projects [OS v2])
//   fa281249...   ↔  collection://ed78f965-d6e5-47ee-b60c-d7056d381454  (CH Evidence [OS v2])
//   d88aff1b...   ↔  collection://6f804e20-834c-4de2-a746-f6343fc75451  (CH Sources [OS v2])
//   0f4bfe95...   ↔  collection://e7d711a5-f441-4cc8-96c1-bd33151c09b8  (CH Knowledge Assets [OS v2])
export const DB = {
  projects:           "49d59b18095f46588960f2e717832c5f",
  evidence:           "fa28124978d043039d8932ac9964ccf5",
  sources:            "d88aff1b019d4110bcefab7f5bfbd0ae",
  knowledge:          "0f4bfe95549d4710a3a9ab6e119a9b04",
  // CH People [OS v2] — collection: 6f4197dd-3597-4b00-a711-86d6fcf819ad
  people:             "1bc0f96f33ca4a9e9ff26844377e81de",
  // Decision Items [OS v2] — collection: 1cdf6499-0468-4e2c-abcc-21e2bd8a803f
  decisions:          "6b801204c4de49c7b6179e04761a285a",
  // Insight Briefs [OS v2] — collection: 839cafc7-d52d-442f-a784-197a5ea34810
  insightBriefs:      "04bed3a3fd1a4b3a99643cd21562e08a",
  // Content Pipeline [OS v2] — collection: 29db8c9b-6738-41ab-bf0a-3a5f06c568a0
  contentPipeline:    "3bf5cf81f45c4db2840590f3878bfdc0",
  // Style Profiles [OS v2] — collection: 3119b5c0-3b8b-4c17-bde0-2772fc9ba4a6
  styleProfiles:      "606b1aafe63849a1a81ac6199683dc14",
  // CH Organizations [OS v2] — collection: a0410f76-1f3e-4ec1-adc4-e47eb4132c3d
  organizations:      "bef1bb86ab2b4cd280b6b33f9034b96c",
  // Garage financial layer — all relate to CH Organizations via "Startup" relation
  // Valuations [OS v2] — collection: 8f8d903b-6679-4fb0-bae8-16f7362d00d0
  valuations:         "37a3686ebe3f408ba92c7373b0f01d60",
  // Cap Table [OS v2] — collection: f1571c77-f057-45c1-94c9-4a5447a736dc
  capTable:           "cd3038b604b64c929dab6a33275393b7",
  // Data Room [OS v2] — collection: f6ccdab4-779d-4d4f-9748-dba1c905e846
  dataRoom:           "d3c56da93f604859a51c9a43a165f412",
  // Financial Snapshots [OS v2] — collection: 21e074ea-cfc1-4535-87ec-e7fc84496afb
  // Can filter by "Scope Project" (relation to CH Projects) OR "Scope Organization"
  financialSnapshots: "fdaf8df89b804dedb976cc61aa1b7e09",
  // Proposal Briefs [OS v2] — collection: 8f0fb3de-2a16-4b8b-a858-5ab068d2f2e4
  proposalBriefs:     "76bfd50fa99143619b9b51de4b8eae67",
  // Offers [OS v2] — collection: 10c7de04-8f71-45ff-9e37-32e683829232
  offers:             "58b863e9c789465b82eb244674bc394f",
  // Opportunities [OS v2] — collection: 687caa98-594a-41b5-95c9-960c141be0c0
  // Scope: CH | Portfolio | Both  |  Follow-up Status: None | Needed | Sent | Waiting
  opportunities:      "687caa98594a41b595c9960c141be0c0",
  // Grant Sources [OS v2] — collection: 722e19ee-be7b-442c-953d-5ebfef3c0eaf
  grantSources:       "3f4f4ffc826e4832a3365c62544bd4f7",
  // Agent Drafts [OS v2] — collection: e41e1599-0c89-483f-b271-c078c33898ce
  // Types: LinkedIn Post | Follow-up Email | Check-in Email
  // Status: Pending Review | Approved | Revision Requested | Superseded
  agentDrafts:        "9844ece875ea4c618f616e8cc97d5a90",
  // Daily Briefings [OS v2] — collection: 17585064-56f1-4af6-9030-4af4294c0a99
  // Written daily by generate-daily-briefing skill; read by Hall on every load
  dailyBriefings:     "d206d6cdb09040d3ac2f34a977ad9f2a",
  // CH Watchlist [OS v2] — collection: a7ba452a-78f5-4c9f-bc5a-71a63e4e248a
  // Competitors, sector bodies, partners, referentes, clients potenciales
  watchlist:          "d5fad9978ed0436baae4964a0ad0e211",
  // CH Competitive Intel [OS v2] — collection: b3607003-470c-413e-999e-94788f7c1b7c
  // Written by competitive-monitor; surfaced on the Hall
  competitiveIntel:   "af8d7edb750b4131b3b55ef5ee83556a",
};

// ─── Shared property helpers ──────────────────────────────────────────────────
//
// These are exported so that domain modules under src/lib/notion/ can import
// them directly. They were previously private to src/lib/notion.ts; making them
// exported is the only behavioral change in this extraction.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function prop(page: any, key: string): any {
  return page.properties?.[key];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function text(p: any): string {
  return p?.rich_text?.[0]?.plain_text ?? p?.title?.[0]?.plain_text ?? "";
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function select(p: any): string {
  return p?.select?.name ?? "";
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function multiSelect(p: any): string[] {
  return p?.multi_select?.map((s: any) => s.name) ?? [];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function num(p: any): number | null {
  return typeof p?.number === "number" ? p.number : null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function checkbox(p: any): boolean {
  return p?.checkbox ?? false;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function date(p: any): string | null {
  return p?.date?.start ?? null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function relationFirst(p: any): string | null {
  return p?.relation?.[0]?.id ?? null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function relationIds(p: any): string[] {
  return p?.relation?.map((r: any) => r.id) ?? [];
}
