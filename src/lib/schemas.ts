/**
 * Castle Energy Risk Index — runtime + type-level schemas.
 *
 * Single source of truth for every cross-boundary data shape:
 *   - reading rows from Supabase (`archetypes.state` jsonb, `proposals.payload_json`, …)
 *   - validating LLM tool-call payloads
 *   - validating admin API request bodies
 *
 * Every other file consumes types from here via `z.infer<typeof X>`.
 * Never define a shape twice.
 *
 * Conventions:
 *   - Schemas suffixed `Schema`; inferred types are bare names (Risk, NewsItem, …).
 *   - All enums are `z.enum([...])` for cheap literal-union TS types.
 *   - String IDs are `z.string().min(1)` — never empty.
 *   - `passthrough()` is reserved for unknown forward-compat fields; current
 *     shapes are strict so a drift surfaces immediately.
 */

import { z } from 'zod'

// ─── Primitive enums ──────────────────────────────────────────────────────

export const CategorySchema = z.enum(['policy', 'trade', 'operational', 'market'])
export type Category = z.infer<typeof CategorySchema>

export const LikelihoodSchema = z.enum(['low', 'medium', 'high'])
export type Likelihood = z.infer<typeof LikelihoodSchema>

export const EventKindSchema = z.enum([
  'deadline',
  'hearing',
  'market',
  'filing',
  'castle',
  'now',
])
export type EventKind = z.infer<typeof EventKindSchema>

// News `source` is open-ended (every outlet/agency that ever appears).
// We don't enum it — but we do require uppercase by convention.
const SourceSchema = z.string().min(1).max(40)

// ─── Typical project profile ──────────────────────────────────────────────

export const TypicalProjectSchema = z.object({
  capacity: z.string().min(1),
  /** Total project capex in USD. */
  capex: z.number().positive(),
  /** Per-GW reference. Null if the archetype isn't measured in GW (EV charging, etc.). */
  capex_per_gw: z.number().positive().nullable(),
  /** Target equity IRR as a decimal (0.08 = 8%). */
  target_irr: z.number().min(0).max(1),
  /** Expected months from FID to COD. */
  cod_months: z.number().int().positive(),
  /** Reference PPA price $/MWh, or null if not PPA-based. */
  ppa_price: z.number().nullable(),
})
export type TypicalProject = z.infer<typeof TypicalProjectSchema>

// ─── Archetype meta (the top of the bundle, shown on the grid) ────────────

export const ArchetypeMetaSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  /** Subtitle on the archetype card ("Fixed-bottom · OREC"). */
  eyebrow: z.string().min(1),
  /** 1–2 sentence description. */
  blurb: z.string().min(1),
  typical: TypicalProjectSchema,

  // Derived fields — computed by lib/archetypes/derive.ts on every apply.
  // Never edit these directly; they live here because they're cached on read.
  composite: z.number().int().min(0).max(100),
  composite_delta: z.number().int(),
  risks_total: z.number().int().nonnegative(),
  risks_high: z.number().int().nonnegative(),
  news_this_week: z.number().int().nonnegative(),
  /** 12-week attention sparkline, oldest first. */
  attention_weekly: z.array(z.number().int().min(0).max(100)).length(12),
})
export type ArchetypeMeta = z.infer<typeof ArchetypeMetaSchema>

// ─── Risk (one row on the archetype page) ─────────────────────────────────

export const RiskSchema = z.object({
  /** Stable identifier ("ow1"). Never reused. */
  id: z.string().regex(/^[a-z]{2,}\d+$/, 'risk id must look like "ow1"'),
  category: CategorySchema,
  title: z.string().min(1).max(80),
  citation: z.string().min(1),
  /** IRR impact in percentage points (negative). */
  impact_irr: z.number().nonpositive(),
  /** Dollar impact at archetype-typical capex. */
  impact_usd: z.number().nonnegative(),
  /** 18-month materialization probability, decimal 0–1. */
  probability: z.number().min(0).max(1),
  /** 0–100 Castle composite attention score. */
  attention: z.number().int().min(0).max(100),
  likelihood: LikelihoodSchema,
  /** Attention delta vs last week, signed string ("+32", "-4", "0"). */
  headline_change: z.string().regex(/^[+-]?\d+$/),
  /** Economic driver for variable-scenario reprojection (M11). Optional for
   *  backward-compat; absent → treated as 'cost' by the projection engine.
   *    cost    — dollar shock, scales with capex (tariffs, duties, credit loss)
   *    delay   — schedule slip, scales with COD × cost-of-capital (permitting, queue)
   *    revenue — output value at risk, scales with capacity × PPA (curtailment, offtake) */
  driver: z.enum(['cost', 'delay', 'revenue']).optional(),
  /** True if the risk is genuinely two-sided (can help as well as hurt — e.g. a
   *  gas generator benefits from a Henry Hub spike). v1 still models it as
   *  downside drag, but the flag lets the UI footnote it / a future signed model
   *  render it as ±. */
  two_sided: z.boolean().optional(),
})
export type Risk = z.infer<typeof RiskSchema>

// ─── News item ────────────────────────────────────────────────────────────

export const NewsItemSchema = z.object({
  source: SourceSchema,
  /** Human-readable relative time. Recomputed daily. */
  ago: z.string().min(1).max(40),
  tag: CategorySchema,
  title: z.string().min(1).max(240),
  /** Optional summary on the archetype page. */
  sum: z.string().max(400).optional(),
  /** Canonical timestamp (added once we have real adapter feeds). */
  published_at: z.string().datetime().optional(),
  /** Canonical link (added once we have real adapter feeds). */
  url: z.string().url().optional(),
})
export type NewsItem = z.infer<typeof NewsItemSchema>

// ─── Timeline event ───────────────────────────────────────────────────────

export const TimelineEventSchema = z.object({
  /** ISO date "YYYY-MM-DD". */
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  /** Human-readable delta ("+125d", "today", "4d ago"). Recomputed daily. */
  when: z.string().min(1).max(20),
  kind: EventKindSchema,
  future: z.boolean(),
  /** Optional flag; exactly one event per detail should have now=true. */
  now: z.boolean().optional(),
  title: z.string().min(1).max(160),
  detail: z.string().min(1).max(600),
})
export type TimelineEvent = z.infer<typeof TimelineEventSchema>

// ─── Hedge (one row of mapped hedges on a risk detail page) ───────────────

/**
 * Tickers we accept:
 *   - kalshi tickers       e.g. "KX48ETAXCREDIT-26MAY", "kalshi-KX..."
 *   - polymarket ids       e.g. "poly-1516727"
 *   - library entries      e.g. "library-ef7635e4-…"
 *   - synthetic contracts  e.g. "synthetic-doi-order-offshore-wind-delay"
 *
 * Permissive on purpose — the universe is large. The matching against the
 * scraper / library tables happens at apply-time, not parse-time.
 */
const HedgeTickerSchema = z.string().min(3).max(128)

export const HedgeSchema = z.object({
  ticker: HedgeTickerSchema,
  /** Plain-English contract resolution question. */
  title: z.string().min(1).max(300),
  /** Current YES price as a decimal probability. */
  yes: z.number().min(0).max(1),
  /** Change in YES price since last snapshot. Signed decimal. */
  change: z.number().min(-1).max(1),
  /** Human-readable expiry ("Dec 2026"). The canonical date lives on the
   *  contract row in Supabase; this is just for display. */
  expiry: z.string().min(1).max(20),
  /** Suggested sizing in dollars. */
  notional: z.number().int().nonnegative(),
})
export type Hedge = z.infer<typeof HedgeSchema>

// ─── Risk detail (the deep-dive page) ─────────────────────────────────────

export const RiskDetailSchema = z.object({
  archetype_id: z.string().min(1),
  archetype_name: z.string().min(1),
  id: z.string().min(1),
  category: CategorySchema,
  title: z.string().min(1),
  /** One-sentence elaboration shown under the title. */
  subtitle: z.string().min(1).max(400),
  citation: z.string().min(1),
  /** Display date, "Jan 22, 2025". */
  tracked_since: z.string().min(1),
  /** Recomputed on every apply ("3 hours ago"). */
  last_updated: z.string().min(1),

  // Headline stats
  attention: z.number().int().min(0).max(100),
  attention_delta: z.number().int(),
  probability: z.number().min(0).max(1),
  probability_delta: z.number().min(-1).max(1),
  impact_irr: z.number().nonpositive(),
  impact_usd: z.number().nonnegative(),
  /** Suggested hedge cost for sizing the CTA ("Hedge $4K"). */
  hedge_cost: z.number().int().nonnegative(),

  /** Castle's view — 200–500 word Castle-voice paragraph. */
  view: z.string().min(1),
  /** 12-week attention sparkline. */
  weekly: z.array(z.number().int().min(0).max(100)).length(12),

  events: z.array(TimelineEventSchema).min(1),
  news: z.array(NewsItemSchema),
  hedges: z.array(HedgeSchema).min(1),
})
export type RiskDetail = z.infer<typeof RiskDetailSchema>

// ─── Archetype bundle (the whole `archetypes.state` jsonb) ────────────────

export const ArchetypeBundleSchema = z.object({
  schema_version: z.literal('1.0.0'),
  archetype_id: z.string().min(1),
  generated_at: z.string().datetime({ offset: true }),
  generated_by: z.string().min(1),
  /** Date the bundle's data is current to, "YYYY-MM-DD". */
  as_of: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  horizon: z.string().min(1),

  archetype: ArchetypeMetaSchema,
  risks: z.array(RiskSchema).min(1),
  news: z.array(NewsItemSchema),
  /** One risk_detail per risk in `risks`, keyed by risk id. */
  risk_details: z.record(z.string(), RiskDetailSchema),

  sources: z
    .object({
      research_scaffold: z.string().optional(),
      critical_contracts: z.string().optional(),
      hedges_universe: z.string().optional(),
    })
    .partial(),
})
export type ArchetypeBundle = z.infer<typeof ArchetypeBundleSchema>

/**
 * Cross-field invariants the Zod object schema can't easily express.
 * Run after `parse()` succeeds. Returns the bundle on success or throws.
 */
export function validateBundleInvariants(b: ArchetypeBundle): ArchetypeBundle {
  // Every risk has a matching risk_detail.
  for (const r of b.risks) {
    if (!b.risk_details[r.id]) {
      throw new Error(`risk ${r.id} has no risk_detail`)
    }
  }
  // No orphan risk_details.
  const riskIds = new Set(b.risks.map((r) => r.id))
  for (const id of Object.keys(b.risk_details)) {
    if (!riskIds.has(id)) {
      throw new Error(`risk_detail ${id} has no matching risk entry`)
    }
  }
  // archetype.id matches archetype_id.
  if (b.archetype.id !== b.archetype_id) {
    throw new Error(`archetype.id mismatch (${b.archetype.id} vs ${b.archetype_id})`)
  }
  // risks_total reflects array length.
  if (b.archetype.risks_total !== b.risks.length) {
    throw new Error(
      `archetype.risks_total=${b.archetype.risks_total} but risks.length=${b.risks.length}`
    )
  }
  // risks_high reflects count of likelihood=high.
  const highCount = b.risks.filter((r) => r.likelihood === 'high').length
  if (b.archetype.risks_high !== highCount) {
    throw new Error(
      `archetype.risks_high=${b.archetype.risks_high} but counted ${highCount}`
    )
  }
  // Exactly one event per risk_detail should be marked `now: true` (or zero
  // if the risk is wholly historical — we allow it but warn at the caller).
  for (const rd of Object.values(b.risk_details)) {
    const nowCount = rd.events.filter((e) => e.now).length
    if (nowCount > 1) {
      throw new Error(`risk_detail ${rd.id} has ${nowCount} events flagged now=true`)
    }
  }
  return b
}

/** Parse and run invariants in one shot. Throws on any failure. */
export function parseArchetypeBundle(raw: unknown): ArchetypeBundle {
  return validateBundleInvariants(ArchetypeBundleSchema.parse(raw))
}

// ─── Proposal payloads — the apply-changes contract ──────────────────────

/**
 * Every state-mutating action flows through a Proposal. The `op` discriminator
 * selects the payload shape. apply-changes parses the payload with the right
 * schema before touching the bundle.
 */

const RiskFieldSchema = z.enum([
  'probability',
  'impact_irr',
  'impact_usd',
  'attention',
  'likelihood',
  'title',
  'citation',
  'category',
  'subtitle',
  'view',
  'tracked_since', // technically immutable but allow correction proposals
  'hedge_cost',
])
export type RiskField = z.infer<typeof RiskFieldSchema>

export const UpdateRiskPayloadSchema = z.object({
  risk_id: z.string().min(1),
  field: RiskFieldSchema,
  /** Always a JSON value — caller stringifies non-strings. */
  new_value: z.union([z.string(), z.number(), z.boolean(), z.null()]),
})
export type UpdateRiskPayload = z.infer<typeof UpdateRiskPayloadSchema>

export const AddRiskPayloadSchema = z.object({
  /** Optional: agent can suggest an id, but admin assigns the final one. */
  suggested_id: z.string().optional(),
  risk: RiskSchema.partial({ id: true }),
  risk_detail: RiskDetailSchema.partial({ id: true }),
})
export type AddRiskPayload = z.infer<typeof AddRiskPayloadSchema>

export const RemoveRiskPayloadSchema = z.object({
  risk_id: z.string().min(1),
  /** Soft-delete: keeps the id and history, hides from public dashboard. */
  status: z.literal('retired').default('retired'),
})
export type RemoveRiskPayload = z.infer<typeof RemoveRiskPayloadSchema>

export const PinNewsPayloadSchema = z.object({
  scope: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('archetype') }),
    z.object({ kind: z.literal('risk'), risk_id: z.string().min(1) }),
  ]),
  news_item: NewsItemSchema,
})
export type PinNewsPayload = z.infer<typeof PinNewsPayloadSchema>

export const UpdateHedgePayloadSchema = z.object({
  risk_id: z.string().min(1),
  /** Match the hedge by ticker. */
  ticker: z.string().min(1),
  op: z.enum(['add', 'replace', 'remove']),
  /** Required for add/replace; omitted for remove. */
  hedge: HedgeSchema.optional(),
})
export type UpdateHedgePayload = z.infer<typeof UpdateHedgePayloadSchema>

/** Discriminated union of every proposal op + its validated payload. */
export const ProposalOpSchema = z.discriminatedUnion('op', [
  z.object({ op: z.literal('update_risk'), payload: UpdateRiskPayloadSchema }),
  z.object({ op: z.literal('add_risk'), payload: AddRiskPayloadSchema }),
  z.object({ op: z.literal('remove_risk'), payload: RemoveRiskPayloadSchema }),
  z.object({ op: z.literal('pin_news'), payload: PinNewsPayloadSchema }),
  z.object({ op: z.literal('update_hedge'), payload: UpdateHedgePayloadSchema }),
])
export type ProposalOp = z.infer<typeof ProposalOpSchema>

// ─── Proposal row (matches the `proposals` table) ─────────────────────────

export const ProposalStatusSchema = z.enum([
  'pending',
  'applied',
  'rejected',
  'superseded',
])
export type ProposalStatus = z.infer<typeof ProposalStatusSchema>

export const ProposalSourceSchema = z.enum([
  'cron-passA',
  'cron-passB',
  'copilot',
  'manual',
  'news-monitor',
])
export type ProposalSource = z.infer<typeof ProposalSourceSchema>

export const ProposalSchema = z.object({
  id: z.string().uuid(),
  archetype_id: z.string().min(1),
  op: z.enum(['update_risk', 'add_risk', 'remove_risk', 'pin_news', 'update_hedge']),
  target: z.string().nullable(),
  payload_json: z.unknown(), // parsed with ProposalOpSchema downstream
  reasoning: z.string().min(1),
  source: ProposalSourceSchema,
  created_by: z.string().min(1),
  created_at: z.string().datetime(),
  status: ProposalStatusSchema,
  applied_at: z.string().datetime().nullable(),
  applied_revision_id: z.number().int().nullable(),
})
export type Proposal = z.infer<typeof ProposalSchema>

// ─── Pipeline rows ────────────────────────────────────────────────────────

export const PipelineRunStatusSchema = z.enum([
  'queued',
  'claimed',
  'running',
  'completed',
  'failed',
  'aborted',
])
export type PipelineRunStatus = z.infer<typeof PipelineRunStatusSchema>

export const PipelineRunSchema = z.object({
  id: z.string().uuid(),
  pipeline_name: z.string().min(1),
  archetype_id: z.string().nullable(),
  status: PipelineRunStatusSchema,
  started_at: z.string().datetime(),
  completed_at: z.string().datetime().nullable(),
  current_stage: z.string().nullable(),
  error_message: z.string().nullable(),
  cost_usd: z.number().nonnegative(),
  triggered_by: z.string().min(1),
  claimed_by: z.string().nullable(),
  claimed_at: z.string().datetime().nullable(),
  abort_requested: z.boolean(),
})
export type PipelineRun = z.infer<typeof PipelineRunSchema>

export const PipelineTraceSchema = z.object({
  id: z.number().int(),
  pipeline_run_id: z.string().uuid(),
  stage_name: z.string().min(1),
  started_at: z.string().datetime(),
  completed_at: z.string().datetime().nullable(),
  duration_ms: z.number().int().nullable(),
  input_json: z.unknown().nullable(),
  output_json: z.unknown().nullable(),
  error: z.string().nullable(),
  cost_usd: z.number().nonnegative(),
})
export type PipelineTrace = z.infer<typeof PipelineTraceSchema>

// ─── Copilot ──────────────────────────────────────────────────────────────

export const CopilotMessageRoleSchema = z.enum([
  'user',
  'assistant',
  'tool_call',
  'tool_result',
])
export type CopilotMessageRole = z.infer<typeof CopilotMessageRoleSchema>

export const CopilotMessageSchema = z.object({
  id: z.number().int(),
  session_id: z.string().uuid(),
  role: CopilotMessageRoleSchema,
  content_json: z.unknown(),
  cost_usd: z.number().nonnegative(),
  created_at: z.string().datetime(),
})
export type CopilotMessage = z.infer<typeof CopilotMessageSchema>

// ─── Research scaffold (archetype_research table) ─────────────────────────

export const ArchetypeResearchSchema = z.object({
  archetype_id: z.string().min(1),
  scaffold_md: z.string().min(1),
  contracts_library: z.array(z.unknown()), // shape locked when SYNTHETICS.md lands
  notes_md: z.string().nullable(),
  updated_at: z.string().datetime(),
})
export type ArchetypeResearch = z.infer<typeof ArchetypeResearchSchema>
