/**
 * CourtListener adapter — federal-court docket signal.
 *
 * CourtListener (https://www.courtlistener.com) is free.law's mirror of
 * PACER and most state court systems. Public REST API.
 *
 * Litigation matters BEFORE judgement: a stay-of-construction motion or a
 * preliminary injunction in an EPA Clean Air Act case lands in CourtListener
 * the day it's docketed — weeks before the trade press picks it up. Even an
 * unsuccessful petition for review can stall a project for months.
 *
 * Per-archetype queries live in bundle.intelligence.litigation_queries with
 * compiled-in fallbacks. Each query is shipped as `q={…}` against the
 * RECAP/docket search endpoint with a filed_after filter.
 *
 * Auth REQUIRED via COURT_LISTENER_TOKEN — as of late 2024, CourtListener
 * blocked anonymous API access ("Anonymous users don't have permission to
 * access the API"). Without the token, this adapter is disabled and returns
 * zero items rather than hammering the endpoint with 403s. Free token from
 * https://www.courtlistener.com/help/api/rest/.
 */

import {
  type SourceAdapter,
  type SourceItem,
  type AdapterContext,
  safeFetch,
} from './types'
import type { ArchetypeBundle } from '@/lib/schemas'

const ENDPOINT = 'https://www.courtlistener.com/api/rest/v3/search/'

const FALLBACK_QUERIES: Record<string, string[]> = {
  'offshore-wind': [
    '"BOEM" AND "offshore wind"',
    '"Vineyard Wind"',
    '"Empire Wind"',
    '"OREC" AND solicitation',
    '"offshore wind lease"',
  ],
  'utility-solar': [
    '"AD/CVD" AND solar',
    '"Section 201" AND solar',
    '"UFLPA" AND solar',
    '"Auxin Solar"',
    '"Solar IV"',
  ],
  'battery-storage': [
    '"Section 301" AND battery',
    '"battery energy storage" AND fire',
    '"BESS" AND injunction',
    '"FEOC" AND battery',
  ],
  'natural-gas': [
    '"CP2 LNG"',
    '"NEPA" AND pipeline',
    '"natural gas export"',
    '"FERC certificate" AND pipeline',
  ],
  'nuclear-smr': [
    '"Nuclear Regulatory Commission" AND construction',
    '"Beyond Nuclear"',
    '"BWRX-300"',
    '"small modular reactor" AND petition',
  ],
  'ev-charging': [
    '"NEVI" AND petition',
    '"Build America Buy America" AND charger',
    '"EV charging" AND waiver',
  ],
}

export function courtListenerAdapter(
  archetypeId: string,
  bundle?: ArchetypeBundle,
): SourceAdapter {
  return {
    name: `court_listener:${archetypeId}`,
    enabled() {
      if (!process.env.COURT_LISTENER_TOKEN) return false
      const queries =
        bundle?.intelligence?.litigation_queries?.length
          ? bundle.intelligence.litigation_queries
          : FALLBACK_QUERIES[archetypeId] ?? []
      return queries.length > 0
    },
    async fetch(ctx: AdapterContext): Promise<SourceItem[]> {
      const queries =
        bundle?.intelligence?.litigation_queries?.length
          ? bundle.intelligence.litigation_queries
          : FALLBACK_QUERIES[archetypeId] ?? []
      if (queries.length === 0) return []

      const sinceIso = ctx.since.toISOString().slice(0, 10)
      const out: SourceItem[] = []
      const seen = new Set<string>()

      for (const q of queries) {
        if (ctx.signal?.aborted) break
        try {
          // type=r → RECAP (federal docket); date_filed_after → ISO YYYY-MM-DD.
          const url =
            `${ENDPOINT}?type=r` +
            `&q=${encodeURIComponent(q)}` +
            `&filed_after=${sinceIso}` +
            `&order_by=dateFiled%20desc`
          const headers: Record<string, string> = {
            Accept: 'application/json',
            'User-Agent': process.env.SEC_USER_AGENT ?? 'Castle Energy Risk Index (engineering@castle.tech)',
          }
          if (process.env.COURT_LISTENER_TOKEN) {
            headers.Authorization = `Token ${process.env.COURT_LISTENER_TOKEN}`
          }
          const r = await safeFetch(url, {
            signal: ctx.signal,
            timeoutMs: 20_000,
            headers,
          })
          if (!r.ok) {
            ctx.log?.(`court_listener[${archetypeId}]: q="${q.slice(0, 40)}" HTTP ${r.status}`)
            continue
          }
          const json = (await r.json()) as any
          const results = json?.results ?? []
          ctx.log?.(`court_listener[${archetypeId}]: q="${q.slice(0, 40)}" → ${results.length}`)
          for (const r of results) {
            const itm = normaliseDocket(r)
            if (!itm) continue
            if (seen.has(itm.url)) continue
            seen.add(itm.url)
            itm.extra = { ...(itm.extra ?? {}), query: q, archetype_hint: archetypeId }
            out.push(itm)
            if (out.length >= ctx.limit) break
          }
        } catch (err) {
          ctx.log?.(`court_listener[${archetypeId}]: ${(err as Error).message}`)
        }
        if (out.length >= ctx.limit) break
      }

      return out.slice(0, ctx.limit)
    },
  }
}

function normaliseDocket(r: any): SourceItem | null {
  // RECAP search hits have varying shapes; we accept the common subset.
  const caseName = r.caseName ?? r.case_name ?? r.case_name_full ?? '(case)'
  const court = r.court ?? r.court_id ?? ''
  const dateFiled = r.dateFiled ?? r.filed ?? r.date_filed
  const docketNumber = r.docketNumber ?? r.docket_number ?? ''
  // Absolute URL — older shapes had `absolute_url` relative; newer return full.
  const path = r.absolute_url ?? r.url ?? ''
  if (!path) return null
  const url = path.startsWith('http') ? path : `https://www.courtlistener.com${path}`
  if (!dateFiled) return null

  // Snippet for context — accept whichever description field is populated.
  const snippet =
    r.snippet ??
    r.docket_entries?.[0]?.description ??
    r.description ??
    ''
  const title = [caseName, docketNumber, court]
    .filter(Boolean)
    .join(' · ')
    .slice(0, 240)
  return {
    url,
    title,
    body: typeof snippet === 'string' ? snippet.slice(0, 2000) : undefined,
    published_at: new Date(dateFiled).toISOString(),
    category: 'court_docket',
    extra: {
      court,
      docket_number: docketNumber,
      case_name: caseName,
    },
  }
}
