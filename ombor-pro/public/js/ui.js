// Umumiy yordamchilar: so'rovlar, formatlash, modal, xabarlar, ikonkalar

export const ICONS = {
  home: '<path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/>',
  cart: '<circle cx="9" cy="20" r="1.5"/><circle cx="18" cy="20" r="1.5"/><path d="M2 3h3l2.5 12h11L21 7H6"/>',
  box: '<path d="M21 8l-9-5-9 5 9 5 9-5z"/><path d="M3 8v8l9 5 9-5V8"/><path d="M12 13v8"/>',
  layers: '<path d="M12 2l10 5-10 5L2 7z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/>',
  truck: '<path d="M1 3h15v13H1z"/><path d="M16 8h4l3 3v5h-7"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/>',
  users: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
  wallet: '<rect x="2" y="6" width="20" height="14" rx="2"/><path d="M16 13h2"/><path d="M2 10h20"/>',
  chart: '<path d="M3 3v18h18"/><path d="M7 14l4-4 3 3 5-6"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/>',
  menu: '<path d="M3 6h18M3 12h18M3 18h18"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>',
  scan: '<path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2"/><path d="M7 12h10"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5M21 12H9"/>',
  back: '<path d="M15 18l-6-6 6-6"/>',
  edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
  archive: '<rect x="2" y="3" width="20" height="5" rx="1"/><path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8"/><path d="M10 12h4"/>',
  restore: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/>',
  check: '<path d="M20 6L9 17l-5-5"/>',
  alert: '<path d="M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/>',
  receipt: '<path d="M4 2v20l3-2 3 2 3-2 3 2 3-2 3 2V2l-3 2-3-2-3 2-3-2-3 2z"/><path d="M8 8h8M8 12h8M8 16h5"/>',
  share: '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4"/>',
  print: '<path d="M6 9V2h12v7"/><rect x="6" y="14" width="12" height="8"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/>',
  camera: '<path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/>',
  money: '<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6 10v4M18 10v4"/>',
  card: '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20M6 15h4"/>',
  transfer: '<path d="M17 1l4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><path d="M7 23l-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/>',
  credit: '<path d="M12 2v20"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>',
  split: '<path d="M16 3h5v5M4 20L21 3M21 16v5h-5M15 15l6 6M4 4l5 5"/>',
};

export function icon(name, cls = 'ico') {
  return `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ''}</svg>`;
}

export function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ---------- Formatlash ----------

export function num(value, max = 2) {
  const n = Number(value || 0);
  return n.toLocaleString('en-US', { maximumFractionDigits: max, minimumFractionDigits: 0 }).replace(/,/g, ' ');
}

export function money(value, { sign = false } = {}) {
  const n = Number(value || 0);
  const text = `${num(Math.abs(n), 2)} so'm`;
  if (sign && n > 0) return `+${text}`;
  if (n < 0) return `-${text}`;
  return text;
}

export function qty(value) {
  return num(value, 4);
}

// YYYY-MM-DD -> DD.MM.YYYY
export function dateOnly(s) {
  if (!s) return '';
  const [y, m, d] = String(s).slice(0, 10).split('-');
  return `${d}.${m}.${y}`;
}

// ISO vaqt -> DD.MM.YYYY HH:MM (Toshkent vaqti)
export function dateTime(iso) {
  if (!iso) return '';
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Tashkent', day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(new Date(iso));
  const get = (t) => parts.find((p) => p.type === t)?.value || '';
  return `${get('day')}.${get('month')}.${get('year')} ${get('hour')}:${get('minute')}`;
}

export function todayStr() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tashkent', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

export function addDaysStr(s, days) {
  const d = new Date(`${s}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function monthStartStr(s = todayStr()) {
  return `${s.slice(0, 8)}01`;
}

// ---------- So'rovlar ----------

let unauthorizedHandler = () => {};
export function onUnauthorized(fn) {
  unauthorizedHandler = fn;
}

export async function api(method, path, body) {
  const opts = { method, headers: {}, credentials: 'same-origin' };
  if (body instanceof FormData) {
    opts.body = body;
  } else {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body === undefined ? {} : body);
    if (method === 'GET' || method === 'HEAD') delete opts.body;
  }
  let res;
  try {
    res = await fetch(`/api${path}`, opts);
  } catch {
    throw new Error("Internet yoki server bilan aloqa yo'q. Qayta urinib ko'ring");
  }
  const type = res.headers.get('content-type') || '';
  const data = type.includes('application/json') ? await res.json() : null;
  if (res.status === 401 && !path.startsWith('/auth/login')) {
    unauthorizedHandler();
  }
  if (!res.ok) {
    const err = new Error(data?.error || `Xatolik (${res.status})`);
    err.status = res.status;
    err.details = data?.details;
    throw err;
  }
  return data;
}

export const get = (p) => api('GET', p);
export const post = (p, b) => api('POST', p, b ?? {});
export const put = (p, b) => api('PUT', p, b ?? {});

// Forma maydonlarini obyektga aylantiradi. data-type="num" bo'lsa raqamga o'giradi.
export function readForm(form) {
  const out = {};
  for (const el of form.querySelectorAll('[name]')) {
    if (el.disabled) continue;
    let value;
    if (el.type === 'checkbox') value = el.checked;
    else value = el.value;
    if (typeof value === 'string') value = value.trim();
    if (el.dataset.type === 'num') value = value === '' ? null : Number(String(value).replace(',', '.'));
    if (el.dataset.type === 'nullable' && value === '') value = null;
    out[el.name] = value;
  }
  return out;
}

// ---------- Xabarlar ----------

export function toast(message, kind = '') {
  const root = document.getElementById('toast-root');
  const el = document.createElement('div');
  el.className = `toast ${kind}`.trim();
  el.textContent = message;
  root.appendChild(el);
  setTimeout(() => el.remove(), 3200);
}

export function errorToast(err) {
  toast(err?.message || 'Xatolik yuz berdi', 'bad');
}

// ---------- Modal ----------

export function openModal({ title, body = '', foot = '', wide = false, onMount, onClose } = {}) {
  const root = document.getElementById('modal-root');
  root.innerHTML = `
    <div class="modal-backdrop" data-backdrop>
      <div class="modal${wide ? ' wide' : ''}" role="dialog" aria-modal="true" aria-label="${esc(title || '')}">
        <div class="modal-head">
          <h3>${esc(title || '')}</h3>
          <button class="icon-btn icon-btn-light" type="button" data-close aria-label="Yopish">${icon('minus', 'ico')}</button>
        </div>
        <div class="modal-body">${body}</div>
        ${foot ? `<div class="modal-foot">${foot}</div>` : ''}
      </div>
    </div>`;
  const backdrop = root.querySelector('[data-backdrop]');
  const close = () => {
    if (!root.firstElementChild) return;
    root.innerHTML = '';
    document.removeEventListener('keydown', onKey);
    if (onClose) onClose();
  };
  const onKey = (e) => {
    if (e.key === 'Escape') close();
  };
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) close();
  });
  root.querySelector('[data-close]').addEventListener('click', close);
  document.addEventListener('keydown', onKey);
  const modalEl = root.querySelector('.modal');
  if (onMount) onMount(modalEl, close);
  return { close, el: modalEl };
}

export function closeModal() {
  document.getElementById('modal-root').innerHTML = '';
}

export function confirmBox(message, { okText = 'Ha, davom etish', danger = false } = {}) {
  return new Promise((resolve) => {
    const { close, el } = openModal({
      title: 'Tasdiqlash',
      body: `<p style="font-size:16px">${esc(message)}</p>`,
      foot: `<button class="btn btn-outline" type="button" data-no>Bekor qilish</button>
             <button class="btn ${danger ? 'btn-danger' : ''}" type="button" data-yes>${esc(okText)}</button>`,
    });
    el.querySelector('[data-no]').addEventListener('click', () => { close(); resolve(false); });
    el.querySelector('[data-yes]').addEventListener('click', () => { close(); resolve(true); });
  });
}

// Yuklash holatida tugmani bloklash (ikki marta bosishdan himoya)
export async function withBusy(button, fn) {
  if (button.dataset.busy === '1') return undefined;
  button.dataset.busy = '1';
  const original = button.innerHTML;
  button.disabled = true;
  button.innerHTML = `<span class="spinner">...</span>`;
  try {
    return await fn();
  } finally {
    button.dataset.busy = '';
    button.disabled = false;
    button.innerHTML = original;
  }
}

export function statusBadge(status) {
  if (status === 'out') return '<span class="badge badge-out">Tugagan</span>';
  if (status === 'low') return '<span class="badge badge-low">Kam qolgan</span>';
  return '<span class="badge badge-ok">Yetarli</span>';
}

export function productThumb(p, big = false) {
  const cls = big ? 'thumb thumb-lg' : 'thumb';
  if (p.image_path) return `<div class="${cls}"><img src="${esc(p.image_path)}" alt=""></div>`;
  const letter = esc((p.name || '?').trim().charAt(0).toUpperCase());
  return `<div class="${cls}" aria-hidden="true">${letter}</div>`;
}

export function emptyState(text, iconName = 'box') {
  return `<div class="empty">${icon(iconName)}<div>${esc(text)}</div></div>`;
}
