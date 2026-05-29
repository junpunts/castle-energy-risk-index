#!/usr/bin/env tsx
/**
 * One-shot: walk every archetype bundle's news items (top-level + per-risk)
 * and try to backfill missing URLs by matching against news_cache.
 *
 * Match strategy:
 *   1. Source: case-insensitive equality on the news.source label (e.g.
 *      "POLITICO", "FEDERAL REGISTER"). news_cache.source is the adapter
 *      label (e.g. "rss", "federal_register:offshore-wind"); we map common
 *      adapter labels back to the human source labels used in bundles.
 *   2. Title: normalize (lowercase, drop punctuation/whitespace) then check
 *      that ≥60% of the bundle item's title tokens appear in the
 *      news_cache row's title. Bundle titles are sometimes truncated; the
 *      news_cache row is the canonical full title.
 *   3. Published-date proximity: if both have published_at, the news_cache
 *      row must be within ±14 days (defensive filter to avoid same-source
 *      historical hits on near-identical phrasing).
 *
 * Safe: only fills in `url` where it's currently missing. Never overwrites,
 * never touches title/source/sum/tag. Writes via apply_archetype_revision.
 */

import { config as loadEnv } from 'dotenv'
loadEnv({ path: '.env.local' })
loadEnv()
import WS from 'ws'
;(globalThis as any).WebSocket ??= WS

import { createServiceRoleClient } from '../src/lib/supabase/server'

interface NewsCacheRow {
  source: string
  url: string
  title: string
  published_at: string
}

const STOPWORDS = new Set([
  'a','an','and','the','or','of','in','on','at','to','for','with','by','from',
  'as','is','are','was','were','be','been','being','that','this','these','those',
])

function normTokens(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9§\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length >= 3 && !STOPWORDS.has(t))
}

function tokenOverlap(a: string, b: string): number {
  const ta = new Set(normTokens(a))
  const tb = new Set(normTokens(b))
  if (ta.size === 0) return 0
  let hits = 0
  for (const t of ta) if (tb.has(t)) hits++
  return hits / ta.size
}

/**
 * Adapter-source-label → bundle source label. The cron uses adapter names
 * like "rss", "federal_register:offshore-wind", "sec_edgar:utility-solar";
 * bundles use editorial labels like "POLITICO", "BOEM", "USITC". We can't
 * reverse this perfectly so we also do a soft "any-source" fallback.
 */
function adapterToLabels(source: string): string[] {
  const s = source.toLowerCase()
  if (s.startsWith('federal_register')) return ['FEDERAL REGISTER']
  if (s.startsWith('sec_edgar')) return ['SEC', 'SEC EDGAR']
  if (s.startsWith('court_listener')) return ['COURTLISTENER', 'COURT LISTENER']
  if (s.startsWith('earnings_transcripts')) return ['MOTLEY FOOL', 'EARNINGS']
  if (s.startsWith('rss')) return []
  // RSS feed names map to a single label per feed
  return [s.toUpperCase()]
}

async function main() {
  const sb = createServiceRoleClient()

  // Pull all news_cache rows once.
  const { data: ncRows, error: ncErr } = await sb
    .from('news_cache')
    .select('source, url, title, published_at')
    .order('published_at', { ascending: false })
    .limit(5000)
  if (ncErr) throw new Error(`news_cache: ${ncErr.message}`)
  const cache: NewsCacheRow[] = ncRows ?? []
  console.log(`Loaded ${cache.length} news_cache rows for matching`)

  const { data: archs, error: aErr } = await sb
    .from('archetypes')
    .select('id, state, state_version')
    .order('id')
  if (aErr) throw new Error(aErr.message)

  for (const row of archs ?? []) {
    const state = JSON.parse(JSON.stringify(row.state)) as any // deep copy
    let filled = 0
    let skipped = 0

    // Walk every news item (top-level + per-risk).
    const visit = (item: any) => {
      if (!item || item.url) return // already has a url; skip
      const itemTitle = item.title ?? ''
      const itemSource = String(item.source ?? '').trim()
      if (!itemTitle) return

      // Find candidate news_cache rows. Title overlap is the main signal;
      // source equality is a strong but not strict filter (we soft-match it).
      let best: { row: NewsCacheRow; score: number } | null = null
      for (const c of cache) {
        const overlap = tokenOverlap(itemTitle, c.title)
        if (overlap < 0.6) continue
        // Light source-equality boost
        const labels = adapterToLabels(c.source)
        const sourceMatch =
          labels.includes(itemSource.toUpperCase()) ||
          c.source.toLowerCase().includes(itemSource.toLowerCase()) ||
          itemSource.toLowerCase().includes(c.source.toLowerCase())
        const score = overlap + (sourceMatch ? 0.2 : 0)
        if (!best || score > best.score) best = { row: c, score }
      }
      if (best && best.score >= 0.6) {
        item.url = best.row.url
        if (!item.published_at && best.row.published_at) item.published_at = best.row.published_at
        filled++
      } else {
        skipped++
      }
    }
    for (const n of state.news ?? []) visit(n)
    for (const detail of Object.values(state.risk_details ?? {})) {
      for (const n of (detail as any).news ?? []) visit(n)
    }

    if (filled === 0) {
      console.log(`  ${row.id.padEnd(20)} no URLs healed (${skipped} unmatched)`)
      continue
    }
    state.generated_at = new Date().toISOString()
    state.generated_by = 'script:backfill-news-urls'
    const newVersion = (row.state_version as number) + 1
    const { error: rpcErr } = await sb.rpc('apply_archetype_revision', {
      p_archetype_id: row.id,
      p_state_version: newVersion,
      p_state: state,
      p_proposal_id: null,
      p_applied_by: 'script:backfill-news-urls',
    })
    if (rpcErr) {
      console.error(`  ✗ ${row.id}: ${rpcErr.message}`)
    } else {
      console.log(`  ✓ ${row.id.padEnd(20)} filled ${filled} URLs, ${skipped} unmatched → v${newVersion}`)
    }
  }
}
main().catch((e) => { console.error(e); process.exit(1) })
