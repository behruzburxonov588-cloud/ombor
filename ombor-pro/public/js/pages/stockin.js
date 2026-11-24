// Tovar kiritish — tez rejim: tovarni toping → sonini yozing → Enter. Har bir tovar darhol omborga tushadi,
// o'ngdagi «Bugun kiritilganlar» ro'yxatida ko'rinadi va xato bo'lsa «Bekor qilish» mumkin.
// Ko'p tovarni bitta yuk qilib (yo'l kira, chegirma bilan) kiritish — eski «Batafsil» forma (#/purchases/new).
import {
  get, post, icon, esc, num, money, toast, errorToast, openModal, confirmBox, withBusy,
  productPhoto, todayStr, groupBySize, parseMoney, formatMoneyInput, newKey, parseQty, round2, round4,
} from '../ui.js';
import { openBarcodeScanner, cameraScanSupported } from '../scanner.js';
import { openProductWizard } from '../productform.js';

const UNKNOWN = "Noma'lum";
const isWide = () => window.matchMedia('(min-width: 720px)').matches;
const toMoney = (v) => {
  const n = parseMoney(v);
  return Number.isFinite(n) ? n : 0;
};
// «Nechta keldi?» — donada; boshqa birlikda «Necha kg keldi?»
const askQty = (unit) => (/^dona$/i.test(unit) ? 'Nechta keldi?' : `Necha ${unit} keldi?`);
// Nomni solishtirish uchun: kichik harf, belgilar va bo'shliqlarsiz («Coca-Cola 1 L» = «coca cola 1l»)
const norm = (s) => String(s || '').toLowerCase().replace(/[ʻʼ'`‘’]/g, '').replace(/[^a-z0-9а-яёўқғҳ]+/gi, '');

function editDistance(a, b) {
  if (Math.abs(a.length - b.length) > 2) return 3;
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const tmp = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = tmp;
    }
  }
  return prev[b.length];
}

// Shunga o'xshash nomli tovarlar (ikki marta yaratib qo'ymaslik uchun)
function similarTo(name, catalog) {
  const n = norm(name);
  if (n.length < 3) return [];
  return catalog.filter((p) => {
    const m = norm(p.model_name || p.name);
    if (!m) return false;
    if (m === n || m.includes(n) || (m.length >= 4 && n.includes(m))) return true;
    return editDistance(m, n) <= (n.length > 6 ? 2 : 1);
  }).slice(0, 4);
}

export async function render(root, params, ctx) {
  if (!ctx.can('purchases.create')) {
    root.innerHTML = '<div class="alert alert-bad">Tovar kiritish uchun ruxsatingiz yo\'q</div>';
    return;
  }
  const canNewProduct = ctx.can('products.manage');
  const [{ suppliers: allSup }, cat, rec] = await Promise.all([
    get('/suppliers').catch(() => ({ suppliers: [] })),
    get('/products?limit=1000'),
    get('/purchases/recent-items').catch(() => ({ items: [] })),
  ]);
  let catalog = cat.products;
  const suppliers = allSup.filter((s) => s.name !== UNKNOWN);
  let recent = rec.items;
  const refreshRecent = () => get('/purchases/recent-items').then((r) => { recent = r.items; drawRecent(); }).catch(() => {});

  // Bugungi ro'yxat shu brauzer oynasida saqlanadi (sahifa yangilansa ham yo'qolmaydi)
  const sessKey = `ombor.stockin.${ctx.user.username}.${todayStr()}`;
  let session = [];
  try { session = JSON.parse(sessionStorage.getItem(sessKey) || '[]'); } catch { session = []; }
  const saveSession = () => { try { sessionStorage.setItem(sessKey, JSON.stringify(session.slice(0, 60))); } catch { /* xotira yopiq */ } };

  let more = false;
  try { more = localStorage.getItem('ombor.stockin.more') === '1'; } catch { /* xotira yopiq */ }
  let q = '';
  let cur = null; // tanlangan tovar va forma qiymatlari
  let pay = 'paid'; // paid | debt
  let method = 'cash';
  let supId = ''; // kimdan keldi (qarzga olinsa — majburiy)
  let flashId = null;

  root.innerHTML = `
    <div class="page-head si-head">
      <div><h1>Tovar kiritish</h1><p class="muted">Tovarni toping, sonini yozing, <b>Enter</b> — omborga tushadi</p></div>
    </div>
    <div class="si">
      <div class="si-main">
        <div class="si-search">
          ${icon('search')}
          <input id="si-q" type="search" placeholder="Mahsulot nomi yoki shtrix-kod" autocomplete="off" aria-label="Mahsulotni qidirish" enterkeyhint="search">
          ${cameraScanSupported() ? `<button type="button" class="si-cam" id="si-cam" aria-label="Kamera bilan shtrix-kod o'qish" title="Shtrix-kodni kamera bilan o'qish">${icon('scan')}</button>` : ''}
        </div>
        <div id="si-results"></div>
        <section id="si-recent" class="si-recent" aria-label="Oxirgi kiritilganlar"></section>
        <form id="si-form" class="card si-form" novalidate autocomplete="off"></form>
      </div>
      <aside class="card si-side" aria-label="Bugun kiritilganlar">
        <div class="si-side-head"><h2>Bugun kiritilganlar</h2><span class="muted" id="si-count"></span></div>
        <div id="si-list" class="si-list"></div>
        <div class="si-side-foot" id="si-foot" hidden>
          <div class="between"><span class="muted">Jami xarid</span><b class="num" id="si-total">0 so'm</b></div>
        </div>
      </aside>
    </div>`;

  const $ = (s) => root.querySelector(s);
  const searchIn = $('#si-q');

  // ---------- hisob-kitob ----------
  const unitsOf = (p) => [{ unit_id: p.base_unit_id, name: p.base_unit_name, factor: 1 }, ...(p.conversions || [])];
  const unitOf = (p, id) => unitsOf(p).find((u) => u.unit_id === id) || unitsOf(p)[0];
  const isRollUnit = (p, id) => Boolean(p.is_roll) && String(unitOf(p, id).name).toLowerCase() === 'rulon';
  const knownPrice = (p) => Number(p.purchase_price) > 0;

  function baseAdd(c) {
    if (c.kind === 'sizes') return round4(c.g.items.reduce((s, v) => s + (parseQty(c.sizes[v.id]) || 0), 0));
    if (isRollUnit(c.p, c.unit_id)) return round4(c.rolls.reduce((s, x) => s + (parseQty(x) || 0), 0));
    return round4((parseQty(c.qty) || 0) * unitOf(c.p, c.unit_id).factor);
  }
  function lineSum(c) {
    const price = toMoney(c.price);
    if (c.kind === 'sizes') return round2(baseAdd(c) * price);
    if (isRollUnit(c.p, c.unit_id)) return round2(baseAdd(c) * price);
    return round2((parseQty(c.qty) || 0) * price);
  }
  const stockNow = (c) => (c.kind === 'sizes' ? c.g.items.reduce((s, v) => s + Number(v.stock_qty), 0) : Number(c.p.stock_qty));
  const baseName = (c) => (c.kind === 'sizes' ? c.g.base_unit_name : c.p.base_unit_name);

  // ---------- qidiruv natijalari ----------
  function matches() {
    const t = q.toLowerCase();
    const n = norm(q);
    if (!t) return [];
    const rows = catalog.filter((p) => p.name.toLowerCase().includes(t) || (n.length >= 2 && norm(p.name).includes(n))
      || (p.barcode && p.barcode === q) || (p.sku && p.sku.toLowerCase() === t));
    return groupBySize(rows).slice(0, 8);
  }
  function drawResults() {
    const box = $('#si-results');
    if (!q) { box.innerHTML = ''; box.hidden = true; return; }
    const rows = matches();
    box.hidden = false;
    box.innerHTML = `<div class="si-res" role="listbox" aria-label="Topilgan mahsulotlar">
      ${rows.map((x, i) => `
        <button type="button" class="si-res-item${i === 0 ? ' first' : ''}" role="option" data-${x.group ? 'model' : 'pid'}="${esc(x.group ? x.model_name : x.id)}">
          ${productPhoto(x, 'si-res-img')}
          <span class="si-res-text"><b>${esc(x.name)}</b>
            <small>Omborda ${num(x.stock_qty, 3)} ${esc(x.base_unit_name)}${x.group ? ` · ${x.items.length} xil o'lcham` : ''}</small></span>
          ${i === 0 ? '<span class="kbd">Enter</span>' : ''}
        </button>`).join('')}
      ${canNewProduct ? `<button type="button" class="si-res-item si-res-new" data-new>
          <span class="si-res-plus">${icon('plus', 'ico-sm')}</span>
          <span class="si-res-text"><b>«${esc(q)}» — yangi mahsulot</b><small>Ro'yxatda yo'q bo'lsa</small></span></button>` : ''}
      ${!rows.length && !canNewProduct ? `<div class="empty small">«${esc(q)}» topilmadi</div>` : ''}
    </div>`;
  }

  // ---------- oxirgi kiritilganlar (bir bosishda) ----------
  function drawRecent() {
    const box = $('#si-recent');
    const seen = new Set();
    const chips = [];
    for (const r of recent) {
      const p = catalog.find((x) => x.id === r.product_id);
      if (!p) continue;
      const key = p.model_name ? `m:${p.model_name.toLowerCase()}` : `p:${p.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      chips.push({ r, p, key });
      if (chips.length >= 8) break;
    }
    if (!chips.length || q) { box.innerHTML = ''; box.hidden = true; return; }
    box.hidden = false;
    const curKey = cur ? (cur.kind === 'sizes' ? `m:${cur.g.model_name.toLowerCase()}` : `p:${cur.p.id}`) : '';
    box.innerHTML = `<span class="si-label">Oxirgi kiritilganlar — bir bosishda tanlanadi</span>
      <div class="si-chips">${chips.map(({ r, p, key }) => `
        <button type="button" class="si-chip${key === curKey ? ' on' : ''}" data-recent="${r.product_id}" aria-pressed="${key === curKey}">
          ${productPhoto(p, 'si-chip-img')}<span>${esc(p.model_name || p.name)}</span></button>`).join('')}
        ${canNewProduct ? `<button type="button" class="si-chip si-chip-new" data-new>${icon('plus', 'ico-xs')} Yangi mahsulot</button>` : ''}
      </div>`;
  }

  // ---------- tanlash ----------
  function select(p, preset = null) {
    if (p.model_name && p.variant_label) {
      const g = groupBySize(catalog.filter((x) => x.model_name && x.model_name.toLowerCase() === p.model_name.toLowerCase()))[0];
      const sizes = {};
      if (preset) sizes[p.id] = String(preset.quantity);
      cur = { kind: 'sizes', g, sizes, price: preset?.unit_price ? String(preset.unit_price) : (knownPrice(g.items[0]) ? String(g.items[0].purchase_price) : ''), date: todayStr(), note: '' };
    } else {
      const pack = p.pack && Number(p.pack.factor) > 1 ? p.pack : null;
      let unitId = preset?.unit_id || (pack ? pack.unit_id : p.base_unit_id);
      // Rulonli tovar oxirgi marta metrda (har rulon alohida qator) yozilgan — yana rulon rejimida ochiladi
      const rollUnit = p.is_roll ? unitsOf(p).find((x) => String(x.name).toLowerCase() === 'rulon') : null;
      if (rollUnit && preset && unitId === p.base_unit_id) unitId = rollUnit.unit_id;
      const u = unitOf(p, unitId);
      const roll = isRollUnit(p, u.unit_id);
      const price = preset?.unit_price ? (roll ? round2(Number(preset.unit_price) / (preset.factor || 1)) : Number(preset.unit_price))
        : knownPrice(p) ? round2(Number(p.purchase_price) * (roll ? 1 : u.factor)) : '';
      const qty = preset ? String(roll ? 1 : preset.quantity) : (roll ? '1' : '');
      cur = { kind: 'one', p, unit_id: u.unit_id, qty, price: price === '' ? '' : String(price), rolls: roll ? [String(u.factor)] : [], date: todayStr(), note: '' };
      if (roll && preset) cur.rolls = [String(preset.quantity)];
    }
    q = '';
    searchIn.value = '';
    drawResults();
    drawRecent();
    drawForm();
    const first = $('#si-form [data-first]');
    if (isWide()) { first?.focus(); first?.select?.(); } else {
      // Telefonda: forma tepasi yuqori panel ostida qolmasin
      const top = $('#si-form').getBoundingClientRect().top + window.scrollY - (document.querySelector('.topbar')?.offsetHeight || 64) - 10;
      window.scrollTo({ top, behavior: 'smooth' });
    }
  }
  function selectId(id, preset = null) {
    const p = catalog.find((x) => x.id === Number(id));
    if (p) select(p, preset);
  }
  function selectModel(model) {
    const p = catalog.find((x) => x.model_name && x.model_name === model);
    if (p) select(p);
  }

  // ---------- forma ----------
  function fieldsHtml(c) {
    if (c.kind === 'sizes') {
      const unit = esc(c.g.base_unit_name);
      return `
        <div class="field"><span>Har bir o'lchamdan nechta keldi? <small class="muted">kelmaganini bo'sh qoldiring</small></span>
          <div class="si-sizes">${c.g.items.map((v, i) => `
            <label class="si-size">
              ${v.image_path ? `<img src="${esc(v.image_path)}" alt="" loading="lazy">` : ''}
              <b>${esc(v.variant_label)}</b>
              <small>bor: ${num(v.stock_qty, 3)}</small>
              <input class="input num" inputmode="decimal" data-size="${v.id}" ${i === 0 ? 'data-first' : ''} value="${esc(c.sizes[v.id] || '')}" placeholder="0" aria-label="${esc(v.variant_label)}: nechta keldi">
            </label>`).join('')}</div></div>
        <label class="field si-price"><span>Xarid narxi, 1 ${unit}</span>
          <span class="si-big"><input id="si-price" data-money inputmode="decimal" value="${esc(formatMoneyInput(c.price))}" placeholder="0"><em>so'm</em></span></label>`;
    }
    const p = c.p;
    const units = unitsOf(p);
    const u = unitOf(p, c.unit_id);
    const roll = isRollUnit(p, c.unit_id);
    const seg = units.length > 1 ? `<div class="seg si-units" role="radiogroup" aria-label="Qanday o'lchanadi">${units.map((x) => `<button type="button" role="radio" data-u="${x.unit_id}" class="${x.unit_id === c.unit_id ? 'active' : ''}" aria-checked="${x.unit_id === c.unit_id}">${esc(x.name)}${x.factor !== 1 && !isRollUnit(p, x.unit_id) ? ` <small>(${num(x.factor, 3)} ${esc(p.base_unit_name)})</small>` : ''}</button>`).join('')}</div>` : '';
    if (roll) {
      return `${seg}
        <div class="si-grid">
          <label class="field"><span>Nechta rulon keldi?</span>
            <span class="si-big focus"><input id="si-qty" data-first inputmode="numeric" value="${esc(String(c.rolls.length || ''))}" placeholder="0"><em>rulon</em></span></label>
          <label class="field"><span>Xarid narxi, 1 ${esc(p.base_unit_name)}</span>
            <span class="si-big"><input id="si-price" data-money inputmode="decimal" value="${esc(formatMoneyInput(c.price))}" placeholder="0"><em>so'm</em></span></label>
        </div>
        <div class="field"><span>Har bir rulon uzunligi (${esc(p.base_unit_name)}) <small class="muted">odatdagisi yozilgan — boshqacha bo'lsa o'zgartiring</small></span>
          <div class="roll-lens">${c.rolls.map((v, i) => `<label class="roll-len"><i>${i + 1}</i><input class="input" data-roll="${i}" inputmode="decimal" value="${esc(v)}" aria-label="${i + 1}-rulon uzunligi"></label>`).join('')}</div></div>`;
    }
    return `${seg}
      <div class="si-grid">
        <label class="field"><span>${esc(askQty(u.name))}</span>
          <span class="si-big focus"><input id="si-qty" data-first inputmode="decimal" value="${esc(c.qty)}" placeholder="0"><em>${esc(u.name)}</em></span></label>
        <label class="field"><span>Xarid narxi, 1 ${esc(u.name)}</span>
          <span class="si-big"><input id="si-price" data-money inputmode="decimal" value="${esc(formatMoneyInput(c.price))}" placeholder="0"><em>so'm</em></span></label>
      </div>`;
  }

  function supSelect(empty) {
    return `<select class="input" id="si-sup" aria-label="Yetkazib beruvchi">
      <option value="">${esc(empty)}</option>
      ${suppliers.map((s2) => `<option value="${s2.id}" ${String(s2.id) === String(supId) ? 'selected' : ''}>${esc(s2.name)}</option>`).join('')}
      ${ctx.can('suppliers.manage') ? '<option value="__new">+ Yangi yetkazib beruvchi…</option>' : ''}
    </select>`;
  }

  async function newSupplier() {
    const name = await new Promise((resolve) => {
      const { close, el } = openModal({
        title: 'Yangi yetkazib beruvchi',
        body: `<form id="nsf" class="form-grid" novalidate><label class="field"><span>Nomi</span><input class="input" name="name" maxlength="150" placeholder="Masalan: Anvar opt yoki Bozor"></label><div id="nserr"></div></form>`,
        foot: `<button class="btn btn-outline" type="button" data-close>Bekor</button><button class="btn" type="submit" form="nsf">${icon('check', 'ico-sm')} Qo'shish</button>`,
        onClose: () => resolve(null),
      });
      const inp = el.querySelector('[name=name]');
      inp.focus();
      el.querySelector('#nsf').addEventListener('submit', (e) => {
        e.preventDefault();
        if (!inp.value.trim()) { el.querySelector('#nserr').innerHTML = '<div class="alert alert-warn">Nomini yozing</div>'; return; }
        resolve(inp.value.trim());
        close();
      });
    });
    if (!name) { drawForm(); return; }
    const r = await post('/suppliers', { name });
    suppliers.push(r.supplier);
    supId = String(r.supplier.id);
    toast(`«${r.supplier.name}» qo'shildi`, 'ok');
    drawForm();
  }

  function drawForm() {
    const form = $('#si-form');
    if (!cur) {
      form.innerHTML = `<div class="si-empty">
          <span class="hero-ico">${icon('truck')}</span>
          <b>Qaysi tovar keldi?</b>
          <p class="muted">Tepadagi qatorga nomini yozing yoki oxirgi kiritilganlardan birini bosing.${cameraScanSupported() ? ' Shtrix-kod bo\'lsa — kamera tugmasini bosing.' : ''}</p>
        </div>`;
      return;
    }
    const c = cur;
    const head = c.kind === 'sizes' ? c.g : c.p;
    const unitTag = c.kind === 'sizes' ? "O'lchamlar bo'yicha" : c.p.is_roll ? 'Rulonda keladi'
      : c.p.pack && Number(c.p.pack.factor) > 1 ? `1 ${esc(c.p.pack.name)} = ${num(c.p.pack.factor, 3)} ${esc(c.p.base_unit_name)}` : '';
    const lastPrice = c.kind === 'one' && knownPrice(c.p) ? `. Oxirgi xarid narxi ${money(c.p.purchase_price)}` : '';
    form.innerHTML = `
      <div class="si-prod">
        ${productPhoto(head, 'si-prod-img')}
        <div class="si-prod-text"><b>${esc(head.name)}</b>
          <span class="muted">Omborda hozir <b class="num">${num(stockNow(c), 3)} ${esc(baseName(c))}</b>${lastPrice}</span>
          ${unitTag ? `<span class="si-tag">${unitTag}</span>` : ''}</div>
        <button type="button" class="icon-btn icon-btn-light" data-clear aria-label="Boshqa tovar tanlash" title="Boshqa tovar tanlash">${icon('x', 'ico-sm')}</button>
      </div>
      ${fieldsHtml(c)}
      <div class="si-pay">
        <span class="si-pay-q">Pulini to'ladingizmi?</span>
        <div class="seg" role="radiogroup" aria-label="To'lov">
          <button type="button" role="radio" data-pay="paid" class="${pay === 'paid' ? 'active' : ''}" aria-checked="${pay === 'paid'}">To'ladim</button>
          <button type="button" role="radio" data-pay="debt" class="${pay === 'debt' ? 'active' : ''}" aria-checked="${pay === 'debt'}">Qarzga oldim</button>
        </div>
      </div>
      ${pay === 'debt' ? `<label class="field si-debt"><span>Kimdan oldingiz? <small class="muted">qarz shu odamga yoziladi</small></span>${supSelect('— tanlang —')}</label>` : ''}
      ${more ? `<div class="si-more">
          <label class="field"><span>Sana</span><input class="input" type="date" id="si-date" value="${esc(c.date)}" max="${todayStr()}"></label>
          <label class="field"><span>Izoh <small class="muted">(ixtiyoriy)</small></span><input class="input" id="si-note" maxlength="500" value="${esc(c.note)}" placeholder="Masalan: Hasan aka olib keldi"></label>
          ${pay === 'paid' ? `<label class="field"><span>Kimdan keldi? <small class="muted">(ixtiyoriy)</small></span>${supSelect("— ko'rsatmayman —")}</label>
          <div class="field"><span>Qanday to'ladingiz?</span><div class="seg" role="radiogroup" aria-label="To'lov turi">
            ${[['cash', 'Naqd'], ['card', 'Karta'], ['transfer', "O'tkazma"]].map(([k, t]) => `<button type="button" role="radio" data-m="${k}" class="${method === k ? 'active' : ''}" aria-checked="${method === k}">${t}</button>`).join('')}
          </div></div>` : ''}
          <p class="small muted si-more-note">Yo'l kira yoki chegirma bo'lsa — <a href="#/purchases/new">ko'p tovarni bitta yuk qilib kiriting</a></p>
        </div>` : `<button type="button" class="si-more-btn" data-more>${icon('plus', 'ico-xs')} Boshqa: sana, izoh, to'lov turi</button>`}
      <div id="si-err"></div>
      <div class="si-save-row">
        <button type="submit" class="btn btn-lg si-save">${icon('check')} Saqlash va keyingisi <span class="kbd">Enter</span></button>
        <span class="si-after" id="si-after"></span>
      </div>`;
    refreshAfter();
  }

  function refreshAfter() {
    const el = $('#si-after');
    if (!el || !cur) return;
    const add = baseAdd(cur);
    const now = stockNow(cur);
    const sum = lineSum(cur);
    el.innerHTML = add > 0
      ? `Omborda bo'ladi: <b class="num">${num(now, 3)} → ${num(round4(now + add), 3)} ${esc(baseName(cur))}</b>${sum > 0 ? `<br><small>Summa: <b class="num">${money(sum)}</b>${cur.kind === 'one' && isRollUnit(cur.p, cur.unit_id) ? ` · jami ${num(add, 3)} ${esc(cur.p.base_unit_name)}` : ''}</small>` : ''}`
      : '<span class="muted">Sonini yozing</span>';
  }

  // Rulonlar soni o'zgarsa — uzunlik maydonlari qayta chiziladi (yozilganlari saqlanadi)
  function setRollCount(n) {
    const def = String(unitOf(cur.p, cur.unit_id).factor);
    cur.rolls = Array.from({ length: Math.min(100, Math.max(0, n)) }, (_, i) => (cur.rolls[i] !== undefined ? cur.rolls[i] : def));
    const box = $('#si-form .roll-lens');
    if (box) box.innerHTML = cur.rolls.map((v, i) => `<label class="roll-len"><i>${i + 1}</i><input class="input" data-roll="${i}" inputmode="decimal" value="${esc(v)}" aria-label="${i + 1}-rulon uzunligi"></label>`).join('');
  }

  // ---------- saqlash ----------
  function validate() {
    const c = cur;
    if (!c) return { msg: 'Avval tovarni tanlang', el: searchIn };
    if (c.kind === 'sizes') {
      if (!(baseAdd(c) > 0)) return { msg: "Kamida bitta o'lchamdan nechta kelganini yozing", el: $('#si-form [data-size]') };
    } else if (isRollUnit(c.p, c.unit_id)) {
      if (!c.rolls.length) return { msg: 'Nechta rulon kelganini yozing', el: $('#si-qty') };
      const bad = c.rolls.findIndex((x) => !(parseQty(x) > 0));
      if (bad >= 0) return { msg: `${bad + 1}-rulon uzunligini yozing`, el: $(`[data-roll="${bad}"]`) };
    } else if (!(parseQty(c.qty) > 0)) return { msg: 'Nechta kelganini yozing', el: $('#si-qty') };
    if (toMoney(c.price) < 0) return { msg: "Narx manfiy bo'lishi mumkin emas", el: $('#si-price') };
    if (pay === 'debt' && !supId) return { msg: "Qarzga olgan bo'lsangiz, kimdan olganingizni tanlang", el: $('#si-sup') };
    return null;
  }

  function itemsOf(c) {
    const price = toMoney(c.price);
    if (c.kind === 'sizes') {
      return c.g.items.filter((v) => parseQty(c.sizes[v.id]) > 0)
        .map((v) => ({ product_id: v.id, unit_id: v.base_unit_id, quantity: round4(parseQty(c.sizes[v.id])), unit_price: price }));
    }
    if (isRollUnit(c.p, c.unit_id)) {
      return c.rolls.map((len) => ({ product_id: c.p.id, unit_id: c.p.base_unit_id, quantity: round4(parseQty(len)), unit_price: price }));
    }
    return [{ product_id: c.p.id, unit_id: c.unit_id, quantity: round4(parseQty(c.qty)), unit_price: price }];
  }

  function addText(c) {
    if (c.kind === 'sizes') {
      const parts = c.g.items.filter((v) => parseQty(c.sizes[v.id]) > 0).map((v) => `${v.variant_label} ${num(parseQty(c.sizes[v.id]), 3)}`);
      return `+${num(baseAdd(c), 3)} ${c.g.base_unit_name} (${parts.join(', ')})`;
    }
    if (isRollUnit(c.p, c.unit_id)) return `+${c.rolls.length} rulon (${num(baseAdd(c), 3)} ${c.p.base_unit_name})`;
    const u = unitOf(c.p, c.unit_id);
    return `+${num(parseQty(c.qty), 3)} ${u.name}${u.factor !== 1 ? ` (${num(baseAdd(c), 3)} ${c.p.base_unit_name})` : ''}`;
  }

  async function save(btn) {
    const bad = validate();
    if (bad) {
      $('#si-err').innerHTML = `<div class="alert alert-warn">${esc(bad.msg)}</div>`;
      bad.el?.focus();
      if (!isWide()) bad.el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    const c = cur;
    const items = itemsOf(c);
    const total = round2(items.reduce((s, it) => s + it.quantity * it.unit_price, 0));
    const body = {
      supplier_id: supId ? Number(supId) : null,
      purchase_date: more && c.date ? c.date : todayStr(),
      note: more && c.note ? c.note : null,
      items,
      paid_amount: pay === 'paid' ? total : 0,
      payment_method: method,
      idempotency_key: newKey('qin'),
    };
    await withBusy(btn, async () => {
      try {
        const r = await post('/purchases', body);
        // Ombordagi son va xarid narxi shu yerda yangilanadi (sahifani qayta yuklamasdan)
        const touched = c.kind === 'sizes' ? c.g.items : [c.p];
        for (const it of items) {
          const p = catalog.find((x) => x.id === it.product_id);
          if (!p) continue;
          const f = unitOf(p, it.unit_id).factor;
          p.stock_qty = round4(Number(p.stock_qty) + it.quantity * f);
          if (it.unit_price > 0 && p.purchase_price !== undefined) p.purchase_price = round2(it.unit_price / f);
        }
        const after = touched.reduce((s, p) => s + Number(p.stock_qty), 0);
        const entry = {
          id: r.purchase.id,
          no: r.purchase.purchase_no,
          name: c.kind === 'sizes' ? c.g.name : c.p.name,
          image: (c.kind === 'sizes' ? c.g.items[0] : c.p).image_path || null,
          add: addText(c),
          after: `${num(round4(after), 3)} ${baseName(c)}`,
          total,
          paid: pay === 'paid',
          at: Date.now(),
        };
        session.unshift(entry);
        saveSession();
        flashId = entry.id;
        toast(`Saqlandi: ${entry.name} ${entry.add}`, 'ok');
        cur = null;
        drawForm();
        drawRecent();
        drawList();
        refreshRecent();
        if (isWide()) searchIn.focus();
        else window.scrollTo({ top: 0, behavior: 'smooth' });
      } catch (err) {
        $('#si-err').innerHTML = `<div class="alert alert-bad">${esc(err.message)}</div>`;
      }
    });
  }

  // ---------- bugun kiritilganlar ----------
  function drawList() {
    $('#si-count').textContent = session.length ? `${session.length} ta` : '';
    $('#si-total').textContent = money(round2(session.reduce((s, e) => s + Number(e.total || 0), 0)));
    $('#si-foot').hidden = !session.length;
    $('#si-list').innerHTML = session.length ? session.map((e) => `
      <div class="si-row${e.id === flashId ? ' flash' : ''}" data-id="${e.id}">
        <span class="si-ok" aria-hidden="true">${icon('check', 'ico-xs')}</span>
        <div class="si-row-text">
          <b>${esc(e.name)}</b>
          <span>${esc(e.add)}, omborda endi <b class="num">${esc(e.after)}</b></span>
          <span class="si-row-foot"><small class="muted">${money(e.total)}${e.paid ? '' : ' · <b class="amber">qarzga</b>'} · <a href="#/purchases/${e.id}">${esc(e.no)}</a></small>
            <button type="button" class="si-undo" data-undo="${e.id}">${icon('x', 'ico-xs')} Bekor qilish</button></span>
        </div>
      </div>`).join('')
      : `<div class="si-list-empty">${icon('box')}<p>Hali hech narsa kiritilmadi.<br><small>Saqlagan har bir tovaringiz shu yerda ko'rinadi</small></p></div>`;
  }

  async function undo(id, btn) {
    const e = session.find((x) => x.id === id);
    if (!e) return;
    const ok = await confirmBox(`«${e.name}» kiritishini bekor qilasizmi? Omborga qo'shilgan ${e.add.replace(/^\+/, '')} qaytariladi${e.paid ? ", to'langan pul kassaga qaytadi" : ''}.`, { okText: 'Ha, bekor qilish', danger: true });
    if (!ok) return;
    await withBusy(btn, async () => {
      try {
        const r = await post(`/purchases/${id}/undo`, {});
        for (const x of r.products || []) {
          const p = catalog.find((c) => c.id === x.id);
          if (p) p.stock_qty = x.stock_qty;
        }
        session = session.filter((x) => x.id !== id);
        saveSession();
        flashId = null;
        drawList();
        drawForm();
        refreshRecent();
        toast(`Bekor qilindi: ${e.name}`, 'ok');
      } catch (err) {
        // Allaqachon bekor qilingan bo'lsa — ro'yxatdan olib tashlanadi
        if (err.status === 404) {
          session = session.filter((x) => x.id !== id);
          saveSession();
          drawList();
        }
        errorToast(err);
      }
    });
  }

  // ---------- yangi mahsulot ----------
  async function newProduct(name) {
    const like = similarTo(name, catalog);
    if (like.length) {
      const pick = await new Promise((resolve) => {
        const { close, el } = openModal({
          title: "Shunga o'xshash mahsulot bor",
          body: `<p class="muted" style="margin:0 0 12px">Ikki marta yaratib qo'ymaslik uchun: kelgan tovar shulardan biri bo'lsa — o'shani bosing.</p>
            <div class="si-dups">${like.map((p) => `<button type="button" class="si-res-item" data-dup="${p.id}">
              ${productPhoto(p, 'si-res-img')}<span class="si-res-text"><b>${esc(p.model_name || p.name)}</b><small>Omborda ${num(p.stock_qty, 3)} ${esc(p.base_unit_name)}</small></span>
              <span class="btn btn-sm">Shunga qo'shish</span></button>`).join('')}</div>`,
          foot: `<button class="btn btn-outline" type="button" data-close>Bekor</button><button class="btn btn-light" type="button" data-anyway>${icon('plus', 'ico-sm')} Baribir yangi «${esc(name)}»</button>`,
          onClose: () => resolve(null),
        });
        el.querySelectorAll('[data-dup]').forEach((b) => b.addEventListener('click', () => { resolve(Number(b.dataset.dup)); close(); }));
        el.querySelector('[data-anyway]').addEventListener('click', () => { resolve('new'); close(); });
      });
      if (pick === null) return;
      if (pick !== 'new') { selectId(pick); return; }
    }
    const created = await openProductWizard({ name, arrival: true });
    if (!created.length) return;
    catalog = (await get('/products?limit=1000')).products;
    const first = catalog.find((x) => x.id === created[0].id);
    if (!first) return;
    select(first);
    const arrived = Number(created[0].arrived) || 0;
    if (arrived > 0 && cur?.kind === 'one' && !isRollUnit(cur.p, cur.unit_id)) {
      const f = unitOf(cur.p, cur.unit_id).factor;
      cur.qty = String(Math.abs(arrived / f - Math.round(arrived / f)) < 1e-9 ? round4(arrived / f) : arrived);
      if (f !== 1 && cur.qty === String(arrived)) cur.unit_id = cur.p.base_unit_id;
      drawForm();
    } else if (arrived > 0 && cur?.kind === 'sizes') {
      for (const c of created) cur.sizes[c.id] = String(Number(c.arrived) || '');
      drawForm();
    }
    toast("Yangi mahsulot qo'shildi — endi «Saqlash»ni bosing", 'ok');
  }

  async function byCode(code) {
    let p = catalog.find((x) => x.barcode === code);
    if (!p) {
      try {
        const { product } = await get(`/products/barcode/${encodeURIComponent(code)}`);
        p = catalog.find((x) => x.id === product.id) || product;
      } catch (err) {
        if (err.status === 404 && canNewProduct) {
          toast(`${code} — bunday shtrix-kodli tovar yo'q. Yangi mahsulot qo'shing`, 'warn');
          q = code;
          searchIn.value = code;
          drawResults();
          return;
        }
        throw err;
      }
    }
    select(p);
  }

  // ---------- hodisalar ----------
  const setMore = (on) => {
    more = on;
    try { localStorage.setItem('ombor.stockin.more', more ? '1' : '0'); } catch { /* xotira yopiq */ }
    drawForm();
  };

  let timer = null;
  searchIn.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(() => { q = searchIn.value.trim(); drawResults(); drawRecent(); }, 120);
  });
  searchIn.addEventListener('keydown', async (e) => {
    if (e.key === 'Escape') { searchIn.value = ''; q = ''; drawResults(); drawRecent(); return; }
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const text = searchIn.value.trim();
    if (!text) return;
    q = text;
    try {
      const exact = catalog.find((p) => p.barcode && p.barcode === text);
      if (exact) return select(exact);
      const rows = matches();
      if (rows.length) return rows[0].group ? selectModel(rows[0].model_name) : selectId(rows[0].id);
      if (/^\d{6,}$/.test(text)) return await byCode(text);
      drawResults();
    } catch (err) { errorToast(err); }
  });
  $('#si-cam')?.addEventListener('click', () => openBarcodeScanner((code) => byCode(code).catch(errorToast)));

  $('#si-results').addEventListener('click', (e) => {
    if (e.target.closest('[data-new]')) { newProduct(q).catch(errorToast); return; }
    const m = e.target.closest('[data-model]');
    if (m) { selectModel(m.dataset.model); return; }
    const t = e.target.closest('[data-pid]');
    if (t) selectId(t.dataset.pid);
  });
  $('#si-recent').addEventListener('click', (e) => {
    if (e.target.closest('[data-new]')) { newProduct(searchIn.value.trim()).catch(errorToast); return; }
    const b = e.target.closest('[data-recent]');
    if (!b) return;
    const r = recent.find((x) => x.product_id === Number(b.dataset.recent));
    selectId(b.dataset.recent, r);
  });

  const form = $('#si-form');
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    save(form.querySelector('.si-save')).catch(errorToast);
  });
  form.addEventListener('click', (e) => {
    if (e.target.closest('[data-clear]')) { cur = null; drawForm(); drawRecent(); searchIn.focus(); return; }
    if (e.target.closest('[data-more]')) { setMore(true); return; }
    const pb = e.target.closest('[data-pay]');
    if (pb) {
      pay = pb.dataset.pay;
      drawForm();
      if (pay === 'debt' && !supId) $('#si-sup')?.focus();
      return;
    }
    const mb = e.target.closest('[data-m]');
    if (mb) { method = mb.dataset.m; drawForm(); return; }
    const ub = e.target.closest('[data-u]');
    if (ub && cur?.kind === 'one') {
      // Birlik almashsa narx shunga qarab qayta hisoblanadi (rulon rejimida narx 1 metr uchun)
      const oldF = isRollUnit(cur.p, cur.unit_id) ? 1 : unitOf(cur.p, cur.unit_id).factor;
      cur.unit_id = Number(ub.dataset.u);
      const roll = isRollUnit(cur.p, cur.unit_id);
      const newF = roll ? 1 : unitOf(cur.p, cur.unit_id).factor;
      const price = toMoney(cur.price);
      if (price > 0) cur.price = String(round2((price / oldF) * newF));
      cur.rolls = roll ? [String(unitOf(cur.p, cur.unit_id).factor)] : [];
      if (roll) cur.qty = '1';
      drawForm();
      const first = form.querySelector('[data-first]');
      first?.focus();
      first?.select?.();
    }
  });
  form.addEventListener('input', (e) => {
    if (!cur) return;
    const t = e.target;
    if (t.id === 'si-price') cur.price = t.value;
    else if (t.id === 'si-qty') {
      if (cur.kind === 'one' && isRollUnit(cur.p, cur.unit_id)) setRollCount(Math.floor(parseQty(t.value) || 0));
      else cur.qty = t.value;
    } else if (t.dataset.roll !== undefined) cur.rolls[Number(t.dataset.roll)] = t.value;
    else if (t.dataset.size) cur.sizes[t.dataset.size] = t.value;
    else if (t.id === 'si-date') cur.date = t.value;
    else if (t.id === 'si-note') cur.note = t.value;
    if (!$('#si-err')) return;
    $('#si-err').innerHTML = '';
    refreshAfter();
  });

  form.addEventListener('change', (e) => {
    if (e.target.id !== 'si-sup') return;
    if (e.target.value === '__new') { newSupplier().catch(errorToast); return; }
    supId = e.target.value;
    $('#si-err').innerHTML = '';
  });

  $('#si-list').addEventListener('click', (e) => {
    const b = e.target.closest('[data-undo]');
    if (b) undo(Number(b.dataset.undo), b).catch(errorToast);
  });
  drawForm();
  drawResults();
  drawRecent();
  drawList();
  // Tovar sahifasidagi «Tovar kiritish» tugmasidan kelinganda: o'sha tovar darhol tanlanadi
  if (params.query.product) {
    history.replaceState(null, '', '#/stockin');
    selectId(params.query.product);
  } else if (isWide()) searchIn.focus();
}
