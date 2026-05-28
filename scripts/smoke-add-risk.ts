#!/usr/bin/env tsx
/**
 * End-to-end test for the `add_risk` apply path (M1.1 acceptance).
 *
 * Flow:
 *   1. Insert a synthetic Pass-B-style add_risk proposal for a target archetype.
 *   2. Run applyProposal() — same path /api/admin/proposals/:id/apply uses.
 *   3. Read back the archetype state and confirm the new risk landed.
 *   4. Reject (don't apply) any extra proposals — leaves the DB clean
 *      unless the user passes --keep.
 *
 * Usage:   tsx scripts/smoke-add-risk.ts [archetype_id] [--keep]
 * Default: ev-charging (smallest active risk list, least disruption).
 */

import { config as loadEnv } from 'dotenv'
loadEnv({ path: '.env.local' })
loadEnv()
import WS from 'ws'
;(globalThis as any).WebSocket ??= WS

import { createServiceRoleClient } from '../src/lib/supabase/server'
import { applyProposal } from '../src/lib/archetypes/apply'
import { parseArchetypeBundle } from '../src/lib/schemas'

async function main() {
  const ARCHETYPE = process.argv[2] ?? 'ev-charging'
  const KEEP = process.argv.includes('--keep')
  const sb = createServiceRoleClient()

  console.log(`\nSmoke: add_risk apply on ${ARCHETYPE}`)
  console.log('───────────────────────────────────────────────')

  // Read state BEFORE.
  const { data: before, error: beforeErr } = await sb
    .from('archetypes')
    .select('state, state_version')
    .eq('id', ARCHETYPE)
    .single()
  if (beforeErr || !before) throw new Error(`load: ${beforeErr?.message ?? 'missing'}`)
  const bundleBefore = parseArchetypeBundle(before.state)
  const riskCountBefore = bundleBefore.risks.length
  console.log(`  Before: ${riskCountBefore} risks (v${before.state_version})`)
  console.log(`  Existing ids: ${bundleBefore.risks.map((r) => r.id).join(', ')}`)

  // Synthesize a plausible new-risk proposal.
  const sentinel = `SMOKE TEST · BABA waiver expiry tightening (${new Date().toISOString().slice(0, 10)})`
  const proposalPayload = {
    risk: {
      category: 'policy',
      title: sentinel,
      citation: '23 CFR 635.410 smoke',
      impact_irr: -1.2,
      impact_usd: 25_000_000,
      probability: 0.55,
      attention: 25,
      likelihood: 'medium',
      headline_change: '+0',
      status: 'active',
      driver: 'cost',
    },
    risk_detail: {
      subtitle: 'Smoke test — FHWA tightens BABA component thresholds, no waiver path.',
      view:
        'BABA waiver expiry by year-end forces 55% U.S. component sourcing. Hedge via the BABA-waiver-extension market while domestic transformer capacity catches up.',
      tracked_since: new Date().toISOString().slice(0, 10),
      hedges: [
        {
          ticker: 'TBD',
          title: 'Smoke test hedge — analyst to map a real contract',
          yes: 0.5,
          change: 0,
          expiry: 'TBD',
          notional: 0,
        },
      ],
      news: [],
      events: [
        {
          date: new Date().toISOString().slice(0, 10),
          when: 'today',
          kind: 'castle',
          future: false,
          now: true,
          title: 'Smoke test — Pass B add_risk',
          detail: 'Inserted by scripts/smoke-add-risk.ts',
        },
      ],
    },
  }

  // Insert the proposal row.
  const { data: prop, error: propErr } = await sb
    .from('proposals')
    .insert({
      archetype_id: ARCHETYPE,
      op: 'add_risk',
      target: null,
      payload_json: proposalPayload,
      reasoning:
        'Smoke test inserted by scripts/smoke-add-risk.ts — exercises the M1.1 add_risk apply path end-to-end.',
      source: 'cron-passB',
      created_by: 'script:smoke-add-risk',
      status: 'pending',
    })
    .select('id')
    .single()
  if (propErr || !prop) throw new Error(`insert proposal: ${propErr?.message ?? 'no row'}`)
  console.log(`  Proposal queued: ${prop.id}`)

  // Apply it.
  const result = await applyProposal(prop.id, 'script:smoke-add-risk')
  if (!result.ok) {
    console.error(`  ✗ apply failed: ${result.code} — ${result.message}`)
    process.exit(2)
  }
  console.log(`  ✓ applied  → revision ${result.revisionId}  → v${result.newVersion}`)

  // Read state AFTER.
  const { data: after, error: afterErr } = await sb
    .from('archetypes')
    .select('state, state_version')
    .eq('id', ARCHETYPE)
    .single()
  if (afterErr || !after) throw new Error(`reload: ${afterErr?.message ?? 'missing'}`)
  const bundleAfter = parseArchetypeBundle(after.state)
  const riskCountAfter = bundleAfter.risks.length
  console.log(`  After: ${riskCountAfter} risks (v${after.state_version})`)
  const newRisk = bundleAfter.risks.find((r) => r.title === sentinel)
  if (!newRisk) {
    console.error(`  ✗ new risk not found in bundle`)
    process.exit(3)
  }
  console.log(`  ✓ new risk: ${newRisk.id} — ${newRisk.title}`)
  console.log(`     status: ${newRisk.status}`)
  console.log(`     driver: ${newRisk.driver ?? '(unset)'}`)
  console.log(`     probability: ${newRisk.probability}`)
  console.log(`     impact_irr: ${newRisk.impact_irr}pp · impact_usd: $${(newRisk.impact_usd / 1e6).toFixed(0)}M`)

  // Cleanup (default).
  if (!KEEP) {
    console.log(`  Cleaning up…`)
    const restoredBundle = {
      ...bundleAfter,
      risks: bundleAfter.risks.filter((r) => r.title !== sentinel),
      risk_details: Object.fromEntries(
        Object.entries(bundleAfter.risk_details).filter(([id]) => id !== newRisk.id),
      ),
      generated_at: new Date().toISOString(),
      generated_by: 'script:smoke-add-risk:cleanup',
    }
    // Re-derive composite et al.
    const { deriveAll } = await import('../src/lib/archetypes/derive')
    const restored = deriveAll(restoredBundle as any)
    const { error: cleanupErr } = await sb.rpc('apply_archetype_revision', {
      p_archetype_id: ARCHETYPE,
      p_state_version: after.state_version + 1,
      p_state: restored,
      p_proposal_id: null,
      p_applied_by: 'script:smoke-add-risk:cleanup',
    })
    if (cleanupErr) {
      console.warn(`  ! cleanup failed: ${cleanupErr.message}  (pass --keep to leave the risk in place)`)
    } else {
      console.log(`  ✓ cleanup OK — bundle restored to ${riskCountBefore} risks`)
    }
  }

  console.log('\n✓ smoke complete')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
