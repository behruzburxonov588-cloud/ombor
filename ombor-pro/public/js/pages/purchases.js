// Kirimlar: ro'yxat, ko'p qatorli yangi kirim, tafsilot va yetkazib beruvchiga to'lov
import {
  get, post, icon, esc, num, money, dateOnly, toast, errorToast, openModal, withBusy,
  emptyState, todayStr, monthStartStr, productPhoto, packText,
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

// ---------- Yuk keldi: tovarni bosing → nechta keldi → saqlang ----------

const GRID_PAGE = 24;
const UNKNOWN = "Noma'lum";
const isWide = () => window.matchMedia('(min-width: 720px)').matches;

async function renderNew(root, ctx, preselect = null) {
  if (!ctx.can('purchases.create')) {
    root.innerHTML = '<div class="alert alert-bad">Kirim qilish uchun ruxsatingiz yo\'q</div>';
    return;
  }
  const canNewProduct = ctx.can('products.manage');
  const canNewSupplier = ctx.can('suppliers.manage');
  const [{ suppliers: allSup }, cat] = await Promise.all([get('/suppliers'), get('/products?limit=1000')]);
  let catalog = cat.products;
  const suppliers = allSup.filter((s) => s.name !== UNKNOWN);
  const key = newKey();
  const lines = []; // { p, unit_id, quantity, unit_price }
  let pay = 'full'; // full | part | debt
  let method = 'cash';
  let filter = '';
  let q = '';
  let shown = GRID_PAGE;

  root.innerHTML = `
    <div class="page-head">
      <a class="btn btn-light btn-sm" href="#/purchases">${icon('back', 'ico-sm')} Kirimlar</a>
      <h1>Yuk keldi</h1>
    </div>
    <ol class="rcv-steps">
      <li><b>1</b> Kelgan tovarni bosing</li>
      <li><b>2</b> Ochilgan oynada nechta keldi va narxini yozing → «Qo'shish»</li>
      <li><b>3</b> «Saqlash» — omborga o'zi qo'shiladi</li>
    </ol>
    <div class="rcv">
      <div class="rcv-pick">
        <div class="rcv-search">
          <div class="input-group">
            <div class="search-input grow">${icon('search', 'ico-sm')}<input class="input" id="pq" type="search" placeholder="Tovar nomi yoki shtrix-kod" autocomplete="off" aria-label="Tovar qidirish"></div>
            ${cameraScanSupported() ? `<button class="btn btn-light" type="button" id="cam" aria-label="Kamera bilan shtrix-kod o'qish" title="Shtrix-kodni kamera bilan o'qish" style="min-width:52px">${icon('camera')}</button>` : ''}
          </div>
          <div class="chips" id="gchips" style="margin-top:10px"></div>
        </div>
        <div class="product-grid rcv-grid" id="grid"></div>
        <div id="grid-more"></div>
      </div>

      <aside class="card rcv-cart" id="cart">
        <div class="card-head"><h2>Kelgan yuk</h2><span class="badge badge-info" id="cnt">0 xil</span></div>
        <div id="lines"></div>

        <div class="rcv-sec">
          <div class="rcv-q">Kimdan keldi? <small>(ixtiyoriy)</small></div>
          <div class="input-group">
            <select class="input" id="sup" aria-label="Yetkazib beruvchi">
              <option value="">— ko'rsatmayman —</option>
              ${suppliers.map((s) => `<option value="${s.id}">${esc(s.name)}</option>`).join('')}
            </select>
            ${canNewSupplier ? `<button class="btn btn-light" type="button" id="sup-new" style="min-width:52px" aria-label="Yangi yetkazib beruvchi" title="Yangi yetkazib beruvchi qo'shish">${icon('plus')}</button>` : ''}
          </div>
        </div>

        <div class="rcv-sec">
          <div class="rcv-q">Pulini to'ladingizmi?</div>
          <div class="pay3" id="pay3">
            <button type="button" data-pay="full" class="on">${icon('check', 'ico-sm')} To'liq to'ladim</button>
            <button type="button" data-pay="part">Bir qismini</button>
            <button type="button" data-pay="debt">Qarzga oldim</button>
          </div>
          <div id="part-box" hidden style="margin-top:10px">
            <label class="field"><span>Qancha to'ladingiz?</span>
              <div class="money-input"><input class="input" id="paid" inputmode="decimal" placeholder="0"><em>so'm</em></div></label>
          </div>
          <div class="chips" id="method" style="margin-top:10px">
            <span class="small muted">Qanday:</span>
            <button type="button" class="chip active" data-m="cash">Naqd</button>
            <button type="button" class="chip" data-m="card">Karta</button>
            <button type="button" class="chip" data-m="transfer">O'tkazma</button>
          </div>
        </div>

        <details class="rcv-extra">
          <summary>Sana, yo'l kira, chegirma, izoh</summary>
          <div class="form-grid two" style="gap:10px;margin-top:10px">
            <label class="field"><span>Sana</span><input class="input" type="date" id="pdate" value="${todayStr()}"></label>
            <label class="field"><span>Yo'l kira (so'm)</span><input class="input" id="dlv" inputmode="decimal" placeholder="0"></label>
            <label class="field"><span>Sizga chegirma (so'm)</span><input class="input" id="dsc" inputmode="decimal" placeholder="0"></label>
            <label class="field"><span>Izoh</span><input class="input" id="note" maxlength="500" placeholder="Ixtiyoriy"></label>
          </div>
          <p class="small muted" style="margin-top:6px">Yo'l kira va chegirma tovarlarning kelish narxiga taqsimlanadi.</p>
        </details>

        <div class="rcv-foot">
          <div class="rcv-total">
            <div class="between"><span>Jami</span><span class="big num" id="tot">0 so'm</span></div>
            <div class="between small" id="debt-line" hidden><span>Qarzingiz qoladi</span><b class="num amber" id="rem"></b></div>
          </div>
          <div id="warn"></div>
          <button class="btn btn-success btn-lg btn-block" type="button" id="save" disabled>${icon('check')} Saqlash — omborga qo'shish</button>
        </div>
      </aside>
    </div>
    <button class="mobile-cartbar" id="cartbar" type="button" hidden>
      <span class="count" data-count>0</span><span>Kelgan yuk — davom etish</span><span class="total" data-total>0 so'm</span>
    </button>`;

  const $ = (sel) => root.querySelector(sel);

  // ----- hisob-kitob yordamchilari -----
  const unitsOf = (p) => [{ unit_id: p.base_unit_id, name: p.base_unit_name, factor: 1 }, ...(p.conversions || [])];
  const unitOf = (l) => unitsOf(l.p).find((u) => u.unit_id === l.unit_id) || unitsOf(l.p)[0];
  const baseQty = (l) => round4(toNum(l.quantity) * unitOf(l).factor);
  const lineTotal = (l) => round2(toNum(l.quantity) * toNum(l.unit_price));
  const inCart = (pid) => lines.find((l) => l.p.id === pid);
  const priceFor = (p, factor) => (Number(p.purchase_price) > 0 ? String(round2(Number(p.purchase_price) * factor)) : '');

  function afterText(l) {
    const u = esc(l.p.base_unit_name);
    const now = Number(l.p.stock_qty);
    const add = baseQty(l);
    return `Omborda: ${num(now, 3)} → <b>${num(round4(now + add), 3)} ${u}</b> bo'ladi`;
  }
  function hintText(l) {
    const un = unitOf(l);
    const parts = [];
    if (un.factor !== 1) parts.push(`1 ${esc(un.name)} ichida ${num(un.factor, 4)} ${esc(l.p.base_unit_name)}`);
    const price = toNum(l.unit_price);
    if (un.factor !== 1 && price > 0) parts.push(`1 ${esc(l.p.base_unit_name)} ${money(round2(price / un.factor))}ga tushdi`);
    const sell = Number(l.p.selling_price);
    if (price > 0 && sell > 0) {
      const m = round2(sell - price / un.factor);
      parts.push(m >= 0 ? `har biridan ${money(m)} foyda` : `<span class="red">sotuv narxidan qimmat (${money(m)})</span>`);
    }
    return parts.join(' · ');
  }

  // ----- tovarlar (chap tomon) -----
  function gridRows() {
    const text = q.toLowerCase();
    return catalog.filter((p) => (!filter || p.status === filter)
      && (!text || p.name.toLowerCase().includes(text) || (p.barcode && p.barcode === q)));
  }
  function drawChips() {
    const out = catalog.filter((p) => p.status === 'out').length;
    const low = catalog.filter((p) => p.status === 'low').length;
    $('#gchips').innerHTML = [
      { k: '', t: `Hammasi ${catalog.length}` },
      { k: 'out', t: `Tugagan ${out}`, c: out ? 'chip-bad' : '' },
      { k: 'low', t: `Kam qolgan ${low}`, c: low ? 'chip-warn' : '' },
    ].map((c) => `<button type="button" class="chip ${c.c || ''} ${c.k === filter ? 'active' : ''}" data-gf="${c.k}">${c.t}</button>`).join('');
  }
  function tile(p) {
    const l = inCart(p.id);
    const pk = packText(p.stock_qty, p.base_unit_name, p.pack);
    return `
      <button type="button" class="pcard rtile st-${p.status} ${l ? 'picked' : ''}" data-pid="${p.id}" aria-label="${esc(p.name)} — qo'shish">
        ${productPhoto(p, 'rt-img')}
        ${l ? `<span class="qty-badge">+${num(toNum(l.quantity), 3)} ${esc(unitOf(l).name)}</span>` : ''}
        <span class="rt-text"><span class="pname">${esc(p.name)}</span>
        <span class="rt-stock">Omborda: <b>${num(p.stock_qty, 3)} ${esc(p.base_unit_name)}</b>${pk ? `<br><small>${esc(pk)}</small>` : ''}</span></span>
      </button>`;
  }
  function drawGrid() {
    const rows = gridRows();
    const newTile = canNewProduct ? `
      <button type="button" class="pcard rtile rt-new" data-newprod>
        <span class="rt-plus">${icon('plus')}</span>
        <span class="rt-text"><span class="pname">${q ? `«${esc(q)}» — yangi tovar` : 'Yangi tovar'}</span>
        <span class="rt-stock">Ro'yxatda yo'q bo'lsa</span></span>
      </button>` : '';
    $('#grid').innerHTML = rows.length || canNewProduct
      ? newTile + rows.slice(0, shown).map(tile).join('')
      : `<div class="empty" style="grid-column:1/-1">${q ? `«${esc(q)}» topilmadi` : "Hali tovar yo'q"}</div>`;
    $('#grid-more').innerHTML = rows.length > shown
      ? `<div class="home-foot"><button class="btn btn-light" type="button" id="gmore">Yana ko'rsatish (${rows.length - shown})</button></div>` : '';
    $('#gmore')?.addEventListener('click', () => { shown += GRID_PAGE; drawGrid(); });
  }
  function refreshTile(pid) {
    const old = $(`[data-pid="${pid}"]`);
    const p = catalog.find((x) => x.id === pid);
    if (old && p) old.outerHTML = tile(p);
  }

  // ----- kelgan yuk (o'ng tomon): qisqa qatorlar, bosilsa o'zgartirish oynasi ochiladi -----
  function lineHtml(l, i) {
    const un = unitOf(l);
    const noPrice = !(toNum(l.unit_price) > 0);
    const baseNote = un.factor !== 1 ? ` (${num(baseQty(l), 3)} ${esc(l.p.base_unit_name)})` : '';
    return `
      <div class="rl" data-i="${i}">
        <button class="rl-main" type="button" data-edit aria-label="${esc(l.p.name)} — o'zgartirish">
          ${productPhoto(l.p, 'rl-img')}
          <span class="rl-name">
            <b>${esc(l.p.name)}</b>
            <span>${num(toNum(l.quantity), 3)} ${esc(un.name)}${baseNote} × ${noPrice ? '<em class="amber">narxi yozilmagan</em>' : money(toNum(l.unit_price))}</span>
            <span class="rl-after-s">${afterText(l)}</span>
            <span class="rl-bottom"><b class="num">${money(lineTotal(l))}</b><small>${icon('edit', 'ico-xs')} o'zgartirish</small></span>
          </span>
        </button>
        <button class="icon-btn icon-btn-light" type="button" data-del aria-label="Olib tashlash" title="Olib tashlash">${icon('x', 'ico-sm')}</button>
      </div>`;
  }
  function drawLines() {
    $('#lines').innerHTML = lines.length
      ? lines.map(lineHtml).join('')
      : `<div class="rcv-empty">${icon('box')}<p>${isWide() ? 'Chapdagi' : 'Tepadagi'} tovarlardan kelganini bosing.<br><small>Ochilgan oynada nechta kelganini yozib, «Qo'shish» ni bosasiz.</small></p></div>`;
    totals();
  }

  function totals() {
    const subtotal = round2(lines.reduce((s, l) => s + lineTotal(l), 0));
    const delivery = toNum($('#dlv').value);
    const discount = toNum($('#dsc').value);
    const total = round2(subtotal + delivery - discount);
    const paid = pay === 'full' ? total : pay === 'debt' ? 0 : toNum($('#paid').value);
    const remaining = round2(total - paid);
    $('#tot').textContent = money(total);
    $('#cnt').textContent = `${lines.length} xil`;
    $('#debt-line').hidden = !(remaining > 0.001) || !lines.length;
    $('#rem').textContent = money(remaining);
    $('#method').hidden = pay === 'debt';
    $('#part-box').hidden = pay !== 'part';

    const bar = $('#cartbar');
    bar.querySelector('[data-count]').textContent = lines.length;
    bar.querySelector('[data-total]').textContent = money(total);
    bar.hidden = !lines.length;

    let warn = '';
    let soft = '';
    const noSup = !$('#sup').value;
    if (!lines.length) warn = '';
    else if (lines.some((l) => !(toNum(l.quantity) > 0))) warn = `«${lines.find((l) => !(toNum(l.quantity) > 0)).p.name}» — nechta kelganini yozing`;
    else if (lines.some((l) => toNum(l.unit_price) < 0)) warn = "Narx manfiy bo'lishi mumkin emas";
    else if (discount > subtotal + delivery) warn = "Chegirma umumiy summadan katta bo'lishi mumkin emas";
    else if (pay === 'part' && !(paid > 0)) warn = "Qancha to'laganingizni yozing";
    else if (pay === 'part' && paid > total + 0.001) warn = "To'langan summa jami summadan katta bo'lishi mumkin emas";
    else if (remaining > 0.001 && noSup) warn = "Qarzga olgan bo'lsangiz, tovar kimdan kelganini tanlang (yuqorida «Kimdan keldi?»)";
    if (!warn && lines.some((l) => !(toNum(l.unit_price) > 0))) {
      soft = `«${lines.find((l) => !(toNum(l.unit_price) > 0)).p.name}» narxi yozilmagan — foyda to'g'ri hisoblanishi uchun ustiga bosib narxini yozing`;
    }
    $('#warn').innerHTML = warn ? `<div class="alert alert-warn">${esc(warn)}</div>` : soft ? `<div class="alert alert-info small">${esc(soft)}</div>` : '';
    $('#save').disabled = !lines.length || Boolean(warn);
    return warn || (!lines.length ? 'Avval kelgan tovarni tanlang' : '');
  }

  // Ro'yxatga qo'shish yoki o'zgartirish (oynadan «Qo'shish» bosilgandagina chaqiriladi)
  function putLine(p, { quantity, unitId, price }) {
    let l = inCart(p.id);
    if (l) Object.assign(l, { unit_id: unitId, quantity, unit_price: price });
    else {
      l = { p, unit_id: unitId, quantity, unit_price: price };
      lines.push(l);
    }
    drawLines();
    refreshTile(p.id);
    const el = $(`.rl[data-i="${lines.indexOf(l)}"]`);
    el?.classList.add('flash');
    if (isWide()) el?.scrollIntoView({ block: 'nearest' });
    else toast(`${p.name}: ${num(toNum(quantity), 3)} ${unitOf(l).name} ro'yxatga qo'shildi`, 'ok');
  }

  function removeLine(pid) {
    const i = lines.findIndex((l) => l.p.id === pid);
    if (i < 0) return;
    lines.splice(i, 1);
    drawLines();
    refreshTile(pid);
  }

  // Tovar oynasi: nechta keldi, qaysi qadoqda, necha pulga — keyin «Qo'shish»
  function openPicker(p) {
    const existing = inCart(p.id);
    const units = unitsOf(p);
    const pack = p.pack && Number(p.pack.factor) > 1 ? p.pack : null;
    const d = existing
      ? { p, unit_id: existing.unit_id, quantity: existing.quantity, unit_price: existing.unit_price }
      : (() => {
        const use = pack ? { unit_id: pack.unit_id, factor: Number(pack.factor) } : { unit_id: p.base_unit_id, factor: 1 };
        return { p, unit_id: use.unit_id, quantity: '1', unit_price: priceFor(p, use.factor) };
      })();
    const pk = packText(p.stock_qty, p.base_unit_name, p.pack);

    const { close, el } = openModal({
      title: existing ? "O'zgartirish" : 'Nechta keldi?',
      body: `
        <form class="pick" id="pick" novalidate>
          <div class="pick-head">
            ${productPhoto(p, 'pick-img')}
            <div class="pick-info">
              <div class="pick-name">${esc(p.name)}</div>
              <div class="pick-now">Hozir omborda: <b>${num(p.stock_qty, 3)} ${esc(p.base_unit_name)}</b>${pk ? ` <span class="muted">(= ${esc(pk)})</span>` : ''}</div>
            </div>
          </div>
          <div class="field"><span>Nechta keldi?</span>
            <div class="pick-qty">
              <div class="qty-ctrl qty-lg"><button type="button" data-dec aria-label="Kamaytirish">−</button><input id="pk-q" inputmode="decimal" value="${esc(d.quantity)}" aria-label="Nechta keldi" autocomplete="off"><button type="button" data-inc aria-label="Ko'paytirish">+</button></div>
              ${units.length > 1
                ? `<div class="seg pick-units">${units.map((u) => `<button type="button" data-u="${u.unit_id}" class="${u.unit_id === d.unit_id ? 'active' : ''}">${esc(u.name)}</button>`).join('')}</div>`
                : `<span class="rl-unit">${esc(units[0].name)}</span>`}
            </div>
          </div>
          <label class="field"><span id="pk-pl"></span>
            <div class="money-input"><input class="input input-lg" id="pk-p" inputmode="decimal" placeholder="0" value="${esc(d.unit_price)}" autocomplete="off"><em>so'm</em></div></label>
          <div class="pick-result">
            <span class="rl-after" id="pk-after"></span>
            <span class="pick-sum">Summa: <b class="num" id="pk-sum"></b></span>
          </div>
          <div class="small muted" id="pk-hint"></div>
          <div id="pk-err"></div>
        </form>`,
      foot: `
        ${existing ? `<button class="btn btn-light" type="button" data-remove style="margin-right:auto">${icon('x', 'ico-sm')} Olib tashlash</button>` : ''}
        <button class="btn btn-outline" type="button" data-close>Bekor</button>
        <button class="btn btn-success" type="submit" form="pick">${icon('check', 'ico-sm')} ${existing ? 'Saqlash' : "Qo'shish"}</button>`,
    });
    const qIn = el.querySelector('#pk-q');
    const pIn = el.querySelector('#pk-p');
    const refresh = () => {
      d.quantity = qIn.value;
      d.unit_price = pIn.value;
      el.querySelector('#pk-pl').textContent = `1 ${unitOf(d).name} necha pulga oldingiz?`;
      el.querySelector('#pk-after').innerHTML = afterText(d);
      el.querySelector('#pk-sum').textContent = money(lineTotal(d));
      el.querySelector('#pk-hint').innerHTML = hintText(d);
    };
    refresh();
    el.addEventListener('click', (e) => {
      const step = e.target.closest('[data-inc], [data-dec]');
      if (step) {
        const delta = step.matches('[data-inc]') ? 1 : -1;
        qIn.value = String(Math.max(0, round4(toNum(qIn.value) + delta)));
        refresh();
        return;
      }
      const ub = e.target.closest('[data-u]');
      if (ub) {
        const oldF = unitOf(d).factor;
        d.unit_id = Number(ub.dataset.u);
        const price = toNum(pIn.value);
        if (price > 0) pIn.value = String(round2((price / oldF) * unitOf(d).factor));
        el.querySelectorAll('[data-u]').forEach((b) => b.classList.toggle('active', b === ub));
        refresh();
        return;
      }
      if (e.target.closest('[data-remove]')) {
        removeLine(p.id);
        close();
      }
    });
    qIn.addEventListener('input', refresh);
    pIn.addEventListener('input', refresh);
    el.querySelector('#pick').addEventListener('submit', (e) => {
      e.preventDefault();
      refresh();
      const err = (msg, input) => {
        el.querySelector('#pk-err').innerHTML = `<div class="alert alert-warn">${esc(msg)}</div>`;
        input.focus();
      };
      if (!(toNum(qIn.value) > 0)) return err('Nechta kelganini yozing', qIn);
      if (toNum(pIn.value) < 0) return err("Narx manfiy bo'lishi mumkin emas", pIn);
      putLine(p, { quantity: String(round4(toNum(qIn.value))), unitId: d.unit_id, price: pIn.value.trim() });
      close();
    });
    // Kompyuterda: darhol son yozish mumkin. Telefonda klaviatura o'zi ochilib, oynani yopib qo'ymasligi uchun fokus berilmaydi
    if (isWide()) { qIn.focus(); qIn.select(); }
  }

  async function addByCode(code) {
    let p = catalog.find((x) => x.barcode === code);
    if (!p) {
      const { product } = await get(`/products/barcode/${encodeURIComponent(code)}`);
      p = catalog.find((x) => x.id === product.id) || product;
    }
    openPicker(p);
  }

  async function newProduct() {
    const created = await openProductWizard({ name: q, arrival: true });
    if (!created.length) return;
    catalog = (await get('/products?limit=1000')).products;
    q = '';
    $('#pq').value = '';
    drawChips();
    drawGrid();
    const ask = [];
    for (const c of created) {
      const p = catalog.find((x) => x.id === c.id);
      if (!p) continue;
      const arrived = Number(c.arrived) || 0;
      const f = p.pack ? Number(p.pack.factor) : 1;
      // Yangi tovar oynasida «Nechta keldi?» yozilgan bo'lsa — to'g'ridan-to'g'ri ro'yxatga
      if (arrived > 0 && p.pack && Math.abs(arrived / f - Math.round(arrived / f)) < 1e-9) {
        putLine(p, { quantity: String(round4(arrived / f)), unitId: p.pack.unit_id, price: priceFor(p, f) });
      } else if (arrived > 0) {
        putLine(p, { quantity: String(arrived), unitId: p.base_unit_id, price: priceFor(p, 1) });
      } else {
        ask.push(p);
      }
    }
    if (ask.length) openPicker(ask[0]);
  }

  // ----- hodisalar -----
  $('#grid').addEventListener('click', (e) => {
    if (e.target.closest('[data-newprod]')) { newProduct().catch(errorToast); return; }
    const t = e.target.closest('[data-pid]');
    if (!t) return;
    const p = catalog.find((x) => x.id === Number(t.dataset.pid));
    if (p) openPicker(p);
  });
  $('#gchips').addEventListener('click', (e) => {
    const b = e.target.closest('[data-gf]');
    if (!b) return;
    filter = b.dataset.gf;
    shown = GRID_PAGE;
    drawChips();
    drawGrid();
  });
  let timer = null;
  $('#pq').addEventListener('input', (e) => {
    clearTimeout(timer);
    timer = setTimeout(() => { q = e.target.value.trim(); shown = GRID_PAGE; drawGrid(); }, 150);
  });
  // Enter: shtrix-kod skaneri yoki bitta topilgan tovar — o'sha tovar oynasi ochiladi
  $('#pq').addEventListener('keydown', async (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const text = e.target.value.trim();
    if (!text) return;
    q = text;
    const rows = gridRows();
    const exact = catalog.find((p) => p.barcode && p.barcode === text);
    try {
      if (exact) openPicker(exact);
      else if (rows.length === 1) openPicker(rows[0]);
      else if (/^\d{6,}$/.test(text)) await addByCode(text);
      else { drawGrid(); return; }
      e.target.value = '';
      q = '';
      drawGrid();
    } catch (err) { errorToast(err); e.target.select(); }
  });
  $('#cam')?.addEventListener('click', () => {
    openBarcodeScanner((code) => addByCode(code).catch(errorToast));
  });

  $('#lines').addEventListener('click', (e) => {
    const row = e.target.closest('.rl');
    if (!row) return;
    const l = lines[Number(row.dataset.i)];
    if (!l) return;
    if (e.target.closest('[data-del]')) removeLine(l.p.id);
    else if (e.target.closest('[data-edit]')) openPicker(l.p);
  });

  $('#pay3').addEventListener('click', (e) => {
    const b = e.target.closest('[data-pay]');
    if (!b) return;
    pay = b.dataset.pay;
    $('#pay3').querySelectorAll('[data-pay]').forEach((x) => {
      x.classList.toggle('on', x === b);
      x.innerHTML = `${x === b ? icon('check', 'ico-sm') : ''} ${{ full: "To'liq to'ladim", part: 'Bir qismini', debt: 'Qarzga oldim' }[x.dataset.pay]}`;
    });
    totals();
    if (pay === 'part') $('#paid').focus();
  });
  $('#method').addEventListener('click', (e) => {
    const b = e.target.closest('[data-m]');
    if (!b) return;
    method = b.dataset.m;
    $('#method').querySelectorAll('[data-m]').forEach((x) => x.classList.toggle('active', x === b));
  });
  ['#paid', '#dlv', '#dsc'].forEach((s) => $(s).addEventListener('input', totals));
  $('#sup').addEventListener('change', totals);

  // Mobil: pastdagi tugma «Kelgan yuk» bo'limiga olib tushadi; u ko'rinib tursa tugma yashiriladi
  $('#cartbar').addEventListener('click', () => $('#cart').scrollIntoView({ behavior: 'smooth', block: 'start' }));
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver(([en]) => { $('#cartbar')?.classList.toggle('away', en.isIntersecting); }, { threshold: 0.05 });
    io.observe($('#cart'));
  }

  // Yetkazib beruvchini shu yerning o'zida qo'shish
  $('#sup-new')?.addEventListener('click', () => {
    const { close, el } = openModal({
      title: 'Yangi yetkazib beruvchi',
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

  $('#save').addEventListener('click', (e) => {
    const warn = totals();
    if (warn) return toast(warn, 'warn');
    const subtotal = round2(lines.reduce((s, l) => s + lineTotal(l), 0));
    const total = round2(subtotal + toNum($('#dlv').value) - toNum($('#dsc').value));
    const paid = pay === 'full' ? total : pay === 'debt' ? 0 : toNum($('#paid').value);
    const body = {
      supplier_id: $('#sup').value ? Number($('#sup').value) : null,
      purchase_date: $('#pdate').value,
      note: $('#note').value.trim() || null,
      items: lines.map((l) => ({
        product_id: l.p.id,
        unit_id: l.unit_id,
        quantity: toNum(l.quantity),
        unit_price: toNum(l.unit_price),
      })),
      delivery_cost: toNum($('#dlv').value),
      discount: toNum($('#dsc').value),
      paid_amount: paid,
      payment_method: method,
      idempotency_key: key,
    };
    withBusy(e.currentTarget, async () => {
      try {
        const r = await post('/purchases', body);
        toast(lines.length === 1
          ? `Saqlandi! ${lines[0].p.name} omborga qo'shildi`
          : `Saqlandi! ${lines.length} xil tovar omborga qo'shildi`, 'ok');
        ctx.go(lines.length === 1 ? `#/products/${lines[0].p.id}` : `#/purchases/${r.purchase.id}`);
      } catch (err) {
        errorToast(err);
      }
    });
  });

  drawChips();
  drawGrid();
  drawLines();
  // Mahsulot sahifasidagi «Yuk keldi» tugmasidan kelinganda: o'sha tovar oynasi darhol ochiladi
  if (preselect) {
    history.replaceState(null, '', '#/purchases/new');
    const p = catalog.find((x) => x.id === preselect);
    if (p) openPicker(p);
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
        <thead><tr><th>Mahsulot</th><th class="right">Miqdor</th><th class="right">Narx</th><th class="right">Qator summasi</th><th class="right">1 birlik sizga tushdi</th></tr></thead>
        <tbody>${p.items.map((i) => `<tr>
          <td data-label="Mahsulot">${esc(i.product_name)}</td>
          <td data-label="Miqdor" class="right num">${num(i.quantity, 4)} ${esc(i.unit_name)}</td>
          <td data-label="Narx" class="right num">${money(i.unit_price)}</td>
          <td data-label="Qator summasi" class="right num">${money(i.line_total)}</td>
          <td data-label="1 birlik tushdi" class="right num">${money(i.unit_cost)}</td>
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
