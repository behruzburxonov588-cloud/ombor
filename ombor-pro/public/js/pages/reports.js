// Hisobotlar: foyda va zarar, savdo, tovarlar, sekin sotiladigan, ombor, haftalik va prognoz.
// Kunlik, haftalik, oylik va ixtiyoriy davr; Excel va PDF eksport.
import {
  get, put, esc, icon, num, qty, compact, moneyFull, kpiMoney, deltaPill, pctText, todayStr, addDaysStr, monthStartStr,
  dateOnly, shortDate, weekdayShort, longDate, timeAgo, download, withBusy, errorToast, toast, emptyState, productThumb, debounce, EXPENSE_LABEL, PAY_METHOD } from '../ui.js';
import { chart, hbars, segbar } from '../charts.js';

const C = { s1: '#2563eb', prev: '#c3cad6', pos: '#16a34a', neg: '#d92d20', warn: '#d97706', cost: '#94a3b8' };
const TABS = [
  { key: 'pnl', label: 'Foyda va zarar', icon: 'coins', perms: ['reports.view'], export: 'pnl' },
  { key: 'sales', label: 'Savdo', icon: 'chart', perms: ['reports.view'], export: 'sales' },
  { key: 'products', label: 'Tovarlar', icon: 'box', perms: ['reports.view'], export: 'products' },
  { key: 'slow', label: 'Sekin sotiladigan', icon: 'snail', perms: ['reports.view', 'stock.view'], export: 'inventory', noPeriod: true },
  { key: 'inventory', label: 'Ombor', icon: 'warehouse', perms: ['reports.view', 'stock.view'], export: 'inventory', noPeriod: true },
  { key: 'weekly', label: 'Haftalik', icon: 'calendar', perms: ['reports.view'], export: 'weekly', noPeriod: true },
  { key: 'forecast', label: 'Taxmin (7 kun)', icon: 'target2', perms: ['reports.view'], noPeriod: true },
];
const PERIODS = [
  { key: 'today', label: 'Bugun' },
  { key: 'week', label: 'Shu hafta' },
  { key: 'month', label: 'Shu oy' },
  { key: 'last_month', label: "O'tgan oy" },
  { key: 'year', label: 'Shu yil' },
];
const CASH_LABEL = {
  sale: 'Savdo tushumi', refund: 'Qaytarilgan pul', customer_payment: "Mijoz qarz to'lovlari", supplier_payment: "Yetkazib beruvchilarga to'lov",
  expense: 'Xarajatlar', deposit: 'Kassaga kiritilgan', withdrawal: 'Kassadan olingan',
};

let prefs = null;

const mondayOf = (d) => addDaysStr(d, -((new Date(`${d}T00:00:00Z`).getUTCDay() + 6) % 7));

function resolvePeriod(q) {
  const today = todayStr();
  if (q.from && q.to) return { p: 'custom', from: q.from, to: q.to };
  const p = q.p || { today: 'today', week: 'week', month: 'month', year: 'year' }[prefs.reports.period] || 'month';
  if (p === 'today') return { p, from: today, to: today };
  if (p === 'week') return { p, from: mondayOf(today), to: today };
  if (p === 'last_month') {
    const end = addDaysStr(monthStartStr(today), -1);
    return { p, from: monthStartStr(end), to: end };
  }
  if (p === 'year') return { p, from: `${today.slice(0, 4)}-01-01`, to: today };
  return { p: 'month', from: monthStartStr(today), to: today };
}

const pctFrom = (cur, prev) => (Math.abs(prev) < 0.005 ? (Math.abs(cur) < 0.005 ? 0 : null) : ((cur - prev) / Math.abs(prev)) * 100);

export async function render(root, params, ctx) {
  if (!prefs) prefs = (await get('/me/preferences')).prefs;
  const tabs = TABS.filter((t) => ctx.canAny(t.perms));
  const tab = tabs.find((t) => t.key === params.query.tab) || tabs[0];
  const period = resolvePeriod(params.query);
  const q = params.query;
  const link = (over) => {
    const base = { tab: tab.key };
    if (period.p === 'custom') Object.assign(base, { from: period.from, to: period.to });
    else base.p = period.p;
    if (q.grain) base.grain = q.grain;
    const next = { ...base, ...over };
    for (const k of Object.keys(next)) if (next[k] === undefined || next[k] === null || next[k] === '') delete next[k];
    return `#/reports?${new URLSearchParams(next)}`;
  };

  root.innerHTML = `
    <div class="page-head no-print">
      <div><h1>Hisobotlar</h1><p class="muted">${tab.noPeriod ? esc(tab.label) : `${esc(tab.label)} · ${dateOnly(period.from)}${period.from !== period.to ? ` – ${dateOnly(period.to)}` : ''}`}</p></div>
      <div class="row">
        ${tab.export && ctx.can('reports.export') ? `
          <button class="btn btn-light btn-sm" type="button" data-export="xlsx">${icon('xlsx', 'ico-sm')} Excel</button>
          <button class="btn btn-light btn-sm" type="button" data-export="pdf">${icon('pdf', 'ico-sm')} PDF</button>` : ''}
        <button class="btn btn-ghost btn-sm" type="button" id="print">${icon('print', 'ico-sm')} Chop etish</button>
      </div>
    </div>
    <div class="ptabs no-print" role="tablist" style="margin-bottom:14px">${tabs.map((t) => `<button type="button" role="tab" data-tab="${t.key}" class="${t.key === tab.key ? 'active' : ''}">${icon(t.icon, 'ico-xs')} ${t.label}</button>`).join('')}</div>
    <div class="chips other-reports no-print">
      <span class="small muted">Boshqa hisobotlar (Excel/PDF ham bor):</span>
      ${ctx.canAny(['expenses.view', 'reports.view']) ? `<a class="chip" href="#/cash?tab=expenses&from=${period.from}&to=${period.to}">${icon('expense', 'ico-xs')} Xarajatlar</a>` : ''}
      ${ctx.canAny(['customers.view', 'reports.view']) ? `<a class="chip" href="#/debts">${icon('debt', 'ico-xs')} Qarzlar</a>` : ''}
      ${ctx.canAny(['purchases.view']) ? `<a class="chip" href="#/purchases?from=${period.from}&to=${period.to}">${icon('truck', 'ico-xs')} Kirimlar</a>` : ''}
      <a class="chip" href="#/staff?from=${period.from}&to=${period.to}">${icon('staff', 'ico-xs')} Xodimlar</a>
    </div>
    ${tab.noPeriod ? '' : `<div class="filterbar no-print" style="margin-bottom:16px">
      <div class="seg">${PERIODS.map((p) => `<button type="button" data-p="${p.key}" class="${period.p === p.key ? 'active' : ''}">${p.label}</button>`).join('')}
        <button type="button" data-p="custom" class="${period.p === 'custom' ? 'active' : ''}">${icon('calendar', 'ico-xs')} Boshqa</button></div>
      <div class="range-custom" ${period.p === 'custom' ? '' : 'hidden'}>
        <input class="input" type="date" id="cf" value="${period.from}" max="${todayStr()}" aria-label="Boshlanish"><span class="muted">–</span>
        <input class="input" type="date" id="ct" value="${period.to}" max="${todayStr()}" aria-label="Tugash"></div>
    </div>`}
    <div id="body"><div class="empty">Yuklanmoqda…</div></div>`;

  root.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => ctx.go(link({ tab: b.dataset.tab, sort: undefined, start: undefined }))));
  root.querySelectorAll('[data-p]').forEach((b) => b.addEventListener('click', () => {
    if (b.dataset.p === 'custom') {
      root.querySelector('.range-custom').hidden = false;
      root.querySelectorAll('[data-p]').forEach((x) => x.classList.toggle('active', x === b));
      return;
    }
    if (['today', 'week', 'month', 'year'].includes(b.dataset.p) && prefs.reports.period !== b.dataset.p) {
      prefs.reports.period = b.dataset.p;
      put('/me/preferences', { reports: { period: b.dataset.p } }).catch(() => {});
    }
    ctx.go(`#/reports?${new URLSearchParams({ tab: tab.key, p: b.dataset.p, ...(q.grain ? { grain: q.grain } : {}) })}`);
  }));
  const applyCustom = () => {
    const f = root.querySelector('#cf').value;
    const t = root.querySelector('#ct').value;
    if (!f || !t) return;
    if (f > t) return toast("Boshlanish sanasi tugash sanasidan oldin bo'lishi kerak", 'warn');
    ctx.go(`#/reports?${new URLSearchParams({ tab: tab.key, from: f, to: t, ...(q.grain ? { grain: q.grain } : {}) })}`);
  };
  root.querySelector('#cf')?.addEventListener('change', applyCustom);
  root.querySelector('#ct')?.addEventListener('change', applyCustom);
  root.querySelector('#print').addEventListener('click', () => window.print());
  root.querySelectorAll('[data-export]').forEach((b) => b.addEventListener('click', () => withBusy(b, async () => {
    const u = new URLSearchParams({ report: tab.export, format: b.dataset.export, from: period.from, to: period.to });
    if (q.grain) u.set('grain', q.grain);
    if (tab.key === 'weekly' && q.start) u.set('start', q.start);
    try {
      await download(`/reports/export?${u}`);
    } catch (err) {
      errorToast(err);
    }
  })));

  const body = root.querySelector('#body');
  const impl = { pnl, sales, products, slow, inventory, weekly, forecast }[tab.key];
  await impl(body, { period, q, ctx, link });
}

function stat(label, value, change, { goodWhenUp = true, note = '', neg = false } = {}) {
  return `<div class="stat" style="cursor:default"><div class="stat-label">${esc(label)}</div>
    <div class="stat-value ${neg ? 'neg' : ''}">${value}</div>
    <div class="stat-foot">${change !== undefined ? deltaPill(change, { goodWhenUp, title: 'oldingi davrga nisbatan' }) : ''}<span class="stat-note">${esc(note)}</span></div></div>`;
}

// Ko'p kunlik davrni grafik uchun haftalarga yig'ish
function bucket(days, keyFn = (d) => mondayOf(d.day)) {
  if (days.length <= 62) return { rows: days, weekly: false };
  const map = new Map();
  for (const d of days) {
    const k = keyFn(d);
    if (!map.has(k)) map.set(k, { day: k });
    const r = map.get(k);
    for (const [f, v] of Object.entries(d)) if (typeof v === 'number') r[f] = (r[f] || 0) + v;
  }
  return { rows: [...map.values()], weekly: true };
}

// ---------- Foyda va zarar ----------

async function pnl(body, { period }) {
  const r = await get(`/analytics/pnl?from=${period.from}&to=${period.to}`);
  const c = r.current;
  const p = r.previous;
  const line = (label, cur, prev, cls = '', goodWhenUp = true) => `
    <div class="pnl-row ${cls}"><span class="lbl">${label}</span><span class="val ${cls.includes('grand') && cur < 0 ? 'neg' : ''}">${moneyFull(cur)}</span>
      <span class="chg">${cls.includes('sub') ? `<span class="muted tnum">${moneyFull(prev)}</span>` : deltaPill(pctFrom(cur, prev), { goodWhenUp })}</span></div>`;
  const exp = r.expenses_by_category;
  const cash = r.cash;
  body.innerHTML = `
    <div class="stats">
      ${stat('Tushum', kpiMoney(c.net_revenue), pctFrom(c.net_revenue, p.net_revenue), { note: `${c.sales_count} ta savdo` })}
      ${stat('Sotuvdan foyda', kpiMoney(c.gross_profit), pctFrom(c.gross_profit, p.gross_profit), { note: `foyda ulushi ${pctText(c.gross_margin)}`, neg: c.gross_profit < 0 })}
      ${stat('Xarajatlar', kpiMoney(c.expenses), pctFrom(c.expenses, p.expenses), { goodWhenUp: false, note: 'operatsion' })}
      ${stat("Buzilgan / yo'qolgan tovar", kpiMoney(c.losses), pctFrom(c.losses, p.losses), { goodWhenUp: false, note: 'zarar va kamomad' })}
      ${stat(c.net_profit >= 0 ? 'Sof foyda' : 'Zarar', kpiMoney(c.net_profit), pctFrom(c.net_profit, p.net_profit), { note: `sof foyda ulushi ${pctText(c.net_margin)}`, neg: c.net_profit < 0 })}
      ${stat('Pul oqimi (sof)', kpiMoney(cash.net), undefined, { note: `kirim ${compact(cash.inflow)} · chiqim ${compact(cash.outflow)}`, neg: cash.net < 0 })}
    </div>
    <div class="grid main-side" style="margin-top:14px;align-items:start">
      <section class="card">
        <div class="card-head"><div><h2>Kunlik foyda</h2><div class="card-sub">Ustun — sof foyda (yashil) yoki zarar (qizil); chiziq — yalpi foyda</div></div>
          <div class="legend"><span><i class="box" style="background:${C.pos}"></i>Sof foyda</span><span><i class="box" style="background:${C.neg}"></i>Zarar</span><span><i style="background:${C.s1}"></i>Sotuvdan foyda</span></div></div>
        <div data-chart="pnl"></div>
        <div class="note" style="margin-top:8px">${icon('info', 'ico-xs')}<span>Ijara yoki maosh kabi katta xarajatlar to'langan kuni sof foyda manfiy bo'lishi tabiiy — umumiy natijaga qarang.</span></div>
      </section>
      <section class="card">
        <div class="card-head"><div><h2>Foyda va zarar hisoboti</h2><div class="card-sub">Oldingi davr: ${dateOnly(r.range.prevFrom)} – ${dateOnly(r.range.prevTo)}</div></div></div>
        <div class="pnl-list">
          ${line('Jami sotuv (chegirmagacha)', c.gross_revenue, p.gross_revenue)}
          ${line('− Chegirmalar', c.discounts, p.discounts, 'sub')}
          ${line(`− Qaytarishlar (${c.returns_count} ta)`, c.returns, p.returns, 'sub')}
          ${line('Tushum', c.net_revenue, p.net_revenue, 'total')}
          ${line('− Tovarlarning xarid narxi', c.cogs, p.cogs, 'sub')}
          ${line('Sotuvdan foyda', c.gross_profit, p.gross_profit, 'total')}
          ${line('− Operatsion xarajatlar', c.expenses, p.expenses, 'sub')}
          ${line('− Yaroqsiz tovar', c.damage, p.damage, 'sub')}
          ${line('− Sanashda chiqqan kamomad', c.shrinkage, p.shrinkage, 'sub')}
          ${line('+ Sanashda chiqqan ortiqcha', c.surplus, p.surplus, 'sub')}
          ${line(c.net_profit >= 0 ? 'Sof foyda' : 'Zarar', c.net_profit, p.net_profit, 'grand')}
        </div>
        <div class="kv" style="margin-top:14px">
          <span class="k">Sotuvdan foyda ulushi</span><span class="v">${pctText(c.gross_margin)}</span>
          <span class="k">Sof foyda ulushi</span><span class="v ${c.net_margin < 0 ? 'neg' : ''}">${pctText(c.net_margin)}</span>
          <span class="k">Nasiyaga sotilgan</span><span class="v">${moneyFull(c.credit_sales)}</span>
          <span class="k">Qarzdan undirilgan (savdo emas)</span><span class="v">${moneyFull(c.debt_collected)}</span>
        </div>
      </section>
    </div>
    <div class="grid cols-3" style="margin-top:14px">
      <section class="card">
        <div class="card-head"><div><h2>Xarajatlar</h2><div class="card-sub">Turkumlar bo'yicha</div></div><a class="link-btn" href="#/cash?tab=expenses&from=${period.from}&to=${period.to}">Ro'yxat ${icon('right', 'ico-xs')}</a></div>
        ${exp.length ? hbars(exp.map((x) => ({ label: EXPENSE_LABEL[x.category] || x.category, sub: `${x.count} ta`, value: x.total })), { color: C.cost }) : emptyState("Bu davrda xarajat yo'q", 'expense')}
      </section>
      <section class="card">
        <div class="card-head"><div><h2>Pul oqimi</h2><div class="card-sub">Kassaga kirgan va chiqqan pul</div></div></div>
        <div class="kv">${cash.by_category.map((x) => `<span class="k">${esc(CASH_LABEL[x.category] || x.category)}</span><span class="v ${x.direction === 'in' ? 'green' : ''}">${x.direction === 'in' ? '+' : '−'}${moneyFull(x.amount)}</span>`).join('') || '<span class="k">Harakat yo\'q</span><span></span>'}
          <span class="k strong" style="color:var(--text);border-top:1px solid var(--border);padding-top:6px">Sof oqim</span><span class="v" style="border-top:1px solid var(--border);padding-top:6px">${moneyFull(cash.net)}</span></div>
      </section>
      <section class="card">
        <div class="card-head"><div><h2>Qoldiqlar va qarzlar</h2><div class="card-sub">Hozirgi holat</div></div></div>
        <div class="kv">
          <span class="k">Kassada naqd</span><span class="v">${moneyFull(cash.balances.cash)}</span>
          <span class="k">Karta hisobida</span><span class="v">${moneyFull(cash.balances.card)}</span>
          <span class="k">O'tkazma hisobida</span><span class="v">${moneyFull(cash.balances.transfer)}</span>
          <span class="k strong" style="color:var(--text)">Jami pul</span><span class="v">${moneyFull(cash.balances.total)}</span>
          <span class="k" style="padding-top:8px"><a href="#/debts">Mijozlar qarzi (bizga)</a></span><span class="v" style="padding-top:8px">${moneyFull(r.debts.customers)}</span>
          <span class="k"><a href="#/suppliers">Yetkazib beruvchilarga qarz</a></span><span class="v">${moneyFull(r.debts.suppliers)}</span>
        </div>
      </section>
    </div>`;
  const { rows, weekly: wk } = bucket(r.days);
  chart(body.querySelector('[data-chart="pnl"]'), {
    labels: rows.map((d) => d.day),
    tickLabel: (i) => shortDate(rows[i].day),
    titleFor: (i) => (wk ? `${shortDate(rows[i].day)} dan boshlangan hafta` : `${weekdayShort(rows[i].day)}, ${shortDate(rows[i].day)}`),
    series: [
      { kind: 'bar', name: 'Sof foyda', values: rows.map((d) => d.net_profit), colorFor: (v) => (v >= 0 ? C.pos : C.neg) },
      { name: 'Sotuvdan foyda', values: rows.map((d) => d.gross_profit), color: C.s1 },
    ],
    format: (v) => `${moneyFull(v)} so'm`,
    height: 260,
    ariaLabel: 'Kunlik sof foyda va yalpi foyda',
  });
}

// ---------- Savdo ----------

async function sales(body, { period, q, ctx, link }) {
  const grain = ['daily', 'weekly', 'monthly'].includes(q.grain) ? q.grain : prefs.reports.grain;
  const r = await get(`/analytics/sales?from=${period.from}&to=${period.to}&grain=${grain}`);
  const t = r.totals;
  const p = r.previous;
  const label = { daily: 'Sana', weekly: 'Hafta boshi', monthly: 'Oy' }[r.grain];
  body.innerHTML = `
    <div class="stats">
      ${stat('Tushum', kpiMoney(t.net_revenue), pctFrom(t.net_revenue, p.net_revenue), { note: `chegirmagacha ${compact(t.gross_revenue)}` })}
      ${stat('Savdolar soni', `${num(t.sales_count, 0)}<span class="cur">ta</span>`, pctFrom(t.sales_count, p.sales_count), { note: `${t.lines} pozitsiya` })}
      ${stat("O'rtacha chek", kpiMoney(t.avg_order), pctFrom(t.avg_order, p.avg_order), { note: 'bir savdo summasi' })}
      ${stat('Sotuvdan foyda', kpiMoney(t.gross_profit), pctFrom(t.gross_profit, p.gross_profit), { note: `foyda ulushi ${pctText(t.gross_margin)}` })}
      ${stat('Chegirmalar', kpiMoney(t.discounts), pctFrom(t.discounts, p.discounts), { goodWhenUp: false, note: 'berilgan' })}
      ${stat('Qaytarishlar', kpiMoney(t.returns), pctFrom(t.returns, p.returns), { goodWhenUp: false, note: `${t.returns_count} ta` })}
    </div>
    <section class="card" style="margin-top:14px">
      <div class="card-head"><div><h2>Kunlik tushum</h2><div class="card-sub">Joriy davr va oldingi davr (${dateOnly(r.range.prevFrom)} – ${dateOnly(r.range.prevTo)})</div></div>
        <div class="legend"><span><i style="background:${C.s1}"></i>Joriy davr</span><span><i style="background:${C.prev}"></i>Oldingi davr</span></div></div>
      <div data-chart="sales"></div>
    </section>
    <div class="grid main-side" style="margin-top:14px">
      <section class="card flush">
        <div class="card-head" style="padding:16px 18px 0"><div><h2>Taqsimot</h2><div class="card-sub">Har bir ${label.toLowerCase()} bo'yicha</div></div>
          <div class="seg">${[['daily', 'Kunlik'], ['weekly', 'Haftalik'], ['monthly', 'Oylik']].map(([k, l]) => `<button type="button" data-grain="${k}" class="${r.grain === k ? 'active' : ''}">${l}</button>`).join('')}</div></div>
        ${r.rows.length ? `<div class="table-wrap cards"><table>
          <thead><tr><th>${label}</th><th class="right">Savdolar</th><th class="right">Jami sotuv</th><th class="right">Chegirma</th><th class="right">Qaytarish</th><th class="right">Tushum</th><th class="right">Sotuvdan foyda</th><th class="right">O'rtacha chek</th></tr></thead>
          <tbody>${r.rows.map((x) => `<tr>
            <td data-label="${label}">${r.grain === 'monthly' ? esc(x.period.slice(0, 7)) : dateOnly(x.period)}</td>
            <td data-label="Savdolar" class="right num">${num(x.sales_count, 0)}</td>
            <td data-label="Jami sotuv" class="right num">${moneyFull(x.gross_revenue)}</td>
            <td data-label="Chegirma" class="right num muted">${moneyFull(x.discounts)}</td>
            <td data-label="Qaytarish" class="right num muted">${moneyFull(x.returns)}</td>
            <td data-label="Tushum" class="right num strong">${moneyFull(x.net_revenue)}</td>
            <td data-label="Sotuvdan foyda" class="right num ${x.gross_profit < 0 ? 'neg' : ''}">${moneyFull(x.gross_profit)}</td>
            <td data-label="O'rtacha chek" class="right num">${moneyFull(x.avg_order)}</td></tr>`).join('')}</tbody>
          <tfoot><tr><td data-label="Jami">Jami</td><td data-label="Savdolar" class="right num">${num(t.sales_count, 0)}</td><td data-label="Jami sotuv" class="right num">${moneyFull(t.gross_revenue)}</td>
            <td data-label="Chegirma" class="right num">${moneyFull(t.discounts)}</td><td data-label="Qaytarish" class="right num">${moneyFull(t.returns)}</td>
            <td data-label="Tushum" class="right num">${moneyFull(t.net_revenue)}</td><td data-label="Sotuvdan foyda" class="right num">${moneyFull(t.gross_profit)}</td><td data-label="O'rtacha chek" class="right num">${moneyFull(t.avg_order)}</td></tr></tfoot>
        </table></div>` : emptyState("Bu davrda savdo yo'q", 'cart')}
      </section>
      <div class="stack">
        <section class="card"><div class="card-head"><div><h2>To'lov usullari</h2><div class="card-sub">Savdo summasi bo'yicha</div></div></div>
          ${r.by_method.length ? hbars(r.by_method.map((x) => ({ label: PAY_METHOD[x.method] || x.method, sub: `${x.count} ta`, value: x.total }))) : emptyState("Ma'lumot yo'q", 'card')}
          ${t.credit_sales > 0 ? `<div class="note" style="margin-top:8px">${icon('info', 'ico-xs')}<span>Nasiya ${compact(t.credit_sales, { unit: true })} — tushumga kiradi, lekin pul hali kelmagan.</span></div>` : ''}
        </section>
        <section class="card"><div class="card-head"><div><h2>Soatlar bo'yicha</h2><div class="card-sub">Qaysi vaqtda ko'p sotiladi</div></div></div>
          <div data-chart="hours"></div></section>
      </div>
    </div>`;
  const { rows, weekly: wk } = bucket(r.days);
  const prevRows = bucket(r.previous_days).rows;
  chart(body.querySelector('[data-chart="sales"]'), {
    labels: rows.map((d) => d.day),
    tickLabel: (i) => shortDate(rows[i].day),
    titleFor: (i) => (wk ? `${shortDate(rows[i].day)} dan boshlangan hafta` : `${weekdayShort(rows[i].day)}, ${shortDate(rows[i].day)}`),
    series: [
      { name: 'Oldingi davr', values: rows.map((_, i) => prevRows[i]?.net_revenue ?? null), color: C.prev, width: 1.5 },
      { name: 'Joriy davr', values: rows.map((d) => d.net_revenue), color: C.s1, area: true, endDot: true },
    ],
    format: (v) => `${moneyFull(v)} so'm`,
    height: 260,
    ariaLabel: 'Kunlik sof tushum',
  });
  const hours = Array.from({ length: 24 }, (_, h) => r.by_hour.find((x) => x.hour === h) || { hour: h, count: 0, total: 0 });
  const used = hours.filter((h) => h.count > 0);
  const from = used.length ? Math.max(0, Math.min(...used.map((h) => h.hour)) - 1) : 8;
  const to = used.length ? Math.min(23, Math.max(...used.map((h) => h.hour)) + 1) : 21;
  const hs = hours.slice(from, to + 1);
  chart(body.querySelector('[data-chart="hours"]'), {
    labels: hs.map((h) => `${String(h.hour).padStart(2, '0')}:00`),
    titleFor: (i) => `${String(hs[i].hour).padStart(2, '0')}:00 – ${String(hs[i].hour + 1).padStart(2, '0')}:00 · ${hs[i].count} ta savdo`,
    series: [{ kind: 'bar', name: 'Tushum', values: hs.map((h) => h.total), color: C.s1 }],
    format: (v) => `${moneyFull(v)} so'm`,
    height: 180,
    ariaLabel: 'Soatlar bo\'yicha savdo',
  });
  body.querySelectorAll('[data-grain]').forEach((b) => b.addEventListener('click', () => {
    put('/me/preferences', { reports: { grain: b.dataset.grain } }).catch(() => {});
    prefs.reports.grain = b.dataset.grain;
    ctx.go(link({ grain: b.dataset.grain }));
  }));
}

// ---------- Tovarlar ----------

const COLS = [
  { key: 'name', label: 'Tovar' },
  { key: 'qty_sold', label: 'Sotilgan', right: true },
  { key: 'receipts', label: 'Cheklar', right: true },
  { key: 'revenue', label: 'Tushum', right: true },
  { key: 'profit', label: 'Foyda', right: true },
  { key: 'margin', label: 'Foyda ulushi', right: true },
  { key: 'stock_qty', label: 'Qoldiq', right: true },
  { key: 'stock_value', label: 'Qoldiq qiymati', right: true },
];
const FILTERS = [['', 'Barchasi'], ['sold', 'Sotilgan'], ['unsold', 'Sotilmagan'], ['low', 'Kam qolgan'], ['out', 'Tugagan']];

async function products(body, { period, q }) {
  const st = { sort: q.sort || 'revenue', dir: q.dir || 'desc', q: '', category_id: '', filter: q.filter || '', offset: 0, limit: 25 };
  const cats = await get('/categories').then((r) => r.categories).catch(() => []);
  body.innerHTML = `
    <div class="grid cols-3" id="tops"></div>
    <section class="card flush" style="margin-top:14px">
      <div class="card-head" style="padding:16px 18px 0;margin-bottom:12px">
        <div><h2>Barcha tovarlar</h2><div class="card-sub" id="cnt"></div></div>
        <div class="filterbar">
          <div class="search-input" style="width:220px">${icon('search', 'ico-sm')}<input class="input input-sm" id="pq" type="search" placeholder="Tovar nomi"></div>
          <select class="input input-sm" id="pc" style="width:auto" aria-label="Kategoriya"><option value="">Barcha kategoriyalar</option>${cats.map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join('')}</select>
        </div>
      </div>
      <div class="chips" style="padding:0 18px 12px">${FILTERS.map(([k, l]) => `<button type="button" class="chip ${st.filter === k ? 'active' : ''}" data-filter="${k}">${l}</button>`).join('')}</div>
      <div id="ptable"></div>
      <div class="pager" style="padding:12px 18px" id="pager"></div>
    </section>`;
  const load = async () => {
    const u = new URLSearchParams({ from: period.from, to: period.to, sort: st.sort, dir: st.dir, limit: st.limit, offset: st.offset });
    if (st.q) u.set('q', st.q);
    if (st.category_id) u.set('category_id', st.category_id);
    if (st.filter) u.set('filter', st.filter);
    const r = await get(`/analytics/products?${u}`);
    body.querySelector('#cnt').textContent = `${r.total} ta tovar · tushum ${compact(r.summary.revenue, { unit: true })} · foyda ${compact(r.summary.profit, { unit: true })}`;
    const topList = (title, sub, rows, val) => `<section class="card"><div class="card-head" style="margin-bottom:6px"><div><h2>${title}</h2><div class="card-sub">${sub}</div></div></div>
      ${rows.length ? rows.map((p) => `<a class="prod-row" href="#/products/${p.id}">${productThumb(p).replace('class="thumb"', 'class="thumb thumb-sm"')}
        <div style="min-width:0"><div class="pn">${esc(p.name)}</div><div class="ps">${esc(val(p)[1])}</div></div><div class="pv">${esc(val(p)[0])}</div></a>`).join('') : emptyState("Ma'lumot yo'q", 'box')}</section>`;
    if (!st.rendered) {
      body.querySelector('#tops').innerHTML = [
        topList("Eng ko'p sotilgan", 'tushum bo\'yicha', r.tops.best, (p) => [compact(p.revenue), `${num(p.qty_sold, 2)} ${p.unit} · ${p.receipts} chek`]),
        topList('Eng foydali', 'foyda bo\'yicha', r.tops.profit, (p) => [compact(p.profit), `foyda ulushi ${pctText(p.margin)}`]),
        topList("Ko'p xarid qilinadigan", 'cheklar soni bo\'yicha', r.tops.frequent, (p) => [`${p.receipts} chek`, `${num(p.qty_sold, 2)} ${p.unit}`]),
      ].join('');
      st.rendered = true;
    }
    body.querySelector('#ptable').innerHTML = r.rows.length ? `<div class="table-wrap cards"><table>
      <thead><tr>${COLS.map((c) => `<th class="sortable ${c.right ? 'right' : ''} ${st.sort === c.key ? 'sorted' : ''}" data-sort="${c.key}" aria-sort="${st.sort === c.key ? (st.dir === 'asc' ? 'ascending' : 'descending') : 'none'}">${c.label}${st.sort === c.key ? ` ${st.dir === 'asc' ? '↑' : '↓'}` : ''}</th>`).join('')}</tr></thead>
      <tbody>${r.rows.map((p) => `<tr class="clickable" data-id="${p.id}">
        <td data-label="Tovar"><div class="row" style="gap:10px;flex-wrap:nowrap">${productThumb(p).replace('class="thumb"', 'class="thumb thumb-sm"')}<div style="min-width:0"><b>${esc(p.name)}</b><div class="small muted">${esc(p.category_name || 'Kategoriyasiz')}</div></div></div></td>
        <td data-label="Sotilgan" class="right num">${qty(p.qty_sold)} <span class="muted">${esc(p.unit)}</span></td>
        <td data-label="Cheklar" class="right num">${num(p.receipts, 0)}</td>
        <td data-label="Tushum" class="right num strong">${moneyFull(p.revenue)}</td>
        <td data-label="Foyda" class="right num ${p.profit < 0 ? 'neg' : ''}">${moneyFull(p.profit)}</td>
        <td data-label="Foyda ulushi" class="right num">${p.revenue > 0 ? pctText(p.margin) : '—'}</td>
        <td data-label="Qoldiq" class="right num">${qty(p.stock_qty)} ${p.status === 'out' ? '<span class="badge badge-out">tugagan</span>' : p.status === 'low' ? '<span class="badge badge-low">kam</span>' : ''}</td>
        <td data-label="Qoldiq qiymati" class="right num">${moneyFull(p.stock_value)}</td></tr>`).join('')}</tbody></table></div>`
      : emptyState('Tovar topilmadi', 'box');
    const pages = Math.ceil(r.total / st.limit);
    const page = Math.floor(st.offset / st.limit) + 1;
    body.querySelector('#pager').innerHTML = r.total > st.limit ? `<span>${st.offset + 1}–${Math.min(st.offset + st.limit, r.total)} / ${r.total}</span>
      <div class="row"><button class="btn btn-light btn-sm" type="button" data-pg="-1" ${page <= 1 ? 'disabled' : ''}>${icon('back', 'ico-xs')} Oldingi</button>
      <span class="tnum">${page} / ${pages}</span><button class="btn btn-light btn-sm" type="button" data-pg="1" ${page >= pages ? 'disabled' : ''}>Keyingi ${icon('right', 'ico-xs')}</button></div>` : '';
    body.querySelectorAll('[data-sort]').forEach((th) => th.addEventListener('click', () => {
      if (st.sort === th.dataset.sort) st.dir = st.dir === 'asc' ? 'desc' : 'asc';
      else { st.sort = th.dataset.sort; st.dir = th.dataset.sort === 'name' ? 'asc' : 'desc'; }
      st.offset = 0;
      load().catch(errorToast);
    }));
    body.querySelectorAll('tr[data-id]').forEach((tr) => tr.addEventListener('click', () => { location.hash = `#/products/${tr.dataset.id}`; }));
    body.querySelectorAll('[data-pg]').forEach((b) => b.addEventListener('click', () => { st.offset = Math.max(0, st.offset + Number(b.dataset.pg) * st.limit); load().catch(errorToast); }));
  };
  body.querySelector('#pq').addEventListener('input', debounce((e) => { st.q = e.target.value.trim(); st.offset = 0; load().catch(errorToast); }, 250));
  body.querySelector('#pc').addEventListener('change', (e) => { st.category_id = e.target.value; st.offset = 0; load().catch(errorToast); });
  body.querySelectorAll('[data-filter]').forEach((b) => b.addEventListener('click', () => {
    st.filter = b.dataset.filter;
    st.offset = 0;
    body.querySelectorAll('[data-filter]').forEach((x) => x.classList.toggle('active', x === b));
    load().catch(errorToast);
  }));
  await load();
}

// ---------- Sekin sotiladigan ----------

function recTable(rows, { extra } = {}) {
  if (!rows.length) return emptyState("Bu toifada tovar yo'q", 'ok');
  return `<div class="table-wrap cards"><table>
    <thead><tr><th>Tovar</th><th class="right">Qoldiq</th><th class="right">Qiymati</th><th class="right">30 kunda sotilgan</th><th class="right">${extra?.label || 'Zaxira yetadi'}</th><th>Tavsiya</th></tr></thead>
    <tbody>${rows.map((p) => `<tr class="clickable" data-id="${p.id}">
      <td data-label="Tovar"><b>${esc(p.name)}</b><div class="small muted">${esc(p.category_name || '')}</div></td>
      <td data-label="Qoldiq" class="right num">${qty(p.stock_qty)} ${esc(p.unit)}</td>
      <td data-label="Qiymati" class="right num">${moneyFull(p.stock_value)}</td>
      <td data-label="30 kunda sotilgan" class="right num">${qty(p.qty_30d)}</td>
      <td data-label="${extra?.label || 'Zaxira yetadi'}" class="right num">${extra ? extra.get(p) : (p.cover_days !== null ? `${Math.round(p.cover_days)} kun` : '—')}</td>
      <td data-label="Tavsiya" class="small" style="min-width:240px;white-space:normal">${esc(p.recommendation)}</td></tr>`).join('')}</tbody></table></div>`;
}

async function slow(body, { ctx }) {
  const r = await get('/analytics/inventory');
  const t = r.totals;
  body.innerHTML = `
    <div class="stats four">
      ${stat('Sotilmayotgan (30 kun)', `${t.dead}<span class="cur">ta</span>`, undefined, { note: `${compact(t.dead_value, { unit: true })} muzlagan` })}
      ${stat('Sekin sotilayotgan', `${t.slow}<span class="cur">ta</span>`, undefined, { note: 'zaxira 45–90 kunga yetadi' })}
      ${stat('Ortiqcha zaxira', `${t.overstock}<span class="cur">ta</span>`, undefined, { note: `ortiqcha ≈ ${compact(t.excess_value, { unit: true })}` })}
      ${stat('Uzoq turib qolgan', `${t.aging}<span class="cur">ta</span>`, undefined, { note: 'partiya 60 kundan eski' })}
    </div>
    ${r.notes.length ? `<div class="stack" style="margin-top:14px">${r.notes.map((n) => `<div class="alert ${{ critical: 'alert-bad', warning: 'alert-warn', success: 'alert-ok' }[n.level] || 'alert-info'}">${icon({ critical: 'critical', warning: 'warnCircle', success: 'ok' }[n.level] || 'info', 'ico-sm')}<div>${esc(n.text)}</div></div>`).join('')}</div>` : ''}
    <div class="section-title"><h2>Sotilmayotgan tovarlar</h2><span class="muted small">30 kun ichida birorta ham sotilmagan</span></div>
    <section class="card flush">${recTable(r.dead, { extra: { label: 'Omborda', get: (p) => (p.days_in_stock !== null ? `${p.days_in_stock} kun` : '—') } })}</section>
    <div class="section-title"><h2>Sekin sotilayotgan</h2><span class="muted small">Joriy sur'atda zaxira 45–90 kunga yetadi</span></div>
    <section class="card flush">${recTable(r.slow)}</section>
    <div class="section-title"><h2>Ortiqcha zaxira</h2><span class="muted small">Zaxira 90 kundan ko'proqqa yetadi</span></div>
    <section class="card flush">${recTable(r.overstock, { extra: { label: 'Ortiqcha qism', get: (p) => moneyFull(p.excess_value) } })}</section>
    <div class="section-title"><h2>Uzoq turib qolgan</h2><span class="muted small">Eng eski partiya 60 kundan ko'p turibdi</span></div>
    <section class="card flush">${recTable(r.aging, { extra: { label: 'Omborda', get: (p) => `${p.days_in_stock} kun` } })}</section>
    <p class="note" style="margin-top:12px">${icon('info', 'ico-xs')}<span>Hisob so'nggi 30 kunlik savdo sur'atiga asoslanadi. Yaroqlilik muddati tizimda saqlanmaydi, shuning uchun muddati o'tish xavfi «Uzoq turib qolgan» ro'yxati orqali kuzatiladi.</span></p>`;
  body.querySelectorAll('tr[data-id]').forEach((tr) => tr.addEventListener('click', () => ctx.go(`#/products/${tr.dataset.id}`)));
}

// ---------- Ombor ----------

const MOVE = { opening: "Boshlang'ich", purchase: 'Kirim', sale: 'Sotuv', return: 'Qaytarish', damage: 'Zarar', correction: 'Tuzatish' };

async function inventory(body, { ctx }) {
  const r = await get('/analytics/inventory');
  const t = r.totals;
  const parts = [
    { label: 'Yetarli', value: t.healthy, color: C.pos },
    { label: 'Kam qolgan', value: t.low, color: C.warn },
    { label: 'Tugagan', value: t.out, color: C.neg },
    { label: 'Sotilmayotgan', value: t.dead, color: '#8a93a3' },
    { label: "Ko'p turib qolgan", value: t.overstock, color: C.cost },
  ];
  body.innerHTML = `
    <div class="stats">
      ${stat('Ombordagi tovar qiymati', kpiMoney(t.cost_value), undefined, { note: 'xarid narxida' })}
      ${t.retail_value !== null ? stat('Sotuv narxida', kpiMoney(t.retail_value), undefined, { note: 'hammasi sotilsa' }) : ''}
      ${t.potential_profit !== null ? stat('Kutilayotgan foyda', kpiMoney(t.potential_profit), undefined, { note: 'sotuv narxi − xarid narxi' }) : ''}
      ${stat('Tovarlar', `${t.products}<span class="cur">ta</span>`, undefined, { note: `${t.in_stock} tasi omborda` })}
      ${stat('Kam qolgan', `${t.low}<span class="cur">ta</span>`, undefined, { note: 'minimal qoldiqdan kam' })}
      ${stat('Tugagan', `${t.out}<span class="cur">ta</span>`, undefined, { note: 'qoldiq nol', neg: t.out > 0 })}
    </div>
    <div class="grid main-side" style="margin-top:14px">
      <section class="card">
        <div class="card-head"><div><h2>Ombor harakati</h2><div class="card-sub">So'nggi 30 kun, xarid narxida</div></div>
          <div class="legend"><span><i class="box" style="background:${C.s1}"></i>Kirim</span><span><i class="box" style="background:#eb6834"></i>Chiqim (sotuv)</span></div></div>
        <div data-chart="flow"></div>
        <div class="card-head" style="margin:18px 0 8px"><div><h2 style="font-size:13.5px">Ombor qiymati</h2><div class="card-sub">Har kun oxirida</div></div></div>
        <div data-chart="value"></div>
      </section>
      <div class="stack">
        <section class="card">
          <div class="card-head"><div><h2>Holat</h2><div class="card-sub">${t.products} ta faol tovar</div></div></div>
          ${segbar(parts)}
          <div class="health">${parts.map((x) => `<a href="#/reports?tab=slow"><i style="background:${x.color}"></i>${x.label}<b>${x.value}</b></a>`).join('')}</div>
          ${t.qty_by_unit.length ? `<div class="kv" style="margin-top:14px">${t.qty_by_unit.map((u) => `<span class="k">Jami (${esc(u.unit)})</span><span class="v">${qty(u.qty)}</span>`).join('')}</div>` : ''}
        </section>
        <section class="card">
          <div class="card-head"><div><h2>So'nggi harakatlar</h2></div>${ctx.can('stock.view') ? `<a class="link-btn" href="#/stock?tab=movements">Barchasi ${icon('right', 'ico-xs')}</a>` : ''}</div>
          ${r.recent.length ? `<div class="list">${r.recent.slice(0, 8).map((m) => `
            <a class="list-item" href="#/products/${m.product_id}"><div class="meta"><div class="name small">${esc(m.product_name)}</div>
              <div class="sub">${esc(MOVE[m.movement_type] || m.movement_type)} · ${esc(timeAgo(m.created_at))}${m.user_name ? ` · ${esc(m.user_name)}` : ''}</div></div>
              <div class="end num small ${Number(m.quantity) < 0 ? '' : 'green'}">${Number(m.quantity) > 0 ? '+' : ''}${qty(m.quantity)} ${esc(m.unit)}</div></a>`).join('')}</div>` : emptyState("Harakat yo'q", 'history')}
        </section>
      </div>
    </div>
    <div class="section-title"><h2>Qayta buyurtma tavsiyasi</h2><span class="muted small">So'nggi 30 kunlik savdo va minimal qoldiq asosida (~2 haftalik zaxira)</span></div>
    <section class="card flush">${r.restock.length ? `<div class="table-wrap cards"><table>
      <thead><tr><th>Tovar</th><th class="right">Qoldiq</th><th class="right">Minimal</th><th class="right">Kunlik sotuv</th><th class="right">Tavsiya etilgan miqdor</th><th>Holat</th></tr></thead>
      <tbody>${r.restock.map((p) => `<tr class="clickable" data-id="${p.id}">
        <td data-label="Tovar"><b>${esc(p.name)}</b></td>
        <td data-label="Qoldiq" class="right num">${qty(p.stock_qty)} ${esc(p.unit)}</td>
        <td data-label="Minimal" class="right num">${qty(p.min_stock)}</td>
        <td data-label="Kunlik sotuv" class="right num">${num(p.daily_30d, 2)}</td>
        <td data-label="Tavsiya" class="right num strong">${num(p.suggested_qty, 0)} ${esc(p.unit)}</td>
        <td data-label="Holat">${p.status === 'out' ? '<span class="badge badge-out">Tugagan</span>' : p.status === 'low' ? '<span class="badge badge-low">Kam qolgan</span>' : '<span class="badge badge-info">Tez tugaydi</span>'}</td></tr>`).join('')}</tbody></table></div>`
    : emptyState("Hozircha qayta buyurtma kerak emas", 'ok')}</section>`;
  const mv = r.movement;
  chart(body.querySelector('[data-chart="flow"]'), {
    labels: mv.map((d) => d.day),
    tickLabel: (i) => shortDate(mv[i].day),
    titleFor: (i) => `${weekdayShort(mv[i].day)}, ${shortDate(mv[i].day)}`,
    series: [
      { kind: 'bar', name: 'Kirim', values: mv.map((d) => d.inbound), color: C.s1 },
      { kind: 'bar', name: 'Chiqim (sotuv)', values: mv.map((d) => d.outbound), color: '#eb6834' },
    ],
    format: (v) => `${moneyFull(v)} so'm`,
    height: 220,
    ariaLabel: 'Ombor kirim va chiqimi',
  });
  chart(body.querySelector('[data-chart="value"]'), {
    labels: mv.map((d) => d.day),
    tickLabel: (i) => shortDate(mv[i].day),
    titleFor: (i) => `${shortDate(mv[i].day)} oxirida`,
    series: [{ name: 'Ombordagi tovar qiymati', values: mv.map((d) => d.value), color: C.cost, area: true, endDot: true }],
    format: (v) => `${moneyFull(v)} so'm`,
    height: 150,
    ticks: 3,
    ariaLabel: 'Ombordagi tovar qiymati',
  });
  body.querySelectorAll('tr[data-id]').forEach((tr) => tr.addEventListener('click', () => ctx.go(`#/products/${tr.dataset.id}`)));
}

// ---------- Haftalik ----------

async function weekly(body, { q, ctx }) {
  const r = await get(`/analytics/weekly${q.start ? `?start=${q.start}` : ''}`);
  const c = r.totals;
  const p = r.previous;
  const hl = (title, prod, value, sub, tone = '') => `<section class="card"><div class="stat-label" style="color:var(--muted);font-size:12.5px">${title}</div>
    ${prod ? `<a class="prod-row" href="#/products/${prod.id}" style="grid-template-columns:minmax(0,1fr) auto;border:0;padding-bottom:0"><div style="min-width:0"><div class="pn" style="font-size:15px">${esc(prod.name)}</div><div class="ps">${esc(sub)}</div></div><div class="pv ${tone}">${esc(value)}</div></a>` : '<div class="empty small">Ma\'lumot yo\'q</div>'}</section>`;
  body.innerHTML = `
    <div class="between" style="margin-bottom:14px">
      <div class="row">
        <button class="btn btn-light btn-sm" type="button" data-week="${addDaysStr(r.start, -7)}">${icon('back', 'ico-xs')} Oldingi</button>
        <div style="padding:0 6px"><b>${longDate(r.start, { weekday: false })} – ${longDate(r.end, { weekday: false })}</b>${r.is_current ? ` <span class="badge badge-info">joriy hafta · ${r.days_elapsed} kun</span>` : ''}</div>
        <button class="btn btn-light btn-sm" type="button" data-week="${addDaysStr(r.start, 7)}" ${r.is_current ? 'disabled' : ''}>Keyingi ${icon('right', 'ico-xs')}</button>
      </div>
      <span class="muted small">${r.is_current ? "O'tgan haftaning shu kunlari bilan solishtiriladi" : 'Oldingi hafta bilan solishtiriladi'}</span>
    </div>
    <div class="stats">
      ${stat('Savdolar', `${num(c.sales_count, 0)}<span class="cur">ta</span>`, pctFrom(c.sales_count, p.sales_count))}
      ${stat('Tushum', kpiMoney(c.net_revenue), pctFrom(c.net_revenue, p.net_revenue))}
      ${stat('Xarajatlar', kpiMoney(c.expenses), pctFrom(c.expenses, p.expenses), { goodWhenUp: false })}
      ${stat('Sotuvdan foyda', kpiMoney(c.gross_profit), pctFrom(c.gross_profit, p.gross_profit), { neg: c.gross_profit < 0 })}
      ${stat(c.net_profit >= 0 ? 'Sof foyda' : 'Zarar', kpiMoney(c.net_profit), pctFrom(c.net_profit, p.net_profit), { neg: c.net_profit < 0 })}
      ${stat("Yo'qotishlar", kpiMoney(c.losses), pctFrom(c.losses, p.losses), { goodWhenUp: false })}
    </div>
    <div class="grid cols-3" style="margin-top:14px">
      ${hl("Eng ko'p sotilgan", r.best_product, r.best_product ? compact(r.best_product.revenue, { unit: true }) : '', r.best_product ? `${num(r.best_product.qty_sold, 2)} ${r.best_product.unit} · ${r.best_product.receipts} chek` : '')}
      ${hl('Eng foydali', r.most_profitable, r.most_profitable ? compact(r.most_profitable.profit, { unit: true }) : '', r.most_profitable ? `foyda ulushi ${pctText(r.most_profitable.margin)}` : '', 'green')}
      ${hl('Eng sust', r.worst_product, r.worst_product ? compact(r.worst_product.revenue, { unit: true }) : '', r.worst_product ? `omborda ${compact(r.worst_product.stock_value, { unit: true })} turibdi` : '')}
    </div>
    <section class="card" style="margin-top:14px">
      <div class="card-head"><div><h2>Kunma-kun</h2><div class="card-sub">Tushum: shu hafta va oldingi hafta</div></div>
        <div class="legend"><span><i class="box" style="background:${C.s1}"></i>Shu hafta</span><span><i class="box" style="background:${C.prev}"></i>Oldingi hafta</span></div></div>
      <div data-chart="week"></div>
      <div class="table-wrap cards" style="margin-top:12px"><table>
        <thead><tr><th>Kun</th><th class="right">Savdolar</th><th class="right">Tushum</th><th class="right">Oldingi hafta</th><th class="right">O'zgarish</th><th class="right">Sotuvdan foyda</th><th class="right">Xarajat</th><th class="right">Sof foyda</th></tr></thead>
        <tbody>${r.days.map((d) => `<tr class="${d.future ? 'muted' : ''}">
          <td data-label="Kun">${weekdayShort(d.day)}, ${shortDate(d.day)}</td>
          <td data-label="Savdolar" class="right num">${d.future ? '—' : num(d.sales_count, 0)}</td>
          <td data-label="Tushum" class="right num strong">${d.future ? '—' : moneyFull(d.net_revenue)}</td>
          <td data-label="Oldingi hafta" class="right num muted">${moneyFull(d.previous?.net_revenue || 0)}</td>
          <td data-label="O'zgarish" class="right">${d.future ? '' : deltaPill(pctFrom(d.net_revenue, d.previous?.net_revenue || 0))}</td>
          <td data-label="Sotuvdan foyda" class="right num">${d.future ? '—' : moneyFull(d.gross_profit)}</td>
          <td data-label="Xarajat" class="right num">${d.future ? '—' : moneyFull(d.expenses)}</td>
          <td data-label="Sof foyda" class="right num ${d.net_profit < 0 ? 'neg' : ''}">${d.future ? '—' : moneyFull(d.net_profit)}</td></tr>`).join('')}</tbody>
      </table></div>
    </section>`;
  chart(body.querySelector('[data-chart="week"]'), {
    labels: r.days.map((d) => d.day),
    tickLabel: (i) => `${weekdayShort(r.days[i].day)} ${shortDate(r.days[i].day)}`,
    titleFor: (i) => `${weekdayShort(r.days[i].day)}, ${shortDate(r.days[i].day)}`,
    series: [
      { kind: 'bar', name: 'Shu hafta', values: r.days.map((d) => (d.future ? null : d.net_revenue)), color: C.s1 },
      { kind: 'bar', name: 'Oldingi hafta', values: r.days.map((d) => d.previous?.net_revenue || 0), color: C.prev },
    ],
    format: (v) => `${moneyFull(v)} so'm`,
    height: 230,
    ariaLabel: 'Haftalik kunma-kun taqqoslash',
  });
  body.querySelectorAll('[data-week]').forEach((b) => b.addEventListener('click', () => ctx.go(`#/reports?tab=weekly&start=${b.dataset.week}`)));
}

// ---------- Prognoz ----------

async function forecast(body) {
  const f = await get('/analytics/forecast');
  const conf = { insufficient: "yetarli emas", low: 'past', medium: "o'rtacha", high: 'yuqori' }[f.confidence];
  body.innerHTML = `
    <div class="alert alert-info" style="margin-bottom:14px">${icon('info', 'ico-sm')}<div><b>Bu taxmin, kafolat emas.</b> ${esc(f.method)} Haqiqiy natija ob-havo, bayramlar, narxlar va boshqa omillarga qarab farq qilishi mumkin.</div></div>
    ${!f.sufficient ? `<section class="card">${emptyState("Taxmin qilish uchun kamida 7 kunlik savdo tarixi kerak.", 'target2')}</section>` : `
    <div class="stats four">
      ${stat('Kutilayotgan tushum (7 kun)', `${compact(f.totals.revenue)}<span class="cur">so'm</span>`, undefined, { note: `oraliq ${compact(f.totals.low)} – ${compact(f.totals.high)}` })}
      ${stat('Taxminiy yalpi foyda', `${compact(f.totals.gross_profit)}<span class="cur">so'm</span>`, undefined, { note: `foyda ulushi ${pctText(f.basis.gross_margin)} asosida` })}
      ${stat('Xarajatlardan keyin', `${compact(f.totals.net_profit)}<span class="cur">so'm</span>`, undefined, { note: `kuniga ~${compact(f.basis.avg_daily_expenses)} xarajat`, neg: f.totals.net_profit < 0 })}
      ${stat("O'tgan 7 kun (haqiqiy)", `${compact(f.last7_actual.revenue)}<span class="cur">so'm</span>`, undefined, { note: `ishonchlilik: ${conf}` })}
    </div>
    <section class="card" style="margin-top:14px">
      <div class="card-head"><div><h2>Tushum: haqiqiy va taxmin</h2><div class="card-sub">So'nggi 14 kun va keyingi 7 kun</div></div>
        <div class="legend"><span><i style="background:${C.s1}"></i>Haqiqiy</span><span><i class="dash" style="--c:${C.s1}"></i>Taxmin</span><span><i class="box" style="background:${C.s1};opacity:.18"></i>Ehtimoliy oraliq</span></div></div>
      <div data-chart="fc"></div>
    </section>
    <section class="card flush" style="margin-top:14px"><div class="table-wrap cards"><table>
      <thead><tr><th>Kun</th><th class="right">Minimal</th><th class="right">Kutilgan tushum</th><th class="right">Maksimal</th><th class="right">Sotuvdan foyda (taxmin)</th><th class="right">Sof foyda (taxmin)</th></tr></thead>
      <tbody>${f.days.map((d) => `<tr><td data-label="Kun">${weekdayShort(d.day)}, ${shortDate(d.day)}</td>
        <td data-label="Minimal" class="right num muted">${moneyFull(d.low)}</td><td data-label="Kutilgan" class="right num strong">${moneyFull(d.revenue)}</td>
        <td data-label="Maksimal" class="right num muted">${moneyFull(d.high)}</td><td data-label="Sotuvdan foyda" class="right num">${moneyFull(d.gross_profit)}</td>
        <td data-label="Sof foyda" class="right num ${d.net_profit < 0 ? 'neg' : ''}">${moneyFull(d.net_profit)}</td></tr>`).join('')}</tbody>
    </table></div></section>
    <p class="note" style="margin-top:10px">${icon('info', 'ico-xs')}<span>Asos: ${dateOnly(f.basis.history_from)} – ${dateOnly(f.basis.history_to)}, savdo bo'lgan kunlar: ${f.basis.active_days}. Sof foyda taxmini o'rtacha kunlik xarajat va yo'qotishlarni ayiradi.</span></p>`}`;
  const box = body.querySelector('[data-chart="fc"]');
  if (box) {
    const H = f.history.length;
    const labels = [...f.history.map((x) => x.day), ...f.days.map((x) => x.day)];
    chart(box, {
      labels,
      tickLabel: (i) => shortDate(labels[i]),
      titleFor: (i) => `${weekdayShort(labels[i])}, ${shortDate(labels[i])}${i >= H ? ' · taxmin' : ''}`,
      series: [
        { name: 'Haqiqiy', values: [...f.history.map((x) => x.revenue), ...f.days.map(() => null)], color: C.s1, area: true },
        { name: 'Taxmin', values: [...f.history.map((x, i) => (i === H - 1 ? x.revenue : null)), ...f.days.map((x) => x.revenue)], color: C.s1, dashed: true },
      ],
      band: { low: [...f.history.map(() => null), ...f.days.map((x) => x.low)], high: [...f.history.map(() => null), ...f.days.map((x) => x.high)], color: C.s1, name: 'Ehtimoliy oraliq' },
      format: (v) => `${moneyFull(v)} so'm`,
      height: 260,
      ariaLabel: 'Tushum prognozi',
    });
  }
}

