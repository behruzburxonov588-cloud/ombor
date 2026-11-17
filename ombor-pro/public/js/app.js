// OMBOR PRO - asosiy ilova: kirish, tuzilma (yon panel, yuqori panel), marshrutlar, bildirishnomalar
import {
  icon, esc, get, post, onUnauthorized, openModal, closeModal, toast, errorToast, num, money,
  openPopover, closePopover, initials, timeAgo,
} from './ui.js';

// Marshrut -> sahifa moduli
const ROUTES = {
  dashboard: { perms: ['dashboard.view'], load: () => import('./pages/dashboard.js') },
  assistant: { perms: ['dashboard.view', 'reports.view'], load: () => import('./pages/assistant.js') },
  notifications: { perms: [], load: () => import('./pages/notifications.js') },
  sales: { perms: ['sales.create', 'sales.view'], load: () => import('./pages/sales.js') },
  products: { perms: ['products.view'], load: () => import('./pages/products.js') },
  purchases: { perms: ['purchases.view', 'purchases.create'], load: () => import('./pages/purchases.js') },
  stock: { perms: ['stock.view', 'stock.count', 'stock.approve'], load: () => import('./pages/stock.js') },
  customers: { perms: ['customers.view', 'sales.create'], load: () => import('./pages/parties.js') },
  debts: { perms: ['customers.view', 'reports.view'], load: () => import('./pages/debts.js') },
  suppliers: { perms: ['suppliers.view', 'purchases.view'], load: () => import('./pages/parties.js') },
  cash: { perms: ['cash.view', 'expenses.view', 'cash.shift'], load: () => import('./pages/cash.js') },
  reports: { perms: ['reports.view', 'stock.view'], load: () => import('./pages/reports.js') },
  staff: { perms: ['sales.create', 'employees.manage', 'reports.view'], load: () => import('./pages/staff.js') },
  history: { perms: ['history.view'], load: () => import('./pages/admin.js') },
  employees: { perms: ['employees.manage'], load: () => import('./pages/admin.js') },
  settings: { perms: [], load: () => import('./pages/admin.js') },
};

// Yon panel: bo'limlar mantiqiy guruhlarda
const NAV = [
  {
    group: 'Asosiy',
    items: [
      { id: 'dashboard', label: 'Bosh sahifa', icon: 'dashboard', href: '#/dashboard' },
      { id: 'assistant', label: 'Aqlli yordamchi', icon: 'sparkles', href: '#/assistant' },
      { id: 'notifications', label: 'Bildirishnomalar', icon: 'bell', href: '#/notifications', badge: true },
    ],
  },
  {
    group: 'Savdo',
    items: [
      { id: 'sales', label: 'Sotuv (POS)', icon: 'cart', href: '#/sales', perms: ['sales.create'], match: (p) => p.key === 'sales' && p.id !== 'history' },
      { id: 'sales-history', label: 'Savdolar tarixi', icon: 'receipt', href: '#/sales/history', route: 'sales', perms: ['sales.view', 'sales.create'], match: (p) => p.key === 'sales' && p.id === 'history' },
      { id: 'customers', label: 'Mijozlar', icon: 'users', href: '#/customers' },
      { id: 'debts', label: 'Mijoz qarzlari', icon: 'debt', href: '#/debts' },
    ],
  },
  {
    group: 'Ombor',
    items: [
      { id: 'products', label: 'Mahsulotlar', icon: 'box', href: '#/products' },
      { id: 'purchases', label: 'Kirim', icon: 'truck', href: '#/purchases' },
      { id: 'stock', label: 'Ombor', icon: 'warehouse', href: '#/stock', perms: ['stock.view'], match: (p) => p.key === 'stock' && p.query.tab !== 'counts' && p.id !== 'count' },
      { id: 'counts', label: 'Inventarizatsiya', icon: 'audit', href: '#/stock?tab=counts', route: 'stock', perms: ['stock.count', 'stock.approve'], match: (p) => p.key === 'stock' && (p.query.tab === 'counts' || p.id === 'count') },
      { id: 'suppliers', label: 'Yetkazib beruvchilar', icon: 'store', href: '#/suppliers' },
    ],
  },
  {
    group: 'Moliya',
    items: [
      { id: 'cash', label: 'Kassa', icon: 'wallet', href: '#/cash?tab=cash', perms: ['cash.view', 'cash.shift'], match: (p) => p.key === 'cash' && p.query.tab !== 'expenses' },
      { id: 'expenses', label: 'Xarajatlar', icon: 'expense', href: '#/cash?tab=expenses', route: 'cash', perms: ['expenses.view', 'reports.view'], match: (p) => p.key === 'cash' && p.query.tab === 'expenses' },
      { id: 'reports', label: 'Hisobotlar', icon: 'chart', href: '#/reports' },
    ],
  },
  {
    group: 'Boshqaruv',
    items: [
      { id: 'staff', label: 'Xodimlar samaradorligi', icon: 'staff', href: '#/staff' },
      { id: 'employees', label: 'Xodimlar', icon: 'userCog', href: '#/employees' },
      { id: 'history', label: 'Amallar tarixi', icon: 'history', href: '#/history' },
      { id: 'settings', label: 'Sozlamalar', icon: 'gear', href: '#/settings' },
    ],
  },
];

const MOBILE = ['dashboard', 'sales', 'products', 'stock'];
const ROLE_LABELS = { owner: 'Egasi', administrator: 'Administrator', cashier: 'Kassir', warehouse: 'Ombor xodimi', accountant: 'Buxgalter' };

const state = { user: null, settings: {}, unread: 0, notif: null, pollTimer: null };

const ctx = {
  get user() { return state.user; },
  get settings() { return state.settings; },
  can(key) { return Boolean(state.user?.permissions?.[key]); },
  canAny(keys) { return keys.some((k) => ctx.can(k)); },
  go(hash) { location.hash = hash; },
  roleLabel: (r) => ROLE_LABELS[r] || r,
  async reloadSettings() {
    const r = await get('/settings');
    state.settings = r.settings;
    const storeEl = document.querySelector('.sb-brand .store');
    if (storeEl) storeEl.textContent = state.settings.store_name || '';
    document.title = `${state.settings.store_name || 'OMBOR PRO'} · OMBOR PRO`;
  },
  setUnread(n) { setBadge(n); },
  refreshNotifications: () => pollNotifications(false),
};

const navAllowed = (item) => {
  const route = ROUTES[item.route || item.id];
  if (!route) return false;
  const perms = item.perms || route.perms;
  return perms.length === 0 || ctx.canAny(perms);
};
const routeAllowed = (key) => {
  const r = ROUTES[key];
  return Boolean(r) && (r.perms.length === 0 || ctx.canAny(r.perms));
};
function firstAllowed() {
  for (const g of NAV) for (const it of g.items) if (navAllowed(it)) return it.href;
  return '#/settings';
}

function parseHash() {
  const raw = location.hash.replace(/^#\/?/, '');
  const [pathPart, queryPart = ''] = raw.split('?');
  const [key = '', id = '', sub = ''] = pathPart.split('/');
  const query = Object.fromEntries(new URLSearchParams(queryPart));
  return { key, id, sub, query, raw };
}

function activeNav(p) {
  for (const g of NAV) {
    for (const it of g.items) {
      if (it.match ? it.match(p) : (it.route || it.id) === p.key) return it;
    }
  }
  return null;
}

const $ = (sel) => document.querySelector(sel);

// ---------- Kirish va birinchi sozlash ----------

async function showAuth(setupRequired) {
  $('#app').hidden = true;
  $('#boot').hidden = true;
  const root = document.getElementById('auth-root') || Object.assign(document.createElement('div'), { id: 'auth-root', className: 'auth' });
  if (!root.parentNode) document.body.appendChild(root);
  root.hidden = false;
  if (setupRequired) {
    root.innerHTML = `
      <div class="auth-card">
        <div class="auth-brand">
          <div class="mark">${icon('layers')}</div>
          <h1>OMBOR PRO</h1>
          <p>Birinchi marta sozlash. Do'kon va egasi ma'lumotlarini kiriting</p>
        </div>
        <form id="setup-form" class="form-grid" novalidate>
          <label class="field"><span>Do'kon nomi</span><input class="input" name="store_name" required maxlength="100" placeholder="Masalan: Baraka savdo"></label>
          <label class="field"><span>Egasining ismi</span><input class="input" name="full_name" required maxlength="100" placeholder="Ism va familiya"></label>
          <label class="field"><span>Telefon (ixtiyoriy)</span><input class="input" name="store_phone" maxlength="30" inputmode="tel" placeholder="+998 90 123 45 67"></label>
          <label class="field"><span>Login</span><input class="input" name="username" required maxlength="50" autocomplete="username" placeholder="masalan: egasi"><small>Faqat lotin harflari, raqam, nuqta yoki defis</small></label>
          <label class="field"><span>Parol</span><input class="input" name="password" type="password" required minlength="6" autocomplete="new-password" placeholder="Kamida 6 belgi"></label>
          <label class="field"><span>Parolni tasdiqlang</span><input class="input" name="password2" type="password" required minlength="6" autocomplete="new-password"></label>
          <div id="form-error"></div>
          <button class="btn btn-lg btn-block" type="submit">Tizimni yaratish</button>
        </form>
      </div>`;
    root.querySelector('#setup-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const d = Object.fromEntries(new FormData(e.currentTarget));
      const errEl = root.querySelector('#form-error');
      if (d.password !== d.password2) {
        errEl.innerHTML = '<div class="alert alert-bad">Parollar bir xil emas</div>';
        return;
      }
      try {
        const r = await post('/setup', d);
        state.user = r.user;
        await bootShell();
      } catch (err) {
        errEl.innerHTML = `<div class="alert alert-bad">${esc(err.message)}</div>`;
      }
    });
  } else {
    root.innerHTML = `
      <div class="auth-card">
        <div class="auth-brand">
          <div class="mark">${icon('layers')}</div>
          <h1>OMBOR PRO</h1>
          <p>Tizimga kirish uchun login va parolingizni kiriting</p>
        </div>
        <form id="login-form" class="form-grid" novalidate>
          <label class="field"><span>Login</span><input class="input" name="username" required autocomplete="username" autocapitalize="none"></label>
          <label class="field"><span>Parol</span><input class="input" name="password" type="password" required autocomplete="current-password"></label>
          <div id="form-error"></div>
          <button class="btn btn-lg btn-block" type="submit">Kirish</button>
        </form>
      </div>`;
    root.querySelector('#login-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const d = Object.fromEntries(new FormData(e.currentTarget));
      const btn = e.currentTarget.querySelector('button[type=submit]');
      btn.disabled = true;
      try {
        const r = await post('/auth/login', d);
        state.user = r.user;
        await bootShell();
      } catch (err) {
        root.querySelector('#form-error').innerHTML = `<div class="alert alert-bad">${esc(err.message)}</div>`;
      } finally {
        btn.disabled = false;
      }
    });
  }
}

function hideAuth() {
  const root = document.getElementById('auth-root');
  if (root) root.hidden = true;
}

// ---------- Tuzilma ----------

function buildShell() {
  const app = $('#app');
  if (app.dataset.built === '1') return;
  app.dataset.built = '1';
  app.className = 'app has-sidebar';
  app.innerHTML = `
    <aside class="sidebar" id="sidebar" aria-label="Asosiy menyu"></aside>
    <header class="topbar">
      <div class="topbar-inner">
        <button class="icon-btn" id="btn-menu" type="button" aria-label="Menyuni ochish">${icon('menu')}</button>
        <div class="title" id="page-title"></div>
        <div class="spacer"></div>
        <button class="searchbox" id="searchbox" type="button" aria-label="Qidiruv">${icon('search', 'ico-sm')}<span>Qidirish…</span><span class="kbd">Ctrl K</span></button>
        <button class="icon-btn" id="btn-search" type="button" aria-label="Qidiruv">${icon('search')}</button>
        <button class="icon-btn" id="btn-bell" type="button" aria-label="Bildirishnomalar">${icon('bell')}<span class="dot" hidden></span></button>
        <button class="icon-btn" id="btn-user" type="button" aria-label="Profil"><span class="avatar" style="width:28px;height:28px;font-size:11px"></span></button>
      </div>
    </header>
    <main class="content" id="page"></main>
    <nav class="bottomnav" id="bottomnav" aria-label="Pastki menyu"></nav>`;
  $('#btn-menu').addEventListener('click', () => toggleDrawer(true));
  $('#btn-search').addEventListener('click', openGlobalSearch);
  $('#searchbox').addEventListener('click', openGlobalSearch);
  $('#btn-bell').addEventListener('click', (e) => openBell(e.currentTarget));
  $('#btn-user').addEventListener('click', (e) => openUserMenu(e.currentTarget));
  window.addEventListener('hashchange', route);
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k' && state.user) {
      e.preventDefault();
      openGlobalSearch();
    }
  });
  const style = document.createElement('style');
  style.textContent = '@media (min-width:1024px){#btn-user{display:none}}';
  document.head.appendChild(style);
}

function toggleDrawer(open) {
  const sb = $('#sidebar');
  const scrim = document.querySelector('.sidebar-scrim');
  if (open) {
    sb.classList.add('open');
    if (!scrim) {
      const s = document.createElement('div');
      s.className = 'sidebar-scrim';
      s.addEventListener('click', () => toggleDrawer(false));
      document.body.appendChild(s);
    }
  } else {
    sb.classList.remove('open');
    scrim?.remove();
  }
}

function renderNav(p) {
  const active = activeNav(p);
  const u = state.user;
  $('#sidebar').innerHTML = `
    <div class="sb-brand">
      <span class="brand-mark">${icon('layers')}</span>
      <div class="names"><div class="product">OMBOR PRO</div><div class="store">${esc(state.settings.store_name || '')}</div></div>
    </div>
    <nav class="sb-nav">
      ${NAV.map((g) => {
        const items = g.items.filter(navAllowed);
        if (!items.length) return '';
        return `<div class="sb-group"><div class="sb-label">${esc(g.group)}</div>
          ${items.map((it) => `<a class="nav-item${active?.id === it.id ? ' active' : ''}" href="${it.href}" ${active?.id === it.id ? 'aria-current="page"' : ''}>
            ${icon(it.icon, 'ico-sm')}<span>${esc(it.label)}</span>${it.badge && state.unread ? `<span class="count">${state.unread > 99 ? '99+' : state.unread}</span>` : ''}</a>`).join('')}
        </div>`;
      }).join('')}
    </nav>
    <div class="sb-foot">
      <button class="user-chip" type="button" id="sb-user">
        <span class="avatar">${esc(initials(u.full_name))}</span>
        <span class="who"><b>${esc(u.full_name)}</b><span>${esc(ROLE_LABELS[u.role] || u.role)}</span></span>
        ${icon('more', 'ico-sm')}
      </button>
    </div>`;
  $('#sidebar').querySelectorAll('.nav-item').forEach((a) => a.addEventListener('click', () => toggleDrawer(false)));
  $('#sb-user').addEventListener('click', (e) => openUserMenu(e.currentTarget, 'left'));
  $('#btn-user .avatar').textContent = initials(u.full_name);

  const mobile = MOBILE.map((id) => NAV.flatMap((g) => g.items).find((it) => it.id === id)).filter((it) => it && navAllowed(it));
  $('#bottomnav').innerHTML = `
    ${mobile.map((it) => `<button type="button" data-href="${it.href}" class="${active?.id === it.id ? 'active' : ''}">${icon(it.icon)}<span>${esc(it.label.split(' ')[0])}</span></button>`).join('')}
    <button type="button" data-menu>${icon('menu')}<span>Menyu</span></button>`;
  $('#bottomnav').querySelectorAll('[data-href]').forEach((b) => b.addEventListener('click', () => { location.hash = b.dataset.href; }));
  $('#bottomnav [data-menu]').addEventListener('click', () => toggleDrawer(true));
  return active;
}

function openUserMenu(anchor, align = 'right') {
  const u = state.user;
  openPopover(anchor, `
    <div class="menu-list">
      <div class="who"><b>${esc(u.full_name)}</b><span>${esc(ROLE_LABELS[u.role] || u.role)} · ${esc(u.username)}</span></div>
      <hr>
      <a href="#/notifications?tab=personal">${icon('sliders', 'ico-sm')} Shaxsiy sozlamalar</a>
      ${routeAllowed('staff') ? `<a href="#/staff">${icon('staff', 'ico-sm')} Mening natijalarim</a>` : ''}
      <a href="#/settings">${icon('key', 'ico-sm')} Parolni o'zgartirish</a>
      <hr>
      <button type="button" data-logout>${icon('logout', 'ico-sm')} Chiqish</button>
    </div>`, {
    align,
    onMount: (el, close) => {
      el.querySelectorAll('a').forEach((a) => a.addEventListener('click', () => { close(); toggleDrawer(false); }));
      el.querySelector('[data-logout]').addEventListener('click', () => { close(); logout(); });
    },
  });
}

function openGlobalSearch() {
  let timer = null;
  closePopover();
  openModal({
    title: 'Qidiruv',
    body: `<div class="search-input">${icon('search', 'ico-sm')}<input class="input" id="gs" type="search" placeholder="Mahsulot, mijoz yoki yetkazib beruvchi (nomi yoki telefoni)" autofocus></div>
           <div id="gs-res" style="margin-top:12px"><div class="empty small">Kamida 2 ta harf kiriting</div></div>`,
    onMount: (el, close) => {
      const input = el.querySelector('#gs');
      const res = el.querySelector('#gs-res');
      setTimeout(() => input.focus(), 30);
      input.addEventListener('input', () => {
        clearTimeout(timer);
        timer = setTimeout(async () => {
          const q = input.value.trim();
          if (q.length < 2) { res.innerHTML = '<div class="empty small">Kamida 2 ta harf kiriting</div>'; return; }
          try {
            const r = await get(`/search?q=${encodeURIComponent(q)}`);
            const rows = [
              ...r.products.map((p) => ({ k: 'products', id: p.id, t: p.name, s: `Qoldiq: ${num(p.stock_qty, 3)} · ${money(p.selling_price)}`, tag: 'Mahsulot', ic: 'box' })),
              ...r.customers.map((c) => ({ k: 'customers', id: c.id, t: c.name, s: c.phone || '', tag: 'Mijoz', ic: 'user' })),
              ...r.suppliers.map((s) => ({ k: 'suppliers', id: s.id, t: s.name, s: s.phone || '', tag: 'Yetkazib beruvchi', ic: 'store' })),
            ];
            res.innerHTML = rows.length
              ? `<div class="list">${rows.map((x) => `
                  <a class="list-item" href="#/${x.k}/${x.id}">
                    <span class="thumb thumb-sm">${icon(x.ic, 'ico-sm')}</span>
                    <div class="meta"><div class="name">${esc(x.t)}</div><div class="sub">${esc(x.s)}</div></div>
                    <span class="badge badge-muted">${esc(x.tag)}</span>
                  </a>`).join('')}</div>`
              : '<div class="empty">Hech narsa topilmadi</div>';
            res.querySelectorAll('a').forEach((a) => a.addEventListener('click', () => close()));
          } catch (err) {
            errorToast(err);
          }
        }, 220);
      });
    },
  });
}

// ---------- Bildirishnomalar (qo'ng'iroqcha, brauzer bildirishnomasi) ----------

function setBadge(n) {
  state.unread = n;
  const dot = $('#btn-bell .dot');
  if (dot) {
    dot.hidden = !n;
    dot.textContent = n > 99 ? '99+' : String(n);
  }
  const nav = document.querySelector('.nav-item[href="#/notifications"]');
  if (nav) {
    nav.querySelector('.count')?.remove();
    if (n) nav.insertAdjacentHTML('beforeend', `<span class="count">${n > 99 ? '99+' : n}</span>`);
  }
}

const seenKey = () => `ombor.notif.seen.${state.user?.id}`;
function readSeen() {
  try { return Number(localStorage.getItem(seenKey()) || 0); } catch { return 0; }
}
function writeSeen(id) {
  try { localStorage.setItem(seenKey(), String(id)); } catch { /* xotira yopiq */ }
}

async function pollNotifications(initial) {
  if (!state.user) return;
  try {
    const r = await get('/notifications?limit=20');
    state.notif = r;
    setBadge(r.unread);
    const maxId = r.items[0]?.id || 0;
    const seen = readSeen();
    if (!initial && seen && r.browser?.browser && 'Notification' in window && Notification.permission === 'granted' && !r.quiet) {
      const fresh = r.items
        .filter((x) => x.id > seen && !x.is_read && r.browser_groups.includes(x.type_group) && r.browser.browser_levels.includes(x.level))
        .slice(0, 3);
      for (const x of fresh.reverse()) {
        try {
          const nt = new Notification(x.title, { body: x.body, tag: `ombor-${x.id}`, icon: '/favicon.svg' });
          nt.onclick = () => {
            window.focus();
            if (x.link) location.hash = x.link;
            post('/notifications/read', { ids: [x.id] }).catch(() => {});
            nt.close();
          };
        } catch { /* brauzer ruxsat bermadi */ }
      }
    }
    if (maxId > seen) writeSeen(maxId);
  } catch {
    /* tarmoq xatosi: keyingi safar */
  }
}

function startPolling() {
  clearInterval(state.pollTimer);
  pollNotifications(true);
  state.pollTimer = setInterval(() => pollNotifications(false), 60 * 1000);
}

const LEVEL_LABEL = { critical: 'Muhim', warning: 'Diqqat', success: 'Yaxshi', info: "Ma'lumot" };

function notifItem(n) {
  return `<a class="notif ${n.is_read ? 'read' : 'unread'}" href="${esc(n.link || '#/notifications')}" data-id="${n.id}">
      <span class="lvl lvl-${esc(n.level)}" title="${esc(LEVEL_LABEL[n.level] || '')}"></span>
      <div style="min-width:0"><div class="nt">${esc(n.title)}</div><div class="nb">${esc(n.body)}</div></div>
      <span class="when">${esc(timeAgo(n.created_at))}</span>
    </a>`;
}

async function openBell(anchor) {
  const render = (r) => `
    <div class="notif-panel">
      <div class="pop-head"><b>Bildirishnomalar</b>${r.unread ? `<button class="link-btn" type="button" data-all>Hammasini o'qilgan qilish</button>` : ''}</div>
      <div class="notif-list">${r.items.length ? r.items.slice(0, 8).map(notifItem).join('') : `<div class="empty">${icon('bell')}<div>Hozircha bildirishnoma yo'q</div></div>`}</div>
      <div class="pop-foot"><a class="link-btn" href="#/notifications">Barchasini ko'rish ${icon('right', 'ico-xs')}</a>
        ${ctx.can('settings.manage') ? `<a class="link-btn" href="#/notifications?tab=settings">${icon('gear', 'ico-xs')} Sozlash</a>` : ''}</div>
    </div>`;
  const pop = openPopover(anchor, render(state.notif || { items: [], unread: 0 }), {
    onMount: (el, close) => bind(el, close),
  });
  function bind(el, close) {
    el.querySelectorAll('.notif').forEach((a) => a.addEventListener('click', () => {
      post('/notifications/read', { ids: [Number(a.dataset.id)] }).then(() => pollNotifications(false)).catch(() => {});
      close();
    }));
    el.querySelectorAll('.pop-foot a').forEach((a) => a.addEventListener('click', () => close()));
    el.querySelector('[data-all]')?.addEventListener('click', async () => {
      await post('/notifications/read-all', {});
      await pollNotifications(false);
      pop.innerHTML = render(state.notif);
      bind(pop, close);
    });
  }
  await pollNotifications(false);
  if (document.body.contains(pop)) {
    pop.innerHTML = render(state.notif);
    bind(pop, closePopover);
  }
}

async function logout() {
  try {
    await post('/auth/logout', {});
  } finally {
    state.user = null;
    clearInterval(state.pollTimer);
    location.hash = '';
    $('#app').hidden = true;
    closeModal();
    closePopover();
    await showAuth(false);
  }
}

// ---------- Marshrutlash ----------

async function route() {
  if (!state.user) return;
  const params = parseHash();
  const { key } = params;
  if (!routeAllowed(key)) {
    if (ROUTES[key]) toast("Bu bo'limga kirish uchun ruxsatingiz yo'q", 'warn');
    ctx.go(firstAllowed());
    return;
  }
  // POS faqat savdo huquqi bilan; qolganlar savdolar tarixini ko'radi
  if (key === 'sales' && params.id !== 'history' && !params.id && !ctx.can('sales.create')) {
    ctx.go('#/sales/history');
    return;
  }
  closeModal();
  closePopover();
  toggleDrawer(false);
  const active = renderNav(params);
  $('#page-title').textContent = active?.label || '';
  setBadge(state.unread);
  const page = $('#page');
  page.innerHTML = '<div class="empty">Yuklanmoqda…</div>';
  try {
    const mod = await ROUTES[key].load();
    window.scrollTo(0, 0);
    await mod.render(page, params, ctx);
  } catch (err) {
    console.error(err);
    page.innerHTML = `<div class="alert alert-bad">${icon('alert', 'ico-sm')}<div>${esc(err.message || 'Xatolik')}</div></div>`;
  }
}

// ---------- Boshlash ----------

async function bootShell() {
  hideAuth();
  $('#boot').hidden = true;
  state.settings = await get('/settings').then((r) => r.settings).catch(() => ({}));
  buildShell();
  $('#app').hidden = false;
  document.title = `${state.settings.store_name || 'OMBOR PRO'} · OMBOR PRO`;
  startPolling();
  if (parseHash().key) route();
  else ctx.go(firstAllowed());
}

onUnauthorized(() => {
  if (state.user) {
    state.user = null;
    clearInterval(state.pollTimer);
    $('#app').hidden = true;
    closeModal();
    closePopover();
    showAuth(false);
    toast('Sessiya tugadi. Qaytadan kiring', 'warn');
  }
});

async function start() {
  try {
    const status = await get('/auth/status');
    if (status.setup_required) {
      $('#boot').hidden = true;
      await showAuth(true);
      return;
    }
    const me = await get('/auth/me');
    state.user = me.user;
    await bootShell();
  } catch (err) {
    if (err.status === 401) {
      $('#boot').hidden = true;
      await showAuth(false);
    } else {
      $('#boot').innerHTML = `<div class="boot-logo">OMBOR PRO</div><div class="boot-sub">${esc(err.message)}</div>`;
    }
  }
}

start();
