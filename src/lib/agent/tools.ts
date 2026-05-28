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
          "New value. Must match the field's type: number for probability (0–1), impact_irr (≤0), impact_usd (≥0), attention (0–100), hedge_cost (integer ≥0). String for everything else, with likelihood ∈ {low,medium,high}, category ∈ {policy,trade,operational,market}. For field='view', write a TWO-SENTENCE HEADLINE (≤50 words): sentence 1 = the call, sentence 2 = the move + the hedge; whole-number percentages never decimals; never restate the numbers shown above the view.",
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

/**
 * Pass B tool — propose a brand-new risk on the archetype's watchlist.
 *
 * Used by the surface_new_risks stage. The agent emits one tool_use per
 * proposed risk. The apply path (lib/archetypes/apply.ts:applyAddRisk)
 * auto-assigns the id (e.g. "ow10") from the archetype's existing prefix,
 * so the agent does NOT supply one.
 */
export const PROPOSE_ADD_RISK: Anthropic.Tool = {
  name: 'propose_add_risk',
  description:
    "Propose a brand-new risk to add to the archetype's tracked watchlist. Use this when recent evidence reveals a coherent risk theme NOT already covered by an existing risk on this archetype. Be conservative: only propose when (a) ≥2 source items independently flag the same mechanism, (b) the risk has a citable statute / regulation / market dynamic, and (c) no existing risk on the archetype covers it.",
  input_schema: {
    type: 'object',
    properties: {
      category: {
        type: 'string',
        enum: ['policy', 'trade', 'operational', 'market'],
        description: 'Risk taxonomy bucket.',
      },
      title: {
        type: 'string',
        description: 'Risk title (≤80 chars). Specific, citation-style. E.g. "EPA combustion-turbine NSPS tightening".',
      },
      citation: {
        type: 'string',
        description: 'Primary citation — statute, EO, docket, court case, market dynamic. E.g. "40 CFR 60 Subpart TTTTa".',
      },
      subtitle: {
        type: 'string',
        description: 'One-sentence elaboration shown under the title (≤400 chars).',
      },
      view: {
        type: 'string',
        description: "Castle's view — TWO-SENTENCE HEADLINE (≤50 words): sentence 1 = the call, sentence 2 = the move + the hedge. Whole-number percentages, never decimals. Never restate the dashboard's numbers.",
      },
      probability: {
        type: 'number',
        description: '18-month materialisation probability ∈ [0,1], two decimals.',
      },
      impact_irr: {
        type: 'number',
        description: 'IRR impact in percentage points. Must be ≤ 0 (downside drag). E.g. -1.5 for a 150bp drag.',
      },
      impact_usd: {
        type: 'number',
        description: 'Dollar impact at archetype-typical capex. Must be ≥ 0. E.g. 75000000 for $75M.',
      },
      attention: {
        type: 'integer',
        description: '0–100 attention score at proposal time. New risks usually start low (10–30) unless multiple high-signal items flagged it.',
      },
      likelihood: {
        type: 'string',
        enum: ['low', 'medium', 'high'],
      },
      headline_change: {
        type: 'string',
        description: 'Signed integer string for attention delta vs last week ("+0" for a new risk).',
      },
      driver: {
        type: 'string',
        enum: ['cost', 'delay', 'revenue'],
        description: 'Economic driver for variable-scenario reprojection.',
      },
      status: {
        type: 'string',
        enum: ['active', 'realized'],
        description: "Default 'active'. Use 'realized' only when the underlying policy change has already occurred (rare for new proposals).",
      },
      candidate_hedges: {
        type: 'array',
        description: '1–3 candidate hedges. Mark ticker as "TBD" if no library contract is obvious.',
        items: {
          type: 'object',
          properties: {
            ticker: { type: 'string' },
            title: { type: 'string' },
            yes: { type: 'number' },
            change: { type: 'number' },
            expiry: { type: 'string' },
            notional: { type: 'number' },
          },
          required: ['ticker', 'title'],
        },
      },
      evidence_urls: {
        type: 'array',
        items: { type: 'string' },
        description: '2+ URLs from the input items that justify this risk.',
      },
      reasoning: {
        type: 'string',
        description: '3–5 sentences explaining WHY this is a new risk Castle should track. Cite the specific source items. Shown to the admin and stored on the proposal.',
      },
    },
    required: [
      'category', 'title', 'citation', 'subtitle', 'view', 'probability',
      'impact_irr', 'impact_usd', 'likelihood', 'headline_change',
      'evidence_urls', 'reasoning',
    ],
  },
}

export const ALL_PASS_A_TOOLS: Anthropic.Tool[] = [
  PROPOSE_RISK_UPDATE,
  PROPOSE_NEWS_ITEM,
  PROPOSE_HEDGE_UPDATE,
]

export const ALL_PASS_B_TOOLS: Anthropic.Tool[] = [PROPOSE_ADD_RISK]

// ───────────────────────────────────────────────────────────────────────────
// Tool-input → proposal-payload translation.
//
// The tool input shape (flat) is convenient for Claude; the proposal payload
// shape (nested) is what the apply path validates. This adapter lives here so
// the schema is the single source of truth in lib/schemas.ts.
// ───────────────────────────────────────────────────────────────────────────

export interface ParsedProposal {
  op: 'update_risk' | 'add_risk' | 'pin_news' | 'update_hedge'
  payload: any
  reasoning: string
  target: string | null
}

export function toolUseToProposal(toolName: string, input: any): ParsedProposal | null {
  switch (toolName) {
    case 'propose_add_risk': {
      const hedges = Array.isArray(input.candidate_hedges)
        ? input.candidate_hedges
            .filter((h: any) => h && typeof h.ticker === 'string' && typeof h.title === 'string')
            .map((h: any) => ({
              ticker: h.ticker,
              title: h.title,
              yes: typeof h.yes === 'number' ? h.yes : 0.5,
              change: typeof h.change === 'number' ? h.change : 0,
              expiry: typeof h.expiry === 'string' ? h.expiry : 'TBD',
              notional: typeof h.notional === 'number' ? Math.round(h.notional) : 0,
            }))
        : []
      // Risk payload validates against RiskSchema.partial({id:true}) — fields below
      // mirror that schema.
      const today = new Date().toISOString().slice(0, 10)
      return {
        op: 'add_risk',
        target: null,
        reasoning: input.reasoning ?? '',
        payload: {
          risk: {
            category: input.category,
            title: input.title,
            citation: input.citation,
            impact_irr: input.impact_irr ?? 0,
            impact_usd: input.impact_usd ?? 0,
            probability: input.probability ?? 0.5,
            attention: input.attention ?? 20,
            likelihood: input.likelihood ?? 'medium',
            headline_change: input.headline_change ?? '+0',
            status: input.status ?? 'active',
            ...(input.driver ? { driver: input.driver } : {}),
          },
          risk_detail: {
            subtitle: input.subtitle ?? '',
            view: input.view ?? '',
            tracked_since: today,
            hedges:
              hedges.length > 0
                ? hedges
                : [
                    {
                      ticker: 'TBD',
                      title: 'No hedge identified yet — analyst to map a contract from the library.',
                      yes: 0.5,
                      change: 0,
                      expiry: 'TBD',
                      notional: 0,
                    },
                  ],
            news: Array.isArray(input.evidence_urls)
              ? input.evidence_urls.slice(0, 5).map((url: string) => ({
                  source: prettifyUrlSource(url),
                  ago: 'recently',
                  tag: input.category ?? 'policy',
                  title: 'Evidence linked to Pass B proposal',
                  url,
                }))
              : [],
            events: [
              {
                date: today,
                when: 'today',
                kind: 'castle',
                future: false,
                now: true,
                title: 'Risk surfaced by Pass B',
                detail: 'Castle identified this risk from recent unmatched news evidence.',
              },
            ],
          },
        },
      }
    }
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

function prettifyUrlSource(url: string): string {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '')
    // Map known hosts to canonical source labels for consistency with the rest
    // of the dashboard.
    const map: Record<string, string> = {
      'federalregister.gov': 'FEDERAL REGISTER',
      'sec.gov': 'SEC',
      'data.sec.gov': 'SEC',
      'courtlistener.com': 'COURTLISTENER',
      'fool.com': 'MOTLEY FOOL',
      'reutersagency.com': 'REUTERS',
      'reuters.com': 'REUTERS',
      'politico.com': 'POLITICO',
      'heatmap.news': 'HEATMAP',
      'energy.gov': 'DOE',
      'epa.gov': 'EPA',
      'nrc.gov': 'NRC',
      'boem.gov': 'BOEM',
    }
    return map[host] ?? host.split('.').slice(0, -1).join('.').toUpperCase()
  } catch {
    return 'SOURCE'
  }
}
