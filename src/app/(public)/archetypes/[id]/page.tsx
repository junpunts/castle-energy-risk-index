import Link from 'next/link'
import { notFound } from 'next/navigation'
import { readArchetype } from '@/lib/archetypes/read'
import { rankedRisks } from '@/lib/archetypes/derive'
import { fmtUsd, fmtPct, fmtSignedInt, fmtCountdown } from '@/lib/format'
import type { Risk } from '@/lib/schemas'

export const dynamic = 'force-dynamic'
export const revalidate = 60

interface PageProps {
  params: { id: string }
}

export async function generateMetadata({ params }: PageProps) {
  const a = await readArchetype(params.id)
  return { title: a ? `${a.archetype.name} — Castle Risk Index` : 'Castle Risk Index' }
}

export default async function ArchetypePage({ params }: PageProps) {
  const A = await readArchetype(params.id)
  if (!A) notFound()

  const risks = rankedRisks(A.risks)
  const news = A.news

  // Aggregate upcoming dated catalysts across all risks for the rail.
  const now = Date.now()
  const catalysts = risks
    .flatMap((r) =>
      (A.risk_details[r.id]?.events ?? [])
        .filter((e) => e.future && Date.parse(e.date) >= now)
        .map((e) => ({ ...e, riskId: r.id })),
    )
    .sort((a, b) => Date.parse(a.date) - Date.parse(b.date))
    .slice(0, 6)
  const totalImpact = risks.reduce(
    (s, r) => s + Math.abs(r.impact_irr * r.probability),
    0,
  )
  const baseIRR = A.archetype.typical.target_irr * 100
  const stressedIRR = baseIRR - totalImpact
  const d = A.archetype.composite_delta
  const deltaClass = d === 0 ? 'is-flat' : d > 0 ? 'is-up' : 'is-down'
  const deltaTxt = d === 0 ? 'flat WoW' : `${fmtSignedInt(d)} WoW`
  const topRisk = risks[0]

  return (
    <>
      <nav className="nav">
        <div className="nav-inner">
          <Link className="brand" href="/">
            <img src="/assets/svg/castle-logo-black.svg" alt="Castle" />
            <span className="product">Risk Index</span>
          </Link>
          <div className="crumb">
            <Link href="/">Archetypes</Link>
            <span className="sep">/</span>
            <span className="current">{A.archetype.name}</span>
          </div>
          <div className="right">
            <span className="live">Live</span>
            <Link href="/">All archetypes</Link>
          </div>
        </div>
      </nav>

      <main className="page">
        <header className="hero-arch">
          <div>
            <span className="eyebrow" style={{ color: 'var(--accent)' }}>
              {A.archetype.eyebrow}
            </span>
            <h1 className="display-1">{A.archetype.name}.</h1>
            <p className="lede">{A.archetype.blurb}</p>
            <div className="badges">
              <div className="row">
                <span className="label">Typical capacity</span>
                <span>{A.archetype.typical.capacity}</span>
              </div>
              <div className="row">
                <span className="label">Typical capex</span>
                <span>{fmtUsd(A.archetype.typical.capex)}</span>
              </div>
              <div className="row">
                <span className="label">Target equity IRR</span>
                <span>{fmtPct(A.archetype.typical.target_irr, 1)}</span>
              </div>
              <div className="row">
                <span className="label">COD timeline</span>
                <span>~{A.archetype.typical.cod_months} months</span>
              </div>
              {A.archetype.typical.ppa_price && (
                <div className="row">
                  <span className="label">Typical PPA</span>
                  <span>~${A.archetype.typical.ppa_price}/MWh</span>
                </div>
              )}
            </div>
          </div>
          <div className="reading">
            <span className="tiny-label label">Composite reading</span>
            <span className="big-num">
              {A.archetype.composite}
              <span className="of">/100</span>
            </span>
            <div className="meta-row">
              <div className="stat">
                <div className="l">Risks tracked</div>
                <div className="v tabular">{A.archetype.risks_total}</div>
              </div>
              <div className="stat">
                <div className="l">High likelihood</div>
                <div className="v tabular">{A.archetype.risks_high}</div>
              </div>
              <div className="stat">
                <div className="l">Composite {d === 0 ? 'trend' : 'change'}</div>
                <div
                  className="v tabular"
                  style={{
                    color:
                      deltaClass === 'is-up'
                        ? 'var(--neg)'
                        : deltaClass === 'is-down'
                          ? 'var(--pos)'
                          : 'var(--fg)',
                  }}
                >
                  {deltaTxt}
                </div>
              </div>
            </div>
          </div>
        </header>

        <section className="chart-block">
          <div className="chart-head">
            <h3>Estimated impact on project IRR</h3>
            <span className="meta">Probability-weighted · 18-month horizon</span>
          </div>
          <Waterfall risks={risks} baseIRR={baseIRR} stressedIRR={stressedIRR} />
          <p className="caption">
            Each blue column subtracts one tracked risk&rsquo;s probability-weighted IRR drag.{' '}
            <strong>{topRisk.title}</strong> is the largest contributor at{' '}
            <strong>{Math.abs(topRisk.impact_irr * topRisk.probability).toFixed(1)} pp</strong>.
            Stressed IRR of <strong>{stressedIRR.toFixed(1)}%</strong> assumes all materialise at
            the stated probabilities — Castle&rsquo;s central case.
          </p>
        </section>

        <div className="detail-cols">
          <div className="detail-main">
            <div className="section-label">
              <span className="l">All tracked risks</span>
              <span className="r">{risks.length} risks · ranked by IRR impact</span>
            </div>
            <section className="risks-table risks-grid">
              <div className="risks-head">
                <span className="h-rank">#</span>
                <span className="h-cat">Category</span>
                <span className="h-name">Risk</span>
                <span className="ir-col">
                  Impact magnitude<span className="sub">vs portfolio worst</span>
                </span>
                <span className="ir-col">
                  IRR pp<span className="sub">probability-weighted</span>
                </span>
                <span className="h-prob ir-col">Prob</span>
                <span className="h-arr"></span>
              </div>
              {risks.map((r, i) => {
                const ei = Math.abs(r.impact_irr * r.probability)
                const maxImpact = Math.max(
                  ...risks.map((x) => Math.abs(x.impact_irr * x.probability)),
                )
                const barPct = (ei / maxImpact) * 100
                return (
                  <Link
                    key={r.id}
                    className="risk-row"
                    href={`/archetypes/${A.archetype_id}/risks/${r.id}`}
                  >
                    <span className="rank">{String(i + 1).padStart(2, '0')}</span>
                    <span className="cat">{r.category}</span>
                    <div className="body">
                      <h4 className="name">{r.title}</h4>
                      <div className="cit">{r.citation}</div>
                    </div>
                    <div className="impact-bar">
                      <div className="bar">
                        <i style={{ width: `${barPct.toFixed(0)}%` }} />
                      </div>
                    </div>
                    <div className="num">−{ei.toFixed(1)}</div>
                    <div className="num prob">{Math.round(r.probability * 100)}%</div>
                    <span className="arr">→</span>
                  </Link>
                )
              })}
            </section>
          </div>

          <aside className="detail-rail">
            <div className="section-label">
              <span className="l">News &amp; developments</span>
              <span className="r">{A.archetype.news_this_week} this week</span>
            </div>
            <section className="news-list news-rail">
              {news.slice(0, 6).map((n, i) => (
                <Link
                  key={`${n.source}-${i}`}
                  className="news-row"
                  href={`/archetypes/${A.archetype_id}/risks/${risks[0].id}`}
                >
                  <span className="src">{n.source}</span>
                  <span className="ago">{n.ago}</span>
                  <span className="ttl">{n.title}</span>
                </Link>
              ))}
            </section>

            {catalysts.length > 0 && (
              <>
                <div className="section-label rail-label-2">
                  <span className="l">Upcoming catalysts</span>
                  <span className="r">next {catalysts.length}</span>
                </div>
                <section className="catalyst-list">
                  {catalysts.map((c, i) => (
                    <Link
                      key={`${c.riskId}-${c.date}-${i}`}
                      className="catalyst-row"
                      href={`/archetypes/${A.archetype_id}/risks/${c.riskId}`}
                    >
                      <span className="cat-when">{fmtCountdown(c.date)}</span>
                      <span className="cat-kind">{c.kind}</span>
                      <span className="cat-ttl">{c.title}</span>
                    </Link>
                  ))}
                </section>
              </>
            )}
          </aside>
        </div>
      </main>

      <footer className="foot">
        <span>Castle · For informational purposes only</span>
        <span>
          <Link href="/">All archetypes</Link>
        </span>
      </footer>
    </>
  )
}

// ─── Waterfall chart — server-rendered SVG, identical to v2 prototype ───
function Waterfall({
  risks,
  baseIRR,
  stressedIRR,
}: {
  risks: Risk[]
  baseIRR: number
  stressedIRR: number
}) {
  const W = 1024
  const H = 440
  const padL = 80
  const padR = 80
  const padT = 40
  const padB = 100
  const plotW = W - padL - padR
  const plotH = H - padT - padB

  const wfRisks = risks.slice(0, 8)
  const yMax = Math.ceil(baseIRR + 1)
  const yMin = Math.min(0, Math.floor(stressedIRR - 1))
  const yRange = yMax - yMin
  const sy = (v: number) => padT + plotH - ((v - yMin) / yRange) * plotH

  const cols = 2 + wfRisks.length
  const colW = plotW / cols
  const barW = colW * 0.5

  const elements: React.ReactElement[] = []
  let keyN = 0
  const k = () => `wf-${keyN++}`

  // Grid lines + Y labels
  const gridStep = yRange > 8 ? 2 : 1
  for (let v = Math.ceil(yMin / gridStep) * gridStep; v <= yMax; v += gridStep) {
    const y = sy(v)
    const color = v === 0 ? 'rgba(24,24,24,0.18)' : 'rgba(24,24,24,0.06)'
    elements.push(<line key={k()} x1={padL} y1={y} x2={W - padR} y2={y} stroke={color} />)
    elements.push(
      <text
        key={k()}
        x={padL - 12}
        y={y + 4}
        fontFamily="Geist Mono"
        fontSize={11}
        fill="#737373"
        textAnchor="end"
        style={{ fontVariantNumeric: 'tabular-nums' }}
      >
        {v.toFixed(0)}%
      </text>,
    )
  }

  // Start bar — target IRR
  const x0 = padL + (colW - barW) / 2
  const startTop = sy(baseIRR)
  const startBot = sy(Math.max(0, yMin))
  elements.push(
    <rect
      key={k()}
      x={x0}
      y={startTop}
      width={barW}
      height={Math.max(2, startBot - startTop)}
      fill="#171717"
    />,
  )
  elements.push(
    <text
      key={k()}
      x={x0 + barW / 2}
      y={startTop - 14}
      textAnchor="middle"
      fontFamily="Hedvig Letters Serif"
      fontSize={22}
      fill="#171717"
      style={{ fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em' }}
    >
      {baseIRR.toFixed(1)}%
    </text>,
  )
  elements.push(
    <text
      key={k()}
      x={x0 + barW / 2}
      y={H - padB + 26}
      textAnchor="middle"
      fontFamily="Geist Mono"
      fontSize={10}
      fill="#737373"
      letterSpacing="0.25em"
      fontWeight={600}
    >
      TARGET
    </text>,
  )

  // Risk bars
  let running = baseIRR
  let connectorPrev = startTop
  wfRisks.forEach((r, i) => {
    const reduction = Math.abs(r.impact_irr * r.probability)
    const newVal = running - reduction
    const x = padL + (i + 1) * colW + (colW - barW) / 2
    const yTop = sy(running)
    const yBot = sy(newVal)
    const prevX = padL + i * colW + (colW + barW) / 2

    elements.push(
      <line
        key={k()}
        x1={prevX}
        y1={connectorPrev}
        x2={x}
        y2={yTop}
        stroke="rgba(24,24,24,0.28)"
        strokeDasharray="2 4"
      />,
    )
    elements.push(
      <rect key={k()} x={x} y={yTop} width={barW} height={yBot - yTop} fill="#246075" />,
    )
    elements.push(
      <text
        key={k()}
        x={x + barW / 2}
        y={yTop - 8}
        textAnchor="middle"
        fontFamily="Geist Mono"
        fontSize={11}
        fontWeight={700}
        fill="#246075"
        style={{ fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.01em' }}
      >
        −{reduction.toFixed(1)}
      </text>,
    )
    const fullTitle = r.title
    const lbl = fullTitle.length > 22 ? fullTitle.slice(0, 20) + '…' : fullTitle
    elements.push(
      <g key={k()} transform={`translate(${x + barW / 2}, ${H - padB + 18}) rotate(-32)`}>
        <text
          fontFamily="Geist Mono"
          fontSize={10}
          fill="#525252"
          fontWeight={600}
          textAnchor="end"
          letterSpacing="0.03em"
        >
          {lbl}
        </text>
      </g>,
    )

    connectorPrev = yBot
    running = newVal
  })

  // Final bar
  const xN = padL + (cols - 1) * colW + (colW - barW) / 2
  const finalTop = sy(running)
  const finalBot = sy(Math.max(0, yMin))
  const prevX = padL + wfRisks.length * colW + (colW + barW) / 2
  elements.push(
    <line
      key={k()}
      x1={prevX}
      y1={connectorPrev}
      x2={xN}
      y2={finalTop}
      stroke="rgba(24,24,24,0.28)"
      strokeDasharray="2 4"
    />,
  )
  elements.push(
    <rect
      key={k()}
      x={xN}
      y={finalTop}
      width={barW}
      height={Math.max(2, finalBot - finalTop)}
      fill="#8B2A1C"
    />,
  )
  elements.push(
    <text
      key={k()}
      x={xN + barW / 2}
      y={finalTop - 14}
      textAnchor="middle"
      fontFamily="Hedvig Letters Serif"
      fontSize={22}
      fill="#8B2A1C"
      style={{ fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em' }}
    >
      {running.toFixed(1)}%
    </text>,
  )
  elements.push(
    <text
      key={k()}
      x={xN + barW / 2}
      y={H - padB + 26}
      textAnchor="middle"
      fontFamily="Geist Mono"
      fontSize={10}
      fill="#737373"
      letterSpacing="0.25em"
      fontWeight={600}
    >
      STRESSED
    </text>,
  )

  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet">
      {elements}
    </svg>
  )
}
