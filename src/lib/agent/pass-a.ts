/**
 * Pass A — update one existing risk based on a packet of new evidence.
 *
 * Input: the risk's current `risk_detail`, the changes packet for it (news
 * items, hedge moves, docket events), and the research-scaffold section.
 *
 * Output: zero or more proposals via `propose_*` tool calls. Each carries a
 * `reasoning` string. Auto-apply policy is determined downstream by the
 * stage; this function just returns the structured proposals.
 */

import type Anthropic from '@anthropic-ai/sdk'
import { createMessage, DEFAULT_MODEL_SONNET } from '@/lib/llm/client'
import { priceFor } from '@/lib/llm/cost'
import { llmLimit } from '@/lib/llm/limiter'
import { ALL_PASS_A_TOOLS, toolUseToProposal, type ParsedProposal } from './tools'
import { ProposalOpSchema } from '@/lib/schemas'
import type { RiskDetail } from '@/lib/schemas'

export interface EvidencePacket {
  /** The single risk being updated. */
  risk_id: string
  /** Recent source items (NewsItem-shaped) that match this risk's keywords. */
  news: Array<{ source: string; title: string; sum?: string; published_at?: string; url?: string }>
  /** Hedge price moves on this risk's hedges that exceed the 5pp threshold. */
  hedge_moves: Array<{ ticker: string; from: number; to: number; title?: string; expiry?: string }>
  /** Optional research-scaffold paragraph for the scenario. */
  scaffold_section?: string
}

export interface PassAResult {
  proposals: ParsedProposal[]
  model: string
  cost_usd: number
  raw: Anthropic.Message
}

export async function runPassA(
  risk: RiskDetail,
  evidence: EvidencePacket,
  opts: { model?: string } = {},
): Promise<PassAResult> {
  const model = opts.model ?? DEFAULT_MODEL_SONNET

  const system = SYSTEM_PROMPT(risk)
  const user = USER_PROMPT(risk, evidence)

  const msg = await llmLimit(() =>
    createMessage({
      model,
      max_tokens: 2048,
      system,
      tools: ALL_PASS_A_TOOLS,
      messages: [{ role: 'user', content: user }],
    }),
  )

  // Extract tool_use blocks → proposals.
  const proposals: ParsedProposal[] = []
  for (const block of msg.content) {
    if (block.type !== 'tool_use') continue
    const parsed = toolUseToProposal(block.name, block.input)
    if (!parsed) continue
    // Sanity-check the payload against the Zod proposal schema. If a payload
    // is malformed, we drop it (the model wasn't grounded right) rather than
    // dispatch a bad proposal into the inbox.
    try {
      ProposalOpSchema.parse({ op: parsed.op, payload: parsed.payload })
      proposals.push(parsed)
    } catch (err) {
      console.warn(`[pass-a] dropped invalid tool_use ${block.name}:`, (err as Error).message)
    }
  }

  return {
    proposals,
    model: msg.model,
    cost_usd: priceFor(msg.model, msg.usage),
    raw: msg,
  }
}

// ───────────────────────────────────────────────────────────────────────────
// Prompt construction
// ───────────────────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = (risk: RiskDetail) => `\
You are Castle's risk analyst, maintaining the entry for one specific risk on \
the institutional risk dashboard for ${risk.archetype_name}.

Current risk:
  id: ${risk.id}
  title: ${risk.title}
  category: ${risk.category}
  citation: ${risk.citation}
  probability: ${risk.probability} (last move ${risk.probability_delta >= 0 ? '+' : ''}${(risk.probability_delta * 100).toFixed(0)}pp)
  impact_irr: ${risk.impact_irr}pp
  impact_usd: $${(risk.impact_usd / 1e6).toFixed(0)}M
  attention: ${risk.attention}/100

Castle's current view:
${risk.view}

Your job: given the new evidence below, propose any updates that the evidence \
justifies. Use the propose_* tools. Each proposal needs a reasoning string \
that cites the specific source items.

Rules:
- Be conservative. If the evidence is ambiguous, don't propose.
- Don't restate what the dashboard already shows; only flag what changed.
- For probability moves: justify direction AND magnitude. Don't move >15pp \
without an obvious catalyst.
- For view-paragraph rewrites: only propose when the existing view is now \
materially wrong or misleading. Preserve Castle voice (direct, quantified, \
sources cited inline).
- Castle voice: present tense, specific quantities, primary sources cited \
inline.
- Never propose updates to derived fields (composite, risks_total, \
attention_weekly, news_this_week).
- It's fine to return zero tool calls if the evidence doesn't justify any \
change.
`

const USER_PROMPT = (risk: RiskDetail, e: EvidencePacket) => {
  const parts: string[] = []
  parts.push(`Evidence packet for risk ${e.risk_id}:\n`)

  if (e.scaffold_section) {
    parts.push(`Scenario brief (background):\n${e.scaffold_section}\n`)
  }

  if (e.news.length > 0) {
    parts.push(`New source items (last 24h, matched to this risk):`)
    for (const n of e.news) {
      const date = n.published_at ? ` [${n.published_at.slice(0, 10)}]` : ''
      const url = n.url ? ` <${n.url}>` : ''
      parts.push(`- ${n.source}${date}: ${n.title}${url}`)
      if (n.sum) parts.push(`    ${n.sum}`)
    }
    parts.push('')
  }

  if (e.hedge_moves.length > 0) {
    parts.push(`Hedge price moves (>5pp):`)
    for (const h of e.hedge_moves) {
      const dir = h.to > h.from ? '↑' : '↓'
      parts.push(
        `- ${h.ticker}${h.title ? ` (${h.title})` : ''}: ${(h.from * 100).toFixed(0)}¢ → ${(h.to * 100).toFixed(0)}¢ ${dir}`,
      )
    }
    parts.push('')
  }

  if (e.news.length === 0 && e.hedge_moves.length === 0) {
    parts.push('No new evidence in this packet. You should not propose anything.')
  } else {
    parts.push(
      `Propose any updates the evidence above justifies. Use propose_risk_update, propose_news_item, and/or propose_hedge_update. Return ZERO tool calls if no update is warranted.`,
    )
  }

  return parts.join('\n')
}
