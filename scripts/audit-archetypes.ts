#!/usr/bin/env tsx
/**
 * One-shot audit — dump every archetype's risk roster in a compact form
 * for a human read-through.
 */

import { config as loadEnv } from 'dotenv'
loadEnv({ path: '.env.local' })
loadEnv()
import WS from 'ws'
;(globalThis as any).WebSocket ??= WS

import { createServiceRoleClient } from '../src/lib/supabase/server'

async function main() {
  const sb = createServiceRoleClient()
  const { data } = await sb.from('archetypes').select('id, state').order('id')
  for (const row of data ?? []) {
    const s = row.state as any
    console.log('\n')
    console.log('═'.repeat(80))
    console.log(`${s.archetype.name}  (${row.id})  ·  composite=${s.archetype.composite}/100  ·  risks=${s.risks.length}`)
    console.log('═'.repeat(80))
    console.log(`  blurb: ${s.archetype.blurb}`)
    console.log(`  capex: $${(s.archetype.typical.capex / 1e9).toFixed(1)}B  ·  target IRR: ${(s.archetype.typical.target_irr * 100).toFixed(1)}%  ·  COD: ${s.archetype.typical.cod_months}mo`)
    console.log('')
    for (const r of s.risks) {
      const d = s.risk_details[r.id]
      const status = r.status === 'realized' ? `REALIZED ${r.realized_date ?? ''}` : 'active'
      console.log(`─── ${r.id}  [${r.category}/${r.likelihood}]  ${status} ───`)
      console.log(`  title:       ${r.title}`)
      console.log(`  citation:    ${r.citation}`)
      console.log(`  prob:        ${(r.probability * 100).toFixed(0)}%`)
      console.log(`  impact_irr:  ${r.impact_irr.toFixed(1)}pp  ·  $${(r.impact_usd / 1e6).toFixed(0)}M`)
      console.log(`  driver:      ${r.driver ?? '(unset)'}`)
      console.log(`  hedge:       ${r.primary_hedge_ticker ?? '(none)'}`)
      if (d?.view) {
        const words = d.view.split(/\s+/).length
        console.log(`  view (${words}w): ${d.view.replace(/\n/g, ' ')}`)
      }
      const hedges = d?.hedges ?? []
      const tbd = hedges.filter((h: any) => h.ticker === 'TBD' || h.ticker?.startsWith('TBD')).length
      console.log(`  hedges:      ${hedges.length} mapped, ${tbd} TBD`)
    }
  }
}
main().catch((e) => { console.error(e); process.exit(1) })
