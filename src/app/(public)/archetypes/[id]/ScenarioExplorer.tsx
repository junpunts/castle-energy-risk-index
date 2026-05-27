'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import type { ArchetypeBundle } from '@/lib/schemas'
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

export default function ScenarioExplorer({ bundle, archetypeId, rail }: Props) {
  const ref = useMemo(() => referenceInputs(bundle.archetype.typical), [bundle])
  const [inp, setInp] = useState<ScenarioInputs>(ref)

  const dirty =
    inp.capacity !== ref.capacity ||
    inp.capex !== ref.capex ||
    inp.target_irr !== ref.target_irr ||
    inp.cod_months !== ref.cod_months ||
    inp.ppa_price !== ref.ppa_price

  const sc = useMemo(() => computeScenario(bundle, inp), [bundle, inp])

  // Risks ranked by scenario drag, joined to their static metadata.
  const ranked = useMemo(() => {
    const byId = new Map(sc.risks.map((r) => [r.id, r]))
    return rankedRisks(
      bundle.risks.map((r) => ({ ...r, impact_irr: byId.get(r.id)!.impact_irr })),
    ).map((r) => ({ meta: r, sc: byId.get(r.id)! }))
  }, [bundle, sc])

  const maxDrag = Math.max(...sc.risks.map((r) => r.weighted_drag), 0.001)
  const topRisk = ranked[0]
  const capUnit = bundle.archetype.typical.capacity.replace(/[\d.,\s]+/, '')
  const hasTwoSided = bundle.risks.some((r) => r.two_sided)

  const set = (patch: Partial<ScenarioInputs>) => setInp((p) => ({ ...p, ...patch }))

  return (
    <div className="scenario">
      <div className="scn-inputs">
        <div className="scn-inputs-head">
          <span className="l">Deal assumptions</span>
          {dirty ? (
            <button className="scn-reset" onClick={() => setInp(ref)}>
              ↺ Reset to typical
            </button>
          ) : (
            <span className="r">Castle reference project</span>
          )}
        </div>
        <div className="scn-fields">
          <Field
            label={`Capacity (${capUnit.trim() || 'MW'})`}
            value={inp.capacity}
            min={Math.round(ref.capacity * 0.25)}
            max={Math.round(ref.capacity * 3)}
            step={Math.max(1, Math.round(ref.capacity / 100))}
            onChange={(v) => set({ capacity: v })}
            fmt={(v) => `${v.toLocaleString()}`}
          />
          <Field
            label="Capex ($M)"
            value={Math.round(inp.capex / 1e6)}
            min={Math.round((ref.capex * 0.25) / 1e6)}
            max={Math.round((ref.capex * 3) / 1e6)}
            step={Math.max(1, Math.round(ref.capex / 1e6 / 100))}
            onChange={(v) => set({ capex: v * 1e6 })}
            fmt={(v) => `$${v.toLocaleString()}M`}
          />
          <Field
            label="Target equity IRR (%)"
            value={Math.round(inp.target_irr * 1000) / 10}
            min={4}
            max={20}
            step={0.5}
            onChange={(v) => set({ target_irr: v / 100 })}
            fmt={(v) => `${v}%`}
          />
          <Field
            label="COD timeline (months)"
            value={inp.cod_months}
            min={Math.round(ref.cod_months * 0.5)}
            max={Math.round(ref.cod_months * 2)}
            step={1}
            onChange={(v) => set({ cod_months: v })}
            fmt={(v) => `${v} mo`}
          />
          {ref.ppa_price != null && (
            <Field
              label="PPA price ($/MWh)"
              value={inp.ppa_price ?? 0}
              min={Math.round((ref.ppa_price ?? 1) * 0.4)}
              max={Math.round((ref.ppa_price ?? 1) * 2.5)}
              step={1}
              onChange={(v) => set({ ppa_price: v })}
              fmt={(v) => `$${v}`}
            />
          )}
        </div>
        {dirty && (
          <p className="scn-note">
            Showing a what-if projection for your inputs. Probabilities, news, and
            hedge prices are world facts and stay fixed; only Castle&rsquo;s deal
            economics (IRR drag, dollar impact, composite) re-scale.{' '}
            <strong>Composite {sc.composite}</strong> vs Castle reference{' '}
            {bundle.archetype.composite}.
          </p>
        )}
      </div>

      <div className="chart-head">
        <h3>Estimated impact on project IRR</h3>
        <span className="meta">Probability-weighted · 18-month horizon</span>
      </div>
      <Waterfall ranked={ranked} baseIRR={sc.baseIRR} stressedIRR={sc.stressedIRR} />
      <p className="caption">
        Each blue column subtracts one tracked risk&rsquo;s probability-weighted IRR
        drag. <strong>{topRisk.meta.title}</strong> is the largest contributor at{' '}
        <strong>{topRisk.sc.weighted_drag.toFixed(1)} pp</strong>. Stressed IRR of{' '}
        <strong>{sc.stressedIRR.toFixed(1)}%</strong> assumes all materialise at the
        stated probabilities — Castle&rsquo;s central case.
      </p>
      {hasTwoSided && (
        <p className="caption two-sided-note">
          Risks marked <span className="drv two-sided">two-sided</span> can move in your
          favour as well as against you (e.g. a gas generator benefits from a Henry Hub
          spike). They&rsquo;re shown here as downside exposure only — the modeled drag is
          the adverse case, not the expected case.
        </p>
      )}

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
              <span className="ir-col">
                Impact magnitude<span className="sub">vs portfolio worst</span>
              </span>
              <span className="ir-col">
                IRR pp<span className="sub">probability-weighted</span>
              </span>
              <span className="h-prob ir-col">Prob</span>
              <span className="h-arr"></span>
            </div>
            {ranked.map(({ meta, sc: s }, i) => (
              <Link
                key={meta.id}
                className="risk-row"
                href={`/archetypes/${archetypeId}/risks/${meta.id}`}
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
  label,
  value,
  min,
  max,
  step,
  onChange,
  fmt,
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  onChange: (v: number) => void
  fmt: (v: number) => string
}) {
  return (
    <label className="scn-field">
      <span className="scn-field-label">{label}</span>
      <span className="scn-field-val">{fmt(value)}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  )
}

// ─── Waterfall — client SVG, consumes scenario values ───
function Waterfall({
  ranked,
  baseIRR,
  stressedIRR,
}: {
  ranked: { meta: { title: string }; sc: { weighted_drag: number } }[]
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
    els.push(
      <line key={k()} x1={padL} y1={y} x2={W - padR} y2={y} stroke={v === 0 ? 'rgba(24,24,24,0.18)' : 'rgba(24,24,24,0.06)'} />,
    )
    els.push(
      <text key={k()} x={padL - 12} y={y + 4} fontFamily="Geist Mono" fontSize={11} fill="#737373" textAnchor="end" style={{ fontVariantNumeric: 'tabular-nums' }}>
        {v.toFixed(0)}%
      </text>,
    )
  }

  const x0 = padL + (colW - barW) / 2
  const startTop = sy(baseIRR)
  const startBot = sy(Math.max(0, yMin))
  els.push(<rect key={k()} x={x0} y={startTop} width={barW} height={Math.max(2, startBot - startTop)} fill="#171717" />)
  els.push(
    <text key={k()} x={x0 + barW / 2} y={startTop - 14} textAnchor="middle" fontFamily="Hedvig Letters Serif" fontSize={22} fill="#171717" style={{ fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em' }}>
      {baseIRR.toFixed(1)}%
    </text>,
  )
  els.push(<text key={k()} x={x0 + barW / 2} y={H - padB + 26} textAnchor="middle" fontFamily="Geist Mono" fontSize={10} fill="#737373" letterSpacing="0.25em" fontWeight={600}>TARGET</text>)

  let running = baseIRR
  let connPrev = startTop
  wf.forEach((r, i) => {
    const reduction = r.sc.weighted_drag
    const newVal = running - reduction
    const x = padL + (i + 1) * colW + (colW - barW) / 2
    const yTop = sy(running)
    const yBot = sy(newVal)
    const prevX = padL + i * colW + (colW + barW) / 2
    els.push(<line key={k()} x1={prevX} y1={connPrev} x2={x} y2={yTop} stroke="rgba(24,24,24,0.28)" strokeDasharray="2 4" />)
    els.push(<rect key={k()} x={x} y={yTop} width={barW} height={Math.max(0, yBot - yTop)} fill="#246075" />)
    els.push(
      <text key={k()} x={x + barW / 2} y={yTop - 8} textAnchor="middle" fontFamily="Geist Mono" fontSize={11} fontWeight={700} fill="#246075" style={{ fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.01em' }}>
        −{reduction.toFixed(1)}
      </text>,
    )
    const lbl = r.meta.title.length > 22 ? r.meta.title.slice(0, 20) + '…' : r.meta.title
    els.push(
      <g key={k()} transform={`translate(${x + barW / 2}, ${H - padB + 18}) rotate(-32)`}>
        <text fontFamily="Geist Mono" fontSize={10} fill="#525252" fontWeight={600} textAnchor="end" letterSpacing="0.03em">{lbl}</text>
      </g>,
    )
    connPrev = yBot
    running = newVal
  })

  const xN = padL + (cols - 1) * colW + (colW - barW) / 2
  const finalTop = sy(running)
  const finalBot = sy(Math.max(0, yMin))
  const prevXf = padL + wf.length * colW + (colW + barW) / 2
  els.push(<line key={k()} x1={prevXf} y1={connPrev} x2={xN} y2={finalTop} stroke="rgba(24,24,24,0.28)" strokeDasharray="2 4" />)
  els.push(<rect key={k()} x={xN} y={finalTop} width={barW} height={Math.max(2, finalBot - finalTop)} fill="#8B2A1C" />)
  els.push(
    <text key={k()} x={xN + barW / 2} y={finalTop - 14} textAnchor="middle" fontFamily="Hedvig Letters Serif" fontSize={22} fill="#8B2A1C" style={{ fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em' }}>
      {running.toFixed(1)}%
    </text>,
  )
  els.push(<text key={k()} x={xN + barW / 2} y={H - padB + 26} textAnchor="middle" fontFamily="Geist Mono" fontSize={10} fill="#737373" letterSpacing="0.25em" fontWeight={600}>STRESSED</text>)

  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet">
      {els}
    </svg>
  )
}
