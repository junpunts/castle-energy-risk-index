// Realistic seed data for the archetype product mocks.
// 6 generic project types, each with a slate of risks, news, charts.

export const ARCHETYPES = [
  {
    id: 'utility-solar',
    name: 'Utility-scale Solar',
    eyebrow: 'Photovoltaic · Tracker',
    blurb: 'A typical 500 MW single-axis-tracker PV plant in a sun-rich market, anchored by a 10–15-year corporate PPA.',
    typical: {
      capacity: '500 MW',
      capex_per_gw: 1.2e9, capex: 600e6,
      target_irr: 0.085,
      cod_months: 24,
      ppa_price: 34,
    },
    composite: 54,
    composite_delta: -2,
    risks_total: 8,
    risks_high: 3,
    news_this_week: 14,
    attention_weekly: [22, 18, 34, 41, 28, 52, 47, 63, 58, 71, 88, 100],
  },
  {
    id: 'onshore-wind',
    name: 'Onshore Wind',
    eyebrow: 'Land-based · Repowering',
    blurb: 'A 300 MW onshore wind farm in the central US wind corridor, mix of GE/Vestas turbines, PTC-anchored.',
    typical: {
      capacity: '300 MW',
      capex_per_gw: 1.45e9, capex: 435e6,
      target_irr: 0.09,
      cod_months: 18,
      ppa_price: 28,
    },
    composite: 41,
    composite_delta: 0,
    risks_total: 7,
    risks_high: 2,
    news_this_week: 8,
    attention_weekly: [38, 42, 35, 48, 41, 39, 52, 44, 47, 51, 49, 53],
  },
  {
    id: 'offshore-wind',
    name: 'Offshore Wind',
    eyebrow: 'Fixed-bottom · OREC',
    blurb: 'An 800 MW fixed-bottom offshore wind project on a BOEM lease, 14 MW turbines, monopile foundations.',
    typical: {
      capacity: '800 MW',
      capex_per_gw: 4.5e9, capex: 3.6e9,
      target_irr: 0.08,
      cod_months: 36,
      ppa_price: 96,
    },
    composite: 67,
    composite_delta: 4,
    risks_total: 9,
    risks_high: 5,
    news_this_week: 22,
    attention_weekly: [45, 52, 48, 61, 58, 72, 68, 81, 85, 92, 96, 100],
  },
  {
    id: 'battery-storage',
    name: 'Battery Storage',
    eyebrow: 'Li-ion BESS · LFP',
    blurb: 'A 250 MW / 1 GWh standalone LFP battery system contracted for resource-adequacy in CAISO or ERCOT.',
    typical: {
      capacity: '250 MW / 1 GWh',
      capex_per_gw: 1.4e9, capex: 350e6,
      target_irr: 0.11,
      cod_months: 12,
      ppa_price: null,
    },
    composite: 48,
    composite_delta: -1,
    risks_total: 8,
    risks_high: 3,
    news_this_week: 12,
    attention_weekly: [55, 52, 60, 58, 64, 62, 71, 68, 73, 81, 76, 84],
  },
  {
    id: 'green-hydrogen',
    name: 'Green Hydrogen',
    eyebrow: 'PEM · 45V-anchored',
    blurb: 'A 200 MW PEM electrolyzer with co-located renewable generation, targeting top-tier §45V credit.',
    typical: {
      capacity: '200 MW',
      capex_per_gw: 5.5e9, capex: 1.1e9,
      target_irr: 0.11,
      cod_months: 36,
      ppa_price: null,
    },
    composite: 71,
    composite_delta: 6,
    risks_total: 8,
    risks_high: 5,
    news_this_week: 19,
    attention_weekly: [62, 68, 74, 71, 82, 78, 88, 84, 91, 95, 92, 100],
  },
  {
    id: 'ev-charging',
    name: 'EV Charging',
    eyebrow: 'DC Fast · Corridor',
    blurb: 'A 1,200-site DC fast-charging network across a regional corridor, NEVI-funded with site-host revenue share.',
    typical: {
      capacity: '1,200 sites',
      capex_per_gw: null, capex: 300e6,
      target_irr: 0.13,
      cod_months: 24,
      ppa_price: null,
    },
    composite: 38,
    composite_delta: -3,
    risks_total: 7,
    risks_high: 1,
    news_this_week: 6,
    attention_weekly: [42, 38, 41, 35, 39, 36, 33, 31, 35, 28, 32, 30],
  },
];

// Risks per archetype.
export const RISKS = {
  'utility-solar': [
    { id: 's1', category: 'policy', title: '§48E ITC Phase-Down Risk', citation: 'IRC §48E · HR 9123', impact_irr: -2.4, impact_usd: 180e6, probability: 0.53, attention: 100, likelihood: 'high', headline_change: '+24 this week' },
    { id: 's2', category: 'trade',  title: 'Section 301 Chinese Polysilicon', citation: 'HTS 3818 · USTR list 3', impact_irr: -1.8, impact_usd: 90e6, probability: 0.48, attention: 92, likelihood: 'high', headline_change: '+9' },
    { id: 's3', category: 'trade',  title: 'AD/CVD on Southeast Asia CSPV', citation: 'Cambodia, Malaysia, Thailand, Vietnam', impact_irr: -1.4, impact_usd: 60e6, probability: 0.65, attention: 84, likelihood: 'high', headline_change: '+12' },
    { id: 's4', category: 'trade',  title: 'UFLPA Detentions on PV Modules', citation: '19 USC §1307 · Jinko on FLETF list', impact_irr: -1.2, impact_usd: 45e6, probability: 0.40, attention: 71, likelihood: 'medium', headline_change: '+3' },
    { id: 's5', category: 'operational', title: 'ERCOT Interconnection Queue Reform', citation: 'PUCT 54530 · NPRR 1196/1197', impact_irr: -0.8, impact_usd: 28e6, probability: 0.55, attention: 48, likelihood: 'medium', headline_change: '-2' },
    { id: 's6', category: 'policy', title: 'Treasury §48E Domestic Content Bonus', citation: 'REG-100908-23', impact_irr: -0.6, impact_usd: 22e6, probability: 0.35, attention: 38, likelihood: 'medium', headline_change: '+1' },
    { id: 's7', category: 'market', title: 'PPA Price Compression', citation: 'Solar PPA index · Texas / CAISO', impact_irr: -0.9, impact_usd: 18e6, probability: 0.45, attention: 32, likelihood: 'medium', headline_change: '0' },
    { id: 's8', category: 'policy', title: 'IRA Repeal Tail Risk', citation: 'Reconciliation FY27', impact_irr: -3.6, impact_usd: 240e6, probability: 0.18, attention: 56, likelihood: 'low', headline_change: '+4' },
  ],
  'onshore-wind': [
    { id: 'w1', category: 'policy', title: '§45Y PTC Continuity', citation: 'IRC §45Y · IRA §13701', impact_irr: -2.1, impact_usd: 95e6, probability: 0.42, attention: 78, likelihood: 'medium', headline_change: '+8' },
    { id: 'w2', category: 'trade',  title: 'Section 232 Steel (Towers)', citation: 'HTS 7308.20', impact_irr: -1.2, impact_usd: 32e6, probability: 0.55, attention: 62, likelihood: 'high', headline_change: '+11' },
    { id: 'w3', category: 'policy', title: 'Federal Lands Permitting Slowdown', citation: 'BLM ROW review', impact_irr: -0.9, impact_usd: 21e6, probability: 0.38, attention: 45, likelihood: 'medium', headline_change: '+2' },
    { id: 'w4', category: 'operational', title: 'MISO/SPP Interconnection Backlog', citation: 'FERC Order 2023', impact_irr: -1.4, impact_usd: 38e6, probability: 0.62, attention: 58, likelihood: 'high', headline_change: '+5' },
    { id: 'w5', category: 'market', title: 'Tax-equity Pricing', citation: 'Curve sensitivity', impact_irr: -1.0, impact_usd: 28e6, probability: 0.48, attention: 36, likelihood: 'medium', headline_change: '-1' },
    { id: 'w6', category: 'policy', title: 'Avian / Eagle Take Permit Risk', citation: 'USFWS / ESA', impact_irr: -0.6, impact_usd: 15e6, probability: 0.30, attention: 28, likelihood: 'low', headline_change: '0' },
    { id: 'w7', category: 'operational', title: 'Curtailment in Wind-Heavy Markets', citation: 'ERCOT, SPP', impact_irr: -1.1, impact_usd: 25e6, probability: 0.52, attention: 41, likelihood: 'medium', headline_change: '+2' },
  ],
  'offshore-wind': [
    { id: 'ow1', category: 'policy', title: 'EO 14154 Offshore Lease Pause', citation: 'EO Jan 20, 2025 · 43 USC §1337', impact_irr: -3.8, impact_usd: 630e6, probability: 0.79, attention: 100, likelihood: 'high', headline_change: '+32' },
    { id: 'ow2', category: 'policy', title: 'BOEM Construction & Operations Plan', citation: 'OCS Lands Act §8(p)', impact_irr: -2.4, impact_usd: 380e6, probability: 0.55, attention: 88, likelihood: 'high', headline_change: '+18' },
    { id: 'ow3', category: 'trade',  title: 'Section 232 Korean Steel Plate', citation: 'HTS 7208.51, 7208.52 · POSCO', impact_irr: -1.8, impact_usd: 240e6, probability: 0.66, attention: 92, likelihood: 'high', headline_change: '+14' },
    { id: 'ow4', category: 'operational', title: 'Jones Act WTIV Availability', citation: 'Merchant Marine Act 1920 · Charybdis', impact_irr: -1.2, impact_usd: 145e6, probability: 0.45, attention: 64, likelihood: 'medium', headline_change: '+4' },
    { id: 'ow5', category: 'policy', title: '§45Y PTC Offshore Bonus', citation: 'IRC §45Y(g)(11)', impact_irr: -2.6, impact_usd: 320e6, probability: 0.30, attention: 71, likelihood: 'medium', headline_change: '+7' },
    { id: 'ow6', category: 'operational', title: 'Subsea Cable Lead-time', citation: 'Prysmian, NKT, Hellenic', impact_irr: -0.8, impact_usd: 90e6, probability: 0.58, attention: 42, likelihood: 'medium', headline_change: '+2' },
    { id: 'ow7', category: 'policy', title: 'Marine ESA Designations', citation: 'NOAA Atlantic NARW', impact_irr: -1.0, impact_usd: 120e6, probability: 0.42, attention: 55, likelihood: 'medium', headline_change: '+6' },
    { id: 'ow8', category: 'market', title: 'OREC Pricing Re-opener Risk', citation: 'MA/NY/NJ 3-state RFP', impact_irr: -1.5, impact_usd: 180e6, probability: 0.50, attention: 48, likelihood: 'medium', headline_change: '0' },
    { id: 'ow9', category: 'market', title: 'OW Insurance Capacity', citation: 'Lloyd\'s / energy syndicate', impact_irr: -0.6, impact_usd: 65e6, probability: 0.60, attention: 32, likelihood: 'medium', headline_change: '+1' },
  ],
  'battery-storage': [
    { id: 'b1', category: 'trade',  title: 'Section 301 LFP Cells', citation: 'HTS 8507.60 · CATL / BYD', impact_irr: -2.8, impact_usd: 95e6, probability: 0.62, attention: 92, likelihood: 'high', headline_change: '+14' },
    { id: 'b2', category: 'policy', title: '§45X Manufacturing Credit Continuity', citation: 'IRC §45X', impact_irr: -1.8, impact_usd: 58e6, probability: 0.40, attention: 78, likelihood: 'medium', headline_change: '+9' },
    { id: 'b3', category: 'policy', title: '§48E Standalone Storage ITC', citation: 'IRC §48E · IRA §13702', impact_irr: -2.4, impact_usd: 78e6, probability: 0.45, attention: 84, likelihood: 'medium', headline_change: '+11' },
    { id: 'b4', category: 'policy', title: 'FEOC Disqualification Rules', citation: 'IRC §45X(d) FEOC', impact_irr: -3.2, impact_usd: 110e6, probability: 0.25, attention: 67, likelihood: 'high', headline_change: '+6' },
    { id: 'b5', category: 'operational', title: 'FERC Order 2222 DER Aggregation', citation: 'CAISO tariff revisions', impact_irr: -0.4, impact_usd: 12e6, probability: 0.55, attention: 41, likelihood: 'medium', headline_change: '+2' },
    { id: 'b6', category: 'market', title: 'CAISO Resource Adequacy', citation: 'CPUC D.21-06-029', impact_irr: -0.9, impact_usd: 22e6, probability: 0.45, attention: 38, likelihood: 'medium', headline_change: '-1' },
    { id: 'b7', category: 'operational', title: 'Critical Mineral Supply', citation: 'Lithium, cobalt, graphite', impact_irr: -1.4, impact_usd: 32e6, probability: 0.35, attention: 48, likelihood: 'medium', headline_change: '+3' },
    { id: 'b8', category: 'operational', title: 'NFPA 855 Fire-safety Code', citation: 'NFPA 855 / ICC update', impact_irr: -0.3, impact_usd: 8e6, probability: 0.30, attention: 22, likelihood: 'low', headline_change: '0' },
  ],
  'green-hydrogen': [
    { id: 'h1', category: 'policy', title: '§45V Three-Pillars Final Rule', citation: 'Treasury REG-117631-23', impact_irr: -4.2, impact_usd: 240e6, probability: 0.32, attention: 100, likelihood: 'high', headline_change: '+18' },
    { id: 'h2', category: 'policy', title: 'DOE H2Hubs Milestone Funding', citation: 'BIL §40314 · DOE OCED', impact_irr: -2.1, impact_usd: 150e6, probability: 0.41, attention: 84, likelihood: 'medium', headline_change: '+8' },
    { id: 'h3', category: 'policy', title: 'EPA Subpart W Hydrogen Reporting', citation: '40 CFR Part 98 Subpart W', impact_irr: -0.8, impact_usd: 38e6, probability: 0.50, attention: 56, likelihood: 'medium', headline_change: '+4' },
    { id: 'h4', category: 'market', title: 'Off-taker Demand (Ammonia, Steel)', citation: 'No firm LOI', impact_irr: -2.8, impact_usd: 220e6, probability: 0.55, attention: 72, likelihood: 'high', headline_change: '+11' },
    { id: 'h5', category: 'operational', title: 'Electrolyzer Manufacturing Lead-time', citation: 'Plug, Cummins, Nel', impact_irr: -1.2, impact_usd: 85e6, probability: 0.45, attention: 51, likelihood: 'medium', headline_change: '+5' },
    { id: 'h6', category: 'operational', title: 'Pipeline Access / Tariffs', citation: 'FERC §284', impact_irr: -1.0, impact_usd: 62e6, probability: 0.38, attention: 38, likelihood: 'medium', headline_change: '+2' },
    { id: 'h7', category: 'operational', title: 'Water Rights — Texas Permian', citation: 'TCEQ Edwards Aquifer', impact_irr: -0.7, impact_usd: 28e6, probability: 0.35, attention: 32, likelihood: 'low', headline_change: '+1' },
    { id: 'h8', category: 'policy', title: 'Hourly Matching Rollback Risk', citation: 'Treasury §45V(c)(2)', impact_irr: -3.6, impact_usd: 95e6, probability: 0.20, attention: 78, likelihood: 'medium', headline_change: '+6' },
  ],
  'ev-charging': [
    { id: 'e1', category: 'policy', title: 'NEVI Program Funding Rescission', citation: '23 USC §175 · FHWA', impact_irr: -3.2, impact_usd: 80e6, probability: 0.28, attention: 68, likelihood: 'medium', headline_change: '+8' },
    { id: 'e2', category: 'policy', title: '§30C Alt-Fuel Refueling Credit', citation: 'IRC §30C', impact_irr: -1.4, impact_usd: 22e6, probability: 0.40, attention: 52, likelihood: 'medium', headline_change: '+4' },
    { id: 'e3', category: 'policy', title: 'Build America Buy America Waivers', citation: 'P.L. 117-58 §70914', impact_irr: -1.8, impact_usd: 32e6, probability: 0.45, attention: 48, likelihood: 'medium', headline_change: '+2' },
    { id: 'e4', category: 'policy', title: '§45W Commercial EV Credit', citation: 'IRC §45W', impact_irr: -0.6, impact_usd: 8e6, probability: 0.32, attention: 32, likelihood: 'low', headline_change: '0' },
    { id: 'e5', category: 'operational', title: 'Utility Interconnection Queue', citation: 'State PSC reviews', impact_irr: -1.1, impact_usd: 18e6, probability: 0.50, attention: 38, likelihood: 'medium', headline_change: '+1' },
    { id: 'e6', category: 'market', title: 'Site-host Revenue Share Renegotiation', citation: 'Existing host contracts', impact_irr: -0.8, impact_usd: 12e6, probability: 0.30, attention: 22, likelihood: 'low', headline_change: '-1' },
    { id: 'e7', category: 'operational', title: 'FHWA 23 CFR 680 Standards Updates', citation: '23 CFR Part 680', impact_irr: -0.4, impact_usd: 6e6, probability: 0.25, attention: 18, likelihood: 'low', headline_change: '0' },
  ],
};

// News items per archetype.
export const NEWS = {
  'utility-solar': [
    { source: 'POLITICO',     ago: '2 hr ago',  title: 'Senate Finance markup adds §48E phase-down for projects not under construction by 12/31/26', sum: 'Wyden / Crapo joint filing late Saturday adds a hard cliff to the technology-neutral ITC, narrowing the developer window by 11 months.', tag: 'policy' },
    { source: 'REUTERS',      ago: '5 hr ago',  title: 'Commerce expands Cambodia / Vietnam AD/CVD scope to include polysilicon-content modules', sum: 'Final scope ruling adds modules with Chinese-sourced polysilicon to the existing 271% AD margin on CSPV from Cambodia and Vietnam.', tag: 'trade' },
    { source: 'BLOOMBERG',    ago: 'yesterday', title: 'CBP UFLPA detentions of solar shipments hit 14 in week ending May 22', sum: 'Customs holds doubled vs prior week. Jinko Solar remains on the FLETF Entity List; landed-cost variance widening for tracker-mounted modules.', tag: 'trade' },
    { source: 'UTILITY DIVE', ago: 'Fri',       title: 'ERCOT files revised GIS procedures; PUCT approves Docket 54530', sum: 'NPRR 1196 and 1197 reshape interconnection queue priority. Solar projects in cluster studies face 6–9 month re-evaluation window.', tag: 'operational' },
    { source: 'KALSHI',       ago: 'Fri',       title: 'KX48ETAXCREDIT YES repriced 71¢ → 92¢ after staff signaled phase-down in mark', sum: 'Volume crossed $14K notional through Friday close. Market now pricing reinstatement as base case ahead of House W&M markup Thursday.', tag: 'market' },
    { source: 'CANARY MEDIA', ago: '2 days',    title: 'First Solar files 10-Q showing 38% domestic-content premium on Q1 shipments', sum: 'Premium widens vs Chinese tier-1 polysilicon-based panels; supports the §48E domestic-content bonus arithmetic for US-manufactured supply.', tag: 'market' },
    { source: 'E&E NEWS',     ago: '3 days',    title: 'Treasury readies §48E final guidance — adders for energy communities, low-income', sum: 'Notice 2023-29 follow-up expected late June. Stacking with domestic content could lift effective rate to 50% for qualifying projects.', tag: 'policy' },
    { source: 'PV MAGAZINE',  ago: '4 days',    title: 'CFE Investments closes $1.1B tax-equity for 1.4 GW utility solar portfolio', sum: 'Spreads tightened ~10 bps vs Q1; tax-equity supply remains the binding capital constraint for late-2026 COD pipeline.', tag: 'market' },
  ],
  'onshore-wind': [
    { source: 'REUTERS',      ago: '4 hr ago',  title: 'GE Vernova warns of 14–18 month tower-steel lead-times following §232 review', sum: 'Investor day disclosure cites POSCO and Korean tower fabricators as bottleneck. Towers represent 18% of onshore capex.', tag: 'trade' },
    { source: 'UTILITY DIVE', ago: '1 day',     title: 'BLM extends Right-of-Way review window for wind energy projects on federal lands', sum: 'Western states see 30–60 day pushback on environmental review. Adds COD slip risk for ~1.2 GW of pipeline.', tag: 'policy' },
    { source: 'BLOOMBERG',    ago: '2 days',    title: 'MISO interconnection queue cluster 9 reopens after FERC Order 2023 compliance filing', sum: 'Cluster reform redistributes upgrades; queue position changes could shift COD by 12–18 months for affected projects.', tag: 'operational' },
    { source: 'CANARY MEDIA', ago: '3 days',    title: '§45Y PTC arithmetic holds: 1.7¢/kWh inflation-adjusted, domestic-content stacking', sum: 'Treasury final guidance confirms inflation indexing methodology. Onshore wind projects under construction by 12/31/26 lock the rate.', tag: 'policy' },
    { source: 'WSJ',          ago: '5 days',    title: 'Tax-equity yields tick up 35 bps in latest quarterly pricing snapshot', sum: 'Bank balance-sheet tightening and 45Y/48E uncertainty contribute to spread widening. Onshore wind tax-equity at 8.6–9.0%.', tag: 'market' },
    { source: 'E&E NEWS',     ago: '6 days',    title: 'USFWS issues new programmatic eagle take permit for repowering projects', sum: 'Streamlines permit pathway for repowering of legacy turbines; reduces avian permitting risk for ~2 GW of refresh pipeline.', tag: 'policy' },
  ],
  'offshore-wind': [
    { source: 'POLITICO',     ago: '1 hr ago',  title: 'House Natural Resources reopens EO 14154 markup; phase-out language under review', sum: 'Chairman Westerman files amendment that would extend §3(c) review by 180 days for projects with existing BOEM construction approval.', tag: 'policy' },
    { source: 'BLOOMBERG',    ago: '4 hr ago',  title: 'Vineyard Wind II files Phase II Construction and Operations Plan with BOEM', sum: 'BOEM 30-day completeness review begins. Even with EO pause, statutory clock has restarted for project at 60% engineering.', tag: 'policy' },
    { source: 'REUTERS',      ago: 'yesterday', title: 'POSCO confirms US monopile delivery slate into Q1 2027 despite §232 review', sum: 'Korean supplier holds firm on contracted slots. Section 232 expansion to plate steel could lift landed cost 12–18%.', tag: 'trade' },
    { source: 'KALSHI',       ago: 'yesterday', title: 'KXBOEM-26 YES priced 28¢ — markets pricing BOEM permit slowdown sustained', sum: 'Volume $84K notional through weekend. Implied probability of new BOEM lease approval by year-end at 28%.', tag: 'market' },
    { source: 'WSJ',          ago: '2 days',    title: 'Charybdis (Dominion) WTIV maiden voyage delayed to Q4 2026', sum: 'Jones Act installation vessel pushed back 6 months. Vineyard Wind II and Empire Wind I dependencies remain unresolved.', tag: 'operational' },
    { source: 'E&E NEWS',     ago: '3 days',    title: 'NOAA expands North Atlantic Right Whale critical habitat designation', sum: 'New designation overlaps BOEM lease zones in NY Bight and MA OCS-A 0501. Could trigger Section 7 ESA consultation re-review.', tag: 'policy' },
    { source: 'OFFSHORE WIND', ago: '4 days',   title: 'Empire Wind 1 reaches FNTP amidst regulatory uncertainty', sum: 'Equinor and partners commit to final notice-to-proceed despite EO pause. $4.5B project moves to construction phase.', tag: 'market' },
    { source: 'UTILITY DIVE', ago: '5 days',    title: 'NY, NJ, MA file joint petition for OREC re-pricing — current strikes "non-viable"', sum: 'Three-state joint petition requests price adjustments of 35–45% on existing contracts. PSCs to rule by Q3.', tag: 'market' },
  ],
  'battery-storage': [
    { source: 'POLITICO',     ago: '3 hr ago',  title: 'USTR draft Section 301 notice tightens LFP cell tariffs — HTS 8507.60', sum: 'Proposed move from 25% to 50% on cathode-active material; 60-day comment period now open. CATL, BYD, Gotion most exposed.', tag: 'trade' },
    { source: 'BLOOMBERG',    ago: '6 hr ago',  title: 'FEOC final guidance: Chinese ownership threshold tightened to 15%', sum: 'Treasury final FEOC rule reduces ownership cap from prior 25% draft. Affects §45X and §48E credit qualifying.', tag: 'policy' },
    { source: 'CANARY MEDIA', ago: 'yesterday', title: 'LG Energy Solution opens Michigan LFP gigafactory ahead of schedule', sum: 'Domestic LFP supply ramps; could ease tariff exposure for projects sourcing US-made cells starting Q3.', tag: 'market' },
    { source: 'KALSHI',       ago: 'yesterday', title: 'KXTARIFFREVENUE-T200 YES at 65¢ — base case for $200B+ tariff revenue', sum: 'Markets pricing meaningful tariff escalation across the board; battery sector hedges remain attractive.', tag: 'market' },
    { source: 'UTILITY DIVE', ago: '2 days',    title: 'CAISO files FERC Order 2222 DER aggregation tariff revisions', sum: 'Comment period closes June 25. Standalone BESS aggregation rules under review.', tag: 'operational' },
    { source: 'REUTERS',      ago: '3 days',    title: 'Tesla Megapack 3 shipments to grid customers up 47% YoY in Q1', sum: 'Domestic supply alternative gaining share. Megapack at $310/kWh vs CATL EnerC at $245/kWh delivered.', tag: 'market' },
  ],
  'green-hydrogen': [
    { source: 'POLITICO',     ago: '1 hr ago',  title: 'Treasury publishes §45V final three-pillars rule — hourly matching effective Jan 2027', sum: 'Final rule confirms hourly matching with 12-month phase-in. Top-tier $3/kg credit available with strict incrementality.', tag: 'policy' },
    { source: 'BLOOMBERG',    ago: '5 hr ago',  title: 'Plug Power Q1 electrolyzer backlog hits 3.2 GW, lead-time stretches to 14 months', sum: 'PEM electrolyzer manufacturing bottleneck continues. US-made supply at premium vs Norwegian alkaline.', tag: 'operational' },
    { source: 'WSJ',          ago: 'yesterday', title: 'DOE OCED announces milestone disbursement schedule for 7 H2Hubs', sum: 'Permian, Heartland, Gulf hubs cleared for next tranche. Mid-Atlantic and California hubs flagged for re-review.', tag: 'policy' },
    { source: 'REUTERS',      ago: 'yesterday', title: 'ExxonMobil walks back Baytown blue-hydrogen offtake — re-pricing required', sum: 'Anchor offtake under renegotiation. Spot market for green H2 to ammonia remains nascent.', tag: 'market' },
    { source: 'CANARY MEDIA', ago: '2 days',    title: 'Texas Permian water-rights litigation: TCEQ stays Edwards Aquifer permit', sum: 'Stay halts five hydrogen project water allocations. Affects ~1 GW of pipeline in Reeves and Loving counties.', tag: 'operational' },
    { source: 'E&E NEWS',     ago: '3 days',    title: 'EPA Subpart W proposed rule extends GHG reporting to electrolytic H2', sum: 'New reporting bins for green hydrogen producers. Compliance burden moderate; could affect 45V verification.', tag: 'policy' },
    { source: 'UTILITY DIVE', ago: '4 days',    title: 'Cummins (Accelera) commissions 25 MW PEM stack at Loy Yang trial', sum: 'Cummins joins Plug as a US-domiciled PEM supplier at scale. May shift the supplier mix for §45V-qualifying projects.', tag: 'market' },
    { source: 'KALSHI',       ago: '5 days',    title: 'KX45V-26DEC YES at 41¢ — three-pillars rule survives challenge through Dec', sum: 'Volume $32K notional. Markets pricing some legal challenge risk but final rule expected to hold.', tag: 'market' },
  ],
  'ev-charging': [
    { source: 'REUTERS',      ago: '6 hr ago',  title: 'House appropriators table NEVI rescission language — funding survives FY27', sum: 'Bipartisan opposition to clawback proves decisive. NEVI obligations to states proceed through allocation cycle.', tag: 'policy' },
    { source: 'BLOOMBERG',    ago: 'yesterday', title: 'FHWA approves 8 additional state EV charging plans under 23 CFR 680', sum: 'Cumulative approvals now cover 38 states. Build-out accelerates in Q3 with ~$870M earmarked for corridors.', tag: 'policy' },
    { source: 'UTILITY DIVE', ago: '2 days',    title: 'PJM utility queue reform causes 6-month delay for fast-charger interconnects', sum: 'Mid-Atlantic states most affected. Site-host economics worsen as installation slips.', tag: 'operational' },
    { source: 'WSJ',          ago: '3 days',    title: 'ChargePoint Q1: utilization at NEVI sites averages 19%, below underwriting model', sum: 'Lower-than-expected utilization could pressure revenue-share economics. Per-charger contribution margin breakeven shifts.', tag: 'market' },
    { source: 'CANARY MEDIA', ago: '4 days',    title: 'ABB Terra cabinet shipments resume after Section 301 waiver application granted', sum: 'Swiss-origin DC fast-chargers cleared. Supply chain risk for ~40% of corridor stations eased.', tag: 'trade' },
    { source: 'POLITICO',     ago: '5 days',    title: 'Senate confirms FHWA administrator; signals continued NEVI support', sum: 'Confirmation removes one source of programmatic uncertainty for site developers and utility partners.', tag: 'policy' },
  ],
};

// Single deep-dive risk used by risk.html — pre-filled for utility-solar :: §48E
export const RISK_DETAIL = {
  archetype_id: 'utility-solar',
  archetype_name: 'Utility-scale Solar',
  id: 's1',
  category: 'policy',
  title: '§48E ITC Phase-Down Risk',
  subtitle: 'Reconciliation provisions narrow the safe-harbor cliff to 12/31/2026.',
  citation: 'IRC §48E (IRA §13702) · HR 9123 · Senate Finance markup May 24',
  tracked_since: 'Apr 14, 2026',
  last_updated: '3 minutes ago',
  attention: 100, attention_delta: 24,
  probability: 0.53, probability_delta: 0.08,
  impact_irr: -2.4,
  impact_usd: 180e6,
  hedge_cost: 4000,
  hedge_market: 'KX48ETAXCREDIT-26MAY',
  hedge_yes: 0.98,
  view: "Senate Finance's Saturday markup added explicit phase-down language to §48E for projects not under construction by 12/31/2026, narrowing the safe-harbor window by 11 months. House W&M chairman's mark, scheduled for Thursday 5/28, mirrors the Senate position. Combined cosponsor count crossed 50 over the weekend — meaningful, but still 14 votes short of the floor threshold. We're moving probability of an adverse outcome to 53% (from 45% Friday) and lifting expected loss to $95M against the Cardinal portfolio's $180M of exposed §48E NPV.",
  weekly: [12, 18, 24, 32, 28, 38, 45, 52, 64, 78, 92, 100],
  // Timeline events (past and future)
  events: [
    { date: '2026-12-31', when: '+219d', kind: 'deadline',   future: true, title: 'Construction-start safe-harbor cliff', detail: 'If reconciliation passes as drafted, projects not started by 12/31 lose technology-neutral rate.' },
    { date: '2026-06-12', when: '+19d',  kind: 'hearing',    future: true, title: 'Senate Finance full-committee markup', detail: 'Wyden / Crapo joint motion likely. Adoption sets HEC priority order.' },
    { date: '2026-05-28', when: '+4d',   kind: 'hearing',    future: true, title: 'House W&M markup — §48E reconciliation provisions', detail: 'Chairman\'s mark filed Saturday; floor vote possible same week.' },
    { date: '2026-05-24', when: 'today', kind: 'now',        future: false, now: true, title: 'Senate Finance markup adds phase-down language to §48E', detail: 'Phase-down for projects not under construction by 12/31/2026. Cosponsor count 31 D + 18 R.' },
    { date: '2026-05-20', when: '4d ago',kind: 'market',     future: false, title: 'KX48ETAXCREDIT-26MAY repriced 71¢ → 92¢', detail: 'After Senate Finance staff signaled phase-down was in the chairman\'s mark.' },
    { date: '2026-05-12', when: '12d ago', kind: 'filing',   future: false, title: 'HR 9123 introduced — Solar Investment Stability Act', detail: 'Reps. Larsen (D-WA) / Conaway (R-TX). Would extend §48E technology-neutral rate through 2032.' },
    { date: '2026-04-14', when: '41d ago', kind: 'castle',   future: false, title: 'Watchlist added — §48E ITC Phase-Down', detail: 'Onboarding scan flagged §48E as the primary policy exposure for utility-scale solar projects with 2027+ COD.' },
  ],
  news: [
    { source: 'POLITICO',  ago: '2 hr ago',  title: 'Senate Finance markup adds §48E phase-down for projects not under construction by 12/31/26', tag: 'policy' },
    { source: 'KALSHI',    ago: 'Fri',       title: 'KX48ETAXCREDIT YES repriced 71¢ → 92¢ after staff signaled phase-down in mark', tag: 'market' },
    { source: 'E&E NEWS',  ago: '3 days',    title: 'Treasury readies §48E final guidance — adders for energy communities, low-income', tag: 'policy' },
    { source: 'PV MAGAZINE', ago: '4 days',  title: 'CFE Investments closes $1.1B tax-equity for 1.4 GW utility solar portfolio', tag: 'market' },
  ],
  hedges: [
    { ticker: 'KX48ETAXCREDIT-26MAY', title: 'Will legislation reinstating §48E commercial ITC at 30%+ become law before Dec 31, 2029?', yes: 0.98, change: 0.06, expiry: 'Dec 2029', notional: 200000 },
    { ticker: 'KX48ECONST-26DEC',     title: 'Will the §48E construction-start safe harbor extend past 12/31/2026?', yes: 0.42, change: -0.04, expiry: 'Dec 2026', notional: 120000 },
    { ticker: 'KXRECON-26-3',         title: 'Will the House reconciliation package pass before August recess?', yes: 0.61, change: 0.03, expiry: 'Aug 2026', notional: 80000 },
  ],
};

// Helper formatters
export function fmtUsd(n) {
  if (n == null) return '—';
  const abs = Math.abs(n);
  if (abs >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (abs >= 1e6) return `$${(n / 1e6).toFixed(0)}M`;
  if (abs >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${Math.round(n).toLocaleString()}`;
}
export function fmtPct(n, d = 0) { return n == null ? '—' : `${(n * 100).toFixed(d)}%`; }
export function escape(s) {
  if (s == null) return '';
  return String(s).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}
export function archetypeById(id) { return ARCHETYPES.find(a => a.id === id); }
