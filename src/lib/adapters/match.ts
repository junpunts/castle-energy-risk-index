/**
 * Keyword matcher.
 *
 * Given a source item and an archetype bundle, decide which risks (if any)
 * the item is "about". This is the baseline implementation per ADMIN.md §
 * "Open design choices" (M7 step 5) — TF-IDF-ish keyword matching against
 * risk title, citation, and a small set of curated keywords. We instrument
 * false-positive / false-negative rates and upgrade to embeddings later if
 * precision is bad.
 *
 * Algorithm:
 *   1. Tokenise the item's title + body (lowercased, alphanumerics, dropped
 *      stopwords).
 *   2. For each risk in the archetype, build a keyword set from:
 *        - the risk's title (less stopwords),
 *        - its citation (statute / EO / docket numbers — strong signals),
 *        - any explicit keywords on the risk_detail (see KEYWORDS_BY_RISK).
 *   3. Score = sum of weights for each keyword present in the item's tokens.
 *        - "Strong" keywords (e.g. "BOEM", "EO 14154", "Section 232"): w=3
 *        - Risk-title content words: w=1
 *   4. A risk is "matched" if score ≥ MATCH_THRESHOLD (default 3).
 *
 * The 3-point floor means: at least one strong signal OR three title words.
 * This is intentionally conservative; precision > recall in the early days
 * because false matches drive bad Pass A proposals.
 */

import type { ArchetypeBundle, RiskDetail, NewsItem } from '@/lib/schemas'
import type { SourceItem } from './types'
import { cosineSimilarity } from './embeddings'

const STRONG_WEIGHT = 3
const TITLE_WEIGHT = 1
const MATCH_THRESHOLD = 3 // lowered from 4 to widen recall; explicit per-risk keyword lists keep precision

// Embedding-similarity tuning. We treat cosine as a bonus on top of keyword
// score (not a replacement) so existing precision behaviour is preserved.
// A 0.65-similarity item with one title-word match clears the threshold;
// a 0.40-similarity item adds nothing. Keeps both signals voting.
const EMBED_FLOOR = 0.40   // ignore similarities below this
const EMBED_WEIGHT = 8     // multiplier on (sim - floor)
const EMBED_MAX_BONUS = 4  // cap so embeddings don't drown keyword signal

// SEC risk-factor and court-docket content reads differently from news.
// These categories get a small uniform boost so the threshold is realistic
// for legal-prose paragraphs that don't repeat keywords like news does.
const SEC_CATEGORY = 'sec_risk_factor'
const COURT_CATEGORY = 'court_docket'
const EARNINGS_CATEGORY = 'earnings_qa'
const CATEGORY_BONUS: Record<string, number> = {
  [SEC_CATEGORY]: 1.5, // half a strong-token boost
  [COURT_CATEGORY]: 1.5,
  [EARNINGS_CATEGORY]: 1, // small — Q&A snippets can be conversational
}

// Common SEC risk-factor phrasings — "the Company is subject to", "may
// materially affect", "if [policy] is repealed". When these patterns hit
// alongside a topic word, we treat it as a strong signal.
const SEC_PHRASE_PATTERNS: RegExp[] = [
  /\b(the\s+)?company\s+is\s+subject\s+to\b/i,
  /\bcould\s+materially\s+(adversely\s+)?affect\b/i,
  /\bmay\s+materially\s+(adversely\s+)?(affect|impact)\b/i,
  /\bif\s+\w+\s+(is|are)\s+(repealed|modified|delayed|terminated)\b/i,
  /\bsubject\s+to\s+(extensive|federal|state)\s+regulation\b/i,
]

// Court docket fingerprints — case number patterns, court names. Helpful
// because dockets often use legalese ("Petition for Review", "Motion to Stay")
// rather than the topic vocabulary.
const COURT_PATTERNS: RegExp[] = [
  /\b\d+:\d+-cv-\d+\b/, // e.g. "1:25-cv-12345"
  /\bD\.?C\.?\s+Circuit\b/i,
  /\bUSCIT\b|\bCourt of International Trade\b/i,
  /\b(petition\s+for\s+review|motion\s+to\s+stay|preliminary\s+injunction|TRO|writ\s+of\s+mandamus)\b/i,
]

export interface MatchOptions {
  /** Embedding of the source item (title + body), if available. */
  itemEmbedding?: number[] | null
  /** Map of risk_id → risk embedding (title + citation + view). */
  riskEmbeddings?: Map<string, number[] | null>
}

// Per-archetype negative tokens — when present, suppress the match. The match
// stays if the item ALSO carries an archetype-strong token (rare but possible:
// e.g. an FR notice that mentions both oil-and-gas leases AND offshore wind).
const ARCHETYPE_NEGATIVE_TOKENS: Record<string, string[]> = {
  'offshore-wind': [
    'oil and gas',
    'oil spill',
    'petroleum',
    'natural gas',
    'lng',
    'pipeline',
    'crude oil',
    'oil pollution',
    'oil and gas lease',
  ],
  'utility-solar': [
    'offshore wind',
    'solar eclipse',
    'solar system',
    'solar flare',
  ],
  'natural-gas': [
    'gasoline',
    'greenhouse gas emissions standard',
    'natural gas vehicle',
  ],
}

// Highly-discriminating tokens, curated per-archetype. Hits any one of these
// and the item is matched to that archetype with high confidence.
const ARCHETYPE_STRONG_TOKENS: Record<string, string[]> = {
  'offshore-wind': [
    'boem',
    'ocs',
    'wea',
    'orec',
    'monopile',
    'wtiv',
    'charybdis',
    'nyserda',
    'atlantic shores',
    'empire wind',
    'vineyard wind',
    'south fork',
    'revolution wind',
    'sunrise wind',
    'coastal virginia',
    'ocean wind',
    'eo 14154',
  ],
  'utility-solar': [
    'photovoltaic',
    'utility solar',
    'ad/cvd',
    'auxin',
    'solar tariff',
    'interconnection queue',
    'crystalline silicon',
    'uflpa',
    'forced labor',
    'feoc',
    'section 201',
    'longi',
    'solar cell',
    'solar iv',
    '48e',
    '45y',
    'solar deployment',
    'solar capacity',
    'module imports',
    'first solar',
    'jinko',
    'qcells',
    'solar market',
    'solar industry',
    'panel manufacturer',
    'solar duty',
    'preliminary determination',
  ],
  'natural-gas': [
    'lng',
    'liquefied natural gas',
    'ferc',
    'henry hub',
    'cp2',
    'combustion turbine',
    'gas pipeline',
    'natural gas pipeline',
    'doe export',
    'golden pass',
    'rio grande lng',
    'nepa categorical',
    'eo 14318',
    'pjm capacity',
    'mmbtu',
  ],
  'onshore-wind': ['ptc', 'onshore wind farm', 'wind ptc'],
  'battery-storage': ['battery storage', 'bess', 'energy storage', 'itc storage', 'lithium-ion', 'sodium-ion', '45x', 'feoc', 'ul 9540', 'long-duration', 'hts 8507', 'thermal runaway', 'energy storage installations', 'storage deployment', 'battery deployment', 'lithium iron phosphate', 'lfp battery', 'megapack', 'powerwall', 'seia storage', 'storage market', 'iron-air', 'battery market'],
  'nuclear-smr': ['small modular reactor', 'bwrx-300', 'clinch river', 'nuclear regulatory commission', 'construction permit', '45u', 'haleu', 'advanced nuclear', 'safety evaluation report', 'russian uranium', 'part 53'],
  'green-hydrogen': ['45v', 'electrolyzer', 'clean hydrogen', 'three pillars'],
  'ev-charging': [
    'nevi', 'ev charging', 'charging infrastructure',
    'dc fast charging', 'dcfc', 'evse', 'buy america', 'baba',
    '30c', '45w', 'refueling property', 'commercial clean vehicle',
    'acc ii', 'alternative fuel vehicle', 'fhwa-2024-0001',
    'electric vehicle credit', 'level 3 charger', 'ev charger',
  ],
}

// Per-risk explicit keywords. Add as we discover patterns the matcher misses.
// Each entry: list of (token, weight). Tokens are lowercased.
const KEYWORDS_BY_RISK: Record<string, Array<[string, number]>> = {
  // offshore-wind:
  ow1: [
    ['eo 14154', 3], ['cop approval', 3], ['cop freeze', 3], ['boem freeze', 3], ['lease moratorium', 3],
    ['30 cfr 585', 2], ['construction operations plan', 2], ['cop', 1],
  ],
  ow2: [
    ['stop-work', 3], ['stop work order', 3], ['empire wind', 3], ['mid-construction', 2], ['ssa-1', 2],
  ],
  ow3: [
    ['section 232', 3], ['steel tariff', 3], ['monopile', 2], ['hts 7208', 3], ['hts 7305', 3],
    ['hts 7308', 3], ['plate steel', 2], ['tariff proclamation', 2],
  ],
  ow4: [
    ['jones act', 3], ['46 usc 55102', 3], ['charybdis', 3], ['wtiv', 3], ['feeder vessel', 2],
    ['installation vessel', 2],
  ],
  ow5: [
    ['45y', 3], ['48e', 3], ['§45y', 3], ['§48e', 3], ['obbba', 3], ['reconciliation', 2],
    ['production tax credit', 2], ['investment tax credit', 2], ['ira repeal', 3], ['clean energy credit', 2],
  ],
  ow6: [
    ['feoc', 3], ['foreign entity of concern', 3], ['domestic content', 3], ['treasury notice 2024-41', 3],
    ['prohibited foreign entity', 2],
  ],
  ow7: [
    ['nepa', 3], ['esa', 2], ['nmfs', 3], ['biop', 2], ['biological opinion', 3], ['right whale', 3],
    ['north atlantic right whale', 3], ['ita', 2], ['iha', 2], ['marine mammal', 2],
  ],
  ow8: [
    ['ocs clean air', 3], ['caa 328', 3], ['atlantic shores', 3], ['epa eab', 3],
    ['environmental appeals board', 3], ['psd permit', 2],
  ],
  ow9: [
    ['orec', 3], ['nyserda', 3], ['nj bpu', 3], ['mass doer', 3], ['orec re-opener', 3],
    ['offshore wind solicitation', 2], ['ppa price', 2],
  ],

  // utility-solar:
  us1: [
    ['solar iv', 3], ['ad/cvd', 3], ['antidumping', 3], ['countervailing', 3], ['usitc', 3],
    ['injury determination', 3], ['crystalline silicon', 2], ['solar cell', 2], ['731-ta', 3], ['701-ta', 3],
  ],
  us2: [
    ['section 301', 3], ['solar tariff', 3], ['panel tariff', 3], ['china tariff', 2], ['combined rate', 2],
    ['module pricing', 2],
  ],
  us3: [
    ['feoc', 3], ['48e', 3], ['45y', 3], ['§48e', 3], ['§45y', 3], ['foreign entity of concern', 3],
    ['treasury guidance', 2], ['tax equity', 2], ['obbb', 3], ['prohibited foreign entity', 2],
    ['solar tax credit', 3], ['48e solar', 3], ['solar feoc', 3], ['solar credit', 2], ['ira repeal', 3],
  ],
  us4: [
    ['uflpa', 3], ['forced labor', 3], ['cbp', 3], ['customs detention', 3], ['withhold release order', 3],
    ['polysilicon', 2], ['traceability', 2],
  ],
  us5: [
    ['interconnection queue', 3], ['pjm', 3], ['ferc order 2023', 3], ['queue reform', 3],
    ['interconnection', 2], ['queue processing', 2],
  ],
  us6: [
    ['ercot', 3], ['curtailment', 3], ['negative price', 2], ['midday', 2], ['merchant solar', 2],
    ['solar curtailment', 3], ['midday curtailment', 3], ['negative pricing', 3], ['duck curve', 3],
    ['solar generation', 2], ['solar capture price', 3],
  ],
  us7: [
    ['longi', 3], ['prohibited foreign entity', 3], ['feoc', 3], ['48e', 2], ['treasury designation', 3],
    ['module supplier', 2],
  ],

  // natural-gas:
  ng1: [
    ['lng export', 3], ['doe export', 3], ['export authorization', 3], ['bcf/d', 3], ['eo 14154', 3],
    ['liquefied natural gas', 2], ['cumulative capacity', 2],
  ],
  ng2: [
    ['cp2', 3], ['cp2 lng', 3], ['d.c. circuit', 3], ['nepa', 3], ['clean air act', 2], ['remand', 2],
    ['environmental review', 2], ['terminal authorization', 2],
  ],
  ng3: [
    ['ferc certificate', 3], ['pipeline approval', 3], ['nga §7', 3], ['interstate pipeline', 3],
    ['certificate queue', 2], ['processing time', 2],
  ],
  ng4: [
    ['henry hub', 3], ['mmbtu', 3], ['gas price', 2], ['spark spread', 3], ['nymex', 2],
    ['spot price', 2], ['feedgas', 2],
  ],
  ng5: [
    ['combustion turbine', 3], ['nsps', 3], ['epa turbine', 3], ['turbine permitting', 3],
    ['new source performance', 2], ['gas turbine', 2],
  ],
  ng6: [
    ['pjm capacity', 3], ['capacity auction', 3], ['data center', 3], ['backstop auction', 3],
    ['capacity shortfall', 3], ['base residual auction', 2], ['scarcity pricing', 2],
  ],
  ng7: [
    ['nepa categorical', 3], ['categorical exclusion', 3], ['eo 14318', 3], ['injunction', 2],
    ['permitting reform', 2], ['cat-ex', 3],
  ],

  // battery-storage:
  bs1: [
    ['section 301', 3], ['hts 8507', 3], ['lithium-ion', 3], ['sodium-ion', 3], ['battery cell', 3],
    ['cell tariff', 3], ['ustr', 2], ['battery tariff', 3],
  ],
  bs2: [
    ['feoc', 3], ['45x', 3], ['§45x', 3], ['prohibited foreign entity', 3], ['battery component', 3],
    ['domestic content', 2], ['pfe', 2], ['material assistance', 2], ['form energy', 2],
  ],
  bs3: [
    ['48e', 3], ['§48e', 3], ['storage itc', 3], ['investment tax credit', 2], ['ira repeal', 3],
    ['safe harbor', 2], ['obbb', 2], ['credit repeal', 3],
  ],
  bs4: [
    ['interconnection queue', 3], ['pjm', 3], ['ferc order 2023', 3], ['co-located', 3],
    ['queue processing', 2], ['interconnection', 2],
  ],
  bs5: [
    ['ul 9540', 3], ['fire safety', 3], ['thermal runaway', 3], ['bess fire', 3], ['fire code', 3],
    ['setback', 2], ['siting', 2],
  ],
  bs6: [
    ['uflpa', 3], ['forced labor', 3], ['cbp', 3], ['detention', 3], ['withhold release order', 3],
    ['bess shipment', 2],
  ],
  bs7: [
    ['ancillary', 3], ['arbitrage', 3], ['caiso', 3], ['ercot', 2], ['merchant storage', 3],
    ['as saturation', 2], ['storage tariff', 2], ['dispatch', 2],
    ['storage installations', 3], ['storage growth', 3], ['storage market', 3], ['energy storage market', 3],
    ['storage deployment', 3], ['storage capacity', 2], ['seia storage', 3], ['battery deployment', 3],
  ],

  // nuclear-smr:
  ns1: [
    ['construction permit', 3], ['bwrx-300', 3], ['clinch river', 3], ['safety evaluation report', 3],
    ['aser', 3], ['fser', 3], ['licensing', 2], ['part 50', 2], ['tva', 2], ['small modular reactor', 3],
  ],
  ns2: [
    ['45u', 3], ['§45u', 3], ['production tax credit', 2], ['nuclear ptc', 3], ['feoc', 3],
    ['prohibited foreign entity', 3], ['obbba', 2], ['treasury regulations', 2],
  ],
  ns3: [
    ['russian uranium', 3], ['haleu', 3], ['high-assay low-enriched uranium', 3], ['enrichment', 3],
    ['uranium import', 3], ['doe waiver', 3], ['orano', 3], ['fuel supply', 2], ['low-enriched uranium', 2],
  ],
  ns4: [
    ['part 53', 3], ['eo 14300', 3], ['executive order 14300', 3], ['part 37', 3],
    ['risk-informed', 3], ['technology-inclusive', 3], ['regulatory modernization', 2], ['rulemaking', 2],
  ],
  ns5: [
    ['loan guarantee', 3], ['loan programs office', 3], ['lpo', 3], ['title 17', 3], ['shine medical', 3],
    ['conditional commitment', 2], ['financing close', 2], ['doe loan', 3],
  ],
  ns6: [
    ['beyond nuclear', 3], ['injunction', 3], ['stay of proceedings', 3], ['dc circuit', 3],
    ['sierra club', 2], ['petition for review', 2], ['litigation', 2],
  ],
  ns7: [
    ['government shutdown', 3], ['appropriations lapse', 3], ['continuing resolution', 2],
    ['funding lapse', 3], ['shutdown', 2], ['permitting delay', 2],
  ],

  // ev-charging:
  ev1: [
    ['30c', 3], ['§30c', 3], ['section 30c', 3], ['refueling property', 3],
    ['alternative fuel refueling', 3], ['h.r.1 70504', 3], ['obbba 30c', 3],
    ['refueling credit', 2], ['refueling property credit', 3],
  ],
  ev2: [
    ['45w', 3], ['§45w', 3], ['section 45w', 3], ['commercial clean vehicle', 3],
    ['commercial ev credit', 3], ['p.l. 119-21', 2], ['fleet ev credit', 3],
    ['clean vehicle credit', 3],
  ],
  ev3: [
    ['baba', 3], ['build america buy america', 3], ['domestic content', 3],
    ['manufactured products', 3], ['fhwa-2024-0001', 3], ['buy america', 3],
    ['fhwa waiver', 3], ['23 cfr 635', 2], ['55% u.s. component', 3],
  ],
  ev4: [
    ['nevi', 3], ['nevi formula', 3], ['alt-use', 3], ['23 usc 175', 3],
    ['nevi repeal', 3], ['state alternative use', 3], ['fhwa nevi', 3],
    ['nevi rescission', 3], ['nevi alternative use', 3],
  ],
  ev5: [
    ['section 232 transformer', 3], ['grid equipment', 3], ['transformer tariff', 3],
    ['switchgear', 2], ['hts 8504', 3], ['bis-2020-0015', 3],
    ['power electronics', 2], ['section 301 list 3', 3],
  ],
  ev6: [
    ['acc ii', 3], ['advanced clean cars', 3], ['caa 209(b)', 3], ['section 209(b)', 3],
    ['vermont eo 04-25', 3], ['zev mandate', 3], ['clean truck partnership', 2],
    ['ev mandate', 3], ['california waiver', 3],
  ],
  ev7: [
    ['ntea', 3], ['automotive fleet', 3], ['commercial fleet ev', 3], ['fleet order', 3],
    ['bev sales', 3], ['ev adoption', 2], ['ev sales decline', 3],
    ['fleet ev order', 3],
  ],
}

const STOPWORDS = new Set([
  'a', 'an', 'and', 'the', 'or', 'of', 'in', 'on', 'at', 'to', 'for', 'with',
  'by', 'from', 'as', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'that', 'this', 'these', 'those', 'it', 'its', 'has', 'have', 'had',
  'will', 'would', 'could', 'should', 'may', 'might', 'can', 'must',
  'new', 'all', 'any', 'some', 'no', 'not', 'into', 'over', 'under',
  'after', 'before', 'when', 'where', 'how', 'why', 'what',
])

/** Tokenise: lowercase, split on non-alphanumeric, drop stopwords + tokens < 3 chars. */
export function tokenize(text: string): Set<string> {
  const out = new Set<string>()
  for (const tok of text.toLowerCase().split(/[^a-z0-9§]+/)) {
    if (tok.length < 3) continue
    if (STOPWORDS.has(tok)) continue
    out.add(tok)
  }
  return out
}

/** Tokenise plus retain bigrams ("section 232", "eo 14154") for phrase tokens. */
function bigrams(text: string): Set<string> {
  const tokens = text
    .toLowerCase()
    .split(/[^a-z0-9§]+/)
    .filter((t) => t.length > 0)
  const out = new Set<string>()
  for (let i = 0; i < tokens.length - 1; i++) {
    out.add(`${tokens[i]} ${tokens[i + 1]}`)
  }
  // also trigrams for "north atlantic right whale" style
  for (let i = 0; i < tokens.length - 2; i++) {
    out.add(`${tokens[i]} ${tokens[i + 1]} ${tokens[i + 2]}`)
  }
  return out
}

export interface MatchResult {
  archetype_id: string
  risk_ids: string[]
  score_by_risk: Record<string, number>
}

/**
 * Score an item against one archetype's risks. Returns the list of matched
 * risk ids (score ≥ MATCH_THRESHOLD) plus per-risk scores for telemetry.
 */
export function matchItemAgainstArchetype(
  item: SourceItem,
  bundle: ArchetypeBundle,
  options?: MatchOptions,
): MatchResult {
  const text = `${item.title}\n${item.body ?? ''}`
  const tokens = tokenize(text)
  const phrases = bigrams(text)

  const archetypeId = bundle.archetype_id
  // Archetype-level early exit: if the item carries an explicit hint and
  // it doesn't match this archetype, skip. But ALSO score normally — hints
  // are a hint, not a constraint.
  const score_by_risk: Record<string, number> = {}

  for (const r of bundle.risks ?? []) {
    let score = 0

    // 1. Per-risk explicit keywords (highest signal).
    const kws = KEYWORDS_BY_RISK[r.id] ?? []
    for (const [kw, w] of kws) {
      if (kw.includes(' ')) {
        if (phrases.has(kw)) score += w
      } else if (tokens.has(kw)) {
        score += w
      }
    }

    // 2. Title content words.
    for (const tok of tokenize(r.title)) {
      if (tokens.has(tok)) score += TITLE_WEIGHT
    }

    // 3. Citation tokens (statute numbers etc. — moderate signal).
    const detail = bundle.risk_details?.[r.id] as RiskDetail | undefined
    if (detail?.citation) {
      for (const tok of tokenize(detail.citation)) {
        // Citations are mostly numbers/codes; bump weight a notch.
        if (tokens.has(tok)) score += 2
      }
    }

    if (score > 0) score_by_risk[r.id] = score
  }

  // 4. Archetype-strong tokens — bump every matched risk in this archetype
  //    by +STRONG_WEIGHT IF the item also hit one of them. This gives a
  //    boost to obviously-relevant items even when no risk-specific phrase
  //    matches.
  const archStrong = ARCHETYPE_STRONG_TOKENS[archetypeId] ?? []
  let archetypeHit = false
  for (const tok of archStrong) {
    if (tok.includes(' ') ? phrases.has(tok) : tokens.has(tok)) {
      archetypeHit = true
      break
    }
  }
  if (archetypeHit) {
    for (const id of Object.keys(score_by_risk)) {
      score_by_risk[id] = (score_by_risk[id] ?? 0) + STRONG_WEIGHT
    }
  }

  // 5. Negative tokens — if the item hits one, zero scores out unless the
  //    item also carries a wind-specific phrase. "BOEM" alone isn't enough
  //    because BOEM regulates both oil-and-gas AND offshore wind: a BOEM
  //    notice about oil spill responsibility should NOT match wind risks.
  const WIND_REQUIRED = ['offshore wind', 'wind energy', 'wind lease', 'wind project', 'wea ', 'orec']
  const negTokens = ARCHETYPE_NEGATIVE_TOKENS[archetypeId] ?? []
  let negHit = false
  for (const tok of negTokens) {
    if (tok.includes(' ') ? phrases.has(tok) : tokens.has(tok)) {
      negHit = true
      break
    }
  }
  if (negHit && archetypeId === 'offshore-wind') {
    const hasWind = WIND_REQUIRED.some((tok) =>
      tok.includes(' ') ? phrases.has(tok) : tokens.has(tok),
    )
    if (!hasWind) {
      for (const id of Object.keys(score_by_risk)) score_by_risk[id] = 0
    }
  }

  // 5b. Category-aware bonus. SEC + court + earnings content reads in long
  //     legal sentences with little keyword repetition — the per-risk
  //     keyword count is naturally lower. Give the source-type a small
  //     uniform bump if the item already scored on at least one signal.
  const catBonus = item.category ? (CATEGORY_BONUS[item.category] ?? 0) : 0
  if (catBonus > 0) {
    // Strong source bonus only kicks in if the item had keyword traction
    // AND the source-specific phrasing patterns are present. Otherwise
    // we'd boost every SEC paragraph regardless of relevance.
    const rawText = text.toLowerCase()
    const hasSecPhrase = SEC_PHRASE_PATTERNS.some((re) => re.test(text))
    const hasCourtPhrase = COURT_PATTERNS.some((re) => re.test(text))
    const phraseHit =
      (item.category === SEC_CATEGORY && hasSecPhrase) ||
      (item.category === COURT_CATEGORY && hasCourtPhrase) ||
      item.category === EARNINGS_CATEGORY
    if (phraseHit) {
      for (const id of Object.keys(score_by_risk)) {
        score_by_risk[id] = (score_by_risk[id] ?? 0) + catBonus
      }
    }
    // unused but tracked here to avoid an eslint flag in tight contexts
    void rawText
  }

  // 6. Embedding bonus — applied last so it doesn't compound the keyword
  //    archetype-hit / negative-token logic. Adds (sim - 0.40) * 8 per risk,
  //    capped at 4. Item must have an embedding AND the risk must have one;
  //    if either is null, no bonus (graceful keyword-only fallback).
  if (options?.itemEmbedding && options.riskEmbeddings) {
    for (const r of bundle.risks ?? []) {
      const riskEmb = options.riskEmbeddings.get(r.id)
      if (!riskEmb) continue
      const sim = cosineSimilarity(options.itemEmbedding, riskEmb)
      if (sim <= EMBED_FLOOR) continue
      const bonus = Math.min(EMBED_MAX_BONUS, (sim - EMBED_FLOOR) * EMBED_WEIGHT)
      score_by_risk[r.id] = (score_by_risk[r.id] ?? 0) + bonus
    }
  }

  const risk_ids = Object.entries(score_by_risk)
    .filter(([, s]) => s >= MATCH_THRESHOLD)
    .sort(([, a], [, b]) => b - a)
    .map(([id]) => id)

  return { archetype_id: archetypeId, risk_ids, score_by_risk }
}

/**
 * Convert a SourceItem (raw scraper output) to a NewsItem (dashboard shape).
 * Used when promoting a matched item into a risk's news[] feed via a
 * propose_news_item proposal.
 */
export function sourceItemToNewsItem(
  item: SourceItem,
  category: 'policy' | 'trade' | 'operational' | 'market' = 'policy',
): NewsItem {
  return {
    source: prettifySource(item.category ?? item.url),
    ago: relativeAgo(new Date(item.published_at)),
    tag: category,
    title: item.title.slice(0, 240),
    ...(item.body ? { sum: item.body.slice(0, 400) } : {}),
    url: item.url,
    published_at: item.published_at,
  }
}

function prettifySource(s: string): string {
  if (/^https?:/i.test(s)) {
    try {
      return new URL(s).hostname.replace(/^www\./, '').toUpperCase()
    } catch {
      return s.toUpperCase()
    }
  }
  return s.replace(/[-_:]+/g, ' ').toUpperCase()
}

function relativeAgo(d: Date): string {
  const ms = Date.now() - d.getTime()
  const hr = Math.floor(ms / 3_600_000)
  if (hr < 1) return 'just now'
  if (hr < 24) return `${hr} hr ago`
  const day = Math.floor(hr / 24)
  if (day < 7) return `${day} day${day === 1 ? '' : 's'} ago`
  const wk = Math.floor(day / 7)
  return `${wk} wk ago`
}
