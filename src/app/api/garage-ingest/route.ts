import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { adminGuardApi } from "@/lib/require-admin";
import { notion, DB, createKnowledgeAssetDraft } from "@/lib/notion";

// PDF analysis + multi-DB writes can take up to 2 minutes
export const maxDuration = 120;

// ─── Types ────────────────────────────────────────────────────────────────────

interface IngestBody {
  fileUrl: string;
  fileName: string;
  projectId: string;
  projectName: string;
  orgId?: string;
  mode: "dry_run" | "execute";
}

interface EvidenceExtract {
  title: string;
  type: string;
  statement: string;
  date: string | null;
  confidence: string;
}

interface FinancialExtract {
  period: string;
  revenue: number | null;
  burn: number | null;
  gross_margin_pct: number | null;
  cash: number | null;
  runway_months: number | null;
  arr: number | null;
  mrr: number | null;
  confidence: string;
}

interface CapTableExtract {
  shareholder_name: string;
  type: string;
  share_class: string;
  ownership_pct: number | null;
  invested_amount: number | null;
  round: string;
  confidence: string;
}

interface ValuationExtract {
  round: string;
  pre_money_min: number | null;
  pre_money_max: number | null;
  method: string;
  confidence: string;
}

interface KnowledgeAssetExtract {
  title: string;
  asset_type: string;
  summary: string;
  key_points: string[];
  tags: string[];
  confidence: string;
}

interface InsightBriefExtract {
  title: string;
  theme: string[];
  summary: string;
  confidence: string;
}

interface DecisionItemExtract {
  title: string;
  category: string;
  priority: string;
  notes: string;
}

interface ExtractedData {
  organization: {
    description: string;
    sector_tags: string[];
    geography: string;
    founding_year: number | null;
    website: string;
    team: { name: string; role: string }[];
  };
  evidence: EvidenceExtract[];
  financials: FinancialExtract[];
  cap_table: CapTableExtract[];
  valuations: ValuationExtract[];
  knowledge_assets: KnowledgeAssetExtract[];
  insight_briefs: InsightBriefExtract[];
  decision_items: DecisionItemExtract[];
  draft_status_update: string;
}

// ─── Extraction prompt ────────────────────────────────────────────────────────

const EXTRACTION_PROMPT = `You are a structured data extraction agent for an investment portfolio management system.

Analyze the attached document and extract structured information. Return ONLY valid JSON — no markdown fences, no commentary, no extra text before or after.

Return this exact JSON schema:
{
  "organization": {
    "description": "one-line description of the company, max 120 chars",
    "sector_tags": ["tag1", "tag2"],
    "geography": "country or city",
    "founding_year": 2020,
    "website": "https://...",
    "team": [{"name": "...", "role": "..."}]
  },
  "evidence": [
    {
      "title": "factual statement max 120 chars",
      "type": "Milestone|Traction|Risk|Assumption|Decision|Outcome",
      "statement": "1-3 sentence elaboration",
      "date": "YYYY-MM or null",
      "confidence": "High|Medium|Low"
    }
  ],
  "financials": [
    {
      "period": "YYYY-MM-DD",
      "revenue": null,
      "burn": null,
      "gross_margin_pct": null,
      "cash": null,
      "runway_months": null,
      "arr": null,
      "mrr": null,
      "confidence": "High|Medium|Low"
    }
  ],
  "cap_table": [
    {
      "shareholder_name": "...",
      "type": "Founder|Investor|ESOP|Advisor",
      "share_class": "Ordinary|Preference|SAFE|Note",
      "ownership_pct": 0.45,
      "invested_amount": null,
      "round": "Pre-seed|Seed|Series A",
      "confidence": "High|Medium|Low"
    }
  ],
  "valuations": [
    {
      "round": "Seed",
      "pre_money_min": null,
      "pre_money_max": null,
      "method": "Negotiated|DCF|Comparables",
      "confidence": "High|Medium|Low"
    }
  ],
  "knowledge_assets": [
    {
      "title": "...",
      "asset_type": "Market Research|Sector Insight|Model Validation|Framework",
      "summary": "2-4 sentence description",
      "key_points": ["point1", "point2", "point3"],
      "tags": ["tag1", "tag2"],
      "confidence": "High|Medium|Low"
    }
  ],
  "insight_briefs": [
    {
      "title": "...",
      "theme": ["theme1"],
      "summary": "3-5 sentence investment/market thesis",
      "confidence": "High|Medium|Low"
    }
  ],
  "decision_items": [
    {
      "title": "...",
      "category": "Investment|Partnership|Support|Due Diligence",
      "priority": "High|Medium|Low",
      "notes": "..."
    }
  ],
  "draft_status_update": "2-3 sentence current status summary based on the document"
}

Rules:
- Only include items with genuine evidence from the document — do not hallucinate
- Cap evidence at 15 items (the most important facts)
- Cap knowledge_assets at 3 items
- Cap insight_briefs at 2 items
- Cap decision_items at 3 items
- For null numeric fields, use JSON null (not 0 or "")
- For missing strings, use "" not null
- Always return valid JSON — this will be parsed with JSON.parse()`;

// ─── Notion write helpers ─────────────────────────────────────────────────────

function notionTitle(content: string) {
  return { title: [{ text: { content: content.slice(0, 2000) } }] };
}

function notionRichText(content: string) {
  return { rich_text: [{ text: { content: content.slice(0, 2000) } }] };
}

function notionSelect(name: string) {
  return name ? { select: { name } } : undefined;
}

function notionMultiSelect(names: string[]) {
  return { multi_select: names.filter(Boolean).map(n => ({ name: n })) };
}

function notionRelation(id: string) {
  return { relation: [{ id }] };
}

function notionDate(dateStr: string | null) {
  if (!dateStr) return undefined;
  // Ensure it's a valid date-like string
  const d = dateStr.length === 7 ? `${dateStr}-01` : dateStr;
  return { date: { start: d } };
}

function notionNumber(n: number | null) {
  if (n === null || n === undefined) return undefined;
  return { number: n };
}

// ─── POST handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const guard = await adminGuardApi();
  if (guard) return guard;

  let body: IngestBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { fileUrl, fileName, projectId, projectName, orgId, mode = "dry_run" } = body;

  if (!fileUrl || !fileName || !projectId || !projectName) {
    return NextResponse.json(
      { error: "fileUrl, fileName, projectId, and projectName are required" },
      { status: 400 }
    );
  }

  // ── Step 1: Download the file ──────────────────────────────────────────────
  let base64Data: string;
  try {
    const fileRes = await fetch(fileUrl);
    if (!fileRes.ok) throw new Error(`Download failed: ${fileRes.status}`);
    const buffer = await fileRes.arrayBuffer();
    base64Data = Buffer.from(buffer).toString("base64");
  } catch (err) {
    return NextResponse.json(
      { error: `Failed to download file: ${err instanceof Error ? err.message : String(err)}` },
      { status: 502 }
    );
  }

  // ── Step 2: Call Anthropic API ─────────────────────────────────────────────
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  let extraction: ExtractedData;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const userContent: any[] = [
      {
        type: "document",
        source: {
          type: "base64",
          media_type: "application/pdf",
          data: base64Data,
        },
      },
      {
        type: "text",
        text: EXTRACTION_PROMPT,
      },
    ];

    const msg = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 8000,
      messages: [{ role: "user", content: userContent }],
    });

    const raw = msg.content[0]?.type === "text" ? msg.content[0].text : "";
    // Strip any accidental markdown fences
    const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
    extraction = JSON.parse(cleaned) as ExtractedData;
  } catch (err) {
    return NextResponse.json(
      { error: `AI extraction failed: ${err instanceof Error ? err.message : String(err)}` },
      { status: 502 }
    );
  }

  // ── dry_run: return extraction without writing ─────────────────────────────
  if (mode === "dry_run") {
    return NextResponse.json({ mode: "dry_run", extraction });
  }

  // ── execute: write to Notion ───────────────────────────────────────────────
  const errors: string[] = [];
  const today = new Date().toISOString().split("T")[0]; // YYYY-MM-DD

  let evidenceCount = 0;
  let financialsCount = 0;
  let capTableCount = 0;
  let valuationsCount = 0;
  let knowledgeAssetsCount = 0;
  let insightBriefsCount = 0;
  let decisionItemsCount = 0;
  let orgUpdated = false;
  let projectUpdated = false;

  // 1. Evidence
  const evidenceItems = (extraction.evidence ?? []).slice(0, 15);
  for (const ev of evidenceItems) {
    try {
      const props: Record<string, unknown> = {
        "Evidence Title":    notionTitle(ev.title || "Untitled"),
        "Validation Status": notionSelect("New"),
        "Date Captured":     { date: { start: today } },
        "Source Reference":  notionRichText(fileName),
        "Project":           notionRelation(projectId),
      };
      if (ev.type)       props["Evidence Type"]    = notionSelect(ev.type);
      if (ev.statement)  props["Evidence Statement"] = notionRichText(ev.statement);
      if (ev.confidence) props["Confidence Level"]  = notionSelect(ev.confidence);

      await notion.pages.create({
        parent: { database_id: DB.evidence },
        properties: props as Parameters<typeof notion.pages.create>[0]["properties"],
      });
      evidenceCount++;
    } catch (err) {
      errors.push(`Evidence "${ev.title}": ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // 2. Financial Snapshots
  for (const fin of extraction.financials ?? []) {
    try {
      const props: Record<string, unknown> = {
        "Snapshot Name": notionTitle(`${projectName} — ${fin.period}`),
        "Scope Project":  notionRelation(projectId),
      };
      const dateVal = notionDate(fin.period);
      if (dateVal) props["Period"] = dateVal;
      const revenue = notionNumber(fin.revenue);            if (revenue)           props["Revenue"] = revenue;
      const burn    = notionNumber(fin.burn);               if (burn)              props["Burn Rate"] = burn;
      const gm      = notionNumber(fin.gross_margin_pct);  if (gm)               props["Gross Margin %"] = gm;
      const cash    = notionNumber(fin.cash);               if (cash)              props["Cash Position"] = cash;
      const runway  = notionNumber(fin.runway_months);      if (runway)            props["Runway (months)"] = runway;
      const arr     = notionNumber(fin.arr);                if (arr)               props["ARR"] = arr;
      const mrr     = notionNumber(fin.mrr);                if (mrr)               props["MRR"] = mrr;

      await notion.pages.create({
        parent: { database_id: DB.financialSnapshots },
        properties: props as Parameters<typeof notion.pages.create>[0]["properties"],
      });
      financialsCount++;
    } catch (err) {
      errors.push(`Financial "${fin.period}": ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // 3. Cap Table
  for (const ct of extraction.cap_table ?? []) {
    try {
      const props: Record<string, unknown> = {
        "Entry Name":      notionTitle(`${ct.shareholder_name} — ${projectName}`),
        "Shareholder Name": notionRichText(ct.shareholder_name),
      };
      if (orgId)            props["Startup"]          = notionRelation(orgId);
      if (ct.type)          props["Shareholder Type"] = notionSelect(ct.type);
      if (ct.share_class)   props["Share Class"]      = notionSelect(ct.share_class);
      if (ct.round)         props["Round"]            = notionSelect(ct.round);
      const own = notionNumber(ct.ownership_pct);   if (own)   props["Ownership %"]     = own;
      const inv = notionNumber(ct.invested_amount); if (inv)   props["Amount Invested"]  = inv;

      await notion.pages.create({
        parent: { database_id: DB.capTable },
        properties: props as Parameters<typeof notion.pages.create>[0]["properties"],
      });
      capTableCount++;
    } catch (err) {
      errors.push(`Cap table "${ct.shareholder_name}": ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // 4. Valuations
  for (const val of extraction.valuations ?? []) {
    try {
      const props: Record<string, unknown> = {
        "Valuation Name": notionTitle(`${projectName} — ${val.round}`),
      };
      if (orgId)      props["Startup"]                  = notionRelation(orgId);
      if (val.round)  props["Round"]                    = notionSelect(val.round);
      if (val.method) props["Valuation Method"]         = notionSelect(val.method);
      const min = notionNumber(val.pre_money_min); if (min) props["Pre-money Valuation Min"] = min;
      const max = notionNumber(val.pre_money_max); if (max) props["Pre-money Valuation Max"] = max;

      await notion.pages.create({
        parent: { database_id: DB.valuations },
        properties: props as Parameters<typeof notion.pages.create>[0]["properties"],
      });
      valuationsCount++;
    } catch (err) {
      errors.push(`Valuation "${val.round}": ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // 5. Knowledge Assets — use existing helper
  const knowledgeItems = (extraction.knowledge_assets ?? []).slice(0, 3);
  for (const ka of knowledgeItems) {
    try {
      await createKnowledgeAssetDraft({
        title: ka.title,
        summary: ka.summary,
        keyPoints: ka.key_points ?? [],
        assetType: ka.asset_type ?? "Sector Insight",
        tags: ka.tags ?? [],
        sourceNote: fileName,
      });
      knowledgeAssetsCount++;
    } catch (err) {
      errors.push(`Knowledge asset "${ka.title}": ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // 6. Insight Briefs
  const insightItems = (extraction.insight_briefs ?? []).slice(0, 2);
  for (const ib of insightItems) {
    try {
      const page = await notion.pages.create({
        parent: { database_id: DB.insightBriefs },
        properties: {
          "Brief Title": notionTitle(ib.title),
          "Status":      notionSelect("Draft") as Parameters<typeof notion.pages.create>[0]["properties"][string],
          "Visibility":  notionSelect("Internal") as Parameters<typeof notion.pages.create>[0]["properties"][string],
          ...((ib.theme?.length ?? 0) > 0
            ? { "Theme": notionMultiSelect(ib.theme) as Parameters<typeof notion.pages.create>[0]["properties"][string] }
            : {}),
        } as Parameters<typeof notion.pages.create>[0]["properties"],
      });

      // Add summary as page body paragraph
      if (ib.summary) {
        await notion.blocks.children.append({
          block_id: page.id,
          children: [
            {
              object: "block",
              type: "paragraph",
              paragraph: { rich_text: [{ type: "text", text: { content: ib.summary.slice(0, 2000) } }] },
            },
          ],
        });
      }
      insightBriefsCount++;
    } catch (err) {
      errors.push(`Insight brief "${ib.title}": ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // 7. Decision Items
  const decisionItems = (extraction.decision_items ?? []).slice(0, 3);
  for (const di of decisionItems) {
    try {
      const props: Record<string, unknown> = {
        "Decision Title": notionTitle(di.title),
        "Status":         notionSelect("Open"),
        "Project":        notionRelation(projectId),
      };
      if (di.category) props["Category"] = notionSelect(di.category);
      if (di.priority) props["Priority"] = notionSelect(di.priority);
      if (di.notes)    props["Notes"]    = notionRichText(di.notes);

      await notion.pages.create({
        parent: { database_id: DB.decisions },
        properties: props as Parameters<typeof notion.pages.create>[0]["properties"],
      });
      decisionItemsCount++;
    } catch (err) {
      errors.push(`Decision "${di.title}": ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // 8. Org profile update (if orgId provided)
  if (orgId) {
    try {
      const orgProps: Record<string, unknown> = {};
      const desc = extraction.organization?.description;
      const site = extraction.organization?.website;
      const tags = extraction.organization?.sector_tags;
      if (desc) orgProps["One-line Description"] = notionRichText(desc);
      if (site) orgProps["Website"]              = { url: site };
      if (tags?.length) orgProps["Themes"]       = notionMultiSelect(tags);

      if (Object.keys(orgProps).length > 0) {
        await notion.pages.update({
          page_id: orgId,
          properties: orgProps as Parameters<typeof notion.pages.update>[0]["properties"],
        });
        orgUpdated = true;
      }
    } catch (err) {
      errors.push(`Org update: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // 9. Project draft status update
  if (extraction.draft_status_update) {
    try {
      await notion.pages.update({
        page_id: projectId,
        properties: {
          "Draft Status Update": notionRichText(extraction.draft_status_update),
        } as Parameters<typeof notion.pages.update>[0]["properties"],
      });
      projectUpdated = true;
    } catch (err) {
      errors.push(`Project update: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return NextResponse.json({
    mode: "execute",
    results: {
      evidence:        evidenceCount,
      financials:      financialsCount,
      cap_table:       capTableCount,
      valuations:      valuationsCount,
      knowledge_assets: knowledgeAssetsCount,
      insight_briefs:  insightBriefsCount,
      decision_items:  decisionItemsCount,
      org_updated:     orgUpdated,
      project_updated: projectUpdated,
      errors,
    },
  });
}
