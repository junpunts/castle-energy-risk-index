import { requireAdmin } from '@/lib/auth'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { OpenProposals } from '@/components/admin/OpenProposals'

export const dynamic = 'force-dynamic'

export default async function AdminProposalsInbox({
  searchParams,
}: {
  searchParams: { status?: string; archetype?: string }
}) {
  await requireAdmin()
  const sb = createServiceRoleClient()
  const status = searchParams.status ?? 'pending'

  let q = sb
    .from('proposals')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(100)

  if (status !== 'all') q = q.eq('status', status)
  if (searchParams.archetype) q = q.eq('archetype_id', searchParams.archetype)

  const { data } = await q

  return (
    <main className="admin-page">
      <header style={{ marginBottom: 48 }}>
        <span className="eyebrow">Admin</span>
        <h1 className="display-2">Proposals.</h1>
        <p className="lede" style={{ marginTop: 24 }}>
          Every state-changing action — cron updates, copilot edits, manual fixes — flows through
          here. Approve to apply; reject to discard.
        </p>
      </header>

      <div className="section-label">
        <span className="l">{status === 'pending' ? 'Open' : status} · {data?.length ?? 0}</span>
        <span className="r">
          <a href="?status=pending">Pending</a> · <a href="?status=applied">Applied</a> ·{' '}
          <a href="?status=rejected">Rejected</a> · <a href="?status=all">All</a>
        </span>
      </div>
      <OpenProposals initial={data ?? []} />
    </main>
  )
}
