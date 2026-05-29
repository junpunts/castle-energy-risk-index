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

  /** A filter chip — black pill when active, accent-coloured text when not.
   *  Active state must be unmistakable at a glance; "bolder mono caps" wasn't. */
  function Chip({ active, href, label }: { active: boolean; href: string; label: string }) {
    if (active) {
      return (
        <a
          href={href}
          aria-current="true"
          style={{
            display: 'inline-block',
            padding: '4px 10px',
            background: 'var(--fg, #181818)',
            color: '#fff',
            borderRadius: 4,
            textDecoration: 'none',
            margin: '0 2px',
          }}
        >
          {label}
        </a>
      )
    }
    return (
      <a
        href={href}
        style={{
          display: 'inline-block',
          padding: '4px 8px',
          color: 'var(--accent)',
          textDecoration: 'none',
          margin: '0 2px',
        }}
      >
        {label}
      </a>
    )
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
          <Chip active={status === 'pending'} href={linkParams({ status: 'pending' })} label="Pending" />
          <Chip active={status === 'applied'} href={linkParams({ status: 'applied' })} label="Applied" />
          <Chip active={status === 'rejected'} href={linkParams({ status: 'rejected' })} label="Rejected" />
          <Chip active={status === 'all'} href={linkParams({ status: 'all' })} label="All" />
        </span>
      </div>
      <div className="section-label" style={{ marginTop: 8, paddingTop: 0, borderTop: 'none' }}>
        <span className="l">Type</span>
        <span className="r">
          <Chip active={op === 'all'} href={linkParams({ op: 'all' })} label="All" />
          <Chip active={op === 'add_risk'} href={linkParams({ op: 'add_risk' })} label="New risks" />
          <Chip active={op === 'update_risk'} href={linkParams({ op: 'update_risk' })} label="Updates" />
          <Chip active={op === 'pin_news'} href={linkParams({ op: 'pin_news' })} label="News pins" />
          <Chip active={op === 'update_hedge'} href={linkParams({ op: 'update_hedge' })} label="Hedges" />
        </span>
      </div>
      <OpenProposals initial={data ?? []} />
    </main>
  )
}
