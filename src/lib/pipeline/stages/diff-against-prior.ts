/**
 * Stage: diff_against_prior.
 *
 * Build the EvidencePacket[] consumed by update_existing_risks (Pass A).
 *
 * Input chain (composed via the registry's pipeline output → input wiring):
 *   pull_sources       → { items: NewsCacheRow[], ... }
 *   snapshot_hedge_prices → { prices: Record<ticker, snapshot>, ... }
 *
 * Since the runtime currently passes only the LAST stage's output to the
 * next stage, diff_against_prior needs both. We work around this by reading
 * the snapshot output from pipeline_traces (it's already persisted there).
 *
 * Output: { changes: Record<risk_id, EvidencePacket> } — exactly the input
 * shape that update_existing_risks expects.
 */

import type { Stage } from '../registry'
import type { EvidencePacket } from '@/lib/agent/pass-a'
import type { NewsCacheRow } from './pull-sources'
import type { HedgePriceSnapshot } from '@/lib/adapters/castle-scraper'
import { parseArchetypeBundle } from '@/lib/schemas'

interface DiffInput {
  /** Comes from pull_sources. */
  items?: NewsCacheRow[]
  /** From pull_sources too — passthrough. */
  fetched?: number
  persisted?: number
  matched_to_risks?: number
}

interface DiffOutput {
  changes: Record<string, EvidencePacket>
  risks_with_changes: number
  total_news_attached: number
  total_hedge_moves: number
}

/** Threshold below which hedge moves are noise and not included in the packet. */
const HEDGE_MOVE_THRESHOLD = 0.05 // 5 percentage points

export const diffAgainstPriorStage: Stage<DiffInput | null, DiffOutput> = {
  name: 'diff_against_prior',
  async run(ctx, input) {
    if (!ctx.archetypeId) throw new Error('archetypeId required')

    // 1. Items from pull_sources. The runtime only passes the *previous*
    //    stage's output along, so we read pull_sources' output from the
    //    pipeline_traces table by name.
    const { data: pullTrace } = await ctx.sb
      .from('pipeline_traces')
      .select('output_json')
      .eq('pipeline_run_id', ctx.runId)
      .eq('stage_name', 'pull_sources')
      .maybeSingle()
    const pullOut = (pullTrace?.output_json ?? input ?? {}) as { items?: NewsCacheRow[] }
    const items: NewsCacheRow[] = pullOut.items ?? []

    // 2. Hedge snapshot from the previous stage's trace.
    const { data: snapTrace } = await ctx.sb
      .from('pipeline_traces')
      .select('output_json')
      .eq('pipeline_run_id', ctx.runId)
      .eq('stage_name', 'snapshot_hedge_prices')
      .maybeSingle()
    const snapshot = (snapTrace?.output_json ?? {}) as {
      prices?: Record<string, HedgePriceSnapshot>
    }
    const prices = snapshot.prices ?? {}

    // 3. Load current archetype bundle (for prior hedge prices to diff against).
    const { data: archRow, error: archErr } = await ctx.sb
      .from('archetypes')
      .select('state')
      .eq('id', ctx.archetypeId)
      .single()
    if (archErr || !archRow) throw new Error(`load archetype: ${archErr?.message ?? 'missing'}`)
    const bundle = parseArchetypeBundle(archRow.state)

    // 4. Aggregate news per matched risk.
    const newsByRisk = new Map<string, NewsCacheRow[]>()
    for (const item of items) {
      for (const qualified of item.matched_risks ?? []) {
        // matched_risks are qualified "archetype:risk_id"; strip prefix.
        const [archId, riskId] = qualified.split(':', 2)
        if (archId !== ctx.archetypeId) continue
        const bucket = newsByRisk.get(riskId) ?? []
        bucket.push(item)
        newsByRisk.set(riskId, bucket)
      }
    }

    // 5. Build hedge_moves per risk by diffing snapshot vs bundle.
    const hedgesByRisk = new Map<
      string,
      Array<{ ticker: string; from: number; to: number; title?: string; expiry?: string }>
    >()
    for (const [riskId, detail] of Object.entries(bundle.risk_details ?? {})) {
      for (const h of detail.hedges ?? []) {
        const snap = prices[h.ticker]
        if (!snap) continue
        const move = snap.yes - (h.yes ?? 0)
        if (Math.abs(move) < HEDGE_MOVE_THRESHOLD) continue
        const bucket = hedgesByRisk.get(riskId) ?? []
        bucket.push({
          ticker: h.ticker,
          from: h.yes ?? 0,
          to: snap.yes,
          title: snap.title ?? h.title,
          expiry: snap.expiry ?? h.expiry,
        })
        hedgesByRisk.set(riskId, bucket)
      }
    }

    // 6. Combine into EvidencePacket per affected risk.
    const changes: Record<string, EvidencePacket> = {}
    let totalNews = 0
    let totalMoves = 0
    const allRiskIds = new Set<string>([...newsByRisk.keys(), ...hedgesByRisk.keys()])
    for (const riskId of allRiskIds) {
      const news = (newsByRisk.get(riskId) ?? []).map((n) => ({
        source: n.source,
        title: n.title,
        sum: n.body ?? undefined,
        published_at: n.published_at,
        url: n.url,
      }))
      const hedge_moves = hedgesByRisk.get(riskId) ?? []
      // Skip risks that ended up with nothing interesting.
      if (news.length === 0 && hedge_moves.length === 0) continue
      // Cap news per risk to keep prompts tight.
      const trimmed = news.slice(0, 8)
      totalNews += trimmed.length
      totalMoves += hedge_moves.length
      changes[riskId] = {
        risk_id: riskId,
        news: trimmed,
        hedge_moves,
      }
    }

    ctx.log(
      `${Object.keys(changes).length} risk${Object.keys(changes).length === 1 ? '' : 's'} affected ` +
        `(${totalNews} news item${totalNews === 1 ? '' : 's'}, ${totalMoves} hedge move${totalMoves === 1 ? '' : 's'} ≥${HEDGE_MOVE_THRESHOLD * 100}pp)`,
    )

    return {
      output: {
        changes,
        risks_with_changes: Object.keys(changes).length,
        total_news_attached: totalNews,
        total_hedge_moves: totalMoves,
      },
    }
  },
}
