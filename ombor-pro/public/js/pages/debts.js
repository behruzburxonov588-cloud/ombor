// Mijoz qarzlari: jami, muddati o'tgan, qarz yoshi va to'lovlar
import {
  get, esc, icon, num, moneyFull, kpiMoney, dateOnly, timeAgo, emptyState, download, errorToast, withBusy, debounce,
  takeNewFlag, todayStr, addDaysStr, PAY_METHOD } from '../ui.js';
import { openDebtForm, openReceivePayment } from '../debtform.js';
import { openSupplierPayment } from './parties.js';
import { segbar } from '../charts.js';

const STATUS = {
  overdue: '<span class="badge badge-out">Muddati o\'tgan</span>',
  due_soon: '<span class="badge badge-low">Muddati yaqin</span>',
  open: '<span class="badge badge-muted">Ochiq</span>',
};

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

async function renderCustomers(root, params, ctx, tabs) {
  const d = await get('/analytics/debts');
  const t = d.totals;
  const canExport = ctx.can('reports.export');
  const canAdd = ctx.can('customers.manage');
  const canPay = ctx.canAny(['payments.create', 'customers.manage']);
  const refresh = () => render(root, { ...params, query: {} }, ctx);

  const debtors = () => d.customers.map((c) => ({ id: c.id, name: c.name, debt: c.debt }));
  const aging = [
    { label: '0–30 kun', value: t.aging.d30, color: '#8fa3bf' },
    { label: '31–60 kun', value: t.aging.d60, color: '#d08a0d' },
    { label: '61–90 kun', value: t.aging.d90, color: '#d9622b' },
    { label: '90+ kun', value: t.aging.d90p, color: '#c03a35' },
  ];
  root.innerHTML = `
    <div class="page-head">
      <div><h1>Qarzlar</h1><p class="muted">Mijozlar sizga qancha qarz: nasiyaga sotilgan va qo'lda yozilgan, hali to'lanmagan summalar</p></div>
      <div class="row" style="flex-wrap:wrap">
        ${canAdd ? `<button class="btn" type="button" id="add-debt">${icon('plus', 'ico-sm')} Qarz yozish</button>` : ''}
        ${canPay && d.customers.length ? `<button class="btn btn-success" type="button" id="recv">${icon('money', 'ico-sm')} To'lov qabul qilish</button>` : ''}
        ${canExport ? `<button class="btn btn-light btn-sm" type="button" data-export="xlsx">${icon('xlsx', 'ico-sm')} Excel</button>
        <button class="btn btn-light btn-sm" type="button" data-export="pdf">${icon('pdf', 'ico-sm')} PDF</button>` : ''}
      </div>
    </div>
    ${tabs}
    <div class="stats four">
      <div class="stat" style="cursor:default"><div class="stat-label">Jami qarz</div><div class="stat-value">${kpiMoney(t.debt)}</div><div class="stat-note">${t.customers} ta mijozda</div></div>
      <div class="stat" style="cursor:default"><div class="stat-label">Muddati o'tgan</div><div class="stat-value ${t.overdue > 0 ? 'neg' : ''}">${kpiMoney(t.overdue)}</div><div class="stat-note">${t.overdue_customers} ta mijoz</div></div>
      <div class="stat" style="cursor:default"><div class="stat-label">30 kunda undirilgan</div><div class="stat-value">${kpiMoney(t.collected_30d)}</div><div class="stat-note">qarz to'lovlari (savdo emas)</div></div>
      <div class="stat" style="cursor:default"><div class="stat-label">Muddati o'tgan ulushi</div><div class="stat-value">${t.debt > 0 ? Math.round((t.overdue / t.debt) * 100) : 0}<span class="cur">%</span></div><div class="stat-note">jami qarzdan</div></div>
    </div>

    <div class="grid main-side" style="margin-top:14px">
      <section class="card flush">
        <div class="card-head" style="padding:16px 18px 0">
          <div><h2>Qarzdorlar</h2><div class="card-sub">Eng katta qarzdan boshlab</div></div>
          <div class="search-input" style="width:240px;max-width:100%">${icon('search', 'ico-sm')}<input class="input input-sm" id="q" type="search" placeholder="Mijoz nomi yoki telefoni"></div>
        </div>
        <div id="tbl"></div>
      </section>
      <div class="stack">
        <section class="card">
          <div class="card-head"><div><h2>Qarz yoshi</h2><div class="card-sub">Savdo qilinganiga necha kun bo'lgan</div></div></div>
          ${segbar(aging)}
          <div class="kv" style="margin-top:12px">${aging.map((a) => `<span class="k"><i style="display:inline-block;width:8px;height:8px;border-radius:3px;background:${a.color};margin-right:8px"></i>${a.label}</span><span class="v">${moneyFull(a.value)}</span>`).join('')}</div>
        </section>
        <section class="card">
          <div class="card-head"><div><h2>So'nggi to'lovlar</h2><div class="card-sub">Mijozlar qarzini to'lashi</div></div></div>
          ${d.recent_payments.length ? `<div class="list">${d.recent_payments.map((p) => `
            <a class="list-item" href="#/customers/${p.customer_id}"><div class="meta"><div class="name">${esc(p.customer_name)}</div>
              <div class="sub">${esc(PAY_METHOD[p.method] || p.method)} · ${esc(timeAgo(p.created_at))}</div></div>
              <div class="end num green strong">+${moneyFull(p.amount)}</div></a>`).join('')}</div>` : '<div class="empty small">To\'lovlar yo\'q</div>'}
        </section>
      </div>
    </div>`;

  const tbl = root.querySelector('#tbl');
  const draw = (q = '') => {
    const s = q.trim().toLowerCase();
    const rows = d.customers.filter((c) => !s || c.name.toLowerCase().includes(s) || (c.phone || '').includes(s));
    tbl.innerHTML = rows.length ? `<div class="table-wrap cards"><table>
      <thead><tr><th>Mijoz</th><th class="right">Qarz</th><th class="right">Muddati o'tgan</th><th>To'lov muddati</th><th>Oxirgi to'lov</th>${canPay ? '<th></th>' : ''}</tr></thead>
      <tbody>${rows.map((c) => `<tr class="clickable" data-id="${c.id}">
        <td data-label="Mijoz"><b>${esc(c.name)}</b><div class="small muted">${esc(c.phone || '')}${c.open_sales ? ` · ${num(c.open_sales, 0)} ta ochiq qarz` : ''}</div></td>
        <td data-label="Qarz" class="right num strong">${moneyFull(c.debt)}</td>
        <td data-label="Muddati o'tgan" class="right num ${c.overdue > 0 ? 'neg strong' : 'muted'}">${c.overdue > 0 ? moneyFull(c.overdue) : '—'}</td>
        <td data-label="To'lov muddati">${c.next_due ? `${dateOnly(c.next_due)} ` : '<span class="muted">belgilanmagan</span> '}${STATUS[c.status]}</td>
        <td data-label="Oxirgi to'lov" class="small">${c.last_payment_at ? esc(timeAgo(c.last_payment_at)) : '<span class="muted">to\'lamagan</span>'}</td>
        ${canPay ? `<td class="right" data-label=""><button class="btn btn-light btn-sm" type="button" data-pay="${c.id}" style="white-space:nowrap">To'lov</button></td>` : ''}
      </tr>`).join('')}</tbody></table></div>`
      : (s ? emptyState('Mijoz topilmadi', 'debt') : `<div class="empty-hero">
          <span class="hero-ico">${icon('debt')}</span>
          <h2>Qarzdor mijoz yo'q</h2>
          <p>Nasiyaga sotilganda qarz shu yerda paydo bo'ladi. Daftaringizdagi eski qarzlarni ham kiritib qo'yishingiz mumkin.</p>
          ${canAdd ? `<button class="btn" type="button" data-add-debt>${icon('plus')} Qarz yozish</button>` : ''}
        </div>`);
    tbl.querySelectorAll('tr[data-id]').forEach((tr) => tr.addEventListener('click', () => ctx.go(`#/customers/${tr.dataset.id}`)));
    tbl.querySelectorAll('[data-pay]').forEach((b) => b.addEventListener('click', (e) => {
      e.stopPropagation();
      openReceivePayment({ debtors: debtors(), selected: b.dataset.pay, onDone: refresh });
    }));
    tbl.querySelector('[data-add-debt]')?.addEventListener('click', () => openDebtForm({ kind: 'customer', onDone: refresh }));
  };
  draw();
  root.querySelector('#q').addEventListener('input', debounce((e) => draw(e.target.value), 150));
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
