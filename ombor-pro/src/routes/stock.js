// Ombor nazorati: umumiy holat, harakatlar, zarar/tuzatish, inventarizatsiya, nomuvofiqliklar
import { Router } from 'express';
import { pool, withTransaction } from '../db.js';
import { requirePerm } from '../auth.js';
import { HttpError, num, round2, round4, periodBounds, str, paging } from '../util.js';
import { lockProducts, receiveStock, issueStock } from '../services/inventory.js';
import { getSettings } from '../services/settings.js';
import { audit } from '../audit.js';

const router = Router();

// Har bir tovar bo'yicha ombor jadvali (davr ichida)
router.get('/stock/overview', requirePerm('stock.view'), async (req, res) => {
  const period = periodBounds(req.query.from, req.query.to);
  const { rows } = await pool.query(
    `SELECT p.id, p.name, p.stock_qty, p.min_stock, p.avg_cost, p.is_archived, un.name AS unit,
            COALESCE(SUM(m.quantity) FILTER (WHERE m.movement_type = 'purchase'), 0) AS incoming,
            -COALESCE(SUM(m.quantity) FILTER (WHERE m.movement_type = 'sale'), 0)
              - COALESCE(SUM(m.quantity) FILTER (WHERE m.movement_type = 'return'), 0) AS sold,
            -COALESCE(SUM(m.quantity) FILTER (WHERE m.movement_type = 'damage'), 0) AS damaged,
            COALESCE(SUM(m.quantity) FILTER (WHERE m.movement_type = 'correction'), 0) AS corrected
       FROM products p
       JOIN units un ON un.id = p.base_unit_id
       LEFT JOIN stock_movements m ON m.product_id = p.id AND m.created_at >= $1 AND m.created_at < $2
      WHERE NOT p.is_archived OR p.stock_qty > 0
      GROUP BY p.id, un.name
      ORDER BY p.name`,
    [period.from, period.to],
  );
  const items = rows.map((r) => {
    const stock = Number(r.stock_qty);
    const min = Number(r.min_stock);
    const status = stock <= 0 ? 'out' : min > 0 && stock <= min ? 'low' : 'ok';
    return {
      id: r.id,
      name: r.name,
      archived: r.is_archived,
      unit: r.unit,
      incoming: round4(r.incoming),
      sold: round4(r.sold),
      damaged: round4(r.damaged),
      corrected: round4(r.corrected),
      current: stock,
      min_stock: min,
      stock_value: round2(stock * Number(r.avg_cost)),
      status,
    };
  });
  const settings = await getSettings(pool);
  const valueRows = await pool.query(
    settings.costing_method === 'WAVG'
      ? 'SELECT COALESCE(SUM(stock_qty * avg_cost), 0) AS v FROM products WHERE NOT is_archived'
      : `SELECT COALESCE(SUM(b.qty_remaining * b.unit_cost), 0) AS v
           FROM stock_batches b JOIN products p ON p.id = b.product_id WHERE NOT p.is_archived`,
  );
  res.json({
    from: period.fromDate,
    to: period.toDate,
    costing_method: settings.costing_method,
    items,
    totals: {
      products: items.filter((i) => !i.archived).length,
      low: items.filter((i) => i.status === 'low').length,
      out: items.filter((i) => i.status === 'out').length,
      inventory_value: round2(valueRows.rows[0].v),
    },
  });
});

router.get('/stock/movements', requirePerm('stock.view', 'history.view'), async (req, res) => {
  const period = periodBounds(req.query.from, req.query.to);
  const params = [period.from, period.to];
  let extra = '';
  if (req.query.product_id) {
    params.push(Number(req.query.product_id));
    extra += ` AND m.product_id = $${params.length}`;
  }
  if (req.query.type) {
    params.push(String(req.query.type));
    extra += ` AND m.movement_type = $${params.length}`;
  }
  const { limit, offset } = paging(req.query, { limit: 200, max: 1000 });
  const { rows } = await pool.query(
    `SELECT m.id, m.movement_type, m.quantity, m.balance_after, m.balance_after - m.quantity AS balance_before, m.value, m.reference_type,
            m.reference_id, m.note, m.created_at, p.id AS product_id, p.name AS product_name, un.name AS unit, u.full_name AS user_name,
            CASE WHEN m.movement_type = 'sale' THEN
                   (SELECT ROUND(SUM(si.line_total) / NULLIF(SUM(si.base_quantity), 0), 2) FROM sale_items si
                     WHERE si.sale_id = m.reference_id AND si.product_id = m.product_id)
                 ELSE ROUND(ABS(m.value) / NULLIF(ABS(m.quantity), 0), 2) END AS unit_price
       FROM stock_movements m
       JOIN products p ON p.id = m.product_id
       JOIN units un ON un.id = p.base_unit_id
       LEFT JOIN users u ON u.id = m.created_by
      WHERE m.created_at >= $1 AND m.created_at < $2${extra}
      ORDER BY m.created_at DESC, m.id DESC LIMIT ${limit} OFFSET ${offset}`,
    params,
  );
  res.json({ movements: rows });
});

// Zarar yozish (yaroqsiz) yoki qoldiqni tuzatish (ortiqcha/kamomad)
router.post('/stock/adjust', requirePerm('stock.adjust'), async (req, res) => {
  const body = req.body || {};
  const productId = num(body.product_id, 'Tovar', { positive: true });
  const kind = body.kind;
  if (!['damage', 'correction'].includes(kind)) throw new HttpError(400, "Amal turi noto'g'ri");
  const qty = round4(num(body.quantity, 'Miqdor', { positive: true }));
  const direction = body.direction || 'minus';
  if (kind === 'damage' && direction !== 'minus') throw new HttpError(400, "Zarar faqat kamaytiriladi");
  if (!['plus', 'minus'].includes(direction)) throw new HttpError(400, "Yo'nalish noto'g'ri");
  const note = str(body.note, 'Izoh', { max: 300 });
  if (kind === 'correction' && !note) throw new HttpError(400, 'Tuzatish sababini yozing');

  const result = await withTransaction(async (client) => {
    const products = await lockProducts(client, [productId]);
    const p = products.get(productId);
    if (!p) throw new HttpError(404, 'Tovar topilmadi');
    const settings = await getSettings(client);
    let value = 0;
    if (kind === 'damage' || direction === 'minus') {
      const r = await issueStock(client, p, qty, {
        type: kind === 'damage' ? 'damage' : 'correction', refType: 'adjustment', refId: null,
        userId: req.user.id, note, costingMethod: settings.costing_method,
      });
      value = -r.cost;
    } else {
      const unitCost = Number(p.avg_cost) || Number(p.purchase_price) || 0;
      await receiveStock(client, p, qty, unitCost, {
        type: 'correction', refType: 'adjustment', userId: req.user.id, note,
      });
      value = qty * unitCost;
    }
    await audit(client, req.user.id, kind === 'damage' ? 'stock.damage' : 'stock.correction', 'product', productId, {
      quantity: qty, direction, note, value: round2(value),
    });
    return { product_id: productId, stock_qty: p.stock_qty, value: round2(value) };
  });
  res.status(201).json(result);
});

// ---------- Inventarizatsiya ----------

router.get('/stock/counts', requirePerm('stock.view', 'stock.count'), async (req, res) => {
  const { rows } = await pool.query(
    `SELECT c.*, u.full_name AS created_by_name,
            (SELECT COUNT(*)::int FROM inventory_count_items i WHERE i.count_id = c.id) AS items_total,
            (SELECT COUNT(*)::int FROM inventory_count_items i WHERE i.count_id = c.id AND i.counted_qty IS NOT NULL) AS items_counted
       FROM inventory_counts c LEFT JOIN users u ON u.id = c.created_by
      ORDER BY c.id DESC LIMIT 100`,
  );
  res.json({ counts: rows });
});

router.post('/stock/counts', requirePerm('stock.count'), async (req, res) => {
  const note = str(req.body?.note, 'Izoh', { max: 200 });
  const count = await withTransaction(async (client) => {
    const { rows: no } = await client.query("SELECT 'INV-' || lpad(nextval('count_seq')::text, 5, '0') AS no");
    const { rows } = await client.query(
      'INSERT INTO inventory_counts (count_no, note, created_by) VALUES ($1, $2, $3) RETURNING id, count_no',
      [no[0].no, note, req.user.id],
    );
    await client.query(
      `INSERT INTO inventory_count_items (count_id, product_id, system_qty)
       SELECT $1, id, stock_qty FROM products WHERE NOT is_archived ORDER BY name`,
      [rows[0].id],
    );
    await audit(client, req.user.id, 'count.create', 'inventory_count', rows[0].id, { count_no: rows[0].count_no });
    return rows[0];
  });
  res.status(201).json({ count });
});

router.get('/stock/counts/:id', requirePerm('stock.view', 'stock.count'), async (req, res) => {
  const id = Number(req.params.id);
  const { rows } = await pool.query('SELECT * FROM inventory_counts WHERE id = $1', [id]);
  if (!rows[0]) throw new HttpError(404, 'Sanash topilmadi');
  const { rows: items } = await pool.query(
    `SELECT i.id, i.product_id, p.name AS product_name, un.name AS unit, p.stock_qty AS current_qty,
            i.system_qty, i.counted_qty, i.applied_diff
       FROM inventory_count_items i
       JOIN products p ON p.id = i.product_id
       JOIN units un ON un.id = p.base_unit_id
      WHERE i.count_id = $1 ORDER BY p.name`,
    [id],
  );
  res.json({ count: rows[0], items });
});

// Sanoq natijalarini saqlash (tasdiqlashdan oldin)
router.put('/stock/counts/:id', requirePerm('stock.count'), async (req, res) => {
  const id = Number(req.params.id);
  const list = Array.isArray(req.body?.items) ? req.body.items : [];
  await withTransaction(async (client) => {
    const { rows } = await client.query('SELECT status FROM inventory_counts WHERE id = $1 FOR UPDATE', [id]);
    if (!rows[0]) throw new HttpError(404, 'Sanash topilmadi');
    if (rows[0].status !== 'draft') throw new HttpError(400, 'Tasdiqlangan sanashni o\'zgartirib bo\'lmaydi');
    for (const item of list) {
      const pid = num(item.product_id, 'Tovar', { positive: true });
      const counted = item.counted_qty === null || item.counted_qty === ''
        ? null
        : round4(num(item.counted_qty, 'Sanoq natijasi', { min: 0 }));
      await client.query(
        'UPDATE inventory_count_items SET counted_qty = $3 WHERE count_id = $1 AND product_id = $2',
        [id, pid, counted],
      );
    }
  });
  res.json({ ok: true });
});

// Tasdiqlash: farq omborga qo'llaniladi va har bir o'zgarish tarixga yoziladi
router.post('/stock/counts/:id/approve', requirePerm('stock.approve'), async (req, res) => {
  const id = Number(req.params.id);
  const result = await withTransaction(async (client) => {
    const { rows } = await client.query('SELECT * FROM inventory_counts WHERE id = $1 FOR UPDATE', [id]);
    if (!rows[0]) throw new HttpError(404, 'Sanash topilmadi');
    if (rows[0].status !== 'draft') throw new HttpError(400, 'Bu sanash allaqachon tasdiqlangan');
    const { rows: items } = await client.query(
      'SELECT * FROM inventory_count_items WHERE count_id = $1 ORDER BY product_id',
      [id],
    );
    const missing = items.filter((i) => i.counted_qty === null);
    if (missing.length) {
      throw new HttpError(400, `Barcha tovarlar sanalishi kerak. Sanalmagan: ${missing.length} ta`);
    }
    const products = await lockProducts(client, items.map((i) => i.product_id));
    const settings = await getSettings(client);
    let gain = 0;
    let loss = 0;
    for (const item of items) {
      const p = products.get(item.product_id);
      const diff = round4(Number(item.counted_qty) - Number(p.stock_qty));
      if (Math.abs(diff) < 1e-9) {
        await client.query('UPDATE inventory_count_items SET applied_diff = 0 WHERE id = $1', [item.id]);
        continue;
      }
      if (diff > 0) {
        const unitCost = Number(p.avg_cost) || Number(p.purchase_price) || 0;
        await receiveStock(client, p, diff, unitCost, {
          type: 'correction', refType: 'inventory_count', refId: id, userId: req.user.id,
          note: `${rows[0].count_no} sanash`,
        });
        gain += diff * unitCost;
      } else {
        const r = await issueStock(client, p, -diff, {
          type: 'correction', refType: 'inventory_count', refId: id, userId: req.user.id,
          note: `${rows[0].count_no} sanash`, costingMethod: settings.costing_method,
        });
        loss += r.cost;
      }
      await client.query('UPDATE inventory_count_items SET applied_diff = $2 WHERE id = $1', [item.id, diff]);
    }
    await client.query(
      `UPDATE inventory_counts
          SET status = 'approved', approved_by = $2, approved_at = now(), total_gain = $3, total_loss = $4
        WHERE id = $1`,
      [id, req.user.id, round2(gain), round2(loss)],
    );
    await audit(client, req.user.id, 'count.approve', 'inventory_count', id, {
      count_no: rows[0].count_no, gain: round2(gain), loss: round2(loss),
    });
    return { gain: round2(gain), loss: round2(loss) };
  });
  res.json({ ok: true, ...result });
});

// Nomuvofiqliklar: qoldiq va partiyalar mos kelmasligi, so'nggi sanoq farqlari
router.get('/stock/discrepancies', requirePerm('stock.view'), async (req, res) => {
  const { rows: mismatch } = await pool.query(
    `SELECT p.id, p.name, p.stock_qty, COALESCE(SUM(b.qty_remaining), 0) AS batch_qty
       FROM products p
       LEFT JOIN stock_batches b ON b.product_id = p.id
      GROUP BY p.id
     HAVING ABS(p.stock_qty - COALESCE(SUM(b.qty_remaining), 0)) > 0.0001
      ORDER BY p.name`,
  );
  const { rows: counts } = await pool.query(
    `SELECT i.product_id, p.name, un.name AS unit, c.count_no, c.approved_at, i.system_qty, i.counted_qty, i.applied_diff
       FROM inventory_count_items i
       JOIN inventory_counts c ON c.id = i.count_id
       JOIN products p ON p.id = i.product_id
       JOIN units un ON un.id = p.base_unit_id
      WHERE c.status = 'approved' AND c.approved_at > now() - interval '60 days'
        AND i.applied_diff IS NOT NULL AND i.applied_diff <> 0
      ORDER BY c.approved_at DESC LIMIT 200`,
  );
  res.json({ mismatches: mismatch, count_differences: counts });
});

export default router;
