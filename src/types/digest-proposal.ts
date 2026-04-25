/**
 * digest-proposal.ts — types for the structured digestion proposal returned
 * by the Phase B drafter via Claude tool_use.
 *
 * The proposal contains everything needed to push to Notion in Phase C, plus
 * a markdown rendering for human display, plus a list of structured questions
 * that gate the push (the human must answer them before /execute will run).
 *
 * IMPORTANT: keep this in sync with the tool input_schema in digest-pipeline.ts
 * AND with the schema cache at .claude/schemas/os-v2-schemas.json.
 */

export type EvidenceType =
  | "Approval"
  | "Blocker"
  | "Process Step"
  | "Stakeholder"
  | "Risk"
  | "Objection"
  | "Decision"
  | "Requirement"
  | "Dependency"
  | "Outcome"
  | "Assumption"
  | "Contradiction"
  | "Insight Candidate"
  | "Milestone"
  | "Traction";

export type ReusabilityLevel =
  | "Project-Specific"
  | "Possibly Reusable"
  | "Reusable"
  | "Canonical";

export type ConfidenceLevel = "Low" | "Medium" | "High";

export type SourceType =
  | "Document"
  | "Note"
  | "Email"
  | "Meeting"
  | "Email Thread"
  | "Conversation"
  | "Clipping"
  | "Research Report"
  | "Industry Report"
  | "Whitepaper"
  | "Standard";

export type AssetType =
  | "Playbook"
  | "Pattern Library"
  | "Method"
  | "Checklist"
  | "Template"
  | "Benchmark"
  | "Insight Memo"
  | "Market Research"
  | "Model Validation"
  | "Sector Insight"
  | "Framework";

export type SourceSensitivity = "Internal" | "Client Confidential" | "Leadership Only";
export type EvidenceSensitivity = "Restricted" | "Client Confidential" | "Internal" | "Shareable";
export type KASensitivity =
  | "Internal Core"
  | "Restricted Internal"
  | "Client Derived"
  | "Public-Facing";

export type ProposalSource = {
  title: string;
  source_type: SourceType;
  source_date: string; // YYYY-MM-DD
  dedup_key: string;
  summary: string; // ≤500 chars
  sanitized_notes: string;
  publisher?: string;
  partner_org?: string;
};

export type ProposalEvidence = {
  title: string; // ≤120 chars
  statement: string;
  evidence_type: EvidenceType;
  reusability: ReusabilityLevel;
  confidence: ConfidenceLevel;
  topics: string[];
  geography: string[];
  affected_themes: string[];
  source_excerpt: string;
  /** Indices into knowledge_assets[] that reference this evidence. */
  ka_indices: number[];
};

export type ProposalKnowledgeAsset = {
  /** Must include a geographic-scope marker like "[LATAM / Chile]" or "[Global Analogue]". */
  name: string;
  asset_type: AssetType;
  summary: string; // ≤500 chars
  domain_themes: string[];
  subthemes: string[];
  /** Markdown for the KA body (Canonical Guidance / Main Body field). */
  main_body: string;
  /** Indices into evidence[] that this KA uses as sources. */
  evidence_indices: number[];
};

export type QuestionType = "single_choice" | "text" | "boolean" | "date";

export type ProposalQuestion = {
  id: string;
  question: string;
  hint?: string;
  type: QuestionType;
  /** Required for type=single_choice. */
  options?: string[];
  /** Optional default value (matched against options for single_choice, or raw for others). */
  default_value?: string;
  /** If true, the user must answer before /execute can run. Defaults to true. */
  required?: boolean;
  /** Human-readable description of what this answer modifies. Used as a label. */
  affects: string;
  /**
   * Optional machine-readable target so the push step can apply the answer to
   * a field automatically. Supported paths:
   *   - "source.source_date"           → ProposalSource.source_date
   *   - "source.sensitivity"           → "Internal" / "Client Confidential" / "Leadership Only"
   *   - "all.sensitivity"              → applies to source.sensitivity AND all evidence/KA sensitivity levels
   *   - "evidence.sensitivity_level"   → all evidence records
   *   - "ka.sensitivity_level"         → all KA records
   *   - "ka.knowledge_update_needed"   → boolean
   *   - "ka.status"                    → "Draft" / "Active" / "Archived" / etc.
   * If omitted, the answer is logged in the audit only — the user can hand-edit
   * the Notion records afterward.
   */
  target_field?: string;
};

export type DigestProposal = {
  /** Markdown rendering of the whole proposal for human display. */
  markdown: string;
  source: ProposalSource;
  evidence: ProposalEvidence[];
  knowledge_assets: ProposalKnowledgeAsset[];
  questions: ProposalQuestion[];
};

export type ProposalAnswers = Record<string, string | boolean>;
