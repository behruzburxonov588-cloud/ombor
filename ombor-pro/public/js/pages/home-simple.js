// Bozorchi uchun oddiy bosh sahifa. Ochganda 5 soniyada 5 savolga javob topiladi:
//   «Qancha sotdim?», «Qancha foyda qoldi?», «Kassada qancha pul bor?», «Nima tugayapti?», «Kim menga qarz?»
// Har bir raqam ostida bir qator izoh. «Foyda qanday hisoblandi» lentasi, katta tugmalar va «Nima qilish kerak».
// Grafiklar va batafsil raqamlar o'chirilmagan: «To'liq ko'rinish» yoki Hisobotlar bo'limida.
// Hamma raqam bitta so'rovdan: /api/analytics/home
import { get, put, esc, icon, num, moneyFull, longDate, dateOnly, presetRange } from '../ui.js';

const PERIODS = [
  { key: 'today', label: 'Bugun', sold: 'Bugun qancha sotdim?', profit: 'Bugun qancha foyda qoldi?', none: "Bugun hali sotuv bo'lmadi" },
  { key: 'yesterday', label: 'Kecha', sold: 'Kecha qancha sotdim?', profit: 'Kecha qancha foyda qoldi?', none: "Kecha sotuv bo'lmagan" },
  { key: 'month', label: 'Shu oy', sold: 'Shu oy qancha sotdim?', profit: 'Shu oy qancha foyda qoldi?', none: "Shu oy hali sotuv bo'lmadi" },
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

const sum = (v, sign = '') => `${v < 0 ? '−' : v > 0 ? sign : ''}${moneyFull(Math.abs(v))}`;
// Ayriladigan summa: 0 bo'lsa «−0» emas, «0»
const minus = (v) => (Math.abs(v) > 0 ? `−${moneyFull(Math.abs(v))}` : '0');
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
      text: a.out_count === 1 ? "Omborda qolmadi. Tovar kelsa, kiriting" : names(a.out, a.out_count),
      href: canBuy ? '#/stockin' : '#/products?filter=out', btn: canBuy ? 'Tovar kiritish' : "Ko'rish",
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
      title: `${a.cost_missing.products} ta tovarning xarid narxi yozilmagan`,
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
      <h2 id="sh-att-h">Nima qilish kerak</h2>
      <div class="sh-allok">${icon('check')}<div><b>Hammasi joyida</b><span>Tugagan tovar ham, muddati o'tgan qarz ham yo'q</span></div></div>
    </section>`;
  }
  return `<section class="sh-card sh-att" aria-labelledby="sh-att-h">
    <h2 id="sh-att-h">Nima qilish kerak <span class="sh-count">${items.length}</span></h2>
    <ul class="sh-alist">${items.map((x, i) => `
      <li class="sh-aitem ${x.tone}" ${i >= SHOW ? 'hidden data-extra' : ''}>
        <span class="sh-aico">${icon(x.icon, 'ico-sm')}</span>
        <div class="sh-atext"><b>${esc(x.title)}</b><span>${esc(x.text)}</span></div>
        <a class="btn btn-sm btn-light" href="${x.href}">${esc(x.btn)}</a>
      </li>`).join('')}</ul>
    ${items.length > SHOW ? `<button type="button" class="link-btn sh-more" data-more>Yana ${items.length - SHOW} ta</button>` : ''}
  </section>`;
}

// Savol → katta javob → bir qator izoh. Bosilsa, batafsil sahifa ochiladi
function answer({ q, big, unit = "so'm", why, href, tone = '', words = '' }) {
  return `
    <a class="sh-ans ${tone}" href="${href}">
      <span class="sh-q">${esc(q)}</span>
      <b class="sh-av">${big}${unit ? ` <small>${esc(unit)}</small>` : ''}</b>
      ${words ? `<span class="sh-words">${esc(words)}</span>` : ''}
      <span class="sh-why">${why}</span>
    </a>`;
}

function answers(h, period) {
  const s = h.sales;
  const p = h.profit;
  const a = h.attention;
  const list = [];
  list.push(answer({
    q: period.sold,
    big: moneyFull(s.revenue),
    words: sayMoney(s.revenue),
    why: s.count ? `${num(s.count, 0)} ta chek. Qaytarilgan tovar ayrilgan` : esc(period.none),
    href: `#/sales/history?from=${h.range.from}&to=${h.range.to}`,
  }));
  if (p) {
    const spent = Math.round((p.expenses + p.losses) * 100) / 100;
    list.push(answer({
      q: period.profit,
      big: sum(p.net, '+'),
      tone: p.net < 0 ? 'neg' : 'pos',
      why: `Sotuvdan foyda ${moneyFull(p.goods)}, undan xarajatlar ${moneyFull(spent)} ayrildi${a.cost_missing ? ". Ba'zi tovarning xarid narxi yozilmagan" : ''}`,
      href: `#/reports?tab=pnl&from=${h.range.from}&to=${h.range.to}`,
    }));
  }
  const c = h.cash;
  if (c) {
    list.push(answer({
      q: 'Kassada qancha pul bor?',
      big: sum(c.cash),
      why: c.card || c.transfer
        ? `Naqd pul. Kartada yana ${moneyFull(c.card)}${c.transfer ? `, o'tkazmada ${moneyFull(c.transfer)}` : ''}`
        : "Naqd pul — sotuv, to'lov va xarajatlardan keyin",
      href: '#/cash?tab=cash',
    }));
  }
  list.push(answer({
    q: 'Nima tugayapti?',
    big: a.out_count ? `${a.out_count} ta` : a.low_count ? `${a.low_count} ta` : 'Hammasi bor',
    unit: a.out_count ? 'tugadi' : a.low_count ? 'kam qoldi' : '',
    tone: a.out_count ? 'neg' : a.low_count ? 'warn' : 'pos',
    why: a.out_count
      ? esc(`Qolmadi: ${names(a.out, a.out_count)}${a.low_count ? `. Yana ${a.low_count} ta kam qoldi` : ''}`)
      : a.low_count ? esc(`Kam qoldi: ${names(a.low, a.low_count, (x) => `${x.name} (${qty(x)})`)}`) : "Tugagan va kam qolgan tovar yo'q",
    href: a.out_count ? '#/products?filter=out' : '#/products?filter=low',
  }));
  if (h.debts) {
    const d = h.debts;
    list.push(answer({
      q: 'Kim menga qarz?',
      big: moneyFull(d.customers_total),
      tone: a.overdue_count ? 'warn' : '',
      why: d.customers_count
        ? `${num(d.customers_count, 0)} kishi${a.overdue_count ? `. Muddati o'tgani: ${moneyFull(a.overdue_total)}` : ". Muddati o'tgani yo'q"}`
        : 'Hech kim qarz emas',
      href: '#/debts',
    }));
  }
  return `<section class="sh-answers" style="--n:${list.length}" aria-label="Asosiy savollarga javob">${list.join('')}</section>`;
}

// «Foyda lentasi»: chek kabi, qadam-baqadam
function profitTape(h) {
  const p = h.profit;
  if (!p) return '';
  const loss = p.net < 0;
  return `
    <section class="sh-card sh-tapecard" aria-labelledby="sh-tape-h">
      <h2 id="sh-tape-h">Foyda qanday hisoblandi</h2>
      <div class="tape">
        <div class="tr"><span>Sotuv</span><b class="num">${sum(p.revenue)}</b></div>
        <div class="tr"><span>Xarid narxi <small>sotilgan tovarni o'zingiz necha pulga olgansiz</small></span><b class="num muted">${minus(p.cogs)}</b></div>
        <div class="tape-rule"></div>
        <div class="tr sub"><span>Sotuvdan foyda</span><b class="num">${sum(p.goods)}</b></div>
        <div class="tr"><span>Xarajatlar <small>obed, ijara, yo'l…</small></span><b class="num muted">${minus(p.expenses)}</b></div>
        ${p.losses > 0 ? `<div class="tr"><span>Buzilgan, yo'qolgan tovar</span><b class="num muted">${minus(p.losses)}</b></div>` : ''}
        <div class="tape-rule strong"></div>
        <div class="tr tot ${loss ? 'neg' : 'pos'}"><span>${loss ? 'Zarar' : "Sof foyda — cho'ntakda qoladi"}</span><b class="num">${sum(p.net, '+')} so'm</b></div>
      </div>
      <a class="link-btn" href="#/reports?tab=pnl&from=${h.range.from}&to=${h.range.to}">Batafsil hisobot ${icon('right', 'ico-xs')}</a>
    </section>`;
}

function actions(ctx) {
  const sell = ctx.can('sales.create');
  const rest = [
    { ok: ctx.can('purchases.create'), label: 'Tovar kiritish', icon: 'truck', href: '#/stockin', hint: 'Kelgan tovarni omborga' },
    { ok: ctx.canAny(['customers.view', 'customers.manage', 'payments.create']), label: 'Qarz', icon: 'debt', href: '#/debts', hint: "Nasiya yozish yoki qarz to'lovini olish" },
    { ok: ctx.can('expenses.manage'), label: 'Xarajat', icon: 'expense', href: '#/cash?tab=expenses&new=1', hint: 'Obed, suv, ijara, maosh' },
  ].filter((x) => x.ok);
  if (!sell && !rest.length) return '';
  return `
    <nav class="sh-actions" aria-label="Asosiy ishlar">
      ${sell ? `<a class="sh-sell" href="#/sales"><span class="sh-sico">${icon('cart')}</span><span><b>Sotuv boshlash</b><span>Xaridorga tovar sotish</span></span>${icon('right', 'ico-sm')}</a>` : ''}
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
      ${answers(h, period)}
      <div class="sh-grid">
        <div class="sh-col">
          ${actions(ctx)}
          ${attentionCard(h, ctx)}
        </div>
        <div class="sh-col">
          ${onbHtml || ''}
          ${profitTape(h)}
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
