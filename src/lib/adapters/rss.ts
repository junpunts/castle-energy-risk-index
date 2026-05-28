/**
 * Generic RSS / Atom adapter.
 *
 * Configured with a list of feeds; each pull fetches them all in parallel and
 * normalises. We use this for sources that publish a structured feed but no
 * JSON API — BOEM newsroom, Congress.gov bill feeds, EIA, etc.
 *
 * Implementation: minimal XML parsing via a regex. We considered fast-xml-parser
 * but the feed shapes are simple enough that we don't need a full parser, and
 * keeping the dep surface small matters for the worker image.
 *
 * If a feed gets exotic later (CDATA, namespaced elements, weird encodings),
 * swap in fast-xml-parser; the rest of the pipeline doesn't care.
 */

import { type SourceAdapter, type SourceItem, type AdapterContext, safeFetch } from './types'

interface FeedConfig {
  /** Stable name. Becomes the news_cache.source value. */
  name: string
  /** Feed URL. */
  url: string
  /** Which archetypes this feed is relevant to. Used by the matcher to
   *  short-circuit irrelevant items without running keyword tests. */
  archetype_hints?: string[]
}

// Curated feed list. Add aggressively; the matcher filters.
const FEEDS: FeedConfig[] = [
  {
    name: 'boem',
    url: 'https://www.boem.gov/webteam/rss/boem-rss.xml',
    archetype_hints: ['offshore-wind'],
  },
  {
    name: 'eia',
    url: 'https://www.eia.gov/rss/press_rss.xml',
    archetype_hints: ['offshore-wind', 'utility-solar', 'onshore-wind', 'battery-storage', 'green-hydrogen', 'ev-charging'],
  },
  {
    name: 'whitehouse',
    url: 'https://www.whitehouse.gov/news/feed/',
    // Executive orders + presidential proclamations land here before FR.
  },
  {
    name: 'ustr',
    url: 'https://ustr.gov/rss.xml',
    // Section 301 / AD-CVD / tariff actions — drives solar + battery trade risks.
    archetype_hints: ['utility-solar', 'battery-storage', 'natural-gas'],
  },
  {
    name: 'canarymedia',
    url: 'https://www.canarymedia.com/feeds/articles.rss',
    // Energy-transition trade press. Project-level signal (storage, solar,
    // nuclear, transmission) that government feeds miss. High volume — matcher filters.
    archetype_hints: ['utility-solar', 'offshore-wind', 'nuclear-smr', 'battery-storage', 'natural-gas'],
  },
  {
    name: 'utilitydive',
    url: 'https://www.utilitydive.com/feeds/news/',
    // Utility/grid trade press — interconnection, storage installs, data-center
    // demand, FERC/CAISO/PJM actions. Spans every archetype.
    archetype_hints: ['utility-solar', 'offshore-wind', 'nuclear-smr', 'battery-storage', 'natural-gas'],
  },
  // ─── Expansion batch (May 2026) — DC politics, financial press, regulator-direct ───
  {
    name: 'politico_energy',
    url: 'https://rss.politico.com/energy.xml',
    // DC politics + energy — best signal on the OBBBA / IRA-credit fights that
    // drive ~half our policy risks. Free RSS, no auth.
    archetype_hints: ['utility-solar', 'offshore-wind', 'nuclear-smr', 'battery-storage', 'natural-gas', 'ev-charging'],
  },
  {
    name: 'heatmap',
    url: 'https://heatmap.news/feed',
    // Climate / energy-policy news with FERC + grid focus. Surfaces stories
    // E&E and Politico don't, often days earlier.
    archetype_hints: ['utility-solar', 'offshore-wind', 'nuclear-smr', 'battery-storage', 'natural-gas', 'ev-charging'],
  },
  {
    name: 'reuters_energy',
    url: 'https://www.reutersagency.com/feed/?best-sectors=energy&post_type=best',
    // Financial-press coverage of tariffs, supply chains, M&A — fills the
    // gap left by clean-energy trade press.
    archetype_hints: ['utility-solar', 'offshore-wind', 'nuclear-smr', 'battery-storage', 'natural-gas', 'ev-charging'],
  },
  {
    name: 'nrc',
    url: 'https://www.nrc.gov/feeds/news.xml',
    // NRC press releases — direct source for SMR licensing, Part 53/37
    // rulemakings, fuel-cycle decisions. Critical for nuclear-smr risks.
    archetype_hints: ['nuclear-smr'],
  },
  {
    name: 'doe',
    url: 'https://www.energy.gov/rss/articles',
    // DOE press releases — H2Hubs, LPO, NEVI program decisions. Direct from
    // the source, ahead of trade-press summarisation.
    archetype_hints: ['nuclear-smr', 'ev-charging', 'green-hydrogen', 'natural-gas'],
  },
  {
    name: 'epa',
    url: 'https://www.epa.gov/newsroom/rss/news_releases.xml',
    // EPA press releases — combustion-turbine NSPS, OCS Clean Air, RFS,
    // greenhouse-gas reporting. Drives natural-gas and offshore-wind risks.
    archetype_hints: ['natural-gas', 'offshore-wind', 'utility-solar'],
  },
]

export const rssAdapter: SourceAdapter = {
  name: 'rss',
  enabled() {
    return FEEDS.length > 0
  },
  async fetch(ctx: AdapterContext): Promise<SourceItem[]> {
    const sinceMs = ctx.since.getTime()
    const tasks = FEEDS.map((feed) => pullFeed(feed, ctx, sinceMs))
    const settled = await Promise.allSettled(tasks)
    const all: SourceItem[] = []
    for (let i = 0; i < settled.length; i++) {
      const r = settled[i]
      if (r.status === 'fulfilled') {
        all.push(...r.value)
      } else {
        ctx.log?.(`rss[${FEEDS[i].name}] failed: ${r.reason?.message ?? r.reason}`)
      }
    }
    // Dedupe on URL across feeds (occasionally the same press release appears
    // on both DOE and Whitehouse, etc.).
    const seen = new Set<string>()
    const out: SourceItem[] = []
    for (const item of all) {
      if (!item.url || seen.has(item.url)) continue
      seen.add(item.url)
      out.push(item)
    }
    return out.slice(0, ctx.limit)
  },
}

async function pullFeed(
  feed: FeedConfig,
  ctx: AdapterContext,
  sinceMs: number,
): Promise<SourceItem[]> {
  const r = await safeFetch(feed.url, { signal: ctx.signal, timeoutMs: 15_000 })
  if (!r.ok) {
    ctx.log?.(`rss[${feed.name}]: HTTP ${r.status}`)
    return []
  }
  const xml = await r.text()
  const items = parseFeedItems(xml)
  const out: SourceItem[] = []
  for (const it of items) {
    const ts = parseFeedDate(it.pubDate ?? it.updated ?? it.published)
    if (!ts || ts < sinceMs) continue
    out.push({
      url: it.link,
      title: stripHtml(it.title).slice(0, 500),
      body: it.description ? stripHtml(it.description).slice(0, 2000) : undefined,
      published_at: new Date(ts).toISOString(),
      category: feed.name,
      extra: feed.archetype_hints ? { archetype_hints: feed.archetype_hints } : undefined,
    })
  }
  ctx.log?.(`rss[${feed.name}]: ${out.length} item${out.length === 1 ? '' : 's'} since ${ctx.since.toISOString().slice(0, 10)}`)
  return out
}

// ───────────────────────────────────────────────────────────────────────────
// Minimal feed parsing. Handles RSS 2.0 <item> and Atom <entry>.
// ───────────────────────────────────────────────────────────────────────────

interface RawItem {
  title: string
  link: string
  description?: string
  pubDate?: string
  updated?: string
  published?: string
}

function parseFeedItems(xml: string): RawItem[] {
  const items: RawItem[] = []
  // RSS <item>...</item>
  const itemRe = /<item[\s>][\s\S]*?<\/item>/gi
  for (const m of xml.matchAll(itemRe)) {
    items.push(parseOne(m[0], false))
  }
  // Atom <entry>...</entry>
  const entryRe = /<entry[\s>][\s\S]*?<\/entry>/gi
  for (const m of xml.matchAll(entryRe)) {
    items.push(parseOne(m[0], true))
  }
  return items.filter((i) => i.link && i.title)
}

function parseOne(chunk: string, atom: boolean): RawItem {
  const tag = (name: string): string | undefined => {
    const m = chunk.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)<\\/${name}>`, 'i'))
    if (!m) return undefined
    return decodeCdata(m[1].trim())
  }
  const linkAtom = (): string | undefined => {
    // <link href="..."/>
    const m = chunk.match(/<link[^>]*href=["']([^"']+)["'][^>]*\/?>/i)
    return m?.[1]
  }
  return {
    title: tag('title') ?? '',
    link: atom ? linkAtom() ?? tag('id') ?? '' : tag('link') ?? '',
    description: tag('description') ?? tag('summary') ?? tag('content'),
    pubDate: tag('pubDate'),
    updated: tag('updated'),
    published: tag('published'),
  }
}

function decodeCdata(s: string): string {
  const m = s.match(/^<!\[CDATA\[([\s\S]*)\]\]>$/)
  return (m ? m[1] : s).trim()
}

function stripHtml(s: string): string {
  return s
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

function parseFeedDate(s: string | undefined): number | null {
  if (!s) return null
  const t = Date.parse(s)
  return Number.isNaN(t) ? null : t
}
