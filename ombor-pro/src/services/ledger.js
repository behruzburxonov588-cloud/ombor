// Qarzlar: mijoz qarzi (nasiya) va yetkazib beruvchi qarzi alohida hisoblanadi.
// To'lovlar eng eski qarzdan boshlab taqsimlanadi.
import { HttpError, num, round2 } from '../util.js';
import { recordCash } from './cash.js';
import { audit } from '../audit.js';

const METHODS = ['cash', 'card', 'transfer'];

export async function customerDebt(db, customerId) {
  const { rows } = await db.query(
    'SELECT COALESCE(SUM(balance_due), 0) AS debt FROM sales WHERE customer_id = $1',
    [customerId],
  );
  return round2(rows[0].debt);
}

export async function supplierDebt(db, supplierId) {
  const { rows } = await db.query(
    'SELECT COALESCE(SUM(remaining_debt), 0) AS debt FROM purchases WHERE supplier_id = $1',
    [supplierId],
  );
  return round2(rows[0].debt);
}

// Takroriy so'rov: shu kalit bilan to'lov allaqachon yozilgan bo'lsa, o'shani qaytaradi
function idemKey(body) {
  return body.idempotency_key ? String(body.idempotency_key).slice(0, 100) : null;
}

async function existingPayment(client, table, allocTable, docColumn, key, debtFn, partyColumn) {
  if (!key) return null;
  const { rows } = await client.query(`SELECT * FROM ${table} WHERE idempotency_key = $1`, [key]);
  if (!rows[0]) return null;
  const { rows: alloc } = await client.query(
    `SELECT ${docColumn}, amount FROM ${allocTable} WHERE payment_id = $1 ORDER BY id`,
    [rows[0].id],
  );
  return {
    payment_id: rows[0].id,
    amount: Number(rows[0].amount),
    allocations: alloc.map((a) => ({ [docColumn]: a[docColumn], amount: Number(a.amount) })),
    remaining_debt: await debtFn(client, rows[0][partyColumn]),
    duplicate: true,
  };
}

export async function receiveCustomerPayment(client, user, customerId, body) {
  const key = idemKey(body);
  const dup = await existingPayment(client, 'customer_payments', 'customer_payment_allocations', 'sale_id', key, customerDebt, 'customer_id');
  if (dup) return dup;
  const { rows: cust } = await client.query('SELECT id, name FROM customers WHERE id = $1', [customerId]);
  if (!cust[0]) throw new HttpError(404, 'Mijoz topilmadi');
  const amount = round2(num(body.amount, "To'lov summasi", { positive: true }));
  const method = body.method || 'cash';
  if (!METHODS.includes(method)) throw new HttpError(400, "To'lov usuli noto'g'ri");

  const { rows: open } = await client.query(
    `SELECT id, balance_due FROM sales
      WHERE customer_id = $1 AND balance_due > 0
      ORDER BY created_at, id FOR UPDATE`,
    [customerId],
  );
  const totalDue = round2(open.reduce((s, r) => s + Number(r.balance_due), 0));
  if (totalDue <= 0) throw new HttpError(400, 'Bu mijozning ochiq qarzi yo\'q');
  if (amount > totalDue + 0.001) {
    throw new HttpError(400, `To'lov qarzdan katta. Joriy qarz: ${totalDue}`);
  }

  const { rows: pay } = await client.query(
    `INSERT INTO customer_payments (customer_id, amount, method, note, created_by, idempotency_key)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [customerId, amount, method, body.note ? String(body.note).slice(0, 200) : null, user.id, key],
  );
  const paymentId = pay[0].id;

  let left = amount;
  const allocations = [];
  for (const sale of open) {
    if (left <= 0) break;
    const take = round2(Math.min(left, Number(sale.balance_due)));
    await client.query('UPDATE sales SET balance_due = balance_due - $2 WHERE id = $1', [sale.id, take]);
    await client.query(
      'INSERT INTO customer_payment_allocations (payment_id, sale_id, amount) VALUES ($1, $2, $3)',
      [paymentId, sale.id, take],
    );
    allocations.push({ sale_id: sale.id, amount: take });
    left = round2(left - take);
  }

  await recordCash(client, {
    direction: 'in', method, category: 'customer_payment', amount,
    refType: 'customer_payment', refId: paymentId, note: `Mijoz: ${cust[0].name}`, userId: user.id,
  });
  await audit(client, user.id, 'customer.payment', 'customer', customerId, { amount, method, allocations });
  return {
    payment_id: paymentId,
    amount,
    allocations,
    remaining_debt: round2(totalDue - amount),
  };
}

export async function paySupplier(client, user, supplierId, body) {
  const key = idemKey(body);
  const dup = await existingPayment(client, 'supplier_payments', 'supplier_payment_allocations', 'purchase_id', key, supplierDebt, 'supplier_id');
  if (dup) return dup;
  const { rows: sup } = await client.query('SELECT id, name FROM suppliers WHERE id = $1', [supplierId]);
  if (!sup[0]) throw new HttpError(404, 'Yetkazib beruvchi topilmadi');
  const amount = round2(num(body.amount, "To'lov summasi", { positive: true }));
  const method = body.method || 'cash';
  if (!METHODS.includes(method)) throw new HttpError(400, "To'lov usuli noto'g'ri");
  const purchaseFilter = body.purchase_id ? Number(body.purchase_id) : null;

  const { rows: open } = await client.query(
    `SELECT id, remaining_debt FROM purchases
      WHERE supplier_id = $1 AND remaining_debt > 0 AND ($2::int IS NULL OR id = $2)
      ORDER BY purchase_date, id FOR UPDATE`,
    [supplierId, purchaseFilter],
  );
  const totalDue = round2(open.reduce((s, r) => s + Number(r.remaining_debt), 0));
  if (totalDue <= 0) throw new HttpError(400, "Bu yetkazib beruvchiga ochiq qarz yo'q");
  if (amount > totalDue + 0.001) {
    throw new HttpError(400, `To'lov qarzdan katta. Joriy qarz: ${totalDue}`);
  }

  const { rows: pay } = await client.query(
    `INSERT INTO supplier_payments (supplier_id, amount, method, note, created_by, idempotency_key)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [supplierId, amount, method, body.note ? String(body.note).slice(0, 200) : null, user.id, key],
  );
  const paymentId = pay[0].id;

  let left = amount;
  const allocations = [];
  for (const p of open) {
    if (left <= 0) break;
    const take = round2(Math.min(left, Number(p.remaining_debt)));
    await client.query(
      'UPDATE purchases SET paid_amount = paid_amount + $2, remaining_debt = remaining_debt - $2 WHERE id = $1',
      [p.id, take],
    );
    await client.query(
      'INSERT INTO supplier_payment_allocations (payment_id, purchase_id, amount) VALUES ($1, $2, $3)',
      [paymentId, p.id, take],
    );
    allocations.push({ purchase_id: p.id, amount: take });
    left = round2(left - take);
  }

  await recordCash(client, {
    direction: 'out', method, category: 'supplier_payment', amount,
    refType: 'supplier_payment', refId: paymentId, note: `Yetkazib beruvchi: ${sup[0].name}`, userId: user.id,
  });
  await audit(client, user.id, 'supplier.payment', 'supplier', supplierId, { amount, method, allocations });
  return { payment_id: paymentId, amount, allocations, remaining_debt: round2(totalDue - amount) };
}
