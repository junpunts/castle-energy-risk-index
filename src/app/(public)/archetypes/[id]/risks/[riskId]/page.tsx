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

  // Per-risk news is sparse on some archetypes; fall back to the archetype
  // feed so "Recent items" is never empty.
  const recentItems = R.news.length > 0 ? R.news : A.news

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

        <div className="section-label hedge-head">
          <span className="l">Recommended hedges</span>
          <span className="r">
            {R.hedges.length} contract{R.hedges.length === 1 ? '' : 's'}
          </span>
        </div>
        <section className="hedge-stack">
          {R.hedges.map((h, i) => {
            const cn = h.change || 0
            const cls = cn > 0 ? 'up' : cn < 0 ? 'dn' : ''
            const cstr = `${cn > 0 ? '+' : ''}${(cn * 100).toFixed(0)}¢`
            return (
              <div
                key={h.ticker}
                className={`hedge-row${i === 0 ? ' is-featured' : ''}`}
              >
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
                  {i === 0 ? 'Buy hedge →' : 'View →'}
                </button>
              </div>
            )
          })}
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
          <span className="r">{recentItems.length} items</span>
        </div>
        <section>
          {recentItems.map((n, i) => (
            <a key={i} className="news-row" href="#">
              <span className="src">{n.source}</span>
              <span className="ago">{n.ago}</span>
              <span className="ttl">{n.title}</span>
              <span className="arr">→</span>
            </a>
          ))}
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

// ─── Attention block — trend headline + slim sparkline ───
function AttentionBlock({ weekly }: { weekly: number[] }) {
  const total = weekly.reduce((a, b) => a + b, 0)
  const thisWeek = weekly[weekly.length - 1] ?? 0
  const last4 = weekly.slice(-4).reduce((a, b) => a + b, 0)
  const prior4 = weekly.slice(-8, -4).reduce((a, b) => a + b, 0)
  const peak = Math.max(...weekly, 0)

  if (total === 0) {
    return (
      <>
        <div className="head">
          <span className="eyebrow label">Attention</span>
          <span className="meta">12-week window</span>
        </div>
        <p className="attn-empty">
          No tracked mentions in Congress, the Federal Register, or major outlets over the last 12
          weeks.
        </p>
      </>
    )
  }

  let trend = 'Steady'
  if (last4 > prior4 * 1.5 || (prior4 === 0 && last4 > 0)) trend = 'Heating up'
  else if (last4 < prior4 * 0.5 && prior4 > 0) trend = 'Cooling'

  return (
    <>
      <div className="head">
        <span className="eyebrow label">Attention</span>
        <span className="meta">12-week window · Congress · Federal Register · majors</span>
      </div>
      <div className="lead-row">
        <h3 className="trend">{trend}.</h3>
        <div className="breakdown">
          <strong className="tabular">{thisWeek}</strong> this week
          <span className="sep">·</span>
          <strong className="tabular">{last4}</strong> past month
          <span className="sep">·</span>
          peak <strong className="tabular">{peak}</strong>
        </div>
      </div>
      <AttentionSparkline weekly={weekly} />
    </>
  )
}

function AttentionSparkline({ weekly }: { weekly: number[] }) {
  const W = 960
  const H = 88
  const padT = 4
  const padB = 18
  const plotH = H - padT - padB
  const max = Math.max(...weekly, 4)
  const colW = W / weekly.length
  const bw = colW - 6
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      style={{ width: '100%', height: 88, display: 'block' }}
    >
      {weekly.map((v, i) => {
        const x = i * colW + 3
        const h = (v / max) * plotH
        const y = padT + plotH - h
        const isLast = i === weekly.length - 1
        return (
          <rect
            key={i}
            x={x}
            y={y}
            width={bw}
            height={h}
            fill={isLast ? '#171717' : '#246075'}
            fillOpacity={v ? 1 : 0.08}
          />
        )
      })}
      <line
        x1={0}
        y1={padT + plotH + 0.5}
        x2={W}
        y2={padT + plotH + 0.5}
        stroke="rgba(24,24,24,0.18)"
      />
      <text
        x={4}
        y={H - 4}
        fontFamily="Geist Mono"
        fontSize={9}
        fill="#737373"
        letterSpacing="0.2em"
        fontWeight={600}
      >
        12 WK AGO
      </text>
      <text
        x={W - 4}
        y={H - 4}
        fontFamily="Geist Mono"
        fontSize={9}
        fill="#737373"
        letterSpacing="0.2em"
        fontWeight={600}
        textAnchor="end"
      >
        THIS WEEK
      </text>
    </svg>
  )
}

// ─── Legacy AttentionBars (replaced by AttentionBlock above; kept temporarily unused) ───
function AttentionBars({ weekly }: { weekly: number[] }) {
  // Real mention counts are sparse — a quiet risk gets an honest empty state
  // rather than 12 zero-height bars.
  if (weekly.every((v) => v === 0)) {
    return (
      <div
        style={{
          padding: '56px 0',
          color: 'var(--fg-3)',
          fontFamily: 'var(--font-mono)',
          fontSize: 12,
          letterSpacing: '0.04em',
        }}
      >
        No tracked mentions in Congress, the Federal Register, or major outlets over the last 12
        weeks.
      </div>
    )
  }
  const W = 960
  const H = 320
  const padL = 50
  const padR = 40
  const padT = 32
  const padB = 48
  const plotW = W - padL - padR
  const plotH = H - padT - padB
  // Auto-scale to the data's own peak (min floor of 4 so a lone mention isn't
  // full-height). Real counts are small; the old forced 0–100 made them invisible.
  const max = Math.max(...weekly, 4)

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
