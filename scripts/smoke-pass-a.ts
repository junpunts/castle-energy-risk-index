/**
 * Pass A smoke test. Runs against the live dev Supabase + Anthropic.
 *
 *   pnpm tsx scripts/smoke-pass-a.ts <archetype_id> <risk_id>
 *
 * Inserts a pipeline_runs row for the 'agent_smoke_test' pipeline with a
 * stub evidence packet, executes it inline (no worker needed), and reports
 * the resulting proposals.
 */

import { config as loadEnv } from 'dotenv'
loadEnv({ path: '.env.local' })
loadEnv() // fallback to .env
// Node 20 doesn't ship a global WebSocket; supabase-js's realtime client
// blows up on construction without one. Polyfill before any supabase import.
import WS from 'ws'
;(globalThis as any).WebSocket ??= WS

import { createServiceRoleClient } from '../src/lib/supabase/server'
import { executePipeline } from '../src/lib/pipeline/runtime'
import '../src/lib/pipeline/registry' // side-effect: registers built-ins

async function main() {
  const archetypeId = process.argv[2] ?? 'offshore-wind'
  const riskId = process.argv[3] ?? 'ow5'

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY)
    throw new Error('Missing Supabase env vars')
  if (!process.env.ANTHROPIC_API_KEY) throw new Error('Missing ANTHROPIC_API_KEY')

  const sb = createServiceRoleClient()

  const input = {
    changes: {
      [riskId]: {
        risk_id: riskId,
        news: [
          {
            source: 'BOEM',
            title:
              'BOEM issues notice of intent to prepare programmatic EIS for Atlantic offshore wind leasing; 60-day comment period opens.',
            sum: 'The Bureau cited the new administration\'s Jan 20 EO directing re-review of all pending lease sales. A PEIS process typically takes 18–24 months and freezes new auctions in the meantime.',
            published_at: new Date().toISOString(),
            url: 'https://example.com/boem-peis-noi',
          },
          {
            source: 'POLITICO',
            title: 'White House directs Interior to pause all pending offshore wind lease sales indefinitely.',
            published_at: new Date().toISOString(),
            url: 'https://example.com/politico-pause',
          },
        ],
        hedge_moves: [],
      },
    },
  }

  console.log(`→ smoke test: pass A on ${archetypeId}/${riskId}`)

  const { data: row, error } = await sb
    .from('pipeline_runs')
    .insert({
      pipeline_name: 'agent_smoke_test',
      archetype_id: archetypeId,
      status: 'queued',
      triggered_by: 'smoke-script',
      input_json: input,
    })
    .select('*')
    .single()
  if (error) throw error
  console.log(`  enqueued run ${row.id}`)

  await executePipeline(row as any, { sb, onLog: (line) => console.log(line) })

  const { data: final } = await sb
    .from('pipeline_runs')
    .select('status, cost_usd, error_message, completed_at')
    .eq('id', row.id)
    .single()
  console.log('final:', final)

  const { data: proposals } = await sb
    .from('proposals')
    .select('id, op, target, reasoning, payload_json, status')
    .eq('created_by', `pipeline:${row.id}`)
  console.log(`\n${proposals?.length ?? 0} proposals generated:`)
  for (const p of proposals ?? []) {
    console.log(`  [${p.op}] ${p.target ?? '-'}: ${p.reasoning.slice(0, 120)}`)
    console.log(`    payload: ${JSON.stringify(p.payload_json).slice(0, 200)}`)
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
