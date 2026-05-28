#!/usr/bin/env tsx
/**
 * End-to-end smoke for the weekly_discover pipeline (Pass B).
 *
 * What it does:
 *   1. Picks an archetype (default offshore-wind — most data).
 *   2. Enqueues a `weekly_discover` run synchronously and waits for it.
 *      (Bypasses the worker by running the stages inline.)
 *   3. Reports: items pulled per adapter, items matched, new-risk proposals
 *      created, and dumps the Opus reasoning for each proposal.
 *
 * Usage:  tsx scripts/smoke-discover.ts [archetype_id]
 *
 * Doesn't apply any proposals — just queues them in the inbox for review.
 */

import { config as loadEnv } from 'dotenv'
loadEnv({ path: '.env.local' })
loadEnv()
import WS from 'ws'
;(globalThis as any).WebSocket ??= WS

import { createServiceRoleClient } from '../src/lib/supabase/server'
import { getPipeline } from '../src/lib/pipeline/registry'

const ARCHETYPE = process.argv[2] ?? 'offshore-wind'

async function main() {
  const sb = createServiceRoleClient()
  const pipeline = getPipeline('weekly_discover')
  if (!pipeline) throw new Error('weekly_discover pipeline not registered')

  console.log(`\nSmoke: weekly_discover on ${ARCHETYPE}`)
  console.log('───────────────────────────────────────────────')

  // Enqueue a run so the trace is captured.
  const { data: runRow, error: runErr } = await sb
    .from('pipeline_runs')
    .insert({
      pipeline_name: 'weekly_discover',
      archetype_id: ARCHETYPE,
      status: 'running',
      started_at: new Date().toISOString(),
      triggered_by: 'script:smoke-discover',
      claimed_by: 'script:smoke-discover',
      claimed_at: new Date().toISOString(),
      input_json: { since: new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString(), limit_per_adapter: 50 },
    })
    .select('id')
    .single()
  if (runErr || !runRow) throw new Error(`enqueue: ${runErr?.message ?? 'no row'}`)
  const runId = runRow.id

  const ctx = {
    runId,
    archetypeId: ARCHETYPE,
    sb,
    signal: new AbortController().signal,
    log: (m: string) => console.log(`  ${m}`),
    cost: async (model: string, _in: number, _out: number, usd: number) => {
      console.log(`  [cost] ${model}: $${usd.toFixed(4)}`)
    },
  }

  let lastOutput: any = { since: new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString(), limit_per_adapter: 50 }
  for (const stage of pipeline.stages) {
    console.log(`\n── stage: ${stage.name} ──`)
    const startedAt = Date.now()
    try {
      const result = await stage.run(ctx as any, lastOutput)
      lastOutput = result.output ?? lastOutput
      console.log(`✓ ${stage.name} done in ${Date.now() - startedAt}ms`)
      console.log(`  output (truncated):`, JSON.stringify(result.output)?.slice(0, 600))
      // Persist a pipeline_trace row so the run is visible in admin UI.
      await sb.from('pipeline_traces').insert({
        pipeline_run_id: runId,
        stage_name: stage.name,
        started_at: new Date(startedAt).toISOString(),
        completed_at: new Date().toISOString(),
        duration_ms: Date.now() - startedAt,
        input_json: null,
        output_json: result.output ?? null,
        cost_usd: result.cost_usd ?? 0,
      })
    } catch (e: any) {
      console.error(`✗ ${stage.name} failed:`, e?.message ?? e)
      await sb
        .from('pipeline_runs')
        .update({ status: 'failed', completed_at: new Date().toISOString(), error_message: e?.message ?? String(e) })
        .eq('id', runId)
      process.exit(1)
    }
  }
  await sb
    .from('pipeline_runs')
    .update({ status: 'completed', completed_at: new Date().toISOString() })
    .eq('id', runId)

  // Surface the proposals this run created.
  const { data: proposals } = await sb
    .from('proposals')
    .select('id, op, payload_json, reasoning, created_at')
    .eq('archetype_id', ARCHETYPE)
    .eq('op', 'add_risk')
    .eq('source', 'cron-passB')
    .gte('created_at', new Date(Date.now() - 10 * 60 * 1000).toISOString())
    .order('created_at', { ascending: false })
  console.log(`\n── proposals created (${proposals?.length ?? 0}) ──`)
  for (const p of proposals ?? []) {
    const title = (p.payload_json as any)?.risk?.title ?? '(untitled)'
    const cite = (p.payload_json as any)?.risk?.citation ?? ''
    const prob = (p.payload_json as any)?.risk?.probability ?? null
    const irr = (p.payload_json as any)?.risk?.impact_irr ?? null
    console.log(`\n[${p.id.slice(0, 8)}] ${title}`)
    console.log(`  citation: ${cite}`)
    console.log(`  probability: ${prob}  ·  impact_irr: ${irr}`)
    console.log(`  reasoning: ${p.reasoning?.slice(0, 400)}`)
  }
  console.log('\n✓ smoke complete')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
