// Bosh sahifa («Toza ko'k» dizayni): do'kon egasi 5 soniyada tushunadigan asosiy raqamlar.
//   1) Tez amallar (Sotish, Yangi tovar, Yuk keldi, ...)
//   2) Qancha foyda qildingiz? — savdo − kelish narxi = tovardan foyda − xarajatlar = sof foyda (bir qatorda)
//   3) To'rtta asosiy raqam: savdo, kassadagi naqd, mijozlar qarzi, sizning qarzingiz
//   4) Savdo grafigi + bildirishnomalar; eng ko'p sotilganlar + so'nggi amallar; dinamika + tugayotgan tovarlar
//   5) Nima keldi va nima ketdi; ombor holati (qiymati, turlari, kam qolgan, tugagan)
// Hamma raqamlar haqiqiy yozuvlardan: /api/analytics/dashboard, /overview, /daily, /monthly, /cash/summary, /notifications.
import {
  get, put, esc, icon, num, compact, moneyFull, longDate, errorToast, dateTime, timeAgo, emptyState,
  periodPicker, bindPeriod, resolvePeriod, periodWord, periodQuery, monthName, shortDate, weekdayShort,
  deltaAmount, compareText,
} from '../ui.js';
import { salesCard, mountSalesChart, topCard, mountTop, destroyCharts } from './dashboard.js';
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
      ${!ctx.settings.setup_done && ctx.can('settings.manage') ? `<div class="alert alert-info setup-banner">${icon('sliders', 'ico-sm')}<div class="grow"><b>Do'koningiz turini belgilang — 2 daqiqa</b>
        <div class="small">Kiyim, oziq-ovqat, qurilish mollari… Shunga qarab turkumlar, o'lchov birliklari va tovar qo'shish formasi moslashadi.</div></div>
        <a class="btn btn-sm" href="#/setup">Sozlash</a></div>` : ''}
      ${opts.actionTiles(ctx)}
      ${onbHtml || ''}
      ${d.cost_missing?.products ? `<div class="alert alert-warn cost-alert">${icon('alert', 'ico-sm')}<div class="grow">
        <b>Foyda ko'proq chiqib qolgan: ${d.cost_missing.products} ta tovarning kelish narxi yozilmagan</b>
        <div class="small">${esc(word)} ular ${moneyFull(d.cost_missing.revenue)} so'mga sotilgan va bu summa to'liq foyda deb hisoblandi. Kelish narxini yozing — foyda o'zi to'g'rilanadi.</div></div>
        <a class="btn btn-sm" href="#/products?filter=nocost">${icon('calc', 'ico-sm')} Narxini yozish</a></div>` : ''}
      ${moneySection(ov, word)}
      ${kpiRow(d, cash, range)}
      <div class="home-row wide-narrow">
        ${salesCard(d, range)}
        ${notesCard(notes)}
      </div>
      <div class="home-row halves">
        ${d.access.financial ? topCard(d) : ''}
        ${recentCard(d, canSell)}
      </div>
      <div class="home-row wide-narrow">
        ${trendCard(d.access.financial)}
        ${lowStockCard(ov, canBuy)}
      </div>
      ${movesSection(ov, word, { canBuy, canSell })}
      ${stockStrip(d, ov)}
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
// To'rtta asosiy raqam: savdo (davr bo'yicha), kassadagi naqd, mijozlar qarzi, sizning qarzingiz (hozir)
function kpiRow(d, cash, range) {
  const k = d.kpis;
  const card = ({ label, value, href, foot = '', hint = '', tone = '' }) => `
    <a class="kcard ${tone}" href="${href}" title="${esc(hint)}">
      <span class="kc-l">${esc(label)}</span>
      <b class="kc-v ${value < 0 ? 'neg' : ''}" title="${esc(`${moneyFull(value)} so'm`)}">${moneyFull(value)}<small>so'm</small></b>
      <span class="kc-f">${foot}</span>
    </a>`;
  const cards = [];
  const sc = k.sales_count?.value || 0;
  cards.push(card({
    label: periodWord(range) === 'Bugun' ? 'Bugun sotildi' : 'Savdo', value: k.revenue.value, href: `#/sales/history?from=${range.from}&to=${range.to}`,
    foot: `${deltaAmount(k.revenue.value, k.revenue.previous, { title: compareText(range) })}<span class="kc-n">${num(sc, 0)} ta chek</span>`,
    hint: "Sotuvdan tushgan pul (chegirma va qaytarilgan tovar ayirilgan). Qarz to'lovlari kirmaydi.",
  }));
  if (cash) {
    const b = cash.balances;
    cards.push(card({
      label: 'Kassada naqd', value: b.cash, href: '#/cash?tab=cash',
      foot: `<span class="kc-n">kartada ${esc(moneyFull(b.card))}${b.transfer ? ` · o'tkazma ${esc(moneyFull(b.transfer))}` : ''}</span>`,
      hint: 'Kassadagi naqd pul — barcha kirim va chiqimlardan keyin',
    }));
  }
  if (k.customer_debt) {
    cards.push(card({
      label: 'Mijozlar qarzi', value: k.customer_debt.value, href: '#/debts', tone: k.customer_debt.value > 0 ? 'warn' : '',
      foot: '<span class="kc-n">sizga qaytarishlari kerak</span>', hint: "Mijozlarning hali to'lanmagan nasiyasi",
    }));
  }
  if (d.access.debts !== false && d.supplier_debt !== undefined && d.supplier_debt !== null) {
    cards.push(card({
      label: 'Sizning qarzingiz', value: d.supplier_debt, href: '#/debts?tab=suppliers', tone: d.supplier_debt > 0 ? 'warn' : '',
      foot: "<span class=\"kc-n\">yetkazib beruvchilarga</span>", hint: "Yuk olib, hali to'lanmagan summa",
    }));
  }
  return `<section class="kgrid" aria-label="Asosiy raqamlar">${cards.join('')}</section>`;
}

// Ombor holati — bitta qator: qiymati, turlari, kam qolgan, tugagan
function stockStrip(d, ov) {
  const st = ov.stock;
  const k = d.kpis;
  return `
    <section class="card stock-strip" aria-label="Ombor holati">
      ${k.inventory_value ? `<span class="ss-item"><span>Ombor qiymati</span><b>${moneyFull(k.inventory_value.value)} so'm</b></span>` : ''}
      <span class="ss-item"><span>Tovar turlari</span><b>${num(st.products, 0)}</b></span>
      <a class="ss-badge ${st.low ? 'warn' : ''}" href="#/products?filter=low">Kam qolgan: ${num(st.low, 0)}</a>
      <a class="ss-badge ${st.out ? 'bad' : ''}" href="#/products?filter=out">Tugagan: ${num(st.out, 0)}</a>
      <a class="link-btn ss-go" href="#/stock">Ombor qoldig'i ${icon('right', 'ico-xs')}</a>
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

// ---------- Qancha foyda qildingiz? (qadamma-qadam: savdo → kelish narxi → xarajat → sof foyda) ----------
function moneySection(d, word) {
  const m = d.money;
  if (!d.access.financial) return '';
  const profit = m.net_profit;
  const goods = m.gross_profit;
  const spent = Math.round((m.expenses + m.losses) * 100) / 100;
  const left = Math.round((m.revenue - m.expenses) * 100) / 100;
  const sum = (v, sign = '') => `${v < 0 ? '−' : sign}${moneyFull(Math.abs(v))}`;
  const margin = m.revenue > 0 ? String(Math.round((goods / m.revenue) * 1000) / 10).replace('.', ',') : null;
  const empty = m.sales_count === 0 && m.expenses === 0 && m.losses === 0;
  return `
    <section class="card pchain-card" aria-labelledby="pchain-h">
      <div class="pchain-head">
        <div><h2 id="pchain-h">Qancha foyda qildingiz?</h2><div class="card-sub">${esc(word)}: savdodan kelish narxi va xarajatlar ayiriladi — qadamma-qadam</div></div>
        <div class="pchain-net ${profit < 0 ? 'neg' : ''}"><span>${profit < 0 ? 'Zarar' : 'Sof foyda'}</span><b>${sum(profit, '+')}<small>so'm</small></b></div>
      </div>
      ${empty ? `<p class="money-sentence">${esc(word)} savdo ham, xarajat ham bo'lmadi.</p>` : `
      <div class="pchain" role="list" aria-label="Foyda hisobi">
        <div class="pc-step" role="listitem"><span>Savdo</span><b>${sum(m.revenue)}</b><small>${num(m.sales_count, 0)} ta chek</small></div>
        <div class="pc-op" aria-hidden="true">−</div>
        <div class="pc-step" role="listitem"><span>Kelish narxi</span><b>${sum(m.cogs)}</b><small>sotilgan tovarlarniki</small></div>
        <div class="pc-op" aria-hidden="true">=</div>
        <div class="pc-step ${goods < 0 ? 'bad' : 'good'}" role="listitem"><span>Tovardan foyda</span><b>${sum(goods, '+')}</b><small>${margin !== null ? `marja ${margin}%` : 'sotuv − kelish narxi'}</small></div>
        <div class="pc-op" aria-hidden="true">−</div>
        <div class="pc-step" role="listitem"><span>Xarajatlar</span><b>${sum(spent)}</b><small>${m.losses > 0 ? `shundan buzilgan tovar ${moneyFull(m.losses)}` : 'obed, suv, ijara… savdo pulidan'}</small></div>
        <div class="pc-op" aria-hidden="true">=</div>
        <div class="pc-step total ${profit < 0 ? 'neg' : ''}" role="listitem"><span>${profit < 0 ? 'Zarar' : 'Sof foyda'}</span><b>${sum(profit, '+')}</b><small>qo'lingizda qoladi</small></div>
      </div>`}
      <div class="money-foot">
        <span>${icon('wallet', 'ico-xs')} Savdodan qolgan pul (savdo − xarajat): <b class="${left < 0 ? 'red' : ''}">${sum(left)} so'm</b></span>
        <span>${icon('truck', 'ico-xs')} Yuk keldi: <b>${m.purchases_count} ta</b>, ${moneyFull(m.purchases_total)} so'm${m.purchases_unpaid > 0 ? ` <span class="amber">(to'lanmagan ${moneyFull(m.purchases_unpaid)})</span>` : ''}</span>
        <span>${icon('wallet', 'ico-xs')} Yetkazib beruvchilarga to'landi: <b>${moneyFull(m.paid_suppliers)} so'm</b></span>
        ${m.debt_collected > 0 ? `<span>${icon('debt', 'ico-xs')} Qarzdorlar to'ladi: <b>${moneyFull(m.debt_collected)} so'm</b> <span class="muted">(savdoga qo'shilmaydi)</span></span>` : ''}
        <a class="link-btn" href="#/reports?tab=pnl&from=${d.range.from}&to=${d.range.to}">Batafsil hisobot ${icon('right', 'ico-xs')}</a>
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
