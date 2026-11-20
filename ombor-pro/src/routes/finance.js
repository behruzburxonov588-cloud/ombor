// Kassa, xarajatlar, bosh sahifa, hisobotlar, tarix, qidiruv va sozlamalar
import { Router } from 'express';
import { pool, withTransaction } from '../db.js';
import { requirePerm, can } from '../auth.js';
import { HttpError, num, round2, str, todayLocal, addDays, periodBounds, dateStr, paging } from '../util.js';
import { recordCash, balances, currentShiftId } from '../services/cash.js';
import { getSettings, saveSettings } from '../services/settings.js';
import { financeSummary, dailySeries, periodSeries, productProfitability } from '../services/reports.js';
import { audit } from '../audit.js';
import { createBackup } from '../services/backup.js';

const router = Router();
const EXPENSE_CATEGORIES = ['rent', 'salaries', 'utilities', 'delivery', 'transport', 'repairs', 'other'];
const METHODS = ['cash', 'card', 'transfer'];

// ---------- Kassa ----------

async function shiftWithExpected(db, shift) {
  if (!shift) return null;
  const { rows } = await db.query(
    `SELECT COALESCE(SUM(CASE WHEN direction = 'in' THEN amount ELSE -amount END), 0) AS movement
       FROM cash_transactions WHERE shift_id = $1 AND method = 'cash'`,
    [shift.id],
  );
  const expected = round2(Number(shift.opening_amount) + Number(rows[0].movement));
  return { ...shift, expected_amount: shift.status === 'open' ? expected : shift.expected_amount };
}

router.get('/cash/summary', requirePerm('cash.view', 'cash.shift', 'dashboard.view'), async (req, res) => {
  const bal = await balances(pool);
  const { rows } = await pool.query("SELECT * FROM cash_shifts WHERE status = 'open'");
  const shift = await shiftWithExpected(pool, rows[0] || null);
  const today = periodBounds(todayLocal(), todayLocal());
  const { rows: t } = await pool.query(
    `SELECT method, direction, COALESCE(SUM(amount), 0) AS amount
       FROM cash_transactions WHERE created_at >= $1 AND created_at < $2 GROUP BY method, direction`,
    [today.from, today.to],
  );
  const todayMap = {};
  for (const r of t) todayMap[`${r.method}:${r.direction}`] = Number(r.amount);
  res.json({
    balances: { ...bal, total: round2(bal.cash + bal.card + bal.transfer) },
    shift,
    today: todayMap,
  });
});

router.get('/cash/transactions', requirePerm('cash.view'), async (req, res) => {
  const period = periodBounds(req.query.from, req.query.to);
  const params = [period.from, period.to];
  let extra = '';
  if (req.query.method && METHODS.includes(req.query.method)) {
    params.push(req.query.method);
    extra = ` AND t.method = $${params.length}`;
  }
  const { limit, offset } = paging(req.query, { limit: 200, max: 1000 });
  const { rows } = await pool.query(
    `SELECT t.*, u.full_name AS user_name FROM cash_transactions t
       LEFT JOIN users u ON u.id = t.created_by
      WHERE t.created_at >= $1 AND t.created_at < $2${extra}
      ORDER BY t.created_at DESC, t.id DESC LIMIT ${limit} OFFSET ${offset}`,
    params,
  );
  res.json({ transactions: rows });
});

// Naqd depozit (kiritish) yoki pul olish (yechish)
router.post('/cash/movements', requirePerm('cash.manage'), async (req, res) => {
  const body = req.body || {};
  const kind = body.kind;
  if (!['deposit', 'withdrawal'].includes(kind)) throw new HttpError(400, "Amal turi noto'g'ri");
  const method = body.method || 'cash';
  if (!METHODS.includes(method)) throw new HttpError(400, "To'lov usuli noto'g'ri");
  const amount = round2(num(body.amount, 'Summa', { positive: true }));
  const note = str(body.note, 'Izoh', { max: 200, required: true });
  await withTransaction(async (client) => {
    await recordCash(client, {
      direction: kind === 'deposit' ? 'in' : 'out', method, category: kind, amount,
      refType: 'manual', note, userId: req.user.id,
    });
    await audit(client, req.user.id, `cash.${kind}`, 'cash', null, { amount, method, note });
  });
  res.status(201).json({ ok: true });
});

router.post('/cash/shifts/open', requirePerm('cash.shift'), async (req, res) => {
  const opening = round2(num(req.body?.opening_amount, 'Ochilish qoldig\'i', { min: 0, optional: true }));
  const shift = await withTransaction(async (client) => {
    if (await currentShiftId(client)) throw new HttpError(409, 'Smena allaqachon ochiq');
    const { rows } = await client.query(
      `INSERT INTO cash_shifts (status, opened_by, opening_amount) VALUES ('open', $1, $2) RETURNING *`,
      [req.user.id, opening],
    );
    await audit(client, req.user.id, 'shift.open', 'cash_shift', rows[0].id, { opening });
    return rows[0];
  });
  res.status(201).json({ shift: await shiftWithExpected(pool, shift) });
});

router.post('/cash/shifts/close', requirePerm('cash.shift'), async (req, res) => {
  const counted = round2(num(req.body?.counted_amount, 'Sanalgan naqd pul', { min: 0 }));
  const result = await withTransaction(async (client) => {
    const { rows } = await client.query("SELECT * FROM cash_shifts WHERE status = 'open' FOR UPDATE");
    if (!rows[0]) throw new HttpError(400, 'Ochiq smena yo\'q');
    const shift = await shiftWithExpected(client, rows[0]);
    const expected = shift.expected_amount;
    const difference = round2(counted - expected);
    await client.query(
      `UPDATE cash_shifts SET status = 'closed', closed_by = $2, closed_at = now(),
              expected_amount = $3, counted_amount = $4, difference = $5 WHERE id = $1`,
      [rows[0].id, req.user.id, expected, counted, difference],
    );
    await audit(client, req.user.id, 'shift.close', 'cash_shift', rows[0].id, { expected, counted, difference });
    return { expected, counted, difference, shift_id: rows[0].id };
  });
  res.json(result);
});

router.get('/cash/shifts', requirePerm('cash.view', 'cash.shift'), async (req, res) => {
  const { rows } = await pool.query(
    `SELECT s.*, uo.full_name AS opened_by_name, uc.full_name AS closed_by_name
       FROM cash_shifts s
       LEFT JOIN users uo ON uo.id = s.opened_by
       LEFT JOIN users uc ON uc.id = s.closed_by
      ORDER BY s.id DESC LIMIT 50`,
  );
  const out = [];
  for (const r of rows) out.push(await shiftWithExpected(pool, r));
  res.json({ shifts: out });
});

// ---------- Xarajatlar ----------

router.get('/expenses', requirePerm('expenses.view', 'reports.view'), async (req, res) => {
  const period = periodBounds(req.query.from, req.query.to);
  const { rows } = await pool.query(
    `SELECT e.*, u.full_name AS user_name FROM expenses e LEFT JOIN users u ON u.id = e.created_by
      WHERE e.expense_date BETWEEN $1::date AND $2::date
      ORDER BY e.expense_date DESC, e.id DESC LIMIT 300`,
    [period.fromDate, period.toDate],
  );
  const { rows: byCat } = await pool.query(
    `SELECT category, SUM(amount) AS total FROM expenses
      WHERE expense_date BETWEEN $1::date AND $2::date GROUP BY category`,
    [period.fromDate, period.toDate],
  );
  res.json({
    expenses: rows,
    by_category: byCat,
    // Jami — ro'yxat cheklovidan (300 ta) qat'i nazar, barcha xarajatlar bo'yicha
    total: round2(byCat.reduce((sum, r) => sum + Number(r.total), 0)),
    categories: EXPENSE_CATEGORIES,
  });
});

router.post('/expenses', requirePerm('expenses.manage'), async (req, res) => {
  const body = req.body || {};
  if (!EXPENSE_CATEGORIES.includes(body.category)) throw new HttpError(400, "Xarajat turkumi noto'g'ri");
  const method = body.method || 'cash';
  if (!METHODS.includes(method)) throw new HttpError(400, "To'lov usuli noto'g'ri");
  const amount = round2(num(body.amount, 'Summa', { positive: true }));
  const date = dateStr(body.expense_date || todayLocal(), 'Sana');
  const description = str(body.description, 'Izoh', { max: 200 });
  const key = body.idempotency_key ? String(body.idempotency_key).slice(0, 100) : null;
  let duplicate = false;
  const expense = await withTransaction(async (client) => {
    if (key) {
      const { rows: prev } = await client.query('SELECT * FROM expenses WHERE idempotency_key = $1', [key]);
      if (prev[0]) {
        duplicate = true;
        return prev[0];
      }
    }
    const { rows } = await client.query(
      `INSERT INTO expenses (category, amount, method, expense_date, description, created_by, idempotency_key)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [body.category, amount, method, date, description, req.user.id, key],
    );
    await recordCash(client, {
      direction: 'out', method, category: 'expense', amount,
      refType: 'expense', refId: rows[0].id, note: body.category, userId: req.user.id,
    });
    await audit(client, req.user.id, 'expense.create', 'expense', rows[0].id, { category: body.category, amount });
    return rows[0];
  });
  res.status(duplicate ? 200 : 201).json({ expense, duplicate });
});

// ---------- Bosh sahifa ----------

router.get('/dashboard', requirePerm('dashboard.view'), async (req, res) => {
  const today = todayLocal();
  const day = periodBounds(today, today);
  const month = periodBounds(`${today.slice(0, 8)}01`, today);
  const settings = await getSettings(pool);

  const [todayFin, monthFin, bal, counts, valueRow, stockRows, chart, recent, alerts] = await Promise.all([
    financeSummary(pool, day),
    financeSummary(pool, month),
    balances(pool),
    pool.query(`
      SELECT COUNT(*) FILTER (WHERE NOT is_archived)::int AS products,
             COUNT(*) FILTER (WHERE NOT is_archived AND min_stock > 0 AND stock_qty > 0 AND stock_qty <= min_stock)::int AS low,
             COUNT(*) FILTER (WHERE NOT is_archived AND stock_qty <= 0)::int AS out,
             COALESCE((SELECT SUM(balance_due) FROM sales), 0) AS customer_debt,
             COALESCE((SELECT SUM(remaining_debt) FROM purchases), 0) AS supplier_debt
        FROM products`),
    pool.query(settings.costing_method === 'WAVG'
      ? 'SELECT COALESCE(SUM(stock_qty * avg_cost), 0) AS v FROM products WHERE NOT is_archived'
      : `SELECT COALESCE(SUM(b.qty_remaining * b.unit_cost), 0) AS v
           FROM stock_batches b JOIN products p ON p.id = b.product_id WHERE NOT p.is_archived`),
    pool.query(`
      (SELECT id, name, stock_qty, min_stock, 'low' AS kind FROM products
        WHERE NOT is_archived AND min_stock > 0 AND stock_qty > 0 AND stock_qty <= min_stock ORDER BY name LIMIT 8)
      UNION ALL
      (SELECT id, name, stock_qty, min_stock, 'out' AS kind FROM products
        WHERE NOT is_archived AND stock_qty <= 0 ORDER BY name LIMIT 8)`),
    dailySeries(pool, addDays(today, -13), today, periodBounds(addDays(today, -13), today).from, day.to),
    pool.query(`
      (SELECT 'sale' AS kind, s.receipt_no AS ref, s.total AS amount, s.created_at AS at,
              COALESCE(c.name, 'Naqd mijoz') AS party
         FROM sales s LEFT JOIN customers c ON c.id = s.customer_id WHERE s.kind = 'sale' ORDER BY s.created_at DESC LIMIT 8)
      UNION ALL
      (SELECT 'purchase', p.purchase_no, p.total, p.created_at, sp.name
         FROM purchases p JOIN suppliers sp ON sp.id = p.supplier_id WHERE p.kind = 'purchase' ORDER BY p.created_at DESC LIMIT 5)
      UNION ALL
      (SELECT 'expense', e.category, e.amount, e.created_at, COALESCE(e.description, '')
         FROM expenses e ORDER BY e.created_at DESC LIMIT 5)
      UNION ALL
      (SELECT 'payment', 'Qarz to''lovi', cp.amount, cp.created_at, c.name
         FROM customer_payments cp JOIN customers c ON c.id = cp.customer_id ORDER BY cp.created_at DESC LIMIT 5)
      ORDER BY at DESC LIMIT 12`).then((r) => r.rows),
    settings.notify_debts
      ? pool.query(`
          SELECT c.id, c.name, SUM(s.balance_due) AS debt, MIN(s.due_date) AS due_date
            FROM sales s JOIN customers c ON c.id = s.customer_id
           WHERE s.balance_due > 0 AND s.due_date IS NOT NULL AND s.due_date <= $1::date
           GROUP BY c.id, c.name ORDER BY MIN(s.due_date) LIMIT 20`,
        [addDays(today, Number(settings.debt_warning_days) || 0)]).then((r) => r.rows)
      : Promise.resolve([]),
  ]);

  const c = counts.rows[0];
  // Tannarx, foyda va xarajatlar faqat hisobot huquqi borlarga ko'rinadi
  const financial = can(req.user, 'reports.view');
  const hide = (o, keys) => (financial ? o : Object.fromEntries(Object.entries(o).filter(([k]) => !keys.includes(k))));
  const secret = ['cogs', 'gross_profit', 'margin_percent', 'expenses', 'losses', 'net_profit', 'purchases_total', 'supplier_payments'];
  res.json({
    today: { date: today, ...hide(todayFin, secret) },
    month: financial
      ? { from: month.fromDate, expenses: monthFin.expenses, net_profit: monthFin.net_profit, gross_profit: monthFin.gross_profit }
      : { from: month.fromDate },
    totals: {
      products: c.products,
      inventory_value: round2(valueRow.rows[0].v),
      cash: { ...bal, total: round2(bal.cash + bal.card + bal.transfer) },
      customer_debt: round2(c.customer_debt),
      supplier_debt: financial ? round2(c.supplier_debt) : null,
    },
    stock: {
      low: c.low,
      out: c.out,
      low_items: stockRows.rows.filter((r) => r.kind === 'low'),
      out_items: stockRows.rows.filter((r) => r.kind === 'out'),
    },
    chart,
    recent,
    debt_alerts: alerts,
    costing_method: settings.costing_method,
  });
});

// ---------- Hisobotlar ----------

router.get('/reports/summary', requirePerm('reports.view'), async (req, res) => {
  const period = periodBounds(req.query.from, req.query.to);
  const summary = await financeSummary(pool, period);
  res.json({ from: period.fromDate, to: period.toDate, summary });
});

router.get('/reports/sales', requirePerm('reports.view'), async (req, res) => {
  const kind = ['daily', 'weekly', 'monthly', 'yearly'].includes(req.query.period) ? req.query.period : 'daily';
  const period = periodBounds(req.query.from, req.query.to);
  const rows = await periodSeries(pool, period, kind);
  const total = rows.reduce(
    (t, r) => ({
      sales_count: t.sales_count + r.sales_count,
      gross_sales: round2(t.gross_sales + r.gross_sales),
      returns: round2(t.returns + r.returns),
      net_sales: round2(t.net_sales + r.net_sales),
      cogs: round2(t.cogs + r.cogs),
      gross_profit: round2(t.gross_profit + r.gross_profit),
      expenses: round2(t.expenses + r.expenses),
      net_profit: round2(t.net_profit + r.net_profit),
    }),
    { sales_count: 0, gross_sales: 0, returns: 0, net_sales: 0, cogs: 0, gross_profit: 0, expenses: 0, net_profit: 0 },
  );
  res.json({ period: kind, from: period.fromDate, to: period.toDate, rows, total });
});

router.get('/reports/products', requirePerm('reports.view'), async (req, res) => {
  const period = periodBounds(req.query.from, req.query.to);
  const rows = await productProfitability(pool, period);
  const sold = rows.filter((r) => r.qty_sold > 0);
  const best = [...sold].sort((a, b) => b.profit - a.profit).slice(0, 10);
  const slow = rows
    .filter((r) => r.stock_qty > 0)
    .sort((a, b) => a.qty_sold - b.qty_sold || b.stock_qty - a.stock_qty)
    .slice(0, 10);
  res.json({ from: period.fromDate, to: period.toDate, products: rows, best_sellers: best, slow_moving: slow });
});

// ---------- Tarix ----------

router.get('/history', requirePerm('history.view'), async (req, res) => {
  const period = periodBounds(req.query.from, req.query.to);
  const params = [period.from, period.to];
  let extra = '';
  if (req.query.entity_type) {
    params.push(String(req.query.entity_type));
    extra += ` AND a.entity_type = $${params.length}`;
  }
  if (req.query.user_id) {
    params.push(Number(req.query.user_id));
    extra += ` AND a.user_id = $${params.length}`;
  }
  const { limit, offset } = paging(req.query, { limit: 200, max: 1000 });
  const { rows } = await pool.query(
    `SELECT a.id, a.action, a.entity_type, a.entity_id, a.details, a.created_at, u.full_name AS user_name
       FROM audit_log a LEFT JOIN users u ON u.id = a.user_id
      WHERE a.created_at >= $1 AND a.created_at < $2${extra}
      ORDER BY a.created_at DESC, a.id DESC LIMIT ${limit} OFFSET ${offset}`,
    params,
  );
  res.json({ entries: rows });
});

// ---------- Qidiruv ----------

router.get('/search', async (req, res, next) => {
  try {
    const q = String(req.query.q || '').trim();
    if (q.length < 2) return res.json({ products: [], customers: [], suppliers: [] });
    const u = req.user.permissions;
    const out = { products: [], customers: [], suppliers: [] };
    if (u['products.view'] || u['sales.create'] || u['stock.view']) {
      out.products = (await pool.query(
        `SELECT id, name, barcode, stock_qty, selling_price FROM products
          WHERE NOT is_archived AND (name ILIKE '%' || $1 || '%' OR barcode = $1) ORDER BY name LIMIT 8`,
        [q],
      )).rows;
    }
    if (u['customers.view'] || u['sales.create']) {
      out.customers = (await pool.query(
        `SELECT id, name, phone FROM customers WHERE is_active AND (name ILIKE '%' || $1 || '%' OR phone ILIKE '%' || $1 || '%')
          ORDER BY name LIMIT 8`,
        [q],
      )).rows;
    }
    if (u['suppliers.view'] || u['purchases.view']) {
      out.suppliers = (await pool.query(
        `SELECT id, name, phone FROM suppliers WHERE is_active AND (name ILIKE '%' || $1 || '%' OR phone ILIKE '%' || $1 || '%')
          ORDER BY name LIMIT 8`,
        [q],
      )).rows;
    }
    res.json(out);
  } catch (err) {
    next(err);
  }
});

// ---------- Zaxira nusxa ----------
// Butun bazani .sql fayl sifatida yuklab olish. Faylda hamma narsa (xodimlar parol xeshlari ham) bor,
// shuning uchun faqat do'kon egasiga ruxsat.
router.get('/admin/backup', async (req, res) => {
  if (req.user.role !== 'owner') throw new HttpError(403, "Zaxira nusxasini faqat do'kon egasi yuklab oladi");
  await audit(pool, req.user.id, 'backup.download', 'store', null, null);
  const stamp = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tashkent', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(new Date()).replace(', ', '_').replace(':', '-');
  res.setHeader('Content-Type', 'application/sql; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="ombor-zaxira-${stamp}.sql"`);
  res.setHeader('Cache-Control', 'no-store');
  const chunks = [];
  await createBackup(pool, (s) => chunks.push(s), { appliedBy: req.user.full_name });
  res.send(chunks.join(''));
});

// ---------- Sozlamalar ----------

router.get('/settings', async (req, res) => {
  res.json({ settings: await getSettings(pool) });
});

router.put('/settings', requirePerm('settings.manage'), async (req, res) => {
  const body = req.body || {};
  const patch = {};
  if (body.store_name !== undefined) patch.store_name = str(body.store_name, "Do'kon nomi", { required: true, max: 100 });
  if (body.store_phone !== undefined) patch.store_phone = str(body.store_phone, 'Telefon', { max: 30 }) || '';
  if (body.store_address !== undefined) patch.store_address = str(body.store_address, 'Manzil', { max: 200 }) || '';
  if (body.receipt_footer !== undefined) patch.receipt_footer = str(body.receipt_footer, 'Chek izohi', { max: 200 }) || '';
  if (body.costing_method !== undefined) patch.costing_method = body.costing_method;
  if (body.notify_low_stock !== undefined) patch.notify_low_stock = Boolean(body.notify_low_stock);
  if (body.notify_debts !== undefined) patch.notify_debts = Boolean(body.notify_debts);
  if (body.debt_warning_days !== undefined) {
    patch.debt_warning_days = Math.round(num(body.debt_warning_days, 'Ogohlantirish kunlari', { min: 0, max: 365 }));
  }
  const settings = await withTransaction(async (client) => {
    const saved = await saveSettings(client, patch);
    await audit(client, req.user.id, 'settings.update', 'settings', null, patch);
    return saved;
  });
  res.json({ settings });
});

export default router;
