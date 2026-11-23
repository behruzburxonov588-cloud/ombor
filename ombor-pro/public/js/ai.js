// AI yordamchi oynasi: o'ngdan chiqadigan panel (telefonda — to'liq ekran).
//   • «Tez savollar» — hamma uchun bepul (javob to'g'ridan-to'g'ri bazadan).
//   • Istalgan savolni yozish — AI Oddiy / AI Pro tarifi yoki 7 kunlik bepul sinov.
import { get, post, esc, icon, moneyFull, errorToast } from './ui.js';

let panel = null;
let status = null;
let busy = false;
let goHelp = null;
const chat = []; // {role: 'user'|'assistant', content, link?, error?}

// Oddiy formatlash: **qalin**, «- » ro'yxat, yangi qator
function render(text) {
  const lines = esc(text).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').split('\n');
  let html = '';
  let inList = false;
  for (const raw of lines) {
    const m = raw.match(/^\s*(?:[-•]|\d+[.)])\s+(.*)$/);
    if (m) {
      if (!inList) { html += '<ul>'; inList = true; }
      html += `<li>${m[1]}</li>`;
    } else {
      if (inList) { html += '</ul>'; inList = false; }
      html += raw.trim() ? `<p>${raw}</p>` : '';
    }
  }
  if (inList) html += '</ul>';
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
      <p>AI do'koningiz ma'lumotlarini o'qib, har qanday savolga javob beradi: «Nimadan ko'proq olay?», «Qaysi tovar sotilmayapti?», «Shu hafta o'tgan haftadan yaxshimi?»</p>
      <div class="ai-plans">
        <div class="ai-pcard"><span>${esc(p.basic.label)}</span><b>${moneyFull(p.basic.price)} <small>so'm/oy</small></b><small>Oyiga ${p.basic.limit} ta savol · tez</small></div>
        <div class="ai-pcard pro"><span>${esc(p.pro.label)}</span><b>${moneyFull(p.pro.price)} <small>so'm/oy</small></b><small>Oyiga ${p.pro.limit} ta savol · eng aqlli</small></div>
      </div>
      ${status.can_start_trial ? `<button type="button" class="btn btn-block" data-trial>${icon('sparkles', 'ico-sm')} ${p.trial.days} kun bepul sinab ko'rish</button>` : ''}
      <p class="ai-contact">${status.contact ? `Ulash uchun: <b>${esc(status.contact)}</b>` : "Ulash uchun dastur egasiga murojaat qiling"}</p>
    </div>`;
}

function messagesHtml() {
  const intro = `<div class="ai-msg bot"><p>Salom! Men do'koningiz bo'yicha yordamchiman. Pastdagi tayyor savollardan birini bosing${status?.active ? ' yoki savolingizni yozing' : ''}.</p></div>`;
  return intro + chat.map((m) => `
    <div class="ai-msg ${m.role === 'user' ? 'me' : 'bot'}${m.error ? ' err' : ''}">
      ${m.role === 'user' ? `<p>${esc(m.content)}</p>` : render(m.content)}
      ${m.link ? `<a class="ai-link" href="${esc(m.link.href)}">${esc(m.link.label)} ${icon('right', 'ico-xs')}</a>` : ''}
    </div>`).join('') + (busy ? '<div class="ai-msg bot typing" aria-label="Javob tayyorlanmoqda"><i></i><i></i><i></i></div>' : '');
}

function draw() {
  if (!panel) return;
  const body = panel.querySelector('.ai-body');
  body.innerHTML = messagesHtml();
  panel.querySelector('.ai-status').innerHTML = statusLine();
  panel.querySelector('.ai-quick').innerHTML = (status?.quick || []).map((q) => `<button type="button" class="chip" data-q="${esc(q.key)}" ${busy ? 'disabled' : ''}>${esc(q.label)}</button>`).join('');
  const foot = panel.querySelector('.ai-foot');
  if (status?.active) {
    if (!foot.querySelector('form')) {
      foot.innerHTML = `<form class="ai-form" novalidate>
        <textarea rows="1" maxlength="1000" placeholder="Savolingizni yozing…" aria-label="Savol"></textarea>
        <button class="btn" type="submit" aria-label="Yuborish">${icon('send', 'ico-sm')}</button></form>`;
      const form = foot.querySelector('form');
      const ta = form.querySelector('textarea');
      ta.addEventListener('input', () => { ta.style.height = 'auto'; ta.style.height = `${Math.min(ta.scrollHeight, 140)}px`; });
      ta.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); form.requestSubmit(); } });
      form.addEventListener('submit', (e) => { e.preventDefault(); ask(ta.value); ta.value = ''; ta.style.height = 'auto'; });
    }
    foot.querySelector('button[type=submit]').disabled = busy;
  } else if (status) {
    foot.innerHTML = upsell();
    foot.querySelector('[data-trial]')?.addEventListener('click', startTrial);
  }
  body.scrollTop = body.scrollHeight;
}

async function refreshStatus() {
  status = await get('/ai/status');
  draw();
}

async function quick(key, label) {
  if (busy) return;
  chat.push({ role: 'user', content: label });
  busy = true;
  draw();
  try {
    const r = await post('/ai/quick', { topic: key });
    chat.push({ role: 'assistant', content: r.answer, link: r.link || null });
  } catch (err) {
    chat.push({ role: 'assistant', content: err.message, error: true });
  } finally {
    busy = false;
    draw();
  }
}

async function ask(text) {
  const q = String(text || '').trim();
  if (!q || busy) return;
  const history = chat.filter((m) => !m.error).slice(-6).map((m) => ({ role: m.role, content: m.content }));
  chat.push({ role: 'user', content: q });
  busy = true;
  draw();
  try {
    const r = await post('/ai/ask', { question: q, history });
    chat.push({ role: 'assistant', content: r.answer });
    if (status) status.used = r.used;
  } catch (err) {
    chat.push({ role: 'assistant', content: err.message, error: true });
    if (err.status === 402 || err.status === 429) refreshStatus().catch(() => {});
  } finally {
    busy = false;
    draw();
  }
}

async function startTrial(e) {
  const b = e.currentTarget;
  b.disabled = true;
  try {
    status = { ...status, ...(await post('/ai/trial', {})), can_start_trial: false };
    chat.push({ role: 'assistant', content: `Bepul sinov yoqildi: **${status.days_left} kun**, ${status.limit} ta savol. Endi istalgan savolni yozing!` });
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

// helpFn — joriy sahifa uchun «Yordam» oynasini ochadi
export async function openAi({ help = null } = {}) {
  goHelp = help;
  if (panel) return;
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
        <button type="button" class="icon-btn" data-clear title="Yangi suhbat" aria-label="Yangi suhbat">${icon('refresh', 'ico-sm')}</button>
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
  panel.querySelector('[data-clear]').addEventListener('click', () => { chat.length = 0; draw(); });
  panel.querySelector('[data-help]')?.addEventListener('click', () => { const h = goHelp; closeAi(); h?.(); });
  panel.querySelector('.ai-quick').addEventListener('click', (e) => {
    const b = e.target.closest('[data-q]');
    if (b) quick(b.dataset.q, b.textContent.trim());
  });
  panel.querySelector('.ai-body').addEventListener('click', (e) => { if (e.target.closest('.ai-link')) closeAi(); });
  draw();
  try {
    await refreshStatus();
  } catch (err) {
    errorToast(err);
  }
}

document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && panel) closeAi(); });
