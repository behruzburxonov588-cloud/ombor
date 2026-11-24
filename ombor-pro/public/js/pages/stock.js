// Ombor: umumiy holat, harakatlar, zarar/tuzatish, inventarizatsiya va nomuvofiqliklar
import {
  get, post, put, icon, esc, qty, money, dateTime, toast, errorToast, openModal, withBusy,
  emptyState, statusBadge, confirmBox,
  resolvePeriod, periodPicker, bindPeriod, periodQuery, parseQty } from '../ui.js';
import { openBarcodeScanner, cameraScanSupported } from '../scanner.js';

const MOVEMENT_LABELS = {
  opening: "Boshlang'ich qoldiq", purchase: 'Kirim', sale: 'Sotuv', return: 'Qaytarish',
  damage: 'Zarar', correction: 'Tuzatish',
};
const MOVEMENT_TYPES = ['', 'purchase', 'sale', 'return', 'damage', 'correction', 'opening'];

const TABS = [
  { key: 'overview', label: 'Qoldiq', perms: ['stock.view'] },
  { key: 'movements', label: 'Kirdi-chiqdi tarixi', perms: ['stock.view', 'history.view'] },
  { key: 'adjust', label: 'Buzilgan / tuzatish', perms: ['stock.adjust'] },
  { key: 'counts', label: 'Sanash', perms: ['stock.count', 'stock.approve'] },
  { key: 'discrepancies', label: 'Sanashdagi farqlar', perms: ['stock.view'] },
];


function periodCard(range, note = '') {
  return `
    <div class="toolbar-row">
      ${periodPicker(range)}
      ${note ? `<div class="small muted" style="max-width:520px">${esc(note)}</div>` : ''}
    </div>`;
}

function diffHtml(value) {
  if (value === null || value === undefined || value === '') return '—';
  const n = Number(value);
  const cls = n > 0 ? 'green' : n < 0 ? 'red' : 'muted';
  return `<span class="${cls}">${n > 0 ? '+' : ''}${qty(n)}</span>`;
}

export async function render(root, params, ctx) {
  if (params.id === 'count' && params.sub) return renderCount(root, Number(params.sub), ctx);

  const allowed = TABS.filter((t) => ctx.canAny(t.perms));
  if (!allowed.length) {
    root.innerHTML = '<div class="alert alert-bad">Ombor bo\'limini ko\'rish uchun ruxsatingiz yo\'q</div>';
    return;
  }
  const tab = allowed.find((t) => t.key === params.query.tab) || allowed[0];
  // Bo'lim yorliqlari tepada: «Qoldiq va tarix» va «Sanash» — har biri o'z ichki yorliqlari bilan
  const COUNT_TABS = ['counts', 'discrepancies'];
  const counting = COUNT_TABS.includes(tab.key);
  const inner = allowed.filter((t) => COUNT_TABS.includes(t.key) === counting);

  root.innerHTML = `
    <div class="page-head"><div><h1>${counting ? 'Sanash' : 'Qoldiq va tarix'}</h1><p class="muted">${counting ? "Tovarni qo'lda sanab, dasturdagi qoldiq bilan solishtiring" : "Har bir tovardan qancha qolgani va nima kirib-chiqqani"}</p></div>
      ${!counting && ctx.can('purchases.create') ? `<a class="btn" href="#/purchases/new">${icon('truck', 'ico-sm')} Yuk keldi — kiritish</a>` : ''}</div>
    ${inner.length > 1 ? `<div class="seg" role="tablist" style="margin-bottom:14px;flex-wrap:wrap">
      ${inner.map((t) => `<button type="button" role="tab" data-tab="${t.key}" class="${t.key === tab.key ? 'active' : ''}" aria-selected="${t.key === tab.key}">${t.label}</button>`).join('')}
    </div>` : ''}
    <div id="tabbody"></div>`;
  root.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => ctx.go(`#/stock?tab=${b.dataset.tab}`)));

  const body = root.querySelector('#tabbody');
  const impl = {
    overview: tabOverview, movements: tabMovements, adjust: tabAdjust,
    counts: tabCounts, discrepancies: tabDiscrepancies,
  }[tab.key];
  await impl(body, params.query, ctx);
}

// ---------- Umumiy ----------

async function tabOverview(body, q, ctx) {
  const range = resolvePeriod(q, 'month');
  const { from, to } = range;
  const r = await get(`/stock/overview?from=${from}&to=${to}`);
  const t = r.totals;
  const items = r.items.filter((i) => !i.archived || i.current > 0);

  body.innerHTML = `
    ${periodCard(range, "«Keldi» va «Sotildi» ustunlari tanlangan davr uchun. «Hozir bor» — bugungi qoldiq.")}
    <div class="kpis">
      <div class="kpi neutral"><div class="label">Ombordagi tovar qiymati</div><div class="value">${money(t.inventory_value)}</div>
        <div class="hint">kelish narxida hisoblangan</div></div>
      <div class="kpi neutral"><div class="label">Tovar turlari</div><div class="value">${t.products}</div><div class="hint">sotuvdagi tovarlar</div></div>
      <div class="kpi ${t.low ? 'warn' : 'good'}"><div class="label">Kam qolgan</div><div class="value">${t.low}</div><div class="hint">tez orada olib kelish kerak</div></div>
      <div class="kpi ${t.out ? 'bad' : 'good'}"><div class="label">Tugagan</div><div class="value">${t.out}</div><div class="hint">omborda umuman yo'q</div></div>
    </div>
    <div class="chips" style="margin-top:14px">
      <button type="button" class="chip active" data-f="">Hammasi</button>
      <button type="button" class="chip" data-f="low">Kam qolgan</button>
      <button type="button" class="chip" data-f="out">Tugagan</button>
    </div>
    <div class="card" style="margin-top:12px">
      ${items.length ? `<div class="table-wrap cards"><table>
        <thead><tr><th>Tovar</th><th class="right">Keldi</th><th class="right">Sotildi</th><th class="right" title="Buzilgan, yo'qolgan">Buzildi</th><th class="right" title="Qo'lda to'g'rilangan">Tuzatildi</th><th class="right">Hozir bor</th><th class="right">Qiymati</th><th>Holat</th></tr></thead>
        <tbody>${items.map((i) => `<tr data-st="${i.status}">
          <td data-label="Tovar"><b>${esc(i.name)}</b>${i.archived ? ' <span class="badge badge-muted">arxiv</span>' : ''}</td>
          <td data-label="Keldi" class="right num">${qty(i.incoming)} ${esc(i.unit)}</td>
          <td data-label="Sotildi" class="right num">${qty(i.sold)} ${esc(i.unit)}</td>
          <td data-label="Buzildi" class="right num ${i.damaged ? 'red' : ''}">${qty(i.damaged)}</td>
          <td data-label="Tuzatildi" class="right num">${diffHtml(i.corrected)}</td>
          <td data-label="Hozir bor" class="right num"><b>${qty(i.current)}</b> ${esc(i.unit)}</td>
          <td data-label="Qiymati" class="right num">${money(i.stock_value)}</td>
          <td data-label="Holat">${statusBadge(i.status)}</td>
        </tr>`).join('')}</tbody></table></div>`
        : emptyState("Tovar yo'q", 'layers')}
    </div>`;

  bindPeriod(body, (next) => ctx.go(`#/stock?tab=overview&${periodQuery(next)}`));

  body.querySelectorAll('[data-f]').forEach((b) => b.addEventListener('click', () => {
    body.querySelectorAll('[data-f]').forEach((x) => x.classList.toggle('active', x === b));
    const f = b.dataset.f;
    body.querySelectorAll('tbody tr').forEach((tr) => {
      tr.hidden = Boolean(f) && tr.dataset.st !== f;
    });
  }));
}

// ---------- Harakatlar ----------

async function tabMovements(body, q, ctx) {
  const range = resolvePeriod(q, 'month');
  const { from, to } = range;
  const type = q.type || '';
  const params = new URLSearchParams({ from, to, limit: '300' });
  if (type) params.set('type', type);
  const { movements } = await get(`/stock/movements?${params}`);

  body.innerHTML = `
    <div class="toolbar-row">
      ${periodPicker(range)}
      <div class="chips">${MOVEMENT_TYPES.map((t) => `<button type="button" class="chip ${t === type ? 'active' : ''}" data-type="${t}">${t ? MOVEMENT_LABELS[t] : 'Hammasi'}</button>`).join('')}</div>
    </div>
    <div class="card">
      ${movements.length ? `<div class="table-wrap cards"><table>
        <thead><tr><th>Vaqt</th><th>Tovar</th><th>Turi</th><th class="right">Oldin</th><th class="right">O'zgarish</th><th class="right">Keyin</th><th class="right">Narx</th><th>Kim</th></tr></thead>
        <tbody>${movements.map((m) => `<tr class="clickable" data-href="#/products/${m.product_id}">
          <td data-label="Vaqt">${dateTime(m.created_at)}</td>
          <td data-label="Tovar"><div><b>${esc(m.product_name)}</b>${m.note ? `<div class="small muted">${esc(m.note)}</div>` : ''}</div></td>
          <td data-label="Turi">${esc(MOVEMENT_LABELS[m.movement_type] || m.movement_type)}</td>
          <td data-label="Oldin" class="right num muted">${qty(m.balance_before)}</td>
          <td data-label="O'zgarish" class="right num"><span>${diffHtml(m.quantity)} <span class="small muted">${esc(m.unit || '')}</span></span></td>
          <td data-label="Keyin" class="right num"><b>${qty(m.balance_after)}</b></td>
          <td data-label="Narx" class="right num">${m.unit_price !== null && m.unit_price !== undefined ? `<div>${money(m.unit_price)}<div class="small muted">${m.movement_type === 'sale' ? 'sotuv narxi' : 'kelish narxi'}</div></div>` : '—'}</td>
          <td data-label="Kim" class="small">${esc(m.user_name || '—')}</td>
        </tr>`).join('')}</tbody></table></div>`
        : emptyState("Harakatlar yo'q", 'clock')}
    </div>`;

  bindPeriod(body, (next) => ctx.go(`#/stock?tab=movements&${periodQuery(next)}&type=${type}`));
  body.querySelectorAll('tr[data-href]').forEach((tr) => tr.addEventListener('click', () => ctx.go(tr.dataset.href)));
  body.querySelectorAll('[data-type]').forEach((b) => b.addEventListener('click', () => ctx.go(`#/stock?tab=movements&${periodQuery(range)}&type=${b.dataset.type}`)));
}

// ---------- Zarar / tuzatish ----------

function tabAdjust(body, q, ctx) {
  if (!ctx.can('stock.adjust')) {
    body.innerHTML = '<div class="alert alert-bad">Zarar yoki tuzatish yozish uchun ruxsatingiz yo\'q</div>';
    return;
  }
  let product = null;
  let kind = 'damage';
  let found = [];

  body.innerHTML = `
    <div class="card">
      <div class="card-head"><h2>Zarar yoki tuzatish</h2></div>
      <p class="small muted" style="margin-bottom:12px">Buzilgan, yo'qolgan tovar yoki sanashdan tashqari tuzatish. Har bir amal tarixga yoziladi.</p>
      <div class="stack">
        <div class="field">
          <span>Tovar</span>
          <div id="picked"></div>
          <div class="input-group">
            <input class="input" id="pq" type="search" placeholder="Nomi yoki shtrix-kod" autocomplete="off">
            ${cameraScanSupported() ? `<button class="btn btn-light" type="button" id="cam" style="min-width:56px" aria-label="Kamera bilan o'qish">${icon('camera')}</button>` : ''}
          </div>
          <div id="pres" class="list"></div>
        </div>
        <div class="seg" id="kind">
          <button type="button" data-k="damage" class="active">Zarar (yaroqsiz)</button>
          <button type="button" data-k="correction">Tuzatish</button>
        </div>
        <div class="form-grid two" style="gap:10px">
          <label class="field" id="dirw" hidden><span>Yo'nalish</span>
            <select class="input" id="dir"><option value="minus">Kamaytirish (kamomad)</option><option value="plus">Qo'shish (ortiqcha)</option></select></label>
          <label class="field"><span>Miqdor (asosiy birlikda)</span><input class="input" id="aq" inputmode="decimal" placeholder="0"></label>
        </div>
        <label class="field"><span>Izoh <small id="nh">(ixtiyoriy)</small></span>
          <input class="input" id="an" maxlength="300" placeholder="Masalan: singan, muddati o'tgan"></label>
        <button class="btn btn-lg" type="button" id="asave">${icon('check')} Saqlash</button>
      </div>
    </div>`;

  const $ = (sel) => body.querySelector(sel);

  function renderPicked() {
    $('#picked').innerHTML = product
      ? `<div class="alert alert-info" style="align-items:center">
           <div class="grow"><b>${esc(product.name)}</b><div class="small">Joriy qoldiq: ${qty(product.stock_qty)} ${esc(product.base_unit_name)}</div></div>
           <button class="btn btn-sm btn-ghost" type="button" id="unpick">Almashtirish</button></div>`
      : '';
    $('#unpick')?.addEventListener('click', () => {
      product = null;
      renderPicked();
      $('#pq').focus();
    });
  }

  function pick(p) {
    product = p;
    $('#pres').innerHTML = '';
    $('#pq').value = '';
    renderPicked();
  }

  let timer = null;
  $('#pq').addEventListener('input', (e) => {
    clearTimeout(timer);
    timer = setTimeout(async () => {
      const text = e.target.value.trim();
      if (!text) { $('#pres').innerHTML = ''; return; }
      try {
        const { products } = await get(`/products?q=${encodeURIComponent(text)}`);
        found = products.slice(0, 15);
        $('#pres').innerHTML = found.map((p) => `
          <div class="list-item" data-id="${p.id}">
            <div class="meta"><div class="name">${esc(p.name)}</div>
              <div class="sub">Qoldiq: ${qty(p.stock_qty)} ${esc(p.base_unit_name)}</div></div>
          </div>`).join('') || '<div class="empty">Tovar topilmadi</div>';
        $('#pres').querySelectorAll('[data-id]').forEach((row) => row.addEventListener('click', () => {
          pick(found.find((x) => String(x.id) === row.dataset.id));
        }));
      } catch (err) { errorToast(err); }
    }, 220);
  });
  $('#pq').addEventListener('keydown', async (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const code = e.currentTarget.value.trim();
    if (!code) return;
    try {
      const { product: p } = await get(`/products/barcode/${encodeURIComponent(code)}`);
      pick(p);
    } catch (err) { errorToast(err); }
  });
  $('#cam')?.addEventListener('click', () => {
    openBarcodeScanner(async (code) => {
      try {
        const { product: p } = await get(`/products/barcode/${encodeURIComponent(code)}`);
        pick(p);
      } catch (err) { errorToast(err); }
    });
  });

  body.querySelectorAll('#kind [data-k]').forEach((b) => b.addEventListener('click', () => {
    kind = b.dataset.k;
    body.querySelectorAll('#kind [data-k]').forEach((x) => x.classList.toggle('active', x === b));
    $('#dirw').hidden = kind !== 'correction';
    $('#nh').textContent = kind === 'correction' ? '(majburiy)' : '(ixtiyoriy)';
  }));

  $('#asave').addEventListener('click', (e) => {
    if (!product) return toast('Tovarni tanlang', 'warn');
    const quantity = parseQty($('#aq').value);
    if (!(quantity > 0)) return toast('Miqdorni kiriting', 'warn');
    const note = $('#an').value.trim();
    if (kind === 'correction' && !note) return toast('Tuzatish sababini yozing', 'warn');
    withBusy(e.currentTarget, async () => {
      try {
        const r = await post('/stock/adjust', {
          product_id: product.id,
          kind,
          quantity,
          direction: kind === 'correction' ? $('#dir').value : 'minus',
          note: note || null,
        });
        toast(`Saqlandi. Qiymat: ${money(r.value)}`, 'ok');
        product = null;
        $('#aq').value = '';
        $('#an').value = '';
        renderPicked();
      } catch (err) { errorToast(err); }
    });
  });

  renderPicked();
}

// ---------- Inventarizatsiya ----------

async function tabCounts(body, q, ctx) {
  const { counts } = await get('/stock/counts');

  body.innerHTML = `
    <div class="between" style="margin-bottom:12px;flex-wrap:wrap;gap:10px">
      <p class="muted small" style="max-width:560px">Tovarni qo'lda sanab, haqiqiy sonini yozasiz. Tasdiqlangach, dasturdagi qoldiq to'g'rilanadi. Har bir o'zgarish tarixga yoziladi.</p>
      ${ctx.can('stock.count') ? `<button class="btn" type="button" id="newc">${icon('plus', 'ico-sm')} Yangi sanash</button>` : ''}
    </div>
    <div class="card">
      ${counts.length ? `<div class="list">${counts.map((c) => `
        <div class="list-item" data-id="${c.id}">
          <div class="meta">
            <div class="name">${esc(c.count_no)}</div>
            <div class="sub">${dateTime(c.created_at)}${c.created_by_name ? ` · ${esc(c.created_by_name)}` : ''}${c.note ? ` · ${esc(c.note)}` : ''}</div>
          </div>
          <div class="end">
            ${c.status === 'draft' ? '<span class="badge badge-low">Qoralama</span>' : '<span class="badge badge-ok">Tasdiqlangan</span>'}
            <div class="small muted">${c.items_counted}/${c.items_total} sanalgan</div>
          </div>
        </div>`).join('')}</div>`
        : emptyState("Hali sanash o'tkazilmagan", 'layers')}
    </div>`;

  body.querySelectorAll('[data-id]').forEach((el) => el.addEventListener('click', () => ctx.go(`#/stock/count/${el.dataset.id}`)));

  body.querySelector('#newc')?.addEventListener('click', () => {
    const { close, el } = openModal({
      title: 'Yangi sanash',
      body: `<label class="field"><span>Izoh (ixtiyoriy)</span><input class="input" id="cn" maxlength="200" placeholder="Masalan: oy oxiri"></label>
             <p class="small muted" style="margin-top:10px">Barcha faol tovarlar joriy qoldig'i bilan ro'yxatga olinadi.</p>`,
      foot: `<button class="btn btn-outline" type="button" data-no>Bekor</button><button class="btn" type="button" data-yes>Yaratish</button>`,
    });
    el.querySelector('[data-no]').addEventListener('click', close);
    el.querySelector('[data-yes]').addEventListener('click', (e) => {
      withBusy(e.currentTarget, async () => {
        try {
          const r = await post('/stock/counts', { note: el.querySelector('#cn').value.trim() || null });
          close();
          ctx.go(`#/stock/count/${r.count.id}`);
        } catch (err) { errorToast(err); }
      });
    });
  });
}

async function renderCount(root, id, ctx) {
  const { count: c, items } = await get(`/stock/counts/${id}`);
  const draft = c.status === 'draft';
  const editable = draft && ctx.can('stock.count');
  const approvable = draft && ctx.can('stock.approve');
  const gain = Number(c.total_gain);
  const loss = Number(c.total_loss);

  root.innerHTML = `
    <div class="page-head">
      <a class="btn btn-light btn-sm" href="#/stock?tab=counts">${icon('back', 'ico-sm')} Sanash</a>
      <div class="row">
        ${editable ? `<button class="btn btn-outline" type="button" id="csave">${icon('check', 'ico-sm')} Saqlash</button>` : ''}
        ${approvable ? `<button class="btn btn-success" type="button" id="capprove">${icon('check', 'ico-sm')} Tasdiqlash</button>` : ''}
      </div>
    </div>
    <div class="card">
      <h1 style="font-size:22px">${esc(c.count_no)}</h1>
      <div class="small muted" style="margin-top:4px">${dateTime(c.created_at)}${c.note ? ` · ${esc(c.note)}` : ''}</div>
      <div style="margin-top:10px">${draft
    ? '<span class="badge badge-low">Qoralama: sanoq kiritilmoqda</span>'
    : `<span class="badge badge-ok">Tasdiqlangan: ${dateTime(c.approved_at)}</span>`}</div>
      ${draft ? '' : `<div class="kpis" style="margin-top:12px">
        <div class="kpi good"><div class="label">Ortiqcha</div><div class="value">${money(gain)}</div></div>
        <div class="kpi ${loss ? 'bad' : 'neutral'}"><div class="label">Kamomad</div><div class="value">${money(loss)}</div></div>
      </div>`}
    </div>

    <div class="card" style="margin-top:14px">
      <input class="input" id="cf" type="search" placeholder="Tovar qidirish" style="margin-bottom:12px">
      <div class="table-wrap cards"><table>
        <thead><tr><th>Tovar</th><th class="right">Boshida</th><th class="right">Joriy qoldiq</th><th class="right">Sanalgan</th><th class="right">Farq</th></tr></thead>
        <tbody>${items.map((i) => {
    const counted = i.counted_qty;
    const diff = draft
      ? (counted === null ? null : Number(counted) - Number(i.current_qty))
      : i.applied_diff;
    return `<tr data-name="${esc(i.product_name.toLowerCase())}" data-curval="${i.current_qty}">
            <td data-label="Tovar"><b>${esc(i.product_name)}</b> <span class="small muted">${esc(i.unit)}</span></td>
            <td data-label="Boshida" class="right num">${qty(i.system_qty)}</td>
            <td data-label="Joriy" class="right num">${qty(i.current_qty)}</td>
            <td data-label="Sanalgan" class="right">${editable
    ? `<input class="input" style="max-width:140px;margin-left:auto;text-align:right" inputmode="decimal" data-cnt="${i.product_id}" value="${counted ?? ''}">`
    : `<span class="num">${counted === null ? '—' : qty(counted)}</span>`}</td>
            <td data-label="Farq" class="right num" data-diff>${diffHtml(diff)}</td>
          </tr>`;
  }).join('')}</tbody></table></div>
    </div>`;

  const cf = root.querySelector('#cf');
  cf.addEventListener('input', () => {
    const t = cf.value.trim().toLowerCase();
    root.querySelectorAll('tbody tr').forEach((tr) => {
      tr.hidden = Boolean(t) && !tr.dataset.name.includes(t);
    });
  });

  root.querySelectorAll('[data-cnt]').forEach((inp) => inp.addEventListener('input', () => {
    const tr = inp.closest('tr');
    const t = inp.value.trim();
    tr.querySelector('[data-diff]').innerHTML = t === '' ? '—' : diffHtml(parseQty(t) - Number(tr.dataset.curval));
  }));

  const collect = () => [...root.querySelectorAll('[data-cnt]')].map((inp) => ({
    product_id: Number(inp.dataset.cnt),
    counted_qty: inp.value.trim() === '' ? null : parseQty(inp.value),
  }));
  const saveAll = () => put(`/stock/counts/${id}`, { items: collect() });

  root.querySelector('#csave')?.addEventListener('click', (e) => {
    withBusy(e.currentTarget, async () => {
      try {
        await saveAll();
        toast('Sanoq saqlandi', 'ok');
      } catch (err) { errorToast(err); }
    });
  });

  root.querySelector('#capprove')?.addEventListener('click', async (e) => {
    // currentTarget await'dan keyin null bo'lib qoladi, shuning uchun tugmani oldindan olamiz
    const btn = e.currentTarget;
    const missing = collect().filter((x) => x.counted_qty === null).length;
    if (missing) {
      toast(`Barcha tovarlar sanalishi kerak. Sanalmagan: ${missing} ta`, 'warn');
      return;
    }
    const ok = await confirmBox("Farqlar omborga qo'llanadi va tarixga yoziladi. Tasdiqlaysizmi?", { okText: 'Tasdiqlash' });
    if (!ok) return;
    withBusy(btn, async () => {
      try {
        await saveAll();
        const r = await post(`/stock/counts/${id}/approve`, {});
        toast(`Tasdiqlandi. Ortiqcha: ${money(r.gain)}, kamomad: ${money(r.loss)}`, 'ok');
        renderCount(root, id, ctx);
      } catch (err) { errorToast(err); }
    });
  });
}

// ---------- Nomuvofiqliklar ----------

async function tabDiscrepancies(body) {
  const r = await get('/stock/discrepancies');
  body.innerHTML = `
    <div class="card" style="margin-bottom:14px">
      <div class="card-head"><h2>Qoldiq va partiyalar mos emasligi</h2></div>
      <p class="small muted" style="margin-bottom:10px">Tovar qoldig'i partiyalar yig'indisiga teng bo'lishi kerak. Bu yerda farq bo'lsa, tekshirish kerak.</p>
      ${r.mismatches.length
    ? `<div class="list">${r.mismatches.map((m) => `
          <div class="list-item">
            <div class="meta"><div class="name">${esc(m.name)}</div>
              <div class="sub">Qoldiq: ${qty(m.stock_qty)} · partiyalarda: ${qty(m.batch_qty)}</div></div>
            <span class="badge badge-out">Farq</span>
          </div>`).join('')}</div>`
    : '<div class="alert alert-info">Hammasi mos. Nomuvofiqlik topilmadi</div>'}
    </div>
    <div class="card">
      <div class="card-head"><h2>So'nggi sanoq farqlari (60 kun)</h2></div>
      ${r.count_differences.length ? `<div class="table-wrap cards"><table>
        <thead><tr><th>Sanoq</th><th>Sana</th><th>Tovar</th><th class="right">Boshida</th><th class="right">Sanalgan</th><th class="right">Farq</th></tr></thead>
        <tbody>${r.count_differences.map((x) => `<tr>
          <td data-label="Sanoq">${esc(x.count_no)}</td>
          <td data-label="Sana">${dateTime(x.approved_at)}</td>
          <td data-label="Tovar">${esc(x.name)}</td>
          <td data-label="Boshida" class="right num">${qty(x.system_qty)}</td>
          <td data-label="Sanalgan" class="right num">${qty(x.counted_qty)}</td>
          <td data-label="Farq" class="right num">${diffHtml(x.applied_diff)}</td>
        </tr>`).join('')}</tbody></table></div>`
        : emptyState("So'nggi farqlar yo'q", 'check')}
    </div>`;
}
