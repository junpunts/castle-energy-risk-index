/**
 * Castle synthetic-contract-library Supabase adapter.
 *
 * The library (Supabase project ejwwqbgxokfbajcsgcjw) holds Castle's
 * accumulated synthetic prediction-market contracts — superforecaster-priced
 * questions covering policy/legislative/market risks that off-the-shelf
 * venues (Kalshi, Polymarket) don't cover. We READ from it here to price the
 * hedges referenced on each risk.
 *
 * Hedge tickers that resolve here use the library `slug` as the ticker, with
 * an optional `library:` prefix that we strip. Example:
 *   "will-chinese-solar-panel-tariffs-exceed-60-combined-rate-by-september-30-2026"
 *   "library:will-doe-approve-new-lng-export-capacity-..."
 *
 * Mapping: probability → yes (decimal 0–1). The library does not store a
 * 7d-ago price, so change_7d is reported as 0 here; the diff stage treats a
 * 0 move as "no change", which is correct until we add price history.
 *
 * If LIBRARY_SUPABASE_URL / LIBRARY_SUPABASE_SERVICE_ROLE_KEY aren't set,
 * snapshotLibraryPrices is a no-op (returns empty), so the pipeline still runs
 * in environments without the library wired up.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { HedgePriceSnapshot } from './castle-scraper'

const LIBRARY_PREFIX = 'library:'
const TABLE = 'synthetic_contract_library'

let cachedClient: SupabaseClient | null = null

function libraryClient(): SupabaseClient | null {
  if (cachedClient) return cachedClient
  const url = process.env.LIBRARY_SUPABASE_URL
  const key = process.env.LIBRARY_SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  cachedClient = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    realtime: { params: { eventsPerSecond: 0 } },
    global: { headers: { 'x-application-name': 'castle-eri-library-consumer' } },
  })
  return cachedClient
}

/** Does a hedge ticker look like a library slug we should resolve here? */
export function isLibraryTicker(ticker: string): boolean {
  if (ticker.startsWith(LIBRARY_PREFIX)) return true
  // Library slugs are long, lowercase, hyphen-separated question text.
  // Kalshi/Polymarket tickers are short/upper or carry their own prefixes.
  if (/^(kalshi-|poly-|KX)/.test(ticker)) return false
  return /^[a-z0-9][a-z0-9-]{12,}$/.test(ticker)
}

/** Strip the optional `library:` prefix to get the raw slug. */
export function normalizeLibrarySlug(ticker: string): string {
  return ticker.startsWith(LIBRARY_PREFIX)
    ? ticker.slice(LIBRARY_PREFIX.length)
    : ticker
}

/**
 * Resolve current prices for a set of library tickers (slugs).
 *
 * Library schema (synthetic_contract_library):
 *   slug text, title text, short_title text, probability numeric (0–1),
 *   expiry_date date, status text, volume numeric, updated_at timestamptz
 *
 * NOTE: never `select('*')` — the table carries a 1536-dim `embedding`
 * column that bloats every row. Select only the fields we need.
 */
export async function snapshotLibraryPrices(
  tickers: string[],
  log?: (msg: string) => void,
): Promise<Map<string, HedgePriceSnapshot>> {
  const out = new Map<string, HedgePriceSnapshot>()
  if (tickers.length === 0) return out
  const sb = libraryClient()
  if (!sb) {
    log?.(`library: LIBRARY_SUPABASE_URL/KEY not set — returning empty snapshot`)
    return out
  }

  // Map slug → original ticker so we can key the output by what the caller asked.
  const slugToTicker = new Map<string, string>()
  for (const t of tickers) slugToTicker.set(normalizeLibrarySlug(t), t)
  const slugs = Array.from(slugToTicker.keys())

  try {
    const { data, error } = await sb
      .from(TABLE)
      .select('slug, title, short_title, probability, expiry_date, status, updated_at')
      .in('slug', slugs)
    if (error) {
      log?.(`library: query failed: ${error.message}`)
      return out
    }
    for (const row of data ?? []) {
      const yes = Number(row.probability)
      if (!Number.isFinite(yes)) continue
      const ticker = slugToTicker.get(row.slug) ?? row.slug
      out.set(ticker, {
        ticker,
        yes,
        change_7d: 0, // library has no price history yet
        title: row.short_title || row.title || undefined,
        expiry: row.expiry_date ?? undefined,
        as_of: row.updated_at ?? undefined,
      })
    }
    log?.(`library: matched ${out.size}/${slugs.length} slug${slugs.length === 1 ? '' : 's'}`)
  } catch (err) {
    log?.(`library: snapshotLibraryPrices threw: ${(err as Error).message}`)
  }
  return out
}

/** Whether the library is configured. */
export function libraryEnabled(): boolean {
  return Boolean(process.env.LIBRARY_SUPABASE_URL && process.env.LIBRARY_SUPABASE_SERVICE_ROLE_KEY)
}
