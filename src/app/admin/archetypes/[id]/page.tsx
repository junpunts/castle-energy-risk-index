import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireAdmin } from '@/lib/auth'
import { readArchetype } from '@/lib/archetypes/read'
import { rankedRisks } from '@/lib/archetypes/derive'
import { TriggerPipeline } from '@/components/admin/TriggerPipeline'

export const dynamic = 'force-dynamic'

interface PageProps {
  params: { id: string }
}

export default async function AdminArchetypeDetail({ params }: PageProps) {
  await requireAdmin()
  const A = await readArchetype(params.id)
  if (!A) notFound()

  const risks = rankedRisks(A.risks)

  return (
    <main className="admin-page">
      <header style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 32, marginBottom: 48 }}>
        <div>
          <span className="eyebrow">Admin · Archetype</span>
          <h1 className="display-2">{A.archetype.name}.</h1>
          <p className="lede" style={{ marginTop: 24 }}>{A.archetype.blurb}</p>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'flex-end' }}>
          <TriggerPipeline archetypeId={A.archetype_id} pipelineName="rebuild_archetype" label="Re-run rebuild" />
          <TriggerPipeline archetypeId={A.archetype_id} pipelineName="daily_refresh" label="Run daily refresh" disabled />
          <Link href={`/archetypes/${A.archetype_id}`} className="btn is-ghost" style={{ fontSize: 10 }}>
            View public ↗
          </Link>
        </div>
      </header>

      <section className="kpi-row">
        <div><div className="l">Composite</div><div className="v">{A.archetype.composite}</div><div className="help">/100</div></div>
        <div><div className="l">Risks</div><div className="v">{A.archetype.risks_total}</div><div className="help">{A.archetype.risks_high} high likelihood</div></div>
        <div><div className="l">Capex</div><div className="v">${(A.archetype.typical.capex / 1e9).toFixed(1)}B</div><div className="help">Typical project</div></div>
        <div><div className="l">News this week</div><div className="v">{A.archetype.news_this_week}</div><div className="help">Pinned items</div></div>
      </section>

      <div className="section-label">
        <span className="l">Risks · {risks.length}</span>
        <span className="r">Ranked by IRR impact</span>
      </div>
      <table className="admin-table">
        <thead>
          <tr>
            <th>ID</th>
            <th>Title</th>
            <th>Category</th>
            <th>Probability</th>
            <th>Impact (IRR pp)</th>
            <th>Likelihood</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {risks.map((r) => (
            <tr key={r.id}>
              <td className="mono">{r.id}</td>
              <td>{r.title}</td>
              <td className="mono">{r.category}</td>
              <td className="mono">{(r.probability * 100).toFixed(0)}%</td>
              <td className="mono">{r.impact_irr.toFixed(1)}</td>
              <td className="mono">{r.likelihood}</td>
              <td>
                <Link href={`/admin/archetypes/${A.archetype_id}/risks/${r.id}`}>Edit →</Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  )
}
