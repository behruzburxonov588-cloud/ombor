// Grafiklar: chiziqli, ustunli va kichik (sparkline). SVG, kutubxonasiz.
// Qoidalar: ingichka chiziqlar (2px), ustun eni 24px dan oshmaydi, to'r chiziqlari xira,
// sichqoncha yoki klaviatura bilan har bir nuqtaning qiymati ko'rinadi.
import { compact, esc } from './ui.js';

const NS = 'http://www.w3.org/2000/svg';
const SURFACE = '#ffffff';
const GRID = '#edf0f5';
const AXIS = '#d3d9e3';

function niceTicks(min, max, count = 4) {
  if (min === max) {
    if (max === 0) return [0, 1];
    min = Math.min(0, min);
    max = max > 0 ? max * 1.2 : 0;
  }
  const span = max - min;
  const raw = span / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const norm = raw / mag;
  const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10) * mag;
  const lo = Math.floor(min / step) * step;
  const hi = Math.ceil(max / step) * step;
  const out = [];
  for (let v = lo; v <= hi + step / 2; v += step) out.push(Math.round(v * 1e6) / 1e6);
  return out;
}

function el(tag, attrs = {}, parent = null) {
  const node = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v !== undefined && v !== null) node.setAttribute(k, v);
  if (parent) parent.appendChild(node);
  return node;
}

function textWidth(s) {
  return String(s).length * 6.2;
}

// Ustun: ma'lumot uchida 4px yumaloq, asosda to'g'ri burchak
function barPath(x, w, y0, y1, r = 4) {
  const h = Math.abs(y1 - y0);
  if (h < 0.5) return '';
  const rr = Math.min(r, w / 2, h);
  if (y1 < y0) {
    return `M${x},${y0}V${y1 + rr}Q${x},${y1} ${x + rr},${y1}H${x + w - rr}Q${x + w},${y1} ${x + w},${y1 + rr}V${y0}Z`;
  }
  return `M${x},${y0}V${y1 - rr}Q${x},${y1} ${x + rr},${y1}H${x + w - rr}Q${x + w},${y1} ${x + w},${y1 - rr}V${y0}Z`;
}

function buildTooltip(wrap) {
  let tip = wrap.querySelector('.chart-tip');
  if (!tip) {
    tip = document.createElement('div');
    tip.className = 'chart-tip';
    tip.setAttribute('role', 'status');
    wrap.appendChild(tip);
  }
  return tip;
}

// Tooltip mazmuni: textContent orqali (nomlar foydalanuvchi kiritgan bo'lishi mumkin)
function fillTooltip(tip, title, rows) {
  tip.replaceChildren();
  const t = document.createElement('div');
  t.className = 'tt';
  t.textContent = title;
  tip.appendChild(t);
  for (const r of rows) {
    const row = document.createElement('div');
    row.className = 'tr';
    const key = document.createElement('i');
    key.style.background = r.color;
    key.style.color = r.color;
    if (r.dashed) key.className = 'dash';
    const b = document.createElement('b');
    b.textContent = r.value;
    const name = document.createElement('span');
    name.textContent = r.name;
    row.append(key, b, name);
    tip.appendChild(row);
  }
}

function placeTooltip(tip, wrap, x, y) {
  tip.classList.add('show');
  const w = tip.offsetWidth;
  const W = wrap.clientWidth;
  let left = x + 14;
  if (left + w > W) left = x - w - 14;
  tip.style.left = `${Math.max(0, left)}px`;
  tip.style.top = `${Math.max(0, y)}px`;
}

function observe(container, draw) {
  let lastW = 0;
  const run = () => {
    const w = Math.round(container.clientWidth);
    if (!w || w === lastW) return;
    lastW = w;
    draw(w);
  };
  const ro = new ResizeObserver(() => requestAnimationFrame(run));
  ro.observe(container);
  run();
  return () => ro.disconnect();
}

function xTickStride(n, plotW) {
  const max = Math.max(2, Math.floor(plotW / 58));
  return Math.max(1, Math.ceil(n / max));
}

// ---------- Umumiy chizma (chiziqlar va ustunlar bitta o'qda) ----------
// opts: { labels, tickLabel(i), titleFor(i), series: [{ name, values, color, kind: 'line'|'bar', dashed, area, width, colorFor(v) }],
//         band: { low, high, color, name }, format(v), axisFormat(v), height, ariaLabel }
export function chart(container, opts) {
  container.classList.add('chart-wrap');
  const height = opts.height || 240;
  const format = opts.format || ((v) => compact(v, { unit: true }));
  const axisFormat = opts.axisFormat || ((v) => compact(v));
  const n = opts.labels.length;
  let state = { index: null };

  const draw = (W) => {
    container.querySelector('svg')?.remove();
    const all = [];
    for (const s of opts.series) for (const v of s.values) if (v !== null && v !== undefined) all.push(Number(v));
    if (opts.band) for (const v of [...opts.band.low, ...opts.band.high]) if (v !== null && v !== undefined) all.push(Number(v));
    const ticks = niceTicks(Math.min(0, ...all), Math.max(0, ...all), opts.ticks || 4);
    const yMin = ticks[0];
    const yMax = ticks[ticks.length - 1];
    const padL = Math.max(...ticks.map((t) => textWidth(axisFormat(t)))) + 12;
    const pad = { l: padL, r: 10, t: 10, b: 26 };
    const plotW = Math.max(40, W - pad.l - pad.r);
    const plotH = height - pad.t - pad.b;
    const y = (v) => pad.t + plotH - ((Number(v) - yMin) / (yMax - yMin || 1)) * plotH;
    const hasBars = opts.series.some((s) => s.kind === 'bar');
    const band = plotW / Math.max(n, 1);
    const x = (i) => (hasBars || n === 1 ? pad.l + band * i + band / 2 : pad.l + (plotW * i) / Math.max(n - 1, 1));

    const svg = el('svg', {
      viewBox: `0 0 ${W} ${height}`, height, role: 'img', tabindex: '0',
      'aria-label': opts.ariaLabel || 'Grafik',
    });
    const gGrid = el('g', { class: 'axis' }, svg);
    for (const t of ticks) {
      const yy = Math.round(y(t)) + 0.5;
      el('line', { x1: pad.l, x2: W - pad.r, y1: yy, y2: yy, stroke: t === 0 ? AXIS : GRID, 'stroke-width': 1 }, gGrid);
      const label = el('text', { x: pad.l - 8, y: yy + 4, 'text-anchor': 'end' }, gGrid);
      label.textContent = axisFormat(t);
    }
    const stride = xTickStride(n, plotW);
    for (let i = 0; i < n; i += 1) {
      if (i % stride !== 0 && i !== n - 1) continue;
      if (i === n - 1 && i % stride !== 0 && (n - 1) % stride < stride * 0.6) continue;
      const label = el('text', { x: x(i), y: height - 8, 'text-anchor': 'middle' }, gGrid);
      label.textContent = opts.tickLabel ? opts.tickLabel(i) : opts.labels[i];
    }

    // Hover fon (ustunlar uchun)
    const hoverBg = el('rect', { y: pad.t, height: plotH, width: band, fill: '#f1f5f9', opacity: 0, rx: 6 }, svg);

    // Taxminiy oraliq (prognoz)
    if (opts.band) {
      const pts = [];
      opts.band.high.forEach((v, i) => { if (v !== null) pts.push(`${x(i)},${y(v)}`); });
      const back = [];
      opts.band.low.forEach((v, i) => { if (v !== null) back.unshift(`${x(i)},${y(v)}`); });
      if (pts.length) el('polygon', { points: [...pts, ...back].join(' '), fill: opts.band.color, opacity: 0.1 }, svg);
    }

    // Ustunlar
    const bars = opts.series.filter((s) => s.kind === 'bar');
    if (bars.length) {
      const bw = Math.max(2, Math.min(24, (band * 0.72 - (bars.length - 1) * 2) / bars.length));
      const groupW = bw * bars.length + (bars.length - 1) * 2;
      const y0 = y(0);
      bars.forEach((s, si) => {
        s.values.forEach((v, i) => {
          if (v === null || v === undefined || Number(v) === 0) return;
          const bx = x(i) - groupW / 2 + si * (bw + 2);
          const d = barPath(bx, bw, y0, y(v));
          if (d) el('path', { d, fill: s.colorFor ? s.colorFor(Number(v)) : s.color, opacity: s.opacity ?? 1 }, svg);
        });
      });
    }

    // Chiziqlar
    const dots = [];
    for (const s of opts.series.filter((q) => q.kind !== 'bar')) {
      const segs = [];
      let cur = [];
      s.values.forEach((v, i) => {
        if (v === null || v === undefined) {
          if (cur.length) segs.push(cur);
          cur = [];
        } else cur.push([x(i), y(v)]);
      });
      if (cur.length) segs.push(cur);
      for (const seg of segs) {
        if (s.area && seg.length > 1) {
          const base = y(Math.max(yMin, 0));
          el('path', {
            d: `M${seg[0][0]},${base}L${seg.map((p) => p.join(',')).join('L')}L${seg[seg.length - 1][0]},${base}Z`,
            fill: s.color, opacity: 0.08,
          }, svg);
        }
        el('path', {
          d: `M${seg.map((p) => p.join(',')).join('L')}`, fill: 'none', stroke: s.color, 'stroke-width': s.width || 2,
          'stroke-linejoin': 'round', 'stroke-linecap': 'round', 'stroke-dasharray': s.dashed ? '5 4' : null,
        }, svg);
        if (seg.length === 1) el('circle', { cx: seg[0][0], cy: seg[0][1], r: 3.5, fill: s.color }, svg);
      }
      if (s.endDot) {
        const last = [...s.values].map((v, i) => [v, i]).filter(([v]) => v !== null && v !== undefined).pop();
        if (last) el('circle', { cx: x(last[1]), cy: y(last[0]), r: 4, fill: s.color, stroke: SURFACE, 'stroke-width': 2 }, svg);
      }
      dots.push(el('circle', { r: 4, fill: s.color, stroke: SURFACE, 'stroke-width': 2, opacity: 0 }, svg));
    }

    const cross = el('line', { y1: pad.t, y2: pad.t + plotH, stroke: '#9aa1ad', 'stroke-width': 1, opacity: 0 }, svg);
    const hit = el('rect', { x: pad.l, y: 0, width: plotW, height: height - 6, fill: 'transparent' }, svg);
    container.insertBefore(svg, container.firstChild);
    const tip = buildTooltip(container);

    const show = (i) => {
      if (i === null || i < 0 || i >= n) return;
      state.index = i;
      const cx = x(i);
      if (hasBars) {
        hoverBg.setAttribute('x', pad.l + band * i + 1);
        hoverBg.setAttribute('width', Math.max(0, band - 2));
        hoverBg.setAttribute('opacity', 1);
      } else {
        cross.setAttribute('x1', cx);
        cross.setAttribute('x2', cx);
        cross.setAttribute('opacity', 1);
      }
      let di = 0;
      for (const s of opts.series.filter((q) => q.kind !== 'bar')) {
        const v = s.values[i];
        const dot = dots[di++];
        if (v === null || v === undefined) dot.setAttribute('opacity', 0);
        else {
          dot.setAttribute('cx', cx);
          dot.setAttribute('cy', y(v));
          dot.setAttribute('opacity', 1);
        }
      }
      const rows = opts.series
        .filter((s) => s.values[i] !== null && s.values[i] !== undefined && !s.hideInTooltip)
        .map((s) => ({
          name: s.name, value: format(s.values[i], s), dashed: s.dashed,
          color: s.colorFor ? s.colorFor(Number(s.values[i])) : s.color,
        }));
      if (opts.band && opts.band.low[i] !== null && opts.band.low[i] !== undefined) {
        rows.push({ name: opts.band.name || 'Oraliq', value: `${compact(opts.band.low[i])} – ${compact(opts.band.high[i])}`, color: opts.band.color });
      }
      fillTooltip(tip, opts.titleFor ? opts.titleFor(i) : opts.labels[i], rows);
      placeTooltip(tip, container, cx, pad.t);
    };
    const hide = () => {
      state.index = null;
      cross.setAttribute('opacity', 0);
      hoverBg.setAttribute('opacity', 0);
      dots.forEach((d) => d.setAttribute('opacity', 0));
      tip.classList.remove('show');
    };
    const indexAt = (clientX) => {
      const r = svg.getBoundingClientRect();
      const px = ((clientX - r.left) / r.width) * W;
      if (hasBars || n === 1) return Math.min(n - 1, Math.max(0, Math.floor((px - pad.l) / band)));
      return Math.min(n - 1, Math.max(0, Math.round(((px - pad.l) / plotW) * (n - 1))));
    };
    hit.addEventListener('pointermove', (e) => show(indexAt(e.clientX)));
    hit.addEventListener('pointerdown', (e) => show(indexAt(e.clientX)));
    svg.addEventListener('pointerleave', hide);
    svg.addEventListener('focus', () => show(state.index ?? n - 1));
    svg.addEventListener('blur', hide);
    svg.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowRight') { show(Math.min(n - 1, (state.index ?? -1) + 1)); e.preventDefault(); }
      if (e.key === 'ArrowLeft') { show(Math.max(0, (state.index ?? n) - 1)); e.preventDefault(); }
      if (e.key === 'Escape') hide();
    });
  };
  const stop = observe(container, draw);
  return { destroy: stop };
}

// ---------- Kichik grafik (KPI kartochkalari uchun) ----------
export function sparkline(values, { color = '#2563eb', width = 120, height = 28, area = true, dot = false } = {}) {
  const vals = values.map((v) => Number(v || 0));
  if (!vals.length) return '';
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const flat = max === min;
  const px = (i) => (vals.length === 1 ? width / 2 : 2 + (i * (width - 4)) / (vals.length - 1));
  const py = (v) => (flat ? height - 4 : 3 + (1 - (v - min) / (max - min)) * (height - 7));
  const pts = vals.map((v, i) => `${px(i).toFixed(1)},${py(v).toFixed(1)}`);
  const c = flat ? '#c4c9d1' : color;
  const fill = area && !flat
    ? `<path d="M${px(0)},${height}L${pts.join('L')}L${px(vals.length - 1)},${height}Z" fill="${c}" opacity=".08"/>` : '';
  const last = pts[pts.length - 1].split(',');
  return `<svg class="spark" viewBox="0 0 ${width} ${height}" aria-hidden="true" preserveAspectRatio="none">${fill}<path d="M${pts.join('L')}" fill="none" stroke="${c}" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/>${dot ? `<circle cx="${last[0]}" cy="${last[1]}" r="2.4" fill="${c}"/>` : ''}</svg>`;
}

// ---------- Gorizontal ustunlar (HTML) ----------
export function hbars(rows, { format = (v) => compact(v, { unit: true }), color = 'var(--series-1)' } = {}) {
  const max = Math.max(1, ...rows.map((r) => Math.abs(Number(r.value) || 0)));
  return rows.map((r) => `
    <div class="bar-row">
      <div class="small" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(r.label)}${r.sub ? ` <span class="muted">· ${esc(r.sub)}</span>` : ''}</div>
      <div class="small strong tnum">${esc(format(r.value))}</div>
      <div class="track"><div class="fill" style="width:${((Math.abs(Number(r.value) || 0) / max) * 100).toFixed(1)}%;background:${r.color || color}"></div></div>
    </div>`).join('');
}

// Bir butunning qismlari (masalan, ombor holati)
export function segbar(parts) {
  const total = parts.reduce((s, p) => s + Math.max(0, Number(p.value) || 0), 0);
  if (!total) return '<div class="segbar"></div>';
  return `<div class="segbar" role="img" aria-label="${esc(parts.map((p) => `${p.label}: ${p.value}`).join(', '))}">${parts
    .filter((p) => Number(p.value) > 0)
    .map((p) => `<span style="width:${((p.value / total) * 100).toFixed(2)}%;background:${p.color}" title="${esc(`${p.label}: ${p.value}`)}"></span>`)
    .join('')}</div>`;
}

// Grafikning jadval ko'rinishi (qiymatlarni grafiksiz ham o'qish mumkin)
export function tableView(columns, rows) {
  return `<div class="chart-table"><table><thead><tr>${columns.map((c) => `<th class="${c.right ? 'right' : ''}">${esc(c.label)}</th>`).join('')}</tr></thead>
    <tbody>${rows.map((r) => `<tr>${columns.map((c) => `<td class="${c.right ? 'right num' : ''}">${esc(c.get(r))}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
}
