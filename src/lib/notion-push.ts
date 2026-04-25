/**
 * notion-push.ts — Phase C TS port.
 *
 * Takes a reviewed DigestProposal + the user's answers and pushes everything
 * to Notion: Source record + Evidence batch + Knowledge Asset candidates +
 * bidirectional Evidence ↔ KA backlinks + audit summary appended to the
 * Source page body.
 *
 * Mirrors what `.claude/lib/notion_push.py` and the manual MCP-driven flow do
 * (the latter was used for the Algramo push on 2026-04-25, which is what this
 * file automates).
 *
 * Field naming and accessor types follow the `.claude/schemas/os-v2-schemas.json`
 * cache. Multi-select / select / checkbox values must match that file.
 */

import { Client } from "@notionhq/client";
import { DB } from "@/lib/notion/core";
import type {
  DigestProposal,
  ProposalAnswers,
  ProposalEvidence,
  ProposalKnowledgeAsset,
  ProposalQuestion,
  ProposalSource,
  EvidenceSensitivity,
  KASensitivity,
  SourceSensitivity,
} from "@/types/digest-proposal";

const SOURCE_SENSITIVITY_VALUES: SourceSensitivity[] = [
  "Internal",
  "Client Confidential",
  "Leadership Only",
];
const EVIDENCE_SENSITIVITY_VALUES: EvidenceSensitivity[] = [
  "Restricted",
  "Client Confidential",
  "Internal",
  "Shareable",
];
const KA_SENSITIVITY_VALUES: KASensitivity[] = [
  "Internal Core",
  "Restricted Internal",
  "Client Derived",
  "Public-Facing",
];

export type PushResult = {
  sourceId: string;
  sourceUrl: string;
  evidence: { id: string; url: string; index: number; title: string }[];
  knowledgeAssets: { id: string; url: string; index: number; name: string }[];
  linkedOrgs: { name: string; id: string }[];
};

function getNotionClient(): Client {
  const token = process.env.NOTION_API_KEY;
  if (!token) throw new Error("NOTION_API_KEY not set in environment");
  return new Client({ auth: token });
}

function rt(text: string) {
  return [{ type: "text" as const, text: { content: text.slice(0, 2000) } }];
}

/**
 * Parse org names from a free-form or single_choice answer. Falls back to the
 * candidate list (drafter's source.linked_organizations) when the answer is
 * vague (e.g. "all" / "yes"). Returns deduplicated, trimmed, non-empty names.
 */
function parseOrgNamesFromAnswer(answer: string, candidates: string[]): string[] {
  const a = answer.trim();
  const lower = a.toLowerCase();

  if (
    lower === "" ||
    lower === "none" ||
    lower === "no" ||
    lower === "skip" ||
    lower === "skip linking"
  ) {
    return [];
  }
  if (lower === "all" || lower === "all of them" || lower === "yes" || lower === "both") {
    return [...new Set(candidates.map((s) => s.trim()).filter(Boolean))];
  }

  // If the answer matches one of the candidates verbatim, take it.
  // If it's a single_choice option like "Link Unilever only (primary owner)",
  // extract candidate names that appear inside it.
  const found = candidates.filter((c) =>
    c.length > 1 && lower.includes(c.toLowerCase()),
  );
  if (found.length > 0) {
    return [...new Set(found.map((s) => s.trim()))];
  }

  // Fallback: split by commas / "and" / "&" and trust the user's literal names.
  const parts = a
    .split(/,| and | & |;|\//i)
    .map((s) => s.trim())
    .filter((s) => s.length > 1 && !/^\(/.test(s));
  return [...new Set(parts)];
}

const ORG_DB_ID = DB.organizations;

async function resolveOrCreateOrg(notion: Client, name: string): Promise<string | null> {
  const trimmed = name.trim();
  if (!trimmed) return null;

  // Case-insensitive name match. Notion title filter is case-insensitive by default.
  try {
    const search = await notion.databases.query({
      database_id: ORG_DB_ID,
      filter: { property: "Name", title: { equals: trimmed } },
      page_size: 1,
    });
    if (search.results.length > 0) {
      return search.results[0].id;
    }
  } catch (err) {
    console.error(`[notion-push] org search failed for "${trimmed}":`, err);
  }

  // Not found → create a stub
  try {
    const page = await notion.pages.create({
      parent: { database_id: ORG_DB_ID },
      properties: {
        Name: { title: rt(trimmed) },
        "Organization Category": { select: { name: "Corporation" } },
        "Migration Status": { select: { name: "Not Migrated" } },
        "Relationship Stage": { select: { name: "Prospect" } },
        Notes: {
          rich_text: rt(
            `Auto-created stub from portal Full Digest pipeline (${new Date().toISOString().slice(0, 10)}). Update Category / Country / Themes manually.`,
          ),
        },
      } as never,
    });
    return page.id;
  } catch (err) {
    console.error(`[notion-push] failed to create org stub for "${trimmed}":`, err);
    return null;
  }
}

/**
 * Apply user answers to the proposal in place, where the question has a
 * recognised target_field. Returns the (possibly modified) proposal AND a
 * record of what was applied for the audit trail.
 */
function applyAnswers(
  proposal: DigestProposal,
  answers: ProposalAnswers,
): { proposal: DigestProposal; appliedLog: string[] } {
  const appliedLog: string[] = [];
  const p = JSON.parse(JSON.stringify(proposal)) as DigestProposal; // deep clone

  for (const q of p.questions ?? []) {
    const ans = answers[q.id];
    if (ans === undefined || ans === "" || ans === null) continue;
    if (!q.target_field) continue;

    const ansStr = typeof ans === "string" ? ans : String(ans);

    switch (q.target_field) {
      case "source.source_date":
        if (/^\d{4}-\d{2}-\d{2}$/.test(ansStr)) {
          p.source.source_date = ansStr;
          appliedLog.push(`source.source_date ← "${ansStr}" (from ${q.id})`);
        } else {
          // Try to extract a year from a single_choice option like "February 2023 (correct date)"
          const yearMatch = ansStr.match(/\b(20\d{2})\b/);
          if (yearMatch && p.source.source_date) {
            const newDate = p.source.source_date.replace(/^\d{4}/, yearMatch[1]);
            p.source.source_date = newDate;
            appliedLog.push(`source.source_date ← "${newDate}" (year extracted from ${q.id})`);
          }
        }
        break;
      case "source.sensitivity":
        if ((SOURCE_SENSITIVITY_VALUES as string[]).includes(ansStr)) {
          (p.source as ProposalSource & { sensitivity?: SourceSensitivity }).sensitivity =
            ansStr as SourceSensitivity;
          appliedLog.push(`source.sensitivity ← "${ansStr}" (from ${q.id})`);
        }
        break;
      case "source.linked_organizations": {
        // Answer can be a comma-separated string ("Unilever, Kantar"), a single
        // org name, or a single_choice option that names specific orgs ("Link
        // Unilever only (primary owner)" → ["Unilever"]). Parse loosely.
        const namedOrgs = parseOrgNamesFromAnswer(ansStr, p.source.linked_organizations ?? []);
        if (namedOrgs.length > 0) {
          p.source.linked_organizations = namedOrgs;
          appliedLog.push(
            `source.linked_organizations ← [${namedOrgs.join(", ")}] (from ${q.id})`,
          );
        }
        break;
      }
      case "all.sensitivity": {
        // Map a single chosen sensitivity to the three different schemas.
        const lower = ansStr.toLowerCase();
        let src: SourceSensitivity | null = null;
        let ev: EvidenceSensitivity | null = null;
        let ka: KASensitivity | null = null;
        if (lower.includes("client confidential")) {
          src = "Client Confidential";
          ev = "Client Confidential";
          ka = "Client Derived";
        } else if (lower.includes("leadership")) {
          src = "Leadership Only";
          ev = "Restricted";
          ka = "Internal Core";
        } else if (lower.includes("shareable") || lower.includes("public")) {
          src = "Internal"; // no "Shareable" on Source schema
          ev = "Shareable";
          ka = "Public-Facing";
        } else if (lower.includes("internal")) {
          src = "Internal";
          ev = "Internal";
          ka = "Restricted Internal";
        }
        if (src && ev && ka) {
          (p.source as ProposalSource & { sensitivity?: SourceSensitivity }).sensitivity = src;
          for (const e of p.evidence) {
            (e as ProposalEvidence & { sensitivity_level?: EvidenceSensitivity }).sensitivity_level = ev;
          }
          for (const k of p.knowledge_assets) {
            (k as ProposalKnowledgeAsset & { sensitivity_level?: KASensitivity }).sensitivity_level = ka;
          }
          appliedLog.push(
            `sensitivity (cascading) ← Source="${src}" / Evidence="${ev}" / KA="${ka}" (from ${q.id})`,
          );
        }
        break;
      }
      case "evidence.sensitivity_level":
        if ((EVIDENCE_SENSITIVITY_VALUES as string[]).includes(ansStr)) {
          for (const e of p.evidence) {
            (e as ProposalEvidence & { sensitivity_level?: EvidenceSensitivity }).sensitivity_level =
              ansStr as EvidenceSensitivity;
          }
          appliedLog.push(`evidence[*].sensitivity_level ← "${ansStr}" (from ${q.id})`);
        }
        break;
      case "ka.sensitivity_level":
        if ((KA_SENSITIVITY_VALUES as string[]).includes(ansStr)) {
          for (const k of p.knowledge_assets) {
            (k as ProposalKnowledgeAsset & { sensitivity_level?: KASensitivity }).sensitivity_level =
              ansStr as KASensitivity;
          }
          appliedLog.push(`ka[*].sensitivity_level ← "${ansStr}" (from ${q.id})`);
        }
        break;
      case "ka.knowledge_update_needed": {
        const v = typeof ans === "boolean" ? ans : ansStr === "true" || ansStr === "Sí";
        for (const k of p.knowledge_assets) {
          (k as ProposalKnowledgeAsset & { knowledge_update_needed?: boolean }).knowledge_update_needed = v;
        }
        appliedLog.push(`ka[*].knowledge_update_needed ← ${v} (from ${q.id})`);
        break;
      }
      case "ka.status":
        for (const k of p.knowledge_assets) {
          (k as ProposalKnowledgeAsset & { status?: string }).status = ansStr;
        }
        appliedLog.push(`ka[*].status ← "${ansStr}" (from ${q.id})`);
        break;
      default:
        break;
    }
  }

  return { proposal: p, appliedLog };
}

async function createSource(
  notion: Client,
  proposal: DigestProposal,
  sourceUrlForFile: string | null,
): Promise<{ id: string; url: string; linkedOrgs: { name: string; id: string }[] }> {
  const src = proposal.source;
  const sensitivity =
    (src as ProposalSource & { sensitivity?: SourceSensitivity }).sensitivity ?? "Internal";

  // Resolve linked_organizations names → existing or stub Notion org IDs.
  const linkedOrgs: { name: string; id: string }[] = [];
  for (const orgName of src.linked_organizations ?? []) {
    const id = await resolveOrCreateOrg(notion, orgName);
    if (id) linkedOrgs.push({ name: orgName, id });
  }

  const properties: Record<string, unknown> = {
    "Source Title": { title: rt(src.title) },
    "Source Type": { select: { name: src.source_type } },
    "Source Platform": { select: { name: "Upload" } },
    "Source Date": { date: { start: src.source_date } },
    "Dedup Key": { rich_text: rt(src.dedup_key) },
    "Processing Status": { select: { name: "Processed" } },
    "Relevance Status": { select: { name: "Relevant" } },
    Sensitivity: { select: { name: sensitivity } },
    "Knowledge Relevant?": { checkbox: true },
    "Evidence Extracted?": { checkbox: true },
    "Native Source Record?": { checkbox: true },
    "Processed Summary": { rich_text: rt(src.summary) },
    "Sanitized Notes": { rich_text: rt(src.sanitized_notes) },
  };
  if (sourceUrlForFile) {
    properties["Source URL"] = { url: sourceUrlForFile };
  }
  if (linkedOrgs.length > 0) {
    properties["Linked Organizations"] = {
      relation: linkedOrgs.map((o) => ({ id: o.id })),
    };
  }

  const page = await notion.pages.create({
    parent: { database_id: DB.sources },
    properties: properties as never,
  });
  return {
    id: page.id,
    url: ("url" in page && page.url) || `https://www.notion.so/${page.id.replace(/-/g, "")}`,
    linkedOrgs,
  };
}

async function createEvidence(
  notion: Client,
  evidence: ProposalEvidence[],
  sourceId: string,
): Promise<{ id: string; url: string; index: number; title: string }[]> {
  const out: { id: string; url: string; index: number; title: string }[] = [];

  for (let i = 0; i < evidence.length; i++) {
    const e = evidence[i];
    const sensitivity =
      (e as ProposalEvidence & { sensitivity_level?: EvidenceSensitivity }).sensitivity_level ?? "Internal";

    const properties: Record<string, unknown> = {
      "Evidence Title": { title: rt(e.title) },
      "Evidence Statement": { rich_text: rt(e.statement) },
      "Evidence Type": { select: { name: e.evidence_type } },
      "Reusability Level": { select: { name: e.reusability } },
      "Validation Status": { select: { name: "New" } },
      "Confidence Level": { select: { name: e.confidence } },
      "Sensitivity Level": { select: { name: sensitivity } },
      "Topics / Themes": { multi_select: e.topics.map((t) => ({ name: t })) },
      Geography: { multi_select: e.geography.map((t) => ({ name: t })) },
      "Affected Theme": { multi_select: e.affected_themes.map((t) => ({ name: t })) },
      "Source Excerpt": { rich_text: rt(e.source_excerpt) },
      "Date Captured": { date: { start: new Date().toISOString().slice(0, 10) } },
      "Source Record": { relation: [{ id: sourceId }] },
    };

    const page = await notion.pages.create({
      parent: { database_id: DB.evidence },
      properties: properties as never,
    });
    out.push({
      id: page.id,
      url: ("url" in page && page.url) || `https://www.notion.so/${page.id.replace(/-/g, "")}`,
      index: i,
      title: e.title,
    });
  }

  return out;
}

async function createKnowledgeAssets(
  notion: Client,
  knowledge_assets: ProposalKnowledgeAsset[],
  evidence: { id: string; index: number }[],
): Promise<{ id: string; url: string; index: number; name: string }[]> {
  const out: { id: string; url: string; index: number; name: string }[] = [];

  for (let i = 0; i < knowledge_assets.length; i++) {
    const ka = knowledge_assets[i];
    const sensitivity =
      (ka as ProposalKnowledgeAsset & { sensitivity_level?: KASensitivity }).sensitivity_level ?? "Restricted Internal";
    const knowledgeUpdateNeeded =
      (ka as ProposalKnowledgeAsset & { knowledge_update_needed?: boolean }).knowledge_update_needed ?? false;
    const status = (ka as ProposalKnowledgeAsset & { status?: string }).status ?? "Draft";

    const evidenceIds = ka.evidence_indices
      .map((idx) => evidence.find((ev) => ev.index === idx)?.id)
      .filter((id): id is string => Boolean(id));

    const properties: Record<string, unknown> = {
      "Asset Name": { title: rt(ka.name) },
      "Asset Type": { select: { name: ka.asset_type } },
      Status: { select: { name: status } },
      "Sensitivity Level": { select: { name: sensitivity } },
      "Portal Visibility": { select: { name: "portfolio" } },
      "Operationally Active?": { checkbox: false },
      "Living Room Theme": { checkbox: false },
      "Knowledge Update Needed?": { checkbox: knowledgeUpdateNeeded },
      "Migration Status": { select: { name: "Not Migrated" } },
      "Domain / Theme": { multi_select: ka.domain_themes.map((t) => ({ name: t })) },
      Subthemes: { multi_select: ka.subthemes.map((t) => ({ name: t })) },
      Version: { rich_text: rt("0.1 (candidate)") },
      Summary: { rich_text: rt(ka.summary) },
      "Canonical Guidance / Main Body": { rich_text: rt(ka.main_body) },
      "Evidence Used as Sources": { relation: evidenceIds.map((id) => ({ id })) },
    };

    const page = await notion.pages.create({
      parent: { database_id: DB.knowledge },
      properties: properties as never,
    });
    out.push({
      id: page.id,
      url: ("url" in page && page.url) || `https://www.notion.so/${page.id.replace(/-/g, "")}`,
      index: i,
      name: ka.name,
    });
  }

  return out;
}

async function backlinkEvidenceToKAs(
  notion: Client,
  evidence: ProposalEvidence[],
  evidenceCreated: { id: string; index: number }[],
  kasCreated: { id: string; index: number }[],
): Promise<void> {
  for (const e of evidence) {
    const ev = evidenceCreated.find((ec) => ec.index === evidence.indexOf(e));
    if (!ev) continue;
    if (!e.ka_indices || e.ka_indices.length === 0) continue;

    const kaIds = e.ka_indices
      .map((idx) => kasCreated.find((k) => k.index === idx)?.id)
      .filter((id): id is string => Boolean(id));
    if (kaIds.length === 0) continue;

    await notion.pages.update({
      page_id: ev.id,
      properties: {
        "Knowledge Assets Linked": { relation: kaIds.map((id) => ({ id })) },
      } as never,
    });
  }
}

function buildAuditMarkdown(args: {
  proposal: DigestProposal;
  answers: ProposalAnswers;
  appliedLog: string[];
  evidence: { id: string; url: string; index: number; title: string }[];
  kas: { id: string; url: string; index: number; name: string }[];
  linkedOrgs: { name: string; id: string }[];
  pipelineMeta: { model: string; inputTokens: number; outputTokens: number };
}): string {
  const today = new Date().toISOString().slice(0, 10);
  const tierCounts = args.proposal.evidence.reduce<Record<string, number>>((acc, e) => {
    acc[e.reusability] = (acc[e.reusability] ?? 0) + 1;
    return acc;
  }, {});
  const tierLine = Object.entries(tierCounts)
    .map(([k, v]) => `${v} ${k}`)
    .join(", ");

  const answersBlock = args.proposal.questions
    .map((q) => {
      const a = args.answers[q.id];
      return `- **${q.question}** — ${a !== undefined && a !== "" ? `\`${String(a)}\`` : "(no answer)"}\n  _${q.affects}_`;
    })
    .join("\n");

  const evidenceTable = args.proposal.evidence
    .map((e, i) => {
      const created = args.evidence.find((c) => c.index === i);
      const link = created ? `[${e.title.replace(/\|/g, "\\|")}](${created.url})` : e.title;
      return `| E${i + 1} | ${link} | ${e.evidence_type} | ${e.reusability} |`;
    })
    .join("\n");

  const kaTable = args.proposal.knowledge_assets
    .map((k, i) => {
      const created = args.kas.find((c) => c.index === i);
      const link = created ? `[${k.name.replace(/\|/g, "\\|")}](${created.url})` : k.name;
      const evRefs = k.evidence_indices.map((idx) => `E${idx + 1}`).join(", ");
      return `| ${link} | ${k.asset_type} | ${evRefs} |`;
    })
    .join("\n");

  const orgsLine =
    args.linkedOrgs.length > 0
      ? args.linkedOrgs
          .map((o) => `[${o.name}](https://www.notion.so/${o.id.replace(/-/g, "")})`)
          .join(", ")
      : "(none)";

  return `## Digestion audit (${today})

Pushed via portal Full Digest pipeline (Phase B drafter → /api/ingest-library/digest/execute Phase C).

| Field | Value |
|---|---|
| Pipeline | portal \`/api/ingest-library/digest/execute\` (TS Phase C) |
| Model | ${args.pipelineMeta.model} |
| Tokens | ${args.pipelineMeta.inputTokens.toLocaleString()} in / ${args.pipelineMeta.outputTokens.toLocaleString()} out |
| Evidence created | ${args.evidence.length} |
| Knowledge Assets created | ${args.kas.length} |
| Triage | ${tierLine || "(none)"} |
| Linked Organizations | ${orgsLine} |

## User answers

${answersBlock || "_No questions in this proposal._"}

## Auto-applied to records

${args.appliedLog.length > 0 ? args.appliedLog.map((l) => `- ${l}`).join("\n") : "_No machine-applied mappings (free-text answers logged above only)._"}

## Evidence

| # | Title | Type | Tier |
|---|---|---|---|
${evidenceTable}

## Knowledge Assets

| Name | Type | Evidence |
|---|---|---|
${kaTable}
`;
}

function markdownToBlocks(md: string): unknown[] {
  // Lightweight markdown → Notion blocks converter. Handles headings, paragraphs,
  // bullet lists, and horizontal rules. Tables and images are NOT supported here;
  // tables are passed through as paragraphs (Notion will render them as text).
  const blocks: unknown[] = [];
  const lines = md.split(/\r?\n/);

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (line === "") continue;
    if (line.startsWith("## ")) {
      blocks.push({
        object: "block",
        type: "heading_2",
        heading_2: { rich_text: rt(line.slice(3)) },
      });
    } else if (line.startsWith("### ")) {
      blocks.push({
        object: "block",
        type: "heading_3",
        heading_3: { rich_text: rt(line.slice(4)) },
      });
    } else if (line.startsWith("- ")) {
      blocks.push({
        object: "block",
        type: "bulleted_list_item",
        bulleted_list_item: { rich_text: rt(line.slice(2)) },
      });
    } else if (line.startsWith("---")) {
      blocks.push({ object: "block", type: "divider", divider: {} });
    } else {
      blocks.push({
        object: "block",
        type: "paragraph",
        paragraph: { rich_text: rt(line) },
      });
    }
  }
  return blocks;
}

async function appendAudit(
  notion: Client,
  sourceId: string,
  audit: string,
): Promise<void> {
  const blocks = markdownToBlocks(audit);
  // Notion limits children appends to 100 per call. The audit is small enough
  // to fit but chunk anyway for safety.
  for (let i = 0; i < blocks.length; i += 100) {
    await notion.blocks.children.append({
      block_id: sourceId,
      children: blocks.slice(i, i + 100) as never,
    });
  }
}

export async function pushProposal(args: {
  proposal: DigestProposal;
  answers: ProposalAnswers;
  storagePath?: string | null;
  pipelineMeta?: { model: string; inputTokens: number; outputTokens: number };
}): Promise<PushResult> {
  const notion = getNotionClient();

  const { proposal, appliedLog } = applyAnswers(args.proposal, args.answers);

  const sourceUrlForFile: string | null = args.storagePath
    ? `https://${process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/^https?:\/\//, "")}/storage/v1/object/public/library-docs/${args.storagePath}`
    : null;

  const source = await createSource(notion, proposal, sourceUrlForFile);
  const evidence = await createEvidence(notion, proposal.evidence, source.id);
  const kas = await createKnowledgeAssets(notion, proposal.knowledge_assets, evidence);
  await backlinkEvidenceToKAs(notion, proposal.evidence, evidence, kas);

  const audit = buildAuditMarkdown({
    proposal,
    answers: args.answers,
    appliedLog,
    evidence,
    kas,
    linkedOrgs: source.linkedOrgs,
    pipelineMeta: args.pipelineMeta ?? { model: "unknown", inputTokens: 0, outputTokens: 0 },
  });
  await appendAudit(notion, source.id, audit);

  return {
    sourceId: source.id,
    sourceUrl: source.url,
    evidence,
    knowledgeAssets: kas,
    linkedOrgs: source.linkedOrgs,
  };
}

export type { ProposalQuestion };
