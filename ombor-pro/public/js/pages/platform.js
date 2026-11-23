// Platforma egasi: har bir do'konga AI tarifini yoqish/uzaytirish/o'chirish va oylik daromad-xarajat
import { get, put, esc, icon, moneyFull, dateOnly, errorToast, withBusy, confirmBox } from '../ui.js';

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
    root.querySelectorAll('[data-set]').forEach((b) => b.addEventListener('click', () => withBusy(b, async () => {
      const store = data.stores.find((s) => String(s.id) === b.dataset.id);
      if (b.dataset.set === 'none' && !(await confirmBox(`«${store.name}» do'konida AI o'chirilsinmi?`, { okText: "Ha, o'chirish", danger: true }))) return;
      data = await put(`/platform/ai/${b.dataset.id}`, { plan: b.dataset.set, days: 30 });
      draw();
    }).catch(errorToast)));
  }
}
