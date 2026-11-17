// Kirimlar: ro'yxat, ko'p qatorli yangi kirim, tafsilot va yetkazib beruvchiga to'lov
import {
  get, post, icon, esc, num, money, dateOnly, toast, errorToast, openModal, withBusy,
  emptyState, todayStr, monthStartStr,
} from '../ui.js';
import { openBarcodeScanner, cameraScanSupported } from '../scanner.js';

const newKey = () => `pur-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
const toNum = (v) => {
  const n = Number(String(v ?? '').trim().replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
};
const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
const round4 = (n) => Math.round((n + Number.EPSILON) * 10000) / 10000;

export async function render(root, params, ctx) {
  if (params.id === 'new') return renderNew(root, ctx);
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
      ${ctx.can('purchases.create') ? `<a class="btn" href="#/purchases/new">${icon('plus')} Yangi kirim</a>` : ''}
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

async function renderNew(root, ctx) {
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
      <h1>Yangi kirim</h1>
    </div>
    ${suppliers.length ? '' : `<div class="alert alert-warn">Avval yetkazib beruvchi qo'shing: <a href="#/suppliers"><b>Yetkazib beruvchilar</b></a></div>`}
    <div class="form-grid two" style="align-items:start">
      <div class="stack">
        <div class="card">
          <div class="form-grid two" style="gap:10px">
            <label class="field"><span>Yetkazib beruvchi *</span>
              <select class="input" id="sup"><option value="">— tanlang —</option>
                ${suppliers.map((s) => `<option value="${s.id}">${esc(s.name)}</option>`).join('')}
              </select></label>
            <label class="field"><span>Sana</span><input class="input" type="date" id="pdate" value="${todayStr()}"></label>
          </div>
          <label class="field" style="margin-top:10px"><span>Izoh (ixtiyoriy)</span><input class="input" id="note" maxlength="500"></label>
        </div>

        <div class="card">
          <div class="card-head"><h2>Mahsulotlar</h2><span class="badge badge-info" id="icount">0 qator</span></div>
          <input class="input" id="pq" type="search" placeholder="Mahsulot nomi bo'yicha qidirish" autocomplete="off">
          <div id="pres" class="list" style="margin-top:8px"></div>
          <div class="input-group" style="margin-top:10px">
            <input class="input" id="bc" inputmode="numeric" placeholder="Shtrix-kod (skaner yoki qo'lda, Enter)" autocomplete="off">
            ${cameraScanSupported() ? `<button class="btn btn-light" type="button" id="cam" aria-label="Kamera bilan o'qish" style="min-width:56px">${icon('camera')}</button>` : ''}
          </div>
          <div class="stack" id="items" style="margin-top:12px"></div>
        </div>
      </div>

      <div class="card">
        <div class="card-head"><h2>Hisob</h2></div>
        <div class="cart-totals">
          <div class="between"><span class="muted">Mahsulotlar</span><span class="num" id="sub">0 so'm</span></div>
          <div class="between"><span style="font-weight:700">Jami</span><span class="big num" id="tot">0 so'm</span></div>
          <div class="between small"><span class="muted">Qoldiq qarz</span><span class="num" id="rem">0 so'm</span></div>
        </div>
        <div class="form-grid two" style="gap:10px;margin-top:12px">
          <label class="field"><span>Yetkazib berish (so'm)</span><input class="input" id="dlv" inputmode="decimal" placeholder="0"></label>
          <label class="field"><span>Chegirma (so'm)</span><input class="input" id="dsc" inputmode="decimal" placeholder="0"></label>
          <label class="field"><span>To'langan (so'm)</span><input class="input" id="paid" inputmode="decimal" placeholder="0"></label>
          <label class="field"><span>To'lov usuli</span>
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
    const conv = f !== 1 ? ` · 1 ${it.unit_name} = ${num(f, 4)} ${it.base_unit_name}` : '';
    return `Omborga: ${num(lineBase(it), 4)} ${it.base_unit_name}${conv}`;
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
    if (!$('#sup').value) warn = 'Yetkazib beruvchini tanlang';
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
              <label class="field"><span>Miqdor</span><input class="input" inputmode="decimal" data-q="${i}" value="${esc(it.quantity)}"></label>
              <label class="field"><span>Birlik</span>
                <select class="input" data-u="${i}">${units.map((u) => `<option value="${u.unit_id}" ${u.unit_id === it.unit_id ? 'selected' : ''}>${esc(u.name)}</option>`).join('')}</select></label>
              <label class="field"><span>Narx (1 ${esc(it.unit_name)}, so'm)</span><input class="input" inputmode="decimal" data-p="${i}" value="${esc(it.unit_price)}"></label>
              <div class="field"><span>Qator summasi</span>
                <div class="num" style="font-weight:800;font-size:18px;padding-top:10px" data-lt="${i}">${money(lineTotal(it))}</div></div>
            </div>
          </div>`;
      }).join('')
      : emptyState("Mahsulot qo'shing: nomini qidiring, shtrix-kodni o'qing yoki kiriting", 'box');

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
      it.unit_id = Number(sel.value);
      it.unit_name = sel.options[sel.selectedIndex].text;
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
      items.push({
        product_id: p.id, name: p.name,
        base_unit_id: p.base_unit_id, base_unit_name: p.base_unit_name,
        unit_id: p.base_unit_id, unit_name: p.base_unit_name,
        conv: p.conversions || [],
        quantity: '1', unit_price: String(p.purchase_price ?? 0),
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
          </div>`).join('') || '<div class="empty">Mahsulot topilmadi. <a href="#/products/new">Yangi mahsulot</a></div>';
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
