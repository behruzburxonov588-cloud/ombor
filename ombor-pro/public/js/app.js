// OMBOR PRO - asosiy ilova: kirish, tuzilma, marshrutlar
import {
  icon, esc, get, post, onUnauthorized, openModal, closeModal, toast, errorToast, num, money,
} from './ui.js';

const ROUTES = [
  { key: 'dashboard', label: 'Bosh sahifa', icon: 'home', perms: ['dashboard.view'], mobile: true, load: () => import('./pages/dashboard.js') },
  { key: 'sales', label: 'Sotuv', icon: 'cart', perms: ['sales.create'], mobile: true, load: () => import('./pages/sales.js') },
  { key: 'products', label: 'Mahsulotlar', icon: 'box', perms: ['products.view'], mobile: true, load: () => import('./pages/products.js') },
  { key: 'purchases', label: 'Kirim', icon: 'truck', perms: ['purchases.view', 'purchases.create'], load: () => import('./pages/purchases.js') },
  { key: 'stock', label: 'Ombor', icon: 'layers', perms: ['stock.view'], mobile: true, load: () => import('./pages/stock.js') },
  { key: 'customers', label: 'Mijozlar', icon: 'users', perms: ['customers.view', 'sales.create'], load: () => import('./pages/parties.js') },
  { key: 'suppliers', label: "Yetkazib beruvchilar", icon: 'truck', perms: ['suppliers.view', 'purchases.view'], load: () => import('./pages/parties.js') },
  { key: 'cash', label: 'Kassa va xarajat', icon: 'wallet', perms: ['cash.view', 'expenses.view', 'cash.shift'], load: () => import('./pages/cash.js') },
  { key: 'reports', label: 'Hisobotlar', icon: 'chart', perms: ['reports.view'], load: () => import('./pages/reports.js') },
  { key: 'history', label: 'Amallar tarixi', icon: 'clock', perms: ['history.view'], load: () => import('./pages/admin.js') },
  { key: 'employees', label: 'Xodimlar', icon: 'users', perms: ['employees.manage'], load: () => import('./pages/admin.js') },
  { key: 'settings', label: 'Sozlamalar', icon: 'gear', perms: [], load: () => import('./pages/admin.js') },
];

const state = { user: null, settings: {}, started: false };

const ctx = {
  get user() { return state.user; },
  get settings() { return state.settings; },
  can(key) { return Boolean(state.user?.permissions?.[key]); },
  canAny(keys) { return keys.some((k) => ctx.can(k)); },
  go(hash) { location.hash = hash; },
  async reloadSettings() {
    const r = await get('/settings');
    state.settings = r.settings;
    // Yon paneldagi do'kon nomi va sahifa sarlavhasini darhol yangilaymiz
    const storeEl = document.querySelector('.sidebar .store');
    if (storeEl) storeEl.textContent = state.settings.store_name || '';
    document.title = `${state.settings.store_name || 'OMBOR PRO'} - OMBOR PRO`;
    renderShellTitle();
  },
};

function routeAllowed(route) {
  return route.perms.length === 0 || ctx.canAny(route.perms);
}

function firstAllowedRoute() {
  return ROUTES.find((r) => routeAllowed(r)) || ROUTES[ROUTES.length - 1];
}

function parseHash() {
  const raw = location.hash.replace(/^#\/?/, '');
  const [pathPart, queryPart = ''] = raw.split('?');
  const [key = '', id = '', sub = ''] = pathPart.split('/');
  const query = Object.fromEntries(new URLSearchParams(queryPart));
  return { key, id, sub, query, raw };
}

const $ = (sel) => document.querySelector(sel);

// ---------- Kirish va sozlash ekrani ----------

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
          <p>Birinchi marta sozlash. Ma'lumotlarni kiriting</p>
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
      const f = e.currentTarget;
      const d = Object.fromEntries(new FormData(f));
      const errEl = root.querySelector('#form-error');
      if (d.password !== d.password2) {
        errEl.innerHTML = `<div class="alert alert-bad">Parollar bir xil emas</div>`;
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

// ---------- Tuzilma (sidebar, topbar, pastki menyu) ----------

function buildShell() {
  const app = $('#app');
  if (app.dataset.built === '1') return;
  app.dataset.built = '1';
  app.className = 'app has-sidebar';
  app.innerHTML = `
    <aside class="sidebar" id="sidebar" aria-label="Asosiy menyu"></aside>
    <header class="topbar">
      <div class="topbar-inner">
        <div class="brand">
          <span class="brand-mark">${icon('layers')}</span>
          <span class="mobile-only">OMBOR</span>
        </div>
        <div class="title" id="page-title" style="margin-left:10px"></div>
        <div class="spacer"></div>
        <button class="icon-btn" id="btn-search" type="button" aria-label="Qidiruv">${icon('search')}</button>
        <button class="icon-btn" id="btn-logout" type="button" aria-label="Chiqish">${icon('logout')}</button>
      </div>
    </header>
    <main class="content" id="page"></main>
    <nav class="bottomnav" id="bottomnav" aria-label="Pastki menyu"></nav>`;
  $('#btn-logout').addEventListener('click', logout);
  $('#btn-search').addEventListener('click', openGlobalSearch);
  window.addEventListener('hashchange', route);
}

function renderNav(activeKey) {
  const seen = new Set();
  const items = ROUTES.filter(routeAllowed).filter((r) => {
    if (seen.has(r.label)) return false;
    seen.add(r.label);
    return true;
  });
  $('#sidebar').innerHTML = `
    <div class="brand"><span class="brand-mark">${icon('layers')}</span><span>OMBOR PRO</span></div>
    <div class="store">${esc(state.settings.store_name || '')}</div>
    ${items.map((r) => `<button class="nav-item${r.key === activeKey ? ' active' : ''}" data-go="${r.key}" type="button">${icon(r.icon, 'ico-sm')}<span>${esc(r.label)}</span></button>`).join('')}`;

  const mobile = ROUTES.filter((r) => r.mobile && routeAllowed(r));
  $('#bottomnav').innerHTML = `
    ${mobile.map((r) => `<button type="button" data-go="${r.key}" class="${r.key === activeKey ? 'active' : ''}">${icon(r.icon)}<span>${esc(r.label.split(' ')[0])}</span></button>`).join('')}
    <button type="button" data-menu>${icon('menu')}<span>Menyu</span></button>`;

  document.querySelectorAll('[data-go]').forEach((el) => {
    el.addEventListener('click', () => ctx.go(`#/${el.dataset.go}`));
  });
  document.querySelector('[data-menu]')?.addEventListener('click', openMenu);
}

function renderShellTitle(title) {
  if (title !== undefined) $('#page-title').textContent = title;
}

function openMenu() {
  const items = ROUTES.filter((r) => routeAllowed(r));
  const seen = new Set();
  const unique = items.filter((r) => (seen.has(r.label) ? false : seen.add(r.label)));
  openModal({
    title: 'Menyu',
    body: `<div class="menu-grid">${unique.map((r) => `
      <button class="menu-tile" type="button" data-pick="${r.key}">${icon(r.icon)}<span>${esc(r.label)}</span></button>`).join('')}
    </div>`,
    onMount: (el, close) => {
      el.querySelectorAll('[data-pick]').forEach((b) => b.addEventListener('click', () => {
        close();
        ctx.go(`#/${b.dataset.pick}`);
      }));
    },
  });
}

function openGlobalSearch() {
  let timer = null;
  openModal({
    title: 'Qidiruv',
    body: `<input class="input" id="gs" type="search" placeholder="Mahsulot, mijoz yoki yetkazib beruvchi nomi yoki telefoni" autofocus>
           <div id="gs-res" style="margin-top:12px"></div>`,
    onMount: (el, close) => {
      const input = el.querySelector('#gs');
      const res = el.querySelector('#gs-res');
      input.addEventListener('input', () => {
        clearTimeout(timer);
        timer = setTimeout(async () => {
          const q = input.value.trim();
          if (q.length < 2) { res.innerHTML = ''; return; }
          try {
            const r = await get(`/search?q=${encodeURIComponent(q)}`);
            const rows = [
              ...r.products.map((p) => ({ k: 'products', id: p.id, t: p.name, s: `Qoldiq: ${num(p.stock_qty, 4)} | ${money(p.selling_price)}`, tag: 'Mahsulot' })),
              ...r.customers.map((c) => ({ k: 'customers', id: c.id, t: c.name, s: c.phone || '', tag: 'Mijoz' })),
              ...r.suppliers.map((s) => ({ k: 'suppliers', id: s.id, t: s.name, s: s.phone || '', tag: "Yetkazib beruvchi" })),
            ];
            res.innerHTML = rows.length
              ? `<div class="list">${rows.map((x) => `
                  <div class="list-item" data-target="#/${x.k}/${x.id}">
                    <div class="meta"><div class="name">${esc(x.t)}</div><div class="sub">${esc(x.s)}</div></div>
                    <span class="badge badge-info">${esc(x.tag)}</span>
                  </div>`).join('')}</div>`
              : '<div class="empty">Hech narsa topilmadi</div>';
            res.querySelectorAll('[data-target]').forEach((row) => row.addEventListener('click', () => {
              close();
              ctx.go(row.dataset.target);
            }));
          } catch (err) {
            errorToast(err);
          }
        }, 250);
      });
    },
  });
}

async function logout() {
  try {
    await post('/auth/logout', {});
  } finally {
    state.user = null;
    location.hash = '';
    $('#app').hidden = true;
    closeModal();
    await showAuth(false);
  }
}

// ---------- Marshrutlash ----------

async function route() {
  if (!state.user) return;
  const { key, id, sub, query, raw } = parseHash();
  const current = ROUTES.find((r) => r.key === key);
  if (!current || !routeAllowed(current)) {
    if (current) toast("Bu bo'limga kirish uchun ruxsatingiz yo'q", 'warn');
    ctx.go(`#/${firstAllowedRoute().key}`);
    return;
  }
  closeModal();
  renderNav(current.key);
  renderShellTitle(current.label);
  const page = $('#page');
  page.innerHTML = '<div class="empty">Yuklanmoqda...</div>';
  try {
    const mod = await current.load();
    window.scrollTo(0, 0);
    await mod.render(page, { key, id, sub, query, raw }, ctx);
  } catch (err) {
    console.error(err);
    page.innerHTML = `<div class="alert alert-bad">${esc(err.message || 'Xatolik')}</div>`;
  }
}

// ---------- Boshlash ----------

async function bootShell() {
  hideAuth();
  $('#boot').hidden = true;
  state.settings = await get('/settings').then((r) => r.settings).catch(() => ({}));
  buildShell();
  $('#app').hidden = false;
  document.title = `${state.settings.store_name || 'OMBOR PRO'} - OMBOR PRO`;
  if (parseHash().key) {
    route();
  } else {
    ctx.go(`#/${firstAllowedRoute().key}`);
  }
}

onUnauthorized(() => {
  if (state.user) {
    state.user = null;
    $('#app').hidden = true;
    closeModal();
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
