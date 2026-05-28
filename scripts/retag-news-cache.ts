/**
 * One-off retag of news_cache after a matcher tuning change.
 *
 *   pnpm tsx scripts/retag-news-cache.ts
 *
 * Walks every row in news_cache, re-runs the matcher (federal-register rows
 * are scoped to their hinted archetype; rss rows are tested against every
 * archetype), and updates matched_archetypes/matched_risks where the result
 * differs. Existing rows that already match correctly are left alone.
 */

import { config as loadEnv } from 'dotenv'
loadEnv({ path: '.env.local' })
loadEnv()
import WS from 'ws'
;(globalThis as any).WebSocket ??= WS

import { createServiceRoleClient } from '../src/lib/supabase/server'
import { matchItemAgainstArchetype } from '../src/lib/adapters/match'
import { parseArchetypeBundle, type ArchetypeBundle } from '../src/lib/schemas'
import type { SourceItem } from '../src/lib/adapters/types'

const ARCHETYPES = ['offshore-wind', 'utility-solar', 'battery-storage', 'natural-gas', 'nuclear-smr', 'ev-charging']

const FR_PREFIX = 'federal_register:'

async function main() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Missing Supabase env vars')
  }
  const sb = createServiceRoleClient()

  const bundles: Record<string, ArchetypeBundle> = {}
  for (const aid of ARCHETYPES) {
    const { data, error } = await sb.from('archetypes').select('state').eq('id', aid).single()
    if (error || !data) {
      console.warn(`  skip ${aid}: ${error?.message ?? 'missing'}`)
      continue
    }
    bundles[aid] = parseArchetypeBundle(data.state)
  }

  const { data: rows, error } = await sb
    .from('news_cache')
    .select('id, url, title, body, source, published_at, matched_archetypes, matched_risks')
    .limit(5000)
  if (error) throw new Error(`load news_cache: ${error.message}`)
  console.log(`loaded ${rows!.length} news_cache rows`)

  let updated = 0
  let newlyMatched = 0
  for (const row of rows!) {
    const targets = row.source.startsWith(FR_PREFIX)
      ? [row.source.slice(FR_PREFIX.length)].filter((a) => bundles[a])
      : ARCHETYPES.filter((a) => bundles[a])

    const item: SourceItem = {
      url: row.url,
      title: row.title,
      body: row.body ?? undefined,
      published_at: row.published_at,
    }

    const newRisks: string[] = []
    const newArchs = new Set<string>()
    for (const aid of targets) {
      const result = matchItemAgainstArchetype(item, bundles[aid])
      if (result.risk_ids.length > 0) {
        newArchs.add(aid)
        for (const rid of result.risk_ids) newRisks.push(`${aid}:${rid}`)
      }
    }

    const oldRisks = ((row.matched_risks ?? []) as string[]).slice().sort()
    const sortedNew = newRisks.slice().sort()
    const oldArchs = ((row.matched_archetypes ?? []) as string[]).slice().sort()
    const sortedNewArchs = Array.from(newArchs).sort()

    if (
      JSON.stringify(oldRisks) === JSON.stringify(sortedNew) &&
      JSON.stringify(oldArchs) === JSON.stringify(sortedNewArchs)
    ) {
      continue
    }
    if (oldRisks.length === 0 && newRisks.length > 0) newlyMatched++

    const { error: updErr } = await sb
      .from('news_cache')
      .update({ matched_risks: newRisks, matched_archetypes: Array.from(newArchs) })
      .eq('id', row.id)
    if (updErr) {
      console.warn(`  ✗ id=${row.id}: ${updErr.message}`)
      continue
    }
    updated++
  }
  console.log(`updated ${updated} rows; ${newlyMatched} previously-unmatched rows now matched`)
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })
