// Kirimlar: ro'yxat, ko'p qatorli yangi kirim, tafsilot va yetkazib beruvchiga to'lov
import {
  get, post, icon, esc, num, money, dateOnly, toast, errorToast, openModal, withBusy,
  emptyState, todayStr, monthStartStr,
} from '../ui.js';
import { openBarcodeScanner, cameraScanSupported } from '../scanner.js';
import { openProductWizard } from '../productform.js';

const newKey = () => `pur-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
const toNum = (v) => {
  const n = Number(String(v ?? '').trim().replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
};
const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
const round4 = (n) => Math.round((n + Number.EPSILON) * 10000) / 10000;

export async function render(root, params, ctx) {
  if (params.id === 'new') return renderNew(root, ctx, params.query.product ? Number(params.query.product) : null);
  if (params.id) return renderDetail(root, Number(params.id), ctx);
  return renderList(root, params, ctx);
}

// ---------- Ro'yxat ----------

async function renderList(root, params, ctx) {
  const from = params.query.from || monthStartStr();
  const to = params.query.to || todayStr();
  const { purchases: rows } = await get(`/purchases?from=${from}&to=${to}&limit=500`);
  const total = round2(rows.reduce((s, p) => s + Number(p.total), 0));
  const debt = round2(rows.reduce((s, p) => s + Number(p.remaining_debt), 0));

  root.innerHTML = `
    <div class="page-head">
      <div><h1>Kirimlar</h1><p class="muted">${rows.length} ta kirim</p></div>
      ${ctx.can('purchases.create') ? `<a class="btn" href="#/purchases/new">${icon('plus')} Yuk keldi — kiritish</a>` : ''}
    </div>
    <div class="card" style="margin-bottom:14px">
      <div class="form-grid two" style="gap:10px">
        <label class="field"><span>Boshlanish</span><input class="input" type="date" id="df" value="${esc(from)}"></label>
        <label class="field"><span>Tugash</span><input class="input" type="date" id="dt" value="${esc(to)}"></label>
      </div>
    </div>
    <div class="kpis">
      <div class="kpi neutral"><div class="label">Kirimlar summasi</div><div class="value">${money(total)}</div><div class="hint">${rows.length} ta kirim</div></div>
      <div class="kpi ${debt > 0 ? 'warn' : 'good'}"><div class="label">Yetkazib beruvchilarga qarz</div><div class="value">${money(debt)}</div><div class="hint">shu davr kirimlari bo'yicha</div></div>
    </div>
    <div class="card" style="margin-top:14px">
      ${rows.length ? `<div class="table-wrap cards"><table>
        <thead><tr><th>Raqam</th><th>Sana</th><th>Yetkazib beruvchi</th><th class="right">Jami</th><th class="right">To'langan</th><th class="right">Qarz</th></tr></thead>
        <tbody>${rows.map((p) => `
          <tr class="clickable" data-id="${p.id}">
            <td data-label="Raqam"><b>${esc(p.purchase_no)}</b></td>
            <td data-label="Sana">${dateOnly(p.purchase_date)}</td>
            <td data-label="Yetkazib beruvchi">${esc(p.supplier_name)}</td>
            <td data-label="Jami" class="right num">${money(p.total)}</td>
            <td data-label="To'langan" class="right num">${money(p.paid_amount)}</td>
            <td data-label="Qarz" class="right num ${Number(p.remaining_debt) > 0 ? 'amber' : ''}">${money(p.remaining_debt)}</td>
          </tr>`).join('')}
        </tbody></table></div>`
        : emptyState("Bu davrda kirim yo'q", 'truck')}
    </div>`;

  const apply = () => ctx.go(`#/purchases?from=${root.querySelector('#df').value}&to=${root.querySelector('#dt').value}`);
  root.querySelector('#df').addEventListener('change', apply);
  root.querySelector('#dt').addEventListener('change', apply);
  root.querySelectorAll('tr[data-id]').forEach((tr) => tr.addEventListener('click', () => ctx.go(`#/purchases/${tr.dataset.id}`)));
}

// ---------- Yangi kirim ----------

async function renderNew(root, ctx, preselect = null) {
  if (!ctx.can('purchases.create')) {
    root.innerHTML = '<div class="alert alert-bad">Kirim qilish uchun ruxsatingiz yo\'q</div>';
    return;
  }
  const { suppliers } = await get('/suppliers');
  const key = newKey();
  const items = [];

  root.innerHTML = `
    <div class="page-head">
      <a class="btn btn-light btn-sm" href="#/purchases">${icon('back', 'ico-sm')} Kirimlar</a>
      <h1>Yuk keldi: yangi kirim</h1>
    </div>
    <p class="muted" style="margin:-8px 0 14px">Omborga kelgan tovarni kiriting. Saqlangach, tovar qoldig'i o'zi ko'payadi.</p>
    <div class="form-grid two" style="align-items:start">
      <div class="stack">
        <div class="card">
          <div class="form-grid two" style="gap:10px">
            <div class="field"><span>Kimdan keldi? (yetkazib beruvchi) *</span>
              <div class="input-group">
                <select class="input" id="sup"><option value="">— tanlang —</option>
                  ${suppliers.map((s) => `<option value="${s.id}">${esc(s.name)}</option>`).join('')}
                </select>
                ${ctx.can('suppliers.manage') ? `<button class="btn btn-light" type="button" id="sup-new" style="min-width:56px" aria-label="Yangi yetkazib beruvchi" title="Yangi yetkazib beruvchi qo'shish">${icon('plus')}</button>` : ''}
              </div>
              ${suppliers.length ? '' : "<small>Ro'yxat bo'sh — «+» tugmasi bilan qo'shing (masalan: «Bozor» yoki firma nomi)</small>"}</div>
            <label class="field"><span>Sana</span><input class="input" type="date" id="pdate" value="${todayStr()}"></label>
          </div>
          <label class="field" style="margin-top:10px"><span>Izoh (ixtiyoriy)</span><input class="input" id="note" maxlength="500"></label>
        </div>

        <div class="card">
          <div class="card-head"><h2>Qanday tovar keldi?</h2><span class="badge badge-info" id="icount">0 qator</span></div>
          <input class="input" id="pq" type="search" placeholder="Tovar nomini yozing va ro'yxatdan tanlang" autocomplete="off">
          <div id="pres" class="list" style="margin-top:8px"></div>
          <div class="input-group" style="margin-top:10px">
            <input class="input" id="bc" inputmode="numeric" placeholder="Shtrix-kod (skaner yoki qo'lda, Enter)" autocomplete="off">
            ${cameraScanSupported() ? `<button class="btn btn-light" type="button" id="cam" aria-label="Kamera bilan o'qish" style="min-width:56px">${icon('camera')}</button>` : ''}
          </div>
          <div class="stack" id="items" style="margin-top:12px"></div>
        </div>
      </div>

      <div class="card">
        <div class="card-head"><h2>Hisob-kitob</h2></div>
        <div class="cart-totals">
          <div class="between"><span class="muted">Tovarlar summasi</span><span class="num" id="sub">0 so'm</span></div>
          <div class="between"><span style="font-weight:700">Jami to'lanadigan</span><span class="big num" id="tot">0 so'm</span></div>
          <div class="between small"><span class="muted">Yetkazib beruvchiga qarzingiz</span><span class="num" id="rem">0 so'm</span></div>
        </div>
        <div class="form-grid two" style="gap:10px;margin-top:12px">
          <label class="field"><span>Yo'l kira (so'm)</span><input class="input" id="dlv" inputmode="decimal" placeholder="0"><small>Bo'lmasa, bo'sh qoldiring</small></label>
          <label class="field"><span>Sizga chegirma (so'm)</span><input class="input" id="dsc" inputmode="decimal" placeholder="0"><small>Bo'lmasa, bo'sh qoldiring</small></label>
          <div class="field"><span>Hozir qancha to'ladingiz? (so'm)</span>
            <div class="input-group"><input class="input" id="paid" inputmode="decimal" placeholder="0">
              <button class="btn btn-light" type="button" id="pay-all" title="Jami summani to'liq to'lash">Hammasi</button></div>
            <small>Qolgani qarz bo'lib yoziladi</small></div>
          <label class="field"><span>Qanday to'ladingiz?</span>
            <select class="input" id="pm"><option value="cash">Naqd</option><option value="card">Karta</option><option value="transfer">O'tkazma</option></select></label>
        </div>
        <div id="warn" style="margin-top:10px"></div>
        <button class="btn btn-success btn-lg btn-block" type="button" id="save" style="margin-top:12px">${icon('check')} Kirimni saqlash</button>
      </div>
    </div>`;

  const $ = (sel) => root.querySelector(sel);
  const factorOf = (it) => {
    if (it.unit_id === it.base_unit_id) return 1;
    const c = it.conv.find((x) => x.unit_id === it.unit_id);
    return c ? Number(c.factor) : 1;
  };
  const lineBase = (it) => round4(toNum(it.quantity) * factorOf(it));
  const lineTotal = (it) => round2(toNum(it.quantity) * toNum(it.unit_price));
  const baseText = (it) => {
    const f = factorOf(it);
    const conv = f !== 1 ? ` (1 ${it.unit_name} ichida ${num(f, 4)} ${it.base_unit_name})` : '';
    const price = toNum(it.unit_price);
    const perBase = f !== 1 && price > 0 ? ` · 1 ${it.base_unit_name} ${money(Math.round((price / f) * 100) / 100)}ga tushdi` : '';
    return `Omborga ${num(lineBase(it), 4)} ${it.base_unit_name} qo'shiladi${conv}${perBase}`;
  };

  function totals() {
    const subtotal = round2(items.reduce((s, it) => s + lineTotal(it), 0));
    const delivery = toNum($('#dlv').value);
    const discount = toNum($('#dsc').value);
    const total = round2(subtotal + delivery - discount);
    const paid = toNum($('#paid').value);
    const remaining = round2(total - paid);
    $('#sub').textContent = money(subtotal);
    $('#tot').textContent = money(total);
    $('#rem').textContent = money(remaining);
    $('#icount').textContent = `${items.length} qator`;

    let warn = '';
    if (!$('#sup').value) warn = "Tovar kimdan kelganini tanlang (yetkazib beruvchi)";
    else if (!items.length) warn = "Kamida bitta mahsulot qo'shing";
    else if (items.some((it) => !(toNum(it.quantity) > 0))) warn = 'Har bir qator uchun miqdorni kiriting';
    else if (items.some((it) => toNum(it.unit_price) < 0)) warn = "Narx manfiy bo'lishi mumkin emas";
    else if (discount > subtotal + delivery) warn = "Chegirma umumiy summadan katta bo'lishi mumkin emas";
    else if (paid < 0 || paid > total + 0.001) warn = "To'langan summa jami summadan katta bo'lishi mumkin emas";
    $('#warn').innerHTML = warn ? `<div class="alert alert-warn">${esc(warn)}</div>` : '';
    $('#save').disabled = Boolean(warn);
    return warn;
  }

  function refreshLine(i) {
    const it = items[i];
    const lt = root.querySelector(`[data-lt="${i}"]`);
    const bt = root.querySelector(`[data-base="${i}"]`);
    if (lt) lt.textContent = money(lineTotal(it));
    if (bt) bt.textContent = baseText(it);
  }

  function drawItems() {
    $('#items').innerHTML = items.length
      ? items.map((it, i) => {
        const units = [{ unit_id: it.base_unit_id, name: it.base_unit_name }, ...it.conv];
        return `
          <div class="cart-line">
            <div class="top">
              <div class="grow" style="min-width:0">
                <div class="name">${esc(it.name)}</div>
                <div class="small muted" data-base="${i}">${esc(baseText(it))}</div>
              </div>
              <button class="icon-btn icon-btn-light" style="width:40px;height:40px" type="button" data-del="${i}" aria-label="Qatorni o'chirish">${icon('minus', 'ico-sm')}</button>
            </div>
            <div class="form-grid two" style="gap:8px">
              <label class="field"><span>Nechta keldi?</span><input class="input" inputmode="decimal" data-q="${i}" value="${esc(it.quantity)}"></label>
              <label class="field"><span>Qanday keldi?</span>
                <select class="input" data-u="${i}">${units.map((u) => `<option value="${u.unit_id}" ${u.unit_id === it.unit_id ? 'selected' : ''}>${esc(u.name)}</option>`).join('')}</select></label>
              <label class="field"><span>Kelish narxi (1 ${esc(it.unit_name)}, so'm)</span><input class="input" inputmode="decimal" data-p="${i}" value="${esc(it.unit_price)}"></label>
              <div class="field"><span>Summa</span>
                <div class="num" style="font-weight:800;font-size:18px;padding-top:10px" data-lt="${i}">${money(lineTotal(it))}</div></div>
            </div>
          </div>`;
      }).join('')
      : emptyState("Tepadagi qatorga tovar nomini yozing va ro'yxatdan tanlang (yoki shtrix-kodni o'qiting)", 'box');

    $('#items').querySelectorAll('[data-q]').forEach((inp) => inp.addEventListener('input', () => {
      const i = Number(inp.dataset.q);
      items[i].quantity = inp.value;
      refreshLine(i);
      totals();
    }));
    $('#items').querySelectorAll('[data-p]').forEach((inp) => inp.addEventListener('input', () => {
      const i = Number(inp.dataset.p);
      items[i].unit_price = inp.value;
      refreshLine(i);
      totals();
    }));
    $('#items').querySelectorAll('[data-u]').forEach((sel) => sel.addEventListener('change', () => {
      const it = items[Number(sel.dataset.u)];
      const oldF = factorOf(it);
      it.unit_id = Number(sel.value);
      it.unit_name = sel.options[sel.selectedIndex].text;
      const price = toNum(it.unit_price);
      if (price > 0) it.unit_price = String(Math.round(((price / oldF) * factorOf(it)) * 100) / 100);
      drawItems();
    }));
    $('#items').querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', () => {
      items.splice(Number(b.dataset.del), 1);
      drawItems();
    }));
    totals();
  }

  async function addProduct(id) {
    const { product: p } = await get(`/products/${id}`);
    const existing = items.find((it) => it.product_id === p.id && it.unit_id === p.base_unit_id);
    if (existing) {
      existing.quantity = String(round4(toNum(existing.quantity) + 1));
    } else {
      const conv = p.conversions || [];
      const pack = conv.reduce((best, c) => (!best || Number(c.factor) > Number(best.factor) ? c : best), null);
      const f = pack ? Number(pack.factor) : 1;
      items.push({
        product_id: p.id, name: p.name,
        base_unit_id: p.base_unit_id, base_unit_name: p.base_unit_name,
        unit_id: pack ? pack.unit_id : p.base_unit_id, unit_name: pack ? pack.name : p.base_unit_name,
        conv,
        quantity: '1', unit_price: String(Math.round(Number(p.purchase_price ?? 0) * f * 100) / 100),
      });
    }
    drawItems();
    return p.name;
  }

  async function addByCode(code) {
    const { product } = await get(`/products/barcode/${encodeURIComponent(code)}`);
    const name = await addProduct(product.id);
    toast(`${name} qo'shildi`, 'ok');
  }

  // Mahsulot qidirish (natijalar ro'yxati ichida)
  let timer = null;
  $('#pq').addEventListener('input', (e) => {
    clearTimeout(timer);
    timer = setTimeout(async () => {
      const text = e.target.value.trim();
      if (!text) { $('#pres').innerHTML = ''; return; }
      try {
        const { products } = await get(`/products?q=${encodeURIComponent(text)}`);
        $('#pres').innerHTML = products.slice(0, 15).map((p) => `
          <div class="list-item" data-id="${p.id}">
            <div class="meta"><div class="name">${esc(p.name)}</div>
              <div class="sub">Qoldiq: ${num(p.stock_qty, 3)} ${esc(p.base_unit_name)}</div></div>
            <span class="badge badge-info">+ qo'shish</span>
          </div>`).join('') || `<div class="empty">«${esc(text)}» topilmadi.
            ${ctx.can('products.manage') ? `<div style="margin-top:10px"><button class="btn btn-sm" type="button" data-newprod>${icon('plus', 'ico-sm')} «${esc(text)}» ni yangi tovar sifatida qo'shish</button></div>` : ''}</div>`;
        $('#pres').querySelector('[data-newprod]')?.addEventListener('click', async () => {
          const created = await openProductWizard({ name: text });
          for (const c of created) await addProduct(c.id).catch(errorToast);
          if (created.length) {
            $('#pq').value = '';
            $('#pres').innerHTML = '';
          }
        });
        $('#pres').querySelectorAll('[data-id]').forEach((row) => row.addEventListener('click', async () => {
          try {
            const name = await addProduct(Number(row.dataset.id));
            toast(`${name} qo'shildi`, 'ok');
            $('#pq').value = '';
            $('#pres').innerHTML = '';
          } catch (err) { errorToast(err); }
        }));
      } catch (err) { errorToast(err); }
    }, 220);
  });

  $('#bc').addEventListener('keydown', async (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const input = e.currentTarget;
    const code = input.value.trim();
    if (!code) return;
    try {
      await addByCode(code);
      input.value = '';
    } catch (err) {
      errorToast(err);
      input.select();
    }
  });
  $('#cam')?.addEventListener('click', () => {
    openBarcodeScanner((code) => addByCode(code).catch(errorToast));
  });

  $('#sup').addEventListener('change', totals);
  // "Hammasi": jami summani to'liq to'langan deb yozadi
  $('#pay-all').addEventListener('click', () => {
    const subtotal = round2(items.reduce((sum, it) => sum + lineTotal(it), 0));
    const total = round2(subtotal + toNum($('#dlv').value) - toNum($('#dsc').value));
    $('#paid').value = total > 0 ? String(total) : '';
    totals();
  });
  // Yetkazib beruvchini shu yerning o'zida qo'shish
  $('#sup-new')?.addEventListener('click', () => {
    const { close, el } = openModal({
      title: "Yangi yetkazib beruvchi",
      body: `<form id="nsf" class="form-grid" novalidate>
          <label class="field"><span>Nomi *</span><input class="input" name="name" required maxlength="150" placeholder="Masalan: Bozor yoki «Baraka» ulgurji"></label>
          <label class="field"><span>Telefon (ixtiyoriy)</span><input class="input" name="phone" inputmode="tel" maxlength="30" placeholder="+998 90 123 45 67"></label>
          <div id="nserr"></div>
        </form>`,
      foot: `<button class="btn btn-outline" type="button" data-close>Bekor</button><button class="btn" type="submit" form="nsf">${icon('check', 'ico-sm')} Qo'shish</button>`,
    });
    el.querySelector('[name=name]').focus();
    el.querySelector('#nsf').addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = el.querySelector('[name=name]').value.trim();
      const phone = el.querySelector('[name=phone]').value.trim();
      if (!name) {
        el.querySelector('#nserr').innerHTML = '<div class="alert alert-bad">Nomini kiriting</div>';
        return;
      }
      try {
        const r = await post('/suppliers', { name, phone });
        const opt = document.createElement('option');
        opt.value = r.supplier.id;
        opt.textContent = r.supplier.name;
        $('#sup').appendChild(opt);
        $('#sup').value = String(r.supplier.id);
        close();
        toast(`«${r.supplier.name}» qo'shildi`, 'ok');
        totals();
      } catch (err) {
        el.querySelector('#nserr').innerHTML = `<div class="alert alert-bad">${esc(err.message)}</div>`;
      }
    });
  });
  $('#pdate').addEventListener('change', totals);
  $('#dlv').addEventListener('input', totals);
  $('#dsc').addEventListener('input', totals);
  $('#paid').addEventListener('input', totals);

  $('#save').addEventListener('click', (e) => {
    const warn = totals();
    if (warn) return toast(warn, 'warn');
    const body = {
      supplier_id: Number($('#sup').value),
      purchase_date: $('#pdate').value,
      note: $('#note').value.trim() || null,
      items: items.map((it) => ({
        product_id: it.product_id,
        unit_id: it.unit_id,
        quantity: toNum(it.quantity),
        unit_price: toNum(it.unit_price),
      })),
      delivery_cost: toNum($('#dlv').value),
      discount: toNum($('#dsc').value),
      paid_amount: toNum($('#paid').value),
      payment_method: $('#pm').value,
      idempotency_key: key,
    };
    withBusy(e.currentTarget, async () => {
      try {
        const r = await post('/purchases', body);
        toast(`Kirim saqlandi: ${r.purchase.purchase_no}`, 'ok');
        ctx.go(`#/purchases/${r.purchase.id}`);
      } catch (err) {
        errorToast(err);
      }
    });
  });

  drawItems();
  // Mahsulot sahifasidagi «Yuk keldi» tugmasidan kelinganda: o'sha mahsulot ro'yxatga oldindan qo'shiladi
  if (preselect) {
    history.replaceState(null, '', '#/purchases/new');
    await addProduct(preselect).catch(() => {});
  }
}

// ---------- Tafsilot ----------

async function renderDetail(root, id, ctx) {
  const { purchase: p } = await get(`/purchases/${id}`);
  const hasDebt = Number(p.remaining_debt) > 0;
  const canPay = hasDebt && ctx.canAny(['suppliers.manage', 'payments.create']);

  root.innerHTML = `
    <div class="page-head">
      <a class="btn btn-light btn-sm" href="#/purchases">${icon('back', 'ico-sm')} Kirimlar</a>
      ${canPay ? `<button class="btn btn-success" type="button" id="pay">${icon('money', 'ico-sm')} To'lov qilish</button>` : ''}
    </div>
    <div class="card">
      <div class="between" style="align-items:flex-start;flex-wrap:wrap;gap:10px">
        <div>
          <h1 style="font-size:22px">${esc(p.purchase_no)}</h1>
          <div class="small muted" style="margin-top:4px">${dateOnly(p.purchase_date)} · ${esc(p.supplier_name)}</div>
        </div>
        ${hasDebt ? `<span class="badge badge-low">Qarz: ${money(p.remaining_debt)}</span>` : '<span class="badge badge-ok">To\'liq to\'langan</span>'}
      </div>
      ${p.note ? `<p class="small" style="margin-top:10px">${esc(p.note)}</p>` : ''}
    </div>

    <div class="card" style="margin-top:14px">
      <div class="table-wrap cards"><table>
        <thead><tr><th>Mahsulot</th><th class="right">Miqdor</th><th class="right">Narx</th><th class="right">Qator summasi</th><th class="right">Tannarx (asosiy birlik)</th></tr></thead>
        <tbody>${p.items.map((i) => `<tr>
          <td data-label="Mahsulot">${esc(i.product_name)}</td>
          <td data-label="Miqdor" class="right num">${num(i.quantity, 4)} ${esc(i.unit_name)}</td>
          <td data-label="Narx" class="right num">${money(i.unit_price)}</td>
          <td data-label="Qator summasi" class="right num">${money(i.line_total)}</td>
          <td data-label="Tannarx" class="right num">${money(i.unit_cost)}</td>
        </tr>`).join('')}</tbody></table></div>

      <div class="cart-totals" style="margin-top:14px">
        <div class="between"><span class="muted">Mahsulotlar</span><span class="num">${money(p.subtotal)}</span></div>
        <div class="between"><span class="muted">Yetkazib berish</span><span class="num">${money(p.delivery_cost)}</span></div>
        <div class="between"><span class="muted">Chegirma</span><span class="num">${money(p.discount)}</span></div>
        <div class="between"><span style="font-weight:700">Jami</span><span class="big num">${money(p.total)}</span></div>
        <div class="between"><span class="muted">To'langan</span><span class="num green">${money(p.paid_amount)}</span></div>
        <div class="between"><span class="muted">Qarz</span><span class="num ${hasDebt ? 'amber' : ''}">${money(p.remaining_debt)}</span></div>
      </div>
    </div>`;

  root.querySelector('#pay')?.addEventListener('click', () => {
    const { close, el } = openModal({
      title: `To'lov · ${p.purchase_no}`,
      body: `<p class="small muted">${esc(p.supplier_name)} ga qarz: <b>${money(p.remaining_debt)}</b></p>
        <div class="form-grid two" style="margin-top:12px;gap:10px">
          <label class="field"><span>Summa (so'm)</span><input class="input" id="pa" inputmode="decimal" value="${esc(p.remaining_debt)}"></label>
          <label class="field"><span>Usul</span>
            <select class="input" id="pmth"><option value="cash">Naqd</option><option value="card">Karta</option><option value="transfer">O'tkazma</option></select></label>
        </div>
        <div id="perr" style="margin-top:10px"></div>`,
      foot: `<button class="btn btn-outline" type="button" data-no>Bekor</button>
             <button class="btn btn-success" type="button" data-yes>${icon('check', 'ico-sm')} To'lash</button>`,
    });
    el.querySelector('[data-no]').addEventListener('click', close);
    el.querySelector('[data-yes]').addEventListener('click', (e) => {
      withBusy(e.currentTarget, async () => {
        try {
          const r = await post(`/suppliers/${p.supplier_id}/payments`, {
            amount: toNum(el.querySelector('#pa').value),
            method: el.querySelector('#pmth').value,
            purchase_id: p.id,
          });
          close();
          toast(`To'lov qabul qilindi. Yetkazib beruvchiga qolgan qarz: ${money(r.remaining_debt)}`, 'ok');
          renderDetail(root, id, ctx);
        } catch (err) {
          el.querySelector('#perr').innerHTML = `<div class="alert alert-bad">${esc(err.message)}</div>`;
        }
      });
    });
  });
}
