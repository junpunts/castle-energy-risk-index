import { requireAdmin } from '@/lib/auth'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { CopilotChat } from '@/components/admin/CopilotChat'

export const dynamic = 'force-dynamic'

export default async function AdminCopilot() {
  await requireAdmin()
  const sb = createServiceRoleClient()
  const { data } = await sb
    .from('archetypes')
    .select('id, state')
    .order('id')

  const archetypes = (data ?? []).map((a: any) => ({
    id: a.id,
    name: a.state?.archetype?.name ?? a.id,
  }))

  return (
    <main className="admin-page">
      <header style={{ marginBottom: 32 }}>
        <span className="eyebrow">Admin</span>
        <h1 className="display-2">Copilot.</h1>
        <p className="lede" style={{ marginTop: 24 }}>
          Talk to the risk model. Ask what changed, or instruct an edit in plain English —
          every change is drafted as a proposal you approve right here.
        </p>
      </header>

      {archetypes.length === 0 ? (
        <p className="empty">No archetypes seeded.</p>
      ) : (
        <CopilotChat archetypes={archetypes} />
      )}
    </main>
  )
}
