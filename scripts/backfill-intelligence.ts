#!/usr/bin/env tsx
/**
 * Backfill `bundle.intelligence` for the six existing archetypes.
 *
 * Pushes through the audited apply_archetype_revision RPC so the change
 * is tracked in archetype_revisions just like any other state mutation.
 *
 * Usage:  tsx scripts/backfill-intelligence.ts [archetype_id|all]
 */

import { config as loadEnv } from 'dotenv'
loadEnv({ path: '.env.local' })
loadEnv()
import WS from 'ws'
;(globalThis as any).WebSocket ??= WS

import { createServiceRoleClient } from '../src/lib/supabase/server'
import {
  parseArchetypeBundle,
  type ArchetypeIntelligence,
} from '../src/lib/schemas'

const INTELLIGENCE_BY_ARCHETYPE: Record<string, ArchetypeIntelligence> = {
  'offshore-wind': {
    sponsors: [
      { name: 'Avangrid', cik: '0001634910', ticker: 'AGR' },
      { name: 'Dominion Energy', cik: '0000715957', ticker: 'D' },
      { name: 'Eversource Energy', cik: '0001125345', ticker: 'ES' },
      { name: 'Equinor ASA', cik: '0001140625', ticker: 'EQNR' },
    ],
    litigation_queries: [
      '"BOEM" AND "offshore wind"',
      '"Vineyard Wind"',
      '"Empire Wind"',
      '"OREC" AND solicitation',
      '"offshore wind lease"',
    ],
    transcript_companies: [
      { name: 'Avangrid', ticker: 'AGR' },
      { name: 'Dominion Energy', ticker: 'D' },
      { name: 'Eversource Energy', ticker: 'ES' },
    ],
  },
  'utility-solar': {
    sponsors: [
      { name: 'NextEra Energy', cik: '0000753308', ticker: 'NEE' },
      { name: 'AES Corp', cik: '0000874761', ticker: 'AES' },
      { name: 'First Solar', cik: '0001274494', ticker: 'FSLR' },
      { name: 'Sunrun', cik: '0001469367', ticker: 'RUN' },
      { name: 'Sunnova Energy', cik: '0001772695', ticker: 'NOVA' },
    ],
    litigation_queries: [
      '"AD/CVD" AND solar',
      '"Section 201" AND solar',
      '"UFLPA" AND solar',
      '"Auxin Solar"',
      '"Solar IV"',
    ],
    transcript_companies: [
      { name: 'NextEra Energy', ticker: 'NEE' },
      { name: 'First Solar', ticker: 'FSLR' },
      { name: 'Sunrun', ticker: 'RUN' },
      { name: 'AES', ticker: 'AES' },
    ],
  },
  'battery-storage': {
    sponsors: [
      { name: 'Fluence Energy', cik: '0001868941', ticker: 'FLNC' },
      { name: 'Tesla', cik: '0001318605', ticker: 'TSLA' },
      { name: 'Vistra', cik: '0001692819', ticker: 'VST' },
    ],
    litigation_queries: [
      '"Section 301" AND battery',
      '"battery energy storage" AND fire',
      '"BESS" AND injunction',
      '"FEOC" AND battery',
    ],
    transcript_companies: [
      { name: 'Fluence Energy', ticker: 'FLNC' },
      { name: 'Tesla', ticker: 'TSLA' },
      { name: 'Vistra', ticker: 'VST' },
    ],
  },
  'natural-gas': {
    sponsors: [
      { name: 'Vistra', cik: '0001692819', ticker: 'VST' },
      { name: 'Cheniere Energy', cik: '0001596532', ticker: 'LNG' },
      { name: 'Sempra', cik: '0001032208', ticker: 'SRE' },
      { name: 'Williams Companies', cik: '0000107263', ticker: 'WMB' },
    ],
    litigation_queries: [
      '"CP2 LNG"',
      '"NEPA" AND pipeline',
      '"natural gas export"',
      '"FERC certificate" AND pipeline',
    ],
    transcript_companies: [
      { name: 'Vistra', ticker: 'VST' },
      { name: 'Cheniere Energy', ticker: 'LNG' },
      { name: 'Williams Companies', ticker: 'WMB' },
      { name: 'Sempra', ticker: 'SRE' },
    ],
  },
  'nuclear-smr': {
    sponsors: [
      { name: 'Constellation Energy', cik: '0001868275', ticker: 'CEG' },
      { name: 'NuScale Power', cik: '0001650164', ticker: 'SMR' },
    ],
    litigation_queries: [
      '"Nuclear Regulatory Commission" AND construction',
      '"Beyond Nuclear"',
      '"BWRX-300"',
      '"small modular reactor" AND petition',
    ],
    transcript_companies: [
      { name: 'Constellation Energy', ticker: 'CEG' },
      { name: 'NuScale Power', ticker: 'SMR' },
    ],
  },
  'ev-charging': {
    sponsors: [
      { name: 'ChargePoint', cik: '0001777393', ticker: 'CHPT' },
      { name: 'EVgo', cik: '0001823766', ticker: 'EVGO' },
      { name: 'Blink Charging', cik: '0001429764', ticker: 'BLNK' },
    ],
    litigation_queries: [
      '"NEVI" AND petition',
      '"Build America Buy America" AND charger',
      '"EV charging" AND waiver',
    ],
    transcript_companies: [
      { name: 'ChargePoint', ticker: 'CHPT' },
      { name: 'EVgo', ticker: 'EVGO' },
      { name: 'Tesla', ticker: 'TSLA' },
    ],
  },
}

async function backfill(archetypeId: string) {
  const sb = createServiceRoleClient()
  const intelligence = INTELLIGENCE_BY_ARCHETYPE[archetypeId]
  if (!intelligence) {
    console.error(`No intelligence config for ${archetypeId}; skipping`)
    return
  }
  const { data, error } = await sb
    .from('archetypes')
    .select('state, state_version')
    .eq('id', archetypeId)
    .single()
  if (error || !data) {
    console.error(`Failed to load ${archetypeId}: ${error?.message ?? 'missing'}`)
    return
  }
  let bundle
  try {
    bundle = parseArchetypeBundle(data.state)
  } catch (e: any) {
    console.error(`Invalid bundle for ${archetypeId}: ${e?.message ?? e}`)
    return
  }
  const next = { ...bundle, intelligence }
  next.generated_at = new Date().toISOString()
  next.generated_by = 'script:backfill-intelligence'
  const newVersion = data.state_version + 1
  const { error: rpcErr } = await sb.rpc('apply_archetype_revision', {
    p_archetype_id: archetypeId,
    p_state_version: newVersion,
    p_state: next,
    p_proposal_id: null,
    p_applied_by: 'script:backfill-intelligence',
  })
  if (rpcErr) {
    console.error(`apply_archetype_revision ${archetypeId}: ${rpcErr.message}`)
    return
  }
  console.log(
    `✓ ${archetypeId}: ${intelligence.sponsors.length} sponsors, ${intelligence.litigation_queries.length} queries, ${intelligence.transcript_companies.length} transcripts → v${newVersion}`,
  )
}

async function main() {
  const target = process.argv[2] ?? 'all'
  const ids =
    target === 'all'
      ? Object.keys(INTELLIGENCE_BY_ARCHETYPE)
      : [target]
  for (const id of ids) await backfill(id)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
