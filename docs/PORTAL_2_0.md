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

- `/admin/projects/[id]/state` — edit current state; manage claims and implementation learning.
- `/admin/projects/[id]/client-room` — configure the room, sync Drive, curate materials, grant/invite access and share agreements.
- `/admin/now` — the small operating queue: state health, expiring claims, unanswered client agreements and only high-threshold inbox items, beside the next 48 hours of meetings.
- `/hall/[slug]` — client-scoped project room.

## Next increments

1. Add an incremental state-refresh job that consumes validated evidence after extraction and proposes (never blindly applies) state changes.
2. Link state items and learning items to people/organizations as typed relations, not only labels.
3. Add a reviewed promotion flow from confirmed implementation learning to knowledge assets/playbooks.
4. Test the complete flow in production with real Clerk, Supabase and Drive credentials before onboarding the first client.
