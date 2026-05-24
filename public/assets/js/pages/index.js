import { loadAll, fmtUsd } from '../data.js';
import { renderProjectCard, renderTicker } from '../components.js';

(async function init() {
  try {
    const { bundle, projects, policies } = await loadAll();
    const scoresById = new Map(bundle.scores.map(s => [s.project_id, s]));
    const factorsByProject = new Map();
    for (const f of bundle.factors) {
      if (!factorsByProject.has(f.project_id)) factorsByProject.set(f.project_id, []);
      factorsByProject.get(f.project_id).push(f);
    }

    // Hero metrics
    const totalCapex = projects.reduce((s, p) => s + p.capex_usd, 0);
    const weightedScore = projects.reduce((s, p) => {
      const sc = scoresById.get(p.id);
      return s + (sc ? sc.composite * p.capex_usd : 0);
    }, 0) / totalCapex;

    const recentPolicies = policies
      .filter(p => p.latest_action_date)
      .sort((a, b) => (b.latest_action_date || '').localeCompare(a.latest_action_date || ''))
      .slice(0, 12);
    const activeThisWeek = policies.filter(p => {
      const d = new Date(p.latest_action_date);
      return !Number.isNaN(d.getTime()) && (Date.now() - d.getTime()) < 7 * 86400 * 1000;
    }).length;

    document.getElementById('hero').innerHTML = `
      <div class="eri-hero-item">
        <div class="eri-hero-label">Tracked capex</div>
        <div class="eri-hero-value">${fmtUsd(totalCapex)}</div>
        <div class="eri-hero-detail">${projects.length} projects in portfolio</div>
      </div>
      <div class="eri-hero-item">
        <div class="eri-hero-label">Weighted risk score</div>
        <div class="eri-hero-value">${Math.round(weightedScore)}<span style="color:var(--fg-3);font-size:18px;letter-spacing:0">/100</span></div>
        <div class="eri-hero-detail">capex-weighted composite</div>
      </div>
      <div class="eri-hero-item">
        <div class="eri-hero-label">Live policy items</div>
        <div class="eri-hero-value">${policies.length}</div>
        <div class="eri-hero-detail">${activeThisWeek} updated in the last 7 days</div>
      </div>
      <div class="eri-hero-item">
        <div class="eri-hero-label">Mapped hedges</div>
        <div class="eri-hero-value">${bundle.hedges.length}</div>
        <div class="eri-hero-detail">across ${new Set(bundle.hedges.map(h => h.market_id)).size} Kalshi markets</div>
      </div>
    `;

    // Project grid
    document.getElementById('grid').innerHTML = projects.map(p => {
      const score = scoresById.get(p.id);
      const exposures = factorsByProject.get(p.id) || [];
      return renderProjectCard(p, score, exposures);
    }).join('');

    // Ticker
    document.getElementById('ticker').innerHTML = renderTicker(recentPolicies);

    document.body.classList.add('is-loaded');
  } catch (e) {
    console.error(e);
    document.getElementById('grid').innerHTML = `<div class="empty">Could not load data: ${e.message}</div>`;
  }
})();
