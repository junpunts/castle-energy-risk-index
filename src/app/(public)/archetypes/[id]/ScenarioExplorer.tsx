'use client'

import { useMemo, useState, useRef } from 'react'
import Link from 'next/link'
import type { ArchetypeBundle, Risk } from '@/lib/schemas'
import {
  computeScenario,
  referenceInputs,
  driverFor,
  type ScenarioInputs,
} from '@/lib/archetypes/scenario'
import { rankedRisks } from '@/lib/archetypes/derive'

const DRIVER_LABEL: Record<string, string> = {
  cost: 'capex-scaled',
  delay: 'schedule-scaled',
  revenue: 'revenue-scaled',
}

interface Props {
  bundle: ArchetypeBundle
  archetypeId: string
  rail: React.ReactNode
}

type RankedRow = { meta: Risk; sc: { id: string; impact_irr: number; impact_usd: number; weighted_drag: number } }

function fmtUsd(n: number): string {
  const a = Math.abs(n)
  if (a >= 1e9) return `$${(n / 1e9).toFixed(1)}B`
  if (a >= 1e6) return `$${(n / 1e6).toFixed(0)}M`
  return `$${(n / 1e3).toFixed(0)}K`
}

export default function ScenarioExplorer({ bundle, archetypeId, rail }: Props) {
  const ref = useMemo(() => referenceInputs(bundle.archetype.typical), [bundle])
  const [inp, setInp] = useState<ScenarioInputs>(ref)
  const [hot, setHot] = useState<string | null>(null) // hovered risk id (chart<->table sync)

  const dirty =
    inp.capacity !== ref.capacity ||
    inp.capex !== ref.capex ||
    inp.target_irr !== ref.target_irr ||
    inp.cod_months !== ref.cod_months ||
    inp.ppa_price !== ref.ppa_price

  const sc = useMemo(() => computeScenario(bundle, inp), [bundle, inp])

  const ranked: RankedRow[] = useMemo(() => {
    const byId = new Map(sc.risks.map((r) => [r.id, r]))
    return rankedRisks(
      bundle.risks.map((r) => ({ ...r, impact_irr: byId.get(r.id)!.impact_irr })),
    ).map((r) => ({ meta: r, sc: byId.get(r.id)! }))
  }, [bundle, sc])

  const maxDrag = Math.max(...sc.risks.map((r) => r.weighted_drag), 0.001)
  const topRisk = ranked[0]
  const capUnit = bundle.archetype.typical.capacity.replace(/[\d.,\s]+/, '').trim() || 'MW'
  const hasTwoSided = bundle.risks.some((r) => r.two_sided)
  const dollarsAtRisk = ranked.reduce((s, { meta, sc: r }) => s + r.impact_usd * meta.probability, 0)

  const set = (patch: Partial<ScenarioInputs>) => setInp((p) => ({ ...p, ...patch }))

  return (
    <div className="cd">
      {/* ── Live model: sticky control deck (left) + outputs (right) ── */}
      <div className="cd-model">
        <aside className="cd-deck">
          <div className="cd-deck-head">
            <span className="t">Your deal</span>
            {dirty ? (
              <button className="cd-reset" onClick={() => setInp(ref)}>↺ Reset</button>
            ) : (
              <span className="r">Castle reference</span>
            )}
          </div>
          <p className="cd-deck-sub">
            Adjust the project — Castle&rsquo;s risk model re-prices live. Probabilities and
            hedge prices stay fixed.
          </p>
          <Field label={`Capacity (${capUnit})`} value={inp.capacity}
            min={Math.round(ref.capacity * 0.25)} max={Math.round(ref.capacity * 3)}
            step={Math.max(1, Math.round(ref.capacity / 100))}
            onChange={(v) => set({ capacity: v })} fmt={(v) => v.toLocaleString()} />
          <Field label="Capex ($M)" value={Math.round(inp.capex / 1e6)}
            min={Math.round((ref.capex * 0.25) / 1e6)} max={Math.round((ref.capex * 3) / 1e6)}
            step={Math.max(1, Math.round(ref.capex / 1e6 / 100))}
            onChange={(v) => set({ capex: v * 1e6 })} fmt={(v) => `$${v.toLocaleString()}M`} />
          <Field label="Target equity IRR (%)" value={Math.round(inp.target_irr * 1000) / 10}
            min={4} max={20} step={0.5}
            onChange={(v) => set({ target_irr: v / 100 })} fmt={(v) => `${v}%`} />
          <Field label="COD timeline (months)" value={inp.cod_months}
            min={Math.round(ref.cod_months * 0.5)} max={Math.round(ref.cod_months * 2)} step={1}
            onChange={(v) => set({ cod_months: v })} fmt={(v) => `${v} mo`} />
          {ref.ppa_price != null && (
            <Field label="PPA price ($/MWh)" value={inp.ppa_price ?? 0}
              min={Math.round((ref.ppa_price ?? 1) * 0.4)} max={Math.round((ref.ppa_price ?? 1) * 2.5)} step={1}
              onChange={(v) => set({ ppa_price: v })} fmt={(v) => `$${v}`} />
          )}
        </aside>

        <div className="cd-out">
          <div className="cd-metrics">
            <div className="cd-metric">
              <div className="ml">Composite</div>
              <div className="mv tabular">{sc.composite}<span className="u">/100</span></div>
              <div className="md">{dirty ? `vs ${bundle.archetype.composite} reference` : 'Castle reference'}</div>
            </div>
            <div className="cd-metric">
              <div className="ml">Stressed IRR</div>
              <div className="mv tabular" style={{ color: sc.stressedIRR < 0 ? 'var(--neg)' : 'var(--fg)' }}>
                {sc.stressedIRR.toFixed(1)}%
              </div>
              <div className="md">from {sc.baseIRR.toFixed(1)}% target</div>
            </div>
            <div className="cd-metric">
              <div className="ml">Capital at risk</div>
              <div className="mv tabular">{fmtUsd(dollarsAtRisk)}</div>
              <div className="md">probability-weighted</div>
            </div>
          </div>

          <div className="chart-head">
            <h3>Estimated impact on project IRR</h3>
            <span className="meta">Probability-weighted · hover a bar for detail</span>
          </div>
          <Waterfall ranked={ranked} baseIRR={sc.baseIRR} stressedIRR={sc.stressedIRR}
            hot={hot} setHot={setHot} />
          <p className="caption">
            Each column subtracts one risk&rsquo;s probability-weighted IRR drag.{' '}
            <strong>{topRisk.meta.title}</strong> is the largest contributor at{' '}
            <strong>{topRisk.sc.weighted_drag.toFixed(1)} pp</strong>. Stressed IRR of{' '}
            <strong>{sc.stressedIRR.toFixed(1)}%</strong> assumes all materialise at the
            stated probabilities — Castle&rsquo;s central case.
          </p>
          {hasTwoSided && (
            <p className="caption two-sided-note">
              Risks marked <span className="drv two-sided">two-sided</span> can move in your
              favour as well as against you (e.g. a gas generator benefits from a Henry Hub
              spike). Shown here as downside exposure only — the modeled drag is the adverse
              case, not the expected case.
            </p>
          )}
        </div>
      </div>

      {/* ── Risks table + rail ── */}
      <div className="detail-cols">
        <div className="detail-main">
          <div className="section-label" style={{ marginTop: 64 }}>
            <span className="l">All tracked risks</span>
            <span className="r">{ranked.length} risks · ranked by IRR impact</span>
          </div>
          <section className="risks-table risks-grid">
            <div className="risks-head">
              <span className="h-rank">#</span>
              <span className="h-cat">Category</span>
              <span className="h-name">Risk</span>
              <span className="ir-col">Impact magnitude<span className="sub">vs portfolio worst</span></span>
              <span className="ir-col">IRR pp<span className="sub">probability-weighted</span></span>
              <span className="h-prob ir-col">Prob</span>
              <span className="h-arr"></span>
            </div>
            {ranked.map(({ meta, sc: s }, i) => (
              <Link
                key={meta.id}
                className={`risk-row${hot === meta.id ? ' hot' : ''}`}
                href={`/archetypes/${archetypeId}/risks/${meta.id}`}
                onMouseEnter={() => setHot(meta.id)}
                onMouseLeave={() => setHot(null)}
              >
                <span className="rank">{String(i + 1).padStart(2, '0')}</span>
                <span className="cat">{meta.category}</span>
                <div className="body">
                  <h4 className="name">{meta.title}</h4>
                  <div className="cit">
                    {meta.citation}
                    <span className="drv">{DRIVER_LABEL[driverFor(meta)]}</span>
                    {meta.two_sided && <span className="drv two-sided">two-sided</span>}
                  </div>
                </div>
                <div className="impact-bar">
                  <div className="bar">
                    <i style={{ width: `${((s.weighted_drag / maxDrag) * 100).toFixed(0)}%` }} />
                  </div>
                </div>
                <div className="num">−{s.weighted_drag.toFixed(1)}</div>
                <div className="num prob">{Math.round(meta.probability * 100)}%</div>
                <span className="arr">→</span>
              </Link>
            ))}
          </section>
        </div>
        <aside className="detail-rail">{rail}</aside>
      </div>
    </div>
  )
}

function Field({
  label, value, min, max, step, onChange, fmt,
}: {
  label: string; value: number; min: number; max: number; step: number
  onChange: (v: number) => void; fmt: (v: number) => string
}) {
  return (
    <label className="cd-field">
      <span className="cd-field-top">
        <span className="cd-field-label">{label}</span>
        <span className="cd-field-val">{fmt(value)}</span>
      </span>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(Number(e.target.value))} />
    </label>
  )
}

// ─── Waterfall with per-bar hover tooltips + table sync ───
function Waterfall({
  ranked, baseIRR, stressedIRR, hot, setHot,
}: {
  ranked: RankedRow[]
  baseIRR: number
  stressedIRR: number
  hot: string | null
  setHot: (id: string | null) => void
}) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const [tip, setTip] = useState<{ x: number; y: number; row: RankedRow } | null>(null)

  const W = 1024, H = 440, padL = 80, padR = 80, padT = 40, padB = 100
  const plotW = W - padL - padR, plotH = H - padT - padB
  const wf = ranked.slice(0, 8)
  const yMax = Math.ceil(baseIRR + 1)
  const yMin = Math.min(0, Math.floor(stressedIRR - 1))
  const yRange = yMax - yMin || 1
  const sy = (v: number) => padT + plotH - ((v - yMin) / yRange) * plotH
  const cols = 2 + wf.length
  const colW = plotW / cols
  const barW = colW * 0.5

  const els: React.ReactElement[] = []
  let kn = 0
  const k = () => `wf-${kn++}`

  const gridStep = yRange > 8 ? 2 : 1
  for (let v = Math.ceil(yMin / gridStep) * gridStep; v <= yMax; v += gridStep) {
    const y = sy(v)
    els.push(<line key={k()} x1={padL} y1={y} x2={W - padR} y2={y} stroke={v === 0 ? 'rgba(24,24,24,0.18)' : 'rgba(24,24,24,0.06)'} />)
    els.push(<text key={k()} x={padL - 12} y={y + 4} fontFamily="var(--font-mono)" fontSize={11} fill="#737373" textAnchor="end" style={{ fontVariantNumeric: 'tabular-nums' }}>{v.toFixed(0)}%</text>)
  }

  const x0 = padL + (colW - barW) / 2
  const startTop = sy(baseIRR)
  const startBot = sy(Math.max(0, yMin))
  els.push(<rect key={k()} x={x0} y={startTop} width={barW} height={Math.max(2, startBot - startTop)} fill="#171717" />)
  els.push(<text key={k()} x={x0 + barW / 2} y={startTop - 14} textAnchor="middle" fontFamily="var(--font-display)" fontSize={22} fill="#171717" style={{ fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em' }}>{baseIRR.toFixed(1)}%</text>)
  els.push(<text key={k()} x={x0 + barW / 2} y={H - padB + 26} textAnchor="middle" fontFamily="var(--font-mono)" fontSize={10} fill="#737373" letterSpacing="0.25em" fontWeight={600}>TARGET</text>)

  let running = baseIRR
  let connPrev = startTop
  wf.forEach((r, i) => {
    const reduction = r.sc.weighted_drag
    const newVal = running - reduction
    const x = padL + (i + 1) * colW + (colW - barW) / 2
    const yTop = sy(running)
    const yBot = sy(newVal)
    const prevX = padL + i * colW + (colW + barW) / 2
    const isHot = hot === r.meta.id
    els.push(<line key={k()} x1={prevX} y1={connPrev} x2={x} y2={yTop} stroke="rgba(24,24,24,0.28)" strokeDasharray="2 4" />)
    // hit area (wider, invisible) for easy hover
    els.push(
      <rect key={k()} x={x - colW * 0.25} y={padT} width={colW * 0.75} height={plotH}
        fill="transparent" style={{ cursor: 'pointer' }}
        onMouseEnter={(e) => {
          setHot(r.meta.id)
          const wrap = wrapRef.current
          if (wrap) {
            const rect = wrap.getBoundingClientRect()
            setTip({ x: e.clientX - rect.left, y: e.clientY - rect.top, row: r })
          }
        }}
        onMouseMove={(e) => {
          const wrap = wrapRef.current
          if (wrap) {
            const rect = wrap.getBoundingClientRect()
            setTip({ x: e.clientX - rect.left, y: e.clientY - rect.top, row: r })
          }
        }}
        onMouseLeave={() => { setHot(null); setTip(null) }}
      />,
    )
    els.push(<rect key={k()} x={x} y={yTop} width={barW} height={Math.max(0, yBot - yTop)} fill={isHot ? '#171717' : '#246075'} style={{ transition: 'fill .12s', pointerEvents: 'none' }} />)
    els.push(<text key={k()} x={x + barW / 2} y={yTop - 8} textAnchor="middle" fontFamily="var(--font-mono)" fontSize={11} fontWeight={700} fill={isHot ? '#171717' : '#246075'} style={{ fontVariantNumeric: 'tabular-nums', pointerEvents: 'none' }}>−{reduction.toFixed(1)}</text>)
    // numbered x-axis tick keyed to the table rank (replaces truncated label)
    els.push(<text key={k()} x={x + barW / 2} y={H - padB + 22} textAnchor="middle" fontFamily="var(--font-mono)" fontSize={11} fontWeight={700} fill={isHot ? '#171717' : '#737373'} style={{ pointerEvents: 'none' }}>{String(i + 1).padStart(2, '0')}</text>)
    connPrev = yBot
    running = newVal
  })

  const xN = padL + (cols - 1) * colW + (colW - barW) / 2
  const finalTop = sy(running)
  const finalBot = sy(Math.max(0, yMin))
  const prevXf = padL + wf.length * colW + (colW + barW) / 2
  els.push(<line key={k()} x1={prevXf} y1={connPrev} x2={xN} y2={finalTop} stroke="rgba(24,24,24,0.28)" strokeDasharray="2 4" />)
  els.push(<rect key={k()} x={xN} y={finalTop} width={barW} height={Math.max(2, finalBot - finalTop)} fill="#8B2A1C" />)
  els.push(<text key={k()} x={xN + barW / 2} y={finalTop - 14} textAnchor="middle" fontFamily="var(--font-display)" fontSize={22} fill="#8B2A1C" style={{ fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em' }}>{running.toFixed(1)}%</text>)
  els.push(<text key={k()} x={xN + barW / 2} y={H - padB + 26} textAnchor="middle" fontFamily="var(--font-mono)" fontSize={10} fill="#737373" letterSpacing="0.25em" fontWeight={600}>STRESSED</text>)

  return (
    <div className="cd-chart" ref={wrapRef} style={{ position: 'relative' }}>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet">{els}</svg>
      {tip && (
        <div className="cd-tip" style={{ left: tip.x, top: tip.y }}>
          <div className="cd-tip-head">
            <span className="cd-tip-cat">{tip.row.meta.category}</span>
            <span className="cd-tip-prob">{Math.round(tip.row.meta.probability * 100)}% likely</span>
          </div>
          <div className="cd-tip-name">{tip.row.meta.title}</div>
          <div className="cd-tip-cit">{tip.row.meta.citation}</div>
          <div className="cd-tip-stats">
            <span><b>−{tip.row.sc.weighted_drag.toFixed(1)} pp</b> IRR drag</span>
            <span><b>{fmtUsd(tip.row.sc.impact_usd)}</b> at risk</span>
          </div>
        </div>
      )}
    </div>
  )
}
