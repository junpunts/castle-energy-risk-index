'use client'

import { useEffect, useRef, useState } from 'react'

interface Trace {
  stage_name: string
  started_at: string
  completed_at: string | null
  duration_ms: number | null
  cost_usd: number
  error: string | null
}

interface Props {
  runId: string
  initialTraces: Trace[]
}

interface Line {
  kind: 'stage' | 'log' | 'cost' | 'error'
  ts: string
  text: string
}

/**
 * Tails GET /api/admin/pipelines/runs/[id]/stream (SSE) and renders the
 * structured log. The endpoint streams server-side events the worker pushes
 * into Postgres LISTEN/NOTIFY (M5) and falls back to row polling.
 */
export function RunStream({ runId, initialTraces }: Props) {
  const [lines, setLines] = useState<Line[]>(() =>
    initialTraces.flatMap((t): Line[] => {
      const out: Line[] = [{ kind: 'stage', ts: t.started_at, text: `▸ ${t.stage_name}` }]
      if (t.completed_at) {
        out.push({
          kind: 'log',
          ts: t.completed_at,
          text: `  ✓ ${t.stage_name} (${t.duration_ms ?? '?'}ms, $${Number(t.cost_usd).toFixed(4)})`,
        })
      }
      if (t.error) out.push({ kind: 'error', ts: t.completed_at ?? t.started_at, text: `  ✗ ${t.error}` })
      return out
    }),
  )
  const ref = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const es = new EventSource(`/api/admin/pipelines/runs/${runId}/stream`)
    es.addEventListener('trace', (e) => {
      const data = JSON.parse((e as MessageEvent).data)
      setLines((cur) => [...cur, { kind: data.kind ?? 'log', ts: data.ts, text: data.text }])
    })
    es.addEventListener('done', () => es.close())
    es.onerror = () => es.close()
    return () => es.close()
  }, [runId])

  useEffect(() => {
    ref.current?.scrollTo(0, ref.current.scrollHeight)
  }, [lines])

  return (
    <div className="run-trace" ref={ref}>
      {lines.length === 0 ? (
        <div className="line" style={{ color: 'var(--fg-3)' }}>
          Waiting for output…
        </div>
      ) : (
        lines.map((l, i) => (
          <div key={i} className={`line ${l.kind}`}>
            <span style={{ opacity: 0.5, marginRight: 12 }}>
              {new Date(l.ts).toLocaleTimeString()}
            </span>
            {l.text}
          </div>
        ))
      )}
    </div>
  )
}
