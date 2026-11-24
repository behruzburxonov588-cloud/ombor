// Mijoz qarzlari: jami, muddati o'tgan, qarz yoshi va to'lovlar
import {
  get, esc, icon, num, moneyFull, kpiMoney, dateOnly, timeAgo, emptyState, download, errorToast, withBusy, debounce,
  takeNewFlag, todayStr, addDaysStr, PAY_METHOD, downloadMenu } from '../ui.js';
import { openDebtForm, openReceivePayment } from '../debtform.js';
import { openSupplierPayment } from './parties.js';


// Ikki xil qarz aniq ajratilgan: «Mijozlar qarzi» (sizga to'lashlari kerak) va «Sizning qarzingiz» (yetkazib beruvchilarga)
export async function render(root, params, ctx) {
  const canCust = ctx.canAny(['customers.view', 'reports.view']);
  const canSup = ctx.canAny(['suppliers.view', 'purchases.view']);
  const tab = (params.query.tab === 'suppliers' && canSup) || !canCust ? 'suppliers' : 'customers';
  const tabs = canCust && canSup ? `
    <div class="seg debt-tabs" role="tablist" style="margin-bottom:14px">
      <button type="button" role="tab" data-dtab="customers" class="${tab === 'customers' ? 'active' : ''}">${icon('users', 'ico-xs')} Mijozlar qarzi <small>sizga</small></button>
      <button type="button" role="tab" data-dtab="suppliers" class="${tab === 'suppliers' ? 'active' : ''}">${icon('store', 'ico-xs')} Sizning qarzingiz <small>yetkazib beruvchilarga</small></button>
    </div>` : '';
  if (tab === 'suppliers') await renderSuppliers(root, params, ctx, tabs);
  else await renderCustomers(root, params, ctx, tabs);
  root.querySelectorAll('[data-dtab]').forEach((b) => b.addEventListener('click', () => ctx.go(`#/debts${b.dataset.dtab === 'suppliers' ? '?tab=suppliers' : ''}`)));
}

// Holat: kim qanday qarzdor (oddiy so'zlar bilan)
const STATE = {
  overdue: '<span class="badge badge-out">Muddati o\'tgan</span>',
  due: '<span class="badge badge-out">Bugun to\'lashi kerak</span>',
  partial: '<span class="badge badge-low">Qisman to\'langan</span>',
  open: '<span class="badge badge-muted">To\'lanmagan</span>',
  paid: '<span class="badge badge-ok">To\'langan</span>',
};
const FILTERS = [
  { key: 'debt', label: 'Qarzdorlar', test: (c) => c.remaining > 0 },
  { key: 'due', label: 'Muddati kelgan', test: (c) => c.state === 'overdue' || c.state === 'due' },
  { key: 'partial', label: 'Qisman to\'langan', test: (c) => c.remaining > 0 && c.paid > 0 },
  { key: 'paid', label: 'Yopilgan', test: (c) => c.state === 'paid' },
];

async function renderCustomers(root, params, ctx, tabs) {
  const d = await get('/analytics/debts');
  const t = d.totals;
  const ledger = d.ledger || [];
  const canExport = ctx.can('reports.export');
  const canAdd = ctx.can('customers.manage');
  const canPay = ctx.canAny(['payments.create', 'customers.manage']);
  const refresh = () => render(root, { ...params, query: {} }, ctx);
  const debtors = () => d.customers.map((c) => ({ id: c.id, name: c.name, debt: c.debt }));
  let filter = FILTERS.some((f) => f.key === params.query.f) ? params.query.f : 'debt';
  let q = '';

  const kpi = (f, label, value, note, cls = '') => `
    <button type="button" class="stat dk-stat ${cls}${filter === f ? ' on' : ''}" data-f="${f}">
      <div class="stat-label">${label}</div><div class="stat-value">${value}</div><div class="stat-note">${note}</div></button>`;

  root.innerHTML = `
    <div class="page-head">
      <div><h1>Mijozlar qarzi</h1><p class="muted">Kim qancha qarz, qancha to'lagan va qachon to'lashi kerak</p></div>
      <div class="row" style="flex-wrap:wrap">
        ${canPay && d.customers.length ? `<button class="btn btn-success" type="button" id="recv">${icon('money', 'ico-sm')} To'lov qabul qilish</button>` : ''}
        ${canAdd ? `<button class="btn btn-outline" type="button" id="add-debt">${icon('plus', 'ico-sm')} Qarz yozish</button>` : ''}
        ${canExport && ledger.length ? downloadMenu(`<button type="button" class="dl-item" data-export="xlsx">${icon('xlsx', 'ico-sm')} Excel</button>
        <button type="button" class="dl-item" data-export="pdf">${icon('pdf', 'ico-sm')} PDF</button>`) : ''}
      </div>
    </div>
    ${tabs}
    ${ledger.length ? `<div class="stats four dk-stats">
      ${kpi('debt', 'Jami qarz', kpiMoney(t.debt), `${t.customers} kishida`)}
      ${kpi('due', 'Muddati kelgan', kpiMoney(t.due_now || 0), t.due_now_customers ? `${t.due_now_customers} kishi — qo'ng'iroq qiling` : 'hech kim kechikmagan', t.due_now_customers ? 'bad' : '')}
      ${kpi('partial', 'Qisman to\'langan', `${t.partial_customers || 0}<span class="cur">kishi</span>`, 'bir qismini to\'lagan')}
      ${kpi('paid', 'To\'liq yopilgan', `${t.closed_customers || 0}<span class="cur">kishi</span>`, 'qarzi qolmagan', 'good')}
    </div>` : ''}
    <section class="card flush" style="margin-top:14px">
      <div class="card-head dk-tools" style="padding:14px 16px 0">
        <div class="chips" id="dk-chips"></div>
        <div class="search-input" style="width:260px;max-width:100%">${icon('search', 'ico-sm')}<input class="input input-sm" id="q" type="search" placeholder="Ismi yoki telefoni"></div>
      </div>
      <div id="tbl"></div>
    </section>
    ${d.recent_payments.length ? `<section class="card" style="margin-top:14px">
      <div class="card-head"><div><h2>So'nggi to'lovlar</h2><div class="card-sub">Mijozlar qarzini to'lashi</div></div></div>
      <div class="list">${d.recent_payments.map((p) => `
        <a class="list-item" href="#/customers/${p.customer_id}"><div class="meta"><div class="name">${esc(p.customer_name)}</div>
          <div class="sub">${esc(PAY_METHOD[p.method] || p.method)} · ${esc(timeAgo(p.created_at))}</div></div>
          <div class="end num green strong">+${moneyFull(p.amount)}</div></a>`).join('')}</div>
    </section>` : ''}`;

  const tbl = root.querySelector('#tbl');
  const drawChips = () => {
    root.querySelector('#dk-chips').innerHTML = FILTERS.map((f) => {
      const n = ledger.filter(f.test).length;
      return `<button type="button" class="chip ${filter === f.key ? 'active' : ''}" data-f="${f.key}">${esc(f.label)} <b>${n}</b></button>`;
    }).join('');
    root.querySelectorAll('.dk-stat').forEach((b) => b.classList.toggle('on', b.dataset.f === filter));
  };
  const draw = () => {
    const s = q.trim().toLowerCase();
    const f = FILTERS.find((x) => x.key === filter);
    const rows = ledger.filter((c) => f.test(c) && (!s || c.name.toLowerCase().includes(s) || (c.phone || '').includes(s)));
    tbl.innerHTML = rows.length ? `<div class="table-wrap cards"><table class="dk-table">
      <thead><tr><th>Mijoz</th><th class="right">Jami olgan</th><th class="right">To'lagan</th><th class="right">Qolgan qarz</th><th>To'lov muddati</th><th>Holati</th>${canPay ? '<th></th>' : ''}</tr></thead>
      <tbody>${rows.map((c) => `<tr class="clickable" data-id="${c.id}">
        <td data-label="Mijoz"><b>${esc(c.name)}</b><div class="small muted">${c.phone ? `<a href="tel:${esc(c.phone)}" data-tel>${esc(c.phone)}</a>` : 'telefon yo\'q'}</div></td>
        <td data-label="Jami olgan" class="right num">${moneyFull(c.taken)}</td>
        <td data-label="To'lagan" class="right num green">${moneyFull(c.paid)}</td>
        <td data-label="Qolgan qarz" class="right num strong ${c.remaining > 0 ? 'amber' : 'muted'}">${c.remaining > 0 ? moneyFull(c.remaining) : '—'}</td>
        <td data-label="To'lov muddati">${c.remaining > 0 ? (c.next_due ? dateOnly(c.next_due) : '<span class="muted">belgilanmagan</span>') : '—'}</td>
        <td data-label="Holati">${STATE[c.state] || ''}</td>
        ${canPay ? `<td class="right" data-label="">${c.remaining > 0 ? `<button class="btn btn-light btn-sm" type="button" data-pay="${c.id}" style="white-space:nowrap">To'lov olish</button>` : ''}</td>` : ''}
      </tr>`).join('')}</tbody></table></div>`
      : (s ? emptyState('Mijoz topilmadi', 'debt') : filter !== 'debt' ? emptyState("Bu ro'yxat bo'sh", 'debt') : `<div class="empty-hero">
          <span class="hero-ico">${icon('debt')}</span>
          <h2>Qarzdor mijoz yo'q</h2>
          <p>Sotuvda «Nasiya (qarzga)» tanlansa, qarz shu yerda paydo bo'ladi. Daftaringizdagi eski qarzlarni ham yozib qo'ysa bo'ladi.</p>
          ${canAdd ? `<button class="btn" type="button" data-add-debt>${icon('plus')} Qarz yozish</button>` : ''}
        </div>`);
    tbl.querySelectorAll('tr[data-id]').forEach((tr) => tr.addEventListener('click', (e) => { if (!e.target.closest('[data-tel]')) ctx.go(`#/customers/${tr.dataset.id}`); }));
    tbl.querySelectorAll('[data-pay]').forEach((b) => b.addEventListener('click', (e) => {
      e.stopPropagation();
      openReceivePayment({ debtors: debtors(), selected: b.dataset.pay, onDone: refresh });
    }));
    tbl.querySelector('[data-add-debt]')?.addEventListener('click', () => openDebtForm({ kind: 'customer', onDone: refresh }));
  };
  const setFilter = (f) => { filter = f; drawChips(); draw(); };
  // Faqat shu sahifaning o'z elementlariga (sahifa konteyneri boshqa sahifalarda ham ishlatiladi)
  [root.querySelector('.dk-stats'), root.querySelector('#dk-chips')].forEach((box) => box?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-f]');
    if (btn) setFilter(btn.dataset.f);
  }));
  drawChips();
  draw();
  root.querySelector('#q').addEventListener('input', debounce((e) => { q = e.target.value; draw(); }, 150));
  root.querySelectorAll('[data-export]').forEach((b) => b.addEventListener('click', () => withBusy(b, () => download(`/reports/export?report=debts&format=${b.dataset.export}`).catch(errorToast))));
  root.querySelector('#add-debt')?.addEventListener('click', () => openDebtForm({ kind: 'customer', onDone: refresh }));
  root.querySelector('#recv')?.addEventListener('click', () => openReceivePayment({ debtors: debtors(), onDone: refresh }));
  if (canAdd && takeNewFlag(params)) openDebtForm({ kind: 'customer', onDone: refresh });
}


// ---------- Sizning qarzingiz (yetkazib beruvchilarga) ----------
async function renderSuppliers(root, params, ctx, tabs) {
  const { suppliers } = await get('/suppliers');
  const today = todayStr();
  const week = addDaysStr(today, 7);
  const rows = suppliers.filter((s) => Number(s.debt) > 0).sort((a, b) => Number(b.overdue) - Number(a.overdue) || Number(b.debt) - Number(a.debt));
  const total = rows.reduce((x, s) => x + Number(s.debt), 0);
  const overdue = rows.reduce((x, s) => x + Number(s.overdue), 0);
  const soon = rows.filter((s) => s.next_due && s.next_due.slice(0, 10) >= today && s.next_due.slice(0, 10) <= week);
  const canAdd = ctx.can('suppliers.manage');
  const canPay = ctx.canAny(['suppliers.manage', 'payments.create']);
  const refresh = () => render(root, { ...params, query: { tab: 'suppliers' } }, ctx);
  const status = (s) => {
    const due = s.next_due ? s.next_due.slice(0, 10) : null;
    if (Number(s.overdue) > 0) return '<span class="badge badge-out">Muddati o\'tgan</span>';
    if (due && due <= week) return '<span class="badge badge-low">Muddati yaqin</span>';
    return '<span class="badge badge-muted">Ochiq</span>';
  };

  root.innerHTML = `
    <div class="page-head">
      <div><h1>Qarzlar</h1><p class="muted">Siz yetkazib beruvchilarga qancha qarzdorsiz va qachongacha to'lashingiz kerak</p></div>
      <div class="row" style="flex-wrap:wrap">
        ${canAdd ? `<button class="btn" type="button" id="add-sdebt">${icon('plus', 'ico-sm')} Qarz yozish</button>` : ''}
        ${ctx.can('purchases.create') ? `<a class="btn btn-light" href="#/stockin">${icon('truck', 'ico-sm')} Tovar kiritish</a>` : ''}
      </div>
    </div>
    ${tabs}
    <div class="sum-row">
      <div class="sum-cell ${total > 0 ? 'warn' : 'good'}"><span>Jami qarzingiz</span><b>${moneyFull(total)} so'm</b><small>${rows.length} ta yetkazib beruvchiga</small></div>
      <div class="sum-cell ${overdue > 0 ? 'bad' : ''}"><span>Muddati o'tgan</span><b>${moneyFull(overdue)} so'm</b><small>${rows.filter((s) => Number(s.overdue) > 0).length} ta</small></div>
      <div class="sum-cell"><span>7 kun ichida to'lanadi</span><b>${moneyFull(soon.reduce((x, s) => x + Number(s.debt), 0))} so'm</b><small>${soon.length} ta yetkazib beruvchi</small></div>
      <div class="sum-cell"><span>Muddati belgilanmagan</span><b>${rows.filter((s) => !s.next_due).length} ta</b><small>qarzga «Qachongacha» yozsangiz eslatamiz</small></div>
    </div>
    <section class="card flush" style="margin-top:14px">
      ${rows.length ? `<div class="table-wrap cards"><table>
        <thead><tr><th>Yetkazib beruvchi</th><th class="right">Qarzingiz</th><th class="right">Muddati o'tgan</th><th>To'lov muddati</th><th>Oxirgi yuk</th>${canPay ? '<th></th>' : ''}</tr></thead>
        <tbody>${rows.map((s) => `<tr class="clickable" data-id="${s.id}">
          <td data-label="Yetkazib beruvchi"><b>${esc(s.name)}</b><div class="small muted">${esc(s.phone || '')}${s.purchases_count ? ` · ${s.purchases_count} ta kirim` : ''}</div></td>
          <td data-label="Qarzingiz" class="right num strong">${moneyFull(s.debt)}</td>
          <td data-label="Muddati o'tgan" class="right num ${Number(s.overdue) > 0 ? 'neg strong' : 'muted'}">${Number(s.overdue) > 0 ? moneyFull(s.overdue) : '—'}</td>
          <td data-label="To'lov muddati">${s.next_due ? `${dateOnly(s.next_due)} ` : '<span class="muted">belgilanmagan</span> '}${status(s)}</td>
          <td data-label="Oxirgi yuk" class="small">${s.last_purchase ? dateOnly(s.last_purchase) : '<span class="muted">—</span>'}</td>
          ${canPay ? `<td class="right" data-label=""><button class="btn btn-light btn-sm" type="button" data-pay="${s.id}" style="white-space:nowrap">To'lash</button></td>` : ''}
        </tr>`).join('')}</tbody></table></div>`
        : `<div class="empty-hero">
          <span class="hero-ico">${icon('check')}</span>
          <h2>Hech kimga qarzingiz yo'q</h2>
          <p>Yukni qarzga olsangiz («Tovar kiritish» → «Qarzga oldim»), qarz shu yerda paydo bo'ladi.</p>
        </div>`}
    </section>`;

  root.querySelectorAll('tr[data-id]').forEach((tr) => tr.addEventListener('click', () => ctx.go(`#/suppliers/${tr.dataset.id}`)));
  root.querySelectorAll('[data-pay]').forEach((b) => b.addEventListener('click', (e) => {
    e.stopPropagation();
    const s = rows.find((x) => String(x.id) === b.dataset.pay);
    openSupplierPayment(s.id, Number(s.debt), refresh);
  }));
  root.querySelector('#add-sdebt')?.addEventListener('click', () => openDebtForm({ kind: 'supplier', onDone: refresh }));
}
