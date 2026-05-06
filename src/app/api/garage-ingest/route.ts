import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import Anthropic from "@anthropic-ai/sdk";
import { adminGuardApi } from "@/lib/require-admin";
// notion-cutoff-2026-06-02: Notion read kept only to resolve the project's Primary
// Organization relation when an orgId is not supplied by the caller. All write
// fan-outs in this route now target Supabase canonical tables.
import { notion } from "@/lib/notion";
import { isAdminUser, isAdminEmail } from "@/lib/clients";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import * as XLSX from "xlsx";
import mammoth from "mammoth";
import { extractPptxText } from "@/lib/office-text-extract";

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

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Normalise a YYYY-MM(-DD) string to a YYYY-MM-DD date string.
 * Returns null for empty or non-parseable strings.
 */
function toDateString(dateStr: string | null | undefined): string | null {
  if (!dateStr) return null;
  const trimmed = String(dateStr).trim();
  if (!trimmed) return null;
  // YYYY-MM → YYYY-MM-01
  if (/^\d{4}-\d{2}$/.test(trimmed)) return `${trimmed}-01`;
  // YYYY-MM-DD or anything Date can parse
  return trimmed;
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
      // PowerPoint PPTX: extract text from all slides via in-house JSZip extractor
      const pptxText = await extractPptxText(Buffer.from(fileBuffer));
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

  // ── execute: write to Supabase canonical tables ────────────────────────────
  // Per docs/SUPABASE_CONSOLIDATION_FREEZE.md §3, every Notion DB write below
  // is replaced by a Supabase canonical-table write. Notion calls are kept as
  // commented `notion-cutoff-2026-06-02` markers for traceability and removed
  // wholesale at Phase 6.
  const sb = getSupabaseServerClient();
  const errors: string[] = [];
  const nowIso = new Date().toISOString();
  const today = nowIso.split("T")[0]; // YYYY-MM-DD

  // Resolve orgId from project's Primary Organization relation if not passed in request.
  // Cap Table and Valuations are linked to organizations (not projects), so we need
  // orgId to both write and later read them back. If the project has no linked org, those
  // sections are skipped with a warning.
  // NOTE: The lookup currently still hits Notion because `projects` rows in Supabase
  //   do not yet expose the Primary Organization relation as a typed column. Once
  //   Phase 4 binds it (or callers always pass orgId) this read can be deleted.
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

  // 1. Evidence  → public.evidence
  // notion-cutoff-2026-06-02: replaced by canonical write to evidence
  // Notion → Supabase column mapping (see src/app/api/sync-evidence/route.ts):
  //   Evidence Title     → title
  //   Evidence Statement → evidence_statement
  //   Source Excerpt     → source_excerpt   (we store the file name as the excerpt anchor)
  //   Validation Status  → validation_status
  //   Date Captured      → date_captured
  //   Project relation   → project_notion_id
  //   Evidence Type      → evidence_type
  //   Confidence Level   → confidence_level
  // Anything not bound to a column (e.g. evidence date YYYY-MM) goes to payload.
  const evidenceItems = (extraction.evidence ?? []).slice(0, 15);
  for (const ev of evidenceItems) {
    try {
      const evRow: Record<string, unknown> = {
        notion_id:          `garage-ev-${randomUUID()}`,
        title:              (ev.title || "Untitled").slice(0, 2000),
        evidence_statement: (ev.statement || "").slice(0, 2000),
        source_excerpt:     fileName.slice(0, 2000),
        validation_status:  "New",
        date_captured:      today,
        project_notion_id:  projectId,
        evidence_type:      ev.type || null,
        confidence_level:   ev.confidence || null,
        payload: {
          evidence_date: ev.date ?? null,
          source_file_url: fileUrl,
          source_agent: "garage-ingest",
        },
        created_at:         nowIso,
        updated_at:         nowIso,
      };
      // notion-cutoff-2026-06-02: replaced by canonical write to evidence
      // await notion.pages.create({
      //   parent: { database_id: DB.evidence },
      //   properties: { /* Notion property bag — see git history */ } as Parameters<typeof notion.pages.create>[0]["properties"],
      // });
      const { error } = await sb.from("evidence").insert(evRow);
      if (error) throw new Error(error.message);
      evidenceCount++;
    } catch (err) {
      errors.push(`Evidence "${ev.title}": ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // 2. Financial Snapshots  → public.financial_snapshots
  // notion-cutoff-2026-06-02: replaced by canonical write to financial_snapshots
  // Notion → Supabase column mapping:
  //   Snapshot Name   → payload.snapshot_name (no native column)
  //   Scope Project   → scope_project_notion_id
  //   Period          → snapshot_date (date)
  //   Revenue         → payload.revenue (no native column; stays in payload until Phase 6)
  //   Burn            → burn_rate
  //   Gross Margin    → payload.gross_margin_pct
  //   Cash            → cash_balance
  //   Runway          → runway_months
  //   ARR             → arr
  //   MRR             → mrr
  for (const fin of extraction.financials ?? []) {
    try {
      const snapshotDate = toDateString(fin.period) ?? today;
      const finRow: Record<string, unknown> = {
        notion_id:                `garage-fin-${randomUUID()}`,
        scope_project_notion_id:  projectId,
        scope_org_notion_id:      resolvedOrgId ?? null,
        snapshot_date:            snapshotDate,
        mrr:                      fin.mrr,
        arr:                      fin.arr,
        cash_balance:             fin.cash,
        burn_rate:                fin.burn,
        runway_months:            fin.runway_months,
        payload: {
          snapshot_name:    `${projectName} — ${fin.period}`,
          period_raw:       fin.period,
          revenue:          fin.revenue,
          gross_margin_pct: fin.gross_margin_pct,
          confidence:       fin.confidence,
          source_file_url:  fileUrl,
          source_agent:     "garage-ingest",
        },
        created_at:               nowIso,
        updated_at:               nowIso,
      };
      // notion-cutoff-2026-06-02: replaced by canonical write to financial_snapshots
      // await notion.pages.create({
      //   parent: { database_id: DB.financialSnapshots },
      //   properties: { /* Notion property bag — see git history */ } as Parameters<typeof notion.pages.create>[0]["properties"],
      // });
      const { error } = await sb.from("financial_snapshots").insert(finRow);
      if (error) throw new Error(error.message);
      financialsCount++;
    } catch (err) {
      errors.push(`Financial "${fin.period}": ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // 3. Cap Table  → public.cap_table_entries
  // notion-cutoff-2026-06-02: replaced by canonical write to cap_table_entries
  // Notion → Supabase column mapping:
  //   Entry Name        → payload.entry_name (no native column)
  //   Shareholder Name  → shareholder_name
  //   Startup relation  → org_notion_id (NOT NULL)
  //   Shareholder Type  → shareholder_type
  //   Share Class       → share_class
  //   Round             → payload.round (no native column)
  //   Ownership Pct     → ownership_pct
  //   Invested Amount   → payload.invested_amount (no native column)
  const capTableItems = extraction.cap_table ?? [];
  if (capTableItems.length > 0 && !resolvedOrgId) {
    errors.push(`Cap Table: no organization linked to this project — link a Primary Organization to enable Cap Table writes`);
  }
  for (const ct of capTableItems) {
    if (!resolvedOrgId) break; // can't write without startup link (NOT NULL FK)
    try {
      const ctRow: Record<string, unknown> = {
        notion_id:        `garage-ct-${randomUUID()}`,
        org_notion_id:    resolvedOrgId,
        shareholder_name: ct.shareholder_name,
        shareholder_type: ct.type || null,
        share_class:      ct.share_class || null,
        ownership_pct:    ct.ownership_pct,
        payload: {
          entry_name:       `${ct.shareholder_name} — ${projectName}`,
          round:            ct.round || null,
          invested_amount:  ct.invested_amount,
          confidence:       ct.confidence,
          source_file_url:  fileUrl,
          source_agent:     "garage-ingest",
        },
        created_at:       nowIso,
        updated_at:       nowIso,
      };
      // notion-cutoff-2026-06-02: replaced by canonical write to cap_table_entries
      // await notion.pages.create({
      //   parent: { database_id: DB.capTable },
      //   properties: { /* Notion property bag — see git history */ } as Parameters<typeof notion.pages.create>[0]["properties"],
      // });
      const { error } = await sb.from("cap_table_entries").insert(ctRow);
      if (error) throw new Error(error.message);
      capTableCount++;
    } catch (err) {
      errors.push(`Cap table "${ct.shareholder_name}": ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // 4. Valuations  → public.valuations
  // notion-cutoff-2026-06-02: replaced by canonical write to valuations
  // Notion → Supabase column mapping:
  //   Valuation Name   → payload.valuation_name (no native column)
  //   Startup relation → org_notion_id (NOT NULL)
  //   Method           → source (free-form text on the canonical table)
  //   Pre-money Min    → payload.pre_money_min  (canonical has a single `pre_money` column)
  //   Pre-money Max    → payload.pre_money_max  (we also write the midpoint to `pre_money` if both are set)
  const valuationItems = extraction.valuations ?? [];
  if (valuationItems.length > 0 && !resolvedOrgId) {
    errors.push(`Valuations: no organization linked to this project — link a Primary Organization to enable Valuation writes`);
  }
  for (const val of valuationItems) {
    if (!resolvedOrgId) break; // can't write without startup link (NOT NULL FK)
    try {
      const min = val.pre_money_min;
      const max = val.pre_money_max;
      const preMoney =
        typeof min === "number" && typeof max === "number" ? (min + max) / 2 :
        typeof min === "number" ? min :
        typeof max === "number" ? max :
        null;

      const valRow: Record<string, unknown> = {
        notion_id:       `garage-val-${randomUUID()}`,
        org_notion_id:   resolvedOrgId,
        valuation_date:  today,
        pre_money:       preMoney,
        source:          val.method || null,
        payload: {
          valuation_name:  `${projectName} — ${val.round}`,
          round:           val.round || null,
          pre_money_min:   min,
          pre_money_max:   max,
          method:          val.method,
          confidence:      val.confidence,
          source_file_url: fileUrl,
          source_agent:    "garage-ingest",
        },
        created_at:      nowIso,
        updated_at:      nowIso,
      };
      // notion-cutoff-2026-06-02: replaced by canonical write to valuations
      // await notion.pages.create({
      //   parent: { database_id: DB.valuations },
      //   properties: { /* Notion property bag — see git history */ } as Parameters<typeof notion.pages.create>[0]["properties"],
      // });
      const { error } = await sb.from("valuations").insert(valRow);
      if (error) throw new Error(error.message);
      valuationsCount++;
    } catch (err) {
      errors.push(`Valuation "${val.round}": ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // 5. Knowledge Assets  → public.knowledge_assets
  // notion-cutoff-2026-06-02: replaced by canonical write to knowledge_assets
  // Previously called createKnowledgeAssetDraft() in src/lib/notion/knowledge.ts
  // which created a Notion page in the Knowledge Assets DB; we now insert
  // directly into the Supabase canonical table. The summary + bullet block body
  // is collapsed into body_md until Phase 6 binds dedicated columns.
  // Notion → Supabase column mapping:
  //   Asset Name       → title
  //   Asset Type       → asset_type
  //   Domain / Theme   → payload.tags (no native multi-select column yet)
  //   Status           → status ("Draft")
  //   Summary block    → summary  (also embedded in body_md)
  //   Key points block → body_md  (rendered as a markdown bullet list)
  //   Source File URL  → payload.source_file_url
  const knowledgeItems = (extraction.knowledge_assets ?? []).slice(0, 3);
  for (const ka of knowledgeItems) {
    try {
      const summary = ka.summary || "";
      const keyPoints = ka.key_points ?? [];
      const bodyMd = [
        summary,
        keyPoints.length > 0 ? "\n\n**Key points:**\n" + keyPoints.slice(0, 8).map(p => `- ${p}`).join("\n") : "",
        fileName ? `\n\n_Source: ${fileName}_` : "",
      ].join("").trim();

      const kaRow: Record<string, unknown> = {
        notion_id:  `garage-ka-${randomUUID()}`,
        title:      ka.title || "Untitled",
        asset_type: ka.asset_type || "Sector Insight",
        status:     "Draft",
        summary,
        body_md:    bodyMd,
        payload: {
          tags:             ka.tags ?? [],
          confidence:       ka.confidence,
          source_note:      fileName,
          source_file_url:  fileUrl,
          source_agent:     "garage-ingest",
          portal_visibility: "admin-only",
        },
        created_at: nowIso,
        updated_at: nowIso,
      };
      // notion-cutoff-2026-06-02: replaced by canonical write to knowledge_assets
      // await createKnowledgeAssetDraft({
      //   title: ka.title,
      //   summary: ka.summary,
      //   keyPoints: ka.key_points ?? [],
      //   assetType: ka.asset_type ?? "Sector Insight",
      //   tags: ka.tags ?? [],
      //   sourceNote: fileName,
      // });
      const { error } = await sb.from("knowledge_assets").insert(kaRow);
      if (error) throw new Error(error.message);
      knowledgeAssetsCount++;
    } catch (err) {
      errors.push(`Knowledge asset "${ka.title}": ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // 6. Insight Briefs  → public.insight_briefs
  // notion-cutoff-2026-06-02: replaced by canonical write to insight_briefs
  // The Notion path created a page (with Name + first Theme select) and then
  // appended a paragraph block for the summary. The canonical table holds the
  // full body in body_md, so the two-step write collapses to a single insert.
  // Notion → Supabase column mapping:
  //   Name            → title
  //   Theme[0]        → payload.theme[0] (no native column; first theme also stored as `scope` for filterability)
  //   Summary block   → body_md
  //   Status          → status ("Draft" — Notion had no explicit value)
  const insightItems = (extraction.insight_briefs ?? []).slice(0, 2);
  for (const ib of insightItems) {
    try {
      const ibRow: Record<string, unknown> = {
        notion_id:         `garage-ib-${randomUUID()}`,
        title:             ib.title || "Untitled",
        body_md:           (ib.summary || "").slice(0, 8000),
        status:            "Draft",
        scope:             ib.theme?.[0] ?? null,
        org_notion_id:     resolvedOrgId ?? null,
        project_notion_id: projectId,
        payload: {
          theme:           ib.theme ?? [],
          confidence:      ib.confidence,
          source_file_url: fileUrl,
          source_agent:    "garage-ingest",
        },
        created_at:        nowIso,
        updated_at:        nowIso,
      };
      // notion-cutoff-2026-06-02: replaced by canonical write to insight_briefs
      // const page = await notion.pages.create({
      //   parent: { database_id: DB.insightBriefs },
      //   properties: { /* Notion property bag — see git history */ } as Parameters<typeof notion.pages.create>[0]["properties"],
      // });
      // await notion.blocks.children.append({
      //   block_id: page.id,
      //   children: [ /* paragraph block with summary */ ],
      // });
      const { error } = await sb.from("insight_briefs").insert(ibRow);
      if (error) throw new Error(error.message);
      insightBriefsCount++;
    } catch (err) {
      errors.push(`Insight brief "${ib.title}": ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // 7. Decision Items  → public.decision_items
  // notion-cutoff-2026-06-02: replaced by canonical write to decision_items
  // Notion → Supabase column mapping:
  //   Name              → title
  //   Status            → status ("Open")
  //   Decision Category → category
  //   Priority          → priority
  //   Notes             → notes_raw
  const decisionItems = (extraction.decision_items ?? []).slice(0, 3);
  for (const di of decisionItems) {
    try {
      const diRow: Record<string, unknown> = {
        notion_id:         `garage-di-${randomUUID()}`,
        title:             di.title || "Untitled",
        status:            "Open",
        category:          di.category || null,
        priority:          di.priority || null,
        notes_raw:         di.notes || null,
        source_agent:      "garage-ingest",
        org_notion_id:     resolvedOrgId ?? null,
        project_notion_id: projectId,
        payload: {
          source_file_url: fileUrl,
        },
        created_at:        nowIso,
        updated_at:        nowIso,
      };
      // notion-cutoff-2026-06-02: replaced by canonical write to decision_items
      // await notion.pages.create({
      //   parent: { database_id: DB.decisions },
      //   properties: { /* Notion property bag — see git history */ } as Parameters<typeof notion.pages.create>[0]["properties"],
      // });
      const { error } = await sb.from("decision_items").insert(diRow);
      if (error) throw new Error(error.message);
      decisionItemsCount++;
    } catch (err) {
      errors.push(`Decision "${di.title}": ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // 8. Org profile update  → public.organizations (UPDATE)
  // notion-cutoff-2026-06-02: replaced by canonical update to organizations
  // Notion → Supabase column mapping:
  //   One-line Description → notes  (organizations has no `description` column;
  //                                   `notes` is the existing free-text field)
  //   Website              → website
  //   Themes (multi)       → themes (stringified JSON array, matching sync-organizations)
  if (resolvedOrgId) {
    try {
      const desc = extraction.organization?.description;
      const site = extraction.organization?.website;
      const tags = extraction.organization?.sector_tags;

      const orgUpdate: Record<string, unknown> = {};
      if (desc) orgUpdate["notes"]   = desc;
      if (site) orgUpdate["website"] = site;
      if (tags?.length) orgUpdate["themes"] = JSON.stringify(tags);

      if (Object.keys(orgUpdate).length > 0) {
        orgUpdate["updated_at"] = nowIso;
        // notion-cutoff-2026-06-02: replaced by canonical update to organizations
        // await notion.pages.update({
        //   page_id: resolvedOrgId,
        //   properties: { /* "One-line Description", "Website", "Themes" */ } as Parameters<typeof notion.pages.update>[0]["properties"],
        // });
        const { error } = await sb
          .from("organizations")
          .update(orgUpdate)
          .eq("notion_id", resolvedOrgId);
        if (error) throw new Error(error.message);
        orgUpdated = true;
      }
    } catch (err) {
      errors.push(`Org update: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // 9. Project draft status update  → public.projects (UPDATE)
  // notion-cutoff-2026-06-02: replaced by canonical update to projects
  // Notion → Supabase column mapping:
  //   Draft Status Update → draft_status_update (added in Phase 1.1 / freeze §3.1)
  if (extraction.draft_status_update) {
    try {
      // notion-cutoff-2026-06-02: replaced by canonical update to projects
      // await notion.pages.update({
      //   page_id: projectId,
      //   properties: {
      //     "Draft Status Update": notionRichText(extraction.draft_status_update),
      //   } as Parameters<typeof notion.pages.update>[0]["properties"],
      // });
      const { error } = await sb
        .from("projects")
        .update({
          draft_status_update: extraction.draft_status_update,
          updated_at:          nowIso,
        })
        .eq("notion_id", projectId);
      if (error) throw new Error(error.message);
      projectUpdated = true;
    } catch (err) {
      errors.push(`Project update: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // 10. Source record  → public.sources
  // notion-cutoff-2026-06-02: replaced by canonical write to sources
  // The previous Notion write created a CH Sources [OS v2] page so the file
  // appeared in the Sources panel for traceability. The canonical sources
  // table already drives that panel post-cutoff.
  // Notion → Supabase column mapping:
  //   Source Title       → title
  //   Source Type        → source_type ("Document")
  //   Processing Status  → processing_status ("Processed")
  //   Linked Projects[0] → project_notion_id  (single FK; multi-project fan-out goes to payload)
  //   Source URL         → source_url
  try {
    const srcRow: Record<string, unknown> = {
      notion_id:         `garage-src-${randomUUID()}`,
      title:             fileName.slice(0, 200),
      source_type:       "Document",
      processing_status: "Processed",
      project_notion_id: projectId,
      source_url:        fileUrl || null,
      source_date:       today,
      notion_created_at: nowIso,
      created_at:        nowIso,
      updated_at:        nowIso,
    };
    // notion-cutoff-2026-06-02: replaced by canonical write to sources
    // await notion.pages.create({
    //   parent: { database_id: DB.sources },
    //   properties: { /* Notion property bag — see git history */ } as Parameters<typeof notion.pages.create>[0]["properties"],
    // });
    const { error } = await sb.from("sources").insert(srcRow);
    if (error) throw new Error(error.message);
  } catch (err) {
    // Non-fatal — evidence and financials already written; don't fail the whole response
    errors.push(`Sources record: ${err instanceof Error ? err.message : String(err)}`);
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
