import "server-only";

import { getNvidiaCallBudget, getNvidiaIntentClient } from "@/infrastructure/nvidia/intent-client-factory";
import type { NvidiaIntentClient } from "@/infrastructure/nvidia/intent-client";
import { serverEnv } from "@/env/server";
import { logger } from "@/shared/observability/logger";
import type { ParsedTextSearchQuery } from "@/types/text-search";
import { applyNvidiaIntentOverride } from "./nvidia-intent-merge";

export type NvidiaIntentDependencies = {
  /** Overrides the NVIDIA_INTENT_ENABLED feature flag for this call. */
  enabled?: boolean;
  /** Overrides the shared client singleton (null = unconfigured, same as no API key). */
  client?: NvidiaIntentClient | null;
  /** Overrides the shared call-budget singleton. */
  budget?: { tryConsume(): boolean };
};

/**
 * Optional NVIDIA-backed intent-structuring enrichment layered strictly on
 * top of the base rule-based parse (ticket 3's parseTextSearchQuery,
 * src/domains/search/server/text-query-parser.ts) -- never a replacement
 * for it, and never called at all for a query the base parser already
 * marked `outOfScope` (the caller is expected to short-circuit that case
 * before calling this). Returns `base` unchanged -- and never throws --
 * whenever NVIDIA augmentation is:
 *
 * - disabled (NVIDIA_INTENT_ENABLED is not "true", requirement 4),
 * - unconfigured (no NVIDIA_API_KEY, requirement 4),
 * - budget-exhausted (requirement 2's call budget), or
 * - a failure of any kind (timeout, 429 after exhausting retries,
 *   malformed response, schema-invalid result -- requirement 5).
 *
 * The caller (POST /api/search/text) never needs its own fallback branch
 * for any of these; it always gets back a valid, searchable
 * ParsedTextSearchQuery, with or without NVIDIA's help.
 */
export async function enrichWithNvidiaIntent(
  query: string,
  base: ParsedTextSearchQuery,
  dependencies: NvidiaIntentDependencies = {},
): Promise<ParsedTextSearchQuery> {
  const enabled = dependencies.enabled ?? serverEnv.nvidiaIntent?.enabled ?? false;
  if (!enabled) return base;

  const client = dependencies.client !== undefined ? dependencies.client : getNvidiaIntentClient();
  if (!client) return base;

  const budget = dependencies.budget ?? getNvidiaCallBudget();
  try {
    const result = await client.extractIntent(query, { tryConsume: () => budget.tryConsume() });
    return applyNvidiaIntentOverride(base, result);
  } catch (error) {
    // Never logs the raw query or the API key -- only the error's own
    // (always key/query-free) code, see NvidiaIntentError.
    logger.warn("NVIDIA intent enrichment failed; falling back to base text search", {
      code: error instanceof Error && "code" in error ? String((error as { code: unknown }).code) : "UNKNOWN",
    });
    return base;
  }
}
