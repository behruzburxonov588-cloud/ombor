// Bosh sahifa: eng muhim ko'rsatkichlar 5 soniyada tushunarli bo'lishi uchun.
// Barcha raqamlar /api/analytics/dashboard dan (haqiqiy yozuvlar asosida) olinadi.
import {
  get, put, esc, icon, num, compact, moneyFull, kpiMoney, deltaPill, pctText, dateTime, timeAgo, longDate,
  shortDate, weekdayShort, deltaAmount, todayStr, openModal, toast, errorToast,
  productThumb, emptyState, resolvePeriod, periodPicker, bindPeriod, compareText, periodQuery,
} from '../ui.js';
import { chart, sparkline, segbar, tableView } from '../charts.js';

const C = { s1: '#2563eb', s2: '#16a34a', prev: '#c3cad6', pos: '#15803d', neg: '#d92d20', warn: '#d97706', cost: '#94a3b8' };
const WIDGET_LABELS = {
  assistant: 'Bugungi xulosa (yordamchi)',
  kpis: "Asosiy ko'rsatkichlar",
  sales_chart: 'Savdo grafigi',
  pnl: 'Foyda hisobi',
  top_products: 'Qaysi tovarlar yaxshi sotilmoqda',
  forecast: 'Keyingi 7 kun (taxmin)',
  inventory: 'Ombor holati',
  recent: "So'nggi amallar",
};
const WIDGET_SIZE = {
  assistant: 'w-full', kpis: 'w-full', sales_chart: 'w-wide', pnl: 'w-narrow', top_products: 'w-half',
  forecast: 'w-half', inventory: 'w-half', recent: 'w-half',
};
const KIND = {
  sale: { label: 'Savdo', sign: 1, icon: 'cart' },
  purchase: { label: 'Kirim', sign: -1, icon: 'truck' },
  expense: { label: 'Xarajat', sign: -1, icon: 'expense' },
  payment: { label: "Qarz to'lovi", sign: 1, icon: 'debt' },
};
const EXPENSE_LABEL = {
  rent: 'Ijara', salaries: 'Maosh', utilities: 'Kommunal', delivery: 'Yetkazib berish', transport: 'Transport', repairs: "Ta'mirlash", other: 'Boshqa',
};

// Yangi do'kon uchun "Qayerdan boshlash" qadamlari (faqat ruxsat berilganlari ko'rinadi)
const ONB_STEPS = [
  {
    perm: 'products.manage', title: "Mahsulot qo'shing", text: "Do'koningizdagi tovarni kiriting: nomi va sotuv narxi kifoya.",
    href: '#/products/new', btn: "Mahsulot qo'shish", icon: 'box', done: (o) => o.products > 0,
  },
  {
    perm: 'purchases.create', title: 'Tovar kirimini qiling', text: "Omborga qancha tovar kelganini kiriting. Qoldiq o'zi hisoblanadi.",
    href: '#/purchases/new', btn: 'Kirim qilish', icon: 'truck', done: (o) => o.purchases > 0 || o.stocked > 0,
  },
  {
    perm: 'sales.create', title: 'Birinchi sotuvni qiling', text: "Sotuv bo'limida tovarni tanlang va sotishni yakunlang.",
    href: '#/sales', btn: "Sotuvga o'tish", icon: 'cart', done: (o) => o.sales > 0,
  },
  {
    perm: 'employees.manage', title: "Xodim qo'shing (ixtiyoriy)", text: "Sotuvchiga alohida login bering: kim nima sotganini ko'rasiz.",
    href: '#/employees?new=1', btn: "Xodim qo'shish", icon: 'userCog', done: (o) => o.users > 1,
  },
];

// Bosh sahifadagi katta tugmalar: eng ko'p qilinadigan ishlar bir bosishda (faqat ruxsat berilganlari)
const ACTIONS = [
  { label: 'Sotish', hint: 'Xaridorga tovar sotish', icon: 'cart', href: '#/sales', perms: ['sales.create'] },
  { label: 'Yuk keldi', hint: 'Kelgan tovarni kiritish', icon: 'truck', href: '#/purchases/new', perms: ['purchases.create'] },
  { label: 'Yangi tovar', hint: "Tovar va narxini qo'shish", icon: 'box', href: '#/products/new', perms: ['products.manage'] },
  { label: 'Qarz yozish', hint: 'Daftardagi eski qarz', icon: 'debt', href: '#/debts?new=1', perms: ['customers.manage'] },
  { label: "Qarz to'lovi", hint: "Mijoz qarzini to'ladi", icon: 'money', href: '#/debts', perms: ['payments.create', 'customers.manage'] },
  { label: 'Xarajat', hint: 'Ijara, maosh, svet…', icon: 'expense', href: '#/cash?tab=expenses&new=1', perms: ['expenses.manage'] },
];

function actionTiles(ctx) {
  const list = ACTIONS.filter((a) => ctx.canAny(a.perms));
  if (!list.length) return '';
  return `
    <section class="actions-card" aria-label="Tez amallar">
      <div class="actions-title">Nima qilmoqchisiz?</div>
      <div class="action-grid">
        ${list.map((a) => `<a class="action-tile" href="${a.href}"><span class="at-ico">${icon(a.icon)}</span><b>${esc(a.label)}</b><span>${esc(a.hint)}</span></a>`).join('')}
      </div>
    </section>`;
}

let prefsCache = null;
let charts = [];

function greeting() {
  const h = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Tashkent', hour: '2-digit', hour12: false }).format(new Date()));
  if (h < 11) return 'Xayrli tong';
  if (h < 18) return 'Xayrli kun';
  return 'Xayrli kech';
}

const resolve = (query, prefs) => resolvePeriod(query, prefs.dashboard.range);
const compareLabel = (r) => compareText(r);
function shortCompare(r) {
  if (r.key === 'today') return 'kechagiga nisbatan';
  if (r.key === 'yesterday') return 'oldingi kunga nisbatan';
  return compareText(r);
}
// Grafik izohidagi nomlar: "Bugun / Kecha" yoki "Shu davr / Oldingi davr"
function seriesNames(r) {
  if (r.key === 'today') return ['Bugun', 'Kecha'];
  if (r.key === 'yesterday') return ['Kecha', 'Oldingi kun'];
  return ['Shu davr', 'Oldingi davr'];
}

// Boshqa sahifaga o'tganda eski grafiklar tozalanadi
export function destroyCharts() {
  charts.forEach((c) => c.destroy());
  charts = [];
}

// Yo'riqnoma (yangi do'kon) HTML — oddiy bosh sahifa uchun
async function onboardingHtml(ctx) {
  const steps = prefsCache.dashboard.onboarding_hidden ? [] : ONB_STEPS.filter((st) => ctx.can(st.perm));
  if (!steps.length) return '';
  const o = await get('/onboarding');
  return onboardingCard(steps, o);
}

function bindOnboardingHide(host) {
  host.querySelector('#onb-hide')?.addEventListener('click', () => {
    prefsCache.dashboard.onboarding_hidden = true;
    host.querySelector('#onb-hide').closest('section')?.remove();
    put('/me/preferences', { dashboard: { onboarding_hidden: true } }).catch(() => {});
    toast("Yo'riqnoma yashirildi. Yangi narsa qo'shish uchun yuqoridagi «Qo'shish» tugmasini bosing");
  });
}

// #/dashboard — Bosh sahifa (home.js); #/analytics — batafsil tahlil (vidjetlar, prognoz, foyda hisobi)
export async function render(root, params, ctx) {
  if (!prefsCache) prefsCache = (await get('/me/preferences')).prefs;
  if (params.key !== 'analytics') {
    const { renderHome } = await import('./home.js');
    return renderHome(root, ctx, {
      prefs: prefsCache,
      query: params.query,
      actionTiles,
      onboarding: () => onboardingHtml(ctx),
      afterMount: bindOnboardingHide,
    });
  }
  const range = resolve(params.query, prefsCache);
  root.innerHTML = `<div id="dash-root"></div>`;
  await load(root.querySelector('#dash-root'), range, ctx, true);
  return undefined;
}

async function load(host, range, ctx, first = false) {
  const can = (k) => ctx.can(k);
  const dashEl = host.querySelector('.dash');
  if (dashEl) dashEl.classList.add('is-loading');
  const widgets = prefsCache.dashboard.widgets.filter((w) => w.visible).map((w) => w.id);
  const wantAssistant = widgets.includes('assistant');
  const wantInv = widgets.includes('inventory') && (can('stock.view') || can('reports.view'));
  const onbSteps = prefsCache.dashboard.onboarding_hidden ? [] : ONB_STEPS.filter((st) => can(st.perm));
  let d;
  let brief = null;
  let inv = null;
  let onb = null;
  try {
    [d, brief, inv, onb] = await Promise.all([
      get(`/analytics/dashboard?from=${range.from}&to=${range.to}`),
      wantAssistant ? get('/analytics/assistant').catch(() => null) : null,
      wantInv ? get('/analytics/inventory').catch(() => null) : null,
      onbSteps.length ? get('/onboarding').catch(() => null) : null,
    ]);
  } catch (err) {
    if (dashEl) dashEl.classList.remove('is-loading');
    if (!first) return errorToast(err);
    throw err;
  }
  destroyCharts();

  const sections = {
    assistant: () => brief && assistantCard(brief),
    kpis: () => kpiCards(d, range),
    sales_chart: () => salesCard(d, range),
    pnl: () => d.access.financial && pnlCard(d),
    top_products: () => d.access.financial && topCard(d),
    forecast: () => d.access.financial && d.forecast && forecastCard(d.forecast),
    inventory: () => inv && inventoryCard(inv, d),
    recent: () => recentCard(d),
  };
  // Ko'rinadigan vidjetlar; qo'shnisi yashirilsa (rol yoki sozlama tufayli) bo'sh joy qolmasligi uchun kengaytiriladi
  const rendered = widgets.map((id) => ({ id, html: sections[id]?.(), size: WIDGET_SIZE[id] })).filter((w) => w.html);
  rendered.forEach((w, i) => {
    const next = rendered[i + 1];
    const prev = rendered[i - 1];
    if (w.size === 'w-wide' && next?.size !== 'w-narrow') w.size = 'w-full';
    if (w.size === 'w-narrow' && prev?.size !== 'w-wide') w.size = 'w-half';
  });
  let run = [];
  const flush = () => {
    if (run.length % 2 === 1) run[run.length - 1].size = 'w-full';
    run = [];
  };
  for (const w of rendered) {
    if (w.size === 'w-half') run.push(w);
    else flush();
  }
  flush();
  const onbHtml = onb ? onboardingCard(onbSteps, onb) : '';
  // Tahlil sahifasida «Nima qilmoqchisiz?» tugmalari takrorlanmaydi (ular Bosh sahifada)
  const body = (onbHtml ? `<div class="w-full" data-widget="onboarding">${onbHtml}</div>` : '')
    + rendered.map((w) => `<div class="${w.size}" data-widget="${w.id}">${w.html}</div>`).join('');

  host.innerHTML = `
    <div class="dash-head">
      <div>
        <div class="hello">${greeting()}, ${esc(ctx.user.full_name.split(' ')[0])}</div>
        <h1>${esc(d.store_name)}</h1>
        <div class="muted small" style="margin-top:2px">${longDate()} · <span title="${esc(dateTime(d.generated_at))}">yangilandi ${esc(timeAgo(d.generated_at))}</span></div>
      </div>
      <div class="filterbar no-print">
        ${periodPicker(range)}
        <button class="btn btn-light btn-sm" type="button" id="widgets" title="Vidjetlarni sozlash">${icon('sliders', 'ico-sm')}<span class="mobile-hide">Vidjetlar</span></button>
        <a class="btn btn-light btn-sm" href="#/dashboard?${periodQuery(range)}" title="Bosh sahifaga qaytish">${icon('home', 'ico-sm')}<span class="mobile-hide">Bosh sahifa</span></a>
      </div>
    </div>
    <div class="dash">${body || `<div class="w-full card">${emptyState("Barcha vidjetlar yashirilgan. «Vidjetlar» tugmasi orqali yoqing", 'sliders')}</div>`}</div>`;

  // Davr tanlash: sahifani qayta yuklamasdan yangilaydi (ramka saqlanadi)
  bindPeriod(host, (next) => {
    history.replaceState(null, '', `#/analytics?${periodQuery(next)}`);
    if (next.key !== 'custom') {
      prefsCache.dashboard.range = next.key;
      put('/me/preferences', { dashboard: { range: next.key } }).catch(() => {});
    }
    load(host, next, ctx);
  });
  host.querySelector('#widgets').addEventListener('click', () => openWidgetSettings(() => load(host, range, ctx)));
  host.querySelector('#onb-hide')?.addEventListener('click', () => {
    prefsCache.dashboard.onboarding_hidden = true;
    host.querySelector('[data-widget="onboarding"]')?.remove();
    put('/me/preferences', { dashboard: { onboarding_hidden: true } }).catch(() => {});
    toast("Yo'riqnoma yashirildi. Yangi narsa qo'shish uchun yuqoridagi «Qo'shish» tugmasini bosing");
  });

  mountSalesChart(host, d, range);
  mountForecast(host, d);
  mountTop(host, d);
}

// ---------- Boshlash yo'riqnomasi ----------

function onboardingCard(steps, o) {
  const list = steps.map((st) => ({ ...st, isDone: st.done(o) }));
  const doneCount = list.filter((st) => st.isDone).length;
  if (doneCount === list.length) return '';
  const nextIdx = list.findIndex((st) => !st.isDone);
  const pct = Math.round((doneCount / list.length) * 100);
  return `
    <section class="card" aria-labelledby="onb-title">
      <div class="onb-head">
        <div class="row" style="gap:12px;align-items:flex-start">
          <span class="brand-mark onb-ico" style="width:36px;height:36px;border-radius:10px;background:var(--accent-soft);color:var(--accent)">${icon('rocket', 'ico-sm')}</span>
          <div>
            <h2 id="onb-title">Do'koningizni ishga tushiring</h2>
            <div class="card-sub">Quyidagi qadamlarni tartib bilan bajaring. Har biri 1–2 daqiqa oladi.</div>
            <div class="onb-meta"><span class="onb-bar" role="progressbar" aria-valuemin="0" aria-valuemax="${list.length}" aria-valuenow="${doneCount}" aria-label="Bajarilgan qadamlar"><i style="width:${pct}%"></i></span><span class="onb-count">${doneCount} / ${list.length} bajarildi</span></div>
          </div>
        </div>
        <button class="btn btn-ghost btn-sm" type="button" id="onb-hide">Yashirish</button>
      </div>
      <ol class="onb-steps">
        ${list.map((st, i) => `
          <li class="onb-step${st.isDone ? ' done' : ''}${i === nextIdx ? ' next' : ''}">
            <span class="onb-num" aria-hidden="true">${st.isDone ? icon('check', 'ico-sm') : i + 1}</span>
            <div><b>${esc(st.title)}</b><span class="t">${esc(st.text)}</span></div>
            <div class="onb-act">${st.isDone
    ? `<span class="onb-done">${icon('check', 'ico-xs')} Bajarildi</span>`
    : `<a class="btn ${i === nextIdx ? '' : 'btn-light'} btn-sm" href="${st.href}">${icon(st.icon, 'ico-sm')} ${esc(st.btn)}</a>`}</div>
          </li>`).join('')}
      </ol>
    </section>`;
}

// ---------- Yordamchi xulosasi ----------

function assistantCard(b) {
  const attn = b.attention.slice(0, 4);
  const insight = b.insights.find((i) => i.level !== 'info') || b.insights[0];
  return `
    <section class="card">
      <div class="brief">
        <div>
          <div class="card-head" style="margin-bottom:10px">
            <div class="row" style="gap:10px"><span class="brand-mark" style="width:28px;height:28px;border-radius:8px;background:var(--accent-soft);color:var(--accent)">${icon('sparkles', 'ico-sm')}</span>
              <div><h2>Qisqacha xulosa</h2><div class="card-sub">Dastur savdolaringiz asosida tayyorladi</div></div></div>
          </div>
          <div class="brief-text">${b.summary.map((s) => `<p>${esc(s)}</p>`).join('')}</div>
          ${insight ? `<div class="note" style="margin-top:12px">${icon('bulb', 'ico-xs')}<span><b style="color:var(--text);font-weight:550">${esc(insight.title)}.</b> ${esc(insight.recommendation)}</span></div>` : ''}
        </div>
        <div>
          <div class="between" style="margin-bottom:6px"><h4 class="muted" style="font-weight:550">Diqqat talab qiladi</h4><a class="link-btn" href="#/assistant">Maslahatlar ${icon('right', 'ico-xs')}</a></div>
          ${attn.length ? `<div class="attn">${attn.map((a) => `
            <a class="attn-item" href="${esc(a.link)}"><span class="lvl lvl-${esc(a.level)}"></span><div style="min-width:0"><b>${esc(a.title)}</b><span>${esc(a.text)}</span></div></a>`).join('')}</div>`
    : `<div class="alert alert-ok">${icon('ok', 'ico-sm')}<div>Hozircha shoshilinch masala yo'q</div></div>`}
        </div>
      </div>
    </section>`;
}

// ---------- KPI kartochkalari ----------

// periodOnly: faqat davrga bog'liq 4 ta karta (savdo, foyda, xarajat, cheklar) — bosh sahifada hozirgi holat alohida
export function kpiCards(d, range, { cash = null, home = false, periodOnly = false } = {}) {
  const k = d.kpis;
  const q = `from=${range.from}&to=${range.to}`;
  const cmp = compareLabel(range);
  const shortCmp = shortCompare(range);
  const today = range.key === 'today';
  const startNote = today ? 'bugun ertalabga nisbatan' : 'davr boshiga nisbatan';
  const ico = (name, tone = '') => (name ? `<span class="stat-ico ${tone}">${icon(name, 'ico-sm')}</span>` : '');
  const card = ({ label, kpi, href, note, goodWhenUp = true, color = C.s1, valueHtml, snapshot = false, hint, unit = 'money', i, tone }) => `
    <a class="stat" href="${href}" title="${esc(hint || '')}">
      <div class="stat-label">${ico(i, tone)}${esc(label)}<span class="go">${icon('arrowUpRight', 'ico-xs')}</span></div>
      <div class="stat-value ${kpi.value < 0 ? 'neg' : ''}" title="${esc(`${moneyFull(kpi.value)} so'm`)}">${valueHtml || kpiMoney(kpi.value)}</div>
      ${sparkline(kpi.spark, { color })}
      <div class="stat-foot">${deltaAmount(kpi.value, kpi.previous, { goodWhenUp, unit, title: snapshot ? startNote : cmp })}<span class="stat-note">${esc(note || (snapshot ? startNote : shortCmp))}</span></div>
    </a>`;
  const cards = [];
  cards.push(card({
    label: today ? 'Bugun sotildi' : 'Sotuvdan tushum', kpi: k.revenue, href: `#/reports?tab=sales&${q}`, i: 'cart',
    hint: "Sotuvdan tushgan pul (chegirma va qaytarilgan tovar ayirilgan). Qarz to'lovlari kirmaydi.",
  }));
  if (k.net_profit) {
    cards.push(card({
      label: today ? 'Bugungi sof foyda' : 'Sof foyda', kpi: k.net_profit, href: `#/reports?tab=pnl&${q}`, i: 'trendUp', tone: k.net_profit.value < 0 ? 'neg' : 'pos',
      color: k.net_profit.value >= 0 ? C.s2 : C.neg,
      hint: "Qo'lingizda qoladigan pul: tushum − tovarlarning kelish narxi − xarajatlar − buzilgan tovar",
    }));
  }
  if (k.expenses) {
    cards.push(card({
      label: 'Xarajatlar', kpi: k.expenses, href: `#/cash?tab=expenses&${q}`, goodWhenUp: false, color: C.cost, i: 'expense', tone: 'warn',
      note: k.expenses.losses > 0 ? `+ buzilgan tovar ${compact(k.expenses.losses)}` : '', hint: 'Ijara, maosh, kommunal va boshqa chiqimlar',
    }));
  }
  cards.push(card({
    label: 'Cheklar soni', kpi: k.sales_count, href: `#/sales/history?${q}`, i: 'receipt', tone: 'slate', valueHtml: `${num(k.sales_count.value, 0)}<span class="cur">ta</span>`,
    unit: 'ta', note: k.sales_count.value ? `o'rtacha chek ${compact(k.sales_count.avg_order)}` : '', hint: 'Nechta xaridor xarid qildi (yakunlangan cheklar)',
  }));
  if (periodOnly) return `<div class="stats four">${cards.join('')}</div>`;
  // Davrga bog'liq bo'lmagan «hozirgi holat» kartasi (grafiksiz)
  const nowCard = ({ label, value, href, note, hint, tone = '' }) => `
    <a class="stat" href="${href}" title="${esc(hint || '')}">
      <div class="stat-label">${esc(label)}<span class="stat-tag">hozir</span><span class="go">${icon('arrowUpRight', 'ico-xs')}</span></div>
      <div class="stat-value ${tone || (value < 0 ? 'neg' : '')}" title="${esc(`${moneyFull(value)} so'm`)}">${kpiMoney(value)}</div>
      <div class="spark-ph"></div>
      <div class="stat-foot"><span class="stat-note">${note}</span></div>
    </a>`;
  if (home && cash) {
    const b = cash.balances;
    cards.push(nowCard({
      label: 'Kassadagi pul', value: b.total, href: '#/cash?tab=cash',
      note: `naqd ${compact(b.cash)} · karta ${compact(b.card)}${b.transfer ? ` · o'tkazma ${compact(b.transfer)}` : ''}`,
      hint: "Hozir qo'lingizdagi pul: naqd, karta va o'tkazma hisoblari (barcha kirim va chiqimlardan keyin)",
    }));
  }
  if (k.inventory_value) {
    cards.push(card({
      label: 'Ombordagi tovar', kpi: k.inventory_value, href: home ? '#/stock' : '#/reports?tab=inventory', snapshot: true, color: C.cost,
      note: home && d.stock ? `${d.stock.products} xil${d.stock.out ? ` · ${d.stock.out} ta tugagan` : ''}` : 'kelish narxida',
      hint: "Ombordagi barcha tovarlar kelish narxida qancha turadi",
    }));
  }
  if (k.customer_debt) {
    cards.push(card({
      label: 'Mijozlar qarzi', kpi: k.customer_debt, href: '#/debts', snapshot: true, goodWhenUp: false, color: C.warn,
      note: home ? 'sizga qaytarishlari kerak' : 'nasiya, jami', hint: "Mijozlarning hali to'lanmagan nasiyasi",
    }));
  }
  if (home && d.access.debts !== false && d.supplier_debt !== undefined && d.supplier_debt !== null) {
    cards.push(nowCard({
      label: 'Sizning qarzingiz', value: d.supplier_debt, href: '#/debts?tab=suppliers', tone: d.supplier_debt > 0 ? 'warn' : '',
      note: "yetkazib beruvchilarga to'lashingiz kerak", hint: "Yuk olib, hali to'lanmagan summa (yetkazib beruvchilarga qarz)",
    }));
  }
  const cls = home ? (cards.length > 4 ? 'four' : cards.length === 3 ? 'three' : 'four') : (cards.length <= 3 ? 'three' : cards.length === 4 ? 'four' : '');
  return `<div class="stats ${cls}">${cards.join('')}</div>`;
}

// ---------- Savdo grafigi ----------

const METRICS = [
  { key: 'net_revenue', label: 'Tushum', money: true },
  { key: 'gross_profit', label: 'Savdo foydasi', money: true, financial: true },
  { key: 'sales_count', label: 'Cheklar soni', money: false },
  { key: 'avg_order', label: "O'rtacha chek", money: true },
];

export function salesCard(d, range) {
  const metrics = METRICS.filter((m) => !m.financial || d.access.financial);
  const [curName, prevName] = seriesNames(range);
  const sub = d.chart.grain === 'hour'
    ? "Har soatda qancha sotildi. Kulrang chiziq — kechagi kun"
    : "Har kuni qancha sotildi. Kulrang chiziq — oldingi davr";
  return `
    <section class="card" style="height:100%">
      <div class="card-head" style="margin-bottom:10px">
        <div><h2>Savdo grafigi</h2><div class="card-sub">${sub}</div></div>
        <button class="btn btn-ghost btn-sm" type="button" data-table-toggle>${icon('table', 'ico-sm')} Jadval</button>
      </div>
      <div class="legend-row">
        <div class="ptabs" style="margin:0;border:0" role="tablist">${metrics.map((m, i) => `<button type="button" data-metric="${m.key}" class="${i === 0 ? 'active' : ''}">${m.label}</button>`).join('')}</div>
        <div class="legend"><span><i style="background:${C.s1}"></i>${curName}</span><span><i style="background:${C.prev}"></i>${prevName}</span></div>
      </div>
      <div data-chart="sales"></div>
      <div data-table hidden></div>
    </section>`;
}

function pctFrom(cur, prev) {
  if (Math.abs(prev) < 0.005) return Math.abs(cur) < 0.005 ? 0 : null;
  return ((cur - prev) / Math.abs(prev)) * 100;
}

export function mountSalesChart(host, d, range) {
  const box = host.querySelector('[data-chart="sales"]');
  if (!box) return;
  const hourly = d.chart.grain === 'hour';
  const cur = d.chart.current;
  const prev = d.chart.previous;
  let metric = METRICS[0];
  const [curName, prevName] = seriesNames(range);
  const labels = cur.map((x) => x.day);
  // Bugun: hali kelmagan soatlar chizilmaydi
  const nowHour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Tashkent', hour: '2-digit', hour12: false }).format(new Date()));
  const isToday = hourly && d.range.to === todayStr();
  const draw = () => {
    box.replaceChildren();
    charts = charts.filter((c) => c.box !== box);
    const fmt = metric.money ? (v) => `${moneyFull(v)} so'm` : (v) => `${num(v, 0)} ta`;
    const curVals = cur.map((x, i) => (isToday && i > nowHour ? null : x[metric.key]));
    const c = chart(box, {
      labels,
      tickLabel: (i) => (hourly ? `${String(i).padStart(2, '0')}:00` : shortDate(labels[i])),
      titleFor: (i) => (hourly ? `${labels[i]} – ${String(i + 1).padStart(2, '0')}:00` : `${weekdayShort(labels[i])}, ${shortDate(labels[i])}`),
      series: [
        { name: prevName, values: prev.map((x) => x[metric.key]), color: C.prev, width: 1.5 },
        { name: curName, values: curVals, color: C.s1, area: true, endDot: true },
      ],
      format: fmt,
      axisFormat: metric.money ? (v) => compact(v) : (v) => num(v, 0),
      height: 250,
      ariaLabel: `${metric.label}: ${curName.toLowerCase()} va ${prevName.toLowerCase()} grafigi`,
    });
    c.box = box;
    charts.push(c);
    const table = host.querySelector('[data-table]');
    table.innerHTML = tableView([
      { label: hourly ? 'Soat' : 'Sana', get: (r) => (hourly ? r.cur.day : shortDate(r.cur.day)) },
      { label: metric.label, right: true, get: (r) => fmt(r.cur[metric.key]) },
      { label: prevName, right: true, get: (r) => (r.prev ? fmt(r.prev[metric.key]) : '—') },
    ], cur.map((x, i) => ({ cur: x, prev: prev[i] })));
  };
  draw();
  host.querySelectorAll('[data-metric]').forEach((b) => b.addEventListener('click', () => {
    metric = METRICS.find((m) => m.key === b.dataset.metric);
    host.querySelectorAll('[data-metric]').forEach((x) => x.classList.toggle('active', x === b));
    draw();
  }));
  host.querySelector('[data-table-toggle]')?.addEventListener('click', () => {
    const t = host.querySelector('[data-table]');
    t.hidden = !t.hidden;
  });
}

// ---------- Foyda va zarar ----------

function pnlCard(d) {
  const c = d.pnl.current;
  const p = d.pnl.previous;
  const row = (label, cur, prev, cls = '', goodWhenUp = true, tip = '') => `
    <div class="pnl-row ${cls}" ${tip ? `title="${esc(tip)}"` : ''}><span class="lbl">${label}</span><span class="val ${cls.includes('grand') && cur < 0 ? 'neg' : ''}">${moneyFull(cur)}</span>
      <span class="chg">${cls.includes('sub') ? '' : deltaAmount(cur, prev, { goodWhenUp, title: 'oldingi davrga nisbatan' })}</span></div>`;
  const parts = [
    { label: 'Tovar kelish narxi', value: Math.max(0, c.cogs), color: C.cost },
    { label: 'Xarajatlar', value: Math.max(0, c.expenses), color: C.warn },
    { label: 'Buzilgan tovar', value: Math.max(0, c.losses), color: C.neg },
    { label: 'Sof foyda', value: Math.max(0, c.net_profit), color: C.s2 },
  ];
  const per100 = c.net_revenue > 0 ? Math.round(Math.max(0, c.net_margin)) : 0;
  return `
    <section class="card" style="height:100%">
      <div class="card-head"><div><h2>Foyda hisobi</h2><div class="card-sub">Sotuvdan tushgan puldan nima qoldi</div></div>
        <a class="link-btn" href="#/reports?tab=pnl&from=${d.range.from}&to=${d.range.to}">Batafsil ${icon('right', 'ico-xs')}</a></div>
      <div class="pnl-list">
        ${row('Jami sotuv', c.gross_revenue, p.gross_revenue, '', true, 'Chegirma va qaytarishdan oldingi summa')}
        ${row('− Chegirmalar', c.discounts, p.discounts, 'sub')}
        ${row('− Qaytarilgan tovar', c.returns, p.returns, 'sub')}
        ${row('Tushum', c.net_revenue, p.net_revenue, 'total', true, 'Haqiqatda tushgan pul')}
        ${row('− Tovarlarning kelish narxi', c.cogs, p.cogs, 'sub', true, "Sotilgan tovarlarni o'zingiz necha so'mga olgansiz")}
        ${row('Savdo foydasi', c.gross_profit, p.gross_profit, 'total', true, 'Tushum minus tovarlarning kelish narxi')}
        ${row('− Xarajatlar', c.expenses, p.expenses, 'sub', false)}
        ${row("− Buzilgan / yo'qolgan tovar", c.losses, p.losses, 'sub', false)}
        ${row(c.net_profit >= 0 ? "Sof foyda (qo'lga qoladi)" : 'Zarar', c.net_profit, p.net_profit, 'grand')}
      </div>
      <div style="margin-top:14px">
        <div class="between small" style="margin-bottom:6px"><span class="muted">Tushum qayerga ketdi</span>${per100 ? `<span class="muted">har 100 so'mdan <b style="color:var(--text)">${per100} so'm</b> foyda</span>` : ''}</div>
        ${segbar(parts)}
        <div class="legend" style="margin-top:8px">${parts.map((x) => `<span><i class="box" style="background:${x.color}"></i>${x.label}</span>`).join('')}</div>
        ${c.net_profit < 0 ? `<div class="note" style="margin-top:10px">${icon('info', 'ico-xs')}<span>Bu davrda xarajatlar savdo foydasidan ${compact(Math.abs(c.net_profit), { unit: true })} ko'p bo'ldi.</span></div>` : ''}
      </div>
    </section>`;
}

// ---------- Mahsulotlar reytingi ----------

const TOP_TABS = [
  { key: 'best', label: "Ko'p sotilgan", value: (p) => [compact(p.revenue, { unit: true }), `${num(p.qty_sold, 2)} ${p.unit} sotildi`] },
  { key: 'profit', label: 'Eng foydali', value: (p) => [compact(p.profit, { unit: true }), `har 100 so'mdan ${Math.round(Math.max(0, p.margin || 0))} so'm`] },
  { key: 'slow', label: 'Sekin sotiladi', value: (p) => [`${pctText(p.sell_through, 0)}`, 'qoldiqdan sotilgani'] },
  { key: 'zero', label: 'Sotilmagan', value: (p) => [compact(p.stock_value, { unit: true }), 'omborda turibdi'] },
];

export function topCard(d) {
  return `
    <section class="card" style="height:100%">
      <div class="card-head" style="margin-bottom:8px"><div><h2>Qaysi tovarlar yaxshi sotilmoqda</h2><div class="card-sub">Tanlangan davr bo'yicha</div></div>
        <a class="link-btn" href="#/reports?tab=products&from=${d.range.from}&to=${d.range.to}">Barchasi ${icon('right', 'ico-xs')}</a></div>
      <div class="ptabs" role="tablist">${TOP_TABS.map((t, i) => `<button type="button" data-top="${t.key}" class="${i === 0 ? 'active' : ''}">${t.label}${t.key === 'zero' && d.top.zero_count ? ` · ${d.top.zero_count}` : ''}</button>`).join('')}</div>
      <div data-top-list></div>
    </section>`;
}

export function mountTop(host, d) {
  const list = host.querySelector('[data-top-list]');
  if (!list) return;
  const show = (key) => {
    const tab = TOP_TABS.find((t) => t.key === key);
    const rows = d.top[key] || [];
    list.innerHTML = rows.length ? rows.map((p) => {
      const [v, sub] = tab.value(p);
      return `<a class="prod-row" href="#/products/${p.id}">${productThumb(p).replace('class="thumb"', 'class="thumb thumb-sm"')}
        <div style="min-width:0"><div class="pn">${esc(p.name)}</div><div class="ps">qoldiq ${num(p.stock_qty, 2)} ${esc(p.unit)}${p.category_name ? ` · ${esc(p.category_name)}` : ''}</div></div>
        <div class="pv">${esc(v)}<small>${esc(sub)}</small></div></a>`;
    }).join('') : emptyState(key === 'zero' ? "Hamma mahsulot sotilmoqda" : "Bu davrda ma'lumot yo'q", 'box');
  };
  show('best');
  host.querySelectorAll('[data-top]').forEach((b) => b.addEventListener('click', () => {
    host.querySelectorAll('[data-top]').forEach((x) => x.classList.toggle('active', x === b));
    show(b.dataset.top);
  }));
}

// ---------- Prognoz ----------

function forecastCard(f) {
  if (!f.sufficient) {
    return `<section class="card" style="height:100%">
      <div class="card-head"><div><h2>Keyingi 7 kun</h2><div class="card-sub">Taxminiy tushum va foyda</div></div><span class="badge badge-est">Taxmin</span></div>
      ${emptyState("Prognoz uchun kamida 7 kunlik savdo tarixi kerak. Savdo davom etgan sari prognoz paydo bo'ladi.", 'chart')}</section>`;
  }
  const conf = { low: 'past', medium: "o'rtacha", high: 'yuqori' }[f.confidence];
  return `
    <section class="card" style="height:100%">
      <div class="card-head" style="margin-bottom:10px"><div><h2>Keyingi 7 kun</h2><div class="card-sub">Taxminan qancha sotiladi · ishonchlilik: ${conf}</div></div>
        <span class="badge badge-est">${icon('target2', 'ico-xs')} Taxmin</span></div>
      <div class="kv" style="margin-bottom:12px">
        <span class="k">Kutilayotgan savdo</span><span class="v">${compact(f.totals.low)} – ${compact(f.totals.high)} so'm</span>
        <span class="k">Taxminiy savdo foydasi</span><span class="v">≈ ${compact(f.totals.gross_profit, { unit: true })}</span>
        <span class="k">Xarajatlar ayirilgandan keyin</span><span class="v ${f.totals.net_profit < 0 ? 'neg' : ''}">≈ ${compact(f.totals.net_profit, { unit: true })}</span>
        <span class="k">O'tgan 7 kunda haqiqatda</span><span class="v">${compact(f.last7_actual.revenue, { unit: true })}</span>
      </div>
      <div class="legend" style="margin-bottom:6px"><span><i style="background:${C.s1}"></i>Haqiqiy</span><span><i class="dash" style="--c:${C.s1}"></i>Taxmin</span><span><i class="box" style="background:${C.s1};opacity:.18"></i>Bo'lishi mumkin bo'lgan chegara</span></div>
      <div data-chart="forecast"></div>
      <div class="note" style="margin-top:8px">${icon('info', 'ico-xs')}<span>${esc(f.method)} Kafolatlangan natija emas.</span></div>
    </section>`;
}

function mountForecast(host, d) {
  const box = host.querySelector('[data-chart="forecast"]');
  if (!box || !d.forecast?.sufficient) return;
  const f = d.forecast;
  const hist = f.history;
  const labels = [...hist.map((x) => x.day), ...f.days.map((x) => x.day)];
  const H = hist.length;
  const actual = [...hist.map((x) => x.revenue), ...f.days.map(() => null)];
  const est = [...hist.map((x, i) => (i === H - 1 ? x.revenue : null)), ...f.days.map((x) => x.revenue)];
  charts.push(chart(box, {
    labels,
    tickLabel: (i) => shortDate(labels[i]),
    titleFor: (i) => `${weekdayShort(labels[i])}, ${shortDate(labels[i])}${i >= H ? ' · taxmin' : ''}`,
    series: [
      { name: 'Haqiqiy tushum', values: actual, color: C.s1 },
      { name: 'Taxminiy tushum', values: est, color: C.s1, dashed: true },
    ],
    band: { low: [...hist.map(() => null), ...f.days.map((x) => x.low)], high: [...hist.map(() => null), ...f.days.map((x) => x.high)], color: C.s1, name: "Bo'lishi mumkin bo'lgan chegara" },
    format: (v) => `${moneyFull(v)} so'm`,
    height: 180,
    ariaLabel: 'So\'nggi 14 kun tushumi va keyingi 7 kun taxmini',
  }));
}

// ---------- Ombor holati ----------

function inventoryCard(inv, d) {
  const t = inv.totals;
  const parts = [
    { label: 'Yetarli', value: t.healthy, color: C.s2, href: '#/products' },
    { label: 'Kam qolgan', value: t.low, color: C.warn, href: '#/products?filter=low' },
    { label: 'Tugagan', value: t.out, color: C.neg, href: '#/products?filter=out' },
    { label: 'Sotilmayotgan', value: t.dead, color: '#8a93a3', href: '#/reports?tab=slow' },
    { label: "Ko'p turib qolgan", value: t.overstock, color: C.cost, href: '#/reports?tab=slow' },
  ];
  const restock = inv.restock.slice(0, 4);
  return `
    <section class="card" style="height:100%">
      <div class="card-head"><div><h2>Ombor holati</h2><div class="card-sub">${t.products} ta mahsulot, ${t.in_stock} tasi omborda</div></div>
        <a class="link-btn" href="#/reports?tab=inventory">Tahlil ${icon('right', 'ico-xs')}</a></div>
      <div class="row" style="align-items:baseline;gap:6px"><div class="big-figure">${compact(t.cost_value)}<span class="cur">so'm</span></div><span class="muted small">kelish narxida${t.retail_value !== null ? ` · sotsangiz ≈ ${compact(t.retail_value)}` : ''}</span></div>
      <div style="margin-top:12px">${segbar(parts)}</div>
      <div class="health">${parts.map((x) => `<a href="${x.href}"><i style="background:${x.color}"></i>${x.label}<b>${x.value}</b></a>`).join('')}</div>
      ${restock.length ? `<div style="margin-top:14px"><h4 class="muted" style="font-weight:550;margin-bottom:4px">Tez orada olib kelish kerak</h4>
        ${restock.map((p) => `<a class="prod-row" href="#/products/${p.id}" style="grid-template-columns:minmax(0,1fr) auto">
          <div style="min-width:0"><div class="pn">${esc(p.name)}</div><div class="ps">${p.status === 'out' ? '<span class="neg">tugagan</span>' : `qoldiq ${num(p.stock_qty, 2)} ${esc(p.unit)}`}</div></div>
          <div class="pv">~${num(p.suggested_qty, 0)} ${esc(p.unit)}<small>olib keling</small></div></a>`).join('')}</div>` : ''}
    </section>`;
}

// ---------- So'nggi amallar ----------

function recentCard(d) {
  return `
    <section class="card" style="height:100%">
      <div class="card-head"><h2>So'nggi amallar</h2>${d.access.financial ? '<a class="link-btn" href="#/history">Tarix</a>' : ''}</div>
      ${d.recent.length ? `<div class="list">${d.recent.slice(0, 6).map((r) => {
        const k = KIND[r.kind] || { label: r.kind, sign: 1, icon: 'list' };
        const label = r.kind === 'expense' ? (EXPENSE_LABEL[r.ref] || r.ref) : r.ref;
        const href = r.kind === 'sale' ? `#/sales/${r.id}` : r.kind === 'purchase' ? `#/purchases/${r.id}` : r.kind === 'expense' ? '#/cash?tab=expenses' : '#/debts';
        return `<a class="list-item" href="${href}">
          <span class="thumb thumb-sm">${icon(k.icon, 'ico-sm')}</span>
          <div class="meta"><div class="name">${esc(k.label)} · ${esc(label)}</div><div class="sub">${esc(r.party || '')} · ${esc(timeAgo(r.at))}</div></div>
          <div class="end num ${k.sign > 0 ? '' : 'muted'}" style="font-weight:600">${k.sign > 0 ? '+' : '−'}${moneyFull(r.amount)}</div></a>`;
      }).join('')}</div>` : emptyState("Hozircha amallar yo'q", 'clock')}
    </section>`;
}

// ---------- Vidjetlarni sozlash ----------

function openWidgetSettings(onSaved) {
  let list = prefsCache.dashboard.widgets.map((w) => ({ ...w }));
  let onbOn = !prefsCache.dashboard.onboarding_hidden;
  const body = () => list.map((w, i) => `
    <div class="widget-row">
      <label class="switch"><input type="checkbox" data-vis="${w.id}" ${w.visible ? 'checked' : ''}><span class="track"></span></label>
      <span class="grow">${esc(WIDGET_LABELS[w.id])}</span>
      <button class="icon-btn" type="button" data-up="${i}" ${i === 0 ? 'disabled' : ''} aria-label="Yuqoriga">${icon('up', 'ico-sm')}</button>
      <button class="icon-btn" type="button" data-down="${i}" ${i === list.length - 1 ? 'disabled' : ''} aria-label="Pastga">${icon('down', 'ico-sm')}</button>
    </div>`).join('');
  openModal({
    title: 'Bosh sahifa vidjetlari',
    body: `<p class="small muted" style="margin-bottom:8px">Qaysi bo'limlar ko'rinishini va tartibini tanlang. Sozlama faqat siz uchun saqlanadi.</p><div class="widget-row"><label class="switch"><input type="checkbox" id="onb-on" ${onbOn ? 'checked' : ''}><span class="track"></span></label><span class="grow">Boshlash yo'riqnomasi (yangi do'kon uchun)</span></div><div id="wl">${body()}</div>`,
    foot: `<button class="btn btn-light" type="button" data-reset>Standart</button><button class="btn" type="button" data-save>${icon('check', 'ico-sm')} Saqlash</button>`,
    onMount: (el, close) => {
      const wl = el.querySelector('#wl');
      const bind = () => {
        wl.querySelectorAll('[data-vis]').forEach((c) => c.addEventListener('change', () => { list.find((w) => w.id === c.dataset.vis).visible = c.checked; }));
        wl.querySelectorAll('[data-up]').forEach((b) => b.addEventListener('click', () => { const i = Number(b.dataset.up); [list[i - 1], list[i]] = [list[i], list[i - 1]]; wl.innerHTML = body(); bind(); }));
        wl.querySelectorAll('[data-down]').forEach((b) => b.addEventListener('click', () => { const i = Number(b.dataset.down); [list[i + 1], list[i]] = [list[i], list[i + 1]]; wl.innerHTML = body(); bind(); }));
      };
      bind();
      el.querySelector('#onb-on').addEventListener('change', (e) => { onbOn = e.target.checked; });
      el.querySelector('[data-reset]').addEventListener('click', () => {
        list = Object.keys(WIDGET_LABELS).map((id) => ({ id, visible: true }));
        onbOn = true;
        el.querySelector('#onb-on').checked = true;
        wl.innerHTML = body();
        bind();
      });
      el.querySelector('[data-save]').addEventListener('click', async () => {
        try {
          const r = await put('/me/preferences', { dashboard: { widgets: list, onboarding_hidden: !onbOn } });
          prefsCache = r.prefs;
          close();
          toast('Saqlandi', 'ok');
          onSaved();
        } catch (err) {
          errorToast(err);
        }
      });
    },
  });
}
