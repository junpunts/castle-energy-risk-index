/**
 * Process-wide LLM concurrency limiter. See ADMIN.md §5.3.
 *
 * Both axes — within-stage fan-out (parallel risks) and cross-archetype fan-
 * out — share this single limiter. Sonnet tier-2 caps are roughly 50 RPM and
 * 40k input TPM; a cap of 10 keeps us comfortably under both while letting
 * latency scale near-linearly.
 *
 * Override via env (WORKER_LLM_CONCURRENCY) if you bump tiers.
 */

import pLimit from 'p-limit'

const limit = pLimit(Number(process.env.WORKER_LLM_CONCURRENCY ?? 10))

export function llmLimit<T>(fn: () => Promise<T>): Promise<T> {
  return limit(fn)
}

export function inFlight(): number {
  return limit.activeCount
}
export function queued(): number {
  return limit.pendingCount
}
