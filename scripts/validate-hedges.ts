/**
 * Validate that every hedge ticker in a bundle resolves to a real, priced
 * contract — in the synthetic library or the scraper. Prevents the
 * fake-ticker drift that left offshore-wind with 0/24 priced hedges.
 *
 * Usage:
 *   npx tsx scripts/validate-hedges.ts public/data/utility-solar.json [...more]
 *
 * Exits non-zero if any hedge ticker is unresolved.
 */

import { config as loadEnv } from 'dotenv'
loadEnv({ path: '.env.local' })
import WS from 'ws'
;(globalThis as any).WebSocket ??= WS

import { readFileSync } from 'fs'
import { parseArchetypeBundle } from '../src/lib/schemas'
import { snapshotPrices } from '../src/lib/adapters/castle-scraper'
import { snapshotLibraryPrices, isLibraryTicker } from '../src/lib/adapters/castle-library'

async function validateFile(path: string): Promise<number> {
  const raw = JSON.parse(readFileSync(path, 'utf8'))
  const bundle = parseArchetypeBundle(raw)

  const tickers = new Set<string>()
  for (const d of Object.values(bundle.risk_details)) {
    for (const h of d.hedges ?? []) tickers.add(h.ticker)
  }
  const tickerList = [...tickers]
  const libT = tickerList.filter(isLibraryTicker)
  const scrT = tickerList.filter((t) => !isLibraryTicker(t))

  const [libMap, scrMap] = await Promise.all([
    libT.length ? snapshotLibraryPrices(libT) : Promise.resolve(new Map()),
    scrT.length ? snapshotPrices(scrT) : Promise.resolve(new Map()),
  ])

  const missing: string[] = []
  for (const t of tickerList) {
    if (!libMap.has(t) && !scrMap.has(t)) missing.push(t)
  }

  const resolved = tickerList.length - missing.length
  console.log(`${path}: ${resolved}/${tickerList.length} hedges resolved`)
  if (missing.length) {
    console.log('  MISSING (will never price):')
    for (const m of missing) console.log(`    - ${m}`)
  }
  return missing.length
}

async function main() {
  const files = process.argv.slice(2)
  if (files.length === 0) {
    console.error('usage: tsx scripts/validate-hedges.ts <bundle.json> [...]')
    process.exit(2)
  }
  let totalMissing = 0
  for (const f of files) totalMissing += await validateFile(f)
  if (totalMissing > 0) {
    console.error(`\n✗ ${totalMissing} hedge ticker(s) do not resolve. Fix before seeding.`)
    process.exit(1)
  }
  console.log('\n✓ all hedge tickers resolve to real contracts.')
  process.exit(0)
}

main().catch((e) => {
  console.error('FATAL', e)
  process.exit(1)
})
