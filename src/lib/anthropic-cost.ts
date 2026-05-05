/**
 * anthropic-cost.ts
 *
 * Computes per-call USD cost for Anthropic Messages API responses.
 * Used by routes wrapped with withRoutineLog to expose `cost_usd`
 * in their JSON response so cost trends land in routine_runs.cost_usd.
 *
 * Pricing (per 1M tokens, USD) — keep in sync with
 * https://www.anthropic.com/pricing.
 */

// Mirrors @anthropic-ai/sdk's Usage shape (which uses `number | null`),
// but is intentionally structural so we're decoupled from the SDK version.
export type AnthropicUsage = {
  input_tokens?: number | null;
  output_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
  cache_read_input_tokens?: number | null;
};

type Pricing = {
  input: number;        // per 1M
  output: number;       // per 1M
  cacheWrite: number;   // per 1M (typically 1.25× input)
  cacheRead: number;    // per 1M (typically 0.1× input)
};

const PRICING_TABLE: Array<{ match: RegExp; price: Pricing }> = [
  // Opus 4.x — $15/$75
  { match: /^claude-opus-4/, price: { input: 15, output: 75, cacheWrite: 18.75, cacheRead: 1.5 } },
  // Sonnet 4.x — $3/$15
  { match: /^claude-sonnet-4/, price: { input: 3, output: 15, cacheWrite: 3.75, cacheRead: 0.3 } },
  // Haiku 4.x — $1/$5
  { match: /^claude-haiku-4/, price: { input: 1, output: 5, cacheWrite: 1.25, cacheRead: 0.1 } },
  // Legacy 3.x fallbacks
  { match: /^claude-3-5-sonnet/, price: { input: 3, output: 15, cacheWrite: 3.75, cacheRead: 0.3 } },
  { match: /^claude-3-5-haiku/, price: { input: 0.8, output: 4, cacheWrite: 1, cacheRead: 0.08 } },
];

const FALLBACK_PRICE: Pricing = { input: 3, output: 15, cacheWrite: 3.75, cacheRead: 0.3 };

function priceFor(model: string): Pricing {
  return PRICING_TABLE.find((p) => p.match.test(model))?.price ?? FALLBACK_PRICE;
}

/**
 * Compute USD cost for a single Anthropic API call (or an accumulator
 * of usage across multiple calls of the same model).
 *
 * Returns 0 when usage is empty/undefined; never throws.
 */
export function computeAnthropicCost(usage: AnthropicUsage | null | undefined, model: string): number {
  if (!usage) return 0;
  const p = priceFor(model);
  const input = (usage.input_tokens ?? 0) / 1_000_000;
  const output = (usage.output_tokens ?? 0) / 1_000_000;
  const cacheWrite = (usage.cache_creation_input_tokens ?? 0) / 1_000_000;
  const cacheRead = (usage.cache_read_input_tokens ?? 0) / 1_000_000;
  const cost =
    input * p.input +
    output * p.output +
    cacheWrite * p.cacheWrite +
    cacheRead * p.cacheRead;
  return Math.round(cost * 1_000_000) / 1_000_000; // 6 dp
}

/**
 * Mutable accumulator helper — call from inside a loop:
 *
 *   const acc = makeUsageAccumulator();
 *   const r = await anthropic.messages.create({ model, ... });
 *   addUsage(acc, r.usage);
 *   ...
 *   const cost_usd = computeAnthropicCost(acc, model);
 */
export function makeUsageAccumulator(): AnthropicUsage {
  return {
    input_tokens: 0,
    output_tokens: 0,
    cache_creation_input_tokens: 0,
    cache_read_input_tokens: 0,
  };
}

export function addUsage(acc: AnthropicUsage, u: AnthropicUsage | null | undefined): void {
  if (!u) return;
  acc.input_tokens = (acc.input_tokens ?? 0) + (u.input_tokens ?? 0);
  acc.output_tokens = (acc.output_tokens ?? 0) + (u.output_tokens ?? 0);
  acc.cache_creation_input_tokens =
    (acc.cache_creation_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0);
  acc.cache_read_input_tokens =
    (acc.cache_read_input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0);
}
