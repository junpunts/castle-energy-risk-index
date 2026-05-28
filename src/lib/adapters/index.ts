/**
 * Adapter registry: returns the list of adapters to run for a given
 * archetype. Centralised so pull_sources doesn't carry adapter knowledge.
 *
 * The `bundle` argument is optional — adapters that read per-archetype
 * config (sponsors, litigation queries, transcript companies) prefer
 * bundle.intelligence over compiled-in fallbacks. pull_sources passes the
 * loaded bundle in so the new Phase-2 adapters don't need their own DB
 * roundtrip.
 */

import { type SourceAdapter } from './types'
import { federalRegisterAdapter } from './federal-register'
import { rssAdapter } from './rss'
import { castleScraperAdapter } from './castle-scraper'
import { secEdgarAdapter } from './sec-edgar'
import { courtListenerAdapter } from './court-listener'
import { earningsTranscriptsAdapter } from './earnings-transcripts'
import type { ArchetypeBundle } from '@/lib/schemas'

export function adaptersForArchetype(
  archetypeId: string,
  bundle?: ArchetypeBundle,
): SourceAdapter[] {
  return [
    federalRegisterAdapter(archetypeId),
    rssAdapter,
    castleScraperAdapter,
    secEdgarAdapter(archetypeId, bundle),
    courtListenerAdapter(archetypeId, bundle),
    earningsTranscriptsAdapter(archetypeId, bundle),
  ].filter((a) => a.enabled())
}
