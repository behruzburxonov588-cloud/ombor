// Aqlli yordamchi: kunlik xulosa, haftalik va oylik natijalar, diqqat talab qiladigan masalalar va tavsiyalar.
// Hammasi haqiqiy savdo, ombor va qarz yozuvlaridan hisoblanadi.
import {
  get, esc, icon, num, compact, deltaPill, longDate, dateOnly, timeAgo, emptyState, errorToast,
} from '../ui.js';

const LEVEL_ICON = { critical: 'critical', warning: 'warnCircle', success: 'trendUp', info: 'bulb' };

function block(b, { title, sub, financial, compareText }) {
  const cell = (label, value, change, goodWhenUp = true) => `
    <div><div class="l">${label}</div><div class="v">${value}</div><div class="d">${deltaPill(change, { goodWhenUp, title: compareText })}</div></div>`;
  return `
    <div class="mini-stats" style="margin-bottom:12px">
      ${cell('Sof tushum', compact(b.net_revenue, { unit: true }), b.change.net_revenue)}
      ${cell('Savdolar', `${num(b.sales_count, 0)} ta`, b.change.sales_count)}
      ${financial ? cell(b.net_profit >= 0 ? 'Sof foyda' : 'Sof zarar', compact(b.net_profit, { unit: true }), b.change.net_profit) : cell("O'rtacha chek", compact(b.avg_order, { unit: true }), null)}
      ${financial ? cell('Xarajatlar', compact(b.expenses, { unit: true }), b.change.expenses, false) : ''}
    </div>
    ${title ? `<div class="small muted">${esc(title)}${sub ? ` · ${esc(sub)}` : ''}</div>` : ''}`;
}

export async function render(root, params, ctx) {
  root.innerHTML = '<div class="empty">Ma\'lumotlar tahlil qilinmoqda…</div>';
  let b;
  try {
    b = await get('/analytics/assistant');
  } catch (err) {
    root.innerHTML = `<div class="alert alert-bad">${esc(err.message)}</div>`;
    return;
  }
  const fin = b.access.financial;
  const t = b.today;
  const insights = b.insights;

  root.innerHTML = `
    <div class="page-head">
      <div><h1>Maslahatlar</h1><p class="muted">${longDate(b.date)} · biznesingiz haqida xulosa va tavsiyalar</p></div>
      <div class="row">
        ${ctx.can('settings.manage') ? `<a class="btn btn-light btn-sm" href="#/notifications?tab=settings">${icon('bell', 'ico-sm')} Xabarlar jadvali</a>` : ''}
        <button class="btn btn-light btn-sm" type="button" id="refresh">${icon('refresh', 'ico-sm')} Yangilash</button>
      </div>
    </div>

    <div class="grid main-side">
      <section class="card">
        <div class="card-head"><div class="row" style="gap:10px">
          <span class="brand-mark" style="width:30px;height:30px;border-radius:8px;background:var(--accent-soft);color:var(--accent)">${icon('sparkles', 'ico-sm')}</span>
          <div><h2>Bugun</h2><div class="card-sub">kechaning shu vaqtiga nisbatan · ${esc(timeAgo(b.generated_at))} yangilandi</div></div></div></div>
        ${block(t, { financial: fin, compareText: 'kechaning shu vaqtiga nisbatan' })}
        <div class="brief-text" style="margin-top:4px">${b.summary.map((s) => `<p>${esc(s)}</p>`).join('')}</div>
        ${t.best_sellers?.length ? `<div style="margin-top:14px"><h4 class="muted" style="font-weight:550;margin-bottom:4px">Bugun eng ko'p sotilgan</h4>
          ${t.best_sellers.map((p, i) => `<a class="prod-row" href="#/products/${p.id}" style="grid-template-columns:24px minmax(0,1fr) auto">
            <span class="muted tnum">${i + 1}</span><div style="min-width:0"><div class="pn">${esc(p.name)}</div><div class="ps">${num(p.qty, 2)} ${esc(p.unit)}</div></div>
            <div class="pv">${compact(p.revenue, { unit: true })}${fin ? `<small>foyda ${compact(p.profit)}</small>` : ''}</div></a>`).join('')}</div>` : ''}
      </section>

      <section class="card">
        <div class="card-head"><div><h2>Diqqat talab qiladi</h2><div class="card-sub">Hozirgi holat</div></div></div>
        ${b.attention.length ? `<div class="attn">${b.attention.map((a) => `
          <a class="attn-item" href="${esc(a.link)}"><span class="lvl lvl-${esc(a.level)}"></span><div style="min-width:0"><b>${esc(a.title)}</b><span>${esc(a.text)}</span></div></a>`).join('')}</div>`
    : `<div class="alert alert-ok">${icon('ok', 'ico-sm')}<div>Shoshilinch masala yo'q: qoldiqlar yetarli, muddati o'tgan qarz yo'q.</div></div>`}
      </section>
    </div>

    <div class="grid cols-2" style="margin-top:14px">
      <section class="card">
        <div class="card-head"><div><h2>Shu hafta</h2><div class="card-sub">${dateOnly(b.week.from)} – ${dateOnly(b.week.to)} · o'tgan haftaning shu kunlariga nisbatan</div></div>
          ${fin ? `<a class="link-btn" href="#/reports?tab=weekly">Haftalik hisobot ${icon('right', 'ico-xs')}</a>` : ''}</div>
        ${block(b.week, { financial: fin, compareText: "o'tgan haftaning shu kunlariga nisbatan" })}
        <div class="brief-text">${b.week.sentences.map((s) => `<p>${esc(s)}</p>`).join('')}</div>
      </section>
      <section class="card">
        <div class="card-head"><div><h2>Shu oy</h2><div class="card-sub">${dateOnly(b.month.from)} – ${dateOnly(b.month.to)} · o'tgan oyning shu kunlariga nisbatan</div></div>
          ${fin ? `<a class="link-btn" href="#/reports?tab=pnl&from=${b.month.from}&to=${b.month.to}">Foyda va zarar ${icon('right', 'ico-xs')}</a>` : ''}</div>
        ${block(b.month, { financial: fin, compareText: "o'tgan oyning shu kunlariga nisbatan" })}
        <div class="brief-text">${b.month.sentences.map((s) => `<p>${esc(s)}</p>`).join('')}</div>
      </section>
    </div>

    <div class="section-title"><h2>Tavsiyalar</h2><span class="muted small">${insights.length} ta</span></div>
    <section class="card" style="padding-top:4px;padding-bottom:4px">
      ${insights.length ? insights.map((i) => `
        <div class="insight">
          <span class="ic ${esc(i.level)}">${icon(LEVEL_ICON[i.level] || 'info', 'ico-sm')}</span>
          <div class="between"><h4>${esc(i.title)}</h4>${i.link ? `<a class="link-btn" href="${esc(i.link)}">Ko'rish ${icon('right', 'ico-xs')}</a>` : ''}</div>
          <p>${esc(i.text)}</p>
          <div class="rec">${icon('bulb', 'ico-xs')}<span>${esc(i.recommendation)}</span></div>
        </div>`).join('') : emptyState("Hozircha tavsiya yo'q. Savdo tarixi ko'paygan sari tahlil aniqroq bo'ladi.", 'sparkles')}
    </section>
    <p class="note" style="margin-top:12px">${icon('info', 'ico-xs')}<span>Xulosalar savdo, qaytarish, xarajat, ombor va qarz yozuvlaridan avtomatik hisoblanadi. Sof foyda = tushum − tovarlarning kelish narxi − xarajatlar − buzilgan/yo'qolgan tovar. Mijozlarning eski qarz to'lovlari savdo hisoblanmaydi.</span></p>`;

  root.querySelector('#refresh').addEventListener('click', () => render(root, params, ctx).catch(errorToast));
}

