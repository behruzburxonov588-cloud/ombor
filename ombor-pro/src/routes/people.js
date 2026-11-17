// Xodimlar, yetkazib beruvchilar va mijozlar
import { Router } from 'express';
import { pool, withTransaction } from '../db.js';
import { requirePerm, hashPassword, publicUser } from '../auth.js';
import { HttpError, str, round2 } from '../util.js';
import { ROLES, PERMISSION_KEYS, PERMISSIONS, ROLE_DEFAULTS } from '../permissions.js';
import { audit } from '../audit.js';
import { customerDebt, supplierDebt, receiveCustomerPayment, paySupplier } from '../services/ledger.js';
import { validateUsername, validatePassword } from './auth.js';

const router = Router();

// ---------- Xodimlar ----------

function cleanOverrides(input) {
  const out = {};
  if (!input || typeof input !== 'object') return out;
  for (const key of PERMISSION_KEYS) {
    if (typeof input[key] === 'boolean') out[key] = input[key];
  }
  return out;
}

router.get('/permissions', (req, res) => {
  res.json({ permissions: PERMISSIONS, roles: ROLES, role_defaults: ROLE_DEFAULTS });
});

router.get('/users', requirePerm('employees.manage'), async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM users ORDER BY is_active DESC, id');
  res.json({
    users: rows.map((r) => ({ ...publicUser(r), overrides: r.permissions })),
  });
});

router.post('/users', requirePerm('employees.manage'), async (req, res) => {
  const body = req.body || {};
  const role = body.role;
  if (!ROLES[role]) throw new HttpError(400, "Rol noto'g'ri");
  if (role === 'owner' && req.user.role !== 'owner') {
    throw new HttpError(403, "Egasi rolini faqat egasi berishi mumkin");
  }
  const fullName = str(body.full_name, 'Ism familiya', { required: true, max: 100 });
  const username = validateUsername(body.username);
  const password = validatePassword(body.password);
  const user = await withTransaction(async (client) => {
    const { rows: exists } = await client.query('SELECT 1 FROM users WHERE username = $1', [username]);
    if (exists[0]) throw new HttpError(409, 'Bu login band');
    const { rows } = await client.query(
      `INSERT INTO users (full_name, username, password_hash, role, permissions, phone)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [fullName, username, await hashPassword(password), role, cleanOverrides(body.overrides),
        str(body.phone, 'Telefon', { max: 30 })],
    );
    await audit(client, req.user.id, 'user.create', 'user', rows[0].id, { username, role });
    return rows[0];
  });
  res.status(201).json({ user: { ...publicUser(user), overrides: user.permissions } });
});

router.put('/users/:id', requirePerm('employees.manage'), async (req, res) => {
  const id = Number(req.params.id);
  const body = req.body || {};
  const result = await withTransaction(async (client) => {
    const { rows } = await client.query('SELECT * FROM users WHERE id = $1 FOR UPDATE', [id]);
    const target = rows[0];
    if (!target) throw new HttpError(404, 'Xodim topilmadi');
    if (target.role === 'owner' && req.user.role !== 'owner') {
      throw new HttpError(403, "Egasi hisobini faqat egasi o'zgartirishi mumkin");
    }
    if (body.role !== undefined && !ROLES[body.role]) throw new HttpError(400, "Rol noto'g'ri");
    if (body.role === 'owner' && req.user.role !== 'owner') {
      throw new HttpError(403, "Egasi rolini faqat egasi berishi mumkin");
    }
    if (id === req.user.id && body.is_active === false) {
      throw new HttpError(400, "O'zingizning hisobingizni o'chira olmaysiz");
    }
    const role = body.role ?? target.role;
    const fullName = body.full_name !== undefined ? str(body.full_name, 'Ism familiya', { required: true, max: 100 }) : target.full_name;
    const phone = body.phone !== undefined ? str(body.phone, 'Telefon', { max: 30 }) : target.phone;
    const overrides = body.overrides !== undefined ? cleanOverrides(body.overrides) : target.permissions;
    const isActive = body.is_active !== undefined ? Boolean(body.is_active) : target.is_active;
    const hash = body.password ? await hashPassword(validatePassword(body.password)) : target.password_hash;
    if (target.role === 'owner' && role !== 'owner') {
      const { rows: owners } = await client.query("SELECT COUNT(*)::int AS n FROM users WHERE role = 'owner' AND is_active");
      if (owners[0].n <= 1) throw new HttpError(400, 'Tizimda kamida bitta faol egasi bo\'lishi kerak');
    }
    const { rows: upd } = await client.query(
      `UPDATE users SET full_name = $2, role = $3, permissions = $4, phone = $5,
              is_active = $6, password_hash = $7 WHERE id = $1 RETURNING *`,
      [id, fullName, role, overrides, phone, isActive, hash],
    );
    await audit(client, req.user.id, 'user.update', 'user', id, { role, is_active: isActive });
    return upd[0];
  });
  res.json({ user: { ...publicUser(result), overrides: result.permissions } });
});

// ---------- Yetkazib beruvchilar ----------

const partyFields = (body) => ({
  name: str(body.name, 'Nomi', { required: true, max: 150 }),
  phone: str(body.phone, 'Telefon', { max: 30 }),
  address: str(body.address, 'Manzil', { max: 200 }),
  note: str(body.note, 'Izoh', { max: 300 }),
});

router.get('/suppliers', requirePerm('suppliers.view', 'purchases.view'), async (req, res) => {
  const q = String(req.query.q || '').trim();
  const { rows } = await pool.query(
    `SELECT s.*,
            COALESCE((SELECT SUM(total) FROM purchases p WHERE p.supplier_id = s.id), 0) AS total_purchased,
            COALESCE((SELECT SUM(remaining_debt) FROM purchases p WHERE p.supplier_id = s.id), 0) AS debt
       FROM suppliers s
      WHERE s.is_active AND ($1 = '' OR s.name ILIKE '%' || $1 || '%' OR s.phone ILIKE '%' || $1 || '%')
      ORDER BY s.name`,
    [q],
  );
  res.json({ suppliers: rows });
});

router.post('/suppliers', requirePerm('suppliers.manage'), async (req, res) => {
  const f = partyFields(req.body || {});
  const { rows } = await withTransaction(async (client) => {
    const r = await client.query(
      'INSERT INTO suppliers (name, phone, address) VALUES ($1, $2, $3) RETURNING *',
      [f.name, f.phone, f.address],
    );
    await audit(client, req.user.id, 'supplier.create', 'supplier', r.rows[0].id, { name: f.name });
    return r;
  });
  res.status(201).json({ supplier: rows[0] });
});

router.put('/suppliers/:id', requirePerm('suppliers.manage'), async (req, res) => {
  const id = Number(req.params.id);
  const f = partyFields(req.body || {});
  const { rows } = await withTransaction(async (client) => {
    const r = await client.query(
      'UPDATE suppliers SET name = $2, phone = $3, address = $4 WHERE id = $1 RETURNING *',
      [id, f.name, f.phone, f.address],
    );
    if (!r.rows[0]) throw new HttpError(404, 'Yetkazib beruvchi topilmadi');
    await audit(client, req.user.id, 'supplier.update', 'supplier', id, { name: f.name });
    return r;
  });
  res.json({ supplier: rows[0] });
});

router.get('/suppliers/:id', requirePerm('suppliers.view', 'purchases.view'), async (req, res) => {
  const id = Number(req.params.id);
  const { rows } = await pool.query('SELECT * FROM suppliers WHERE id = $1', [id]);
  if (!rows[0]) throw new HttpError(404, 'Yetkazib beruvchi topilmadi');
  const { rows: purchases } = await pool.query(
    'SELECT id, purchase_no, purchase_date, total, paid_amount, remaining_debt FROM purchases WHERE supplier_id = $1 ORDER BY purchase_date DESC, id DESC LIMIT 200',
    [id],
  );
  const { rows: payments } = await pool.query(
    'SELECT id, amount, method, note, created_at FROM supplier_payments WHERE supplier_id = $1 ORDER BY created_at DESC LIMIT 200',
    [id],
  );
  res.json({
    supplier: rows[0],
    purchases,
    payments,
    total_purchased: round2(purchases.reduce((s, p) => s + Number(p.total), 0)),
    debt: await supplierDebt(pool, id),
  });
});

router.post('/suppliers/:id/payments', requirePerm('suppliers.manage', 'payments.create'), async (req, res) => {
  const result = await withTransaction((client) =>
    paySupplier(client, req.user, Number(req.params.id), req.body || {}));
  res.status(201).json(result);
});

// ---------- Mijozlar ----------

router.get('/customers', requirePerm('customers.view', 'sales.create'), async (req, res) => {
  const q = String(req.query.q || '').trim();
  const { rows } = await pool.query(
    `SELECT c.*,
            COALESCE((SELECT SUM(balance_due) FROM sales s WHERE s.customer_id = c.id), 0) AS debt,
            COALESCE((SELECT SUM(total) FROM sales s WHERE s.customer_id = c.id), 0) AS total_purchases
       FROM customers c
      WHERE c.is_active AND ($1 = '' OR c.name ILIKE '%' || $1 || '%' OR c.phone ILIKE '%' || $1 || '%')
      ORDER BY c.name LIMIT 300`,
    [q],
  );
  res.json({ customers: rows });
});

router.post('/customers', requirePerm('customers.manage'), async (req, res) => {
  const f = partyFields(req.body || {});
  const { rows } = await withTransaction(async (client) => {
    const r = await client.query(
      'INSERT INTO customers (name, phone, note) VALUES ($1, $2, $3) RETURNING *',
      [f.name, f.phone, f.note],
    );
    await audit(client, req.user.id, 'customer.create', 'customer', r.rows[0].id, { name: f.name });
    return r;
  });
  res.status(201).json({ customer: rows[0] });
});

router.put('/customers/:id', requirePerm('customers.manage'), async (req, res) => {
  const id = Number(req.params.id);
  const f = partyFields(req.body || {});
  const { rows } = await withTransaction(async (client) => {
    const r = await client.query(
      'UPDATE customers SET name = $2, phone = $3, note = $4 WHERE id = $1 RETURNING *',
      [id, f.name, f.phone, f.note],
    );
    if (!r.rows[0]) throw new HttpError(404, 'Mijoz topilmadi');
    await audit(client, req.user.id, 'customer.update', 'customer', id, { name: f.name });
    return r;
  });
  res.json({ customer: rows[0] });
});

router.get('/customers/:id', requirePerm('customers.view', 'sales.create'), async (req, res) => {
  const id = Number(req.params.id);
  const { rows } = await pool.query('SELECT * FROM customers WHERE id = $1', [id]);
  if (!rows[0]) throw new HttpError(404, 'Mijoz topilmadi');
  const { rows: sales } = await pool.query(
    `SELECT id, receipt_no, created_at, total, paid_total, balance_due, due_date, status, payment_method
       FROM sales WHERE customer_id = $1 ORDER BY created_at DESC LIMIT 200`,
    [id],
  );
  const { rows: payments } = await pool.query(
    'SELECT id, amount, method, note, created_at FROM customer_payments WHERE customer_id = $1 ORDER BY created_at DESC LIMIT 200',
    [id],
  );
  const open = sales.filter((s) => Number(s.balance_due) > 0);
  res.json({
    customer: rows[0],
    sales,
    payments,
    open_debts: open,
    debt: await customerDebt(pool, id),
    total_purchases: round2(sales.reduce((s, x) => s + Number(x.total), 0)),
  });
});

router.post('/customers/:id/payments', requirePerm('payments.create', 'customers.manage'), async (req, res) => {
  const result = await withTransaction((client) =>
    receiveCustomerPayment(client, req.user, Number(req.params.id), req.body || {}));
  res.status(201).json(result);
});

export default router;
