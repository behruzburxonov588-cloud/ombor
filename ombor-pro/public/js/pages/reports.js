// Hisobotlar: davr bo'yicha xulosa, kunlik/oylik taqsimot va mahsulot foydasi
import { get, icon, esc, num, money, qty, toast, addDaysStr, todayStr, monthStartStr } from '../ui.js';

const PRESETS = [
  { key: 'today', label: 'Bugun' },
  { key: 'week', label: '7 kun' },
  { key: 'month', label: 'Shu oy' },
  { key: 'year', label: 'Shu yil' },
  { key: 'custom', label: 'Boshqa davr' },
];
const GRAINS = [
  { key: 'daily', label: 'Kunlik' },
  { key: 'weekly', label: 'Haftalik' },
  { key: 'monthly', label: 'Oylik' },
  { key: 'yearly', label: 'Yillik' },
];
const GRAIN_LABEL = { daily: 'Sana', weekly: 'Hafta boshi', monthly: 'Oy', yearly: 'Yil' };

function resolvePeriod(q) {
  const today = todayStr();
  const preset = q.p || 'month';
  if (preset === 'custom' && q.from && q.to) return { preset, from: q.from, to: q.to };
  if (preset === 'today') return { preset, from: today, to: today };
  if (preset === 'week') return { preset, from: addDaysStr(today, -6), to: today };
  if (preset === 'year') return { preset, from: `${today.slice(0, 4)}-01-01`, to: today };
  return { preset: 'month', from: monthStartStr(today), to: today };
}

export async function render(root, params, ctx) {
  const q = params.query;
  const { preset, from, to } = resolvePeriod(q);
  const grain = GRAINS.some((g) => g.key === q.period) ? q.period : 'daily';

  // Havola: joriy filtrlarni saqlab, o'zgargan qismini almashtiradi
  const link = (over) => {
    const next = { p: preset, period: grain, ...over };
    if (next.p === 'custom') {
      next.from = next.from ?? from;
      next.to = next.to ?? to;
    }
    const usp = new URLSearchParams();
    for (const [k, v] of Object.entries(next)) {
      if (v !== undefined && v !== null && v !== '') usp.set(k, String(v));
    }
    return `#/reports?${usp}`;
  };

  const [sum, series, prod] = await Promise.all([
    get(`/reports/summary?from=${from}&to=${to}`),
    get(`/reports/sales?period=${grain}&from=${from}&to=${to}`),
    get(`/reports/products?from=${from}&to=${to}`),
  ]);
  const s = sum.summary;
  const profitTone = (v) => (Number(v) >= 0 ? 'good' : 'bad');

  root.innerHTML = `
    <div class="page-head no-print">
      <div><h1>Hisobotlar</h1><p class="muted">${esc(from)} — ${esc(to)}</p></div>
      <button class="btn btn-light" type="button" id="printbtn">${icon('print', 'ico-sm')} Chop etish</button>
    </div>

    <div class="card no-print" style="margin-bottom:14px">
      <div class="chips" style="margin-bottom:10px">
        ${PRESETS.map((p) => `<a class="chip ${p.key === preset ? 'active' : ''}" href="${link({ p: p.key })}">${p.label}</a>`).join('')}
      </div>
      ${preset === 'custom' ? `<div class="form-grid two" style="gap:10px;margin-bottom:10px">
        <label class="field"><span>Boshlanish</span><input class="input" type="date" id="cf" value="${esc(from)}"></label>
        <label class="field"><span>Tugash</span><input class="input" type="date" id="ct" value="${esc(to)}"></label>
      </div>` : ''}
      <div class="seg" style="flex-wrap:wrap">
        ${GRAINS.map((g) => `<button type="button" data-grain="${g.key}" class="${g.key === grain ? 'active' : ''}">${g.label}</button>`).join('')}
      </div>
    </div>

    <div class="kpis">
      <div class="kpi neutral"><div class="label">Sof savdo</div><div class="value">${money(s.net_sales)}</div>
        <div class="hint">${s.sales_count} ta savdo, qaytarish ${money(s.returns_amount)}</div></div>
      <div class="kpi ${profitTone(s.gross_profit)}"><div class="label">Yalpi foyda</div><div class="value">${money(s.gross_profit)}</div>
        <div class="hint">marja ${num(s.margin_percent, 1)}%</div></div>
      <div class="kpi ${profitTone(s.net_profit)}"><div class="label">Sof foyda</div><div class="value">${money(s.net_profit)}</div>
        <div class="hint">xarajat va zararlardan keyin</div></div>
      <div class="kpi neutral"><div class="label">Xarajatlar</div><div class="value">${money(s.expenses)}</div><div class="hint">davr bo'yicha</div></div>
      <div class="kpi ${Number(s.losses) > 0 ? 'warn' : 'neutral'}"><div class="label">Zarar (yaroqsiz)</div><div class="value">${money(s.losses)}</div><div class="hint">ombor zararlari</div></div>
      <div class="kpi ${Number(s.credit_sales) > 0 ? 'warn' : 'neutral'}"><div class="label">Nasiya savdo</div><div class="value">${money(s.credit_sales)}</div><div class="hint">hali to'lanmagan</div></div>
      <div class="kpi good"><div class="label">Naqd tushum</div><div class="value">${money(s.cash_received)}</div><div class="hint">savdo va qarz to'lovlari</div></div>
      <div class="kpi neutral"><div class="label">Kirimlar</div><div class="value">${money(s.purchases_total)}</div><div class="hint">${s.purchases_count} ta kirim</div></div>
    </div>

    <div class="card" style="margin-top:14px">
      <div class="card-head"><h2>${GRAINS.find((g) => g.key === grain).label} taqsimot</h2></div>
      ${series.rows.length ? `<div class="table-wrap cards"><table>
        <thead><tr><th>${GRAIN_LABEL[grain]}</th><th class="right">Savdolar</th><th class="right">Yalpi savdo</th><th class="right">Qaytarish</th><th class="right">Sof savdo</th><th class="right">Tannarx</th><th class="right">Yalpi foyda</th><th class="right">Xarajat</th><th class="right">Sof foyda</th></tr></thead>
        <tbody>${series.rows.map((r) => `<tr>
          <td data-label="${GRAIN_LABEL[grain]}">${esc(r.period)}</td>
          <td data-label="Savdolar" class="right num">${r.sales_count}</td>
          <td data-label="Yalpi savdo" class="right num">${money(r.gross_sales)}</td>
          <td data-label="Qaytarish" class="right num">${money(r.returns)}</td>
          <td data-label="Sof savdo" class="right num">${money(r.net_sales)}</td>
          <td data-label="Tannarx" class="right num">${money(r.cogs)}</td>
          <td data-label="Yalpi foyda" class="right num ${r.gross_profit >= 0 ? 'green' : 'red'}">${money(r.gross_profit)}</td>
          <td data-label="Xarajat" class="right num">${money(r.expenses)}</td>
          <td data-label="Sof foyda" class="right num ${r.net_profit >= 0 ? 'green' : 'red'}"><b>${money(r.net_profit)}</b></td>
        </tr>`).join('')}</tbody>
        <tfoot><tr>
          <td data-label="Jami"><b>Jami</b></td>
          <td data-label="Savdolar" class="right num"><b>${series.total.sales_count}</b></td>
          <td data-label="Yalpi savdo" class="right num"><b>${money(series.total.gross_sales)}</b></td>
          <td data-label="Qaytarish" class="right num"><b>${money(series.total.returns)}</b></td>
          <td data-label="Sof savdo" class="right num"><b>${money(series.total.net_sales)}</b></td>
          <td data-label="Tannarx" class="right num"><b>${money(series.total.cogs)}</b></td>
          <td data-label="Yalpi foyda" class="right num"><b>${money(series.total.gross_profit)}</b></td>
          <td data-label="Xarajat" class="right num"><b>${money(series.total.expenses)}</b></td>
          <td data-label="Sof foyda" class="right num"><b>${money(series.total.net_profit)}</b></td>
        </tr></tfoot>
      </table></div>` : '<div class="empty">Bu davrda savdo yo\'q</div>'}
    </div>

    <div class="form-grid two" style="margin-top:14px;align-items:start">
      <div class="card">
        <div class="card-head"><h2>Eng ko'p foyda keltirgan</h2></div>
        ${listProducts(prod.best_sellers, 'profit')}
      </div>
      <div class="card">
        <div class="card-head"><h2>Sekin sotiladigan (omborda bor)</h2></div>
        ${listProducts(prod.slow_moving, 'slow')}
      </div>
    </div>

    <div class="card" style="margin-top:14px">
      <div class="card-head"><h2>Mahsulotlar bo'yicha foyda</h2></div>
      ${prod.products.length ? `<div class="table-wrap cards"><table>
        <thead><tr><th>Mahsulot</th><th class="right">Sotilgan</th><th class="right">Tushum</th><th class="right">Tannarx</th><th class="right">Foyda</th><th class="right">Marja</th><th class="right">Qoldiq</th></tr></thead>
        <tbody>${prod.products.map((p) => `<tr>
          <td data-label="Mahsulot"><b>${esc(p.name)}</b></td>
          <td data-label="Sotilgan" class="right num">${qty(p.qty_sold)} ${esc(p.unit)}</td>
          <td data-label="Tushum" class="right num">${money(p.revenue)}</td>
          <td data-label="Tannarx" class="right num">${money(p.cogs)}</td>
          <td data-label="Foyda" class="right num ${p.profit >= 0 ? 'green' : 'red'}">${money(p.profit)}</td>
          <td data-label="Marja" class="right num">${num(p.margin_percent, 1)}%</td>
          <td data-label="Qoldiq" class="right num">${qty(p.stock_qty)} ${esc(p.unit)}</td>
        </tr>`).join('')}</tbody></table></div>` : '<div class="empty">Mahsulot yo\'q</div>'}
    </div>`;

  root.querySelectorAll('[data-grain]').forEach((b) => b.addEventListener('click', () => ctx.go(link({ period: b.dataset.grain }))));
  const cf = root.querySelector('#cf');
  const ct = root.querySelector('#ct');
  const applyCustom = () => {
    if (!cf.value || !ct.value) return;
    if (cf.value > ct.value) return toast("Boshlanish sanasi tugashdan oldin bo'lishi kerak", 'warn');
    ctx.go(`#/reports?${new URLSearchParams({ p: 'custom', period: grain, from: cf.value, to: ct.value })}`);
  };
  cf?.addEventListener('change', applyCustom);
  ct?.addEventListener('change', applyCustom);
  root.querySelector('#printbtn').addEventListener('click', () => window.print());
}

function listProducts(rows, mode) {
  if (!rows.length) return '<div class="empty">Ma\'lumot yo\'q</div>';
  return `<div class="list">${rows.map((p) => `
    <div class="list-item">
      <div class="meta">
        <div class="name">${esc(p.name)}</div>
        <div class="sub">${mode === 'profit'
    ? `Sotilgan: ${qty(p.qty_sold)} ${esc(p.unit)} · marja ${num(p.margin_percent, 1)}%`
    : `Sotilgan: ${qty(p.qty_sold)} ${esc(p.unit)} · qoldiq ${qty(p.stock_qty)} ${esc(p.unit)}`}</div>
      </div>
      <div class="end">${mode === 'profit'
    ? `<div class="num ${p.profit >= 0 ? 'green' : 'red'}" style="font-weight:800">${money(p.profit)}</div>`
    : `<span class="badge badge-low">${qty(p.qty_sold)}</span>`}</div>
    </div>`).join('')}</div>`;
}
