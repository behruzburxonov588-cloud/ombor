// Yangi tovar qo'shish — iloji boricha oddiy:
//   odatda faqat: rasm (ixtiyoriy), nomi, qanday sotasiz (dona/kg/litr/metr), sotuv narxi, kelish narxi, nechta bor.
//   kerak bo'lsa bir bosishda ochiladi:
//     - "Qutida, rulonda yoki blokda keladi" (1 rulon ichida 100 metr) — kelish narxi rulon uchun yozilsa, 1 metr narxi o'zi hisoblanadi
//     - "Har xil hajmi bor" (Pepsi 0,5 L, 1 L, 1,5 L) — har biri alohida tovar bo'lib saqlanadi
//     - "Shtrix-kod, kategoriya, yetkazib beruvchi"
// Rasm yuborishdan oldin telefonda kichraytiriladi (har qanday telefon rasmi yuklanadi).
// Sahifada (Mahsulotlar → Yangi tovar) va oynada (Yuk keldi → topilmasa) ishlaydi.
import { get, post, esc, icon, money, num, toast, openModal, withBusy, uploadProductImage, parseMoney, storeTypes } from './ui.js';
import { openBarcodeScanner, cameraScanSupported } from './scanner.js';

const MAIN_UNITS = ['piece', 'kg', 'l', 'm'];
const PACK_CODES = ['box', 'pack', 'roll', 'set', 'can', 'barrel', 'bag', 'block', 'crate', 'bottle'];
const UNIT_HINT = {
  piece: 'bittalab',
  kg: 'tortib',
  g: 'grammlab',
  l: 'quyib',
  ml: 'millilitrlab',
  m: "o'lchab",
  pair: 'juftlab',
  set: "to'plamlab",
  bag: 'qoplab',
  roll: 'rulonlab',
  t: 'tonnalab',
  m2: 'kv. metrlab',
  m3: 'kub metrlab',
};
// Ko'p ishlatiladigan ranglar (kiyim, poyabzal, aksessuar)
const COLOR_PRESETS = ['Oq', 'Qora', 'Kulrang', "Ko'k", "To'q ko'k", 'Qizil', 'Yashil', 'Jigarrang', 'Bej', 'Pushti', 'Sariq'];
const COLOR_HEX = {
  oq: '#ffffff', qora: '#1f2328', kulrang: '#9aa3ae', "ko'k": '#3b82f6', "to'q ko'k": '#1e3a8a', qizil: '#dc2626', yashil: '#16a34a',
  jigarrang: '#8b5a2b', bej: '#e8d9bd', pushti: '#f472b6', sariq: '#facc15',
};
const colorHex = (c) => COLOR_HEX[String(c).toLowerCase()] || '#cbd5e1';

const toNum = (v) => {
  const n = Number(String(v ?? '').replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : NaN;
};
// Narxlar: "12.000" ham, "12 000" ham 12 000 so'm (ui.js → parseMoney)
const toMoney = (v) => parseMoney(v);
const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
const round4 = (n) => Math.round((n + Number.EPSILON) * 10000) / 10000;
const blankRow = () => ({ label: '', sell: '', cost: '', qty: '' });
const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);

async function loadRefs() {
  const [units, cats, sups, cfg, settings] = await Promise.all([
    get('/units').then((r) => r.units),
    get('/categories').then((r) => r.categories).catch(() => []),
    get('/suppliers').then((r) => r.suppliers).catch(() => []),
    storeTypes().catch(() => ({ types: [], fields: {} })),
    get('/settings').then((r) => r.settings).catch(() => ({})),
  ]);
  // Do'kon turi(lari): formada faqat shu turga kerakli birlik va maydonlar ko'rsatiladi
  const picked = (settings.store_types || []).map((k) => cfg.types.find((t) => t.key === k)).filter(Boolean);
  return { units, cats, sups, cfg, picked };
}

// host — forma joylashadigan element; opts: { name, modal, onSaved(created, { again }), onCancel }
// Tez tanlanadigan o'lchamlar (kiyim, poyabzal, ichimlik)
// key — do'kon turi sozlamasidagi nom (storetypes.js → form.presets)
const SIZE_PRESETS = [
  { key: 'sml', name: 'S M L XL XXL', labels: ['S', 'M', 'L', 'XL', 'XXL'] },
  { key: 'xs3xl', name: 'XS – 3XL', labels: ['XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL'] },
  { key: 'shirt', name: "Ko'ylak 48–60", labels: ['48', '50', '52', '54', '56', '58', '60'] },
  { key: 'wear', name: 'Kiyim 42–56', labels: ['42', '44', '46', '48', '50', '52', '54', '56'] },
  { key: 'shoes', name: 'Poyabzal 36–45', labels: ['36', '37', '38', '39', '40', '41', '42', '43', '44', '45'] },
  { key: 'kidshoes', name: 'Bolalar poyabzali 25–35', labels: ['25', '26', '27', '28', '29', '30', '31', '32', '33', '34', '35'] },
  { key: 'kids', name: 'Bolalar 92–140', labels: ['92', '98', '104', '110', '116', '122', '128', '134', '140'] },
  { key: 'liters', name: '0,5 L · 1 L · 1,5 L', labels: ['0,5 L', '1 L', '1,5 L'] },
  { key: 'grams', name: '250 g · 500 g · 1 kg', labels: ['250 g', '500 g', '1 kg'] },
  { key: 'ml', name: '50 ml · 100 ml · 200 ml', labels: ['50 ml', '100 ml', '200 ml'] },
  { key: 'mm', name: '10 · 12 · 14 · 16 mm', labels: ['10 mm', '12 mm', '14 mm', '16 mm'] },
  { key: 'gb', name: '64 · 128 · 256 GB', labels: ['64 GB', '128 GB', '256 GB'] },
  { key: 'std', name: 'Standart', labels: ['Standart'] },
];

// «48-60» yoki «48–60» → 48, 50, ... 60. Kiyim o'lchamlari (42 va undan katta, juft) — 2 tadan, poyabzal va boshqalar — 1 tadan
function expandRange(text, stepGiven) {
  const m = String(text).trim().match(/^(\d{1,3})\s*[-–—]\s*(\d{1,3})$/);
  if (!m) return [text];
  let a = Number(m[1]);
  let b = Number(m[2]);
  if (a > b) [a, b] = [b, a];
  const step = stepGiven || (a >= 42 && a % 2 === 0 && b % 2 === 0 ? 2 : 1);
  if ((b - a) / step > 40) return [text];
  const out = [];
  for (let v = a; v <= b; v += step) out.push(String(v));
  return out;
}

async function mountWizard(host, opts) {
  const refs = await loadRefs();
  let units = refs.units;
  const byCode = (code) => units.find((u) => u.code === code);
  const picked = refs.picked;
  // Asosiy birlik tugmalari: do'kon turiga mos (masalan, poyabzal — juft, qurilish — kub metr, qop)
  const mainUnits = picked.length ? [...new Set(picked.flatMap((t) => t.units))].filter((c) => byCode(c)).slice(0, 6) : MAIN_UNITS;
  // Bitta turli do'kon (masalan, mato) — o'sha turning asosiy birligi; aralash do'kon — dona
  const firstUnit = (picked.length === 1 ? byCode(mainUnits[0])?.id : (mainUnits.includes('piece') && byCode('piece')?.id)) || byCode(mainUnits[0])?.id || byCode('piece')?.id;
  // O'lcham/rang yoqilganda: kiyim — dona, poyabzal — juft (agar birlik qo'lda tanlanmagan bo'lsa).
  // Mato, aksessuar kabi faqat rangli do'konda birlik o'zgarmaydi (mato rangi ham metrlab sotiladi)
  const variantUnit = () => {
    if (!picked.length) return byCode('piece')?.id;
    if (picked.some((t) => t.variants === 'sizes')) return byCode('piece')?.id;
    if (picked.some((t) => t.variants === 'shoes')) return byCode('pair')?.id || byCode('piece')?.id;
    return null;
  };
  const colorsOn = !picked.length || picked.some((t) => t.colors);
  // Do'kon turiga mos forma: «Boshqa do'kon» yoki tur tanlanmagan bo'lsa — hammasi (umumiy)
  const generic = !picked.length || picked.some((t) => !t.form);
  const forms = picked.map((t) => t.form).filter(Boolean);
  const one = !generic && forms.length === 1 ? forms[0] : null;
  const union = (k) => [...new Set(forms.flatMap((f) => f[k] || []))];
  const moreUnitCodes = generic ? null : union('more_units');
  const packCodes = generic ? PACK_CODES : union('packs');
  const presetKeys = generic ? SIZE_PRESETS.map((x) => x.key) : union('presets');
  const sizesOn = presetKeys.length > 0;
  const packText = one?.pack || (generic ? ['Qutida, rulonda yoki blokda keladi', 'Masalan: 1 rulon ichida 100 metr — kelish narxini rulon uchun yozasiz']
    : ['Qadoqda keladi (quti, rulon, qop...)', 'Masalan: 1 quti ichida 12 dona — kelish narxini qadoq uchun yozasiz']);
  const variantText = one?.variant || [
    sizesOn ? (colorsOn ? "O'lchami yoki rangi bor" : "Har xil o'lchami bor") : 'Rangi bor',
    sizesOn ? (colorsOn ? "Masalan: S, M, L yoki 38, 39 va qora, oq. Har birining qoldig'i alohida ko'rinadi" : "Masalan: S, M, L yoki 38, 39, 40. Har birining qoldig'i alohida ko'rinadi")
      : "Masalan: qora, oq, ko'k. Har bir rangning qoldig'i alohida ko'rinadi",
  ];
  const namePh = one?.name || 'Masalan: Pepsi 1 L, Futbolka oq, Un oliy nav';
  const catPh = picked.find((t) => t.categories?.length)?.categories[0] || 'Ichimliklar';
  // Qo'shimcha maydonlar (brend, IMEI, OEM...) — faqat tanlangan turlarga keraklilari
  const attrKeys = [...new Set((picked.length ? picked : [{ fields: ['brand', 'color'] }]).flatMap((t) => t.fields))].filter((k) => refs.cfg.fields?.[k]);
  const showExpiry = !picked.length || picked.some((t) => t.expiry);
  // O'lcham tugmalari: poyabzal do'konida — poyabzal o'lchamlari birinchi
  const presets = SIZE_PRESETS.filter((x) => presetKeys.includes(x.key));
  // «48 dan 60 gacha» oralig'i — faqat kiyim va poyabzal o'lchamlari uchun
  const rangeOn = generic || presetKeys.some((k) => ['shirt', 'wear', 'shoes', 'kidshoes', 'kids'].includes(k));
  const sizeNoun = /hajm/.test(variantText[0]) ? 'hajmlari' : /turi/.test(variantText[0]) ? 'turlari' : "o'lchamlari";
  const unitName = (id) => units.find((u) => u.id === Number(id))?.name || '';
  const fresh = () => ({
    name: '',
    baseUnitId: firstUnit,
    colors: [],
    cq: {},
    attrs: {},
    packed: false,
    packUnitId: null,
    packFactor: '',
    variants: false,
    sizePrice: false,
    more: false,
    rows: [],
    single: blankRow(),
    costPer: 'pack',
    qtyIn: 'pack',
    barcode: '',
    sku: '',
    cat: '',
    sup: '',
    min: '',
    desc: '',
    expiry: '',
    image: null,
    imageUrl: '',
  });
  const st = { ...fresh(), name: opts.name || '' };
  if (opts.prefill) {
    const p0 = opts.prefill;
    const pk = (p0.conversions || []).filter((c) => Number(c.factor) > 1).sort((a, b) => b.factor - a.factor)[0];
    Object.assign(st, {
      name: `${p0.model_name || p0.name} (nusxa)`,
      baseUnitId: p0.base_unit_id,
      packed: Boolean(pk), packUnitId: pk ? pk.unit_id : null, packFactor: pk ? String(pk.factor) : '', costPer: 'base',
      single: { ...blankRow(), sell: p0.selling_price ? String(p0.selling_price) : '', cost: Number(p0.purchase_price) > 0 ? String(p0.purchase_price) : '' },
      cat: p0.category_name || '', sup: p0.supplier_id ? String(p0.supplier_id) : '', min: Number(p0.min_stock) > 0 ? String(p0.min_stock) : '',
      desc: p0.description || '', attrs: { ...(p0.attributes || {}) },
      more: Boolean(p0.supplier_id || p0.description || Object.keys(p0.attributes || {}).length),
    });
  }
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
  // Rulonli tovar (qadoq — rulon): har bir rulon uzunligi alohida yoziladi (50, 45, 60 metr...)
  const rollOpen = () => !st.variants && !opts.arrival && packReady() && st.qtyIn === 'pack' && pack().toLowerCase() === 'rulon';
  const rollCount = () => Math.min(100, Math.max(0, Math.floor(toNum(st.single.qty) || 0)));
  const rollSum = () => round4((st.rollLens || []).slice(0, rollCount()).reduce((a, x) => a + (toNum(x) || 0), 0));
  function rollsEditor() {
    if (!rollOpen() || !rollCount()) return '';
    const n = rollCount();
    st.rollLens = Array.from({ length: n }, (_, i) => (st.rollLens && st.rollLens[i] !== undefined ? st.rollLens[i] : String(factor())));
    return `<div class="field"><span>Har bir rulon uzunligi (${esc(base())}) <small>— har xil bo'lsa o'zgartiring</small></span>
      <div class="roll-lens">${st.rollLens.map((v, i) => `<label class="roll-len"><i>${i + 1}</i><input class="input" data-rl="${i}" inputmode="decimal" value="${esc(v)}" aria-label="${i + 1}-rulon uzunligi"></label>`).join('')}</div>
      <small class="muted">Jami: <b>${num(rollSum(), 4)} ${esc(base())}</b> · ${n} ta rulon</small></div>`;
  }
  function drawRolls() {
    const box = host.querySelector('#rollsbox');
    if (!box) return;
    box.innerHTML = rollsEditor();
    box.querySelectorAll('[data-rl]').forEach((inp) => inp.addEventListener('input', () => {
      st.rollLens[Number(inp.dataset.rl)] = inp.value;
      const sm = box.querySelector('small.muted b');
      if (sm) sm.textContent = `${num(rollSum(), 4)} ${base()}`;
      const hint = host.querySelector('[data-hint="single"]');
      if (hint) hint.innerHTML = calcHint(st.single) || hint0();
    }));
  }

  function unitChips() {
    const main = mainUnits.map(byCode).filter(Boolean);
    // «Boshqa»: faqat do'kon turiga mos qo'shimcha birliklar, do'konning o'z birliklari va hozir tanlangani
    const others = units.filter((u) => !mainUnits.includes(u.code)
      && (!moreUnitCodes || moreUnitCodes.includes(u.code) || u.is_custom || u.id === st.baseUnitId));
    const otherSelected = others.some((u) => u.id === st.baseUnitId);
    const otherPh = others.length ? `${others.slice(0, 3).map((u) => u.name).join(', ')}${others.length > 3 ? '…' : ''}` : "o'zingiz yozasiz";
    return `
      <div class="unit-chips" role="radiogroup" aria-label="Qanday sotasiz">
        ${main.map((u) => `<button type="button" role="radio" aria-checked="${u.id === st.baseUnitId}" class="uchip${u.id === st.baseUnitId ? ' on' : ''}" data-base="${u.id}">
          <b>${esc(cap(u.name))}</b><span>${esc(UNIT_HINT[u.code] || '')}</span></button>`).join('')}
        <label class="uchip uchip-select${otherSelected ? ' on' : ''}"><b>Boshqa</b>
          <select id="base-other" aria-label="Boshqa birlik">
            <option value="">${otherSelected ? '' : esc(otherPh)}</option>
            ${others.map((u) => `<option value="${u.id}" ${u.id === st.baseUnitId ? 'selected' : ''}>${esc(u.name)}</option>`).join('')}
            <option value="new">+ yangi birlik…</option>
          </select></label>
      </div>`;
  }

  // Qadoq turlari: do'kon turiga moslari (mato — rulon, oziq-ovqat — blok, quti, qop...) va do'konning o'z qadoqlari
  const packOptions = () => units.filter((u) => u.id !== st.baseUnitId && (packCodes.includes(u.code) || u.is_custom || u.id === st.packUnitId));

  function packRow() {
    const options = packOptions();
    return `
      <div class="pack-row">
        <span class="pack-word">1</span>
        <select class="input" id="pack-unit" aria-label="Qadoq turi">
          <option value="">qadoq…</option>
          ${options.map((u) => `<option value="${u.id}" ${u.id === st.packUnitId ? 'selected' : ''}>${esc(u.name)}</option>`).join('')}
          <option value="new">+ boshqa qadoq…</option>
        </select>
        <span class="pack-word">ichida</span>
        <input class="input" id="pack-factor" inputmode="decimal" placeholder="100" value="${esc(st.packFactor)}" aria-label="Nechta">
        <span class="pack-word">${esc(base())}</span>
      </div>
      <small class="muted">${esc(packText[1].replace(/ — .*$/, ''))}</small>`;
  }

  function unitSwitch(kind) {
    if (!packReady()) return `<span class="unit-fixed">${esc(base())}</span>`;
    const val = kind === 'cost' ? st.costPer : st.qtyIn;
    return `<span class="mini-seg" role="radiogroup">
      <button type="button" data-${kind}-unit="pack" class="${val === 'pack' ? 'active' : ''}">${esc(pack())}</button>
      <button type="button" data-${kind}-unit="base" class="${val === 'base' ? 'active' : ''}">${esc(base())}</button></span>`;
  }

  function calcHint(r) {
    const sell = toMoney(r.sell);
    const cost = toMoney(r.cost);
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
    if (q > 0 && rollOpen()) parts.push(`omborga ${num(rollSum(), 4)} ${esc(base())} (${rollCount()} rulon) qo'shiladi`);
    else if (q > 0 && packReady() && st.qtyIn === 'pack') parts.push(`omborga ${num(round4(qtyBase(q)), 4)} ${esc(base())} qo'shiladi`);
    return parts.join(' · ');
  }

  // Variantlar: o'lchamlar × ranglar (rang bo'lmasa — faqat o'lchamlar, o'lcham bo'lmasa — faqat ranglar)
  function variantRows() {
    const sizes = st.rows.filter((r) => r.label.trim());
    if (!st.colors.length) return sizes.map((r) => ({ ...r, label: r.label.trim() }));
    const list = sizes.length ? sizes : [{ ...blankRow(), label: '' }];
    return st.colors.flatMap((c) => list.map((r) => ({
      ...r, color: c, label: [c, r.label.trim()].filter(Boolean).join(' '), qty: st.cq[`${c}|${r.label.trim()}`] ?? '',
    })));
  }

  function preview() {
    const rows = variantRows();
    if (!rows.length) return '';
    const total = rows.reduce((s, r) => s + (toNum(r.qty) || 0), 0);
    return `Jami: <b>${rows.length} ta ${st.colors.length ? 'xil' : "o'lcham"}</b>${total > 0 ? `, <b>${num(round4(total), 4)} ${esc(qtyUnit())}</b>` : ''}`;
  }

  function addColors(list) {
    for (const raw of list) {
      const c = String(raw).trim().replace(/\s+/g, ' ');
      if (c && !st.colors.some((x) => x.toLowerCase() === c.toLowerCase())) st.colors.push(cap(c));
    }
  }

  function addSizes(labels) {
    for (const raw of labels) {
      const label = String(raw).trim().replace(/\s+/g, ' ');
      if (!label || st.rows.some((r) => r.label.trim().toLowerCase() === label.toLowerCase())) continue;
      st.rows.push({ ...blankRow(), label });
    }
  }

  const REQ = '<span class="req" aria-hidden="true">*</span>';
  const HINT0 = "Kelish narxini yozsangiz, har biridan qancha foyda qolishi shu yerda ko'rinadi";
  // Qoldiq bor, lekin kelish narxi yo'q — foyda noto'g'ri chiqishini oldindan aytamiz
  const hint0 = () => {
    const hasQty = st.variants ? st.rows.some((x) => toNum(x.qty) > 0) : toNum(st.single.qty) > 0;
    return hasQty && String(st.single.cost).trim() === ''
      ? '<span class="amber">Kelish narxini yozing: aks holda sotilganda butun tushum foyda bo\'lib ko\'rinadi</span>'
      : HINT0;
  };

  // 2-bo'lim: narxlar (o'lchamli tovarda — hamma o'lchamga umumiy narx)
  function priceBlock() {
    const r = st.single;
    return `
      <div class="price-grid two">
        <label class="field"><span>Sotuv narxi ${REQ}${st.variants ? " <small>— hamma o'lchamga</small>" : ''}</span>
          <div class="money-input" data-wrap="sell"><input class="input input-lg" data-f="sell" data-money inputmode="decimal" placeholder="0" value="${esc(r.sell)}" aria-required="true"><em>so'm · 1 ${esc(base())}</em></div></label>
        <div class="field"><span>Kelish narxi <small>(ixtiyoriy)</small></span>
          <div class="money-input" data-wrap="cost"><input class="input input-lg" data-f="cost" data-money inputmode="decimal" placeholder="0" value="${esc(r.cost)}" aria-label="Kelish narxi"><em>so'm · 1 ${unitSwitch('cost')}</em></div></div>
      </div>
      <div class="calc-box" data-hint="single">${calcHint(r) || hint0()}</div>
      <p class="fsec-note">${icon('info', 'ico-xs')} Ulgurji narx alohida yuritilmaydi: ulgurji xaridorga sotuvda chegirma bilan sotasiz.</p>`;
  }

  // 3-bo'lim: qoldiq (oddiy tovar — bitta son; o'lchamli — har bir o'lcham soni)
  // O'lchamlar ro'yxati. withQty=false — ranglar tanlangan: sonlar rang jadvalida, bu yerda faqat o'lcham (narxi, o'chirish)
  function sizeList(withQty) {
    const r0 = st.single;
    return `<div class="size-list${withQty ? '' : ' sizes-only'}" ${withQty ? 'data-wrap="sizes"' : ''}>
      ${st.rows.length ? st.rows.map((x, i) => `
        <div class="size-row">
          <span class="size-tag">${esc(x.label)}</span>
          ${withQty ? `<input class="input" data-row="${i}" data-f="qty" inputmode="decimal" placeholder="0" value="${esc(x.qty)}" aria-label="${esc(x.label)}: ${QTY}">` : ''}
          ${st.sizePrice ? `<input class="input" data-row="${i}" data-f="sell" data-money inputmode="decimal" placeholder="Narx: ${esc(r0.sell || '0')}" value="${esc(x.sell)}" aria-label="${esc(x.label)}: sotuv narxi">` : ''}
          <button class="icon-btn" type="button" data-delrow="${i}" aria-label="${esc(x.label)} o'lchamini olib tashlash">${icon('x', 'ico-sm')}</button>
        </div>`).join('') : `<div class="size-empty">${sizesOn ? `Hali ${sizeNoun.replace(/lari$/, '')} tanlanmagan. Yuqoridagi tugmalardan birini bosing${colorsOn ? ' yoki pastda rangni tanlang' : ''}.` : 'Hali rang tanlanmagan. Yuqoridan rangni bosing yoki o\'zingiz yozing.'}</div>`}
    </div>`;
  }

  function stockBlock() {
    if (!st.variants) {
      const r = st.single;
      return `
        <label class="field"><span>${opts.arrival ? 'Nechta keldi?' : 'Hozir nechta bor?'} <small>(boshlang'ich qoldiq, ixtiyoriy)</small></span>
          <div class="money-input" data-wrap="qty"><input class="input input-lg" data-f="qty" inputmode="decimal" placeholder="0" value="${esc(r.qty)}"><em>${unitSwitch('qty')}</em></div></label>
        <div id="rollsbox">${rollsEditor()}</div>`;
    }
    const r = st.single;
    return `
      ${sizesOn ? `<div class="size-step"><b>Qaysi ${sizeNoun} bor?</b> <span class="small muted">Tugmani bosing yoki o'zingiz yozing${colorsOn ? ". O'lchami yo'q bo'lsa — faqat rangni tanlang" : ''}</span></div>
      <div class="size-presets">${presets.map((x) => `<button type="button" class="chip" data-preset="${SIZE_PRESETS.indexOf(x)}">${icon('plus', 'ico-xs')} ${esc(x.name)}</button>`).join('')}</div>
      <div class="input-group size-add"><input class="input" id="size-new" maxlength="40" placeholder="${rangeOn ? "Boshqa o'lcham: 3XL, 41 yoki oraliq 48-60" : "O'zingiz yozing"}" autocomplete="off" aria-label="Yangi ${sizeNoun.replace(/lari$/, '')}">
        <button class="btn btn-light" type="button" id="size-add">${icon('plus', 'ico-sm')} Qo'shish</button></div>` : ''}
      ${rangeOn ? `<div class="size-range"><span>Oraliq:</span>
        <input class="input" id="sr-from" inputmode="numeric" maxlength="3" placeholder="48" aria-label="Qaysi o'lchamdan">
        <span>dan</span>
        <input class="input" id="sr-to" inputmode="numeric" maxlength="3" placeholder="60" aria-label="Qaysi o'lchamgacha">
        <span>gacha,</span>
        <select class="input" id="sr-step" aria-label="Qadam"><option value="2">2 tadan (48, 50, 52…)</option><option value="1">1 tadan (36, 37, 38…)</option></select>
        <button class="btn btn-light" type="button" id="sr-add">${icon('plus', 'ico-sm')} Qo'shish</button></div>` : ''}
      ${st.colors.length && st.rows.length ? sizeList(false) : ''}
      ${colorsOn ? `
      <div class="size-step"><b>${icon('palette', 'ico-xs')} Ranglari</b> <span class="small muted">${sizesOn ? "ixtiyoriy — har bir rang va o'lcham qoldig'i alohida" : "har bir rangning qoldig'i alohida"}</span></div>
      <div class="color-picks">${COLOR_PRESETS.map((c) => `<button type="button" class="chip${st.colors.includes(c) ? ' active' : ''}" data-color="${esc(c)}">${esc(c)}</button>`).join('')}
        ${st.colors.filter((c) => !COLOR_PRESETS.includes(c)).map((c) => `<button type="button" class="chip active" data-color="${esc(c)}">${esc(c)} ${icon('x', 'ico-xs')}</button>`).join('')}</div>
      <div class="input-group size-add"><input class="input" id="color-new" maxlength="30" placeholder="Boshqa rang: masalan, Olcha" autocomplete="off" aria-label="Yangi rang">
        <button class="btn btn-light" type="button" id="color-add">${icon('plus', 'ico-sm')} Rang</button></div>` : ''}
      <div class="size-step"><b>${opts.arrival ? 'Har biridan nechta keldi?' : 'Har biridan nechta bor?'}</b>${packReady() ? ` ${unitSwitch('qty')}` : ''}</div>
      ${st.colors.length ? `<div class="color-matrix" data-wrap="sizes">${st.colors.map((c) => `
        <div class="cm-color"><div class="cm-head"><span class="cm-dot" style="--c:${esc(colorHex(c))}"></span><b>${esc(c)}</b><button type="button" class="icon-btn" data-color="${esc(c)}" aria-label="${esc(c)} rangini olib tashlash">${icon('x', 'ico-sm')}</button></div>
          <div class="size-list">${(st.rows.length ? st.rows : [{ label: '' }]).map((r) => `
            <label class="size-row">${r.label ? `<span class="size-tag">${esc(r.label)}</span>` : `<span class="size-tag">${esc(qtyUnit())}</span>`}
              <input class="input" data-cq="${esc(`${c}|${r.label}`)}" inputmode="decimal" placeholder="0" value="${esc(st.cq[`${c}|${r.label}`] ?? '')}" aria-label="${esc(`${c} ${r.label}`.trim())}: ${QTY}"></label>`).join('')}</div></div>`).join('')}</div>` : sizeList(true)}
      ${st.rows.length ? `<button type="button" class="link-btn" id="size-price-toggle">${st.sizePrice ? "Hamma o'lchamga bir xil narx" : "Ba'zi o'lchamlarning narxi boshqacha"}</button>` : ''}
      <div class="small" id="vpreview">${preview()}</div>`;
  }

  const optToggle = (key, ico, title, hint) => `
    <button type="button" class="opt${st[key] ? ' on' : ''}" data-opt="${key}" aria-pressed="${st[key]}">
      <span class="opt-box">${st[key] ? icon('check', 'ico-xs') : ''}</span>
      <span class="opt-ico">${icon(ico, 'ico-sm')}</span>
      <span class="opt-text"><b>${esc(title)}</b><small>${esc(hint)}</small></span>
    </button>`;

  const secHead = (n, title, sub) => `<header class="fsec-head"><span class="fsec-num">${n}</span><div><h3>${title}</h3><p>${sub}</p></div></header>`;

  function render() {
    host.innerHTML = `
      <form id="wiz" class="pform pform-v2" novalidate>
        <section class="fsec">
          ${secHead(1, "Asosiy ma'lumot", "Nomi, rasmi, turkumi va shtrix-kodi")}
          <div class="fsec-body">
            <div class="pf-head">
              <label class="photo-pick${st.imageUrl ? ' has' : ''}" title="Rasm qo'shish">
                ${st.imageUrl ? `<img src="${esc(st.imageUrl)}" alt="Tovar rasmi">` : `${icon('camera')}<span>Rasm</span>`}
                <input type="file" accept="image/*" id="wimg" aria-label="Tovar rasmi">
              </label>
              <div class="pf-name">
                <label class="field"><span>Tovar nomi ${REQ}</span>
                  <input class="input input-lg" id="wname" maxlength="150" placeholder="${esc(namePh)}" value="${esc(st.name)}" autocomplete="off" aria-required="true"></label>
                <small class="muted">${st.imageUrl ? 'Rasm tanlandi. Almashtirish uchun rasmni bosing' : 'Rasm ixtiyoriy: katakni bosib suratga oling yoki galereyadan tanlang'}</small>
              </div>
            </div>
            <div class="form-grid two">
              <label class="field"><span>Turkum (kategoriya)</span><input class="input" id="wcat" list="wcats" maxlength="60" placeholder="Masalan: ${esc(catPh)}" value="${esc(st.cat)}">
                <datalist id="wcats">${refs.cats.map((c) => `<option value="${esc(c.name)}">`).join('')}</datalist></label>
              ${st.variants ? '<p class="small muted" style="align-self:end">Shtrix-kod va artikulni har bir o\'lcham uchun keyin tovar sahifasida qo\'shasiz.</p>' : `
              <div class="field"><span>Shtrix-kod</span>
                <div class="input-group"><input class="input" id="wbarcode" inputmode="numeric" maxlength="64" placeholder="Skaner bilan o'qiting yoki yozing" value="${esc(st.barcode)}">
                  ${cameraScanSupported() ? `<button class="btn btn-light btn-icon" type="button" id="wscan" title="Kamera bilan o'qish" aria-label="Kamera bilan o'qish">${icon('camera')}</button>` : ''}</div></div>
              <label class="field"><span>Artikul (SKU) <small>— ichki kodingiz</small></span><input class="input" id="wsku" maxlength="64" placeholder="Masalan: A-001" value="${esc(st.sku)}"></label>`}
            </div>
          </div>
        </section>

        <section class="fsec">
          ${secHead(2, 'Narx', "Sotuv va kelish narxi — foyda o'zi hisoblanadi")}
          <div class="fsec-body" id="prices">${priceBlock()}</div>
        </section>

        <section class="fsec">
          ${secHead(3, 'Ombor', "Qanday sotasiz, nechta bor va qachon ogohlantirish")}
          <div class="fsec-body">
            <div class="pf-block">
              <div class="wq">Xaridorga qanday sotasiz?</div>
              ${unitChips()}
            </div>
            <div class="pf-opts">
              ${st.packed || packOptions().length ? optToggle('packed', 'box', packText[0], packText[1]) : ''}
              ${st.packed ? `<div class="opt-body">${packRow()}</div>` : ''}
              ${sizesOn || colorsOn ? optToggle('variants', 'layers', variantText[0], variantText[1]) : ''}
            </div>
            <div id="stockblk" class="pf-block">${stockBlock()}</div>
            <label class="field"><span>Shundan kam qolsa ogohlantirsin <small>(${esc(base())})</small></span>
              <input class="input" id="wmin" inputmode="decimal" placeholder="Masalan: 5" value="${esc(st.min)}"></label>
            <p class="fsec-note">${icon('warehouse', 'ico-xs')} Hamma tovar bitta omborda hisoblanadi.</p>
          </div>
        </section>

        <section class="fsec fsec-more${st.more ? ' open' : ''}">
          <button type="button" class="fsec-head fsec-toggle" data-opt="more" aria-expanded="${st.more}">
            <span class="fsec-num">4</span><div><h3>Qo'shimcha <small>(ixtiyoriy)</small></h3><p>${esc([...attrKeys.filter((k) => !(k === 'color' && st.variants && colorsOn)).map((k) => refs.cfg.fields[k].label), 'yetkazib beruvchi', ...(showExpiry ? ['yaroqlilik muddati'] : []), 'izoh'].join(', ').replace(/^./, (c) => c.toUpperCase()))}</p></div>
            ${icon('chevronDown', 'ico-sm fsec-chev')}
          </button>
          ${st.more ? `<div class="fsec-body">
            ${attrKeys.length ? `<div class="form-grid two">${attrKeys.filter((k) => !(k === 'color' && st.variants && colorsOn)).map((k) => `
              <label class="field"><span>${esc(refs.cfg.fields[k].label)}</span>
                <input class="input" data-attr="${k}" maxlength="200" value="${esc(st.attrs[k] || '')}" placeholder="${esc(refs.cfg.fields[k].placeholder || '')}" autocomplete="off"></label>`).join('')}</div>` : ''}
            <div class="form-grid two">
              <label class="field"><span>Kimdan olasiz? (yetkazib beruvchi)</span>
                <select class="input" id="wsup"><option value="">— tanlanmagan —</option>${refs.sups.map((x) => `<option value="${x.id}" ${String(x.id) === String(st.sup) ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select></label>
              ${showExpiry ? `<label class="field"><span>Yaroqlilik muddati <small>(oziq-ovqat, dori...)</small></span>
                <input class="input" id="wexp" type="date" value="${esc(st.expiry)}"></label>` : ''}
            </div>
            <label class="field"><span>Izoh</span>
              <textarea class="input" id="wdesc" maxlength="1000" rows="3" placeholder="Masalan: tarkibi, rangi, qaysi javonda turadi">${esc(st.desc)}</textarea></label>
          </div>` : ''}
        </section>

        <div id="werr" aria-live="polite"></div>
        <div class="wactions">
          <button class="btn btn-lg" type="submit" data-save>${icon('check')} Saqlash</button>
          ${opts.arrival ? '' : `<button class="btn btn-lg btn-light" type="submit" data-again="1">${icon('plus')} Saqlab, yana qo'shish</button>`}
          <button class="btn btn-lg btn-ghost" type="button" data-cancel>Bekor qilish</button>
        </div>
      </form>`;
    bind();
  }

  function refreshPrices() {
    host.querySelector('#prices').innerHTML = priceBlock();
    host.querySelector('#stockblk').innerHTML = stockBlock();
    bindPrices();
  }

  // Xato bo'lgan maydon qizil bo'ladi va xabar shu maydon ostida chiqadi
  function clearInvalid(el) {
    const wrap = el.closest('[data-wrap]') || el;
    wrap.classList.remove('invalid');
    wrap.parentElement?.querySelector(':scope > .field-err')?.remove();
  }

  function bindPrices() {
    host.querySelectorAll('#prices [data-f], #stockblk [data-f]').forEach((inp) => inp.addEventListener('input', () => {
      clearInvalid(inp);
      const i = inp.dataset.row;
      const row = i === undefined ? st.single : st.rows[Number(i)];
      row[inp.dataset.f] = inp.value;
      if (i === undefined && inp.dataset.f === 'qty') drawRolls();
      const hint = host.querySelector('[data-hint="single"]');
      if (hint && i === undefined) hint.innerHTML = calcHint(st.single) || hint0();
      const pv = host.querySelector('#vpreview');
      if (pv) pv.innerHTML = preview();
    }));
    host.querySelectorAll('[data-preset]').forEach((b) => b.addEventListener('click', () => {
      addSizes(SIZE_PRESETS[Number(b.dataset.preset)].labels);
      refreshPrices();
      host.querySelector('.size-row input[data-f="qty"]')?.focus();
    }));
    const addOne = () => {
      const inp = host.querySelector('#size-new');
      if (!inp || !inp.value.trim()) return;
      addSizes(inp.value.split(/[,;]+/).flatMap((x) => expandRange(x)));
      refreshPrices();
      host.querySelector('#size-new')?.focus();
    };
    host.querySelector('#size-add')?.addEventListener('click', addOne);
    host.querySelectorAll('[data-color]').forEach((b) => b.addEventListener('click', () => {
      const c = b.dataset.color;
      if (st.colors.includes(c)) st.colors = st.colors.filter((x) => x !== c); else addColors([c]);
      refreshPrices();
    }));
    const addColor = () => {
      const inp = host.querySelector('#color-new');
      if (!inp || !inp.value.trim()) return;
      addColors(inp.value.split(/[,;]+/));
      refreshPrices();
      host.querySelector('#color-new')?.focus();
    };
    host.querySelector('#color-add')?.addEventListener('click', addColor);
    host.querySelector('#color-new')?.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); addColor(); } });
    host.querySelectorAll('[data-cq]').forEach((inp) => inp.addEventListener('input', () => {
      st.cq[inp.dataset.cq] = inp.value;
      const pv = host.querySelector('#vpreview');
      if (pv) pv.innerHTML = preview();
    }));
    host.querySelector('#sr-add')?.addEventListener('click', () => {
      const from = host.querySelector('#sr-from').value.trim();
      const to = host.querySelector('#sr-to').value.trim();
      if (!/^\d{1,3}$/.test(from) || !/^\d{1,3}$/.test(to)) { toast("Oraliqni raqam bilan yozing: masalan 48 dan 60 gacha", 'warn'); return; }
      addSizes(expandRange(`${from}-${to}`, Number(host.querySelector('#sr-step').value)));
      refreshPrices();
      host.querySelector('.size-row input[data-f="qty"]')?.focus();
    });
    host.querySelector('#size-new')?.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); addOne(); } });
    host.querySelector('#size-price-toggle')?.addEventListener('click', () => {
      st.sizePrice = !st.sizePrice;
      if (!st.sizePrice) st.rows.forEach((r) => { r.sell = ''; });
      refreshPrices();
    });
    host.querySelectorAll('[data-cost-unit]').forEach((b) => b.addEventListener('click', () => { st.costPer = b.dataset.costUnit; refreshPrices(); }));
    host.querySelectorAll('[data-qty-unit]').forEach((b) => b.addEventListener('click', () => { st.qtyIn = b.dataset.qtyUnit; refreshPrices(); }));
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
      clearInvalid(e.target);
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
      st.unitTouched = true;
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
      if (key === 'variants' && st.variants && !st.unitTouched && variantUnit()) st.baseUnitId = variantUnit();
      if (key === 'packed' && st.packed && !st.packUnitId) {
        // Odatdagi qadoq: metr — rulon, kilogramm — qop, litr — kanistr, dona — quti
        const code = units.find((u) => u.id === st.baseUnitId)?.code;
        const guess = { m: ['roll'], kg: ['bag', 'pack'], piece: ['box', 'pack', 'block'], l: ['can', 'box'], pair: ['box'] }[code] || [];
        const allowed = packOptions();
        st.packUnitId = allowed.length === 1 ? allowed[0].id
          : (guess.map((c) => allowed.find((u) => u.code === c)?.id).find(Boolean) || null);
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
    $('#wmin')?.addEventListener('input', (e) => { st.min = e.target.value; clearInvalid(e.target); });
    $('#wexp')?.addEventListener('input', (e) => { st.expiry = e.target.value; });
    $('#wdesc')?.addEventListener('input', (e) => { st.desc = e.target.value; });
    host.querySelectorAll('[data-attr]').forEach((inp) => inp.addEventListener('input', () => { st.attrs[inp.dataset.attr] = inp.value; }));
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
    host.querySelectorAll('.invalid').forEach((x) => x.classList.remove('invalid'));
    host.querySelectorAll('.field-err').forEach((x) => x.remove());
    // sel — xato bo'lgan maydon: qizil chiziladi, ostida xabar chiqadi va unga o'tiladi
    const fail = (msg, sel) => {
      errEl.innerHTML = `<div class="alert alert-bad">${icon('alert', 'ico-sm')}<div>${esc(msg)}</div></div>`;
      const el = sel && host.querySelector(sel);
      if (el) {
        const wrap = el.closest('[data-wrap]') || el;
        wrap.classList.add('invalid');
        wrap.insertAdjacentHTML('afterend', `<div class="field-err">${icon('alert', 'ico-xs')} ${esc(msg)}</div>`);
        wrap.scrollIntoView({ block: 'center', behavior: 'smooth' });
        (el.matches('input, select, textarea') ? el : el.querySelector('input'))?.focus({ preventScroll: true });
      } else errEl.scrollIntoView({ block: 'center' });
    };
    errEl.innerHTML = '';
    const name = st.name.trim();
    if (!name) return fail('Tovar nomini yozing', '#wname');
    if (!st.baseUnitId) return fail('Qanday sotishingizni tanlang (dona, kilogramm, litr, metr...)');
    if (st.packed && !st.packUnitId) return fail("Qadoq turini tanlang (quti, rulon, blok...) yoki «Qutida, rulonda keladi» belgisini olib tashlang");
    if (st.packed && !(factor() > 0)) return fail(`1 ${pack()} ichida nechta ${base()} borligini yozing`, '#pack-factor');
    // O'lchamlarda: narx umumiy (o'lchamda alohida yozilmagan bo'lsa), har bir o'lchamning o'z soni
    const rows = st.variants
      ? variantRows().map((r) => ({ ...r, sell: r.sell !== '' ? r.sell : st.single.sell, cost: r.cost !== '' ? r.cost : st.single.cost }))
      : [st.single];
    if (st.variants && !rows.length) return fail(colorsOn ? "Kamida bitta o'lcham yoki rangni tanlang (masalan: S, M, L yoki qora, oq)" : "Kamida bitta o'lchamni tanlang (masalan: S, M, L yoki 38, 39)", '[data-wrap="sizes"]');
    for (const r of rows) {
      const sell = toMoney(r.sell);
      if (String(r.sell).trim() === '' || !(sell >= 0)) return fail(st.variants && st.sizePrice ? `«${r.label}» uchun narx yozing yoki umumiy narxni to'ldiring` : 'Sotuv narxini yozing', '[data-wrap="sell"]');
      if (String(r.cost).trim() !== '' && !(toMoney(r.cost) >= 0)) return fail("Kelish narxi noto'g'ri", '[data-wrap="cost"]');
      if (r.qty !== '' && !(toNum(r.qty) >= 0)) return fail(st.variants ? `«${r.label}» uchun son noto'g'ri yozilgan` : "Nechta borligi noto'g'ri yozilgan", st.variants ? '[data-wrap="sizes"]' : '[data-wrap="qty"]');
    }
    if (rollOpen() && toNum(st.single.qty) > 0) {
      if (!Number.isInteger(toNum(st.single.qty))) return fail('Rulonlar sonini butun son bilan yozing (masalan: 5)', '[data-wrap="qty"]');
      const bad = st.rollLens.slice(0, rollCount()).findIndex((x) => !(toNum(x) > 0));
      if (bad >= 0) return fail(`${bad + 1}-rulon uzunligini yozing`, `[data-rl="${bad}"]`);
    }
    const minStock = st.min.trim() ? toNum(st.min) : 0;
    if (!(minStock >= 0)) return fail("Ogohlantirish miqdori noto'g'ri", '#wmin');
    if (st.expiry && !/^\d{4}-\d{2}-\d{2}$/.test(st.expiry)) return fail("Yaroqlilik muddati noto'g'ri", '#wexp');

    let categoryId = null;
    try {
      if (st.cat.trim()) categoryId = (await post('/categories', { name: st.cat.trim() })).category.id;
    } catch (err) {
      return fail(err.message);
    }
    const created = [];
    for (const r of rows) {
      const cost = String(r.cost).trim() === '' ? 0 : toMoney(r.cost);
      const qty = r.qty === '' ? 0 : toNum(r.qty);
      const body = {
        name: st.variants ? `${name} ${r.label.trim()}` : name,
        ...(st.variants ? { model_name: name, variant_label: r.label.trim() } : {}),
        base_unit_id: st.baseUnitId,
        selling_price: round2(toMoney(r.sell)),
        purchase_price: round2(costPerBase(cost)),
        min_stock: minStock,
        conversions: packReady() ? [{ unit_id: st.packUnitId, factor: round4(factor()) }] : [],
        supplier_id: st.sup ? Number(st.sup) : null,
        category_id: categoryId,
        barcode: st.variants ? null : (st.barcode.trim() || null),
        sku: st.variants ? null : (st.sku.trim() || null),
        ...(st.desc.trim() ? { description: st.desc.trim() } : {}),
        ...(st.expiry ? { expiry_date: st.expiry } : {}),
        attributes: Object.fromEntries(Object.entries({
          ...st.attrs,
          // Rangli variant: har biriga o'z rangi yoziladi (qidiruvda «qora» deb topiladi)
          ...(st.variants && r.color ? { color: r.color } : {}),
        }).map(([k, v]) => [k, String(v || '').trim()]).filter(([, v]) => v)),
      };
      const q = rollOpen() && !st.variants ? rollSum() : round4(qtyBase(qty));
      if (rollOpen() && !st.variants && rollCount() > 0) body.opening_rolls = st.rollLens.slice(0, rollCount()).map((x) => round4(toNum(x)));
      else if (q > 0 && !opts.arrival) body.opening_qty = q;
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
    toast(st.variants ? `«${name}» qo'shildi: ${created.length} ta o'lcham` : `«${created[0].name}» qo'shildi`, 'ok');
    if (again) {
      if (st.imageUrl) URL.revokeObjectURL(st.imageUrl);
      // Keyingi tovar uchun: birlik, qadoq va yetkazib beruvchi qoladi, qolgani tozalanadi
      // O'lchamlar ro'yxati qoladi (keyingi modelda ham odatda shu o'lchamlar), sonlari tozalanadi
      Object.assign(st, { name: '', single: blankRow(), rows: st.rows.map((r) => ({ ...blankRow(), label: r.label })), cq: {}, barcode: '', sku: '', desc: '', expiry: '', image: null, imageUrl: '' });
      render();
      window.scrollTo({ top: 0 });
      host.closest('.modal-body')?.scrollTo({ top: 0 });
    }
    await opts.onSaved?.(created, { again });
    return undefined;
  }

  render();
}

// Sahifa ko'rinishi (Mahsulotlar → Yangi tovar)
export async function renderProductWizard(root, { name = '', prefill = null, onSaved, onCancel } = {}) {
  root.innerHTML = `
    <div class="page-head">
      <div><a class="link-btn" href="#/products">${icon('back', 'ico-xs')} Mahsulotlar</a><h1>Yangi tovar</h1><p class="muted">Faqat <b>nomi</b> va <b>sotuv narxi</b> majburiy (<span class="req">*</span>). Qolganini keyin ham qo'shish mumkin</p></div>
    </div>
    <div class="pform-page" id="wizhost"><div class="card"><div class="empty">Yuklanmoqda…</div></div></div>`;
  await mountWizard(root.querySelector('#wizhost'), { name, prefill, onSaved, onCancel });
}

// Oyna ko'rinishi (masalan, Yuk keldi → tovar topilmasa). Saqlangan tovarlar ro'yxatini qaytaradi.
// drawer: kompyuterda o'ngdan chiqadigan panel. onAdded(created) — «Saqlab, yana qo'shish»da har safar chaqiriladi
export function openProductWizard({ name = '', arrival = false, drawer = false, prefill = null, onAdded } = {}) {
  return new Promise((resolve) => {
    let done = false;
    const all = [];
    const { close, el } = openModal({
      title: 'Yangi tovar',
      wide: !drawer,
      drawer,
      body: `<p class="muted small" style="margin:0 0 14px">Faqat <b>nomi</b> va <b>sotuv narxi</b> majburiy (<span class="req">*</span>). Qolganini keyin ham qo'shish mumkin</p><div id="wizmodal"><div class="empty">Yuklanmoqda…</div></div>`,
      onClose: () => { if (!done) resolve(all); },
    });
    el.classList.add('pform-modal');
    mountWizard(el.querySelector('#wizmodal'), {
      name,
      arrival,
      prefill,
      modal: true,
      onSaved: (created, { again } = {}) => {
        all.push(...created);
        onAdded?.(created);
        if (again) return;
        done = true;
        close();
        resolve(all);
      },
      onCancel: () => close(),
    });
  });
}
