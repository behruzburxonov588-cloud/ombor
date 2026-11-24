// Kirim (tovar qabul qilish): bir nechta tovar, yetkazib berish xarajati va chegirma
import { HttpError, num, round2, round4, dateStr, todayLocal } from '../util.js';
import { lockProducts, receiveStock } from './inventory.js';
import { resolveUnit } from './catalog.js';
import { recordCash } from './cash.js';
import { audit } from '../audit.js';

const METHODS = ['cash', 'card', 'transfer'];
export const UNKNOWN_SUPPLIER = "Noma'lum";

// «Noma'lum» yetkazib beruvchi: har do'konda bitta, kerak bo'lganda yaratiladi
async function unknownSupplier(client) {
  await client.query('SELECT pg_advisory_xact_lock(515152, hashtext(current_schema()))');
  const { rows } = await client.query(
    'SELECT id FROM suppliers WHERE name = $1 AND is_active ORDER BY id LIMIT 1',
    [UNKNOWN_SUPPLIER],
  );
  if (rows[0]) return rows[0].id;
  const r = await client.query('INSERT INTO suppliers (name) VALUES ($1) RETURNING id', [UNKNOWN_SUPPLIER]);
  return r.rows[0].id;
}

export async function loadPurchase(db, id) {
  const { rows } = await db.query(
    `SELECT p.*, s.name AS supplier_name
       FROM purchases p JOIN suppliers s ON s.id = p.supplier_id WHERE p.id = $1`,
    [id],
  );
  if (!rows[0]) return null;
  const { rows: items } = await db.query(
    `SELECT pi.*, pr.name AS product_name, u.name AS unit_name
       FROM purchase_items pi
       JOIN products pr ON pr.id = pi.product_id
       JOIN units u ON u.id = pi.unit_id
      WHERE pi.purchase_id = $1 ORDER BY pi.id`,
    [id],
  );
  return { ...rows[0], items };
}

export async function createPurchase(client, user, body) {
  const key = body.idempotency_key ? String(body.idempotency_key).slice(0, 100) : null;
  if (key) {
    const { rows } = await client.query('SELECT id FROM purchases WHERE idempotency_key = $1', [key]);
    if (rows[0]) return { purchase: await loadPurchase(client, rows[0].id), duplicate: true };
  }

  // Yetkazib beruvchi ixtiyoriy: ko'rsatilmasa (to'liq to'langan kirim) «Noma'lum» nomiga yoziladi
  const hasSupplier = body.supplier_id !== undefined && body.supplier_id !== null && body.supplier_id !== '' && Number(body.supplier_id) !== 0;
  let supplierId = null;
  if (hasSupplier) {
    supplierId = num(body.supplier_id, 'Yetkazib beruvchi', { positive: true });
    const { rows: sup } = await client.query('SELECT id FROM suppliers WHERE id = $1 AND is_active', [supplierId]);
    if (!sup[0]) throw new HttpError(400, 'Yetkazib beruvchi topilmadi');
  }

  const items = Array.isArray(body.items) ? body.items : [];
  if (items.length === 0) throw new HttpError(400, "Kirim uchun kamida bitta tovar qo'shing");
  if (items.length > 200) throw new HttpError(400, "Bitta kirimda 200 tadan ko'p tovar bo'lishi mumkin emas");
  const purchaseDate = dateStr(body.purchase_date || todayLocal(), 'Sana');

  const products = await lockProducts(client, items.map((i) => i.product_id));
  const lines = [];
  for (const item of items) {
    const pid = num(item.product_id, 'Tovar', { positive: true });
    const p = products.get(pid);
    if (!p) throw new HttpError(400, 'Tovar topilmadi');
    if (p.is_archived) throw new HttpError(400, `"${p.name}" arxivlangan. Avval uni faollashtiring`);
    const qty = num(item.quantity, 'Miqdor', { positive: true });
    const price = num(item.unit_price, 'Kirim narxi', { min: 0 });
    const unit = await resolveUnit(client, p, item.unit_id);
    lines.push({
      product: p,
      unitId: unit.unitId,
      factor: unit.factor,
      qty: round4(qty),
      price: round2(price),
      lineTotal: round2(qty * price),
      baseQty: round4(qty * unit.factor),
    });
  }

  const subtotal = round2(lines.reduce((s, l) => s + l.lineTotal, 0));
  const delivery = round2(num(body.delivery_cost, 'Yetkazib berish xarajati', { min: 0, optional: true }));
  const discount = round2(num(body.discount, 'Chegirma', { min: 0, optional: true }));
  if (discount > subtotal + delivery + 0.001) {
    throw new HttpError(400, 'Chegirma umumiy summadan katta bo\'lishi mumkin emas');
  }
  const total = round2(subtotal + delivery - discount);
  const paid = round2(num(body.paid_amount, "To'langan summa", { min: 0, optional: true }));
  if (paid > total + 0.001) throw new HttpError(400, "To'langan summa jami summadan katta bo'lishi mumkin emas");
  const payMethod = paid > 0 ? (body.payment_method || 'cash') : null;
  if (payMethod && !METHODS.includes(payMethod)) throw new HttpError(400, "To'lov usuli noto'g'ri");
  // Qarzni to'lash muddati: faqat qarz qolsa ma'noli (to'liq to'langan kirimda saqlanmaydi)
  let dueDate = body.due_date ? dateStr(body.due_date, "To'lov muddati") : null;
  if (dueDate && dueDate < purchaseDate) throw new HttpError(400, "To'lov muddati kirim sanasidan oldin bo'lishi mumkin emas");
  if (paid >= total - 0.001) dueDate = null;
  if (!hasSupplier) {
    if (paid < total - 0.001) {
      throw new HttpError(400, "Qarzga olgan bo'lsangiz, tovar kimdan kelganini tanlang (yetkazib beruvchi)");
    }
    supplierId = await unknownSupplier(client);
  }

  // Yetkazib berish va chegirma har bir qatorga qiymati bo'yicha taqsimlanadi (oxirgi qator qoldiqni oladi)
  const adjust = round2(delivery - discount);
  let allocated = 0;
  lines.forEach((l, i) => {
    if (i < lines.length - 1) {
      l.share = subtotal > 0 ? round2((l.lineTotal / subtotal) * adjust) : 0;
      allocated = round2(allocated + l.share);
    } else {
      l.share = round2(adjust - allocated);
    }
    l.landed = round2(l.lineTotal + l.share);
    l.unitCost = round4(l.landed / l.baseQty);
  });

  const { rows: no } = await client.query("SELECT 'K-' || lpad(nextval('purchase_seq')::text, 6, '0') AS no");
  const purchaseNo = no[0].no;
  const { rows: pr } = await client.query(
    `INSERT INTO purchases
       (purchase_no, supplier_id, purchase_date, subtotal, delivery_cost, discount, total,
        paid_amount, remaining_debt, note, idempotency_key, created_by, due_date)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 0, $7, $8, $9, $10, $11) RETURNING id`,
    [purchaseNo, supplierId, purchaseDate, subtotal, delivery, discount, total,
      body.note ? String(body.note).slice(0, 500) : null, key, user.id, dueDate],
  );
  const purchaseId = pr[0].id;

  for (const l of lines) {
    const batchId = await receiveStock(client, l.product, l.baseQty, l.unitCost, {
      type: 'purchase', refType: 'purchase', refId: purchaseId, userId: user.id, note: purchaseNo,
    });
    await client.query(
      `INSERT INTO purchase_items
         (purchase_id, product_id, unit_id, factor, quantity, base_quantity, unit_price,
          line_total, landed_total, unit_cost, batch_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [purchaseId, l.product.id, l.unitId, l.factor, l.qty, l.baseQty, l.price,
        l.lineTotal, l.landed, l.unitCost, batchId],
    );
    // Tovarning «kelish narxi» — oxirgi kelgan yukdagi narx (yo'l kira va chegirma bilan, 1 asosiy birlik uchun)
    if (l.unitCost > 0) {
      await client.query('UPDATE products SET purchase_price = $2 WHERE id = $1', [l.product.id, round2(l.unitCost)]);
    }
  }

  if (paid > 0) {
    const { rows: pay } = await client.query(
      `INSERT INTO supplier_payments (supplier_id, amount, method, note, created_by)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [supplierId, paid, payMethod, `Kirim ${purchaseNo} paytida to'langan`, user.id],
    );
    await client.query(
      'INSERT INTO supplier_payment_allocations (payment_id, purchase_id, amount) VALUES ($1, $2, $3)',
      [pay[0].id, purchaseId, paid],
    );
    await client.query(
      'UPDATE purchases SET paid_amount = $2, remaining_debt = $3 WHERE id = $1',
      [purchaseId, paid, round2(total - paid)],
    );
    await recordCash(client, {
      direction: 'out', method: payMethod, category: 'supplier_payment', amount: paid,
      refType: 'supplier_payment', refId: pay[0].id, note: purchaseNo, userId: user.id,
    });
  }

  await audit(client, user.id, 'purchase.create', 'purchase', purchaseId, {
    purchase_no: purchaseNo, total, paid, lines: lines.length,
  });
  return { purchase: await loadPurchase(client, purchaseId) };
}

// Kiritishni bekor qilish («Tovar kiritish»dagi «Bekor qilish»): xato kiritilgan yukni butunlay qaytaradi.
// Faqat hech narsa o'zgarmagan bo'lsa: shu tovarlarda keyin sotuv/kirim/sanash bo'lmagan, keyin to'lov qilinmagan,
// kassa smenasi yopilmagan. Aks holda xato — «Zarar / tuzatish» orqali to'g'rilanadi.
export const UNDO_HOURS = 24;

export async function undoPurchase(client, user, purchaseId) {
  const { rows } = await client.query(
    `SELECT p.*, (p.created_at > now() - make_interval(hours => $2)) AS fresh
       FROM purchases p WHERE p.id = $1 FOR UPDATE`,
    [purchaseId, UNDO_HOURS],
  );
  const pur = rows[0];
  if (!pur || pur.kind !== 'purchase') throw new HttpError(404, 'Kirim topilmadi');
  if (pur.created_by !== user.id && user.role !== 'owner') {
    throw new HttpError(403, "Faqat o'zingiz kiritgan yukni bekor qila olasiz");
  }
  if (!pur.fresh) throw new HttpError(409, `Kiritilganiga ${UNDO_HOURS} soatdan oshgan. Endi «Zarar / tuzatish» orqali to'g'rilang`);

  const { rows: items } = await client.query(
    'SELECT * FROM purchase_items WHERE purchase_id = $1 ORDER BY id',
    [purchaseId],
  );
  const products = await lockProducts(client, items.map((i) => i.product_id));
  const ids = [...products.keys()];

  // Shu tovarlarda keyin boshqa harakat bo'lganmi (sotuv, boshqa kirim, sanash, zarar)
  const { rows: later } = await client.query(
    `SELECT 1 FROM stock_movements m
      WHERE m.product_id = ANY($1::int[])
        AND m.id > (SELECT MIN(id) FROM stock_movements WHERE reference_type = 'purchase' AND reference_id = $2)
        AND NOT (m.reference_type = 'purchase' AND m.reference_id = $2)
      LIMIT 1`,
    [ids, purchaseId],
  );
  if (later[0]) {
    throw new HttpError(409, "Bu tovarlar keyin sotilgan yoki yana kiritilgan — bekor qilib bo'lmaydi. «Zarar / tuzatish» orqali to'g'rilang");
  }
  const batchIds = items.map((i) => i.batch_id).filter(Boolean);
  const { rows: touched } = await client.query(
    'SELECT 1 FROM stock_batches WHERE id = ANY($1::int[]) AND qty_remaining <> qty_initial LIMIT 1',
    [batchIds],
  );
  if (touched[0]) throw new HttpError(409, "Bu yukdan sotilgan — bekor qilib bo'lmaydi");

  // To'lovlar: faqat kiritish paytidagi to'lov bo'lsa (keyin alohida to'langan bo'lsa — bekor qilinmaydi)
  const { rows: allocs } = await client.query(
    `SELECT a.id, a.payment_id, a.amount, sp.amount AS payment_amount, (sp.created_at = p.created_at) AS at_entry
       FROM supplier_payment_allocations a
       JOIN supplier_payments sp ON sp.id = a.payment_id
       JOIN purchases p ON p.id = a.purchase_id
      WHERE a.purchase_id = $1`,
    [purchaseId],
  );
  const paymentIds = allocs.map((a) => a.payment_id);
  // Kiritish paytidagi to'lov o'sha tranzaksiyada yozilgan (vaqti bir xil); boshqasi — keyingi to'lov
  if (allocs.length > 1 || allocs.some((a) => !a.at_entry || Number(a.amount) !== Number(a.payment_amount))) {
    throw new HttpError(409, "Bu yuk uchun keyin to'lov qilingan — bekor qilib bo'lmaydi");
  }
  if (paymentIds.length) {
    const { rows: shut } = await client.query(
      `SELECT 1 FROM cash_transactions t JOIN cash_shifts s ON s.id = t.shift_id
        WHERE t.reference_type = 'supplier_payment' AND t.reference_id = ANY($1::int[]) AND s.status = 'closed' LIMIT 1`,
      [paymentIds],
    );
    if (shut[0]) throw new HttpError(409, "Kassa smenasi yopilgan — bu yukni bekor qilib bo'lmaydi");
  }

  // Faqat shu tranzaksiya ichida: moliyaviy yozuvlarni o'chirishga ruxsat (migratsiya 013)
  await client.query("SELECT set_config('ombor.undo', 'on', true)");

  // Ombor: qoldiq va o'rtacha tannarx kiritishdan oldingi holatga qaytadi
  for (const it of items) {
    const p = products.get(it.product_id);
    const qty = Number(it.base_quantity);
    const cost = Number(it.unit_cost);
    const nowQty = Number(p.stock_qty);
    const nowAvg = Number(p.avg_cost);
    const prevQty = round4(nowQty - qty);
    if (prevQty < -0.0001) throw new HttpError(409, `"${p.name}" qoldig'i yetmaydi — bekor qilib bo'lmaydi`);
    // Yaxlitlash qoldig'i (7000,0001) qolmasin: so'mga yaqin bo'lsa — so'mgacha
    const raw = prevQty > 0 ? Math.max(0, (nowQty * nowAvg - qty * cost) / prevQty) : nowAvg;
    const prevAvg = Math.abs(raw - round2(raw)) < 0.001 ? round2(raw) : round4(raw);
    await client.query('UPDATE products SET stock_qty = $2, avg_cost = $3, updated_at = now() WHERE id = $1', [p.id, Math.max(0, prevQty), prevAvg]);
    p.stock_qty = Math.max(0, prevQty);
    p.avg_cost = prevAvg;
  }
  await client.query("DELETE FROM stock_movements WHERE reference_type = 'purchase' AND reference_id = $1", [purchaseId]);
  await client.query('DELETE FROM purchase_items WHERE purchase_id = $1', [purchaseId]);
  if (batchIds.length) await client.query('DELETE FROM stock_batches WHERE id = ANY($1::int[])', [batchIds]);

  // Xarid narxi: shu tovarning oldingi partiyasidagi narx (oldingi kirim yoki boshlang'ich qoldiq; bo'lmasa — o'zgarmaydi)
  for (const pid of ids) {
    const { rows: prev } = await client.query(
      `SELECT unit_cost FROM stock_batches WHERE product_id = $1 AND unit_cost > 0
        ORDER BY received_at DESC, id DESC LIMIT 1`,
      [pid],
    );
    if (prev[0]) await client.query('UPDATE products SET purchase_price = $2 WHERE id = $1', [pid, round2(Number(prev[0].unit_cost))]);
  }

  if (paymentIds.length) {
    await client.query("DELETE FROM cash_transactions WHERE reference_type = 'supplier_payment' AND reference_id = ANY($1::int[])", [paymentIds]);
    await client.query('DELETE FROM supplier_payment_allocations WHERE purchase_id = $1', [purchaseId]);
    await client.query('DELETE FROM supplier_payments WHERE id = ANY($1::int[])', [paymentIds]);
  }
  await client.query('DELETE FROM purchases WHERE id = $1', [purchaseId]);
  await client.query("SELECT set_config('ombor.undo', 'off', true)");
  await audit(client, user.id, 'purchase.undo', 'purchase', purchaseId, {
    purchase_no: pur.purchase_no, total: Number(pur.total), paid: Number(pur.paid_amount), lines: items.length,
  });
  return {
    undone: true,
    purchase_no: pur.purchase_no,
    products: ids.map((id) => ({ id, name: products.get(id).name, stock_qty: Number(products.get(id).stock_qty) })),
  };
}
