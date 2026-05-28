/**
 * Stage: surface_new_risks (Pass B).
 *
 * Pass A maintains existing risks. Pass B looks for risks Castle isn't yet
 * tracking by scanning news_cache items that didn't match any current risk
 * but DO hint at the archetype (via the archetype-strong tokens that
 * lib/adapters/match.ts uses for the keyword path).
 *
 * Flow:
 *   1. Pull unmatched-but-archetype-relevant news_cache items from the last
 *      90 days. Cap at 60 items so the prompt stays bounded.
 *   2. Bail early if < 5 items — not enough signal for a coherent theme.
 *   3. Ask Opus to propose at most 3 new risks via the propose_add_risk tool.
 *      Each proposed risk must cite ≥2 input items as evidence.
 *   4. For each tool_use, insert a `proposals` row with op='add_risk',
 *      source='cron-passB', requires_review=true (de facto — admin approves
 *      everything anyway, and `requires_review` isn't a column on the table).
 *   5. Skip proposals whose title/citation is a near-exact duplicate of an
 *      existing risk (cheap regex dedupe; the apply path also enforces this).
 *
 * Not destructive: at worst, queues a few proposals in the admin inbox.
 */

import type { Stage } from '../registry'
import { createMessage } from '@/lib/llm/client'
import { llmLimit } from '@/lib/llm/limiter'
import { priceFor } from '@/lib/llm/cost'
import {
  parseArchetypeBundle,
  type ArchetypeBundle,
  ProposalOpSchema,
} from '@/lib/schemas'
import { ALL_PASS_B_TOOLS, toolUseToProposal } from '@/lib/agent/tools'
import type Anthropic from '@anthropic-ai/sdk'

const OPUS_MODEL = 'claude-opus-4-8'
const WINDOW_DAYS = 90
const MIN_ITEMS_FOR_RUN = 5
const MAX_ITEMS_IN_PROMPT = 60

interface SurfaceOutput {
  proposals_created: number
  items_considered: number
  items_unmatched: number
  rejected_duplicates: number
  cost_usd: number
  model: string
  proposal_ids: string[]
}

export const surfaceNewRisksStage: Stage<unknown, SurfaceOutput> = {
  name: 'surface_new_risks',
  async run(ctx) {
    if (!ctx.archetypeId) throw new Error('archetypeId required')
    const archetypeId = ctx.archetypeId

    const { data: archRow, error: archErr } = await ctx.sb
      .from('archetypes')
      .select('state')
      .eq('id', archetypeId)
      .single()
    if (archErr || !archRow) throw new Error(`load archetype: ${archErr?.message ?? 'missing'}`)
    const bundle = parseArchetypeBundle(archRow.state)

    // 1. Pull recent unmatched news_cache rows for this archetype.
    //    "Unmatched" = matched_risks is empty/null. We additionally filter
    //    in-memory using the archetype-strong tokens so we don't spam Opus
    //    with FBI press releases.
    const sinceIso = new Date(Date.now() - WINDOW_DAYS * 24 * 3600 * 1000).toISOString()
    const { data: rows, error: ncErr } = await ctx.sb
      .from('news_cache')
      .select('source, url, title, body, published_at, matched_risks, matched_archetypes')
      .gte('published_at', sinceIso)
      .order('published_at', { ascending: false })
      .limit(1000)
    if (ncErr) throw new Error(`news_cache query: ${ncErr.message}`)

    const all = rows ?? []
    const unmatched = all.filter((r) => {
      const mr = (r.matched_risks ?? []) as string[]
      return mr.length === 0
    })
    ctx.log(`scanning ${all.length} items in last ${WINDOW_DAYS}d; ${unmatched.length} unmatched`)

    // 2. Filter to items that hint at this archetype.
    const archStrong = ARCHETYPE_HINT_TOKENS[archetypeId] ?? []
    const candidates = unmatched.filter((r) =>
      itemHintsAtArchetype(r.title + '\n' + (r.body ?? ''), archStrong),
    )
    ctx.log(`${candidates.length} of ${unmatched.length} unmatched items hint at ${archetypeId}`)

    if (candidates.length < MIN_ITEMS_FOR_RUN) {
      ctx.log(`< ${MIN_ITEMS_FOR_RUN} hinted items; skipping`)
      return {
        output: {
          proposals_created: 0,
          items_considered: candidates.length,
          items_unmatched: unmatched.length,
          rejected_duplicates: 0,
          cost_usd: 0,
          model: OPUS_MODEL,
          proposal_ids: [],
        },
      }
    }

    // 3. Build prompt and call Opus.
    const itemsForPrompt = candidates.slice(0, MAX_ITEMS_IN_PROMPT)
    const system = SYSTEM_PROMPT
    const user = buildUserPrompt(bundle, itemsForPrompt)

    const msg = await llmLimit(() =>
      createMessage({
        model: OPUS_MODEL,
        max_tokens: 8192,
        system,
        tools: ALL_PASS_B_TOOLS,
        messages: [{ role: 'user', content: user }],
      }),
    )
    const cost_usd = priceFor(msg.model, msg.usage)
    await ctx.cost(msg.model, msg.usage.input_tokens, msg.usage.output_tokens, cost_usd)
    ctx.log(`opus call: ${msg.usage.input_tokens}in/${msg.usage.output_tokens}out, $${cost_usd.toFixed(4)}`)

    // 4. Extract tool_use blocks → proposals.
    const toolUses = msg.content.filter(
      (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use',
    )
    ctx.log(`opus proposed ${toolUses.length} new-risk candidate${toolUses.length === 1 ? '' : 's'}`)

    // 5. Validate, dedupe, persist.
    const existingTitles = new Set(bundle.risks.map((r) => r.title.trim().toLowerCase()))
    const existingCitations = new Set(
      bundle.risks.map((r) => r.citation.trim().toLowerCase()).filter(Boolean),
    )
    const created: string[] = []
    let rejectedDuplicates = 0

    for (const block of toolUses) {
      if (block.name !== 'propose_add_risk') {
        ctx.log(`  ✗ unexpected tool: ${block.name}`)
        continue
      }
      const parsed = toolUseToProposal(block.name, block.input)
      if (!parsed) continue

      // Schema-level validation.
      try {
        ProposalOpSchema.parse({ op: parsed.op, payload: parsed.payload })
      } catch (err) {
        ctx.log(`  ✗ schema-invalid proposal: ${(err as Error).message.slice(0, 120)}`)
        continue
      }

      // Title / citation duplicate gate.
      const propTitle = String(parsed.payload?.risk?.title ?? '')
        .trim()
        .toLowerCase()
      const propCitation = String(parsed.payload?.risk?.citation ?? '')
        .trim()
        .toLowerCase()
      if (propTitle && existingTitles.has(propTitle)) {
        rejectedDuplicates++
        ctx.log(`  ✗ duplicate title: ${propTitle.slice(0, 80)}`)
        continue
      }
      if (propCitation && existingCitations.has(propCitation)) {
        rejectedDuplicates++
        ctx.log(`  ✗ duplicate citation: ${propCitation.slice(0, 80)}`)
        continue
      }
      // Token-jaccard fuzzy match against existing titles (≥0.75 overlap).
      let fuzzyHit: string | null = null
      const propTokens = new Set(propTitle.split(/\W+/).filter((w) => w.length >= 4))
      for (const existing of existingTitles) {
        const exTokens = new Set(existing.split(/\W+/).filter((w) => w.length >= 4))
        if (propTokens.size === 0 || exTokens.size === 0) continue
        const inter = [...propTokens].filter((t) => exTokens.has(t)).length
        const union = new Set([...propTokens, ...exTokens]).size
        if (union > 0 && inter / union >= 0.75) {
          fuzzyHit = existing
          break
        }
      }
      if (fuzzyHit) {
        rejectedDuplicates++
        ctx.log(`  ✗ fuzzy-duplicate of "${fuzzyHit.slice(0, 60)}"`)
        continue
      }

      // Persist as a proposal row.
      const { data: row, error } = await ctx.sb
        .from('proposals')
        .insert({
          archetype_id: archetypeId,
          op: 'add_risk',
          target: null,
          payload_json: parsed.payload,
          reasoning: parsed.reasoning,
          source: 'cron-passB',
          created_by: `pipeline:${ctx.runId}`,
          status: 'pending',
        })
        .select('id')
        .single()
      if (error) {
        ctx.log(`  ✗ persist: ${error.message}`)
        continue
      }
      if (row?.id) {
        created.push(row.id)
        ctx.log(`  ✓ ${row.id.slice(0, 8)}: "${parsed.payload?.risk?.title?.slice(0, 60)}"`)
      }
    }

    ctx.log(
      `✓ ${created.length} new-risk proposal${created.length === 1 ? '' : 's'} queued, ` +
        `${rejectedDuplicates} rejected as duplicates, $${cost_usd.toFixed(4)} spent`,
    )

    return {
      output: {
        proposals_created: created.length,
        items_considered: candidates.length,
        items_unmatched: unmatched.length,
        rejected_duplicates: rejectedDuplicates,
        cost_usd,
        model: msg.model,
        proposal_ids: created,
      },
      cost_usd,
    }
  },
}

// ─────────────────────────────────────────────────────────────────────────────
// Hint tokens — same vocabulary as lib/adapters/match.ts ARCHETYPE_STRONG_TOKENS
// but maintained here so this stage doesn't depend on match.ts internals.
// Kept compact: an item must contain ≥1 token to be considered for Pass B.
// ─────────────────────────────────────────────────────────────────────────────

const ARCHETYPE_HINT_TOKENS: Record<string, string[]> = {
  'offshore-wind': [
    'offshore wind', 'boem', 'wea', 'orec', 'monopile', 'wtiv', 'charybdis',
    'atlantic shores', 'empire wind', 'vineyard wind', 'south fork',
    'revolution wind', 'sunrise wind', 'coastal virginia', 'ocean wind',
    'wind lease', 'wind energy area',
  ],
  'utility-solar': [
    'photovoltaic', 'utility solar', 'ad/cvd solar', 'auxin', 'solar tariff',
    'interconnection queue', 'crystalline silicon', 'uflpa', 'forced labor',
    'feoc solar', 'section 201 solar', 'longi', 'solar cell', '48e', '45y',
    'first solar', 'jinko', 'qcells', 'solar deployment', 'solar capacity',
    'module imports', 'solar duty', 'panel manufacturer',
  ],
  'natural-gas': [
    'lng export', 'liquefied natural gas', 'cp2 lng', 'henry hub',
    'combustion turbine', 'gas pipeline', 'natural gas pipeline',
    'doe export', 'golden pass', 'rio grande lng', 'nepa categorical',
    'pjm capacity', 'mmbtu', 'spark spread',
  ],
  'onshore-wind': ['onshore wind', 'ptc wind', 'wind ptc', 'wind farm', 'gw wind'],
  'battery-storage': [
    'battery storage', 'bess', 'energy storage', 'itc storage',
    'lithium-ion', 'sodium-ion', '45x', 'ul 9540', 'long-duration storage',
    'hts 8507', 'thermal runaway', 'storage deployment', 'lfp battery',
    'megapack', 'seia storage', 'iron-air',
  ],
  'nuclear-smr': [
    'small modular reactor', 'bwrx-300', 'clinch river',
    'nuclear regulatory commission', 'construction permit', '45u', 'haleu',
    'advanced nuclear', 'russian uranium', 'part 53',
  ],
  'green-hydrogen': ['45v', 'electrolyzer', 'clean hydrogen', 'three pillars'],
  'ev-charging': [
    'nevi', 'ev charging', 'charging infrastructure', 'dcfc', 'evse',
    'baba', 'buy america', '30c', '45w', 'refueling property',
    'commercial clean vehicle', 'acc ii', 'electric vehicle credit',
    'level 3 charger',
  ],
}

function itemHintsAtArchetype(text: string, tokens: string[]): boolean {
  const lc = text.toLowerCase()
  for (const t of tokens) {
    if (lc.includes(t)) return true
  }
  return false
}

// ─────────────────────────────────────────────────────────────────────────────
// Prompting
// ─────────────────────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are Castle's senior risk analyst running Pass B — scanning for risks Castle is NOT yet tracking. Your job is to surface emerging risks visible in recent news that would matter to a project developer's IRR.

The user message contains:
  - The archetype name and Castle's existing tracked-risks list (titles + citations).
  - A batch of recent news/filing/docket items that did NOT match any tracked risk.

Use the propose_add_risk tool to propose at most 3 brand-new risks. EACH proposed risk MUST satisfy ALL of these:
  • Reference a specific mechanism — a statute (40 CFR 60), an EO, a court case, a regulator (FERC, NRC, BOEM), or a clean market dynamic.
  • Cite ≥2 of the input items as evidence in the evidence_urls field. Quote the item's URL exactly.
  • Have a defensible probability and impact_irr estimate at the scale of this archetype. Be honest about base rates; don't anchor to 0.5.
  • Have 1–3 candidate hedges. If no library contract is obvious, mark ticker "TBD" and explain in the title.
  • Be CLEARLY DISTINCT from every existing risk on the list. Read the existing titles + citations carefully — if the new proposal is just a sharper restatement of an existing risk, do NOT propose it.

Default to silence. If the input items don't reveal a coherent, recurring theme that the current watchlist misses, emit ZERO tool calls. It is better to propose nothing than to propose noise.

Calibration rules:
  • probability ∈ [0, 1] — your 18-month materialisation estimate, two decimals.
  • impact_irr ≤ 0 — IRR drag in percentage points. Be honest about magnitude.
  • impact_usd ≥ 0 — dollar impact at archetype-typical capex.
  • attention starts low (10–30) for newly-surfaced risks unless multiple high-signal items flagged it.

view paragraph format (mandatory):
  • Two-sentence headline, ≤50 words total.
  • Sentence 1 = the call (the analytical claim).
  • Sentence 2 = the move + the hedge (what to do about it).
  • Whole-number percentages, never decimals. Present tense. No hedging language.`

function buildUserPrompt(bundle: ArchetypeBundle, items: any[]): string {
  const lines: string[] = []
  lines.push(`ARCHETYPE: ${bundle.archetype.name}`)
  lines.push(`Context: ${bundle.archetype.blurb}`)
  lines.push('')
  lines.push(`Currently-tracked risks on this archetype (${bundle.risks.length}):`)
  for (const r of bundle.risks) {
    const d = bundle.risk_details[r.id]
    lines.push(`  - ${r.id}: ${r.title}`)
    lines.push(`      cite: ${r.citation}`)
    if (d?.subtitle) lines.push(`      detail: ${d.subtitle.slice(0, 200)}`)
  }
  lines.push('')
  lines.push(
    `UNMATCHED ITEMS (${items.length} items from the last 90 days that did NOT match any tracked risk but mention this archetype):`,
  )
  for (const item of items) {
    const date = String(item.published_at ?? '').slice(0, 10)
    const body = String(item.body ?? '').slice(0, 250).replace(/\s+/g, ' ')
    lines.push('')
    lines.push(`[${item.source}] ${date} — ${String(item.title ?? '').slice(0, 200)}`)
    if (body) lines.push(`  ${body}`)
    lines.push(`  url: ${item.url}`)
  }
  lines.push('')
  lines.push(
    `Use the propose_add_risk tool to propose at most 3 brand-new risks. If no coherent new theme emerges, emit ZERO tool calls.`,
  )
  return lines.join('\n')
}
