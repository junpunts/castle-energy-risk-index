#!/usr/bin/env tsx
/**
 * Replace each archetype bundle's synthetic news[] (and per-risk news[])
 * with REAL items from news_cache that the matcher tagged to the
 * archetype / risk. The synthetic seed had no URLs; news_cache items do.
 *
 * Archetype-level news[]:
 *   - up to 8 most recent items where matched_archetypes contains {id}
 *   - sorted by published_at desc
 *
 * Per-risk news[]:
 *   - up to 5 most recent items where matched_risks contains "{archetype}:{risk}"
 *   - sorted by published_at desc
 *
 * Source label derived from the adapter source + URL hostname.
 * Tag inferred from the existing archetype-page risk category if matched,
 * defaulting to 'policy'.
 *
 * Writes via apply_archetype_revision. Idempotent: re-running just picks
 * up any new news_cache items since the last run.
 */

import { config as loadEnv } from 'dotenv'
loadEnv({ path: '.env.local' })
loadEnv()
import WS from 'ws'
;(globalThis as any).WebSocket ??= WS

import { createServiceRoleClient } from '../src/lib/supabase/server'
import { parseArchetypeBundle, type NewsItem } from '../src/lib/schemas'

const ARCHETYPE_TOP_N = 8
const PER_RISK_N = 5

/** Normalize an adapter source + URL into a clean editorial source label. */
function sourceLabel(rawSource: string, url: string): string {
  const s = rawSource.toLowerCase()
  if (s.startsWith('federal_register')) return 'FEDERAL REGISTER'
  if (s.startsWith('sec_edgar')) return 'SEC'
  if (s.startsWith('court_listener')) return 'COURTLISTENER'
  if (s.startsWith('earnings_transcripts')) return 'MOTLEY FOOL'
  if (s.startsWith('castle_scraper')) return 'CASTLE LIBRARY'
  // RSS: derive from URL host
  try {
    const host = new URL(url).hostname.replace(/^www\./, '')
    const map: Record<string, string> = {
      'politico.com':         'POLITICO',
      'rss.politico.com':     'POLITICO',
      'canarymedia.com':      'CANARY MEDIA',
      'utilitydive.com':      'UTILITY DIVE',
      'heatmap.news':         'HEATMAP',
      'reuters.com':          'REUTERS',
      'reutersagency.com':    'REUTERS',
      'whitehouse.gov':       'WHITE HOUSE',
      'energy.gov':           'DOE',
      'epa.gov':              'EPA',
      'nrc.gov':              'NRC',
      'boem.gov':             'BOEM',
      'ustr.gov':             'USTR',
      'usitc.gov':            'USITC',
      'federalregister.gov':  'FEDERAL REGISTER',
      'sec.gov':              'SEC',
      'eia.gov':              'EIA',
      'fool.com':             'MOTLEY FOOL',
      'courtlistener.com':    'COURTLISTENER',
    }
    if (map[host]) return map[host]
    // Strip TLD, uppercase the second-level domain.
    const parts = host.split('.')
    if (parts.length >= 2) return parts[parts.length - 2].toUpperCase()
    return host.toUpperCase()
  } catch {
    return rawSource.toUpperCase()
  }
}

function fmtAgo(iso: string): string {
  const ms = Date.now() - Date.parse(iso)
  if (!Number.isFinite(ms) || ms < 0) return 'recently'
  const hr = Math.floor(ms / 3_600_000)
  if (hr < 1) return 'just now'
  if (hr < 24) return `${hr} hr ago`
  const day = Math.floor(hr / 24)
  if (day === 1) return 'yesterday'
  if (day < 7) return `${day} days ago`
  const wk = Math.floor(day / 7)
  return `${wk} wk ago`
}

/** Crude tag inference from the title; defaults to policy. */
function inferTag(title: string, body: string | null): NewsItem['tag'] {
  const t = (title + ' ' + (body ?? '')).toLowerCase()
  if (/tariff|duty|ad\/cvd|section 30[12]|section 232|forced labor|uflpa|cbp/.test(t)) return 'trade'
  if (/queue|interconnect|capacity auction|curtail|ercot|caiso|pjm|spark spread|hub|price|market|earnings/.test(t)) return 'market'
  if (/permit|construction|cod|delay|outage|installation|fire|hearing|injunction/.test(t)) return 'operational'
  return 'policy'
}

interface CacheRow {
  source: string
  url: string
  title: string
  body: string | null
  published_at: string
  matched_risks: string[] | null
}

function rowToNewsItem(r: CacheRow, category?: NewsItem['tag']): NewsItem {
  return {
    source: sourceLabel(r.source, r.url),
    ago: fmtAgo(r.published_at),
    tag: category ?? inferTag(r.title, r.body),
    title: r.title.slice(0, 240),
    ...(r.body ? { sum: r.body.replace(/\s+/g, ' ').slice(0, 400) } : {}),
    url: r.url,
    published_at: r.published_at,
  }
}

async function main() {
  const sb = createServiceRoleClient()
  const { data: archs, error } = await sb
    .from('archetypes')
    .select('id, state, state_version')
    .order('id')
  if (error) throw new Error(error.message)

  for (const row of archs ?? []) {
    const bundle = parseArchetypeBundle(row.state)
    const aid = row.id

    // 1. Archetype-level news: top 8 from news_cache where matched_archetypes ⊇ {aid}.
    const { data: archRows, error: aErr } = await sb
      .from('news_cache')
      .select('source, url, title, body, published_at, matched_risks')
      .contains('matched_archetypes', [aid])
      .order('published_at', { ascending: false })
      .limit(ARCHETYPE_TOP_N)
    if (aErr) {
      console.error(`✗ ${aid} news fetch: ${aErr.message}`)
      continue
    }
    const archNews = (archRows ?? []).map((r) => rowToNewsItem(r as CacheRow))

    // 2. Per-risk news: for each risk, top 5 from news_cache where matched_risks ⊇ {aid:rid}.
    const detailUpdates: Record<string, NewsItem[]> = {}
    for (const r of bundle.risks) {
      const qualified = `${aid}:${r.id}`
      const { data: rRows } = await sb
        .from('news_cache')
        .select('source, url, title, body, published_at, matched_risks')
        .contains('matched_risks', [qualified])
        .order('published_at', { ascending: false })
        .limit(PER_RISK_N)
      const items = (rRows ?? []).map((row) => rowToNewsItem(row as CacheRow, r.category))
      if (items.length > 0) detailUpdates[r.id] = items
    }

    if (archNews.length === 0 && Object.keys(detailUpdates).length === 0) {
      console.log(`  ${aid.padEnd(20)} no matched news_cache items — leaving as-is`)
      continue
    }

    // Build the next state.
    const next: any = JSON.parse(JSON.stringify(bundle))
    if (archNews.length > 0) next.news = archNews
    for (const [rid, items] of Object.entries(detailUpdates)) {
      if (next.risk_details[rid]) next.risk_details[rid].news = items
    }
    next.generated_at = new Date().toISOString()
    next.generated_by = 'script:repopulate-news-from-cache'

    const newVersion = (row.state_version as number) + 1
    const { error: rpcErr } = await sb.rpc('apply_archetype_revision', {
      p_archetype_id: aid,
      p_state_version: newVersion,
      p_state: next,
      p_proposal_id: null,
      p_applied_by: 'script:repopulate-news-from-cache',
    })
    if (rpcErr) {
      console.error(`  ✗ ${aid}: ${rpcErr.message}`)
    } else {
      const perRiskCount = Object.values(detailUpdates).reduce((s, v) => s + v.length, 0)
      console.log(
        `  ✓ ${aid.padEnd(20)} archetype ${archNews.length} items · per-risk ${perRiskCount} across ${Object.keys(detailUpdates).length} risks → v${newVersion}`,
      )
    }
  }
}
main().catch((e) => { console.error(e); process.exit(1) })
