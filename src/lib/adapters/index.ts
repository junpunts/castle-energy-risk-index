/**
 * Adapter registry: returns the list of adapters to run for a given
 * archetype. Centralised so pull_sources doesn't carry adapter knowledge.
 */

import { type SourceAdapter } from './types'
import { federalRegisterAdapter } from './federal-register'
import { rssAdapter } from './rss'
import { castleScraperAdapter } from './castle-scraper'

export function adaptersForArchetype(archetypeId: string): SourceAdapter[] {
  return [
    federalRegisterAdapter(archetypeId),
    rssAdapter,
    castleScraperAdapter,
  ].filter((a) => a.enabled())
}
