#!/usr/bin/env tsx
/**
 * Heal `attention_delta` in every archetype bundle.
 *
 * Background: a prior compute_attention stage wrote `attention_delta` as a
 * fractional value in [-1, 1] (the daily delta as a percentage of full
 * scale), but the schema demands `z.number().int()`. Older deployed builds
 * crash on parse. The new schema coerces, and the new compute_attention
 * stage writes integers — but the data in prod still contains floats from
 * earlier runs and crashes the live web service.
 *
 * This script reads every archetype, rounds every risk_detail.attention_delta
 * to an integer, and writes back through the audited revision RPC. Safe to
 * re-run; idempotent.
 */

import { config as loadEnv } from 'dotenv'
loadEnv({ path: '.env.local' })
loadEnv()
import WS from 'ws'
;(globalThis as any).WebSocket ??= WS

import { createServiceRoleClient } from '../src/lib/supabase/server'

async function main() {
  const sb = createServiceRoleClient()
  const { data: archs, error } = await sb
    .from('archetypes')
    .select('id, state, state_version')
    .order('id')
  if (error) throw new Error(error.message)
  console.log(`scanning ${archs?.length ?? 0} archetypes for fractional attention_delta`)

  for (const row of archs ?? []) {
    const state = row.state as any
    const details = state?.risk_details ?? {}
    let touched = 0
    for (const rid of Object.keys(details)) {
      const d = details[rid]
      const v = d?.attention_delta
      if (typeof v === 'number' && !Number.isInteger(v)) {
        d.attention_delta = Math.round(v)
        touched++
      }
    }
    if (touched === 0) {
      console.log(`  ${row.id.padEnd(20)} clean`)
      continue
    }
    state.generated_at = new Date().toISOString()
    state.generated_by = 'script:heal-attention-delta'
    const newVersion = (row.state_version as number) + 1
    const { error: rpcErr } = await sb.rpc('apply_archetype_revision', {
      p_archetype_id: row.id,
      p_state_version: newVersion,
      p_state: state,
      p_proposal_id: null,
      p_applied_by: 'script:heal-attention-delta',
    })
    if (rpcErr) {
      console.error(`  ${row.id.padEnd(20)} FAILED: ${rpcErr.message}`)
    } else {
      console.log(`  ${row.id.padEnd(20)} healed ${touched} risk_detail${touched === 1 ? '' : 's'} → v${newVersion}`)
    }
  }
  console.log('\n✓ done')
}
main().catch((e) => { console.error(e); process.exit(1) })
