import type { NewsItem } from '@/lib/schemas'

/**
 * News rail. Each row is a direct external link to the news source — the
 * canonical NewsItem.url if present, otherwise a Google site-search
 * restricted to the source's domain with the title pre-filled (so the
 * user still lands somewhere useful for legacy items without a URL).
 */

/**
 * Map a known source label to its primary web domain. Used for the search
 * fallback when a news item has no canonical URL on file.
 */
const SOURCE_DOMAINS: Record<string, string> = {
  'FEDERAL REGISTER':         'federalregister.gov',
  'BOEM':                     'boem.gov',
  'EPA':                      'epa.gov',
  'EPA EAB':                  'epa.gov',
  'DOE':                      'energy.gov',
  'DOE LPO':                  'energy.gov',
  'FERC':                     'ferc.gov',
  'NRC':                      'nrc.gov',
  'USTR':                     'ustr.gov',
  'TREASURY':                 'home.treasury.gov',
  'CBP':                      'cbp.gov',
  'USITC':                    'usitc.gov',
  'COMMERCE':                 'commerce.gov',
  'FHWA':                     'fhwa.dot.gov',
  'CONGRESS':                 'congress.gov',
  'WHITE HOUSE':              'whitehouse.gov',
  'POLITICO':                 'politico.com',
  'REUTERS':                  'reuters.com',
  'HEATMAP':                  'heatmap.news',
  'UTILITY DIVE':             'utilitydive.com',
  'CANARY MEDIA':             'canarymedia.com',
  'EIA':                      'eia.gov',
  'PJM':                      'pjm.com',
  'CAISO':                    'caiso.com',
  'ERCOT':                    'ercot.com',
  'NYSERDA':                  'nyserda.ny.gov',
  'BIS':                      'bis.gov',
  'NTEA':                     'ntea.com',
  'AUTOMOTIVE FLEET':         'automotive-fleet.com',
  'BEYOND NUCLEAR':           'beyondnuclear.org',
  'SEC':                      'sec.gov',
  'SEC EDGAR':                'sec.gov',
  'COURTLISTENER':            'courtlistener.com',
  'MOTLEY FOOL':              'fool.com',
  'D.C. CIR.':                'cadc.uscourts.gov',
  'SHINE':                    'shinefusion.com',
  'PUC':                      'puc.state.tx.us',
}

function hrefFor(n: NewsItem): string {
  if (n.url) return n.url
  const q = encodeURIComponent((n.title ?? '').slice(0, 200))
  const domain = SOURCE_DOMAINS[String(n.source ?? '').trim().toUpperCase()]
  if (domain) return `https://www.google.com/search?q=${q}+site:${domain}`
  return `https://www.google.com/search?q=${q}`
}

export function NewsRail({
  news,
  weekCount,
}: {
  news: NewsItem[]
  weekCount: number
}) {
  return (
    <>
      <div className="section-label">
        <span className="l">News &amp; developments</span>
        <span className="r">{weekCount} this week</span>
      </div>
      <section className="news-list news-rail">
        {news.map((n, i) => (
          <a
            key={`${n.source}-${i}`}
            className="news-row"
            href={hrefFor(n)}
            target="_blank"
            rel="noopener noreferrer"
            title={n.url ? n.title : `No canonical URL on file — searching ${n.source}`}
          >
            <span className="src">{n.source}</span>
            <span className="ago">{n.ago}</span>
            <span className="ttl">{n.title}</span>
          </a>
        ))}
      </section>
    </>
  )
}
