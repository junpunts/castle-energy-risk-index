/**
 * Generic archetype seeder. Inserts a bundle JSON into `archetypes` +
 * `archetype_revisions` at v1. Idempotent (skips if archetype exists).
 *
 * Usage:
 *   npx tsx scripts/seed-bundle.ts public/data/utility-solar.json [...more]
 */

import { readFileSync } from 'fs'
import { config as loadEnv } from 'dotenv'
loadEnv({ path: '.env.local' })
import WS from 'ws'
;(globalThis as any).WebSocket ??= WS
import { parseArchetypeBundle, validateBundleInvariants } from '../src/lib/schemas'
import { createServiceRoleClient } from '../src/lib/supabase/server'

async function seedOne(path: string) {
  const raw = JSON.parse(readFileSync(path, 'utf8'))
  const bundle = validateBundleInvariants(parseArchetypeBundle(raw))
  const sb = createServiceRoleClient()
  const id = bundle.archetype_id

  const existing = await sb.from('archetypes').select('id, state_version').eq('id', id).maybeSingle()
  if (existing.error && existing.error.code !== 'PGRST116') {
    throw new Error(`select ${id}: ${existing.error.message}`)
  }
  if (existing.data) {
    console.log(`[seed] ${id} already exists at v${existing.data.state_version}; skipping.`)
    return
  }

  const { error: archErr } = await sb.from('archetypes').insert({ id, state: bundle, state_version: 1 })
  if (archErr) throw new Error(`insert ${id}: ${archErr.message}`)

  const { error: revErr } = await sb.from('archetype_revisions').insert({
    archetype_id: id, state_version: 1, state: bundle, applied_by: 'seed-bundle',
  })
  if (revErr) throw new Error(`revision ${id}: ${revErr.message}`)

  console.log(`[seed] ${id} inserted at v1 (${bundle.risks.length} risks, composite ${bundle.archetype.composite})`)
}

async function main() {
  const files = process.argv.slice(2)
  if (!files.length) { console.error('usage: tsx scripts/seed-bundle.ts <bundle.json> [...]'); process.exit(2) }
  for (const f of files) await seedOne(f)
  console.log('[seed] done.')
}

main().catch((e) => { console.error('[seed] FATAL', e); process.exit(1) })
