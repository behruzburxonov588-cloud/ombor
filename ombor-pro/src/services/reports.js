// Moliyaviy hisob-kitoblar. Dashboard va hisobotlar shu funksiyalardan foydalanadi.
//
// Qoidalar:
//  - Sof tushum = sotuvlar jami - qaytarilgan tovarlar (qaytarilgan kun bo'yicha)
//  - Yalpi foyda = sof tushum - sotilgan tovarlar tannarxi
//  - Sof foyda = yalpi foyda - xarajatlar - zarar (yaroqsiz va kamomad)
//  - Nasiya sotuv tushum hisoblanadi, lekin naqd tushum hisoblanmaydi

import { round2 } from '../util.js';

const TZ = 'Asia/Tashkent';

export async function financeSummary(db, period) {
  const { from, to, fromDate, toDate } = period;
  const [sales, returns, cash, exp, loss, purch] = await Promise.all([
    db.query(
      `SELECT COUNT(*)::int AS count, COALESCE(SUM(total), 0) AS gross,
              COALESCE(SUM(cost_total), 0) AS cogs, COALESCE(SUM(credit_amount), 0) AS credit
         FROM sales WHERE created_at >= $1 AND created_at < $2 AND kind = 'sale'`,
      [from, to],
    ),
    db.query(
      `SELECT COALESCE(SUM(amount), 0) AS amount, COALESCE(SUM(cost), 0) AS cost,
              COALESCE(SUM(refund_amount), 0) AS refunds
         FROM sale_returns WHERE created_at >= $1 AND created_at < $2`,
      [from, to],
    ),
    db.query(
      `SELECT category, direction, COALESCE(SUM(amount), 0) AS amount
         FROM cash_transactions WHERE created_at >= $1 AND created_at < $2
        GROUP BY category, direction`,
      [from, to],
    ),
    db.query(
      'SELECT COALESCE(SUM(amount), 0) AS total FROM expenses WHERE expense_date BETWEEN $1::date AND $2::date',
      [fromDate, toDate],
    ),
    db.query(
      `SELECT COALESCE(-SUM(value), 0) AS loss FROM stock_movements
        WHERE movement_type IN ('damage', 'correction') AND created_at >= $1 AND created_at < $2`,
      [from, to],
    ),
    db.query(
      `SELECT COUNT(*)::int AS count, COALESCE(SUM(total), 0) AS total FROM purchases
        WHERE purchase_date BETWEEN $1::date AND $2::date AND kind = 'purchase'`,
      [fromDate, toDate],
    ),
  ]);

  const cashMap = {};
  for (const r of cash.rows) cashMap[`${r.category}:${r.direction}`] = Number(r.amount);
  const c = (key) => cashMap[key] || 0;

  const gross = round2(sales.rows[0].gross);
  const returnsAmount = round2(returns.rows[0].amount);
  const netSales = round2(gross - returnsAmount);
  const cogs = round2(sales.rows[0].cogs - returns.rows[0].cost);
  const grossProfit = round2(netSales - cogs);
  const expenses = round2(exp.rows[0].total);
  const losses = round2(loss.rows[0].loss);
  const netProfit = round2(grossProfit - expenses - losses);

  return {
    sales_count: sales.rows[0].count,
    gross_sales: gross,
    returns_amount: returnsAmount,
    net_sales: netSales,
    cogs,
    gross_profit: grossProfit,
    margin_percent: netSales > 0 ? round2((grossProfit / netSales) * 100) : 0,
    expenses,
    losses,
    net_profit: netProfit,
    credit_sales: round2(sales.rows[0].credit),
    cash_received: round2(c('sale:in') + c('customer_payment:in')),
    customer_payments: round2(c('customer_payment:in')),
    supplier_payments: round2(c('supplier_payment:out')),
    refunds: round2(returns.rows[0].refunds),
    purchases_total: round2(purch.rows[0].total),
    purchases_count: purch.rows[0].count,
  };
}

// Kunlik seriya (dashboard grafigi uchun)
export async function dailySeries(db, fromDate, toDate, from, to) {
  const [s, r] = await Promise.all([
    db.query(
      `SELECT (created_at AT TIME ZONE '${TZ}')::date::text AS day,
              SUM(total) AS gross, SUM(cost_total) AS cogs
         FROM sales WHERE created_at >= $1 AND created_at < $2 AND kind = 'sale' GROUP BY 1`,
      [from, to],
    ),
    db.query(
      `SELECT (created_at AT TIME ZONE '${TZ}')::date::text AS day,
              SUM(amount) AS amount, SUM(cost) AS cost
         FROM sale_returns WHERE created_at >= $1 AND created_at < $2 GROUP BY 1`,
      [from, to],
    ),
  ]);
  const sMap = new Map(s.rows.map((x) => [x.day, x]));
  const rMap = new Map(r.rows.map((x) => [x.day, x]));
  const days = [];
  const cursor = new Date(`${fromDate}T00:00:00Z`);
  const end = new Date(`${toDate}T00:00:00Z`);
  while (cursor <= end) {
    const day = cursor.toISOString().slice(0, 10);
    const sr = sMap.get(day) || {};
    const rr = rMap.get(day) || {};
    const netSales = round2(Number(sr.gross || 0) - Number(rr.amount || 0));
    const grossProfit = round2(netSales - (Number(sr.cogs || 0) - Number(rr.cost || 0)));
    days.push({ day, net_sales: netSales, gross_profit: grossProfit });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return days;
}

const PERIOD_UNITS = { daily: 'day', weekly: 'week', monthly: 'month', yearly: 'year' };

// Davr bo'yicha (kun/hafta/oy/yil) sotuv hisoboti
export async function periodSeries(db, period, kind) {
  const unit = PERIOD_UNITS[kind] || 'day';
  const { from, to, fromDate, toDate } = period;
  const [s, r, e] = await Promise.all([
    db.query(
      `SELECT to_char(date_trunc($1, created_at AT TIME ZONE '${TZ}'), 'YYYY-MM-DD') AS period,
              COUNT(*)::int AS sales_count, SUM(total) AS gross, SUM(cost_total) AS cogs
         FROM sales WHERE created_at >= $2 AND created_at < $3 AND kind = 'sale' GROUP BY 1`,
      [unit, from, to],
    ),
    db.query(
      `SELECT to_char(date_trunc($1, created_at AT TIME ZONE '${TZ}'), 'YYYY-MM-DD') AS period,
              SUM(amount) AS amount, SUM(cost) AS cost
         FROM sale_returns WHERE created_at >= $2 AND created_at < $3 GROUP BY 1`,
      [unit, from, to],
    ),
    db.query(
      `SELECT to_char(date_trunc($1, expense_date::timestamp), 'YYYY-MM-DD') AS period, SUM(amount) AS amount
         FROM expenses WHERE expense_date BETWEEN $2::date AND $3::date GROUP BY 1`,
      [unit, fromDate, toDate],
    ),
  ]);
  const map = new Map();
  const row = (k) => {
    if (!map.has(k)) map.set(k, { period: k, sales_count: 0, gross: 0, returns: 0, cogs_gross: 0, returns_cost: 0, expenses: 0 });
    return map.get(k);
  };
  for (const x of s.rows) Object.assign(row(x.period), { sales_count: x.sales_count, gross: Number(x.gross), cogs_gross: Number(x.cogs) });
  for (const x of r.rows) Object.assign(row(x.period), { returns: Number(x.amount), returns_cost: Number(x.cost) });
  for (const x of e.rows) row(x.period).expenses = Number(x.amount);

  return [...map.values()]
    .sort((a, b) => a.period.localeCompare(b.period))
    .map((x) => {
      const net = round2(x.gross - x.returns);
      const cogs = round2(x.cogs_gross - x.returns_cost);
      const grossProfit = round2(net - cogs);
      return {
        period: x.period,
        sales_count: x.sales_count,
        gross_sales: round2(x.gross),
        returns: round2(x.returns),
        net_sales: net,
        cogs,
        gross_profit: grossProfit,
        expenses: round2(x.expenses),
        net_profit: round2(grossProfit - x.expenses),
      };
    });
}

// Tovar bo'yicha foyda (qaytarishlar hisobga olingan)
export async function productProfitability(db, period) {
  const { rows } = await db.query(
    `WITH sold AS (
        SELECT si.product_id, SUM(si.line_total) AS amt, SUM(si.cost_total) AS cost, SUM(si.base_quantity) AS qty
          FROM sale_items si JOIN sales s ON s.id = si.sale_id
         WHERE s.created_at >= $1 AND s.created_at < $2
         GROUP BY si.product_id),
      ret AS (
        SELECT product_id, SUM(amount) AS amt, SUM(cost) AS cost, SUM(base_quantity) AS qty
          FROM sale_returns WHERE created_at >= $1 AND created_at < $2
         GROUP BY product_id)
     SELECT p.id, p.name, p.stock_qty, un.name AS unit,
            COALESCE(sold.qty, 0) - COALESCE(ret.qty, 0) AS qty,
            COALESCE(sold.amt, 0) - COALESCE(ret.amt, 0) AS revenue,
            COALESCE(sold.cost, 0) - COALESCE(ret.cost, 0) AS cogs
       FROM products p
       JOIN units un ON un.id = p.base_unit_id
       LEFT JOIN sold ON sold.product_id = p.id
       LEFT JOIN ret ON ret.product_id = p.id
      WHERE p.is_archived = FALSE OR sold.product_id IS NOT NULL
      ORDER BY revenue DESC, p.name`,
    [period.from, period.to],
  );
  return rows.map((r) => {
    const revenue = round2(r.revenue);
    const cogs = round2(r.cogs);
    const profit = round2(revenue - cogs);
    return {
      id: r.id,
      name: r.name,
      unit: r.unit,
      stock_qty: Number(r.stock_qty),
      qty_sold: Number(r.qty),
      revenue,
      cogs,
      profit,
      margin_percent: revenue > 0 ? round2((profit / revenue) * 100) : 0,
    };
  });
}
