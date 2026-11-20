// Oddiy bosh sahifa: do'kon egasining asosiy savollariga javob
//   1) Pul nima bo'ldi? — qancha tushdi, tovar o'zingizga qanchaga tushdi, xarajatlar, foyda yoki zarar
//   2) Tovar: nima keldi (yuk), nima ketdi (sotildi)
//   3) Omborda nima bor
// Grafiklar va batafsil tahlil «Batafsil tahlil» tugmasi ortida (dashboard.js).
import {
  get, put, esc, icon, num, compact, moneyFull, RANGE_PRESETS, presetRange, longDate, errorToast,
} from '../ui.js';

const PERIOD_WORD = { today: 'Bugun', '7d': '7 kunda', '30d': '30 kunda', '90d': '90 kunda' };
const SHOW = 8;

function greeting() {
  const h = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Tashkent', hour: '2-digit', hour12: false }).format(new Date()));
  if (h < 11) return 'Xayrli tong';
  if (h < 18) return 'Xayrli kun';
  return 'Xayrli kech';
}

const qtyText = (q, unit) => `${num(q, 3)} ${unit}`;

// opts: { prefs, rangeKey, actionTiles(ctx), onboarding: async () => html, onDetailed() }
export async function renderHome(root, ctx, opts) {
  const rangeKey = RANGE_PRESETS.some((p) => p.key === opts.rangeKey) ? opts.rangeKey : '7d';
  const range = presetRange(rangeKey);
  const [d, onbHtml] = await Promise.all([
    get(`/analytics/overview?from=${range.from}&to=${range.to}`),
    opts.onboarding ? opts.onboarding().catch(() => '') : '',
  ]);
  const word = PERIOD_WORD[rangeKey];
  const canBuy = ctx.can('purchases.create');
  const canSell = ctx.can('sales.create');

  root.innerHTML = `
    <div class="dash-head">
      <div>
        <div class="hello">${greeting()}, ${esc(ctx.user.full_name.split(' ')[0])}</div>
        <h1>${esc(d.store_name)}</h1>
        <div class="muted small" style="margin-top:2px">${longDate()}</div>
      </div>
      <div class="filterbar no-print">
        <div class="seg" role="tablist" aria-label="Davr">
          ${RANGE_PRESETS.map((p) => `<button type="button" role="tab" data-range="${p.key}" class="${p.key === rangeKey ? 'active' : ''}" aria-selected="${p.key === rangeKey}">${p.label}</button>`).join('')}
        </div>
        <button class="btn btn-light btn-sm" type="button" id="to-detailed" title="Grafiklar, prognoz, reyting">${icon('chart', 'ico-sm')}<span class="mobile-hide">Batafsil tahlil</span></button>
      </div>
    </div>
    <div class="home">
      ${opts.actionTiles(ctx)}
      ${onbHtml || ''}
      ${moneySection(d, word)}
      ${movesSection(d, word, { canBuy, canSell })}
      ${stockSection(d, canBuy)}
      <div class="home-foot no-print">
        <button class="btn btn-light" type="button" id="to-detailed-2">${icon('chart', 'ico-sm')} Grafiklar, prognoz va batafsil tahlil</button>
      </div>
    </div>`;

  // Davr
  root.querySelectorAll('[data-range]').forEach((b) => b.addEventListener('click', () => {
    opts.prefs.dashboard.simple_range = b.dataset.range;
    put('/me/preferences', { dashboard: { simple_range: b.dataset.range } }).catch(() => {});
    renderHome(root, ctx, { ...opts, rangeKey: b.dataset.range }).catch(errorToast);
  }));
  root.querySelector('#to-detailed').addEventListener('click', opts.onDetailed);
  root.querySelector('#to-detailed-2').addEventListener('click', opts.onDetailed);
  opts.afterMount?.(root);

  // "Hammasini ko'rsatish"
  root.querySelectorAll('[data-more]').forEach((b) => b.addEventListener('click', () => {
    root.querySelectorAll(`[data-list="${b.dataset.more}"] [data-extra]`).forEach((x) => { x.hidden = false; });
    b.remove();
  }));
  // Ombor: qidiruv va holat bo'yicha saralash
  const stockList = root.querySelector('[data-list="stock"]');
  if (stockList) {
    let filter = '';
    let q = '';
    const apply = () => {
      const rows = stockList.querySelectorAll('[data-sname]');
      let shown = 0;
      rows.forEach((r) => {
        const match = (!filter || r.dataset.st === filter) && (!q || r.dataset.sname.includes(q));
        const visible = match && (q || filter || shown < SHOW || stockList.dataset.all === '1');
        r.hidden = !visible;
        if (visible) shown += 1;
      });
      const empty = root.querySelector('#stock-empty');
      if (empty) empty.hidden = shown > 0;
    };
    root.querySelector('#stock-q')?.addEventListener('input', (e) => { q = e.target.value.trim().toLowerCase(); apply(); });
    root.querySelectorAll('[data-sf]').forEach((b) => b.addEventListener('click', () => {
      filter = b.dataset.sf;
      root.querySelectorAll('[data-sf]').forEach((x) => x.classList.toggle('active', x === b));
      apply();
    }));
    root.querySelector('[data-more-stock]')?.addEventListener('click', (e) => {
      stockList.dataset.all = '1';
      e.currentTarget.remove();
      apply();
    });
    stockList.querySelectorAll('[data-go]').forEach((r) => r.addEventListener('click', () => ctx.go(r.dataset.go)));
  }
  root.querySelectorAll('.mv-row[data-go]').forEach((r) => r.addEventListener('click', () => ctx.go(r.dataset.go)));
}

// ---------- 1) Pul ----------
function moneySection(d, word) {
  const m = d.money;
  if (!d.access.financial) {
    return `
      <section class="card home-card">
        <div class="hc-head"><span class="hc-ico">${icon('money')}</span><div><h2>Pul</h2><div class="card-sub">${word}</div></div></div>
        <div class="money-grid one"><div class="mcell"><div class="ml">Sotuvdan tushdi</div><div class="mv">${moneyFull(m.revenue)} <small>so'm</small></div><div class="mh">${m.sales_count} ta savdo</div></div></div>
      </section>`;
  }
  const profit = m.net_profit;
  const loss = profit < 0;
  const parts = [
    { label: "Tovar o'zingizga tushgan narx", value: Math.max(0, m.cogs), cls: 'seg-cost' },
    { label: 'Xarajatlar', value: Math.max(0, m.expenses), cls: 'seg-exp' },
    { label: "Buzilgan / yo'qolgan tovar", value: Math.max(0, m.losses), cls: 'seg-loss' },
    { label: 'Foyda', value: Math.max(0, profit), cls: 'seg-profit' },
  ];
  const total = parts.reduce((s, p) => s + p.value, 0) || 1;
  const sentence = m.sales_count === 0 && m.expenses === 0
    ? `${word} savdo ham, xarajat ham bo'lmadi.`
    : `${word} <b>${moneyFull(m.revenue)} so'm</b> savdo bo'ldi (${m.sales_count} ta). Sotilgan tovarlar o'zingizga <b>${moneyFull(m.cogs)} so'm</b>ga tushgan, xarajatlar <b>${moneyFull(m.expenses)} so'm</b>${m.losses > 0 ? `, buzilgan/yo'qolgan tovar <b>${moneyFull(m.losses)} so'm</b>` : ''}. ${loss
      ? `<span class="red">Natija: <b>${moneyFull(Math.abs(profit))} so'm zarar</b> — minusga ketdingiz.</span>`
      : `<span class="green">Qo'lingizda <b>${moneyFull(profit)} so'm foyda</b> qoldi.</span>`}`;
  return `
    <section class="card home-card">
      <div class="hc-head">
        <span class="hc-ico">${icon('money')}</span>
        <div><h2>Pul nima bo'ldi?</h2><div class="card-sub">${word}: qancha tushdi, qayerga ketdi, qancha qoldi</div></div>
        <a class="link-btn" href="#/reports?tab=pnl&from=${d.range.from}&to=${d.range.to}">Batafsil ${icon('right', 'ico-xs')}</a>
      </div>
      <div class="money-grid">
        <div class="mcell"><div class="ml">Sotuvdan tushdi</div><div class="mv">${moneyFull(m.revenue)} <small>so'm</small></div><div class="mh">${m.sales_count} ta savdo${m.credit_sales > 0 ? ` · nasiyaga ${compact(m.credit_sales)}` : ''}</div></div>
        <div class="mcell"><div class="ml">Tovar o'zingizga tushgan narx</div><div class="mv">${moneyFull(m.cogs)} <small>so'm</small></div><div class="mh">sotilgan tovarlarning kelish narxi</div></div>
        <div class="mcell"><div class="ml">Xarajatlar</div><div class="mv">${moneyFull(m.expenses + m.losses)} <small>so'm</small></div><div class="mh">${m.losses > 0 ? `shundan buzilgan tovar ${compact(m.losses)}` : 'ijara, maosh, svet va boshqalar'}</div></div>
        <div class="mcell ${loss ? 'neg' : 'pos'}"><div class="ml">${loss ? 'Zarar (minus)' : 'Sof foyda'}</div><div class="mv">${loss ? '−' : ''}${moneyFull(Math.abs(profit))} <small>so'm</small></div><div class="mh">${loss ? "xarajatlar foydadan ko'p bo'ldi" : "qo'lingizda qolgan pul"}</div></div>
      </div>
      <p class="money-sentence">${sentence}</p>
      ${m.revenue > 0 ? `<div class="flowbar" role="img" aria-label="Savdo pulining taqsimoti">${parts.filter((p) => p.value > 0).map((p) => `<i class="${p.cls}" style="width:${(p.value / total) * 100}%" title="${esc(p.label)}: ${moneyFull(p.value)} so'm"></i>`).join('')}</div>
      <div class="flow-legend">${parts.map((p) => `<span><i class="${p.cls}"></i>${esc(p.label)} <b>${moneyFull(p.value)}</b></span>`).join('')}</div>` : ''}
      <div class="money-foot">
        <span>${icon('truck', 'ico-xs')} Yuk keldi: <b>${m.purchases_count} ta</b>, ${moneyFull(m.purchases_total)} so'm${m.purchases_unpaid > 0 ? ` <span class="amber">(to'lanmagan ${moneyFull(m.purchases_unpaid)})</span>` : ''}</span>
        <span>${icon('wallet', 'ico-xs')} Yetkazib beruvchilarga to'landi: <b>${moneyFull(m.paid_suppliers)} so'm</b></span>
        ${m.debt_collected > 0 ? `<span>${icon('debt', 'ico-xs')} Qarzdorlar to'ladi: <b>${moneyFull(m.debt_collected)} so'm</b></span>` : ''}
      </div>
    </section>`;
}

// ---------- 2) Tovar: nima keldi, nima ketdi ----------
function moveList(key, rows, render) {
  if (!rows.length) return '';
  return `<div class="mv-list" data-list="${key}">
    ${rows.map((r, i) => `<div class="mv-row" data-go="#/products/${r.id}" ${i >= SHOW ? 'data-extra hidden' : ''}>${render(r)}</div>`).join('')}
  </div>
  ${rows.length > SHOW ? `<button class="btn btn-ghost btn-sm" type="button" data-more="${key}">Hammasini ko'rsatish (${rows.length})</button>` : ''}`;
}

function movesSection(d, word, { canBuy, canSell }) {
  const mv = d.moves;
  const costs = d.access.costs;
  return `
    <div class="moves-grid">
      <section class="card home-card">
        <div class="hc-head">
          <span class="hc-ico in">${icon('truck')}</span>
          <div><h2>Nima keldi? (yuk)</h2><div class="card-sub">${word}: ${mv.in.length} xil tovar${costs && mv.in_value !== null ? ` · ${moneyFull(mv.in_value)} so'mlik` : ''}</div></div>
        </div>
        ${mv.in.length ? moveList('in', mv.in, (r) => `
          <span class="mv-name">${esc(r.name)}</span>
          <span class="mv-qty green">+${esc(qtyText(r.qty, r.unit))}</span>
          ${costs ? `<span class="mv-sum">${moneyFull(r.value)}</span>` : ''}`)
    : `<div class="empty small">${word.toLowerCase()} yuk kelmadi${canBuy ? `<div style="margin-top:10px"><a class="btn btn-sm" href="#/purchases/new">${icon('truck', 'ico-sm')} Yuk keldi — kiritish</a></div>` : ''}</div>`}
      </section>
      <section class="card home-card">
        <div class="hc-head">
          <span class="hc-ico out">${icon('cart')}</span>
          <div><h2>Nima ketdi? (sotildi)</h2><div class="card-sub">${word}: ${mv.out.length} xil tovar · ${moneyFull(mv.out_amount)} so'mlik</div></div>
        </div>
        ${mv.out.length ? moveList('out', mv.out, (r) => `
          <span class="mv-name">${esc(r.name)}</span>
          <span class="mv-qty">−${esc(qtyText(r.qty, r.unit))}</span>
          <span class="mv-sum">${moneyFull(r.amount)}</span>`)
    : `<div class="empty small">${word.toLowerCase()} sotuv bo'lmadi${canSell ? `<div style="margin-top:10px"><a class="btn btn-sm" href="#/sales">${icon('cart', 'ico-sm')} Sotish</a></div>` : ''}</div>`}
      </section>
    </div>`;
}

// ---------- 3) Omborda nima bor ----------
function stockSection(d, canBuy) {
  const s = d.stock;
  const costs = d.access.costs;
  const order = { out: 0, low: 1, ok: 2 };
  const items = [...s.items].sort((a, b) => order[a.status] - order[b.status] || a.name.localeCompare(b.name));
  const badge = { out: '<span class="badge badge-out">Tugagan</span>', low: '<span class="badge badge-low">Kam qolgan</span>', ok: '<span class="badge badge-ok">Bor</span>' };
  return `
    <section class="card home-card">
      <div class="hc-head">
        <span class="hc-ico">${icon('warehouse')}</span>
        <div><h2>Omborda nima bor?</h2><div class="card-sub">${s.products} xil tovar${costs && s.value !== null ? ` · jami ${moneyFull(s.value)} so'mlik (kelish narxida)` : ''} · sotsangiz ≈ ${compact(s.retail_value)} so'm</div></div>
        ${canBuy ? `<a class="btn btn-sm" href="#/purchases/new">${icon('truck', 'ico-sm')} Yuk keldi</a>` : ''}
      </div>
      ${s.products ? `
      <div class="stock-tools">
        <div class="search-input">${icon('search', 'ico-sm')}<input class="input input-sm" id="stock-q" type="search" placeholder="Tovar nomi"></div>
        <div class="chips">
          <button type="button" class="chip active" data-sf="">Hammasi ${s.products}</button>
          <button type="button" class="chip ${s.out ? 'chip-bad' : ''}" data-sf="out">Tugagan ${s.out}</button>
          <button type="button" class="chip ${s.low ? 'chip-warn' : ''}" data-sf="low">Kam qolgan ${s.low}</button>
        </div>
      </div>
      <div class="stock-list" data-list="stock">
        <div class="sl-head"><span>Tovar</span><span>Qoldiq</span>${costs ? '<span>Qiymati</span>' : ''}<span>Holat</span></div>
        ${items.map((x, i) => `<div class="sl-row" data-go="#/products/${x.id}" data-sname="${esc(x.name.toLowerCase())}" data-st="${x.status}" ${i >= SHOW ? 'hidden' : ''}>
          <span class="sl-name">${esc(x.name)}</span>
          <span class="sl-qty ${x.status === 'out' ? 'red' : x.status === 'low' ? 'amber' : ''}">${esc(qtyText(x.qty, x.unit))}</span>
          ${costs ? `<span class="sl-val">${moneyFull(x.value)}</span>` : ''}
          <span>${badge[x.status]}</span>
        </div>`).join('')}
        <div class="empty small" id="stock-empty" hidden>Hech narsa topilmadi</div>
      </div>
      ${items.length > SHOW ? `<button class="btn btn-ghost btn-sm" type="button" data-more-stock>Hammasini ko'rsatish (${items.length})</button>` : ''}`
    : `<div class="empty small">Hali tovar yo'q. <a href="#/products/new">Yangi tovar qo'shing</a></div>`}
    </section>`;
}

