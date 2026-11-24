// Amallar tarixi, xodimlar (ruxsatlar bilan) va sozlamalar
import {
  get, post, put, icon, esc, num, money, dateTime, readForm, toast, errorToast, openModal, withBusy,
  emptyState, todayStr, monthStartStr, download,
  takeNewFlag, presetRange, initials, parseQty } from '../ui.js';

const ACTION_LABELS = {
  'sale.create': 'Savdo', 'sale.return': 'Qaytarish', 'purchase.create': 'Kirim',
  'product.create': "Tovar qo'shildi", 'product.update': 'Tovar tahrirlandi',
  'product.archive': 'Arxivlandi', 'product.restore': 'Arxivdan tiklandi',
  'stock.damage': 'Zarar yozildi', 'stock.correction': 'Qoldiq tuzatildi',
  'count.create': 'Sanash boshlandi', 'count.approve': 'Sanash tasdiqlandi',
  'customer.create': 'Mijoz qo\'shildi', 'customer.update': 'Mijoz tahrirlandi',
  'supplier.create': 'Yetkazib beruvchi qo\'shildi', 'supplier.update': 'Yetkazib beruvchi tahrirlandi',
  'shift.open': 'Smena ochildi', 'shift.close': 'Smena yopildi',
  'cash.deposit': 'Kirim (depozit)', 'cash.withdrawal': 'Pul olish',
  'expense.create': 'Xarajat', 'user.create': 'Xodim qo\'shildi', 'user.update': 'Xodim tahrirlandi',
  'settings.update': 'Sozlamalar o\'zgardi', 'password.change': 'Parol o\'zgartirildi',
  'unit.create': 'Birlik qo\'shildi', 'category.create': 'Kategoriya qo\'shildi',
  login: 'Tizimga kirdi', setup: "Do'kon ochildi", 'backup.download': 'Zaxira nusxa olindi',
  'customer.debt': 'Mijozga qarz yozildi', 'customer.payment': "Mijoz qarz to'ladi",
  'supplier.debt': 'Yetkazib beruvchiga qarz yozildi', 'supplier.payment': "Yetkazib beruvchiga to'landi",
  'notifications.settings': 'Bildirishnoma sozlamalari',
};

// Tafsilot kalitlari — oddiy so'zlar bilan; pul summalari «so'm» bilan
const DETAIL_LABELS = {
  items: 'tovar', total: 'jami', credit: 'nasiya', paid_total: "to'landi", receipt_no: 'chek', name: 'nomi',
  barcode: 'shtrix-kod', opening: "boshlang'ich qoldiq", amount: 'summa', category: 'turkum', method: 'usul',
  selling_price: 'sotuv narxi', purchase_price: 'xarid narxi', min_stock: 'ogohlantirish chegarasi',
  expected: 'kutilgan', counted: 'sanalgan', difference: 'farq', username: 'login', role: 'lavozim',
  is_active: 'faol', count_no: 'sanoq', purchase_no: 'kirim', quantity: 'miqdor', reason: 'sabab', note: 'izoh',
};
const MONEY_KEYS = new Set(['total', 'credit', 'paid_total', 'amount', 'selling_price', 'purchase_price', 'expected', 'counted', 'difference', 'opening_cash']);
const VALUE_LABELS = {
  cash: 'naqd', card: 'karta', transfer: "o'tkazma", mixed: 'aralash', owner: 'egasi', administrator: 'administrator',
  cashier: 'kassir', warehouse: 'ombor xodimi', accountant: 'buxgalter', rent: 'ijara', salaries: 'maosh', utilities: 'kommunal',
  food: 'ovqat (obed)', household: 'suv, choy, mayda', delivery: 'yetkazib berish', transport: 'transport', repairs: "ta'mirlash", other: 'boshqa', true: 'ha', false: "yo'q",
};

const STORE_TYPE_LABEL = {
  clothing: "Kiyim do'koni", shoes: "Poyabzal do'koni", grocery: "Oziq-ovqat do'koni", construction: 'Qurilish mollari', fabric: 'Mato va gazlama',
  cosmetics: "Kosmetika do'koni", accessories: 'Aksessuarlar', electronics: "Elektronika do'koni", household: "Xo'jalik mollari", auto: 'Avto ehtiyot qismlar', other: "Boshqa do'kon",
};

const ENTITY_LABELS = {
  product: 'Tovar', sale: 'Savdo', purchase: 'Kirim', customer: 'Mijoz', supplier: 'Yetkazib beruvchi',
  cash: 'Kassa', cash_shift: 'Smena', expense: 'Xarajat', inventory_count: 'Sanash',
  user: 'Xodim', settings: 'Sozlamalar', unit: 'Birlik',
};


export async function render(root, params, ctx) {
  if (params.key === 'history') return renderHistory(root, params, ctx);
  if (params.key === 'employees') return renderEmployees(root, ctx, takeNewFlag(params));
  return renderSettings(root, ctx);
}

// ---------- Amallar tarixi ----------

async function renderHistory(root, params, ctx) {
  if (!ctx.can('history.view')) {
    root.innerHTML = '<div class="alert alert-bad">Tarixni ko\'rish uchun ruxsatingiz yo\'q</div>';
    return;
  }
  const from = params.query.from || monthStartStr();
  const to = params.query.to || todayStr();
  const entity = params.query.entity || '';
  const qs = new URLSearchParams({ from, to, limit: '300' });
  if (entity) qs.set('entity_type', entity);
  const { entries } = await get(`/history?${qs}`);

  root.innerHTML = `
    <div class="page-head"><div><h1>Amallar tarixi</h1><p class="muted">Har bir o'zgarish yozib boriladi</p></div></div>
    <div class="card" style="margin-bottom:14px">
      <div class="form-grid two" style="gap:10px">
        <label class="field"><span>Boshlanish</span><input class="input" type="date" id="hf" value="${esc(from)}"></label>
        <label class="field"><span>Tugash</span><input class="input" type="date" id="ht" value="${esc(to)}"></label>
        <label class="field" style="grid-column:1/-1"><span>Bo'lim</span>
          <select class="input" id="he"><option value="">Hammasi</option>
            ${Object.entries(ENTITY_LABELS).map(([k, v]) => `<option value="${k}" ${k === entity ? 'selected' : ''}>${esc(v)}</option>`).join('')}
          </select></label>
      </div>
    </div>
    <div class="card">
      ${entries.length ? `<div class="table-wrap cards"><table>
        <thead><tr><th>Vaqt</th><th>Xodim</th><th>Amal</th><th>Tafsilot</th></tr></thead>
        <tbody>${entries.map((e) => `<tr>
          <td data-label="Vaqt">${dateTime(e.created_at)}</td>
          <td data-label="Xodim">${esc(e.user_name || 'Tizim')}</td>
          <td data-label="Amal"><b>${esc(ACTION_LABELS[e.action] || e.action)}</b>
            <div class="small muted">${esc(ENTITY_LABELS[e.entity_type] || e.entity_type || '')}${e.entity_id ? ` #${e.entity_id}` : ''}</div></td>
          ${detailsText(e.details) ? `<td data-label="Tafsilot" class="small">${esc(detailsText(e.details))}</td>` : '<td class="no-label"></td>'}
        </tr>`).join('')}</tbody></table></div>`
        : emptyState("Bu davrda yozuv yo'q", 'clock')}
    </div>`;

  const apply = () => ctx.go(`#/history?from=${root.querySelector('#hf').value}&to=${root.querySelector('#ht').value}&entity=${root.querySelector('#he').value}`);
  root.querySelector('#hf').addEventListener('change', apply);
  root.querySelector('#ht').addEventListener('change', apply);
  root.querySelector('#he').addEventListener('change', apply);
}

function detailsText(details) {
  if (!details || typeof details !== 'object') return '';
  return Object.entries(details)
    .filter(([k, v]) => v !== null && v !== '' && v !== undefined && !(k === 'credit' && Number(v) === 0))
    .map(([k, v]) => {
      const label = DETAIL_LABELS[k] || k.replace(/_/g, ' ');
      if (typeof v === 'object') return `${label}: ${Array.isArray(v) ? `${v.length} ta` : Object.keys(v).length ? Object.entries(v).map(([a, b]) => `${a} ${b}`).join(', ') : '—'}`;
      if (k === 'items') return `${v} xil tovar`;
      if (MONEY_KEYS.has(k) && Number.isFinite(Number(v))) return `${label}: ${money(Number(v))}`;
      if (typeof v === 'boolean' || VALUE_LABELS[v] !== undefined) return `${label}: ${VALUE_LABELS[String(v)] ?? v}`;
      return `${label}: ${v}`;
    })
    .join(' · ');
}

// ---------- Xodimlar ----------

async function renderEmployees(root, ctx, openNew = false) {
  if (!ctx.can('employees.manage')) {
    root.innerHTML = '<div class="alert alert-bad">Xodimlarni boshqarish uchun ruxsatingiz yo\'q</div>';
    return;
  }
  const month = presetRange('month');
  const [{ users }, meta, perf] = await Promise.all([
    get('/users'),
    get('/permissions'),
    get(`/analytics/staff?from=${month.from}&to=${month.to}`).catch(() => null),
  ]);
  const byId = new Map((perf?.staff || []).map((x) => [x.id, x]));
  const active = users.filter((u) => u.is_active).length;
  const ROLE_TONE = { owner: 'badge-info', admin: 'badge-info', cashier: 'badge-ok', warehouse: 'badge-low', accountant: 'badge-muted' };
  root.innerHTML = `
    <div class="page-head">
      <div><h1>Xodimlar</h1><p class="muted">Har bir xodimga alohida login: kim nima sotganini va nima qilganini ko'rasiz</p></div>
      <div class="row">
        <a class="btn btn-light" href="#/staff">${icon('staff', 'ico-sm')} Natijalar</a>
        <button class="btn" type="button" id="addu">${icon('plus')} Yangi xodim</button>
      </div>
    </div>
    <div class="sum-row">
      <div class="sum-cell"><span>Hisoblar</span><b>${users.length} ta</b><small>${active} tasi faol</small></div>
      <div class="sum-cell"><span>Shu oy cheklar</span><b>${num((perf?.staff || []).reduce((x, r) => x + r.sales_count, 0), 0)} ta</b></div>
      <div class="sum-cell"><span>Shu oy savdo</span><b>${money(perf?.total_net_revenue || 0)}</b><small>qaytarishlar ayirilgan</small></div>
      <div class="sum-cell"><span>Eng faol</span><b>${esc((perf?.staff || []).find((r) => r.sales_count > 0)?.full_name || '—')}</b></div>
    </div>
    <div class="card" style="margin-top:14px">
      ${users.length ? `<div class="table-wrap cards"><table class="party-table">
        <thead><tr><th>Xodim</th><th>Lavozimi</th><th class="right">Shu oy</th><th>Holat</th><th></th></tr></thead>
        <tbody>${users.map((u) => {
          const st = byId.get(u.id);
          return `<tr class="clickable" data-id="${u.id}">
            <td data-label="Xodim"><div class="who"><span class="avatar">${esc(initials(u.full_name))}</span><div><b>${esc(u.full_name)}</b> ${u.id === ctx.user.id ? '<span class="badge badge-info">siz</span>' : ''}<div class="small muted">@${esc(u.username)}${u.phone ? ` · ${esc(u.phone)}` : ''}</div></div></div></td>
            <td data-label="Lavozimi"><span class="badge ${ROLE_TONE[u.role] || 'badge-muted'}">${esc(meta.roles[u.role] || u.role)}</span></td>
            <td data-label="Shu oy" class="right num">${st && st.sales_count ? `${money(st.net_revenue)}<div class="small muted">${st.sales_count} ta chek</div>` : '<span class="muted">savdo yo\'q</span>'}</td>
            <td data-label="Holat">${u.is_active ? '<span class="badge badge-ok">Faol</span>' : '<span class="badge badge-muted">Bloklangan</span>'}</td>
            <td class="right no-label"><button class="btn btn-light btn-sm" type="button" data-edit="${u.id}">${icon('edit', 'ico-sm')} O'zgartirish</button></td>
          </tr>`;
        }).join('')}</tbody></table></div>` : emptyState("Xodimlar yo'q", 'users')}
    </div>
    <p class="small muted" style="margin-top:10px">${icon('info', 'ico-xs')} Har bir lavozimning ruxsatlari bor: masalan, kassir tovar xarid narxini va foydani ko'rmaydi. Xodimni bosib, ruxsatlarini o'zgartirishingiz mumkin.</p>`;

  root.querySelector('#addu').addEventListener('click', () => openUserEditor(ctx, meta, null, () => renderEmployees(root, ctx)));
  if (openNew) openUserEditor(ctx, meta, null, () => renderEmployees(root, ctx));
  root.querySelectorAll('[data-id]').forEach((row) => row.addEventListener('click', () => {
    const u = users.find((x) => String(x.id) === row.dataset.id);
    openUserEditor(ctx, meta, u, () => renderEmployees(root, ctx));
  }));
}

function openUserEditor(ctx, meta, user, onSaved) {
  const isNew = !user;
  const isOwnerActor = ctx.user.role === 'owner';
  const roleKeys = Object.keys(meta.roles);
  let role = user?.role || 'cashier';
  const isSelf = user && user.id === ctx.user.id;
  // Tahrirlashda hozirgi ruxsatlar, yangi xodimda tanlangan rol standarti
  const effective = user?.permissions
    || Object.fromEntries(meta.permissions.map((p) => [p.key, meta.role_defaults[role].includes(p.key)]));

  const permsHtml = (r, current) => meta.permissions.map((p) => {
    const checked = r === 'owner' ? true : Boolean(current[p.key]);
    return `<label class="check"><input type="checkbox" data-perm="${p.key}" ${checked ? 'checked' : ''} ${r === 'owner' ? 'disabled' : ''}><span>${esc(p.label)}</span></label>`;
  }).join('');

  const { close, el } = openModal({
    title: isNew ? 'Yangi xodim' : `${user.full_name}`,
    wide: true,
    body: `
      <form id="uf" class="stack" novalidate>
        <div class="form-grid two" style="gap:10px">
          <label class="field"><span>Ism familiya *</span><input class="input" name="full_name" required maxlength="100" value="${esc(user?.full_name || '')}"></label>
          <label class="field"><span>Telefon</span><input class="input" name="phone" inputmode="tel" maxlength="30" value="${esc(user?.phone || '')}"></label>
          ${isNew
    ? `<label class="field"><span>Login *</span><input class="input" name="username" required maxlength="50" autocomplete="off" autocapitalize="none"><small>Lotin harflari, raqam, nuqta yoki defis</small></label>`
    : `<div class="field"><span>Login</span><input class="input" value="${esc(user.username)}" disabled></div>`}
          <label class="field"><span>${isNew ? 'Parol *' : 'Yangi parol (ixtiyoriy)'}</span>
            <input class="input" name="password" type="password" autocomplete="new-password" ${isNew ? 'required minlength="6"' : ''}><small>Kamida 6 belgi</small></label>
          <label class="field"><span>Rol</span>
            <select class="input" id="role" ${isSelf ? 'disabled' : ''}>
              ${roleKeys.map((k) => `<option value="${k}" ${k === role ? 'selected' : ''} ${k === 'owner' && !isOwnerActor ? 'disabled' : ''}>${esc(meta.roles[k])}</option>`).join('')}
            </select></label>
          ${!isNew && !isSelf ? `<label class="field"><span>Holati</span>
            <select class="input" name="is_active"><option value="true" ${user.is_active ? 'selected' : ''}>Faol</option><option value="false" ${!user.is_active ? 'selected' : ''}>Faol emas (kirish yopiq)</option></select></label>` : ''}
        </div>
        <div class="field">
          <span>Ruxsatlar</span>
          <small>Rol bo'yicha standart ruxsatlar belgilanadi. Kerak bo'lsa, alohida o'zgartiring. Egasining hamma ruxsati bor.</small>
          <div class="perm-grid" id="perms" style="margin-top:8px">${permsHtml(role, effective)}</div>
        </div>
        <div id="uerr"></div>
      </form>`,
    foot: `<button class="btn btn-outline" type="button" data-no>Bekor</button>
           <button class="btn" type="submit" form="uf" data-yes>${icon('check', 'ico-sm')} Saqlash</button>`,
  });

  el.querySelector('[data-no]').addEventListener('click', close);
  el.querySelector('#role').addEventListener('change', (e) => {
    role = e.target.value;
    el.querySelector('#perms').innerHTML = permsHtml(role, meta.role_defaults[role].reduce((acc, k) => ({ ...acc, [k]: true }), {}));
  });

  el.querySelector('#uf').addEventListener('submit', (e) => {
    e.preventDefault();
    const form = e.currentTarget;
    const d = readForm(form);
    const err = el.querySelector('#uerr');
    if (!d.full_name) {
      err.innerHTML = '<div class="alert alert-bad">Ism familiyani kiriting</div>';
      return;
    }
    if (isNew && !d.username) {
      err.innerHTML = '<div class="alert alert-bad">Loginni kiriting</div>';
      return;
    }
    // Faqat rol standartidan farq qilgan ruxsatlarni yuboramiz
    const defaults = role === 'owner' ? null : new Set(meta.role_defaults[role]);
    const overrides = {};
    if (defaults) {
      el.querySelectorAll('[data-perm]').forEach((cb) => {
        const key = cb.dataset.perm;
        if (cb.checked !== defaults.has(key)) overrides[key] = cb.checked;
      });
    }
    const body = {
      full_name: d.full_name,
      phone: d.phone || null,
      role,
      overrides,
    };
    if (isNew) {
      body.username = d.username;
      body.password = d.password;
    } else {
      if (d.password) body.password = d.password;
      if (!isSelf && d.is_active !== undefined) body.is_active = d.is_active === 'true' || d.is_active === true;
    }
    if (role === 'owner' && !isOwnerActor) {
      err.innerHTML = '<div class="alert alert-bad">Egasi rolini faqat egasi berishi mumkin</div>';
      return;
    }
    withBusy(el.querySelector('[data-yes]'), async () => {
      try {
        if (isNew) await post('/users', body);
        else await put(`/users/${user.id}`, body);
        close();
        toast('Saqlandi', 'ok');
        onSaved();
      } catch (ex) {
        err.innerHTML = `<div class="alert alert-bad">${esc(ex.message)}</div>`;
      }
    });
  });
}

// ---------- Sozlamalar ----------

async function renderSettings(root, ctx) {
  const { settings: s } = await get('/settings');
  const canManage = ctx.can('settings.manage');

  root.innerHTML = `
    <div class="page-head"><div><h1>Sozlamalar</h1><p class="muted">Do'kon ma'lumotlari va tizim sozlamalari</p></div></div>

    ${canManage ? `
    <section class="card su-profile">
      <div class="su-pf-main">
        <span class="su-pf-logo">${s.logo_path ? `<img src="${esc(s.logo_path)}" alt="">` : icon('store')}</span>
        <div><h2>${esc(s.store_name)}</h2>
          <div class="small muted">${s.region ? `${icon('mapPin', 'ico-xs')} ${esc([s.region, s.district].filter(Boolean).join(', '))}` : "Joylashuvi ko'rsatilmagan"}${s.employee_count ? ` · ${esc({ 1: "faqat o'zingiz", '2-5': '2–5 xodim', '6-15': '6–15 xodim', '16+': "16+ xodim" }[s.employee_count] || '')}` : ''}</div>
          <div class="chips" style="margin-top:8px">${(s.store_types || []).length ? s.store_types.map((t) => `<span class="chip">${esc(STORE_TYPE_LABEL[t] || t)}</span>`).join('') : '<span class="small amber">Do\'kon turi tanlanmagan — tovar formasi va turkumlar moslashishi uchun tanlang</span>'}</div></div>
      </div>
      <a class="btn" href="#/setup">${icon('sliders', 'ico-sm')} Do'kon turi, manzil, logotip</a>
    </section>
    <form id="sf" class="card stack" novalidate>
      <div class="card-head"><h2>Do'kon</h2></div>
      <div class="form-grid two" style="gap:10px">
        <label class="field"><span>Do'kon nomi *</span><input class="input" name="store_name" required maxlength="100" value="${esc(s.store_name)}"></label>
        <label class="field"><span>Telefon</span><input class="input" name="store_phone" inputmode="tel" maxlength="30" value="${esc(s.store_phone || '')}"></label>
        <label class="field" style="grid-column:1/-1"><span>Manzil</span><input class="input" name="store_address" maxlength="200" value="${esc(s.store_address || '')}"></label>
        <label class="field" style="grid-column:1/-1"><span>Chek pastki yozuvi</span><input class="input" name="receipt_footer" maxlength="200" value="${esc(s.receipt_footer || '')}"></label>
      </div>

      <div class="card-head" style="margin-top:6px"><h2>Eslatmalar</h2></div>
      <div class="stack">
        <label class="check"><input type="checkbox" name="notify_low_stock" ${s.notify_low_stock ? 'checked' : ''}><span>Tovar kam qolsa yoki tugasa — eslatsin</span></label>
        <label class="check"><input type="checkbox" name="notify_debts" ${s.notify_debts ? 'checked' : ''}><span>Qarz to'lash kuni yaqinlashsa yoki o'tib ketsa — eslatsin</span></label>
        <label class="field" style="max-width:320px"><span>Qarz kunidan necha kun oldin eslatsin</span>
          <input class="input" name="debt_warning_days" data-type="num" inputmode="numeric" value="${s.debt_warning_days}"></label>
        <a class="link-btn" href="#/notifications?tab=settings">${icon('bell', 'ico-xs')} Telegram'ga ham yuborish va boshqa eslatmalar</a>
      </div>
      <details class="adv">
        <summary>Mutaxassis uchun: foydani hisoblash usuli</summary>
        <label class="field" style="margin-top:10px"><span>Bir tovar har xil narxda kelganda, sotilganda qaysi xarid narxi olinsin?</span>
          <select class="input" name="costing_method">
            <option value="FIFO" ${s.costing_method === 'FIFO' ? 'selected' : ''}>Avval kelgani avval sotiladi (tavsiya)</option>
            <option value="WAVG" ${s.costing_method === 'WAVG' ? 'selected' : ''}>O'rtacha xarid narxi</option>
          </select>
          <small>Bilmasangiz — o'zgartirmang. Faqat keyingi sotuvlarga ta'sir qiladi.</small></label>
      </details>
      <div id="serr"></div>
      <button class="btn btn-lg" type="submit">${icon('check')} Saqlash</button>
    </form>` : `
    <div class="card">
      <div class="card-head"><h2>Do'kon</h2></div>
      <p><b>${esc(s.store_name)}</b></p>
      <p class="small muted">${esc(s.store_phone || '')} ${esc(s.store_address || '')}</p>
      <p class="small muted" style="margin-top:8px">Sozlamalarni o'zgartirish uchun ruxsat kerak.</p>
    </div>`}

    <form id="pwf" class="card stack" novalidate style="margin-top:14px">
      <div class="card-head"><h2>Mening parolim</h2></div>
      <div class="form-grid two" style="gap:10px">
        <label class="field"><span>Joriy parol</span><input class="input" name="current" type="password" required autocomplete="current-password"></label>
        <label class="field"><span>Yangi parol (kamida 6 belgi)</span><input class="input" name="next" type="password" required minlength="6" autocomplete="new-password"></label>
        <label class="field"><span>Yangi parolni tasdiqlang</span><input class="input" name="next2" type="password" required minlength="6" autocomplete="new-password"></label>
      </div>
      <div id="pwerr"></div>
      <button class="btn btn-outline" type="submit">${icon('check', 'ico-sm')} Parolni o'zgartirish</button>
    </form>

    ${ctx.user.role === 'owner' ? `
    <div class="card stack" style="margin-top:14px">
      <div class="card-head"><div><h2>Zaxira nusxa</h2><div class="card-sub">Butun bazani bitta faylga yuklab olish</div></div></div>
      <p class="small muted">Faylda barcha ma'lumotlar bor: tovarlar, savdolar, qarzlar, kassa, xodimlar va sozlamalar. Uni xavfsiz joyda saqlang va hech kimga bermang.
        Yangi serverga o'tganda: <code>npm run restore -- fayl.sql</code> (faqat bo'sh bazaga tiklanadi, mavjud ma'lumot ustidan yozilmaydi).</p>
      <div><button class="btn btn-light" type="button" id="backup">${icon('download', 'ico-sm')} Zaxira nusxasini yuklab olish (.sql)</button></div>
    </div>` : ''}`;

  root.querySelector('#sf')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const form = e.currentTarget;
    const d = readForm(form);
    const err = root.querySelector('#serr');
    if (!d.store_name) {
      err.innerHTML = '<div class="alert alert-bad">Do\'kon nomini kiriting</div>';
      return;
    }
    const body = {
      store_name: d.store_name,
      store_phone: d.store_phone || '',
      store_address: d.store_address || '',
      receipt_footer: d.receipt_footer || '',
      costing_method: d.costing_method,
      debt_warning_days: parseQty(d.debt_warning_days),
      notify_low_stock: form.querySelector('[name=notify_low_stock]').checked,
      notify_debts: form.querySelector('[name=notify_debts]').checked,
    };
    withBusy(form.querySelector('button[type=submit]'), async () => {
      try {
        await put('/settings', body);
        await ctx.reloadSettings();
        toast('Sozlamalar saqlandi', 'ok');
        err.innerHTML = '';
      } catch (ex) {
        err.innerHTML = `<div class="alert alert-bad">${esc(ex.message)}</div>`;
      }
    });
  });

  root.querySelector('#backup')?.addEventListener('click', (e) => withBusy(e.currentTarget, async () => {
    try {
      await download('/admin/backup', 'ombor-zaxira.sql');
      toast('Zaxira nusxasi yuklab olindi', 'ok');
    } catch (err) {
      errorToast(err);
    }
  }));
  root.querySelector('#pwf').addEventListener('submit', (e) => {
    e.preventDefault();
    const form = e.currentTarget;
    const d = readForm(form);
    const err = root.querySelector('#pwerr');
    if (d.next !== d.next2) {
      err.innerHTML = '<div class="alert alert-bad">Yangi parollar bir xil emas</div>';
      return;
    }
    withBusy(form.querySelector('button[type=submit]'), async () => {
      try {
        await post('/auth/password', { current_password: d.current, new_password: d.next });
        form.reset();
        err.innerHTML = '<div class="alert alert-info">Parol o\'zgartirildi</div>';
        toast('Parol o\'zgartirildi', 'ok');
      } catch (ex) {
        err.innerHTML = `<div class="alert alert-bad">${esc(ex.message)}</div>`;
      }
    });
  });
}
