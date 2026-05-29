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
                <span className="news-modal-no-link">No source URL on file</span>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
