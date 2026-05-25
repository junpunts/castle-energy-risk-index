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

registerPipeline({
  name: 'rebuild_archetype',
  description:
    'Recompute derived fields on an archetype (composite, risks_total, etc) without changing risks.',
  stages: [recomputeDerivedStage],
})

registerPipeline({
  name: 'daily_refresh',
  description: 'Full daily refresh (pull → diff → LLM updates → apply). Stub for now.',
  stages: [
    // Reuse recompute as a placeholder so the worker has *something* to do.
    recomputeDerivedStage,
  ],
})
