// OMBOR PRO - asosiy ilova: kirish, tuzilma (yon panel, yuqori panel), marshrutlar, bildirishnomalar
import {
  icon, esc, get, post, onUnauthorized, openModal, closeModal, toast, errorToast, num, money,
  openPopover, closePopover, initials, timeAgo, confirmBox, skeletonPage, logoSvg,
} from './ui.js';

// Marshrut -> sahifa moduli
const ROUTES = {
  dashboard: { perms: ['dashboard.view'], load: () => import('./pages/dashboard.js') },
  analytics: { perms: ['reports.view'], load: () => import('./pages/dashboard.js') },
  assistant: { perms: ['dashboard.view', 'reports.view'], load: () => import('./pages/assistant.js') },
  notifications: { perms: [], load: () => import('./pages/notifications.js') },
  sales: { perms: ['sales.create', 'sales.view'], load: () => import('./pages/sales.js') },
  products: { perms: ['products.view'], load: () => import('./pages/products.js') },
  purchases: { perms: ['purchases.view', 'purchases.create'], load: () => import('./pages/purchases.js') },
  stockin: { perms: ['purchases.create'], load: () => import('./pages/stockin.js') },
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
  setup: { perms: ['settings.manage'], load: () => import('./pages/setup.js') },
  platform: { perms: [], load: () => import('./pages/platform.js') },
};

// Menyu: 11 ta bo'lim — har biri bitta ish. Kam ishlatiladiganlari bo'lim ichida yorliq bo'lib turadi.
//   short — telefondagi pastki menyu uchun qisqa nom; tip — sichqoncha ustiga kelganda tushuntirish;
//   tabs — bo'lim ichidagi yorliqlar (sahifa tepasida ko'rinadi), solo — 1 kishilik do'konda yashiriladi,
//   onlyActive — menyuda ko'rinmaydi, faqat o'sha sahifa ochilganda yorliq bo'lib chiqadi; sep — oldidan chiziq.
const SECTIONS = [
  {
    id: 'dashboard', label: 'Bosh sahifa', short: 'Bosh', icon: 'dashboard', tip: "Bugun qancha sotildi, qancha foyda va nima qilish kerak",
    tabs: [{ label: 'Bosh sahifa', href: '#/dashboard', route: 'dashboard', match: (p) => p.key === 'dashboard' }],
  },
  {
    id: 'sale', label: 'Sotuv', short: 'Sotuv', icon: 'cart', tip: 'Xaridorga sotish',
    tabs: [{ label: 'Sotuv', href: '#/sales', route: 'sales', perms: ['sales.create'], match: (p) => p.key === 'sales' && p.id !== 'history' }],
  },
  {
    id: 'history', label: 'Sotuvlar tarixi', short: 'Tarix', icon: 'receipt', tip: 'Bugungi va oldingi cheklar, qaytarish',
    tabs: [{ label: 'Sotuvlar tarixi', href: '#/sales/history', route: 'sales', perms: ['sales.view', 'sales.create'], match: (p) => p.key === 'sales' && p.id === 'history' }],
  },
  {
    id: 'stockin', label: 'Tovar kiritish', short: 'Kiritish', icon: 'truck', tip: "Kelgan tovarni omborga kiritish — har biri 10 soniya", sep: true,
    tabs: [
      { label: 'Tez kiritish', href: '#/stockin', route: 'stockin', match: (p) => p.key === 'stockin' },
      { label: "Ko'p tovar bitta yuk", href: '#/purchases/new', route: 'purchases', perms: ['purchases.create'], match: (p) => p.key === 'purchases' && p.id === 'new' },
      { label: 'Kelgan yuklar', href: '#/purchases', route: 'purchases', perms: ['purchases.view'], match: (p) => p.key === 'purchases' && p.id !== 'new' },
    ],
  },
  {
    id: 'products', label: 'Mahsulotlar', short: 'Mahsulot', icon: 'box', tip: "Mahsulotlar ro'yxati, narxlari va rasmlari",
    tabs: [{ label: 'Mahsulotlar', href: '#/products', route: 'products', match: (p) => p.key === 'products' }],
  },
  {
    id: 'stock', label: 'Ombor', short: 'Ombor', icon: 'warehouse', tip: 'Qolgan mahsulot, harakatlar tarixi va mahsulotlarni sanash',
    tabs: [
      { label: 'Qolgan mahsulot', href: '#/stock', route: 'stock', perms: ['stock.view'], match: (p) => p.key === 'stock' && !['counts', 'discrepancies'].includes(p.query.tab) && p.id !== 'count' },
      { label: 'Mahsulotlarni sanash', href: '#/stock?tab=counts', route: 'stock', perms: ['stock.count', 'stock.approve'], match: (p) => p.key === 'stock' && (['counts', 'discrepancies'].includes(p.query.tab) || p.id === 'count') },
    ],
  },
  {
    id: 'expenses', label: 'Xarajatlar', short: 'Xarajat', icon: 'expense', tip: "Ijara, obed, yo'l kabi xarajatlar va kassadagi pul", sep: true,
    tabs: [
      { label: 'Xarajatlar', href: '#/cash?tab=expenses', route: 'cash', perms: ['expenses.view', 'reports.view'], match: (p) => p.key === 'cash' && p.query.tab === 'expenses' },
      { label: 'Kassadagi pul', href: '#/cash?tab=cash', route: 'cash', perms: ['cash.view', 'cash.shift'], match: (p) => p.key === 'cash' && p.query.tab !== 'expenses' },
    ],
  },
  {
    id: 'debts', label: 'Mijozlar va qarzlar', short: 'Qarzlar', icon: 'debt', tip: "Kim qancha qarz, nasiyalar va mijozlar ro'yxati",
    tabs: [
      { label: 'Qarzlar', href: '#/debts', route: 'debts', match: (p) => p.key === 'debts' },
      { label: 'Mijozlar', href: '#/customers', route: 'customers', match: (p) => p.key === 'customers' },
    ],
  },
  {
    id: 'suppliers', label: 'Yetkazib beruvchilar', short: 'Ta\'minot', icon: 'store', tip: "Tovar kimdan keladi, ularga qancha qarzingiz bor",
    tabs: [{ label: 'Yetkazib beruvchilar', href: '#/suppliers', route: 'suppliers', match: (p) => p.key === 'suppliers' }],
  },
  {
    id: 'reports', label: 'Hisobotlar', short: 'Hisobot', icon: 'table', tip: "Foyda, savdo, grafiklar va maslahatlar. Excel va PDF", sep: true,
    tabs: [
      { label: 'Hisobotlar', href: '#/reports', route: 'reports', match: (p) => p.key === 'reports' },
      { label: 'Grafiklar', href: '#/analytics', route: 'analytics', match: (p) => p.key === 'analytics' },
      { label: 'Maslahatlar', href: '#/assistant', route: 'assistant', match: (p) => p.key === 'assistant' },
      { label: 'Xodimlar natijasi', href: '#/staff', route: 'staff', solo: true, match: (p) => p.key === 'staff' },
    ],
  },
  {
    id: 'settings', label: 'Sozlamalar', short: 'Sozlamalar', icon: 'gear', tip: "Do'kon, xodimlar, kim nima qilgani, bildirishnomalar, parol",
    tabs: [
      { label: "Do'kon", href: '#/settings', route: 'settings', match: (p) => p.key === 'settings' || p.key === 'setup' },
      { label: 'Xodimlar', href: '#/employees', route: 'employees', match: (p) => p.key === 'employees' },
      { label: 'Amallar tarixi', href: '#/history', route: 'history', match: (p) => p.key === 'history' },
      { label: 'Bildirishnomalar', href: '#/notifications', route: 'notifications', match: (p) => p.key === 'notifications' },
      { label: 'AI tariflari', href: '#/platform', route: 'platform', admin: true, match: (p) => p.key === 'platform' },
    ],
  },
];

// Faqat yuqori paneldagi qo'ng'iroqcha orqali ochiladigan sahifalar (sarlavha uchun)
const EXTRA_TITLES = { notifications: 'Bildirishnomalar', setup: "Do'konni sozlash" };

// Telefondagi pastki menyu: Bosh, Sotuv, Kiritish, Mahsulot, Menyu («+ Qo'shish» — yuqori panelda)
const MOBILE = ['dashboard', 'sale', 'stockin', 'products'];

// "+ Qo'shish" menyusi: har sahifadan bir bosishda yangi yozuv (faqat ruxsat berilganlari ko'rinadi)
const QUICK = [
  { label: 'Sotuv', hint: 'Xaridorga tovar sotish', icon: 'cart', href: '#/sales', perms: ['sales.create'] },
  { label: 'Tovar kiritish', hint: 'Kelgan tovarni omborga', icon: 'truck', href: '#/stockin', perms: ['purchases.create'] },
  { label: 'Yangi mahsulot', hint: 'Nomi, narxi, rasmi', icon: 'box', href: '#/products/new', perms: ['products.manage'] },
  { label: 'Qarz yozish', hint: 'Daftardagi eski qarz', icon: 'debt', href: '#/debts?new=1', perms: ['customers.manage'], route: 'debts' },
  { label: 'Xarajat', hint: 'Ijara, maosh, kommunal', icon: 'expense', href: '#/cash?tab=expenses&new=1', perms: ['expenses.manage'], route: 'cash' },
  { label: 'Mijoz', hint: 'Xaridor (nasiya uchun)', icon: 'users', href: '#/customers?new=1', perms: ['customers.manage'] },
  { label: 'Xodim', hint: 'Sotuvchi uchun login', icon: 'userCog', href: '#/employees?new=1', perms: ['employees.manage'] },
];
const quickActions = () => QUICK.filter((a) => ctx.canAny(a.perms) && routeAllowed(a.route || a.href.slice(2).split(/[/?]/)[0]));

const ROLE_LABELS = { owner: 'Egasi', administrator: 'Administrator', cashier: 'Kassir', warehouse: 'Ombor xodimi', accountant: 'Buxgalter' };

const state = { user: null, settings: {}, unread: 0, notif: null, pollTimer: null, platformAdmin: false };

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
    const markEl = document.querySelector('.sb-brand .brand-mark');
    if (markEl) markEl.outerHTML = brandMark();
    document.title = `${state.settings.store_name || 'OMBOR PRO'} · OMBOR PRO`;
  },
  setUnread(n) { setBadge(n); },
  refreshNotifications: () => pollNotifications(false),
};

// Bo'lim ichidagi yorliq ochiq bo'ladimi (ruxsat va do'kon turi bo'yicha)
const tabAllowed = (t) => {
  if (t.solo && state.settings.employee_count === '1') return false;
  if (t.admin && !state.platformAdmin) return false;
  const route = ROUTES[t.route];
  if (!route) return false;
  const perms = t.perms || route.perms;
  return perms.length === 0 || ctx.canAny(perms);
};
const sectionTabs = (sec, p = null) => sec.tabs.filter((t) => tabAllowed(t) && (!t.onlyActive || (p && t.match(p))));
// Bo'lim menyuda ko'rinadimi — ichida kamida bitta ochiq yorliq bo'lsa
const navAllowed = (sec) => sectionTabs(sec).length > 0;
const sectionHref = (sec) => sectionTabs(sec)[0]?.href || '#/dashboard';
const routeAllowed = (key) => {
  const r = ROUTES[key];
  return Boolean(r) && (r.perms.length === 0 || ctx.canAny(r.perms));
};
function firstAllowed() {
  for (const sec of SECTIONS) if (navAllowed(sec)) return sectionHref(sec);
  return '#/settings';
}

function parseHash() {
  const raw = location.hash.replace(/^#\/?/, '');
  const [pathPart, queryPart = ''] = raw.split('?');
  const [key = '', id = '', sub = ''] = pathPart.split('/');
  const query = Object.fromEntries(new URLSearchParams(queryPart));
  return { key, id, sub, query, raw };
}

// Joriy manzil qaysi bo'lim va qaysi yorliqqa tegishli
function activeNav(p) {
  for (const sec of SECTIONS) {
    const tab = sec.tabs.find((t) => t.match(p));
    if (tab) return { ...sec, tab };
  }
  return null;
}

const $ = (sel) => document.querySelector(sel);

// ---------- Kirish va birinchi sozlash ----------

// Shu qurilmada oxirgi kirgan login: chiqqandan keyin kirish oynasida tayyor turadi (parol saqlanmaydi)
const LAST_LOGIN = 'ombor.lastLogin';
const rememberLogin = (u) => { try { if (u) localStorage.setItem(LAST_LOGIN, String(u).trim().toLowerCase()); } catch { /* xotira yopiq */ } };
const lastLogin = () => { try { return localStorage.getItem(LAST_LOGIN) || ''; } catch { return ''; } };

async function showAuth(setupRequired) {
  $('#app').hidden = true;
  $('#boot').hidden = true;
  const root = document.getElementById('auth-root') || Object.assign(document.createElement('div'), { id: 'auth-root', className: 'auth' });
  if (!root.parentNode) document.body.appendChild(root);
  root.hidden = false;
  // setupRequired: true — birinchi do'kon; 'register' — yangi do'kon ochish; false — kirish
  const mode = setupRequired === true ? 'setup' : setupRequired === 'register' ? 'register' : 'login';
  root.className = mode === 'login' ? 'auth' : 'auth auth-wizard';
  if (mode === 'setup' || mode === 'register') {
    // Yangi do'kon: do'kon turi, xodimlar, manzil, do'kon ma'lumotlari va login-parol — bitta oqimda, menyusiz
    root.innerHTML = '<div class="su-loading"><span class="spinner"></span></div>';
    try {
      const { renderSignup } = await import('./pages/setup.js');
      await renderSignup(root, {
        first: mode === 'setup',
        onLogin: (u) => {
          rememberLogin(u);
          try { sessionStorage.setItem('ombor.welcome', '1'); } catch { /* xotira yopiq */ }
        },
        onLoginPage: mode === 'register' ? () => showAuth(false) : null,
      });
    } catch (err) {
      root.innerHTML = `<div class="auth-card"><div class="alert alert-bad">${esc(err.message)}</div>
        <button class="btn btn-block" type="button" style="margin-top:12px" onclick="location.reload()">Qayta urinish</button></div>`;
    }
  } else {
    const known = lastLogin();
    // Ochilish harakati (qutilar tushadi) — shu brauzer oynasida faqat birinchi marta
    let intro = true;
    try { intro = sessionStorage.getItem('ombor.intro') !== '1'; sessionStorage.setItem('ombor.intro', '1'); } catch { /* xotira yopiq */ }
    root.className = `auth auth-split${intro ? ' intro' : ''}`;
    root.innerHTML = `
      <section class="auth-hero" aria-label="OMBOR PRO haqida">
        <div class="ah-brand">
          <span class="ah-logo">${logoSvg('logo-svg ah-svg')}</span>
          <div class="ah-name"><b>OMBOR PRO</b><span>Do'kon hisobi oddiy tilda</span></div>
        </div>
        <ul class="ah-points">
          <li>${icon('plus', 'ico-sm')}<span>Tovar keldi — nomini tanlab, sonini yozasiz. 10 soniya</span></li>
          <li>${icon('cart', 'ico-sm')}<span>Sotdingiz — ombordagi son va foyda o'zi hisoblanadi</span></li>
          <li>${icon('chart', 'ico-sm')}<span>Kechqurun bitta ekranda: bugun qancha sotdingiz, qancha qoldi</span></li>
        </ul>
        <div class="tape ah-tape" aria-hidden="true">
          <div class="between"><span>Sotuv</span><b class="num">1 480 000</b></div>
          <div class="between"><span>Xarid narxi</span><b class="num">−1 068 000</b></div>
          <div class="tape-rule"></div>
          <div class="between"><span>Bugungi foyda</span><b class="num pos">412 000 so'm</b></div>
        </div>
      </section>
      <div class="auth-card">
        <div class="auth-brand">
          <div class="mark">${logoSvg()}</div>
          <h1>${known ? 'Xush kelibsiz' : "Do'koningizga kiring"}</h1>
          <p>${known
    ? 'Parolingizni kiriting. «Chiqish» ni bosmaguningizcha qayta so\'ralmaydi'
    : "Login va parolni do'kon egasi beradi. Egasi bo'lsangiz — ro'yxatdan o'tgandagisini yozing"}</p>
        </div>
        <form id="login-form" class="form-grid" novalidate>
          <label class="field"><span>Login</span><input class="input input-lg" name="username" required autocomplete="username" autocapitalize="none" value="${esc(known)}"></label>
          <label class="field"><span>Parol</span><span class="pw-wrap"><input class="input input-lg" name="password" type="password" required autocomplete="current-password"><button type="button" class="pw-eye" data-eye aria-label="Parolni ko'rsatish">Ko'rsatish</button></span></label>
          <div id="form-error"></div>
          <button class="btn btn-lg btn-block" type="submit">Kirish</button>
        </form>
        <p class="auth-note">${icon('info', 'ico-xs')} Kassirlar faqat sotuvni ko'radi. Xarid narxi va foyda faqat egasiga ko'rinadi.</p>
        ${state.signup !== false ? `<div class="auth-divider">do'koningiz hali yo'qmi</div><button type="button" class="btn btn-outline btn-lg btn-block" data-mode="register">Yangi do'kon ochish — 2 daqiqa</button>` : ''}
      </div>`;
    root.querySelector('[data-eye]').addEventListener('click', (e) => {
      const inp = root.querySelector('[name="password"]');
      const show = inp.type === 'password';
      inp.type = show ? 'text' : 'password';
      e.currentTarget.textContent = show ? 'Yashirish' : "Ko'rsatish";
      e.currentTarget.setAttribute('aria-label', show ? 'Parolni yashirish' : "Parolni ko'rsatish");
    });
    root.querySelector('[data-mode="register"]')?.addEventListener('click', () => showAuth('register'));
    // Login tayyor bo'lsa — darhol parolga
    const focusEl = root.querySelector(known ? '[name="password"]' : '[name="username"]');
    if (window.matchMedia('(min-width: 720px)').matches) focusEl?.focus();
    root.querySelector('#login-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const d = Object.fromEntries(new FormData(e.currentTarget));
      const btn = e.currentTarget.querySelector('button[type=submit]');
      btn.disabled = true;
      try {
        await post('/auth/login', d);
        rememberLogin(d.username);
        // Sahifa to'liq qayta yuklanadi: oldingi hisob (boshqa do'kon bo'lishi mumkin) xotirasi qolmaydi
        location.reload();
        return;
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
        <button class="btn btn-sm quick-add" id="btn-add" type="button" aria-haspopup="menu" aria-label="Yangi qo'shish" hidden>${icon('plus', 'ico-sm')}<span>Qo'shish</span></button>
        <button class="searchbox" id="searchbox" type="button" aria-label="Qidiruv">${icon('search', 'ico-sm')}<span>Qidirish…</span><span class="kbd">Ctrl K</span></button>
        <button class="icon-btn" id="btn-search" type="button" aria-label="Qidiruv">${icon('search')}</button>
        <button class="ai-btn" id="btn-ai" type="button" aria-label="AI yordamchi: savol bering">${icon('sparkles', 'ico-sm')}<span>Savol bering</span></button>
        <button class="help-btn" id="btn-help" type="button" aria-label="Yordam: bu sahifa nima uchun">${icon('help', 'ico-sm')}<span>Yordam</span></button>
        <button class="icon-btn" id="btn-bell" type="button" aria-label="Bildirishnomalar">${icon('bell')}<span class="dot" hidden></span></button>
        <button class="icon-btn" id="btn-user" type="button" aria-label="Profil"><span class="avatar" style="width:28px;height:28px;font-size:11px"></span></button>
      </div>
    </header>
    <main class="content"><nav class="subnav no-print" id="subnav" aria-label="Bo'lim ichida" hidden></nav><div id="page"></div></main>
    <nav class="bottomnav" id="bottomnav" aria-label="Pastki menyu"></nav>`;
  $('#btn-menu').addEventListener('click', () => toggleDrawer(true));
  $('#btn-add').addEventListener('click', (e) => openQuickAdd(e.currentTarget));
  const showHelp = async () => {
    const { openHelp, helpKeyFor } = await import('./help.js');
    openHelp(helpKeyFor(parseHash()), SECTIONS.filter(navAllowed).map((sec) => ({ ...sec, href: sectionHref(sec) })));
  };
  $('#btn-help').addEventListener('click', showHelp);
  $('#btn-ai').addEventListener('click', async () => {
    const { openAi } = await import('./ai.js');
    openAi({ help: showHelp }).catch(errorToast);
  });
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
  style.textContent = '@media (min-width:1024px){#btn-user{display:none}} @media (max-width:419px){#btn-user{display:none}}';
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

// Yon menyudagi ikki katta tugma: eng ko'p qilinadigan ikki ish
function sbCtas() {
  const sale = ctx.can('sales.create');
  const buy = ctx.can('purchases.create');
  if (!sale && !buy) return '';
  return `<div class="sb-ctas${sale && buy ? '' : ' one'}">
      ${sale ? `<a class="sb-cta" href="#/sales">${icon('cart', 'ico-sm')}<span>Sotuv</span></a>` : ''}
      ${buy ? `<a class="sb-cta sb-cta-soft" href="#/stockin">${icon('plus', 'ico-sm')}<span>Tovar kiritish</span></a>` : ''}
    </div>`;
}

// Do'kon logotipi bo'lsa — o'sha, bo'lmasa OMBOR PRO belgisi
function brandMark() {
  const logo = state.settings.logo_path;
  return logo ? `<span class="brand-mark has-logo"><img src="${esc(logo)}" alt=""></span>` : `<span class="brand-mark">${logoSvg()}</span>`;
}

function renderNav(p) {
  const active = activeNav(p);
  const u = state.user;
  $('#sidebar').innerHTML = `
    <div class="sb-brand">
      ${brandMark()}
      <div class="names"><div class="product">OMBOR PRO</div><div class="store">${esc(state.settings.store_name || '')}</div></div>
    </div>
    ${sbCtas()}
    <nav class="sb-nav sb-flat">
      ${SECTIONS.filter(navAllowed).map((sec, i) => `${sec.sep && i ? '<div class="sb-sep" role="separator"></div>' : ''}<a class="nav-item${active?.id === sec.id ? ' active' : ''}" href="${sectionHref(sec)}" title="${esc(sec.tip || '')}" ${active?.id === sec.id ? 'aria-current="page"' : ''}>
        ${icon(sec.icon, 'ico-sm')}<span>${esc(sec.label)}</span></a>`).join('')}
    </nav>
    <button type="button" class="nav-item sb-help" id="sb-help">${icon('help', 'ico-sm')}<span>Yordam</span></button>
    <div class="sb-foot">
      <button class="user-chip" type="button" id="sb-user">
        <span class="avatar">${esc(initials(u.full_name))}</span>
        <span class="who"><b>${esc(u.full_name)}</b><span>${esc(ROLE_LABELS[u.role] || u.role)}</span></span>
        ${icon('more', 'ico-sm')}
      </button>
    </div>`;
  $('#sidebar').querySelectorAll('.nav-item, .sb-cta').forEach((a) => a.addEventListener('click', () => toggleDrawer(false)));
  $('#sb-help').addEventListener('click', () => $('#btn-help').click());
  $('#sb-user').addEventListener('click', (e) => openUserMenu(e.currentTarget, 'left'));
  $('#btn-user .avatar').textContent = initials(u.full_name);
  $('#btn-add').hidden = quickActions().length === 0;

  const mobile = MOBILE.map((id) => SECTIONS.find((sec) => sec.id === id)).filter((sec) => sec && navAllowed(sec));
  $('#bottomnav').innerHTML = `
    ${mobile.map((sec) => `<button type="button" data-href="${sectionHref(sec)}" class="${active?.id === sec.id ? 'active' : ''}" ${active?.id === sec.id ? 'aria-current="page"' : ''}>${icon(sec.icon)}<span>${esc(sec.short || sec.label)}</span></button>`).join('')}
    <button type="button" data-menu>${icon('menu')}<span>Menyu</span></button>`;
  $('#bottomnav').querySelectorAll('[data-href]').forEach((b) => b.addEventListener('click', () => { location.hash = b.dataset.href; }));
  $('#bottomnav [data-menu]').addEventListener('click', () => toggleDrawer(true));
  return active;
}

function openQuickAdd(anchor) {
  const items = quickActions();
  openPopover(anchor, `
    <div class="qa-menu" role="menu" aria-label="Yangi qo'shish">
      <div class="qa-title">Nimani qo'shmoqchisiz?</div>
      <div class="qa-grid">
        ${items.map((a) => `<a class="qa-item" role="menuitem" href="${a.href}">
          <span class="qa-ico">${icon(a.icon, 'ico-sm')}</span>
          <span class="qa-text"><b>${esc(a.label)}</b><span>${esc(a.hint)}</span></span></a>`).join('')}
      </div>
    </div>`, {
    onMount: (el, close) => {
      el.querySelectorAll('a').forEach((a) => a.addEventListener('click', () => {
        close();
        // Shu sahifaning o'zida bo'lsa ham oyna ochilsin
        if (location.hash === a.getAttribute('href')) setTimeout(route, 0);
      }));
      el.querySelector('a')?.focus();
    },
  });
}

function openUserMenu(anchor, align = 'right') {
  const u = state.user;
  openPopover(anchor, `
    <div class="menu-list">
      <div class="who"><b>${esc(u.full_name)}</b><span>${esc(ROLE_LABELS[u.role] || u.role)} · ${esc(u.username)}</span></div>
      <hr>
      <a href="#/notifications">${icon('bell', 'ico-sm')} Bildirishnomalar</a>
      <a href="#/notifications?tab=personal">${icon('sliders', 'ico-sm')} Shaxsiy sozlamalar</a>
      ${routeAllowed('staff') ? `<a href="#/staff">${icon('staff', 'ico-sm')} Mening natijalarim</a>` : ''}
      <a href="#/settings">${icon('key', 'ico-sm')} Parolni o'zgartirish</a>
      <hr>
      <button type="button" data-logout>${icon('logout', 'ico-sm')} Chiqish</button>
    </div>`, {
    align,
    onMount: (el, close) => {
      el.querySelectorAll('a').forEach((a) => a.addEventListener('click', () => { close(); toggleDrawer(false); }));
      el.querySelector('[data-logout]').addEventListener('click', async () => {
        close();
        toggleDrawer(false);
        // Chiqqandan keyin parol qayta so'raladi — tasodifiy bosishdan himoya
        if (await confirmBox("Hisobingizdan chiqasizmi? Keyingi safar parolni qayta kiritasiz.", { okText: 'Ha, chiqish' })) logout();
      });
    },
  });
}

function openGlobalSearch() {
  let timer = null;
  closePopover();
  openModal({
    title: 'Qidiruv',
    body: `<div class="search-input">${icon('search', 'ico-sm')}<input class="input" id="gs" type="search" placeholder="Tovar, mijoz yoki yetkazib beruvchi (nomi yoki telefoni)" autofocus></div>
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
              ...r.products.map((p) => ({ k: 'products', id: p.id, t: p.name, s: `Qoldiq: ${num(p.stock_qty, 3)} · ${money(p.selling_price)}`, tag: 'Tovar', ic: 'box' })),
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

const seenKey = () => `ombor.notif.seen.${state.user?.username}`;
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
    // Chiqishda sahifa qayta yuklanadi: keyingi kirgan hisob oldingisining xotirasini ko'rmaydi
    history.replaceState(null, '', location.pathname);
    location.reload();
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
  import('./ai.js').then((m) => m.closeAi()).catch(() => {});
  const active = renderNav(params);
  $('#page-title').textContent = active?.tab?.label || active?.label || EXTRA_TITLES[key] || '';
  renderSubnav(active, params);
  setBadge(state.unread);
  const page = $('#page');
  // page-in: sahifaning har bir yangi bo'limi yumshoq paydo bo'ladi (CSS animatsiya qo'shilganda bir marta ishlaydi)
  page.classList.add('page-in');
  page.innerHTML = skeletonPage({ cards: key === 'dashboard' ? 4 : 3, block: key !== 'sales' });
  try {
    const mod = await ROUTES[key].load();
    window.scrollTo(0, 0);
    await mod.render(page, params, ctx);
  } catch (err) {
    console.error(err);
    page.innerHTML = `<div class="alert alert-bad">${icon('alert', 'ico-sm')}<div>${esc(err.message || 'Xatolik')}</div></div>`;
  }
}

// Bo'lim ichidagi yorliqlar (masalan, Tovar kiritish: Tez kiritish · Ko'p tovar bitta yuk · Kelgan yuklar)
function renderSubnav(active, p) {
  const el = $('#subnav');
  const tabs = active ? sectionTabs(active, p) : [];
  if (tabs.length < 2) {
    el.hidden = true;
    el.innerHTML = '';
    return;
  }
  el.hidden = false;
  el.innerHTML = tabs.map((t) => {
    const on = t === active.tab;
    return `<a href="${t.href}" class="${on ? 'active' : ''}" ${on ? 'aria-current="page"' : ''}>${esc(t.label)}</a>`;
  }).join('');
}

// ---------- Boshlash ----------

async function bootShell() {
  hideAuth();
  $('#boot').hidden = true;
  state.settings = await get('/settings').then((r) => r.settings).catch(() => ({}));
  // Platforma egasi bo'lsa — Sozlamalarda «AI tariflari» yorlig'i ko'rinadi
  state.platformAdmin = Boolean((await get('/ai/status').catch(() => null))?.is_platform_admin);
  buildShell();
  $('#app').hidden = false;
  document.title = `${state.settings.store_name || 'OMBOR PRO'} · OMBOR PRO`;
  startPolling();
  // Yangi do'kon (hali tovar yo'q va sozlanmagan): avval bosqichma-bosqich sozlash
  let setupFirst = false;
  if (!state.settings.setup_done && ctx.can('settings.manage')) {
    const o = await get('/onboarding').catch(() => null);
    setupFirst = Boolean(o && !o.products && !o.sales);
  }
  if (setupFirst) ctx.go('#/setup');
  else if (parseHash().key) route();
  else ctx.go(firstAllowed());
  let welcome = false;
  try {
    welcome = sessionStorage.getItem('ombor.welcome') === '1';
    sessionStorage.removeItem('ombor.welcome');
  } catch { /* xotira yopiq */ }
  if (welcome) toast("Do'koningiz tayyor! «Do'koningizni ishga tushiring» qadamlaridan boshlang", 'ok');
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
    state.signup = status.signup !== false;
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
