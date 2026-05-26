/**
 * Re-version an archetype's canonical state from a bundle JSON file.
 * Used to push a hand-edited bundle (e.g. offshore-wind hedge slug rewrite)
 * into the DB as a new revision via the atomic apply_archetype_revision RPC.
 *
 * Usage:
 *   npx tsx scripts/reversion-bundle.ts public/data/offshore-wind.json
 */

import { config as loadEnv } from 'dotenv'
loadEnv({ path: '.env.local' })
import WS from 'ws'
;(globalThis as any).WebSocket ??= WS

import { readFileSync } from 'fs'
import { parseArchetypeBundle, validateBundleInvariants } from '../src/lib/schemas'
import { deriveAll } from '../src/lib/archetypes/derive'
import { createServiceRoleClient } from '../src/lib/supabase/server'

async function main() {
  const path = process.argv[2]
  if (!path) { console.error('usage: tsx scripts/reversion-bundle.ts <bundle.json>'); process.exit(2) }

  const raw = JSON.parse(readFileSync(path, 'utf8'))
  let bundle = validateBundleInvariants(parseArchetypeBundle(raw))
  bundle.generated_at = new Date().toISOString()
  bundle.generated_by = 'reversion-script'
  const derived = deriveAll(bundle)
  validateBundleInvariants(parseArchetypeBundle(derived))

  const sb = createServiceRoleClient()
  const id = bundle.archetype_id

  const { data: cur, error: curErr } = await sb
    .from('archetypes').select('state_version').eq('id', id).single()
  if (curErr) throw new Error(`load ${id}: ${curErr.message}`)
  const newVersion = cur.state_version + 1

  const { data: rev, error } = await sb.rpc('apply_archetype_revision', {
    p_archetype_id: id,
    p_state_version: newVersion,
    p_state: derived,
    p_proposal_id: null,
    p_applied_by: 'reversion-script',
  })
  if (error) throw new Error(`apply_archetype_revision: ${error.message}`)
  const revRow = Array.isArray(rev) ? rev[0] : rev
  console.log(`[reversion] ${id} → v${newVersion} (revision ${revRow?.id ?? '?'}, composite ${derived.archetype.composite})`)
  process.exit(0)
}

main().catch((e) => { console.error('[reversion] FATAL', e); process.exit(1) })
