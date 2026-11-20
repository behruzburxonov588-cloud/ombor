// Yangi tovar qo'shish — iloji boricha oddiy:
//   odatda faqat: rasm (ixtiyoriy), nomi, qanday sotasiz (dona/kg/litr/metr), sotuv narxi, kelish narxi, nechta bor.
//   kerak bo'lsa bir bosishda ochiladi:
//     - "Qutida, rulonda yoki blokda keladi" (1 rulon ichida 100 metr) — kelish narxi rulon uchun yozilsa, 1 metr narxi o'zi hisoblanadi
//     - "Har xil hajmi bor" (Pepsi 0,5 L, 1 L, 1,5 L) — har biri alohida tovar bo'lib saqlanadi
//     - "Shtrix-kod, kategoriya, yetkazib beruvchi"
// Rasm yuborishdan oldin telefonda kichraytiriladi (har qanday telefon rasmi yuklanadi).
// Sahifada (Mahsulotlar → Yangi tovar) va oynada (Yuk keldi → topilmasa) ishlaydi.
import { get, post, esc, icon, money, num, toast, openModal, withBusy, uploadProductImage } from './ui.js';
import { openBarcodeScanner, cameraScanSupported } from './scanner.js';

const MAIN_UNITS = ['piece', 'kg', 'l', 'm'];
const PACK_CODES = ['box', 'pack', 'roll', 'set'];
const UNIT_HINT = {
  piece: 'bittalab',
  kg: 'tortib',
  l: 'quyib',
  m: "o'lchab",
};

const toNum = (v) => {
  const n = Number(String(v ?? '').replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : NaN;
};
const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
const round4 = (n) => Math.round((n + Number.EPSILON) * 10000) / 10000;
const blankRow = () => ({ label: '', sell: '', cost: '', qty: '' });
const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);

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
  const fresh = () => ({
    name: '',
    baseUnitId: byCode('piece')?.id,
    packed: false,
    packUnitId: null,
    packFactor: '',
    variants: false,
    more: false,
    rows: [blankRow(), blankRow()],
    single: blankRow(),
    costPer: 'pack',
    qtyIn: 'pack',
    barcode: '',
    sku: '',
    cat: '',
    sup: '',
    min: '',
    image: null,
    imageUrl: '',
  });
  const st = { ...fresh(), name: opts.name || '' };
  // «Yuk keldi» ichidan ochilganda: miqdor — kelgan yuk (kirimga yoziladi), boshlang'ich qoldiq emas
  const QTY = opts.arrival ? 'Nechta keldi' : 'Nechta bor';

  const factor = () => (st.packed ? toNum(st.packFactor) : 1);
  const base = () => unitName(st.baseUnitId);
  const pack = () => unitName(st.packUnitId);
  const packReady = () => st.packed && st.packUnitId && factor() > 0;
  const costUnit = () => (packReady() && st.costPer === 'pack' ? pack() : base());
  const qtyUnit = () => (packReady() && st.qtyIn === 'pack' ? pack() : base());
  const costPerBase = (cost) => (packReady() && st.costPer === 'pack' ? cost / factor() : cost);
  const qtyBase = (q) => (packReady() && st.qtyIn === 'pack' ? q * factor() : q);

  function unitChips() {
    const main = MAIN_UNITS.map(byCode).filter(Boolean);
    const others = units.filter((u) => !MAIN_UNITS.includes(u.code));
    const otherSelected = others.some((u) => u.id === st.baseUnitId);
    return `
      <div class="unit-chips" role="radiogroup" aria-label="Qanday sotasiz">
        ${main.map((u) => `<button type="button" role="radio" aria-checked="${u.id === st.baseUnitId}" class="uchip${u.id === st.baseUnitId ? ' on' : ''}" data-base="${u.id}">
          <b>${esc(cap(u.name))}</b><span>${esc(UNIT_HINT[u.code] || '')}</span></button>`).join('')}
        <label class="uchip uchip-select${otherSelected ? ' on' : ''}"><b>Boshqa</b>
          <select id="base-other" aria-label="Boshqa birlik">
            <option value="">${otherSelected ? '' : 'tanlang…'}</option>
            ${others.map((u) => `<option value="${u.id}" ${u.id === st.baseUnitId ? 'selected' : ''}>${esc(u.name)}</option>`).join('')}
            <option value="new">+ yangi birlik…</option>
          </select></label>
      </div>`;
  }

  function packRow() {
    const options = units.filter((u) => u.id !== st.baseUnitId && (PACK_CODES.includes(u.code) || u.is_custom));
    return `
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
      <small class="muted">Masalan: 1 rulon ichida 100 metr · 1 blok ichida 12 dona · 1 qop ichida 50 kilogramm</small>`;
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
        : '<b class="red">zarar: sotuv narxi kelish narxidan past</b>');
    }
    if (q > 0 && packReady() && st.qtyIn === 'pack') parts.push(`omborga ${num(round4(qtyBase(q)), 4)} ${esc(base())} qo'shiladi`);
    return parts.join(' · ');
  }

  function preview() {
    const name = st.name.trim() || 'Tovar';
    const labels = st.rows.map((r) => r.label.trim()).filter(Boolean);
    return labels.length ? `Saqlanadi: ${labels.map((l) => `<b>${esc(`${name} ${l}`)}</b>`).join(', ')}` : '';
  }

  function priceSection() {
    if (st.variants) {
      return `
        ${packReady() ? `<div class="row small" style="gap:6px;flex-wrap:wrap">Kelish narxini qaysi biri uchun yozasiz: ${unitSwitch('cost')} · ${QTY} — ${unitSwitch('qty')}da</div>` : ''}
        <div class="vtable">
          <div class="vhead"><span>Hajmi yoki turi</span><span>Sotuv narxi (1 ${esc(base())})</span><span>Kelish narxi (1 ${esc(costUnit())})</span><span>${QTY} (${esc(qtyUnit())})</span><span></span></div>
          ${st.rows.map((r, i) => `
            <div class="vrow">
              <input class="input" data-row="${i}" data-f="label" placeholder="${['0,5 L', '1 L', '1,5 L'][i] || '2 L'}" value="${esc(r.label)}" aria-label="Hajmi">
              <input class="input" data-row="${i}" data-f="sell" inputmode="decimal" placeholder="Sotuv narxi" value="${esc(r.sell)}" aria-label="Sotuv narxi">
              <input class="input" data-row="${i}" data-f="cost" inputmode="decimal" placeholder="Kelish narxi" value="${esc(r.cost)}" aria-label="Kelish narxi">
              <input class="input" data-row="${i}" data-f="qty" inputmode="decimal" placeholder="${QTY}" value="${esc(r.qty)}" aria-label="${QTY}">
              <button class="icon-btn" type="button" data-delrow="${i}" aria-label="O'chirish" ${st.rows.length <= 1 ? 'disabled' : ''}>${icon('x', 'ico-sm')}</button>
              <div class="vhint" data-hint="${i}">${calcHint(r)}</div>
            </div>`).join('')}
        </div>
        <button class="btn btn-light btn-sm" type="button" id="addrow" style="justify-self:start">${icon('plus', 'ico-sm')} Yana hajm qo'shish</button>
        <div class="small muted" id="vpreview">${preview()}</div>`;
    }
    const r = st.single;
    return `
      <div class="price-grid">
        <label class="field"><span>Sotuv narxi *</span>
          <div class="money-input"><input class="input input-lg" data-f="sell" inputmode="decimal" placeholder="0" value="${esc(r.sell)}"><em>so'm · 1 ${esc(base())}</em></div></label>
        <div class="field"><span>Kelish narxi <small>(ixtiyoriy)</small></span>
          <div class="money-input"><input class="input input-lg" data-f="cost" inputmode="decimal" placeholder="0" value="${esc(r.cost)}"><em>so'm · 1 ${unitSwitch('cost')}</em></div></div>
        <div class="field"><span>${opts.arrival ? 'Nechta keldi?' : 'Hozir nechta bor?'} <small>(ixtiyoriy)</small></span>
          <div class="money-input"><input class="input input-lg" data-f="qty" inputmode="decimal" placeholder="0" value="${esc(r.qty)}"><em>${unitSwitch('qty')}</em></div></div>
      </div>
      <div class="calc-box" data-hint="single">${calcHint(r) || "Kelish narxini yozsangiz, har biridan qancha foyda qolishi shu yerda ko'rinadi"}</div>`;
  }

  const optToggle = (key, ico, title, hint) => `
    <button type="button" class="opt${st[key] ? ' on' : ''}" data-opt="${key}" aria-pressed="${st[key]}">
      <span class="opt-box">${st[key] ? icon('check', 'ico-xs') : ''}</span>
      <span class="opt-ico">${icon(ico, 'ico-sm')}</span>
      <span class="opt-text"><b>${esc(title)}</b><small>${esc(hint)}</small></span>
    </button>`;

  function moreFields() {
    return `
      <div class="form-grid two" style="gap:12px">
        ${st.variants ? '<p class="small muted" style="grid-column:1/-1">Shtrix-kodni har bir hajm uchun keyin tovar sahifasida qo\'shasiz.</p>' : `
        <div class="field"><span>Shtrix-kod</span>
          <div class="input-group"><input class="input" id="wbarcode" inputmode="numeric" maxlength="64" placeholder="Skaner bilan o'qiting yoki yozing" value="${esc(st.barcode)}">
            ${cameraScanSupported() ? `<button class="btn btn-light" type="button" id="wscan" aria-label="Kamera bilan o'qish" style="min-width:52px">${icon('camera')}</button>` : ''}</div></div>`}
        ${st.variants ? '' : `<label class="field"><span>Artikul (SKU) <small>— o'zingizning ichki kodingiz</small></span><input class="input" id="wsku" maxlength="64" placeholder="Masalan: PEP-05" value="${esc(st.sku)}"></label>`}
        <label class="field"><span>Kategoriya</span><input class="input" id="wcat" list="wcats" maxlength="60" placeholder="Masalan: Ichimliklar" value="${esc(st.cat)}">
          <datalist id="wcats">${refs.cats.map((c) => `<option value="${esc(c.name)}">`).join('')}</datalist></label>
        <label class="field"><span>Kimdan olasiz? (yetkazib beruvchi)</span>
          <select class="input" id="wsup"><option value="">— tanlanmagan —</option>${refs.sups.map((s) => `<option value="${s.id}" ${String(s.id) === String(st.sup) ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select></label>
        <label class="field"><span>Shundan kam qolsa ogohlantirsin (${esc(base())})</span><input class="input" id="wmin" inputmode="decimal" placeholder="0" value="${esc(st.min)}"></label>
      </div>`;
  }

  function render() {
    host.innerHTML = `
      <form id="wiz" class="pform" novalidate>
        <div class="pf-head">
          <label class="photo-pick${st.imageUrl ? ' has' : ''}" title="Rasm qo'shish">
            ${st.imageUrl ? `<img src="${esc(st.imageUrl)}" alt="Tovar rasmi">` : `${icon('camera')}<span>Rasm</span>`}
            <input type="file" accept="image/*" id="wimg" aria-label="Tovar rasmi">
          </label>
          <div class="pf-name">
            <label class="field"><span class="wq">Tovar nomi *</span>
              <input class="input input-lg" id="wname" maxlength="150" placeholder="Masalan: Pepsi, Mato atlas, Un oliy nav" value="${esc(st.name)}" autocomplete="off"></label>
            <small class="muted">${st.imageUrl ? 'Rasm tanlandi. Almashtirish uchun rasmni bosing' : 'Rasm ixtiyoriy: chapdagi katakni bosib suratga oling yoki galereyadan tanlang'}</small>
          </div>
        </div>

        <div class="pf-block">
          <div class="wq">Xaridorga qanday sotasiz?</div>
          ${unitChips()}
        </div>

        <div class="pf-opts">
          ${optToggle('packed', 'box', 'Qutida, rulonda yoki blokda keladi', 'Masalan: 1 rulon ichida 100 metr — kelish narxini rulon uchun yozasiz')}
          ${st.packed ? `<div class="opt-body">${packRow()}</div>` : ''}
          ${optToggle('variants', 'layers', 'Har xil hajmi bor', 'Masalan: Pepsi 0,5 L, 1 L, 1,5 L — bitta formada hammasini kiritasiz')}
        </div>

        <div class="pf-block">
          <div class="wq">${st.variants ? `Har bir hajm: narxi va ${opts.arrival ? 'nechta kelgani' : 'nechta borligi'}` : `Narxi va ${opts.arrival ? 'nechta keldi' : 'nechta bor'}`}</div>
          <div id="prices" class="pf-prices">${priceSection()}</div>
        </div>

        <div class="pf-opts">
          ${optToggle('more', 'sliders', "Shtrix-kod, kategoriya, kimdan olasiz", 'Ixtiyoriy — keyin ham qo\'shish mumkin')}
          ${st.more ? `<div class="opt-body">${moreFields()}</div>` : ''}
        </div>

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
      if (hint) hint.innerHTML = calcHint(row) || (i === undefined ? "Kelish narxini yozsangiz, har biridan qancha foyda qolishi shu yerda ko'rinadi" : '');
      if (inp.dataset.f === 'label') host.querySelector('#vpreview').innerHTML = preview();
    }));
    host.querySelectorAll('[data-cost-unit]').forEach((b) => b.addEventListener('click', () => { st.costPer = b.dataset.costUnit; refreshPrices(); }));
    host.querySelectorAll('[data-qty-unit]').forEach((b) => b.addEventListener('click', () => { st.qtyIn = b.dataset.qtyUnit; refreshPrices(); }));
    host.querySelector('#addrow')?.addEventListener('click', () => {
      st.rows.push(blankRow());
      refreshPrices();
      host.querySelector(`[data-row="${st.rows.length - 1}"][data-f="label"]`)?.focus();
    });
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
    $('#wimg').addEventListener('change', (e) => {
      const f = e.target.files[0];
      if (!f) return;
      if (st.imageUrl) URL.revokeObjectURL(st.imageUrl);
      st.image = f;
      st.imageUrl = URL.createObjectURL(f);
      render();
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
    host.querySelectorAll('[data-opt]').forEach((b) => b.addEventListener('click', () => {
      const key = b.dataset.opt;
      st[key] = !st[key];
      if (key === 'packed' && st.packed && !st.packUnitId) {
        const guess = { m: 'roll', kg: 'pack', piece: 'box', l: 'box' }[units.find((u) => u.id === st.baseUnitId)?.code];
        st.packUnitId = (guess && byCode(guess)?.id) || null;
      }
      render();
      if (key === 'packed' && st.packed) host.querySelector('#pack-factor')?.focus();
    }));
    $('#pack-unit')?.addEventListener('change', async (e) => {
      if (e.target.value === 'new') {
        const id = await newUnit('Qadoq nomi (masalan: blok, qop, yashik):');
        if (id) st.packUnitId = id;
      } else st.packUnitId = e.target.value ? Number(e.target.value) : null;
      render();
    });
    $('#pack-factor')?.addEventListener('input', (e) => { st.packFactor = e.target.value; refreshPrices(); });
    // Qo'shimcha maydonlar qayta chizilganda yo'qolmasligi uchun holatda saqlanadi
    $('#wbarcode')?.addEventListener('input', (e) => { st.barcode = e.target.value; });
    $('#wsku')?.addEventListener('input', (e) => { st.sku = e.target.value; });
    $('#wcat')?.addEventListener('input', (e) => { st.cat = e.target.value; });
    $('#wsup')?.addEventListener('change', (e) => { st.sup = e.target.value; });
    $('#wmin')?.addEventListener('input', (e) => { st.min = e.target.value; });
    bindPrices();
    $('#wscan')?.addEventListener('click', () => openBarcodeScanner((code) => { st.barcode = code; $('#wbarcode').value = code; }));
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
    const errEl = host.querySelector('#werr');
    const fail = (msg) => { errEl.innerHTML = `<div class="alert alert-bad">${esc(msg)}</div>`; errEl.scrollIntoView({ block: 'center' }); };
    errEl.innerHTML = '';
    const name = st.name.trim();
    if (!name) return fail('Tovar nomini yozing');
    if (!st.baseUnitId) return fail('Qanday sotishingizni tanlang (dona, kilogramm, litr, metr...)');
    if (st.packed && !st.packUnitId) return fail("Qadoq turini tanlang (quti, rulon, blok...) yoki «Qutida, rulonda keladi» belgisini olib tashlang");
    if (st.packed && !(factor() > 0)) return fail(`1 ${pack()} ichida nechta ${base()} borligini yozing`);
    const rows = st.variants ? st.rows.filter((r) => r.label.trim() || r.sell || r.cost || r.qty) : [st.single];
    if (!rows.length) return fail('Kamida bitta hajmni yozing (masalan: 0,5 L)');
    for (const r of rows) {
      if (st.variants && !r.label.trim()) return fail('Har bir qatorda hajmi yoki turini yozing (masalan: 1 L)');
      const sell = toNum(r.sell);
      if (r.sell === '' || !(sell >= 0)) return fail(st.variants ? `«${r.label}» uchun sotuv narxini yozing` : 'Sotuv narxini yozing');
      if (r.cost !== '' && !(toNum(r.cost) >= 0)) return fail("Kelish narxi noto'g'ri");
      if (r.qty !== '' && !(toNum(r.qty) >= 0)) return fail("Nechta borligi noto'g'ri yozilgan");
    }
    const minStock = st.min.trim() ? toNum(st.min) : 0;
    if (!(minStock >= 0)) return fail("Ogohlantirish miqdori noto'g'ri");

    let categoryId = null;
    try {
      if (st.cat.trim()) categoryId = (await post('/categories', { name: st.cat.trim() })).category.id;
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
        supplier_id: st.sup ? Number(st.sup) : null,
        category_id: categoryId,
        barcode: st.variants ? null : (st.barcode.trim() || null),
        sku: st.variants ? null : (st.sku.trim() || null),
      };
      const q = round4(qtyBase(qty));
      if (q > 0 && !opts.arrival) body.opening_qty = q;
      try {
        const res = await post('/products', body);
        created.push({ id: res.id, name: body.name, arrived: q });
      } catch (err) {
        const done = created.length ? ` (${created.map((c) => c.name).join(', ')} saqlandi)` : '';
        return fail(`«${body.name}» saqlanmadi: ${err.message}${done}`);
      }
    }
    // Rasm (har xil hajmlarda — hammasiga bir xil rasm)
    if (st.image) {
      for (const c of created) {
        try {
          await uploadProductImage(c.id, st.image);
        } catch (err) {
          toast(`Rasm yuklanmadi: ${err.message}. Tovar saqlandi — rasmni tovar sahifasidan qayta qo'shing`, 'warn');
          break;
        }
      }
    }
    toast(created.length > 1 ? `${created.length} ta tovar qo'shildi` : `«${created[0].name}» qo'shildi`, 'ok');
    if (again) {
      if (st.imageUrl) URL.revokeObjectURL(st.imageUrl);
      // Keyingi tovar uchun: birlik, qadoq va yetkazib beruvchi qoladi, qolgani tozalanadi
      Object.assign(st, { name: '', single: blankRow(), rows: [blankRow(), blankRow()], barcode: '', sku: '', image: null, imageUrl: '' });
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
      <div><h1>Yangi tovar</h1><p class="muted">Faqat nomi va sotuv narxi majburiy. Qolganini keyin ham qo'shish mumkin</p></div>
    </div>
    <div class="card" id="wizhost"><div class="empty">Yuklanmoqda…</div></div>`;
  await mountWizard(root.querySelector('#wizhost'), { name, onSaved, onCancel });
}

// Oyna ko'rinishi (masalan, Yuk keldi → tovar topilmasa). Saqlangan tovarlar ro'yxatini qaytaradi.
export function openProductWizard({ name = '', arrival = false } = {}) {
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
      arrival,
      modal: true,
      onSaved: (created) => { done = true; close(); resolve(created); },
      onCancel: () => close(),
    });
  });
}
