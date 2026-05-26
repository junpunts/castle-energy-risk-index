/**
 * Anthropic Tool definitions for the agent's `propose_*` actions.
 *
 * Source of truth for shapes is `lib/schemas.ts` (Zod). These JSON Schemas are
 * the same shapes hand-translated for Anthropic's tool-use API. Whenever the
 * Zod schema changes, mirror the change here too.
 *
 * Hard rule (mirror of ADMIN.md §7): the agent has NO direct-write tool.
 * Everything is a proposal. Approval is the only path to mutation.
 */

import type Anthropic from '@anthropic-ai/sdk'

export const PROPOSE_RISK_UPDATE: Anthropic.Tool = {
  name: 'propose_risk_update',
  description:
    "Propose an edit to a single field on an existing risk. Use this when new evidence justifies changing the risk's probability, attention, view paragraph, citation, etc. The admin reviews every proposal before it applies.",
  input_schema: {
    type: 'object',
    properties: {
      risk_id: {
        type: 'string',
        description: "The risk's stable id (e.g. 'ow5').",
      },
      field: {
        type: 'string',
        enum: [
          'probability',
          'impact_irr',
          'impact_usd',
          'attention',
          'likelihood',
          'category',
          'title',
          'citation',
          'subtitle',
          'view',
          'tracked_since',
          'hedge_cost',
        ],
        description: 'Which field to change.',
      },
      new_value: {
        description:
          "New value. Must match the field's type: number for probability (0–1), impact_irr (≤0), impact_usd (≥0), attention (0–100), hedge_cost (integer ≥0). String for everything else, with likelihood ∈ {low,medium,high}, category ∈ {policy,trade,operational,market}.",
      },
      reasoning: {
        type: 'string',
        description:
          '2–3 sentences explaining the change. Cite the source items that justify it. Shown to the admin and stored on the proposal.',
      },
    },
    required: ['risk_id', 'field', 'new_value', 'reasoning'],
  },
}

export const PROPOSE_NEWS_ITEM: Anthropic.Tool = {
  name: 'propose_news_item',
  description:
    "Propose pinning a news item to the archetype's or a specific risk's news feed. Use when a source item is significant enough to surface on the dashboard.",
  input_schema: {
    type: 'object',
    properties: {
      scope: {
        type: 'string',
        enum: ['archetype', 'risk'],
        description: "'archetype' pins to the top-level news[]; 'risk' pins to a risk's news[].",
      },
      risk_id: {
        type: 'string',
        description: "Required when scope='risk'.",
      },
      source: {
        type: 'string',
        description: "Outlet/agency, uppercased (e.g. 'POLITICO', 'BOEM', 'FEDERAL REGISTER').",
      },
      ago: {
        type: 'string',
        description: "Relative time as it should appear on the dashboard ('3 hr ago').",
      },
      tag: {
        type: 'string',
        enum: ['policy', 'trade', 'operational', 'market'],
      },
      title: { type: 'string', description: 'One-line headline (≤240 chars).' },
      sum: { type: 'string', description: 'Optional 1–2 sentence summary (≤400 chars).' },
      url: { type: 'string', description: 'Canonical link to the source item.' },
      published_at: { type: 'string', description: 'ISO 8601 timestamp.' },
      reasoning: {
        type: 'string',
        description: 'Why this item warrants a pin.',
      },
    },
    required: ['scope', 'source', 'ago', 'tag', 'title', 'reasoning'],
  },
}

export const PROPOSE_HEDGE_UPDATE: Anthropic.Tool = {
  name: 'propose_hedge_update',
  description:
    "Propose adding, replacing, or removing a hedge entry on a risk. Use when a contract's price moves materially, when a new relevant contract surfaces, or when a contract resolves or expires.",
  input_schema: {
    type: 'object',
    properties: {
      risk_id: { type: 'string', description: "The risk to mutate." },
      ticker: { type: 'string', description: "Contract ticker (kalshi-/poly-/library-/synthetic-)." },
      op: { type: 'string', enum: ['add', 'replace', 'remove'] },
      title: {
        type: 'string',
        description: 'Plain-English resolution question (required for add/replace).',
      },
      yes: {
        type: 'number',
        description: 'Current YES price as decimal probability (0–1). Required for add/replace.',
      },
      change: {
        type: 'number',
        description:
          'Change in YES price since last snapshot, decimal in [-1,1]. Required for add/replace.',
      },
      expiry: { type: 'string', description: "Human-readable expiry ('Dec 2026')." },
      notional: { type: 'number', description: 'Suggested sizing in dollars (≥0).' },
      reasoning: { type: 'string' },
    },
    required: ['risk_id', 'ticker', 'op', 'reasoning'],
  },
}

export const ALL_PASS_A_TOOLS: Anthropic.Tool[] = [
  PROPOSE_RISK_UPDATE,
  PROPOSE_NEWS_ITEM,
  PROPOSE_HEDGE_UPDATE,
]

// ───────────────────────────────────────────────────────────────────────────
// Tool-input → proposal-payload translation.
//
// The tool input shape (flat) is convenient for Claude; the proposal payload
// shape (nested) is what the apply path validates. This adapter lives here so
// the schema is the single source of truth in lib/schemas.ts.
// ───────────────────────────────────────────────────────────────────────────

export interface ParsedProposal {
  op: 'update_risk' | 'pin_news' | 'update_hedge'
  payload: any
  reasoning: string
  target: string | null
}

export function toolUseToProposal(toolName: string, input: any): ParsedProposal | null {
  switch (toolName) {
    case 'propose_risk_update':
      return {
        op: 'update_risk',
        target: input.risk_id,
        reasoning: input.reasoning,
        payload: {
          risk_id: input.risk_id,
          field: input.field,
          new_value: input.new_value,
        },
      }
    case 'propose_news_item':
      return {
        op: 'pin_news',
        target: input.scope === 'risk' ? input.risk_id : null,
        reasoning: input.reasoning,
        payload: {
          scope:
            input.scope === 'risk'
              ? { kind: 'risk', risk_id: input.risk_id }
              : { kind: 'archetype' },
          news_item: {
            source: input.source,
            ago: input.ago,
            tag: input.tag,
            title: input.title,
            ...(input.sum ? { sum: input.sum } : {}),
            ...(input.url ? { url: input.url } : {}),
            ...(input.published_at ? { published_at: input.published_at } : {}),
          },
        },
      }
    case 'propose_hedge_update':
      return {
        op: 'update_hedge',
        target: input.risk_id,
        reasoning: input.reasoning,
        payload: {
          risk_id: input.risk_id,
          ticker: input.ticker,
          op: input.op,
          ...(input.op !== 'remove'
            ? {
                hedge: {
                  ticker: input.ticker,
                  title: input.title,
                  yes: input.yes,
                  change: input.change,
                  expiry: input.expiry,
                  notional: input.notional,
                },
              }
            : {}),
        },
      }
    default:
      return null
  }
}
