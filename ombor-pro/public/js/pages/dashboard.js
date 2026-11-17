// Bosh sahifa: ko'rsatkichlar, grafik, ogohlantirishlar
import { get, money, num, esc, icon, dateOnly, dateTime, emptyState } from '../ui.js';

const KIND = {
  sale: { label: 'Savdo', sign: 1 },
  purchase: { label: 'Kirim', sign: -1 },
  expense: { label: 'Xarajat', sign: -1 },
  payment: { label: "Qarz to'lovi", sign: 1 },
};

const EXPENSE_LABEL = {
  rent: 'Ijara', salaries: 'Maosh', utilities: 'Kommunal', delivery: 'Yetkazib berish',
  transport: 'Transport', repairs: "Ta'mirlash", other: 'Boshqa',
};

function kpi(label, value, hint = '', tone = 'neutral') {
  return `<div class="kpi ${tone}"><div class="label">${esc(label)}</div><div class="value">${value}</div><div class="hint">${esc(hint)}</div></div>`;
}

function chartSvg(days) {
  const W = 640;
  const H = 220;
  const pad = { l: 46, r: 8, t: 12, b: 28 };
  const innerW = W - pad.l - pad.r;
  const innerH = H - pad.t - pad.b;
  const max = Math.max(1, ...days.flatMap((d) => [d.net_sales, Math.abs(d.gross_profit)]));
  const slot = innerW / days.length;
  const bw = Math.max(4, Math.min(16, slot * 0.36));
  const y = (v) => pad.t + innerH - (Math.max(0, v) / max) * innerH;
  const grid = [0, 0.5, 1].map((f) => {
    const v = max * f;
    const yy = y(v);
    return `<line x1="${pad.l}" x2="${W - pad.r}" y1="${yy}" y2="${yy}" stroke="#e2e8f0"/>
            <text x="${pad.l - 6}" y="${yy + 4}" text-anchor="end">${num(v / 1000000, 1)}M</text>`;
  }).join('');
  const bars = days.map((d, i) => {
    const cx = pad.l + slot * i + slot / 2;
    const s = Math.max(0, d.net_sales);
    const p = Math.max(0, d.gross_profit);
    const label = i % 2 === 0 || days.length <= 7
      ? `<text x="${cx}" y="${H - 8}" text-anchor="middle">${dateOnly(d.day).slice(0, 5)}</text>`
      : '';
    return `
      <rect x="${cx - bw - 1}" y="${y(s)}" width="${bw}" height="${pad.t + innerH - y(s)}" rx="3" fill="#1d4e89">
        <title>${dateOnly(d.day)} - Sof savdo: ${money(d.net_sales)}</title></rect>
      <rect x="${cx + 1}" y="${y(p)}" width="${bw}" height="${pad.t + innerH - y(p)}" rx="3" fill="#15803d">
        <title>${dateOnly(d.day)} - Yalpi foyda: ${money(d.gross_profit)}</title></rect>
      ${label}`;
  }).join('');
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="So'nggi 14 kun savdo va foyda grafigi" preserveAspectRatio="xMidYMid meet">${grid}${bars}</svg>`;
}

export async function render(root, params, ctx) {
  const d = await get('/dashboard');
  const t = d.today;
  const cash = d.totals.cash;
  const costingLabel = d.costing_method === 'WAVG' ? "O'rtacha narx bo'yicha" : 'FIFO bo\'yicha';
  const warnDebts = d.debt_alerts.length
    ? `<div class="alert alert-warn">${icon('alert', 'ico-sm')}<div>Muddati yaqin qarzlar: ${d.debt_alerts.map((x) => `<a href="#/customers/${x.id}">${esc(x.name)}</a> (${money(x.debt)})`).join(', ')}</div></div>`
    : '';
  const warnStock = d.stock.out > 0
    ? `<div class="alert alert-bad">${icon('alert', 'ico-sm')}<div>${d.stock.out} ta mahsulot tugagan. <a href="#/stock?tab=overview">Omborni ko'rish</a></div></div>`
    : '';

  const kpis = [
    kpi('Jami mahsulot', num(d.totals.products), 'faol mahsulotlar', 'neutral'),
    kpi('Ombor qiymati', money(d.totals.inventory_value), costingLabel, 'neutral'),
    kpi('Bugungi savdo', money(t.net_sales), `${t.sales_count} ta savdo (qaytarish ayirilgan)`, 'neutral'),
    kpi('Bugungi kirim', money(t.purchases_total), `${t.purchases_count} ta kirim`, 'neutral'),
    kpi('Bugungi foyda', money(t.net_profit), 'sof foyda (xarajat va zarar ayirilgan)', t.net_profit >= 0 ? 'good' : 'bad'),
    kpi('Shu oydagi xarajat', money(d.month.expenses), `${dateOnly(d.month.from)} dan`, 'warn'),
    kpi('Kassa qoldig\'i', money(cash.total), `naqd ${num(cash.cash)} | karta ${num(cash.card)} | o'tkazma ${num(cash.transfer)}`, 'neutral'),
    kpi('Mijoz qarzi', money(d.totals.customer_debt), 'nasiya bo\'yicha', d.totals.customer_debt > 0 ? 'warn' : 'neutral'),
    kpi('Yetkazuvchilarga qarz', money(d.totals.supplier_debt), 'to\'lanmagan kirimlar', d.totals.supplier_debt > 0 ? 'warn' : 'neutral'),
    kpi('Kam qolgan', num(d.stock.low), 'minimal qoldiqdan kam', d.stock.low > 0 ? 'warn' : 'good'),
    kpi('Tugagan', num(d.stock.out), 'qoldig\'i nol', d.stock.out > 0 ? 'bad' : 'good'),
  ].join('');

  const recent = d.recent.length
    ? `<div class="list">${d.recent.map((r) => {
      const k = KIND[r.kind] || { label: r.kind, sign: 1 };
      const label = r.kind === 'expense' ? (EXPENSE_LABEL[r.ref] || r.ref) : r.ref;
      const amount = r.kind === 'expense' ? r.amount : r.amount;
      return `<div class="list-item">
        <div class="meta"><div class="name">${esc(k.label)} · ${esc(label)}</div><div class="sub">${esc(r.party || '')} · ${dateTime(r.at)}</div></div>
        <div class="end num ${k.sign > 0 ? 'green' : 'red'}">${k.sign > 0 ? '+' : '-'}${money(amount)}</div>
      </div>`;
    }).join('')}</div>`
    : emptyState('Hozircha amallar yo\'q', 'clock');

  const lowList = [...d.stock.out_items, ...d.stock.low_items];
  const stockList = lowList.length
    ? `<div class="list">${lowList.map((p) => `
        <a class="list-item" href="#/products/${p.id}" style="color:inherit">
          <div class="meta"><div class="name">${esc(p.name)}</div><div class="sub">Minimal: ${num(p.min_stock, 4)}</div></div>
          <div class="end"><span class="badge ${p.kind === 'out' ? 'badge-out' : 'badge-low'}">${p.kind === 'out' ? 'Tugagan' : 'Kam qolgan'}</span>
          <div class="small muted num">${num(p.stock_qty, 4)}</div></div>
        </a>`).join('')}</div>`
    : emptyState('Hamma mahsulot yetarli', 'check');

  const canSell = ctx.can('sales.create');
  const canBuy = ctx.can('purchases.create');
  root.innerHTML = `
    <div class="page-head">
      <div>
        <h1>Salom, ${esc(ctx.user.full_name.split(' ')[0])}</h1>
        <p class="muted">${esc(ctx.settings.store_name || '')} · bugun ${dateOnly(d.today.date)}</p>
      </div>
      <div class="row">
        ${canSell ? `<a class="btn" href="#/sales">${icon('cart')} Sotuv qilish</a>` : ''}
        ${canBuy ? `<a class="btn btn-light" href="#/purchases/new">${icon('truck')} Kirim qilish</a>` : ''}
      </div>
    </div>
    <div class="stack">${warnStock}${warnDebts}</div>
    <div class="kpis" style="margin-top:14px">${kpis}</div>

    <div class="card" style="margin-top:16px">
      <div class="card-head">
        <h2>Savdo va foyda (so'nggi 14 kun)</h2>
        <div class="legend"><span><i style="background:#1d4e89"></i>Sof savdo</span><span><i style="background:#15803d"></i>Yalpi foyda</span></div>
      </div>
      ${chartSvg(d.chart)}
    </div>

    <div class="form-grid two" style="margin-top:14px;gap:14px">
      <div class="card">
        <div class="card-head"><h2>So'nggi amallar</h2></div>
        ${recent}
      </div>
      <div class="card">
        <div class="card-head"><h2>Qoldiq ogohlantirishlari</h2>${ctx.can('stock.view') ? '<a class="small" href="#/stock?tab=overview">Ombor &rsaquo;</a>' : ''}</div>
        ${stockList}
      </div>
    </div>`;
}
