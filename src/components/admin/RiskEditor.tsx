'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import type { Risk, RiskDetail } from '@/lib/schemas'

interface Props {
  archetypeId: string
  risk: Risk
  detail: RiskDetail
}

/**
 * Side-by-side editor for one risk. Each "save" creates an auto-applied
 * proposal so the audit log captures the manual edit just like agent edits.
 *
 * For v1 we expose the fields that move most often: probability,
 * impact_irr, attention, likelihood, title, citation, subtitle, view.
 * Everything else is editable later through the copilot.
 */
export function RiskEditor({ archetypeId, risk, detail }: Props) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [flash, setFlash] = useState<{ kind: 'ok' | 'err'; msg: string } | null>(null)

  const [form, setForm] = useState({
    probability: risk.probability,
    impact_irr: risk.impact_irr,
    impact_usd: risk.impact_usd,
    attention: risk.attention,
    likelihood: risk.likelihood,
    title: risk.title,
    citation: risk.citation,
    subtitle: detail.subtitle,
    view: detail.view,
  })

  function field<K extends keyof typeof form>(key: K) {
    return {
      value: form[key] as any,
      onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
        const raw = e.target.value
        let v: any = raw
        if (key === 'probability' || key === 'impact_irr' || key === 'impact_usd' || key === 'attention') {
          v = raw === '' ? 0 : Number(raw)
        }
        setForm((f) => ({ ...f, [key]: v }))
      },
    }
  }

  async function saveField<K extends keyof typeof form>(key: K, reason: string) {
    setFlash(null)
    const orig = (risk as any)[key] ?? (detail as any)[key]
    if (form[key] === orig) {
      setFlash({ kind: 'err', msg: `${String(key)}: no change` })
      return
    }
    start(async () => {
      const create = await fetch('/api/admin/proposals', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          archetype_id: archetypeId,
          op: 'update_risk',
          target: risk.id,
          payload: { risk_id: risk.id, field: key, new_value: form[key] },
          reasoning: reason,
          source: 'manual',
        }),
      }).then((r) => r.json())

      if (!create?.ok || !create.id) {
        setFlash({ kind: 'err', msg: create?.message ?? 'create failed' })
        return
      }

      const apply = await fetch(`/api/admin/proposals/${create.id}/apply`, { method: 'POST' }).then((r) =>
        r.json(),
      )
      if (!apply?.ok) {
        setFlash({ kind: 'err', msg: `apply: ${apply?.message ?? 'failed'}` })
        return
      }
      setFlash({ kind: 'ok', msg: `${String(key)} updated → v${apply.newVersion}` })
      router.refresh()
    })
  }

  async function saveAll(reason: string) {
    setFlash(null)
    const changes: Array<[string, any]> = []
    for (const k of Object.keys(form) as Array<keyof typeof form>) {
      const orig = (risk as any)[k] ?? (detail as any)[k]
      if (form[k] !== orig) changes.push([k, form[k]])
    }
    if (changes.length === 0) {
      setFlash({ kind: 'err', msg: 'no changes' })
      return
    }
    start(async () => {
      for (const [k, v] of changes) {
        const create = await fetch('/api/admin/proposals', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            archetype_id: archetypeId,
            op: 'update_risk',
            target: risk.id,
            payload: { risk_id: risk.id, field: k, new_value: v },
            reasoning: reason,
            source: 'manual',
          }),
        }).then((r) => r.json())
        if (!create?.ok || !create.id) {
          setFlash({ kind: 'err', msg: `${k}: ${create?.message ?? 'create failed'}` })
          return
        }
        const apply = await fetch(`/api/admin/proposals/${create.id}/apply`, { method: 'POST' }).then((r) =>
          r.json(),
        )
        if (!apply?.ok) {
          setFlash({ kind: 'err', msg: `${k} apply: ${apply?.message ?? 'failed'}` })
          return
        }
      }
      setFlash({ kind: 'ok', msg: `${changes.length} field${changes.length === 1 ? '' : 's'} updated.` })
      router.refresh()
    })
  }

  return (
    <>
      <div className="editor-grid">
        <div>
          <div className="field">
            <label>Title</label>
            <input type="text" {...field('title')} />
          </div>
          <div className="field">
            <label>Citation</label>
            <input type="text" {...field('citation')} />
          </div>
          <div className="field">
            <label>Subtitle</label>
            <input type="text" {...field('subtitle')} />
          </div>
          <div className="field">
            <label>Likelihood</label>
            <select {...field('likelihood')}>
              <option value="low">low</option>
              <option value="medium">medium</option>
              <option value="high">high</option>
            </select>
          </div>
        </div>
        <div>
          <div className="field">
            <label>Probability (0–1)</label>
            <input type="number" min={0} max={1} step={0.01} {...field('probability')} />
          </div>
          <div className="field">
            <label>Impact IRR (pp, negative)</label>
            <input type="number" max={0} step={0.1} {...field('impact_irr')} />
          </div>
          <div className="field">
            <label>Impact USD</label>
            <input type="number" min={0} step={1000000} {...field('impact_usd')} />
          </div>
          <div className="field">
            <label>Attention (0–100)</label>
            <input type="number" min={0} max={100} {...field('attention')} />
          </div>
        </div>
      </div>

      <div className="field" style={{ marginTop: 32 }}>
        <label>Castle&rsquo;s view</label>
        <textarea {...field('view')} rows={10} />
      </div>

      <div className="editor-actions">
        <button
          className="btn is-primary"
          disabled={pending}
          onClick={() => saveAll('Manual edit from risk editor.')}
        >
          Save all changes →
        </button>
        <button className="btn is-ghost" disabled={pending} onClick={() => location.reload()}>
          Discard
        </button>
      </div>

      {flash && (
        <div className={`editor-flash ${flash.kind}`}>
          {flash.kind === 'ok' ? '✓' : '✗'} {flash.msg}
        </div>
      )}
    </>
  )
}
