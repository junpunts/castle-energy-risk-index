/**
 * Federal Register adapter.
 *
 * Public JSON API, no key required. Highest-leverage feed for the index
 * because every policy-category risk (BOEM rulemakings, EO implementation
 * notices, Treasury guidance, EPA permits, Section 232 proclamations) lands
 * here as a primary source first, news outlets second.
 *
 * Docs: https://www.federalregister.gov/developers/documentation/api/v1
 *
 * Strategy: one query, broad keyword OR'd, fetched per archetype. We don't
 * filter by agency at the API level because (a) the agencies that matter
 * vary by archetype and (b) the matcher does the precision filtering.
 */

import { type SourceAdapter, type SourceItem, type AdapterContext, safeFetch } from './types'

// Per-archetype query terms. These ride into the Federal Register `conditions[term]`
// param. We OR them. Tune as we add archetypes.
const QUERY_TERMS: Record<string, string[]> = {
  'offshore-wind': [
    'offshore wind',
    'BOEM lease',
    'wind energy areas',
    'OREC',
    'Atlantic Shores',
    'Empire Wind',
    'monopile',
  ],
  'utility-solar': [
    'utility solar',
    'photovoltaic',
    'AD/CVD solar',
    'Section 201 solar',
    'interconnection queue',
    'crystalline silicon',
    'forced labor solar',
    'FEOC',
  ],
  'natural-gas': [
    'LNG export',
    'natural gas pipeline',
    'FERC certificate',
    'liquefied natural gas',
    'combustion turbine',
    'Henry Hub',
    'NEPA categorical exclusion',
  ],
  'onshore-wind': ['onshore wind', 'wind energy', 'PTC wind'],
  'battery-storage': ['battery storage', 'energy storage', 'ITC storage', 'BESS'],
  'green-hydrogen': ['clean hydrogen', '45V hydrogen', 'electrolyzer'],
  'ev-charging': ['EV charging', 'NEVI', 'electric vehicle infrastructure'],
}

const ENDPOINT = 'https://www.federalregister.gov/api/v1/documents.json'

/**
 * Build an adapter scoped to a single archetype's query set. Use one
 * instance per archetype so news_cache.source carries archetype context.
 */
export function federalRegisterAdapter(archetypeId: string): SourceAdapter {
  return {
    name: `federal_register:${archetypeId}`,
    enabled() {
      return Boolean(QUERY_TERMS[archetypeId])
    },
    async fetch(ctx: AdapterContext): Promise<SourceItem[]> {
      const terms = QUERY_TERMS[archetypeId]
      if (!terms) return []
      const sinceIso = ctx.since.toISOString().slice(0, 10) // YYYY-MM-DD

      const results: SourceItem[] = []
      // FR API does single-term searches well; multi-term OR via `term` is
      // unreliable. Loop and merge — small enough N to be fine.
      for (const term of terms) {
        if (ctx.signal?.aborted) break
        const url =
          `${ENDPOINT}` +
          `?conditions[term]=${encodeURIComponent(term)}` +
          `&conditions[publication_date][gte]=${sinceIso}` +
          `&per_page=20` +
          `&order=newest`
        try {
          const r = await safeFetch(url, { signal: ctx.signal, timeoutMs: 15_000 })
          if (!r.ok) {
            ctx.log?.(`federal_register: ${term} → HTTP ${r.status}`)
            continue
          }
          const json: any = await r.json()
          for (const doc of json.results ?? []) {
            results.push({
              url: doc.html_url ?? doc.pdf_url ?? doc.public_inspection_pdf_url,
              title: doc.title,
              body: doc.abstract ?? undefined,
              published_at: new Date(doc.publication_date).toISOString(),
              category: doc.type, // 'Rule', 'Proposed Rule', 'Notice', 'Presidential Document'
              extra: {
                agencies: (doc.agencies ?? []).map((a: any) => a.name).filter(Boolean),
                document_number: doc.document_number,
                action: doc.action,
                archetype_hint: archetypeId,
              },
            })
          }
        } catch (err) {
          ctx.log?.(`federal_register: ${term} fetch failed: ${(err as Error).message}`)
        }
      }

      // Dedupe within this adapter's pull on URL.
      const seen = new Set<string>()
      const unique: SourceItem[] = []
      for (const item of results) {
        if (!item.url || seen.has(item.url)) continue
        seen.add(item.url)
        unique.push(item)
      }
      return unique.slice(0, ctx.limit)
    },
  }
}
