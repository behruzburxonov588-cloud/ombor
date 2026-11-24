// Sotuv (POS), qaytarish va sotuv ma'lumotlarini yuklash
import { HttpError, num, round2, round4, dateStr } from '../util.js';
import { lockProducts, issueStock, receiveStock } from './inventory.js';
import { resolveUnit } from './catalog.js';
import { recordCash, currentShiftId } from './cash.js';
import { getSettings } from './settings.js';
import { can } from '../auth.js';
import { audit } from '../audit.js';

const PAY_METHODS = ['cash', 'card', 'transfer', 'credit', 'mixed'];
const CASH_METHODS = ['cash', 'card', 'transfer'];

export async function loadSale(db, id) {
  const { rows } = await db.query(
    `SELECT s.*, c.name AS customer_name, u.full_name AS cashier_name
       FROM sales s
       LEFT JOIN customers c ON c.id = s.customer_id
       LEFT JOIN users u ON u.id = s.cashier_id
      WHERE s.id = $1`,
    [id],
  );
  if (!rows[0]) return null;
  const { rows: items } = await db.query(
    `SELECT si.*, p.name AS product_name, un.name AS unit_name
       FROM sale_items si
       JOIN products p ON p.id = si.product_id
       JOIN units un ON un.id = si.unit_id
      WHERE si.sale_id = $1 ORDER BY si.id`,
    [id],
  );
  const { rows: returns } = await db.query(
    `SELECT return_no, created_at, SUM(amount) AS amount, SUM(refund_amount) AS refund_amount,
            SUM(debt_reduced) AS debt_reduced
       FROM sale_returns WHERE sale_id = $1 GROUP BY return_no, created_at ORDER BY created_at`,
    [id],
  );
  return { ...rows[0], items, returns };
}

export async function createSale(client, user, body) {
  const key = body.idempotency_key ? String(body.idempotency_key).slice(0, 100) : null;
  if (key) {
    const { rows } = await client.query('SELECT id FROM sales WHERE idempotency_key = $1', [key]);
    if (rows[0]) return { sale: await loadSale(client, rows[0].id), duplicate: true };
  }

  const items = Array.isArray(body.items) ? body.items : [];
  if (items.length === 0) throw new HttpError(400, "Savatcha bo'sh. Tovar qo'shing");
  if (items.length > 200) throw new HttpError(400, "Bitta savdoda 200 tadan ko'p tovar bo'lishi mumkin emas");

  const products = await lockProducts(client, items.map((i) => i.product_id));
  const allowDiscount = can(user, 'sales.discount');
  const lines = [];
  for (const item of items) {
    const pid = num(item.product_id, 'Tovar', { positive: true });
    const p = products.get(pid);
    if (!p) throw new HttpError(400, 'Tovar topilmadi');
    if (p.is_archived) throw new HttpError(400, `"${p.name}" arxivlangan va sotilmaydi`);
    const qty = round4(num(item.quantity, 'Miqdor', { positive: true }));
    const unit = await resolveUnit(client, p, item.unit_id);
    const baseQty = round4(qty * unit.factor);
    const gross = round2(baseQty * Number(p.selling_price));
    const discount = round2(num(item.discount, 'Chegirma', { min: 0, optional: true }));
    if (discount > 0 && !allowDiscount) {
      throw new HttpError(403, "Chegirma berish uchun ruxsatingiz yo'q");
    }
    if (discount > gross) throw new HttpError(400, `"${p.name}" uchun chegirma summadan katta`);
    lines.push({
      product: p,
      batchId: item.batch_id ? num(item.batch_id, 'Rulon', { positive: true }) : null,
      unitId: unit.unitId,
      factor: unit.factor,
      qty,
      baseQty,
      unitPrice: round2(Number(p.selling_price) * unit.factor),
      gross,
      discount,
      lineTotal: round2(gross - discount),
    });
  }

  const gross = round2(lines.reduce((s, l) => s + l.gross, 0));
  const discountTotal = round2(lines.reduce((s, l) => s + l.discount, 0));
  const total = round2(lines.reduce((s, l) => s + l.lineTotal, 0));

  // To'lov
  const pay = body.payment || {};
  const method = pay.method || 'cash';
  if (!PAY_METHODS.includes(method)) throw new HttpError(400, "To'lov usuli noto'g'ri");
  let cash = 0;
  let card = 0;
  let transfer = 0;
  let credit = 0;
  if (method === 'mixed') {
    cash = round2(num(pay.cash, 'Naqd', { min: 0, optional: true }));
    card = round2(num(pay.card, 'Karta', { min: 0, optional: true }));
    transfer = round2(num(pay.transfer, "O'tkazma", { min: 0, optional: true }));
    credit = round2(num(pay.credit, 'Nasiya', { min: 0, optional: true }));
    const parts = round2(cash + card + transfer + credit);
    if (Math.abs(parts - total) > 0.005) {
      throw new HttpError(400, `Aralash to'lov summasi jami summaga teng bo'lishi kerak (jami: ${total})`, { total, parts });
    }
  } else if (method === 'cash') cash = total;
  else if (method === 'card') card = total;
  else if (method === 'transfer') transfer = total;
  else credit = total;

  let customerId = null;
  if (body.customer_id !== undefined && body.customer_id !== null && body.customer_id !== '') {
    customerId = num(body.customer_id, 'Mijoz', { positive: true });
    const { rows } = await client.query('SELECT id FROM customers WHERE id = $1 AND is_active', [customerId]);
    if (!rows[0]) throw new HttpError(400, 'Mijoz topilmadi');
  }
  if (credit > 0.005 && !customerId) {
    throw new HttpError(400, 'Nasiyaga sotish uchun mijozni tanlang');
  }
  const dueDate = credit > 0.005 ? dateStr(body.due_date, "To'lov muddati", { optional: true }) : null;
  const paidTotal = round2(cash + card + transfer);

  const settings = await getSettings(client);
  const shiftId = await currentShiftId(client);
  const { rows: no } = await client.query("SELECT 'C-' || lpad(nextval('receipt_seq')::text, 6, '0') AS no");
  const receiptNo = no[0].no;

  const { rows: sr } = await client.query(
    `INSERT INTO sales
       (receipt_no, customer_id, cashier_id, shift_id, payment_method, gross_total, discount_total,
        total, cost_total, paid_cash, paid_card, paid_transfer, paid_total, credit_amount,
        balance_due, due_date, idempotency_key, note)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 0, $9, $10, $11, $12, $13, $13, $14, $15, $16)
     RETURNING id`,
    [receiptNo, customerId, user.id, shiftId, method === 'mixed' ? 'mixed' : method, gross, discountTotal,
      total, cash, card, transfer, paidTotal, credit, dueDate, key,
      body.note ? String(body.note).slice(0, 500) : null],
  );
  const saleId = sr[0].id;

  let costTotal = 0;
  for (const l of lines) {
    const { cost, parts } = await issueStock(client, l.product, l.baseQty, {
      type: 'sale', refType: 'sale', refId: saleId, userId: user.id,
      costingMethod: settings.costing_method, note: receiptNo, preferBatchId: l.batchId,
    });
    const { rows: si } = await client.query(
      `INSERT INTO sale_items
         (sale_id, product_id, unit_id, factor, quantity, base_quantity, unit_price,
          gross_amount, discount, line_total, cost_total)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING id`,
      [saleId, l.product.id, l.unitId, l.factor, l.qty, l.baseQty, l.unitPrice,
        l.gross, l.discount, l.lineTotal, cost],
    );
    for (const part of parts) {
      await client.query(
        'INSERT INTO sale_item_costs (sale_item_id, batch_id, quantity, unit_cost) VALUES ($1, $2, $3, $4)',
        [si[0].id, part.batchId, part.qty, part.unitCost],
      );
    }
    costTotal = round2(costTotal + cost);
  }
  await client.query('UPDATE sales SET cost_total = $2 WHERE id = $1', [saleId, costTotal]);

  for (const [m, amount] of [['cash', cash], ['card', card], ['transfer', transfer]]) {
    await recordCash(client, {
      direction: 'in', method: m, category: 'sale', amount,
      refType: 'sale', refId: saleId, note: receiptNo, userId: user.id,
    });
  }

  await audit(client, user.id, 'sale.create', 'sale', saleId, {
    receipt_no: receiptNo, total, paid_total: paidTotal, credit, items: lines.length,
  });
  return { sale: await loadSale(client, saleId) };
}

export async function returnSale(client, user, saleId, body) {
  const { rows: sr } = await client.query('SELECT * FROM sales WHERE id = $1 FOR UPDATE', [saleId]);
  if (!sr[0]) throw new HttpError(404, 'Savdo topilmadi');
  const sale = sr[0];
  if (sale.kind === 'debt') throw new HttpError(400, "Bu qo'lda yozilgan qarz, savdo emas — undan tovar qaytarib bo'lmaydi");
  if (sale.status === 'returned') throw new HttpError(400, 'Bu savdodagi barcha tovarlar allaqachon qaytarilgan');

  const list = Array.isArray(body.items) ? body.items : [];
  if (list.length === 0) throw new HttpError(400, 'Qaytariladigan tovarni tanlang');
  const refundMethod = body.refund_method || 'cash';
  if (!CASH_METHODS.includes(refundMethod)) throw new HttpError(400, "Qaytarish usuli noto'g'ri");

  const { rows: sitems } = await client.query(
    'SELECT * FROM sale_items WHERE sale_id = $1 ORDER BY id FOR UPDATE',
    [saleId],
  );
  const byId = new Map(sitems.map((s) => [s.id, s]));
  const products = await lockProducts(client, sitems.map((s) => s.product_id));

  const seen = new Set();
  const lines = list.map((item) => {
    const siId = num(item.sale_item_id, 'Savdo qatori', { positive: true });
    if (seen.has(siId)) throw new HttpError(400, 'Bir xil tovar qatori ikki marta tanlangan');
    seen.add(siId);
    const si = byId.get(siId);
    if (!si) throw new HttpError(400, 'Savdo qatori topilmadi');
    const qty = num(item.quantity, 'Qaytarish miqdori', { positive: true });
    const baseQty = round4(qty * Number(si.factor));
    const remaining = round4(Number(si.base_quantity) - Number(si.returned_base_qty));
    if (baseQty > remaining + 1e-9) {
      throw new HttpError(400, `Qaytarish miqdori qolgan miqdordan oshmasligi kerak (qolgan: ${remaining} birlik)`);
    }
    const full = Math.abs(baseQty - remaining) < 1e-9;
    const amount = full
      ? round2(Number(si.line_total) - Number(si.returned_amount))
      : round2((Number(si.line_total) * baseQty) / Number(si.base_quantity));
    const cost = full
      ? round2(Number(si.cost_total) - Number(si.returned_cost))
      : round2((Number(si.cost_total) * baseQty) / Number(si.base_quantity));
    return { si, baseQty, amount, cost };
  });

  const totalAmount = round2(lines.reduce((s, l) => s + l.amount, 0));
  // Avval mijozning nasiya qarzi kamayadi, qolgani naqd/karta orqali qaytariladi
  let debtLeft = round2(Math.min(totalAmount, Number(sale.balance_due)));
  const debtReduced = debtLeft;
  const refund = round2(totalAmount - debtReduced);

  const { rows: rn } = await client.query("SELECT 'Q-' || lpad(nextval('return_seq')::text, 6, '0') AS no");
  const returnNo = rn[0].no;

  for (const l of lines) {
    const p = products.get(l.si.product_id);
    const unitCost = l.baseQty > 0 ? l.cost / l.baseQty : 0;
    const batchId = await receiveStock(client, p, l.baseQty, unitCost, {
      type: 'return', refType: 'sale_return', refId: saleId, userId: user.id, note: returnNo,
    });
    const lineDebt = round2(Math.min(l.amount, debtLeft));
    debtLeft = round2(debtLeft - lineDebt);
    await client.query(
      `INSERT INTO sale_returns
         (return_no, sale_id, sale_item_id, product_id, base_quantity, amount, cost,
          debt_reduced, refund_amount, refund_method, return_batch_id, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [returnNo, saleId, l.si.id, l.si.product_id, l.baseQty, l.amount, l.cost,
        lineDebt, round2(l.amount - lineDebt), refund > 0 ? refundMethod : null, batchId, user.id],
    );
    await client.query(
      `UPDATE sale_items
          SET returned_base_qty = returned_base_qty + $2,
              returned_amount = returned_amount + $3,
              returned_cost = returned_cost + $4
        WHERE id = $1`,
      [l.si.id, l.baseQty, l.amount, l.cost],
    );
  }

  await client.query(
    `UPDATE sales
        SET refunded_total = refunded_total + $2,
            balance_due = balance_due - $3
      WHERE id = $1`,
    [saleId, totalAmount, debtReduced],
  );
  const { rows: left } = await client.query(
    `SELECT COUNT(*) FILTER (WHERE returned_base_qty < base_quantity - 0.00001)::int AS open_items
       FROM sale_items WHERE sale_id = $1`,
    [saleId],
  );
  const status = left[0].open_items === 0 ? 'returned' : 'partially_returned';
  await client.query('UPDATE sales SET status = $2 WHERE id = $1', [saleId, status]);

  if (refund > 0) {
    await recordCash(client, {
      direction: 'out', method: refundMethod, category: 'refund', amount: refund,
      refType: 'sale', refId: saleId, note: returnNo, userId: user.id,
    });
  }

  await audit(client, user.id, 'sale.return', 'sale', saleId, {
    return_no: returnNo, amount: totalAmount, debt_reduced: debtReduced, refund, status,
  });
  return {
    return_no: returnNo,
    amount: totalAmount,
    debt_reduced: debtReduced,
    refund,
    status,
    sale: await loadSale(client, saleId),
  };
}
