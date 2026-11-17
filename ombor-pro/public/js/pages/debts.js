// Mijoz qarzlari: jami, muddati o'tgan, qarz yoshi va to'lovlar
import {
  get, esc, icon, num, moneyFull, kpiMoney, dateOnly, timeAgo, emptyState, download, errorToast, withBusy, debounce,
} from '../ui.js';
import { segbar } from '../charts.js';

const STATUS = {
  overdue: '<span class="badge badge-out">Muddati o\'tgan</span>',
  due_soon: '<span class="badge badge-low">Muddati yaqin</span>',
  open: '<span class="badge badge-muted">Ochiq</span>',
};
const METHOD = { cash: 'Naqd', card: 'Karta', transfer: "O'tkazma" };

export async function render(root, params, ctx) {
  const d = await get('/analytics/debts');
  const t = d.totals;
  const canExport = ctx.can('reports.export');
  const aging = [
    { label: '0–30 kun', value: t.aging.d30, color: '#8fa3bf' },
    { label: '31–60 kun', value: t.aging.d60, color: '#d08a0d' },
    { label: '61–90 kun', value: t.aging.d90, color: '#d9622b' },
    { label: '90+ kun', value: t.aging.d90p, color: '#c03a35' },
  ];
  root.innerHTML = `
    <div class="page-head">
      <div><h1>Mijoz qarzlari</h1><p class="muted">Nasiyaga sotilgan va hali to'lanmagan summalar</p></div>
      ${canExport ? `<div class="row">
        <button class="btn btn-light btn-sm" type="button" data-export="xlsx">${icon('xlsx', 'ico-sm')} Excel</button>
        <button class="btn btn-light btn-sm" type="button" data-export="pdf">${icon('pdf', 'ico-sm')} PDF</button></div>` : ''}
    </div>
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
              <div class="sub">${esc(METHOD[p.method] || p.method)} · ${esc(timeAgo(p.created_at))}</div></div>
              <div class="end num green strong">+${moneyFull(p.amount)}</div></a>`).join('')}</div>` : '<div class="empty small">To\'lovlar yo\'q</div>'}
        </section>
      </div>
    </div>`;

  const tbl = root.querySelector('#tbl');
  const draw = (q = '') => {
    const s = q.trim().toLowerCase();
    const rows = d.customers.filter((c) => !s || c.name.toLowerCase().includes(s) || (c.phone || '').includes(s));
    tbl.innerHTML = rows.length ? `<div class="table-wrap cards"><table>
      <thead><tr><th>Mijoz</th><th class="right">Qarz</th><th class="right">Muddati o'tgan</th><th>To'lov muddati</th><th class="right">Ochiq cheklar</th><th>Oxirgi to'lov</th></tr></thead>
      <tbody>${rows.map((c) => `<tr class="clickable" data-id="${c.id}">
        <td data-label="Mijoz"><b>${esc(c.name)}</b><div class="small muted">${esc(c.phone || '')}</div></td>
        <td data-label="Qarz" class="right num strong">${moneyFull(c.debt)}</td>
        <td data-label="Muddati o'tgan" class="right num ${c.overdue > 0 ? 'neg strong' : 'muted'}">${c.overdue > 0 ? moneyFull(c.overdue) : '—'}</td>
        <td data-label="To'lov muddati">${c.next_due ? `${dateOnly(c.next_due)} ` : '<span class="muted">belgilanmagan</span> '}${STATUS[c.status]}</td>
        <td data-label="Ochiq cheklar" class="right num">${num(c.open_sales, 0)}</td>
        <td data-label="Oxirgi to'lov" class="small">${c.last_payment_at ? esc(timeAgo(c.last_payment_at)) : '<span class="muted">to\'lamagan</span>'}</td>
      </tr>`).join('')}</tbody></table></div>`
      : emptyState(s ? 'Mijoz topilmadi' : "Qarzdor mijoz yo'q", 'debt');
    tbl.querySelectorAll('tr[data-id]').forEach((tr) => tr.addEventListener('click', () => ctx.go(`#/customers/${tr.dataset.id}`)));
  };
  draw();
  root.querySelector('#q').addEventListener('input', debounce((e) => draw(e.target.value), 150));
  root.querySelectorAll('[data-export]').forEach((b) => b.addEventListener('click', () => withBusy(b, () => download(`/reports/export?report=debts&format=${b.dataset.export}`).catch(errorToast))));
}

