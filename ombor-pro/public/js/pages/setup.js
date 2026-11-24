// Do'konni sozlash — bosqichma-bosqich. Ikki joyda ishlatiladi:
//   • Ro'yxatdan o'tishda (yangi do'kon ochish, menyusiz to'liq ekran):
//       1) Do'kon turi  2) Xodimlar soni  3) Manzil  4) Do'kon ma'lumotlari va logotip  5) Login va parol → do'kon ochiladi
//   • Keyin ilova ichida «Sozlamalar»dan o'zgartirish: 1–4 bir xil, 5) Asosiy sozlamalar
// Tanlangan turga mos turkumlar va o'lchov birliklari avtomatik qo'shiladi, tovar formasi shu turga moslashadi.
import { get, post, put, esc, icon, toast, errorToast, withBusy, uploadLogo, storeTypes, logoSvg } from '../ui.js';
import { REGIONS, REGION_NAMES } from '../regions.js';

const EMPLOYEES = [
  { key: '1', title: "Faqat o'zim", hint: "Do'konni o'zim yuritaman" },
  { key: '2-5', title: '2–5 kishi', hint: 'Kichik jamoa' },
  { key: '6-15', title: '6–15 kishi', hint: "O'rta do'kon" },
  { key: '16+', title: "16 va undan ko'p", hint: "Katta do'kon yoki bir nechta smena" },
];
const UNIT_LABEL = {
  piece: 'dona', kg: 'kilogramm', g: 'gramm', t: 'tonna', m: 'metr', l: 'litr', ml: 'millilitr', roll: 'rulon',
  set: "to'plam", bag: 'qop', pair: 'juft', m2: 'kv. metr', m3: 'kub metr', box: 'quti', pack: 'pachka',
};

// Login taklifi: do'kon nomidan (masalan «Atlas mato» → atlas_mato)
const slug = (name) => String(name || '').toLowerCase()
  .replace(/[ʻʼ'`’‘]/g, '')
  .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
  .slice(0, 30);

// mode: 'edit' — ilova ichida; 'register' — yangi do'kon ochish; 'first' — tizimdagi birinchi do'kon
function wizard(root, { mode, types, fields, cur, ctx = null, onLogin = null, onLoginPage = null }) {
  const signup = mode !== 'edit';
  const first = signup || !cur.setup_done;
  const STEPS = ["Do'kon turi", 'Xodimlar', 'Manzil', "Do'kon", signup ? 'Login va parol' : 'Sozlamalar'];
  const st = {
    step: 0,
    types: [...(cur.store_types || [])],
    employees: cur.employee_count || '',
    region: cur.region || '',
    district: cur.district || '',
    name: cur.store_name && cur.store_name !== "Mening do'konim" ? cur.store_name : (cur.store_name || ''),
    phone: cur.store_phone || '',
    address: cur.store_address || '',
    footer: cur.receipt_footer || 'Xaridingiz uchun rahmat!',
    lowStock: cur.notify_low_stock !== false,
    costing: cur.costing_method || 'FIFO',
    logoFile: null,
    logoUrl: cur.logo_path || '',
    owner: '',
    username: '',
    password: '',
    password2: '',
    showPass: false,
    done: null,
  };
  const typeBy = (k) => types.find((t) => t.key === k);

  function progress() {
    return `<ol class="su-steps" aria-label="Bosqichlar">${STEPS.map((s, i) => `
      <li class="${i < st.step ? 'done' : i === st.step ? 'cur' : ''}"><span>${i < st.step ? icon('check', 'ico-xs') : i + 1}</span><b>${esc(s)}</b></li>`).join('')}</ol>
      <div class="su-bar"><i style="width:${((st.step + 1) / STEPS.length) * 100}%"></i></div>`;
  }

  function stepTypes() {
    return `
      <h2 class="su-q">Do'koningizda nima sotiladi?</h2>
      <p class="su-sub">Bir nechtasini tanlashingiz mumkin. Shunga qarab turkumlar, o'lchov birliklari va tovar qo'shish formasi moslashadi.</p>
      <div class="su-types" role="group" aria-label="Do'kon turi">${types.map((t) => `
        <button type="button" class="su-type${st.types.includes(t.key) ? ' on' : ''}" data-type="${t.key}" aria-pressed="${st.types.includes(t.key)}">
          <span class="su-ti">${icon(t.icon)}</span>
          <span class="su-tt"><b>${esc(t.label)}</b><small>${esc(t.hint)}</small></span>
          <span class="su-check">${icon('check', 'ico-xs')}</span>
        </button>`).join('')}</div>`;
  }

  function stepEmployees() {
    return `
      <h2 class="su-q">Do'koningizda nechta kishi ishlaydi?</h2>
      <p class="su-sub">Sotuvchilar uchun alohida login va ruxsatlarni keyin «Xodimlar» bo'limida berasiz.</p>
      <div class="su-opts">${EMPLOYEES.map((e) => `
        <button type="button" class="su-opt${st.employees === e.key ? ' on' : ''}" data-emp="${e.key}" aria-pressed="${st.employees === e.key}">
          <span class="su-oi">${icon(e.key === '1' ? 'user' : 'users')}</span><b>${esc(e.title)}</b><small>${esc(e.hint)}</small></button>`).join('')}</div>`;
  }

  function stepPlace() {
    const list = REGIONS[st.region] || [];
    return `
      <h2 class="su-q">Do'koningiz qayerda joylashgan?</h2>
      <p class="su-sub">Chekda va hisobotlarda manzil ko'rinadi.</p>
      <div class="form-grid two">
        <label class="field"><span>Viloyat</span>
          <select class="input input-lg" id="su-region"><option value="">— tanlang —</option>${REGION_NAMES.map((r) => `<option ${r === st.region ? 'selected' : ''}>${esc(r)}</option>`).join('')}</select></label>
        <label class="field"><span>Tuman yoki shahar</span>
          <input class="input input-lg" id="su-district" list="su-districts" value="${esc(st.district)}" placeholder="${list.length ? 'Tanlang yoki yozing' : 'Avval viloyatni tanlang'}" autocomplete="off">
          <datalist id="su-districts">${list.map((d) => `<option value="${esc(d)}">`).join('')}</datalist></label>
        <label class="field" style="grid-column:1/-1"><span>Manzil <small>(ko'cha, uy, mo'ljal)</small></span>
          <input class="input input-lg" id="su-address" maxlength="200" value="${esc(st.address)}" placeholder="Masalan: Bunyodkor ko'chasi 12, Chorsu bozori yonida"></label>
      </div>`;
  }

  function stepStore() {
    return `
      <h2 class="su-q">Do'kon ma'lumotlari</h2>
      <p class="su-sub">Nomi va telefoni chekda chiqadi. Logotip ixtiyoriy.</p>
      <div class="su-store">
        <label class="su-logo${st.logoUrl ? ' has' : ''}" title="Logotip tanlash">
          ${st.logoUrl ? `<img src="${esc(st.logoUrl)}" alt="Logotip">` : `${icon('image')}<span>Logotip</span>`}
          <input type="file" accept="image/*" id="su-logo" aria-label="Logotip">
        </label>
        <div class="form-grid" style="flex:1;min-width:0">
          <label class="field"><span>Do'kon nomi <span class="req">*</span></span>
            <input class="input input-lg" id="su-name" maxlength="100" value="${esc(st.name)}" placeholder="Masalan: Baraka savdo" autocomplete="off"></label>
          <label class="field"><span>Telefon</span>
            <input class="input input-lg" id="su-phone" maxlength="30" inputmode="tel" value="${esc(st.phone)}" placeholder="+998 90 123 45 67"></label>
        </div>
      </div>
      <label class="field"><span>Chek pastidagi yozuv</span>
        <input class="input" id="su-footer" maxlength="200" value="${esc(st.footer)}" placeholder="Xaridingiz uchun rahmat!"></label>`;
  }

  function preview() {
    const picked = st.types.map(typeBy).filter(Boolean);
    const cats = [...new Set(picked.flatMap((t) => t.categories))];
    const units = [...new Set(picked.flatMap((t) => t.units))];
    const fieldKeys = [...new Set(picked.flatMap((t) => t.fields))];
    return `
      <div class="su-preview">
        <h3>${icon('sparkles', 'ico-sm')} Sizga tayyorlab qo'yamiz</h3>
        ${cats.length ? `<div><span>Turkumlar</span><div class="chips">${cats.map((c) => `<span class="chip">${esc(c)}</span>`).join('')}</div></div>` : ''}
        <div><span>O'lchov birliklari</span><div class="chips">${units.map((u) => `<span class="chip">${esc(UNIT_LABEL[u] || u)}</span>`).join('')}</div></div>
        ${fieldKeys.length ? `<div><span>Tovar qo'shishda qo'shimcha maydonlar</span><div class="chips">${fieldKeys.map((k) => `<span class="chip">${esc(fields[k]?.label || k)}</span>`).join('')}</div></div>` : ''}
        ${picked.some((t) => t.variants || t.colors) ? `<div><span>Kiyim va poyabzal</span><p class="small muted" style="margin:0">O'lcham va rang bo'yicha qoldiq alohida hisoblanadi</p></div>` : ''}
      </div>`;
  }

  function stepAccount() {
    return `
      <h2 class="su-q">Kirish uchun login va parol</h2>
      <p class="su-sub">Shu login va parol bilan telefon, planshet yoki kompyuterdan kirasiz — ma'lumotlar hamma joyda bir xil.</p>
      <div class="form-grid two">
        <label class="field" style="grid-column:1/-1"><span>Ismingiz <span class="req">*</span> <small>(do'kon egasi)</small></span>
          <input class="input input-lg" id="su-owner" maxlength="100" autocomplete="name" placeholder="Ism va familiya"></label>
        <label class="field" style="grid-column:1/-1"><span>Login <span class="req">*</span></span>
          <input class="input input-lg" id="su-user" maxlength="50" autocomplete="username" autocapitalize="none" spellcheck="false" placeholder="masalan: baraka_dokon">
          <small>Lotin harflari, raqam, nuqta yoki pastki chiziq — kamida 3 belgi. Bu login boshqa hech kimda bo'lmasligi kerak</small></label>
        <label class="field"><span>Parol <span class="req">*</span></span>
          <input class="input input-lg" id="su-pass" type="${st.showPass ? 'text' : 'password'}" autocomplete="new-password" placeholder="Kamida 6 belgi"></label>
        <label class="field"><span>Parolni takrorlang <span class="req">*</span></span>
          <input class="input input-lg" id="su-pass2" type="${st.showPass ? 'text' : 'password'}" autocomplete="new-password" placeholder="Xuddi shu parol"></label>
        <label class="check su-show"><input type="checkbox" id="su-showpass" ${st.showPass ? 'checked' : ''}> Parolni ko'rsatish</label>
      </div>
      <p class="su-note">${icon('info', 'ico-xs')} Valyuta — so'm. Kam qolgan tovar haqida ogohlantirish yoqilgan. Bularni keyin «Sozlamalar»da o'zgartirasiz.</p>
      ${preview()}`;
  }

  function stepSettings() {
    return `
      <h2 class="su-q">Asosiy sozlamalar</h2>
      <p class="su-sub">Hammasini keyin «Sozlamalar» bo'limida o'zgartirish mumkin.</p>
      <div class="su-set">
        <div class="setting-row"><div><b>Valyuta</b><p>Barcha narx va hisob-kitoblar o'zbek so'mida</p></div><span class="badge badge-info">so'm (UZS)</span></div>
        <div class="setting-row"><div><b>Kam qolgan tovar haqida ogohlantirish</b><p>Tovar belgilangan miqdordan kamaysa, bildirishnoma keladi</p></div>
          <label class="switch"><input type="checkbox" id="su-low" ${st.lowStock ? 'checked' : ''}><span class="track"></span></label></div>
        <div class="setting-row stack-sm"><div><b>Foydani hisoblash usuli</b><p>Odatda «avval kelgan avval sotiladi» to'g'ri keladi</p></div>
          <select class="input" id="su-cost"><option value="FIFO" ${st.costing === 'FIFO' ? 'selected' : ''}>Avval kelgan — avval sotiladi</option><option value="WAVG" ${st.costing === 'WAVG' ? 'selected' : ''}>O'rtacha narx bo'yicha</option></select></div>
      </div>
      ${preview()}`;
  }

  function stepDone() {
    const d = st.done;
    return `
      <div class="su-done">
        <span class="su-done-ico">${icon('check')}</span>
        <h2>Hammasi tayyor!</h2>
        <p>«${esc(st.name)}» ${signup ? 'ochildi' : 'sozlandi'}${d.categories ? `: ${d.categories} ta turkum qo'shildi` : ''}. Endi birinchi tovaringizni qo'shing — keyin sotishni boshlaysiz.</p>
        ${signup ? `<div class="su-login-card">${icon('user', 'ico-sm')}<div><span>Kirish uchun login</span><b>${esc(st.username)}</b></div></div>` : ''}
        <div class="su-done-acts">
          ${!ctx || ctx.can('products.manage') ? `<a class="btn btn-lg" href="#/products/new" data-go>${icon('box')} Birinchi tovarni qo'shish</a>` : ''}
          <a class="btn btn-lg btn-light" href="#/products" data-go data-import>${icon('xlsx')} Excel'dan yuklash</a>
          <a class="btn btn-lg btn-ghost" href="#/dashboard" data-go>Bosh sahifaga o'tish</a>
        </div>
      </div>`;
  }

  function draw() {
    const top = signup ? `
        <div class="su-top">
          <div class="su-brand"><span class="mark">${icon('layers')}</span><b>OMBOR PRO</b></div>
          ${onLoginPage && !st.done ? `<div class="su-have"><span>Hisobingiz bormi?</span> <button type="button" class="link-btn" id="su-login">Kirish</button></div>` : ''}
        </div>` : '';
    if (st.done) {
      root.innerHTML = `<div class="su-wrap${signup ? ' su-signup' : ''}">${top}${stepDone()}</div>`;
      root.querySelector('[data-import]')?.addEventListener('click', () => { try { sessionStorage.setItem('ombor.import', '1'); } catch { /* */ } });
      // Ro'yxatdan o'tgandan keyin ilova hali yuklanmagan — tanlangan sahifa bilan to'liq ochiladi
      if (signup) {
        root.querySelectorAll('[data-go]').forEach((a) => a.addEventListener('click', (e) => {
          e.preventDefault();
          location.hash = a.getAttribute('href');
          location.reload();
        }));
      }
      return;
    }
    const body = [stepTypes, stepEmployees, stepPlace, stepStore, signup ? stepAccount : stepSettings][st.step]();
    root.innerHTML = `
      <div class="su-wrap${signup ? ' su-signup' : ''}">
        ${top}
        <div class="su-head">
          <div><div class="su-kicker">${signup ? "Yangi do'kon ochish — 2 daqiqa" : first ? "Xush kelibsiz! Do'koningizni 2 daqiqada sozlaymiz" : "Do'kon sozlamalari"}</div>
            <h1>${signup ? "Do'koningizni ochamiz" : first ? "Do'koningizni sozlaymiz" : "Do'kon turi va ma'lumotlari"}</h1></div>
          ${first ? '' : `<a class="btn btn-ghost btn-sm" href="#/settings">${icon('x', 'ico-sm')} Yopish</a>`}
        </div>
        ${progress()}
        <section class="card su-card">${body}<div id="su-err"></div></section>
        <div class="su-nav">
          ${st.step > 0 ? `<button class="btn btn-lg btn-light" type="button" id="su-back">${icon('back', 'ico-sm')} Orqaga</button>` : '<span></span>'}
          ${st.step < STEPS.length - 1
    ? `<button class="btn btn-lg" type="button" id="su-next">Davom etish ${icon('right', 'ico-sm')}</button>`
    : `<button class="btn btn-lg btn-success" type="button" id="su-finish">${icon('check', 'ico-sm')} ${signup ? "Do'konni ochish" : 'Saqlash va boshlash'}</button>`}
        </div>
      </div>`;
    if (signup && st.step === 4) {
      // Parol HTML ichiga yozilmaydi — faqat maydonga qo'yiladi
      const set = (id, v) => { const el = root.querySelector(id); if (el) el.value = v; };
      set('#su-owner', st.owner);
      set('#su-user', st.username || (slug(st.name).length >= 3 ? slug(st.name) : ''));
      set('#su-pass', st.password);
      set('#su-pass2', st.password2);
    }
    bind();
  }

  const err = (msg) => {
    const el = root.querySelector('#su-err');
    el.innerHTML = msg ? `<div class="alert alert-bad" style="margin-top:14px">${icon('alert', 'ico-sm')}<div>${esc(msg)}</div></div>` : '';
    if (msg) el.scrollIntoView({ block: 'center', behavior: 'smooth' });
  };

  function collect() {
    const v = (id) => root.querySelector(id)?.value ?? null;
    if (st.step === 2) {
      st.region = v('#su-region') ?? st.region;
      st.district = (v('#su-district') ?? st.district).trim();
      st.address = (v('#su-address') ?? st.address).trim();
    }
    if (st.step === 3) {
      st.name = (v('#su-name') ?? st.name).trim();
      st.phone = (v('#su-phone') ?? st.phone).trim();
      st.footer = (v('#su-footer') ?? st.footer).trim();
    }
    if (st.step === 4 && !signup) {
      st.lowStock = root.querySelector('#su-low')?.checked ?? st.lowStock;
      st.costing = v('#su-cost') || st.costing;
    }
    if (st.step === 4 && signup) {
      st.owner = (v('#su-owner') ?? st.owner).trim();
      st.username = (v('#su-user') ?? st.username).trim().toLowerCase();
      st.password = v('#su-pass') ?? st.password;
      st.password2 = v('#su-pass2') ?? st.password2;
    }
  }

  function validate() {
    if (st.step === 0 && !st.types.length) return "Kamida bitta do'kon turini tanlang";
    if (st.step === 1 && !st.employees) return 'Nechta kishi ishlashini tanlang';
    if (st.step === 3 && !st.name) return "Do'kon nomini yozing";
    if (st.step === 4 && signup) {
      if (!st.owner) return 'Ismingizni yozing';
      if (!/^[a-z0-9_.-]{3,50}$/.test(st.username)) return "Login faqat lotin harflari, raqam, nuqta yoki pastki chiziqdan iborat bo'lsin (kamida 3 belgi)";
      if (st.password.length < 6) return "Parol kamida 6 belgidan iborat bo'lsin";
      if (st.password !== st.password2) return 'Parollar bir xil emas — qaytadan yozing';
    }
    return '';
  }

  function bind() {
    root.querySelector('#su-login')?.addEventListener('click', () => onLoginPage());
    root.querySelector('#su-showpass')?.addEventListener('change', (e) => {
      collect();
      st.showPass = e.target.checked;
      root.querySelectorAll('#su-pass, #su-pass2').forEach((x) => { x.type = st.showPass ? 'text' : 'password'; });
    });
    root.querySelectorAll('.su-card input:not([type=file]):not([type=checkbox]):not([list])').forEach((x) => x.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      root.querySelector('#su-next, #su-finish')?.click();
    }));
    root.querySelectorAll('[data-type]').forEach((b) => b.addEventListener('click', () => {
      const k = b.dataset.type;
      st.types = st.types.includes(k) ? st.types.filter((x) => x !== k) : [...st.types, k];
      b.classList.toggle('on', st.types.includes(k));
      b.setAttribute('aria-pressed', String(st.types.includes(k)));
      err('');
    }));
    root.querySelectorAll('[data-emp]').forEach((b) => b.addEventListener('click', () => {
      st.employees = b.dataset.emp;
      root.querySelectorAll('[data-emp]').forEach((x) => { x.classList.toggle('on', x === b); x.setAttribute('aria-pressed', String(x === b)); });
      err('');
    }));
    root.querySelector('#su-region')?.addEventListener('change', (e) => {
      collect();
      st.region = e.target.value;
      if (!(REGIONS[st.region] || []).includes(st.district)) st.district = '';
      draw();
      root.querySelector('#su-district')?.focus();
    });
    root.querySelector('#su-logo')?.addEventListener('change', (e) => {
      const f = e.target.files[0];
      if (!f) return;
      collect();
      if (st.logoFile && st.logoUrl.startsWith('blob:')) URL.revokeObjectURL(st.logoUrl);
      st.logoFile = f;
      st.logoUrl = URL.createObjectURL(f);
      draw();
    });
    root.querySelector('#su-back')?.addEventListener('click', () => { collect(); st.step -= 1; draw(); window.scrollTo({ top: 0 }); });
    root.querySelector('#su-next')?.addEventListener('click', () => {
      collect();
      const m = validate();
      if (m) return err(m);
      st.step += 1;
      draw();
      window.scrollTo({ top: 0 });
      return undefined;
    });
    root.querySelector('#su-finish')?.addEventListener('click', (e) => withBusy(e.currentTarget, async () => {
      collect();
      if (signup) {
        const m = validate();
        if (m) return err(m);
        try {
          const r = await post(mode === 'first' ? '/setup' : '/auth/register', {
            store_types: st.types, employee_count: st.employees, region: st.region, district: st.district,
            store_name: st.name, store_phone: st.phone, store_address: st.address, receipt_footer: st.footer,
            full_name: st.owner, username: st.username, password: st.password,
          });
          st.password = '';
          st.password2 = '';
          onLogin?.(st.username);
          if (st.logoFile) {
            try { await uploadLogo(st.logoFile); } catch (e2) { toast(`Logotip yuklanmadi: ${e2.message}. Keyin «Sozlamalar»dan qo'shing`, 'warn'); }
          }
          st.done = { categories: r.categories || 0 };
          draw();
          window.scrollTo({ top: 0 });
        } catch (e2) {
          err(e2.message);
        }
        return undefined;
      }
      try {
        const r = await put('/setup', {
          store_types: st.types, employee_count: st.employees, region: st.region, district: st.district,
          store_name: st.name, store_phone: st.phone, store_address: st.address, receipt_footer: st.footer,
          notify_low_stock: st.lowStock, costing_method: st.costing,
        });
        if (st.logoFile) {
          try { await uploadLogo(st.logoFile); } catch (e2) { toast(`Logotip yuklanmadi: ${e2.message}. Keyin «Sozlamalar»dan qo'shing`, 'warn'); }
        }
        await ctx.reloadSettings();
        st.done = r;
        draw();
        window.scrollTo({ top: 0 });
      } catch (e2) {
        err(e2.message);
      }
      return undefined;
    }).catch(errorToast));
  }

  draw();
}

// Ilova ichida: «Sozlamalar» → do'kon turi va ma'lumotlarini o'zgartirish
export async function render(root, params, ctx) {
  const [{ types, fields }, cur] = await Promise.all([storeTypes(), get('/settings').then((r) => r.settings)]);
  wizard(root, { mode: 'edit', types, fields, cur, ctx });
}

// Ro'yxatdan o'tish — faqat 2 qadam: 1) hisob (do'kon nomi, ism, login, parol)  2) nima sotasiz (do'kon turi).
// Viloyat, telefon, logotip, xodimlar soni so'ralmaydi — keyin «Sozlamalar»da yoziladi.
export async function renderSignup(root, { first = false, onLogin, onLoginPage } = {}) {
  const { types } = await storeTypes();
  const st = { step: 0, name: '', owner: '', username: '', userTouched: false, password: '', show: false, types: [], done: false };

  const top = () => `
    <div class="su-top">
      <div class="su-brand"><span class="mark">${logoSvg()}</span><b>OMBOR PRO</b></div>
      ${onLoginPage && !st.done ? `<div class="su-have"><span>Hisobingiz bormi?</span> <button type="button" class="link-btn" id="su-login">Kirish</button></div>` : ''}
    </div>`;
  const steps = () => `<ol class="su2-steps" aria-label="Bosqichlar">
      <li class="${st.step === 0 ? 'cur' : 'done'}"><span>${st.step > 0 ? icon('check', 'ico-xs') : 1}</span>Hisob</li>
      <li class="${st.step === 1 ? 'cur' : ''}"><span>2</span>Nima sotasiz?</li>
    </ol>`;

  function stepAccount() {
    return `
      <h1 class="su2-h">Yangi do'kon ochish</h1>
      <p class="su2-sub">To'rtta maydon — va do'koningiz tayyor. Bepul.</p>
      <form id="su2" class="form-grid" novalidate autocomplete="on">
        <label class="field"><span>Do'kon nomi</span>
          <input class="input input-lg" id="su-name" maxlength="100" placeholder="Masalan: Baraka savdo" autocomplete="organization"></label>
        <label class="field"><span>Ismingiz</span>
          <input class="input input-lg" id="su-owner" maxlength="100" placeholder="Masalan: Alisher" autocomplete="name"></label>
        <label class="field"><span>Login <small>— kirishda yozasiz</small></span>
          <input class="input input-lg" id="su-user" maxlength="50" autocomplete="username" autocapitalize="none" spellcheck="false" placeholder="masalan: baraka">
          <small class="muted">Lotin harflari va raqamlar, kamida 3 ta</small></label>
        <label class="field"><span>Parol <small>— kamida 6 ta belgi</small></span>
          <span class="pw-wrap"><input class="input input-lg" id="su-pass" type="password" autocomplete="new-password" placeholder="Parol o'ylab toping"><button type="button" class="pw-eye" id="su-eye">Ko'rsatish</button></span></label>
        <div id="su-err"></div>
        <button class="btn btn-lg btn-block" type="submit">Davom etish ${icon('right', 'ico-sm')}</button>
      </form>`;
  }

  function stepTypes() {
    return `
      <h1 class="su2-h">Do'koningizda nima sotiladi?</h1>
      <p class="su2-sub">Bosing. Mahsulot qo'shish shunga moslashadi: kiyimda o'lcham, matoda metr va rulon, oziq-ovqatda kilogramm</p>
      <div class="su2-types" role="group" aria-label="Do'kon turi">${types.map((t) => `
        <button type="button" class="su2-type${st.types.includes(t.key) ? ' on' : ''}" data-type="${t.key}" aria-pressed="${st.types.includes(t.key)}">
          <span class="su2-ti">${icon(t.icon)}</span><b>${esc(t.label)}</b>
          <span class="su2-check" aria-hidden="true">${icon('check', 'ico-xs')}</span>
        </button>`).join('')}</div>
      <p class="small muted su2-note">Bir nechta narsa sotsangiz — hammasini belgilang. Keyin «Sozlamalar»da o'zgartirsa bo'ladi</p>
      <div id="su-err"></div>
      <div class="su2-nav">
        <button class="btn btn-lg btn-light" type="button" id="su-back">${icon('back', 'ico-sm')} Orqaga</button>
        <button class="btn btn-lg btn-success" type="button" id="su-finish">${icon('check', 'ico-sm')} Do'konni ochish</button>
      </div>`;
  }

  function stepDone() {
    return `
      <div class="su2-done">
        <span class="su-done-ico">${icon('check')}</span>
        <h1 class="su2-h">Do'koningiz tayyor!</h1>
        <p class="su2-sub">«${esc(st.name)}» ochildi. Endi mahsulotlaringizni kiriting — keyin sotasiz.</p>
        <div class="su-login-card">${icon('user', 'ico-sm')}<div><span>Kirish uchun loginingiz</span><b>${esc(st.username)}</b></div></div>
        <a class="btn btn-lg btn-block" href="#/dashboard" data-go>Boshlash ${icon('right', 'ico-sm')}</a>
      </div>`;
  }

  const err = (msg) => {
    const el = root.querySelector('#su-err');
    if (!el) return;
    el.innerHTML = msg ? `<div class="alert alert-bad">${icon('alert', 'ico-sm')}<div>${esc(msg)}</div></div>` : '';
  };

  function draw() {
    root.innerHTML = `<div class="su2">${top()}<section class="su2-card">${st.done ? stepDone() : `${steps()}${st.step === 0 ? stepAccount() : stepTypes()}`}</section></div>`;
    root.querySelector('#su-login')?.addEventListener('click', () => onLoginPage());
    if (st.done) {
      root.querySelector('[data-go]').addEventListener('click', (e) => { e.preventDefault(); location.hash = '#/dashboard'; location.reload(); });
      return;
    }
    if (st.step === 0) bindAccount();
    else bindTypes();
  }

  function bindAccount() {
    const $ = (id) => root.querySelector(id);
    // Parol HTML ichiga yozilmaydi — faqat maydonga qo'yiladi
    $('#su-name').value = st.name;
    $('#su-owner').value = st.owner;
    $('#su-user').value = st.username;
    $('#su-pass').value = st.password;
    $('#su-pass').type = st.show ? 'text' : 'password';
    $('#su-eye').textContent = st.show ? 'Yashirish' : "Ko'rsatish";
    $('#su-name').addEventListener('input', (e) => {
      st.name = e.target.value;
      // Login do'kon nomidan o'zi taklif qilinadi (o'zgartirilmagan bo'lsa)
      if (!st.userTouched) { st.username = slug(st.name); $('#su-user').value = st.username; }
    });
    $('#su-owner').addEventListener('input', (e) => { st.owner = e.target.value; });
    $('#su-user').addEventListener('input', (e) => { st.username = e.target.value.trim().toLowerCase(); st.userTouched = true; });
    $('#su-pass').addEventListener('input', (e) => { st.password = e.target.value; });
    $('#su-eye').addEventListener('click', () => {
      st.show = !st.show;
      $('#su-pass').type = st.show ? 'text' : 'password';
      $('#su-eye').textContent = st.show ? 'Yashirish' : "Ko'rsatish";
    });
    $('#su2').addEventListener('submit', (e) => {
      e.preventDefault();
      st.name = st.name.trim();
      st.owner = st.owner.trim();
      const fail = (m, id) => { err(m); $(id)?.focus(); };
      if (!st.name) return fail("Do'kon nomini yozing", '#su-name');
      if (!st.owner) return fail('Ismingizni yozing', '#su-owner');
      if (!/^[a-z0-9_.-]{3,50}$/.test(st.username)) return fail("Login faqat lotin harflari va raqamlardan bo'lsin, kamida 3 ta (masalan: baraka)", '#su-user');
      if (st.password.length < 6) return fail("Parol kamida 6 ta belgidan iborat bo'lsin", '#su-pass');
      st.step = 1;
      draw();
      window.scrollTo({ top: 0 });
      return undefined;
    });
    if (window.matchMedia('(min-width: 720px)').matches) $('#su-name').focus();
  }

  function bindTypes() {
    root.querySelectorAll('[data-type]').forEach((b) => b.addEventListener('click', () => {
      const k = b.dataset.type;
      st.types = st.types.includes(k) ? st.types.filter((x) => x !== k) : [...st.types, k];
      b.classList.toggle('on', st.types.includes(k));
      b.setAttribute('aria-pressed', String(st.types.includes(k)));
      err('');
    }));
    root.querySelector('#su-back').addEventListener('click', () => { st.step = 0; draw(); });
    root.querySelector('#su-finish').addEventListener('click', (e) => withBusy(e.currentTarget, async () => {
      if (!st.types.length) return err("Kamida bittasini bosing — masalan, «Oziq-ovqat do'koni»");
      try {
        await post(first ? '/setup' : '/auth/register', {
          store_types: st.types, store_name: st.name, full_name: st.owner, username: st.username, password: st.password,
          receipt_footer: 'Xaridingiz uchun rahmat!',
        });
        st.password = '';
        onLogin?.(st.username);
        st.done = true;
        draw();
        window.scrollTo({ top: 0 });
      } catch (e2) {
        // Login band bo'lsa — birinchi qadamga qaytib, loginni o'zgartirish so'raladi
        if (e2.status === 409 && /login/i.test(e2.message)) {
          st.step = 0;
          draw();
          err(e2.message);
          root.querySelector('#su-user')?.focus();
        } else err(e2.message);
      }
      return undefined;
    }).catch(errorToast));
  }

  draw();
}
