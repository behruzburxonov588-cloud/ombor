// Kirim (purchases) va sotuv (sales) endpointlari
import { Router } from 'express';
import { pool, withTransaction } from '../db.js';
import { requirePerm } from '../auth.js';
import { HttpError, num, periodBounds, paging } from '../util.js';
import { createPurchase, loadPurchase } from '../services/purchases.js';
import { createSale, returnSale, loadSale } from '../services/sales.js';
import { customerDebt } from '../services/ledger.js';

const router = Router();

// ---------- Kirimlar ----------

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
    `SELECT p.id, p.purchase_no, p.purchase_date, p.total, p.paid_amount, p.remaining_debt, p.created_at,
            s.name AS supplier_name, u.full_name AS created_by_name
       FROM purchases p
       JOIN suppliers s ON s.id = p.supplier_id
       LEFT JOIN users u ON u.id = p.created_by
      WHERE p.purchase_date BETWEEN $1::date AND $2::date${extra}
      ORDER BY p.purchase_date DESC, p.id DESC LIMIT ${limit} OFFSET ${offset}`,
    params,
  );
  res.json({ purchases: rows, from: period.fromDate, to: period.toDate });
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
            s.status, s.refunded_total, c.name AS customer_name, u.full_name AS cashier_name
       FROM sales s
       LEFT JOIN customers c ON c.id = s.customer_id
       LEFT JOIN users u ON u.id = s.cashier_id
      WHERE s.created_at >= $1 AND s.created_at < $2${extra}
      ORDER BY s.created_at DESC, s.id DESC LIMIT ${limit} OFFSET ${offset}`,
    params,
  );
  res.json({ sales: rows, from: period.fromDate, to: period.toDate });
});

router.get('/sales/:id', requirePerm('sales.view', 'sales.create', 'reports.view'), async (req, res) => {
  const sale = await loadSale(pool, Number(req.params.id));
  if (!sale) throw new HttpError(404, 'Savdo topilmadi');
  res.json({ sale });
});

router.post('/sales', requirePerm('sales.create'), async (req, res) => {
  const result = await withTransaction((client) => createSale(client, req.user, req.body || {}));
  res.status(result.duplicate ? 200 : 201).json(result);
});

router.post('/sales/:id/return', requirePerm('sales.return'), async (req, res) => {
  const id = num(req.params.id, 'Savdo', { positive: true });
  const result = await withTransaction((client) => returnSale(client, req.user, id, req.body || {}));
  res.status(201).json(result);
});

// Kassir uchun: savdo paytida mijoz qarzini tekshirish
router.get('/customers/:id/debt', requirePerm('customers.view', 'sales.create'), async (req, res) => {
  res.json({ debt: await customerDebt(pool, Number(req.params.id)) });
});

export default router;
