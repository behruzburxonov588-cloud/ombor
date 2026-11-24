// Kirim (purchases) va sotuv (sales) endpointlari
import { Router } from 'express';
import { pool, withTransaction } from '../db.js';
import { requirePerm } from '../auth.js';
import { HttpError, num, periodBounds, paging, round2 } from '../util.js';
import { createPurchase, loadPurchase, undoPurchase } from '../services/purchases.js';
import { createSale, returnSale, loadSale } from '../services/sales.js';
import { customerDebt } from '../services/ledger.js';
import { seesCost } from './catalog.js';

// Savdo: tannarxni ko'ra oladiganlarga — har bir chek va qatorning foydasi; kassirga — tannarx umuman yuborilmaydi
function shapeSale(sale, user) {
  if (!sale) return sale;
  const items = sale.items || [];
  if (!seesCost(user)) {
    const { cost_total: _c, ...rest } = sale;
    return { ...rest, items: items.map(({ cost_total: _a, returned_cost: _b, ...it }) => it) };
  }
  const shaped = items.map((it) => {
    const net = Number(it.line_total) - Number(it.returned_amount || 0);
    const cost = Number(it.cost_total) - Number(it.returned_cost || 0);
    return { ...it, profit: round2(net - cost), cost_missing: Number(it.cost_total) === 0 && Number(it.line_total) > 0 };
  });
  const net = Number(sale.total) - Number(sale.refunded_total || 0);
  const cost = shaped.reduce((sum, it) => sum + Number(it.cost_total) - Number(it.returned_cost || 0), 0);
  return { ...sale, items: shaped, profit: round2(net - cost), cost_missing: shaped.some((it) => it.cost_missing) };
}

const router = Router();

// ---------- Kirimlar ----------

// Yaqinda kelgan tovarlar: har bir tovarning oxirgi kirimi (miqdor, birlik, narx) — «Yana keldi» uchun
router.get('/purchases/recent-items', requirePerm('purchases.view', 'purchases.create'), async (req, res) => {
  const { rows } = await pool.query(
    `SELECT DISTINCT ON (pi.product_id) pi.product_id, pi.unit_id, pi.quantity, pi.unit_price, pi.factor,
            p.created_at AS received_at, p.purchase_no, pr.name, pr.image_path, pr.stock_qty, u.name AS unit_name, bu.name AS base_unit_name
       FROM purchase_items pi
       JOIN purchases p ON p.id = pi.purchase_id AND p.kind = 'purchase'
       JOIN products pr ON pr.id = pi.product_id AND NOT pr.is_archived
       JOIN units u ON u.id = pi.unit_id
       JOIN units bu ON bu.id = pr.base_unit_id
      ORDER BY pi.product_id, p.created_at DESC, pi.id DESC`,
  );
  rows.sort((a, b) => new Date(b.received_at) - new Date(a.received_at));
  res.json({
    items: rows.slice(0, 24).map((r) => ({
      product_id: r.product_id, name: r.name, image_path: r.image_path, stock_qty: Number(r.stock_qty), base_unit_name: r.base_unit_name,
      unit_id: r.unit_id, unit_name: r.unit_name, factor: Number(r.factor), quantity: Number(r.quantity), unit_price: Number(r.unit_price),
      received_at: r.received_at, purchase_no: r.purchase_no,
    })),
  });
});

router.get('/purchases', requirePerm('purchases.view'), async (req, res) => {
  const period = periodBounds(req.query.from, req.query.to);
  const params = [period.fromDate, period.toDate];
  let extra = '';
  if (req.query.supplier_id) {
    params.push(Number(req.query.supplier_id));
    extra = ` AND p.supplier_id = $${params.length}`;
  }
  const { limit, offset } = paging(req.query, { limit: 100, max: 500 });
  const { rows } = await pool.query(
    `SELECT p.id, p.purchase_no, p.purchase_date, p.total, p.paid_amount, p.remaining_debt, p.created_at, p.due_date,
            s.name AS supplier_name, u.full_name AS created_by_name,
            (SELECT COUNT(*)::int FROM purchase_items pi WHERE pi.purchase_id = p.id) AS items_count
       FROM purchases p
       JOIN suppliers s ON s.id = p.supplier_id
       LEFT JOIN users u ON u.id = p.created_by
      WHERE p.purchase_date BETWEEN $1::date AND $2::date AND p.kind = 'purchase'${extra}
      ORDER BY p.purchase_date DESC, p.id DESC LIMIT ${limit} OFFSET ${offset}`,
    params,
  );
  const { rows: tot } = await pool.query(
    `SELECT COUNT(*)::int AS count, COALESCE(SUM(p.total), 0) AS total, COALESCE(SUM(p.paid_amount), 0) AS paid,
            COALESCE(SUM(p.remaining_debt), 0) AS debt
       FROM purchases p WHERE p.purchase_date BETWEEN $1::date AND $2::date AND p.kind = 'purchase'${extra}`,
    params,
  );
  const t = tot[0];
  res.json({
    purchases: rows,
    from: period.fromDate,
    to: period.toDate,
    totals: { count: t.count, total: Number(t.total), paid: Number(t.paid), debt: Number(t.debt) },
  });
});

router.get('/purchases/:id', requirePerm('purchases.view'), async (req, res) => {
  const purchase = await loadPurchase(pool, Number(req.params.id));
  if (!purchase) throw new HttpError(404, 'Kirim topilmadi');
  res.json({ purchase });
});

router.post('/purchases', requirePerm('purchases.create'), async (req, res) => {
  const result = await withTransaction((client) => createPurchase(client, req.user, req.body || {}));
  res.status(result.duplicate ? 200 : 201).json(result);
});

// Xato kiritilgan yukni bekor qilish (faqat undan keyin hech narsa o'zgarmagan bo'lsa)
router.post('/purchases/:id/undo', requirePerm('purchases.create'), async (req, res) => {
  const id = num(req.params.id, 'Kirim', { positive: true });
  res.json(await withTransaction((client) => undoPurchase(client, req.user, id)));
});

// ---------- Sotuvlar ----------

router.get('/sales', requirePerm('sales.view', 'reports.view'), async (req, res) => {
  const period = periodBounds(req.query.from, req.query.to);
  const params = [period.from, period.to];
  let extra = '';
  if (req.query.cashier_id) {
    params.push(Number(req.query.cashier_id));
    extra += ` AND s.cashier_id = $${params.length}`;
  }
  if (req.query.customer_id) {
    params.push(Number(req.query.customer_id));
    extra += ` AND s.customer_id = $${params.length}`;
  }
  const { limit, offset } = paging(req.query, { limit: 100, max: 500 });
  const { rows } = await pool.query(
    `SELECT s.id, s.receipt_no, s.created_at, s.total, s.paid_total, s.balance_due, s.payment_method,
            s.status, s.refunded_total, c.name AS customer_name, u.full_name AS cashier_name,
            s.total - s.refunded_total - s.cost_total
              + COALESCE((SELECT SUM(si.returned_cost) FROM sale_items si WHERE si.sale_id = s.id), 0) AS profit
       FROM sales s
       LEFT JOIN customers c ON c.id = s.customer_id
       LEFT JOIN users u ON u.id = s.cashier_id
      WHERE s.created_at >= $1 AND s.created_at < $2 AND s.kind = 'sale'${extra}
      ORDER BY s.created_at DESC, s.id DESC LIMIT ${limit} OFFSET ${offset}`,
    params,
  );
  // Davr bo'yicha jami (ro'yxat cheklovidan qat'i nazar): cheklar, summa, qaytarilgan, nasiyada qolgan
  const { rows: tot } = await pool.query(
    `SELECT COUNT(*)::int AS count, COALESCE(SUM(s.total), 0) AS total, COALESCE(SUM(s.refunded_total), 0) AS refunded,
            COALESCE(SUM(s.balance_due), 0) AS debt,
            COALESCE(SUM(s.total - s.refunded_total - s.cost_total
              + COALESCE((SELECT SUM(si.returned_cost) FROM sale_items si WHERE si.sale_id = s.id), 0)), 0) AS profit
       FROM sales s
      WHERE s.created_at >= $1 AND s.created_at < $2 AND s.kind = 'sale'${extra}`,
    params,
  );
  const t = tot[0];
  const costs = seesCost(req.user);
  res.json({
    sales: rows.map(({ profit, ...r }) => (costs ? { ...r, profit: round2(profit) } : r)),
    from: period.fromDate,
    to: period.toDate,
    totals: {
      count: t.count, total: Number(t.total), refunded: Number(t.refunded), net: Number(t.total) - Number(t.refunded), debt: Number(t.debt),
      ...(costs ? { profit: round2(t.profit) } : {}),
    },
  });
});

// Sotuvda tez tanlash: oxirgi sotilganlar va so'nggi 30 kunda eng ko'p sotilganlar (faqat mahsulot id — narx va qoldiq ro'yxatdan)
router.get('/sales/quick-picks', requirePerm('sales.create'), async (req, res) => {
  const [recent, top] = await Promise.all([
    pool.query(
      `SELECT si.product_id FROM sale_items si
         JOIN sales s ON s.id = si.sale_id AND s.kind = 'sale'
         JOIN products p ON p.id = si.product_id AND NOT p.is_archived
        WHERE s.created_at >= now() - interval '30 days'
        GROUP BY si.product_id ORDER BY MAX(s.id) DESC LIMIT 12`,
    ),
    pool.query(
      `SELECT si.product_id FROM sale_items si
         JOIN sales s ON s.id = si.sale_id AND s.kind = 'sale'
         JOIN products p ON p.id = si.product_id AND NOT p.is_archived
        WHERE s.created_at >= now() - interval '30 days'
        GROUP BY si.product_id ORDER BY COUNT(DISTINCT s.id) DESC, SUM(si.base_quantity) DESC LIMIT 12`,
    ),
  ]);
  res.json({ recent: recent.rows.map((r) => r.product_id), top: top.rows.map((r) => r.product_id) });
});

router.get('/sales/:id', requirePerm('sales.view', 'sales.create', 'reports.view'), async (req, res) => {
  const sale = await loadSale(pool, Number(req.params.id));
  if (!sale) throw new HttpError(404, 'Savdo topilmadi');
  res.json({ sale: shapeSale(sale, req.user) });
});

router.post('/sales', requirePerm('sales.create'), async (req, res) => {
  const result = await withTransaction((client) => createSale(client, req.user, req.body || {}));
  res.status(result.duplicate ? 200 : 201).json({ ...result, sale: shapeSale(result.sale, req.user) });
});

router.post('/sales/:id/return', requirePerm('sales.return'), async (req, res) => {
  const id = num(req.params.id, 'Savdo', { positive: true });
  const result = await withTransaction((client) => returnSale(client, req.user, id, req.body || {}));
  res.status(201).json({ ...result, sale: shapeSale(result.sale, req.user) });
});

// Kassir uchun: savdo paytida mijoz qarzini tekshirish
router.get('/customers/:id/debt', requirePerm('customers.view', 'sales.create'), async (req, res) => {
  res.json({ debt: await customerDebt(pool, Number(req.params.id)) });
});

export default router;
