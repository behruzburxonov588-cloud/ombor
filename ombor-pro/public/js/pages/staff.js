// Xodimlar samaradorligi: har bir xodimning savdosi, cheklari, tendensiyasi va amallar tarixi.
// Rahbar (xodimlarni boshqarish yoki hisobot huquqi) hammani ko'radi; boshqalar faqat o'zini.
import {
  get, esc, icon, num, compact, moneyFull, deltaPill, pctText, initials, resolvePeriod, periodPicker, bindPeriod, periodQuery, rangeLabel,
  dateTime, openModal, download, withBusy, errorToast, emptyState, shortDate,
} from '../ui.js';
import { chart, sparkline } from '../charts.js';

const ROLE = { owner: 'Egasi', administrator: 'Administrator', cashier: 'Kassir', warehouse: 'Ombor xodimi', accountant: 'Buxgalter' };
const SERIES = ['#2563eb', '#eb6834', '#16a34a'];
const ACTIONS = {
  'sale.create': 'Savdo', 'sale.return': 'Qaytarish', 'purchase.create': 'Kirim', 'expense.create': 'Xarajat',
  'customer.payment': "Mijoz to'lovi", 'supplier.payment': "Yetkazib beruvchiga to'lov", 'stock.damage': 'Zarar yozildi',
  'stock.correction': 'Qoldiq tuzatildi', 'count.create': 'Sanash boshlandi', 'count.approve': 'Sanash tasdiqlandi',
  'product.create': "Tovar qo'shildi", 'product.update': "Tovar o'zgardi", 'product.archive': 'Tovar arxivlandi',
  'shift.open': 'Smena ochildi', 'shift.close': 'Smena yopildi', 'cash.deposit': 'Kassaga pul', 'cash.withdrawal': 'Kassadan pul',
  login: 'Tizimga kirdi', 'settings.update': "Sozlamalar o'zgardi", 'user.create': "Xodim qo'shildi", 'user.update': "Xodim o'zgardi",
  'customer.create': "Mijoz qo'shildi", 'supplier.create': "Yetkazib beruvchi qo'shildi", 'notifications.settings': "Bildirishnoma sozlamalari",
};

export async function render(root, params, ctx) {
  const q = params.query;
  const range = resolvePeriod(q, '30d');
  const d = await get(`/analytics/staff?from=${range.from}&to=${range.to}`);
  const self = d.scope === 'self';
  const fin = ctx.can('reports.view');
  const staff = d.staff;
  const top = staff.filter((s) => s.sales_count > 0).slice(0, 3);
  const totalSales = staff.reduce((s, x) => s + x.sales_count, 0);

  root.innerHTML = `
    <div class="page-head">
      <div><h1>${self ? 'Mening natijalarim' : 'Xodimlar natijasi'}</h1><p class="muted">${esc(rangeLabel(range.from, range.to))} · savdo, cheklar va faollik</p></div>
      <div class="filterbar">
        ${periodPicker(range)}
        ${!self && ctx.can('reports.export') ? `<button class="btn btn-light btn-sm" type="button" data-export="xlsx">${icon('xlsx', 'ico-sm')} Excel</button>
          <button class="btn btn-light btn-sm" type="button" data-export="pdf">${icon('pdf', 'ico-sm')} PDF</button>` : ''}
      </div>
    </div>

    <div class="stats four">
      <div class="stat" style="cursor:default"><div class="stat-label">Sotuv (qaytarishsiz)</div><div class="stat-value">${compact(d.total_net_revenue)}<span class="cur">so'm</span></div><div class="stat-note">qaytarishlar ayirilgan</div></div>
      <div class="stat" style="cursor:default"><div class="stat-label">Cheklar</div><div class="stat-value">${num(totalSales, 0)}<span class="cur">ta</span></div><div class="stat-note">yakunlangan savdolar</div></div>
      <div class="stat" style="cursor:default"><div class="stat-label">O'rtacha chek</div><div class="stat-value">${compact(totalSales ? staff.reduce((s, x) => s + x.avg_order * x.sales_count, 0) / totalSales : 0)}<span class="cur">so'm</span></div><div class="stat-note">barcha xodimlar</div></div>
      <div class="stat" style="cursor:default"><div class="stat-label">${self ? 'Ulushim' : 'Faol xodimlar'}</div><div class="stat-value">${self ? pctText(staff[0]?.share || 0, 0) : `${staff.filter((s) => s.sales_count > 0).length}<span class="cur">ta</span>`}</div><div class="stat-note">${self ? 'umumiy savdodagi' : 'savdo qilgan'}</div></div>
    </div>

    ${top.length && d.days.length > 1 ? `<section class="card" style="margin-top:14px">
      <div class="card-head"><div><h2>Kunlik savdo</h2><div class="card-sub">${self ? 'Mening kunlik sotuvim' : 'Eng faol xodimlar bo\'yicha'}</div></div>
        <div class="legend">${top.map((s, i) => `<span><i style="background:${SERIES[i]}"></i>${esc(s.full_name)}</span>`).join('')}</div></div>
      <div data-chart></div></section>` : ''}

    <section class="card flush" style="margin-top:14px">
      ${staff.length ? `<div class="table-wrap cards"><table>
        <thead><tr><th>Xodim</th><th class="right">Cheklar</th><th class="right">Sotuv</th>${fin ? '<th class="right">Sotuvdan foyda</th>' : ''}<th class="right">O'rtacha chek</th><th class="right">Chegirmalar</th><th class="right">Qaytarishlar</th><th>Ulushi</th><th>Tendensiya</th></tr></thead>
        <tbody>${staff.map((s) => `<tr class="${ctx.can('history.view') ? 'clickable' : ''}" data-id="${s.id}">
          <td data-label="Xodim"><div class="row" style="gap:10px;flex-wrap:nowrap"><span class="avatar">${esc(initials(s.full_name))}</span><div><b>${esc(s.full_name)}</b><div class="small muted">${esc(ROLE[s.role] || s.role)}${s.is_active ? '' : ' · faol emas'}</div></div></div></td>
          <td data-label="Cheklar" class="right num">${num(s.sales_count, 0)}</td>
          <td data-label="Sotuv" class="right num"><b>${moneyFull(s.net_revenue)}</b><div>${deltaPill(s.change, { title: 'oldingi davrga nisbatan' })}</div></td>
          ${fin ? `<td data-label="Sotuvdan foyda" class="right num ${s.gross_profit < 0 ? 'neg' : ''}">${moneyFull(s.gross_profit)}</td>` : ''}
          <td data-label="O'rtacha chek" class="right num">${moneyFull(s.avg_order)}</td>
          <td data-label="Chegirmalar" class="right num">${s.discounts > 0 ? `${moneyFull(s.discounts)}<div class="small muted">${s.discounted_sales} chekda</div>` : '<span class="muted">—</span>'}</td>
          <td data-label="Qaytarishlar" class="right num">${s.returns > 0 ? `${moneyFull(s.returns)}<div class="small muted">${s.returns_count} ta</div>` : '<span class="muted">—</span>'}</td>
          <td data-label="Ulushi" style="min-width:110px"><div class="small tnum">${pctText(s.share, 1)}</div><div class="track" style="height:5px;border-radius:9px;background:var(--hover);margin-top:4px"><div style="height:100%;width:${Math.max(0, Math.min(100, s.share))}%;background:var(--series-1);border-radius:9px"></div></div></td>
          <td data-label="Tendensiya" style="width:130px">${sparkline(s.trend, { width: 120, height: 26 })}</td>
        </tr>`).join('')}</tbody></table></div>` : emptyState("Bu davrda xodimlar savdosi yo'q", 'staff')}
    </section>
    ${ctx.can('history.view') ? '<p class="note" style="margin-top:10px">' + icon('info', 'ico-xs') + '<span>Xodim qatorini bosing — uning shu davrdagi amallar tarixi ochiladi.</span></p>' : ''}`;

  const box = root.querySelector('[data-chart]');
  if (box) {
    chart(box, {
      labels: d.days,
      tickLabel: (i) => shortDate(d.days[i]),
      titleFor: (i) => shortDate(d.days[i]),
      series: top.map((s, i) => ({ name: s.full_name, values: s.trend, color: SERIES[i] })),
      format: (v) => `${moneyFull(v)} so'm`,
      height: 220,
      ariaLabel: 'Xodimlar kunlik savdosi',
    });
  }
  bindPeriod(root, (next) => ctx.go(`#/staff?${periodQuery(next)}`));
  root.querySelectorAll('[data-export]').forEach((b) => b.addEventListener('click', () => withBusy(b, () => download(`/reports/export?report=staff&format=${b.dataset.export}&from=${range.from}&to=${range.to}`).catch(errorToast))));
  if (ctx.can('history.view')) {
    root.querySelectorAll('tr[data-id]').forEach((tr) => tr.addEventListener('click', () => openActivity(staff.find((s) => String(s.id) === tr.dataset.id), range)));
  }
}

async function openActivity(s, range) {
  try {
    const r = await get(`/analytics/staff/${s.id}/activity?from=${range.from}&to=${range.to}`);
    openModal({
      title: `${s.full_name} · amallar`,
      wide: true,
      body: `
        <div class="chips" style="margin-bottom:12px">${r.summary.slice(0, 10).map((x) => `<span class="chip" style="cursor:default">${esc(ACTIONS[x.action] || x.action)} <b>${x.n}</b></span>`).join('') || '<span class="muted">Amal yo\'q</span>'}</div>
        ${r.entries.length ? `<div class="table-wrap"><table><thead><tr><th>Vaqt</th><th>Amal</th><th>Tafsilot</th></tr></thead><tbody>
          ${r.entries.map((e) => `<tr><td class="small num">${esc(dateTime(e.created_at))}</td><td>${esc(ACTIONS[e.action] || e.action)}</td>
            <td class="small muted">${esc(detail(e))}</td></tr>`).join('')}</tbody></table></div>` : emptyState("Bu davrda amal yo'q", 'history')}`,
    });
  } catch (err) {
    errorToast(err);
  }
}

function detail(e) {
  const x = e.details || {};
  if (x.receipt_no) return `${x.receipt_no} · ${moneyFull(x.total)} so'm`;
  if (x.return_no) return `${x.return_no} · ${moneyFull(x.amount)} so'm`;
  if (x.purchase_no) return `${x.purchase_no} · ${moneyFull(x.total)} so'm`;
  if (x.amount) return `${moneyFull(x.amount)} so'm`;
  if (x.name) return x.name;
  return '';
}
