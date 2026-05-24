import { loadAll, projectById, factorsForProject, scoreForProject, hedgesForProject, fmtUsd, fmtPct } from '../data.js';
import { hBarChart, stackedBarsByRow, weeklyBars, donut, CAT_COLOR } from '../charts.js';

const CAT_LABEL = { policy: 'Policy', trade: 'Trade', geopolitical: 'Geopolitical', macro: 'Macro' };

(async function init() {
  const params = new URLSearchParams(window.location.search);
  const id = params.get('id') || 'lone-star-solar-i';
  try {
    const { bundle, projects, markets, policies } = await loadAll();
    const project = projectById(projects, id);
    if (!project) {
      document.querySelector('main').innerHTML = `<div class="empty">No project with id "${id}".</div>`;
      return;
    }
    const score = scoreForProject(bundle, id);
    const factors = factorsForProject(bundle, id);
    const hedges = hedgesForProject(bundle, id);
    document.title = `${project.name} — Castle Energy Risk Observations`;

    const totalEL = factors.reduce((s, f) => s + f.dollar_impact_usd * f.probability, 0);
    const topFactor = factors.slice().sort((a, b) => b.attention_score - a.attention_score)[0];
    const topSubScore = score.sub_scores.slice().sort((a, b) => b.contribution - a.contribution)[0];

    // ── Masthead ─────────────────────────────────────────
    document.getElementById('masthead').innerHTML = `
      <div class="left">
        <span class="pub">Project brief · ${escape(project.technology)} · ${escape(project.capacity_label)}</span>
        <h1>${escape(project.name)}</h1>
        <span class="date">${escape(project.location)} · COD ${escape(project.cod_quarter)} · ${fmtUsd(project.capex_usd)} capex</span>
      </div>
      <div class="issue">
        Composite read
        <strong>${score.composite}<span style="font-size:14px;color:var(--fg-3);font-weight:600">/100</span></strong>
        ${CAT_LABEL[topSubScore.category]}-led
      </div>
    `;

    // ── Thesis ───────────────────────────────────────────
    document.getElementById('thesis').innerHTML = `
      ${escape(project.name)} carries a composite risk of <strong>${score.composite}/100</strong> on ${fmtUsd(project.capex_usd)} of capex,
      with <strong>${CAT_LABEL[topSubScore.category]}</strong> at ${Math.round(topSubScore.value)}/100 the dominant driver of the composite.
      Total expected loss across the ${factors.length} tracked exposures sums to <strong>${fmtUsd(totalEL)}</strong>;
      ${hedges.length} Kalshi positions are currently mapped against them${topFactor ? `, led by <em>${escape(topFactor.title)}</em>` : ''}.
    `;

    // ── Callouts ─────────────────────────────────────────
    const highCount = factors.filter(f => f.likelihood_bucket === 'high').length;
    const foreignSuppliers = project.key_suppliers.filter(s => s.country !== 'USA' && s.country !== 'United States');
    const foreignShare = foreignSuppliers.reduce((s, x) => s + x.share_of_supply, 0);
    document.getElementById('callouts').innerHTML = `
      <div class="obs-callout">
        <div class="label">Top sub-score</div>
        <div class="val">${Math.round(topSubScore.value)}</div>
        <div class="detail"><strong>${CAT_LABEL[topSubScore.category]}</strong> · contributing ${Math.round(topSubScore.contribution)} pts to composite. ${escape(topSubScore.drivers[0] || '')}</div>
      </div>
      <div class="obs-callout">
        <div class="label">Tracked exposures</div>
        <div class="val">${factors.length}</div>
        <div class="detail"><strong>${highCount}</strong> currently flagged high-likelihood (&gt;55% probability over 18 months); rest medium or low.</div>
      </div>
      <div class="obs-callout">
        <div class="label">Foreign supply</div>
        <div class="val">${Math.round(foreignShare * 100)}%</div>
        <div class="detail">Sum of share weights across ${foreignSuppliers.length} foreign suppliers. Sized exposure to Section 201/232/301 actions.</div>
      </div>
    `;

    // ── §1 — Risk decomposition ──────────────────────────
    const compositeBar = stackedBarsByRow([{
      label: 'Composite',
      segments: score.sub_scores.map(s => ({ value: s.contribution, color: CAT_COLOR[s.category] })),
    }], { rowH: 36, labelWidth: 140 });
    document.getElementById('section-1').innerHTML = `
      <div class="obs-section-head">
        <div class="obs-section-num"><strong>01</strong> &nbsp;/ 04</div>
        <h2>Risk decomposition</h2>
        <div class="obs-section-meta">35 / 25 / 25 / 15 weights</div>
      </div>
      <p class="obs-body">
        The composite ${score.composite} is the weighted sum of four sub-scores. The stacked bar below shows the
        contribution of each category; the table beneath surfaces the underlying drivers from the Claude mapper
        and the live policy pull.
      </p>
      <figure class="obs-chart">
        <div class="obs-chart-title">Composite contribution by category</div>
        ${compositeBar}
        ${categoryLegend()}
        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:0;margin-top:24px;border-top:1px solid var(--border);border-left:1px solid var(--border)">
          ${score.sub_scores.map(s => `
            <div style="padding:16px;border-right:1px solid var(--border);border-bottom:1px solid var(--border);background:var(--bg-card)">
              <div style="font-family:var(--font-mono);font-size:10px;letter-spacing:0.25em;text-transform:uppercase;color:var(--fg-3)">${CAT_LABEL[s.category]} · ${Math.round(s.weight * 100)}%</div>
              <div style="font-family:var(--font-display);font-size:32px;line-height:1;margin:8px 0;font-variant-numeric:tabular-nums">${Math.round(s.value)}<span style="color:var(--fg-3);font-size:14px">/100</span></div>
              <div style="font-size:12px;color:var(--fg-3);line-height:1.45">${(s.drivers || []).slice(0, 2).map(d => `<div style="padding:4px 0;border-top:1px solid var(--border)">${escape(d)}</div>`).join('')}</div>
            </div>
          `).join('')}
        </div>
      </figure>
    `;

    // ── §2 — Top exposures by expected loss ─────────────
    const topByEL = factors.slice()
      .sort((a, b) => (b.dollar_impact_usd * b.probability) - (a.dollar_impact_usd * a.probability))
      .slice(0, 8);
    const rows = topByEL.map(f => ({
      label: truncate(f.title, 44),
      value: f.dollar_impact_usd * f.probability,
      color: CAT_COLOR[f.category],
      meta: f,
    }));
    document.getElementById('section-2').innerHTML = `
      <div class="obs-section-head">
        <div class="obs-section-num"><strong>02</strong> &nbsp;/ 04</div>
        <h2>Top exposures by expected loss</h2>
        <div class="obs-section-meta">Capex × probability</div>
      </div>
      <p class="obs-body">
        Each bar is one tracked exposure, sized by expected loss (USD at risk × probability of adverse outcome).
        Color encodes category. The top item alone accounts for ${Math.round(rows[0].value / totalEL * 100)}% of project expected loss.
      </p>
      <figure class="obs-chart">
        <div class="obs-chart-title">Expected loss by exposure</div>
        ${hBarChart(rows, { valueFmt: v => fmtUsd(v), labelWidth: 320, valueLabelWidth: 90 })}
        ${categoryLegend()}
        <p class="obs-chart-caption">
          ${escape(topByEL[0]?.our_view || topByEL[0]?.description?.split(/[.!?]/)[0] || '')}
        </p>
      </figure>
    `;

    // ── §3 — Attention timeline (this project's factors) ─
    const weeks = (factors[0]?.attention_weekly || []).length;
    const weeklyTotals = Array(weeks).fill(0);
    for (const f of factors) (f.attention_weekly || []).forEach((v, i) => weeklyTotals[i] += v);
    const last2 = weeklyTotals.slice(-2).reduce((a, b) => a + b, 0);
    const prev2 = weeklyTotals.slice(-4, -2).reduce((a, b) => a + b, 0);
    const wow = prev2 ? Math.round(((last2 - prev2) / prev2) * 100) : 0;
    const labels = Array.from({ length: weeks }, (_, i) => `w${weeks - i}`);
    document.getElementById('section-3').innerHTML = `
      <div class="obs-section-head">
        <div class="obs-section-num"><strong>03</strong> &nbsp;/ 04</div>
        <h2>Policy attention over time</h2>
        <div class="obs-section-meta">12 weeks · this project</div>
      </div>
      <p class="obs-body">
        Weekly count of Congress.gov bills and Federal-Register notices touching any of this project's tracked
        exposures. ${wow >= 10 ? `Activity is up <strong>+${wow}%</strong> in the last two weeks vs. the two prior.` : wow <= -10 ? `Activity has cooled <strong>${wow}%</strong> over the last fortnight.` : `Activity is broadly stable (${wow >= 0 ? '+' : ''}${wow}% WoW).`}
      </p>
      <figure class="obs-chart">
        <div class="obs-chart-title">Weekly mentions referencing this project's exposures</div>
        ${weeklyBars(weeklyTotals, { highlight: weeks - 1, labels })}
        <p class="obs-chart-caption">
          Most recent week highlighted in black. Compare against the portfolio aggregate on the main brief.
        </p>
      </figure>
    `;

    // ── §4 — Supply concentration (this project) ─────────
    const supplyByCountry = new Map();
    for (const s of project.key_suppliers) {
      supplyByCountry.set(s.country, (supplyByCountry.get(s.country) || 0) + s.share_of_supply);
    }
    const segs = Array.from(supplyByCountry.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([country, share]) => ({ label: country, value: share }));
    const totalShare = segs.reduce((a, s) => a + s.value, 0);
    const top = segs[0];

    document.getElementById('section-4').innerHTML = `
      <div class="obs-section-head">
        <div class="obs-section-num"><strong>04</strong> &nbsp;/ 04</div>
        <h2>Supply concentration</h2>
        <div class="obs-section-meta">${segs.length} country/countries</div>
      </div>
      <p class="obs-body">
        Share of key supply tied to each country. Concentration in any single foreign supplier is the underlying
        driver of the Geopolitical sub-score and a strong signal for hedging exposure to export controls,
        sanctions, or UFLPA enforcement.
      </p>
      <figure class="obs-chart">
        <div class="obs-chart-title">Suppliers by country</div>
        <div style="display:grid;grid-template-columns:320px 1fr;gap:32px;align-items:center">
          ${donut(segs, { width: 320, height: 320 })}
          <div>
            ${segs.map(s => `
              <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border);font-family:var(--font-mono);font-size:13px">
                <span>${escape(s.label)}</span>
                <span style="font-weight:700;font-variant-numeric:tabular-nums">${Math.round(s.value / totalShare * 100)}%</span>
              </div>
            `).join('')}
            ${project.key_suppliers.map(s => `<div style="display:flex;justify-content:space-between;padding:6px 0;font-size:11px;color:var(--fg-3)"><span>${escape(s.name)}</span><span>${escape(s.country)} · ${escape(s.component_type)}</span></div>`).join('')}
          </div>
        </div>
        <p class="obs-chart-caption">
          <strong>${escape(top.label)}</strong> at ${Math.round(top.value / totalShare * 100)}% of supply share is the dominant exposure.
          ${top.label === 'USA' || top.label === 'United States' ? 'Domestic-led supply chain reduces tariff exposure but does not eliminate domestic policy risk.' :
            'Foreign-led supply concentrates tariff and export-control risk in one jurisdiction.'}
        </p>
      </figure>
    `;

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
