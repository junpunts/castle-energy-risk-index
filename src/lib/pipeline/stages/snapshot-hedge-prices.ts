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
    const priceMap = await snapshotPrices(tickerList, (m) => ctx.log(`  ${m}`))

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
