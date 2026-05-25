import Link from 'next/link'
import { requireAdmin } from '@/lib/auth'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { ActiveRuns } from '@/components/admin/ActiveRuns'
import { OpenProposals } from '@/components/admin/OpenProposals'

export const dynamic = 'force-dynamic'

export default async function AdminHome() {
  await requireAdmin()
  const sb = createServiceRoleClient()

  const [archetypes, activeRuns, proposals, recentRuns] = await Promise.all([
    sb.from('archetypes').select('id, composite, risks_total, state_version, updated_at'),
    sb.from('pipeline_runs')
      .select('*')
      .in('status', ['queued', 'claimed', 'running'])
      .order('started_at', { ascending: false }),
    sb.from('proposals')
      .select('*')
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(20),
    sb.from('pipeline_runs')
      .select('*')
      .in('status', ['completed', 'failed', 'aborted'])
      .order('completed_at', { ascending: false })
      .limit(10),
  ])

  return (
    <main className="admin-page">
      <header style={{ marginBottom: '64px' }}>
        <span className="eyebrow">Castle · Risk Index Admin</span>
        <h1 className="display-2">Operations.</h1>
      </header>

      <section className="kpi-row">
        <div>
          <div className="l">Archetypes</div>
          <div className="v tabular">{archetypes.data?.length ?? 0}</div>
          <div className="help">Currently tracked.</div>
        </div>
        <div>
          <div className="l">Active runs</div>
          <div className="v tabular">{activeRuns.data?.length ?? 0}</div>
          <div className="help">Pipelines in flight.</div>
        </div>
        <div>
          <div className="l">Open proposals</div>
          <div className="v tabular">{proposals.data?.length ?? 0}</div>
          <div className="help">Pending review.</div>
        </div>
        <div>
          <div className="l">Recent runs</div>
          <div className="v tabular">{recentRuns.data?.length ?? 0}</div>
          <div className="help">In the last batch.</div>
        </div>
      </section>

      <div className="section-label">
        <span className="l">Active runs</span>
        <span className="r">Live</span>
      </div>
      <ActiveRuns initial={activeRuns.data ?? []} />

      <div className="section-label">
        <span className="l">Open proposals</span>
        <span className="r">
          <Link href="/admin/proposals">View all →</Link>
        </span>
      </div>
      <OpenProposals initial={proposals.data ?? []} />

      <div className="section-label">
        <span className="l">Recent runs</span>
        <span className="r">Last 10</span>
      </div>
      <table className="admin-table">
        <thead>
          <tr>
            <th>Pipeline</th>
            <th>Archetype</th>
            <th>Status</th>
            <th>Started</th>
            <th>Completed</th>
            <th>Cost</th>
          </tr>
        </thead>
        <tbody>
          {(recentRuns.data ?? []).length === 0 ? (
            <tr>
              <td className="empty" colSpan={6}>
                No runs yet. Trigger one from an archetype editor.
              </td>
            </tr>
          ) : (
            (recentRuns.data ?? []).map((r: any) => (
              <tr key={r.id}>
                <td>
                  <Link href={`/admin/runs/${r.id}`}>{r.pipeline_name}</Link>
                </td>
                <td className="mono">{r.archetype_id ?? '—'}</td>
                <td>
                  <span className={`status-pill ${r.status}`}>{r.status}</span>
                </td>
                <td className="ago">{shortTs(r.started_at)}</td>
                <td className="ago">{r.completed_at ? shortTs(r.completed_at) : '—'}</td>
                <td className="mono">${Number(r.cost_usd ?? 0).toFixed(3)}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </main>
  )
}

function shortTs(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}
