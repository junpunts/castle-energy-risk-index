'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createBrowserClient as createSSRBrowserClient } from '@supabase/ssr'

interface Run {
  id: string
  pipeline_name: string
  archetype_id: string | null
  status: string
  current_stage: string | null
  started_at: string
  abort_requested: boolean
}

interface Props {
  initial: any[]
}

export function ActiveRuns({ initial }: Props) {
  const [runs, setRuns] = useState<Run[]>(initial as Run[])

  useEffect(() => {
    const sb = createSSRBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    )
    const ch = sb
      .channel('admin:active-runs')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'pipeline_runs' },
        (payload) => {
          setRuns((current) => mergeRun(current, payload))
        },
      )
      .subscribe()
    return () => {
      sb.removeChannel(ch)
    }
  }, [])

  return (
    <table className="admin-table">
      <thead>
        <tr>
          <th>Pipeline</th>
          <th>Archetype</th>
          <th>Status</th>
          <th>Stage</th>
          <th>Started</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        {runs.length === 0 ? (
          <tr>
            <td className="empty" colSpan={6}>
              No active runs.
            </td>
          </tr>
        ) : (
          runs.map((r) => (
            <tr key={r.id}>
              <td>
                <Link href={`/admin/runs/${r.id}`}>{r.pipeline_name}</Link>
              </td>
              <td className="mono">{r.archetype_id ?? '—'}</td>
              <td>
                <span className={`status-pill ${r.status}`}>{r.status}</span>
              </td>
              <td className="mono">{r.current_stage ?? '—'}</td>
              <td className="ago">{new Date(r.started_at).toLocaleTimeString()}</td>
              <td>
                {!r.abort_requested && (
                  <form
                    action={`/api/admin/pipelines/runs/${r.id}/abort`}
                    method="post"
                    onSubmit={(e) => {
                      e.preventDefault()
                      fetch(`/api/admin/pipelines/runs/${r.id}/abort`, { method: 'POST' })
                    }}
                  >
                    <button type="submit" className="btn is-ghost" style={{ fontSize: '10px' }}>
                      Abort
                    </button>
                  </form>
                )}
              </td>
            </tr>
          ))
        )}
      </tbody>
    </table>
  )
}

function mergeRun(current: Run[], payload: any): Run[] {
  const { eventType, new: next, old: prev } = payload
  if (eventType === 'DELETE') {
    return current.filter((r) => r.id !== prev?.id)
  }
  if (next && ['queued', 'claimed', 'running'].includes(next.status)) {
    const idx = current.findIndex((r) => r.id === next.id)
    if (idx === -1) return [next, ...current]
    const copy = [...current]
    copy[idx] = { ...copy[idx], ...next }
    return copy
  }
  // Status transitioned out of active.
  return current.filter((r) => r.id !== next?.id)
}
