import { requireAdmin } from '@/lib/auth'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { OpenProposals } from '@/components/admin/OpenProposals'

export const dynamic = 'force-dynamic'

export default async function AdminProposalsInbox({
  searchParams,
}: {
  searchParams: { status?: string; archetype?: string; op?: string }
}) {
  await requireAdmin()
  const sb = createServiceRoleClient()
  const status = searchParams.status ?? 'pending'
  const op = searchParams.op ?? 'all'

  let q = sb
    .from('proposals')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(100)

  if (status !== 'all') q = q.eq('status', status)
  if (op !== 'all') q = q.eq('op', op)
  if (searchParams.archetype) q = q.eq('archetype_id', searchParams.archetype)

  const { data } = await q

  // "New this week" badge — count pending add_risk proposals from the last 7 days.
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString()
  const { count: newRisksCount } = await sb
    .from('proposals')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'pending')
    .eq('op', 'add_risk')
    .gte('created_at', sevenDaysAgo)

  const linkParams = (next: { status?: string; op?: string }) => {
    const sp = new URLSearchParams()
    sp.set('status', next.status ?? status)
    if ((next.op ?? op) !== 'all') sp.set('op', next.op ?? op)
    return `?${sp.toString()}`
  }

  return (
    <main className="admin-page">
      <header style={{ marginBottom: 48 }}>
        <span className="eyebrow">Admin</span>
        <h1 className="display-2">Proposals.</h1>
        <p className="lede" style={{ marginTop: 24 }}>
          Every state-changing action — cron updates, copilot edits, manual fixes — flows through
          here. Approve to apply; reject to discard.
          {newRisksCount && newRisksCount > 0 ? (
            <>
              {' '}
              <a
                href={linkParams({ status: 'pending', op: 'add_risk' })}
                style={{
                  display: 'inline-block',
                  marginLeft: 8,
                  padding: '4px 12px',
                  background: 'var(--accent, #c66)',
                  color: '#fff',
                  borderRadius: 999,
                  fontSize: 12,
                  fontWeight: 600,
                  textDecoration: 'none',
                  letterSpacing: '0.04em',
                }}
              >
                {newRisksCount} new risk{newRisksCount === 1 ? '' : 's'} this week
              </a>
            </>
          ) : null}
        </p>
      </header>

      <div className="section-label">
        <span className="l">
          {status === 'pending' ? 'Open' : status} · {op !== 'all' ? `${op} · ` : ''}
          {data?.length ?? 0}
        </span>
        <span className="r">
          <a href={linkParams({ status: 'pending' })}>Pending</a> ·{' '}
          <a href={linkParams({ status: 'applied' })}>Applied</a> ·{' '}
          <a href={linkParams({ status: 'rejected' })}>Rejected</a> ·{' '}
          <a href={linkParams({ status: 'all' })}>All</a>
        </span>
      </div>
      <div className="section-label" style={{ marginTop: 8, paddingTop: 0, borderTop: 'none' }}>
        <span className="l">Type</span>
        <span className="r">
          <a href={linkParams({ op: 'all' })}>{op === 'all' ? <b>All</b> : 'All'}</a> ·{' '}
          <a href={linkParams({ op: 'add_risk' })}>
            {op === 'add_risk' ? <b>New risks</b> : 'New risks'}
          </a>{' '}
          ·{' '}
          <a href={linkParams({ op: 'update_risk' })}>
            {op === 'update_risk' ? <b>Updates</b> : 'Updates'}
          </a>{' '}
          ·{' '}
          <a href={linkParams({ op: 'pin_news' })}>
            {op === 'pin_news' ? <b>News pins</b> : 'News pins'}
          </a>{' '}
          ·{' '}
          <a href={linkParams({ op: 'update_hedge' })}>
            {op === 'update_hedge' ? <b>Hedges</b> : 'Hedges'}
          </a>
        </span>
      </div>
      <OpenProposals initial={data ?? []} />
    </main>
  )
}
