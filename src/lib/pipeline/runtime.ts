/**
 * Pipeline runtime — the worker-side machinery for executing a pipeline_runs
 * row stage by stage, with checkpoints, abort polling, and cost telemetry.
 *
 * Web (the Next.js app) enqueues runs. The worker (scripts/worker.ts) calls
 * claim_next_run() and then `executePipeline(run)` to do the actual work.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { getPipeline, type PipelineRun, type Stage, type StageResult } from './registry'

export class RunAborted extends Error {
  constructor() {
    super('run aborted')
    this.name = 'RunAborted'
  }
}

interface ExecuteOptions {
  sb?: SupabaseClient
  /** Called when the orchestrator wants to surface a log line. Default = console. */
  onLog?: (line: string, meta?: Record<string, any>) => void
}

export async function executePipeline(run: PipelineRun, opts: ExecuteOptions = {}): Promise<void> {
  const sb = opts.sb ?? createServiceRoleClient()
  const log = opts.onLog ?? defaultLog
  const pipeline = getPipeline(run.pipeline_name)
  if (!pipeline) {
    await markFailed(sb, run.id, `unknown pipeline: ${run.pipeline_name}`)
    return
  }

  // Move to 'running' on first stage start.
  await sb
    .from('pipeline_runs')
    .update({ status: 'running', current_stage: pipeline.stages[0]?.name ?? null })
    .eq('id', run.id)

  // Load any prior checkpoints (resume).
  const checkpoints = await loadCheckpoints(sb, run.id)
  let input: any = run.input_json ?? null

  // Walk the stages.
  for (const stage of pipeline.stages) {
    // Abort check at every stage boundary.
    if (await isAbortRequested(sb, run.id)) {
      await markAborted(sb, run.id, `aborted before ${stage.name}`)
      return
    }

    const prior = checkpoints.get(stage.name)
    if (prior?.output_json) {
      log(`▸ ${stage.name} (cached)`, { kind: 'stage' })
      input = prior.output_json
      continue
    }

    log(`▸ ${stage.name}`, { kind: 'stage' })

    // Begin trace row.
    const traceId = await beginStageTrace(sb, run.id, stage.name, input)
    await sb.from('pipeline_runs').update({ current_stage: stage.name }).eq('id', run.id)

    const t0 = Date.now()
    let result: StageResult
    try {
      result = await stage.run(
        {
          runId: run.id,
          archetypeId: run.archetype_id,
          sb,
          signal: makeAbortSignal(sb, run.id),
          log: (msg: string) => log(`  ${msg}`, { kind: 'log', stage: stage.name }),
          cost: async (model, inTok, outTok, usd) => {
            log(`  $${usd.toFixed(4)} (${model}: ${inTok}/${outTok} tok)`, { kind: 'cost', stage: stage.name })
            await sb
              .from('pipeline_runs')
              .update({ cost_usd: (run.cost_usd ?? 0) + usd })
              .eq('id', run.id)
          },
        },
        input,
      )
    } catch (err) {
      const dt = Date.now() - t0
      if (err instanceof RunAborted) {
        await markAborted(sb, run.id, `aborted in ${stage.name}`)
        await finishStageTrace(sb, traceId, null, dt, 'aborted', 0)
        return
      }
      const msg = err instanceof Error ? err.message : String(err)
      log(`  ✗ ${msg}`, { kind: 'error', stage: stage.name })
      await finishStageTrace(sb, traceId, null, dt, msg, 0)
      await markFailed(sb, run.id, `${stage.name}: ${msg}`)
      return
    }

    const dt = Date.now() - t0
    await finishStageTrace(sb, traceId, result.output ?? null, dt, null, result.cost_usd ?? 0)
    log(`  ✓ ${stage.name} (${dt}ms)`, { kind: 'log', stage: stage.name })
    input = result.output ?? null
  }

  // Done.
  await sb
    .from('pipeline_runs')
    .update({ status: 'completed', completed_at: new Date().toISOString(), current_stage: null })
    .eq('id', run.id)
}

// ───────────────────────────────────────────────────────────────────────────
// Persistence helpers
// ───────────────────────────────────────────────────────────────────────────

async function loadCheckpoints(sb: SupabaseClient, runId: string) {
  const { data } = await sb
    .from('pipeline_traces')
    .select('stage_name, output_json')
    .eq('pipeline_run_id', runId)
    .not('output_json', 'is', null)
  const map = new Map<string, { output_json: any }>()
  for (const row of data ?? []) map.set(row.stage_name, { output_json: row.output_json })
  return map
}

async function beginStageTrace(
  sb: SupabaseClient,
  runId: string,
  stageName: string,
  input: any,
): Promise<number | null> {
  // UPSERT-like behaviour via the unique index on (run, stage). If a prior
  // failed attempt left a row, replace it.
  await sb
    .from('pipeline_traces')
    .delete()
    .eq('pipeline_run_id', runId)
    .eq('stage_name', stageName)

  const { data, error } = await sb
    .from('pipeline_traces')
    .insert({
      pipeline_run_id: runId,
      stage_name: stageName,
      input_json: input,
      started_at: new Date().toISOString(),
    })
    .select('id')
    .single()
  if (error) {
    console.warn('[pipeline] beginStageTrace failed:', error.message)
    return null
  }
  return data?.id ?? null
}

async function finishStageTrace(
  sb: SupabaseClient,
  traceId: number | null,
  output: any,
  durationMs: number,
  error: string | null,
  costUsd: number,
) {
  if (traceId == null) return
  await sb
    .from('pipeline_traces')
    .update({
      output_json: output,
      duration_ms: durationMs,
      error,
      cost_usd: costUsd,
      completed_at: new Date().toISOString(),
    })
    .eq('id', traceId)
}

async function isAbortRequested(sb: SupabaseClient, runId: string): Promise<boolean> {
  const { data } = await sb.from('pipeline_runs').select('abort_requested').eq('id', runId).single()
  return !!data?.abort_requested
}

function makeAbortSignal(sb: SupabaseClient, runId: string): AbortSignal {
  // A signal we can let stages forward to fetch() etc. Polled by long-running
  // stage code via signal.aborted; we don't drive it from a single .abort()
  // call because the trigger lives in another process (the web service).
  const ctrl = new AbortController()
  ;(async () => {
    while (!ctrl.signal.aborted) {
      if (await isAbortRequested(sb, runId)) {
        ctrl.abort()
        return
      }
      await new Promise((r) => setTimeout(r, 1000))
    }
  })()
  return ctrl.signal
}

async function markFailed(sb: SupabaseClient, runId: string, msg: string) {
  await sb
    .from('pipeline_runs')
    .update({
      status: 'failed',
      error_message: msg,
      completed_at: new Date().toISOString(),
    })
    .eq('id', runId)
}

async function markAborted(sb: SupabaseClient, runId: string, msg: string) {
  await sb
    .from('pipeline_runs')
    .update({
      status: 'aborted',
      error_message: msg,
      completed_at: new Date().toISOString(),
    })
    .eq('id', runId)
}

function defaultLog(line: string, _meta?: any) {
  console.log(line)
}
