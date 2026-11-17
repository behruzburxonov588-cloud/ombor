// Kassa: balanslar, smena, kirim-chiqim, kassa harakatlari va xarajatlar
import {
  get, post, icon, esc, num, money, dateTime, dateOnly, toast, errorToast, openModal, withBusy,
  emptyState, todayStr, monthStartStr,
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
    <div class="page-head"><div><h1>Kassa va xarajatlar</h1><p class="muted">Pul harakati, smena va xarajatlar</p></div></div>
    ${allowed.length > 1 ? `<div class="seg" style="margin-bottom:14px">
      ${allowed.map((t) => `<button type="button" data-tab="${t.key}" class="${t.key === tab.key ? 'active' : ''}">${t.label}</button>`).join('')}
    </div>` : ''}
    <div id="tabbody"></div>`;
  root.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => ctx.go(`#/cash?tab=${b.dataset.tab}`)));

  const refresh = () => render(root, params, ctx);
  const body = root.querySelector('#tabbody');
  if (tab.key === 'cash') await tabCash(body, params.query, ctx, refresh);
  else await tabExpenses(body, params.query, ctx, refresh);
}

// ---------- Kassa ----------

async function tabCash(body, q, ctx, refresh) {
  const from = q.from || todayStr();
  const to = q.to || todayStr();
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

  body.innerHTML = `
    <div class="kpis">
      <div class="kpi neutral"><div class="label">Naqd pul</div><div class="value">${money(b.cash)}</div><div class="hint">kassada</div></div>
      <div class="kpi neutral"><div class="label">Karta</div><div class="value">${money(b.card)}</div><div class="hint">hisobda</div></div>
      <div class="kpi neutral"><div class="label">O'tkazma</div><div class="value">${money(b.transfer)}</div><div class="hint">hisobda</div></div>
      <div class="kpi ${b.total >= 0 ? 'good' : 'bad'}"><div class="label">Jami</div><div class="value">${money(b.total)}</div><div class="hint">barcha usullar</div></div>
    </div>
    <div class="kpis" style="margin-top:12px">
      <div class="kpi good"><div class="label">Bugun kirim</div><div class="value">${money(todayIn)}</div></div>
      <div class="kpi bad"><div class="label">Bugun chiqim</div><div class="value">${money(todayOut)}</div></div>
    </div>

    <div class="card" style="margin-top:14px" id="shiftcard"></div>

    ${ctx.can('cash.manage') ? `<div class="row" style="margin-top:14px;flex-wrap:wrap">
      <button class="btn btn-success" type="button" id="dep">${icon('plus', 'ico-sm')} Kirim (depozit)</button>
      <button class="btn btn-outline" type="button" id="wd">${icon('minus', 'ico-sm')} Pul olish</button>
    </div>` : ''}

    ${canView ? `
    <div class="card" style="margin-top:14px">
      <div class="card-head"><h2>Kassa harakatlari</h2></div>
      <div class="form-grid two" style="gap:10px;margin-bottom:12px">
        <label class="field"><span>Boshlanish</span><input class="input" type="date" data-from value="${esc(from)}"></label>
        <label class="field"><span>Tugash</span><input class="input" type="date" data-to value="${esc(to)}"></label>
      </div>
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
      <div class="card-head"><h2>Smenalar tarixi</h2></div>
      ${shifts.shifts.length ? `<div class="table-wrap cards"><table>
        <thead><tr><th>Ochilgan</th><th>Holat</th><th class="right">Boshlang'ich</th><th class="right">Kutilgan</th><th class="right">Sanalgan</th><th class="right">Farq</th></tr></thead>
        <tbody>${shifts.shifts.map((s) => `<tr>
          <td data-label="Ochilgan">${dateTime(s.opened_at)}<div class="small muted">${esc(s.opened_by_name || '')}</div></td>
          <td data-label="Holat">${s.status === 'open' ? '<span class="badge badge-ok">Ochiq</span>' : '<span class="badge badge-muted">Yopilgan</span>'}</td>
          <td data-label="Boshlang'ich" class="right num">${money(s.opening_amount)}</td>
          <td data-label="Kutilgan" class="right num">${s.expected_amount === null ? '—' : money(s.expected_amount)}</td>
          <td data-label="Sanalgan" class="right num">${s.counted_amount === null || s.counted_amount === undefined ? '—' : money(s.counted_amount)}</td>
          <td data-label="Farq" class="right num ${Number(s.difference) < 0 ? 'red' : Number(s.difference) > 0 ? 'green' : ''}">${s.difference === null || s.difference === undefined ? '—' : money(s.difference, { sign: true })}</td>
        </tr>`).join('')}</tbody></table></div>`
        : emptyState("Smenalar yo'q", 'clock')}
    </div>` : ''}`;

  // Smena kartasi
  const sc = body.querySelector('#shiftcard');
  if (shift) {
    const diffPreview = shift.expected_amount;
    sc.innerHTML = `
      <div class="between" style="flex-wrap:wrap;gap:10px">
        <div>
          <div class="card-head" style="margin-bottom:6px"><h2>Smena: <span class="badge badge-ok">ochiq</span></h2></div>
          <div class="small muted">Ochilgan: ${dateTime(shift.opened_at)} · boshlang'ich naqd: <b class="num">${money(shift.opening_amount)}</b></div>
          <div style="margin-top:8px">Kutilayotgan naqd pul: <b class="big num" style="font-size:20px">${money(diffPreview)}</b></div>
        </div>
        ${ctx.can('cash.shift') ? `<button class="btn btn-warn" type="button" id="closeshift">${icon('check', 'ico-sm')} Smenani yopish</button>` : ''}
      </div>`;
    sc.querySelector('#closeshift')?.addEventListener('click', () => openCloseShift(diffPreview, refresh));
  } else {
    sc.innerHTML = `
      <div class="between" style="flex-wrap:wrap;gap:10px">
        <div>
          <div class="card-head" style="margin-bottom:6px"><h2>Smena: <span class="badge badge-muted">yopiq</span></h2></div>
          <div class="small muted">Savdo qilish uchun smenani oching. Naqd kirim-chiqim smena ichida hisoblanadi.</div>
        </div>
        ${ctx.can('cash.shift') ? `<button class="btn btn-success" type="button" id="openshift">${icon('check', 'ico-sm')} Smenani ochish</button>` : ''}
      </div>`;
    sc.querySelector('#openshift')?.addEventListener('click', () => openShift(refresh));
  }

  body.querySelector('#dep')?.addEventListener('click', () => openMovement('deposit', refresh));
  body.querySelector('#wd')?.addEventListener('click', () => openMovement('withdrawal', refresh));

  if (canView) {
    const apply = () => ctx.go(`#/cash?tab=cash&from=${body.querySelector('[data-from]').value}&to=${body.querySelector('[data-to]').value}&method=${method}`);
    body.querySelector('[data-from]').addEventListener('change', apply);
    body.querySelector('[data-to]').addEventListener('change', apply);
    body.querySelectorAll('[data-m]').forEach((b) => b.addEventListener('click', () => {
      ctx.go(`#/cash?tab=cash&from=${from}&to=${to}&method=${b.dataset.m}`);
    }));
  }
}

function openShift(refresh) {
  const { close, el } = openModal({
    title: 'Smenani ochish',
    body: `<label class="field"><span>Boshlang'ich naqd pul (so'm)</span>
             <input class="input" id="op" inputmode="decimal" value="0"></label>
           <p class="small muted" style="margin-top:10px">Kassadagi naqd pul sanab kiritiladi.</p>
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
    body: `<p>Kutilgan naqd pul: <b class="num">${money(expected)}</b></p>
           <label class="field" style="margin-top:12px"><span>Sanalgan naqd pul (so'm)</span>
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
  const title = kind === 'deposit' ? "Kirim (depozit)" : 'Pul olish';
  const { close, el } = openModal({
    title,
    body: `<div class="form-grid two" style="gap:10px">
        <label class="field"><span>Usul</span>
          <select class="input" id="mm"><option value="cash">Naqd</option><option value="card">Karta</option><option value="transfer">O'tkazma</option></select></label>
        <label class="field"><span>Summa (so'm) *</span><input class="input" id="ma" inputmode="decimal" placeholder="0"></label>
      </div>
      <label class="field" style="margin-top:10px"><span>Izoh *</span>
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
  const from = q.from || monthStartStr();
  const to = q.to || todayStr();
  const { expenses, by_category, total, categories } = await get(`/expenses?from=${from}&to=${to}`);
  const canManage = ctx.can('expenses.manage');

  body.innerHTML = `
    <div class="card" style="margin-bottom:14px">
      <div class="form-grid two" style="gap:10px">
        <label class="field"><span>Boshlanish</span><input class="input" type="date" data-from value="${esc(from)}"></label>
        <label class="field"><span>Tugash</span><input class="input" type="date" data-to value="${esc(to)}"></label>
      </div>
    </div>
    <div class="kpis">
      <div class="kpi bad"><div class="label">Jami xarajat</div><div class="value">${money(total)}</div><div class="hint">${expenses.length} ta yozuv</div></div>
      ${by_category.map((c) => `<div class="kpi neutral"><div class="label">${esc(EXPENSE_LABELS[c.category] || c.category)}</div><div class="value">${money(c.total)}</div></div>`).join('')}
    </div>

    ${canManage ? `<div class="card" style="margin-top:14px">
      <div class="card-head"><h2>Yangi xarajat</h2></div>
      <form id="ef" class="form-grid two" style="gap:10px" novalidate>
        <label class="field"><span>Turkum *</span>
          <select class="input" name="category">${categories.map((c) => `<option value="${c}">${esc(EXPENSE_LABELS[c] || c)}</option>`).join('')}</select></label>
        <label class="field"><span>Summa (so'm) *</span><input class="input" name="amount" inputmode="decimal" placeholder="0"></label>
        <label class="field"><span>Usul</span>
          <select class="input" name="method"><option value="cash">Naqd</option><option value="card">Karta</option><option value="transfer">O'tkazma</option></select></label>
        <label class="field"><span>Sana</span><input class="input" type="date" name="expense_date" value="${todayStr()}"></label>
        <label class="field" style="grid-column:1/-1"><span>Izoh</span><input class="input" name="description" maxlength="200" placeholder="Masalan: oylik ijara"></label>
        <div id="eerr" style="grid-column:1/-1"></div>
        <button class="btn btn-lg" type="submit" style="grid-column:1/-1">${icon('check')} Xarajatni saqlash</button>
      </form>
    </div>` : ''}

    <div class="card" style="margin-top:14px">
      <div class="card-head"><h2>Xarajatlar ro'yxati</h2></div>
      ${expenses.length ? `<div class="table-wrap cards"><table>
        <thead><tr><th>Sana</th><th>Turkum</th><th>Izoh</th><th>Usul</th><th class="right">Summa</th><th>Kim</th></tr></thead>
        <tbody>${expenses.map((e) => `<tr>
          <td data-label="Sana">${dateOnly(e.expense_date)}</td>
          <td data-label="Turkum">${esc(EXPENSE_LABELS[e.category] || e.category)}</td>
          <td data-label="Izoh">${esc(e.description || '')}</td>
          <td data-label="Usul">${esc(METHOD_LABELS[e.method] || e.method)}</td>
          <td data-label="Summa" class="right num">${money(e.amount)}</td>
          <td data-label="Kim" class="small">${esc(e.user_name || '')}</td>
        </tr>`).join('')}</tbody></table></div>`
        : emptyState("Bu davrda xarajat yo'q", 'wallet')}
    </div>`;

  const apply = () => ctx.go(`#/cash?tab=expenses&from=${body.querySelector('[data-from]').value}&to=${body.querySelector('[data-to]').value}`);
  body.querySelector('[data-from]').addEventListener('change', apply);
  body.querySelector('[data-to]').addEventListener('change', apply);

  body.querySelector('#ef')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.currentTarget;
    const err = body.querySelector('#eerr');
    const amount = toNum(form.amount.value);
    if (!(amount > 0)) {
      err.innerHTML = '<div class="alert alert-warn">Summani kiriting</div>';
      return;
    }
    const btn = form.querySelector('button[type=submit]');
    await withBusy(btn, async () => {
      try {
        await post('/expenses', {
          category: form.category.value,
          amount,
          method: form.querySelector('[name=method]').value,
          expense_date: form.expense_date.value,
          description: form.description.value.trim() || null,
        });
        toast('Xarajat saqlandi', 'ok');
        refresh();
      } catch (ex) {
        err.innerHTML = `<div class="alert alert-bad">${esc(ex.message)}</div>`;
      }
    });
  });
}
