// Yangi tovar qo'shish: oddiy savollar bilan (savol-javob ko'rinishida).
//  - Qanday sotasiz? (dona, kilogramm, litr, metr...)
//  - Optomda qanday keladi? (1 rulon ichida 100 metr, 1 blok ichida 12 dona)
//  - Har xil hajmi bormi? (Pepsi 0,5 L, 1 L, 1,5 L — har biri alohida tovar bo'lib saqlanadi)
//  - Narxlar: kelish narxini qadoq (rulon) uchun yozsangiz, 1 metr narxi o'zi hisoblanadi.
// Sahifada (Mahsulotlar → Yangi tovar) va oynada (Yuk keldi → topilmasa) ishlaydi.
import { get, post, api, esc, icon, money, num, toast, openModal, withBusy } from './ui.js';
import { openBarcodeScanner, cameraScanSupported } from './scanner.js';

const MAIN_UNITS = ['piece', 'kg', 'l', 'm'];
const PACK_CODES = ['box', 'pack', 'roll', 'set'];
const UNIT_HINT = {
  piece: 'bitta-bitta (shisha, pachka, dona)',
  kg: 'tortib (un, shakar, guruch)',
  l: "quyib (yog', sut)",
  m: "o'lchab (mato, kabel, shlang)",
};

const toNum = (v) => {
  const n = Number(String(v ?? '').replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : NaN;
};
const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
const round4 = (n) => Math.round((n + Number.EPSILON) * 10000) / 10000;
const blankRow = () => ({ label: '', sell: '', cost: '', qty: '' });

async function loadRefs() {
  const [units, cats, sups] = await Promise.all([
    get('/units').then((r) => r.units),
    get('/categories').then((r) => r.categories).catch(() => []),
    get('/suppliers').then((r) => r.suppliers).catch(() => []),
  ]);
  return { units, cats, sups };
}

// host — forma joylashadigan element; opts: { name, modal, onSaved(created, { again }), onCancel }
async function mountWizard(host, opts) {
  const refs = await loadRefs();
  let units = refs.units;
  const byCode = (code) => units.find((u) => u.code === code);
  const unitName = (id) => units.find((u) => u.id === Number(id))?.name || '';
  const st = {
    name: opts.name || '',
    baseUnitId: byCode('piece')?.id,
    packed: false,
    packUnitId: null,
    packFactor: '',
    variants: false,
    rows: [blankRow(), blankRow()],
    single: blankRow(),
    costPer: 'pack',
    qtyIn: 'pack',
  };

  const factor = () => (st.packed ? toNum(st.packFactor) : 1);
  const base = () => unitName(st.baseUnitId);
  const pack = () => unitName(st.packUnitId);
  const packReady = () => st.packed && st.packUnitId && factor() > 0;
  const costUnit = () => (packReady() && st.costPer === 'pack' ? pack() : base());
  const qtyUnit = () => (packReady() && st.qtyIn === 'pack' ? pack() : base());
  const costPerBase = (cost) => (packReady() && st.costPer === 'pack' ? cost / factor() : cost);
  const qtyBase = (q) => (packReady() && st.qtyIn === 'pack' ? q * factor() : q);

  function unitTiles() {
    const main = MAIN_UNITS.map(byCode).filter(Boolean);
    const others = units.filter((u) => !MAIN_UNITS.includes(u.code));
    const otherSelected = others.some((u) => u.id === st.baseUnitId);
    return `
      <div class="choice-grid">
        ${main.map((u) => `<button type="button" class="choice${u.id === st.baseUnitId ? ' on' : ''}" data-base="${u.id}">
          <b>${esc(u.name[0].toUpperCase() + u.name.slice(1))}</b><span>${esc(UNIT_HINT[u.code] || '')}</span></button>`).join('')}
        <label class="choice choice-select${otherSelected ? ' on' : ''}"><b>Boshqa</b>
          <select class="input input-sm" id="base-other" aria-label="Boshqa birlik">
            <option value="">tanlang…</option>
            ${others.map((u) => `<option value="${u.id}" ${u.id === st.baseUnitId ? 'selected' : ''}>${esc(u.name)}</option>`).join('')}
            <option value="new">+ yangi birlik…</option>
          </select></label>
      </div>`;
  }

  function packSection() {
    const options = units.filter((u) => u.id !== st.baseUnitId && (PACK_CODES.includes(u.code) || u.is_custom));
    return `
      <div class="seg seg-wide" role="radiogroup" aria-label="Optomda qanday keladi">
        <button type="button" data-packed="0" class="${!st.packed ? 'active' : ''}">Donalab / o'lchab keladi</button>
        <button type="button" data-packed="1" class="${st.packed ? 'active' : ''}">Qutida, rulonda, qopda keladi</button>
      </div>
      ${st.packed ? `
        <div class="pack-row">
          <span class="pack-word">1</span>
          <select class="input" id="pack-unit" aria-label="Qadoq turi">
            <option value="">qadoq…</option>
            ${options.map((u) => `<option value="${u.id}" ${u.id === st.packUnitId ? 'selected' : ''}>${esc(u.name)}</option>`).join('')}
            <option value="new">+ boshqa (blok, qop, yashik…)</option>
          </select>
          <span class="pack-word">ichida</span>
          <input class="input" id="pack-factor" inputmode="decimal" placeholder="100" value="${esc(st.packFactor)}" aria-label="Nechta">
          <span class="pack-word">${esc(base())}</span>
        </div>
        <small class="muted">Masalan: 1 rulon ichida 100 metr · 1 blok ichida 12 dona · 1 qop ichida 50 kilogramm</small>` : ''}`;
  }

  function unitSwitch(kind) {
    if (!packReady()) return `<span class="unit-fixed">${esc(base())}</span>`;
    const val = kind === 'cost' ? st.costPer : st.qtyIn;
    return `<span class="mini-seg" role="radiogroup">
      <button type="button" data-${kind}-unit="pack" class="${val === 'pack' ? 'active' : ''}">${esc(pack())}</button>
      <button type="button" data-${kind}-unit="base" class="${val === 'base' ? 'active' : ''}">${esc(base())}</button></span>`;
  }

  function calcHint(r) {
    const sell = toNum(r.sell);
    const cost = toNum(r.cost);
    const q = toNum(r.qty);
    const parts = [];
    if (cost > 0 && packReady() && st.costPer === 'pack') {
      parts.push(`1 ${esc(base())} ${money(round2(costPerBase(cost)))}ga tushadi`);
    }
    if (cost > 0 && sell > 0) {
      const profit = sell - costPerBase(cost);
      parts.push(profit >= 0
        ? `har 1 ${esc(base())}dan foyda <b class="green">${money(round2(profit))}</b>`
        : `<b class="red">zarar: sotuv narxi kelish narxidan past</b>`);
    }
    if (q > 0 && packReady() && st.qtyIn === 'pack') parts.push(`omborga ${num(round4(qtyBase(q)), 4)} ${esc(base())} qo'shiladi`);
    return parts.join(' · ');
  }

  function priceSection() {
    if (st.variants) {
      return `
        ${packReady() ? `<div class="row small" style="gap:6px;flex-wrap:wrap;margin-bottom:6px">Kelish narxini qaysi biri uchun yozasiz: ${unitSwitch('cost')} · Hozir borni nimada yozasiz: ${unitSwitch('qty')}</div>` : ''}
        <div class="vtable">
          <div class="vhead"><span>Hajmi yoki turi</span><span>Sotuv narxi (1 ${esc(base())})</span><span>Kelish narxi (1 ${esc(costUnit())})</span><span>Hozir bor (${esc(qtyUnit())})</span><span></span></div>
          ${st.rows.map((r, i) => `
            <div class="vrow">
              <input class="input" data-row="${i}" data-f="label" placeholder="${i === 0 ? '0,5 L' : i === 1 ? '1 L' : '1,5 L'}" value="${esc(r.label)}" aria-label="Hajmi">
              <input class="input" data-row="${i}" data-f="sell" inputmode="decimal" placeholder="0" value="${esc(r.sell)}" aria-label="Sotuv narxi">
              <input class="input" data-row="${i}" data-f="cost" inputmode="decimal" placeholder="0" value="${esc(r.cost)}" aria-label="Kelish narxi">
              <input class="input" data-row="${i}" data-f="qty" inputmode="decimal" placeholder="0" value="${esc(r.qty)}" aria-label="Hozir bor">
              <button class="icon-btn" type="button" data-delrow="${i}" aria-label="O'chirish" ${st.rows.length <= 1 ? 'disabled' : ''}>${icon('x', 'ico-sm')}</button>
              <div class="vhint" data-hint="${i}">${calcHint(r)}</div>
            </div>`).join('')}
        </div>
        <div class="row" style="justify-content:space-between;flex-wrap:wrap;gap:8px">
          <button class="btn btn-light btn-sm" type="button" id="addrow">${icon('plus', 'ico-sm')} Yana hajm qo'shish</button>
        </div>
        <div class="small muted" id="vpreview">${preview()}</div>`;
    }
    const r = st.single;
    return `
      <div class="form-grid two" style="gap:12px">
        <label class="field"><span>Sotuv narxi: 1 ${esc(base())} necha so'm? *</span>
          <input class="input input-lg" data-f="sell" inputmode="decimal" placeholder="0" value="${esc(r.sell)}"></label>
        <div class="field"><span>Kelish narxi: necha so'mga olasiz?</span>
          <div class="input-group"><input class="input input-lg" data-f="cost" inputmode="decimal" placeholder="0" value="${esc(r.cost)}">
            <span class="ig-suffix">1 ${unitSwitch('cost')} uchun</span></div></div>
        <div class="field"><span>Hozir omborda qancha bor? (ixtiyoriy)</span>
          <div class="input-group"><input class="input input-lg" data-f="qty" inputmode="decimal" placeholder="0" value="${esc(r.qty)}">
            <span class="ig-suffix">${unitSwitch('qty')}</span></div></div>
        <div class="calc-box" data-hint="single">${calcHint(r) || "Narxlarni yozsangiz, foyda shu yerda ko'rinadi"}</div>
      </div>`;
  }

  function preview() {
    const name = st.name.trim() || 'Tovar';
    const labels = st.rows.map((r) => r.label.trim()).filter(Boolean);
    return labels.length ? `Qo'shiladi: ${labels.map((l) => `<b>${esc(`${name} ${l}`)}</b>`).join(', ')}` : '';
  }

  function render() {
    host.innerHTML = `
      <form id="wiz" class="wizard" novalidate>
        <section class="wstep">
          <div class="wnum">1</div>
          <div class="wbody">
            <label class="field"><span class="wq">Tovar nomi *</span>
              <input class="input input-lg" id="wname" maxlength="150" placeholder="Masalan: Pepsi, Mato atlas, Un oliy nav" value="${esc(st.name)}" autocomplete="off"></label>
          </div>
        </section>

        <section class="wstep">
          <div class="wnum">2</div>
          <div class="wbody">
            <div class="wq">Xaridorga qanday sotasiz?</div>
            <div class="muted small" style="margin:-2px 0 8px">Narx va qoldiq shu birlikda hisoblanadi</div>
            ${unitTiles()}
          </div>
        </section>

        <section class="wstep">
          <div class="wnum">3</div>
          <div class="wbody">
            <div class="wq">Optomda qanday olib kelasiz?</div>
            ${packSection()}
          </div>
        </section>

        <section class="wstep">
          <div class="wnum">4</div>
          <div class="wbody">
            <div class="wq">Har xil hajmi yoki turi bormi?</div>
            <div class="seg seg-wide" role="radiogroup" aria-label="Har xil hajmi bormi">
              <button type="button" data-variants="0" class="${!st.variants ? 'active' : ''}">Yo'q, bitta tovar</button>
              <button type="button" data-variants="1" class="${st.variants ? 'active' : ''}">Ha (masalan: 0,5 L, 1 L, 1,5 L)</button>
            </div>
            ${st.variants ? '<small class="muted">Har bir hajm alohida tovar bo\'lib saqlanadi: o\'z narxi, qoldig\'i va shtrix-kodi bilan</small>' : ''}
          </div>
        </section>

        <section class="wstep">
          <div class="wnum">5</div>
          <div class="wbody">
            <div class="wq">Narxi va qoldig'i</div>
            <div id="prices">${priceSection()}</div>
          </div>
        </section>

        <details class="wmore">
          <summary>${icon('sliders', 'ico-sm')} Qo'shimcha: shtrix-kod, kategoriya, yetkazib beruvchi, ogohlantirish, rasm</summary>
          <div class="form-grid two" style="gap:12px;margin-top:12px">
            ${st.variants ? '<p class="small muted" style="grid-column:1/-1">Shtrix-kod va rasmni har bir hajm uchun keyin tovar sahifasida qo\'shasiz.</p>' : `
            <div class="field"><span>Shtrix-kod</span>
              <div class="input-group"><input class="input" id="wbarcode" inputmode="numeric" maxlength="64" placeholder="Skaner bilan o'qiting yoki yozing">
                ${cameraScanSupported() ? `<button class="btn btn-light" type="button" id="wscan" aria-label="Kamera bilan o'qish" style="min-width:52px">${icon('camera')}</button>` : ''}</div></div>`}
            <label class="field"><span>Kategoriya</span><input class="input" id="wcat" list="wcats" maxlength="60" placeholder="Masalan: Ichimliklar">
              <datalist id="wcats">${refs.cats.map((c) => `<option value="${esc(c.name)}">`).join('')}</datalist></label>
            <label class="field"><span>Yetkazib beruvchi</span>
              <select class="input" id="wsup"><option value="">— tanlanmagan —</option>${refs.sups.map((s) => `<option value="${s.id}">${esc(s.name)}</option>`).join('')}</select></label>
            <label class="field"><span>Shundan kam qolsa ogohlantirsin (${esc(base())})</span><input class="input" id="wmin" inputmode="decimal" placeholder="0"></label>
            ${st.variants ? '' : `<div class="field"><span>Rasm</span>
              <label class="btn btn-light btn-sm file-btn" style="align-self:flex-start">${icon('image', 'ico-sm')} Rasm tanlash<input type="file" accept="image/jpeg,image/png,image/webp" id="wimg"></label>
              <small id="wimgname">JPG, PNG yoki WEBP, 3 MB gacha</small></div>`}
          </div>
        </details>

        <div id="werr"></div>
        <div class="wactions">
          <button class="btn btn-lg" type="submit" data-save>${icon('check')} Saqlash</button>
          ${opts.modal ? '' : `<button class="btn btn-lg btn-light" type="submit" data-again="1">${icon('plus')} Saqlab, yana qo'shish</button>`}
          <button class="btn btn-lg btn-outline" type="button" data-cancel>Bekor qilish</button>
        </div>
      </form>`;
    bind();
  }

  function refreshPrices() {
    host.querySelector('#prices').innerHTML = priceSection();
    bindPrices();
  }

  function bindPrices() {
    host.querySelectorAll('#prices [data-f]').forEach((inp) => inp.addEventListener('input', () => {
      const i = inp.dataset.row;
      const row = i === undefined ? st.single : st.rows[Number(i)];
      row[inp.dataset.f] = inp.value;
      const hint = host.querySelector(`[data-hint="${i === undefined ? 'single' : i}"]`);
      if (hint) hint.innerHTML = calcHint(row) || (i === undefined ? "Narxlarni yozsangiz, foyda shu yerda ko'rinadi" : '');
      if (inp.dataset.f === 'label') host.querySelector('#vpreview').innerHTML = preview();
    }));
    host.querySelectorAll('[data-cost-unit]').forEach((b) => b.addEventListener('click', () => { st.costPer = b.dataset.costUnit; refreshPrices(); }));
    host.querySelectorAll('[data-qty-unit]').forEach((b) => b.addEventListener('click', () => { st.qtyIn = b.dataset.qtyUnit; refreshPrices(); }));
    host.querySelector('#addrow')?.addEventListener('click', () => { st.rows.push(blankRow()); refreshPrices(); host.querySelector(`[data-row="${st.rows.length - 1}"][data-f="label"]`)?.focus(); });
    host.querySelectorAll('[data-delrow]').forEach((b) => b.addEventListener('click', () => { st.rows.splice(Number(b.dataset.delrow), 1); refreshPrices(); }));
  }

  async function newUnit(question) {
    const name = (window.prompt(question) || '').trim();
    if (!name) return null;
    try {
      const r = await post('/units', { name });
      units = [...units, r.unit];
      return r.unit.id;
    } catch (err) {
      const found = units.find((u) => u.name.toLowerCase() === name.toLowerCase());
      if (found) return found.id;
      toast(err.message, 'warn');
      return null;
    }
  }

  function bind() {
    const $ = (s) => host.querySelector(s);
    $('#wname').addEventListener('input', (e) => {
      st.name = e.target.value;
      const pv = host.querySelector('#vpreview');
      if (pv) pv.innerHTML = preview();
    });
    host.querySelectorAll('[data-base]').forEach((b) => b.addEventListener('click', () => {
      st.baseUnitId = Number(b.dataset.base);
      if (st.packUnitId === st.baseUnitId) st.packUnitId = null;
      render();
    }));
    $('#base-other').addEventListener('change', async (e) => {
      if (e.target.value === 'new') {
        const id = await newUnit("Yangi o'lchov birligi nomi (masalan: juft, varaq):");
        if (id) st.baseUnitId = id;
      } else if (e.target.value) st.baseUnitId = Number(e.target.value);
      if (st.packUnitId === st.baseUnitId) st.packUnitId = null;
      render();
    });
    host.querySelectorAll('[data-packed]').forEach((b) => b.addEventListener('click', () => {
      st.packed = b.dataset.packed === '1';
      if (st.packed && !st.packUnitId) {
        const guess = { m: 'roll', kg: 'pack', piece: 'box', l: 'box' }[units.find((u) => u.id === st.baseUnitId)?.code];
        st.packUnitId = (guess && byCode(guess)?.id) || null;
      }
      render();
    }));
    $('#pack-unit')?.addEventListener('change', async (e) => {
      if (e.target.value === 'new') {
        const id = await newUnit('Qadoq nomi (masalan: blok, qop, yashik):');
        if (id) st.packUnitId = id;
      } else st.packUnitId = e.target.value ? Number(e.target.value) : null;
      render();
    });
    $('#pack-factor')?.addEventListener('input', (e) => { st.packFactor = e.target.value; refreshPrices(); });
    host.querySelectorAll('[data-variants]').forEach((b) => b.addEventListener('click', () => {
      st.variants = b.dataset.variants === '1';
      render();
    }));
    bindPrices();
    $('#wscan')?.addEventListener('click', () => openBarcodeScanner((code) => { $('#wbarcode').value = code; }));
    $('#wimg')?.addEventListener('change', (e) => {
      const f = e.target.files[0];
      $('#wimgname').textContent = f ? f.name : 'JPG, PNG yoki WEBP, 3 MB gacha';
    });
    host.querySelector('[data-cancel]').addEventListener('click', () => opts.onCancel?.());
    $('#wiz').addEventListener('submit', (e) => {
      e.preventDefault();
      const again = e.submitter?.dataset.again === '1';
      const btn = e.submitter || host.querySelector('[data-save]');
      withBusy(btn, () => save(again));
    });
    if (!st.name) $('#wname').focus();
  }

  async function save(again) {
    const $ = (s) => host.querySelector(s);
    const errEl = $('#werr');
    const fail = (msg) => { errEl.innerHTML = `<div class="alert alert-bad">${esc(msg)}</div>`; errEl.scrollIntoView({ block: 'center' }); };
    errEl.innerHTML = '';
    const name = st.name.trim();
    if (!name) return fail('Tovar nomini yozing');
    if (!st.baseUnitId) return fail('Qanday sotishingizni tanlang (dona, kilogramm, litr, metr...)');
    if (st.packed && !st.packUnitId) return fail('Qadoq turini tanlang (quti, rulon, qop...) yoki «Donalab / o\'lchab keladi» ni tanlang');
    if (st.packed && !(factor() > 0)) return fail(`1 ${pack()} ichida nechta ${base()} borligini yozing`);
    const rows = st.variants ? st.rows.filter((r) => r.label.trim() || r.sell || r.cost || r.qty) : [st.single];
    if (!rows.length) return fail("Kamida bitta hajmni yozing (masalan: 0,5 L)");
    for (const r of rows) {
      if (st.variants && !r.label.trim()) return fail('Har bir qatorda hajmi yoki turini yozing (masalan: 1 L)');
      const sell = toNum(r.sell);
      if (!(sell >= 0) || r.sell === '') return fail(st.variants ? `«${r.label}» uchun sotuv narxini yozing` : 'Sotuv narxini yozing');
      if (r.cost !== '' && !(toNum(r.cost) >= 0)) return fail("Kelish narxi noto'g'ri");
      if (r.qty !== '' && !(toNum(r.qty) >= 0)) return fail("Qoldiq noto'g'ri");
    }
    const minStock = $('#wmin').value.trim() ? toNum($('#wmin').value) : 0;
    if (!(minStock >= 0)) return fail("Ogohlantirish miqdori noto'g'ri");

    let categoryId = null;
    const catName = $('#wcat').value.trim();
    try {
      if (catName) categoryId = (await post('/categories', { name: catName })).category.id;
    } catch (err) {
      return fail(err.message);
    }
    const created = [];
    for (const r of rows) {
      const cost = r.cost === '' ? 0 : toNum(r.cost);
      const qty = r.qty === '' ? 0 : toNum(r.qty);
      const body = {
        name: st.variants ? `${name} ${r.label.trim()}` : name,
        base_unit_id: st.baseUnitId,
        selling_price: toNum(r.sell),
        purchase_price: round2(costPerBase(cost)),
        min_stock: minStock,
        conversions: packReady() ? [{ unit_id: st.packUnitId, factor: round4(factor()) }] : [],
        supplier_id: $('#wsup').value ? Number($('#wsup').value) : null,
        category_id: categoryId,
        barcode: st.variants ? null : ($('#wbarcode')?.value.trim() || null),
      };
      const q = round4(qtyBase(qty));
      if (q > 0) body.opening_qty = q;
      try {
        const res = await post('/products', body);
        created.push({ id: res.id, name: body.name });
      } catch (err) {
        const done = created.length ? ` (${created.map((c) => c.name).join(', ')} saqlandi)` : '';
        return fail(`«${body.name}» saqlanmadi: ${err.message}${done}`);
      }
    }
    const file = $('#wimg')?.files?.[0];
    if (file && created.length === 1) {
      const fd = new FormData();
      fd.append('image', file);
      await api('POST', `/products/${created[0].id}/image`, fd).catch((err) => toast(`Rasm yuklanmadi: ${err.message}`, 'warn'));
    }
    toast(created.length > 1 ? `${created.length} ta tovar qo'shildi` : `«${created[0].name}» qo'shildi`, 'ok');
    if (again) {
      Object.assign(st, { name: '', single: blankRow(), rows: [blankRow(), blankRow()] });
      render();
      window.scrollTo({ top: 0 });
    }
    await opts.onSaved?.(created, { again });
    return undefined;
  }

  render();
}

// Sahifa ko'rinishi (Mahsulotlar → Yangi tovar)
export async function renderProductWizard(root, { name = '', onSaved, onCancel } = {}) {
  root.innerHTML = `
    <div class="page-head">
      <div><h1>Yangi tovar</h1><p class="muted">5 ta oddiy savolga javob bering. Majburiylari: nomi va sotuv narxi</p></div>
    </div>
    <div class="card" id="wizhost"><div class="empty">Yuklanmoqda…</div></div>`;
  await mountWizard(root.querySelector('#wizhost'), { name, onSaved, onCancel });
}

// Oyna ko'rinishi (masalan, Yuk keldi → tovar topilmasa). Saqlangan tovarlar ro'yxatini qaytaradi.
export function openProductWizard({ name = '' } = {}) {
  return new Promise((resolve) => {
    let done = false;
    const { close, el } = openModal({
      title: 'Yangi tovar',
      wide: true,
      body: '<div id="wizmodal"><div class="empty">Yuklanmoqda…</div></div>',
      onClose: () => { if (!done) resolve([]); },
    });
    mountWizard(el.querySelector('#wizmodal'), {
      name,
      modal: true,
      onSaved: (created) => { done = true; close(); resolve(created); },
      onCancel: () => close(),
    });
  });
}
