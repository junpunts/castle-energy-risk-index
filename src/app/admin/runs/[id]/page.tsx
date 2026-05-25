import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireAdmin } from '@/lib/auth'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { RunStream } from '@/components/admin/RunStream'

export const dynamic = 'force-dynamic'

interface PageProps {
  params: { id: string }
}

export default async function AdminRunDetail({ params }: PageProps) {
  await requireAdmin()
  const sb = createServiceRoleClient()
  const { data: run } = await sb.from('pipeline_runs').select('*').eq('id', params.id).maybeSingle()
  if (!run) notFound()

  const { data: traces } = await sb
    .from('pipeline_traces')
    .select('*')
    .eq('pipeline_run_id', params.id)
    .order('started_at')

  return (
    <main className="admin-page">
      <header style={{ marginBottom: 48 }}>
        <span className="eyebrow">Admin · Run</span>
        <h1 className="display-2">{run.pipeline_name}.</h1>
        <p className="lede" style={{ marginTop: 24 }}>
          Archetype: <span className="mono">{run.archetype_id ?? '—'}</span> · Triggered by{' '}
          <span className="mono">{run.triggered_by}</span> ·{' '}
          <span className={`status-pill ${run.status}`}>{run.status}</span>
        </p>
      </header>

      <section className="kpi-row">
        <div><div className="l">Status</div><div className="v" style={{fontSize:36}}>{run.status}</div><div className="help">{run.current_stage ?? '—'}</div></div>
        <div><div className="l">Started</div><div className="v" style={{fontSize:36}}>{shortTs(run.started_at)}</div></div>
        <div><div className="l">Completed</div><div className="v" style={{fontSize:36}}>{run.completed_at ? shortTs(run.completed_at) : '—'}</div></div>
        <div><div className="l">Cost</div><div className="v" style={{fontSize:36}}>${Number(run.cost_usd ?? 0).toFixed(3)}</div></div>
      </section>

      {['queued', 'claimed', 'running'].includes(run.status) ? (
        <>
          <div className="section-label"><span className="l">Live</span><span className="r">SSE</span></div>
          <RunStream runId={run.id} initialTraces={traces ?? []} />
        </>
      ) : null}

      <div className="section-label">
        <span className="l">Stages · {(traces ?? []).length}</span>
        <span className="r">Sequential</span>
      </div>
      <table className="admin-table">
        <thead>
          <tr>
            <th>Stage</th>
            <th>Started</th>
            <th>Completed</th>
            <th>Duration</th>
            <th>Cost</th>
            <th>Error</th>
          </tr>
        </thead>
        <tbody>
          {(traces ?? []).length === 0 ? (
            <tr>
              <td className="empty" colSpan={6}>No stages recorded yet.</td>
            </tr>
          ) : (
            (traces ?? []).map((t: any) => (
              <tr key={t.id}>
                <td className="mono" style={{ color: t.error ? 'var(--neg)' : 'inherit' }}>{t.stage_name}</td>
                <td className="ago">{shortTs(t.started_at)}</td>
                <td className="ago">{t.completed_at ? shortTs(t.completed_at) : '—'}</td>
                <td className="mono">{t.duration_ms != null ? `${t.duration_ms}ms` : '—'}</td>
                <td className="mono">${Number(t.cost_usd ?? 0).toFixed(3)}</td>
                <td className="mono" style={{ color: 'var(--neg)', maxWidth: 320 }}>
                  {t.error ? truncate(t.error, 140) : ''}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>

      <div style={{ marginTop: 48 }}>
        <Link href="/admin/runs" className="btn is-ghost" style={{ fontSize: 10 }}>← All runs</Link>
      </div>
    </main>
  )
}

function shortTs(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  })
}
function truncate(s: string, n: number) { return s.length > n ? s.slice(0, n - 1) + '…' : s }
