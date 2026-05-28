/**
 * One-shot runner: fire estimate_probabilities_opus across every archetype.
 *
 *   pnpm tsx scripts/run-opus-estimates.ts
 *
 * Used to seed Opus-derived probabilities outside the daily cron cadence
 * (e.g. right after deploying the new stage). Idempotent — re-running is
 * cheap and only writes a revision if estimates move ≥ 1pp.
 */

import { config as loadEnv } from 'dotenv'
loadEnv({ path: '.env.local' })
loadEnv()
import WS from 'ws'
;(globalThis as any).WebSocket ??= WS

import { createServiceRoleClient } from '../src/lib/supabase/server'
import { estimateProbabilitiesOpusStage } from '../src/lib/pipeline/stages/estimate-probabilities-opus'
import { randomUUID } from 'node:crypto'

const ARCHETYPES = ['offshore-wind', 'utility-solar', 'battery-storage', 'natural-gas', 'nuclear-smr', 'ev-charging']

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY required')
  const sb = createServiceRoleClient()
  const controller = new AbortController()
  let totalCost = 0
  let totalChanged = 0
  for (const aid of ARCHETYPES) {
    console.log(`\n=== ${aid} ===`)
    const runId = randomUUID()
    const ctx = {
      runId,
      archetypeId: aid,
      sb: sb as any,
      signal: controller.signal,
      log: (msg: string) => console.log(msg),
      cost: async (_model: string, _inTok: number, _outTok: number, usd: number) => {
        totalCost += usd
      },
    }
    try {
      const result = await estimateProbabilitiesOpusStage.run(ctx, null)
      const out = result.output
      console.log(`  → changed=${out.changed}  applied=${out.applied.length}  active=${out.active_count}  realized=${out.realized_skipped}`)
    } catch (e) {
      console.error(`  FAIL: ${(e as Error).message}`)
    }
  }
  console.log(`\n──────────────\nTotal cost: $${totalCost.toFixed(4)}`)
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })
