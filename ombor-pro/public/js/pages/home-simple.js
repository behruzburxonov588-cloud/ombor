// Bozorchi uchun oddiy bosh sahifa. Ochganda 5 soniyada 3 savolga javob topiladi:
//   «Bugun qancha sotdim?», «Qancha foyda qoldi?», «Kassada qancha pul bor?»
// Keyin 4 ta katta tugma (Sotish, Yuk keldi, Qarz, Xarajat) va eng muhim 3 ta «Diqqat».
// Grafiklar va batafsil raqamlar o'chirilmagan: «To'liq ko'rinish» yoki Hisobot bo'limida.
// Hamma raqam bitta so'rovdan: /api/analytics/home
import { get, put, esc, icon, num, moneyFull, longDate, dateOnly, presetRange } from '../ui.js';

const PERIODS = [
  { key: 'today', label: 'Bugun', sold: 'Bugun sotdingiz', none: "Bugun hali sotuv bo'lmadi" },
  { key: 'yesterday', label: 'Kecha', sold: 'Kecha sotdingiz', none: "Kecha sotuv bo'lmagan" },
  { key: 'month', label: 'Shu oy', sold: 'Shu oy sotdingiz', none: "Shu oy hali sotuv bo'lmadi" },
];
const SHOW = 3;

// 1 850 000 → «1 mln 850 ming so'm» (katta summani o'qish oson bo'lsin)
export function sayMoney(v) {
  let x = Math.round(Math.abs(Number(v) || 0));
  if (x < 1000000) return '';
  const parts = [];
  const mlrd = Math.floor(x / 1e9);
  x %= 1e9;
  const mln = Math.floor(x / 1e6);
  x %= 1e6;
  const ming = Math.floor(x / 1e3);
  const rest = x % 1e3;
  if (mlrd) parts.push(`${mlrd} mlrd`);
  if (mln) parts.push(`${mln} mln`);
  if (ming) parts.push(`${ming} ming`);
  if (rest) parts.push(String(rest));
  return `${parts.join(' ')} so'm`;
}

const sum = (v, sign = '') => `${v < 0 ? '−' : sign}${moneyFull(Math.abs(v))}`;
const qty = (x) => `${num(x.qty, 3)} ${x.unit}`;
const names = (list, total, fmt = (x) => x.name) => `${list.slice(0, 3).map(fmt).join(', ')}${total > 3 ? ` va yana ${total - 3} ta` : ''}`;

function dueText(due, today) {
  if (due < today) return `muddati ${dateOnly(due)} edi`;
  if (due === today) return "to'lov kuni bugun";
  if (due === addDay(today)) return "to'lov kuni ertaga";
  return `${dateOnly(due)} gacha to'lash kerak`;
}
function addDay(s) {
  const d = new Date(`${s}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

// «Diqqat»: eng muhimi birinchi. Har birida bitta tugma — nima qilish kerakligi
function attentionItems(h, ctx) {
  const a = h.attention;
  const items = [];
  if (a.overdue_count) {
    items.push({
      tone: 'bad', icon: 'debt',
      title: a.overdue_count === 1 ? `Qarz muddati o'tdi: ${a.overdue[0].name}` : `${a.overdue_count} kishining qarz muddati o'tdi`,
      text: a.overdue_count === 1 ? `${moneyFull(a.overdue_total)} so'm qaytarishi kerak edi` : `Jami ${moneyFull(a.overdue_total)} so'm: ${names(a.overdue, a.overdue_count)}`,
      href: '#/debts', btn: "Ko'rish",
    });
  }
  if (a.out_count) {
    const canBuy = ctx.can('purchases.create');
    items.push({
      tone: 'bad', icon: 'box',
      title: a.out_count === 1 ? `Tugadi: ${a.out[0].name}` : `${a.out_count} ta tovar tugadi`,
      text: a.out_count === 1 ? "Omborda qolmadi. Yuk kelsa, kiriting" : names(a.out, a.out_count),
      href: canBuy ? '#/purchases/new' : '#/products?filter=out', btn: canBuy ? 'Yuk keldi' : "Ko'rish",
    });
  }
  if (a.supplier_due_count) {
    const s = a.supplier_due[0];
    items.push({
      tone: s.late ? 'bad' : 'warn', icon: 'truck',
      title: a.supplier_due_count === 1 ? `${s.late ? "To'lov kuni o'tdi" : "To'lov kuni yaqin"}: ${s.name}` : `${a.supplier_due_count} ta yetkazib beruvchiga to'lov kuni keldi`,
      text: a.supplier_due_count === 1 ? `${moneyFull(s.debt)} so'm, ${dueText(s.due, h.today)}` : names(a.supplier_due, a.supplier_due_count, (x) => `${x.name} (${moneyFull(x.debt)})`),
      href: '#/debts?tab=suppliers', btn: "Ko'rish",
    });
  }
  if (a.cost_missing) {
    items.push({
      tone: 'warn', icon: 'calc',
      title: `${a.cost_missing.products} ta tovarning olgan narxi yozilmagan`,
      text: "Shuning uchun foyda ko'proq chiqib qoldi. Narxini yozsangiz, foyda o'zi to'g'rilanadi",
      href: '#/products?filter=nocost', btn: 'Narxini yozish',
    });
  }
  if (a.low_count) {
    items.push({
      tone: 'warn', icon: 'box',
      title: a.low_count === 1 ? `Kam qoldi: ${a.low[0].name}` : `${a.low_count} ta tovar kam qoldi`,
      text: a.low_count === 1 ? `Faqat ${qty(a.low[0])} qoldi` : names(a.low, a.low_count, (x) => `${x.name} (${qty(x)})`),
      href: '#/products?filter=low', btn: "Ko'rish",
    });
  }
  return items;
}

function attentionCard(h, ctx) {
  const items = attentionItems(h, ctx);
  if (!items.length) {
    return `<section class="sh-card sh-att" aria-labelledby="sh-att-h">
      <h2 id="sh-att-h">Diqqat</h2>
      <div class="sh-allok">${icon('check')}<div><b>Hammasi joyida</b><span>Tugagan tovar ham, muddati o'tgan qarz ham yo'q</span></div></div>
    </section>`;
  }
  return `<section class="sh-card sh-att" aria-labelledby="sh-att-h">
    <h2 id="sh-att-h">Diqqat <span class="sh-count">${items.length}</span></h2>
    <ul class="sh-alist">${items.map((x, i) => `
      <li class="sh-aitem ${x.tone}" ${i >= SHOW ? 'hidden data-extra' : ''}>
        <span class="sh-aico">${icon(x.icon, 'ico-sm')}</span>
        <div class="sh-atext"><b>${esc(x.title)}</b><span>${esc(x.text)}</span></div>
        <a class="btn btn-sm btn-light" href="${x.href}">${esc(x.btn)}</a>
      </li>`).join('')}</ul>
    ${items.length > SHOW ? `<button type="button" class="link-btn sh-more" data-more>Yana ${items.length - SHOW} ta</button>` : ''}
  </section>`;
}

function heroCard(h, period) {
  const s = h.sales;
  const p = h.profit;
  const words = sayMoney(s.revenue);
  let profitHtml = '';
  if (p) {
    const loss = p.net < 0;
    const spent = Math.round((p.expenses + p.losses) * 100) / 100;
    profitHtml = `
      <details class="sh-profit ${loss ? 'neg' : 'pos'}">
        <summary>
          <span class="sh-l">${loss ? 'Zarar' : 'Foyda'}</span>
          <b class="sh-pv">${sum(p.net, '+')} <small>so'm</small></b>
          <span class="sh-how">Qanday hisoblandi? ${icon('down', 'ico-xs')}</span>
        </summary>
        <div class="sh-calc">
          <div><span>Sotdingiz</span><b>${sum(p.revenue)}</b></div>
          <div><span>Olgan narxingiz</span><b>−${moneyFull(Math.abs(p.cogs))}</b></div>
          <div><span>Xarajatlar${p.losses > 0 ? ', buzilgan tovar' : ' (obed, ijara…)'}</span><b>−${moneyFull(Math.abs(spent))}</b></div>
          <div class="tot"><span>${loss ? 'Zarar' : "Qo'lingizda qoladi"}</span><b>${sum(p.net, '+')}</b></div>
          <a class="link-btn" href="#/reports?tab=pnl&from=${h.range.from}&to=${h.range.to}">Batafsil hisobot ${icon('right', 'ico-xs')}</a>
        </div>
      </details>`;
  }
  const c = h.cash;
  const cashHtml = c ? `
    <a class="sh-cash" href="#/cash?tab=cash">
      <span class="sh-l">Kassada naqd</span>
      <b>${sum(c.cash)} <small>so'm</small></b>
      ${c.card || c.transfer ? `<span class="sh-sub">Kartada ${moneyFull(c.card)} so'm${c.transfer ? `, o'tkazmada ${moneyFull(c.transfer)}` : ''}</span>` : ''}
    </a>` : '';
  return `
    <section class="sh-card sh-hero" aria-label="${esc(period.sold)}">
      <a class="sh-sold" href="#/sales/history?from=${h.range.from}&to=${h.range.to}">
        <span class="sh-l">${esc(period.sold)}</span>
        <b class="sh-big">${moneyFull(s.revenue)} <small>so'm</small></b>
        <span class="sh-sub">${s.count ? `${num(s.count, 0)} ta chek` : esc(period.none)}${words ? `<span class="sh-words">${esc(words)}</span>` : ''}</span>
      </a>
      ${profitHtml}
      ${cashHtml}
    </section>`;
}

function actions(ctx) {
  const sell = ctx.can('sales.create');
  const rest = [
    { ok: ctx.can('purchases.create'), label: 'Yuk keldi', icon: 'truck', href: '#/purchases/new', hint: 'Kelgan tovarni kiritish' },
    { ok: ctx.canAny(['customers.view', 'customers.manage', 'payments.create']), label: 'Qarz', icon: 'debt', href: '#/debts', hint: "Nasiya yozish yoki qarz to'lovini olish" },
    { ok: ctx.can('expenses.manage'), label: 'Xarajat', icon: 'expense', href: '#/cash?tab=expenses&new=1', hint: 'Obed, suv, ijara, maosh' },
  ].filter((x) => x.ok);
  if (!sell && !rest.length) return '';
  return `
    <nav class="sh-actions" aria-label="Asosiy ishlar">
      ${sell ? `<a class="sh-sell" href="#/sales"><span class="sh-sico">${icon('cart')}</span><span><b>Sotish</b><span>Xaridorga tovar sotish</span></span>${icon('right', 'ico-sm')}</a>` : ''}
      ${rest.length ? `<div class="sh-row${rest.length === 1 ? ' one' : ''}" style="--n:${rest.length}">${rest.map((x) => `
        <a class="sh-act" href="${x.href}" title="${esc(x.hint)}"><span class="sh-aico2">${icon(x.icon)}</span><b>${esc(x.label)}</b></a>`).join('')}</div>` : ''}
    </nav>`;
}

// opts: { prefs, query, onboarding: async () => html, afterMount(root), switchMode(mode) }
export async function renderSimpleHome(root, ctx, opts) {
  const want = opts.query?.range || opts.prefs.dashboard.simple_range;
  const period = PERIODS.find((x) => x.key === want) || PERIODS[0];
  const r = presetRange(period.key);
  const [h, onbHtml] = await Promise.all([
    get(`/analytics/home?from=${r.from}&to=${r.to}`),
    opts.onboarding ? opts.onboarding().catch(() => '') : '',
  ]);

  root.innerHTML = `
    <div class="sh">
      <header class="sh-head">
        <div class="grow">
          <h1>${esc(h.store_name)}</h1>
          <div class="muted">${longDate()}</div>
        </div>
        <div class="seg sh-period" role="tablist" aria-label="Qaysi kun">
          ${PERIODS.map((x) => `<button type="button" role="tab" data-p="${x.key}" class="${x.key === period.key ? 'active' : ''}" aria-selected="${x.key === period.key}">${x.label}</button>`).join('')}
        </div>
      </header>
      ${!ctx.settings.setup_done && ctx.can('settings.manage') ? `<div class="alert alert-info">${icon('sliders', 'ico-sm')}<div class="grow"><b>Do'koningiz turini belgilang — 2 daqiqa</b>
        <div class="small">Shunga qarab turkumlar, o'lchov birliklari va tovar qo'shish formasi moslashadi.</div></div>
        <a class="btn btn-sm" href="#/setup">Sozlash</a></div>` : ''}
      <div class="sh-grid">
        <div class="sh-col">${heroCard(h, period)}</div>
        <div class="sh-col">
          ${actions(ctx)}
          ${onbHtml || ''}
          ${attentionCard(h, ctx)}
        </div>
      </div>
      <footer class="sh-foot">
        ${h.access.financial ? `<a class="link-btn" href="#/reports">${icon('table', 'ico-sm')} Batafsil hisobot</a>` : ''}
        <button type="button" class="link-btn" data-mode="detailed">${icon('chart', 'ico-sm')} To'liq ko'rinish (grafiklar bilan)</button>
      </footer>
    </div>`;

  root.querySelectorAll('[data-p]').forEach((b) => b.addEventListener('click', () => {
    if (b.dataset.p === period.key) return;
    opts.prefs.dashboard.simple_range = b.dataset.p;
    put('/me/preferences', { dashboard: { simple_range: b.dataset.p } }).catch(() => {});
    history.replaceState(null, '', `#/dashboard?range=${b.dataset.p}`);
    root.querySelector('.sh')?.classList.add('is-loading');
    renderSimpleHome(root, ctx, { ...opts, query: { range: b.dataset.p } }).catch((err) => opts.onError?.(err));
  }));
  root.querySelector('[data-more]')?.addEventListener('click', (e) => {
    root.querySelectorAll('.sh-att [data-extra]').forEach((x) => { x.hidden = false; });
    e.currentTarget.remove();
  });
  root.querySelector('[data-mode]')?.addEventListener('click', () => opts.switchMode('detailed'));
  opts.afterMount?.(root);
}
