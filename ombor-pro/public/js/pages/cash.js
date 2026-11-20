// Kassa: balanslar, smena, kirim-chiqim, kassa harakatlari va xarajatlar
import {
  get, post, icon, esc, num, money, dateTime, dateOnly, toast, errorToast, openModal, withBusy,
  emptyState, todayStr, newKey, takeNewFlag, compact, monthName,
  resolvePeriod, periodPicker, bindPeriod, periodWord, periodQuery,
} from '../ui.js';

const METHOD_LABELS = { cash: 'Naqd', card: 'Karta', transfer: "O'tkazma" };
const CATEGORY_LABELS = {
  sale: 'Savdo', refund: 'Qaytarish', customer_payment: "Qarz to'lovi",
  supplier_payment: "Yetkazib beruvchiga to'lov", expense: 'Xarajat',
  deposit: 'Kirim (depozit)', withdrawal: 'Pul olish',
};
const EXPENSE_LABELS = {
  rent: 'Ijara', salaries: 'Maosh', utilities: 'Kommunal', delivery: 'Yetkazib berish',
  transport: 'Transport', repairs: "Ta'mirlash", other: 'Boshqa',
};

const toNum = (v) => {
  const n = Number(String(v ?? '').trim().replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
};

// Har bir bo'lim o'zi chaqiradigan ma'lumot uchun ruxsatga mos bo'lishi kerak
const TABS = [
  { key: 'cash', label: 'Kassa', perms: ['cash.view', 'cash.shift'] },
  { key: 'expenses', label: 'Xarajatlar', perms: ['expenses.view', 'reports.view'] },
];

export async function render(root, params, ctx) {
  const allowed = TABS.filter((t) => ctx.canAny(t.perms));
  if (!allowed.length) {
    root.innerHTML = '<div class="alert alert-bad">Kassani ko\'rish uchun ruxsatingiz yo\'q</div>';
    return;
  }
  const tab = allowed.find((t) => t.key === params.query.tab) || allowed[0];

  root.innerHTML = `
    <div class="page-head"><div><h1>${tab.key === 'cash' ? 'Kassa' : 'Xarajatlar'}</h1><p class="muted">${tab.key === 'cash' ? "Qo'lingizdagi pul, smena va har bir kirgan-chiqqan pul" : 'Ijara, maosh, kommunal va boshqa chiqimlar'}</p></div></div>
    ${allowed.length > 1 ? `<div class="seg" style="margin-bottom:14px">
      ${allowed.map((t) => `<button type="button" data-tab="${t.key}" class="${t.key === tab.key ? 'active' : ''}">${t.label}</button>`).join('')}
    </div>` : ''}
    <div id="tabbody"></div>`;
  root.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => ctx.go(`#/cash?tab=${b.dataset.tab}`)));

  const refresh = () => render(root, params, ctx);
  const body = root.querySelector('#tabbody');
  if (tab.key === 'cash') await tabCash(body, params.query, ctx, refresh);
  else await tabExpenses(body, params.query, ctx, refresh);
  // "+ Qo'shish" menyusidan kelinganda: yangi xarajat oynasi darhol ochiladi
  if (tab.key === 'expenses' && takeNewFlag(params)) root.querySelector('#exp-new')?.click();
}

// ---------- Kassa ----------

async function tabCash(body, q, ctx, refresh) {
  const range = resolvePeriod(q, 'today');
  const { from, to } = range;
  const method = q.method || '';
  const txParams = new URLSearchParams({ from, to, limit: '300' });
  if (method) txParams.set('method', method);

  const canView = ctx.can('cash.view');
  const [sum, tx, shifts] = await Promise.all([
    get('/cash/summary'),
    canView ? get(`/cash/transactions?${txParams}`) : Promise.resolve({ transactions: [] }),
    canView ? get('/cash/shifts') : Promise.resolve({ shifts: [] }),
  ]);

  const b = sum.balances;
  const shift = sum.shift;
  const todayIn = Object.entries(sum.today).filter(([k]) => k.endsWith(':in')).reduce((s, [, v]) => s + v, 0);
  const todayOut = Object.entries(sum.today).filter(([k]) => k.endsWith(':out')).reduce((s, [, v]) => s + v, 0);

  const SHIFTS_SHOWN = 7;
  body.innerHTML = `
    <div class="card" id="shiftcard"></div>

    <div class="section-title"><h2>Pul qayerda</h2><span class="muted small">hozirgi qoldiq — barcha kirim va chiqimlardan keyin</span></div>
    <div class="sum-row">
      <div class="sum-cell ${b.cash < 0 ? 'bad' : ''}"><span>Naqd pul</span><b>${money(b.cash)}</b><small>kassa qutisida bo'lishi kerak</small></div>
      <div class="sum-cell ${b.card < 0 ? 'bad' : ''}"><span>Karta</span><b>${money(b.card)}</b><small>kartaga tushgan − kartadan to'langan</small></div>
      <div class="sum-cell ${b.transfer < 0 ? 'bad' : ''}"><span>Bank o'tkazmasi</span><b>${money(b.transfer)}</b><small>hisob raqamga tushgan − to'langan</small></div>
      <div class="sum-cell ${b.total < 0 ? 'bad' : 'good'}"><span>Hammasi</span><b>${money(b.total)}</b><small>naqd + karta + o'tkazma</small></div>
    </div>
    ${b.cash < 0 || b.card < 0 || b.transfer < 0 ? `<div class="alert alert-info small" style="margin-top:10px">${icon('info', 'ico-sm')}
      <span><b>Minus nimani bildiradi?</b> Bu hisobdan tushgan puldan ko'proq to'lov yozilgan. Ko'pincha to'lov boshqa puldan (masalan, o'z cho'ntagingizdan) qilingan,
      lekin dasturda shu hisobdan deb yozilgan. To'g'rilash uchun shu summani «Kassaga pul qo'yish» orqali kiriting.</span></div>` : ''}
    <div class="section-title"><h2>Bugun</h2></div>
    <div class="sum-row three">
      <div class="sum-cell good"><span>Kirdi</span><b>+${money(todayIn)}</b><small>savdo, qarz to'lovlari va boshqa tushumlar</small></div>
      <div class="sum-cell bad"><span>Chiqdi</span><b>−${money(todayOut)}</b><small>xarajatlar, yetkazib beruvchiga to'lov, qaytarishlar</small></div>
      <div class="sum-cell ${todayIn - todayOut < 0 ? 'bad' : ''}"><span>Farq</span><b>${money(todayIn - todayOut, { sign: true })}</b><small>bugun pul shuncha ${todayIn - todayOut < 0 ? 'kamaydi' : "ko'paydi"}</small></div>
    </div>

    ${ctx.can('cash.manage') ? `<div class="row" style="margin-top:14px;flex-wrap:wrap">
      <button class="btn btn-success" type="button" id="dep">${icon('plus', 'ico-sm')} Kassaga pul qo'yish</button>
      <button class="btn btn-outline" type="button" id="wd">${icon('minus', 'ico-sm')} Kassadan pul olish</button>
    </div>` : ''}

    ${canView ? `
    <div class="card" style="margin-top:14px">
      <div class="card-head" style="flex-wrap:wrap;gap:10px"><div><h2>Pul harakati</h2><div class="card-sub">${esc(periodWord(range))}: har bir kirgan va chiqqan pul${tx.transactions.length ? ` · kirdi <b class="green">+${money(tx.transactions.filter((t) => t.direction === 'in').reduce((x, t) => x + Number(t.amount), 0))}</b>, chiqdi <b class="red">−${money(tx.transactions.filter((t) => t.direction === 'out').reduce((x, t) => x + Number(t.amount), 0))}</b>` : ''}</div></div>
        ${periodPicker(range, { id: 'tx' })}</div>
      <div class="chips" style="margin-bottom:12px">
        ${[['', 'Hammasi'], ['cash', 'Naqd'], ['card', 'Karta'], ['transfer', "O'tkazma"]]
    .map(([k, l]) => `<button type="button" class="chip ${k === method ? 'active' : ''}" data-m="${k}">${l}</button>`).join('')}
      </div>
      ${tx.transactions.length ? `<div class="table-wrap cards"><table>
        <thead><tr><th>Vaqt</th><th>Turi</th><th>Usul</th><th class="right">Summa</th><th>Izoh</th></tr></thead>
        <tbody>${tx.transactions.map((t) => `<tr>
          <td data-label="Vaqt">${dateTime(t.created_at)}</td>
          <td data-label="Turi">${esc(CATEGORY_LABELS[t.category] || t.category)}</td>
          <td data-label="Usul">${esc(METHOD_LABELS[t.method] || t.method)}</td>
          <td data-label="Summa" class="right num ${t.direction === 'in' ? 'green' : 'red'}">${t.direction === 'in' ? '+' : '−'}${money(t.amount)}</td>
          <td data-label="Izoh" class="small">${esc(t.note || '')}<div class="muted">${esc(t.user_name || '')}</div></td>
        </tr>`).join('')}</tbody></table></div>`
        : emptyState("Bu davrda harakat yo'q", 'wallet')}
    </div>

    <div class="card" style="margin-top:14px">
      <div class="card-head"><div><h2>Smenalar tarixi</h2><div class="card-sub">Smena yopilganda kassadagi pul sanaladi. «Farq» — kamomad (qizil) yoki ortiqcha (yashil)</div></div></div>
      ${shifts.shifts.length ? `<div class="table-wrap cards"><table>
        <thead><tr><th>Smena ochilgan</th><th>Holat</th><th class="right">Ochilganda</th><th class="right">Bo'lishi kerak edi</th><th class="right">Sanab topildi</th><th class="right">Farq</th></tr></thead>
        <tbody>${shifts.shifts.map((s, i) => `<tr ${i >= SHIFTS_SHOWN ? 'data-more hidden' : ''}>
          <td data-label="Smena ochilgan">${dateTime(s.opened_at)}<div class="small muted">${esc(s.opened_by_name || '')}</div></td>
          <td data-label="Holat">${s.status === 'open' ? '<span class="badge badge-ok">Ochiq</span>' : '<span class="badge badge-muted">Yopilgan</span>'}</td>
          <td data-label="Ochilganda" class="right num">${money(s.opening_amount)}</td>
          <td data-label="Bo'lishi kerak edi" class="right num">${s.expected_amount === null ? '—' : money(s.expected_amount)}</td>
          <td data-label="Sanab topildi" class="right num">${s.counted_amount === null || s.counted_amount === undefined ? '—' : money(s.counted_amount)}</td>
          <td data-label="Farq" class="right num ${Number(s.difference) < 0 ? 'red' : Number(s.difference) > 0 ? 'green' : ''}">${s.difference === null || s.difference === undefined ? '—' : money(s.difference, { sign: true })}</td>
        </tr>`).join('')}</tbody></table></div>
        ${shifts.shifts.length > SHIFTS_SHOWN ? `<button class="btn btn-light btn-sm" type="button" id="more-shifts" style="margin-top:10px">Yana ${shifts.shifts.length - SHIFTS_SHOWN} ta smenani ko'rsatish</button>` : ''}`
        : emptyState("Smenalar yo'q", 'clock')}
    </div>` : ''}`;

  // Smena kartasi
  const sc = body.querySelector('#shiftcard');
  if (shift) {
    const diffPreview = shift.expected_amount;
    sc.innerHTML = `
      <div class="between" style="flex-wrap:wrap;gap:10px">
        <div>
          <div class="card-head" style="margin-bottom:6px"><h2>Smena ochiq <span class="badge badge-ok">ishlayapti</span></h2></div>
          <div class="small muted">Ochilgan: ${dateTime(shift.opened_at)} · ochilganda kassada: <b class="num">${money(shift.opening_amount)}</b></div>
          <div style="margin-top:8px">Hozir kassada bo'lishi kerak: <b class="big num" style="font-size:20px">${money(diffPreview)}</b> <span class="small muted">naqd</span></div>
        </div>
        ${ctx.can('cash.shift') ? `<button class="btn btn-warn" type="button" id="closeshift">${icon('check', 'ico-sm')} Smenani yopish</button>` : ''}
      </div>`;
    sc.querySelector('#closeshift')?.addEventListener('click', () => openCloseShift(diffPreview, refresh));
  } else {
    sc.innerHTML = `
      <div class="between" style="flex-wrap:wrap;gap:10px">
        <div>
          <div class="card-head" style="margin-bottom:6px"><h2>Smena yopiq</h2></div>
          <div class="small muted">Ish boshida smenani oching va kassadagi naqd pulni yozing. Ish oxirida yopasiz — dastur pulni tekshiradi.</div>
        </div>
        ${ctx.can('cash.shift') ? `<button class="btn btn-success" type="button" id="openshift">${icon('check', 'ico-sm')} Smenani ochish</button>` : ''}
      </div>`;
    sc.querySelector('#openshift')?.addEventListener('click', () => openShift(refresh));
  }

  body.querySelector('#more-shifts')?.addEventListener('click', (e) => {
    body.querySelectorAll('tr[data-more]').forEach((tr) => { tr.hidden = false; });
    e.currentTarget.remove();
  });
  body.querySelector('#dep')?.addEventListener('click', () => openMovement('deposit', refresh));
  body.querySelector('#wd')?.addEventListener('click', () => openMovement('withdrawal', refresh));

  if (canView) {
    bindPeriod(body, (next) => ctx.go(`#/cash?tab=cash&${periodQuery(next)}&method=${method}`), { id: 'tx' });
    body.querySelectorAll('[data-m]').forEach((b) => b.addEventListener('click', () => {
      ctx.go(`#/cash?tab=cash&${periodQuery(range)}&method=${b.dataset.m}`);
    }));
  }
}

function openShift(refresh) {
  const { close, el } = openModal({
    title: 'Smenani ochish',
    body: `<label class="field"><span>Hozir kassada qancha naqd pul bor? (so'm)</span>
             <input class="input" id="op" inputmode="decimal" value="0"></label>
           <p class="small muted" style="margin-top:10px">Kassadagi pulni sanab yozing. Bo'sh bo'lsa, 0 qoldiring.</p>
           <div id="err" style="margin-top:10px"></div>`,
    foot: `<button class="btn btn-outline" type="button" data-no>Bekor</button>
           <button class="btn btn-success" type="button" data-yes>Ochish</button>`,
  });
  el.querySelector('[data-no]').addEventListener('click', close);
  el.querySelector('[data-yes]').addEventListener('click', (e) => {
    withBusy(e.currentTarget, async () => {
      try {
        await post('/cash/shifts/open', { opening_amount: toNum(el.querySelector('#op').value) });
        close();
        toast('Smena ochildi', 'ok');
        refresh();
      } catch (err) {
        el.querySelector('#err').innerHTML = `<div class="alert alert-bad">${esc(err.message)}</div>`;
      }
    });
  });
}

function openCloseShift(expected, refresh) {
  const { close, el } = openModal({
    title: 'Smenani yopish',
    body: `<p>Dastur hisobi bo'yicha kassada bo'lishi kerak: <b class="num">${money(expected)}</b></p>
           <label class="field" style="margin-top:12px"><span>Kassadagi pulni sanang va yozing (so'm)</span>
             <input class="input" id="cc" inputmode="decimal" value="${expected}"></label>
           <div id="res" style="margin-top:12px"></div>`,
    foot: `<button class="btn btn-outline" type="button" data-no>Bekor</button>
           <button class="btn btn-warn" type="button" data-yes>Yopish</button>`,
  });
  const diffBox = (counted) => {
    const diff = Math.round((counted - expected) * 100) / 100;
    const cls = diff < 0 ? 'alert-warn' : 'alert-info';
    const text = diff === 0 ? 'Farq yo\'q' : diff > 0 ? `Ortiqcha: ${money(diff)}` : `Kamomad: ${money(-diff)}`;
    el.querySelector('#res').innerHTML = `<div class="alert ${cls}">${esc(text)}</div>`;
  };
  el.querySelector('#cc').addEventListener('input', (e) => diffBox(toNum(e.target.value)));
  el.querySelector('[data-no]').addEventListener('click', close);
  el.querySelector('[data-yes]').addEventListener('click', (e) => {
    withBusy(e.currentTarget, async () => {
      try {
        const r = await post('/cash/shifts/close', { counted_amount: toNum(el.querySelector('#cc').value) });
        close();
        toast(`Smena yopildi. Farq: ${money(r.difference, { sign: true })}`, 'ok');
        refresh();
      } catch (err) {
        el.querySelector('#res').innerHTML = `<div class="alert alert-bad">${esc(err.message)}</div>`;
      }
    });
  });
}

function openMovement(kind, refresh) {
  const title = kind === 'deposit' ? "Kassaga pul qo'yish" : 'Kassadan pul olish';
  const { close, el } = openModal({
    title,
    body: `<div class="form-grid two" style="gap:10px">
        <label class="field"><span>Qayerga / qayerdan</span>
          <select class="input" id="mm"><option value="cash">Naqd</option><option value="card">Karta</option><option value="transfer">O'tkazma</option></select></label>
        <label class="field"><span>Summa (so'm) *</span><input class="input" id="ma" inputmode="decimal" placeholder="0"></label>
      </div>
      <label class="field" style="margin-top:10px"><span>Nima uchun? *</span>
        <input class="input" id="mn" maxlength="200" placeholder="${kind === 'deposit' ? 'Masalan: mayda pul qo\'shildi' : 'Masalan: bankka topshirildi'}"></label>
      <div id="err" style="margin-top:10px"></div>`,
    foot: `<button class="btn btn-outline" type="button" data-no>Bekor</button>
           <button class="btn ${kind === 'deposit' ? 'btn-success' : 'btn-warn'}" type="button" data-yes>Saqlash</button>`,
  });
  el.querySelector('[data-no]').addEventListener('click', close);
  el.querySelector('[data-yes]').addEventListener('click', (e) => {
    withBusy(e.currentTarget, async () => {
      try {
        await post('/cash/movements', {
          kind,
          method: el.querySelector('#mm').value,
          amount: toNum(el.querySelector('#ma').value),
          note: el.querySelector('#mn').value.trim(),
        });
        close();
        toast('Saqlandi', 'ok');
        refresh();
      } catch (err) {
        el.querySelector('#err').innerHTML = `<div class="alert alert-bad">${esc(err.message)}</div>`;
      }
    });
  });
}

// ---------- Xarajatlar ----------

async function tabExpenses(body, q, ctx, refresh) {
  const range = resolvePeriod(q, 'month');
  const word = periodWord(range);
  const { expenses, by_category, total, categories } = await get(`/expenses?from=${range.from}&to=${range.to}`);
  const canManage = ctx.can('expenses.manage');
  const days = Math.round((Date.parse(`${range.to}T00:00:00Z`) - Date.parse(`${range.from}T00:00:00Z`)) / 86400000) + 1;
  const cats = [...by_category].sort((x, y) => Number(y.total) - Number(x.total));
  const top = cats[0];
  let cat = '';
  let text = '';

  body.innerHTML = `
    <div class="toolbar-row">
      ${periodPicker(range)}
      ${canManage ? `<button class="btn" type="button" id="exp-new">${icon('plus', 'ico-sm')} Xarajat qo'shish</button>` : ''}
    </div>
    <div class="sum-row">
      <div class="sum-cell bad"><span>Jami xarajat</span><b>${money(total)}</b><small>${esc(word)}</small></div>
      <div class="sum-cell"><span>Yozuvlar</span><b>${expenses.length} ta</b></div>
      <div class="sum-cell"><span>Kuniga o'rtacha</span><b>${money(days > 0 ? total / days : 0)}</b><small>${days} kun</small></div>
      <div class="sum-cell"><span>Eng katta turkum</span><b>${top ? esc(EXPENSE_LABELS[top.category] || top.category) : '—'}</b>${top ? `<small>${money(top.total)}</small>` : ''}</div>
    </div>

    <div class="home-row halves" style="margin-top:14px">
      <section class="card">
        <div class="card-head"><div><h2>Pul nimaga ketdi?</h2><div class="card-sub">${esc(word)}: turkumlar bo'yicha</div></div></div>
        ${cats.length ? `<div class="cat-bars">${cats.map((c) => {
          const share = total > 0 ? (Number(c.total) / total) * 100 : 0;
          return `<button type="button" class="cat-bar" data-cat="${esc(c.category)}">
            <span class="cb-top"><b>${esc(EXPENSE_LABELS[c.category] || c.category)}</b><span class="num">${money(c.total)} <small class="muted">${Math.round(share)}%</small></span></span>
            <span class="cb-track"><i style="width:${share}%"></i></span>
          </button>`;
        }).join('')}</div>` : emptyState(`${word} xarajat yo'q`, 'wallet')}
      </section>
      ${ctx.can('reports.view') ? `<section class="card" id="exp-months"><div class="card-head"><div><h2>Oylar bo'yicha</h2><div class="card-sub">So'nggi 6 oy xarajatlari</div></div></div><div class="empty small">Yuklanmoqda…</div></section>` : ''}
    </div>

    <div class="card" style="margin-top:14px">
      <div class="card-head"><h2>Xarajatlar ro'yxati</h2></div>
      <div class="list-tools">
        <div class="search-input">${icon('search', 'ico-sm')}<input class="input" id="eq" type="search" placeholder="Izoh bo'yicha qidirish" autocomplete="off"></div>
        <div class="chips" id="ecats"><button type="button" class="chip active" data-ec="">Hammasi</button>${cats.map((c) => `<button type="button" class="chip" data-ec="${esc(c.category)}">${esc(EXPENSE_LABELS[c.category] || c.category)}</button>`).join('')}</div>
      </div>
      <div id="elist"></div>
    </div>`;

  const draw = () => {
    const t = text.toLowerCase();
    const rows = expenses.filter((e) => (!cat || e.category === cat) && (!t || (e.description || '').toLowerCase().includes(t)));
    body.querySelector('#elist').innerHTML = rows.length ? `<div class="table-wrap cards"><table>
        <thead><tr><th>Sana</th><th>Turkum</th><th>Izoh</th><th>Qayerdan</th><th class="right">Summa</th><th>Kim yozdi</th></tr></thead>
        <tbody>${rows.map((e) => `<tr>
          <td data-label="Sana">${dateOnly(e.expense_date)}</td>
          <td data-label="Turkum"><span class="badge badge-muted">${esc(EXPENSE_LABELS[e.category] || e.category)}</span></td>
          <td data-label="Izoh">${esc(e.description || '—')}</td>
          <td data-label="Qayerdan">${esc(METHOD_LABELS[e.method] || e.method)}</td>
          <td data-label="Summa" class="right num"><b>${money(e.amount)}</b></td>
          <td data-label="Kim yozdi" class="small muted">${esc(e.user_name || '')}</td>
        </tr>`).join('')}</tbody>
        ${rows.length > 1 ? `<tfoot><tr><td colspan="4"><b>Jami</b></td><td class="right num"><b>${money(rows.reduce((x, e) => x + Number(e.amount), 0))}</b></td><td></td></tr></tfoot>` : ''}
      </table></div>`
      : emptyState(expenses.length ? "Bu filtr bo'yicha xarajat yo'q" : `${word} xarajat yo'q`, 'wallet');
  };
  draw();

  bindPeriod(body, (next) => ctx.go(`#/cash?tab=expenses&${periodQuery(next)}`));
  const pickCat = (c) => {
    cat = c;
    body.querySelectorAll('[data-ec]').forEach((x) => x.classList.toggle('active', x.dataset.ec === c));
    draw();
  };
  body.querySelector('#ecats').addEventListener('click', (e) => { const b = e.target.closest('[data-ec]'); if (b) pickCat(b.dataset.ec); });
  body.querySelectorAll('[data-cat]').forEach((b) => b.addEventListener('click', () => {
    pickCat(b.dataset.cat);
    body.querySelector('#elist').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }));
  body.querySelector('#eq').addEventListener('input', (e) => { text = e.target.value.trim(); draw(); });
  body.querySelector('#exp-new')?.addEventListener('click', () => openExpense(categories, refresh));

  const mBox = body.querySelector('#exp-months');
  if (mBox) {
    get('/analytics/monthly?months=6').then(({ months }) => {
      if (!mBox.isConnected) return;
      const list = months.slice(months.findIndex((m) => m.sales_count > 0 || m.expenses > 0)).filter(Boolean);
      const shown = list.length ? list : months.slice(-1);
      const max = Math.max(1, ...shown.map((m) => m.expenses));
      mBox.innerHTML = `<div class="card-head"><div><h2>Oylar bo'yicha</h2><div class="card-sub">Har oyning xarajati (joriy oy — bugungacha)</div></div></div>
        <div class="cat-bars">${shown.slice().reverse().map((m) => `
          <a class="cat-bar" href="#/cash?tab=expenses&from=${m.from}&to=${m.to}">
            <span class="cb-top"><b>${esc(monthName(m.month.slice(5)))} ${m.month.slice(0, 4)}</b><span class="num">${money(m.expenses)}${m.revenue > 0 ? ` <small class="muted">savdoning ${Math.round((m.expenses / m.revenue) * 100)}%</small>` : ''}</span></span>
            <span class="cb-track"><i class="exp" style="width:${(m.expenses / max) * 100}%"></i></span>
          </a>`).join('')}</div>`;
    }).catch(() => mBox.remove());
  }
}

// Yangi xarajat oynasi
function openExpense(categories, refresh) {
  const expenseKey = newKey('exp');
  const { close, el } = openModal({
    title: "Xarajat qo'shish",
    body: `<form id="ef" class="form-grid two" style="gap:12px" novalidate>
        <div class="field" style="grid-column:1/-1"><span>Nimaga ketdi? *</span>
          <div class="chips" id="ef-cats">${categories.map((c, i) => `<button type="button" class="chip ${i === 0 ? 'active' : ''}" data-c="${c}">${esc(EXPENSE_LABELS[c] || c)}</button>`).join('')}</div></div>
        <label class="field"><span>Summa *</span><div class="money-input"><input class="input input-lg" name="amount" inputmode="decimal" placeholder="0" autocomplete="off"><em>so'm</em></div></label>
        <label class="field"><span>Qayerdan to'landi?</span>
          <select class="input" name="method"><option value="cash">Naqd (kassadan)</option><option value="card">Karta</option><option value="transfer">O'tkazma</option></select></label>
        <label class="field"><span>Sana</span><input class="input" type="date" name="expense_date" value="${todayStr()}" max="${todayStr()}"></label>
        <label class="field"><span>Izoh <small>(ixtiyoriy)</small></span><input class="input" name="description" maxlength="200" placeholder="Masalan: noyabr ijarasi"></label>
        <div id="eerr" style="grid-column:1/-1"></div>
      </form>`,
    foot: `<button class="btn btn-outline" type="button" data-close>Bekor</button><button class="btn" type="submit" form="ef">${icon('check', 'ico-sm')} Saqlash</button>`,
  });
  let category = categories[0];
  el.querySelector('#ef-cats').addEventListener('click', (e) => {
    const b = e.target.closest('[data-c]');
    if (!b) return;
    category = b.dataset.c;
    el.querySelectorAll('#ef-cats [data-c]').forEach((x) => x.classList.toggle('active', x === b));
  });
  const form = el.querySelector('#ef');
  if (window.matchMedia('(min-width: 720px)').matches) form.amount.focus();
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = el.querySelector('#eerr');
    const amount = toNum(form.amount.value);
    if (!(amount > 0)) {
      err.innerHTML = '<div class="alert alert-warn">Summani kiriting</div>';
      form.amount.focus();
      return;
    }
    await withBusy(el.querySelector('[type=submit]'), async () => {
      try {
        await post('/expenses', {
          category,
          amount,
          method: form.querySelector('[name=method]').value,
          expense_date: form.expense_date.value,
          description: form.description.value.trim() || null,
          idempotency_key: expenseKey,
        });
        close();
        toast(`Xarajat saqlandi: ${money(amount)}`, 'ok');
        refresh();
      } catch (ex) {
        err.innerHTML = `<div class="alert alert-bad">${esc(ex.message)}</div>`;
      }
    });
  });
}
