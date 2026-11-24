// Qo'lda qarz yozish va qarz to'lovini qabul qilish oynalari
// (Qarzdor mijozlar, mijoz va yetkazib beruvchi sahifalari, bosh sahifadagi «Qarz» tugmasidan ochiladi)
import { get, post, esc, icon, money, openModal, toast, withBusy, todayStr, newKey, parseMoney } from './ui.js';

const toNum = (v) => {
  const n = parseMoney(v);
  return Number.isFinite(n) ? n : 0;
};

const TEXT = {
  customer: {
    title: 'Qarz yozish',
    who: 'Kim qarz? (mijoz)',
    whoPh: 'Mijoz ismini yozing yoki ro\'yxatdan tanlang',
    newHint: "Bunday mijoz yo'q — yangi mijoz qo'shiladi",
    explain: "Daftardagi eski qarz yoki dasturdan tashqari berilgan nasiya. Bu savdo hisoblanmaydi: tushum va foydaga qo'shilmaydi, faqat qarz bo'lib turadi. Tovar hozir nasiyaga sotilsa, «Sotuv» bo'limida «Nasiya» ni tanlang.",
    list: '/customers',
    listKey: 'customers',
    create: (body) => post('/customers', body).then((r) => r.customer),
    path: (id) => `/customers/${id}/debts`,
    due: true,
    done: 'Qarz yozildi',
  },
  supplier: {
    title: "Yetkazib beruvchiga qarzni yozish",
    who: 'Kimga qarzdorsiz? (yetkazib beruvchi)',
    whoPh: 'Nomini yozing yoki ro\'yxatdan tanlang',
    newHint: "Bunday yetkazib beruvchi yo'q — yangisi qo'shiladi",
    explain: "Siz yetkazib beruvchiga qarzdor bo'lgan summa (masalan, oldingi oylardan qolgan). Bu kirim emas: omborga tovar qo'shilmaydi, faqat qarz bo'lib turadi. Yangi yuk kelsa, «Tovar kirimi» orqali kiriting.",
    list: '/suppliers',
    listKey: 'suppliers',
    create: (body) => post('/suppliers', body).then((r) => r.supplier),
    path: (id) => `/suppliers/${id}/debts`,
    due: true,
    dueLabel: "Qachongacha to'laysiz? (ixtiyoriy)",
    done: 'Qarz yozildi',
  },
};

// party: { id, name } — ma'lum bo'lsa, tanlash maydoni ko'rsatilmaydi
export async function openDebtForm({ kind = 'customer', party = null, onDone = () => {} } = {}) {
  const t = TEXT[kind];
  const parties = party ? [] : (await get(t.list).catch(() => ({ [t.listKey]: [] })))[t.listKey];
  const key = newKey('debt');
  const today = todayStr();
  const { close, el } = openModal({
    title: party ? `${t.title}: ${party.name}` : t.title,
    body: `
      <form id="dform" class="form-grid" novalidate>
        <div class="note">${icon('info', 'ico-xs')}<span>${esc(t.explain)}</span></div>
        ${party ? '' : `<label class="field"><span>${esc(t.who)} *</span>
          <input class="input" id="dwho" list="dwho-list" autocomplete="off" placeholder="${esc(t.whoPh)}">
          <datalist id="dwho-list">${parties.map((p) => `<option value="${esc(p.name)}">${esc(p.phone || '')}</option>`).join('')}</datalist>
          <small id="dwho-hint"></small></label>
        <label class="field" id="dphone-row" hidden><span>Telefon (ixtiyoriy)</span><input class="input" id="dphone" inputmode="tel" maxlength="30" placeholder="+998 90 123 45 67"></label>`}
        <label class="field"><span>Qarz summasi (so'm) *</span><input class="input" id="damount" data-money inputmode="decimal" placeholder="0"></label>
        <div class="form-grid two" style="gap:10px">
          <label class="field"><span>Qarz qachon paydo bo'lgan?</span><input class="input" type="date" id="ddate" value="${today}" max="${today}"></label>
          ${t.due ? `<label class="field"><span>${t.dueLabel || "Qachon to'lashi kerak? (ixtiyoriy)"}</span><input class="input" type="date" id="ddue"></label>` : '<div></div>'}
        </div>
        <label class="field"><span>Izoh (ixtiyoriy)</span><input class="input" id="dnote" maxlength="200" placeholder="${kind === 'customer' ? 'Masalan: daftardan, 2 qop un' : 'Masalan: sentabr oyidan qolgan'}"></label>
        <div id="derr"></div>
      </form>`,
    foot: `<button class="btn btn-outline" type="button" data-close>Bekor</button>
           <button class="btn" type="submit" form="dform">${icon('check', 'ico-sm')} Qarzni yozish</button>`,
  });
  const $ = (s) => el.querySelector(s);
  const findParty = (name) => parties.find((p) => p.name.trim().toLowerCase() === name.trim().toLowerCase());
  if (!party) {
    const sync = () => {
      const name = $('#dwho').value.trim();
      const isNew = Boolean(name) && !findParty(name);
      $('#dwho-hint').textContent = isNew ? t.newHint : '';
      $('#dphone-row').hidden = !isNew;
    };
    $('#dwho').addEventListener('input', sync);
    $('#dwho').focus();
  } else {
    $('#damount').focus();
  }
  const fail = (msg) => { $('#derr').innerHTML = `<div class="alert alert-bad">${esc(msg)}</div>`; };
  $('#dform').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = el.querySelector('[form="dform"]');
    await withBusy(btn, async () => {
      const amount = toNum($('#damount').value);
      if (!(amount > 0)) return fail('Qarz summasini kiriting');
      let target = party;
      try {
        if (!target) {
          const name = $('#dwho').value.trim();
          if (!name) return fail(kind === 'customer' ? 'Mijoz ismini kiriting' : 'Yetkazib beruvchi nomini kiriting');
          target = findParty(name) || await t.create({ name, phone: $('#dphone').value.trim() });
        }
        const body = { amount, date: $('#ddate').value || undefined, note: $('#dnote').value.trim() || undefined, idempotency_key: key };
        if (t.due && $('#ddue').value) body.due_date = $('#ddue').value;
        const r = await post(t.path(target.id), body);
        close();
        toast(`${t.done}: ${target.name} — ${money(r.amount)}. Jami qarz: ${money(r.debt)}`, 'ok');
        onDone(r);
      } catch (err) {
        fail(err.message);
      }
      return undefined;
    });
  });
}

// Qarzdorlar ro'yxatidan to'lov qabul qilish: debtors — [{ id, name, debt }]
export function openReceivePayment({ debtors, selected = null, onDone = () => {} }) {
  const key = newKey('pay');
  const first = debtors.find((d) => String(d.id) === String(selected)) || null;
  const { close, el } = openModal({
    title: "Qarz to'lovini qabul qilish",
    body: `
      <form id="rform" class="form-grid" novalidate>
        <label class="field"><span>Kim to'layapti? *</span>
          <select class="input" id="rwho"><option value="">— mijozni tanlang —</option>
            ${debtors.map((d) => `<option value="${d.id}" ${first && first.id === d.id ? 'selected' : ''}>${esc(d.name)} — ${money(d.debt)}</option>`).join('')}
          </select></label>
        <div class="form-grid two" style="gap:10px">
          <label class="field"><span>Qancha to'ladi? (so'm) *</span><input class="input" id="ramount" data-money inputmode="decimal" value="${first ? first.debt : ''}"></label>
          <label class="field"><span>Qanday to'ladi?</span>
            <select class="input" id="rmethod"><option value="cash">Naqd</option><option value="card">Karta</option><option value="transfer">O'tkazma</option></select></label>
        </div>
        <small class="muted">To'lov eng eski qarzdan boshlab yopiladi.</small>
        <div id="rerr"></div>
      </form>`,
    foot: `<button class="btn btn-outline" type="button" data-close>Bekor</button>
           <button class="btn btn-success" type="submit" form="rform">${icon('check', 'ico-sm')} Qabul qilish</button>`,
  });
  const $ = (s) => el.querySelector(s);
  $('#rwho').addEventListener('change', () => {
    const d = debtors.find((x) => String(x.id) === $('#rwho').value);
    $('#ramount').value = d ? d.debt : '';
  });
  $('#rform').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = el.querySelector('[form="rform"]');
    await withBusy(btn, async () => {
      const id = $('#rwho').value;
      const amount = toNum($('#ramount').value);
      if (!id) { $('#rerr').innerHTML = '<div class="alert alert-bad">Mijozni tanlang</div>'; return; }
      if (!(amount > 0)) { $('#rerr').innerHTML = '<div class="alert alert-bad">Summani kiriting</div>'; return; }
      try {
        const r = await post(`/customers/${id}/payments`, { amount, method: $('#rmethod').value, idempotency_key: key });
        close();
        toast(`To'lov qabul qilindi. Qolgan qarz: ${money(r.remaining_debt)}`, 'ok');
        onDone(r);
      } catch (err) {
        $('#rerr').innerHTML = `<div class="alert alert-bad">${esc(err.message)}</div>`;
      }
    });
  });
}
