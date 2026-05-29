'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
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

interface DiffChange {
  label: string
  kind: 'text' | 'value' | 'add' | 'remove'
  before: string | null
  after: string | null
}
interface Preview {
  ok: boolean
  op: string
  archetype_name: string
  target: string | null
  context: string | null
  action_summary: string
  destination: string
  apply_note: string
  reasoning: string
  changes: DiffChange[]
  message?: string
}

export function OpenProposals({ initial }: { initial: any[] }) {
  const router = useRouter()
  const [proposals, setProposals] = useState<Proposal[]>(initial as Proposal[])
  const [pending, startTransition] = useTransition()
  const [openId, setOpenId] = useState<string | null>(null)
  const [preview, setPreview] = useState<Preview | null>(null)
  const [loadingPreview, setLoadingPreview] = useState(false)
  /** Last action banner — surfaces success/error after Approve/Reject so the
   *  user gets feedback even when Supabase realtime isn't connected. */
  const [flash, setFlash] = useState<{ kind: 'ok' | 'err'; message: string } | null>(null)
  function showFlash(kind: 'ok' | 'err', message: string) {
    setFlash({ kind, message })
    setTimeout(() => setFlash(null), 4000)
  }

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

  // Close modal on Escape.
  useEffect(() => {
    if (!openId) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeModal()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [openId])

  async function openModal(id: string) {
    setOpenId(id)
    setPreview(null)
    setLoadingPreview(true)
    try {
      const res = await fetch(`/api/admin/proposals/${id}/preview`)
      const data = await res.json()
      setPreview(data)
    } catch (e: any) {
      setPreview({ ok: false, message: String(e) } as Preview)
    } finally {
      setLoadingPreview(false)
    }
  }
  function closeModal() {
    setOpenId(null)
    setPreview(null)
  }

  async function applyProposal(id: string) {
    startTransition(async () => {
      try {
        const res = await fetch(`/api/admin/proposals/${id}/apply`, { method: 'POST' })
        const body = await res.json().catch(() => ({}))
        if (!res.ok || body?.ok === false) {
          const msg = body?.message ?? `apply failed (${res.status})`
          showFlash('err', msg)
          return
        }
        // Optimistic remove — don't wait for realtime.
        setProposals((cur) => cur.filter((p) => p.id !== id))
        showFlash('ok', `Applied → revision ${body.revisionId ?? '?'} (v${body.newVersion ?? '?'})`)
        if (id === openId) closeModal()
        // Refresh server props so the badge count + filter chips stay in sync.
        router.refresh()
      } catch (e: any) {
        showFlash('err', `network error: ${e?.message ?? e}`)
      }
    })
  }
  async function rejectProposal(id: string) {
    startTransition(async () => {
      try {
        const res = await fetch(`/api/admin/proposals/${id}/reject`, { method: 'POST' })
        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          showFlash('err', body?.message ?? `reject failed (${res.status})`)
          return
        }
        setProposals((cur) => cur.filter((p) => p.id !== id))
        showFlash('ok', 'Rejected')
        if (id === openId) closeModal()
        router.refresh()
      } catch (e: any) {
        showFlash('err', `network error: ${e?.message ?? e}`)
      }
    })
  }

  return (
    <>
      {flash && (
        <div
          role="status"
          style={{
            position: 'fixed',
            top: 16,
            right: 16,
            zIndex: 100,
            padding: '12px 18px',
            borderRadius: 6,
            fontSize: 13,
            fontWeight: 500,
            color: '#fff',
            background: flash.kind === 'ok' ? '#1f8a3a' : '#a03030',
            boxShadow: '0 4px 14px rgba(0,0,0,.25)',
            maxWidth: 480,
          }}
        >
          {flash.message}
        </div>
      )}
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
              <tr
                key={p.id}
                className="proposal-row"
                onClick={() => openModal(p.id)}
                title="Click to preview changes"
              >
                <td className="mono">{p.archetype_id}</td>
                <td className="mono">{p.op}</td>
                <td className="mono">{p.target ?? '—'}</td>
                <td className="mono">{p.source}</td>
                <td style={{ maxWidth: 360 }}>{truncate(p.reasoning, 140)}</td>
                <td className="ago">{shortTs(p.created_at)}</td>
                <td onClick={(e) => e.stopPropagation()}>
                  <button
                    className="btn"
                    style={{ fontSize: '10px', padding: '8px 12px' }}
                    disabled={pending}
                    onClick={() => openModal(p.id)}
                  >
                    Review
                  </button>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>

      {openId && (
        <div className="diff-overlay" onClick={closeModal}>
          <div className="diff-modal" onClick={(e) => e.stopPropagation()}>
            <button className="diff-close" onClick={closeModal} aria-label="Close">
              ×
            </button>

            {loadingPreview && <div className="diff-loading" style={{ padding: '40px 44px' }}>Computing diff…</div>}

            {preview && !preview.ok && (
              <div className="diff-error" style={{ padding: '40px 44px' }}>Could not preview: {preview.message ?? 'unknown error'}</div>
            )}

            {preview && preview.ok && (
              <>
                <div className="diff-scroll">
                  <div className="diff-head">
                    <span className="diff-op">{prettyOp(preview.op)}</span>
                    <p className="diff-summary">{preview.action_summary}</p>
                  </div>

                  <div className="diff-dest">
                    <span className="diff-dest-label">Where this lands</span>
                    <span className="diff-dest-path">{preview.destination}</span>
                  </div>

                  <div className="diff-changes">
                    {preview.changes.map((c, i) => (
                      <div className="diff-block" key={i}>
                        <div className="diff-label">{c.label}</div>
                        {c.before != null && (
                          <>
                            <div className="diff-side-label">{c.kind === 'remove' ? 'Removing' : 'Now'}</div>
                            <div className={`diff-line diff-before ${c.kind === 'text' ? 'is-text' : ''}`}>
                              {c.before}
                            </div>
                          </>
                        )}
                        {c.after != null && (
                          <>
                            <div className="diff-side-label diff-side-label-add">
                              {c.before != null ? 'Will become' : 'Adding'}
                            </div>
                            <div className={`diff-line diff-after ${c.kind === 'text' ? 'is-text' : ''}`}>
                              {c.after}
                            </div>
                          </>
                        )}
                      </div>
                    ))}
                  </div>

                  {preview.reasoning && (
                    <div className="diff-reasoning">
                      <div className="diff-label">Why the system proposed this</div>
                      <p>{preview.reasoning}</p>
                    </div>
                  )}
                </div>

                <div className="diff-footer">
                  <div className="diff-apply-note">{preview.apply_note}</div>
                  <div className="diff-actions">
                    <button className="btn" disabled={pending} onClick={() => applyProposal(openId)}>
                      Approve &amp; apply
                    </button>
                    <button className="btn is-ghost" disabled={pending} onClick={() => rejectProposal(openId)}>
                      Reject
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
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
  return current.filter((p) => p.id !== next?.id)
}

function prettyOp(op: string): string {
  return (
    {
      update_risk: 'Update risk',
      add_risk: 'Add risk',
      remove_risk: 'Remove risk',
      pin_news: 'Pin news',
      update_hedge: 'Update hedge',
    }[op] ?? op
  )
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
