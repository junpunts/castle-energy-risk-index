/**
 * Castle-scraper Supabase adapter.
 *
 * The castle-scraper project at scraper.castle.tech runs its own daily cron
 * that pulls Polymarket + Kalshi event metadata, prices, and hourly candles.
 * It writes to its own Supabase. We READ from that Supabase here — we never
 * call Kalshi/Polymarket directly (per the standing rule).
 *
 * Two surfaces this adapter exposes:
 *
 *   1. fetch(ctx) — returns market resolution / metadata changes from the
 *      last `since` as SourceItem rows (so a contract going live, or a
 *      resolution event, lands in news_cache like everything else).
 *
 *   2. snapshotPrices(tickers) — given a list of tickers referenced in any
 *      archetype's hedges, returns the latest price + 7d change. Used by
 *      the snapshot_hedge_prices stage; not part of the SourceAdapter
 *      contract because it's a different access pattern.
 *
 * If SCRAPER_SUPABASE_URL / SCRAPER_SUPABASE_SERVICE_ROLE_KEY aren't set,
 * `enabled()` returns false and both surfaces are no-ops. This lets the
 * pipeline run in dev without the scraper wired up.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { type SourceAdapter, type SourceItem, type AdapterContext } from './types'

let cachedClient: SupabaseClient | null = null

function scraperClient(): SupabaseClient | null {
  if (cachedClient) return cachedClient
  const url = process.env.SCRAPER_SUPABASE_URL
  const key = process.env.SCRAPER_SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  cachedClient = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    realtime: { params: { eventsPerSecond: 0 } },
    global: { headers: { 'x-application-name': 'castle-eri-scraper-consumer' } },
  })
  return cachedClient
}

export interface HedgePriceSnapshot {
  ticker: string
  /** Current YES price as decimal probability (0–1). */
  yes: number
  /** 7d change in YES price, decimal. */
  change_7d: number
  /** Optional resolution title from upstream. */
  title?: string
  /** Optional expiry (ISO). */
  expiry?: string
  /** When the scraper last refreshed this row. */
  as_of?: string
}

/**
 * Pull latest price + 7d delta for each requested ticker.
 *
 * Expected scraper schema (one row per ticker):
 *   markets(ticker text pk, source text, title text, expiry timestamptz,
 *           yes_price numeric, yes_price_7d_ago numeric, updated_at timestamptz)
 *
 * If the scraper schema diverges from this, only this function needs to change.
 */
export async function snapshotPrices(
  tickers: string[],
  log?: (msg: string) => void,
): Promise<Map<string, HedgePriceSnapshot>> {
  const out = new Map<string, HedgePriceSnapshot>()
  if (tickers.length === 0) return out
  const sb = scraperClient()
  if (!sb) {
    log?.(`scraper: SCRAPER_SUPABASE_URL/KEY not set — returning empty snapshot`)
    return out
  }
  // The scraper table may not exist yet in dev. Catch and report.
  try {
    const { data, error } = await sb
      .from('markets')
      .select('ticker, title, expiry, yes_price, yes_price_7d_ago, updated_at')
      .in('ticker', tickers)
    if (error) {
      log?.(`scraper: markets query failed: ${error.message}`)
      return out
    }
    for (const row of data ?? []) {
      const yes = Number(row.yes_price)
      const prev = Number(row.yes_price_7d_ago ?? row.yes_price)
      if (!Number.isFinite(yes)) continue
      out.set(row.ticker, {
        ticker: row.ticker,
        yes,
        change_7d: Number.isFinite(prev) ? yes - prev : 0,
        title: row.title ?? undefined,
        expiry: row.expiry ?? undefined,
        as_of: row.updated_at ?? undefined,
      })
    }
    log?.(`scraper: matched ${out.size}/${tickers.length} ticker${tickers.length === 1 ? '' : 's'}`)
  } catch (err) {
    log?.(`scraper: snapshotPrices threw: ${(err as Error).message}`)
  }
  return out
}

/**
 * SourceAdapter view: emit market-event items for things that changed since
 * `since`. Resolutions, large price moves, newly-listed contracts.
 *
 * Expected scraper schema (deltas table):
 *   market_events(id bigint pk, ticker text, kind text, title text, body text,
 *                 url text, happened_at timestamptz)
 *
 * Where `kind ∈ {'resolved','listed','price_jump','expired'}`. If you don't
 * have a market_events table yet, this adapter returns empty quietly.
 */
export const castleScraperAdapter: SourceAdapter = {
  name: 'castle_scraper',
  enabled() {
    return Boolean(process.env.SCRAPER_SUPABASE_URL && process.env.SCRAPER_SUPABASE_SERVICE_ROLE_KEY)
  },
  async fetch(ctx: AdapterContext): Promise<SourceItem[]> {
    const sb = scraperClient()
    if (!sb) return []
    try {
      const { data, error } = await sb
        .from('market_events')
        .select('id, ticker, kind, title, body, url, happened_at')
        .gte('happened_at', ctx.since.toISOString())
        .order('happened_at', { ascending: false })
        .limit(ctx.limit)
      if (error) {
        // Common case in dev: table doesn't exist yet. Don't spam the log.
        if (!/does not exist|relation .* does not exist/i.test(error.message)) {
          ctx.log?.(`castle_scraper: market_events query failed: ${error.message}`)
        }
        return []
      }
      const out: SourceItem[] = []
      for (const r of data ?? []) {
        if (!r.url || !r.title) continue
        out.push({
          url: r.url,
          title: r.title,
          body: r.body ?? undefined,
          published_at: new Date(r.happened_at).toISOString(),
          category: r.kind ?? 'market',
          extra: { ticker: r.ticker },
        })
      }
      ctx.log?.(`castle_scraper: ${out.length} market event${out.length === 1 ? '' : 's'}`)
      return out
    } catch (err) {
      ctx.log?.(`castle_scraper: fetch threw: ${(err as Error).message}`)
      return []
    }
  },
}
