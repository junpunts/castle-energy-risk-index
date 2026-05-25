import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireAdmin } from '@/lib/auth'
import { readArchetype } from '@/lib/archetypes/read'
import { RiskEditor } from '@/components/admin/RiskEditor'

export const dynamic = 'force-dynamic'

interface PageProps {
  params: { id: string; riskId: string }
}

export default async function AdminRiskEditor({ params }: PageProps) {
  await requireAdmin()
  const A = await readArchetype(params.id)
  if (!A) notFound()
  const detail = A.risk_details[params.riskId]
  const risk = A.risks.find((r) => r.id === params.riskId)
  if (!detail || !risk) notFound()

  return (
    <main className="admin-page">
      <header style={{ marginBottom: 32 }}>
        <span className="eyebrow">
          Admin · <Link href={`/admin/archetypes/${A.archetype_id}`}>{A.archetype.name}</Link>{' '}
          · Risk
        </span>
        <h1 className="display-2">{detail.title}.</h1>
        <p className="lede" style={{ marginTop: 16 }}>{detail.subtitle}</p>
        <div className="citation" style={{ marginTop: 16 }}>
          {detail.citation} · tracking since {detail.tracked_since}
        </div>
      </header>

      <RiskEditor archetypeId={A.archetype_id} risk={risk} detail={detail} />
    </main>
  )
}
