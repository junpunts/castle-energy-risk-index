import Link from 'next/link'
import { notFound } from 'next/navigation'
import { readArchetype } from '@/lib/archetypes/read'
import { rankedRisks } from '@/lib/archetypes/derive'
import { fmtCountdown } from '@/lib/format'
import ScenarioExplorer from './ScenarioExplorer'

export const dynamic = 'force-dynamic'
export const revalidate = 60

interface PageProps {
  params: { id: string }
}

export async function generateMetadata({ params }: PageProps) {
  const a = await readArchetype(params.id)
  return { title: a ? `${a.archetype.name} — Castle Risk Index` : 'Castle Risk Index' }
}

export default async function ArchetypePage({ params }: PageProps) {
  const A = await readArchetype(params.id)
  if (!A) notFound()

  const risks = rankedRisks(A.risks)
  const news = A.news

  // Aggregate upcoming dated catalysts across all risks for the rail.
  const now = Date.now()
  const catalysts = risks
    .flatMap((r) =>
      (A.risk_details[r.id]?.events ?? [])
        .filter((e) => e.future && Date.parse(e.date) >= now)
        .map((e) => ({ ...e, riskId: r.id })),
    )
    .sort((a, b) => Date.parse(a.date) - Date.parse(b.date))
    .slice(0, 6)

  // The news + catalysts rail is server-rendered and passed into the client
  // ScenarioExplorer (which owns the inputs, waterfall, and risks table).
  const rail = (
    <>
      <div className="section-label">
        <span className="l">News &amp; developments</span>
        <span className="r">{A.archetype.news_this_week} this week</span>
      </div>
      <section className="news-list news-rail">
        {news.slice(0, 6).map((n, i) => (
          <Link
            key={`${n.source}-${i}`}
            className="news-row"
            href={`/archetypes/${A.archetype_id}/risks/${risks[0].id}`}
          >
            <span className="src">{n.source}</span>
            <span className="ago">{n.ago}</span>
            <span className="ttl">{n.title}</span>
          </Link>
        ))}
      </section>

      {catalysts.length > 0 && (
        <>
          <div className="section-label rail-label-2">
            <span className="l">Upcoming catalysts</span>
            <span className="r">next {catalysts.length}</span>
          </div>
          <section className="catalyst-list">
            {catalysts.map((c, i) => (
              <Link
                key={`${c.riskId}-${c.date}-${i}`}
                className="catalyst-row"
                href={`/archetypes/${A.archetype_id}/risks/${c.riskId}`}
              >
                <span className="cat-when">{fmtCountdown(c.date)}</span>
                <span className="cat-kind">{c.kind}</span>
                <span className="cat-ttl">{c.title}</span>
              </Link>
            ))}
          </section>
        </>
      )}
    </>
  )

  return (
    <>
      <nav className="nav">
        <div className="nav-inner">
          <Link className="brand" href="/">
            <img src="/assets/svg/castle-logo-black.svg" alt="Castle" />
            <span className="product">Risk Index</span>
          </Link>
          <div className="crumb">
            <Link href="/">Archetypes</Link>
            <span className="sep">/</span>
            <span className="current">{A.archetype.name}</span>
          </div>
          <div className="right">
            <span className="live">Live</span>
            <Link href="/">All archetypes</Link>
          </div>
        </div>
      </nav>

      <main className="page">
        <header className="hero-arch">
          <span className="eyebrow" style={{ color: 'var(--accent)' }}>
            {A.archetype.eyebrow}
          </span>
          <h1 className="display-1">{A.archetype.name}.</h1>
          <div className="reading">
            <span className="tiny-label label">Composite reading</span>
            <span className="big-num">
              {A.archetype.composite}
              <span className="of">/100</span>
            </span>
          </div>
          <p className="lede">{A.archetype.blurb}</p>
        </header>

        <ScenarioExplorer bundle={A} archetypeId={A.archetype_id} rail={rail} />
      </main>

      <footer className="foot">
        <span>Castle · For informational purposes only</span>
        <span>
          <Link href="/">All archetypes</Link>
        </span>
      </footer>
    </>
  )
}
