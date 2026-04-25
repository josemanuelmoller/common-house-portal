# Triage Rubric — CH Evidence [OS v2]

**Purpose:** Concrete decision rules for assigning `Reusability Level` to evidence records. Replaces ad-hoc judgement with a documented, repeatable test.

**Used by:** `extract-evidence` skill, `triage-knowledge` skill, `ingest-document` skill, `evidence-review` agent, manual reviewers.

---

## The four tiers

### Canonical
The claim defines the field. It would belong in any expert's playbook on this domain, regardless of project, region, or company. It is independently verifiable, falsifiable, and not contingent on a single context.

**Pass all 4 to qualify:**
- [ ] Would experts outside Common House recognise this as standard knowledge in the domain?
- [ ] Is the claim defensible without referencing a specific project / company / market?
- [ ] Is it stated as a principle, mechanism, or causal relationship (not a one-off observation)?
- [ ] Comes from a peer-reviewed, government, or recognised-authority source?

**Examples:**
- "EPR fees must apply only at point of first market entry, not per reuse cycle."
- "Reverse logistics infrastructure is a prerequisite for any reuse system."
- "Targets should expand over time to provide a long-term investor signal."

**Anti-examples:**
- "Chile's Recycling Fund allocated USD 3M to 164 projects" → too specific (Chile + dates)
- "Coca-Cola has the highest return rate in the world" → unverifiable + company-specific

### Reusable
The claim transfers across projects in the same broad domain (e.g. circular economy / reuse / waste policy) but is anchored to specific contexts. A future CH initiative in this domain — even in a new market — would benefit from this insight.

**Pass 3 of 4:**
- [ ] Applies to multiple companies / regions / sub-sectors within a broader domain?
- [ ] States a pattern, lesson, or recommendation (not a discrete fact)?
- [ ] Could inform a strategy decision in a new context, with light adaptation?
- [ ] Sourced from research, multi-case analysis, or pattern-level synthesis?

**Examples:**
- "Sub-national reuse action precedes national policy and creates templates."
- "Pilot funding alone has not produced self-sustaining reuse systems."
- "Strict health/sanitary regulations are a chronic blocker for refill in cosmetics + cleaning."

### Possibly Reusable
The claim *might* generalise but is anchored to a specific market, company, or moment. Worth indexing but flag for revalidation in any other context.

**Pass 2 of 4:**
- [ ] Tied to a specific country / company / time period but the underlying mechanism may transfer?
- [ ] Quantitative benchmark from a specific case (return rates, market shares, fund sizes)?
- [ ] Cultural or regulatory observation that is part-pattern, part-context?
- [ ] Useful as a reference point in adjacent markets but with explicit caveat?

**Examples:**
- "30% of soft drinks in Chile are still sold in returnable bottles."
- "LATAM has cultural memory of reuse via traditional beverage container schemes."
- "Buenos Aires city demonstrated 1B fewer plastic bags between 2017-2018."

### Project-Specific
The claim is bound to one project, contract, market, or moment. No generalisation expected. Belongs in the evidence record but does not feed Knowledge Assets.

**Triggers:**
- Names a specific company, person, or contract not as an example but as the substance
- States a deadline, financial figure, or commitment tied to a single deal
- Encodes a regulatory provision unique to one jurisdiction with no transfer mechanism
- Is operational detail (logistics steps, internal process) for one CH project

**Examples:**
- "Argentina FACCyR cooperative employs 18,000 workers recovering 150 t/day."
- "Colombia recommendation: integrate reuse data into national SIRG waste-management info system."
- "Resolution 803/2024 requires registering total weight in tonnes of returnable packaging."

---

## Calibration heuristics

1. **The "5-year, new market" test.** Read the claim. Imagine CH starting a new initiative in 5 years in a different country. Does this claim still teach something useful? If yes → at least Reusable. If no → Project-Specific.

2. **The "expert outside CH" test.** Imagine an outside reuse-policy expert reads the claim. Would they say "yes, that's standard"? → Canonical. "Yes, that's a known pattern" → Reusable. "Interesting case, would need adaptation" → Possibly Reusable. "Specific to that case" → Project-Specific.

3. **Density check.** A canonical claim should be ≤ 2 sentences and contain a principle / mechanism / decision rule. If it requires a paragraph of context, it's likely Reusable or below.

4. **Source quality multiplier.**
   - Peer-reviewed, government, or international authority → eligible for Canonical
   - Industry report, multi-case research → eligible for Reusable
   - Single-source interview, single company experience → cap at Possibly Reusable

---

## Common errors to avoid

- **Inflating Canonical**: don't tag national-specific recommendations as Canonical even if the reasoning sounds general. The recommendation is anchored to that policy context.
- **Deflating Reusable**: don't downgrade a clear pattern just because it was observed in only 2-3 markets. Reusable is the right tier for cross-market patterns.
- **Confusing scope with reusability**: a piece of evidence about LATAM informal waste workers can be Canonical *for LATAM contexts* but Reusable globally. Encode this via the `Geography` field, not the tier.
- **Treating quotes as evidence**: a stakeholder quote is a `Stakeholder` Evidence Type, not necessarily Canonical content. Promote the underlying claim, not the quote.

---

## Quick decision tree

```
Is the claim a principle/mechanism that an outside expert would call standard?
  └─ YES → was the source peer-reviewed / authority?
            └─ YES → CANONICAL
            └─ NO → REUSABLE
  └─ NO → Does it transfer to other markets/projects with light adaptation?
            └─ YES → REUSABLE
            └─ MAYBE → POSSIBLY REUSABLE
            └─ NO → PROJECT-SPECIFIC
```

---

## Targets for digestion runs

For a peer-reviewed research source covering multiple markets, expect roughly:
- **50-65% Canonical** (theory + cross-cutting recommendations)
- **25-35% Reusable** (multi-market patterns)
- **5-10% Possibly Reusable** (anchored benchmarks)
- **0-5% Project-Specific** (single-jurisdiction details)

For a single-company case study or internal doc, expect:
- **5-15% Canonical**
- **20-35% Reusable**
- **30-50% Possibly Reusable**
- **15-30% Project-Specific**

Significant divergence from these ranges in a digestion run is a signal to re-examine the triage decisions.
