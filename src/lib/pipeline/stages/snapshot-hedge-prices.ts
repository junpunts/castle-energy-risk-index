/**
 * Stage: snapshot_hedge_prices.
 *
 * Walk the archetype bundle, collect every ticker referenced in any risk's
 * hedges[], pull current price + 7d change from the castle-scraper, and
 * return them as a map. The diff stage consumes this to decide whether any
 * hedge moved more than the 5pp threshold.
 *
 * This stage does NOT mutate the bundle — the diff + Pass A stages produce
 * proposals; apply path handles the actual write. We keep this purely as a
 * read-and-pass-along.
 */

import type { Stage } from '../registry'
import { snapshotPrices, type HedgePriceSnapshot } from '@/lib/adapters/castle-scraper'
import { snapshotLibraryPrices, isLibraryTicker } from '@/lib/adapters/castle-library'
import { parseArchetypeBundle } from '@/lib/schemas'

interface SnapshotInput {
  /** Optional pre-loaded bundle; if absent we re-fetch from DB. */
}

interface SnapshotOutput {
  tickers: string[]
  prices: Record<string, HedgePriceSnapshot>
  missing: string[]
}

export const snapshotHedgePricesStage: Stage<SnapshotInput | null, SnapshotOutput> = {
  name: 'snapshot_hedge_prices',
  async run(ctx, _input) {
    if (!ctx.archetypeId) throw new Error('archetypeId required')

    const { data: archRow, error } = await ctx.sb
      .from('archetypes')
      .select('state')
      .eq('id', ctx.archetypeId)
      .single()
    if (error || !archRow) throw new Error(`load archetype: ${error?.message ?? 'missing'}`)
    const bundle = parseArchetypeBundle(archRow.state)

    // Collect tickers across all risk_details.
    const tickers = new Set<string>()
    for (const detail of Object.values(bundle.risk_details ?? {})) {
      for (const h of detail.hedges ?? []) {
        if (h.ticker) tickers.add(h.ticker)
      }
    }
    const tickerList = [...tickers]

    if (tickerList.length === 0) {
      ctx.log('no hedges configured; skipping snapshot')
      return { output: { tickers: [], prices: {}, missing: [] } }
    }

    ctx.log(`snapshotting ${tickerList.length} ticker${tickerList.length === 1 ? '' : 's'}`)

    // Route each ticker to its price source: library slugs → library Supabase,
    // everything else (Kalshi/Polymarket) → castle-scraper Supabase.
    const libraryTickers = tickerList.filter((t) => isLibraryTicker(t))
    const scraperTickers = tickerList.filter((t) => !isLibraryTicker(t))

    const [libraryMap, scraperMap] = await Promise.all([
      libraryTickers.length
        ? snapshotLibraryPrices(libraryTickers, (m) => ctx.log(`  ${m}`))
        : Promise.resolve(new Map<string, HedgePriceSnapshot>()),
      scraperTickers.length
        ? snapshotPrices(scraperTickers, (m) => ctx.log(`  ${m}`))
        : Promise.resolve(new Map<string, HedgePriceSnapshot>()),
    ])

    const priceMap = new Map<string, HedgePriceSnapshot>([
      ...Array.from(libraryMap.entries()),
      ...Array.from(scraperMap.entries()),
    ])

    const prices: Record<string, HedgePriceSnapshot> = {}
    const missing: string[] = []
    for (const t of tickerList) {
      const p = priceMap.get(t)
      if (p) prices[t] = p
      else missing.push(t)
    }

    if (missing.length > 0) {
      ctx.log(`  missing prices: ${missing.slice(0, 5).join(', ')}${missing.length > 5 ? ` (+${missing.length - 5} more)` : ''}`)
    }

    return { output: { tickers: tickerList, prices, missing } }
  },
}
