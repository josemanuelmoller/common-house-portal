# Portal 2.0 — operating model

## Purpose

The portal has two distinct jobs:

1. **Operate the present.** Replace the coordination work of a chief of staff: show what changed, what needs a decision, the next commitment, current project reality, commercial record and the material needed to act.
2. **Learn from delivery.** Retain reusable implementation insight without mistaking every transcript detail for institutional knowledge.

It is not a general chat/search surface. Claude is the natural place to explore the same corpus conversationally. The portal should answer with stable, visible operational objects rather than another prompt box.

## Core model

```
Raw sources (meetings, email, Drive)
        ↓ extract / validate
Evidence and documents
        ↓ material delta only
Project current state ────────→ Client Room
        ↓ review / expire                 ↓ shared materials, agreements, approvals
Implementation learning
        ↓ evidence threshold + human review
Knowledge asset / playbook
```

### Project current state

`project_states` is one concise, reviewable model per project. It has a summary, phase, current focus, health, confidence, next check-in and a `stale_after` date. A state revision is recorded on every edit. It is a working model, not an assertion that the whole transcript has been reread.

`project_state_items` holds specific operational claims: decisions, commitments, risks, dependencies, questions, milestones, stakeholder signals, assumptions and outcomes. Every active item should have a source reference where possible, a confidence level and a review/expiry date. Items are resolved, superseded, marked unknown or expired instead of silently accumulating.

### Learning versus knowledge

`project_learning_items` is the buffer between delivery experience and institutional IP. It deliberately records things such as:

- questions from Quality, Marketing or Store Operations;
- rollout friction, workarounds and exception paths;
- stakeholder needs and decision patterns;
- what implementation changed relative to the pilot design.

An item begins as `observed` and has a transferability level of `project`. Marking it a `candidate` only says it warrants review; it does **not** create a knowledge asset or a playbook. Promotion requires review and enough source-backed repetition across a meaningful context. This prevents the system from over-interpreting a single meeting or client-specific quirk.

When an item is promoted, its resulting `knowledge_assets` ID is stored on the learning item and the playbook can retain the links back to the underlying evidence.

## Client Room

Each project can expose a controlled room at `/hall/[slug]` after an admin enables it. The room contains only client-visible data:

- what Common House heard and the current proposal;
- plan/timeline and intentionally shared materials;
- shared agreements, approvals, purchase-order and commercial record.

Drive is storage, not the visibility system. `project_materials` is the portal index that owns category, lifecycle, client visibility and document context. New Drive files index as internal until an admin shares them.

`project_agreements` keeps the shared understanding and approval record. Responses use an atomic versioned transition and write an immutable audit event. A collaborator can respond to operational items; only an approver can approve commercial or purchase-order items.

## Client onboarding and access

`client_access` is project-scoped and role-based: `viewer`, `collaborator`, `approver`. A grant can be created against a work email before the recipient has a Clerk account. The administrator can send an invitation at that time; the grant becomes usable only when Clerk presents that email as verified. This supports inviting a client immediately after the first meeting while avoiding an open-link client room.

Drive sharing is explicit and optional. Project folders are private by default; the portal never sets them to “anyone with the link.”

## Automation guardrails

An automated state refresh may propose updates only when it sees a material delta since the last accepted state:

- a new or reversed decision, commitment, blocker, dependency or milestone;
- a change in owner, due date, confidence or project health;
- direct evidence that a previously active item is resolved or no longer relevant.

It must preserve source references, set `stale_after`, and create a revision. It must not revive expired items without fresh evidence, overwrite a human-edited state without a reviewable proposal, or create knowledge from a single observation.

## Implemented surfaces

- `/admin/projects/[id]/state` — review proposed updates; edit current state; manage claims and implementation learning.
- `/admin/projects/[id]/client-room` — configure the room, sync Drive, curate materials, grant/invite access and share agreements.
- `/admin/now` — the small operating queue: state health, expiring claims, pending state proposals, unanswered client agreements and only high-threshold inbox items, beside the next 48 hours of meetings.
- `/hall/[slug]` — client-scoped project room.

## Incremental state-refresh job

`/api/state-refresh` reads only the validated evidence that is new since it last
ran, using a per-project keyset cursor on `(updated_at, id)` over
`validation_status = 'Validated'` rows (`project_evidence_cursors` +
`next_evidence_batch`). The cursor advances only to the max row actually
processed — never to `now()` — so a project with more new evidence than the batch
cap loses nothing, and because it keys on `updated_at` (not a one-time
`validated_at`) a later resolve/revert/correction re-enters the stream. It writes
rows to `project_state_proposals` at `status = 'pending'`. It obeys the automation guardrails above: proposal-first (it
never mutates `project_states` / `project_state_items`), source-preserving (each
proposal carries the evidence IDs that justify it), and it never creates a knowledge
asset. The model references existing claims and evidence by safe labels that are
mapped back to IDs server-side, and every model-provided type/status is
whitelist-validated before it is stored.

Acceptance is the only path that mutates state: `PATCH …/state/proposals/[id]`
with `action: 'accept'` applies the change (add/update/resolve a claim, revise the
summary, or record an implementation learning) and writes a `system_refresh`
revision; `action: 'reject'` dismisses it. Acceptance runs entirely inside the
`apply_state_proposal` RPC — one transaction that locks the proposal
(`SELECT … FOR UPDATE`), scopes to the project and re-validates every enum/payload
field before mutating, writes the revision with a snapshot of the affected state
plus the applied entity, and returns the closed proposal. A non-pending proposal
conflicts (409), so a double click can never apply the same proposal twice, and a
mid-run crash can never leave state half-applied.

- Cron: `30 5 * * 1-5` (after `project-operator`; evidence is validated at 03:00).
- Auth: `requireCronAuth` (CRON_SECRET / x-agent-key). Model: `claude-sonnet-4-6`,
  forced tool-use, `max_tokens: 8000`. `modelProposed` vs `proposalsCreated` is
  returned so a truncated or over-filtered run is observable rather than silent.
- Admin single-project trigger: `POST /api/admin/projects/[id]/state/refresh`.

## Next increments

1. Link state items and learning items to people/organizations as typed relations, not only labels.
2. Add a reviewed promotion flow from confirmed implementation learning to knowledge assets/playbooks.
3. Test the complete flow in production with real Clerk, Supabase and Drive credentials before onboarding the first client.
