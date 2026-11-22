// Ombor qoldig'i bilan ishlash: kirim, chiqim, partiyalar va tannarx.
// Barcha funksiyalar tranzaksiya ichida (client) chaqiriladi.
import { HttpError, round2, round4 } from '../util.js';

// Mahsulotlarni qulflaydi (id tartibida, tiqilib qolishning oldini olish uchun)
export async function lockProducts(client, ids) {
  const unique = [...new Set(ids.map(Number))].filter(Number.isInteger).sort((a, b) => a - b);
  const map = new Map();
  if (unique.length === 0) return map;
  const { rows } = await client.query(
    `SELECT p.*, u.name AS base_unit_name
       FROM products p JOIN units u ON u.id = p.base_unit_id
      WHERE p.id = ANY($1::int[])
      ORDER BY p.id
      FOR UPDATE OF p`,
    [unique],
  );
  for (const row of rows) map.set(row.id, row);
  return map;
}

export async function recordMovement(client, m) {
  await client.query(
    `INSERT INTO stock_movements
       (product_id, movement_type, quantity, balance_after, value, reference_type, reference_id, note, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [m.productId, m.type, m.quantity, m.balanceAfter, round2(m.value || 0), m.refType ?? null, m.refId ?? null, m.note ?? null, m.userId ?? null],
  );
}

// Ombor qoldig'ini oshiradi (kirim, qaytarish, sanoq ortiqcha). O'rtacha tannarxni yangilaydi.
export async function receiveStock(client, product, baseQty, unitCost, opts) {
  const qty = round4(baseQty);
  const cost = round4(unitCost);
  if (!(qty > 0)) throw new HttpError(400, "Miqdor noldan katta bo'lishi kerak");
  const prevQty = Number(product.stock_qty);
  const prevAvg = Number(product.avg_cost);
  const newQty = round4(prevQty + qty);
  const newAvg = newQty > 0 ? round4((prevQty * prevAvg + qty * cost) / newQty) : cost;

  await client.query(
    'UPDATE products SET stock_qty = $2, avg_cost = $3, updated_at = now() WHERE id = $1',
    [product.id, newQty, newAvg],
  );
  const { rows } = await client.query(
    `INSERT INTO stock_batches (product_id, source_type, source_id, qty_initial, qty_remaining, unit_cost)
     VALUES ($1, $2, $3, $4, $4, $5) RETURNING id`,
    [product.id, opts.refType ?? opts.type, opts.refId ?? null, qty, cost],
  );
  await recordMovement(client, {
    productId: product.id,
    type: opts.type,
    quantity: qty,
    balanceAfter: newQty,
    value: qty * cost,
    refType: opts.refType,
    refId: opts.refId,
    note: opts.note,
    userId: opts.userId,
  });
  product.stock_qty = newQty;
  product.avg_cost = newAvg;
  return rows[0].id;
}

// Ombor qoldig'ini kamaytiradi. FIFO bo'yicha partiyalardan oladi.
// costingMethod = 'FIFO' bo'lsa partiya tannarxi, 'WAVG' bo'lsa o'rtacha tannarx ishlatiladi.
export async function issueStock(client, product, baseQty, opts) {
  const qty = round4(baseQty);
  const prevQty = Number(product.stock_qty);
  if (!(qty > 0)) throw new HttpError(400, "Miqdor noldan katta bo'lishi kerak");
  if (qty > prevQty + 1e-9) {
    throw new HttpError(409, `"${product.name}" qoldig'i yetarli emas. Mavjud: ${prevQty} ${product.base_unit_name}`, {
      product_id: product.id,
      available: prevQty,
    });
  }

  const { rows: batches } = await client.query(
    `SELECT id, qty_remaining, unit_cost FROM stock_batches
      WHERE product_id = $1 AND qty_remaining > 0
      ORDER BY received_at, id
      FOR UPDATE`,
    [product.id],
  );

  let left = qty;
  const parts = [];
  for (const b of batches) {
    if (left <= 0) break;
    const take = round4(Math.min(left, Number(b.qty_remaining)));
    await client.query('UPDATE stock_batches SET qty_remaining = qty_remaining - $2 WHERE id = $1', [b.id, take]);
    parts.push({ batchId: b.id, qty: take, unitCost: opts.costingMethod === 'WAVG' ? Number(product.avg_cost) : Number(b.unit_cost) });
    left = round4(left - take);
  }
  if (left > 1e-9) {
    throw new HttpError(409, `"${product.name}" partiyalari bo'yicha qoldiq mos kelmadi. Ombor qoldig'ini tekshiring`);
  }

  const cost = round2(parts.reduce((sum, p) => sum + p.qty * p.unitCost, 0));
  const newQty = round4(prevQty - qty);
  await client.query('UPDATE products SET stock_qty = $2, updated_at = now() WHERE id = $1', [product.id, newQty]);
  await recordMovement(client, {
    productId: product.id,
    type: opts.type,
    quantity: -qty,
    balanceAfter: newQty,
    value: -cost,
    refType: opts.refType,
    refId: opts.refId,
    note: opts.note,
    userId: opts.userId,
  });
  product.stock_qty = newQty;
  return { cost, parts };
}

// Qoldiq partiyalar yig'indisi bilan mos keladimi (ombor nomuvofiqligini aniqlash uchun)
export async function batchTotal(client, productId) {
  const { rows } = await client.query(
    'SELECT COALESCE(SUM(qty_remaining), 0) AS total FROM stock_batches WHERE product_id = $1',
    [productId],
  );
  return Number(rows[0].total);
}

// Kelish narxi keyin yozilsa yoki to'g'rilansa — foyda to'g'ri chiqishi uchun tannarx qayta hisoblanadi:
//   ombordagi partiyalar, ulardan qilingan sotuvlar (sale_item_costs → sale_items → sales) va qaytarishlar.
// mode 'zero'    — faqat narxi yozilmagan (0) partiyalar;
// mode 'missing' — narxi 0 bo'lganlar va boshlang'ich qoldiq (tovar qo'shilganda kiritilgan);
// mode 'all'     — shu tovarning hamma partiyalari (masalan, narx xato yozilgan bo'lsa).
// Kirim hujjatlari va yetkazib beruvchiga qarz o'zgarmaydi — faqat foyda (tannarx) hisobi.
export async function recostProduct(client, productId, newCost, mode = 'missing') {
  const cost = round4(newCost);
  if (!(cost > 0)) throw new HttpError(400, "Kelish narxi noldan katta bo'lishi kerak");
  const { rows: batches } = await client.query(
    `SELECT id FROM stock_batches
      WHERE product_id = $1 AND unit_cost <> $2
        AND ($3 = 'all' OR unit_cost = 0 OR ($3 = 'missing' AND source_type = 'product'))`,
    [productId, cost, mode],
  );
  const ids = batches.map((b) => b.id);
  let sales = 0;
  if (ids.length) {
    await client.query('UPDATE stock_batches SET unit_cost = $2 WHERE id = ANY($1::int[])', [ids, cost]);
    const { rows: touched } = await client.query(
      'UPDATE sale_item_costs SET unit_cost = $2 WHERE batch_id = ANY($1::int[]) RETURNING sale_item_id',
      [ids, cost],
    );
    const itemIds = [...new Set(touched.map((r) => r.sale_item_id))];
    if (itemIds.length) {
      await client.query(
        `UPDATE sale_items si SET cost_total = c.total
           FROM (SELECT sale_item_id, ROUND(SUM(quantity * unit_cost), 2) AS total
                   FROM sale_item_costs WHERE sale_item_id = ANY($1::int[]) GROUP BY sale_item_id) c
          WHERE si.id = c.sale_item_id`,
        [itemIds],
      );
      // Qaytarilgan tovarlar tannarxi — qaytarilgan miqdor ulushida
      await client.query(
        `UPDATE sale_returns r SET cost = ROUND(si.cost_total * r.base_quantity / NULLIF(si.base_quantity, 0), 2)
           FROM sale_items si WHERE r.sale_item_id = si.id AND si.id = ANY($1::int[])`,
        [itemIds],
      );
      await client.query(
        `UPDATE sale_items si SET returned_cost = COALESCE((SELECT SUM(r.cost) FROM sale_returns r WHERE r.sale_item_id = si.id), 0)
          WHERE si.id = ANY($1::int[])`,
        [itemIds],
      );
      const { rows: s } = await client.query(
        `UPDATE sales sa SET cost_total = (SELECT COALESCE(SUM(cost_total), 0) FROM sale_items WHERE sale_id = sa.id)
          WHERE sa.id IN (SELECT DISTINCT sale_id FROM sale_items WHERE id = ANY($1::int[])) RETURNING sa.id`,
        [itemIds],
      );
      sales = s.length;
    }
    // Ombor harakatlari tarixi o'zgartirilmaydi (u faqat yoziladi) — foyda savdo tannarxidan hisoblanadi
  }
  // O'rtacha tannarx — ombordagi partiyalar bo'yicha (qoldiq bo'lmasa — yangi narx)
  await client.query(
    `UPDATE products p
        SET avg_cost = COALESCE((SELECT ROUND(SUM(qty_remaining * unit_cost) / NULLIF(SUM(qty_remaining), 0), 4)
                                   FROM stock_batches WHERE product_id = p.id AND qty_remaining > 0), $2),
            purchase_price = $3, updated_at = now()
      WHERE p.id = $1`,
    [productId, cost, round2(newCost)],
  );
  return { batches: ids.length, sales };
}

// Tovar bo'yicha tannarxsiz qolgan narsalar: ombordagi narxsiz qoldiq va tannarxsiz sotuvlar
export async function missingCost(db, productId) {
  const { rows } = await db.query(
    `SELECT COALESCE((SELECT SUM(qty_remaining) FROM stock_batches WHERE product_id = $1 AND qty_remaining > 0 AND unit_cost = 0), 0) AS stock_qty,
            (SELECT COUNT(DISTINCT si.sale_id)::int FROM sale_items si
              WHERE si.product_id = $1 AND si.cost_total = 0 AND si.line_total > 0) AS sales`,
    [productId],
  );
  return { stock_qty: round4(rows[0].stock_qty), sales: rows[0].sales };
}
