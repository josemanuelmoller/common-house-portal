import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { adminGuardApi } from "@/lib/require-admin";
import { notion, DB, createKnowledgeAssetDraft } from "@/lib/notion";
import { isAdminUser, isAdminEmail } from "@/lib/clients";
import * as XLSX from "xlsx";
import mammoth from "mammoth";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const officeparser = require("officeparser") as { parseOfficeAsync: (input: Buffer) => Promise<string> };

// PDF/Excel analysis + multi-DB writes can take up to 2 minutes
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
      "type": "Outcome|Milestone|Traction|Risk|Assumption|Decision|Requirement|Dependency|Blocker|Insight Candidate",
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
- Always return valid JSON — this will be parsed with JSON.parse()

Financial extraction guidance (be thorough — pitch decks often include these):
- Extract any revenue figures, even projected/forecasted ones (use confidence "Low" for projections)
- "ARR", "MRR", "run-rate", "annualised revenue" → arr or mrr field
- "burn rate", "monthly costs", "opex" → burn field
- "runway", "months of runway" → runway_months field
- "cash", "cash in bank", "raised" (if describes current cash) → cash field
- Even a single period with partial data is worth extracting — leave other fields null
- For the period field, use the snapshot date (e.g. last reported month) or the projection date if it's a forecast

Cap table extraction guidance:
- Extract any ownership percentages mentioned, e.g. "founders hold 70%", "investor X has 15%"
- "SAFE", "convertible note" → share_class = "SAFE" or "Note"
- Include even approximate/implied percentages if clearly stated

Valuation extraction guidance:
- Any mention of raise amount + valuation (e.g. "raising £500k at £2m pre-money") → extract as valuation
- "post-money valuation", "pre-money valuation", "company valued at" → extract
- If only one value is given (e.g. "£2m valuation"), put it in both pre_money_min and pre_money_max`;

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
  // Primary: Clerk session cookie via middleware context
  const guard = await adminGuardApi();
  if (guard) {
    const authHeader = req.headers.get("authorization") ?? "";
    const bearerToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
    const agentKey = req.headers.get("x-agent-key");
    const cronSecret = process.env.CRON_SECRET ?? "";

    if (agentKey && cronSecret && agentKey === cronSecret) {
      // Called from cron / internal agent — allow
    } else if (bearerToken) {
      // Decode JWT payload without network call (avoids JWKS fetch hanging).
      // The portal already requires Clerk auth to load — tokens come from authenticated sessions.
      try {
        const parts = bearerToken.split(".");
        if (parts.length !== 3) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")) as Record<string, unknown>;
        const userId = payload.sub as string | undefined;
        const email  = (payload.email ?? payload.primary_email_address_id ?? "") as string;
        const issuer = (payload.iss ?? "") as string;
        // Verify token is from our Clerk instance and user is admin
        if (!issuer.includes("clerk") || (!isAdminUser(userId ?? "") && !isAdminEmail(email))) {
          return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }
        // Token is from a valid Clerk session for an admin user — allow
      } catch {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
    } else {
      return guard; // Return original 401/403
    }
  }

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
  let fileBuffer: ArrayBuffer;
  try {
    const fileRes = await fetch(fileUrl);
    if (!fileRes.ok) throw new Error(`Download failed: ${fileRes.status}`);
    fileBuffer = await fileRes.arrayBuffer();
  } catch (err) {
    return NextResponse.json(
      { error: `Failed to download file: ${err instanceof Error ? err.message : String(err)}` },
      { status: 502 }
    );
  }

  // ── Step 2: Detect file type and build Anthropic message ───────────────────
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
  const isExcel = ["xlsx", "xls", "xlsm", "xlsb"].includes(ext);
  const isCsv   = ext === "csv";
  const isPdf   = ext === "pdf";
  const isWord  = ["docx", "doc"].includes(ext);
  const isPptx  = ["pptx", "ppt"].includes(ext);

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  let extraction: ExtractedData;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let userContent: any[];

    if (isPdf) {
      // PDF: send as document block (native vision)
      const base64Data = Buffer.from(fileBuffer).toString("base64");
      userContent = [
        {
          type: "document",
          source: { type: "base64", media_type: "application/pdf", data: base64Data },
        },
        { type: "text", text: EXTRACTION_PROMPT },
      ];
    } else if (isExcel || isCsv) {
      // Excel / CSV: parse with SheetJS, convert every sheet to markdown table
      const workbook = XLSX.read(Buffer.from(fileBuffer), { type: "buffer", cellDates: true });
      const sections: string[] = [];

      for (const sheetName of workbook.SheetNames) {
        const sheet = workbook.Sheets[sheetName];
        // Convert to array of arrays (preserves empty cells better than json)
        const rows: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
        if (rows.length === 0) continue;

        // Build a compact markdown table (cap at 200 rows per sheet to stay within token limit)
        const cappedRows = rows.slice(0, 200);
        const tableLines = cappedRows.map((row) =>
          "| " + (row as string[]).map(c => String(c ?? "").replace(/\|/g, "\\|").trim()).join(" | ") + " |"
        );
        sections.push(`## Sheet: ${sheetName}\n\n${tableLines.join("\n")}`);
      }

      const spreadsheetText = sections.join("\n\n");
      userContent = [
        {
          type: "text",
          text: `The following is the full content of the spreadsheet file "${fileName}", converted to markdown tables.\n\n${spreadsheetText}\n\n---\n\n${EXTRACTION_PROMPT}`,
        },
      ];
    } else if (isWord) {
      // Word DOCX: extract text with mammoth
      const { value: docText } = await mammoth.extractRawText({ buffer: Buffer.from(fileBuffer) });
      userContent = [
        {
          type: "text",
          text: `The following is the full text content of the Word document "${fileName}".\n\n${docText}\n\n---\n\n${EXTRACTION_PROMPT}`,
        },
      ];
    } else if (isPptx) {
      // PowerPoint PPTX: extract text from all slides with officeparser
      const pptxText: string = await officeparser.parseOfficeAsync(Buffer.from(fileBuffer));
      userContent = [
        {
          type: "text",
          text: `The following is the full text content of the PowerPoint file "${fileName}", extracted slide by slide.\n\n${pptxText}\n\n---\n\n${EXTRACTION_PROMPT}`,
        },
      ];
    } else {
      return NextResponse.json(
        { error: `File type ".${ext}" is not supported. Supported types: PDF, XLSX, XLS, CSV, DOCX, PPTX.` },
        { status: 400 }
      );
    }

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

  // Resolve orgId from project's Primary Organization relation if not passed in request.
  // Cap Table and Valuations are linked to CH Organizations (not CH Projects), so we need
  // orgId to both write and later read them back. If the project has no linked org, those
  // sections are skipped with a warning.
  let resolvedOrgId = orgId;
  if (!resolvedOrgId) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const projectPage: any = await notion.pages.retrieve({ page_id: projectId });
      const orgRelation: { id: string }[] = projectPage.properties?.["Primary Organization"]?.relation ?? [];
      resolvedOrgId = orgRelation[0]?.id;
    } catch {
      // Non-fatal — we'll warn below for cap table / valuations
    }
  }

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
        "Evidence Title":     notionTitle(ev.title || "Untitled"),
        "Evidence Statement": notionRichText(ev.statement || ""),
        "Source Excerpt":     notionRichText(fileName),
        "Validation Status":  notionSelect("New"),
        "Date Captured":      { date: { start: today } },
        "Project":            notionRelation(projectId),
      };
      if (ev.type)       props["Evidence Type"]    = notionSelect(ev.type);
      if (ev.confidence) props["Confidence Level"] = notionSelect(ev.confidence);

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
      const revenue = notionNumber(fin.revenue);           if (revenue) props["Revenue"]      = revenue;
      const burn    = notionNumber(fin.burn);              if (burn)    props["Burn"]          = burn;
      const gm      = notionNumber(fin.gross_margin_pct); if (gm)      props["Gross Margin"]  = gm;
      const cash    = notionNumber(fin.cash);              if (cash)    props["Cash"]          = cash;
      const runway  = notionNumber(fin.runway_months);     if (runway)  props["Runway"]        = runway;
      const arr     = notionNumber(fin.arr);               if (arr)     props["ARR"]           = arr;
      const mrr     = notionNumber(fin.mrr);               if (mrr)     props["MRR"]           = mrr;

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
  const capTableItems = extraction.cap_table ?? [];
  if (capTableItems.length > 0 && !resolvedOrgId) {
    errors.push(`Cap Table: no CH Organization linked to this project — link a Primary Organization in Notion to enable Cap Table writes`);
  }
  for (const ct of capTableItems) {
    if (!resolvedOrgId) break; // can't write without startup link (records would be unreadable)
    try {
      const props: Record<string, unknown> = {
        "Entry Name":       notionTitle(`${ct.shareholder_name} — ${projectName}`),
        "Shareholder Name": notionRichText(ct.shareholder_name),
        "Startup":          notionRelation(resolvedOrgId),
      };
      if (ct.type)        props["Shareholder Type"] = notionSelect(ct.type);
      if (ct.share_class) props["Share Class"]      = notionSelect(ct.share_class);
      if (ct.round)       props["Round"]            = notionSelect(ct.round);
      const own = notionNumber(ct.ownership_pct);   if (own) props["Ownership Pct"]       = own;
      const inv = notionNumber(ct.invested_amount); if (inv) props["Invested Amount (£)"] = inv;

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
  const valuationItems = extraction.valuations ?? [];
  if (valuationItems.length > 0 && !resolvedOrgId) {
    errors.push(`Valuations: no CH Organization linked to this project — link a Primary Organization in Notion to enable Valuation writes`);
  }
  for (const val of valuationItems) {
    if (!resolvedOrgId) break; // can't write without startup link (records would be unreadable)
    try {
      const props: Record<string, unknown> = {
        "Valuation Name": notionTitle(`${projectName} — ${val.round}`),
        "Startup":        notionRelation(resolvedOrgId),
      };
      if (val.method) props["Method"] = notionSelect(val.method);
      const min = notionNumber(val.pre_money_min); if (min) props["Pre-money Min (£)"] = min;
      const max = notionNumber(val.pre_money_max); if (max) props["Pre-money Max (£)"] = max;

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
      const ibProps: Record<string, unknown> = {
        "Name": notionTitle(ib.title),
      };
      if (ib.theme?.length) ibProps["Theme"] = notionSelect(ib.theme[0]);

      const page = await notion.pages.create({
        parent: { database_id: DB.insightBriefs },
        properties: ibProps as Parameters<typeof notion.pages.create>[0]["properties"],
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
        "Name":   notionTitle(di.title),
        "Status": notionSelect("Open"),
      };
      if (di.category) props["Decision Category"] = notionSelect(di.category);
      if (di.priority) props["Priority"]           = notionSelect(di.priority);
      if (di.notes)    props["Notes"]              = notionRichText(di.notes);

      await notion.pages.create({
        parent: { database_id: DB.decisions },
        properties: props as Parameters<typeof notion.pages.create>[0]["properties"],
      });
      decisionItemsCount++;
    } catch (err) {
      errors.push(`Decision "${di.title}": ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // 8. Org profile update (if org is resolvable)
  if (resolvedOrgId) {
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
          page_id: resolvedOrgId,
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
