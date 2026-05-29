import Link from 'next/link'
import { fmtCountdown } from '@/lib/format'
import { readAllArchetypes } from '@/lib/archetypes/read'
import { fmtSignedInt } from '@/lib/format'

// Public dashboard is cached aggressively. apply_archetype_revision triggers
// /api/revalidate when state changes so this stays fresh enough.
// `force-dynamic` skips build-time prerender; ISR caches at the edge after the
// first hit.
export const dynamic = 'force-dynamic'
export const revalidate = 60

export default async function PublicIndex() {
  const archetypes = await readAllArchetypes()

  // Sort by composite score, descending — gives the grid a clear high-to-low
  // ranking. Tie-break on id for stable order.
  archetypes.sort(
    (a, b) =>
      b.archetype.composite - a.archetype.composite ||
      a.archetype_id.localeCompare(b.archetype_id),
  )

  const totalRisks = archetypes.reduce((s, a) => s + a.archetype.risks_total, 0)
  const totalHigh = archetypes.reduce((s, a) => s + a.archetype.risks_high, 0)
  const totalNews = archetypes.reduce((s, a) => s + a.archetype.news_this_week, 0)

  // Capex-weighted composite — same logic as the prototype's reading.
  const weighted = archetypes.reduce(
    (acc, a) => {
      acc.num += a.archetype.composite * a.archetype.typical.capex
      acc.den += a.archetype.typical.capex
      return acc
    },
    { num: 0, den: 0 },
  )
  const composite = weighted.den > 0 ? Math.round(weighted.num / weighted.den) : 0

  // Crude "WoW delta": average of per-archetype deltas. Will be replaced by a
  // proper week-prior composite read in M10.
  const deltaWoW =
    archetypes.length > 0
      ? Math.round(
          archetypes.reduce((s, a) => s + a.archetype.composite_delta, 0) /
            archetypes.length,
        )
      : 0

  // 12-week activity sparkline: aggregate the archetype.attention_weekly arrays
  // across all archetypes. Real signal for "how much is happening" — composite
  // moves are slow, but weekly mention counts swing visibly week to week.
  const activityWeekly: number[] = new Array(12).fill(0)
  for (const a of archetypes) {
    const w = a.archetype.attention_weekly ?? []
    for (let i = 0; i < 12; i++) activityWeekly[i] += w[i] ?? 0
  }
  const activityThisWeek = activityWeekly[11] ?? 0
  const activityTotal = activityWeekly.reduce((s, v) => s + v, 0)

  // Ticker content: the next dated catalysts across all archetypes — deadlines,
  // hearings, rulemakings. Pulled from risk_details.events and filtered to
  // future-dated. Up to 8 for a respectable marquee loop.
  const now = Date.now()
  const ticker = archetypes
    .flatMap((a) =>
      Object.entries(a.risk_details ?? {}).flatMap(([rid, d]) =>
        (d.events ?? [])
          .filter((e) => e.future && Date.parse(e.date) >= now)
          .map((e) => ({
            archetypeId: a.archetype_id,
            archetypeName: a.archetype.name,
            riskId: rid,
            ...e,
          })),
      ),
    )
    .sort((a, b) => Date.parse(a.date) - Date.parse(b.date))
    .slice(0, 8)

  // Dateline — week of year + ISO date, "Issue NN · MMM DD".
  const today = new Date()
  const week = isoWeek(today)
  const issueLabel = `Issue ${String(week).padStart(2, '0')} · ${today.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`

  return (
    <>
      <nav className="nav">
        <div className="nav-inner">
          <Link className="brand" href="/">
            <img src="/assets/svg/castle-logo-black.svg" alt="Castle" />
            <span className="product">Risk Index</span>
          </Link>
          <div></div>
          <div className="right">
            <span className="live">Live</span>
          </div>
        </div>
      </nav>

      {/* Live ticker — next dated catalysts across every archetype. Marquee
          scrolls horizontally; pauses on hover. Says "this is alive" without
          shouting. */}
      {ticker.length > 0 && (
        <div className="live-ticker" aria-label="Upcoming catalysts">
          <span className="live-ticker-tag">
            <span className="dot" aria-hidden />Live
          </span>
          <div className="live-ticker-track">
            <div className="live-ticker-loop">
              {[...ticker, ...ticker].map((c, i) => (
                <Link
                  key={`${c.archetypeId}-${c.riskId}-${c.date}-${i}`}
                  href={`/archetypes/${c.archetypeId}/risks/${c.riskId}`}
                  className="live-ticker-item"
                >
                  <span className="when">{fmtCountdown(c.date)}</span>
                  <span className="arch">{c.archetypeName}</span>
                  <span className="sep">·</span>
                  <span className="ttl">{c.title}</span>
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}

      <main className="page">
        <header className="hero">
          <div>
            <span className="eyebrow">{issueLabel}</span>
            <h1 className="display-1">
              Renewable<br />project risk.
            </h1>
            <p className="lede">
              {archetypes.length} project archetype{archetypes.length === 1 ? '' : 's'} covering the
              bulk of US renewables deal flow. We monitor {totalRisks} specific risks across them in
              real time, sourced from Congress.gov, the Federal Register, USTR, Kalshi prediction
              markets, and 40+ industry sources.
            </p>
          </div>
          <div className="reading">
            <span className="tiny-label label">Composite reading</span>
            <span className="big-num">
              {composite}
              <span className="of">/100</span>
            </span>
            <div className="meta-row">
              <span className="tiny-label">Capex-weighted</span>
              <span className={`delta ${deltaWoW > 0 ? 'is-up' : deltaWoW < 0 ? 'is-down' : 'is-flat'}`}>
                {deltaWoW === 0 ? 'flat' : fmtSignedInt(deltaWoW)} WoW
              </span>
            </div>
            {activityTotal > 0 && (
              <div className="reading-trace">
                <ActivityTrace weekly={activityWeekly} />
                <div className="reading-trace-foot">
                  <span className="tiny-label">12-wk activity</span>
                  <span className="reading-trace-num">{activityThisWeek} this week</span>
                </div>
              </div>
            )}
          </div>
        </header>

        <section className="archetypes">
          {archetypes.map((a) => {
            const d = a.archetype.composite_delta
            const deltaClass = d === 0 ? 'is-flat' : d > 0 ? 'is-up' : 'is-down'
            return (
              <Link key={a.archetype_id} className="arch" href={`/archetypes/${a.archetype_id}`}>
                <span className="eyebrow tag">{a.archetype.eyebrow}</span>
                <h3 className="name">{a.archetype.name}</h3>
                <p className="desc">{a.archetype.blurb}</p>
                <div className="footer">
                  <div className="score">{a.archetype.composite}</div>
                  <div className="footer-meta">
                    <span className="small">
                      {a.archetype.risks_total} risks · {a.archetype.risks_high} high
                    </span>
                    <span className={`delta ${deltaClass}`}>{fmtSignedInt(d)} WoW</span>
                  </div>
                </div>
              </Link>
            )
          })}
        </section>

        <section className="note-row">
          <div>
            <span className="eyebrow label">Risks tracked</span>
            <div className="v">{totalRisks}</div>
            <p className="help">
              across all archetypes. {totalHigh} currently high-likelihood — see archetype pages.
            </p>
          </div>
          <div>
            <span className="eyebrow label">Items this week</span>
            <div className="v">{totalNews}</div>
            <p className="help">policy filings, rules, and market moves.</p>
          </div>
          <div>
            <span className="eyebrow label">Inside 90 days</span>
            <div className="v">—</div>
            <p className="help">dated catalysts — comment deadlines, rule effective dates, hearings.</p>
          </div>
        </section>
      </main>

      <footer className="foot">
        <span>Castle · For informational purposes only</span>
        <span>Updated daily · 06:00 ET</span>
      </footer>
    </>
  )
}

/** 12-week summed-attention sparkline rendered below the composite number.
 *  Filled area + line + endpoint dot. Color signals direction: red if the
 *  trailing 4-week sum is rising vs the prior 4 weeks, green if falling. */
function ActivityTrace({ weekly }: { weekly: number[] }) {
  const W = 280
  const H = 56
  const max = Math.max(...weekly, 4)
  const last4 = weekly.slice(-4).reduce((s, v) => s + v, 0)
  const prior4 = weekly.slice(-8, -4).reduce((s, v) => s + v, 0)
  const rising = last4 > prior4
  const color = rising ? '#8B2A1C' : '#00544F'
  const step = W / (weekly.length - 1 || 1)
  const points = weekly.map((v, i) => {
    const x = i * step
    const y = H - (v / max) * (H - 6) - 3
    return [x, y] as const
  })
  const line = points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ')
  const area = `${line} L${W},${H} L0,${H} Z`
  const [lx, ly] = points[points.length - 1]
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: '100%', height: H, display: 'block' }}>
      <defs>
        <linearGradient id="act-grad" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor={color} stopOpacity={0.18} />
          <stop offset="1" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#act-grad)" />
      <path d={line} fill="none" stroke={color} strokeWidth={1.5} />
      <circle cx={lx} cy={ly} r={3} fill={color} />
    </svg>
  )
}

/** ISO 8601 week number — used for "Issue NN" in the dateline. */
function isoWeek(d: Date): number {
  const target = new Date(d.getTime())
  target.setHours(0, 0, 0, 0)
  // Thursday in current week decides the year.
  target.setDate(target.getDate() + 3 - ((target.getDay() + 6) % 7))
  const firstThursday = new Date(target.getFullYear(), 0, 4)
  const diff = target.getTime() - firstThursday.getTime()
  return 1 + Math.round(diff / (7 * 24 * 3600 * 1000))
}
