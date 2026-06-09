/**
 * pipeline-state.ts — Derivation + memory for the Hall "Pipeline State" block.
 *
 * Surfaces one row per commercial relationship (active client or open prospect)
 * that needs attention TODAY. Rows that don't pass the attention filter don't
 * surface — the block is action-oriented, not a directory.
 *
 * Memory model (see migrations pipeline_state_*):
 *   hall_attention_log → "which rows surfaced and why" + closure trail
 *   hall_snoozes       → suppression
 *   org_recent_topics  → materialized conversation topics per org (refreshed daily)
 *
 * Reasons (precedence top→bottom):
 *   pre_meeting     — meeting with this entity in next 48h
 *   ball_with_jose  — open action_item or decision_item owned by Jose, vencido
 *   ball_with_them  — chase action_item, esperando respuesta de la counterparty
 *   drift           — sin contacto >14d
 *
 * Resolution detection (auto, conservative):
 *   item_closed       — underlying action_item or decision_item flipped to closed
 *   inbound_reply     — fresh inbound from a contact of the org since surfaced_at
 *   outbound_sent     — outbound in same thread as the action_item since surfaced_at
 *   meeting_completed — Fireflies transcript landed for that org since surfaced_at
 */

import { getSupabaseServerClient } from "@/lib/supabase-server";

// ───────────────────────── Types ─────────────────────────

export type EntityKind = "client" | "prospect";
export type Reason = "ball_with_jose" | "ball_with_them" | "drift" | "pre_meeting" | "healthy";
export type Trend = "heating" | "steady" | "cooling" | "cold";
export type Resolution =
  | "manual_done"
  | "outbound_sent"
  | "inbound_reply"
  | "meeting_completed"
  | "item_closed";

export type CTA = {
  label: string;
  action: "draft_followup" | "draft_checkin" | "open_prep" | "open_review" | "draft_proposal";
  payload?: Record<string, unknown>;
};

export type PipelineRow = {
  entityType: "organization" | "opportunity";
  entityId: string;
  name: string;
  kind: EntityKind;
  oppMeta?: {
    priority: string | null;
    value: number | null;
    status: string;
    valueLabel: string;
  };
  reason: Reason;
  reasonDetail: string;
  topics: string[];
  ballSummary: string | null;
  trend: Trend;
  nextMeetingAt: string | null;
  lastSignalAt: string | null;
  newSignalChip: boolean;
  surfacedAt: string;
  daysSinceSurfaced: number;
  ctaPrimary: CTA;
  ctaResolveLabel: string;
  url: string | null;
};

export type ResolvedRow = {
  logId: string;
  name: string;
  entityType: "organization" | "opportunity";
  entityId: string;
  reason: Reason;
  resolution: Resolution;
  resolvedAt: string;
};

export type PipelineStateResult = {
  rows: PipelineRow[];
  resolvedToday: ResolvedRow[];
  snoozedCount: number;
};

// ───────────────────────── Constants ─────────────────────────

const MS_DAY = 86_400_000;
const BALL_WITH_JOSE_MIN_DAYS = 3;
const BALL_WITH_THEM_MIN_DAYS = 7;
const DRIFT_MIN_DAYS = 14;
const PRE_MEETING_HOURS = 48;
const NEW_SIGNAL_WINDOW_HOURS = 72;
const MAX_TOPICS = 3;

// ───────────────────────── Loaders ─────────────────────────

type OrgRow = {
  notion_id: string;
  name: string;
  engagement_type: string | null;
  engagement_status: string | null;
  engagement_value: number | null;
  org_domains: string | null;
};

type OppRow = {
  id: string;
  notion_id: string | null;
  title: string;
  org_name: string | null;
  org_notion_id: string | null;
  status: string;
  priority: string | null;
  value_estimate: number | null;
  next_meeting_at: string | null;
  last_signal_at: string | null;
  updated_at: string;
  review_url: string | null;
  follow_up_status: string | null;
};

type ActionItemRow = {
  id: string;
  intent: string;
  ball_in_court: string;
  subject: string;
  next_action: string | null;
  last_motion_at: string;
  deadline: string | null;
  source_type: string;
  source_id: string;
  source_url: string | null;
  org_notion_id: string;
};

type DecisionItemRow = {
  id: string;
  title: string;
  status: string;
  priority: string | null;
  org_notion_id: string;
  due_date: string | null;
};

type SnoozeRow = { entity_type: string; entity_id: string; until_at: string; snoozed_at: string | null };

type LogRow = {
  id: string;
  entity_type: string;
  entity_id: string;
  reason: string;
  surfaced_at: string;
  resolved_at: string | null;
  resolution: string | null;
};

type TopicsRow = { org_notion_id: string; topics: Array<{ label: string }> };

type PersonActivityRow = {
  org_notion_id: string;
  last_email_at: string | null;
  last_transcript_at: string | null;
  last_email_subject: string | null;
};

// ───────────────────────── Public API ─────────────────────────

export async function getPipelineState(): Promise<PipelineStateResult> {
  const sb = getSupabaseServerClient();

  // 1. Candidates: active clients + open prospects
  const [clientsRes, oppsRes] = await Promise.all([
    sb.from("organizations")
      .select("notion_id, name, engagement_type, engagement_status, engagement_value, org_domains")
      .eq("engagement_type", "Client")
      .eq("engagement_status", "Active")
      .not("notion_id", "is", null),
    sb.from("opportunities")
      .select(
        "id, notion_id, title, org_name, org_notion_id, status, priority, value_estimate, " +
        "next_meeting_at, last_signal_at, updated_at, review_url, follow_up_status"
      )
      .eq("is_active", true)
      .eq("is_archived", false)
      .in("status", ["New", "Qualifying", "Active"])
      .neq("opportunity_type", "Grant"),
  ]);

  const clients = (clientsRes.data ?? []) as unknown as OrgRow[];
  const opps = (oppsRes.data ?? []) as unknown as OppRow[];

  const orgIds = new Set<string>();
  for (const c of clients) if (c.notion_id) orgIds.add(c.notion_id);
  for (const o of opps) if (o.org_notion_id) orgIds.add(o.org_notion_id);
  const orgIdsArr = Array.from(orgIds);
  void opps.map(o => o.notion_id).filter((x): x is string => !!x);

  // 2. Signals: decisions, snoozes, log, topics, person activity (action_items
  //    fetched below because PostgREST cannot expand counterparty_contact_id
  //    without an FK relationship in the schema).
  const [diRes, snoozeRes, logRes, topicsRes, peopleRes] = await Promise.all([
    orgIdsArr.length === 0
      ? Promise.resolve({ data: [] })
      : sb.from("decision_items")
          .select("id, title, status, priority, org_notion_id, due_date")
          .in("org_notion_id", orgIdsArr)
          .in("status", ["Open", "Pending", "Pending Review", "In Progress"]),
    sb.from("hall_snoozes").select("entity_type, entity_id, until_at, snoozed_at").gt("until_at", new Date().toISOString()),
    sb.from("hall_attention_log").select("id, entity_type, entity_id, reason, surfaced_at, resolved_at, resolution"),
    orgIdsArr.length === 0
      ? Promise.resolve({ data: [] })
      : sb.from("org_recent_topics").select("org_notion_id, topics").in("org_notion_id", orgIdsArr),
    orgIdsArr.length === 0
      ? Promise.resolve({ data: [] })
      : sb.from("people")
          .select("org_notion_id, last_email_at, last_transcript_at, last_email_subject")
          .in("org_notion_id", orgIdsArr)
          .not("org_notion_id", "is", null),
  ]);

  // Action items: join via people. Fetch in two steps because PostgREST nested
  // join through counterparty_contact_id requires an FK relationship the
  // schema doesn't expose — do it manually.
  let actionItems: ActionItemRow[] = [];
  if (orgIdsArr.length > 0) {
    const { data: peopleForAI } = await sb
      .from("people")
      .select("id, org_notion_id")
      .in("org_notion_id", orgIdsArr);
    const peopleIds = (peopleForAI ?? []).map(p => p.id);
    const orgByPersonId = new Map<string, string>();
    for (const p of (peopleForAI ?? []) as { id: string; org_notion_id: string }[]) {
      orgByPersonId.set(p.id, p.org_notion_id);
    }
    if (peopleIds.length > 0) {
      const { data: ai } = await sb
        .from("action_items")
        .select(
          "id, intent, ball_in_court, subject, next_action, last_motion_at, deadline, " +
          "source_type, source_id, source_url, counterparty_contact_id"
        )
        .eq("status", "open")
        .in("counterparty_contact_id", peopleIds);
      actionItems = ((ai ?? []) as unknown as Array<{
        id: string; intent: string; ball_in_court: string; subject: string;
        next_action: string | null; last_motion_at: string; deadline: string | null;
        source_type: string; source_id: string; source_url: string | null;
        counterparty_contact_id: string;
      }>).map(r => ({
        id: r.id, intent: r.intent, ball_in_court: r.ball_in_court, subject: r.subject,
        next_action: r.next_action, last_motion_at: r.last_motion_at, deadline: r.deadline,
        source_type: r.source_type, source_id: r.source_id, source_url: r.source_url,
        org_notion_id: orgByPersonId.get(r.counterparty_contact_id) ?? "",
      })).filter(r => r.org_notion_id);
    }
  }

  const decisions = (diRes.data ?? []) as DecisionItemRow[];
  const snoozes = (snoozeRes.data ?? []) as SnoozeRow[];
  const logs = (logRes.data ?? []) as LogRow[];
  const topicsRows = (topicsRes.data ?? []) as TopicsRow[];
  const peopleActivity = (peopleRes.data ?? []) as PersonActivityRow[];

  // 3. Index lookups
  const aiByOrg = groupBy(actionItems, r => r.org_notion_id);
  const decByOrg = groupBy(decisions, r => r.org_notion_id);
  const snoozeKey = (t: string, id: string) => `${t}:${id}`;
  // L-011: dismiss = forever; única resurrección legítima = nueva señal posterior.
  // Map keeps `snoozed_at` so the reader can auto-lift the snooze when an
  // inbound email / transcript / signal lands AFTER the snooze. Without
  // this, a dismiss-forever would bury a re-engaged opportunity.
  const snoozedAtByKey = new Map<string, string | null>();
  for (const s of snoozes) snoozedAtByKey.set(snoozeKey(s.entity_type, s.entity_id), s.snoozed_at);
  const openLogByKey = new Map<string, LogRow>();
  const closedLogByKey = new Map<string, LogRow>();
  for (const l of logs) {
    const k = `${l.entity_type}:${l.entity_id}:${l.reason}`;
    if (l.resolved_at === null) openLogByKey.set(k, l);
    else closedLogByKey.set(k, l);
  }
  const topicsByOrg = new Map<string, string[]>();
  for (const t of topicsRows) {
    const labels = Array.isArray(t.topics)
      ? t.topics.slice(0, MAX_TOPICS).map(x => x?.label).filter((s): s is string => !!s)
      : [];
    if (labels.length > 0) topicsByOrg.set(t.org_notion_id, labels);
  }
  const peopleActByOrg = groupBy(peopleActivity, r => r.org_notion_id);

  // 4. Build candidate set as a uniform shape
  type Candidate = {
    entityType: "organization" | "opportunity";
    entityId: string;
    name: string;
    kind: EntityKind;
    orgNotionId: string | null;
    oppRow?: OppRow;
    orgRow?: OrgRow;
  };
  const candidates: Candidate[] = [];
  for (const c of clients) {
    candidates.push({
      entityType: "organization",
      entityId: c.notion_id,
      name: c.name,
      kind: "client",
      orgNotionId: c.notion_id,
      orgRow: c,
    });
  }
  for (const o of opps) {
    if (!o.notion_id) continue;
    candidates.push({
      entityType: "opportunity",
      entityId: o.notion_id,
      name: o.org_name ? `${o.org_name} — ${o.title}` : o.title,
      kind: "prospect",
      orgNotionId: o.org_notion_id,
      oppRow: o,
    });
  }

  // 5. For each candidate compute reason + filter
  const now = Date.now();
  type Surfaced = Candidate & {
    reason: Reason;
    reasonDetail: string;
    ballPayload: BallPayload;
    nextMeetingAt: string | null;
    lastSignalAt: string | null;
  };
  const surfaced: Surfaced[] = [];

  for (const cand of candidates) {
    const ais = (cand.orgNotionId ? aiByOrg.get(cand.orgNotionId) : undefined) ?? [];
    const dis = (cand.orgNotionId ? decByOrg.get(cand.orgNotionId) : undefined) ?? [];
    const peopleAct = (cand.orgNotionId ? peopleActByOrg.get(cand.orgNotionId) : undefined) ?? [];
    const lastInbound = maxIso(peopleAct.flatMap(p => [p.last_email_at, p.last_transcript_at]));
    const lastSignal = cand.oppRow?.last_signal_at ?? lastInbound;

    // L-011 auto-lift: a snoozed entity becomes visible again ONLY when a
    // fresh signal arrives after the snooze (inbound email / transcript /
    // opp signal). Without a newer signal the snooze stands, including
    // the dismiss-forever sentinel (until_at = 9999-12-31). This is what
    // lets "Acknowledge — not pursuing" be truly permanent without
    // burying an opportunity that genuinely re-engages.
    const snoozedAt = snoozedAtByKey.get(snoozeKey(cand.entityType, cand.entityId));
    if (snoozedAt !== undefined) {
      const reactivated = !!(lastSignal && new Date(lastSignal) > new Date(snoozedAt ?? 0));
      if (!reactivated) continue;
    }

    const ballJose = computeBallWithJose(ais, dis, now);
    const ballThem = computeBallWithThem(ais, now);
    const nextMeetingAt = cand.oppRow?.next_meeting_at ?? null;
    const minutesToMeeting = nextMeetingAt
      ? (new Date(nextMeetingAt).getTime() - now) / 60_000
      : null;
    // null = no recorded contact ever (no email/transcript timestamp on any
    // linked person). Kept distinct from a real day-count so the sentinel
    // never leaks to the UI as "hace 9999d".
    const driftDays = lastInbound
      ? Math.floor((now - new Date(lastInbound).getTime()) / MS_DAY)
      : null;
    // For precedence comparisons, treat "never contacted" as maximally stale.
    const driftDaysForRank = driftDays ?? Number.MAX_SAFE_INTEGER;

    // Precedence
    let reason: Reason | null = null;
    let reasonDetail = "";
    const ballPayload: BallPayload = { jose: ballJose, them: ballThem };

    if (
      minutesToMeeting !== null &&
      minutesToMeeting > 0 &&
      minutesToMeeting < PRE_MEETING_HOURS * 60
    ) {
      reason = "pre_meeting";
      const hours = Math.round(minutesToMeeting / 60);
      reasonDetail = hours < 24
        ? `Reunión en ${hours}h`
        : `Reunión ${new Date(nextMeetingAt!).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })}`;
    } else if (ballJose.maxAgeDays >= BALL_WITH_JOSE_MIN_DAYS && ballJose.items.length > 0) {
      reason = "ball_with_jose";
      reasonDetail = ballJose.summary;
    } else if (ballThem.maxAgeDays >= BALL_WITH_THEM_MIN_DAYS && ballThem.items.length > 0) {
      reason = "ball_with_them";
      reasonDetail = ballThem.summary;
    } else if (driftDaysForRank >= DRIFT_MIN_DAYS) {
      reason = "drift";
      reasonDetail =
        peopleAct.length === 0
          ? "Sin contactos asociados — necesita responsable"
          : driftDays === null
            // People are linked but none has any recorded email/meeting.
            ? "Contactos sin actividad registrada"
            : `Sin contacto hace ${driftDays}d`;
    }

    // Prospects with follow_up_status='Needed' get bumped to ball_with_jose even
    // if no action_item exists — the operator explicitly marked it.
    if (!reason && cand.oppRow?.follow_up_status === "Needed") {
      reason = "ball_with_jose";
      reasonDetail = `Follow-up Needed (marcado)`;
    }

    // Roster pass: clients are ALWAYS shown (even if healthy), so the operator
    // sees the full active book at a glance. Prospects are also shown when
    // they have any recorded contact activity — gives visibility into the
    // pipeline without forcing a fake "needs action" CTA. Truly silent
    // prospects with zero contact ever still surface via the drift branch
    // above (peopleAct empty → "Sin contactos asociados").
    if (!reason) {
      const hasContactActivity = peopleAct.length > 0 && !!lastInbound;
      if (cand.kind === "client" || hasContactActivity) {
        reason = "healthy";
        reasonDetail = driftDays !== null
          ? `Último contacto hace ${driftDays}d`
          : "Sin actividad registrada";
      } else {
        continue;
      }
    }

    surfaced.push({
      ...cand,
      reason,
      reasonDetail,
      ballPayload,
      nextMeetingAt,
      lastSignalAt: lastSignal,
    });
  }

  // 6. Sync attention_log
  const surfacedKeys = new Set(
    surfaced.map(s => `${s.entityType}:${s.entityId}:${s.reason}`)
  );

  // 6a. Insert open log rows for newly-surfaced (entity, reason) pairs.
  //     `healthy` is a roster-pass classification, not an attention event —
  //     do not log it.
  const toInsert: Array<Pick<LogRow, "entity_type" | "entity_id" | "reason">> = [];
  for (const s of surfaced) {
    if (s.reason === "healthy") continue;
    const k = `${s.entityType}:${s.entityId}:${s.reason}`;
    if (!openLogByKey.has(k)) {
      toInsert.push({ entity_type: s.entityType, entity_id: s.entityId, reason: s.reason });
    }
  }
  if (toInsert.length > 0) {
    const { error } = await sb.from("hall_attention_log").insert(toInsert);
    if (error) console.error("[pipeline-state] log insert error:", error.message);
  }

  // 6b. Close log rows that were open but are no longer in the surfaced set.
  const toClose: LogRow[] = [];
  for (const [k, log] of openLogByKey.entries()) {
    if (!surfacedKeys.has(k)) toClose.push(log);
  }
  for (const log of toClose) {
    const resolution = await detectResolution(sb, log, {
      actionItems,
      peopleActivity,
    });
    if (resolution) {
      await sb
        .from("hall_attention_log")
        .update({ resolved_at: new Date().toISOString(), resolution })
        .eq("id", log.id);
    }
    // If no resolution detected, leave the log open — it'll be re-checked next render.
    // This avoids "row vanishes silently because filter flipped at the boundary".
  }

  // Reload open log rows we just inserted so each row has a surfaced_at.
  const { data: refreshedLogs } = await sb
    .from("hall_attention_log")
    .select("id, entity_type, entity_id, reason, surfaced_at")
    .is("resolved_at", null);
  const openLogByKey2 = new Map<string, { id: string; surfaced_at: string }>();
  for (const l of (refreshedLogs ?? []) as Array<{ id: string; entity_type: string; entity_id: string; reason: string; surfaced_at: string }>) {
    openLogByKey2.set(`${l.entity_type}:${l.entity_id}:${l.reason}`, { id: l.id, surfaced_at: l.surfaced_at });
  }

  // 7. Build PipelineRows
  const rows: PipelineRow[] = [];
  for (const s of surfaced) {
    const key = `${s.entityType}:${s.entityId}:${s.reason}`;
    const open = openLogByKey2.get(key);
    const surfacedAt = open?.surfaced_at ?? new Date().toISOString();
    const daysSinceSurfaced = Math.floor((now - new Date(surfacedAt).getTime()) / MS_DAY);

    const topics = (s.orgNotionId && topicsByOrg.get(s.orgNotionId)) || fallbackTopicsFromAI(
      (s.orgNotionId ? aiByOrg.get(s.orgNotionId) : undefined) ?? []
    );

    const peopleAct = (s.orgNotionId ? peopleActByOrg.get(s.orgNotionId) : undefined) ?? [];
    const trend = computeTrend(peopleAct, now);

    const newSignalChip = s.lastSignalAt
      ? new Date(s.lastSignalAt).getTime() > new Date(surfacedAt).getTime() &&
        (now - new Date(s.lastSignalAt).getTime()) < NEW_SIGNAL_WINDOW_HOURS * 3_600_000
      : false;

    const cta = buildPrimaryCTA(s);
    const ctaResolveLabel = buildResolveLabel(s.reason);
    const url = s.oppRow?.review_url ?? null;

    const oppMeta = s.oppRow
      ? {
          priority: s.oppRow.priority,
          value: s.oppRow.value_estimate ? Number(s.oppRow.value_estimate) : null,
          status: s.oppRow.status,
          valueLabel: formatValue(Number(s.oppRow.value_estimate ?? 0)),
        }
      : undefined;

    rows.push({
      entityType: s.entityType,
      entityId: s.entityId,
      name: s.name,
      kind: s.kind,
      oppMeta,
      reason: s.reason,
      reasonDetail: s.reasonDetail,
      topics,
      ballSummary: buildBallSummary(s.ballPayload),
      trend,
      nextMeetingAt: s.nextMeetingAt,
      lastSignalAt: s.lastSignalAt,
      newSignalChip,
      surfacedAt,
      daysSinceSurfaced,
      ctaPrimary: cta,
      ctaResolveLabel,
      url,
    });
  }

  // 8. Rank: attention reasons first, healthy at the bottom (roster baseline).
  //    Within attention, pre_meeting → ball_with_jose → ball_with_them → drift.
  const reasonRank: Record<Reason, number> = {
    pre_meeting: 0,
    ball_with_jose: 1,
    ball_with_them: 2,
    drift: 3,
    healthy: 4,
  };
  // Within `healthy`, clients come before prospects so the active book sits
  // visually grouped at the bottom of the block.
  rows.sort((a, b) => {
    const r = reasonRank[a.reason] - reasonRank[b.reason];
    if (r !== 0) return r;
    if (a.reason === "healthy" && b.reason === "healthy") {
      if (a.kind !== b.kind) return a.kind === "client" ? -1 : 1;
    }
    return b.daysSinceSurfaced - a.daysSinceSurfaced;
  });

  // 9. Resolved-today footer (last 24h)
  const since = new Date(now - MS_DAY).toISOString();
  const { data: resolved } = await sb
    .from("hall_attention_log")
    .select("id, entity_type, entity_id, reason, resolution, resolved_at")
    .gte("resolved_at", since)
    .order("resolved_at", { ascending: false });

  const resolvedToday: ResolvedRow[] = [];
  const nameLookup = new Map<string, string>();
  for (const r of rows) nameLookup.set(`${r.entityType}:${r.entityId}`, r.name);
  for (const c of clients) nameLookup.set(`organization:${c.notion_id}`, c.name);
  for (const o of opps) {
    if (o.notion_id) nameLookup.set(`opportunity:${o.notion_id}`, o.org_name ? `${o.org_name} — ${o.title}` : o.title);
  }
  for (const r of (resolved ?? []) as Array<{ id: string; entity_type: string; entity_id: string; reason: string; resolution: string; resolved_at: string }>) {
    resolvedToday.push({
      logId: r.id,
      name: nameLookup.get(`${r.entity_type}:${r.entity_id}`) ?? r.entity_id,
      entityType: r.entity_type as "organization" | "opportunity",
      entityId: r.entity_id,
      reason: r.reason as Reason,
      resolution: r.resolution as Resolution,
      resolvedAt: r.resolved_at,
    });
  }

  return { rows, resolvedToday, snoozedCount: snoozes.length };
}

// ───────────────────────── Mutations ─────────────────────────

export async function snoozeEntity(
  entityType: "organization" | "opportunity",
  entityId: string,
  days: number,
  reason: string | null,
  snoozedBy: string | null
): Promise<void> {
  const sb = getSupabaseServerClient();
  const until = new Date(Date.now() + days * MS_DAY).toISOString();
  await sb
    .from("hall_snoozes")
    .upsert({
      entity_type: entityType,
      entity_id: entityId,
      until_at: until,
      snoozed_at: new Date().toISOString(),
      reason,
      snoozed_by: snoozedBy,
    }, { onConflict: "entity_type,entity_id" });
}

/**
 * L-011: dismiss = permanente. Uses a sentinel `until_at` ~9999 so the
 * standard snooze reader still works (`until_at > now()`), but auto-lifts
 * the moment a fresh signal arrives (see getPipelineState reader).
 * Reason text is stored on the snooze row for audit only.
 */
export async function dismissEntityForever(
  entityType: "organization" | "opportunity",
  entityId: string,
  reason: string | null,
  by: string | null
): Promise<void> {
  const sb = getSupabaseServerClient();
  const FOREVER = "9999-12-31T23:59:59Z";
  await sb
    .from("hall_snoozes")
    .upsert({
      entity_type: entityType,
      entity_id: entityId,
      until_at: FOREVER,
      snoozed_at: new Date().toISOString(),
      reason,
      snoozed_by: by,
    }, { onConflict: "entity_type,entity_id" });
}

export async function manualResolve(
  entityType: "organization" | "opportunity",
  entityId: string,
  reason: Reason,
  closeUnderlying: boolean,
  resolvedBy: string | null
): Promise<{ closedLog: boolean; closedItems: number }> {
  const sb = getSupabaseServerClient();
  const nowIso = new Date().toISOString();

  // Close the open log row
  const { data: closed, error } = await sb
    .from("hall_attention_log")
    .update({ resolved_at: nowIso, resolution: "manual_done", detail: { resolved_by: resolvedBy } })
    .eq("entity_type", entityType)
    .eq("entity_id", entityId)
    .eq("reason", reason)
    .is("resolved_at", null)
    .select("id");

  if (error) {
    console.error("[manualResolve] log update error:", error.message);
    return { closedLog: false, closedItems: 0 };
  }

  let closedItems = 0;

  if (closeUnderlying && reason === "ball_with_jose") {
    // Resolve the underlying action_items and decision_items so they don't
    // immediately re-surface on the next render.
    if (entityType === "organization") {
      const { data: peeps } = await sb.from("people").select("id").eq("org_notion_id", entityId);
      const peopleIds = (peeps ?? []).map(p => p.id);
      if (peopleIds.length > 0) {
        const { count: aiClosed } = await sb
          .from("action_items")
          .update({ status: "resolved", resolved_at: nowIso, resolved_reason: "manual_pipeline_resolve" }, { count: "exact" })
          .eq("status", "open")
          .in("counterparty_contact_id", peopleIds)
          .in("intent", ["deliver", "follow_up", "close_loop"]);
        closedItems += aiClosed ?? 0;
      }
      const { count: diClosed } = await sb
        .from("decision_items")
        .update({ status: "Decided", approved_at: nowIso, approved_by: resolvedBy ?? "manual" }, { count: "exact" })
        .eq("org_notion_id", entityId)
        .in("status", ["Open", "Pending", "Pending Review", "In Progress"]);
      closedItems += diClosed ?? 0;
    } else {
      // For opportunities, clear the follow_up_status if it was Needed
      await sb
        .from("opportunities")
        .update({ follow_up_status: "Done" })
        .eq("notion_id", entityId)
        .eq("follow_up_status", "Needed");
    }
  }

  // L-012 fix: the previous gate was `drift && organization` only, which
  // meant Resolve on an opportunity (any reason) and Resolve on an org with
  // reason ∈ {ball_with_them, ball_with_jose} closed the log but wrote
  // ZERO suppression — the same row re-opened on next render. The user
  // bug "I dismiss in Pipeline and it comes back" lives here.
  //
  // Now: any non-pre_meeting Resolve writes a forever snooze. The reader's
  // auto-lift (lastSignal > snoozed_at) keeps this honest — if the
  // counterpart re-engages with a fresh inbound, the row surfaces again
  // because the signal IS new. pre_meeting Resolve ("Skip prep") stays
  // unsnoozed: the next meeting with the same entity is a different event,
  // not the same row to suppress.
  if (closeUnderlying && reason !== "pre_meeting") {
    await dismissEntityForever(entityType, entityId, `manual_${reason}`, resolvedBy);
  }

  return { closedLog: (closed?.length ?? 0) > 0, closedItems };
}

// ───────────────────────── Helpers ─────────────────────────

type BallItem = {
  description: string;
  daysOld: number;
};
type BallPayload = {
  jose: { items: BallItem[]; maxAgeDays: number; summary: string };
  them: { items: BallItem[]; maxAgeDays: number; summary: string };
};

function computeBallWithJose(
  ais: ActionItemRow[],
  dis: DecisionItemRow[],
  now: number
): BallPayload["jose"] {
  const items: BallItem[] = [];
  let maxAge = 0;
  for (const ai of ais) {
    if (ai.ball_in_court !== "jose") continue;
    if (!["deliver", "follow_up", "close_loop"].includes(ai.intent)) continue;
    const days = Math.floor((now - new Date(ai.last_motion_at).getTime()) / MS_DAY);
    items.push({
      description: ai.next_action || ai.subject || "compromiso pendiente",
      daysOld: days,
    });
    if (days > maxAge) maxAge = days;
  }
  for (const di of dis) {
    const ref = di.due_date ?? null;
    const days = ref ? Math.floor((now - new Date(ref).getTime()) / MS_DAY) : 0;
    items.push({ description: `decidir: ${di.title}`, daysOld: Math.max(0, days) });
    if (days > maxAge) maxAge = days;
  }
  items.sort((a, b) => b.daysOld - a.daysOld);
  const summary = items.length === 0
    ? ""
    : items.length === 1
      ? `${items[0].description} (${items[0].daysOld}d)`
      : `${items[0].description} (${items[0].daysOld}d) · +${items.length - 1} más`;
  return { items, maxAgeDays: maxAge, summary };
}

function computeBallWithThem(ais: ActionItemRow[], now: number): BallPayload["them"] {
  const items: BallItem[] = [];
  let maxAge = 0;
  for (const ai of ais) {
    if (ai.intent !== "chase") continue;
    if (ai.ball_in_court === "jose") continue;
    const days = Math.floor((now - new Date(ai.last_motion_at).getTime()) / MS_DAY);
    items.push({
      description: ai.next_action || ai.subject || "respuesta pendiente",
      daysOld: days,
    });
    if (days > maxAge) maxAge = days;
  }
  items.sort((a, b) => b.daysOld - a.daysOld);
  const summary = items.length === 0
    ? ""
    : `esperas: ${items[0].description} (${items[0].daysOld}d)`;
  return { items, maxAgeDays: maxAge, summary };
}

function buildBallSummary(p: BallPayload): string | null {
  const parts: string[] = [];
  if (p.jose.summary) parts.push(`tú debes: ${p.jose.summary}`);
  if (p.them.summary) parts.push(p.them.summary);
  return parts.length === 0 ? null : parts.join(" · ");
}

function computeTrend(people: PersonActivityRow[], now: number): Trend {
  const ts7 = now - 7 * MS_DAY;
  const ts14 = now - 14 * MS_DAY;
  const ts21 = now - 21 * MS_DAY;
  let c7 = 0, c14 = 0, c21 = 0;
  for (const p of people) {
    const candidates = [p.last_email_at, p.last_transcript_at]
      .filter((s): s is string => !!s)
      .map(s => new Date(s).getTime());
    const latest = candidates.length > 0 ? Math.max(...candidates) : 0;
    if (latest >= ts7) c7++;
    if (latest >= ts14) c14++;
    if (latest >= ts21) c21++;
  }
  if (c21 === 0) return "cold";
  if (c14 === 0) return "cooling";
  if (c7 > c14 * 0.5) return "heating";
  if (c7 * 2 < c14) return "cooling";
  return "steady";
}

function buildPrimaryCTA(s: { reason: Reason; oppRow?: OppRow; orgRow?: OrgRow; entityId: string; entityType: "organization" | "opportunity" }): CTA {
  if (s.reason === "healthy") {
    // No active push — the row is informational. The client renderer
    // suppresses the button entirely when action === 'open_review'.
    return { label: "View", action: "open_review", payload: { entityId: s.entityId } };
  }
  if (s.reason === "pre_meeting") {
    return { label: "Open prep brief", action: "open_prep", payload: { entityId: s.entityId } };
  }
  if (s.reason === "drift") {
    return { label: "Draft check-in", action: "draft_checkin", payload: { entityId: s.entityId, entityType: s.entityType } };
  }
  if (s.reason === "ball_with_them") {
    return { label: "Draft reminder", action: "draft_followup", payload: { entityId: s.entityId, entityType: s.entityType, kind: "chase" } };
  }
  // ball_with_jose
  if (s.oppRow && s.oppRow.status === "Qualifying") {
    return { label: "Draft proposal", action: "draft_proposal", payload: { opportunityId: s.entityId } };
  }
  if (s.oppRow) {
    return { label: "Draft follow-up", action: "draft_followup", payload: { opportunityId: s.entityId } };
  }
  return { label: "Draft reply", action: "draft_followup", payload: { entityId: s.entityId, entityType: s.entityType } };
}

function buildResolveLabel(reason: Reason): string {
  switch (reason) {
    case "ball_with_jose":  return "Mark delivered";
    case "ball_with_them":  return "Mark received";
    case "drift":           return "Acknowledge — not pursuing";
    case "pre_meeting":     return "Skip prep";
    case "healthy":         return ""; // suppressed on the client
  }
}

function fallbackTopicsFromAI(ais: ActionItemRow[]): string[] {
  // Used only when org_recent_topics has nothing materialized yet.
  // Pull the first ~6 words of the most recent subjects as raw chips.
  const sorted = [...ais].sort(
    (a, b) => new Date(b.last_motion_at).getTime() - new Date(a.last_motion_at).getTime()
  );
  const seen = new Set<string>();
  const out: string[] = [];
  for (const r of sorted) {
    const raw = (r.subject || "").trim();
    if (!raw) continue;
    const short = raw.split(/\s+/).slice(0, 6).join(" ");
    const key = short.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(short);
    if (out.length >= MAX_TOPICS) break;
  }
  return out;
}

async function detectResolution(
  sb: ReturnType<typeof getSupabaseServerClient>,
  log: LogRow,
  ctx: { actionItems: ActionItemRow[]; peopleActivity: PersonActivityRow[] }
): Promise<Resolution | null> {
  const surfacedTs = new Date(log.surfaced_at).getTime();
  const orgId = log.entity_type === "organization" ? log.entity_id : null;

  // 1. item_closed — any action_item for this entity moved to closed
  // since the log surfaced.
  if (log.reason === "ball_with_jose" || log.reason === "ball_with_them") {
    const { data: closedItems } = await sb
      .from("action_items")
      .select("id, resolved_at")
      .neq("status", "open")
      .gte("resolved_at", log.surfaced_at)
      .limit(1);
    if ((closedItems?.length ?? 0) > 0) return "item_closed";
  }

  // 2. inbound_reply — any person tied to this org has last_email_at fresher
  if (orgId) {
    const peopleAct = ctx.peopleActivity.filter(p => p.org_notion_id === orgId);
    const latestInbound = maxIso(peopleAct.flatMap(p => [p.last_email_at]));
    if (latestInbound && new Date(latestInbound).getTime() > surfacedTs) {
      return "inbound_reply";
    }
    const latestTranscript = maxIso(peopleAct.flatMap(p => [p.last_transcript_at]));
    if (latestTranscript && new Date(latestTranscript).getTime() > surfacedTs) {
      return "meeting_completed";
    }
  }

  // 3. drift fallback — if last_email_at or transcript advanced at all, treat as resolved
  if (log.reason === "drift" && orgId) {
    const peopleAct = ctx.peopleActivity.filter(p => p.org_notion_id === orgId);
    const latest = maxIso(peopleAct.flatMap(p => [p.last_email_at, p.last_transcript_at]));
    if (latest && new Date(latest).getTime() > surfacedTs) return "inbound_reply";
  }

  // 4. pre_meeting — meeting time passed
  if (log.reason === "pre_meeting") {
    // No structured signal here; the row falls out of the filter naturally
    // when next_meeting_at moves into the past. Mark as completed if it did.
    if (log.entity_type === "opportunity") {
      const { data: opp } = await sb
        .from("opportunities")
        .select("next_meeting_at")
        .eq("notion_id", log.entity_id)
        .maybeSingle();
      if (opp && opp.next_meeting_at && new Date(opp.next_meeting_at).getTime() < Date.now()) {
        return "meeting_completed";
      }
    }
  }

  return null;
}

function groupBy<T, K>(items: T[], keyFn: (t: T) => K | undefined | null): Map<K, T[]> {
  const m = new Map<K, T[]>();
  for (const x of items) {
    const k = keyFn(x);
    if (k === undefined || k === null) continue;
    const arr = m.get(k) ?? [];
    arr.push(x);
    m.set(k, arr);
  }
  return m;
}

function maxIso(arr: Array<string | null | undefined>): string | null {
  let best: string | null = null;
  let bestTs = 0;
  for (const s of arr) {
    if (!s) continue;
    const ts = new Date(s).getTime();
    if (ts > bestTs) {
      bestTs = ts;
      best = s;
    }
  }
  return best;
}

function formatValue(v: number): string {
  if (!v) return "";
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `$${Math.round(v / 1_000)}k`;
  return `$${v}`;
}
