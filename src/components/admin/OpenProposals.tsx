'use client'

import { useEffect, useState, useTransition } from 'react'
import Link from 'next/link'
import { createBrowserClient as createSSRBrowserClient } from '@supabase/ssr'

interface Proposal {
  id: string
  archetype_id: string
  op: string
  target: string | null
  reasoning: string
  source: string
  created_by: string
  created_at: string
  status: string
}

export function OpenProposals({ initial }: { initial: any[] }) {
  const [proposals, setProposals] = useState<Proposal[]>(initial as Proposal[])
  const [pending, startTransition] = useTransition()

  useEffect(() => {
    const sb = createSSRBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    )
    const ch = sb
      .channel('admin:proposals')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'proposals' }, (payload) => {
        setProposals((current) => mergeProposal(current, payload))
      })
      .subscribe()
    return () => {
      sb.removeChannel(ch)
    }
  }, [])

  async function applyProposal(id: string) {
    startTransition(async () => {
      await fetch(`/api/admin/proposals/${id}/apply`, { method: 'POST' })
    })
  }
  async function rejectProposal(id: string) {
    startTransition(async () => {
      await fetch(`/api/admin/proposals/${id}/reject`, { method: 'POST' })
    })
  }

  return (
    <table className="admin-table">
      <thead>
        <tr>
          <th>Archetype</th>
          <th>Op</th>
          <th>Target</th>
          <th>Source</th>
          <th>Reasoning</th>
          <th>Created</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        {proposals.length === 0 ? (
          <tr>
            <td className="empty" colSpan={7}>
              No open proposals.
            </td>
          </tr>
        ) : (
          proposals.map((p) => (
            <tr key={p.id}>
              <td className="mono">
                <Link href={`/admin/archetypes/${p.archetype_id}`}>{p.archetype_id}</Link>
              </td>
              <td className="mono">{p.op}</td>
              <td className="mono">{p.target ?? '—'}</td>
              <td className="mono">{p.source}</td>
              <td style={{ maxWidth: 360 }}>{truncate(p.reasoning, 140)}</td>
              <td className="ago">{shortTs(p.created_at)}</td>
              <td>
                <button
                  className="btn"
                  style={{ fontSize: '10px', padding: '8px 12px' }}
                  disabled={pending}
                  onClick={() => applyProposal(p.id)}
                >
                  Approve
                </button>{' '}
                <button
                  className="btn is-ghost"
                  style={{ fontSize: '10px', padding: '8px 8px' }}
                  disabled={pending}
                  onClick={() => rejectProposal(p.id)}
                >
                  Reject
                </button>
              </td>
            </tr>
          ))
        )}
      </tbody>
    </table>
  )
}

function mergeProposal(current: Proposal[], payload: any): Proposal[] {
  const { eventType, new: next, old: prev } = payload
  if (eventType === 'DELETE') return current.filter((p) => p.id !== prev?.id)
  if (next && next.status === 'pending') {
    const idx = current.findIndex((p) => p.id === next.id)
    if (idx === -1) return [next, ...current]
    const copy = [...current]
    copy[idx] = { ...copy[idx], ...next }
    return copy
  }
  // Status transitioned out of pending — drop it from the inbox.
  return current.filter((p) => p.id !== next?.id)
}

function truncate(s: string, n: number) {
  return s.length > n ? s.slice(0, n - 1) + '…' : s
}

function shortTs(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}
