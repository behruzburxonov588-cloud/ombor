// Mahsulotlar: ro'yxat, tafsilot, qo'shish/tahrirlash, arxiv, rasm, konvertatsiya
import {
  get, post, put, icon, esc, num, money, qty, dateTime, toast, errorToast, openModal, withBusy,
  productThumb, emptyState, confirmBox, readForm, api, uploadProductImage, packText, productPhoto,
  groupBySize, priceRange, skeletonGrid, download,
} from '../ui.js';
import { openBarcodeScanner, cameraScanSupported } from '../scanner.js';
import { renderProductWizard, openProductWizard } from '../productform.js';


export async function render(root, params, ctx) {
  if (params.id === 'new') {
    if (!ctx.can('products.manage')) {
      root.innerHTML = '<div class="alert alert-bad">Tovar qo\'shish uchun ruxsatingiz yo\'q</div>';
      return undefined;
    }
    // Yangi tovar: oddiy savollar bilan (qanday sotasiz, optomda qanday keladi, har xil hajmi bormi)
    return renderProductWizard(root, {
      name: params.query.name || '',
      onSaved: (created, { again }) => {
        if (again) {
          history.replaceState(null, '', '#/products/new');
          return;
        }
        ctx.go(created.length === 1 ? `#/products/${created[0].id}` : '#/products');
      },
      onCancel: () => ctx.go('#/products'),
    });
  }
  if (params.id && params.sub === 'edit') return renderForm(root, Number(params.id), ctx);
  if (params.id) return renderDetail(root, Number(params.id), ctx);
  return renderList(root, params, ctx);
}

// ---------- Ro'yxat: kartochkalar yoki jadval, qidiruv, filtr, saralash, tez amallar ----------

const PAGE = 48;
const VIEW_KEY = 'ombor-plist-view';
const SORTS = [
  ['name', 'Nomi bo\'yicha (A–Z)'],
  ['stock_asc', 'Qoldig\'i kam → ko\'p'],
  ['stock_desc', 'Qoldig\'i ko\'p → kam'],
  ['price_desc', 'Narxi qimmat → arzon'],
  ['price_asc', 'Narxi arzon → qimmat'],
  ['new', 'Oxirgi qo\'shilgan'],
];
const STOCK_WORD = { out: 'Tugagan', low: 'Kam qoldi', ok: '' };
const EXP_WORD = { expired: "Muddati o'tgan", soon: 'Muddati yaqin' };
const expBad = (p) => p.expiry_status === 'expired' || p.expiry_status === 'soon';
const costOf = (p) => (p.cost_hidden ? null : (Number(p.purchase_price) > 0 ? Number(p.purchase_price) : Number(p.avg_cost) || 0));

function readView() {
  try { return localStorage.getItem(VIEW_KEY) === 'table' ? 'table' : 'grid'; } catch { return 'grid'; }
}
function saveView(v) {
  try { localStorage.setItem(VIEW_KEY, v); } catch { /* xotira yopiq */ }
}

function flagsHtml(p) {
  const out = [];
  if (p.is_archived) out.push('<span class="pcx-flag arch">Arxivda</span>');
  else if (STOCK_WORD[p.status]) out.push(`<span class="pcx-flag ${p.status}">${STOCK_WORD[p.status]}</span>`);
  if (EXP_WORD[p.expiry_status]) out.push(`<span class="pcx-flag exp-${p.expiry_status}" title="Yaroqlilik muddati: ${esc(p.expiry_date)}">${icon('clock', 'ico-xs')} ${EXP_WORD[p.expiry_status]}</span>`);
  return out.join('');
}

// Qoldiq chizig'i: ogohlantirish chegarasiga nisbatan (chegara 3 baravari — to'liq)
function stockBar(p) {
  const min = Number(p.min_stock);
  if (!(min > 0) || p.is_archived) return '';
  const pct = Math.max(0, Math.min(100, (Number(p.stock_qty) / (min * 3)) * 100));
  return `<div class="pcx-bar" role="img" aria-label="Qoldiq: ogohlantirish chegarasi ${num(min, 3)}"><i style="width:${pct.toFixed(1)}%"></i></div>`;
}

function actionsHtml(p, perm, { model = null } = {}) {
  const btns = [];
  if (perm.sell && !p.is_archived) {
    const dis = Number(p.stock_qty) <= 0;
    btns.push(model
      ? `<button type="button" class="btn btn-soft btn-sm pcx-sell" data-sell-model="${esc(model)}" ${dis ? 'disabled' : ''} title="Sotuv oynasida o'lchamni tanlaysiz">${icon('cart', 'ico-sm')}<span>Sotuvga</span></button>`
      : `<button type="button" class="btn btn-soft btn-sm pcx-sell" data-sell="${p.id}" ${dis ? 'disabled title="Tugagan — avval yuk kiriting"' : 'title="Savatchaga qo\'shib, sotuv oynasini ochish"'}>${icon('cart', 'ico-sm')}<span>Sotuvga</span></button>`);
  }
  if (perm.manage && !p.is_archived) {
    btns.push(`<a class="icon-btn pcx-ib" href="#/products/${p.id}/edit" title="Tahrirlash" aria-label="${esc(p.name)}: tahrirlash">${icon('edit', 'ico-sm')}</a>`);
    if (!model) btns.push(`<button type="button" class="icon-btn pcx-ib danger" data-del="${p.id}" title="O'chirish (arxivga o'tadi, keyin qaytarish mumkin)" aria-label="${esc(p.name)}: o'chirish">${icon('trash', 'ico-sm')}</button>`);
  }
  if (perm.manage && p.is_archived) {
    btns.push(`<button type="button" class="btn btn-light btn-sm" data-restore="${p.id}">${icon('restore', 'ico-sm')}<span>Qaytarish</span></button>`);
  }
  return btns.join('');
}

function productCard(p, perm) {
  const st = p.is_archived ? 'arch' : p.status;
  const pk = packText(p.stock_qty, p.base_unit_name, p.pack);
  const cost = costOf(p);
  const code = p.barcode || p.sku;
  return `
    <article class="pcx st-${st}" data-href="#/products/${p.id}">
      <a class="pcx-media" href="#/products/${p.id}" tabindex="-1" aria-hidden="true">
        ${productPhoto(p, 'pcx-img')}
        <span class="pcx-flags">${flagsHtml(p)}</span>
      </a>
      <div class="pcx-body">
        <div class="pcx-cat">${p.category_name ? esc(p.category_name) : '<span class="faint">Turkumsiz</span>'}</div>
        <a class="pcx-name" href="#/products/${p.id}">${esc(p.name)}</a>
        <div class="pcx-code ${code ? '' : 'none'}">${icon('scan', 'ico-xs')}<span>${code ? esc(p.barcode || `SKU ${p.sku}`) : "shtrix-kod yo'q"}</span></div>
        <div class="pcx-prices">
          <div class="pcx-price"><span>Sotuv narxi</span><b>${money(p.selling_price)}</b></div>
          ${cost === null ? '' : `<div class="pcx-price cost"><span>Kelish narxi</span><b>${cost > 0 ? money(cost) : '—'}</b></div>`}
        </div>
        <div class="pcx-stock">
          <div class="pcx-stock-row"><span>Qoldiq</span><b class="pcx-qty">${num(p.stock_qty, 3)} <small>${esc(p.base_unit_name)}</small></b></div>
          ${stockBar(p)}
          ${pk ? `<div class="pcx-pack">= ${esc(pk)}</div>` : ''}
        </div>
      </div>
      ${perm.sell || perm.manage ? `<div class="pcx-actions">${actionsHtml(p, perm)}</div>` : ''}
    </article>`;
}

// Bir modelning o'lchamlari bitta kartochkada: har bir o'lcham va undan nechta qolgani
function modelCard(g, perm) {
  const first = g.items[0];
  const flag = g.status === 'out' ? 'Tugagan' : g.out_count ? `${g.out_count} ta o'lcham tugagan` : (g.status === 'low' ? 'Kam qoldi' : '');
  const cost = costOf(first);
  return `
    <article class="pcx st-${g.status}" data-href="#/products/${first.id}">
      <a class="pcx-media" href="#/products/${first.id}" tabindex="-1" aria-hidden="true">
        ${productPhoto(first, 'pcx-img')}
        <span class="pcx-flags">${flag ? `<span class="pcx-flag ${g.status}">${esc(flag)}</span>` : ''}<span class="pcx-flag sizes">${g.items.length} o'lcham</span></span>
      </a>
      <div class="pcx-body">
        <div class="pcx-cat">${g.category_name ? esc(g.category_name) : '<span class="faint">Turkumsiz</span>'}</div>
        <a class="pcx-name" href="#/products/${first.id}">${esc(g.name)}</a>
        <div class="szs" aria-label="O'lchamlar va qoldig'i">${g.items.map((v) => `<span class="sz${Number(v.stock_qty) <= 0 ? ' out' : ''}"><i>${esc(v.variant_label)}</i><b>${num(v.stock_qty, 3)}</b></span>`).join('')}</div>
        <div class="pcx-prices">
          <div class="pcx-price"><span>Sotuv narxi</span><b>${priceRange(g)}</b></div>
          ${cost === null ? '' : `<div class="pcx-price cost"><span>Kelish narxi</span><b>${cost > 0 ? money(cost) : '—'}</b></div>`}
        </div>
        <div class="pcx-stock"><div class="pcx-stock-row"><span>Jami qoldiq</span><b class="pcx-qty">${num(g.stock_qty, 3)} <small>${esc(g.base_unit_name)}</small></b></div></div>
      </div>
      ${perm.sell || perm.manage ? `<div class="pcx-actions">${actionsHtml({ ...first, stock_qty: g.stock_qty, name: g.name }, perm, { model: g.model_name })}</div>` : ''}
    </article>`;
}

function statusBadge(p) {
  if (p.is_archived) return '<span class="badge badge-muted">Arxivda</span>';
  const parts = [];
  if (p.status === 'out') parts.push('<span class="badge badge-out badge-dot">Tugagan</span>');
  else if (p.status === 'low') parts.push('<span class="badge badge-low badge-dot">Kam qoldi</span>');
  else parts.push('<span class="badge badge-ok badge-dot">Yetarli</span>');
  if (EXP_WORD[p.expiry_status]) parts.push(`<span class="badge ${p.expiry_status === 'expired' ? 'badge-out' : 'badge-low'}" title="${esc(p.expiry_date)}">${EXP_WORD[p.expiry_status]}</span>`);
  return parts.join(' ');
}

function tableHtml(rows, perm) {
  const showCost = rows.some((p) => !p.cost_hidden);
  return `
    <div class="card flush ptable-card"><div class="table-wrap cards"><table class="ptable">
      <thead><tr><th>Mahsulot</th><th>Shtrix-kod / SKU</th>${showCost ? '<th class="right">Kelish narxi</th>' : ''}<th class="right">Sotuv narxi</th><th class="right">Qoldiq</th><th>Holati</th>${perm.sell || perm.manage ? '<th class="right">Amallar</th>' : ''}</tr></thead>
      <tbody>${rows.map((p) => {
        const cost = costOf(p);
        return `<tr class="clickable st-${p.is_archived ? 'arch' : p.status}" data-href="#/products/${p.id}">
          <td data-label="Mahsulot"><div class="pt-name">${productPhoto(p, 'pt-img')}<div class="pt-text"><a href="#/products/${p.id}">${esc(p.name)}</a><small>${p.category_name ? esc(p.category_name) : 'Turkumsiz'}</small></div></div></td>
          <td data-label="Shtrix-kod" class="pt-code">${p.barcode ? esc(p.barcode) : '<span class="faint">—</span>'}${p.sku ? `<small>SKU ${esc(p.sku)}</small>` : ''}</td>
          ${showCost ? `<td data-label="Kelish narxi" class="right num">${cost ? money(cost) : '<span class="faint">—</span>'}</td>` : ''}
          <td data-label="Sotuv narxi" class="right num"><b>${money(p.selling_price)}</b></td>
          <td data-label="Qoldiq" class="right num"><b class="pt-qty">${num(p.stock_qty, 3)}</b> <span class="muted">${esc(p.base_unit_name)}</span></td>
          <td data-label="Holati">${statusBadge(p)}</td>
          ${perm.sell || perm.manage ? `<td class="right no-label"><div class="pt-actions">${actionsHtml(p, perm)}</div></td>` : ''}
        </tr>`;
      }).join('')}</tbody></table></div></div>`;
}

function sortRows(rows, sort) {
  const r = rows.slice();
  const by = {
    name: (a, b) => a.name.localeCompare(b.name),
    stock_asc: (a, b) => Number(a.stock_qty) - Number(b.stock_qty) || a.name.localeCompare(b.name),
    stock_desc: (a, b) => Number(b.stock_qty) - Number(a.stock_qty) || a.name.localeCompare(b.name),
    price_desc: (a, b) => Number(b.selling_price) - Number(a.selling_price) || a.name.localeCompare(b.name),
    price_asc: (a, b) => Number(a.selling_price) - Number(b.selling_price) || a.name.localeCompare(b.name),
    new: (a, b) => b.id - a.id,
  }[sort] || null;
  return by ? r.sort(by) : r;
}

async function renderList(root, params, ctx) {
  let filter = params.query.filter || '';
  let q = (params.query.q || '').trim();
  let shown = PAGE;
  let cat = params.query.cat || '';
  let sort = params.query.sort || 'name';
  let view = readView();
  const canManage = ctx.can('products.manage');
  const canBuy = ctx.can('purchases.create');
  const canExport = ctx.can('reports.export');
  const perm = { manage: canManage, sell: ctx.can('sales.create') };
  let active = [];
  let archived = null;

  root.innerHTML = `
    <div class="page-head">
      <div><h1>Mahsulotlar</h1><p class="muted" id="count">Yuklanmoqda...</p></div>
      <div class="row">
        ${canExport ? `<button class="btn btn-light hide-sm" type="button" data-export="xlsx" title="Ombor holati — Excel">${icon('xlsx', 'ico-sm')}<span class="mobile-hide">Excel</span></button>
        <button class="btn btn-light hide-sm" type="button" data-export="pdf" title="Ombor holati — PDF">${icon('pdf', 'ico-sm')}<span class="mobile-hide">PDF</span></button>` : ''}
        ${canBuy ? `<a class="btn btn-outline" href="#/purchases/new">${icon('truck', 'ico-sm')} Yuk keldi</a>` : ''}
        ${canManage ? `<a class="btn" href="#/products/new" id="btn-new">${icon('plus', 'ico-sm')} Yangi tovar</a>` : ''}
      </div>
    </div>
    <div class="plist-tools">
      <div class="plist-bar">
        <div class="search-input">${icon('search', 'ico-sm')}<input class="input" type="search" id="q" placeholder="Nomi, shtrix-kod yoki SKU bo'yicha qidirish" value="${esc(q)}" autocomplete="off" aria-label="Tovar qidirish"></div>
        <select class="input plist-sort" id="sort" aria-label="Saralash">${SORTS.map(([k, l]) => `<option value="${k}" ${k === sort ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>
        <div class="seg view-seg" role="group" aria-label="Ko'rinish">
          <button type="button" data-view="grid" class="${view === 'grid' ? 'active' : ''}" title="Kartochkalar" aria-label="Kartochkalar">${icon('dashboard', 'ico-sm')}</button>
          <button type="button" data-view="table" class="${view === 'table' ? 'active' : ''}" title="Jadval" aria-label="Jadval">${icon('list', 'ico-sm')}</button>
        </div>
      </div>
      <div class="chips" id="chips"></div>
      <div class="chips pos-cats" id="pcat" hidden></div>
    </div>
    <div id="list">${skeletonGrid(8)}</div>`;

  const chipsEl = root.querySelector('#chips');
  const listEl = root.querySelector('#list');

  const drawChips = () => {
    const out = active.filter((p) => p.status === 'out').length;
    const low = active.filter((p) => p.status === 'low').length;
    const exp = active.filter(expBad).length;
    const chips = [
      { key: '', label: `Hammasi <b>${active.length}</b>` },
      { key: 'out', label: `Tugagan <b>${out}</b>`, cls: out ? 'chip-bad' : '' },
      { key: 'low', label: `Kam qolgan <b>${low}</b>`, cls: low ? 'chip-warn' : '' },
      ...(exp || filter === 'expiry' ? [{ key: 'expiry', label: `${icon('clock', 'ico-xs')} Muddati yaqin <b>${exp}</b>`, cls: exp ? 'chip-warn' : '' }] : []),
      { key: 'archived', label: `${icon('archive', 'ico-xs')} Arxiv` },
    ];
    chipsEl.innerHTML = chips.map((c) => `<button type="button" class="chip ${c.cls || ''} ${c.key === filter ? 'active' : ''}" data-f="${c.key}">${c.label}</button>`).join('');
    const parts = [`${active.length} xil tovar`];
    if (out) parts.push(`${out} tasi tugagan`);
    if (low) parts.push(`${low} tasi kam qolgan`);
    if (exp) parts.push(`${exp} tasining muddati yaqin`);
    root.querySelector('#count').textContent = parts.join(' · ');
    // Turkumlar (kategoriyalar) — bor bo'lsa
    const seen = new Map();
    for (const p of active) if (p.category_id && !seen.has(p.category_id)) seen.set(p.category_id, p.category_name);
    const cats = [...seen.entries()].sort((a, b) => a[1].localeCompare(b[1]));
    const catEl = root.querySelector('#pcat');
    catEl.hidden = cats.length < 2;
    catEl.innerHTML = `<span class="small muted" style="flex:none">Turkum:</span>${[['', 'Hammasi'], ...cats].map(([id, name]) => `<button type="button" class="chip ${String(cat) === String(id) ? 'active' : ''}" data-cat="${id}">${esc(name)}</button>`).join('')}`;
  };

  const filtered = () => {
    const src = filter === 'archived' ? (archived || []) : active;
    const text = q.toLowerCase();
    return sortRows(src.filter((p) => (filter === 'out' || filter === 'low' ? p.status === filter : true)
      && (filter === 'expiry' ? expBad(p) : true)
      && (!cat || String(p.category_id) === String(cat))
      && (!text || p.name.toLowerCase().includes(text) || (p.barcode && p.barcode === q) || (p.sku && p.sku.toLowerCase() === text))), sort);
  };

  const draw = () => {
    const rows = filtered();
    if (!rows.length) {
      listEl.innerHTML = emptyList(q, filter, canManage);
      return;
    }
    const page = rows.slice(0, shown);
    listEl.innerHTML = `
      ${view === 'table' ? tableHtml(page, perm) : `<div class="pc-grid pcx-grid">${groupBySize(page).map((x) => (x.group ? modelCard(x, perm) : productCard(x, perm))).join('')}</div>`}
      ${rows.length > shown ? `<div class="home-foot"><button class="btn btn-light" type="button" id="more">Yana ko'rsatish (${rows.length - shown} ta qoldi)</button></div>` : ''}`;
    listEl.querySelector('#more')?.addEventListener('click', () => { shown += PAGE; draw(); });
  };

  // Manzilni yangilab qo'yamiz (orqaga qaytganda filtr va qidiruv saqlanadi)
  const remember = () => {
    const qs = new URLSearchParams();
    if (filter) qs.set('filter', filter);
    if (cat) qs.set('cat', cat);
    if (q) qs.set('q', q);
    if (sort !== 'name') qs.set('sort', sort);
    history.replaceState(null, '', `#/products${qs.toString() ? `?${qs}` : ''}`);
  };

  const reloadActive = async () => {
    active = (await get('/products?limit=1000')).products;
    archived = null;
    if (filter === 'archived') archived = (await get('/products?archived=1&limit=1000')).products;
    drawChips();
    draw();
  };

  // Kartochka va jadval amallari: sotuvga qo'shish, tahrirlash, o'chirish (arxiv), qaytarish
  listEl.addEventListener('click', async (e) => {
    const sell = e.target.closest('[data-sell]');
    if (sell) { ctx.go(`#/sales?add=${sell.dataset.sell}`); return; }
    const sellM = e.target.closest('[data-sell-model]');
    if (sellM) { ctx.go(`#/sales?q=${encodeURIComponent(sellM.dataset.sellModel)}`); return; }
    const del = e.target.closest('[data-del]');
    if (del) {
      const p = active.find((x) => x.id === Number(del.dataset.del));
      if (!p) return;
      const ok = await confirmBox(`«${p.name}» o'chirilsinmi? U arxivga o'tadi: sotuvda ko'rinmaydi, lekin tarixi saqlanadi va keyin «Arxiv» bo'limidan qaytarish mumkin.`, { okText: "Ha, o'chirish", danger: true });
      if (!ok) return;
      try {
        await withBusy(del, () => post(`/products/${p.id}/archive`));
        toast(`«${p.name}» arxivga o'tkazildi`, 'ok');
        await reloadActive();
      } catch (err) { errorToast(err); }
      return;
    }
    const rest = e.target.closest('[data-restore]');
    if (rest) {
      try {
        await withBusy(rest, () => post(`/products/${rest.dataset.restore}/restore`));
        toast('Mahsulot arxivdan qaytarildi', 'ok');
        await reloadActive();
      } catch (err) { errorToast(err); }
      return;
    }
    if (e.target.closest('a, button, input, select')) return;
    const card = e.target.closest('[data-href]');
    if (card) ctx.go(card.dataset.href);
  });

  root.querySelectorAll('[data-view]').forEach((b) => b.addEventListener('click', () => {
    view = b.dataset.view;
    saveView(view);
    root.querySelectorAll('[data-view]').forEach((x) => x.classList.toggle('active', x === b));
    draw();
  }));
  // «Yangi tovar» — ro'yxatdan chiqmasdan, o'ng tomondan chiqadigan panelda
  root.querySelector('#btn-new')?.addEventListener('click', (e) => {
    if (e.ctrlKey || e.metaKey || e.shiftKey) return;
    e.preventDefault();
    openProductWizard({ drawer: true, name: q, onAdded: () => reloadActive().catch(errorToast) });
  });
  root.querySelector('#sort').addEventListener('change', (e) => { sort = e.target.value; shown = PAGE; draw(); remember(); });
  root.querySelectorAll('[data-export]').forEach((b) => b.addEventListener('click', () => withBusy(b, () => download(`/reports/export?report=inventory&format=${b.dataset.export}`)).catch(errorToast)));

  root.querySelector('#pcat').addEventListener('click', (e) => {
    const b = e.target.closest('[data-cat]');
    if (!b) return;
    cat = b.dataset.cat;
    shown = PAGE;
    root.querySelectorAll('#pcat [data-cat]').forEach((x) => x.classList.toggle('active', x === b));
    draw();
    remember();
  });
  chipsEl.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-f]');
    if (!b) return;
    filter = b.dataset.f;
    shown = PAGE;
    if (filter === 'archived' && !archived) {
      listEl.innerHTML = skeletonGrid(4);
      try { archived = (await get('/products?archived=1&limit=1000')).products; } catch (err) { errorToast(err); archived = []; }
    }
    drawChips();
    draw();
    remember();
  });
  let timer = null;
  root.querySelector('#q').addEventListener('input', (e) => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      q = e.target.value.trim();
      shown = PAGE;
      draw();
      remember();
    }, 150);
  });

  await reloadActive();
}

// Bo'sh ro'yxat: birinchi mahsulotga taklif yoki qidiruv bo'yicha yangi mahsulot qo'shish
function emptyList(q, filter, canManage) {
  if (!q && !filter) {
    return `<div class="card empty-hero">
      <span class="hero-ico">${icon('box')}</span>
      <h2>Hali mahsulot yo'q</h2>
      <p>${canManage ? "Birinchi mahsulotingizni qo'shing: nomi va sotuv narxi kifoya. Bir daqiqa vaqt oladi." : "Mahsulot qo'shish uchun do'kon egasi yoki administratorga murojaat qiling."}</p>
      ${canManage ? `<a class="btn btn-lg" href="#/products/new">${icon('plus')} Birinchi mahsulotni qo'shish</a>` : ''}
    </div>`;
  }
  if (q && canManage && filter !== 'archived') {
    return `<div class="card empty-hero">
      <span class="hero-ico">${icon('search')}</span>
      <h2>«${esc(q)}» topilmadi</h2>
      <p>Bunday mahsulot hali qo'shilmagan bo'lsa, hoziroq qo'shishingiz mumkin.</p>
      <a class="btn" href="#/products/new?name=${encodeURIComponent(q)}">${icon('plus')} «${esc(q)}» ni qo'shish</a>
    </div>`;
  }
  const text = { archived: "Arxivda mahsulot yo'q", low: "Kam qolgan mahsulot yo'q — hammasi yetarli", out: "Tugagan mahsulot yo'q — hammasi bor" }[filter] || 'Hech narsa topilmadi';
  return `<div class="card">${emptyState(text, 'box')}</div>`;
}

// ---------- Bitta tovar sahifasi: rasm, qancha qolgani, narxi, nima keldi-ketdi ----------

const MOVES = {
  opening: { label: "Boshlang'ich qoldiq", ico: 'box' },
  purchase: { label: 'Yuk keldi', ico: 'truck' },
  sale: { label: 'Sotildi', ico: 'cart' },
  return: { label: 'Mijoz qaytardi', ico: 'restore' },
  damage: { label: "Yaroqsiz bo'ldi (zarar)", ico: 'alert' },
  correction: { label: "Qoldiq to'g'rilandi", ico: 'edit' },
};

function moveLink(m) {
  if (!m.reference_id) return '';
  if (m.reference_type === 'purchase') return `#/purchases/${m.reference_id}`;
  if (m.reference_type === 'sale' || m.reference_type === 'sale_return') return `#/sales/${m.reference_id}`;
  return '';
}

function moveRow(m, p) {
  const t = MOVES[m.movement_type] || { label: m.movement_type, ico: 'history' };
  const q = Number(m.quantity);
  const dir = q >= 0 ? 'in' : 'out';
  const pk = packText(Math.abs(q), p.base_unit_name, p.pack);
  const href = moveLink(m);
  const tag = href ? 'a' : 'div';
  const sub = [dateTime(m.created_at), m.user_name, m.note !== t.label ? m.note : ''].filter(Boolean).map(esc).join(' · ');
  return `
    <${tag} class="hist ${dir}" ${href ? `href="${href}"` : ''}>
      <span class="hist-ico">${icon(t.ico, 'ico-sm')}</span>
      <div class="hist-meta"><div class="hist-title">${esc(t.label)}</div><div class="hist-sub">${sub}</div></div>
      <div class="hist-qty"><b>${q >= 0 ? '+' : '−'}${num(Math.abs(q), 3)} ${esc(p.base_unit_name)}</b>
        <span>${pk ? `${esc(pk)} · ` : ''}qoldi ${num(m.balance_after, 3)}</span></div>
    </${tag}>`;
}

// Tovar sahifasi: shu modelning hamma o'lchamlari (qoldig'i va narxi), yangi o'lcham qo'shish
async function mountSizes(root, p, ctx) {
  const box = root.querySelector('#sizes');
  if (!box) return;
  const draw = async () => {
    const { products: list } = await get(`/products?model=${encodeURIComponent(p.model_name)}`);
    const items = list.filter((v) => v.variant_label).sort((a, b) => a.id - b.id);
    const total = items.reduce((s, v) => s + Number(v.stock_qty), 0);
    box.innerHTML = `
      <div class="card-head"><h2>${esc(p.model_name)}: o'lchamlari</h2><span class="small muted">jami ${num(total, 3)} ${esc(p.base_unit_name)}</span></div>
      <div class="sz-table">${items.map((v) => `
        <a class="sz-cell${v.id === p.id ? ' cur' : ''}${Number(v.stock_qty) <= 0 ? ' out' : ''}" href="#/products/${v.id}">
          <span class="sz-l">${esc(v.variant_label)}</span>
          <span class="sz-q">${num(v.stock_qty, 3)} <small>${esc(v.base_unit_name)}</small></span>
          <span class="sz-p">${money(v.selling_price)}</span>
        </a>`).join('')}</div>
      ${ctx.can('products.manage') && !p.is_archived ? `<button class="btn btn-light" type="button" id="sz-add" style="margin-top:12px">${icon('plus', 'ico-sm')} Yangi o'lcham qo'shish</button>` : ''}`;
    box.querySelector('#sz-add')?.addEventListener('click', () => addSize(items));
  };
  const addSize = (items) => {
    const { el, close } = openModal({
      title: `${p.model_name}: yangi o'lcham`,
      body: `<form id="szf" class="form-grid">
        <label class="field"><span>O'lcham</span><input class="input input-lg" name="label" maxlength="40" required placeholder="Masalan: XXL yoki 45" autocomplete="off"></label>
        <label class="field"><span>Nechta bor?</span><input class="input input-lg" name="qty" inputmode="decimal" placeholder="0"></label>
        <label class="field"><span>Sotuv narxi</span><input class="input input-lg" name="sell" inputmode="decimal" value="${Number(p.selling_price)}"></label>
        <div id="szerr"></div>
        <button class="btn btn-lg btn-block" type="submit">${icon('check')} Qo'shish</button></form>`,
    });
    el.querySelector('[name=label]').focus();
    el.querySelector('#szf').addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = Object.fromEntries(new FormData(e.currentTarget));
      const label = String(f.label || '').trim();
      const qty = Number(String(f.qty || '0').replace(',', '.').replace(/\s/g, ''));
      const sell = Number(String(f.sell || '').replace(',', '.').replace(/\s/g, ''));
      const err = (m) => { el.querySelector('#szerr').innerHTML = `<div class="alert alert-bad">${esc(m)}</div>`; };
      if (!label) return err("O'lchamni yozing");
      if (items.some((v) => v.variant_label.toLowerCase() === label.toLowerCase())) return err(`«${label}» o'lchami allaqachon bor`);
      if (!(qty >= 0)) return err("Son noto'g'ri");
      if (!(sell >= 0)) return err("Narx noto'g'ri");
      try {
        await post('/products', {
          name: `${p.model_name} ${label}`, model_name: p.model_name, variant_label: label,
          base_unit_id: p.base_unit_id, selling_price: sell, purchase_price: Number(p.purchase_price) || 0,
          min_stock: Number(p.min_stock) || 0, category_id: p.category_id || null, supplier_id: p.supplier_id || null,
          conversions: (p.conversions || []).map((c) => ({ unit_id: c.unit_id, factor: c.factor })),
          ...(qty > 0 ? { opening_qty: qty } : {}),
        });
        close();
        toast(`«${label}» o'lchami qo'shildi`, 'ok');
        await draw();
      } catch (e2) { err(e2.message); }
      return undefined;
    });
  };
  try { await draw(); } catch (e) { box.innerHTML = `<div class="alert alert-bad">${esc(e.message)}</div>`; }
}

async function renderDetail(root, id, ctx) {
  const [{ product: p, batches }, hist] = await Promise.all([get(`/products/${id}`), get(`/products/${id}/history`)]);
  const canManage = ctx.can('products.manage');
  const canBuy = ctx.can('purchases.create') && !p.is_archived;
  const unit = esc(p.base_unit_name);
  const showCost = !p.cost_hidden;
  const st = p.is_archived ? 'arch' : p.status;
  const pk = packText(p.stock_qty, p.base_unit_name, p.pack);
  const cost = showCost ? (Number(p.avg_cost) > 0 ? Number(p.avg_cost) : Number(p.purchase_price)) : 0;
  const margin = showCost && cost > 0 ? Number(p.selling_price) - cost : null;
  const statusText = {
    out: "Tugagan — sotish uchun yangi yuk kiriting",
    low: `Kam qolgan${Number(p.min_stock) > 0 ? ` (${num(p.min_stock, 3)} ${unit} va undan kam qolsa ogohlantiramiz)` : ''}`,
    ok: 'Yetarli',
    arch: 'Arxivda — sotuvda ko\'rinmaydi',
  }[st];
  const moves = hist.movements;
  const MV_SHOW = 12;

  root.innerHTML = `
    <div class="page-head">
      <a class="btn btn-light btn-sm" href="#/products">${icon('back', 'ico-sm')} Mahsulotlar</a>
    </div>

    <section class="card pd-hero st-${st}">
      <div class="pd-photo-wrap">
        ${productPhoto(p, 'pd-photo')}
        ${canManage ? `<label class="pd-photo-btn">${icon('camera', 'ico-sm')} ${p.image_path ? 'Rasmni almashtirish' : "Rasm qo'yish"}<input type="file" accept="image/*" id="img" hidden></label>` : ''}
      </div>
      <div class="pd-main">
        <h1 class="pd-name">${esc(p.name)}</h1>
        <div class="small muted">${esc(p.category_name || 'Kategoriyasiz')}${p.sku ? ` · Artikul: <b>${esc(p.sku)}</b>` : ''}${p.barcode ? ` · Shtrix-kod: <span class="num">${esc(p.barcode)}</span>` : ''}</div>
        <div class="pd-stock">
          <div class="pd-stock-label">Omborda qoldi</div>
          <div class="pd-stock-num">${num(p.stock_qty, 3)} <span>${unit}</span></div>
          ${pk ? `<div class="pd-stock-pack">= ${esc(pk)}</div>` : ''}
          <div class="pd-stock-st"><span class="dot"></span>${esc(statusText)}</div>
        </div>
        ${p.expiry_date ? `<div class="pd-exp ${p.expiry_status || ''}">${icon('clock', 'ico-sm')}<span>Yaroqlilik muddati: <b>${esc(p.expiry_date.split('-').reverse().join('.'))}</b>${p.expiry_status === 'expired' ? " — muddati o'tgan, sotmang" : p.expiry_status === 'soon' ? ' — 30 kundan kam qoldi' : ''}</span></div>` : ''}
        ${p.description ? `<p class="pd-desc">${esc(p.description)}</p>` : ''}
        <div class="pd-actions">
          ${canBuy ? `<a class="btn btn-lg" href="#/purchases/new?product=${id}">${icon('truck')} Yuk keldi</a>` : ''}
          ${canManage && !p.is_archived ? `<a class="btn btn-lg btn-outline" href="#/products/${id}/edit">${icon('edit')} O'zgartirish</a>` : ''}
          ${ctx.can('sales.create') && !p.is_archived && Number(p.stock_qty) > 0 ? `<a class="btn btn-lg btn-soft" href="#/sales?add=${id}">${icon('cart')} Sotuvga</a>` : ''}
        </div>
      </div>
    </section>

    ${p.model_name ? '<section class="card" id="sizes"><div class="empty small">O\'lchamlar yuklanmoqda...</div></section>' : ''}

    <div class="pd-facts">
      <div class="pd-fact"><span>Sotuv narxi</span><b>${money(p.selling_price)}</b><small>1 ${unit} uchun${p.pack ? ` · 1 ${esc(p.pack.name)} = ${money(Number(p.selling_price) * p.pack.factor)}` : ''}</small></div>
      ${showCost ? `<div class="pd-fact"><span>Kelish narxi</span><b>${cost > 0 ? money(cost) : '—'}</b><small>${cost > 0 ? `1 ${unit} sizga shunga tushgan` : 'hali kiritilmagan'}</small></div>` : ''}
      ${margin !== null ? `<div class="pd-fact ${margin >= 0 ? 'good' : 'bad'}"><span>Har biridan foyda</span><b>${money(margin)}</b><small>1 ${unit} sotsangiz</small></div>` : ''}
      <div class="pd-fact"><span>Jami sotildi</span><b>${num(p.sold_qty, 3)} ${unit}</b><small>${money(p.sold_revenue)}ga${showCost ? ` · foyda ${money(p.profit)}` : ''}</small></div>
      ${p.conversions.length ? `<div class="pd-fact"><span>Qadoq</span><b>${p.conversions.map((c) => `1 ${esc(c.name)} = ${num(c.factor, 4)} ${unit}`).join('<br>')}</b><small>yuk kelganda shunday hisoblanadi</small></div>` : ''}
    </div>

    <section class="card">
      <div class="card-head"><h2>Nima keldi, nima ketdi</h2><span class="small muted">eng yangisi tepada</span></div>
      ${moves.length ? `<div class="hist-list" id="mv">${moves.slice(0, MV_SHOW).map((m) => moveRow(m, p)).join('')}</div>
        ${moves.length > MV_SHOW ? `<div class="home-foot"><button class="btn btn-ghost btn-sm" type="button" id="mv-more">Hammasini ko'rsatish (${moves.length})</button></div>` : ''}`
        : emptyState("Hali hech narsa kelmagan va sotilmagan", 'clock')}
    </section>

    <details class="card pd-more">
      <summary>${icon('list', 'ico-sm')} Batafsil ma'lumot ${canManage ? "va arxivlash" : ''}</summary>
      <div class="pd-more-body">
        ${showCost ? `<div class="list">
          <div class="list-item"><div class="meta"><div class="name">Ombordagi qiymati</div><div class="sub">qoldiq × kelish narxi</div></div><div class="end num">${money(p.stock_value)}</div></div>
          <div class="list-item"><div class="meta"><div class="name">Standart kirim narxi</div><div class="sub">yangi yuk kiritganda taklif qilinadi</div></div><div class="end num">${money(p.purchase_price)}</div></div>
          <div class="list-item"><div class="meta"><div class="name">Minimal qoldiq</div><div class="sub">shundan kam qolsa ogohlantiramiz</div></div><div class="end num">${num(p.min_stock, 3)} ${unit}</div></div>
        </div>` : ''}
        ${batches.length ? `
        <h3 class="pd-sub">Omborda turgan partiyalar <span class="small muted">(avval kelgani avval sotiladi)</span></h3>
        <div class="table-wrap cards"><table>
          <thead><tr><th>Kelgan sana</th><th>Qayerdan</th><th class="right">Qoldi</th>${showCost ? '<th class="right">Kelish narxi</th>' : ''}</tr></thead>
          <tbody>${batches.map((b) => `<tr>
            <td data-label="Sana">${dateTime(b.received_at)}</td>
            <td data-label="Qayerdan">${esc(sourceLabel(b.source_type))}</td>
            <td data-label="Qoldi" class="right num">${num(b.qty_remaining, 4)} / ${num(b.qty_initial, 4)} ${unit}</td>
            ${showCost ? `<td data-label="Kelish narxi" class="right num">${money(b.unit_cost)}</td>` : ''}
          </tr>`).join('')}</tbody></table></div>` : ''}
        ${canManage ? `<div class="row" style="margin-top:12px">
          <button class="btn ${p.is_archived ? 'btn-success' : 'btn-light'}" type="button" id="btn-arch">${icon(p.is_archived ? 'restore' : 'archive', 'ico-sm')} ${p.is_archived ? 'Arxivdan qaytarish' : 'Arxivlash (endi sotilmaydi)'}</button>
        </div>` : ''}
      </div>
    </details>`;

  mountSizes(root, p, ctx); // o'lchamlar (bo'lsa) alohida yuklanadi
  root.querySelector('#mv-more')?.addEventListener('click', (e) => {
    root.querySelector('#mv').innerHTML = moves.map((m) => moveRow(m, p)).join('');
    e.currentTarget.remove();
  });

  root.querySelector('#btn-arch')?.addEventListener('click', async (e) => {
    if (!p.is_archived) {
      const ok = await confirmBox(`"${p.name}" arxivlansinmi? Arxivdagi mahsulot sotilmaydi, tarix saqlanadi.`, { okText: 'Arxivlash', danger: true });
      if (!ok) return;
      await withBusy(e.currentTarget, () => post(`/products/${id}/archive`));
    } else {
      await withBusy(e.currentTarget, () => post(`/products/${id}/restore`));
    }
    toast('Saqlandi', 'ok');
    renderDetail(root, id, ctx);
  });

  root.querySelector('#img')?.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      toast('Rasm yuklanmoqda…');
      await uploadProductImage(id, file);
      toast('Rasm yuklandi', 'ok');
      renderDetail(root, id, ctx);
    } catch (err) {
      errorToast(err);
    }
  });
}

function sourceLabel(s) {
  return { opening: 'Boshlang\'ich', purchase: 'Yuk keldi', return: 'Qaytarilgan', correction: 'Tuzatish', adjustment: 'Tuzatish', inventory_count: 'Sanoq' }[s] || s;
}

// ---------- Qo'shish / tahrirlash formasi ----------

async function renderForm(root, id, ctx, prefill = {}) {
  const [units, cats, sups] = await Promise.all([
    get('/units').then((r) => r.units),
    get('/categories').then((r) => r.categories),
    // Yetkazib beruvchilar ro'yxatiga ruxsat bo'lmasa ham mahsulot formasi ishlaydi
    get('/suppliers').then((r) => r.suppliers).catch(() => []),
  ]);
  let p = null;
  if (id) p = (await get(`/products/${id}`)).product;
  if (!id && !ctx.can('products.manage')) {
    root.innerHTML = '<div class="alert alert-bad">Mahsulot qo\'shish uchun ruxsatingiz yo\'q</div>';
    return;
  }
  let unitList = units;
  const unitOpts = (selected) => unitList.map((u) => `<option value="${u.id}" ${Number(selected) === u.id ? 'selected' : ''}>${esc(u.name)}</option>`).join('');
  let convs = (p?.conversions || []).map((c) => ({ unit_id: c.unit_id, factor: c.factor }));

  root.innerHTML = `
    <div class="page-head">
      <a class="btn btn-light btn-sm" href="${id ? `#/products/${id}` : '#/products'}">${icon('back', 'ico-sm')} Orqaga</a>
      <h1>${id ? 'Mahsulotni tahrirlash' : 'Yangi mahsulot'}</h1>
    </div>
    <form id="pf" class="card form-grid two" novalidate>
      <div class="form-sec" style="grid-column:1/-1"><h3>Asosiy ma'lumot</h3><small>* belgili maydonlar majburiy. Qolganini keyin ham to'ldirish mumkin.</small></div>

      <label class="field" style="grid-column:1/-1"><span>Mahsulot nomi *</span>
        <input class="input" name="name" required maxlength="150" value="${esc(p?.name || prefill.name || '')}" placeholder="Masalan: Un oliy nav" autocomplete="off"></label>

      <label class="field"><span>Sotuv narxi (1 birlik uchun, so'm) *</span>
        <input class="input" name="selling_price" data-type="num" inputmode="decimal" required value="${p?.selling_price ?? ''}" placeholder="0"><small>Xaridorga shu narxda sotiladi</small></label>

      <label class="field"><span>Kirim narxi (1 birlik uchun, so'm)</span>
        <input class="input" name="purchase_price" data-type="num" inputmode="decimal" value="${p?.purchase_price ?? ''}" placeholder="0"><small>O'zingiz necha so'mga olgansiz (foydani hisoblash uchun)</small></label>

      <div class="field"><span>O'lchov birligi *</span>
        <div class="input-group">
          <select class="input" name="base_unit_id" id="base-unit" ${id && Number(p?.stock_qty) > 0 ? 'disabled' : ''}>${unitOpts(p?.base_unit_id || units.find((u) => u.code === 'piece')?.id)}</select>
          <button class="btn btn-light" type="button" id="new-unit" style="min-width:56px" aria-label="Yangi birlik">${icon('plus')}</button>
        </div>
        <small>${id && Number(p?.stock_qty) > 0 ? "Omborda qoldig'i bor tovarning birligini o'zgartirib bo'lmaydi" : 'Qoldiq shu birlikda hisoblanadi (masalan: dona, kg, litr)'}</small></div>

      ${!id ? `<label class="field"><span>Hozir omborda qancha bor? (ixtiyoriy)</span>
        <input class="input" name="opening_qty" data-type="num" inputmode="decimal" placeholder="0"><small>Bo'sh qoldirsangiz, keyin «Kirim» orqali qo'shasiz</small></label>`
    : `<label class="field"><span>Minimal qoldiq (ogohlantirish)</span>
        <input class="input" name="min_stock" data-type="num" inputmode="decimal" value="${p?.min_stock ?? 0}" placeholder="0"><small>Qoldiq shundan kamaysa, ogohlantiriladi</small></label>`}

      <div class="form-sec" style="grid-column:1/-1"><h3>Qo'shimcha ma'lumot (ixtiyoriy)</h3></div>

      <div class="field"><span>Shtrix-kod</span>
        <div class="input-group">
          <input class="input" name="barcode" maxlength="64" inputmode="numeric" value="${esc(p?.barcode || '')}" placeholder="Skaner yoki qo'lda">
          ${cameraScanSupported() ? `<button class="btn btn-light" type="button" id="scan" aria-label="Kamera bilan o'qish" style="min-width:56px">${icon('camera')}</button>` : ''}
        </div>
        <small>Bo'sh qoldirsangiz, shtrix-kodsiz mahsulot bo'ladi</small></div>

      <label class="field"><span>Artikul (SKU)</span>
        <input class="input" name="sku" maxlength="64" value="${esc(p?.sku || '')}" placeholder="Masalan: PEP-05">
        <small>Do'koningizning ichki kodi. Qidiruvda ham topiladi</small></label>

      <label class="field"><span>Kategoriya</span>
        <input class="input" name="category" list="cats" maxlength="60" value="${esc(p?.category_name || '')}" placeholder="Tanlang yoki yangi yozing">
        <datalist id="cats">${cats.map((c) => `<option value="${esc(c.name)}">`).join('')}</datalist></label>

      <label class="field"><span>Yetkazib beruvchi</span>
        <select class="input" name="supplier_id" data-type="nullable"><option value="">— tanlanmagan —</option>
          ${sups.map((s) => `<option value="${s.id}" ${p?.supplier_id === s.id ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}
        </select></label>

      ${!id ? `<label class="field"><span>Minimal qoldiq (ogohlantirish)</span>
        <input class="input" name="min_stock" data-type="num" inputmode="decimal" value="0" placeholder="0"><small>Qoldiq shundan kamaysa, ogohlantiriladi</small></label>` : ''}

      <label class="field"><span>Yaroqlilik muddati <small>(ixtiyoriy)</small></span>
        <input class="input" name="expiry_date" type="date" value="${esc(p?.expiry_date || '')}"><small>Oziq-ovqat, dori, kosmetika uchun. 30 kun qolganda ro'yxatda belgilanadi</small></label>

      <label class="field" style="grid-column:1/-1"><span>Izoh <small>(ixtiyoriy)</small></span>
        <textarea class="input" name="description" maxlength="1000" rows="3" placeholder="Masalan: tarkibi, rangi, qaysi javonda turadi">${esc(p?.description || '')}</textarea></label>

      <div class="field" style="grid-column:1/-1">
        <span>Optomda qanday keladi? (qadoqlar)</span>
        <small>Masalan: 1 rulon ichida 100 metr, 1 blok ichida 12 dona. Yuk kelganda va sotuvda shu qadoqni tanlash mumkin.</small>
        <div id="convs" class="stack"></div>
        <button class="btn btn-light btn-sm" type="button" id="add-conv" style="align-self:flex-start">${icon('plus', 'ico-sm')} Qadoq qo'shish</button>
      </div>

      <div class="field" style="grid-column:1/-1">
        <span>Mahsulot rasmi</span>
        <div class="row" style="gap:12px">
          ${productThumb(p || { name: '?' }, true)}
          <div class="stack" style="gap:4px">
            <label class="btn btn-light btn-sm file-btn" style="align-self:flex-start">${icon('image', 'ico-sm')} Rasm tanlash
              <input type="file" accept="image/*" name="image" id="imgf"></label>
            <span class="file-name" id="imgname">Telefon rasmi ham bo'ladi — o'zi kichraytiriladi</span>
          </div>
        </div>
      </div>

      <div id="form-error" style="grid-column:1/-1"></div>
      <div style="grid-column:1/-1;display:flex;gap:10px;flex-wrap:wrap">
        <button class="btn btn-lg" type="submit" id="save" style="flex:1 1 200px">${icon('check')} Saqlash</button>
        ${!id ? `<button class="btn btn-lg btn-light" type="submit" id="save-again" data-again="1" style="flex:1 1 200px">${icon('plus')} Saqlab, yana qo'shish</button>` : ''}
        <a class="btn btn-lg btn-outline" href="${id ? `#/products/${id}` : '#/products'}" style="flex:1 1 140px">Bekor qilish</a>
      </div>
    </form>`;

  const convBox = root.querySelector('#convs');
  const drawConvs = () => {
    convBox.innerHTML = convs.length ? convs.map((c, i) => `
      <div class="card" style="box-shadow:none;border:1px solid var(--line);padding:12px">
        <div class="form-grid two" style="gap:8px">
          <label class="field"><span>Qadoq</span><select class="input" data-cu="${i}">${unitOpts(c.unit_id)}</select></label>
          <label class="field"><span>Ichida nechta ${esc(unitName(units, root))}?</span>
            <input class="input" data-cf="${i}" inputmode="decimal" value="${c.factor ?? ''}" placeholder="masalan: 12"></label>
        </div>
        <div class="between" style="margin-top:8px"><small class="muted" data-hint="${i}">${hintText(c, units, root)}</small>
          <button class="btn btn-sm btn-ghost red" type="button" data-cdel="${i}">O'chirish</button></div>
      </div>`).join('') : '<div class="small muted">Qadoq yo\'q — tovar donalab yoki o\'lchab keladi. Qutida yoki rulonda kelsa, «Qadoq qo\'shish» ni bosing.</div>';
    convBox.querySelectorAll('[data-cu]').forEach((s) => s.addEventListener('change', () => { convs[s.dataset.cu].unit_id = Number(s.value); drawConvs(); }));
    convBox.querySelectorAll('[data-cf]').forEach((s) => s.addEventListener('input', () => {
      convs[s.dataset.cf].factor = Number(String(s.value).replace(',', '.')) || null;
      const hint = convBox.querySelector(`[data-hint="${s.dataset.cf}"]`);
      if (hint) hint.textContent = hintText(convs[s.dataset.cf], units, root);
    }));
    convBox.querySelectorAll('[data-cdel]').forEach((b) => b.addEventListener('click', () => { convs.splice(Number(b.dataset.cdel), 1); drawConvs(); }));
  };
  root.querySelector('#add-conv').addEventListener('click', () => {
    const used = new Set(convs.map((c) => c.unit_id));
    const firstFree = units.find((u) => !used.has(u.id) && u.id !== Number(root.querySelector('#base-unit').value));
    convs.push({ unit_id: firstFree?.id, factor: null });
    drawConvs();
  });
  drawConvs();

  root.querySelector('#new-unit').addEventListener('click', () => {
    const { close, el } = openModal({
      title: 'Yangi o\'lchov birligi',
      body: `<label class="field"><span>Birlik nomi</span><input class="input" id="un" maxlength="40" placeholder="masalan: bog'lam"></label>`,
      foot: `<button class="btn btn-outline" type="button" data-no>Bekor</button><button class="btn" type="button" data-yes>Qo'shish</button>`,
    });
    el.querySelector('[data-no]').addEventListener('click', close);
    el.querySelector('[data-yes]').addEventListener('click', async () => {
      try {
        const r = await post('/units', { name: el.querySelector('#un').value.trim() });
        unitList = [...unitList, r.unit];
        units.push(r.unit);
        const sel = root.querySelector('#base-unit');
        sel.innerHTML = unitOpts(sel.value);
        sel.value = String(r.unit.id);
        close();
        drawConvs();
        toast('Birlik qo\'shildi', 'ok');
      } catch (err) {
        errorToast(err);
      }
    });
  });

  root.querySelector('#base-unit').addEventListener('change', () => drawConvs());

  root.querySelector('#scan')?.addEventListener('click', () => {
    openBarcodeScanner((code) => {
      root.querySelector('[name=barcode]').value = code;
      toast('Shtrix-kod o\'qildi', 'ok');
    });
  });

  root.querySelector('#imgf').addEventListener('change', (e) => {
    const f = e.target.files[0];
    root.querySelector('#imgname').textContent = f ? f.name : "Telefon rasmi ham bo'ladi — o'zi kichraytiriladi";
  });
  if (!id) root.querySelector('[name=name]').focus();

  root.querySelector('#pf').addEventListener('submit', async (e) => {
    e.preventDefault();
    const again = e.submitter?.dataset.again === '1';
    const form = e.currentTarget;
    const d = readForm(form);
    const errEl = root.querySelector('#form-error');
    errEl.innerHTML = '';
    const fail = (msg) => { errEl.innerHTML = `<div class="alert alert-bad">${esc(msg)}</div>`; };
    if (!d.name) return fail('Mahsulot nomini kiriting');
    if (d.selling_price === null || d.selling_price === '' || Number.isNaN(d.selling_price)) return fail('Sotuv narxini kiriting');
    const body = {
      name: d.name,
      barcode: d.barcode || null,
      sku: (d.sku || '').trim(),
      // Qoldig'i bor tovarda birlik o'zgartirilmaydi (maydon bloklangan) — eskisi yuboriladi
      base_unit_id: Number(d.base_unit_id || root.querySelector('#base-unit').value),
      supplier_id: d.supplier_id ? Number(d.supplier_id) : null,
      purchase_price: d.purchase_price ?? 0,
      selling_price: d.selling_price,
      min_stock: d.min_stock ?? 0,
      description: String(d.description || '').trim(),
      expiry_date: d.expiry_date || '',
      conversions: convs.filter((c) => c.unit_id && c.factor > 0).map((c) => ({ unit_id: c.unit_id, factor: c.factor })),
    };
    if (convs.some((c) => c.unit_id && !(c.factor > 0))) return fail('Birlik koeffitsientini kiriting (0 dan katta)');
    if (!id && d.opening_qty) body.opening_qty = d.opening_qty;
    const btn = again ? root.querySelector('#save-again') : root.querySelector('#save');
    await withBusy(btn, async () => {
      try {
        // Kategoriya nomi bo'yicha (mavjud bo'lmasa yaratiladi)
        if (d.category) {
          const cat = await post('/categories', { name: d.category });
          body.category_id = cat.category.id;
        } else {
          body.category_id = null;
        }
        let productId = id;
        if (id) {
          await put(`/products/${id}`, body);
        } else {
          const r = await post('/products', body);
          productId = r.id;
        }
        const file = root.querySelector('#imgf').files[0];
        if (file) await uploadProductImage(productId, file);
        if (again) {
          toast(`«${d.name}» saqlandi. Keyingi mahsulotni kiriting`, 'ok');
          window.scrollTo({ top: 0 });
          history.replaceState(null, '', '#/products/new');
          await renderForm(root, null, ctx);
          return;
        }
        toast(id ? 'Mahsulot yangilandi' : 'Mahsulot saqlandi', 'ok');
        ctx.go(`#/products/${productId}`);
      } catch (err) {
        fail(err.message);
      }
    });
  });
}

function unitName(units, root) {
  const sel = root.querySelector('#base-unit');
  const u = units.find((x) => String(x.id) === (sel?.value || ''));
  return u ? u.name : 'asosiy birlik';
}

function hintText(c, units, root) {
  const cu = units.find((u) => u.id === Number(c.unit_id));
  const base = unitName(units, root);
  if (!cu || !(c.factor > 0)) return 'Masalan: 1 rulon ichida 100 metr';
  return `1 ${cu.name} ichida ${num(c.factor, 4)} ${base}`;
}
