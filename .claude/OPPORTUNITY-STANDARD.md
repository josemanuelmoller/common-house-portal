# OPPORTUNITY-STANDARD.md — Common House Opportunity Qualification Standard
**Sprint 24 · April 2026**

---

## The Rule

> An Opportunity record must be defensible as a real opportunity before it enters the pipeline.

No intermediate categories. No "Target Accounts", no "Prospect Hypotheses", no "Near Opportunities". If it cannot be scored ≥50, it is either:
- An **Offer Cue** (potential future market signal — stays inside the Offer System)
- A **Decision Item** (Missing Input — needs a human to qualify before creating an Opportunity)

An Offer Cue becoming a real Opportunity requires passing this standard first.

---

## Official Opportunity Definition

An Opportunity is a time-bounded commercial interaction where Common House has a plausible path to winning real work (revenue, grant, partnership, or investor match) with a specific entity.

**Six required criteria** — every Opportunity must have all six:

| # | Criterion | What it means |
|---|-----------|---------------|
| 1 | **Entity** | A real, named organisation exists in CH Organizations [OS v2] with an Account link |
| 2 | **Trigger / Why Now** | A specific, observable event or signal that makes this timely — not a permanent truth |
| 3 | **Buyer Path** | We know who the buyer is (or have a plausible access path to reach them) |
| 4 | **CH Right to Win** | We have a specific reason to believe CH can win this — not just "we could do this" |
| 5 | **Next Step** | A concrete, owned next action exists — not "explore" or "TBD" |
| 6 | **Value Hypothesis** | A specific estimate of revenue, grant size, or partnership value we'd pursue |

Missing any criterion → route to Decision Center (Type: Missing Input) before creating the Opportunity.

---

## Opportunity Score Model (0–100)

Scoring is done at creation and on qualification review. Score determines pipeline entry.

### Score Components

| Component | Max | 0 = Absent | 5–10 = Weak | Full score |
|-----------|-----|------------|-------------|------------|
| **Trigger / Why Now** | 20 | No trigger identified | Vague signal ("they might be interested") | Specific, dated event (RFP open, leadership change, project launch, grant window) |
| **Buyer Clarity** | 20 | No named buyer | Role known but no contact | Named contact with active relationship or warm intro path |
| **CH Fit / Right to Win** | 20 | No reason identified | Generic "we do this" | Specific precedent + sector fit + team available |
| **Proof / Credibility** | 15 | No precedent | Related work exists | Direct precedent with deliverable available |
| **Access Path** | 15 | No route to buyer | Indirect (1 remove) | Direct relationship or confirmed warm intro |
| **Value Hypothesis** | 10 | No estimate | Order of magnitude only | Specific estimate (revenue range, grant amount, deal size) |
| **TOTAL** | 100 | | | |

### Score Thresholds

| Score | Status | Action |
|-------|--------|--------|
| **≥ 70** | **Qualified Opportunity** | Create Opportunity at Status = New or Qualifying. Proceed. |
| **50–69** | **Needs Review** | Create Opportunity at Status = New. Flag with Decision Item (Missing Input). Do not advance to Active without human review. |
| **< 50** | **Below Threshold** | Do NOT create Opportunity. Stay as Offer Cue or create Decision Item for human to resolve. |

---

## Required DB Fields

These fields must exist on every Opportunity record:

| Field | Type | Required at creation |
|-------|------|----------------------|
| `Opportunity Score` | Number (0–100) | Yes — set at creation |
| `Qualification Status` | Select | Yes — set at creation |
| `Trigger / Signal` | Text | Yes — cannot be empty for score ≥ 50 |
| `Buyer Probable` | Text | Yes — cannot be empty for score ≥ 50 |
| `Why There Is Fit` | Text | Yes — cannot be empty |
| `Suggested Next Step` | Text | Yes — cannot be empty for Qualifying/Active |
| `Account` | Relation → CH Organizations | Yes — must resolve |

### Qualification Status select options
- `Qualified` — score ≥ 70, all 6 criteria present
- `Needs Review` — score 50–69, missing at least one criterion
- `Below Threshold` — score < 50 (should not normally be set — these should not be Opportunities)
- `Not Scored` — legacy records created before this standard

---

## Enforcement by System

### Proposal System
- Proposal Brief requires a linked Opportunity with score ≥ 50
- If no qualifying Opportunity exists: create one first (or use an existing Active opp)
- Offer Cues inside Offer records are NOT pipeline Opportunities — they are signals
- Converting an Offer Cue to a real Opportunity requires scoring it first

### Offer System
- `Opportunity Cues` field on Offer records = named market signals only
- To activate a Cue as a real Opportunity: score it, verify criteria, then create Opportunity if ≥ 50
- skill `create-or-update-opportunity` enforces score gate in execute mode

### Grant System
- `grant-fit-scanner` CHECK G3 (missing grants): must confirm Why There Is Fit + eligible entity confirmed before creating
- Grant Opportunities require: Funder in CH Organizations, active grant window identified (Trigger), CH project eligible confirmed
- Minimum score for Grant Opportunity creation: 50

### Deal Flow / Investor Match
- `investor-matchmaker` score 0–90 already uses 60/40 thresholds — aligned with this standard
- Strong match (≥ 60) → creates Investor Match opportunity — compliant
- Borderline (40–59) → surfaces only, no auto-create — compliant
- The Investor Match thresholds are stricter than the base standard intentionally (investor context)

### portfolio-health-agent / startup-opportunity-scout
- Structural gap detection (startup has zero open opportunity of type X) is NOT sufficient to create an Opportunity
- Gap + confirmed trigger + score ≥ 50 required before proposing in execute mode
- Gaps without triggers → surfaced as informational only (dry_run output, not Decision Items unless p1_count triggered)

---

## Decision Center Integration

### When to create a Decision Item instead of an Opportunity

| Situation | Decision Item Type | Priority |
|-----------|-------------------|----------|
| Score 50–69 (Needs Review) | Missing Input | Normal |
| Score < 50, might improve | Missing Input | Low |
| Named buyer but no org record in CH Organizations | Missing Input | Normal |
| Trigger identified but eligibility unclear (grants) | Ambiguity Resolution | Normal |
| Offer Cue with strong signal but no access path yet | Missing Input | Normal |
| Existing Opportunity stalled with no next step | Missing Input | Normal |

Decision Item should: name the Opportunity (or potential Opportunity), state what is missing, and assign a clear next action.

### Field mapping
- `Affected Opportunity` relation on Decision Items → links to the specific Opportunity page
- When item is resolved (Human Decision = Approve) → update Opportunity Score + Qualification Status
- When item is resolved (Human Decision = Reject / Defer) → close Opportunity or leave as Offer Cue

---

## Score Templates by Opportunity Type

### CH Sale (consulting engagement)
| Component | Typical signal |
|-----------|---------------|
| Trigger | Project brief received, RFP open, inbound inquiry, leadership change |
| Buyer Clarity | Named contact at client org, warm intro from existing relationship |
| CH Fit | Specific past engagement in same sector + deliverable type |
| Proof | Deliverable from prior engagement available |
| Access Path | Direct relationship or 1-remove via existing client/advisor |
| Value Hypothesis | Estimated engagement value (e.g., "£40K design + strategy") |

### Grant (funder opportunity)
| Component | Typical signal |
|-----------|---------------|
| Trigger | Active grant window with specific deadline |
| Buyer Clarity | Program officer identified or grant guidelines public |
| CH Fit | CH project matches stated eligibility criteria |
| Proof | Prior grant recipient evidence or sector alignment |
| Access Path | Application route confirmed (open call / invite-only clarified) |
| Value Hypothesis | Grant amount from funder's published range |

### Investor Match
| Component | Typical signal |
|-----------|---------------|
| Trigger | Portfolio startup actively fundraising, investor has open mandate |
| Buyer Clarity | Named investor with confirmed sector focus + stage |
| CH Fit | Sector + stage match confirmed, CH relationship exists |
| Proof | Investor has made comparable investments |
| Access Path | CH has direct relationship or warm intro |
| Value Hypothesis | Target raise amount + likely cheque size from investor |

### Partnership
| Component | Typical signal |
|-----------|---------------|
| Trigger | Strategic conversation initiated, shared project identified |
| Buyer Clarity | Named counterpart contact at partner org |
| CH Fit | Complementary capabilities + no conflict of interest |
| Proof | Prior joint work or shared network signal |
| Access Path | Active dialogue already started |
| Value Hypothesis | Capacity leverage or revenue share estimate |

---

## Retailer Opportunity Scoring — Sprint 24 Baseline

Scored on first application of this standard (2026-04-12):

| Retailer | Score | Status | Decision Item |
|----------|-------|--------|---------------|
| Co-op | 59/100 | Needs Review | Created — add buyer path |
| Waitrose | 53/100 | Needs Review | Created — add buyer path |
| Tesco | 43/100 | Below Threshold | Created — recommend close → Offer Cue |
| Sainsbury's | 42/100 | Below Threshold | Created — recommend close → Offer Cue |
| Morrisons | 38/100 | Below Threshold | Created — recommend close → Offer Cue |

**Key gap across all five:** No named buyer contact or confirmed access path to sustainability/format team at any retailer. Trigger is real (Retail Refill programme signal) but buyer path is absent.

**Minimum to qualify Co-op and Waitrose:** Add named contact or confirmed intro route. Update score ≥ 70 to move to Qualified.

---

## Prohibited Patterns

These patterns are explicitly banned from the OS v2 pipeline:

| Pattern | Why prohibited |
|---------|---------------|
| Creating Opportunity from Offer Cue without scoring | Inflates pipeline with unqualified entries |
| `Trigger / Signal` empty on any non-Closed Opportunity | Criterion 2 — without a trigger, there's no "why now" |
| `Buyer Probable` empty on Qualifying or Active Opportunity | Criterion 3 — can't advance without knowing who buys |
| Structural gap alone triggering opportunity creation | Gap ≠ opportunity; must add trigger + access path |
| "TBD" or "Explore" in `Suggested Next Step` | Not a real next step |
| Creating retailer opportunities because offers list them as cues | Cue activation requires buyer path first |

---

## Version History

| Sprint | Change |
|--------|--------|
| Sprint 24 (2026-04-12) | Standard created. Scoring model defined. Retailer opportunities scored. Skills gated. |
