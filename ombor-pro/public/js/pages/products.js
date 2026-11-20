// Mahsulotlar: ro'yxat, tafsilot, qo'shish/tahrirlash, arxiv, rasm, konvertatsiya
import {
  get, post, put, icon, esc, num, money, qty, dateTime, toast, errorToast, openModal, withBusy,
  productThumb, emptyState, confirmBox, readForm, api, uploadProductImage, packText, productPhoto,
} from '../ui.js';
import { openBarcodeScanner, cameraScanSupported } from '../scanner.js';
import { renderProductWizard } from '../productform.js';


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

// ---------- Ro'yxat: rasmli kartochkalar, har birida qancha qolgani ----------

const PAGE = 48;

const STOCK_WORD = { out: 'Tugagan', low: 'Kam qoldi', ok: '' };

function productCard(p) {
  const st = p.is_archived ? 'arch' : p.status;
  const pk = packText(p.stock_qty, p.base_unit_name, p.pack);
  return `
    <a class="pc st-${st}" href="#/products/${p.id}">
      <div class="pc-top">
        ${productPhoto(p)}
        ${p.is_archived ? '<span class="pc-flag arch">Arxivda</span>' : STOCK_WORD[p.status] ? `<span class="pc-flag ${p.status}">${STOCK_WORD[p.status]}</span>` : ''}
      </div>
      <div class="pc-body">
        <div class="pc-name">${esc(p.name)}</div>
        <div class="pc-left">
          <span class="pc-label">Qoldi</span>
          <span class="pc-qty">${num(p.stock_qty, 3)}</span><span class="pc-unit">${esc(p.base_unit_name)}</span>
        </div>
        <div class="pc-pack">${pk ? `= ${esc(pk)}` : '&nbsp;'}</div>
        <div class="pc-price">${money(p.selling_price)}<small> / ${esc(p.base_unit_name)}</small></div>
      </div>
    </a>`;
}

async function renderList(root, params, ctx) {
  let filter = params.query.filter || '';
  let q = (params.query.q || '').trim();
  let shown = PAGE;
  const canManage = ctx.can('products.manage');
  const canBuy = ctx.can('purchases.create');
  let active = [];
  let archived = null;

  root.innerHTML = `
    <div class="page-head">
      <div><h1>Mahsulotlar</h1><p class="muted" id="count">Yuklanmoqda...</p></div>
      <div class="row">
        ${canBuy ? `<a class="btn btn-outline" href="#/purchases/new">${icon('truck', 'ico-sm')} Yuk keldi</a>` : ''}
        ${canManage ? `<a class="btn" href="#/products/new">${icon('plus', 'ico-sm')} Yangi tovar</a>` : ''}
      </div>
    </div>
    <div class="plist-tools">
      <div class="search-input">${icon('search', 'ico-sm')}<input class="input" type="search" id="q" placeholder="Tovar nomi yoki shtrix-kodi..." value="${esc(q)}" autocomplete="off" aria-label="Tovar qidirish"></div>
      <div class="chips" id="chips"></div>
    </div>
    <div id="list"><div class="empty">Yuklanmoqda...</div></div>`;

  const chipsEl = root.querySelector('#chips');
  const listEl = root.querySelector('#list');

  const drawChips = () => {
    const out = active.filter((p) => p.status === 'out').length;
    const low = active.filter((p) => p.status === 'low').length;
    const chips = [
      { key: '', label: `Hammasi <b>${active.length}</b>` },
      { key: 'out', label: `Tugagan <b>${out}</b>`, cls: out ? 'chip-bad' : '' },
      { key: 'low', label: `Kam qolgan <b>${low}</b>`, cls: low ? 'chip-warn' : '' },
      { key: 'archived', label: 'Arxiv' },
    ];
    chipsEl.innerHTML = chips.map((c) => `<button type="button" class="chip ${c.cls || ''} ${c.key === filter ? 'active' : ''}" data-f="${c.key}">${c.label}</button>`).join('');
    const parts = [`${active.length} xil tovar`];
    if (out) parts.push(`${out} tasi tugagan`);
    if (low) parts.push(`${low} tasi kam qolgan`);
    root.querySelector('#count').textContent = parts.join(' · ');
  };

  const draw = () => {
    const src = filter === 'archived' ? (archived || []) : active;
    const text = q.toLowerCase();
    const rows = src.filter((p) => (filter === 'out' || filter === 'low' ? p.status === filter : true)
      && (!text || p.name.toLowerCase().includes(text) || (p.barcode && p.barcode === q)));
    if (!rows.length) {
      listEl.innerHTML = emptyList(q, filter, canManage);
      return;
    }
    listEl.innerHTML = `
      <div class="pc-grid">${rows.slice(0, shown).map(productCard).join('')}</div>
      ${rows.length > shown ? `<div class="home-foot"><button class="btn btn-light" type="button" id="more">Yana ko'rsatish (${rows.length - shown} ta qoldi)</button></div>` : ''}`;
    listEl.querySelector('#more')?.addEventListener('click', () => { shown += PAGE; draw(); });
  };

  // Manzilni yangilab qo'yamiz (orqaga qaytganda filtr va qidiruv saqlanadi)
  const remember = () => {
    const qs = new URLSearchParams();
    if (filter) qs.set('filter', filter);
    if (q) qs.set('q', q);
    history.replaceState(null, '', `#/products${qs.toString() ? `?${qs}` : ''}`);
  };

  chipsEl.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-f]');
    if (!b) return;
    filter = b.dataset.f;
    shown = PAGE;
    if (filter === 'archived' && !archived) {
      listEl.innerHTML = '<div class="empty">Yuklanmoqda...</div>';
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

  active = (await get('/products?limit=1000')).products;
  if (filter === 'archived') archived = (await get('/products?archived=1&limit=1000')).products;
  drawChips();
  draw();
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
        <div class="small muted">${esc(p.category_name || 'Kategoriyasiz')}${p.barcode ? ` · Shtrix-kod: <span class="num">${esc(p.barcode)}</span>` : ''}</div>
        <div class="pd-stock">
          <div class="pd-stock-label">Omborda qoldi</div>
          <div class="pd-stock-num">${num(p.stock_qty, 3)} <span>${unit}</span></div>
          ${pk ? `<div class="pd-stock-pack">= ${esc(pk)}</div>` : ''}
          <div class="pd-stock-st"><span class="dot"></span>${esc(statusText)}</div>
        </div>
        <div class="pd-actions">
          ${canBuy ? `<a class="btn btn-lg" href="#/purchases/new?product=${id}">${icon('truck')} Yuk keldi</a>` : ''}
          ${canManage && !p.is_archived ? `<a class="btn btn-lg btn-outline" href="#/products/${id}/edit">${icon('edit')} O'zgartirish</a>` : ''}
        </div>
      </div>
    </section>

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
        <small>Qoldiq shu birlikda hisoblanadi (masalan: dona, kg, litr)</small></div>

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

      <label class="field"><span>Kategoriya</span>
        <input class="input" name="category" list="cats" maxlength="60" value="${esc(p?.category_name || '')}" placeholder="Tanlang yoki yangi yozing">
        <datalist id="cats">${cats.map((c) => `<option value="${esc(c.name)}">`).join('')}</datalist></label>

      <label class="field"><span>Yetkazib beruvchi</span>
        <select class="input" name="supplier_id" data-type="nullable"><option value="">— tanlanmagan —</option>
          ${sups.map((s) => `<option value="${s.id}" ${p?.supplier_id === s.id ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}
        </select></label>

      ${!id ? `<label class="field"><span>Minimal qoldiq (ogohlantirish)</span>
        <input class="input" name="min_stock" data-type="num" inputmode="decimal" value="0" placeholder="0"><small>Qoldiq shundan kamaysa, ogohlantiriladi</small></label>` : ''}

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
      base_unit_id: Number(d.base_unit_id),
      supplier_id: d.supplier_id ? Number(d.supplier_id) : null,
      purchase_price: d.purchase_price ?? 0,
      selling_price: d.selling_price,
      min_stock: d.min_stock ?? 0,
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
