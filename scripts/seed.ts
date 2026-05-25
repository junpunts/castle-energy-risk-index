/**
 * Seed script — loads the initial offshore-wind bundle + research scaffold
 * into Supabase. Idempotent; safe to re-run.
 *
 * Usage:
 *   npm run db:seed
 *
 * Reads:
 *   public/data/offshore-wind.json                       — the bundle
 *   data/research/offshore-wind-current-state.md         — research scaffold
 *   data/research/offshore-wind-critical-full.txt        — contracts library
 */

import { readFileSync } from 'fs'
import { join } from 'path'
import { parseArchetypeBundle } from '../src/lib/schemas'
import { createServiceRoleClient } from '../src/lib/supabase/server'

async function main() {
  const root = process.cwd()
  const bundlePath = join(root, 'public/data/offshore-wind.json')
  const scaffoldPath = join(root, 'data/research/offshore-wind-current-state.md')
  const contractsPath = join(root, 'data/research/offshore-wind-critical-full.txt')

  console.log('[seed] reading', bundlePath)
  const rawBundle = JSON.parse(readFileSync(bundlePath, 'utf8'))
  const bundle = parseArchetypeBundle(rawBundle)
  console.log('[seed] bundle parsed:', bundle.archetype.name, '|', bundle.risks.length, 'risks')

  const scaffold = readFileSync(scaffoldPath, 'utf8')
  const contractsRaw = readFileSync(contractsPath, 'utf8')
  console.log('[seed] scaffold size:', scaffold.length, '| contracts size:', contractsRaw.length)

  const sb = createServiceRoleClient()

  // ── archetypes upsert ──
  const archetypeId = bundle.archetype_id

  const existing = await sb
    .from('archetypes')
    .select('id, state_version')
    .eq('id', archetypeId)
    .maybeSingle()

  if (existing.error && existing.error.code !== 'PGRST116') {
    throw new Error(`select failed: ${existing.error.message}`)
  }

  if (existing.data) {
    console.log(`[seed] archetype ${archetypeId} already exists at v${existing.data.state_version}; skipping bundle insert.`)
  } else {
    const { error: archErr } = await sb
      .from('archetypes')
      .insert({ id: archetypeId, state: bundle, state_version: 1 })
    if (archErr) throw new Error(`archetypes insert failed: ${archErr.message}`)

    const { error: revErr } = await sb
      .from('archetype_revisions')
      .insert({
        archetype_id: archetypeId,
        state_version: 1,
        state: bundle,
        applied_by: 'seed',
      })
    if (revErr) throw new Error(`archetype_revisions insert failed: ${revErr.message}`)

    console.log(`[seed] archetype ${archetypeId} inserted at v1`)
  }

  // ── archetype_research upsert ──
  // contracts_library: parse the TSV-ish "RECORD N" pg-style dump into a
  // structured array. Simple line-based parser is enough for the seed.
  const contractsLibrary = parseContractsLibrary(contractsRaw)
  console.log(`[seed] parsed ${contractsLibrary.length} contracts from library`)

  const existingResearch = await sb
    .from('archetype_research')
    .select('archetype_id')
    .eq('archetype_id', archetypeId)
    .maybeSingle()

  if (existingResearch.data) {
    console.log(`[seed] research for ${archetypeId} already exists; skipping.`)
  } else {
    const { error } = await sb.from('archetype_research').insert({
      archetype_id: archetypeId,
      scaffold_md: scaffold,
      contracts_library: contractsLibrary,
      notes_md: null,
    })
    if (error) throw new Error(`archetype_research insert failed: ${error.message}`)
    console.log(`[seed] research for ${archetypeId} inserted`)
  }

  console.log('[seed] done.')
}

/**
 * Parse the offshore-wind-critical-full.txt format.
 * Each record is delimited by "-[ RECORD N ]---..." with fields like:
 *   bucket       | <value>
 *   contract_key | <value>
 *   label        | <value>
 *   probability  | <number>
 *   resolution   | <date>
 *   rationale    | <text>
 */
function parseContractsLibrary(raw: string) {
  const records: Array<Record<string, string | number>> = []
  const blocks = raw.split(/^-\[ RECORD \d+ \][-+]+/m).slice(1)
  for (const block of blocks) {
    const fields: Record<string, string | number> = {}
    for (const line of block.split('\n')) {
      const m = line.match(/^(\w+)\s*\|\s*(.*)$/)
      if (!m) continue
      const [, key, value] = m
      if (key === 'probability') {
        const n = Number(value)
        fields[key] = Number.isFinite(n) ? n : value
      } else {
        fields[key] = value.trim()
      }
    }
    if (Object.keys(fields).length > 0) records.push(fields)
  }
  return records
}

main().catch((err) => {
  console.error('[seed] FATAL', err)
  process.exit(1)
})
