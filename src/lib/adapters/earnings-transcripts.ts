/**
 * Earnings-call transcripts adapter (Motley Fool scrape).
 *
 * Why: CEOs and CFOs answer analyst questions about policy risk on quarterly
 * calls. That Q&A is the candid signal — press releases never carry it, and
 * 10-K Item 1A is a year stale. Quarterly cadence makes it cheap.
 *
 * Source: Motley Fool's transcript pages — free, no auth, fragile HTML.
 * If the scrape breaks (Fool changes their template), this adapter no-ops
 * instead of throwing, and the rest of the pipeline keeps working.
 *
 * Plan note (PLAN-PASS-B-AND-SOURCES.md §M2.3): this is the most fragile
 * source. Monthly manual review is intended. Fallback path: swap to
 * Seeking Alpha free transcripts or AlphaSense paid.
 */

import {
  type SourceAdapter,
  type SourceItem,
  type AdapterContext,
  safeFetch,
} from './types'
import type { ArchetypeBundle } from '@/lib/schemas'

// Fallback transcript-company list — used when bundle.intelligence is absent.
const FALLBACK_TRANSCRIPT_COMPANIES: Record<
  string,
  Array<{ name: string; ticker: string }>
> = {
  'offshore-wind': [
    { name: 'Avangrid', ticker: 'AGR' },
    { name: 'Dominion Energy', ticker: 'D' },
    { name: 'Eversource Energy', ticker: 'ES' },
  ],
  'utility-solar': [
    { name: 'NextEra Energy', ticker: 'NEE' },
    { name: 'First Solar', ticker: 'FSLR' },
    { name: 'Sunrun', ticker: 'RUN' },
    { name: 'AES', ticker: 'AES' },
  ],
  'battery-storage': [
    { name: 'Fluence Energy', ticker: 'FLNC' },
    { name: 'Tesla', ticker: 'TSLA' },
    { name: 'Vistra', ticker: 'VST' },
  ],
  'natural-gas': [
    { name: 'Vistra', ticker: 'VST' },
    { name: 'Cheniere Energy', ticker: 'LNG' },
    { name: 'Williams Companies', ticker: 'WMB' },
    { name: 'Sempra', ticker: 'SRE' },
  ],
  'nuclear-smr': [
    { name: 'Constellation Energy', ticker: 'CEG' },
    { name: 'NuScale Power', ticker: 'SMR' },
  ],
  'ev-charging': [
    { name: 'ChargePoint', ticker: 'CHPT' },
    { name: 'EVgo', ticker: 'EVGO' },
    { name: 'Tesla', ticker: 'TSLA' },
  ],
}

// A Q&A exchange must hit one of these to be emitted. Keeps the signal
// policy-only — generic operational chatter falls off here.
const POLICY_KEYWORDS = [
  'IRA', 'OBBBA', 'OBBB', 'Inflation Reduction Act', 'tax credit',
  '45X', '45Y', '45U', '45W', '48E', '30C',
  'tariff', 'FERC', 'NRC', 'BOEM', 'NEPA', 'permitting',
  'Section 201', 'Section 232', 'Section 301',
  'UFLPA', 'forced labor', 'FEOC', 'foreign entity',
  'NEVI', 'Buy America', 'domestic content',
  'PJM', 'CAISO', 'ERCOT', 'capacity market',
  'EPA', 'rulemaking', 'regulation', 'litigation',
  'executive order', 'White House', 'Treasury',
]

const POLICY_RE = new RegExp(`\\b(${POLICY_KEYWORDS.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})\\b`, 'i')

const BASE = 'https://www.fool.com'

export function earningsTranscriptsAdapter(
  archetypeId: string,
  bundle?: ArchetypeBundle,
): SourceAdapter {
  return {
    name: `earnings_transcripts:${archetypeId}`,
    enabled() {
      const cos =
        bundle?.intelligence?.transcript_companies?.length
          ? bundle.intelligence.transcript_companies
          : FALLBACK_TRANSCRIPT_COMPANIES[archetypeId] ?? []
      return cos.length > 0
    },
    async fetch(ctx: AdapterContext): Promise<SourceItem[]> {
      const companies =
        bundle?.intelligence?.transcript_companies?.length
          ? bundle.intelligence.transcript_companies
          : FALLBACK_TRANSCRIPT_COMPANIES[archetypeId] ?? []
      if (companies.length === 0) return []

      const sinceMs = ctx.since.getTime()
      const out: SourceItem[] = []
      const seenUrls = new Set<string>()

      for (const co of companies) {
        if (ctx.signal?.aborted) break
        try {
          const transcriptUrls = await findRecentTranscripts(co.ticker, ctx)
          for (const tUrl of transcriptUrls.slice(0, 1)) {
            if (ctx.signal?.aborted) break
            if (seenUrls.has(tUrl)) continue
            seenUrls.add(tUrl)
            const items = await mineTranscript(tUrl, co, sinceMs, ctx, archetypeId)
            for (const it of items) out.push(it)
            if (out.length >= ctx.limit) break
          }
        } catch (err) {
          ctx.log?.(`earnings_transcripts[${co.ticker}]: ${(err as Error).message}`)
        }
        if (out.length >= ctx.limit) break
      }

      return out.slice(0, ctx.limit)
    },
  }
}

// ─────────────────────────────────────────────────────────────────────────────

async function findRecentTranscripts(ticker: string, ctx: AdapterContext): Promise<string[]> {
  // Motley Fool search-by-ticker page lists recent transcripts. Pattern:
  //   https://www.fool.com/quote/nyse/{ticker} (or nasdaq) — but the safest
  //   route is the topic page at /earnings/call-transcripts/?company={ticker}.
  // We hit the company-tagged transcripts feed.
  const candidates = [
    `${BASE}/earnings/call-transcripts/?company=${encodeURIComponent(ticker)}`,
    `${BASE}/quote/nyse/${encodeURIComponent(ticker.toLowerCase())}`,
    `${BASE}/quote/nasdaq/${encodeURIComponent(ticker.toLowerCase())}`,
  ]
  for (const url of candidates) {
    try {
      const r = await safeFetch(url, {
        signal: ctx.signal,
        timeoutMs: 15_000,
        headers: {
          'User-Agent': 'Castle Energy Risk Index (engineering@castle.tech)',
        },
      })
      if (!r.ok) continue
      const html = await r.text()
      const urls = extractTranscriptUrls(html, ticker)
      if (urls.length > 0) return urls
    } catch {
      // Try next candidate.
    }
  }
  return []
}

function extractTranscriptUrls(html: string, ticker: string): string[] {
  // Find href patterns linking to earnings call transcripts.
  const re = /href=["']([^"']*earnings\/call-transcripts\/[^"']+)["']/gi
  const out: string[] = []
  const seen = new Set<string>()
  let m: RegExpExecArray | null
  while ((m = re.exec(html)) !== null) {
    let url = m[1]
    if (url.startsWith('/')) url = BASE + url
    // Filter to transcripts that look company-specific
    if (
      url.toLowerCase().includes(ticker.toLowerCase()) ||
      url.includes('earnings/call-transcripts/20')
    ) {
      if (!seen.has(url)) {
        seen.add(url)
        out.push(url)
      }
    }
    if (out.length >= 4) break
  }
  return out
}

async function mineTranscript(
  url: string,
  company: { name: string; ticker: string },
  sinceMs: number,
  ctx: AdapterContext,
  archetypeId: string,
): Promise<SourceItem[]> {
  const r = await safeFetch(url, {
    signal: ctx.signal,
    timeoutMs: 25_000,
    headers: {
      'User-Agent': 'Castle Energy Risk Index (engineering@castle.tech)',
    },
  })
  if (!r.ok) {
    ctx.log?.(`earnings_transcripts[${company.ticker}]: ${url} HTTP ${r.status}`)
    return []
  }
  const html = await r.text()

  // Parse the published date out of the page meta if available.
  const dateMatch = html.match(/<meta[^>]*property=["']article:published_time["'][^>]*content=["']([^"']+)["']/i)
  const publishedAt = dateMatch ? new Date(dateMatch[1]) : new Date()
  if (publishedAt.getTime() < sinceMs) {
    ctx.log?.(`earnings_transcripts[${company.ticker}]: ${url} too old (${publishedAt.toISOString().slice(0, 10)})`)
    return []
  }

  const text = htmlToTextSimple(html)
  // Locate Q&A section. Fool transcripts usually have a "Questions and Answers"
  // header roughly halfway through.
  const qaIdx = text.search(/questions\s+(and|&)\s+answers/i)
  const qaSection = qaIdx >= 0 ? text.slice(qaIdx) : text

  // Crude Q/A segmentation — a single exchange starts at a speaker label
  // ("CEO" or "CFO" or "Analyst") and ends at the next one.
  const paragraphs = qaSection
    .split(/\n\s*\n+/)
    .map((p) => p.trim())
    .filter((p) => p.length >= 80)

  const items: SourceItem[] = []
  for (let i = 0; i < paragraphs.length; i++) {
    const p = paragraphs[i]
    if (!POLICY_RE.test(p)) continue
    const firstSentence = p.match(/^[^.?!]{20,200}[.?!]/)?.[0] ?? p.slice(0, 160)
    items.push({
      url: `${url}#qa-${i}`,
      title: `[${company.ticker} earnings Q&A] ${firstSentence}`.slice(0, 240),
      body: p.slice(0, 2000),
      published_at: publishedAt.toISOString(),
      category: 'earnings_qa',
      extra: {
        company: company.name,
        ticker: company.ticker,
        archetype_hint: archetypeId,
        transcript_url: url,
      },
    })
    if (items.length >= 8) break
  }
  ctx.log?.(`earnings_transcripts[${company.ticker}]: ${items.length} policy Q&A items from ${url.split('/').slice(-2, -1)[0]}`)
  return items
}

function htmlToTextSimple(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/div>/gi, '\n\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
