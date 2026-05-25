import Link from 'next/link'
import { notFound } from 'next/navigation'
import { readArchetype } from '@/lib/archetypes/read'
import { fmtUsd, fmtSignedInt } from '@/lib/format'
import type { RiskDetail } from '@/lib/schemas'

export const dynamic = 'force-dynamic'
export const revalidate = 60

const KIND_LABEL: Record<string, string> = {
  deadline: 'Deadline',
  hearing: 'Hearing',
  market: 'Market move',
  filing: 'Filing',
  castle: 'Castle action',
  now: 'Now',
}

interface PageProps {
  params: { id: string; riskId: string }
}

export async function generateMetadata({ params }: PageProps) {
  const A = await readArchetype(params.id)
  const R = A?.risk_details[params.riskId]
  return { title: R ? `${R.title} — Castle Risk Index` : 'Castle Risk Index' }
}

export default async function RiskPage({ params }: PageProps) {
  const A = await readArchetype(params.id)
  if (!A) notFound()
  const R = A.risk_details[params.riskId]
  if (!R) notFound()

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
            <Link href={`/archetypes/${A.archetype_id}`}>{A.archetype.name}</Link>
            <span className="sep">/</span>
            <span className="current">Risk</span>
          </div>
          <div className="right">
            <span className="live">Live</span>
            <Link href={`/archetypes/${A.archetype_id}`}>Back</Link>
          </div>
        </div>
      </nav>

      <main className="page">
        <header className="hero-risk">
          <div className="h-text">
            <span className="eyebrow" style={{ color: 'var(--accent)' }}>
              {R.category.toUpperCase()} · {A.archetype.name}
            </span>
            <h1 className="display-2">{R.title}.</h1>
            <p className="subhead">{R.subtitle}</p>
            <div className="citation">
              {R.citation} · Castle tracking since {R.tracked_since}
            </div>
          </div>
          <div className="actions">
            <span className="ago">Updated {R.last_updated}</span>
            <button className="btn">★ Watching</button>
            <button className="btn is-primary">Hedge {fmtUsd(R.hedges[0]?.notional ?? 0)} →</button>
          </div>
        </header>

        <section className="stat-row">
          <div>
            <div className="l">Attention</div>
            <div className="v tabular">{R.attention}</div>
            <div className="d" style={{ color: 'var(--neg)' }}>
              ↑ {fmtSignedInt(R.attention_delta)} in 48h
            </div>
          </div>
          <div>
            <div className="l">Probability</div>
            <div className="v tabular">{Math.round(R.probability * 100)}%</div>
            <div className="d" style={{ color: 'var(--neg)' }}>
              ↑ {fmtSignedInt(Math.round(R.probability_delta * 100))}pp WoW
            </div>
          </div>
          <div>
            <div className="l">IRR impact</div>
            <div className="v tabular" style={{ color: 'var(--neg)' }}>
              {R.impact_irr.toFixed(1)}pp
            </div>
            <div className="d" style={{ color: 'var(--fg-3)' }}>
              if realized
            </div>
          </div>
          <div>
            <div className="l">$ at risk</div>
            <div className="v tabular">{fmtUsd(R.impact_usd)}</div>
            <div className="d" style={{ color: 'var(--fg-3)' }}>
              archetype capex
            </div>
          </div>
        </section>

        <section className="view-block">
          <span className="eyebrow label">Castle&apos;s view</span>
          <p className="p">{R.view}</p>
        </section>

        <section className="attn-block">
          <div className="head">
            <h3>
              Attention — last 12 weeks of mentions in Congress, the Federal Register, and major
              outlets
            </h3>
            <span className="meta">Castle composite</span>
          </div>
          <AttentionBars weekly={R.weekly} />
        </section>

        <div className="section-label">
          <span className="l">Timeline</span>
          <span className="r">Past · Now · Upcoming</span>
        </div>
        <section>
          {R.events.map((e, i) => (
            <div
              key={i}
              className={`tl-row ${e.future ? 'is-future' : ''} ${e.now ? 'is-now' : ''}`}
            >
              <div className="when">
                <strong>{e.when}</strong>
                {e.date}
              </div>
              <div className="body">
                <div className="kind">{KIND_LABEL[e.kind] ?? e.kind}</div>
                <h4 className="ttl">{e.now ? <strong>{e.title}</strong> : e.title}</h4>
                <div className="det">{e.detail}</div>
              </div>
            </div>
          ))}
        </section>

        <div className="section-label">
          <span className="l">Recent items</span>
          <span className="r">{R.news.length} items</span>
        </div>
        <section>
          {R.news.map((n, i) => (
            <a key={i} className="news-row" href="#">
              <span className="src">{n.source}</span>
              <span className="ago">{n.ago}</span>
              <span className="ttl">{n.title}</span>
              <span className="arr">→</span>
            </a>
          ))}
        </section>

        <div className="section-label">
          <span className="l">Mapped hedges</span>
          <span className="r">{R.hedges.length} markets</span>
        </div>
        <section>
          {R.hedges.map((h, i) => {
            const cn = h.change || 0
            const cls = cn > 0 ? 'up' : cn < 0 ? 'dn' : ''
            const cstr = `${cn > 0 ? '+' : ''}${(cn * 100).toFixed(0)}¢`
            return (
              <div key={h.ticker} className="hedge-row">
                <div>
                  <div className="ticker">{h.ticker}</div>
                  <p className="ttl">{h.title}</p>
                </div>
                <div>
                  <div className="price">
                    <span className="yes">{Math.round(h.yes * 100)}¢</span>
                    <span className={`change ${cls}`}>{cstr}</span>
                  </div>
                  <div className="meta">
                    Resolves {h.expiry} · {fmtUsd(h.notional)} sized
                  </div>
                </div>
                <button className={`btn ${i === 0 ? 'is-primary' : ''}`}>
                  {i === 0 ? 'Buy' : 'View'} →
                </button>
              </div>
            )
          })}
        </section>
      </main>

      <footer className="foot">
        <span>Castle · For informational purposes only</span>
        <span>
          <Link href="/">Archetypes</Link>
        </span>
      </footer>
    </>
  )
}

// ─── Attention bar chart — server-rendered SVG ───
function AttentionBars({ weekly }: { weekly: number[] }) {
  const W = 960
  const H = 320
  const padL = 50
  const padR = 40
  const padT = 32
  const padB = 48
  const plotW = W - padL - padR
  const plotH = H - padT - padB
  const max = Math.max(...weekly, 100)

  const elements: React.ReactElement[] = []
  let keyN = 0
  const k = () => `attn-${keyN++}`

  // Grid + Y labels
  for (let i = 0; i <= 4; i++) {
    const v = (max * i) / 4
    const y = padT + plotH - (v / max) * plotH
    elements.push(
      <line key={k()} x1={padL} y1={y} x2={W - padR} y2={y} stroke="rgba(24,24,24,0.05)" />,
    )
    if (i === 0 || i === 4) {
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
          {Math.round(v)}
        </text>,
      )
    }
  }
  elements.push(
    <line
      key={k()}
      x1={padL}
      y1={padT + plotH}
      x2={W - padR}
      y2={padT + plotH}
      stroke="rgba(24,24,24,0.18)"
    />,
  )

  const colW = plotW / weekly.length
  const bw = colW - 8
  weekly.forEach((v, i) => {
    const x = padL + i * colW + 4
    const h = (v / max) * plotH
    const y = padT + plotH - h
    const isLast = i === weekly.length - 1
    elements.push(
      <rect
        key={k()}
        x={x}
        y={y}
        width={bw}
        height={h}
        fill={isLast ? '#171717' : '#246075'}
        fillOpacity={isLast ? 1 : 0.92}
      />,
    )
  })

  elements.push(
    <text
      key={k()}
      x={padL + 4}
      y={padT + plotH + 24}
      fontFamily="Geist Mono"
      fontSize={10}
      fill="#737373"
      letterSpacing="0.2em"
      fontWeight={600}
    >
      12 WEEKS AGO
    </text>,
  )
  elements.push(
    <text
      key={k()}
      x={W - padR - 4}
      y={padT + plotH + 24}
      fontFamily="Geist Mono"
      fontSize={10}
      fill="#737373"
      letterSpacing="0.2em"
      fontWeight={600}
      textAnchor="end"
    >
      THIS WEEK
    </text>,
  )

  // Annotate the peak (last bar value)
  const last = weekly[weekly.length - 1]
  const lx = padL + (weekly.length - 1) * colW + 4 + bw / 2
  const ly = padT + plotH - (last / max) * plotH
  elements.push(
    <text
      key={k()}
      x={lx}
      y={ly - 14}
      fontFamily="Geist Mono"
      fontSize={11}
      fontWeight={700}
      fill="#171717"
      textAnchor="end"
      style={{ fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.01em' }}
    >
      {last}
    </text>,
  )

  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet">
      {elements}
    </svg>
  )
}
