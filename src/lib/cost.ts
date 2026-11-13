import pricing from "@config/pricing.json";

// Estimated OpenAI cost from the `usage` object logged on ai_assistant_message and
// interview_assistant_message events, priced with config/pricing.json (USD per 1M tokens).
// scripts/cost-report.mjs uses the same formula (keep the two in sync).

export type ModelPrice = { input: number; cachedInput: number; output: number };
const MODELS: Record<string, ModelPrice> = pricing.models;

/** Token counts from an OpenAI chat-completions usage object (missing fields count as 0). */
export type UsageTokens = { input: number; cachedInput: number; output: number; reasoning: number };

export function usageTokens(usage: unknown): UsageTokens | null {
  if (!usage || typeof usage !== "object") return null;
  const u = usage as {
    prompt_tokens?: unknown;
    completion_tokens?: unknown;
    prompt_tokens_details?: { cached_tokens?: unknown } | null;
    completion_tokens_details?: { reasoning_tokens?: unknown } | null;
  };
  const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
  return {
    input: n(u.prompt_tokens), // includes cachedInput
    cachedInput: n(u.prompt_tokens_details?.cached_tokens),
    output: n(u.completion_tokens), // includes reasoning
    reasoning: n(u.completion_tokens_details?.reasoning_tokens),
  };
}

/** Price entry for a logged model name: exact match, else the longest entry it starts with. */
export function modelPrice(model: string): ModelPrice | null {
  if (MODELS[model]) return MODELS[model];
  const key = Object.keys(MODELS)
    .filter((k) => model.startsWith(k))
    .sort((a, b) => b.length - a.length)[0];
  return key ? MODELS[key] : null;
}

/** Estimated USD for one call, or null for mock/scripted calls, missing usage, or an unpriced model. */
export function usageCostUsd(model: unknown, usage: unknown): number | null {
  const t = usageTokens(usage);
  const p = typeof model === "string" ? modelPrice(model) : null;
  if (!t || !p) return null;
  const uncached = Math.max(0, t.input - t.cachedInput);
  return (uncached * p.input + t.cachedInput * p.cachedInput + t.output * p.output) / 1_000_000;
}

export const PRICING_AS_OF: string = pricing.asOf;
