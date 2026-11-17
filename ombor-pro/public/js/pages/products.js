// Mahsulotlar: ro'yxat, tafsilot, qo'shish/tahrirlash, arxiv, rasm, konvertatsiya
import {
  get, post, put, icon, esc, num, money, qty, dateTime, toast, errorToast, openModal, withBusy,
  productThumb, statusBadge, emptyState, confirmBox, readForm, api,
} from '../ui.js';
import { openBarcodeScanner, cameraScanSupported } from '../scanner.js';

const FILTERS = [
  { key: '', label: 'Hammasi' },
  { key: 'low', label: 'Kam qolgan' },
  { key: 'out', label: 'Tugagan' },
  { key: 'archived', label: 'Arxiv' },
];

export async function render(root, params, ctx) {
  if (params.id === 'new') return renderForm(root, null, ctx);
  if (params.id && params.sub === 'edit') return renderForm(root, Number(params.id), ctx);
  if (params.id) return renderDetail(root, Number(params.id), ctx);
  return renderList(root, params, ctx);
}

// ---------- Ro'yxat ----------

async function renderList(root, params, ctx) {
  const filter = params.query.filter || '';
  let q = params.query.q || '';
  const canManage = ctx.can('products.manage');

  root.innerHTML = `
    <div class="page-head">
      <div><h1>Mahsulotlar</h1><p class="muted" id="count">Yuklanmoqda...</p></div>
      ${canManage ? `<a class="btn" href="#/products/new">${icon('plus')} Yangi mahsulot</a>` : ''}
    </div>
    <div class="stack">
      <input class="input" type="search" id="q" placeholder="Nomi yoki shtrix-kodi bo'yicha qidirish" value="${esc(q)}" autocomplete="off">
      <div class="chips" id="chips">${FILTERS.map((f) => `<button type="button" class="chip ${f.key === filter ? 'active' : ''}" data-f="${f.key}">${f.label}</button>`).join('')}</div>
    </div>
    <div class="card" style="margin-top:14px" id="list"><div class="empty">Yuklanmoqda...</div></div>`;

  const load = async () => {
    const qs = new URLSearchParams();
    if (q) qs.set('q', q);
    const f = root.querySelector('.chip.active')?.dataset.f || '';
    if (f === 'archived') qs.set('archived', '1');
    if (f === 'low' || f === 'out') qs.set('stock', f);
    const r = await get(`/products?${qs}`);
    const list = root.querySelector('#list');
    root.querySelector('#count').textContent = `${r.products.length} ta mahsulot`;
    list.innerHTML = r.products.length
      ? `<div class="list">${r.products.map((p) => `
          <div class="list-item" data-id="${p.id}">
            ${productThumb(p)}
            <div class="meta">
              <div class="name">${esc(p.name)}</div>
              <div class="sub">${money(p.selling_price)} / ${esc(p.base_unit_name)} · qoldiq ${num(p.stock_qty, 3)} ${esc(p.base_unit_name)}</div>
            </div>
            <div class="end">${p.is_archived ? '<span class="badge badge-muted">Arxiv</span>' : statusBadge(p.status)}</div>
          </div>`).join('')}</div>`
      : emptyState('Mahsulot topilmadi. Yangi mahsulot qo\'shing', 'box');
    list.querySelectorAll('[data-id]').forEach((el) => el.addEventListener('click', () => ctx.go(`#/products/${el.dataset.id}`)));
  };

  let timer = null;
  root.querySelector('#q').addEventListener('input', (e) => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      q = e.target.value.trim();
      load().catch(errorToast);
    }, 220);
  });
  root.querySelectorAll('[data-f]').forEach((b) => b.addEventListener('click', () => {
    root.querySelectorAll('[data-f]').forEach((x) => x.classList.toggle('active', x === b));
    load().catch(errorToast);
  }));
  await load();
}

// ---------- Tafsilot ----------

async function renderDetail(root, id, ctx) {
  const { product: p, batches } = await get(`/products/${id}`);
  const hist = await get(`/products/${id}/history`);
  const canManage = ctx.can('products.manage');
  const unit = esc(p.base_unit_name);
  const profitTone = p.profit >= 0 ? 'good' : 'bad';

  root.innerHTML = `
    <div class="page-head">
      <a class="btn btn-light btn-sm" href="#/products">${icon('back', 'ico-sm')} Ro'yxat</a>
      <div class="row">
        ${canManage && !p.is_archived ? `<a class="btn btn-outline" href="#/products/${id}/edit">${icon('edit', 'ico-sm')} Tahrirlash</a>` : ''}
        ${canManage ? `<button class="btn ${p.is_archived ? 'btn-success' : 'btn-warn'}" type="button" id="btn-arch">${icon(p.is_archived ? 'restore' : 'archive', 'ico-sm')} ${p.is_archived ? 'Tiklash' : 'Arxivlash'}</button>` : ''}
      </div>
    </div>

    <div class="card">
      <div class="row" style="align-items:center">
        ${productThumb(p, true)}
        <div class="grow" style="min-width:0">
          <h1 style="font-size:22px">${esc(p.name)}</h1>
          <div class="small muted" style="margin-top:4px">${p.barcode ? `Shtrix-kod: <span class="num">${esc(p.barcode)}</span> · ` : ''}${esc(p.category_name || 'Kategoriyasiz')}${p.supplier_name ? ` · ${esc(p.supplier_name)}` : ''}</div>
          <div style="margin-top:8px">${p.is_archived ? '<span class="badge badge-muted">Arxivlangan</span>' : statusBadge(p.status)}</div>
        </div>
      </div>
      ${canManage ? `<div class="row" style="margin-top:14px"><label class="btn btn-light btn-sm" style="cursor:pointer">${icon('camera', 'ico-sm')} Rasm yuklash<input type="file" accept="image/*" id="img" hidden></label></div>` : ''}
    </div>

    <div class="kpis" style="margin-top:14px">
      <div class="kpi neutral"><div class="label">Hozirgi qoldiq</div><div class="value">${num(p.stock_qty, 3)} ${unit}</div><div class="hint">minimal: ${num(p.min_stock, 3)}</div></div>
      <div class="kpi neutral"><div class="label">Sotilgan</div><div class="value">${num(p.sold_qty, 3)} ${unit}</div><div class="hint">qaytarishlar ayirilgan</div></div>
      <div class="kpi neutral"><div class="label">Sotuv summasi</div><div class="value">${money(p.sold_revenue)}</div><div class="hint">sof tushum</div></div>
      <div class="kpi ${profitTone}"><div class="label">Foyda</div><div class="value">${money(p.profit)}</div><div class="hint">tannarx ${money(p.sold_cost)}</div></div>
    </div>

    <div class="form-grid two" style="margin-top:14px;gap:14px">
      <div class="card">
        <div class="card-head"><h2>Narxlar</h2></div>
        <div class="list">
          <div class="list-item"><div class="meta"><div class="name">Sotuv narxi</div><div class="sub">1 ${unit} uchun</div></div><div class="end num"><b>${money(p.selling_price)}</b></div></div>
          <div class="list-item"><div class="meta"><div class="name">Kirim narxi</div><div class="sub">standart</div></div><div class="end num">${money(p.purchase_price)}</div></div>
          <div class="list-item"><div class="meta"><div class="name">Joriy tannarx</div><div class="sub">o'rtacha, 1 ${unit} uchun</div></div><div class="end num">${money(p.avg_cost)}</div></div>
          <div class="list-item"><div class="meta"><div class="name">Ombor qiymati</div><div class="sub">qoldiq × tannarx</div></div><div class="end num">${money(p.stock_value)}</div></div>
        </div>
      </div>
      <div class="card">
        <div class="card-head"><h2>O'lchov birliklari</h2></div>
        <div class="list">
          <div class="list-item"><div class="meta"><div class="name">${unit}</div><div class="sub">asosiy birlik</div></div><div class="end"><span class="badge badge-info">1</span></div></div>
          ${p.conversions.length ? p.conversions.map((c) => `
            <div class="list-item"><div class="meta"><div class="name">${esc(c.name)}</div><div class="sub">1 ${esc(c.name)} = ${num(c.factor, 4)} ${unit}</div></div></div>`).join('')
            : '<div class="small muted" style="padding:8px 4px">Qo\'shimcha birlik yo\'q</div>'}
        </div>
      </div>
    </div>

    ${batches.length ? `
    <div class="card" style="margin-top:14px">
      <div class="card-head"><h2>Partiyalar (FIFO)</h2><span class="small muted">eski partiyadan avval chiqadi</span></div>
      <div class="table-wrap cards"><table>
        <thead><tr><th>Kelgan sana</th><th>Manba</th><th class="right">Qoldiq</th><th class="right">Tannarx</th></tr></thead>
        <tbody>${batches.map((b) => `<tr>
          <td data-label="Sana">${dateTime(b.received_at)}</td>
          <td data-label="Manba">${esc(sourceLabel(b.source_type))}</td>
          <td data-label="Qoldiq" class="right num">${num(b.qty_remaining, 4)} / ${num(b.qty_initial, 4)} ${unit}</td>
          <td data-label="Tannarx" class="right num">${money(b.unit_cost)}</td>
        </tr>`).join('')}</tbody></table></div>
    </div>` : ''}

    <div class="card" style="margin-top:14px">
      <div class="seg" id="htabs" style="margin-bottom:12px">
        <button type="button" class="active" data-t="mv">Ombor harakatlari</button>
        <button type="button" data-t="pu">Kirimlar</button>
        <button type="button" data-t="sa">Sotuvlar</button>
      </div>
      <div id="hbody"></div>
    </div>`;

  const showTab = (t) => {
    root.querySelectorAll('#htabs button').forEach((b) => b.classList.toggle('active', b.dataset.t === t));
    const body = root.querySelector('#hbody');
    if (t === 'mv') {
      body.innerHTML = hist.movements.length ? `<div class="table-wrap cards"><table>
        <thead><tr><th>Vaqt</th><th>Turi</th><th class="right">Miqdor</th><th class="right">Qoldiq</th><th class="right">Qiymat</th><th>Izoh</th></tr></thead>
        <tbody>${hist.movements.map((m) => `<tr>
          <td data-label="Vaqt">${dateTime(m.created_at)}</td>
          <td data-label="Turi">${esc(movementLabel(m.movement_type))}</td>
          <td data-label="Miqdor" class="right num ${m.quantity < 0 ? 'red' : 'green'}">${m.quantity > 0 ? '+' : ''}${num(m.quantity, 4)}</td>
          <td data-label="Qoldiq" class="right num">${num(m.balance_after, 4)}</td>
          <td data-label="Qiymat" class="right num">${money(m.value)}</td>
          <td data-label="Izoh" class="small">${esc(m.note || '')} <span class="muted">${esc(m.user_name || '')}</span></td>
        </tr>`).join('')}</tbody></table></div>` : emptyState('Harakatlar yo\'q', 'clock');
    } else if (t === 'pu') {
      body.innerHTML = hist.purchases.length ? `<div class="table-wrap cards"><table>
        <thead><tr><th>Sana</th><th>Kirim</th><th class="right">Miqdor</th><th class="right">Narx</th><th class="right">Tannarx</th></tr></thead>
        <tbody>${hist.purchases.map((x) => `<tr class="clickable" data-pu="${x.id}">
          <td data-label="Sana">${esc(x.purchase_date)}</td>
          <td data-label="Kirim">${esc(x.purchase_no)}</td>
          <td data-label="Miqdor" class="right num">${num(x.quantity, 4)} ${esc(x.unit_name)}</td>
          <td data-label="Narx" class="right num">${money(x.unit_price)}</td>
          <td data-label="Tannarx" class="right num">${money(x.unit_cost)}</td>
        </tr>`).join('')}</tbody></table></div>` : emptyState('Kirimlar yo\'q', 'truck');
      body.querySelectorAll('[data-pu]').forEach((tr) => tr.addEventListener('click', () => ctx.go(`#/purchases/${tr.dataset.pu}`)));
    } else {
      body.innerHTML = hist.sales.length ? `<div class="table-wrap cards"><table>
        <thead><tr><th>Vaqt</th><th>Chek</th><th class="right">Miqdor</th><th class="right">Summa</th><th class="right">Foyda</th></tr></thead>
        <tbody>${hist.sales.map((x) => `<tr class="clickable" data-sa="${x.id}">
          <td data-label="Vaqt">${dateTime(x.created_at)}</td>
          <td data-label="Chek">${esc(x.receipt_no)}</td>
          <td data-label="Miqdor" class="right num">${num(x.quantity, 4)} ${esc(x.unit_name)}</td>
          <td data-label="Summa" class="right num">${money(x.line_total)}</td>
          <td data-label="Foyda" class="right num ${x.line_total - x.cost_total >= 0 ? 'green' : 'red'}">${money(x.line_total - x.cost_total)}</td>
        </tr>`).join('')}</tbody></table></div>` : emptyState('Sotuvlar yo\'q', 'cart');
      body.querySelectorAll('[data-sa]').forEach((tr) => tr.addEventListener('click', () => ctx.go(`#/sales/${tr.dataset.sa}`)));
    }
  };
  root.querySelectorAll('#htabs button').forEach((b) => b.addEventListener('click', () => showTab(b.dataset.t)));
  showTab('mv');

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
    const fd = new FormData();
    fd.append('image', file);
    try {
      await api('POST', `/products/${id}/image`, fd);
      toast('Rasm yuklandi', 'ok');
      renderDetail(root, id, ctx);
    } catch (err) {
      errorToast(err);
    }
  });
}

function movementLabel(t) {
  return {
    opening: 'Boshlang\'ich qoldiq', purchase: 'Kirim', sale: 'Sotuv', return: 'Qaytarish',
    damage: 'Zarar (yaroqsiz)', correction: 'Tuzatish / inventarizatsiya',
  }[t] || t;
}

function sourceLabel(s) {
  return { opening: 'Boshlang\'ich', purchase: 'Kirim', return: 'Qaytarish', correction: 'Tuzatish', adjustment: 'Tuzatish', inventory_count: 'Inventarizatsiya' }[s] || s;
}

// ---------- Qo'shish / tahrirlash formasi ----------

async function renderForm(root, id, ctx) {
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
      <label class="field" style="grid-column:1/-1"><span>Mahsulot nomi *</span>
        <input class="input" name="name" required maxlength="150" value="${esc(p?.name || '')}" placeholder="Masalan: Un oliy nav"></label>

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

      <div class="field"><span>Asosiy o'lchov birligi *</span>
        <div class="input-group">
          <select class="input" name="base_unit_id" id="base-unit" ${id && Number(p?.stock_qty) > 0 ? 'disabled' : ''}>${unitOpts(p?.base_unit_id || units.find((u) => u.code === 'piece')?.id)}</select>
          <button class="btn btn-light" type="button" id="new-unit" style="min-width:56px" aria-label="Yangi birlik">${icon('plus')}</button>
        </div>
        <small>Qoldiq shu birlikda hisoblanadi (masalan: dona, kg, litr)</small></div>

      <label class="field"><span>Kirim narxi (1 birlik uchun, so'm)</span>
        <input class="input" name="purchase_price" data-type="num" inputmode="decimal" value="${p?.purchase_price ?? ''}" placeholder="0"></label>

      <label class="field"><span>Sotuv narxi (1 birlik uchun, so'm) *</span>
        <input class="input" name="selling_price" data-type="num" inputmode="decimal" required value="${p?.selling_price ?? ''}" placeholder="0"></label>

      <label class="field"><span>Minimal qoldiq (ogohlantirish)</span>
        <input class="input" name="min_stock" data-type="num" inputmode="decimal" value="${p?.min_stock ?? 0}" placeholder="0"><small>Qoldiq shundan kamaysa, ogohlantiriladi</small></label>

      ${!id ? `<label class="field"><span>Boshlang'ich qoldiq (ixtiyoriy)</span>
        <input class="input" name="opening_qty" data-type="num" inputmode="decimal" placeholder="0"><small>Mahsulot omborda bor bo'lsa, miqdorini kiriting</small></label>` : ''}

      <div class="field" style="grid-column:1/-1">
        <span>Qo'shimcha o'lchov birliklari (ixtiyoriy)</span>
        <small>Masalan: 1 quti = 12 dona. Sotuv va kirimda shu birliklar tanlanadi.</small>
        <div id="convs" class="stack"></div>
        <button class="btn btn-light btn-sm" type="button" id="add-conv" style="align-self:flex-start">${icon('plus', 'ico-sm')} Birlik qo'shish</button>
      </div>

      <div class="field" style="grid-column:1/-1">
        <span>Mahsulot rasmi</span>
        <div class="row">
          ${productThumb(p || { name: '?' }, true)}
          <input type="file" accept="image/jpeg,image/png,image/webp" name="image" id="imgf" class="input" style="max-width:320px">
        </div>
        <small>JPG, PNG yoki WEBP, 3 MB gacha</small>
      </div>

      <div id="form-error" style="grid-column:1/-1"></div>
      <div style="grid-column:1/-1;display:flex;gap:10px;flex-wrap:wrap">
        <button class="btn btn-lg" type="submit" id="save" style="flex:1 1 200px">${icon('check')} Saqlash</button>
        <a class="btn btn-lg btn-outline" href="${id ? `#/products/${id}` : '#/products'}" style="flex:1 1 140px">Bekor qilish</a>
      </div>
    </form>`;

  const convBox = root.querySelector('#convs');
  const drawConvs = () => {
    convBox.innerHTML = convs.length ? convs.map((c, i) => `
      <div class="card" style="box-shadow:none;border:1px solid var(--line);padding:12px">
        <div class="form-grid two" style="gap:8px">
          <label class="field"><span>Birlik</span><select class="input" data-cu="${i}">${unitOpts(c.unit_id)}</select></label>
          <label class="field"><span>1 shu birlik = ? ${esc(unitName(units, root))}</span>
            <input class="input" data-cf="${i}" inputmode="decimal" value="${c.factor ?? ''}" placeholder="masalan: 12"></label>
        </div>
        <div class="between" style="margin-top:8px"><small class="muted" data-hint="${i}">${hintText(c, units, root)}</small>
          <button class="btn btn-sm btn-ghost red" type="button" data-cdel="${i}">O'chirish</button></div>
      </div>`).join('') : '<div class="small muted">Qo\'shimcha birlik yo\'q. Kerak bo\'lsa "Birlik qo\'shish" ni bosing.</div>';
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

  root.querySelector('#pf').addEventListener('submit', async (e) => {
    e.preventDefault();
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
    const btn = root.querySelector('#save');
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
        if (file) {
          const fd = new FormData();
          fd.append('image', file);
          await api('POST', `/products/${productId}/image`, fd);
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
  if (!cu || !(c.factor > 0)) return 'Masalan: 1 quti = 12 dona';
  return `1 ${cu.name} = ${num(c.factor, 4)} ${base}`;
}
