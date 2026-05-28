/**
 * SEC EDGAR adapter — sponsor 10-K / 10-Q Item 1A risk-factor mining.
 *
 * Why: a public utility's 10-K Item 1A enumerates every regulatory exposure
 * the company's lawyers think material. That's the single best leading-
 * indicator source for project-developer risk that no news outlet replicates.
 *
 * Flow per archetype:
 *   1. Read sponsor CIK list from bundle.intelligence.sponsors (with a
 *      compiled-in fallback so the adapter works even if the intelligence
 *      block isn't populated yet).
 *   2. For each CIK, fetch /submissions/CIK{cik}.json.
 *   3. Walk the recent filings; keep 10-K / 10-Q filed since ctx.since.
 *   4. Fetch the primary HTML document, extract Item 1A "Risk Factors".
 *   5. Split into paragraph-level "risk factors". Per-archetype keyword
 *      filter so we only emit policy-relevant ones — without this, every
 *      10-K floods the matcher with 50–100 paragraphs.
 *   6. Emit one SourceItem per matching paragraph.
 *
 * SEC requires a User-Agent in "Name email@domain" form per their fair-use
 * policy. Set SEC_USER_AGENT. Without it, this adapter no-ops (graceful).
 * Source: https://www.sec.gov/os/accessing-edgar-data
 */

import {
  type SourceAdapter,
  type SourceItem,
  type AdapterContext,
  safeFetch,
} from './types'
import type { ArchetypeBundle } from '@/lib/schemas'

// Fallback sponsor lists — used when bundle.intelligence is absent. The
// canonical config lives on the archetype state itself; this only catches
// the migration window.
const FALLBACK_SPONSORS: Record<
  string,
  Array<{ name: string; cik: string; ticker?: string }>
> = {
  'offshore-wind': [
    { name: 'Avangrid', cik: '0001634910', ticker: 'AGR' },
    { name: 'Dominion Energy', cik: '0000715957', ticker: 'D' },
    { name: 'Eversource Energy', cik: '0001125345', ticker: 'ES' },
    { name: 'Equinor ASA', cik: '0001140625', ticker: 'EQNR' },
  ],
  'utility-solar': [
    { name: 'NextEra Energy', cik: '0000753308', ticker: 'NEE' },
    { name: 'AES Corp', cik: '0000874761', ticker: 'AES' },
    { name: 'First Solar', cik: '0001274494', ticker: 'FSLR' },
    { name: 'Sunrun', cik: '0001469367', ticker: 'RUN' },
    { name: 'Sunnova Energy', cik: '0001772695', ticker: 'NOVA' },
  ],
  'battery-storage': [
    { name: 'Fluence Energy', cik: '0001868941', ticker: 'FLNC' },
    { name: 'Tesla', cik: '0001318605', ticker: 'TSLA' },
    { name: 'Vistra', cik: '0001692819', ticker: 'VST' },
  ],
  'natural-gas': [
    { name: 'Vistra', cik: '0001692819', ticker: 'VST' },
    { name: 'Cheniere Energy', cik: '0001596532', ticker: 'LNG' },
    { name: 'Sempra', cik: '0001032208', ticker: 'SRE' },
    { name: 'Williams Companies', cik: '0000107263', ticker: 'WMB' },
  ],
  'nuclear-smr': [
    { name: 'Constellation Energy', cik: '0001868275', ticker: 'CEG' },
    { name: 'NuScale Power', cik: '0001650164', ticker: 'SMR' },
  ],
  'ev-charging': [
    { name: 'ChargePoint', cik: '0001777393', ticker: 'CHPT' },
    { name: 'EVgo', cik: '0001823766', ticker: 'EVGO' },
    { name: 'Blink Charging', cik: '0001429764', ticker: 'BLNK' },
  ],
}

// Per-archetype keywords used to filter risk-factor paragraphs at the
// adapter level (BEFORE matching). Without this prefilter, a typical 10-K
// produces 30–100 paragraphs and the matcher can't tell signal from noise.
const RF_KEYWORDS: Record<string, RegExp[]> = {
  'offshore-wind': [
    /\boffshore\s+wind\b/i,
    /\bBOEM\b/,
    /\blease\s+(area|sale|moratorium)/i,
    /\bcontracts?\s+for\s+differences?\b/i,
    /\bOREC\b/,
    /\bsection\s+232\b/i,
    /\bJones Act\b/i,
    /\bsteel\s+tariff/i,
  ],
  'utility-solar': [
    /\butility[- ]solar\b/i,
    /\bsolar\b.*\b(tariff|duty|AD\/CVD|antidumping)/i,
    /\bsection\s+(201|301)\b/i,
    /\bUFLPA\b/,
    /\bforced labor\b/i,
    /\bFEOC\b|\bforeign entity of concern\b/i,
    /\b(48E|45Y|45X|§48E|§45Y|§45X)\b/,
    /\bIRA\b.*\b(repeal|sunset)/i,
  ],
  'natural-gas': [
    /\bLNG\b.*\b(export|terminal|approval|authorization)/i,
    /\bFERC\b/,
    /\bnatural gas pipeline\b/i,
    /\bcombustion turbine\b/i,
    /\bNEPA\b/,
    /\bCP2\b/,
  ],
  'battery-storage': [
    /\bbattery (storage|energy storage|cell|component)/i,
    /\bbess\b/i,
    /\bsection\s+301\b/i,
    /\bsodium-?ion|lithium-?ion\b/i,
    /\bUL\s*9540\b/i,
    /\b(45X|48E|§45X|§48E)\b/,
    /\bthermal runaway\b/i,
  ],
  'nuclear-smr': [
    /\bsmall modular reactor|SMR\b/,
    /\bNRC\b|\bnuclear regulatory commission\b/i,
    /\bHALEU\b|\bhigh-assay low-enriched uranium\b/i,
    /\bRussian uranium\b/i,
    /\b(45U|§45U)\b/,
    /\bconstruction permit\b/i,
    /\bpart\s+(50|53)\b/i,
  ],
  'ev-charging': [
    /\bEV charging\b/i,
    /\bNEVI\b/,
    /\bDC fast charg/i,
    /\bcharging infrastructure\b/i,
    /\b(30C|45W|§30C|§45W)\b/,
    /\bbuy america\b/i,
    /\bcommercial clean vehicle\b/i,
  ],
}

const SUBMISSIONS_BASE = 'https://data.sec.gov/submissions/CIK'
const ARCHIVES_BASE = 'https://www.sec.gov/Archives/edgar/data'

// SEC asks for 10/sec max; we space requests with awaits between calls.

export function secEdgarAdapter(archetypeId: string, bundle?: ArchetypeBundle): SourceAdapter {
  return {
    name: `sec_edgar:${archetypeId}`,
    enabled() {
      if (!process.env.SEC_USER_AGENT) return false
      const sponsorsFromBundle = bundle?.intelligence?.sponsors ?? []
      const sponsors = sponsorsFromBundle.length > 0
        ? sponsorsFromBundle
        : FALLBACK_SPONSORS[archetypeId] ?? []
      return sponsors.length > 0
    },
    async fetch(ctx: AdapterContext): Promise<SourceItem[]> {
      if (!process.env.SEC_USER_AGENT) return []
      const sponsorsFromBundle = bundle?.intelligence?.sponsors ?? []
      const sponsors = sponsorsFromBundle.length > 0
        ? sponsorsFromBundle
        : FALLBACK_SPONSORS[archetypeId] ?? []
      if (sponsors.length === 0) return []

      const keywords = RF_KEYWORDS[archetypeId] ?? []
      // 10-K is annual, 10-Q is quarterly. A 24h or 7d ctx.since would
      // almost never include a filing. Apply a 180-day floor so the SEC
      // adapter has something to work with on every run. The matcher
      // ultimately filters; producing too many items here is fine.
      const FLOOR_MS = 180 * 24 * 3600 * 1000
      const sinceMs = Math.min(ctx.since.getTime(), Date.now() - FLOOR_MS)
      const out: SourceItem[] = []

      for (const sponsor of sponsors) {
        if (ctx.signal?.aborted) break
        try {
          const filings = await listRecentFilings(sponsor.cik, ctx)
          // Keep 10-K and 10-Q filed since ctx.since.
          const relevant = filings.filter(
            (f) =>
              (f.form === '10-K' || f.form === '10-Q') &&
              Date.parse(f.filingDate) >= sinceMs,
          )
          ctx.log?.(`sec_edgar[${sponsor.name}]: ${relevant.length} 10-K/Q since ${ctx.since.toISOString().slice(0, 10)}`)
          for (const f of relevant.slice(0, 3)) {
            if (ctx.signal?.aborted) break
            const items = await mineRiskFactors(sponsor, f, keywords, ctx, archetypeId)
            for (const it of items) out.push(it)
            if (out.length >= ctx.limit) break
          }
        } catch (err) {
          ctx.log?.(`sec_edgar[${sponsor.name}]: ${(err as Error).message}`)
        }
        if (out.length >= ctx.limit) break
      }

      return out.slice(0, ctx.limit)
    },
  }
}

// ─────────────────────────────────────────────────────────────────────────────

interface SecFiling {
  accessionNumber: string
  form: string
  filingDate: string
  primaryDocument: string
}

async function listRecentFilings(cik: string, ctx: AdapterContext): Promise<SecFiling[]> {
  const url = `${SUBMISSIONS_BASE}${cik}.json`
  const r = await safeFetch(url, {
    signal: ctx.signal,
    timeoutMs: 15_000,
    headers: {
      'User-Agent': process.env.SEC_USER_AGENT ?? '',
      Accept: 'application/json',
    },
  })
  if (!r.ok) {
    throw new Error(`submissions HTTP ${r.status}`)
  }
  const json = (await r.json()) as any
  const recent = json?.filings?.recent ?? {}
  const forms: string[] = recent.form ?? []
  const accessions: string[] = recent.accessionNumber ?? []
  const dates: string[] = recent.filingDate ?? []
  const primaryDocs: string[] = recent.primaryDocument ?? []
  const out: SecFiling[] = []
  const n = Math.min(forms.length, accessions.length, dates.length, primaryDocs.length)
  for (let i = 0; i < n; i++) {
    out.push({
      form: forms[i],
      accessionNumber: accessions[i],
      filingDate: dates[i],
      primaryDocument: primaryDocs[i],
    })
  }
  return out
}

async function mineRiskFactors(
  sponsor: { name: string; cik: string; ticker?: string },
  filing: SecFiling,
  keywords: RegExp[],
  ctx: AdapterContext,
  archetypeId: string,
): Promise<SourceItem[]> {
  // Filing URL convention: /Archives/edgar/data/{cik_int}/{accessionNoDashes}/{primaryDocument}
  const cikInt = String(parseInt(sponsor.cik, 10))
  const accNoDash = filing.accessionNumber.replace(/-/g, '')
  const docUrl = `${ARCHIVES_BASE}/${cikInt}/${accNoDash}/${filing.primaryDocument}`
  const indexUrl = `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${cikInt}&type=${filing.form}&dateb=&owner=include&count=10`

  const r = await safeFetch(docUrl, {
    signal: ctx.signal,
    timeoutMs: 30_000,
    headers: {
      'User-Agent': process.env.SEC_USER_AGENT ?? '',
      Accept: 'text/html,application/xhtml+xml',
    },
  })
  if (!r.ok) {
    ctx.log?.(`sec_edgar[${sponsor.name}]: filing HTTP ${r.status}`)
    return []
  }
  const html = await r.text()

  const item1a = extractItem1A(html)
  if (!item1a) {
    ctx.log?.(`sec_edgar[${sponsor.name}]: no Item 1A found in ${filing.accessionNumber}`)
    return []
  }

  const paras = splitIntoRiskFactors(item1a)
  const matched: SourceItem[] = []
  for (let i = 0; i < paras.length; i++) {
    const para = paras[i]
    if (para.length < 100) continue
    let hits = 0
    for (const re of keywords) if (re.test(para)) hits++
    if (hits === 0) continue
    const firstSentence = para.match(/^[^.?!]{20,200}[.?!]/)?.[0] ?? para.slice(0, 160)
    matched.push({
      url: `${docUrl}#rf-${i}`,
      title: `[${sponsor.name} ${filing.form}] ${firstSentence}`.slice(0, 240),
      body: para.slice(0, 2000),
      published_at: new Date(filing.filingDate).toISOString(),
      category: 'sec_risk_factor',
      extra: {
        sponsor: sponsor.name,
        ticker: sponsor.ticker,
        cik: sponsor.cik,
        form: filing.form,
        accession: filing.accessionNumber,
        archetype_hint: archetypeId,
        filing_index_url: indexUrl,
      },
    })
    if (matched.length >= 15) break
  }
  return matched
}

/**
 * Pull the "Item 1A. Risk Factors" section out of a 10-K/10-Q HTML.
 *
 * Strategy: find the first Item 1A header, capture text until the next
 * top-level item header (Item 1B/2/etc). Operates on the visible-text
 * projection of the HTML rather than the DOM — robust enough for ~80% of
 * filings without pulling in a full HTML parser.
 */
function extractItem1A(html: string): string | null {
  const text = htmlToText(html)
  // Match "Item 1A. Risk Factors" (case-insensitive, possibly with extra
  // whitespace or punctuation between Item and 1A).
  const startRe = /\bItem\s*1A[\.\s\-:]*\s*Risk\s+Factors\b/i
  const startMatch = startRe.exec(text)
  if (!startMatch) return null
  const start = startMatch.index + startMatch[0].length
  // End: the next "Item 1B" or "Item 2" header. Fall back to a hard cap
  // (250k chars) if no clear end-of-section is found.
  const tail = text.slice(start)
  const endRe = /\bItem\s*(1B|2)[\.\s\-:]/i
  const endMatch = endRe.exec(tail)
  const end = endMatch ? endMatch.index : Math.min(tail.length, 250_000)
  return tail.slice(0, end).trim()
}

/** Crude paragraph split — paragraphs in 10-Ks are usually 2+ newlines or a
 *  bullet/heading. We coalesce short fragments into the preceding paragraph. */
function splitIntoRiskFactors(section: string): string[] {
  const raw = section.split(/\n\s*\n+/).map((p) => p.replace(/\s+/g, ' ').trim())
  const out: string[] = []
  for (const p of raw) {
    if (p.length === 0) continue
    if (p.length < 80 && out.length > 0) {
      // Short fragment — treat as a sub-heading; prepend to next.
      out[out.length - 1] = `${out[out.length - 1]} ${p}`
    } else {
      out.push(p)
    }
  }
  return out
}

/** Minimal HTML → text. Strips tags, decodes a few entities, collapses
 *  whitespace. Adequate for SEC filings which use a consistent style. */
function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/div>/gi, '\n\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x?[0-9a-f]+;/gi, ' ')
    .replace(/[  ]/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
