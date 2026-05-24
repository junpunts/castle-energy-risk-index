import { loadAll, fmtUsd, fmtPct } from '../data.js';
import { hBarChart, scatter, stackedBarsByRow, weeklyBars, donut, timeline, CAT_COLOR } from '../charts.js';

const CAT_LABEL = { policy: 'Policy', trade: 'Trade', geopolitical: 'Geopolitical', macro: 'Macro' };

(async function init() {
  try {
    const { bundle, projects, policies, markets } = await loadAll();
    const projectMap = new Map(projects.map(p => [p.id, p]));

    // ── Derive headline numbers ─────────────────────────
    const totalCapex = projects.reduce((s, p) => s + p.capex_usd, 0);
    const weightedScore = Math.round(projects.reduce((s, p) => {
      const sc = bundle.scores.find(x => x.project_id === p.id);
      return s + (sc ? sc.composite * p.capex_usd : 0);
    }, 0) / totalCapex);
    const topFactor = bundle.factors.slice().sort((a, b) => b.attention_score - a.attention_score)[0];
    const topFactorProject = projectMap.get(topFactor?.project_id);
    const totalEL = bundle.factors.reduce((s, f) => s + f.dollar_impact_usd * f.probability, 0);

    // Weekly totals across all factors
    const weeks = (bundle.factors[0]?.attention_weekly || []).length;
    const weeklyTotals = Array(weeks).fill(0);
    for (const f of bundle.factors) (f.attention_weekly || []).forEach((v, i) => weeklyTotals[i] += v);
    const last2 = weeklyTotals.slice(-2).reduce((a, b) => a + b, 0);
    const prev2 = weeklyTotals.slice(-4, -2).reduce((a, b) => a + b, 0);
    const wowChange = prev2 ? Math.round(((last2 - prev2) / prev2) * 100) : 0;

    // ── Masthead ─────────────────────────────────────────
    const today = new Date();
    const dateStr = today.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    const isoWeek = Math.ceil(((today - new Date(today.getFullYear(), 0, 1)) / 86400000 + 1) / 7);

    document.getElementById('masthead').innerHTML = `
      <div class="left">
        <span class="pub">Castle Energy Risk Observations</span>
        <h1>This week in the renewables stack.</h1>
        <span class="date">${dateStr} · Week ${isoWeek} · No. ${isoWeek + 20}</span>
      </div>
      <div class="issue">
        Composite read
        <strong>${weightedScore}<span style="font-size:14px;color:var(--fg-3);font-weight:600">/100</span></strong>
        capex-weighted · ${fmtUsd(totalCapex)} tracked
      </div>
    `;

    // ── Thesis paragraph ─────────────────────────────────
    document.getElementById('thesis').innerHTML = `
      The composite portfolio reading sits at <strong>${weightedScore}/100</strong> against
      <strong>${fmtUsd(totalCapex)}</strong> of tracked capex. Aggregate Congressional and Federal-Register attention
      across the ${bundle.factors.length} tracked exposures rose <strong>${wowChange >= 0 ? '+' : ''}${wowChange}%</strong>
      week-over-week, with <em>${escape(topFactor?.title || 'no single risk')}</em> ${topFactorProject ? `(${escape(topFactorProject.name)})` : ''}
      pulling the dominant share of policy activity. Total expected loss across the portfolio currently sums to <strong>${fmtUsd(totalEL)}</strong>;
      ${bundle.hedges.length} Kalshi positions are mapped against it.
    `;

    // ── Callouts (three boxed deltas) ───────────────────
    const highLikelihoodCount = bundle.factors.filter(f => f.likelihood_bucket === 'high').length;
    const mappedMarkets = new Set(bundle.hedges.map(h => h.market_id)).size;
    document.getElementById('callouts').innerHTML = `
      <div class="obs-callout">
        <div class="label">Attention WoW</div>
        <div class="val ${wowChange >= 0 ? 'is-up' : 'is-down'}">${wowChange >= 0 ? '+' : ''}${wowChange}%</div>
        <div class="detail"><strong>${last2}</strong> mentions in the last two weeks vs <strong>${prev2}</strong> the two prior. ${wowChange > 0 ? 'Risk noise is rising.' : 'Risk noise easing.'}</div>
      </div>
      <div class="obs-callout">
        <div class="label">High-likelihood risks</div>
        <div class="val">${highLikelihoodCount}</div>
        <div class="detail">Out of ${bundle.factors.length} tracked. These are the ones our analyst view flags with &gt;55% probability over an 18-month horizon.</div>
      </div>
      <div class="obs-callout">
        <div class="label">Hedge inventory</div>
        <div class="val">${mappedMarkets}</div>
        <div class="detail">Live Kalshi markets mapped to portfolio exposures, sized for <strong>${fmtUsd(bundle.hedges.reduce((s, h) => s + h.notional_usd, 0))}</strong> total notional.</div>
      </div>
    `;

    // ── §1 — Where the signal is loudest ─────────────────
    const topByAttn = bundle.factors.slice().sort((a, b) => b.attention_score - a.attention_score).slice(0, 8);
    const max1 = topByAttn[0]?.attention_score || 100;
    const chart1 = hBarChart(
      topByAttn.map(f => ({
        label: truncate(f.title, 44),
        value: f.attention_score,
        color: CAT_COLOR[f.category],
      })),
      { valueFmt: v => `${v}`, max: max1, labelWidth: 320 }
    );
    document.getElementById('section-1').innerHTML = `
      <div class="obs-section-head">
        <div class="obs-section-num"><strong>01</strong> &nbsp;/ 05</div>
        <h2>Where Congressional attention is concentrated</h2>
        <div class="obs-section-meta">Top 8 of ${bundle.factors.length}</div>
      </div>
      <p class="obs-body">
        Each tracked exposure is scored against the rolling 12-week count of Congress.gov bills and Federal-Register
        notices whose language references its keywords. The chart below ranks the top eight; the leader pulls
        meaningfully more activity than the rest of the stack.
      </p>
      <figure class="obs-chart">
        <div class="obs-chart-title">Attention score — ${topByAttn.length} loudest risks</div>
        <div class="obs-chart-sub">0–100, normalized to portfolio peak · 12-week window</div>
        ${chart1}
        ${categoryLegend()}
        <p class="obs-chart-caption">
          ${escape(topFactor?.our_view || topFactor?.description || '')}
        </p>
      </figure>
    `;

    // ── §2 — Aggregate attention timeline ───────────────
    const labels = Array.from({ length: weeks }, (_, i) => `w${weeks - i}`);
    const chart2 = weeklyBars(weeklyTotals, { highlight: weeks - 1, labels });
    document.getElementById('section-2').innerHTML = `
      <div class="obs-section-head">
        <div class="obs-section-num"><strong>02</strong> &nbsp;/ 05</div>
        <h2>The signal over time</h2>
        <div class="obs-section-meta">12 weeks · all risks</div>
      </div>
      <p class="obs-body">
        Aggregate policy activity across every tracked risk, bucketed weekly. ${wowChange >= 10
          ? 'Activity is meaningfully elevated relative to the trailing weeks.'
          : wowChange <= -10
          ? 'Activity has materially cooled from recent peaks.'
          : 'The signal has been roughly stable, with normal week-to-week noise.'}
      </p>
      <figure class="obs-chart">
        <div class="obs-chart-title">Weekly mentions across the portfolio</div>
        <div class="obs-chart-sub">Congress.gov + Federal Register · count of items per week</div>
        ${chart2}
        <p class="obs-chart-caption">
          Most recent week highlighted in black. Quiet weeks are not necessarily quiet quarters — policy moves on its own clock.
        </p>
      </figure>
    `;

    // ── §3 — Attention vs $-impact scatter ──────────────
    const maxAttn = Math.max(...bundle.factors.map(f => f.attention_score), 1);
    const maxEL = Math.max(...bundle.factors.map(f => f.dollar_impact_usd * f.probability), 1);
    const scatterPts = bundle.factors.map(f => ({
      x: f.attention_score,
      y: f.dollar_impact_usd * f.probability,
      r: 4 + Math.sqrt(f.dollar_impact_usd / 1e8),
      color: CAT_COLOR[f.category],
      label: `${f.title} — ${fmtUsd(f.dollar_impact_usd * f.probability)} EL · attn ${f.attention_score}`,
    }));
    const hotZone = bundle.factors.filter(f => f.attention_score >= 50 && (f.dollar_impact_usd * f.probability) >= maxEL * 0.4).length;
    document.getElementById('section-3').innerHTML = `
      <div class="obs-section-head">
        <div class="obs-section-num"><strong>03</strong> &nbsp;/ 05</div>
        <h2>Where attention meets P&amp;L</h2>
        <div class="obs-section-meta">${bundle.factors.length} risks plotted</div>
      </div>
      <p class="obs-body">
        Each dot is a tracked risk. The horizontal axis is its attention score; the vertical axis is its expected loss
        (capex × probability of adverse outcome). Risks in the upper-right are loud <em>and</em> expensive — those are
        the items that should be on the board memo.
      </p>
      <figure class="obs-chart">
        <div class="obs-chart-title">Attention vs. expected loss</div>
        <div class="obs-chart-sub">All ${bundle.factors.length} tracked exposures · dot size scales with $ at risk</div>
        ${scatter(scatterPts, {
          xLabel: 'Attention score', yLabel: 'Expected loss (USD)',
          xMax: 100, yMax: maxEL,
          xFmt: v => `${Math.round(v)}`, yFmt: v => `$${Math.round(v / 1e6)}M`,
          quadrantLabel: 'Upper-right: loudest + most material',
        })}
        ${categoryLegend()}
        <p class="obs-chart-caption">
          ${hotZone} risk${hotZone === 1 ? '' : 's'} sit${hotZone === 1 ? 's' : ''} in the high-attention / high-impact corner.
          The rest of the cloud is in monitoring territory.
        </p>
      </figure>
    `;

    // ── §4 — Composite by project (stacked bars) ────────
    const sortedProjects = projects.slice().sort((a, b) => {
      const sa = bundle.scores.find(s => s.project_id === a.id).composite;
      const sb = bundle.scores.find(s => s.project_id === b.id).composite;
      return sb - sa;
    });
    const stackRows = sortedProjects.map(p => {
      const sc = bundle.scores.find(s => s.project_id === p.id);
      return {
        label: `${p.name}`,
        segments: sc.sub_scores.map(s => ({
          value: s.contribution,  // weight × value
          color: CAT_COLOR[s.category],
        })),
      };
    });
    const heaviest = sortedProjects[0];
    const lightest = sortedProjects[sortedProjects.length - 1];
    const heaviestScore = bundle.scores.find(s => s.project_id === heaviest.id);
    const heaviestTop = heaviestScore.sub_scores.slice().sort((a, b) => b.contribution - a.contribution)[0];
    document.getElementById('section-4').innerHTML = `
      <div class="obs-section-head">
        <div class="obs-section-num"><strong>04</strong> &nbsp;/ 05</div>
        <h2>Composite risk by project</h2>
        <div class="obs-section-meta">Ranked · 5 projects</div>
      </div>
      <p class="obs-body">
        Each row is a project; the bar is the composite score (sum of weighted sub-scores). The colored segments
        decompose the composite into Policy, Trade, Geopolitical, and Macro contributions.
      </p>
      <figure class="obs-chart">
        <div class="obs-chart-title">Composite score by project</div>
        <div class="obs-chart-sub">Stacked weighted sub-scores · 0–100 scale</div>
        ${stackedBarsByRow(stackRows)}
        ${categoryLegend()}
        <p class="obs-chart-caption">
          <strong>${escape(heaviest.name)}</strong> reads heaviest at ${heaviestScore.composite}/100, with
          <strong>${CAT_LABEL[heaviestTop.category]}</strong> as the dominant driver
          (${Math.round(heaviestTop.value)} on its sub-score). <strong>${escape(lightest.name)}</strong> is the
          lightest at ${bundle.scores.find(s => s.project_id === lightest.id).composite}/100.
        </p>
      </figure>
    `;

    // ── §5 — Supply concentration (donut + table) ───────
    const supplyByCountry = new Map();
    for (const p of projects) {
      for (const s of p.key_suppliers) {
        if (s.country === 'USA' || s.country === 'United States') continue;
        const value = p.capex_usd * s.share_of_supply * 0.15; // rough component-value cut
        supplyByCountry.set(s.country, (supplyByCountry.get(s.country) || 0) + value);
      }
    }
    const supplySegments = Array.from(supplyByCountry.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([country, value]) => ({ label: country, value }));
    const totalForeign = supplySegments.reduce((a, s) => a + s.value, 0);
    const topCountry = supplySegments[0];

    document.getElementById('section-5').innerHTML = `
      <div class="obs-section-head">
        <div class="obs-section-num"><strong>05</strong> &nbsp;/ 05</div>
        <h2>Foreign supply concentration</h2>
        <div class="obs-section-meta">${supplySegments.length} countries</div>
      </div>
      <p class="obs-body">
        Foreign component value tracked across the portfolio, by supplier country. Tariff escalations
        (Section 201 / 232 / 301), AD/CVD actions, and UFLPA detentions are sized to this exposure.
      </p>
      <figure class="obs-chart">
        <div class="obs-chart-title">Foreign component value by country</div>
        <div class="obs-chart-sub">~15% of capex × foreign supplier share · portfolio total</div>
        <div style="display:grid;grid-template-columns:320px 1fr;gap:32px;align-items:center">
          ${donut(supplySegments, { width: 320, height: 320 })}
          <div>
            ${supplySegments.slice(0, 6).map((s, i) => `
              <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border);font-family:var(--font-mono);font-size:13px">
                <span>${escape(s.label)}</span>
                <span style="font-weight:700;font-variant-numeric:tabular-nums">${fmtUsd(s.value)} <span style="color:var(--fg-3);font-weight:400">· ${Math.round(s.value / totalForeign * 100)}%</span></span>
              </div>
            `).join('')}
          </div>
        </div>
        <p class="obs-chart-caption">
          <strong>${escape(topCountry.label)}</strong> represents ${Math.round(topCountry.value / totalForeign * 100)}% of foreign component value at
          <strong>${fmtUsd(topCountry.value)}</strong>. ${topCountry.label === 'China' ? 'This is the locus of trade-policy and UFLPA risk for the portfolio.' : 'Supply diversification reduces single-country tail risk versus a China-dominant stack.'}
        </p>
      </figure>
    `;

    // ── Portfolio strip at the bottom ───────────────────
    document.getElementById('strip').innerHTML = projects.map(p => {
      const sc = bundle.scores.find(s => s.project_id === p.id);
      return `<a class="eri-card" href="project.html?id=${encodeURIComponent(p.id)}" style="min-height:auto">
        <div class="eri-card-top">
          <div class="eri-card-meta">
            <span class="eri-eyebrow">${escape(p.technology)} · ${escape(p.capacity_label)}</span>
            <h3 class="eri-card-name">${escape(p.name)}</h3>
            <div class="eri-card-tech">${escape(p.location)}</div>
          </div>
          <div class="eri-score num">${sc.composite}</div>
        </div>
        <div class="risk-legend" style="margin-top:14px">
          ${sc.sub_scores.map(s => `<span class="risk-legend-item"><span class="risk-legend-swatch is-${s.category}"></span><span class="risk-legend-num">${Math.round(s.value)}</span></span>`).join('')}
        </div>
      </a>`;
    }).join('');

    document.body.classList.add('is-loaded');
  } catch (e) {
    console.error(e);
    document.getElementById('thesis').innerHTML = `<div class="empty">Could not load data: ${e.message}</div>`;
  }
})();

function categoryLegend() {
  return `<div class="obs-chart-legend">
    <span class="item"><span class="sw is-policy"></span>Policy</span>
    <span class="item"><span class="sw is-trade"></span>Trade</span>
    <span class="item"><span class="sw is-geopolitical"></span>Geopolitical</span>
    <span class="item"><span class="sw is-macro"></span>Macro</span>
  </div>`;
}
function escape(s) {
  if (s == null) return '';
  return String(s).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}
function truncate(s, n) { if (!s) return ''; return s.length > n ? s.slice(0, n - 1) + '…' : s; }
