// Bildirishnomalar markazi: xabarlar ro'yxati, shaxsiy sozlamalar va do'kon darajasidagi sozlamalar
import {
  get, post, put, esc, icon, timeAgo, dateTime, toast, errorToast, withBusy, emptyState,
} from '../ui.js';

const LEVELS = { critical: 'Muhim', warning: 'Diqqat', info: "Ma'lumot", success: 'Yaxshi' };
const WEEKDAYS = ['Dushanba', 'Seshanba', 'Chorshanba', 'Payshanba', 'Juma', 'Shanba', 'Yakshanba'];
const THRESHOLDS = [
  ['expense_spike_pct', "Xarajat odatdagidan necha % ko'p bo'lsa ogohlantirish", '%'],
  ['sales_decline_pct', 'Haftalik savdo necha % pasaysa ogohlantirish', '%'],
  ['product_decline_pct', 'Mahsulot savdosi necha % pasaysa ogohlantirish', '%'],
  ['margin_change_pp', "Foyda marjasi necha punktga o'zgarsa ogohlantirish", 'p.p.'],
  ['inventory_change_value', "Ombordagi zarar/tuzatish summasi (dan katta bo'lsa)", "so'm"],
  ['large_refund_value', "Katta qaytarish summasi (dan katta bo'lsa)", "so'm"],
  ['debt_reminder_days', 'Muddati o\'tgan qarz haqida necha kunda bir eslatish', 'kun'],
  ['restock_remind_days', 'Kam qolgan mahsulot haqida qayta eslatish oralig\'i', 'kun'],
];

const TABS = [
  { key: 'inbox', label: 'Xabarlar' },
  { key: 'personal', label: 'Mening sozlamalarim' },
  { key: 'settings', label: "Do'kon sozlamalari", perm: 'settings.manage' },
];

export async function render(root, params, ctx) {
  const tabs = TABS.filter((t) => !t.perm || ctx.can(t.perm));
  const tab = tabs.find((t) => t.key === params.query.tab) || tabs[0];
  root.innerHTML = `
    <div class="page-head">
      <div><h1>Bildirishnomalar</h1><p class="muted">Ogohlantirishlar, rejali xulosalar va ularni yetkazish sozlamalari</p></div>
      ${ctx.can('settings.manage') || ctx.can('reports.view') ? `<button class="btn btn-light btn-sm" type="button" id="check">${icon('refresh', 'ico-sm')} Hozir tekshirish</button>` : ''}
    </div>
    <div class="seg" role="tablist" style="margin-bottom:16px">${tabs.map((t) => `<button type="button" role="tab" data-tab="${t.key}" class="${t.key === tab.key ? 'active' : ''}" aria-selected="${t.key === tab.key}">${t.label}</button>`).join('')}</div>
    <div id="tabbody"></div>`;
  root.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => ctx.go(`#/notifications?tab=${b.dataset.tab}`)));
  root.querySelector('#check')?.addEventListener('click', (e) => withBusy(e.currentTarget, async () => {
    try {
      const r = await post('/notifications/check', {});
      toast(r.created ? `${r.created} ta yangi bildirishnoma` : "Yangi bildirishnoma yo'q", 'ok');
      ctx.refreshNotifications();
      if (tab.key === 'inbox') await inbox(root.querySelector('#tabbody'), params, ctx);
    } catch (err) {
      errorToast(err);
    }
  }));
  const body = root.querySelector('#tabbody');
  if (tab.key === 'inbox') await inbox(body, params, ctx);
  else if (tab.key === 'personal') await personal(body, ctx);
  else await storeSettings(body, ctx);
}

// ---------- Xabarlar ----------

async function inbox(body, params, ctx) {
  const f = { unread: params.query.unread === '1', level: params.query.level || '', group: params.query.group || '' };
  const { types } = await get('/me/preferences');
  let items = [];
  let hasMore = false;
  const qs = (extra = {}) => {
    const u = new URLSearchParams({ limit: '30' });
    if (f.unread) u.set('unread', '1');
    if (f.level) u.set('level', f.level);
    if (f.group) u.set('group', f.group);
    for (const [k, v] of Object.entries(extra)) u.set(k, v);
    return u;
  };
  body.innerHTML = `
    <div class="filterbar" style="margin-bottom:12px">
      <div class="chips">
        <button type="button" class="chip ${!f.unread && !f.level ? 'active' : ''}" data-f="all">Barchasi</button>
        <button type="button" class="chip ${f.unread ? 'active' : ''}" data-f="unread">O'qilmagan</button>
        <button type="button" class="chip ${f.level === 'critical' ? 'active' : ''}" data-f="critical"><span class="lvl lvl-critical"></span> Muhim</button>
        <button type="button" class="chip ${f.level === 'warning' ? 'active' : ''}" data-f="warning"><span class="lvl lvl-warning"></span> Diqqat</button>
      </div>
      <select class="input input-sm" id="grp" style="width:auto;min-width:220px" aria-label="Turi">
        <option value="">Barcha turlar</option>
        ${Object.entries(types).map(([k, t]) => `<option value="${k}" ${f.group === k ? 'selected' : ''}>${esc(t.label)}</option>`).join('')}
      </select>
      <span class="spacer" style="flex:1"></span>
      <button class="btn btn-light btn-sm" type="button" id="readall">${icon('check', 'ico-sm')} Hammasini o'qilgan qilish</button>
    </div>
    <section class="card flush"><div class="notif-list" id="nl"><div class="empty">Yuklanmoqda…</div></div></section>
    <div style="text-align:center;margin-top:12px"><button class="btn btn-light btn-sm" type="button" id="more" hidden>Ko'proq ko'rsatish</button></div>`;

  const list = body.querySelector('#nl');
  const draw = () => {
    list.innerHTML = items.length ? items.map((n) => `
      <a class="notif full ${n.is_read ? 'read' : 'unread'}" href="${esc(n.link || '#/notifications')}" data-id="${n.id}">
        <span class="lvl lvl-${esc(n.level)}" title="${esc(LEVELS[n.level])}"></span>
        <div style="min-width:0"><div class="nt">${esc(n.title)}</div><div class="nb">${esc(n.body)}</div>
          <div class="tiny faint" style="margin-top:4px">${esc(types[n.type_group]?.label || '')}</div></div>
        <span class="when" title="${esc(dateTime(n.created_at))}">${esc(timeAgo(n.created_at))}</span>
      </a>`).join('') : emptyState(f.unread ? "O'qilmagan bildirishnoma yo'q" : "Hozircha bildirishnoma yo'q", 'bell');
    body.querySelector('#more').hidden = !hasMore;
    list.querySelectorAll('.notif').forEach((a) => a.addEventListener('click', () => {
      post('/notifications/read', { ids: [Number(a.dataset.id)] }).then(() => ctx.refreshNotifications()).catch(() => {});
    }));
  };
  const load = async (append = false) => {
    const r = await get(`/notifications?${qs(append && items.length ? { before: items[items.length - 1].id } : {})}`);
    items = append ? [...items, ...r.items] : r.items;
    hasMore = r.has_more;
    ctx.setUnread(r.unread);
    draw();
  };
  const go = () => {
    const u = new URLSearchParams({ tab: 'inbox' });
    if (f.unread) u.set('unread', '1');
    if (f.level) u.set('level', f.level);
    if (f.group) u.set('group', f.group);
    history.replaceState(null, '', `#/notifications?${u}`);
    load().catch(errorToast);
  };
  body.querySelectorAll('[data-f]').forEach((b) => b.addEventListener('click', () => {
    const k = b.dataset.f;
    if (k === 'all') { f.unread = false; f.level = ''; }
    if (k === 'unread') f.unread = !f.unread;
    if (k === 'critical' || k === 'warning') f.level = f.level === k ? '' : k;
    body.querySelectorAll('[data-f]').forEach((x) => {
      const kk = x.dataset.f;
      x.classList.toggle('active', (kk === 'all' && !f.unread && !f.level) || (kk === 'unread' && f.unread) || kk === f.level);
    });
    go();
  }));
  body.querySelector('#grp').addEventListener('change', (e) => { f.group = e.target.value; go(); });
  body.querySelector('#more').addEventListener('click', (e) => withBusy(e.currentTarget, () => load(true).catch(errorToast)));
  body.querySelector('#readall').addEventListener('click', async () => {
    await post('/notifications/read-all', {});
    ctx.refreshNotifications();
    await load();
    toast("Hammasi o'qilgan deb belgilandi", 'ok');
  });
  await load();
}

// ---------- Shaxsiy sozlamalar ----------

async function personal(body, ctx) {
  const { prefs, types } = await get('/me/preferences');
  const visibleTypes = Object.entries(types).filter(([, t]) => t.audience.some((p) => ctx.can(p)));
  const support = 'Notification' in window;
  const perm = support ? Notification.permission : 'unsupported';
  const permText = {
    granted: '<span class="badge badge-ok">Ruxsat berilgan</span>',
    denied: '<span class="badge badge-out">Brauzerda bloklangan</span>',
    default: '<span class="badge badge-muted">Ruxsat so\'ralmagan</span>',
    unsupported: '<span class="badge badge-muted">Bu brauzer qo\'llamaydi</span>',
  }[perm];
  body.innerHTML = `
    <div class="grid cols-2">
      <section class="card">
        <div class="card-head"><div><h2>Qaysi xabarlarni ko'raman</h2><div class="card-sub">O'chirilgan turlar sizning ro'yxatingizda ko'rinmaydi</div></div></div>
        ${visibleTypes.map(([k, t]) => `
          <div class="setting-row">
            <div><b>${esc(t.label)}</b><p>${esc(t.hint)}</p></div>
            <label class="switch"><input type="checkbox" data-type="${k}" ${prefs.notifications.muted.includes(k) ? '' : 'checked'}><span class="track"></span><span class="sr-only">${esc(t.label)}</span></label>
          </div>`).join('')}
      </section>
      <div class="stack">
        <section class="card">
          <div class="card-head"><div><h2>Brauzer bildirishnomalari</h2><div class="card-sub">Ilova ochiq turganda (boshqa oynada bo'lsa ham) ekranga chiqadi</div></div>${permText}</div>
          <div class="setting-row">
            <div><b>Brauzerda ko'rsatish</b><p>Yangi muhim xabar kelganda kompyuter yoki telefon ekranida chiqadi</p></div>
            <label class="switch"><input type="checkbox" id="br" ${prefs.notifications.browser ? 'checked' : ''} ${support ? '' : 'disabled'}><span class="track"></span></label>
          </div>
          <div class="setting-row" style="display:block">
            <b>Qaysi darajadagilar</b>
            <div class="row" style="margin-top:8px;gap:16px">${Object.entries(LEVELS).map(([k, l]) => `
              <label class="check"><input type="checkbox" data-level="${k}" ${prefs.notifications.browser_levels.includes(k) ? 'checked' : ''}><span class="lvl lvl-${k}"></span>${l}</label>`).join('')}</div>
          </div>
          ${perm === 'denied' ? '<div class="alert alert-warn" style="margin-top:10px">Brauzer sozlamalarida bu sayt uchun bildirishnomalarga ruxsat bering.</div>' : ''}
          ${support && perm === 'default' ? `<button class="btn btn-light btn-sm" type="button" id="ask" style="margin-top:10px">${icon('bellRing', 'ico-sm')} Ruxsat so'rash</button>` : ''}
          ${support && perm === 'granted' ? `<button class="btn btn-light btn-sm" type="button" id="test" style="margin-top:10px">${icon('send', 'ico-sm')} Sinab ko'rish</button>` : ''}
        </section>
        <section class="card">
          <div class="card-head"><div><h2>Hisobot va bosh sahifa</h2><div class="card-sub">Ochilganda qaysi davr tanlangan bo'lsin</div></div></div>
          <div class="form-grid two">
            <label class="field"><span>Bosh sahifa davri</span><select class="input" id="drange">
              ${[['today', 'Bugun'], ['7d', '7 kun'], ['30d', '30 kun'], ['90d', '90 kun']].map(([v, l]) => `<option value="${v}" ${prefs.dashboard.range === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
            <label class="field"><span>Hisobotlar davri</span><select class="input" id="rperiod">
              ${[['today', 'Bugun'], ['week', 'Shu hafta'], ['month', 'Shu oy'], ['year', 'Shu yil']].map(([v, l]) => `<option value="${v}" ${prefs.reports.period === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
            <label class="field"><span>Hisobot taqsimoti</span><select class="input" id="rgrain">
              ${[['daily', 'Kunlik'], ['weekly', 'Haftalik'], ['monthly', 'Oylik']].map(([v, l]) => `<option value="${v}" ${prefs.reports.grain === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
            <div class="field"><span>Vidjetlar</span><a class="btn btn-light" href="#/dashboard">${icon('sliders', 'ico-sm')} Bosh sahifada sozlash</a></div>
          </div>
        </section>
      </div>
    </div>
    <div class="row" style="margin-top:16px;justify-content:flex-end"><button class="btn" type="button" id="save">${icon('check', 'ico-sm')} Saqlash</button></div>`;

  body.querySelector('#ask')?.addEventListener('click', async () => {
    const r = await Notification.requestPermission();
    if (r === 'granted') body.querySelector('#br').checked = true;
    personal(body, ctx);
  });
  body.querySelector('#test')?.addEventListener('click', () => {
    try {
      new Notification('OMBOR PRO', { body: 'Brauzer bildirishnomalari ishlayapti.', icon: '/favicon.svg' });
    } catch (err) {
      errorToast(err);
    }
  });
  body.querySelector('#save').addEventListener('click', (e) => withBusy(e.currentTarget, async () => {
    const muted = [...body.querySelectorAll('[data-type]')].filter((c) => !c.checked).map((c) => c.dataset.type);
    const browser = body.querySelector('#br').checked;
    if (browser && support && Notification.permission === 'default') await Notification.requestPermission();
    try {
      await put('/me/preferences', {
        notifications: {
          muted,
          browser,
          browser_levels: [...body.querySelectorAll('[data-level]')].filter((c) => c.checked).map((c) => c.dataset.level),
        },
        dashboard: { range: body.querySelector('#drange').value },
        reports: { period: body.querySelector('#rperiod').value, grain: body.querySelector('#rgrain').value },
      });
      toast('Sozlamalar saqlandi', 'ok');
      ctx.refreshNotifications();
    } catch (err) {
      errorToast(err);
    }
  }));
}

// ---------- Do'kon sozlamalari (rahbar) ----------

async function storeSettings(body, ctx) {
  const data = await get('/notifications/settings');
  const cfg = data.config;
  const types = data.types;
  const chan = (k, c, label, disabled = false) => `<label class="check"><input type="checkbox" data-chan="${k}:${c}" ${cfg.types[k].channels.includes(c) || c === 'app' ? 'checked' : ''} ${disabled ? 'disabled' : ''}>${label}</label>`;
  body.innerHTML = `
    <div class="grid main-side">
      <div class="stack">
        <section class="card">
          <div class="card-head"><div><h2>Bildirishnoma turlari</h2><div class="card-sub">Har bir tur uchun yetkazish kanalini tanlang. Ilovada har doim ko'rinadi.</div></div></div>
          ${Object.entries(types).map(([k, t]) => `
            <div class="setting-row">
              <div><b>${esc(t.label)}</b><p>${esc(t.hint)}</p></div>
              <label class="switch"><input type="checkbox" data-enabled="${k}" ${cfg.types[k].enabled ? 'checked' : ''}><span class="track"></span><span class="sr-only">${esc(t.label)}</span></label>
              <div class="chans small">${chan(k, 'app', 'Ilovada', true)}${chan(k, 'browser', 'Brauzerda')}${chan(k, 'telegram', 'Telegram')}</div>
            </div>`).join('')}
        </section>
        <section class="card">
          <div class="card-head"><div><h2>Ogohlantirish chegaralari</h2><div class="card-sub">Ortiqcha xabarlar bo'lmasligi uchun sezgirlikni sozlang</div></div></div>
          <div class="form-grid two">${THRESHOLDS.map(([k, label, unit]) => `
            <label class="field"><span>${esc(label)}</span>
              <div class="input-group"><input class="input" data-th="${k}" inputmode="numeric" value="${cfg.thresholds[k]}"><span class="muted small" style="align-self:center;min-width:34px">${unit}</span></div></label>`).join('')}
          </div>
        </section>
      </div>
      <div class="stack">
        <section class="card">
          <div class="card-head"><div><h2>Jadval</h2><div class="card-sub">Rejali xulosalar qachon yuborilsin (Toshkent vaqti)</div></div></div>
          <div class="form-grid">
            <label class="field"><span>Kunlik xulosa vaqti</span><input class="input" type="time" id="daily_time" value="${esc(cfg.schedule.daily_time)}"></label>
            <div class="form-grid two" style="gap:10px">
              <label class="field"><span>Haftalik xulosa kuni</span><select class="input" id="weekly_day">${WEEKDAYS.map((w, i) => `<option value="${i + 1}" ${cfg.schedule.weekly_day === i + 1 ? 'selected' : ''}>${w}</option>`).join('')}</select></label>
              <label class="field"><span>vaqti</span><input class="input" type="time" id="weekly_time" value="${esc(cfg.schedule.weekly_time)}"></label>
            </div>
            <div class="form-grid two" style="gap:10px">
              <label class="field"><span>Oylik hisobot kuni</span><input class="input" id="monthly_day" inputmode="numeric" value="${cfg.schedule.monthly_day}"></label>
              <label class="field"><span>vaqti</span><input class="input" type="time" id="monthly_time" value="${esc(cfg.schedule.monthly_time)}"></label>
            </div>
            <div class="setting-row" style="padding-bottom:0">
              <div><b>Tinch soatlar</b><p>Bu vaqtda Telegram va brauzer xabarlari yuborilmaydi (keyin yuboriladi)</p></div>
              <label class="switch"><input type="checkbox" id="quiet" ${cfg.quiet_hours.enabled ? 'checked' : ''}><span class="track"></span></label>
            </div>
            <div class="form-grid two" style="gap:10px">
              <label class="field"><span>dan</span><input class="input" type="time" id="quiet_start" value="${esc(cfg.quiet_hours.start)}"></label>
              <label class="field"><span>gacha</span><input class="input" type="time" id="quiet_end" value="${esc(cfg.quiet_hours.end)}"></label>
            </div>
          </div>
        </section>
        <section class="card">
          <div class="card-head"><div><h2>Telegram</h2><div class="card-sub">Xabarlar telefoningizga Telegram orqali keladi</div></div>
            <label class="switch"><input type="checkbox" id="tg_on" ${cfg.telegram.enabled ? 'checked' : ''}><span class="track"></span><span class="sr-only">Telegram</span></label></div>
          <ol class="small muted" style="margin:0 0 12px;padding-left:18px;line-height:1.7">
            <li>Telegramda <b>@BotFather</b> ga <b>/newbot</b> yozing va bot yarating.</li>
            <li>Bergan tokenni quyiga kiriting.</li>
            <li>O'z botingizga <b>/start</b> yozing (yoki botni guruhga qo'shing), so'ng «Chatlarni aniqlash» ni bosing.</li>
          </ol>
          <label class="field"><span>Bot tokeni</span>
            <input class="input" id="tg_token" type="password" autocomplete="off" placeholder="${cfg.telegram.token_set ? `Saqlangan (${esc(cfg.telegram.token_hint)}). O'zgartirish uchun yangisini kiriting` : '123456789:AA…'}"></label>
          ${cfg.telegram.token_set ? `<label class="check small"><input type="checkbox" id="tg_clear"> Saqlangan tokenni o'chirish</label>` : ''}
          <label class="field" style="margin-top:10px"><span>Chat ID lar (vergul bilan)</span>
            <input class="input" id="tg_chats" value="${esc(cfg.telegram.chat_ids.join(', '))}" placeholder="masalan: 123456789"></label>
          <div id="found" style="margin-top:8px"></div>
          <div class="row" style="margin-top:10px">
            <button class="btn btn-light btn-sm" type="button" id="tg_find">${icon('search', 'ico-sm')} Chatlarni aniqlash</button>
            <button class="btn btn-light btn-sm" type="button" id="tg_test" ${cfg.telegram.token_set ? '' : 'disabled'}>${icon('send', 'ico-sm')} Sinov xabari</button>
          </div>
        </section>
        <section class="card">
          <div class="card-head"><div><h2>Yetkazish tarixi</h2><div class="card-sub">So'nggi Telegram xabarlari</div></div></div>
          ${data.deliveries.length ? `<div class="list">${data.deliveries.slice(0, 8).map((d) => `
            <div class="list-item" style="cursor:default"><div class="meta"><div class="name small">${esc(d.title)}</div>
              <div class="sub">${esc(d.target)} · ${esc(timeAgo(d.created_at))}${d.error ? ` · ${esc(d.error)}` : ''}</div></div>
              <span class="badge ${d.status === 'sent' ? 'badge-ok' : d.status === 'failed' ? 'badge-out' : 'badge-muted'}">${{ sent: 'Yuborildi', failed: 'Xato', pending: 'Kutmoqda', sending: 'Yuborilmoqda' }[d.status]}</span></div>`).join('')}</div>`
    : '<div class="empty small">Hali Telegramga xabar yuborilmagan</div>'}
        </section>
      </div>
    </div>
    <div id="nerr" style="margin-top:12px"></div>
    <div class="row" style="margin-top:16px;justify-content:flex-end"><button class="btn" type="button" id="save">${icon('check', 'ico-sm')} Saqlash</button></div>`;

  const collect = () => {
    const out = JSON.parse(JSON.stringify(cfg));
    delete out.telegram.token_set;
    delete out.telegram.token_hint;
    for (const k of Object.keys(types)) {
      out.types[k].enabled = body.querySelector(`[data-enabled="${k}"]`).checked;
      out.types[k].channels = ['app', ...['browser', 'telegram'].filter((c) => body.querySelector(`[data-chan="${k}:${c}"]`).checked)];
    }
    for (const [k] of THRESHOLDS) out.thresholds[k] = Number(String(body.querySelector(`[data-th="${k}"]`).value).replace(/\s/g, '').replace(',', '.'));
    out.schedule = {
      daily_time: body.querySelector('#daily_time').value,
      weekly_day: Number(body.querySelector('#weekly_day').value),
      weekly_time: body.querySelector('#weekly_time').value,
      monthly_day: Number(body.querySelector('#monthly_day').value),
      monthly_time: body.querySelector('#monthly_time').value,
    };
    out.quiet_hours = { enabled: body.querySelector('#quiet').checked, start: body.querySelector('#quiet_start').value, end: body.querySelector('#quiet_end').value };
    out.telegram.enabled = body.querySelector('#tg_on').checked;
    out.telegram.chat_ids = body.querySelector('#tg_chats').value.split(/[,\s]+/).map((x) => x.trim()).filter(Boolean);
    return out;
  };
  const save = async () => {
    const token = body.querySelector('#tg_token').value.trim();
    const r = await put('/notifications/settings', {
      config: collect(), telegram_token: token || undefined, clear_token: body.querySelector('#tg_clear')?.checked === true,
    });
    Object.assign(cfg, r.config);
    return r;
  };
  body.querySelector('#save').addEventListener('click', (e) => withBusy(e.currentTarget, async () => {
    const err = body.querySelector('#nerr');
    err.innerHTML = '';
    try {
      await save();
      toast('Bildirishnoma sozlamalari saqlandi', 'ok');
      await storeSettings(body, ctx);
    } catch (ex) {
      err.innerHTML = `<div class="alert alert-bad">${icon('alert', 'ico-sm')}<div>${esc(ex.message)}</div></div>`;
    }
  }));
  body.querySelector('#tg_find').addEventListener('click', (e) => withBusy(e.currentTarget, async () => {
    const found = body.querySelector('#found');
    try {
      const token = body.querySelector('#tg_token').value.trim();
      const r = await post('/notifications/telegram/chats', token ? { token } : {});
      found.innerHTML = r.chats.length
        ? `<div class="small muted" style="margin-bottom:4px">Topilgan chatlar:</div>${r.chats.map((c) => `
            <div class="between small" style="padding:6px 0;border-bottom:1px solid var(--border)"><span><b>${esc(c.title)}</b> <span class="muted">${esc(c.id)} · ${esc(c.type)}</span></span>
            <button class="btn btn-light btn-sm" type="button" data-add="${esc(c.id)}">Qo'shish</button></div>`).join('')}`
        : `<div class="alert alert-info">${icon('info', 'ico-sm')}<div>Chat topilmadi. Botingizga /start yozib, qayta urinib ko'ring.</div></div>`;
      found.querySelectorAll('[data-add]').forEach((b) => b.addEventListener('click', () => {
        const inp = body.querySelector('#tg_chats');
        const ids = new Set(inp.value.split(/[,\s]+/).filter(Boolean));
        ids.add(b.dataset.add);
        inp.value = [...ids].join(', ');
        b.disabled = true;
        b.textContent = "Qo'shildi";
      }));
    } catch (ex) {
      found.innerHTML = `<div class="alert alert-bad">${esc(ex.message)}</div>`;
    }
  }));
  body.querySelector('#tg_test').addEventListener('click', (e) => withBusy(e.currentTarget, async () => {
    try {
      await save();
      const r = await post('/notifications/telegram/test', {});
      const bad = r.results.filter((x) => !x.ok);
      if (bad.length) toast(`Xato: ${bad.map((x) => `${x.chat}: ${x.error}`).join('; ')}`, 'bad');
      else toast('Sinov xabari yuborildi', 'ok');
    } catch (ex) {
      errorToast(ex);
    }
  }));
}
