import Link from 'next/link'
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

      <main className="page">
        <header className="hero">
          <div>
            <span className="eyebrow">Castle / Energy / This week</span>
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
        <span>
          <Link href="/">Live brief</Link>
        </span>
      </footer>
    </>
  )
}
