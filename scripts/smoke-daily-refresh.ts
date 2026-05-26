/**
 * End-to-end smoke for M7 + M6: pull_sources → snapshot → diff → Pass A.
 *
 *   npx tsx scripts/smoke-daily-refresh.ts [archetype_id]
 *
 * Defaults to offshore-wind. Hits real adapters (Federal Register + RSS),
 * runs the matcher, builds an EvidencePacket, runs Pass A on Anthropic,
 * lands proposals in the inbox.
 */

import { config as loadEnv } from 'dotenv'
loadEnv({ path: '.env.local' })
loadEnv()
import WS from 'ws'
;(globalThis as any).WebSocket ??= WS

import { createServiceRoleClient } from '../src/lib/supabase/server'
import { executePipeline } from '../src/lib/pipeline/runtime'
import '../src/lib/pipeline/registry'

async function main() {
  const archetypeId = process.argv[2] ?? 'offshore-wind'
  const sinceDays = Number(process.argv[3] ?? 14) // wider window for smoke

  const sb = createServiceRoleClient()

  const { data: row, error } = await sb
    .from('pipeline_runs')
    .insert({
      pipeline_name: 'daily_refresh',
      archetype_id: archetypeId,
      status: 'queued',
      triggered_by: 'smoke-script-daily',
      input_json: {
        since: new Date(Date.now() - sinceDays * 86400_000).toISOString(),
        limit_per_adapter: 30,
      },
    })
    .select('*')
    .single()
  if (error) throw error
  console.log(`→ daily_refresh ${row.id} on ${archetypeId} (last ${sinceDays}d)`)

  await executePipeline(row as any, { sb, onLog: (line) => console.log(line) })

  const { data: final } = await sb
    .from('pipeline_runs')
    .select('status, cost_usd, error_message')
    .eq('id', row.id)
    .single()
  console.log('final:', final)

  const { data: traces } = await sb
    .from('pipeline_traces')
    .select('stage_name, duration_ms, output_json, error')
    .eq('pipeline_run_id', row.id)
    .order('id')
  console.log('\nstage summary:')
  for (const t of traces ?? []) {
    const out = t.output_json ?? {}
    const summary = stageSummary(t.stage_name, out)
    console.log(
      `  [${t.stage_name}] ${t.duration_ms}ms${t.error ? ` ✗ ${t.error}` : ''} → ${summary}`,
    )
  }

  const { data: proposals } = await sb
    .from('proposals')
    .select('id, op, target, reasoning, payload_json')
    .eq('created_by', `pipeline:${row.id}`)
  console.log(`\n${proposals?.length ?? 0} proposals queued:`)
  for (const p of proposals ?? []) {
    console.log(`  [${p.op}] ${p.target ?? '-'}: ${p.reasoning.slice(0, 140)}`)
  }
}

function stageSummary(name: string, out: any): string {
  switch (name) {
    case 'pull_sources':
      return `${out.fetched ?? 0} fetched, ${out.matched_to_risks ?? 0} matched, ${out.persisted ?? 0} persisted`
    case 'snapshot_hedge_prices':
      return `${out.tickers?.length ?? 0} tickers, ${Object.keys(out.prices ?? {}).length} priced, ${out.missing?.length ?? 0} missing`
    case 'diff_against_prior':
      return `${out.risks_with_changes ?? 0} risks affected, ${out.total_news_attached ?? 0} news, ${out.total_hedge_moves ?? 0} moves`
    case 'update_existing_risks':
      return `${out.total_proposals ?? 0} proposals, $${(out.total_cost_usd ?? 0).toFixed(4)}`
    case 'recompute_derived':
      return `composite ${out.composite ?? '?'}`
    default:
      return JSON.stringify(out).slice(0, 100)
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
