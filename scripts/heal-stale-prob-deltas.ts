#!/usr/bin/env tsx
/**
 * Heal stale probability_delta values where every risk in an archetype
 * carries the same value — a fingerprint of an early bulk-seed run that
 * never got refreshed. With the new estimate_probabilities_opus +
 * sync_market_probabilities + apply.ts patches landing, real deltas will
 * accrue on every subsequent change. For now, zero the uniform ones so
 * the new UI badge doesn't display misleading data.
 *
 * Safe: only touches archetypes where ALL risks share the exact same
 * non-zero probability_delta (the only realistic uniform-bulk signature).
 */

import { config as loadEnv } from 'dotenv'
loadEnv({ path: '.env.local' })
loadEnv()
import WS from 'ws'
;(globalThis as any).WebSocket ??= WS

import { createServiceRoleClient } from '../src/lib/supabase/server'

async function main() {
  const sb = createServiceRoleClient()
  const { data } = await sb.from('archetypes').select('id, state, state_version').order('id')
  for (const row of data ?? []) {
    const state = row.state as any
    const details = state?.risk_details ?? {}
    const ids = Object.keys(details)
    if (ids.length < 3) continue
    const deltas = ids.map((id) => details[id]?.probability_delta)
    const nonzero = deltas.filter((d) => typeof d === 'number' && d !== 0)
    const uniq = new Set(nonzero)
    // Suspicious iff EVERY risk has the SAME non-zero delta. Real history
    // would never produce that.
    const uniform = nonzero.length === deltas.length && uniq.size === 1
    if (!uniform) {
      console.log(`  ${row.id.padEnd(20)} ok (${uniq.size} distinct non-zero deltas)`)
      continue
    }
    const shared = nonzero[0]
    console.log(`  ${row.id.padEnd(20)} HEAL: ${ids.length} risks all share delta=${shared}`)
    for (const id of ids) details[id].probability_delta = 0
    state.generated_at = new Date().toISOString()
    state.generated_by = 'script:heal-stale-prob-deltas'
    const newVersion = (row.state_version as number) + 1
    const { error: rpcErr } = await sb.rpc('apply_archetype_revision', {
      p_archetype_id: row.id,
      p_state_version: newVersion,
      p_state: state,
      p_proposal_id: null,
      p_applied_by: 'script:heal-stale-prob-deltas',
    })
    if (rpcErr) console.error(`     ✗ ${rpcErr.message}`)
    else console.log(`     ✓ v${newVersion}`)
  }
}
main().catch((e) => { console.error(e); process.exit(1) })
