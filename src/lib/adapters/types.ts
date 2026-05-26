/**
 * Adapter contract.
 *
 * An adapter pulls "items of interest" from a single source (Federal Register,
 * Congress.gov RSS, castle-scraper Supabase, etc.) and normalises them into
 * `SourceItem` shape. The pull_sources stage runs all enabled adapters in
 * parallel, dedupes on URL, and writes the result to `news_cache`.
 *
 * Adapters are NOT responsible for matching items to risks — that's the
 * matcher's job (lib/adapters/match.ts). They only fetch and normalise.
 */

export interface SourceItem {
  /** Stable upstream identifier used as the dedupe key. */
  url: string
  /** Headline / title. */
  title: string
  /** Optional summary or body excerpt (≤2k chars persisted). */
  body?: string
  /** ISO 8601. Adapters MUST set this; fall back to fetch time only if upstream provides none. */
  published_at: string
  /** Free-form upstream tag (helps the matcher up-weight obvious matches). */
  category?: string
  /** Optional structured payload — e.g. raw scraper rows, used by downstream stages. */
  extra?: Record<string, any>
}

export interface AdapterContext {
  /** Lower bound on publish date. Adapters should request items >= since. */
  since: Date
  /** Soft cap on results. Adapters should respect; matcher will trim further. */
  limit: number
  /** Optional fetch signal — adapters should pass to fetch() so abort propagates. */
  signal?: AbortSignal
  /** Log line emitter (goes to pipeline trace). */
  log?: (msg: string) => void
}

export interface SourceAdapter {
  /** Persistent identifier — used as news_cache.source value. */
  name: string
  /** Whether the adapter has the credentials/config it needs to actually run. */
  enabled(): boolean
  /** Pull. Returns normalised items. Adapters MUST NOT throw on individual
   *  upstream errors — return what they got and log. Throwing aborts the
   *  whole pull_sources stage, which is undesirable. */
  fetch(ctx: AdapterContext): Promise<SourceItem[]>
}

/**
 * Wrap a fetch call with a default 20s timeout. Adapters call this instead of
 * raw fetch so a hanging upstream doesn't pin the whole stage.
 */
export async function safeFetch(
  url: string,
  init: RequestInit & { timeoutMs?: number } = {},
): Promise<Response> {
  const { timeoutMs = 20_000, signal: outerSignal, ...rest } = init
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  // Chain outer signal
  if (outerSignal) {
    if (outerSignal.aborted) ctrl.abort()
    else outerSignal.addEventListener('abort', () => ctrl.abort(), { once: true })
  }
  try {
    return await fetch(url, { ...rest, signal: ctrl.signal })
  } finally {
    clearTimeout(timer)
  }
}
