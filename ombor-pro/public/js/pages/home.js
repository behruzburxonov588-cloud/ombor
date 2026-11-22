// Bosh sahifa: do'kon egasi 5 soniyada tushunadigan asosiy raqamlar.
//   1) Tez amallar (Sotish, Yuk keldi, ...)
//   2) Davr bo'yicha: savdo, sof foyda, xarajat, cheklar (grafikchali kartalar)
//   3) Hozirgi holat: naqd pul, karta, mijozlar qarzi, sizning qarzingiz, mahsulotlar, kam qolgan, tugagan, ombor qiymati
//   4) Savdo grafigi + bildirishnomalar; haftalik/oylik dinamika + tugayotgan tovarlar
//   5) Eng ko'p sotilganlar va so'nggi amallar
//   6) Pul nima bo'ldi? (oddiy so'zlar bilan), nima keldi va nima ketdi
// Hamma raqamlar haqiqiy yozuvlardan: /api/analytics/dashboard, /overview, /daily, /monthly, /cash/summary, /notifications.
import {
  get, put, esc, icon, num, compact, moneyFull, longDate, errorToast, dateTime, timeAgo, emptyState,
  periodPicker, bindPeriod, resolvePeriod, periodWord, periodQuery, monthName, shortDate, weekdayShort,
} from '../ui.js';
import { kpiCards, salesCard, mountSalesChart, topCard, mountTop, destroyCharts } from './dashboard.js';
import { chart, tableView } from '../charts.js';

const SHOW = 8;
const qtyText = (q, unit) => `${num(q, 3)} ${unit}`;
let homeCharts = [];

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
  const [d, ov, cash, notes, onbHtml] = await Promise.all([
    get(`/analytics/dashboard?${q}`),
    get(`/analytics/overview?${q}`),
    ctx.can('cash.view') ? get('/cash/summary').catch(() => null) : null,
    get('/notifications?limit=5').catch(() => null),
    opts.onboarding ? opts.onboarding().catch(() => '') : '',
  ]);
  const word = periodWord(range);
  const canBuy = ctx.can('purchases.create');
  const canSell = ctx.can('sales.create');
  destroyCharts();
  homeCharts.forEach((c) => c.destroy());
  homeCharts = [];

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
      ${d.cost_missing?.products ? `<div class="alert alert-warn cost-alert">${icon('alert', 'ico-sm')}<div class="grow">
        <b>Foyda ko'proq chiqib qolgan: ${d.cost_missing.products} ta tovarning kelish narxi yozilmagan</b>
        <div class="small">${esc(word)} ular ${moneyFull(d.cost_missing.revenue)} so'mga sotilgan va bu summa to'liq foyda deb hisoblandi. Kelish narxini yozing — foyda o'zi to'g'rilanadi.</div></div>
        <a class="btn btn-sm" href="#/products?filter=nocost">${icon('calc', 'ico-sm')} Narxini yozish</a></div>` : ''}
      <section class="home-sec" aria-label="Davr bo'yicha ko'rsatkichlar">
        <div class="sec-title"><h2>${esc(word)}</h2><span>savdo, foyda va xarajat</span></div>
        ${kpiCards(d, range, { periodOnly: true })}
      </section>
      ${snapshotSection(d, ov, cash)}
      <div class="home-row wide-narrow">
        ${salesCard(d, range)}
        ${notesCard(notes)}
      </div>
      <div class="home-row wide-narrow">
        ${trendCard(d.access.financial)}
        ${lowStockCard(ov, canBuy)}
      </div>
      <div class="home-row halves">
        ${d.access.financial ? topCard(d) : ''}
        ${recentCard(d, canSell)}
      </div>
      ${moneySection(ov, word)}
      ${movesSection(ov, word, { canBuy, canSell })}
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
  mountTrend(root, d.access.financial);

  // «Hammasini ko'rsatish»
  root.querySelectorAll('[data-more]').forEach((b) => b.addEventListener('click', () => {
    root.querySelectorAll(`[data-list="${b.dataset.more}"] [data-extra]`).forEach((x) => { x.hidden = false; });
    b.remove();
  }));
  root.querySelectorAll('.mv-row[data-go]').forEach((r) => r.addEventListener('click', () => ctx.go(r.dataset.go)));
}

// ---------- Hozirgi holat: pul, qarzlar, ombor ----------
function snapshotSection(d, ov, cash) {
  const k = d.kpis;
  const st = ov.stock;
  const tile = ({ label, value, money = true, unit = '', href, ico, tone = '', note = '', hint = '' }) => `
    <a class="snap ${tone}" href="${href}" title="${esc(hint)}">
      <span class="snap-ico ${tone}">${icon(ico, 'ico-sm')}</span>
      <span class="snap-text">
        <span class="snap-l">${esc(label)}</span>
        <b class="snap-v ${money && value < 0 ? 'neg' : ''}" title="${money ? esc(`${moneyFull(value)} so'm`) : ''}">${money ? `${compact(value)}<small>so'm</small>` : `${num(value, 0)}<small>${esc(unit)}</small>`}</b>
        ${note ? `<span class="snap-n">${note}</span>` : ''}
      </span>
    </a>`;
  const tiles = [];
  if (cash) {
    const b = cash.balances;
    tiles.push(tile({ label: 'Naqd pul', value: b.cash, href: '#/cash?tab=cash', ico: 'money', tone: b.cash < 0 ? 'neg' : 'pos', note: 'kassada hozir', hint: "Kassadagi naqd pul (barcha kirim va chiqimlardan keyin)" }));
    tiles.push(tile({ label: 'Karta', value: b.card, href: '#/cash?tab=cash', ico: 'card', tone: 'blue', note: b.transfer ? `o'tkazma ${esc(compact(b.transfer))}` : 'plastik karta orqali', hint: "Karta hisobidagi pul" }));
  }
  if (k.customer_debt) {
    tiles.push(tile({ label: 'Mijozlar qarzi', value: k.customer_debt.value, href: '#/debts', ico: 'debt', tone: k.customer_debt.value > 0 ? 'warn' : '', note: 'sizga qaytarishlari kerak', hint: "Mijozlarning hali to'lanmagan nasiyasi" }));
  }
  if (d.access.debts !== false && d.supplier_debt !== undefined && d.supplier_debt !== null) {
    tiles.push(tile({ label: 'Sizning qarzingiz', value: d.supplier_debt, href: '#/debts?tab=suppliers', ico: 'store', tone: d.supplier_debt > 0 ? 'warn' : '', note: "yetkazib beruvchilarga", hint: "Yuk olib, hali to'lanmagan summa" }));
  }
  tiles.push(tile({ label: 'Jami mahsulot', value: st.products, money: false, unit: 'xil', href: '#/products', ico: 'box', tone: 'blue', note: "sotuvdagi tovarlar" }));
  tiles.push(tile({ label: 'Kam qolgan', value: st.low, money: false, unit: 'ta', href: '#/products?filter=low', ico: 'alert', tone: st.low ? 'warn' : '', note: st.low ? 'tez orada tugaydi' : 'hammasi yetarli' }));
  tiles.push(tile({ label: 'Tugagan', value: st.out, money: false, unit: 'ta', href: '#/products?filter=out', ico: 'warnCircle', tone: st.out ? 'neg' : '', note: st.out ? 'yuk kiritish kerak' : "tugagan tovar yo'q" }));
  if (k.inventory_value) {
    tiles.push(tile({ label: 'Ombordagi tovar', value: k.inventory_value.value, href: '#/stock', ico: 'warehouse', tone: 'slate', note: 'kelish narxida', hint: "Ombordagi barcha tovarlar kelish narxida qancha turadi" }));
  }
  return `
    <section class="home-sec" aria-label="Hozirgi holat">
      <div class="sec-title"><h2>Hozirgi holat</h2><span>pul, qarzlar va ombor — shu daqiqada</span></div>
      <div class="snap-grid">${tiles.join('')}</div>
    </section>`;
}

// ---------- Bildirishnomalar ----------
const LVL = { critical: 'Muhim', warning: 'Diqqat', success: 'Yaxshi', info: "Ma'lumot" };
function notesCard(r) {
  const items = r?.items || [];
  return `
    <section class="card home-card">
      <div class="card-head">
        <div><h2>Bildirishnomalar</h2><div class="card-sub">${r?.unread ? `${r.unread} ta o'qilmagan` : "Hammasi o'qilgan"}</div></div>
        <a class="link-btn" href="#/notifications">Hammasi ${icon('right', 'ico-xs')}</a>
      </div>
      ${items.length ? `<div class="nt-list">${items.map((n) => `
        <a class="nt-row ${n.is_read ? '' : 'unread'}" href="${esc(n.link || '#/notifications')}">
          <span class="nt-ico lvl-${esc(n.level)}" title="${esc(LVL[n.level] || '')}">${icon(n.level === 'critical' ? 'critical' : n.level === 'warning' ? 'alert' : n.level === 'success' ? 'ok' : 'info', 'ico-xs')}</span>
          <span class="nt-text"><b>${esc(n.title)}</b><span>${esc(n.body)}</span></span>
          <span class="nt-when">${esc(timeAgo(n.created_at))}</span>
        </a>`).join('')}</div>`
    : `<div class="empty-state"><span class="es-ico">${icon('bell')}</span><b>Yangi xabar yo'q</b><p>Kam qolgan tovar, qarz muddati va kunlik xulosa shu yerda chiqadi</p></div>`}
    </section>`;
}

// ---------- Haftalik va oylik dinamika ----------
function trendCard(financial) {
  return `
    <section class="card" id="trend" style="height:100%">
      <div class="card-head" style="margin-bottom:10px">
        <div><h2>Savdo dinamikasi</h2><div class="card-sub" data-trend-sub>So'nggi 7 kun, kunma-kun</div></div>
        <div class="row">
          ${financial ? `<div class="seg" role="tablist" aria-label="Davr"><button type="button" class="active" data-trend="week">7 kun</button><button type="button" data-trend="month">6 oy</button></div>` : ''}
          <button class="btn btn-ghost btn-sm" type="button" data-trend-table>${icon('table', 'ico-sm')} Jadval</button>
        </div>
      </div>
      <div class="legend" data-trend-legend></div>
      <div data-trend-chart style="margin-top:8px"><span class="skel" style="display:block;height:230px;border-radius:12px"></span></div>
      <div data-trend-tbl hidden style="margin-top:12px"></div>
    </section>`;
}

function mountTrend(root, financial) {
  const box = root.querySelector('#trend');
  if (!box) return;
  const cache = {};
  let mode = 'week';
  const fmt = (v) => `${moneyFull(v)} so'm`;
  const draw = (data) => {
    if (!box.isConnected) return;
    const chartBox = box.querySelector('[data-trend-chart]');
    chartBox.replaceChildren();
    homeCharts.forEach((c) => c.destroy());
    homeCharts = [];
    const week = mode === 'week';
    const rows = week ? data.days : data.months;
    const labels = rows.map((x) => (week ? x.day : x.month));
    const revenue = rows.map((x) => (week ? x.net_revenue : x.revenue));
    const profit = financial ? rows.map((x) => x.net_profit) : null;
    const series = [{ name: 'Savdo', values: revenue, color: '#2563eb', kind: 'bar' }];
    if (profit) series.push({ name: 'Sof foyda', values: profit, color: '#16a34a', width: 2, endDot: true });
    box.querySelector('[data-trend-legend]').innerHTML = `<span><i class="box" style="background:#2563eb"></i>Savdo</span>${profit ? '<span><i style="background:#16a34a"></i>Sof foyda</span>' : ''}`;
    box.querySelector('[data-trend-sub]').textContent = week ? "So'nggi 7 kun, kunma-kun" : "So'nggi 6 oy, oyma-oy (joriy oy — bugungacha)";
    const label = (i) => (week ? `${weekdayShort(labels[i])} ${shortDate(labels[i])}` : `${monthName(labels[i].slice(5))}`);
    homeCharts.push(chart(chartBox, {
      labels,
      tickLabel: (i) => (week ? weekdayShort(labels[i]) : monthName(labels[i].slice(5)).slice(0, 3)),
      titleFor: (i) => (week ? `${weekdayShort(labels[i])}, ${shortDate(labels[i])}` : `${monthName(labels[i].slice(5))} ${labels[i].slice(0, 4)}`),
      series,
      format: fmt,
      axisFormat: (v) => compact(v),
      height: 240,
      ariaLabel: week ? "So'nggi 7 kunlik savdo grafigi" : "So'nggi 6 oylik savdo grafigi",
    }));
    const cols = [
      { label: week ? 'Kun' : 'Oy', get: (r, i) => label(i) },
      { label: 'Savdo', right: true, get: (r) => fmt(week ? r.net_revenue : r.revenue) },
      { label: 'Cheklar', right: true, get: (r) => `${num(r.sales_count, 0)} ta` },
    ];
    if (financial) cols.push({ label: 'Sof foyda', right: true, get: (r) => fmt(r.net_profit) });
    box.querySelector('[data-trend-tbl]').innerHTML = tableView(cols.map((c) => ({ ...c, get: (r) => c.get(r, rows.indexOf(r)) })), rows);
  };
  const load = async () => {
    try {
      if (!cache[mode]) cache[mode] = await get(mode === 'week' ? '/analytics/daily?days=7' : '/analytics/monthly?months=6');
      draw(cache[mode]);
    } catch (err) {
      const c = box.querySelector('[data-trend-chart]');
      if (c) c.innerHTML = `<div class="empty small">Grafik yuklanmadi: ${esc(err.message)}</div>`;
    }
  };
  box.querySelectorAll('[data-trend]').forEach((b) => b.addEventListener('click', () => {
    if (mode === b.dataset.trend) return;
    mode = b.dataset.trend;
    box.querySelectorAll('[data-trend]').forEach((x) => x.classList.toggle('active', x === b));
    load();
  }));
  box.querySelector('[data-trend-table]').addEventListener('click', () => {
    const t = box.querySelector('[data-trend-tbl]');
    t.hidden = !t.hidden;
  });
  load();
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

// ---------- So'nggi amallar: savdo, kirim, xarajat, qarz to'lovi ----------
const KIND = {
  sale: { label: 'Savdo', sign: 1, icon: 'cart', tone: 'blue' },
  purchase: { label: 'Yuk keldi', sign: -1, icon: 'truck', tone: 'slate' },
  expense: { label: 'Xarajat', sign: -1, icon: 'expense', tone: 'warn' },
  payment: { label: "Qarz to'lovi", sign: 1, icon: 'debt', tone: 'pos' },
};
const EXPENSE_LABEL = {
  food: 'Ovqat (obed)', household: 'Suv, choy, mayda', rent: 'Ijara', salaries: 'Maosh', utilities: 'Kommunal', delivery: 'Yetkazib berish', transport: 'Transport', repairs: "Ta'mirlash", other: 'Boshqa',
};
function recentCard(d, canSell) {
  const rows = (d.recent || []).slice(0, 7);
  return `
    <section class="card home-card">
      <div class="card-head">
        <div><h2>So'nggi amallar</h2><div class="card-sub">Savdo, yuk, xarajat va qarz to'lovlari</div></div>
        <a class="link-btn" href="#/sales/history">Savdolar ${icon('right', 'ico-xs')}</a>
      </div>
      ${rows.length ? `<div class="rs-list">${rows.map((r) => {
        const k = KIND[r.kind] || { label: r.kind, sign: 1, icon: 'list', tone: 'slate' };
        const ref = r.kind === 'expense' ? (EXPENSE_LABEL[r.ref] || r.ref) : r.ref;
        const href = r.kind === 'sale' ? `#/sales/${r.id}` : r.kind === 'purchase' ? `#/purchases/${r.id}` : r.kind === 'expense' ? '#/cash?tab=expenses' : '#/debts';
        return `<a class="rs-row" href="${href}">
          <span class="rs-ico ${k.tone}">${icon(k.icon, 'ico-sm')}</span>
          <span class="rs-meta"><b>${esc(k.label)}${ref ? ` · ${esc(ref)}` : ''}</b><span>${esc(timeAgo(r.at))}${r.party ? ` · ${esc(r.party)}` : ''}</span></span>
          <span class="rs-sum"><b class="${k.sign > 0 ? 'green' : ''}">${k.sign > 0 ? '+' : '−'}${moneyFull(r.amount)}</b><span>so'm</span></span>
        </a>`;
      }).join('')}</div>`
    : `<div class="empty-state"><span class="es-ico">${icon('clock')}</span><b>Hozircha amallar yo'q</b><p>Birinchi sotuvdan keyin shu yerda ko'rinadi</p>${canSell ? `<a class="btn btn-sm" href="#/sales" style="margin-top:6px">${icon('cart', 'ico-sm')} Sotish</a>` : ''}</div>`}
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
  const goods = Math.round((m.revenue - m.cogs) * 100) / 100;
  const left = Math.round((m.revenue - m.expenses) * 100) / 100;
  const sentence = m.sales_count === 0 && m.expenses === 0
    ? `${word} savdo ham, xarajat ham bo'lmadi.`
    : `${word} <b>${moneyFull(m.revenue)} so'm</b> savdo bo'ldi (${m.sales_count} ta).${m.expenses > 0
      ? ` Xarajatlarga (obed, suv va boshqalar) savdo pulidan <b>${moneyFull(m.expenses)} so'm</b> olindi — savdodan <b class="${left < 0 ? 'red' : ''}">${left < 0 ? '−' : ''}${moneyFull(Math.abs(left))} so'm</b> qoldi.`
      : ''}<br>Tovarlardan foyda (sotuv narxi − kelish narxi): <b class="${goods < 0 ? 'red' : 'green'}">${goods < 0 ? '−' : ''}${moneyFull(Math.abs(goods))} so'm</b>${m.losses > 0 ? `, buzilgan/yo'qolgan tovar <b>${moneyFull(m.losses)} so'm</b>` : ''}. ${loss
      ? `<span class="red">Xarajatlar ayirilgach: <b>${moneyFull(Math.abs(profit))} so'm zarar</b>.</span>`
      : `<span class="green">Xarajatlar ayirilgach sof foyda: <b>${moneyFull(profit)} so'm</b>.</span>`}`;
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
