// Bosh sahifa: do'kon egasi 5 soniyada tushunadigan asosiy raqamlar.
//   1) Tez amallar (Sotish, Yuk keldi, ...)
//   2) 8 ta asosiy raqam: savdo, sof foyda, xarajat, cheklar, kassadagi pul, ombor, mijozlar qarzi, sizning qarzingiz
//      (har biri bosilsa — tegishli bo'lim ochiladi)
//   3) Savdo grafigi va tugayotgan tovarlar
//   4) Eng ko'p sotilganlar va so'nggi savdolar
//   5) Pul nima bo'ldi? (oddiy so'zlar bilan), nima keldi va nima ketdi
//   6) Oylik natija (so'nggi 6 oy)
// Hamma raqamlar haqiqiy yozuvlardan: /api/analytics/dashboard, /overview, /cash/summary, /sales, /analytics/monthly.
import {
  get, put, esc, icon, num, compact, moneyFull, longDate, errorToast, dateTime, timeAgo, emptyState,
  periodPicker, bindPeriod, resolvePeriod, periodWord, periodQuery, monthName,
} from '../ui.js';
import { kpiCards, salesCard, mountSalesChart, topCard, mountTop, destroyCharts } from './dashboard.js';

const SHOW = 8;
const qtyText = (q, unit) => `${num(q, 3)} ${unit}`;

function greeting() {
  const h = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Tashkent', hour: '2-digit', hour12: false }).format(new Date()));
  if (h < 11) return 'Xayrli tong';
  if (h < 18) return 'Xayrli kun';
  return 'Xayrli kech';
}

// opts: { prefs, query, actionTiles(ctx), onboarding: async () => html, afterMount(root) }
export async function renderHome(root, ctx, opts) {
  const range = resolvePeriod(opts.query || {}, opts.prefs.dashboard.simple_range || 'today');
  const q = `from=${range.from}&to=${range.to}`;
  const canSales = ctx.canAny(['sales.view', 'reports.view']);
  const [d, ov, cash, sales, onbHtml] = await Promise.all([
    get(`/analytics/dashboard?${q}`),
    get(`/analytics/overview?${q}`),
    ctx.canAny(['cash.view', 'cash.shift']) ? get('/cash/summary').catch(() => null) : null,
    canSales ? get(`/sales?${q}&limit=6`).catch(() => null) : null,
    opts.onboarding ? opts.onboarding().catch(() => '') : '',
  ]);
  const word = periodWord(range);
  const canBuy = ctx.can('purchases.create');
  const canSell = ctx.can('sales.create');
  destroyCharts();

  root.innerHTML = `
    <div class="dash-head">
      <div>
        <div class="hello">${greeting()}, ${esc(ctx.user.full_name.split(' ')[0])}</div>
        <h1>${esc(d.store_name)}</h1>
        <div class="muted small" style="margin-top:2px">${longDate()} · <span title="${esc(dateTime(d.generated_at))}">yangilandi ${esc(timeAgo(d.generated_at))}</span></div>
      </div>
      <div class="filterbar no-print">
        ${periodPicker(range)}
        ${d.access.financial ? `<a class="btn btn-light btn-sm hide-sm" href="#/analytics?${periodQuery(range)}" title="Grafiklar, prognoz, reyting">${icon('chart', 'ico-sm')}<span class="mobile-hide">Batafsil tahlil</span></a>` : ''}
      </div>
    </div>
    <div class="home">
      ${opts.actionTiles(ctx)}
      ${onbHtml || ''}
      ${kpiCards(d, range, { cash, home: true })}
      <div class="home-row wide-narrow">
        ${salesCard(d, range)}
        ${lowStockCard(ov, canBuy)}
      </div>
      <div class="home-row halves">
        ${d.access.financial ? topCard(d) : ''}
        ${sales ? recentSalesCard(sales.sales, word, canSell) : ''}
      </div>
      ${moneySection(ov, word)}
      ${movesSection(ov, word, { canBuy, canSell })}
      ${d.access.financial ? `<section class="card" id="monthly"><div class="card-head"><div><h2>Oylik natija</h2><div class="card-sub">So'nggi 6 oy: savdo, xarajat va sof foyda</div></div></div><div class="empty small">Yuklanmoqda…</div></section>` : ''}
      ${d.access.financial ? `<div class="home-foot no-print"><a class="btn btn-light" href="#/analytics?${periodQuery(range)}">${icon('chart', 'ico-sm')} Grafiklar, prognoz va batafsil tahlil</a></div>` : ''}
    </div>`;

  bindPeriod(root, (next) => {
    opts.prefs.dashboard.simple_range = next.key === 'custom' ? opts.prefs.dashboard.simple_range : next.key;
    if (next.key !== 'custom') put('/me/preferences', { dashboard: { simple_range: next.key } }).catch(() => {});
    history.replaceState(null, '', `#/dashboard?${periodQuery(next)}`);
    renderHome(root, ctx, { ...opts, query: next.key === 'custom' ? { from: next.from, to: next.to } : { range: next.key } }).catch(errorToast);
  });
  opts.afterMount?.(root);
  mountSalesChart(root, d, range);
  mountTop(root, d);

  // «Hammasini ko'rsatish»
  root.querySelectorAll('[data-more]').forEach((b) => b.addEventListener('click', () => {
    root.querySelectorAll(`[data-list="${b.dataset.more}"] [data-extra]`).forEach((x) => { x.hidden = false; });
    b.remove();
  }));
  root.querySelectorAll('.mv-row[data-go]').forEach((r) => r.addEventListener('click', () => ctx.go(r.dataset.go)));

  // Oylik natija — sahifa ochilgandan keyin yuklanadi (asosiy raqamlarni kutdirmaslik uchun)
  const mBox = root.querySelector('#monthly');
  if (mBox) {
    get('/analytics/monthly?months=6')
      .then((r) => {
        if (!mBox.isConnected) return;
        mBox.outerHTML = monthlyCard(r.months);
        root.querySelectorAll('#monthly [data-href]').forEach((tr) => tr.addEventListener('click', () => ctx.go(tr.dataset.href)));
      })
      .catch(() => { if (mBox.isConnected) mBox.remove(); });
  }
}

// ---------- Tugayotgan tovarlar ----------
function lowStockCard(ov, canBuy) {
  const s = ov.stock;
  const items = s.items.filter((x) => x.status !== 'ok')
    .sort((a, b) => (a.status === b.status ? a.name.localeCompare(b.name) : a.status === 'out' ? -1 : 1));
  const rows = items.slice(0, 7);
  return `
    <section class="card home-card">
      <div class="card-head">
        <div><h2>Tugayotgan tovarlar</h2><div class="card-sub">${s.out} ta tugagan · ${s.low} ta kam qolgan</div></div>
        ${items.length ? `<a class="link-btn" href="#/products?filter=${s.out ? 'out' : 'low'}">Hammasi ${icon('right', 'ico-xs')}</a>` : ''}
      </div>
      ${rows.length ? `<div class="ls-list">${rows.map((x) => `
        <a class="ls-row" href="#/products/${x.id}">
          <span class="ls-dot ${x.status}"></span>
          <span class="ls-name">${esc(x.name)}</span>
          <span class="ls-qty ${x.status === 'out' ? 'red' : 'amber'}">${esc(qtyText(x.qty, x.unit))}</span>
        </a>`).join('')}</div>
        ${canBuy ? `<a class="btn btn-sm btn-block" href="#/purchases/new" style="margin-top:12px">${icon('truck', 'ico-sm')} Yuk keldi — kiritish</a>` : ''}`
    : `<div class="ok-state">${icon('check')}<div><b>Hamma tovar yetarli</b><span>${s.products} xil tovar omborda bor</span></div></div>`}
    </section>`;
}

// ---------- So'nggi savdolar ----------
const PAY = { cash: 'Naqd', card: 'Karta', transfer: "O'tkazma", credit: 'Nasiya', mixed: 'Aralash' };
function recentSalesCard(rows, word, canSell) {
  return `
    <section class="card home-card">
      <div class="card-head">
        <div><h2>So'nggi savdolar</h2><div class="card-sub">${esc(word)}</div></div>
        <a class="link-btn" href="#/sales/history">Hammasi ${icon('right', 'ico-xs')}</a>
      </div>
      ${rows.length ? `<div class="rs-list">${rows.map((s) => `
        <a class="rs-row" href="#/sales/${s.id}">
          <span class="rs-ico">${icon('receipt', 'ico-sm')}</span>
          <span class="rs-meta"><b>${esc(s.receipt_no)}</b><span>${esc(timeAgo(s.created_at))}${s.customer_name ? ` · ${esc(s.customer_name)}` : ''}${s.cashier_name ? ` · ${esc(s.cashier_name)}` : ''}</span></span>
          <span class="rs-sum"><b>${moneyFull(s.total)}</b><span class="${Number(s.balance_due) > 0 ? 'amber' : ''}">${Number(s.balance_due) > 0 ? `qarz ${compact(s.balance_due)}` : esc(PAY[s.payment_method] || '')}</span></span>
        </a>`).join('')}</div>`
    : `${emptyState(`${word} savdo bo'lmadi`, 'cart')}${canSell ? '<div style="text-align:center"><a class="btn btn-sm" href="#/sales">Sotish</a></div>' : ''}`}
    </section>`;
}

// ---------- Oylik natija ----------
function monthlyCard(all) {
  // Do'kon ochilishidan oldingi bo'sh oylar ko'rsatilmaydi
  const first = all.findIndex((m) => m.sales_count > 0 || m.expenses > 0 || m.losses !== 0);
  const months = first < 0 ? all.slice(-1) : all.slice(first);
  const max = Math.max(1, ...months.map((m) => Math.max(m.revenue, Math.abs(m.net_profit))));
  const label = (m) => `${monthName(m.month.slice(5))} ${m.month.slice(0, 4)}`;
  return `
    <section class="card" id="monthly">
      <div class="card-head"><div><h2>Oylik natija</h2><div class="card-sub">Har oy: savdo, xarajat va sof foyda (joriy oy — bugungacha). Oyni bossangiz — batafsil hisobot</div></div>
        <a class="link-btn" href="#/reports?tab=pnl">Foyda va zarar ${icon('right', 'ico-xs')}</a></div>
      <div class="table-wrap cards"><table class="month-table">
        <thead><tr><th>Oy</th><th class="right">Savdo</th><th class="right">Savdo foydasi</th><th class="right">Xarajat</th><th class="right">Sof natija</th><th class="mt-bar-h"></th></tr></thead>
        <tbody>${months.slice().reverse().map((m) => `
          <tr class="clickable" data-href="#/reports?tab=pnl&from=${m.from}&to=${m.to}">
            <td data-label="Oy"><b>${esc(label(m))}</b>${m.partial ? ' <span class="badge badge-info">hozirgi</span>' : ''}<div class="small muted">${m.sales_count} ta savdo</div></td>
            <td data-label="Savdo" class="right num">${moneyFull(m.revenue)}</td>
            <td data-label="Savdo foydasi" class="right num">${moneyFull(m.gross_profit)}</td>
            <td data-label="Xarajat" class="right num">${moneyFull(m.expenses + m.losses)}</td>
            <td data-label="Sof natija" class="right num ${m.net_profit < 0 ? 'red' : 'green'}"><b>${m.net_profit < 0 ? '−' : '+'}${moneyFull(Math.abs(m.net_profit))}</b></td>
            <td class="mt-bar" aria-hidden="true"><span class="mt-rev" style="width:${(m.revenue / max) * 100}%"></span><span class="mt-net ${m.net_profit < 0 ? 'neg' : ''}" style="width:${(Math.abs(m.net_profit) / max) * 100}%"></span></td>
          </tr>`).join('')}</tbody></table></div>
      <div class="mt-legend small muted"><span><i class="mt-rev"></i>Savdo</span><span><i class="mt-net"></i>Sof foyda</span><span><i class="mt-net neg"></i>Zarar</span></div>
    </section>`;
}

// ---------- Pul nima bo'ldi? ----------
function moneySection(d, word) {
  const m = d.money;
  if (!d.access.financial) return '';
  const profit = m.net_profit;
  const loss = profit < 0;
  const parts = [
    { label: "Tovar o'zingizga tushgan narx", value: Math.max(0, m.cogs), cls: 'seg-cost' },
    { label: 'Xarajatlar', value: Math.max(0, m.expenses), cls: 'seg-exp' },
    { label: "Buzilgan / yo'qolgan tovar", value: Math.max(0, m.losses), cls: 'seg-loss' },
    { label: 'Foyda', value: Math.max(0, profit), cls: 'seg-profit' },
  ];
  const total = parts.reduce((s, p) => s + p.value, 0) || 1;
  const sentence = m.sales_count === 0 && m.expenses === 0
    ? `${word} savdo ham, xarajat ham bo'lmadi.`
    : `${word} <b>${moneyFull(m.revenue)} so'm</b> savdo bo'ldi (${m.sales_count} ta). Sotilgan tovarlar o'zingizga <b>${moneyFull(m.cogs)} so'm</b>ga tushgan, xarajatlar <b>${moneyFull(m.expenses)} so'm</b>${m.losses > 0 ? `, buzilgan/yo'qolgan tovar <b>${moneyFull(m.losses)} so'm</b>` : ''}. ${loss
      ? `<span class="red">Natija: <b>${moneyFull(Math.abs(profit))} so'm zarar</b> — minusga ketdingiz.</span>`
      : `<span class="green">Qo'lingizda <b>${moneyFull(profit)} so'm foyda</b> qoldi.</span>`}`;
  return `
    <section class="card home-card">
      <div class="hc-head">
        <span class="hc-ico">${icon('money')}</span>
        <div><h2>Pul nima bo'ldi?</h2><div class="card-sub">${esc(word)}: qancha tushdi, qayerga ketdi, qancha qoldi</div></div>
        <a class="link-btn" href="#/reports?tab=pnl&from=${d.range.from}&to=${d.range.to}">Batafsil ${icon('right', 'ico-xs')}</a>
      </div>
      <p class="money-sentence">${sentence}</p>
      ${m.revenue > 0 ? `<div class="flowbar" role="img" aria-label="Savdo pulining taqsimoti">${parts.filter((p) => p.value > 0).map((p) => `<i class="${p.cls}" style="width:${(p.value / total) * 100}%" title="${esc(p.label)}: ${moneyFull(p.value)} so'm"></i>`).join('')}</div>
      <div class="flow-legend">${parts.map((p) => `<span><i class="${p.cls}"></i>${esc(p.label)} <b>${moneyFull(p.value)}</b></span>`).join('')}</div>` : ''}
      <div class="money-foot">
        <span>${icon('truck', 'ico-xs')} Yuk keldi: <b>${m.purchases_count} ta</b>, ${moneyFull(m.purchases_total)} so'm${m.purchases_unpaid > 0 ? ` <span class="amber">(to'lanmagan ${moneyFull(m.purchases_unpaid)})</span>` : ''}</span>
        <span>${icon('wallet', 'ico-xs')} Yetkazib beruvchilarga to'landi: <b>${moneyFull(m.paid_suppliers)} so'm</b></span>
        ${m.debt_collected > 0 ? `<span>${icon('debt', 'ico-xs')} Qarzdorlar to'ladi: <b>${moneyFull(m.debt_collected)} so'm</b> <span class="muted">(savdoga qo'shilmaydi)</span></span>` : ''}
      </div>
    </section>`;
}

// ---------- Nima keldi, nima ketdi ----------
function moveList(key, rows, render) {
  if (!rows.length) return '';
  return `<div class="mv-list" data-list="${key}">
    ${rows.map((r, i) => `<div class="mv-row" data-go="#/products/${r.id}" ${i >= SHOW ? 'data-extra hidden' : ''}>${render(r)}</div>`).join('')}
  </div>
  ${rows.length > SHOW ? `<button class="btn btn-ghost btn-sm" type="button" data-more="${key}">Hammasini ko'rsatish (${rows.length})</button>` : ''}`;
}

function movesSection(d, word, { canBuy, canSell }) {
  const mv = d.moves;
  const costs = d.access.costs;
  return `
    <div class="moves-grid">
      <section class="card home-card">
        <div class="hc-head">
          <span class="hc-ico in">${icon('truck')}</span>
          <div><h2>Nima keldi? (yuk)</h2><div class="card-sub">${esc(word)}: ${mv.in.length} xil tovar${costs && mv.in_value !== null ? ` · ${moneyFull(mv.in_value)} so'mlik` : ''}</div></div>
        </div>
        ${mv.in.length ? moveList('in', mv.in, (r) => `
          <span class="mv-name">${esc(r.name)}</span>
          <span class="mv-qty green">+${esc(qtyText(r.qty, r.unit))}</span>
          ${costs ? `<span class="mv-sum">${moneyFull(r.value)}</span>` : ''}`)
    : `<div class="empty small">${esc(word)} yuk kelmadi${canBuy ? `<div style="margin-top:10px"><a class="btn btn-sm" href="#/purchases/new">${icon('truck', 'ico-sm')} Yuk keldi — kiritish</a></div>` : ''}</div>`}
      </section>
      <section class="card home-card">
        <div class="hc-head">
          <span class="hc-ico out">${icon('cart')}</span>
          <div><h2>Nima ketdi? (sotildi)</h2><div class="card-sub">${esc(word)}: ${mv.out.length} xil tovar · ${moneyFull(mv.out_amount)} so'mlik</div></div>
        </div>
        ${mv.out.length ? moveList('out', mv.out, (r) => `
          <span class="mv-name">${esc(r.name)}</span>
          <span class="mv-qty">−${esc(qtyText(r.qty, r.unit))}</span>
          <span class="mv-sum">${moneyFull(r.amount)}</span>`)
    : `<div class="empty small">${esc(word)} sotuv bo'lmadi${canSell ? `<div style="margin-top:10px"><a class="btn btn-sm" href="#/sales">${icon('cart', 'ico-sm')} Sotish</a></div>` : ''}</div>`}
      </section>
    </div>`;
}
