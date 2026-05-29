'use client'

import { useEffect, useState } from 'react'
import type { NewsItem } from '@/lib/schemas'

/**
 * News rail with click → popup. Each item opens a centered modal showing
 * source, time, tag, full title, summary (if any), and an "Open source ↗"
 * external link. Replaces the old behaviour where news items linked to the
 * first risk's detail page — confusing, because the item was rarely about
 * that specific risk.
 */

/**
 * Map a known source label to its primary web domain. Used for the search
 * fallback when a news item has no canonical URL on file — we route the
 * user to a Google site-search restricted to that outlet's domain with the
 * title pre-filled, so they still get somewhere useful.
 *
 * Add to this table as new sources appear. Anything not mapped falls back
 * to a plain Google search.
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

/** Build a search URL for items without a canonical URL on file. */
function searchUrlFor(source: string, title: string): string {
  const q = encodeURIComponent(title.slice(0, 200))
  const domain = SOURCE_DOMAINS[source.trim().toUpperCase()]
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
  const [openIdx, setOpenIdx] = useState<number | null>(null)
  const open = openIdx != null ? news[openIdx] : null

  useEffect(() => {
    if (openIdx == null) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpenIdx(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [openIdx])

  return (
    <>
      <div className="section-label">
        <span className="l">News &amp; developments</span>
        <span className="r">{weekCount} this week</span>
      </div>
      <section className="news-list news-rail">
        {news.map((n, i) => (
          <button
            key={`${n.source}-${i}`}
            type="button"
            className="news-row as-button"
            onClick={() => setOpenIdx(i)}
            title={n.title}
          >
            <span className="src">{n.source}</span>
            <span className="ago">{n.ago}</span>
            <span className="ttl">{n.title}</span>
          </button>
        ))}
      </section>

      {open && (
        <div
          className="news-modal-overlay"
          onClick={() => setOpenIdx(null)}
          role="dialog"
          aria-modal="true"
          aria-label="News item"
        >
          <div className="news-modal" onClick={(e) => e.stopPropagation()}>
            <button
              className="news-modal-close"
              onClick={() => setOpenIdx(null)}
              aria-label="Close"
            >
              ×
            </button>
            <div className="news-modal-meta">
              <span className="src">{open.source}</span>
              <span className="sep">·</span>
              <span className="ago">{open.ago}</span>
              <span className="sep">·</span>
              <span className={`tag tag-${open.tag}`}>{open.tag}</span>
            </div>
            <h3 className="news-modal-title">{open.title}</h3>
            {open.sum && <p className="news-modal-sum">{open.sum}</p>}
            <div className="news-modal-foot">
              {open.url ? (
                <a
                  href={open.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="news-modal-link"
                >
                  Open source ↗
                </a>
              ) : (
                <a
                  href={searchUrlFor(open.source, open.title)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="news-modal-link is-search"
                  title="No canonical URL on file — search the source instead"
                >
                  Search {open.source} ↗
                </a>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
