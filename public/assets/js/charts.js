// Minimal SVG chart primitives — no library. Castle-styled.
// Inputs are simple arrays of {label, value, color?} or {x, y, ...}.

import { escapeHtml } from './data.js';

const CAT_COLOR = {
  policy: 'var(--accent-teal)',
  trade: 'var(--accent-teal-deep)',
  geopolitical: 'var(--accent-forest)',
  macro: 'var(--accent-blue-deep)',
};

function fmtTickShort(n) {
  if (n === 0) return '0';
  if (Math.abs(n) >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
  if (Math.abs(n) >= 1e6) return `${(n / 1e6).toFixed(0)}M`;
  if (Math.abs(n) >= 1e3) return `${(n / 1e3).toFixed(0)}K`;
  return `${n}`;
}

// ── Horizontal bar chart ──────────────────────────────────
export function hBarChart(rows, {
  width = 880, rowH = 28, gap = 10, valueFmt = v => v, accent = 'var(--accent-teal)',
  labelWidth = 280, valueLabelWidth = 80, max = null,
} = {}) {
  const m = max ?? Math.max(...rows.map(r => r.value), 1);
  const plotW = width - labelWidth - valueLabelWidth - 32;
  const height = rows.length * (rowH + gap) + 8;
  return `<svg class="chart" viewBox="0 0 ${width} ${height}" role="img">
    ${rows.map((r, i) => {
      const y = i * (rowH + gap) + 4;
      const w = Math.max(1, (r.value / m) * plotW);
      const color = r.color || accent;
      return `
        <text x="0" y="${y + rowH / 2 + 5}" font-family="var(--font-mono)" font-size="12" fill="var(--fg-2)">${escapeHtml(r.label)}</text>
        <rect x="${labelWidth}" y="${y}" width="${plotW}" height="${rowH}" fill="rgba(24,24,24,0.04)"/>
        <rect x="${labelWidth}" y="${y}" width="${w.toFixed(1)}" height="${rowH}" fill="${color}"/>
        <text x="${labelWidth + w + 8}" y="${y + rowH / 2 + 5}" font-family="var(--font-mono)" font-size="12" font-weight="600" fill="var(--fg)" font-variant-numeric="tabular-nums">${escapeHtml(valueFmt(r.value))}</text>
      `;
    }).join('')}
  </svg>`;
}

// ── Stacked horizontal bar chart (one row, segments) ─────
export function stackedBarRow(segments, {
  width = 880, height = 28, valueLabel = null,
} = {}) {
  const total = segments.reduce((a, s) => a + s.value, 0) || 1;
  let x = 0;
  return `<svg class="chart" viewBox="0 0 ${width} ${height}" role="img">
    ${segments.map(s => {
      const w = (s.value / total) * width;
      const seg = `<rect x="${x}" y="0" width="${w}" height="${height}" fill="${s.color || 'var(--fg-2)'}"/>`;
      x += w;
      return seg;
    }).join('')}
  </svg>`;
}

// ── Stacked horizontal bars per row (composite + sub-scores) ─
export function stackedBarsByRow(rows, {
  width = 880, rowH = 28, gap = 10, labelWidth = 220, totalLabelWidth = 56,
} = {}) {
  // each row: { label, segments: [{value, color}], total? }
  const maxTotal = Math.max(...rows.map(r => r.segments.reduce((a, s) => a + s.value, 0)), 1);
  const plotW = width - labelWidth - totalLabelWidth - 32;
  const height = rows.length * (rowH + gap) + 8;
  return `<svg class="chart" viewBox="0 0 ${width} ${height}" role="img">
    ${rows.map((r, i) => {
      const y = i * (rowH + gap) + 4;
      const total = r.segments.reduce((a, s) => a + s.value, 0);
      const scale = plotW / maxTotal;
      let x = labelWidth;
      const segs = r.segments.map(s => {
        const w = s.value * scale;
        const seg = `<rect x="${x.toFixed(1)}" y="${y}" width="${w.toFixed(1)}" height="${rowH}" fill="${s.color}"/>`;
        x += w;
        return seg;
      }).join('');
      return `
        <text x="0" y="${y + rowH / 2 + 5}" font-family="var(--font-body)" font-size="13" fill="var(--fg-2)">${escapeHtml(r.label)}</text>
        <rect x="${labelWidth}" y="${y}" width="${plotW}" height="${rowH}" fill="rgba(24,24,24,0.04)"/>
        ${segs}
        <text x="${labelWidth + plotW + 8}" y="${y + rowH / 2 + 5}" font-family="var(--font-mono)" font-size="13" font-weight="600" fill="var(--fg)" font-variant-numeric="tabular-nums">${Math.round(total)}</text>
      `;
    }).join('')}
  </svg>`;
}

// ── Scatter chart ────────────────────────────────────────
export function scatter(points, {
  width = 880, height = 360, xLabel = '', yLabel = '',
  xMax = null, yMax = null, xFmt = v => v, yFmt = v => v,
  quadrantLabel = null, padL = 56, padR = 16, padT = 16, padB = 40,
} = {}) {
  const xMx = xMax ?? Math.max(...points.map(p => p.x), 1);
  const yMx = yMax ?? Math.max(...points.map(p => p.y), 1);
  const plotW = width - padL - padR;
  const plotH = height - padT - padB;
  const sx = v => padL + (v / xMx) * plotW;
  const sy = v => padT + plotH - (v / yMx) * plotH;

  // 4 axis gridlines
  const gridX = [0.25, 0.5, 0.75, 1].map(t => {
    const x = padL + plotW * t;
    return `<line x1="${x}" y1="${padT}" x2="${x}" y2="${padT + plotH}" stroke="rgba(24,24,24,0.06)"/>
      <text x="${x}" y="${padT + plotH + 18}" font-family="var(--font-mono)" font-size="10" fill="var(--fg-3)" text-anchor="middle">${xFmt(xMx * t)}</text>`;
  }).join('');
  const gridY = [0.25, 0.5, 0.75, 1].map(t => {
    const y = padT + plotH - plotH * t;
    return `<line x1="${padL}" y1="${y}" x2="${padL + plotW}" y2="${y}" stroke="rgba(24,24,24,0.06)"/>
      <text x="${padL - 8}" y="${y + 4}" font-family="var(--font-mono)" font-size="10" fill="var(--fg-3)" text-anchor="end">${yFmt(yMx * t)}</text>`;
  }).join('');

  return `<svg class="chart" viewBox="0 0 ${width} ${height}" role="img">
    ${gridX}${gridY}
    <line x1="${padL}" y1="${padT + plotH}" x2="${padL + plotW}" y2="${padT + plotH}" stroke="var(--border-strong)"/>
    <line x1="${padL}" y1="${padT}" x2="${padL}" y2="${padT + plotH}" stroke="var(--border-strong)"/>
    ${quadrantLabel ? `<text x="${padL + plotW - 8}" y="${padT + 16}" font-family="var(--font-mono)" font-size="10" letter-spacing="0.15em" text-transform="uppercase" fill="var(--fg-3)" text-anchor="end">${escapeHtml(quadrantLabel)}</text>` : ''}
    ${points.map(p => {
      const r = p.r ?? 4;
      const color = p.color || 'var(--accent-teal)';
      return `<g><circle cx="${sx(p.x).toFixed(1)}" cy="${sy(p.y).toFixed(1)}" r="${r}" fill="${color}" fill-opacity="0.75" stroke="var(--bg-card)" stroke-width="1.5"><title>${escapeHtml(p.label || '')}</title></circle>${p.tag ? `<text x="${sx(p.x).toFixed(1) + r + 4}" y="${sy(p.y).toFixed(1) + 3}" font-family="var(--font-mono)" font-size="10" fill="var(--fg-3)">${escapeHtml(p.tag)}</text>` : ''}</g>`;
    }).join('')}
    ${xLabel ? `<text x="${padL + plotW / 2}" y="${height - 6}" font-family="var(--font-mono)" font-size="10" letter-spacing="0.15em" text-transform="uppercase" fill="var(--fg-3)" text-anchor="middle">${escapeHtml(xLabel)}</text>` : ''}
    ${yLabel ? `<text x="${padL - 40}" y="${padT + plotH / 2}" font-family="var(--font-mono)" font-size="10" letter-spacing="0.15em" text-transform="uppercase" fill="var(--fg-3)" text-anchor="middle" transform="rotate(-90, ${padL - 40}, ${padT + plotH / 2})">${escapeHtml(yLabel)}</text>` : ''}
  </svg>`;
}

// ── Bar chart with weeks on x-axis (attention timeline) ──
export function weeklyBars(values, {
  width = 880, height = 240, padL = 40, padR = 16, padT = 16, padB = 30,
  accent = 'var(--accent-teal)', labels = null, highlight = null,
} = {}) {
  const max = Math.max(...values, 1);
  const plotW = width - padL - padR;
  const plotH = height - padT - padB;
  const bw = plotW / values.length - 4;
  const gridLines = [0.25, 0.5, 0.75, 1].map(t => {
    const y = padT + plotH - plotH * t;
    return `<line x1="${padL}" y1="${y}" x2="${padL + plotW}" y2="${y}" stroke="rgba(24,24,24,0.06)"/>
      <text x="${padL - 6}" y="${y + 4}" font-family="var(--font-mono)" font-size="10" fill="var(--fg-3)" text-anchor="end">${Math.round(max * t)}</text>`;
  }).join('');
  return `<svg class="chart" viewBox="0 0 ${width} ${height}" role="img">
    ${gridLines}
    <line x1="${padL}" y1="${padT + plotH}" x2="${padL + plotW}" y2="${padT + plotH}" stroke="var(--border-strong)"/>
    ${values.map((v, i) => {
      const x = padL + i * (plotW / values.length) + 2;
      const h = (v / max) * plotH;
      const y = padT + plotH - h;
      const color = (highlight === i) ? 'var(--fg)' : accent;
      const tagY = padT + plotH + 16;
      const tag = labels ? labels[i] : `w${values.length - i}`;
      return `<g>
        <rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${bw.toFixed(1)}" height="${h.toFixed(1)}" fill="${color}" fill-opacity="${v ? 1 : 0.15}"/>
        <text x="${(x + bw / 2).toFixed(1)}" y="${tagY}" font-family="var(--font-mono)" font-size="9" fill="var(--fg-3)" text-anchor="middle">${tag}</text>
      </g>`;
    }).join('')}
  </svg>`;
}

// ── Donut chart (foreign supply concentration) ───────────
export function donut(segments, { width = 320, height = 320, inner = 0.55, accent = 'var(--accent-teal)' } = {}) {
  const cx = width / 2;
  const cy = height / 2;
  const r = Math.min(width, height) / 2 - 8;
  const rInner = r * inner;
  const total = segments.reduce((a, s) => a + s.value, 0) || 1;
  let start = -Math.PI / 2;
  const colorWheel = ['var(--accent-teal)', 'var(--accent-teal-deep)', 'var(--accent-forest)', 'var(--accent-blue-deep)', 'var(--accent-teal-midnight)', 'var(--fg-3)'];
  return `<svg class="chart" viewBox="0 0 ${width} ${height}" role="img">
    ${segments.map((s, i) => {
      const angle = (s.value / total) * Math.PI * 2;
      const end = start + angle;
      const x1 = cx + Math.cos(start) * r;
      const y1 = cy + Math.sin(start) * r;
      const x2 = cx + Math.cos(end) * r;
      const y2 = cy + Math.sin(end) * r;
      const xi2 = cx + Math.cos(end) * rInner;
      const yi2 = cy + Math.sin(end) * rInner;
      const xi1 = cx + Math.cos(start) * rInner;
      const yi1 = cy + Math.sin(start) * rInner;
      const large = angle > Math.PI ? 1 : 0;
      const color = s.color || colorWheel[i % colorWheel.length];
      const d = `M${x1.toFixed(1)},${y1.toFixed(1)} A${r},${r} 0 ${large} 1 ${x2.toFixed(1)},${y2.toFixed(1)} L${xi2.toFixed(1)},${yi2.toFixed(1)} A${rInner},${rInner} 0 ${large} 0 ${xi1.toFixed(1)},${yi1.toFixed(1)} Z`;
      start = end;
      return `<path d="${d}" fill="${color}"><title>${escapeHtml(s.label)} — ${Math.round(s.value / total * 100)}%</title></path>`;
    }).join('')}
  </svg>`;
}

// ── Catalyst timeline ─────────────────────────────────────
export function timeline(events, {
  width = 880, height = 120, fromDays = 0, toDays = 90, padL = 60, padR = 60,
} = {}) {
  // Each event: { date: iso string, label, source }
  const plotW = width - padL - padR;
  const y = height / 2;
  const dayToX = d => padL + Math.min(1, Math.max(0, (d - fromDays) / (toDays - fromDays))) * plotW;
  const monthTicks = [];
  for (let m = 0; m <= 3; m++) {
    const d = m * 30;
    monthTicks.push(`<line x1="${dayToX(d)}" y1="${y - 8}" x2="${dayToX(d)}" y2="${y + 8}" stroke="var(--border-strong)"/>
      <text x="${dayToX(d)}" y="${y + 28}" font-family="var(--font-mono)" font-size="10" fill="var(--fg-3)" text-anchor="middle">${m === 0 ? 'today' : '+' + d + 'd'}</text>`);
  }
  const sourceColor = { congress: 'var(--accent-teal)', federal_register: 'var(--accent-forest)', kalshi: 'var(--accent-blue-deep)' };
  return `<svg class="chart" viewBox="0 0 ${width} ${height}" role="img">
    <line x1="${padL}" y1="${y}" x2="${width - padR}" y2="${y}" stroke="var(--border-strong)"/>
    ${monthTicks.join('')}
    ${events.map((e, i) => {
      const x = dayToX(e.dayOffset);
      const color = sourceColor[e.source] || 'var(--fg)';
      const labelY = (i % 2 === 0) ? y - 18 : y + 36;
      return `<g><circle cx="${x.toFixed(1)}" cy="${y}" r="4" fill="${color}"/>
        <text x="${x.toFixed(1)}" y="${labelY}" font-family="var(--font-mono)" font-size="10" fill="var(--fg-2)" text-anchor="middle">${escapeHtml(e.label.slice(0, 28))}</text></g>`;
    }).join('')}
  </svg>`;
}

export { CAT_COLOR, fmtTickShort };
