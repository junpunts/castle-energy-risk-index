#!/usr/bin/env tsx
/**
 * One-shot: remove the ev8 smoke-test risk left behind on ev-charging by
 * scripts/smoke-add-risk.ts. Goes through the audited proposal flow so the
 * removal lands in archetype_revisions like any other change.
 *
 * Verifies the risk is the smoke-test risk (matches "SMOKE TEST" in the title)
 * before doing anything, so this script can't accidentally remove a real risk.
 */

import { config as loadEnv } from 'dotenv'
loadEnv({ path: '.env.local' })
loadEnv()
import WS from 'ws'
;(globalThis as any).WebSocket ??= WS

import { createServiceRoleClient } from '../src/lib/supabase/server'
import { applyProposal } from '../src/lib/archetypes/apply'

async function main() {
  const sb = createServiceRoleClient()
  const { data: arch, error } = await sb
    .from('archetypes')
    .select('state, state_version')
    .eq('id', 'ev-charging')
    .single()
  if (error || !arch) throw new Error(`load: ${error?.message ?? 'missing'}`)
  const state = arch.state as any
  const target = state.risks.find((r: any) => r.id === 'ev8')
  if (!target) {
    console.log('ev8 not found — nothing to remove')
    return
  }
  if (!/SMOKE TEST/i.test(target.title)) {
    console.error(`ev8 title does not look like a smoke-test ("${target.title}") — aborting for safety`)
    process.exit(2)
  }
  console.log(`Found ev8: ${target.title}`)
  console.log(`  prob=${target.probability}  irr=${target.impact_irr}  usd=$${(target.impact_usd / 1e6).toFixed(0)}M`)

  // Queue a remove_risk proposal.
  const { data: prop, error: propErr } = await sb
    .from('proposals')
    .insert({
      archetype_id: 'ev-charging',
      op: 'remove_risk',
      target: 'ev8',
      payload_json: { risk_id: 'ev8' },
      reasoning:
        'Removing ev8 — it is a smoke-test artifact from scripts/smoke-add-risk.ts whose cleanup didn\'t fire. Title literally reads "SMOKE TEST ...". The mechanism it describes (BABA waiver tightening) is already covered by ev3.',
      source: 'manual',
      created_by: 'script:remove-ev8-smoketest',
      status: 'pending',
    })
    .select('id')
    .single()
  if (propErr || !prop) throw new Error(`insert proposal: ${propErr?.message ?? 'no row'}`)
  console.log(`  Proposal queued: ${prop.id}`)

  // Apply.
  const result = await applyProposal(prop.id, 'script:remove-ev8-smoketest')
  if (!result.ok) {
    console.error(`  ✗ apply failed: ${result.code} — ${result.message}`)
    process.exit(3)
  }
  console.log(`  ✓ applied → revision ${result.revisionId} → v${result.newVersion}`)

  // Verify.
  const { data: after } = await sb
    .from('archetypes')
    .select('state, state_version')
    .eq('id', 'ev-charging')
    .single()
  const newState = after?.state as any
  console.log(`  After: ${newState?.risks?.length ?? '?'} risks, v${after?.state_version}`)
  console.log(`  ids: ${newState?.risks?.map((r: any) => r.id).join(', ')}`)
}
main().catch((e) => { console.error(e); process.exit(1) })
