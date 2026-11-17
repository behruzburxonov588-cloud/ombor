// Mijozlar va yetkazib beruvchilar: ro'yxat, tafsilot, qarz to'lovlari, yaratish va tahrirlash
import {
  get, post, put, icon, esc, money, dateTime, dateOnly, readForm, toast, errorToast,
  openModal, withBusy, emptyState, newKey,
} from '../ui.js';

const METHOD_LABELS = { cash: 'Naqd', card: 'Karta', transfer: "O'tkazma" };
const SALE_STATUS = {
  completed: '<span class="badge badge-ok">Yakunlangan</span>',
  returned: '<span class="badge badge-muted">Qaytarilgan</span>',
  partially_returned: '<span class="badge badge-low">Qisman qaytarilgan</span>',
};

const CONFIG = {
  customers: {
    key: 'customers',
    title: 'Mijozlar',
    singular: 'Mijoz',
    listKey: 'customers',
    base: '#/customers',
    view: ['customers.view', 'sales.create'],
    manage: 'customers.manage',
    pay: ['payments.create', 'customers.manage'],
    entityKey: 'customer',
    docKey: 'sales',
    paymentsKey: 'payments',
    debtLabel: 'Joriy qarz',
    payTitle: "Qarzni to'lash",
    payPath: (id) => `/customers/${id}/payments`,
    itemPath: (id) => `/customers/${id}`,
    listPath: '/customers',
    docsTitle: 'Savdolar',
  },
  suppliers: {
    key: 'suppliers',
    title: 'Yetkazib beruvchilar',
    singular: 'Yetkazib beruvchi',
    listKey: 'suppliers',
    base: '#/suppliers',
    view: ['suppliers.view', 'purchases.view'],
    manage: 'suppliers.manage',
    pay: ['suppliers.manage', 'payments.create'],
    entityKey: 'supplier',
    docKey: 'purchases',
    paymentsKey: 'payments',
    debtLabel: 'Bizning qarzimiz',
    payTitle: "Yetkazib beruvchiga to'lov",
    payPath: (id) => `/suppliers/${id}/payments`,
    itemPath: (id) => `/suppliers/${id}`,
    listPath: '/suppliers',
    docsTitle: 'Kirimlar',
  },
};

export async function render(root, params, ctx) {
  const cfg = CONFIG[params.key];
  if (!cfg) return;
  if (!ctx.canAny(cfg.view)) {
    root.innerHTML = '<div class="alert alert-bad">Bu bo\'limni ko\'rish uchun ruxsatingiz yo\'q</div>';
    return;
  }
  if (params.id) return renderDetail(root, cfg, Number(params.id), ctx);
  return renderList(root, cfg, ctx);
}

// ---------- Ro'yxat ----------

async function renderList(root, cfg, ctx) {
  let q = '';
  root.innerHTML = `
    <div class="page-head">
      <div><h1>${cfg.title}</h1><p class="muted" id="cnt">Yuklanmoqda...</p></div>
      ${ctx.can(cfg.manage) ? `<button class="btn" type="button" id="add">${icon('plus')} Yangi</button>` : ''}
    </div>
    <input class="input" type="search" id="q" placeholder="Ism yoki telefon bo'yicha qidirish" autocomplete="off">
    <div class="card" style="margin-top:14px" id="list"></div>`;

  const load = async () => {
    const data = await get(`${cfg.listPath}?q=${encodeURIComponent(q)}`);
    const rows = data[cfg.listKey];
    root.querySelector('#cnt').textContent = `${rows.length} ta`;
    const box = root.querySelector('#list');
    box.innerHTML = rows.length
      ? `<div class="list">${rows.map((r) => `
          <div class="list-item" data-id="${r.id}">
            <div class="meta">
              <div class="name">${esc(r.name)}</div>
              <div class="sub">${esc(r.phone || 'Telefon kiritilmagan')}</div>
            </div>
            <div class="end">
              <div class="small muted">${cfg.debtLabel}</div>
              <div class="num ${Number(r.debt) > 0 ? 'amber' : 'green'}" style="font-weight:800">${money(r.debt)}</div>
            </div>
          </div>`).join('')}</div>`
      : emptyState(q ? 'Hech narsa topilmadi' : `${cfg.singular} qo'shilmagan`, 'users');
    box.querySelectorAll('[data-id]').forEach((el) => el.addEventListener('click', () => ctx.go(`${cfg.base}/${el.dataset.id}`)));
  };

  let timer = null;
  root.querySelector('#q').addEventListener('input', (e) => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      q = e.target.value.trim();
      load().catch(errorToast);
    }, 220);
  });
  root.querySelector('#add')?.addEventListener('click', () => openEditor(cfg, null, () => renderList(root, cfg, ctx)));
  await load();
}

// ---------- Tafsilot ----------

async function renderDetail(root, cfg, id, ctx) {
  const d = await get(cfg.itemPath(id));
  const entity = d[cfg.entityKey];
  const debt = Number(d.debt);
  const docs = d[cfg.docKey];
  const payments = d[cfg.paymentsKey] || [];
  const isCustomer = cfg.key === 'customers';
  const canPay = debt > 0 && ctx.canAny(cfg.pay);

  root.innerHTML = `
    <div class="page-head">
      <a class="btn btn-light btn-sm" href="${cfg.base}">${icon('back', 'ico-sm')} ${cfg.title}</a>
      <div class="row">
        ${canPay ? `<button class="btn btn-success" type="button" id="pay">${icon('money', 'ico-sm')} ${cfg.payTitle}</button>` : ''}
        ${ctx.can(cfg.manage) ? `<button class="btn btn-outline" type="button" id="edit">${icon('edit', 'ico-sm')} Tahrirlash</button>` : ''}
      </div>
    </div>

    <div class="card">
      <h1 style="font-size:22px">${esc(entity.name)}</h1>
      <div class="small muted" style="margin-top:4px">
        ${esc(entity.phone || 'Telefon kiritilmagan')}
        ${isCustomer && entity.note ? ` · ${esc(entity.note)}` : ''}
        ${!isCustomer && entity.address ? ` · ${esc(entity.address)}` : ''}
      </div>
    </div>

    <div class="kpis" style="margin-top:14px">
      <div class="kpi ${debt > 0 ? 'warn' : 'good'}">
        <div class="label">${cfg.debtLabel}</div>
        <div class="value">${money(debt)}</div>
        <div class="hint">${debt > 0 ? "to'lanmagan qarz" : 'qarzi yo\'q'}</div>
      </div>
      <div class="kpi neutral">
        <div class="label">${isCustomer ? 'Jami xaridlar' : 'Jami kirimlar'}</div>
        <div class="value">${money(isCustomer ? d.total_purchases : d.total_purchased)}</div>
        <div class="hint">${docs.length} ta ${isCustomer ? 'savdo' : 'kirim'}</div>
      </div>
    </div>

    <div class="card" style="margin-top:14px">
      <div class="seg" style="margin-bottom:12px">
        <button type="button" data-t="docs" class="active">${cfg.docsTitle}</button>
        <button type="button" data-t="pay">To'lovlar</button>
      </div>
      <div id="tb"></div>
    </div>`;

  const tb = root.querySelector('#tb');
  const showTab = (t) => {
    root.querySelectorAll('[data-t]').forEach((b) => b.classList.toggle('active', b.dataset.t === t));
    if (t === 'pay') {
      tb.innerHTML = payments.length
        ? `<div class="table-wrap cards"><table>
            <thead><tr><th>Vaqt</th><th>Usul</th><th class="right">Summa</th><th>Izoh</th></tr></thead>
            <tbody>${payments.map((p) => `<tr>
              <td data-label="Vaqt">${dateTime(p.created_at)}</td>
              <td data-label="Usul">${esc(METHOD_LABELS[p.method] || p.method)}</td>
              <td data-label="Summa" class="right num green">${money(p.amount)}</td>
              <td data-label="Izoh" class="small">${esc(p.note || '')}</td>
            </tr>`).join('')}</tbody></table></div>`
        : emptyState("To'lovlar yo'q", 'wallet');
      return;
    }
    tb.innerHTML = docs.length
      ? `<div class="table-wrap cards"><table>
          <thead><tr>
            <th>${isCustomer ? 'Chek' : 'Raqam'}</th><th>Sana</th><th class="right">Jami</th>
            <th class="right">${isCustomer ? 'Qarz' : 'Qarz'}</th><th>Holat</th>
          </tr></thead>
          <tbody>${docs.map((x) => isCustomer
    ? `<tr class="clickable" data-go="#/sales/${x.id}">
                <td data-label="Chek"><b>${esc(x.receipt_no)}</b></td>
                <td data-label="Sana">${dateTime(x.created_at)}</td>
                <td data-label="Jami" class="right num">${money(x.total)}</td>
                <td data-label="Qarz" class="right num ${Number(x.balance_due) > 0 ? 'amber' : ''}">${money(x.balance_due)}</td>
                <td data-label="Holat">${SALE_STATUS[x.status] || esc(x.status)}</td>
              </tr>`
    : `<tr class="clickable" data-go="#/purchases/${x.id}">
                <td data-label="Raqam"><b>${esc(x.purchase_no)}</b></td>
                <td data-label="Sana">${dateOnly(x.purchase_date)}</td>
                <td data-label="Jami" class="right num">${money(x.total)}</td>
                <td data-label="Qarz" class="right num ${Number(x.remaining_debt) > 0 ? 'amber' : ''}">${money(x.remaining_debt)}</td>
                <td data-label="Holat">${Number(x.remaining_debt) > 0 ? '<span class="badge badge-low">Qarzli</span>' : '<span class="badge badge-ok">To\'langan</span>'}</td>
              </tr>`).join('')}
          </tbody></table></div>`
      : emptyState(`${cfg.docsTitle} yo'q`, isCustomer ? 'cart' : 'truck');
    tb.querySelectorAll('[data-go]').forEach((tr) => tr.addEventListener('click', () => ctx.go(tr.dataset.go)));
  };
  root.querySelectorAll('[data-t]').forEach((b) => b.addEventListener('click', () => showTab(b.dataset.t)));
  showTab('docs');

  root.querySelector('#pay')?.addEventListener('click', () => openPayment(cfg, id, debt, () => renderDetail(root, cfg, id, ctx)));
  root.querySelector('#edit')?.addEventListener('click', () => openEditor(cfg, entity, () => renderDetail(root, cfg, id, ctx)));
}

// ---------- Qarz to'lovi ----------

function openPayment(cfg, id, debt, onDone) {
  // Bitta oyna uchun bitta kalit: tugma ikki marta bosilsa ham to'lov bir marta yoziladi
  const key = newKey('pay');
  const { close, el } = openModal({
    title: cfg.payTitle,
    body: `<p class="small muted">Joriy qarz: <b>${money(debt)}</b></p>
      <div class="form-grid two" style="margin-top:12px;gap:10px">
        <label class="field"><span>Summa (so'm)</span><input class="input" id="pa" inputmode="decimal" value="${debt}"></label>
        <label class="field"><span>Usul</span>
          <select class="input" id="pm"><option value="cash">Naqd</option><option value="card">Karta</option><option value="transfer">O'tkazma</option></select></label>
      </div>
      <div id="perr" style="margin-top:10px"></div>`,
    foot: `<button class="btn btn-outline" type="button" data-no>Bekor</button>
           <button class="btn btn-success" type="button" data-yes>${icon('check', 'ico-sm')} Qabul qilish</button>`,
  });
  el.querySelector('[data-no]').addEventListener('click', close);
  el.querySelector('[data-yes]').addEventListener('click', (e) => {
    withBusy(e.currentTarget, async () => {
      const amount = Number(String(el.querySelector('#pa').value).replace(',', '.'));
      if (!(amount > 0)) {
        el.querySelector('#perr').innerHTML = '<div class="alert alert-warn">Summani kiriting</div>';
        return;
      }
      try {
        await post(cfg.payPath(id), { amount, method: el.querySelector('#pm').value, idempotency_key: key });
        close();
        toast("To'lov qabul qilindi", 'ok');
        onDone();
      } catch (err) {
        el.querySelector('#perr').innerHTML = `<div class="alert alert-bad">${esc(err.message)}</div>`;
      }
    });
  });
}

// ---------- Yaratish / tahrirlash ----------

function openEditor(cfg, existing, onSaved) {
  const isCustomer = cfg.key === 'customers';
  const { close, el } = openModal({
    title: existing ? `${cfg.singular}ni tahrirlash` : `Yangi ${cfg.singular.toLowerCase()}`,
    body: `
      <form id="pf" class="form-grid" novalidate>
        <label class="field"><span>Ism / nomi *</span>
          <input class="input" name="name" required maxlength="150" value="${esc(existing?.name || '')}"></label>
        <label class="field"><span>Telefon</span>
          <input class="input" name="phone" inputmode="tel" maxlength="30" placeholder="+998 90 123 45 67" value="${esc(existing?.phone || '')}"></label>
        ${isCustomer
    ? `<label class="field"><span>Izoh</span><input class="input" name="note" maxlength="300" value="${esc(existing?.note || '')}"></label>`
    : `<label class="field"><span>Manzil</span><input class="input" name="address" maxlength="200" value="${esc(existing?.address || '')}"></label>`}
        <div id="ferr"></div>
      </form>`,
    foot: `<button class="btn btn-outline" type="button" data-no>Bekor</button>
           <button class="btn" type="submit" form="pf" data-yes>${icon('check', 'ico-sm')} Saqlash</button>`,
  });
  el.querySelector('[data-no]').addEventListener('click', close);
  el.querySelector('#pf').addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = readForm(e.currentTarget);
    if (!body.name) {
      el.querySelector('#ferr').innerHTML = '<div class="alert alert-bad">Nomini kiriting</div>';
      return;
    }
    try {
      const saved = existing
        ? await put(cfg.itemPath(existing.id), body)
        : await post(cfg.listPath, body);
      close();
      toast('Saqlandi', 'ok');
      onSaved(saved);
    } catch (err) {
      el.querySelector('#ferr').innerHTML = `<div class="alert alert-bad">${esc(err.message)}</div>`;
    }
  });
}
