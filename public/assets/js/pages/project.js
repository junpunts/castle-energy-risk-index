import { loadAll, projectById, factorsForProject, scoreForProject, hedgesForProject, marketById, fmtUsd, fmtPct } from '../data.js';
import { renderRiskBar, renderRiskLegend, renderSubScoreReadouts, renderExposureRow, renderHedgeCard } from '../components.js';

(async function init() {
  const params = new URLSearchParams(window.location.search);
  const id = params.get('id') || 'lone-star-solar-i';
  try {
    const { bundle, projects, markets } = await loadAll();
    const project = projectById(projects, id);
    if (!project) {
      document.getElementById('content').innerHTML = `<div class="empty">No project with id "${id}".</div>`;
      return;
    }
    const score = scoreForProject(bundle, id);
    const factors = factorsForProject(bundle, id);
    const hedges = hedgesForProject(bundle, id);

    document.title = `${project.name} — Castle Energy Risk Index`;

    // Header
    document.getElementById('hero').innerHTML = `
      <div>
        <div class="eri-eyebrow">${escape(project.technology)} · ${escape(project.capacity_label)} · ${escape(project.location)}</div>
        <h1 class="eri-h1">${escape(project.name)}</h1>
        <div class="project-hero-tags">
          <span class="tag">${escape(project.cod_quarter)} COD</span>
          <span class="tag">${fmtUsd(project.capex_usd)} capex</span>
          <span class="tag">Target equity IRR ${fmtPct(project.equity_irr_target, 1)}</span>
          <span class="tag">${escape(project.offtake_status)}</span>
        </div>
      </div>
      <div class="project-score-stack">
        <span class="eri-eyebrow">Composite risk index</span>
        <div class="eri-score is-mega num">${score.composite}</div>
        <div class="eri-eyebrow" style="margin-top:8px">of 100</div>
      </div>
    `;

    // Risk panel
    document.getElementById('risk-panel').innerHTML = `
      ${renderRiskBar(score.sub_scores, { large: true })}
      ${renderRiskLegend(score.sub_scores)}
      ${renderSubScoreReadouts(score.sub_scores)}
    `;

    // Exposure table
    const sortedFactors = factors.slice().sort((a, b) => {
      const order = { policy: 0, trade: 1, geopolitical: 2, macro: 3 };
      return (order[a.category] - order[b.category]) || (b.dollar_impact_usd * b.probability) - (a.dollar_impact_usd * a.probability);
    });
    document.getElementById('exposures').innerHTML = `
      <table class="exposure-table">
        <thead>
          <tr>
            <th>Category</th>
            <th>Exposure</th>
            <th>$ at risk</th>
            <th>Probability</th>
            <th>Expected loss</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          ${sortedFactors.map(renderExposureRow).join('')}
        </tbody>
      </table>
    `;

    // Hedges
    const factorsById = new Map(factors.map(f => [f.id, f]));
    const sortedHedges = hedges
      .slice()
      .sort((a, b) => b.relevance - a.relevance)
      .slice(0, 12);
    if (sortedHedges.length) {
      document.getElementById('hedges').innerHTML = sortedHedges.map(h => {
        const market = marketById(markets, h.market_id);
        const factor = factorsById.get(h.factor_id);
        return renderHedgeCard(h, market, factor);
      }).join('');
    } else {
      document.getElementById('hedges').innerHTML = '<div class="empty">No Kalshi markets currently mapped to this project\'s exposures.</div>';
    }

    // Narrative
    document.getElementById('narrative').innerHTML = `<p class="eri-lead">${escape(project.narrative)}</p>`;

    // Supplier table (small, dense)
    document.getElementById('suppliers').innerHTML = `
      <table class="exposure-table">
        <thead>
          <tr>
            <th>Supplier</th>
            <th>Country</th>
            <th>Component</th>
            <th>Share</th>
          </tr>
        </thead>
        <tbody>
          ${project.key_suppliers.map(s => `<tr>
            <td class="exposure-title">${escape(s.name)}</td>
            <td>${escape(s.country)}</td>
            <td>${escape(s.component_type)}</td>
            <td class="num">${fmtPct(s.share_of_supply)}</td>
          </tr>`).join('')}
        </tbody>
      </table>
    `;

    document.body.classList.add('is-loaded');
  } catch (e) {
    console.error(e);
    document.getElementById('content').innerHTML = `<div class="empty">Could not load data: ${e.message}</div>`;
  }
})();

function escape(s) {
  if (s == null) return '';
  return String(s).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}
