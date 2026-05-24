import { loadAll, projectById, factorsForProject, scoreForProject, fmtUsd, fmtPct } from '../data.js';
import { hBarChart, stackedBarsByRow, CAT_COLOR } from '../charts.js';

const CAT_LABEL = { policy: 'Policy', trade: 'Trade', geopolitical: 'Geopolitical', macro: 'Macro' };
const MONTH = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

(async function init() {
  const params = new URLSearchParams(window.location.search);
  const id = params.get('id') || 'lone-star-solar-i';
  try {
    const { bundle, projects } = await loadAll();
    const project = projectById(projects, id);
    if (!project) {
      document.querySelector('main').innerHTML = `<div class="empty">No project with id "${id}".</div>`;
      return;
    }
    const projectMap = new Map(projects.map(p => [p.id, p]));
    const score = scoreForProject(bundle, id);
    const factors = factorsForProject(bundle, id);
    document.title = `${project.name} — Castle Energy Risk Observations`;

    // Top factor for the headline / narrative
    const topByImpact = factors.slice().sort((a, b) =>
      (b.attention_score * b.dollar_impact_usd * b.probability) -
      (a.attention_score * a.dollar_impact_usd * a.probability)
    )[0];
    const topSubScore = score.sub_scores.slice().sort((a, b) => b.contribution - a.contribution)[0];

    // ── Masthead ─────────────────────────────────────────
    document.getElementById('masthead').innerHTML = `
      <div class="left">
        <span class="pub">Project brief · ${escape(project.technology)}</span>
        <span class="date">${escape(project.location)} · ${escape(project.capacity_label)} · COD ${escape(project.cod_quarter)} · ${fmtUsd(project.capex_usd)} capex</span>
      </div>
      <div class="issue">
        Composite read
        <strong>${score.composite}<span style="font-size:14px;color:var(--fg-3);font-weight:600">/100</span></strong>
        ${CAT_LABEL[topSubScore.category]}-led
      </div>
    `;

    document.getElementById('project-name').textContent = project.name;

    // ── Project-specific headline + narrative ────────────
    // Derive a punchy headline from the top factor + its our_view
    const elPct = Math.round((topByImpact.dollar_impact_usd * topByImpact.probability) / project.capex_usd * 100);
    const headline = topByImpact
      ? `${topByImpact.title} is the binding constraint on ${project.name}.`
      : `${project.name} is in monitoring territory.`;
    const narrative = topByImpact
      ? `${topByImpact.our_view || (topByImpact.description.split(/[.!?]/)[0] + '.')} At ${fmtUsd(topByImpact.dollar_impact_usd)} of capex exposure and ${fmtPct(topByImpact.probability)} probability, this single risk accounts for roughly ${elPct}% of the project's expected loss against ${fmtUsd(project.capex_usd)} of capex. The composite reads ${score.composite}/100, with ${CAT_LABEL[topSubScore.category]} the dominant sub-score driver.`
      : `${project.name} carries a composite of ${score.composite}/100 on ${fmtUsd(project.capex_usd)} of capex. No single risk is currently registering elevated policy attention.`;

    document.getElementById('headline').textContent = headline;
    document.getElementById('thesis').textContent = narrative;

    // ── Project-specific calendar (filter global catalysts) ──
    const calendar = (bundle.catalysts || []).filter(c =>
      (c.affected_project_ids || []).includes(id)
    );
    const calRoot = document.getElementById('calendar');
    if (!calendar.length) {
      calRoot.innerHTML = '<div class="empty">No scheduled catalysts touching this project.</div>';
    } else {
      calRoot.innerHTML = calendar.map(c => {
        const dt = new Date(c.date + (c.date.length === 10 ? 'T12:00:00Z' : ''));
        const day = dt.getUTCDate();
        const ymd = `${MONTH[dt.getUTCMonth()]} ${dt.getUTCFullYear()}`;
        const when = c.day_offset === 0 ? 'today'
          : c.day_offset === 1 ? 'tomorrow'
          : c.day_offset < 7 ? `in ${c.day_offset} days`
          : c.day_offset < 60 ? `in ${Math.round(c.day_offset / 7)} weeks`
          : `in ${Math.round(c.day_offset / 30)} months`;
        return `<a class="calendar-row" href="${escape(c.url || '#')}" ${c.url ? 'target="_blank" rel="noopener"' : ''}>
          <div class="cal-date"><span class="day">${day}</span><span class="ym">${ymd}</span></div>
          <div class="cal-when"><strong>+${c.day_offset}d</strong>${when}</div>
          <div class="cal-body">
            <div class="cal-kind is-${c.kind}">${escape(c.kind === 'market' ? 'Kalshi resolution' : c.kind === 'deadline' ? 'Comment deadline' : c.kind === 'rule' ? 'Rule effective' : c.kind)}</div>
            <h3 class="cal-label">${escape(c.label)}</h3>
            ${c.detail ? `<div class="cal-detail">${escape(c.detail)}</div>` : ''}
          </div>
          <div></div>
        </a>`;
      }).join('');
    }

    // ── Composite contribution chart ─────────────────────
    const compositeBar = stackedBarsByRow([{
      label: 'Composite',
      segments: score.sub_scores.map(s => ({ value: s.contribution, color: CAT_COLOR[s.category] })),
    }], { rowH: 32, labelWidth: 140 });
    document.getElementById('breakdown').innerHTML = `
      <figure class="obs-chart">
        <div class="obs-chart-title">Composite contribution by category</div>
        ${compositeBar}
        <div class="obs-chart-legend">
          <span class="item"><span class="sw is-policy"></span>Policy 35%</span>
          <span class="item"><span class="sw is-trade"></span>Trade 25%</span>
          <span class="item"><span class="sw is-geopolitical"></span>Geopolitical 25%</span>
          <span class="item"><span class="sw is-macro"></span>Macro 15%</span>
        </div>
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

    // ── Top exposures by expected loss ───────────────────
    const topByEL = factors.slice()
      .sort((a, b) => (b.dollar_impact_usd * b.probability) - (a.dollar_impact_usd * a.probability))
      .slice(0, 8);
    const rows = topByEL.map(f => ({
      label: truncate(f.title, 50),
      value: f.dollar_impact_usd * f.probability,
      color: CAT_COLOR[f.category],
    }));
    document.getElementById('exposures').innerHTML = `
      <figure class="obs-chart">
        <div class="obs-chart-title">Top exposures by expected loss</div>
        ${hBarChart(rows, { valueFmt: v => fmtUsd(v), labelWidth: 360, valueLabelWidth: 90 })}
        <div class="obs-chart-legend">
          <span class="item"><span class="sw is-policy"></span>Policy</span>
          <span class="item"><span class="sw is-trade"></span>Trade</span>
          <span class="item"><span class="sw is-geopolitical"></span>Geopolitical</span>
          <span class="item"><span class="sw is-macro"></span>Macro</span>
        </div>
        <p class="obs-chart-caption">
          ${escape(topByEL[0]?.our_view || topByEL[0]?.description?.split(/[.!?]/)[0] || '')}
        </p>
      </figure>
    `;

    document.body.classList.add('is-loaded');
  } catch (e) {
    console.error(e);
    document.getElementById('thesis').textContent = `Could not load data: ${e.message}`;
  }
})();

function escape(s) {
  if (s == null) return '';
  return String(s).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}
function truncate(s, n) { if (!s) return ''; return s.length > n ? s.slice(0, n - 1) + '…' : s; }
