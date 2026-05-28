/**
 * Stage: sync_market_probabilities.
 *
 * For each ACTIVE risk that carries `primary_hedge_ticker`, look up the live
 * YES price (from castle-scraper for Kalshi/Poly tickers, from castle-library
 * for synthetic-library slugs) and write it into `risk.probability` and
 * `risk_details[id].probability` so the dashboard shows market-derived odds
 * instead of the gen-script's hand-curated number.
 *
 * Realized risks are skipped — their probability is locked at the analytical
 * "termination holds" value (typically 0.99). The cron should not move them
 * back to the market's risk-premium-discounted price.
 *
 * Idempotent: writes a new revision only when at least one probability moved
 * by more than 0.005 (half a percentage point). Mirrors the same audited
 * apply_archetype_revision path used by compute_attention.
 */

import type { Stage } from '../registry'
import { parseArchetypeBundle } from '@/lib/schemas'
import { snapshotPrices } from '@/lib/adapters/castle-scraper'
import { snapshotLibraryPrices, isLibraryTicker } from '@/lib/adapters/castle-library'

const MIN_MOVE = 0.005

interface SyncOutput {
  changed: boolean
  risks_with_ticker: number
  risks_synced: number
  realized_skipped: number
  largest_move: number
}

export const syncMarketProbabilitiesStage: Stage<unknown, SyncOutput> = {
  name: 'sync_market_probabilities',
  async run(ctx) {
    if (!ctx.archetypeId) throw new Error('archetypeId required')
    const archetypeId = ctx.archetypeId

    const { data: archRow, error: archErr } = await ctx.sb
      .from('archetypes')
      .select('state, state_version')
      .eq('id', archetypeId)
      .single()
    if (archErr || !archRow) throw new Error(`load archetype: ${archErr?.message ?? 'missing'}`)
    const bundle = parseArchetypeBundle(archRow.state)

    // Walk the rolled-up risks[] — that's where primary_hedge_ticker lives.
    const candidates: Array<{ riskId: string; ticker: string }> = []
    let realizedSkipped = 0
    for (const r of bundle.risks) {
      if (!r.primary_hedge_ticker) continue
      if (r.status === 'realized') {
        realizedSkipped++
        continue
      }
      candidates.push({ riskId: r.id, ticker: r.primary_hedge_ticker })
    }

    if (candidates.length === 0) {
      ctx.log(`no active risks with primary_hedge_ticker (${realizedSkipped} realized skipped)`)
      return {
        output: {
          changed: false,
          risks_with_ticker: 0,
          risks_synced: 0,
          realized_skipped: realizedSkipped,
          largest_move: 0,
        },
      }
    }

    const libraryTickers = candidates.map((c) => c.ticker).filter(isLibraryTicker)
    const scraperTickers = candidates.map((c) => c.ticker).filter((t) => !isLibraryTicker(t))

    const [libMap, scraperMap] = await Promise.all([
      libraryTickers.length
        ? snapshotLibraryPrices(libraryTickers, (m) => ctx.log(`  ${m}`))
        : Promise.resolve(new Map()),
      scraperTickers.length
        ? snapshotPrices(scraperTickers, (m) => ctx.log(`  ${m}`))
        : Promise.resolve(new Map()),
    ])

    // Build the next state with synced probabilities.
    const next = JSON.parse(JSON.stringify(bundle)) as typeof bundle
    let synced = 0
    let largestMove = 0
    for (const c of candidates) {
      const snap = libMap.get(c.ticker) ?? scraperMap.get(c.ticker)
      if (!snap) {
        ctx.log(`  ${c.riskId}: no price for ${c.ticker}; leaving as-is`)
        continue
      }
      const liveYes = snap.yes
      const r = next.risks.find((x) => x.id === c.riskId)
      const d = next.risk_details[c.riskId]
      if (!r || !d) continue
      const oldP = r.probability
      const move = Math.abs(liveYes - oldP)
      if (move < MIN_MOVE) continue
      r.probability = liveYes
      d.probability = liveYes
      synced++
      if (move > largestMove) largestMove = move
      ctx.log(`  ${c.riskId}: ${oldP.toFixed(3)} → ${liveYes.toFixed(3)} (${(liveYes - oldP > 0 ? '+' : '') + (liveYes - oldP).toFixed(3)})`)
    }

    if (synced === 0) {
      ctx.log(`✓ no moves above ${MIN_MOVE}; nothing to write`)
      return {
        output: {
          changed: false,
          risks_with_ticker: candidates.length,
          risks_synced: 0,
          realized_skipped: realizedSkipped,
          largest_move: largestMove,
        },
      }
    }

    next.generated_at = new Date().toISOString()
    next.generated_by = `pipeline:${ctx.runId}`
    const newVersion = archRow.state_version + 1
    const { error: rpcErr } = await ctx.sb.rpc('apply_archetype_revision', {
      p_archetype_id: archetypeId,
      p_state_version: newVersion,
      p_state: next,
      p_proposal_id: null,
      p_applied_by: `pipeline:${ctx.runId}`,
    })
    if (rpcErr) throw new Error(`apply_archetype_revision: ${rpcErr.message}`)
    ctx.log(`✓ ${synced} probabilities synced (largest move ${largestMove.toFixed(3)}); wrote v${newVersion}`)

    return {
      output: {
        changed: true,
        risks_with_ticker: candidates.length,
        risks_synced: synced,
        realized_skipped: realizedSkipped,
        largest_move: largestMove,
      },
    }
  },
}
