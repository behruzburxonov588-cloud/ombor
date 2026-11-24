// Platforma egasi: har bir do'konga AI tarifini yoqish/uzaytirish/o'chirish va oylik daromad-xarajat
import { get, put, post, esc, icon, moneyFull, dateOnly, errorToast, withBusy, confirmBox } from '../ui.js';

// AI ulanishi: kalit bormi va ishlayaptimi. Tekshirish natijasi sahifa yangilanguncha eslab qolinadi
let lastTest = null;
function connCard(data) {
  const t = lastTest;
  const ok = t?.ok;
  const state = t ? (ok ? 'ok' : 'bad') : (data.configured ? 'idle' : 'bad');
  const title = t ? (ok ? 'AI ishlayapti' : t.title) : (data.configured ? "Kalit qo'shilgan" : "AI hali ulanmagan");
  const line = t
    ? (ok ? `${esc(t.model)} ${(t.ms / 1000).toFixed(1).replace('.', ',')} soniyada javob berdi. Do'konlarga tarif yoqishingiz mumkin` : esc(t.fix))
    : (data.configured ? "Ishlashini bir bosishda tekshiring" : "Kalit qo'shilmaguncha bozorchilarga faqat bepul «Tez savollar» ishlaydi");
  const steps = !data.configured || (t && ['no_key', 'bad_key', 'no_credit', 'forbidden'].includes(t.code));
  return `
    <section class="card ai-conn ${state}" aria-live="polite">
      <div class="aic-top">
        <span class="aic-mark">${icon(state === 'ok' ? 'check' : state === 'bad' ? 'alert' : 'sparkles', 'ico-sm')}</span>
        <div class="grow"><h2>${esc(title)}</h2><p>${line}</p>${t && !ok && t.detail ? `<details class="aic-detail"><summary>Batafsil xabar</summary><p>${esc(t.detail)}</p></details>` : ''}</div>
        <button type="button" class="btn ${data.configured ? '' : 'btn-light'}" data-test>${icon('refresh', 'ico-sm')} Tekshirish</button>
      </div>
      ${steps ? `<ol class="aic-steps">
        ${data.provider === 'claude' ? `
        <li><b>Kalit oling.</b> console.anthropic.com saytiga kiring → «API Keys» → «Create Key». Kalitni nusxalang (uni hech kimga yubormang).</li>
        <li><b>Hisobni to'ldiring.</b> O'sha saytda «Billing» bo'limida kamida 5 $ qo'ying. AI xarajati shundan yechiladi.</li>
        <li><b>Cloudflare'ga qo'ying.</b> Workers → <i>ombor</i> → Settings → Variables and Secrets → Add. Type: <b>Secret</b>, nomi: <code>ANTHROPIC_API_KEY</code>, qiymati: kalit. «Deploy»ni bosing.</li>` : `
        <li><b>Gemini kalitini oling.</b> aistudio.google.com saytiga kiring → «Get API key» → «Create API key». Kalitni nusxalang (uni hech kimga yubormang).</li>
        <li><b>To'lovni yoqing.</b> Bepul kvota kichik — ko'p do'kon ishlatsa, Google Cloud'da «Billing»ni yoqing.</li>
        <li><b>Cloudflare'ga qo'ying.</b> Workers → <i>ombor</i> → Settings → Variables and Secrets → Add. Type: <b>Secret</b>, nomi: <code>GEMINI_API_KEY</code>, qiymati: kalit. «Deploy»ni bosing. Boshqa model kerak bo'lsa — <code>GEMINI_MODEL</code> (oddiy) va <code>GEMINI_MODEL_PRO</code> (Pro) o'zgaruvchilari.</li>`}
        <li><b>Tekshiring.</b> Bir daqiqadan keyin shu yerda «Tekshirish»ni bosing.</li>
      </ol>` : ''}
      ${ok ? `<p class="aic-hint">${icon('info', 'ico-xs')} O'zingiz sinab ko'rish uchun pastdagi ro'yxatda o'z do'koningizga «+30 kun Pro» bosing, keyin yuqoridagi «Savol bering»dan so'rang.</p>` : ''}
    </section>`;
}

export async function render(root, params, ctx) {
  let data;
  try {
    data = await get('/platform/ai');
  } catch (err) {
    root.innerHTML = `<div class="alert alert-bad">${icon('alert', 'ico-sm')}<div>${esc(err.message)}</div></div>`;
    return;
  }
  draw();

  function draw() {
    const t = data.totals;
    const planBadge = (s) => (s.plan
      ? `<span class="badge ${s.plan === 'pro' ? 'badge-info' : s.plan === 'trial' ? 'badge-muted' : 'badge-ok'}">${esc(s.plan_label)}</span><div class="small muted">${dateOnly(s.expires_at)} gacha</div>`
      : '<span class="badge badge-muted">Yoqilmagan</span>');
    root.innerHTML = `
      <div class="page-head"><div><h1>AI tariflari</h1><p class="muted">Do'konlarga AI yordamchini yoqing va oylik daromadingizni kuzating. Narxlar: AI Oddiy ${moneyFull(data.prices.basic)} so'm, AI Pro ${moneyFull(data.prices.pro)} so'm (oyiga).</p></div></div>
      ${connCard(data)}
      <section class="kgrid" style="margin-bottom:18px">
        <div class="kcard"><span class="kc-l">To'lovli do'konlar</span><b class="kc-v">${t.basic + t.pro}<small>ta</small></b><span class="kc-f"><span class="kc-n">Oddiy: ${t.basic} · Pro: ${t.pro} · sinovda: ${t.trial}</span></span></div>
        <div class="kcard"><span class="kc-l">Oylik tushum (tariflardan)</span><b class="kc-v">${moneyFull(t.income)}<small>so'm</small></b><span class="kc-f"><span class="kc-n">faol tariflar bo'yicha</span></span></div>
        <div class="kcard"><span class="kc-l">AI xarajati (shu oy)</span><b class="kc-v">${moneyFull(t.cost)}<small>so'm</small></b><span class="kc-f"><span class="kc-n">1$ = ${moneyFull(data.usd_uzs)} so'm hisobida</span></span></div>
        <div class="kcard"><span class="kc-l">Sizga qoladi</span><b class="kc-v ${t.profit < 0 ? 'neg' : ''}" style="color:${t.profit >= 0 ? 'var(--pos)' : 'var(--neg)'}">${t.profit < 0 ? '−' : '+'}${moneyFull(Math.abs(t.profit))}<small>so'm</small></b><span class="kc-f"><span class="kc-n">tushum − AI xarajati (soliq va to'lov komissiyasidan oldin)</span></span></div>
      </section>
      <div class="card"><div class="table-wrap cards">
        <table>
          <thead><tr><th>Do'kon</th><th>Login</th><th>Tarif</th><th class="right">Shu oy savollar</th><th class="right">AI xarajati</th><th class="right">Amal</th></tr></thead>
          <tbody>${data.stores.map((s) => `
            <tr>
              <td data-label="Do'kon"><b>${esc(s.name)}</b><div class="small muted">#${s.id} · ${dateOnly(s.created_at)}</div></td>
              <td data-label="Login">${esc(s.login || '—')}</td>
              <td data-label="Tarif">${planBadge(s)}</td>
              <td data-label="Shu oy savollar" class="right num">${s.questions}${s.limit ? ` / ${s.limit}` : ''}</td>
              <td data-label="AI xarajati" class="right num">${moneyFull(s.cost_uzs)} so'm<div class="small muted">$${s.cost_usd}</div></td>
              <td data-label="Amal" class="right"><div class="row" style="justify-content:flex-end;gap:6px;flex-wrap:wrap">
                <button type="button" class="btn btn-sm btn-light" data-set="basic" data-id="${s.id}">+30 kun Oddiy</button>
                <button type="button" class="btn btn-sm" data-set="pro" data-id="${s.id}">+30 kun Pro</button>
                ${s.plan ? `<button type="button" class="btn btn-sm btn-ghost" data-set="none" data-id="${s.id}">O'chirish</button>` : ''}
              </div></td>
            </tr>`).join('')}</tbody>
        </table>
      </div></div>
      <p class="small muted" style="margin-top:12px">Bozorchi to'lov qilgach, shu yerda tarifni yoqasiz. Shu tarif amalda bo'lsa, «+30 kun» muddatni uzaytiradi.</p>`;
    root.querySelector('[data-test]').addEventListener('click', (e) => withBusy(e.currentTarget, async () => {
      lastTest = await post('/platform/ai/test', {});
      draw();
    }).catch(errorToast));
    root.querySelectorAll('[data-set]').forEach((b) => b.addEventListener('click', () => withBusy(b, async () => {
      const store = data.stores.find((s) => String(s.id) === b.dataset.id);
      if (b.dataset.set === 'none' && !(await confirmBox(`«${store.name}» do'konida AI o'chirilsinmi?`, { okText: "Ha, o'chirish", danger: true }))) return;
      data = await put(`/platform/ai/${b.dataset.id}`, { plan: b.dataset.set, days: 30 });
      draw();
    }).catch(errorToast)));
  }
}
