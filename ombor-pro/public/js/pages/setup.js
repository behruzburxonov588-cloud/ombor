// Do'konni sozlash — bosqichma-bosqich (birinchi kirishda va keyin «Sozlamalar»dan):
//   1) Do'kon turi (bir nechtasi ham bo'ladi)  2) Xodimlar soni  3) Joylashuvi
//   4) Do'kon ma'lumotlari va logotip          5) Asosiy sozlamalar → natija
// Tanlangan turga mos turkumlar va o'lchov birliklari avtomatik qo'shiladi, tovar formasi shu turga moslashadi.
import { get, put, esc, icon, toast, errorToast, withBusy, uploadLogo, storeTypes } from '../ui.js';
import { REGIONS, REGION_NAMES } from '../regions.js';

const STEPS = ["Do'kon turi", 'Xodimlar', 'Manzil', "Do'kon", 'Sozlamalar'];
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

export async function render(root, params, ctx) {
  const [{ types, fields }, cur] = await Promise.all([storeTypes(), get('/settings').then((r) => r.settings)]);
  const first = !cur.setup_done;
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
        <label class="field"><span>Viloyat <span class="req">*</span></span>
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

  function stepSettings() {
    const picked = st.types.map(typeBy).filter(Boolean);
    const cats = [...new Set(picked.flatMap((t) => t.categories))];
    const units = [...new Set(picked.flatMap((t) => t.units))];
    const fieldKeys = [...new Set(picked.flatMap((t) => t.fields))];
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
      <div class="su-preview">
        <h3>${icon('sparkles', 'ico-sm')} Sizga tayyorlab qo'yamiz</h3>
        ${cats.length ? `<div><span>Turkumlar</span><div class="chips">${cats.map((c) => `<span class="chip">${esc(c)}</span>`).join('')}</div></div>` : ''}
        <div><span>O'lchov birliklari</span><div class="chips">${units.map((u) => `<span class="chip">${esc(UNIT_LABEL[u] || u)}</span>`).join('')}</div></div>
        ${fieldKeys.length ? `<div><span>Tovar qo'shishda qo'shimcha maydonlar</span><div class="chips">${fieldKeys.map((k) => `<span class="chip">${esc(fields[k]?.label || k)}</span>`).join('')}</div></div>` : ''}
        ${picked.some((t) => t.variants || t.colors) ? `<div><span>Kiyim va poyabzal</span><p class="small muted" style="margin:0">O'lcham va rang bo'yicha qoldiq alohida hisoblanadi</p></div>` : ''}
      </div>`;
  }

  function stepDone() {
    const d = st.done;
    return `
      <div class="su-done">
        <span class="su-done-ico">${icon('check')}</span>
        <h2>Hammasi tayyor!</h2>
        <p>«${esc(st.name)}» sozlandi${d.categories ? `: ${d.categories} ta turkum qo'shildi` : ''}. Endi birinchi tovaringizni qo'shing — keyin sotishni boshlaysiz.</p>
        <div class="su-done-acts">
          ${ctx.can('products.manage') ? `<a class="btn btn-lg" href="#/products/new">${icon('box')} Birinchi tovarni qo'shish</a>` : ''}
          <a class="btn btn-lg btn-light" href="#/products" data-import>${icon('xlsx')} Excel'dan yuklash</a>
          <a class="btn btn-lg btn-ghost" href="#/dashboard">Bosh sahifaga o'tish</a>
        </div>
      </div>`;
  }

  function draw() {
    if (st.done) {
      root.innerHTML = `<div class="su-wrap">${stepDone()}</div>`;
      root.querySelector('[data-import]')?.addEventListener('click', () => { try { sessionStorage.setItem('ombor.import', '1'); } catch { /* */ } });
      return;
    }
    const body = [stepTypes, stepEmployees, stepPlace, stepStore, stepSettings][st.step]();
    root.innerHTML = `
      <div class="su-wrap">
        <div class="su-head">
          <div><div class="su-kicker">${first ? "Xush kelibsiz! Do'koningizni 2 daqiqada sozlaymiz" : "Do'kon sozlamalari"}</div>
            <h1>${first ? "Do'koningizni sozlaymiz" : "Do'kon turi va ma'lumotlari"}</h1></div>
          ${first ? '' : `<a class="btn btn-ghost btn-sm" href="#/settings">${icon('x', 'ico-sm')} Yopish</a>`}
        </div>
        ${progress()}
        <section class="card su-card">${body}<div id="su-err"></div></section>
        <div class="su-nav">
          ${st.step > 0 ? `<button class="btn btn-lg btn-light" type="button" id="su-back">${icon('back', 'ico-sm')} Orqaga</button>` : '<span></span>'}
          ${st.step < STEPS.length - 1
    ? `<button class="btn btn-lg" type="button" id="su-next">Davom etish ${icon('right', 'ico-sm')}</button>`
    : `<button class="btn btn-lg btn-success" type="button" id="su-finish">${icon('check', 'ico-sm')} Saqlash va boshlash</button>`}
        </div>
      </div>`;
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
    if (st.step === 4) {
      st.lowStock = root.querySelector('#su-low')?.checked ?? st.lowStock;
      st.costing = v('#su-cost') || st.costing;
    }
  }

  function validate() {
    if (st.step === 0 && !st.types.length) return "Kamida bitta do'kon turini tanlang";
    if (st.step === 1 && !st.employees) return 'Nechta kishi ishlashini tanlang';
    if (st.step === 2 && !st.region) return 'Viloyatni tanlang';
    if (st.step === 3 && !st.name) return "Do'kon nomini yozing";
    return '';
  }

  function bind() {
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
    }).catch(errorToast));
  }

  draw();
}
