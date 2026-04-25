/**
 * Priority score formula for action_items.
 *
 * See docs/NORMALIZATION_ARCHITECTURE.md §9.1.
 *
 * Additive 5-factor score, cap 100. Every factor value is persisted in
 * action_items.priority_factors for auditability.
 */

import type { Intent, PriorityFactors, Warmth } from "./types";

// ─── Factor 1: intent_base ────────────────────────────────────────────────
const INTENT_BASE: Record<Intent, number> = {
  decide:     40,
  approve:    40,
  deliver:    35,
  reply:      30,
  chase:      30,
  review:     25,
  follow_up:  20,
  prep:       20,
  close_loop: 15,
  nurture:    10,
};

export function intentBase(intent: Intent): number {
  return INTENT_BASE[intent];
}

// ─── Factor 2: deadline_pressure ──────────────────────────────────────────
export function deadlinePressure(deadline: string | null | undefined, now = new Date()): number {
  if (!deadline) return 0;
  const d = new Date(deadline);
  if (Number.isNaN(d.getTime())) return 0;
  const diffMs = d.getTime() - now.getTime();
  if (diffMs < 0) return 30;                        // overdue
  const diffHours = diffMs / 3_600_000;
  if (diffHours < 24)    return 25;
  const diffDays = diffHours / 24;
  if (diffDays < 3)      return 20;
  if (diffDays < 7)      return 15;
  if (diffDays < 14)     return 10;
  return 0;
}

// ─── Factor 3: recency ────────────────────────────────────────────────────
export function recency(lastMotionAt: string | Date, now = new Date()): number {
  const d = typeof lastMotionAt === "string" ? new Date(lastMotionAt) : lastMotionAt;
  if (Number.isNaN(d.getTime())) return 0;
  const ageHours = (now.getTime() - d.getTime()) / 3_600_000;
  if (ageHours < 24)      return 20;
  const ageDays = ageHours / 24;
  if (ageDays < 3)        return 15;
  if (ageDays < 7)        return 10;
  if (ageDays < 14)       return 5;
  return 0;
}

// ─── Factor 4: relationship_weight ────────────────────────────────────────
/**
 * Maps the Relationship Tier (from CH People [OS v2]) OR the observed Warmth
 * to a 0–20 weight. Tier has precedence when set; Warmth is the fallback.
 */
export function relationshipWeight(params: {
  tier?: "VIP" | "Active" | "Occasional" | "Dormant" | null;
  warmth?: Warmth | null;
}): number {
  const { tier, warmth } = params;
  if (tier === "VIP")        return 20;
  if (tier === "Active")     return 15;
  if (tier === "Occasional") return 10;
  if (tier === "Dormant")    return 5;
  // Fallback to warmth when tier not set
  if (warmth === "hot")      return 20;
  if (warmth === "warm")     return 15;
  if (warmth === "cool")     return 10;
  if (warmth === "dormant")  return 5;
  return 5; // unknown — small non-zero so orphans can still rank
}

// ─── Factor 5: objective_link ─────────────────────────────────────────────
export function objectiveLink(tier: "HIGH" | "MID" | "LOW" | null | undefined): number {
  if (tier === "HIGH") return 10;
  if (tier === "MID")  return 7;
  if (tier === "LOW")  return 4;
  return 0;
}

// ─── Composite ────────────────────────────────────────────────────────────
/**
 * Compute the final priority score and the factor breakdown.
 * Caller should persist BOTH the score AND the factors jsonb for audit.
 */
export function computePriorityScore(factors: PriorityFactors): number {
  const raw =
    factors.intent_base +
    factors.deadline_pressure +
    factors.recency +
    factors.relationship_weight +
    factors.objective_link +
    factors.founder_bonus -
    (factors.mentorship_penalty ?? 0);
  return Math.max(0, Math.min(100, Math.round(raw)));
}

export function buildFactors(params: {
  intent: Intent;
  deadline?: string | null;
  lastMotionAt: string | Date;
  tier?: "VIP" | "Active" | "Occasional" | "Dormant" | null;
  warmth?: Warmth | null;
  objectiveTier?: "HIGH" | "MID" | "LOW" | null;
  founderOwned?: boolean;
  /**
   * Set to 20 when the item comes from a mentorship project via a
   * substrate without per-item actor classification (Gmail/Calendar/
   * WhatsApp). The item still surfaces but ranks below operational items.
   */
  mentorshipPenalty?: number;
  now?: Date;
}): PriorityFactors {
  const now = params.now ?? new Date();
  return {
    intent_base:         intentBase(params.intent),
    deadline_pressure:   deadlinePressure(params.deadline ?? null, now),
    recency:             recency(params.lastMotionAt, now),
    relationship_weight: relationshipWeight({ tier: params.tier ?? null, warmth: params.warmth ?? null }),
    objective_link:      objectiveLink(params.objectiveTier ?? null),
    founder_bonus:       params.founderOwned ? 20 : 0,
    mentorship_penalty:  params.mentorshipPenalty ?? 0,
  };
}

// ─── Urgency mapping ──────────────────────────────────────────────────────
export type Urgency = "critical" | "high" | "normal";

export function mapUrgency(score: number): Urgency {
  if (score >= 70) return "critical";
  if (score >= 40) return "high";
  return "normal";
}
