import Link from 'next/link'
import { requireAdmin } from '@/lib/auth'
import { createServiceRoleClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export default async function AdminArchetypes() {
  await requireAdmin()
  const sb = createServiceRoleClient()
  const { data } = await sb
    .from('archetypes')
    .select('id, composite, risks_total, state_version, updated_at, state')
    .order('id')

  return (
    <main className="admin-page">
      <header style={{ marginBottom: '48px' }}>
        <span className="eyebrow">Admin</span>
        <h1 className="display-2">Archetypes.</h1>
      </header>

      <table className="admin-table">
        <thead>
          <tr>
            <th>ID</th>
            <th>Name</th>
            <th>Composite</th>
            <th>Risks</th>
            <th>Version</th>
            <th>Updated</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {(data ?? []).length === 0 ? (
            <tr>
              <td className="empty" colSpan={7}>
                No archetypes seeded.
              </td>
            </tr>
          ) : (
            (data ?? []).map((a: any) => (
              <tr key={a.id}>
                <td className="mono">{a.id}</td>
                <td>{a.state?.archetype?.name ?? '—'}</td>
                <td className="mono">{a.composite}</td>
                <td className="mono">{a.risks_total}</td>
                <td className="mono">v{a.state_version}</td>
                <td className="ago">{shortTs(a.updated_at)}</td>
                <td>
                  <Link href={`/admin/archetypes/${a.id}`}>Open →</Link>
                </td>
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
