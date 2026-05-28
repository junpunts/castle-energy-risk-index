import type { SupabaseClient } from '@supabase/supabase-js'

export interface PipelineRun {
  id: string
  pipeline_name: string
  archetype_id: string | null
  status: string
  started_at: string
  current_stage: string | null
  cost_usd: number
  triggered_by: string
  input_json?: any
}

export interface StageContext {
  runId: string
  archetypeId: string | null
  sb: SupabaseClient
  signal: AbortSignal
  log: (msg: string) => void
  cost: (model: string, inTokens: number, outTokens: number, usd: number) => Promise<void> | void
}

export interface StageResult<T = any> {
  output: T
  cost_usd?: number
}

export interface Stage<TIn = any, TOut = any> {
  name: string
  run: (ctx: StageContext, input: TIn) => Promise<StageResult<TOut>>
}

export interface Pipeline {
  name: string
  description: string
  stages: Stage<any, any>[]
}

// ───────────────────────────────────────────────────────────────────────────
// Registry
// ───────────────────────────────────────────────────────────────────────────

const PIPELINES = new Map<string, Pipeline>()

export function registerPipeline(p: Pipeline) {
  PIPELINES.set(p.name, p)
}

export function getPipeline(name: string): Pipeline | undefined {
  return PIPELINES.get(name)
}

export function allPipelines(): Pipeline[] {
  return Array.from(PIPELINES.values())
}

// Auto-register built-in pipelines on import. Sibling modules do the heavy
// lifting — this just wires them.
import { recomputeDerivedStage } from './stages/recompute-derived'
import { updateExistingRisksStage } from './stages/update-existing-risks'
import { pullSourcesStage } from './stages/pull-sources'
import { snapshotHedgePricesStage } from './stages/snapshot-hedge-prices'
import { diffAgainstPriorStage } from './stages/diff-against-prior'
import { computeAttentionStage } from './stages/compute-attention'
import { syncMarketProbabilitiesStage } from './stages/sync-market-probabilities'
import { estimateProbabilitiesOpusStage } from './stages/estimate-probabilities-opus'

registerPipeline({
  name: 'rebuild_archetype',
  description:
    'Recompute derived fields on an archetype (composite, risks_total, etc) without changing risks.',
  stages: [recomputeDerivedStage],
})

registerPipeline({
  name: 'daily_refresh',
  description:
    'Full daily refresh: pull adapters → compute attention → snapshot hedge prices → estimate probabilities (Opus, one call per archetype) → diff vs prior → Pass A LLM → recompute derived.',
  stages: [
    pullSourcesStage,
    computeAttentionStage,
    snapshotHedgePricesStage,
    // Opus produces analyst-calibrated probabilities; preferred over the
    // market YES (which carries liquidity premium). syncMarketProbabilitiesStage
    // is left registered for manual / standalone use.
    estimateProbabilitiesOpusStage,
    diffAgainstPriorStage,
    updateExistingRisksStage,
    recomputeDerivedStage,
  ],
})

// Standalone pipeline (callable independently): sync probabilities from the
// market YES via library/scraper. Not in daily_refresh anymore — Opus wins.
registerPipeline({
  name: 'sync_market_probabilities',
  description: 'Standalone: pull live YES from library/scraper and write to risk.probability for active risks with primary_hedge_ticker.',
  stages: [syncMarketProbabilitiesStage],
})

registerPipeline({
  name: 'pull_only',
  description: 'Just pull adapters → news_cache. No LLM. Cheap and idempotent.',
  stages: [pullSourcesStage],
})

registerPipeline({
  name: 'agent_smoke_test',
  description:
    'Pass A only, against a stub evidence packet on a single risk. Used to verify the LLM path end-to-end without adapters.',
  stages: [updateExistingRisksStage],
})
