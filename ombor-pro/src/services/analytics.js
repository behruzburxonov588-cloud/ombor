// Biznes tahlili: KPI, foyda va zarar, mahsulotlar, ombor, haftalik hisobot, prognoz, qarzlar va xodimlar.
// Barcha ko'rsatkichlar bazadagi haqiqiy yozuvlardan hisoblanadi.
//
// Buxgalteriya formulalari (barcha hisobotlarda bir xil):
//   Yalpi tushum       = sotuvlar narxi chegirmagacha            (sales.gross_total)
//   Sof tushum         = yalpi tushum - chegirmalar - qaytarishlar
//   Tannarx (COGS)     = sotilgan tovar tannarxi - qaytarilgan tovar tannarxi
//   Yalpi foyda        = sof tushum - tannarx
//   Ombor yo'qotishi   = yaroqsiz tovar + inventarizatsiya kamomadi - inventarizatsiya ortiqchasi
//   Sof foyda          = yalpi foyda - operatsion xarajatlar - ombor yo'qotishi
// Mijozning eski qarzini to'lashi yangi savdo emas: u faqat pul oqimida ko'rinadi.
// Qaytarish qaytarilgan kuni hisobga olinadi (sotuv kunini o'zgartirmaydi).

import { HttpError, round2, round4, todayLocal, addDays } from '../util.js';
import { getSettings } from './settings.js';

export const TZ = 'Asia/Tashkent';
const DAY_MS = 86400000;
const MAX_RANGE_DAYS = 366;
export const localDay = (col) => `(${col} AT TIME ZONE '${TZ}')::date::text`;
export const tsStart = (d) => `${d}T00:00:00+05:00`;
const isDate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`));
const n = (v) => Number(v || 0);

export function daysBetween(from, to) {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS) + 1;
}

export function listDays(from, to) {
  const out = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

// Haftaning dushanbasi (O'zbekistonda hafta dushanbadan boshlanadi)
export function mondayOf(date) {
  const dow = (new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7;
  return addDays(date, -dow);
}

// Foiz o'zgarishi. Oldingi qiymat nol bo'lsa, null (taqqoslab bo'lmaydi)
export function pctChange(cur, prev) {
  if (!Number.isFinite(prev) || Math.abs(prev) < 0.005) return Math.abs(cur) < 0.005 ? 0 : null;
  return round2(((cur - prev) / Math.abs(prev)) * 100);
}

// Davr va taqqoslash davri. Davr bugun bilan tugasa, oldingi davr ham shu vaqtgacha olinadi
// (masalan, bugun 15:00 gacha <-> kecha 15:00 gacha), shunda taqqoslash adolatli bo'ladi.
export function resolveRange(q = {}, { shiftDays = null, now = Date.now() } = {}) {
  const today = todayLocal();
  let from = isDate(q.from) ? q.from : today;
  let to = isDate(q.to) ? q.to : (isDate(q.from) ? q.from : today);
  if (from > to) [from, to] = [to, from];
  if (to > today) to = today;
  if (from > to) from = to;
  let days = daysBetween(from, to);
  if (days > MAX_RANGE_DAYS) {
    from = addDays(to, -(MAX_RANGE_DAYS - 1));
    days = MAX_RANGE_DAYS;
  }
  const shift = shiftDays ?? days;
  const toTs = tsStart(addDays(to, 1));
  const endMs = Math.min(Date.parse(toTs), now);
  return {
    from,
    to,
    days,
    partial: endMs < Date.parse(toTs),
    fromTs: tsStart(from),
    toTs,
    prevFrom: addDays(from, -shift),
    prevTo: addDays(to, -shift),
    prevFromTs: tsStart(addDays(from, -shift)),
    prevToTs: new Date(endMs - shift * DAY_MS).toISOString(),
  };
}

// ---------- Foyda va zarar (P&L) ----------

export async function pnlTotals(db, fromTs, toTs, fromDate, toDate) {
  const [s, lines, r, e, l, cp] = await Promise.all([
    db.query(
      `SELECT COUNT(*)::int AS cnt, COALESCE(SUM(gross_total), 0) AS gross, COALESCE(SUM(discount_total), 0) AS disc,
              COALESCE(SUM(total), 0) AS total, COALESCE(SUM(cost_total), 0) AS cost,
              COALESCE(SUM(credit_amount), 0) AS credit, COALESCE(SUM(paid_total), 0) AS paid,
              COUNT(*) FILTER (WHERE status = 'returned')::int AS fully_returned
         FROM sales WHERE created_at >= $1 AND created_at < $2 AND kind = 'sale'`,
      [fromTs, toTs],
    ),
    db.query(
      `SELECT COUNT(*)::int AS lines, COUNT(DISTINCT si.product_id)::int AS products
         FROM sale_items si JOIN sales s ON s.id = si.sale_id
        WHERE s.created_at >= $1 AND s.created_at < $2`,
      [fromTs, toTs],
    ),
    db.query(
      `SELECT COUNT(DISTINCT return_no)::int AS cnt, COALESCE(SUM(amount), 0) AS amount, COALESCE(SUM(cost), 0) AS cost,
              COALESCE(SUM(refund_amount), 0) AS refunded, COALESCE(SUM(debt_reduced), 0) AS debt_reduced
         FROM sale_returns WHERE created_at >= $1 AND created_at < $2`,
      [fromTs, toTs],
    ),
    db.query(
      'SELECT COALESCE(SUM(amount), 0) AS total FROM expenses WHERE expense_date BETWEEN $1::date AND $2::date',
      [fromDate, toDate],
    ),
    db.query(
      `SELECT COALESCE(SUM(-value) FILTER (WHERE movement_type = 'damage'), 0) AS damage,
              COALESCE(SUM(-value) FILTER (WHERE movement_type = 'correction' AND value < 0), 0) AS shrink,
              COALESCE(SUM(value) FILTER (WHERE movement_type = 'correction' AND value > 0), 0) AS surplus
         FROM stock_movements
        WHERE movement_type IN ('damage', 'correction') AND created_at >= $1 AND created_at < $2`,
      [fromTs, toTs],
    ),
    db.query(
      'SELECT COALESCE(SUM(amount), 0) AS amount FROM customer_payments WHERE created_at >= $1 AND created_at < $2',
      [fromTs, toTs],
    ),
  ]);
  const S = s.rows[0];
  const R = r.rows[0];
  const L = l.rows[0];
  const grossRevenue = round2(S.gross);
  const discounts = round2(S.disc);
  const returns = round2(R.amount);
  const netRevenue = round2(grossRevenue - discounts - returns);
  const cogs = round2(n(S.cost) - n(R.cost));
  const grossProfit = round2(netRevenue - cogs);
  const expenses = round2(e.rows[0].total);
  const damage = round2(L.damage);
  const shrinkage = round2(L.shrink);
  const surplus = round2(L.surplus);
  const losses = round2(damage + shrinkage - surplus);
  const netProfit = round2(grossProfit - expenses - losses);
  return {
    sales_count: S.cnt,
    fully_returned_count: S.fully_returned,
    lines: lines.rows[0].lines,
    products_sold: lines.rows[0].products,
    gross_revenue: grossRevenue,
    discounts,
    returns,
    returns_count: R.cnt,
    net_revenue: netRevenue,
    cogs,
    gross_profit: grossProfit,
    gross_margin: netRevenue > 0 ? round2((grossProfit / netRevenue) * 100) : 0,
    expenses,
    damage,
    shrinkage,
    surplus,
    losses,
    net_profit: netProfit,
    net_margin: netRevenue > 0 ? round2((netProfit / netRevenue) * 100) : 0,
    avg_order: S.cnt > 0 ? round2(n(S.total) / S.cnt) : 0,
    credit_sales: round2(S.credit),
    paid_at_sale: round2(S.paid),
    debt_collected: round2(cp.rows[0].amount),
    refunds_paid: round2(R.refunded),
    returns_debt_reduced: round2(R.debt_reduced),
  };
}

function emptyDay(day) {
  return {
    day, sales_count: 0, gross_revenue: 0, discounts: 0, returns: 0, net_revenue: 0, cogs: 0,
    gross_profit: 0, expenses: 0, losses: 0, net_profit: 0, avg_order: 0,
  };
}

function finishDay(d, raw) {
  d.sales_count = raw.cnt || 0;
  d.gross_revenue = round2(raw.gross || 0);
  d.discounts = round2(raw.disc || 0);
  d.returns = round2(raw.ret || 0);
  d.net_revenue = round2(d.gross_revenue - d.discounts - d.returns);
  d.cogs = round2(n(raw.cost) - n(raw.retCost));
  d.gross_profit = round2(d.net_revenue - d.cogs);
  d.expenses = round2(raw.exp || 0);
  d.losses = round2(raw.loss || 0);
  d.net_profit = round2(d.gross_profit - d.expenses - d.losses);
  d.avg_order = d.sales_count > 0 ? round2(n(raw.total) / d.sales_count) : 0;
  return d;
}

// Kunlik seriya (bo'sh kunlar nol bilan to'ldiriladi)
export async function dailyPnl(db, from, to) {
  const fromTs = tsStart(from);
  const toTs = tsStart(addDays(to, 1));
  const [s, r, e, l] = await Promise.all([
    db.query(
      `SELECT ${localDay('created_at')} AS k, COUNT(*)::int AS cnt, SUM(gross_total) AS gross,
              SUM(discount_total) AS disc, SUM(total) AS total, SUM(cost_total) AS cost
         FROM sales WHERE created_at >= $1 AND created_at < $2 AND kind = 'sale' GROUP BY 1`,
      [fromTs, toTs],
    ),
    db.query(
      `SELECT ${localDay('created_at')} AS k, SUM(amount) AS ret, SUM(cost) AS ret_cost
         FROM sale_returns WHERE created_at >= $1 AND created_at < $2 GROUP BY 1`,
      [fromTs, toTs],
    ),
    db.query(
      `SELECT expense_date::text AS k, SUM(amount) AS exp FROM expenses
        WHERE expense_date BETWEEN $1::date AND $2::date GROUP BY 1`,
      [from, to],
    ),
    db.query(
      `SELECT ${localDay('created_at')} AS k, -SUM(value) AS loss FROM stock_movements
        WHERE movement_type IN ('damage', 'correction') AND created_at >= $1 AND created_at < $2 GROUP BY 1`,
      [fromTs, toTs],
    ),
  ]);
  const raw = new Map();
  const at = (k) => {
    if (!raw.has(k)) raw.set(k, {});
    return raw.get(k);
  };
  for (const x of s.rows) Object.assign(at(x.k), { cnt: x.cnt, gross: x.gross, disc: x.disc, total: x.total, cost: x.cost });
  for (const x of r.rows) Object.assign(at(x.k), { ret: x.ret, retCost: x.ret_cost });
  for (const x of e.rows) at(x.k).exp = x.exp;
  for (const x of l.rows) at(x.k).loss = x.loss;
  return listDays(from, to).map((day) => finishDay(emptyDay(day), raw.get(day) || {}));
}

// Bir kun ichida soatlik seriya ("Bugun" grafigi uchun)
export async function hourlyPnl(db, fromTs, toTs) {
  const [s, r] = await Promise.all([
    db.query(
      `SELECT EXTRACT(HOUR FROM created_at AT TIME ZONE '${TZ}')::int AS k, COUNT(*)::int AS cnt,
              SUM(gross_total) AS gross, SUM(discount_total) AS disc, SUM(total) AS total, SUM(cost_total) AS cost
         FROM sales WHERE created_at >= $1 AND created_at < $2 AND kind = 'sale' GROUP BY 1`,
      [fromTs, toTs],
    ),
    db.query(
      `SELECT EXTRACT(HOUR FROM created_at AT TIME ZONE '${TZ}')::int AS k, SUM(amount) AS ret, SUM(cost) AS ret_cost
         FROM sale_returns WHERE created_at >= $1 AND created_at < $2 GROUP BY 1`,
      [fromTs, toTs],
    ),
  ]);
  const raw = new Map();
  for (const x of s.rows) raw.set(x.k, { cnt: x.cnt, gross: x.gross, disc: x.disc, total: x.total, cost: x.cost });
  for (const x of r.rows) Object.assign(raw.get(x.k) || raw.set(x.k, {}).get(x.k), { ret: x.ret, retCost: x.ret_cost });
  return Array.from({ length: 24 }, (_, h) => finishDay(emptyDay(`${String(h).padStart(2, '0')}:00`), raw.get(h) || {}));
}

// Kunlik seriyani hafta yoki oy bo'yicha guruhlash
export function groupSeries(days, grain) {
  if (grain === 'daily') return days.map((d) => ({ ...d, period: d.day }));
  const key = (day) => (grain === 'weekly' ? mondayOf(day) : grain === 'monthly' ? `${day.slice(0, 7)}-01` : `${day.slice(0, 4)}-01-01`);
  const map = new Map();
  for (const d of days) {
    const k = key(d.day);
    if (!map.has(k)) map.set(k, { ...emptyDay(k), period: k, _total: 0 });
    const g = map.get(k);
    for (const f of ['sales_count', 'gross_revenue', 'discounts', 'returns', 'net_revenue', 'cogs', 'gross_profit', 'expenses', 'losses', 'net_profit']) {
      g[f] = round2(g[f] + d[f]);
    }
    g._total = round2(g._total + d.avg_order * d.sales_count);
  }
  return [...map.values()].map(({ _total, ...g }) => ({ ...g, avg_order: g.sales_count ? round2(_total / g.sales_count) : 0 }));
}

// ---------- Ombor qiymati va mijoz qarzi (vaqt bo'yicha tiklash) ----------

export async function inventoryValueNow(db, method) {
  const { rows } = await db.query(method === 'WAVG'
    ? 'SELECT COALESCE(SUM(stock_qty * avg_cost), 0) AS v FROM products WHERE NOT is_archived'
    : `SELECT COALESCE(SUM(b.qty_remaining * b.unit_cost), 0) AS v
         FROM stock_batches b JOIN products p ON p.id = b.product_id WHERE NOT p.is_archived`);
  return round2(rows[0].v);
}

export async function customerDebtNow(db) {
  const { rows } = await db.query('SELECT COALESCE(SUM(balance_due), 0) AS v FROM sales');
  return round2(rows[0].v);
}

export async function supplierDebtNow(db) {
  const { rows } = await db.query('SELECT COALESCE(SUM(remaining_debt), 0) AS v FROM purchases');
  return round2(rows[0].v);
}

// Joriy qiymatdan kunlik o'zgarishlarni orqaga ayirib, har kun oxiridagi qiymatni topadi
function snapshotSeries(current, deltaRows, days, startDay) {
  const deltas = deltaRows.map((r) => [r.day, n(r.delta)]);
  const sumAfter = (d) => deltas.reduce((s, [k, v]) => (k > d ? s + v : s), 0);
  return {
    series: days.map((d) => round2(current - sumAfter(d))),
    start: round2(current - deltas.reduce((s, [k, v]) => (k >= startDay ? s + v : s), 0)),
  };
}

async function inventoryDeltas(db, sinceDay) {
  const { rows } = await db.query(
    `SELECT ${localDay('m.created_at')} AS day, SUM(m.value) AS delta
       FROM stock_movements m JOIN products p ON p.id = m.product_id
      WHERE NOT p.is_archived AND m.created_at >= $1 GROUP BY 1`,
    [tsStart(sinceDay)],
  );
  return rows;
}

async function debtDeltas(db, sinceDay) {
  const { rows } = await db.query(
    `SELECT day, SUM(delta) AS delta FROM (
        SELECT ${localDay('created_at')} AS day, credit_amount AS delta FROM sales WHERE created_at >= $1 AND credit_amount > 0
        UNION ALL
        SELECT ${localDay('created_at')}, -amount FROM customer_payments WHERE created_at >= $1
        UNION ALL
        SELECT ${localDay('created_at')}, -debt_reduced FROM sale_returns WHERE created_at >= $1 AND debt_reduced > 0
      ) x GROUP BY day`,
    [tsStart(sinceDay)],
  );
  return rows;
}

// ---------- Mahsulotlar bo'yicha tahlil ----------

export async function productStats(db, range, method) {
  const since30 = tsStart(addDays(todayLocal(), -29));
  const { rows } = await db.query(
    `WITH sold AS (
        SELECT si.product_id, SUM(si.base_quantity) AS qty, SUM(si.line_total) AS amt,
               SUM(si.cost_total) AS cost, COUNT(DISTINCT si.sale_id)::int AS receipts
          FROM sale_items si JOIN sales s ON s.id = si.sale_id
         WHERE s.created_at >= $1 AND s.created_at < $2
         GROUP BY si.product_id),
      ret AS (
        SELECT product_id, SUM(base_quantity) AS qty, SUM(amount) AS amt, SUM(cost) AS cost
          FROM sale_returns WHERE created_at >= $1 AND created_at < $2 GROUP BY product_id),
      v30 AS (
        SELECT si.product_id, SUM(si.base_quantity) AS qty
          FROM sale_items si JOIN sales s ON s.id = si.sale_id
         WHERE s.created_at >= $3 GROUP BY si.product_id),
      r30 AS (
        SELECT product_id, SUM(base_quantity) AS qty FROM sale_returns WHERE created_at >= $3 GROUP BY product_id),
      last_sale AS (
        SELECT si.product_id, MAX(s.created_at) AS at
          FROM sale_items si JOIN sales s ON s.id = si.sale_id GROUP BY si.product_id),
      batches AS (
        SELECT product_id, MIN(received_at) AS oldest, SUM(qty_remaining * unit_cost) AS value
          FROM stock_batches WHERE qty_remaining > 0 GROUP BY product_id)
     SELECT p.id, p.name, p.image_path, p.stock_qty, p.min_stock, p.avg_cost, p.selling_price, p.purchase_price,
            p.is_archived, p.category_id, c.name AS category_name, un.name AS unit, p.created_at,
            COALESCE(sold.qty, 0) - COALESCE(ret.qty, 0) AS qty_sold,
            COALESCE(sold.amt, 0) - COALESCE(ret.amt, 0) AS revenue,
            COALESCE(sold.cost, 0) - COALESCE(ret.cost, 0) AS cogs,
            COALESCE(sold.receipts, 0) AS receipts,
            COALESCE(v30.qty, 0) - COALESCE(r30.qty, 0) AS qty_30d,
            ls.at AS last_sale_at, b.oldest AS oldest_batch_at, COALESCE(b.value, 0) AS batch_value
       FROM products p
       JOIN units un ON un.id = p.base_unit_id
       LEFT JOIN categories c ON c.id = p.category_id
       LEFT JOIN sold ON sold.product_id = p.id
       LEFT JOIN ret ON ret.product_id = p.id
       LEFT JOIN v30 ON v30.product_id = p.id
       LEFT JOIN r30 ON r30.product_id = p.id
       LEFT JOIN last_sale ls ON ls.product_id = p.id
       LEFT JOIN batches b ON b.product_id = p.id
      WHERE NOT p.is_archived OR sold.product_id IS NOT NULL OR ret.product_id IS NOT NULL`,
    [range.fromTs, range.toTs, since30],
  );
  const now = Date.now();
  return rows.map((r) => {
    const stock = n(r.stock_qty);
    const minStock = n(r.min_stock);
    const value = method === 'WAVG' ? round2(stock * n(r.avg_cost)) : round2(r.batch_value);
    const revenue = round2(r.revenue);
    const cogs = round2(r.cogs);
    const profit = round2(revenue - cogs);
    const qtySold = round4(r.qty_sold);
    const qty30 = Math.max(0, round4(r.qty_30d));
    const daily30 = qty30 / 30;
    const cover = daily30 > 0 ? round2(stock / daily30) : null;
    const age = (ts) => (ts ? Math.floor((now - new Date(ts).getTime()) / DAY_MS) : null);
    let status = 'ok';
    if (stock <= 0) status = 'out';
    else if (minStock > 0 && stock <= minStock) status = 'low';
    return {
      id: r.id,
      name: r.name,
      image_path: r.image_path,
      category_id: r.category_id,
      category_name: r.category_name,
      unit: r.unit,
      is_archived: r.is_archived,
      stock_qty: stock,
      min_stock: minStock,
      selling_price: n(r.selling_price),
      unit_cost: stock > 0 ? round4(value / stock) : n(r.avg_cost) || n(r.purchase_price),
      stock_value: value,
      retail_value: round2(stock * n(r.selling_price)),
      qty_sold: qtySold,
      revenue,
      cogs,
      profit,
      margin: revenue > 0 ? round2((profit / revenue) * 100) : 0,
      receipts: r.receipts,
      sell_through: qtySold + stock > 0 ? round2((Math.max(qtySold, 0) / (Math.max(qtySold, 0) + stock)) * 100) : 0,
      qty_30d: qty30,
      daily_30d: round4(daily30),
      cover_days: cover,
      days_in_stock: stock > 0 ? age(r.oldest_batch_at) : null,
      days_since_sale: age(r.last_sale_at),
      product_age_days: age(r.created_at),
      status,
    };
  });
}

export function topLists(items, limit = 5) {
  const sold = items.filter((i) => i.qty_sold > 0 || i.revenue > 0);
  const inStock = items.filter((i) => !i.is_archived && i.stock_qty > 0);
  const zero = inStock.filter((i) => i.qty_sold <= 0).sort((a, b) => b.stock_value - a.stock_value);
  return {
    best: [...sold].sort((a, b) => b.revenue - a.revenue || b.qty_sold - a.qty_sold).slice(0, limit),
    profit: sold.filter((i) => i.profit > 0).sort((a, b) => b.profit - a.profit).slice(0, limit),
    frequent: sold.filter((i) => i.receipts > 0).sort((a, b) => b.receipts - a.receipts || b.revenue - a.revenue).slice(0, limit),
    slow: inStock.filter((i) => i.qty_sold > 0).sort((a, b) => a.sell_through - b.sell_through || b.stock_value - a.stock_value).slice(0, limit),
    zero: zero.slice(0, limit),
    zero_count: zero.length,
    zero_value: round2(zero.reduce((s, i) => s + i.stock_value, 0)),
  };
}

const SORTABLE = ['name', 'qty_sold', 'revenue', 'profit', 'margin', 'receipts', 'stock_qty', 'stock_value', 'sell_through', 'cover_days'];

export function filterSortPage(items, q) {
  let rows = items;
  const text = String(q.q || '').trim().toLowerCase();
  if (text) rows = rows.filter((i) => i.name.toLowerCase().includes(text));
  if (q.category_id) rows = rows.filter((i) => String(i.category_id) === String(q.category_id));
  if (q.filter === 'sold') rows = rows.filter((i) => i.qty_sold > 0);
  if (q.filter === 'unsold') rows = rows.filter((i) => i.qty_sold <= 0 && i.stock_qty > 0);
  if (q.filter === 'low') rows = rows.filter((i) => i.status === 'low');
  if (q.filter === 'out') rows = rows.filter((i) => i.status === 'out' && !i.is_archived);
  const sort = SORTABLE.includes(q.sort) ? q.sort : 'revenue';
  const dir = q.dir === 'asc' ? 1 : -1;
  rows = [...rows].sort((a, b) => {
    if (sort === 'name') return dir * a.name.localeCompare(b.name);
    const av = a[sort] ?? -Infinity;
    const bv = b[sort] ?? -Infinity;
    return dir * (av - bv) || a.name.localeCompare(b.name);
  });
  const limit = Math.min(Math.max(Number(q.limit) || 25, 1), 200);
  const offset = Math.max(Number(q.offset) || 0, 0);
  return { total: rows.length, sort, dir: dir === 1 ? 'asc' : 'desc', limit, offset, rows: rows.slice(offset, offset + limit) };
}

// ---------- Ombor tahlili va tavsiyalar ----------

const fmtQty = (v) => String(round2(v)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
const fmtMoney = (v) => `${String(Math.round(v)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} so'm`;

// Mahsulot uchun tushunarli tavsiya (faqat haqiqiy ko'rsatkichlar asosida)
export function recommendation(p) {
  if (p.status === 'out') {
    return p.qty_30d > 0
      ? `Tugagan. 30 kunda ${fmtQty(p.qty_30d)} ${p.unit} sotilgan edi — savdo yo'qotilmoqda. Tezroq kirim qiling.`
      : "Tugagan. Talab bo'lsa, kirim qiling; bo'lmasa arxivlashni ko'rib chiqing.";
  }
  if (p.status === 'low') {
    const need = Math.max(p.min_stock * 2, p.daily_30d * 14) - p.stock_qty;
    const days = p.cover_days !== null ? `~${Math.max(1, Math.round(p.cover_days))} kunda tugaydi. ` : '';
    return `${days}Qayta buyurtma bering${need > 0 ? `: taxminan ${fmtQty(Math.ceil(need))} ${p.unit}` : ''}.`;
  }
  if (p.qty_30d <= 0 && p.stock_qty > 0) {
    return `30 kunda sotilmadi. ${fmtMoney(p.stock_value)} pul muzlab turibdi: chegirma yoki aksiya qiling, yangi buyurtma bermang.`;
  }
  if (p.cover_days !== null && p.cover_days > 90) {
    const excess = p.stock_qty - p.daily_30d * 45;
    return `Zaxira ~${Math.round(p.cover_days)} kunga yetadi. Ortiqcha qism ≈ ${fmtMoney(excess * p.unit_cost)}. Keyingi buyurtmani kamaytiring.`;
  }
  if (p.cover_days !== null && p.cover_days > 45) {
    return `Sekin sotilyapti: zaxira ~${Math.round(p.cover_days)} kunga yetadi. Javonda ko'rinadigan joyga qo'ying yoki narxni ko'rib chiqing.`;
  }
  if (p.cover_days !== null && p.cover_days < 7 && p.qty_30d > 0) {
    return `Tez sotilyapti: zaxira ~${Math.max(1, Math.round(p.cover_days))} kunga yetadi. Minimal qoldiqni oshirishni o'ylang.`;
  }
  return '';
}

export async function inventoryAnalytics(db, { financial = false, method } = {}) {
  const settings = method ? { costing_method: method } : await getSettings(db);
  const today = todayLocal();
  const from = addDays(today, -29);
  const range = resolveRange({ from, to: today });
  const items = (await productStats(db, range, settings.costing_method)).filter((i) => !i.is_archived);
  const withRec = (list) => list.map((p) => ({ ...p, recommendation: recommendation(p) }));

  const unitMap = new Map();
  for (const p of items) {
    if (p.stock_qty <= 0) continue;
    unitMap.set(p.unit, round4((unitMap.get(p.unit) || 0) + p.stock_qty));
  }

  const low = items.filter((p) => p.status === 'low').sort((a, b) => (a.cover_days ?? 1e9) - (b.cover_days ?? 1e9));
  const out = items.filter((p) => p.status === 'out').sort((a, b) => b.qty_30d - a.qty_30d || a.name.localeCompare(b.name));
  const dead = items
    .filter((p) => p.stock_qty > 0 && p.qty_30d <= 0 && (p.days_in_stock ?? p.product_age_days ?? 0) >= 30)
    .sort((a, b) => b.stock_value - a.stock_value);
  const slow = items
    .filter((p) => p.stock_qty > 0 && p.qty_30d > 0 && p.cover_days > 45 && p.cover_days <= 90)
    .sort((a, b) => b.cover_days - a.cover_days);
  const overstock = items
    .filter((p) => p.stock_qty > 0 && p.cover_days !== null && p.cover_days > 90)
    .map((p) => ({ ...p, excess_value: round2(Math.max(0, p.stock_qty - p.daily_30d * 45) * p.unit_cost) }))
    .sort((a, b) => b.excess_value - a.excess_value);
  const aging = items
    .filter((p) => p.stock_qty > 0 && p.days_in_stock !== null && p.days_in_stock > 60)
    .sort((a, b) => b.days_in_stock - a.days_in_stock);
  const restock = [...out.filter((p) => p.qty_30d > 0), ...low,
    ...items.filter((p) => p.status === 'ok' && p.cover_days !== null && p.cover_days < 7 && p.qty_30d > 0)]
    .map((p) => ({
      ...p,
      suggested_qty: Math.max(1, Math.ceil(Math.max(p.min_stock * 2, p.daily_30d * 14) - p.stock_qty)),
    }));

  const costValue = round2(items.reduce((s, p) => s + p.stock_value, 0));
  const retailValue = round2(items.reduce((s, p) => s + p.retail_value, 0));
  const deadValue = round2(dead.reduce((s, p) => s + p.stock_value, 0));
  const excessValue = round2(overstock.reduce((s, p) => s + p.excess_value, 0));

  // Kunlik ombor harakati (30 kun): kirim qiymati, sotuv tannarxi, yo'qotishlar va qoldiq qiymati
  const { rows: mv } = await db.query(
    `SELECT ${localDay('created_at')} AS day,
            COALESCE(SUM(value) FILTER (WHERE movement_type IN ('purchase', 'opening')), 0) AS purchased,
            COALESCE(SUM(value) FILTER (WHERE movement_type = 'return'), 0) AS returned,
            COALESCE(-SUM(value) FILTER (WHERE movement_type = 'sale'), 0) AS sold,
            COALESCE(-SUM(value) FILTER (WHERE movement_type IN ('damage', 'correction') AND value < 0), 0) AS lost,
            COALESCE(SUM(value) FILTER (WHERE movement_type = 'correction' AND value > 0), 0) AS found
       FROM stock_movements WHERE created_at >= $1 GROUP BY 1`,
    [tsStart(from)],
  );
  const days = listDays(from, today);
  const mvMap = new Map(mv.map((r) => [r.day, r]));
  const valueNow = await inventoryValueNow(db, settings.costing_method);
  const snap = snapshotSeries(valueNow, await inventoryDeltas(db, from), days, from);
  const movement = days.map((day, i) => {
    const r = mvMap.get(day) || {};
    return {
      day,
      inbound: round2(n(r.purchased) + n(r.returned) + n(r.found)),
      outbound: round2(r.sold),
      losses: round2(r.lost),
      value: snap.series[i],
    };
  });

  const { rows: recent } = await db.query(
    `SELECT m.id, m.movement_type, m.quantity, m.value, m.created_at, m.note, p.id AS product_id, p.name AS product_name,
            un.name AS unit, u.full_name AS user_name
       FROM stock_movements m JOIN products p ON p.id = m.product_id JOIN units un ON un.id = p.base_unit_id
       LEFT JOIN users u ON u.id = m.created_by
      ORDER BY m.created_at DESC, m.id DESC LIMIT 12`,
  );

  const summaryNotes = [];
  if (out.length) summaryNotes.push({ level: 'critical', text: `${out.length} ta mahsulot tugagan${out.filter((p) => p.qty_30d > 0).length ? `, ulardan ${out.filter((p) => p.qty_30d > 0).length} tasi yaqinda sotilgan` : ''}.` });
  if (low.length) summaryNotes.push({ level: 'warning', text: `${low.length} ta mahsulot minimal qoldiqdan kam — qayta buyurtma bering.` });
  if (dead.length) summaryNotes.push({ level: 'warning', text: `${fmtMoney(deadValue)} pul 30 kundan beri sotilmagan ${dead.length} ta mahsulotda muzlab turibdi.` });
  if (overstock.length) summaryNotes.push({ level: 'info', text: `${overstock.length} ta mahsulotda ortiqcha zaxira bor (≈ ${fmtMoney(excessValue)}).` });
  if (!summaryNotes.length && items.length) summaryNotes.push({ level: 'success', text: "Ombor holati yaxshi: tugagan yoki ortiqcha zaxira yo'q." });

  return {
    costing_method: settings.costing_method,
    totals: {
      products: items.length,
      in_stock: items.filter((p) => p.stock_qty > 0).length,
      qty_by_unit: [...unitMap.entries()].map(([unit, qty]) => ({ unit, qty })).sort((a, b) => b.qty - a.qty),
      cost_value: costValue,
      retail_value: financial ? retailValue : null,
      potential_profit: financial ? round2(retailValue - costValue) : null,
      low: low.length,
      out: out.length,
      dead: dead.length,
      dead_value: deadValue,
      slow: slow.length,
      overstock: overstock.length,
      excess_value: excessValue,
      aging: aging.length,
      healthy: items.filter((p) => p.status === 'ok' && !(p.cover_days > 90) && !(p.stock_qty > 0 && p.qty_30d <= 0)).length,
    },
    notes: summaryNotes,
    low: withRec(low),
    out: withRec(out),
    dead: withRec(dead),
    slow: withRec(slow),
    overstock: withRec(overstock),
    aging: withRec(aging),
    restock: withRec(restock),
    movement,
    recent,
  };
}

// ---------- Prognoz (keyingi 7 kun) ----------
// Usul: so'nggi 28 kunning vaznli o'rtachasi (yaqin kunlar ko'proq vazn bilan) x hafta kuni koeffitsienti.
// Natija taxmin: kafolatlangan foyda emas.

export async function forecast(db, { horizon = 7 } = {}) {
  const today = todayLocal();
  const histTo = addDays(today, -1);
  const histFrom = addDays(today, -56);
  const hist = await dailyPnl(db, histFrom, histTo);
  const last28 = hist.slice(-28);
  const activeDays = hist.filter((d) => d.sales_count > 0).length;
  const weekday = (day) => new Date(`${day}T00:00:00Z`).getUTCDay();

  let wsum = 0;
  let vsum = 0;
  last28.forEach((d, i) => {
    const w = 0.5 ** ((last28.length - 1 - i) / 14);
    wsum += w;
    vsum += w * d.net_revenue;
  });
  const level = wsum ? vsum / wsum : 0;
  const overall = hist.reduce((s, d) => s + d.net_revenue, 0) / (hist.length || 1);
  const factors = Array.from({ length: 7 }, (_, wd) => {
    const list = hist.filter((d) => weekday(d.day) === wd);
    if (!list.length || overall <= 0) return 1;
    const mean = list.reduce((s, d) => s + d.net_revenue, 0) / list.length;
    return 1 + (mean / overall - 1) * (list.length / (list.length + 2));
  });
  const resid = last28.map((d) => d.net_revenue - level * factors[weekday(d.day)]);
  const sd = resid.length ? Math.sqrt(resid.reduce((s, x) => s + x * x, 0) / resid.length) : 0;
  const rev28 = last28.reduce((s, d) => s + d.net_revenue, 0);
  const gp28 = last28.reduce((s, d) => s + d.gross_profit, 0);
  const margin = rev28 > 0 ? gp28 / rev28 : 0;
  const expDaily = last28.reduce((s, d) => s + d.expenses, 0) / 28;
  const lossDaily = last28.reduce((s, d) => s + d.losses, 0) / 28;

  const days = Array.from({ length: horizon }, (_, i) => {
    const day = addDays(today, i + 1);
    const revenue = Math.max(0, level * factors[weekday(day)]);
    const grossProfit = revenue * margin;
    return {
      day,
      revenue: round2(revenue),
      low: round2(Math.max(0, revenue - sd)),
      high: round2(revenue + sd),
      gross_profit: round2(grossProfit),
      net_profit: round2(grossProfit - expDaily - lossDaily),
    };
  });
  const sum = (f) => round2(days.reduce((s, d) => s + d[f], 0));
  const last7 = hist.slice(-7);
  let confidence = 'high';
  if (activeDays < 7) confidence = 'insufficient';
  else if (activeDays < 21) confidence = 'low';
  else if (activeDays < 42) confidence = 'medium';
  return {
    is_estimate: true,
    confidence,
    sufficient: confidence !== 'insufficient',
    method: "So'nggi 4 hafta savdosi (yaqin kunlar ko'proq hisobga olinadi) va hafta kunlari bo'yicha odatiy farq asosida hisoblangan taxmin.",
    basis: {
      history_from: histFrom,
      history_to: histTo,
      active_days: activeDays,
      gross_margin: round2(margin * 100),
      avg_daily_expenses: round2(expDaily),
      avg_daily_losses: round2(lossDaily),
    },
    days,
    totals: {
      revenue: sum('revenue'),
      low: sum('low'),
      high: sum('high'),
      gross_profit: sum('gross_profit'),
      net_profit: sum('net_profit'),
    },
    last7_actual: {
      revenue: round2(last7.reduce((s, d) => s + d.net_revenue, 0)),
      gross_profit: round2(last7.reduce((s, d) => s + d.gross_profit, 0)),
      net_profit: round2(last7.reduce((s, d) => s + d.net_profit, 0)),
    },
    history: hist.slice(-14).map((d) => ({ day: d.day, revenue: d.net_revenue, gross_profit: d.gross_profit })),
  };
}

// ---------- So'nggi amallar ----------

export async function recentActivity(db, { financial }) {
  const parts = [
    `(SELECT 'sale' AS kind, s.id, s.receipt_no AS ref, s.total AS amount, s.created_at AS at,
             COALESCE(c.name, 'Naqd mijoz') AS party
        FROM sales s LEFT JOIN customers c ON c.id = s.customer_id WHERE s.kind = 'sale' ORDER BY s.created_at DESC LIMIT 8)`,
    `(SELECT 'payment', cp.id, 'Qarz to''lovi', cp.amount, cp.created_at, c.name
        FROM customer_payments cp JOIN customers c ON c.id = cp.customer_id ORDER BY cp.created_at DESC LIMIT 5)`,
  ];
  if (financial) {
    parts.push(
      `(SELECT 'purchase', p.id, p.purchase_no, p.total, p.created_at, sp.name
          FROM purchases p JOIN suppliers sp ON sp.id = p.supplier_id WHERE p.kind = 'purchase' ORDER BY p.created_at DESC LIMIT 5)`,
      `(SELECT 'expense', e.id, e.category, e.amount, e.created_at, COALESCE(e.description, '')
          FROM expenses e ORDER BY e.created_at DESC LIMIT 5)`,
    );
  }
  const { rows } = await db.query(`${parts.join(' UNION ALL ')} ORDER BY at DESC LIMIT 10`);
  return rows;
}

// ---------- Bosh sahifa ----------

export async function dashboard(db, user, query) {
  const can = (k) => Boolean(user.permissions?.[k]);
  const financial = can('reports.view');
  const stockAccess = financial || can('stock.view');
  const debtAccess = financial || can('customers.view');
  const range = resolveRange(query);
  const settings = await getSettings(db);
  const trendFrom = range.days >= 7 ? range.from : addDays(range.to, -6);
  const trendDays = listDays(trendFrom, range.to);
  const hourly = range.days === 1;

  const [cur, prev, chartCur, chartPrev, trend, invNow, invD, debtNow, debtD, supDebt, recent] = await Promise.all([
    pnlTotals(db, range.fromTs, range.toTs, range.from, range.to),
    pnlTotals(db, range.prevFromTs, range.prevToTs, range.prevFrom, range.prevTo),
    hourly ? hourlyPnl(db, range.fromTs, range.toTs) : dailyPnl(db, range.from, range.to),
    hourly ? hourlyPnl(db, range.prevFromTs, tsStart(addDays(range.prevTo, 1))) : dailyPnl(db, range.prevFrom, range.prevTo),
    range.days >= 7 ? null : dailyPnl(db, trendFrom, range.to),
    stockAccess ? inventoryValueNow(db, settings.costing_method) : null,
    stockAccess ? inventoryDeltas(db, trendFrom) : null,
    debtAccess ? customerDebtNow(db) : null,
    debtAccess ? debtDeltas(db, trendFrom) : null,
    financial ? supplierDebtNow(db) : null,
    recentActivity(db, { financial }),
  ]);
  const trendSeries = trend || chartCur;
  const spark = (f) => trendSeries.map((d) => d[f]);
  const kpi = (value, previous, sparkline, extra = {}) => ({
    value: round2(value), previous: round2(previous), change: pctChange(value, previous), spark: sparkline, ...extra,
  });

  const kpis = {
    revenue: kpi(cur.net_revenue, prev.net_revenue, spark('net_revenue'), { gross: cur.gross_revenue }),
    sales_count: kpi(cur.sales_count, prev.sales_count, spark('sales_count'), {
      avg_order: cur.avg_order, prev_avg_order: prev.avg_order, lines: cur.lines, products_sold: cur.products_sold,
    }),
  };
  if (financial) {
    kpis.net_profit = kpi(cur.net_profit, prev.net_profit, spark('net_profit'), { margin: cur.net_margin });
    kpis.expenses = kpi(cur.expenses, prev.expenses, spark('expenses'), { losses: cur.losses });
  }
  if (stockAccess) {
    const snap = snapshotSeries(invNow, invD, trendDays, range.from);
    kpis.inventory_value = kpi(invNow, snap.start, snap.series, { as_of_start: true });
  }
  if (debtAccess) {
    const snap = snapshotSeries(debtNow, debtD, trendDays, range.from);
    kpis.customer_debt = kpi(debtNow, snap.start, snap.series, { as_of_start: true });
  }

  const strip = (d) => (financial ? d : {
    day: d.day, sales_count: d.sales_count, net_revenue: d.net_revenue, avg_order: d.avg_order,
  });

  const out = {
    range,
    store_name: settings.store_name,
    generated_at: new Date().toISOString(),
    access: { financial, stock: stockAccess, debts: debtAccess },
    kpis,
    chart: {
      grain: hourly ? 'hour' : 'day',
      current: chartCur.map(strip),
      previous: chartPrev.map(strip),
    },
    sales: {
      net_revenue: cur.net_revenue,
      sales_count: cur.sales_count,
      avg_order: cur.avg_order,
      lines: cur.lines,
      previous: { net_revenue: prev.net_revenue, sales_count: prev.sales_count, avg_order: prev.avg_order },
    },
    recent,
  };

  if (financial) {
    out.pnl = { current: cur, previous: prev };
    out.supplier_debt = supDebt;
    const items = await productStats(db, range, settings.costing_method);
    out.top = topLists(items);
    out.forecast = await forecast(db);
  }
  if (stockAccess) {
    const { rows } = await db.query(
      `SELECT COUNT(*) FILTER (WHERE NOT is_archived)::int AS products,
              COUNT(*) FILTER (WHERE NOT is_archived AND min_stock > 0 AND stock_qty > 0 AND stock_qty <= min_stock)::int AS low,
              COUNT(*) FILTER (WHERE NOT is_archived AND stock_qty <= 0)::int AS out
         FROM products`,
    );
    out.stock = rows[0];
  }
  return out;
}

// ---------- Savdo tahlili (hisobotlar) ----------

export async function salesAnalytics(db, query) {
  const range = resolveRange(query);
  const grain = ['daily', 'weekly', 'monthly'].includes(query.grain) ? query.grain : (range.days > 92 ? 'monthly' : range.days > 31 ? 'weekly' : 'daily');
  const [cur, prev, days, prevDays, methods, hours] = await Promise.all([
    pnlTotals(db, range.fromTs, range.toTs, range.from, range.to),
    pnlTotals(db, range.prevFromTs, range.prevToTs, range.prevFrom, range.prevTo),
    dailyPnl(db, range.from, range.to),
    dailyPnl(db, range.prevFrom, range.prevTo),
    db.query(
      `SELECT payment_method AS method, COUNT(*)::int AS cnt, COALESCE(SUM(total), 0) AS total
         FROM sales WHERE created_at >= $1 AND created_at < $2 AND kind = 'sale' GROUP BY 1 ORDER BY 3 DESC`,
      [range.fromTs, range.toTs],
    ),
    db.query(
      `SELECT EXTRACT(HOUR FROM created_at AT TIME ZONE '${TZ}')::int AS hour, COUNT(*)::int AS cnt, COALESCE(SUM(total), 0) AS total
         FROM sales WHERE created_at >= $1 AND created_at < $2 AND kind = 'sale' GROUP BY 1 ORDER BY 1`,
      [range.fromTs, range.toTs],
    ),
  ]);
  return {
    range,
    grain,
    totals: cur,
    previous: prev,
    days,
    previous_days: prevDays,
    rows: groupSeries(days, grain),
    by_method: methods.rows.map((r) => ({ method: r.method, count: r.cnt, total: round2(r.total) })),
    by_hour: hours.rows.map((r) => ({ hour: r.hour, count: r.cnt, total: round2(r.total) })),
  };
}

export async function pnlReport(db, query) {
  const range = resolveRange(query);
  const [cur, prev, days, exp, cash] = await Promise.all([
    pnlTotals(db, range.fromTs, range.toTs, range.from, range.to),
    pnlTotals(db, range.prevFromTs, range.prevToTs, range.prevFrom, range.prevTo),
    dailyPnl(db, range.from, range.to),
    db.query(
      `SELECT category, COALESCE(SUM(amount), 0) AS total, COUNT(*)::int AS cnt FROM expenses
        WHERE expense_date BETWEEN $1::date AND $2::date GROUP BY 1 ORDER BY 2 DESC`,
      [range.from, range.to],
    ),
    cashFlow(db, range),
  ]);
  return {
    range,
    current: cur,
    previous: prev,
    days,
    expenses_by_category: exp.rows.map((r) => ({ category: r.category, total: round2(r.total), count: r.cnt })),
    cash: cash,
    debts: { customers: await customerDebtNow(db), suppliers: await supplierDebtNow(db) },
  };
}

// Pul oqimi: kassaga kirgan va chiqqan pul (savdo, qarz to'lovlari, xarajatlar, yetkazib beruvchilarga to'lov)
export async function cashFlow(db, range) {
  const [{ rows }, bal] = await Promise.all([
    db.query(
      `SELECT category, direction, method, COALESCE(SUM(amount), 0) AS amount
         FROM cash_transactions WHERE created_at >= $1 AND created_at < $2 GROUP BY 1, 2, 3`,
      [range.fromTs, range.toTs],
    ),
    db.query(
      `SELECT method, COALESCE(SUM(CASE WHEN direction = 'in' THEN amount ELSE -amount END), 0) AS balance
         FROM cash_transactions GROUP BY method`,
    ),
  ]);
  const byCat = {};
  const byMethod = { cash: { in: 0, out: 0 }, card: { in: 0, out: 0 }, transfer: { in: 0, out: 0 } };
  let inflow = 0;
  let outflow = 0;
  for (const r of rows) {
    const amt = n(r.amount);
    const key = `${r.category}`;
    byCat[key] = byCat[key] || { category: r.category, direction: r.direction, amount: 0 };
    byCat[key].amount = round2(byCat[key].amount + amt);
    if (byMethod[r.method]) byMethod[r.method][r.direction] = round2(byMethod[r.method][r.direction] + amt);
    if (r.direction === 'in') inflow += amt;
    else outflow += amt;
  }
  const balances = { cash: 0, card: 0, transfer: 0 };
  for (const r of bal.rows) balances[r.method] = round2(r.balance);
  return {
    inflow: round2(inflow),
    outflow: round2(outflow),
    net: round2(inflow - outflow),
    by_category: Object.values(byCat).sort((a, b) => b.amount - a.amount),
    by_method: byMethod,
    balances: { ...balances, total: round2(balances.cash + balances.card + balances.transfer) },
  };
}

// ---------- Haftalik hisobot ----------

export async function weeklyReport(db, query, method) {
  const today = todayLocal();
  const current = mondayOf(today);
  let start = isDate(query.start) ? mondayOf(query.start) : current;
  if (start > current) start = current;
  const end = addDays(start, 6);
  const range = resolveRange({ from: start, to: end }, { shiftDays: 7 });
  const [cur, prev, days, prevDays, items] = await Promise.all([
    pnlTotals(db, range.fromTs, range.toTs, range.from, range.to),
    pnlTotals(db, range.prevFromTs, range.prevToTs, range.prevFrom, range.prevTo),
    dailyPnl(db, start, range.to),
    dailyPnl(db, addDays(start, -7), addDays(start, -1)),
    productStats(db, range, method),
  ]);
  const byDay = new Map(days.map((d) => [d.day, d]));
  const rows = listDays(start, end).map((day, i) => ({
    ...(byDay.get(day) || emptyDay(day)),
    future: day > today,
    previous: prevDays[i],
  }));
  const sold = items.filter((p) => p.revenue > 0);
  const inStock = items.filter((p) => !p.is_archived && p.stock_qty > 0);
  const worst = [...inStock].sort((a, b) => a.revenue - b.revenue || b.stock_value - a.stock_value)[0] || null;
  return {
    start,
    end,
    is_current: start === current,
    days_elapsed: range.days,
    range,
    totals: cur,
    previous: prev,
    days: rows,
    best_product: [...sold].sort((a, b) => b.revenue - a.revenue)[0] || null,
    most_profitable: [...sold].filter((p) => p.profit > 0).sort((a, b) => b.profit - a.profit)[0] || null,
    worst_product: worst,
    top: topLists(items),
  };
}

// ---------- Mijoz qarzlari ----------

export async function customerDebts(db) {
  const today = todayLocal();
  const [{ rows }, pays, collected] = await Promise.all([
    db.query(
      `SELECT c.id, c.name, c.phone,
              SUM(s.balance_due) AS debt, COUNT(*)::int AS open_sales,
              MIN(s.created_at) AS oldest_at, MIN(s.due_date) FILTER (WHERE s.due_date IS NOT NULL) AS next_due,
              COALESCE(SUM(s.balance_due) FILTER (WHERE s.due_date < $1::date), 0) AS overdue,
              COALESCE(SUM(s.balance_due) FILTER (WHERE s.created_at >= now() - interval '30 days'), 0) AS a30,
              COALESCE(SUM(s.balance_due) FILTER (WHERE s.created_at < now() - interval '30 days' AND s.created_at >= now() - interval '60 days'), 0) AS a60,
              COALESCE(SUM(s.balance_due) FILTER (WHERE s.created_at < now() - interval '60 days' AND s.created_at >= now() - interval '90 days'), 0) AS a90,
              COALESCE(SUM(s.balance_due) FILTER (WHERE s.created_at < now() - interval '90 days'), 0) AS a90p,
              (SELECT MAX(cp.created_at) FROM customer_payments cp WHERE cp.customer_id = c.id) AS last_payment_at
         FROM sales s JOIN customers c ON c.id = s.customer_id
        WHERE s.balance_due > 0
        GROUP BY c.id ORDER BY SUM(s.balance_due) DESC`,
      [today],
    ),
    db.query(
      `SELECT cp.id, cp.amount, cp.method, cp.created_at, c.id AS customer_id, c.name AS customer_name
         FROM customer_payments cp JOIN customers c ON c.id = cp.customer_id
        ORDER BY cp.created_at DESC LIMIT 10`,
    ),
    db.query(
      `SELECT COALESCE(SUM(amount), 0) AS v FROM customer_payments WHERE created_at >= now() - interval '30 days'`,
    ),
  ]);
  const customers = rows.map((r) => ({
    id: r.id,
    name: r.name,
    phone: r.phone,
    debt: round2(r.debt),
    open_sales: r.open_sales,
    oldest_at: r.oldest_at,
    next_due: r.next_due,
    overdue: round2(r.overdue),
    aging: { d30: round2(r.a30), d60: round2(r.a60), d90: round2(r.a90), d90p: round2(r.a90p) },
    last_payment_at: r.last_payment_at,
    status: n(r.overdue) > 0 ? 'overdue' : r.next_due && r.next_due <= addDays(today, 3) ? 'due_soon' : 'open',
  }));
  const sum = (f) => round2(customers.reduce((s, c) => s + f(c), 0));
  return {
    totals: {
      debt: sum((c) => c.debt),
      overdue: sum((c) => c.overdue),
      customers: customers.length,
      overdue_customers: customers.filter((c) => c.overdue > 0).length,
      collected_30d: round2(collected.rows[0].v),
      aging: {
        d30: sum((c) => c.aging.d30), d60: sum((c) => c.aging.d60), d90: sum((c) => c.aging.d90), d90p: sum((c) => c.aging.d90p),
      },
    },
    customers,
    recent_payments: pays.rows,
  };
}

// ---------- Xodimlar samaradorligi ----------

export async function staffPerformance(db, query, { userId = null } = {}) {
  const range = resolveRange(query);
  const params = [range.fromTs, range.toTs];
  const own = userId ? ` AND s.cashier_id = $3` : '';
  if (userId) params.push(userId);
  const prevParams = [range.prevFromTs, range.prevToTs, ...(userId ? [userId] : [])];
  const [cur, prev, daily, returns, users] = await Promise.all([
    db.query(
      `SELECT s.cashier_id AS id, COUNT(*)::int AS cnt, SUM(s.total) AS total, SUM(s.gross_total) AS gross,
              SUM(s.discount_total) AS disc, SUM(s.cost_total) AS cost, SUM(s.credit_amount) AS credit,
              COUNT(*) FILTER (WHERE s.discount_total > 0)::int AS discounted,
              (SELECT COUNT(*) FROM sale_items si JOIN sales s2 ON s2.id = si.sale_id
                WHERE s2.cashier_id = s.cashier_id AND s2.created_at >= $1 AND s2.created_at < $2)::int AS lines
         FROM sales s WHERE s.created_at >= $1 AND s.created_at < $2 AND s.kind = 'sale'${own} GROUP BY s.cashier_id`,
      params,
    ),
    db.query(
      `SELECT s.cashier_id AS id, COUNT(*)::int AS cnt, SUM(s.total) AS total
         FROM sales s WHERE s.created_at >= $1 AND s.created_at < $2 AND s.kind = 'sale'${own} GROUP BY s.cashier_id`,
      prevParams,
    ),
    db.query(
      `SELECT s.cashier_id AS id, ${localDay('s.created_at')} AS day, SUM(s.total) AS total, COUNT(*)::int AS cnt
         FROM sales s WHERE s.created_at >= $1 AND s.created_at < $2 AND s.kind = 'sale'${own} GROUP BY 1, 2`,
      params,
    ),
    db.query(
      `SELECT s.cashier_id AS id, COALESCE(SUM(r.amount), 0) AS amount, COUNT(DISTINCT r.return_no)::int AS cnt,
              COALESCE(SUM(r.cost), 0) AS cost
         FROM sale_returns r JOIN sales s ON s.id = r.sale_id
        WHERE r.created_at >= $1 AND r.created_at < $2${own} GROUP BY 1`,
      params,
    ),
    db.query(`SELECT id, full_name, role, is_active FROM users ${userId ? 'WHERE id = $1' : ''} ORDER BY id`, userId ? [userId] : []),
  ]);
  const map = (rows) => new Map(rows.map((r) => [r.id, r]));
  const c = map(cur.rows);
  const p = map(prev.rows);
  const r = map(returns.rows);
  const days = listDays(range.from, range.to);
  const total = cur.rows.reduce((s, x) => s + n(x.total), 0) - returns.rows.reduce((s, x) => s + n(x.amount), 0);
  const staff = users.rows
    .map((u) => {
      const x = c.get(u.id) || {};
      const ret = r.get(u.id) || {};
      const pr = p.get(u.id) || {};
      const net = round2(n(x.total) - n(ret.amount));
      const gp = round2(net - (n(x.cost) - n(ret.cost)));
      const dayMap = new Map(daily.rows.filter((d) => d.id === u.id).map((d) => [d.day, n(d.total)]));
      return {
        id: u.id,
        full_name: u.full_name,
        role: u.role,
        is_active: u.is_active,
        sales_count: x.cnt || 0,
        net_revenue: net,
        gross_profit: gp,
        avg_order: x.cnt ? round2(n(x.total) / x.cnt) : 0,
        discounts: round2(x.disc),
        discounted_sales: x.discounted || 0,
        credit_sales: round2(x.credit),
        lines: x.lines || 0,
        returns: round2(ret.amount),
        returns_count: ret.cnt || 0,
        share: total > 0 ? round2((net / total) * 100) : 0,
        previous: { sales_count: pr.cnt || 0, total: round2(pr.total) },
        change: pctChange(n(x.total), n(pr.total)),
        trend: days.map((d) => round2(dayMap.get(d) || 0)),
      };
    })
    .filter((s) => s.is_active || s.sales_count > 0)
    .sort((a, b) => b.net_revenue - a.net_revenue);
  return { range, days, staff, total_net_revenue: round2(total) };
}

export function assertRange(query) {
  if (query.from && !isDate(query.from)) throw new HttpError(400, "Sana noto'g'ri formatda (YYYY-MM-DD)");
  if (query.to && !isDate(query.to)) throw new HttpError(400, "Sana noto'g'ri formatda (YYYY-MM-DD)");
}
