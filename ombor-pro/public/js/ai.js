// AI yordamchi oynasi: o'ngdan chiqadigan panel (telefonda — to'liq ekran).
//   • «Tez savollar» — hamma uchun bepul (javob to'g'ridan-to'g'ri bazadan).
//   • Istalgan savol (do'kon ma'lumoti yoki umumiy mavzu: reklama, reja, maslahat) — tarif yoki 7 kunlik bepul sinov.
//   • Suhbatlar shu qurilmada saqlanadi: tarix, «Yangi suhbat», har javobni nusxalash.
import { get, post, esc, icon, moneyFull, errorToast, toast, timeAgo } from './ui.js';

let panel = null;
let status = null;
let busy = false;
let goHelp = null;
let view = 'chat'; // chat | history
let storeKey = 'ombor.ai.chats';
let book = { current: null, list: [] }; // suhbatlar: {id, title, at, msgs: [{role, content, link?, error?}]}

const MAX_CHATS = 30;
const MAX_MSGS = 60;
const EXAMPLES = [
  'Bu hafta qaysi tovar eng ko\'p foyda keltirdi?',
  'Kam sotilayotgan tovarim uchun qisqa reklama yozib ber',
  'Sotuvlarimga qarab keyingi oy uchun reja tuz',
  'Как увеличить продажи в магазине одежды?',
];

// ---------- saqlash (shu qurilmada, do'kon va foydalanuvchi bo'yicha alohida) ----------
function load() {
  try { book = JSON.parse(localStorage.getItem(storeKey) || '') || { current: null, list: [] }; } catch { book = { current: null, list: [] }; }
  if (!Array.isArray(book.list)) book = { current: null, list: [] };
}
function persist() {
  try {
    book.list = book.list.filter((c) => c.msgs.length).slice(0, MAX_CHATS);
    localStorage.setItem(storeKey, JSON.stringify(book));
  } catch { /* xotira to'la yoki yopiq — suhbat faqat shu oynada qoladi */ }
}
function current() {
  let c = book.list.find((x) => x.id === book.current);
  if (!c) {
    c = { id: `c${Date.now().toString(36)}`, title: '', at: Date.now(), msgs: [] };
    book.list.unshift(c);
    book.current = c.id;
  }
  return c;
}
function push(msg) {
  const c = current();
  c.msgs.push(msg);
  if (c.msgs.length > MAX_MSGS) c.msgs = c.msgs.slice(-MAX_MSGS);
  if (!c.title && msg.role === 'user') c.title = msg.content.slice(0, 60);
  c.at = Date.now();
  // eng yangi suhbat tepada
  book.list = [c, ...book.list.filter((x) => x.id !== c.id)];
  persist();
}
function newChat() {
  book.current = null;
  view = 'chat';
  draw();
  panel?.querySelector('.ai-form textarea')?.focus();
}

// ---------- formatlash: sarlavha, ro'yxat, **qalin**, *kursiv*, `kod` (avval xavfsizlik uchun esc) ----------
function inline(s) {
  return s.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, '$1<i>$2</i>').replace(/`([^`]+)`/g, '<code>$1</code>');
}
function render(text) {
  const lines = esc(text).split('\n');
  let html = '';
  let list = null;
  const close = () => { if (list) { html += `</${list}>`; list = null; } };
  for (const raw of lines) {
    const h = raw.match(/^\s*#{1,4}\s+(.*)$/);
    const ul = raw.match(/^\s*[-•*]\s+(.*)$/);
    const ol = raw.match(/^\s*\d+[.)]\s+(.*)$/);
    if (h) { close(); html += `<h4>${inline(h[1])}</h4>`; } else if (ul || ol) {
      const kind = ul ? 'ul' : 'ol';
      if (list !== kind) { close(); html += `<${kind}>`; list = kind; }
      html += `<li>${inline((ul || ol)[1])}</li>`;
    } else {
      close();
      if (raw.trim()) html += `<p>${inline(raw)}</p>`;
    }
  }
  close();
  return html;
}

function statusLine() {
  if (!status) return '';
  if (status.active) {
    return `<span class="ai-plan ${status.plan}">${esc(status.label)}</span><span class="nw" title="Shu oy berilgan savollar"><b>${status.used} / ${status.limit}</b> savol</span><span class="nw ai-days">${status.days_left} kun qoldi</span>`;
  }
  return '<span class="ai-plan free">Bepul</span> Tez savollar — tekin';
}

function upsell() {
  const p = status.plans;
  return `
    <div class="ai-upsell">
      <b>Istalgan savolni yozib so'rash — pullik xizmat</b>
      <p>AI do'koningiz ma'lumotlarini o'qib javob beradi («Qaysi tovar sotilmayapti?»), reklama matni va reja yozadi, istalgan mavzuda maslahat beradi. O'zbek, rus va ingliz tilida.</p>
      <div class="ai-plans">
        <div class="ai-pcard"><span>${esc(p.basic.label)}</span><b>${moneyFull(p.basic.price)} <small>so'm/oy</small></b><small>Oyiga ${p.basic.limit} ta savol · tez</small></div>
        <div class="ai-pcard pro"><span>${esc(p.pro.label)}</span><b>${moneyFull(p.pro.price)} <small>so'm/oy</small></b><small>Oyiga ${p.pro.limit} ta savol · eng aqlli</small></div>
      </div>
      ${status.can_start_trial ? `<button type="button" class="btn btn-block" data-trial>${icon('sparkles', 'ico-sm')} ${p.trial.days} kun bepul sinab ko'rish</button>` : ''}
      ${status.is_platform_admin && !status.configured ? `<a class="btn btn-light btn-block" href="#/platform" data-goplat>${icon('gear', 'ico-sm')} AI'ni ulash — faqat sizga ko'rinadi</a>` : ''}
      <p class="ai-contact">${status.contact ? `Ulash uchun: <b>${esc(status.contact)}</b>` : "Ulash uchun dastur egasiga murojaat qiling"}</p>
    </div>`;
}

function messagesHtml() {
  const msgs = book.list.find((x) => x.id === book.current)?.msgs || [];
  const intro = `<div class="ai-msg bot"><p>Salom! Do'koningiz haqida so'rang — savdo, foyda, qarz, ombor. Yoki istalgan mavzuda: reklama matni, biznes reja, maslahat.${status?.active ? ' O\'zbek, rus yoki ingliz tilida yozing.' : ''}</p></div>`;
  const examples = status?.active && !msgs.length
    ? `<div class="ai-examples">${EXAMPLES.map((e) => `<button type="button" class="ai-ex" data-ex="${esc(e)}">${icon('sparkles', 'ico-xs')}<span>${esc(e)}</span></button>`).join('')}</div>` : '';
  return intro + examples + msgs.map((m, i) => `
    <div class="ai-msg ${m.role === 'user' ? 'me' : 'bot'}${m.error ? ' err' : ''}">
      ${m.role === 'user' ? `<p>${esc(m.content)}</p>` : render(m.content)}
      ${m.link ? `<a class="ai-link" href="${esc(m.link.href)}">${esc(m.link.label)} ${icon('right', 'ico-xs')}</a>` : ''}
      ${m.role === 'assistant' && !m.error ? `<button type="button" class="ai-copy" data-copy="${i}" title="Nusxalash" aria-label="Javobni nusxalash">${icon('copy', 'ico-xs')}<span>Nusxalash</span></button>` : ''}
    </div>`).join('') + (busy ? '<div class="ai-msg bot typing" aria-label="Javob tayyorlanmoqda"><i></i><i></i><i></i></div>' : '');
}

function historyHtml() {
  const list = book.list.filter((c) => c.msgs.length);
  return `<div class="ai-hist">
    <div class="ai-hist-head"><b>Suhbatlar</b><button type="button" class="link-btn" data-back>${icon('back', 'ico-xs')} Orqaga</button></div>
    ${list.length ? list.map((c) => `
      <div class="ai-hist-item${c.id === book.current ? ' on' : ''}">
        <button type="button" class="ai-hist-open" data-open="${esc(c.id)}"><b>${esc(c.title || 'Suhbat')}</b><small>${esc(timeAgo(new Date(c.at).toISOString()))} · ${c.msgs.length} ta xabar</small></button>
        <button type="button" class="icon-btn" data-del="${esc(c.id)}" aria-label="Suhbatni o'chirish" title="O'chirish">${icon('trash', 'ico-sm')}</button>
      </div>`).join('') : '<div class="empty small">Hali suhbat yo\'q</div>'}
  </div>`;
}

function draw() {
  if (!panel) return;
  const body = panel.querySelector('.ai-body');
  body.innerHTML = view === 'history' ? historyHtml() : messagesHtml();
  panel.querySelector('.ai-status').innerHTML = statusLine();
  panel.querySelector('.ai-quickwrap').hidden = view === 'history';
  panel.querySelector('.ai-quick').innerHTML = (status?.quick || []).map((q) => `<button type="button" class="chip" data-q="${esc(q.key)}" ${busy ? 'disabled' : ''}>${esc(q.label)}</button>`).join('');
  const foot = panel.querySelector('.ai-foot');
  foot.hidden = view === 'history';
  if (status?.active) {
    if (!foot.querySelector('form')) {
      foot.innerHTML = `<form class="ai-form" novalidate>
        <textarea rows="1" maxlength="2000" placeholder="Savolingizni yozing…" aria-label="Savol"></textarea>
        <button class="btn" type="submit" aria-label="Yuborish">${icon('send', 'ico-sm')}</button></form>`;
      const form = foot.querySelector('form');
      const ta = form.querySelector('textarea');
      ta.addEventListener('input', () => { ta.style.height = 'auto'; ta.style.height = `${Math.min(ta.scrollHeight, 160)}px`; });
      ta.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); form.requestSubmit(); } });
      form.addEventListener('submit', (e) => { e.preventDefault(); ask(ta.value); ta.value = ''; ta.style.height = 'auto'; });
    }
    foot.querySelector('button[type=submit]').disabled = busy;
  } else if (status) {
    foot.innerHTML = upsell();
    foot.querySelector('[data-trial]')?.addEventListener('click', startTrial);
    foot.querySelector('[data-goplat]')?.addEventListener('click', () => closeAi());
  }
  if (view === 'chat') body.scrollTop = body.scrollHeight;
}

async function refreshStatus() {
  status = await get('/ai/status');
  draw();
}

async function quick(key, label) {
  if (busy) return;
  view = 'chat';
  push({ role: 'user', content: label });
  busy = true;
  draw();
  try {
    const r = await post('/ai/quick', { topic: key });
    push({ role: 'assistant', content: r.answer, link: r.link || null });
  } catch (err) {
    push({ role: 'assistant', content: err.message, error: true });
  } finally {
    busy = false;
    draw();
  }
}

async function ask(text) {
  const q = String(text || '').trim();
  if (!q || busy) return;
  view = 'chat';
  const prev = (book.list.find((x) => x.id === book.current)?.msgs || []).filter((m) => !m.error);
  const history = prev.slice(-10).map((m) => ({ role: m.role, content: m.content }));
  push({ role: 'user', content: q });
  busy = true;
  draw();
  try {
    const r = await post('/ai/ask', { question: q, history });
    push({ role: 'assistant', content: r.answer });
    if (status) status.used = r.used;
  } catch (err) {
    // Platforma egasiga: AI ulanmagan yoki ishlamasa — tekshirish sahifasiga havola
    const link = err.status === 503 && status?.is_platform_admin ? { href: '#/platform', label: 'AI ulanishini tekshirish' } : null;
    push({ role: 'assistant', content: err.message, error: true, link });
    if (err.status === 402 || err.status === 429) refreshStatus().catch(() => {});
  } finally {
    busy = false;
    draw();
  }
}

async function copy(i) {
  const m = book.list.find((x) => x.id === book.current)?.msgs[i];
  if (!m) return;
  try {
    await navigator.clipboard.writeText(m.content);
    toast('Nusxalandi', 'ok');
  } catch {
    // Eski brauzer: belgilab nusxalash
    const ta = Object.assign(document.createElement('textarea'), { value: m.content });
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); toast('Nusxalandi', 'ok'); } catch { toast("Nusxalab bo'lmadi", 'warn'); }
    ta.remove();
  }
}

async function startTrial(e) {
  const b = e.currentTarget;
  b.disabled = true;
  try {
    status = { ...status, ...(await post('/ai/trial', {})), can_start_trial: false };
    push({ role: 'assistant', content: `Bepul sinov yoqildi: **${status.days_left} kun**, ${status.limit} ta savol. Endi istalgan savolni yozing!` });
    draw();
    panel.querySelector('.ai-form textarea')?.focus();
  } catch (err) {
    errorToast(err);
    b.disabled = false;
  }
}

export function closeAi() {
  if (!panel) return;
  panel.classList.remove('open');
  document.body.classList.remove('ai-open');
  const p = panel;
  panel = null;
  setTimeout(() => p.remove(), 200);
}

// help — joriy sahifa uchun «Yordam» oynasini ochadi; owner — suhbatlar shu foydalanuvchi va do'kon uchun alohida saqlanadi
export async function openAi({ help = null, owner = '' } = {}) {
  goHelp = help;
  if (panel) return;
  storeKey = `ombor.ai.chats.${owner || 'me'}`;
  load();
  view = 'chat';
  panel = document.createElement('aside');
  panel.className = 'ai-panel';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', 'AI yordamchi');
  panel.innerHTML = `
    <div class="ai-scrim" data-close></div>
    <section class="ai-box">
      <header class="ai-head">
        <span class="ai-mark">${icon('sparkles', 'ico-sm')}</span>
        <div class="grow"><b>AI yordamchi</b><div class="ai-status"></div></div>
        <button type="button" class="icon-btn" data-hist title="Suhbatlar tarixi" aria-label="Suhbatlar tarixi">${icon('history', 'ico-sm')}</button>
        <button type="button" class="icon-btn" data-new title="Yangi suhbat" aria-label="Yangi suhbat">${icon('plus', 'ico-sm')}</button>
        <button type="button" class="icon-btn" data-close aria-label="Yopish">${icon('x')}</button>
      </header>
      <div class="ai-body" aria-live="polite"></div>
      <div class="ai-quickwrap"><div class="ai-qtitle">Tez savollar <span>bepul</span>${goHelp ? '<button type="button" class="link-btn" data-help>Bu sahifa nima uchun?</button>' : ''}</div><div class="ai-quick chips"></div></div>
      <div class="ai-foot"></div>
    </section>`;
  document.body.appendChild(panel);
  document.body.classList.add('ai-open');
  requestAnimationFrame(() => panel?.classList.add('open'));
  panel.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', closeAi));
  panel.querySelector('[data-new]').addEventListener('click', newChat);
  panel.querySelector('[data-hist]').addEventListener('click', () => { view = view === 'history' ? 'chat' : 'history'; draw(); });
  panel.querySelector('[data-help]')?.addEventListener('click', () => { const h = goHelp; closeAi(); h?.(); });
  panel.querySelector('.ai-quick').addEventListener('click', (e) => {
    const b = e.target.closest('[data-q]');
    if (b) quick(b.dataset.q, b.textContent.trim());
  });
  panel.querySelector('.ai-body').addEventListener('click', (e) => {
    if (e.target.closest('.ai-link')) { closeAi(); return; }
    const cp = e.target.closest('[data-copy]');
    if (cp) { copy(Number(cp.dataset.copy)); return; }
    const ex = e.target.closest('[data-ex]');
    if (ex) { ask(ex.dataset.ex); return; }
    const op = e.target.closest('[data-open]');
    if (op) { book.current = op.dataset.open; view = 'chat'; persist(); draw(); return; }
    const del = e.target.closest('[data-del]');
    if (del) {
      book.list = book.list.filter((c) => c.id !== del.dataset.del);
      if (book.current === del.dataset.del) book.current = null;
      persist();
      draw();
      return;
    }
    if (e.target.closest('[data-back]')) { view = 'chat'; draw(); }
  });
  draw();
  try {
    await refreshStatus();
  } catch (err) {
    errorToast(err);
  }
}

document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && panel) closeAi(); });
