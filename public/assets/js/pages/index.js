import { loadAll, fmtUsd } from '../data.js';
import { stackedBarsByRow, CAT_COLOR } from '../charts.js';

const CAT_LABEL = { policy: 'Policy', trade: 'Trade', geopolitical: 'Geopolitical', macro: 'Macro' };
const MONTH = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

(async function init() {
  try {
    const { bundle, projects } = await loadAll();
    const projectMap = new Map(projects.map(p => [p.id, p]));

    // ── Masthead ─────────────────────────────────────────
    const totalCapex = projects.reduce((s, p) => s + p.capex_usd, 0);
    const weightedScore = Math.round(projects.reduce((s, p) => {
      const sc = bundle.scores.find(x => x.project_id === p.id);
      return s + (sc ? sc.composite * p.capex_usd : 0);
    }, 0) / totalCapex);

    document.getElementById('masthead').innerHTML = `
      <div class="left">
        <span class="pub">Castle Energy Risk Observations</span>
        <span class="date">${escape(bundle.observation.week_label)} · ${fmtUsd(totalCapex)} tracked across ${projects.length} projects</span>
      </div>
      <div class="issue">
        Composite read
        <strong>${weightedScore}<span style="font-size:14px;color:var(--fg-3);font-weight:600">/100</span></strong>
        capex-weighted
      </div>
    `;

    // ── Claude-written headline + thesis ─────────────────
    document.getElementById('headline').textContent = bundle.observation.headline || '';
    document.getElementById('thesis').textContent = bundle.observation.thesis || '';

    // ── Catalyst calendar ────────────────────────────────
    const calendar = bundle.catalysts || [];
    if (calendar.length === 0) {
      document.getElementById('calendar').innerHTML = '<div class="empty">No scheduled catalysts inside the 13-month window.</div>';
    } else {
      document.getElementById('calendar').innerHTML = calendar.map(c => {
        const dt = new Date(c.date + (c.date.length === 10 ? 'T12:00:00Z' : ''));
        const day = dt.getUTCDate();
        const ymd = `${MONTH[dt.getUTCMonth()]} ${dt.getUTCFullYear()}`;
        const when = c.day_offset === 0 ? 'today'
          : c.day_offset === 1 ? 'tomorrow'
          : c.day_offset < 7 ? `in ${c.day_offset} days`
          : c.day_offset < 60 ? `in ${Math.round(c.day_offset / 7)} weeks`
          : `in ${Math.round(c.day_offset / 30)} months`;
        const chips = (c.affected_project_ids || []).map(id => {
          const p = projectMap.get(id);
          return p ? `<span class="chip">${escape(p.name)}</span>` : '';
        }).join('');
        return `<a class="calendar-row" href="${escape(c.url || '#')}" ${c.url ? 'target="_blank" rel="noopener"' : ''}>
          <div class="cal-date"><span class="day">${day}</span><span class="ym">${ymd}</span></div>
          <div class="cal-when"><strong>+${c.day_offset}d</strong>${when}</div>
          <div class="cal-body">
            <div class="cal-kind is-${c.kind}">${escape(c.kind === 'market' ? 'Kalshi resolution' : c.kind === 'deadline' ? 'Comment deadline' : c.kind === 'rule' ? 'Rule effective' : c.kind)}</div>
            <h3 class="cal-label">${escape(c.label)}</h3>
            ${c.detail ? `<div class="cal-detail">${escape(c.detail)}</div>` : ''}
          </div>
          <div class="cal-affected">${chips}</div>
        </a>`;
      }).join('');
    }

    // ── Composite by project (the one chart that earns its place) ──
    const sortedProjects = projects.slice().sort((a, b) => {
      const sa = bundle.scores.find(s => s.project_id === a.id).composite;
      const sb = bundle.scores.find(s => s.project_id === b.id).composite;
      return sb - sa;
    });
    const stackRows = sortedProjects.map(p => {
      const sc = bundle.scores.find(s => s.project_id === p.id);
      return {
        label: p.name,
        segments: sc.sub_scores.map(s => ({ value: s.contribution, color: CAT_COLOR[s.category] })),
      };
    });
    const heaviest = sortedProjects[0];
    const heaviestScore = bundle.scores.find(s => s.project_id === heaviest.id);
    const heaviestTop = heaviestScore.sub_scores.slice().sort((a, b) => b.contribution - a.contribution)[0];
    document.getElementById('chart').innerHTML = `
      <figure class="obs-chart">
        <div class="obs-chart-title">Composite risk by project</div>
        ${stackedBarsByRow(stackRows)}
        <div class="obs-chart-legend">
          <span class="item"><span class="sw is-policy"></span>Policy 35%</span>
          <span class="item"><span class="sw is-trade"></span>Trade 25%</span>
          <span class="item"><span class="sw is-geopolitical"></span>Geopolitical 25%</span>
          <span class="item"><span class="sw is-macro"></span>Macro 15%</span>
        </div>
        <p class="obs-chart-caption">
          <strong>${escape(heaviest.name)}</strong> reads heaviest at ${heaviestScore.composite}/100,
          ${CAT_LABEL[heaviestTop.category]}-led. <strong>${escape(sortedProjects[sortedProjects.length - 1].name)}</strong> lightest at
          ${bundle.scores.find(s => s.project_id === sortedProjects[sortedProjects.length - 1].id).composite}.
        </p>
      </figure>
    `;

    // ── Compact project links ────────────────────────────
    document.getElementById('projects').innerHTML = projects.map(p => {
      const sc = bundle.scores.find(s => s.project_id === p.id);
      return `<a class="project-link" href="project.html?id=${encodeURIComponent(p.id)}">
        <div class="pl-score num">${sc.composite}</div>
        <div class="pl-body">
          <div class="pl-name">${escape(p.name)}</div>
          <div class="pl-meta">${escape(p.technology)} · ${escape(p.capacity_label)} · ${escape(p.location)}</div>
        </div>
        <div class="pl-arrow">→</div>
      </a>`;
    }).join('');

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
