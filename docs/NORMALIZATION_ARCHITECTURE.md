# Normalization Architecture

Last reviewed: 2026-04-24
Status: DESIGN — no code yet. This document is the contract. All ingestor and surface work must conform to it.
Open questions: RESOLVED (see §16).

---

## 1. Problem this solves

Today three surfaces — Commitments, Inbox needs attention, CoS desk — each classify raw substrate (evidence, Gmail, loops) at render time, with ad-hoc rules that reinvent "is this actionable for Jose?" three different ways. Consequences:

- The same item can appear in two or three surfaces with different judgements.
- Resolution in one surface does not propagate.
- Adding WhatsApp, Calendar, or Drive means building yet another classifier.
- Noise is impossible to tame globally — each fix lives in one surface.

The root cause is not bad heuristics. It is the absence of a normalized layer between substrates and surfaces. This document defines that layer.

## 2. Design principles

1. **Classify once, at ingest, not at render.** Surfaces are read-only views over normalized layers.
2. **One contract for all sources.** Gmail, Fireflies, Calendar, WhatsApp, Drive, Contacts all implement the same Ingestor interface.
3. **Signals, not records.** An ingestor emits typed signals into the layers it touches. A single source can emit multiple signal types per run.
4. **Layers are narrow and opinionated.** `action_items` only holds actions. `relationship_signals` only holds warmth/cadence. No cross-contamination.
5. **Dedup is a layer concern, not a surface concern.** Each layer defines its own dedup key.
6. **Resolution is an explicit event.** Closed items emit a `resolution_event` that flows back to the layer. Surfaces never mutate layers directly.
7. **Idempotent ingest.** Running the same ingestor on the same window twice produces no net change.

## 3. Non-goals

- Replacing Notion. Notion remains the human-editable system of record for Projects, People, Organizations, Evidence, Knowledge Assets.
- Replacing Supabase `loops`. Loops become an ingestor into `action_items`, not a parallel action store.
- Building every ingestor at once. Order of attack is in §11.
- Surfacing every signal. Some signals (relationship cadence, document freshness) are internal context for other signals — not always renderable.

## 4. Architecture

```
┌────────────────── SOURCES (raw substrate) ──────────────────────┐
│ Gmail │ Fireflies │ Calendar │ WhatsApp │ Contacts │ Drive │ …  │
└────┬────────┬─────────┬───────────┬───────────┬─────────┬──────┘
     │        │         │           │           │         │
     ▼        ▼         ▼           ▼           ▼         ▼
┌──────────────────── INGESTORS ──────────────────────────────────┐
│ one per source, common contract (§5), runs on schedule/webhook  │
│ emits typed signals (§6)                                        │
└────┬────────┬─────────┬───────────┬───────────┬─────────┬──────┘
     │        │         │           │           │         │
     ▼        ▼         ▼           ▼           ▼         ▼
┌──────────────────── NORMALIZATION LAYERS ───────────────────────┐
│ conversations │ evidence │ action_items │ relationship_signals  │
│ artifact_index │ knowledge_candidates                           │
│ (§7)                                                            │
└────┬────────┬─────────┬───────────┬───────────┬─────────┬──────┘
     │        │         │           │           │         │
     ▼        ▼         ▼           ▼           ▼         ▼
┌──────────────────── SURFACES (read-only views) ─────────────────┐
│ Hall │ CoS Desk │ Inbox │ Commitments │ Portfolio Health │ …    │
│ each surface = SELECT over one or more layers                   │
└─────────────────────────────────────────────────────────────────┘
```

## 5. Ingestor contract

Every source has exactly one ingestor. Every ingestor conforms to this shape.

```typescript
interface Ingestor {
  source_type: SourceType;       // 'gmail' | 'fireflies' | 'calendar' | 'whatsapp' | 'contacts' | 'drive' | 'loops' | 'evidence_derived'
  version: string;               // semver; bumped when output schema changes (triggers reprocess)
  schedule: CronSpec | "webhook";

  ingest(input: IngestInput): Promise<IngestResult>;
}

type IngestInput = {
  since: timestamp;              // only process data after this watermark
  scope?: IngestScope;           // optional filter (project_id, contact_id, etc.)
  mode: "delta" | "backfill";
};

type IngestResult = {
  signals: Signal[];             // see §6
  watermark_to: timestamp;       // new watermark on success
  diagnostics: {
    processed: number;
    skipped: number;
    errors: IngestError[];
    fallback_used?: string;      // if primary read failed, which fallback was used
  };
};
```

### Hard rules for ingestors

1. **Idempotent.** Re-running on the same `since` window produces no duplicate signals. Dedup is enforced by signal `dedup_key`.
2. **Watermarked.** Each ingestor persists its `last_successful_watermark` in a `ingestor_state` table. No wall-clock scans.
3. **Cheap.** An ingestor does not call LLMs unless the raw data requires semantic extraction. Rule-based filtering happens first.
4. **Observable.** Every run writes to `ingestor_runs` with counts, duration, errors. Fallbacks must be logged (hard rule from `CLAUDE.md`).
5. **No direct surface writes.** Ingestors write to layers only. Surfaces read from layers only.
6. **Version-stamped output.** Every signal carries `ingestor_version`. Schema changes bump the version and trigger reprocess of the affected window.

## 6. Signal types

An ingestor emits zero or more of each of these. Signals are the only vocabulary between ingestors and layers.

| Signal | Target layer | Purpose |
|---|---|---|
| `ConversationSignal` | `conversations` | A conversation event happened (email thread update, meeting, WA exchange) |
| `EvidenceSignal` | `evidence` | An atomic fact was extracted (decision, dependency, blocker, requirement, outcome) |
| `ActionSignal` | `action_items` | Something requires human action |
| `RelationshipSignal` | `relationship_signals` | A touch occurred with a known contact |
| `ArtifactSignal` | `artifact_index` | A document/file was observed (new, changed, shared, commented) |
| `KnowledgeCandidateSignal` | `knowledge_candidates` | A reusable insight was detected (gated, reviewed before promotion) |
| `ResolutionSignal` | any layer | A prior signal is resolved/stale (explicit close) |

### Common signal envelope

Every signal carries:

```
{
  signal_type: SignalType
  source_type: SourceType
  source_id: string            // substrate-specific id (thread id, event id, etc.)
  source_url: string           // deep link
  emitted_at: timestamp
  ingestor_version: string
  dedup_key: string            // layer-specific — see §7
  related_ids: {               // structured FKs to other layers, optional
    contact_id?: uuid
    project_id?: uuid
    conversation_id?: uuid
    objective_id?: uuid
  }
  payload: <type-specific>
}
```

### ActionSignal payload (the critical one)

```
{
  intent: Intent                // see §8
  ball_in_court: "jose" | "them" | "team" | "unknown"
  next_action: string           // 1 line, concrete, imperative
  subject: string               // short noun phrase — "Co-op Phase 2 contract"
  counterparty: string | null   // "Chloe @ Co-op"
  deadline: timestamp | null
  last_motion_at: timestamp     // required — when anything happened on source
  consequence: string | null    // what breaks if ignored — optional but encouraged
  priority_factors: {           // audit trail for priority_score
    recency: number             // 0-40
    deadline_pressure: number   // 0-40
    relationship_weight: number // 0-20
    objective_link: number      // 0-20
    [k: string]: number
  }
}
```

The 3 human primitives (`ball_in_court`, `next_action`, consequence/`deadline`) are **required columns**, not inferred at query time. An ingestor that cannot produce them does not emit an ActionSignal.

## 7. Normalization layers

Each layer has: purpose, schema summary, dedup rule, ownership (who writes), consumers (who reads).

### 7.1 `conversations` *(exists — CH Sources / CH Conversations)*

- Purpose: canonical record of "something happened" (email thread, meeting, WA exchange).
- Schema: already defined in Notion DB `CH Sources [OS v2]` + `CH Conversations [OS v2]`.
- Dedup: `source_type + source_id`.
- Writers: Gmail, Fireflies, WhatsApp ingestors.
- Readers: evidence pipeline, action_items ingestor (evidence_derived), Hall sections.

### 7.2 `evidence` *(exists — CH Evidence)*

- Purpose: atomic facts extracted from conversations (decisions, dependencies, blockers, outcomes, requirements, process steps).
- Schema: already in Notion DB `CH Evidence [OS v2]`.
- Dedup: `source_conversation_id + evidence_hash`.
- Writers: `extract-meeting-evidence`, `extract-evidence` skill.
- Readers: `action_items` ingestor (evidence → actions), knowledge pipeline, project-operator.

### 7.3 `action_items` *(new — Supabase)*

- Purpose: every thing that requires human action, normalized across all sources.
- Schema: see §9.
- Dedup: `dedup_key = hash(intent + normalized(counterparty) + normalized(subject))`. Unique partial index where `status = 'open'`.
- Writers: every ingestor that can emit ActionSignal.
- Readers: Inbox surface, Commitments surface, CoS desk, Portfolio Health, Hall Today, Plan Master agent.
- Lifecycle: see §10.

### 7.4 `relationship_signals` *(new — Supabase)*

- Purpose: per-contact warmth, cadence, dormancy. One row per contact.
- Schema:
  ```
  contact_id             uuid PK (FK contacts)
  last_inbound_at        timestamptz
  last_outbound_at       timestamptz
  last_meeting_at        timestamptz
  touches_30d            int
  touches_90d            int
  warmth                 'hot' | 'warm' | 'cool' | 'dormant'
  cadence_expected_days  int           -- from tier config
  next_touch_due_at      timestamptz   -- derived
  dormancy_flag          boolean
  updated_at             timestamptz
  updated_from_source    text          -- last ingestor that wrote
  ```
- Dedup: N/A (one row per contact, upserted).
- Writers: Gmail, Fireflies, Calendar, WhatsApp ingestors.
- Readers: Portfolio Health, Contact Intelligence, action_items priority scoring (relationship_weight factor).
- **Cadence source:** `cadence_expected_days` is derived from two Notion fields on `CH People [OS v2]` — `Relationship Tier` (VIP / Active / Occasional / Dormant) and `Cadence Days Override` (nullable integer). Defaults when override is null: VIP=30, Active=60, Occasional=90, Dormant=180. No separate `contact_tier_config` table — Notion stays the SSoT for contact metadata.

### 7.5 `artifact_index` *(new — Supabase, minimal)*

- Purpose: flat index of documents/files observed across Drive, email attachments, Fireflies transcripts, Data Room.
- Schema:
  ```
  id                  uuid PK
  source_type         text
  source_id           text
  url                 text
  title               text
  mime                text
  owner_email         text
  shared_with         jsonb
  project_id          uuid
  last_modified_at    timestamptz
  content_hash        text
  last_ingested_at    timestamptz
  ```
- Dedup: `source_type + source_id` OR `content_hash`.
- Writers: Drive ingestor, Gmail (attachments), Fireflies (transcripts).
- Readers: Hall Shared Materials, Garage Data Room, action_items ingestor (for "review shared doc" actions).

### 7.6 `knowledge_candidates` *(exists partially — triage-knowledge skill)*

- Purpose: evidence flagged as potentially reusable, pre-promotion gate.
- Writers: `triage-knowledge` skill.
- Readers: `update-knowledge-asset` skill, `knowledge-curator` agent.
- Out of scope for this doc — already has its own pipeline. Listed for completeness.

## 8. Intent taxonomy

Closed set. Extending it requires a schema migration, deliberately.

| Intent | Meaning | Typical ball_in_court |
|---|---|---|
| `reply` | An incoming message/comment/invite requires my response | jose |
| `decide` | A decision is requested from me | jose |
| `approve` | An approval/sign-off is requested from me | jose |
| `deliver` | I committed to producing/sending something | jose |
| `chase` | Someone owes me something that is overdue | jose (chase them) |
| `review` | A document/draft is waiting for my review | jose |
| `prep` | A meeting/call needs preparation | jose |
| `nurture` | A relationship needs a touch (dormant VIP, warm lead gone cold) | jose |
| `close_loop` | A thread is resolved in substance but needs formal close | jose |
| `follow_up` | A thread needs a nudge from my side | jose |

`ball_in_court = them | team` is valid for `chase`, `follow_up` (waiting), but the item only surfaces on Jose's desk when `ball_in_court = jose`. Items with `ball_in_court = them` sit in a Waiting view, not in the main surfaces.

## 9. `action_items` schema (full)

```sql
create table action_items (
  id                       uuid primary key default gen_random_uuid(),

  -- provenance
  source_type              text not null,
  source_id                text not null,
  source_url               text,
  ingested_at              timestamptz not null default now(),
  ingestor_version         text not null,

  -- classification
  intent                   text not null,  -- enum §8
  ball_in_court            text not null,  -- 'jose' | 'them' | 'team' | 'unknown'
  owner_person_id          uuid references contacts(id),  -- specific owner when ball_in_court='team'
  founder_owned            boolean not null default false, -- strategic items, bonus in §9.1
  next_action              text,           -- imperative 1-liner
  subject                  text not null,
  counterparty             text,
  counterparty_contact_id  uuid references contacts(id),

  -- linkage
  project_id               uuid,
  strategic_objective_id   uuid,
  conversation_id          uuid,           -- FK conversations

  -- timing
  deadline                 timestamptz,
  last_motion_at           timestamptz not null,
  first_surfaced_at        timestamptz not null default now(),

  -- impact
  consequence              text,
  priority_score           int not null,
  priority_factors         jsonb not null, -- audit trail for score

  -- lifecycle
  status                   text not null default 'open',
                           -- 'open' | 'waiting_on_them' | 'resolved' | 'dismissed' | 'stale' | 'merged'
  resolved_at              timestamptz,
  resolved_reason          text,
                           -- 'reply_sent' | 'loop_closed' | 'deadline_passed'
                           -- | 'manual_dismiss' | 'manual_done' | 'deduped' | 'stale_decay'

  -- dedup
  dedup_key                text not null,
  merged_into              uuid references action_items(id)
);

create unique index action_items_open_dedup
  on action_items (dedup_key)
  where status = 'open';

create index action_items_status_ball on action_items (status, ball_in_court);
create index action_items_surface_query on action_items (ball_in_court, status, priority_score desc);
create index action_items_last_motion on action_items (last_motion_at desc);
create index action_items_owner_team on action_items (ball_in_court, owner_person_id) where ball_in_court = 'team';
```

## 9.1 Priority score formula

The score is additive across five factors, capped at 100. Every factor value is persisted in `priority_factors` jsonb for auditability — any surface can show "why this item is here" by reading the factor breakdown.

```
priority_score = min(100,
    intent_base              // 10–40
  + deadline_pressure        // 0–30
  + recency                  // 0–20
  + relationship_weight      // 0–20
  + objective_link           // 0–10
)
```

**intent_base** (from §8 taxonomy):

| Intent | Base |
|---|---|
| `decide`, `approve` | 40 |
| `deliver` | 35 |
| `reply`, `chase` | 30 |
| `review` | 25 |
| `follow_up`, `prep` | 20 |
| `close_loop` | 15 |
| `nurture` | 10 |

**deadline_pressure** (relative to `deadline`): overdue=30 · <24h=25 · <3d=20 · <7d=15 · <14d=10 · none=0

**recency** (relative to `last_motion_at`): <24h=20 · <3d=15 · <7d=10 · <14d=5 · ≥14d=0. Rationale: a hot thread surfaces higher; old items decay out via stale mechanism (§10), not via priority.

**relationship_weight** (from `relationship_signals.warmth` + `Relationship Tier`): VIP=20 · Active=15 · Occasional=10 · Dormant=5 · Unknown=5

**objective_link** (from `strategic_objectives.tier`): HIGH=10 · MID=7 · LOW=4 · null=0

**founder_owned bonus:** +20 added on top when `founder_owned = true` (preserves existing [sync-loops.ts:80–98](src/app/api/sync-loops/route.ts:80) pattern). Still capped at 100.

**Urgency thresholds (for `mapUrgency()`):**

| Band | Score |
|---|---|
| critical | ≥ 70 |
| high | 40–69 |
| normal | < 40 |

These thresholds define which items surface on the CoS Desk (critical + high) vs. which stay in deep queues. Calibrate after Phase 2 with real data.

## 10. Lifecycle and resolution

### Open → Resolved

An action is resolved by a `ResolutionSignal`, never by a surface mutating the row.

Resolution sources:

| Source | Resolution reason |
|---|---|
| User click in surface ("Done") | `manual_done` |
| User click in surface ("Dismiss") | `manual_dismiss` |
| Gmail ingestor sees a reply from Jose on the thread | `reply_sent` |
| Fireflies ingestor sees the commitment fulfilled in a later meeting | `loop_closed` |
| Scheduled job sees `deadline < now() AND status=open` past grace period | `deadline_passed` |
| Stale decay job: `last_motion_at < now() - 21 days AND status=open AND no deadline` | `stale_decay` |

### Dedup and merge

When an ingestor emits an ActionSignal whose `dedup_key` matches an existing `open` row:

- If the existing row is newer (`last_motion_at >= incoming`), drop the incoming signal.
- If the incoming is newer, update `last_motion_at`, `next_action`, `priority_factors`, `priority_score`. Keep the original `id`.
- Cross-source matches (same intent+counterparty+subject from Gmail and Fireflies) collapse into one row. The row tracks `source_type` of the latest update; a `merge_log` jsonb array records historical sources.

### Stale and reopen

- Stale: `last_motion_at` > 21 days, no deadline, status=open → auto-stale.
- Reopen: a resolved/dismissed row is reopened only when ALL four conditions hold (inherits the gate from [docs/loop-lifecycle.md](docs/loop-lifecycle.md) §Reopen gate, plus a time cap):
  1. Row was auto-resolved, OR (user-dismissed AND incoming `intent` differs from prior)
  2. Fingerprint materially different (Jaccard < 0.55, via [`normalizeFingerprint`](src/lib/loops.ts:217))
  3. Not `founder_interest='dropped'`
  4. **`now() - resolved_at < 90 days`** — after 90 days, always create a NEW item instead of reopening. Rationale: old resolved rows carry stale metadata (consequence, deadline, priority_factors); fresh context is more useful than resurrecting an outdated row.

Reopened rows keep their `id` and set `reopened_from` with the prior resolution snapshot.

### Dedup key normalization

`dedup_key = sha256(intent + "|" + normalize(counterparty) + "|" + normalizeSubject(subject))`.

- `normalize(counterparty)`: lowercase + NFD-strip diacritics + collapse whitespace (reuse pattern from [case-codes.ts:81](src/lib/case-codes.ts:81) and [person-resolver.ts:63](src/lib/person-resolver.ts:63)).
- `normalizeSubject(raw)`: new helper in `src/lib/normalize.ts`. Strips reply/forward prefixes (`Re:`, `Fwd:`, `RE:`, `FW:`, `[External]`, etc.), strips URLs, NFD-diacritics, lowercase, collapses whitespace + punctuation, truncates to 100 chars. **Does NOT remove stopwords** — unlike [`normalizeFingerprint`](src/lib/loops.ts:217), which is for Jaccard similarity. Subject dedup needs to preserve "the contract" vs. "a contract" distinctions.

## 11. Source → layer mapping

For each source: what it emits, into which layer, with examples.

### Gmail

| Signal | Layer | Emits when |
|---|---|---|
| ConversationSignal | conversations | Every thread observed |
| EvidenceSignal | evidence | Claude extracts a decision/commitment from the thread |
| ActionSignal (intent=reply) | action_items | Last message not from Jose + Jose in To + substantive question |
| ActionSignal (intent=chase) | action_items | Jose sent last, >7d ago, counterparty is active, deadline implied |
| RelationshipSignal | relationship_signals | Any touch (inbound or outbound) with a known contact |
| ArtifactSignal | artifact_index | Attachment observed |

Replaces: `inbox-triage` route. After cut-over, `inbox-triage` is deleted; the Inbox surface becomes a query over `action_items WHERE source_type='gmail' AND ball_in_court='jose' AND status='open'`.

### Fireflies / Meetings

| Signal | Layer | Emits when |
|---|---|---|
| ConversationSignal | conversations | Every meeting record |
| EvidenceSignal | evidence | Standard evidence extraction |
| ActionSignal (intent=deliver) | action_items | Explicit commitment by Jose in transcript |
| ActionSignal (intent=chase) | action_items | Commitment by counterparty to Jose |
| ActionSignal (intent=follow_up) | action_items | Decision pending from the meeting |
| RelationshipSignal | relationship_signals | Attendance = touch |
| ArtifactSignal | artifact_index | Transcript URL itself |

Replaces: the HallCommitmentLedger substring heuristic. Commitments surface becomes a query over `action_items WHERE intent IN ('deliver','chase','follow_up') AND ball_in_court='jose' AND status='open'`.

### Calendar

| Signal | Layer | Emits when |
|---|---|---|
| ConversationSignal | conversations | Completed meeting (optional, may defer to Fireflies) |
| ActionSignal (intent=prep) | action_items | Meeting <48h, no agenda attached, not recurring |
| ActionSignal (intent=approve/reply) | action_items | Pending invite requiring response |
| ActionSignal (intent=follow_up) | action_items | Meeting happened, no Fireflies transcript after 24h |
| RelationshipSignal | relationship_signals | Meeting attendance = touch |

New ingestor. No prior equivalent.

### WhatsApp

WhatsApp is NOT an API integration. The existing Chrome extension clipper ([chrome-extension/clipper/](chrome-extension/clipper/) + [/api/clipper](src/app/api/clipper/route.ts)) already captures conversations, resolves senders against CH People (fuzzy match with confidence + orphan queue), writes to `CH Sources [OS v2]` + Supabase `sources` + `conversation_messages`. **The clipper is the ingestion path; the "WhatsApp ingestor" is a thin post-processor over `conversation_messages`.**

| Signal | Layer | Emits when |
|---|---|---|
| ConversationSignal | conversations | Already emitted by clipper on POST — no-op here |
| ActionSignal (intent=reply) | action_items | Post-processor: last message is incoming AND sender resolved with confidence > threshold AND content is substantive (not emoji-only, not "ok/thanks/gracias") |
| ActionSignal (intent=deliver) | action_items | Post-processor: outgoing message contains commitment verb ("I'll send", "mañana te mando", etc.) |
| RelationshipSignal | relationship_signals | Every clipped exchange with a resolved contact |

v1 scope: DMs only. Group chats land in `sources` with `is_group=true` flag (new) and emit ConversationSignal only — no ActionSignals from groups.

No new cron. The post-processor runs on `conversation_messages` INSERT trigger or on the same request cycle as `/api/clipper`.

### Contacts

| Signal | Layer | Emits when |
|---|---|---|
| RelationshipSignal | relationship_signals | CRUD event on `CH People [OS v2]` |
| ActionSignal (intent=nurture) | action_items | `now() - last_contact_date > cadence_expected_days` for the contact's tier |
| ActionSignal (intent=review) | action_items | New contact added without `Relationship Tier` or `Relationship Type` set |

**Required field additions to `CH People [OS v2]`:**
- `Relationship Tier` (select: VIP / Active / Occasional / Dormant)
- `Cadence Days Override` (number, nullable)

Contacts is both a writer (events) and a reader (all ActionSignals link to contacts). Source of truth for `contact_id`, tier, NDA status, relationship_type. See §7.4 for cadence defaults.

### Drive

**Watch scope: project-scoped with a global exception.**

- Default: each active `CH Projects [OS v2]` has a `Drive Folder ID` field (new, to be added). The ingestor watches only those folders.
- Excluded: generic "shared with me" (too noisy; firehose).
- Global exception: any Drive comment `@mention`ing Jose, regardless of folder, emits an ActionSignal. This is the one high-signal case we cannot afford to miss.

| Signal | Layer | Emits when |
|---|---|---|
| ArtifactSignal | artifact_index | New or changed doc in a watched project folder |
| ActionSignal (intent=review) | action_items | Doc shared with Jose in a watched folder, not yet opened |
| ActionSignal (intent=reply) | action_items | Comment `@mention`ing Jose (any folder), unresolved |

**Required field addition to `CH Projects [OS v2]`:** `Drive Folder ID` (text, nullable). Projects without it are reported in `diagnostics.skipped_unconfigured_projects` — not an error, but visible.

Respects Drive permissions; only indexes what the authenticated Drive user can see.

### Loops (existing — to be demoted to ingestor)

The Supabase `loops` table currently acts as a parallel action store. Under this architecture:

- `loops` becomes an **ingestor** (`source_type = 'loops'`) that emits ActionSignals into `action_items`.
- Loop sync continues writing to the `loops` table — it is still the engine for detecting threads — but nothing queries it except the loops ingestor.
- After migration, the CoS desk queries `action_items`, not `loops`.
- `loop_lifecycle.md` reopen semantics are preserved and inherited by `action_items` (§10).

### Evidence-derived (existing pipeline)

The current path `evidence → chief_of_staff_tasks` is redirected to `evidence → action_items` via a dedicated ingestor (`source_type = 'evidence_derived'`). This handles evidence records that do not have a corresponding conversation ingestor (e.g., manual evidence entries).

## 12. Surface contract

Surfaces are read-only views. They may:

- `SELECT` from any normalization layer
- Emit `ResolutionSignal`s via explicit API routes (e.g., `POST /api/action-items/:id/resolve`)
- Group, sort, paginate — but not filter by raw substrate attributes
- Join `action_items` with `contacts`, `projects`, `strategic_objectives` for display

Surfaces may NOT:

- Classify (no substring owner detection, no Haiku in render path)
- Read raw substrate directly (no Gmail API call in a Hall component)
- Mutate layer state except through ResolutionSignal routes
- Fall back to a different substrate silently — fallbacks must be observable (hard rule in `CLAUDE.md`)

### Surface → layer mapping (target state)

| Surface | Primary layer(s) | Query shape |
|---|---|---|
| Hall Inbox needs attention | `action_items` | `source_type='gmail' AND ball_in_court='jose' AND status='open' ORDER BY priority_score DESC LIMIT 10` |
| Hall Commitments | `action_items` | `intent IN ('deliver','chase','follow_up') AND ball_in_court='jose' AND status='open' ORDER BY last_motion_at DESC` |
| CoS Desk | `action_items` | `(ball_in_court='jose' OR founder_owned=true OR (ball_in_court='team' AND owner_person_id IS NULL)) AND status='open' AND priority_score >= 40 ORDER BY priority_score DESC` |
| CoS Parked | `action_items` | `ball_in_court='them' AND status='waiting_on_them'` |
| Team Desk *(future)* | `action_items` | `ball_in_court='team' AND owner_person_id IS NOT NULL AND status='open'` |
| Portfolio Health — warmth | `relationship_signals` + `contacts` | `warmth IN ('cool','dormant') AND tier='VIP'` |
| Hall Shared Materials | `artifact_index` | `project_id = :project AND shared_with @> :jose_email` |

The CoS Desk query is the one that fixes the current noise problem. It shows Jose:
- His own actions (`ball_in_court='jose'`)
- Strategic founder-owned items (preserves existing pattern)
- Team actions that are **unassigned** — he needs to decide who takes them or take them himself

It hides:
- Team actions already assigned to a specific CH team member (those go to the future Team Desk)
- Actions waiting on external parties (go to CoS Parked)
- Low-priority open actions (below the 40 threshold — reachable from a "show all" view, not on the main desk)

## 13. Observability

Mandatory per ingestor run:

- Row in `ingestor_runs` with `source_type`, `started_at`, `finished_at`, `processed`, `skipped`, `errors`, `fallback_used`, `signals_emitted_by_type`.
- Log line in Vercel runtime: `[ingestor:<source_type>] v<version> delta since=<ts> emitted=<counts>`.
- If a fallback is used, it MUST be visible: surface it in the surface that consumes the degraded data (see `CLAUDE.md` fallback observability rule).

## 14. Security / auth

- All ingestors run as cron jobs. They authenticate via `CRON_SECRET` (existing pattern).
- Surface → resolution API routes authenticate via `adminGuardApi()` (existing pattern).
- No ingestor writes to Notion without respecting the existing Notion write contracts in `docs/NOTION_FIELD_CONTRACTS.md`.

## 15. Migration / order of attack

Phases below are the implementation order. Each phase ends with a merged, deployed, production-verified change before the next starts.

**Phase 0 — contract (this doc).** Reviewed and approved by José.

**Phase 1 — foundation.** All schema pre-conditions from §16. In order:
1. Supabase tables: `action_items`, `relationship_signals`, `ingestor_state`, `ingestor_runs` (canonical `commonhouse` project, not `cote_OS`).
2. `src/lib/normalize.ts` with `normalizeSubject()` helper.
3. Notion field additions: `Relationship Tier` + `Cadence Days Override` on `CH People [OS v2]`; `Drive Folder ID` on `CH Projects [OS v2]`; `is_group` on `CH Sources [OS v2]`.
4. Update [docs/NOTION_FIELD_CONTRACTS.md](docs/NOTION_FIELD_CONTRACTS.md) with the new fields.

Empty tables, no ingestors yet. End-of-phase check: migrations applied in production Supabase, Notion fields visible in each DB.

**Phase 2 — Gmail ingestor (reference implementation).** Implement the first full ingestor. Emits ConversationSignal (already exists — verify write path), ActionSignal, RelationshipSignal. Validates the contract end-to-end.

**Phase 3 — Inbox surface migration.** Rewrite Inbox surface as a query over `action_items`. Delete `/api/inbox-triage` classification path. Verified in production via `portal.wearecommonhouse.com` per `CLAUDE.md` runtime verification rule.

**Phase 4 — Fireflies ingestor.** Reuses existing conversations/evidence writes, adds ActionSignal + RelationshipSignal emission.

**Phase 5 — Commitments + CoS surface migration.** Both become views. Cross-source dedup kicks in here (same commitment from Gmail + Fireflies = one row).

**Phase 6 — Loops demotion.** Loops becomes an ingestor. CoS Desk queries `action_items`, not `loops`. `loops` table stays for detection, but no surface reads it directly.

**Phase 7 — Calendar ingestor.** New ingestor. Adds `prep`, `follow_up` actions + cadence signals.

**Phase 8 — WhatsApp ingestor.** DM-only, known-contacts-only in v1.

**Phase 9 — Drive ingestor + artifact_index.** Enables Hall Shared Materials to query `artifact_index` instead of per-route Drive fetches.

**Phase 10 — Retire legacy classifiers.** Delete `HallCommitmentLedger` substring logic, `inbox-triage` Haiku path, cos-loops safety-net. Keep in git history only.

After Phase 10: adding a new source = implementing the Ingestor contract. No surface changes required.

## 16. Decisions (resolved 2026-04-24)

All 7 prior open questions resolved. Summary for future reviewers:

| # | Question | Decision | Location in doc |
|---|---|---|---|
| 1 | Priority score formula | Additive 5-factor (intent_base + deadline + recency + relationship + objective), cap 100, +20 founder_owned bonus. Thresholds: critical≥70, high≥40, normal<40. | §9.1 |
| 2 | Cadence config for nurture | Two new Notion fields on `CH People [OS v2]` (`Relationship Tier`, `Cadence Days Override`) + code defaults VIP=30/Active=60/Occasional=90/Dormant=180. No separate config table — Notion stays SSoT for contact metadata. | §7.4, §11 Contacts |
| 3 | WhatsApp data source | Chrome extension clipper is the ingestion path. "WhatsApp ingestor" becomes a thin post-processor over `conversation_messages`. DMs only in v1; groups emit ConversationSignal only. | §11 WhatsApp |
| 4 | Drive watch scope | Project-scoped via `Drive Folder ID` field on `CH Projects [OS v2]`. Global exception: `@mention`s on Jose in any comment. | §11 Drive |
| 5 | Subject normalization | New `normalizeSubject()` helper in `src/lib/normalize.ts`. Lighter than [`normalizeFingerprint`](src/lib/loops.ts:217) — strips prefixes/URLs/diacritics but preserves stopwords for exact dedup. | §10 Dedup key normalization |
| 6 | Reopen policy | Inherit 3-condition gate from loop-lifecycle + 90-day cap: after 90 days since `resolved_at`, always create new item instead of reopening. | §10 Stale and reopen |
| 7 | Multi-actor / team actions | Add `owner_person_id` column. CoS Desk includes `ball_in_court='jose' OR founder_owned=true OR (ball_in_court='team' AND owner_person_id IS NULL)`. Assigned team items go to future Team Desk, not Jose's. | §9 schema, §12 surface mapping |

### Schema changes requiring migrations (pre-Phase 2)

**Supabase:**
- `action_items` — create table per §9, with `owner_person_id` and `founder_owned` columns.
- `relationship_signals` — create table per §7.4.
- `ingestor_state`, `ingestor_runs` — create tables for watermarks and observability.

**Notion — `CH People [OS v2]`:**
- Add `Relationship Tier` (select: VIP / Active / Occasional / Dormant)
- Add `Cadence Days Override` (number, nullable)

**Notion — `CH Projects [OS v2]`:**
- Add `Drive Folder ID` (text, nullable)

**Notion — `CH Sources [OS v2]`:**
- Add `is_group` (checkbox) for WhatsApp group-chat flag

These are the concrete pre-conditions that must land before Phase 2 (Gmail ingestor) can implement the contract correctly.

## 17. Cross-references

- `docs/ARCHITECTURE.md` — three-layer portal model (Rooms / Control Room / OS backbone). This normalization layer sits in Layer 3.
- `docs/DATA_AND_INTEGRATIONS.md` — existing Notion + Supabase layout. This doc extends it.
- `docs/loop-lifecycle.md` — reopen gate semantics that `action_items` inherits.
- `docs/NOTION_FIELD_CONTRACTS.md` — canonical field names for Notion-backed layers.
- `docs/ROUTES_AND_SURFACES.md` — surface inventory. Must be updated when surfaces migrate to layer queries.
- `CLAUDE.md` / `AGENTS.md` — hard rules on auth, client refresh, production verification, fallback observability. All apply.
