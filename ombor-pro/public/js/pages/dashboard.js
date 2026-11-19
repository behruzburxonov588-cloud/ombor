// Bosh sahifa: eng muhim ko'rsatkichlar 5 soniyada tushunarli bo'lishi uchun.
// Barcha raqamlar /api/analytics/dashboard dan (haqiqiy yozuvlar asosida) olinadi.
import {
  get, put, esc, icon, num, compact, moneyFull, kpiMoney, deltaPill, pctText, dateTime, timeAgo, longDate,
  shortDate, weekdayShort, RANGE_PRESETS, presetRange, todayStr, openModal, toast, errorToast,
  productThumb, emptyState,
} from '../ui.js';
import { chart, sparkline, segbar, tableView } from '../charts.js';

const C = { s1: '#2a78d6', s2: '#1a9a62', prev: '#b9bfc9', pos: '#16794c', neg: '#c03a35', warn: '#d08a0d', cost: '#8fa3bf' };
const WIDGET_LABELS = {
  assistant: 'Bugungi xulosa (yordamchi)',
  kpis: "Asosiy ko'rsatkichlar",
  sales_chart: 'Savdo dinamikasi',
  pnl: 'Foyda va zarar',
  top_products: 'Mahsulotlar reytingi',
  forecast: 'Keyingi 7 kun prognozi',
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

let prefsCache = null;
let charts = [];

function greeting() {
  const h = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Tashkent', hour: '2-digit', hour12: false }).format(new Date()));
  if (h < 11) return 'Xayrli tong';
  if (h < 18) return 'Xayrli kun';
  return 'Xayrli kech';
}

function resolve(query, prefs) {
  if (query.from && query.to) return { key: 'custom', from: query.from, to: query.to };
  const key = RANGE_PRESETS.some((p) => p.key === query.range) ? query.range : prefs.dashboard.range;
  return { key, ...presetRange(key) };
}

function compareLabel(r) {
  if (r.key === 'today') return 'kechaning shu vaqtiga nisbatan';
  if (r.key === 'custom') return 'oldingi shuncha kunga nisbatan';
  return `oldingi ${RANGE_PRESETS.find((p) => p.key === r.key)?.days} kunga nisbatan`;
}
function shortCompare(r) {
  if (r.key === 'today') return 'kechaga nisbatan';
  if (r.key === 'custom') return 'oldingi davrga';
  return `oldingi ${RANGE_PRESETS.find((p) => p.key === r.key)?.days} kunga`;
}

export async function render(root, params, ctx) {
  if (!prefsCache) prefsCache = (await get('/me/preferences')).prefs;
  const range = resolve(params.query, prefsCache);
  root.innerHTML = `<div id="dash-root"></div>`;
  await load(root.querySelector('#dash-root'), range, ctx, true);
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
  charts.forEach((c) => c.destroy());
  charts = [];

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
  const body = (onbHtml ? `<div class="w-full" data-widget="onboarding">${onbHtml}</div>` : '')
    + rendered.map((w) => `<div class="${w.size}" data-widget="${w.id}">${w.html}</div>`).join('');

  const canSell = can('sales.create');
  const canBuy = can('purchases.create');
  host.innerHTML = `
    <div class="dash-head">
      <div>
        <div class="hello">${greeting()}, ${esc(ctx.user.full_name.split(' ')[0])}</div>
        <h1>${esc(d.store_name)}</h1>
        <div class="muted small" style="margin-top:2px">${longDate()} · <span title="${esc(dateTime(d.generated_at))}">yangilandi ${esc(timeAgo(d.generated_at))}</span></div>
      </div>
      <div class="filterbar no-print">
        <div class="seg" role="tablist" aria-label="Davr">
          ${RANGE_PRESETS.map((p) => `<button type="button" role="tab" data-range="${p.key}" class="${range.key === p.key ? 'active' : ''}" aria-selected="${range.key === p.key}">${p.label}</button>`).join('')}
          <button type="button" data-range="custom" class="${range.key === 'custom' ? 'active' : ''}">${icon('calendar', 'ico-xs')} Boshqa</button>
        </div>
        <div class="range-custom" ${range.key === 'custom' ? '' : 'hidden'}>
          <input class="input" type="date" id="df" value="${esc(range.from)}" max="${todayStr()}" aria-label="Boshlanish sanasi">
          <span class="muted">–</span>
          <input class="input" type="date" id="dt" value="${esc(range.to)}" max="${todayStr()}" aria-label="Tugash sanasi">
        </div>
        <button class="btn btn-light btn-sm" type="button" id="widgets" title="Vidjetlarni sozlash">${icon('sliders', 'ico-sm')}<span class="mobile-hide">Vidjetlar</span></button>
        ${canSell ? `<a class="btn btn-sm" href="#/sales">${icon('cart', 'ico-sm')} Sotuv</a>` : ''}
        ${canBuy ? `<a class="btn btn-light btn-sm" href="#/purchases/new">${icon('truck', 'ico-sm')} Kirim</a>` : ''}
      </div>
    </div>
    <div class="dash">${body || `<div class="w-full card">${emptyState("Barcha vidjetlar yashirilgan. «Vidjetlar» tugmasi orqali yoqing", 'sliders')}</div>`}</div>`;

  // Davr tanlash: sahifani qayta yuklamasdan yangilaydi (ramka saqlanadi)
  host.querySelectorAll('[data-range]').forEach((b) => b.addEventListener('click', () => {
    if (b.dataset.range === 'custom') {
      host.querySelector('.range-custom').hidden = false;
      host.querySelectorAll('[data-range]').forEach((x) => x.classList.toggle('active', x === b));
      host.querySelector('#df').focus();
      return;
    }
    const next = { key: b.dataset.range, ...presetRange(b.dataset.range) };
    history.replaceState(null, '', `#/dashboard?range=${next.key}`);
    prefsCache.dashboard.range = next.key;
    put('/me/preferences', { dashboard: { range: next.key } }).catch(() => {});
    load(host, next, ctx);
  }));
  const applyCustom = () => {
    const f = host.querySelector('#df').value;
    const t = host.querySelector('#dt').value;
    if (!f || !t) return;
    if (f > t) return toast("Boshlanish sanasi tugash sanasidan oldin bo'lishi kerak", 'warn');
    history.replaceState(null, '', `#/dashboard?from=${f}&to=${t}`);
    load(host, { key: 'custom', from: f, to: t }, ctx);
  };
  host.querySelector('#df').addEventListener('change', applyCustom);
  host.querySelector('#dt').addEventListener('change', applyCustom);
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
              <div><h2>Bugungi xulosa</h2><div class="card-sub">Haqiqiy savdo va ombor ma'lumotlaridan</div></div></div>
          </div>
          <div class="brief-text">${b.summary.map((s) => `<p>${esc(s)}</p>`).join('')}</div>
          ${insight ? `<div class="note" style="margin-top:12px">${icon('bulb', 'ico-xs')}<span><b style="color:var(--text);font-weight:550">${esc(insight.title)}.</b> ${esc(insight.recommendation)}</span></div>` : ''}
        </div>
        <div>
          <div class="between" style="margin-bottom:6px"><h4 class="muted" style="font-weight:550">Diqqat talab qiladi</h4><a class="link-btn" href="#/assistant">Yordamchi ${icon('right', 'ico-xs')}</a></div>
          ${attn.length ? `<div class="attn">${attn.map((a) => `
            <a class="attn-item" href="${esc(a.link)}"><span class="lvl lvl-${esc(a.level)}"></span><div style="min-width:0"><b>${esc(a.title)}</b><span>${esc(a.text)}</span></div></a>`).join('')}</div>`
    : `<div class="alert alert-ok">${icon('ok', 'ico-sm')}<div>Hozircha shoshilinch masala yo'q</div></div>`}
        </div>
      </div>
    </section>`;
}

// ---------- KPI kartochkalari ----------

function kpiCards(d, range) {
  const k = d.kpis;
  const q = `from=${range.from}&to=${range.to}`;
  const cmp = compareLabel(range);
  const shortCmp = shortCompare(range);
  const card = ({ label, kpi, href, note, goodWhenUp = true, color = C.s1, valueHtml, snapshot = false, hint }) => `
    <a class="stat" href="${href}" title="${esc(hint || '')}">
      <div class="stat-label">${esc(label)}<span class="go">${icon('arrowUpRight', 'ico-xs')}</span></div>
      <div class="stat-value ${kpi.value < 0 ? 'neg' : ''}" title="${esc(`${moneyFull(kpi.value)} so'm`)}">${valueHtml || kpiMoney(kpi.value)}</div>
      ${sparkline(kpi.spark, { color })}
      <div class="stat-foot">${deltaPill(kpi.change, { goodWhenUp, title: snapshot ? 'davr boshiga nisbatan' : cmp })}<span class="stat-note" title="${esc(note)}">${esc(note)}</span></div>
    </a>`;
  const cards = [];
  cards.push(card({
    label: range.key === 'today' ? 'Bugungi tushum' : 'Sof tushum', kpi: k.revenue, href: `#/reports?tab=sales&${q}`,
    note: shortCmp, hint: "Sof tushum = sotuvlar − chegirmalar − qaytarishlar. Qarz to'lovlari kirmaydi.",
  }));
  if (k.net_profit) {
    cards.push(card({
      label: range.key === 'today' ? 'Bugungi sof foyda' : 'Sof foyda', kpi: k.net_profit, href: `#/reports?tab=pnl&${q}`,
      note: k.net_profit.margin ? `marja ${pctText(k.net_profit.margin)}` : shortCmp, color: k.net_profit.value >= 0 ? C.s2 : C.neg,
      hint: "Sof foyda = sof tushum − tannarx − xarajatlar − ombor yo'qotishlari",
    }));
  }
  if (k.expenses) {
    cards.push(card({
      label: 'Xarajatlar', kpi: k.expenses, href: `#/cash?tab=expenses&${q}`, goodWhenUp: false, color: C.cost,
      note: k.expenses.losses > 0 ? `+ yo'qotish ${compact(k.expenses.losses)}` : shortCmp, hint: 'Ijara, maosh, kommunal va boshqa operatsion xarajatlar',
    }));
  }
  cards.push(card({
    label: 'Savdolar soni', kpi: k.sales_count, href: `#/sales/history?${q}`, valueHtml: `${num(k.sales_count.value, 0)}<span class="cur">ta</span>`,
    note: `o'rtacha ${compact(k.sales_count.avg_order)}`, hint: 'Yakunlangan cheklar soni',
  }));
  if (k.inventory_value) {
    cards.push(card({
      label: 'Ombordagi tovar', kpi: k.inventory_value, href: '#/reports?tab=inventory', snapshot: true, color: C.cost,
      note: 'tannarxda', hint: "Omborga sarflangan pul (sotib olish narxida)",
    }));
  }
  if (k.customer_debt) {
    cards.push(card({
      label: 'Mijozlar qarzi', kpi: k.customer_debt, href: '#/debts', snapshot: true, goodWhenUp: false, color: C.warn,
      note: 'jami nasiya', hint: "Mijozlarning to'lanmagan nasiya qarzi",
    }));
  }
  return `<div class="stats ${cards.length <= 3 ? 'three' : cards.length === 4 ? 'four' : ''}">${cards.join('')}</div>`;
}

// ---------- Savdo grafigi ----------

const METRICS = [
  { key: 'net_revenue', label: 'Tushum', money: true },
  { key: 'gross_profit', label: 'Yalpi foyda', money: true, financial: true },
  { key: 'sales_count', label: 'Savdolar', money: false },
  { key: 'avg_order', label: "O'rtacha chek", money: true },
];

function salesCard(d) {
  const s = d.sales;
  const metrics = METRICS.filter((m) => !m.financial || d.access.financial);
  const gp = d.pnl ? `<div><div class="l">Yalpi foyda</div><div class="v">${compact(d.pnl.current.gross_profit)}</div><div class="d">${deltaPill(pctFrom(d.pnl.current.gross_profit, d.pnl.previous.gross_profit))}</div></div>` : '';
  return `
    <section class="card" style="height:100%">
      <div class="card-head" style="margin-bottom:10px">
        <div><h2>Savdo dinamikasi</h2><div class="card-sub">${d.chart.grain === 'hour' ? 'Soatlar bo\'yicha, kecha bilan solishtirib' : 'Kunlar bo\'yicha, oldingi davr bilan solishtirib'}</div></div>
        <button class="btn btn-ghost btn-sm" type="button" data-table-toggle>${icon('table', 'ico-sm')} Jadval</button>
      </div>
      <div class="mini-stats" style="margin-bottom:14px">
        <div><div class="l">Sof tushum</div><div class="v">${compact(s.net_revenue)}</div><div class="d">${deltaPill(pctFrom(s.net_revenue, s.previous.net_revenue))}</div></div>
        <div><div class="l">Savdolar</div><div class="v">${num(s.sales_count, 0)}</div><div class="d">${deltaPill(pctFrom(s.sales_count, s.previous.sales_count))}</div></div>
        <div><div class="l">O'rtacha chek</div><div class="v">${compact(s.avg_order)}</div><div class="d">${deltaPill(pctFrom(s.avg_order, s.previous.avg_order))}</div></div>
        ${gp || `<div><div class="l">Pozitsiyalar</div><div class="v">${num(s.lines, 0)}</div><div class="d"><span class="muted small">chekdagi qatorlar</span></div></div>`}
      </div>
      <div class="legend-row">
        <div class="ptabs" style="margin:0;border:0" role="tablist">${metrics.map((m, i) => `<button type="button" data-metric="${m.key}" class="${i === 0 ? 'active' : ''}">${m.label}</button>`).join('')}</div>
        <div class="legend"><span><i style="background:${C.s1}"></i>Joriy davr</span><span><i style="background:${C.prev}"></i>Oldingi davr</span></div>
      </div>
      <div data-chart="sales"></div>
      <div data-table hidden></div>
    </section>`;
}

function pctFrom(cur, prev) {
  if (Math.abs(prev) < 0.005) return Math.abs(cur) < 0.005 ? 0 : null;
  return ((cur - prev) / Math.abs(prev)) * 100;
}

function mountSalesChart(host, d) {
  const box = host.querySelector('[data-chart="sales"]');
  if (!box) return;
  const hourly = d.chart.grain === 'hour';
  const cur = d.chart.current;
  const prev = d.chart.previous;
  let metric = METRICS[0];
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
        { name: 'Oldingi davr', values: prev.map((x) => x[metric.key]), color: C.prev, width: 1.5 },
        { name: 'Joriy davr', values: curVals, color: C.s1, area: true, endDot: true },
      ],
      format: fmt,
      axisFormat: metric.money ? (v) => compact(v) : (v) => num(v, 0),
      height: 250,
      ariaLabel: `${metric.label}: joriy va oldingi davr grafigi`,
    });
    c.box = box;
    charts.push(c);
    const table = host.querySelector('[data-table]');
    table.innerHTML = tableView([
      { label: hourly ? 'Soat' : 'Sana', get: (r) => (hourly ? r.cur.day : shortDate(r.cur.day)) },
      { label: metric.label, right: true, get: (r) => fmt(r.cur[metric.key]) },
      { label: 'Oldingi davr', right: true, get: (r) => (r.prev ? fmt(r.prev[metric.key]) : '—') },
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
  const row = (label, cur, prev, cls = '', goodWhenUp = true) => `
    <div class="pnl-row ${cls}"><span class="lbl">${label}</span><span class="val ${cls.includes('grand') && cur < 0 ? 'neg' : ''}">${moneyFull(cur)}</span>
      <span class="chg">${cls.includes('sub') ? '' : deltaPill(pctFrom(cur, prev), { goodWhenUp })}</span></div>`;
  const parts = [
    { label: 'Tannarx', value: Math.max(0, c.cogs), color: C.cost },
    { label: 'Xarajatlar', value: Math.max(0, c.expenses), color: C.warn },
    { label: "Yo'qotishlar", value: Math.max(0, c.losses), color: C.neg },
    { label: 'Sof foyda', value: Math.max(0, c.net_profit), color: C.s2 },
  ];
  return `
    <section class="card" style="height:100%">
      <div class="card-head"><div><h2>Foyda va zarar</h2><div class="card-sub">so'mda, oldingi davr bilan</div></div>
        <a class="link-btn" href="#/reports?tab=pnl&from=${d.range.from}&to=${d.range.to}">Batafsil ${icon('right', 'ico-xs')}</a></div>
      <div class="pnl-list">
        ${row('Yalpi tushum', c.gross_revenue, p.gross_revenue)}
        ${row('− Chegirmalar', c.discounts, p.discounts, 'sub')}
        ${row('− Qaytarishlar', c.returns, p.returns, 'sub')}
        ${row('Sof tushum', c.net_revenue, p.net_revenue, 'total')}
        ${row('− Tovar tannarxi', c.cogs, p.cogs, 'sub')}
        ${row('Yalpi foyda', c.gross_profit, p.gross_profit, 'total')}
        ${row('− Xarajatlar', c.expenses, p.expenses, 'sub', false)}
        ${row("− Ombor yo'qotishlari", c.losses, p.losses, 'sub', false)}
        ${row(c.net_profit >= 0 ? 'Sof foyda' : 'Sof zarar', c.net_profit, p.net_profit, 'grand')}
      </div>
      <div style="margin-top:14px">
        <div class="between small" style="margin-bottom:6px"><span class="muted">Sof tushum qayerga ketdi</span><span class="muted">sof marja <b style="color:var(--text)">${pctText(c.net_margin)}</b></span></div>
        ${segbar(parts)}
        <div class="legend" style="margin-top:8px">${parts.map((x) => `<span><i class="box" style="background:${x.color}"></i>${x.label}</span>`).join('')}</div>
        ${c.net_profit < 0 ? `<div class="note" style="margin-top:10px">${icon('info', 'ico-xs')}<span>Bu davrda xarajatlar yalpi foydadan ${compact(Math.abs(c.net_profit), { unit: true })} ko'p.</span></div>` : ''}
      </div>
    </section>`;
}

// ---------- Mahsulotlar reytingi ----------

const TOP_TABS = [
  { key: 'best', label: "Eng ko'p sotilgan", value: (p) => [compact(p.revenue, { unit: true }), `${num(p.qty_sold, 2)} ${p.unit}`] },
  { key: 'profit', label: 'Eng foydali', value: (p) => [compact(p.profit, { unit: true }), `marja ${pctText(p.margin)}`] },
  { key: 'frequent', label: "Ko'p xarid", value: (p) => [`${p.receipts} chek`, compact(p.revenue, { unit: true })] },
  { key: 'slow', label: 'Sekin', value: (p) => [`${pctText(p.sell_through, 0)}`, 'sotilish ulushi'] },
  { key: 'zero', label: 'Sotilmagan', value: (p) => [compact(p.stock_value, { unit: true }), 'omborda turibdi'] },
];

function topCard(d) {
  return `
    <section class="card" style="height:100%">
      <div class="card-head" style="margin-bottom:8px"><div><h2>Mahsulotlar reytingi</h2><div class="card-sub">Tanlangan davr bo'yicha</div></div>
        <a class="link-btn" href="#/reports?tab=products&from=${d.range.from}&to=${d.range.to}">Barchasi ${icon('right', 'ico-xs')}</a></div>
      <div class="ptabs" role="tablist">${TOP_TABS.map((t, i) => `<button type="button" data-top="${t.key}" class="${i === 0 ? 'active' : ''}">${t.label}${t.key === 'zero' && d.top.zero_count ? ` · ${d.top.zero_count}` : ''}</button>`).join('')}</div>
      <div data-top-list></div>
    </section>`;
}

function mountTop(host, d) {
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
      <div class="card-head" style="margin-bottom:10px"><div><h2>Keyingi 7 kun</h2><div class="card-sub">Taxminiy natija · ishonchlilik: ${conf}</div></div>
        <span class="badge badge-est">${icon('target2', 'ico-xs')} Taxmin</span></div>
      <div class="kv" style="margin-bottom:12px">
        <span class="k">Kutilayotgan tushum</span><span class="v">${compact(f.totals.low)} – ${compact(f.totals.high)} so'm</span>
        <span class="k">Taxminiy yalpi foyda</span><span class="v">≈ ${compact(f.totals.gross_profit, { unit: true })}</span>
        <span class="k">Xarajatlardan keyin</span><span class="v ${f.totals.net_profit < 0 ? 'neg' : ''}">≈ ${compact(f.totals.net_profit, { unit: true })}</span>
        <span class="k">O'tgan 7 kun (haqiqiy)</span><span class="v">${compact(f.last7_actual.revenue, { unit: true })}</span>
      </div>
      <div class="legend" style="margin-bottom:6px"><span><i style="background:${C.s1}"></i>Haqiqiy</span><span><i class="dash" style="--c:${C.s1}"></i>Taxmin</span><span><i class="box" style="background:${C.s1};opacity:.18"></i>Ehtimoliy oraliq</span></div>
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
    band: { low: [...hist.map(() => null), ...f.days.map((x) => x.low)], high: [...hist.map(() => null), ...f.days.map((x) => x.high)], color: C.s1, name: 'Ehtimoliy oraliq' },
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
    { label: 'Ortiqcha zaxira', value: t.overstock, color: C.cost, href: '#/reports?tab=slow' },
  ];
  const restock = inv.restock.slice(0, 4);
  return `
    <section class="card" style="height:100%">
      <div class="card-head"><div><h2>Ombor holati</h2><div class="card-sub">${t.products} ta mahsulot, ${t.in_stock} tasi omborda</div></div>
        <a class="link-btn" href="#/reports?tab=inventory">Tahlil ${icon('right', 'ico-xs')}</a></div>
      <div class="row" style="align-items:baseline;gap:6px"><div class="big-figure">${compact(t.cost_value)}<span class="cur">so'm</span></div><span class="muted small">tannarx bo'yicha${t.retail_value !== null ? ` · sotuv narxida ${compact(t.retail_value)}` : ''}</span></div>
      <div style="margin-top:12px">${segbar(parts)}</div>
      <div class="health">${parts.map((x) => `<a href="${x.href}"><i style="background:${x.color}"></i>${x.label}<b>${x.value}</b></a>`).join('')}</div>
      ${restock.length ? `<div style="margin-top:14px"><h4 class="muted" style="font-weight:550;margin-bottom:4px">Qayta buyurtma kerak</h4>
        ${restock.map((p) => `<a class="prod-row" href="#/products/${p.id}" style="grid-template-columns:minmax(0,1fr) auto">
          <div style="min-width:0"><div class="pn">${esc(p.name)}</div><div class="ps">${p.status === 'out' ? '<span class="neg">tugagan</span>' : `qoldiq ${num(p.stock_qty, 2)} ${esc(p.unit)}`}</div></div>
          <div class="pv">~${num(p.suggested_qty, 0)} ${esc(p.unit)}<small>tavsiya</small></div></a>`).join('')}</div>` : ''}
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
