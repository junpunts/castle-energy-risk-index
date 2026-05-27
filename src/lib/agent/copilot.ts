/**
 * Admin Copilot — conversational archetype editing.
 *
 * Unlike Pass A (which reacts to a single risk's evidence packet autonomously),
 * the copilot is interactive: the admin types an instruction in plain English
 * ("bump ns1 to 0.78", "add a HALEU pricing risk", "what changed on solar this
 * week?"), and the agent either answers or drafts proposals via the SAME
 * propose_* tools Pass A uses.
 *
 * Hard rule (mirror of ADMIN.md §7): the copilot has NO direct-write tool.
 * Everything it changes is a proposal that lands in the review queue with
 * source='copilot'. Approval is the only path to mutation. This keeps the
 * copilot safe-by-construction — it can READ the full archetype state, but it
 * can only ever PROPOSE.
 *
 * The agent runs a bounded tool loop: it may call propose_* tools and we feed
 * back synthetic tool_results ("queued for review") so it can propose several
 * edits in one turn and then summarise. We cap iterations to keep cost bounded.
 */

import type Anthropic from '@anthropic-ai/sdk'
import { createMessage, DEFAULT_MODEL_SONNET } from '@/lib/llm/client'
import { priceFor } from '@/lib/llm/cost'
import { llmLimit } from '@/lib/llm/limiter'
import { ALL_PASS_A_TOOLS, toolUseToProposal, type ParsedProposal } from './tools'
import { ProposalOpSchema, type ArchetypeBundle } from '@/lib/schemas'

const MAX_ITERATIONS = 5

export interface CopilotTurnInput {
  /** The archetype the conversation is scoped to. */
  bundle: ArchetypeBundle
  /** Prior conversation turns (user/assistant text only). */
  history: Array<{ role: 'user' | 'assistant'; text: string }>
  /** The admin's new message. */
  message: string
  model?: string
}

export interface CopilotTurnResult {
  /** The assistant's natural-language reply to show in the chat. */
  reply: string
  /** Proposals the agent drafted this turn (already schema-validated). */
  proposals: ParsedProposal[]
  model: string
  cost_usd: number
}

export async function runCopilotTurn(input: CopilotTurnInput): Promise<CopilotTurnResult> {
  const model = input.model ?? DEFAULT_MODEL_SONNET
  const system = SYSTEM_PROMPT(input.bundle)

  // Seed the conversation with prior turns, then the new message.
  const messages: Anthropic.MessageParam[] = []
  for (const t of input.history) {
    messages.push({ role: t.role, content: t.text })
  }
  messages.push({ role: 'user', content: input.message })

  const proposals: ParsedProposal[] = []
  const replyParts: string[] = []
  let totalCost = 0
  let finalModel = model

  for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
    const msg = await llmLimit(() =>
      createMessage({
        model,
        max_tokens: 2048,
        system,
        tools: ALL_PASS_A_TOOLS,
        messages,
      }),
    )
    totalCost += priceFor(msg.model, msg.usage)
    finalModel = msg.model

    // Collect any text the model emitted this step.
    const textBlocks = msg.content.filter((b): b is Anthropic.TextBlock => b.type === 'text')
    for (const b of textBlocks) if (b.text.trim()) replyParts.push(b.text.trim())

    const toolUses = msg.content.filter(
      (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use',
    )

    // No tools this step → the model is done talking.
    if (toolUses.length === 0) break

    // Record the assistant turn (with tool_use blocks) so we can append results.
    messages.push({ role: 'assistant', content: msg.content })

    // Translate each tool_use into a proposal, validate, and feed back a result.
    const toolResults: Anthropic.ToolResultBlockParam[] = []
    for (const tu of toolUses) {
      const parsed = toolUseToProposal(tu.name, tu.input)
      let resultText: string
      if (!parsed) {
        resultText = `error: unknown tool ${tu.name}`
      } else {
        try {
          ProposalOpSchema.parse({ op: parsed.op, payload: parsed.payload })
          proposals.push(parsed)
          resultText = `queued for review: ${parsed.op}${parsed.target ? ` on ${parsed.target}` : ''}. The admin will approve or reject it.`
        } catch (err) {
          resultText = `rejected — payload invalid: ${(err as Error).message}. Do not retry unless you can fix the values.`
        }
      }
      toolResults.push({
        type: 'tool_result',
        tool_use_id: tu.id,
        content: resultText,
      })
    }
    messages.push({ role: 'user', content: toolResults })
    // Loop: let the model acknowledge / propose more / summarise.
  }

  let reply = replyParts.join('\n\n').trim()
  if (!reply) {
    reply =
      proposals.length > 0
        ? `Drafted ${proposals.length} proposal${proposals.length === 1 ? '' : 's'} for your review.`
        : 'No change proposed.'
  }

  return { reply, proposals, model: finalModel, cost_usd: totalCost }
}

// ───────────────────────────────────────────────────────────────────────────
// Prompt
// ───────────────────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = (b: ArchetypeBundle) => {
  const riskLines = b.risks
    .map((r) => {
      const d = b.risk_details[r.id]
      const hedges = d?.hedges?.length ?? 0
      return `  ${r.id} [${r.category}] "${r.title}" — prob ${r.probability}, impact_irr ${r.impact_irr}pp, attention ${r.attention}/100, ${hedges} hedge${hedges === 1 ? '' : 's'}`
    })
    .join('\n')

  return `\
You are Castle's Risk Index Copilot — an interactive analyst helping an admin maintain the institutional risk dashboard for "${b.archetype.name}".

You are talking directly to the admin. You can do two things:
  1. ANSWER questions about the current state (you have the full snapshot below).
  2. PROPOSE edits via the propose_* tools when the admin asks for a change.

CRITICAL RULE: You have NO ability to write directly. Every propose_* tool call
creates a PROPOSAL that lands in the admin's review queue. Nothing changes until
the admin clicks Approve. So when the admin says "change X", you draft the
proposal — you do not claim it's done. Say "I've drafted that for your review"
not "I've updated it".

Current snapshot of ${b.archetype.name} (archetype_id: ${b.archetype_id}):
  composite: ${b.archetype.composite}/100
  target IRR: ${(b.archetype.typical.target_irr * 100).toFixed(1)}%
  risks (${b.risks.length}):
${riskLines}

How to behave:
- When the instruction is clear and specific ("set ns1 probability to 0.78"),
  draft the proposal immediately with a one-line reasoning, then confirm in
  prose what you drafted and that it's pending review.
- When the instruction is ambiguous ("nuclear feels too low"), ask ONE clarifying
  question OR state your assumption and draft a reasonable proposal — don't stall.
- When asked a question ("what's the biggest risk?"), just answer from the
  snapshot. Don't propose anything.
- You may draft MULTIPLE proposals in one turn if the admin asks for several
  changes.
- Respect the field rules: probability ∈ [0,1], impact_irr ≤ 0, impact_usd ≥ 0,
  attention 0–100 integer, likelihood ∈ {low,medium,high}, category ∈
  {policy,trade,operational,market}. Never touch derived fields (composite,
  risks_total, attention_weekly).
- Castle voice for any view/title/citation text: present tense, specific
  quantities, primary sources cited inline.
- Be concise. You're a tool for a power user, not a chatbot.`
}
