import Link from 'next/link'
import { requireAdmin } from '@/lib/auth'
import { createServiceRoleClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export default async function AdminRunsList() {
  await requireAdmin()
  const sb = createServiceRoleClient()
  const { data } = await sb
    .from('pipeline_runs')
    .select('*')
    .order('started_at', { ascending: false })
    .limit(100)

  return (
    <main className="admin-page">
      <header style={{ marginBottom: 48 }}>
        <span className="eyebrow">Admin</span>
        <h1 className="display-2">Pipeline runs.</h1>
      </header>

      <table className="admin-table">
        <thead>
          <tr>
            <th>Pipeline</th>
            <th>Archetype</th>
            <th>Status</th>
            <th>Stage</th>
            <th>Triggered by</th>
            <th>Started</th>
            <th>Completed</th>
            <th>Cost</th>
          </tr>
        </thead>
        <tbody>
          {(data ?? []).length === 0 ? (
            <tr>
              <td className="empty" colSpan={8}>
                No runs.
              </td>
            </tr>
          ) : (
            (data ?? []).map((r: any) => (
              <tr key={r.id}>
                <td>
                  <Link href={`/admin/runs/${r.id}`}>{r.pipeline_name}</Link>
                </td>
                <td className="mono">{r.archetype_id ?? '—'}</td>
                <td>
                  <span className={`status-pill ${r.status}`}>{r.status}</span>
                </td>
                <td className="mono">{r.current_stage ?? '—'}</td>
                <td className="mono">{r.triggered_by}</td>
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
