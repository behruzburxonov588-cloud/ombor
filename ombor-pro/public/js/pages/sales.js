// Sotuv (POS): qidirish, shtrix-kod, savatcha, to'lov, chek, savdolar tarixi va qaytarish
import {
  resolvePeriod, periodPicker, bindPeriod, periodWord, periodQuery,
  get, post, icon, esc, num, money, dateTime, dateOnly, readForm, toast, errorToast,
  openModal, closeModal, withBusy, productThumb, emptyState, confirmBox, todayStr, productPhoto,
  groupBySize, priceRange,
} from '../ui.js';
import { openBarcodeScanner } from '../scanner.js';

const LS_KEY = 'ombor-pos-v3';
try { localStorage.removeItem('ombor-pos-v2'); } catch { /* xotira yopiq */ }
const METHODS = [
  { key: 'cash', label: 'Naqd', ico: 'money' },
  { key: 'card', label: 'Karta', ico: 'card' },
  { key: 'transfer', label: "O'tkazma", ico: 'transfer' },
  { key: 'credit', label: 'Nasiya (qarzga)', ico: 'credit' },
  { key: 'mixed', label: "Bir nechta usul", ico: 'split' },
];

const newKey = () => `pos-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

// Savatcha har bir foydalanuvchi uchun alohida saqlanadi (login butun tizimda yagona):
// bitta qurilmada boshqa do'kon yoki boshqa kassir kirsa, oldingi savatcha aralashmaydi
const lsKey = (owner) => `${LS_KEY}:${owner || ''}`;

function loadState(owner = '') {
  try {
    const raw = localStorage.getItem(lsKey(owner));
    if (raw) {
      const s = JSON.parse(raw);
      if (s && s.key && Array.isArray(s.cart)) return { ...s, owner };
    }
  } catch {
    // buzilgan saqlangan ma'lumot e'tiborga olinmaydi
  }
  return { cart: [], customer: null, method: 'cash', mixed: { cash: '', card: '', transfer: '', credit: '' }, dueDate: '', key: newKey(), owner };
}

let S = loadState('');
let C = null; // joriy kontekst
let products = [];
const detailCache = new Map();
let cartModal = null; // mobil uchun savatcha oynasi (modal)

function save() {
  try {
    localStorage.setItem(lsKey(S.owner), JSON.stringify(S));
  } catch {
    // saqlash imkoni bo'lmasa ham sotuv ishlaydi
  }
}

function factorOf(line) {
  if (line.unit_id === line.base_unit_id) return 1;
  const c = line.conv.find((x) => x.unit_id === line.unit_id);
  return c ? Number(c.factor) : 1;
}

function calc(line) {
  const f = factorOf(line);
  const base = Math.round(Number(line.qty || 0) * f * 10000) / 10000;
  const gross = Math.round(base * Number(line.price) * 100) / 100;
  const discount = Math.min(Number(line.discount || 0), gross);
  const total = Math.round((gross - discount) * 100) / 100;
  return { f, base, gross, discount, total, over: base > Number(line.stock) + 1e-9 };
}

function totals() {
  let gross = 0;
  let discount = 0;
  let total = 0;
  let problem = null;
  for (const l of S.cart) {
    const c = calc(l);
    gross += c.gross;
    discount += c.discount;
    total += c.total;
    if (c.over && !problem) problem = `"${l.name}" qoldig'i yetarli emas (mavjud: ${num(l.stock, 4)} ${l.base_unit_name})`;
    if (!(Number(l.qty) > 0) && !problem) problem = `"${l.name}" miqdorini kiriting`;
  }
  return { gross: round(gross), discount: round(discount), total: round(total), problem };
}

const round = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

function mixedSum() {
  const m = S.mixed;
  return round(Number(m.cash || 0) + Number(m.card || 0) + Number(m.transfer || 0) + Number(m.credit || 0));
}

function payValidity(t) {
  if (S.cart.length === 0) return 'Savatcha bo\'sh';
  if (t.problem) return t.problem;
  if (S.method === 'credit' && !S.customer) return 'Nasiyaga sotish uchun mijozni tanlang';
  if (S.method === 'mixed') {
    if (Math.abs(mixedSum() - t.total) > 0.005) return `Aralash to'lov jami summaga teng bo'lishi kerak (qolgan: ${num(round(t.total - mixedSum()))})`;
    if (Number(S.mixed.credit || 0) > 0 && !S.customer) return 'Nasiya qismi uchun mijozni tanlang';
  }
  return null;
}

async function productDetail(id) {
  if (!detailCache.has(id)) {
    const r = await get(`/products/${id}`);
    detailCache.set(id, r.product);
  }
  return detailCache.get(id);
}

async function addProduct(p, qtyDelta = 1) {
  const d = await productDetail(p.id);
  if (Number(d.stock_qty) <= 0) throw new Error(`"${d.name}" tugagan`);
  let line = S.cart.find((l) => l.pid === d.id && l.unit_id === d.base_unit_id);
  if (!line) {
    line = {
      pid: d.id, name: d.name, base_unit_id: d.base_unit_id, base_unit_name: d.base_unit_name,
      unit_id: d.base_unit_id, unit_name: d.base_unit_name, conv: d.conversions || [],
      qty: 0, price: Number(d.selling_price), discount: 0, stock: Number(d.stock_qty), image_path: d.image_path,
    };
    S.cart.push(line);
  }
  line.qty = round4(Number(line.qty) + qtyDelta);
  line.stock = Number(d.stock_qty);
  line.price = Number(d.selling_price);
  if (calc(line).over) {
    line.qty = round4(line.qty - qtyDelta);
    throw new Error(`"${d.name}" qoldig'i yetarli emas`);
  }
  save();
  refreshAll();
  return line;
}

const round4 = (n) => Math.round((Number(n) + Number.EPSILON) * 10000) / 10000;

function setMethod(m) {
  S.method = m;
  if (m !== 'mixed') S.mixed = { cash: '', card: '', transfer: '', credit: '' };
  save();
  refreshAll();
}

// ---------- Savatcha ko'rinishi ----------

function cartHtml(ctx) {
  const t = totals();
  const canDiscount = ctx.can('sales.discount');
  const lines = S.cart.length
    ? S.cart.map((l, i) => {
      const c = calc(l);
      const unitOptions = [{ unit_id: l.base_unit_id, name: l.base_unit_name, factor: 1 }, ...l.conv]
        .map((u) => `<option value="${u.unit_id}" ${u.unit_id === l.unit_id ? 'selected' : ''}>${esc(u.name)}</option>`).join('');
      return `
        <div class="cart-line" data-line="${i}">
          <div class="top">
            <div class="grow"><div class="name">${esc(l.name)}</div>
              <div class="small muted">${num(c.f * Number(l.price), 2)} so'm / ${esc(l.unit_name)} · qoldiq ${num(l.stock, 4)} ${esc(l.base_unit_name)}</div></div>
            <button class="cart-x" type="button" data-remove="${i}" aria-label="${esc(l.name)}ni savatchadan olib tashlash">${icon('x', 'ico-sm')}<span>Olib tashlash</span></button>
          </div>
          <div class="row" style="justify-content:space-between">
            <div class="qty-ctrl" aria-label="Miqdor">
              <button type="button" data-step="${i}" data-d="-1" aria-label="${Number(l.qty) <= 1 ? 'Savatchadan olib tashlash' : 'Kamaytirish'}">${Number(l.qty) <= 1 ? icon('x', 'ico-sm') : '−'}</button>
              <input type="text" inputmode="decimal" value="${String(round4(l.qty)).replace('.', ',')}" data-qty="${i}" aria-label="Miqdor">
              <button type="button" data-step="${i}" data-d="1" aria-label="Ko'paytirish">+</button>
            </div>
            <select class="input" style="width:auto;min-width:130px;min-height:48px" data-unit="${i}" aria-label="Birlik">${unitOptions}</select>
          </div>
          ${canDiscount ? `<div class="row small"><label class="grow" style="display:flex;gap:8px;align-items:center">Chegirma (so'm)
              <input class="input" style="min-height:42px;max-width:150px" type="text" inputmode="decimal" value="${l.discount ? num(l.discount, 2) : ''}" placeholder="0" data-disc="${i}"></label></div>` : ''}
          <div class="between"><span class="small muted">${num(c.base, 4)} ${esc(l.base_unit_name)}${c.discount ? ` · chegirma −${num(c.discount)}` : ''}</span>
            <span class="num" style="font-weight:800">${money(c.total)}</span></div>
          ${c.over ? '<div class="small red" style="font-weight:700">Qoldiq yetarli emas</div>' : ''}
        </div>`;
    }).join('')
    : emptyState("Savatcha bo'sh. Tovarni bosing: u shu yerga tushadi. Adashsangiz, tovar ustidagi «−» ni bosing.", 'cart');

  const cust = S.customer
    ? `<div class="alert alert-info" style="align-items:center"><div class="grow"><b>${esc(S.customer.name)}</b>
         <div class="small">Joriy qarz: ${money(S.customer.debt)}</div></div>
         <button class="btn btn-sm btn-outline" type="button" data-cust>O'zgartirish</button>
         <button class="btn btn-sm btn-ghost" type="button" data-cust-clear aria-label="Mijozni olib tashlash">${icon('minus', 'ico-sm')}</button></div>`
    : `<button class="btn btn-outline btn-block" type="button" data-cust>${icon('users', 'ico-sm')} Mijoz tanlash (ixtiyoriy)</button>`;

  const pay = S.method === 'mixed'
    ? `<div class="form-grid two" style="gap:8px">
        ${['cash', 'card', 'transfer', 'credit'].map((k) => `
          <label class="field"><span>${{ cash: 'Naqd', card: 'Karta', transfer: "O'tkazma", credit: 'Nasiya' }[k]}</span>
            <input class="input" type="text" inputmode="decimal" data-mixed="${k}" value="${S.mixed[k] ?? ''}" placeholder="0"></label>`).join('')}
        <div class="small" data-mixed-left style="grid-column:1/-1;font-weight:700">${mixedLeftText(t.total)}</div>
      </div>`
    : '';

  const dueRow = S.method === 'credit' || (S.method === 'mixed' && Number(S.mixed.credit || 0) > 0)
    ? `<label class="field"><span>To'lov muddati (ixtiyoriy)</span><input class="input" type="date" data-due value="${esc(S.dueDate)}"></label>`
    : '';

  const reason = payValidity(t);
  return `
    <div class="card-head"><h2>Savatcha</h2><span class="badge badge-info">${S.cart.length} ta tovar</span></div>
    <div class="stack" style="max-height:none">${lines}</div>
    ${S.cart.length ? `
      <div style="margin-top:12px">${cust}</div>
      <div class="stack" style="margin-top:12px">${pay}${dueRow}</div>
      <button class="btn btn-ghost btn-block" type="button" data-clear style="margin-top:6px">Savatchani butunlay tozalash</button>
      <div class="cart-foot">
        ${t.discount ? `<div class="between small"><span class="muted">Tovarlar ${money(t.gross)}, chegirma</span><span class="num red">−${money(t.discount)}</span></div>` : ''}
        <div class="between"><span style="font-weight:700">Jami</span><span class="big num">${money(t.total)}</span></div>
        <div class="pay-row" role="group" aria-label="Xaridor qanday to'laydi">${METHODS.map((m) => `<button type="button" data-method="${m.key}" class="${S.method === m.key ? 'active' : ''}" aria-pressed="${S.method === m.key}">${icon(m.ico)}<span>${m.label}</span></button>`).join('')}</div>
        ${reason ? `<div class="small amber" style="font-weight:650">${esc(reason)}</div>` : ''}
        <button class="btn btn-success btn-lg btn-block" type="button" data-checkout ${reason ? 'disabled' : ''}>
          ${icon('check')} Sotish · ${money(t.total)}
        </button>
      </div>
    ` : ''}`;
}

function mixedLeftText(total) {
  const left = round(total - mixedSum());
  if (Math.abs(left) < 0.005) return '<span class="green">To\'liq taqsimlandi</span>';
  return left > 0 ? `<span class="amber">Qolgan: ${num(left)} so'm</span>` : `<span class="red">Ortiqcha: ${num(-left)} so'm</span>`;
}

function mountCart(el, ctx) {
  el.innerHTML = cartHtml(ctx);
  el.querySelectorAll('[data-step]').forEach((b) => b.addEventListener('click', () => {
    const i = Number(b.dataset.step);
    const l = S.cart[i];
    const next = round4(Number(l.qty) + Number(b.dataset.d));
    if (next <= 0) { // 1 tadan kamaytirsa — savatchadan chiqadi
      S.cart.splice(i, 1);
      save();
      refreshAll();
      return;
    }
    l.qty = next;
    if (calc(l).over) { toast(`"${l.name}" qoldig'i yetarli emas`, 'warn'); return; }
    save();
    refreshAll();
  }));
  el.querySelectorAll('[data-qty]').forEach((inp) => inp.addEventListener('change', () => {
    const i = Number(inp.dataset.qty);
    const l = S.cart[i];
    const v = Number(String(inp.value).replace(',', '.'));
    if (!(v > 0)) { toast('Miqdor noldan katta bo\'lishi kerak', 'warn'); refreshAll(); return; }
    l.qty = round4(v);
    if (calc(l).over) toast(`"${l.name}" qoldig'i yetarli emas`, 'warn');
    save();
    refreshAll();
  }));
  el.querySelectorAll('[data-unit]').forEach((sel) => sel.addEventListener('change', () => {
    const l = S.cart[Number(sel.dataset.unit)];
    l.unit_id = Number(sel.value);
    l.unit_name = sel.options[sel.selectedIndex].text;
    save();
    refreshAll();
  }));
  el.querySelectorAll('[data-disc]').forEach((inp) => inp.addEventListener('change', () => {
    const l = S.cart[Number(inp.dataset.disc)];
    const v = Number(String(inp.value || '0').replace(',', '.'));
    if (!(v >= 0)) { toast("Chegirma noto'g'ri", 'warn'); refreshAll(); return; }
    l.discount = v;
    if (calc(l).discount < v) toast('Chegirma summadan katta bo\'lishi mumkin emas', 'warn');
    save();
    refreshAll();
  }));
  el.querySelectorAll('[data-remove]').forEach((b) => b.addEventListener('click', () => {
    S.cart.splice(Number(b.dataset.remove), 1);
    save();
    refreshAll();
  }));
  el.querySelectorAll('[data-method]').forEach((b) => b.addEventListener('click', () => setMethod(b.dataset.method)));
  el.querySelectorAll('[data-mixed]').forEach((inp) => {
    inp.addEventListener('input', () => {
      S.mixed[inp.dataset.mixed] = inp.value;
      save();
      const left = el.querySelector('[data-mixed-left]');
      if (left) left.innerHTML = mixedLeftText(totals().total);
      const btn = el.querySelector('[data-checkout]');
      if (btn) btn.disabled = Boolean(payValidity(totals()));
    });
    inp.addEventListener('change', () => refreshAll());
  });
  el.querySelector('[data-due]')?.addEventListener('change', (e) => {
    S.dueDate = e.target.value;
    save();
  });
  el.querySelectorAll('[data-cust]').forEach((b) => b.addEventListener('click', () => pickCustomer(ctx)));
  el.querySelector('[data-cust-clear]')?.addEventListener('click', () => {
    S.customer = null;
    save();
    refreshAll();
  });
  el.querySelector('[data-clear]')?.addEventListener('click', async () => {
    if (await confirmBox('Savatchadagi hamma mahsulotlar o\'chirilsinmi?', { okText: 'Ha, tozalash', danger: true })) {
      S = { cart: [], customer: null, method: 'cash', mixed: { cash: '', card: '', transfer: '', credit: '' }, dueDate: '', key: newKey() };
      save();
      refreshAll();
    }
  });
  el.querySelector('[data-checkout]')?.addEventListener('click', (e) => checkout(e.currentTarget, ctx));
}

function refreshAll() {
  const aside = document.getElementById('cart-panel');
  if (aside && C) mountCart(aside, C.ctx);
  if (cartModal && cartModal.isConnected) mountCart(cartModal, C.ctx);
  const bar = document.getElementById('cartbar');
  if (bar) {
    const t = totals();
    bar.hidden = S.cart.length === 0 || window.matchMedia('(min-width: 720px)').matches;
    bar.querySelector('[data-count]').textContent = S.cart.length;
    bar.querySelector('[data-total]').textContent = money(t.total);
  }
  const badge = document.getElementById('grid-selected');
  if (badge) badge.textContent = `${S.cart.length} ta tovar savatchada`;
  syncTiles();
}

// Plitkalardagi «nechta tanlandi» belgisi va yashil chegara savatcha bilan doim bir xil
function syncTiles() {
  document.querySelectorAll('#grid [data-model]').forEach((tile) => {
    const g = C?.groups?.get(tile.dataset.model);
    if (!g) return;
    const ids = new Set(g.items.map((v) => v.id));
    const n = S.cart.filter((l) => ids.has(l.pid)).reduce((sum, l) => sum + Number(l.qty), 0);
    tile.classList.toggle('in-cart', n > 0);
    const minus = tile.parentElement?.querySelector('[data-minus-model]');
    if (minus) minus.hidden = !(n > 0);
    let b = tile.querySelector('.qty-badge');
    if (n > 0) {
      if (!b) { b = document.createElement('span'); b.className = 'qty-badge'; tile.prepend(b); }
      b.textContent = num(n, 2);
    } else if (b) b.remove();
  });
  document.querySelectorAll('#grid [data-pid]').forEach((tile) => {
    const pid = Number(tile.dataset.pid);
    const n = S.cart.filter((l) => l.pid === pid).reduce((sum, l) => sum + Number(l.qty), 0);
    tile.classList.toggle('in-cart', n > 0);
    const minus = tile.parentElement?.querySelector('[data-minus]');
    if (minus) minus.hidden = !(n > 0);
    let b = tile.querySelector('.qty-badge');
    if (n > 0) {
      if (!b) {
        b = document.createElement('span');
        b.className = 'qty-badge';
        tile.prepend(b);
      }
      b.textContent = num(n, 2);
    } else if (b) b.remove();
  });
}

// ---------- Mijoz tanlash ----------

function pickCustomer(ctx) {
  let timer = null;
  const { close, el } = openModal({
    title: 'Mijozni tanlash',
    body: `<input class="input" id="cq" type="search" placeholder="Ism yoki telefon" autofocus>
           <div id="cres" style="margin-top:12px"></div>`,
    foot: `<button class="btn btn-light" type="button" id="cnew">${icon('plus', 'ico-sm')} Yangi mijoz</button>`,
  });
  const res = el.querySelector('#cres');
  const load = async (q) => {
    const r = await get(`/customers?q=${encodeURIComponent(q)}`);
    res.innerHTML = r.customers.length
      ? `<div class="list">${r.customers.map((c) => `
          <div class="list-item" data-pick="${c.id}">
            <div class="meta"><div class="name">${esc(c.name)}</div><div class="sub">${esc(c.phone || '')}</div></div>
            <div class="end"><div class="small muted">Qarz</div><div class="num ${Number(c.debt) > 0 ? 'amber' : ''}">${money(c.debt)}</div></div>
          </div>`).join('')}</div>`
      : '<div class="empty">Mijoz topilmadi</div>';
    res.querySelectorAll('[data-pick]').forEach((row) => row.addEventListener('click', () => {
      const c = r2(r.customers, row.dataset.pick);
      S.customer = { id: c.id, name: c.name, debt: Number(c.debt) };
      save();
      close();
      refreshAll();
    }));
  };
  const r2 = (list, id) => list.find((x) => String(x.id) === String(id));
  el.querySelector('#cq').addEventListener('input', (e) => {
    clearTimeout(timer);
    timer = setTimeout(() => load(e.target.value.trim()).catch(errorToast), 200);
  });
  load('').catch(errorToast);
  el.querySelector('#cnew').addEventListener('click', () => {
    const { close: c2, el: e2 } = openModal({
      title: 'Yangi mijoz',
      body: `<form id="nc" class="form-grid">
        <label class="field"><span>Ism familiya</span><input class="input" name="name" required maxlength="150"></label>
        <label class="field"><span>Telefon</span><input class="input" name="phone" inputmode="tel" maxlength="30" placeholder="+998 90 123 45 67"></label>
        </form>`,
      foot: `<button class="btn btn-outline" type="button" data-no>Bekor</button><button class="btn" type="submit" form="nc" data-yes>Saqlash</button>`,
    });
    e2.querySelector('[data-no]').addEventListener('click', () => c2());
    e2.querySelector('#nc').addEventListener('submit', async (ev) => {
      ev.preventDefault();
      try {
        const r = await post('/customers', readForm(ev.currentTarget));
        S.customer = { id: r.customer.id, name: r.customer.name, debt: 0 };
        save();
        c2();
        close();
        refreshAll();
        toast('Mijoz qo\'shildi', 'ok');
      } catch (err) {
        errorToast(err);
      }
    });
  });
}

// ---------- Sotuvni yakunlash ----------

async function checkout(btn, ctx) {
  const t = totals();
  const reason = payValidity(t);
  if (reason) { toast(reason, 'warn'); return; }
  const items = S.cart.map((l) => ({
    product_id: l.pid,
    unit_id: l.unit_id,
    quantity: Number(l.qty),
    discount: Number(l.discount || 0) || 0,
  }));
  const payment = { method: S.method };
  if (S.method === 'mixed') {
    payment.cash = Number(S.mixed.cash || 0);
    payment.card = Number(S.mixed.card || 0);
    payment.transfer = Number(S.mixed.transfer || 0);
    payment.credit = Number(S.mixed.credit || 0);
  }
  const body = {
    items,
    payment,
    customer_id: S.customer?.id ?? null,
    due_date: S.dueDate || null,
    idempotency_key: S.key,
  };
  await withBusy(btn, async () => {
    try {
      const r = await post('/sales', body);
      const sale = r.sale;
      const shown = { ...S };
      S = { cart: [], customer: null, method: 'cash', mixed: { cash: '', card: '', transfer: '', credit: '' }, dueDate: '', key: newKey() };
      save();
      detailCache.clear();
      if (cartModal && cartModal.isConnected) closeModal();
      refreshAll();
      loadProducts(C.query);
      showReceipt(sale, ctx, { fresh: true, shown });
    } catch (err) {
      if (err.status === 409 || err.status === 400 || err.status === 403) {
        toast(err.message, 'bad');
        detailCache.clear();
        refreshAll();
      } else {
        errorToast(err);
      }
    }
  });
}

// ---------- Chek ----------

function receiptText(sale, storeName) {
  const lines = [
    storeName,
    `Chek: ${sale.receipt_no}`,
    dateTime(sale.created_at),
    sale.customer_name ? `Mijoz: ${sale.customer_name}` : 'Naqd mijoz',
    '------------------------',
    ...sale.items.map((i) => `${i.product_name}\n  ${num(i.quantity, 4)} ${i.unit_name} x ${num(i.unit_price)} = ${num(i.line_total)}${Number(i.discount) ? ` (chegirma -${num(i.discount)})` : ''}`),
    '------------------------',
    `Jami: ${num(sale.total)} so'm`,
    Number(sale.discount_total) ? `Chegirma: -${num(sale.discount_total)} so'm` : null,
    Number(sale.paid_cash) ? `Naqd: ${num(sale.paid_cash)} so'm` : null,
    Number(sale.paid_card) ? `Karta: ${num(sale.paid_card)} so'm` : null,
    Number(sale.paid_transfer) ? `O'tkazma: ${num(sale.paid_transfer)} so'm` : null,
    Number(sale.balance_due) ? `Nasiya (qarz): ${num(sale.balance_due)} so'm` : null,
  ].filter((x) => x !== null);
  return lines.join('\n');
}

function receiptHtml(sale, storeName, footer, storeInfo = {}) {
  const rows = sale.items.map((i) => `
    <div class="i">${esc(i.product_name)}
      <div class="r"><span>${num(i.quantity, 4)} ${esc(i.unit_name)} x ${num(i.unit_price)}${Number(i.discount) ? ` (-${num(i.discount)})` : ''}</span><span>${num(i.line_total)}</span></div>
    </div>`).join('');
  const line = (label, value) => `<div class="r"><span>${label}</span><span>${value}</span></div>`;
  return `
    <div class="receipt">
      <h2>${esc(storeName)}</h2>
      ${storeInfo.address ? `<div class="c">${esc(storeInfo.address)}</div>` : ''}
      ${storeInfo.phone ? `<div class="c">${esc(storeInfo.phone)}</div>` : ''}
      <hr>
      ${line('Chek', esc(sale.receipt_no))}
      ${line('Sana', esc(dateTime(sale.created_at)))}
      ${line('Kassir', esc(sale.cashier_name || ''))}
      ${line('Mijoz', esc(sale.customer_name || 'Naqd mijoz'))}
      <hr>
      ${rows}
      <hr>
      ${Number(sale.discount_total) ? line('Yalpi', num(sale.gross_total)) : ''}
      ${Number(sale.discount_total) ? line('Chegirma', `-${num(sale.discount_total)}`) : ''}
      <div class="r b"><span>JAMI</span><span>${num(sale.total)} so'm</span></div>
      ${Number(sale.paid_cash) ? line('Naqd', num(sale.paid_cash)) : ''}
      ${Number(sale.paid_card) ? line('Karta', num(sale.paid_card)) : ''}
      ${Number(sale.paid_transfer) ? line("O'tkazma", num(sale.paid_transfer)) : ''}
      ${Number(sale.balance_due) ? line('Nasiya (qarz)', num(sale.balance_due)) : ''}
      ${sale.due_date ? line("To'lov muddati", dateOnly(sale.due_date)) : ''}
      <hr>
      <div class="c">${esc(footer || '')}</div>
    </div>`;
}

async function showReceipt(sale, ctx, opts = {}) {
  const s = await get('/settings').then((r) => r.settings).catch(() => ctx.settings);
  const full = sale.items ? sale : (await get(`/sales/${sale.id}`)).sale;
  const storeInfo = { phone: s.store_phone, address: s.store_address };
  const html = receiptHtml(full, s.store_name, s.receipt_footer, storeInfo);
  const { close, el } = openModal({
    title: opts.fresh ? 'Sotuv yakunlandi' : `Chek ${full.receipt_no}`,
    body: `<div class="alert alert-info" style="margin-bottom:12px">${icon('check', 'ico-sm')}<div>Chek: <b>${esc(full.receipt_no)}</b> · jami <b>${money(full.total)}</b>${Number(full.balance_due) ? ` · qarz <b>${money(full.balance_due)}</b>` : ''}</div></div>
           <div id="print-area">${html}</div>`,
    foot: `<button class="btn btn-outline" type="button" data-print>${icon('print', 'ico-sm')} Chop etish</button>
           <button class="btn btn-light" type="button" data-share>${icon('share', 'ico-sm')} Ulashish</button>
           <button class="btn" type="button" data-done>${opts.fresh ? 'Yangi savdo' : 'Yopish'}</button>`,
  });
  el.querySelector('[data-print]').addEventListener('click', () => window.print());
  el.querySelector('[data-share]').addEventListener('click', async () => {
    const text = receiptText(full, s.store_name);
    try {
      if (navigator.share) await navigator.share({ title: `Chek ${full.receipt_no}`, text });
      else {
        await navigator.clipboard.writeText(text);
        toast('Chek matni nusxalandi', 'ok');
      }
    } catch {
      // foydalanuvchi ulashishni bekor qildi
    }
  });
  el.querySelector('[data-done]').addEventListener('click', () => {
    close();
    if (opts.fresh) refreshAll();
  });
}

// ---------- Mahsulotlar ro'yxati ----------

function gridHtml(list) {
  if (!list.length) return emptyState('Mahsulot topilmadi', 'box');
  const items = groupBySize(list);
  C.groups = new Map(items.filter((x) => x.group).map((g) => [g.model_name, g]));
  return items.map((p) => {
    if (p.group) return modelTile(p);
    const inCart = S.cart.filter((l) => l.pid === p.id).reduce((s, l) => s + Number(l.qty), 0);
    const out = Number(p.stock_qty) <= 0;
    return `<div class="pwrap">
      <button class="pcard ${inCart > 0 ? 'in-cart' : ''}" type="button" data-pid="${p.id}" ${out ? 'disabled' : ''} aria-label="${esc(p.name)}: savatchaga qo'shish">
        ${inCart > 0 ? `<span class="qty-badge">${num(inCart, 2)}</span>` : ''}
        ${productPhoto(p, 'pcard-img')}
        <div class="pname">${esc(p.name)}</div>
        <div class="pprice">${num(p.selling_price)} <span class="small muted">so'm/${esc(p.base_unit_name)}</span></div>
        <div class="pstock">${out ? '<span class="red" style="font-weight:700">Tugagan</span>' : `Qoldiq: ${num(p.stock_qty, 3)} ${esc(p.base_unit_name)}`}</div>
      </button>
      <button class="pcard-minus" type="button" data-minus="${p.id}" aria-label="${esc(p.name)}: bittaga kamaytirish yoki olib tashlash" ${inCart > 0 ? '' : 'hidden'}>${icon('minus')}</button>
    </div>`;
  }).join('');
}

// O'lchamli tovar plitkasi: o'lchamlar va har biridan nechta qolgani ko'rinadi, bosilganda o'lcham tanlanadi
function modelTile(g) {
  const ids = new Set(g.items.map((v) => v.id));
  const inCart = S.cart.filter((l) => ids.has(l.pid)).reduce((s, l) => s + Number(l.qty), 0);
  const out = g.status === 'out';
  return `<div class="pwrap">
      <button class="pcard ${inCart > 0 ? 'in-cart' : ''}" type="button" data-model="${esc(g.model_name)}" ${out ? 'disabled' : ''} aria-label="${esc(g.name)}: o'lchamini tanlash">
        ${inCart > 0 ? `<span class="qty-badge">${num(inCart, 2)}</span>` : ''}
        ${productPhoto(g.items[0], 'pcard-img')}
        <div class="pname">${esc(g.name)}</div>
        <div class="pprice">${priceRange(g)}</div>
        <div class="szs">${g.items.map((v) => `<span class="sz${Number(v.stock_qty) <= 0 ? ' out' : ''}"><i>${esc(v.variant_label)}</i><b>${num(v.stock_qty, 3)}</b></span>`).join('')}</div>
      </button>
      <button class="pcard-minus" type="button" data-minus-model="${esc(g.model_name)}" aria-label="${esc(g.name)}: oxirgi qo'shilganini olib tashlash" ${inCart > 0 ? '' : 'hidden'}>${icon('minus')}</button>
    </div>`;
}

// O'lcham tanlash oynasi: o'lchamni bosish — savatchaga 1 ta qo'shadi (bir nechta o'lcham olish mumkin)
function openSizePick(g) {
  const count = (id) => S.cart.filter((l) => l.pid === id).reduce((s, l) => s + Number(l.qty), 0);
  const { el, close } = openModal({
    title: g.name,
    body: `<p class="muted" style="margin:0 0 12px">Xaridor qaysi o'lchamni oladi? Bosing. Bir nechta o'lcham olsa, har birini bosing.</p>
      <div class="size-pick">${g.items.map((v) => {
        const out = Number(v.stock_qty) <= 0;
        return `<button type="button" class="szp${out ? ' out' : ''}" data-vid="${v.id}" ${out ? 'disabled' : ''} aria-label="${esc(v.variant_label)} o'lchami">
          <b>${esc(v.variant_label)}</b><span>${out ? 'Tugagan' : `${num(v.stock_qty, 3)} ta bor`}</span>
          <em data-c="${v.id}"${count(v.id) ? '' : ' hidden'}>${num(count(v.id), 2)}</em></button>`;
      }).join('')}</div>
      <button class="btn btn-lg btn-block" type="button" data-done style="margin-top:14px">${icon('check')} Tayyor</button>`,
  });
  el.querySelectorAll('[data-vid]').forEach((b) => b.addEventListener('click', async () => {
    const v = g.items.find((x) => String(x.id) === b.dataset.vid);
    try {
      await addProduct(v, 1);
      const c = el.querySelector(`[data-c="${v.id}"]`);
      c.hidden = false;
      c.textContent = num(count(v.id), 2);
      b.classList.remove('added');
      void b.offsetWidth;
      b.classList.add('added');
      if (navigator.vibrate) navigator.vibrate(12);
    } catch (err) { errorToast(err); }
  }));
  el.querySelector('[data-done]').addEventListener('click', close);
}

// Plitka ustidagi «−»: oxirgi qo'shilgan qatordan bittasini kamaytiradi, qolmasa savatchadan chiqaradi
function removeOne(pid, ids = null) {
  for (let i = S.cart.length - 1; i >= 0; i -= 1) {
    const l = S.cart[i];
    if (ids ? !ids.has(l.pid) : l.pid !== pid) continue;
    const next = round4(Number(l.qty) - 1);
    if (next <= 0) S.cart.splice(i, 1);
    else l.qty = next;
    save();
    refreshAll();
    if (navigator.vibrate) navigator.vibrate(8);
    return;
  }
}

function bindGrid() {
  document.querySelectorAll('#grid [data-minus]').forEach((b) => b.addEventListener('click', (e) => {
    e.stopPropagation();
    removeOne(Number(b.dataset.minus));
  }));
  document.querySelectorAll('#grid [data-minus-model]').forEach((b) => b.addEventListener('click', (e) => {
    e.stopPropagation();
    const g = C.groups?.get(b.dataset.minusModel);
    if (g) removeOne(null, new Set(g.items.map((v) => v.id)));
  }));
  document.querySelectorAll('#grid [data-model]').forEach((b) => b.addEventListener('click', () => {
    const g = C.groups?.get(b.dataset.model);
    if (g) openSizePick(g);
  }));
  document.querySelectorAll('[data-pid]').forEach((b) => b.addEventListener('click', async () => {
    const p = products.find((x) => String(x.id) === b.dataset.pid);
    if (!p) return;
    try {
      await addProduct(p, 1);
      // Xabar o'rniga: plitka bir lahza yonadi va pastdagi «Savatcha» tugmasi silkinadi
      const tile = document.querySelector(`#grid [data-pid="${p.id}"]`);
      tile?.classList.remove('added');
      void tile?.offsetWidth;
      tile?.classList.add('added');
      const bar = document.getElementById('cartbar');
      bar?.classList.remove('bump');
      void bar?.offsetWidth;
      bar?.classList.add('bump');
      if (navigator.vibrate) navigator.vibrate(12);
    } catch (err) {
      errorToast(err);
    }
  }));
}

async function loadProducts(q = '') {
  const r = await get(`/products?q=${encodeURIComponent(q)}`);
  products = r.products;
  // Turkumlar ro'yxati — birinchi (qidiruvsiz) yuklashda olinadi
  if (!q) {
    const seen = new Map();
    for (const p of products) if (p.category_id && !seen.has(p.category_id)) seen.set(p.category_id, p.category_name);
    C.cats = [...seen.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
    drawCats();
  }
  drawGrid();
}

function drawGrid() {
  const grid = document.getElementById('grid');
  if (!grid) return;
  const list = C.cat ? products.filter((p) => String(p.category_id) === String(C.cat)) : products;
  grid.innerHTML = gridHtml(list);
  bindGrid();
}

// Turkum tugmalari: Hammasi, Ichimliklar, Oziq-ovqat, ...
function drawCats() {
  const box = document.getElementById('pcats');
  if (!box) return;
  if (!C.cats || !C.cats.length) { box.hidden = true; return; }
  box.hidden = false;
  box.innerHTML = [{ id: '', name: 'Hammasi' }, ...C.cats].map((c) => `<button type="button" class="chip ${String(C.cat || '') === String(c.id) ? 'active' : ''}" data-cat="${c.id}">${esc(c.name)}</button>`).join('');
  box.querySelectorAll('[data-cat]').forEach((b) => b.addEventListener('click', () => {
    C.cat = b.dataset.cat;
    box.querySelectorAll('[data-cat]').forEach((x) => x.classList.toggle('active', x === b));
    drawGrid();
  }));
}

async function addByBarcode(code) {
  const r = await get(`/products/barcode/${encodeURIComponent(code)}`);
  const p = r.product;
  await addProduct({ id: p.id }, 1);
  toast(`${p.name} savatga qo'shildi`, 'ok');
}

// ---------- Kamera orqali shtrix-kod ----------

function openScanner() {
  openBarcodeScanner((code) => {
    addByBarcode(code).catch(errorToast);
  });
}

// ---------- Savdolar tarixi va qaytarish ----------

async function renderHistory(root, ctx, query = {}) {
  const range = resolvePeriod(query, 'today');
  const r = await get(`/sales?from=${range.from}&to=${range.to}&limit=500`);
  const all = r.sales;
  const word = periodWord(range);
  let q = '';
  let pay = '';
  let cashier = '';
  const cashiers = [...new Set(all.map((x) => x.cashier_name).filter(Boolean))];

  root.innerHTML = `
    <div class="page-head">
      <div><h1>Savdolar tarixi</h1><p class="muted">${esc(word)} · barcha cheklar, qaytarish va chekni qayta chiqarish</p></div>
      <div class="filterbar">
        ${periodPicker(range)}
        ${ctx.can('sales.create') ? `<a class="btn btn-sm" href="#/sales">${icon('plus', 'ico-sm')} Yangi sotuv</a>` : ''}
      </div>
    </div>
    <div class="sum-row" id="sum"></div>
    ${all.length >= 500 ? '<div class="alert alert-info" style="margin:12px 0">Ro\'yxatda oxirgi 500 ta chek ko\'rsatildi (yuqoridagi jami — butun davr bo\'yicha). Boshqalarini ko\'rish uchun davrni qisqartiring.</div>' : ''}
    <div class="card" style="margin-top:14px">
      <div class="list-tools">
        <div class="search-input">${icon('search', 'ico-sm')}<input class="input" id="hq" type="search" placeholder="Chek raqami yoki mijoz ismi" autocomplete="off"></div>
        <div class="chips" id="hpay">
          ${[['', 'Hammasi'], ['cash', 'Naqd'], ['card', 'Karta'], ['transfer', "O'tkazma"], ['credit', 'Nasiya'], ['mixed', 'Aralash']]
            .map(([k, l]) => `<button type="button" class="chip ${k === '' ? 'active' : ''}" data-pay="${k}">${l}</button>`).join('')}
        </div>
        ${cashiers.length > 1 ? `<select class="input input-sm" id="hcash" aria-label="Sotuvchi" style="max-width:200px"><option value="">Barcha sotuvchilar</option>${cashiers.map((c) => `<option>${esc(c)}</option>`).join('')}</select>` : ''}
      </div>
      <div id="hlist"></div>
    </div>`;

  const draw = () => {
    const text = q.toLowerCase();
    const rows = all.filter((s) => (!pay || s.payment_method === pay)
      && (!cashier || s.cashier_name === cashier)
      && (!text || s.receipt_no.toLowerCase().includes(text) || (s.customer_name || '').toLowerCase().includes(text)));
    // Filtr yo'q bo'lsa — butun davr bo'yicha server hisoblagan jami (500 ta cheklovidan qat'i nazar)
    const whole = !q && !pay && !cashier && r.totals;
    const count = whole ? r.totals.count : rows.length;
    const net = whole ? r.totals.net : rows.reduce((sum, x) => sum + Number(x.total) - Number(x.refunded_total || 0), 0);
    const debt = whole ? r.totals.debt : rows.reduce((sum, x) => sum + Number(x.balance_due || 0), 0);
    const returned = whole ? r.totals.refunded : rows.reduce((sum, x) => sum + Number(x.refunded_total || 0), 0);
    root.querySelector('#sum').innerHTML = `
      <div class="sum-cell"><span>Cheklar</span><b>${count} ta</b></div>
      <div class="sum-cell"><span>Savdo summasi</span><b>${money(net)}</b><small>qaytarishlar ayirilgan</small></div>
      <div class="sum-cell"><span>O'rtacha chek</span><b>${money(count ? net / count : 0)}</b></div>
      <div class="sum-cell ${debt > 0 ? 'warn' : ''}"><span>Nasiyada qolgan</span><b>${money(debt)}</b>${returned > 0 ? `<small>qaytarilgan ${money(returned)}</small>` : ''}</div>`;
    root.querySelector('#hlist').innerHTML = rows.length ? `<div class="table-wrap cards"><table>
        <thead><tr><th>Chek</th><th>Vaqt</th><th>Mijoz</th><th>Sotuvchi</th><th>To'lov</th><th class="right">Summa</th><th>Holat</th><th></th></tr></thead>
        <tbody>${rows.map((s) => `
          <tr class="clickable" data-view="${s.id}">
            <td data-label="Chek"><b>${esc(s.receipt_no)}</b></td>
            <td data-label="Vaqt">${dateTime(s.created_at)}</td>
            <td data-label="Mijoz">${esc(s.customer_name || 'Oddiy xaridor')}</td>
            <td data-label="Sotuvchi">${esc(s.cashier_name || '—')}</td>
            <td data-label="To'lov">${esc(payLabel(s.payment_method))}</td>
            <td data-label="Summa" class="right num"><b>${money(s.total)}</b>${Number(s.balance_due) ? `<div class="small amber">qarz ${num(s.balance_due)}</div>` : ''}</td>
            <td data-label="Holat">${s.status === 'completed' ? '<span class="badge badge-ok">Yakunlangan</span>' : s.status === 'returned' ? '<span class="badge badge-muted">Qaytarilgan</span>' : '<span class="badge badge-low">Qisman qaytarilgan</span>'}</td>
            <td class="no-label" style="text-align:right;white-space:nowrap">
              <button class="btn btn-sm btn-light" type="button" data-view="${s.id}">Chek</button>
              ${ctx.can('sales.return') && s.status !== 'returned' ? `<button class="btn btn-sm btn-outline" type="button" data-return="${s.id}">Qaytarish</button>` : ''}
            </td>
          </tr>`).join('')}
        </tbody></table></div>`
      : emptyState(all.length ? 'Bu filtr bo\'yicha savdo topilmadi' : `${word} savdo bo'lmagan`, 'cart');
  };
  draw();

  bindPeriod(root, (next) => ctx.go(`#/sales/history?${periodQuery(next)}`));
  root.querySelector('#hq').addEventListener('input', (e) => { q = e.target.value.trim(); draw(); });
  root.querySelector('#hpay').addEventListener('click', (e) => {
    const b = e.target.closest('[data-pay]');
    if (!b) return;
    pay = b.dataset.pay;
    root.querySelectorAll('#hpay [data-pay]').forEach((x) => x.classList.toggle('active', x === b));
    draw();
  });
  root.querySelector('#hcash')?.addEventListener('change', (e) => { cashier = e.target.value; draw(); });
  root.querySelector('#hlist').addEventListener('click', (e) => {
    const ret = e.target.closest('[data-return]');
    if (ret) {
      e.stopPropagation();
      openReturn(Number(ret.dataset.return), ctx, () => renderHistory(root, ctx, query)).catch(errorToast);
      return;
    }
    const v = e.target.closest('[data-view]');
    if (v) showReceipt({ id: v.dataset.view }, ctx);
  });
}

function payLabel(m) {
  return { cash: 'Naqd', card: 'Karta', transfer: "O'tkazma", credit: 'Nasiya', mixed: 'Aralash' }[m] || m;
}

async function openReturn(saleId, ctx, done) {
  const { sale } = await get(`/sales/${saleId}`);
  const rows = sale.items.map((i) => {
    const remaining = round4(Number(i.base_quantity) - Number(i.returned_base_qty)) / Number(i.factor);
    return { ...i, remainingUnits: round4(remaining) };
  }).filter((i) => i.remainingUnits > 0);
  if (!rows.length) { toast('Bu savdodagi mahsulotlar allaqachon qaytarilgan', 'warn'); return; }
  const { close, el } = openModal({
    title: `Qaytarish · ${sale.receipt_no}`,
    body: `
      <p class="small muted" style="margin-bottom:10px">Qaytariladigan miqdorni kiriting. Nasiya qarz avval kamayadi, qolgani pul sifatida qaytariladi.</p>
      <div class="stack">${rows.map((i) => `
        <div class="card" style="padding:12px;box-shadow:none;border:1px solid var(--line)">
          <div class="between"><b>${esc(i.product_name)}</b><span class="small muted">qolgan: ${num(i.remainingUnits, 4)} ${esc(i.unit_name)}</span></div>
          <label class="field" style="margin-top:8px"><span>Qaytarish miqdori (${esc(i.unit_name)})</span>
            <input class="input" type="text" inputmode="decimal" data-ret="${i.id}" value="0"></label>
        </div>`).join('')}
      </div>
      <label class="field" style="margin-top:12px"><span>Pul qaytarish usuli</span>
        <select class="input" name="refund"><option value="cash">Naqd</option><option value="card">Karta</option><option value="transfer">O'tkazma</option></select></label>
      <div id="ret-err" style="margin-top:10px"></div>`,
    foot: `<button class="btn btn-outline" type="button" data-no>Bekor</button><button class="btn btn-danger" type="button" data-yes>Qaytarishni tasdiqlash</button>`,
  });
  el.querySelector('[data-no]').addEventListener('click', close);
  el.querySelector('[data-yes]').addEventListener('click', async (e) => {
    const items = [...el.querySelectorAll('[data-ret]')]
      .map((inp) => ({ sale_item_id: Number(inp.dataset.ret), quantity: Number(String(inp.value).replace(',', '.')) }))
      .filter((x) => x.quantity > 0);
    if (!items.length) { el.querySelector('#ret-err').innerHTML = '<div class="alert alert-warn">Qaytariladigan miqdorni kiriting</div>'; return; }
    await withBusy(e.currentTarget, async () => {
      try {
        const r = await post(`/sales/${saleId}/return`, { items, refund_method: el.querySelector('[name=refund]').value });
        close();
        toast(`Qaytarildi: ${money(r.amount)}${r.refund ? `, qaytarilgan pul ${money(r.refund)}` : ''}`, 'ok');
        done?.();
      } catch (err) {
        el.querySelector('#ret-err').innerHTML = `<div class="alert alert-bad">${esc(err.message)}</div>`;
      }
    });
  });
}

// ---------- Sahifa ----------

export async function render(root, params, ctx) {
  // #/sales/history: router "history" ni id sifatida beradi
  if (params.id === 'history') {
    return renderHistory(root, ctx, params.query);
  }
  if (params.id && !params.sub) {
    // Chek ko'rinishi (eski savdo)
    const { sale } = await get(`/sales/${params.id}`);
    root.innerHTML = `<div class="page-head"><h1>Chek ${esc(sale.receipt_no)}</h1><a class="btn btn-light" href="#/sales/history">Savdolar</a></div>`;
    return showReceipt(sale, ctx);
  }
  C = { ctx, query: '', cat: '', cats: [] };
  if (S.owner !== ctx.user.username) S = loadState(ctx.user.username);
  const isDesktop = window.matchMedia('(min-width: 720px)').matches;
  root.innerHTML = `
    <div class="pos">
      <div class="pos-main-col">
        <div class="pos-search">
          <div class="input-group">
            <input class="input" id="q" type="search" placeholder="Tovar nomini yozing" autocomplete="off" aria-label="Mahsulot qidirish">
            <button class="btn btn-light" type="button" id="btn-scan" aria-label="Kamera bilan shtrix-kod" style="min-width:56px">${icon('camera')}</button>
          </div>
          <div class="input-group pos-bc" style="margin-top:8px">
            <input class="input" id="barcode" type="text" inputmode="numeric" placeholder="Shtrix-kod (skaner yoki raqam)" autocomplete="off" aria-label="Shtrix-kod">
            <button class="btn btn-outline" type="button" id="btn-bc" style="min-width:56px">${icon('scan')}</button>
          </div>
          <div class="chips pos-cats" id="pcats" hidden></div>
          <div class="between pos-meta" style="margin-top:10px"><span class="small muted" id="grid-selected">${S.cart.length} ta tovar savatchada</span>
            <a class="small" href="#/sales/history">Bugungi savdolar &rsaquo;</a></div>
        </div>
        <div class="product-grid" id="grid"><div class="empty">Yuklanmoqda...</div></div>
      </div>
      <aside class="pos-cart card" id="cart-panel" ${isDesktop ? '' : 'hidden'}></aside>
    </div>
    <button class="mobile-cartbar" id="cartbar" type="button" hidden>
      <span class="count" data-count>0</span><span class="cb-text"><b>Sotishga o'tish</b><small>Savatcha va to'lov</small></span><span class="total" data-total>0 so'm</span>${icon('right', 'ico-sm')}
    </button>`;

  const q = root.querySelector('#q');
  let timer = null;
  q.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      C.query = q.value.trim();
      loadProducts(C.query).catch(errorToast);
    }, 220);
  });
  const bc = root.querySelector('#barcode');
  const doBarcode = async () => {
    const code = bc.value.trim();
    if (!code) return;
    try {
      await addByBarcode(code);
      bc.value = '';
    } catch (err) {
      errorToast(err);
      bc.select();
    }
  };
  bc.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); doBarcode(); } });
  root.querySelector('#btn-bc').addEventListener('click', doBarcode);
  root.querySelector('#btn-scan').addEventListener('click', openScanner);
  root.querySelector('#cartbar').addEventListener('click', () => {
    const r = openModal({ title: 'Savatcha va to\'lov', body: '<div id="cart-m"></div>', wide: true, onClose: () => { cartModal = null; } });
    cartModal = r.el.querySelector('#cart-m');
    cartModal.classList.add('stack');
    mountCart(cartModal, ctx);
  });
  refreshAll();
  // Qoldiq ma'lumoti yangi bo'lishi uchun keshni tozalaymiz
  detailCache.clear();
  await loadProducts('');
  refreshAll();
}
