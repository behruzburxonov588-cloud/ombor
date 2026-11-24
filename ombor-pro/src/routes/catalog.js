// Tovarlar, birliklar, kategoriyalar, rasmlar va shtrix-kodlar
import { Router } from 'express';
import multer from 'multer';
import path from 'node:path';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import { pool, withTransaction } from '../db.js';
import { requirePerm, can } from '../auth.js';
import { config } from '../config.js';
import { HttpError, num, str, round2, round4, paging, dateStr, todayLocal, addDays } from '../util.js';
import { audit } from '../audit.js';
import { productUnits } from '../services/catalog.js';
import { receiveStock, recostProduct, missingCost } from '../services/inventory.js';
import { ATTRIBUTE_FIELDS } from '../services/storetypes.js';
import { saveSettings } from '../services/settings.js';
import { readTable } from '../services/xlsxread.js';
import { buildXlsx } from '../services/xlsx.js';

const router = Router();

// Rasm saqlash: oddiy serverda diskka; Cloudflare Workers yoki doimiy diski yo'q hostingda
// (masalan, Render bepul rejasi: OMBOR_IMAGE_STORE=db) bazaga
export const imagesInDb = () => process.env.OMBOR_RUNTIME === 'worker' || process.env.OMBOR_IMAGE_STORE === 'db';
const IMAGE_LIMITS = { fileSize: 3 * 1024 * 1024 };
const imageFilter = (req, file, cb) => {
  const ok = ['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype);
  cb(ok ? null : new HttpError(400, "Faqat JPG, PNG yoki WEBP rasm yuklash mumkin"), ok);
};
let diskUpload = null;
let memoryUpload = null;
function imageUpload() {
  if (imagesInDb()) {
    memoryUpload ||= multer({ storage: multer.memoryStorage(), limits: IMAGE_LIMITS, fileFilter: imageFilter });
    return memoryUpload;
  }
  diskUpload ||= multer({
    storage: multer.diskStorage({
      destination: config.uploadDir,
      filename: (req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        cb(null, `${crypto.randomUUID()}${ext}`);
      },
    }),
    limits: IMAGE_LIMITS,
    fileFilter: imageFilter,
  });
  return diskUpload;
}

// ---------- Birliklar va kategoriyalar ----------

router.get('/units', requirePerm('products.view', 'sales.create', 'purchases.view'), async (req, res) => {
  const { rows } = await pool.query('SELECT id, code, name, is_custom FROM units ORDER BY is_custom, id');
  res.json({ units: rows });
});

router.post('/units', requirePerm('products.manage'), async (req, res) => {
  const name = str(req.body?.name, 'Birlik nomi', { required: true, max: 40 });
  const { rows: dup } = await pool.query('SELECT 1 FROM units WHERE lower(name) = lower($1)', [name]);
  if (dup[0]) throw new HttpError(409, 'Bunday birlik allaqachon mavjud');
  const { rows } = await withTransaction(async (client) => {
    const r = await client.query(
      'INSERT INTO units (name, is_custom) VALUES ($1, TRUE) RETURNING id, code, name, is_custom',
      [name],
    );
    await audit(client, req.user.id, 'unit.create', 'unit', r.rows[0].id, { name });
    return r;
  });
  res.status(201).json({ unit: rows[0] });
});

router.get('/categories', requirePerm('products.view', 'sales.create', 'purchases.view'), async (req, res) => {
  const { rows } = await pool.query('SELECT id, name FROM categories ORDER BY name');
  res.json({ categories: rows });
});

router.post('/categories', requirePerm('products.manage'), async (req, res) => {
  const name = str(req.body?.name, 'Kategoriya nomi', { required: true, max: 60 });
  const { rows } = await pool.query(
    'INSERT INTO categories (name) VALUES ($1) ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name RETURNING id, name',
    [name],
  );
  res.status(201).json({ category: rows[0] });
});

// ---------- Tovarlar ----------

const PRODUCT_SELECT = `
  SELECT p.*, u.name AS base_unit_name, c.name AS category_name, s.name AS supplier_name,
         COALESCE((SELECT SUM(si.base_quantity - si.returned_base_qty) FROM sale_items si WHERE si.product_id = p.id), 0) AS sold_qty,
         COALESCE((SELECT SUM(si.line_total - si.returned_amount) FROM sale_items si WHERE si.product_id = p.id), 0) AS sold_revenue,
         COALESCE((SELECT SUM(si.cost_total - si.returned_cost) FROM sale_items si WHERE si.product_id = p.id), 0) AS sold_cost,
         COALESCE((SELECT SUM(b.qty_remaining * b.unit_cost) FROM stock_batches b WHERE b.product_id = p.id), 0) AS batch_value,
         (SELECT COUNT(*) FROM stock_batches b WHERE b.product_id = p.id AND b.qty_remaining > 0)::int AS batch_count,
         COALESCE((SELECT json_agg(json_build_object('unit_id', pu.unit_id, 'name', un.name, 'factor', pu.factor) ORDER BY pu.factor)
                     FROM product_units pu JOIN units un ON un.id = pu.unit_id WHERE pu.product_id = p.id), '[]'::json) AS conv_json
    FROM products p
    JOIN units u ON u.id = p.base_unit_id
    LEFT JOIN categories c ON c.id = p.category_id
    LEFT JOIN suppliers s ON s.id = p.supplier_id`;

// Tannarx, kirim narxi va foyda faqat ombor/kirim/hisobot huquqi borlarga ko'rinadi (kassirga emas)
export function seesCost(user) {
  return ['products.manage', 'reports.view', 'purchases.view', 'stock.view'].some((k) => can(user, k));
}

const COST_FIELDS = ['purchase_price', 'avg_cost', 'stock_value', 'sold_cost', 'profit'];
function hideCost(product, user) {
  if (seesCost(user)) return product;
  for (const f of COST_FIELDS) delete product[f];
  product.cost_hidden = true;
  return product;
}

function shapeProduct(row, conversions = row.conv_json || []) {
  const stock = Number(row.stock_qty);
  const conv = conversions.map((c) => ({ unit_id: c.unit_id, name: c.name, factor: Number(c.factor) }));
  // Eng katta qadoq (masalan: quti, rulon) — qoldiqni «5 quti 3 dona» ko'rinishida ko'rsatish uchun
  const pack = conv.reduce((best, c) => (c.factor > 1 && (!best || c.factor > best.factor) ? c : best), null);
  const minStock = Number(row.min_stock);
  let status = 'ok';
  if (stock <= 0) status = 'out';
  else if (minStock > 0 && stock <= minStock) status = 'low';
  // Yaroqlilik muddati: o'tgan (expired) yoki 30 kun ichida tugaydi (soon)
  const expiry = row.expiry_date ? (row.expiry_date instanceof Date ? row.expiry_date.toISOString().slice(0, 10) : String(row.expiry_date).slice(0, 10)) : null;
  const today = todayLocal();
  let expiryStatus = null;
  if (expiry) expiryStatus = expiry < today ? 'expired' : (expiry <= addDays(today, 30) ? 'soon' : 'ok');
  const revenue = round2(row.sold_revenue);
  const cost = round2(row.sold_cost);
  return {
    id: row.id,
    name: row.name,
    barcode: row.barcode,
    sku: row.sku || null,
    model_name: row.model_name || null,
    variant_label: row.variant_label || null,
    description: row.description || null,
    attributes: row.attributes && typeof row.attributes === 'object' ? row.attributes : {},
    expiry_date: expiry,
    expiry_status: expiryStatus,
    category_id: row.category_id,
    category_name: row.category_name,
    supplier_id: row.supplier_id,
    supplier_name: row.supplier_name,
    base_unit_id: row.base_unit_id,
    base_unit_name: row.base_unit_name,
    purchase_price: Number(row.purchase_price),
    selling_price: Number(row.selling_price),
    min_stock: minStock,
    stock_qty: stock,
    avg_cost: Number(row.avg_cost),
    stock_value: round2(stock * Number(row.avg_cost)),
    sold_qty: Number(row.sold_qty),
    remaining_qty: stock,
    sold_revenue: revenue,
    sold_cost: cost,
    profit: round2(revenue - cost),
    image_path: row.image_path,
    is_archived: row.is_archived,
    status,
    conversions: conv,
    pack,
    // Rulonli tovar (mato, kabel, gilam...): har bir rulon — alohida partiya, uzunligi har xil bo'lishi mumkin
    is_roll: conv.some((c) => String(c.name).toLowerCase() === 'rulon'),
    roll_count: conv.some((c) => String(c.name).toLowerCase() === 'rulon') ? Number(row.batch_count || 0) : null,
  };
}

router.get('/products', requirePerm('products.view', 'sales.create', 'purchases.view', 'stock.view'), async (req, res) => {
  const q = String(req.query.q || '').trim();
  const where = [];
  const params = [];
  const archived = req.query.archived === '1';
  params.push(archived);
  where.push(`p.is_archived = $${params.length}`);
  if (q) {
    params.push(q);
    where.push(`(p.name ILIKE '%' || $${params.length} || '%' OR p.barcode = $${params.length} OR lower(p.sku) = lower($${params.length})
      OR EXISTS (SELECT 1 FROM jsonb_each_text(p.attributes) a WHERE a.value ILIKE '%' || $${params.length} || '%'))`);
  }
  if (req.query.model) { // bitta modelning hamma o'lchamlari
    params.push(String(req.query.model).trim());
    where.push(`lower(p.model_name) = lower($${params.length})`);
  }
  if (req.query.category_id) {
    params.push(Number(req.query.category_id));
    where.push(`p.category_id = $${params.length}`);
  }
  if (req.query.stock === 'low') where.push('p.min_stock > 0 AND p.stock_qty > 0 AND p.stock_qty <= p.min_stock');
  if (req.query.stock === 'out') where.push('p.stock_qty <= 0');
  if (req.query.cost === 'missing') where.push('p.purchase_price = 0 AND p.avg_cost = 0');
  if (req.query.expiry === 'soon') where.push("p.expiry_date IS NOT NULL AND p.expiry_date <= (now() AT TIME ZONE 'Asia/Tashkent')::date + 30");
  const { limit, offset } = paging(req.query, { limit: 200, max: 1000 });
  const { rows } = await pool.query(
    `${PRODUCT_SELECT} WHERE ${where.join(' AND ')} ORDER BY p.name LIMIT ${limit} OFFSET ${offset}`,
    params,
  );
  res.json({ products: rows.map((r) => hideCost(shapeProduct(r), req.user)) });
});

router.get('/products/barcode/:code', requirePerm('sales.create', 'products.view', 'stock.view', 'purchases.create'), async (req, res) => {
  const code = String(req.params.code || '').trim();
  const { rows } = await pool.query(`${PRODUCT_SELECT} WHERE p.barcode = $1`, [code]);
  if (!rows[0]) throw new HttpError(404, "Bu shtrix-kod bo'yicha tovar topilmadi");
  if (rows[0].is_archived) throw new HttpError(400, 'Bu tovar arxivlangan');
  const conv = await productUnits(pool, rows[0].id);
  res.json({ product: hideCost(shapeProduct(rows[0], conv), req.user) });
});

router.get('/products/:id', requirePerm('products.view', 'stock.view'), async (req, res) => {
  const id = Number(req.params.id);
  const { rows } = await pool.query(`${PRODUCT_SELECT} WHERE p.id = $1`, [id]);
  if (!rows[0]) throw new HttpError(404, 'Tovar topilmadi');
  const conv = await productUnits(pool, id);
  const { rows: batches } = await pool.query(
    `SELECT id, received_at, qty_initial, qty_remaining, unit_cost, source_type
       FROM stock_batches WHERE product_id = $1 AND qty_remaining > 0 ORDER BY received_at, id`,
    [id],
  );
  res.json({
    product: hideCost(shapeProduct(rows[0], conv), req.user),
    batches: seesCost(req.user) ? batches : batches.map(({ unit_cost: _c, ...b }) => b),
    ...(seesCost(req.user) ? { missing_cost: await missingCost(pool, id) } : {}),
  });
});

async function validateProductBody(client, body, existingId = null) {
  const name = str(body.name, 'Tovar nomi', { required: true, max: 150 });
  const barcode = str(body.barcode, 'Shtrix-kod', { max: 64 });
  // Artikul (SKU): yuborilmasa — o'zgarmaydi; bo'sh satr — o'chiriladi
  const skuGiven = body.sku !== undefined;
  const sku = skuGiven ? (str(body.sku, 'Artikul (SKU)', { max: 64 }) || null) : null;
  if (sku) {
    const { rows: dupSku } = await client.query(
      'SELECT id, name FROM products WHERE lower(sku) = lower($1) AND ($2::int IS NULL OR id <> $2)',
      [sku, existingId],
    );
    if (dupSku[0]) throw new HttpError(409, `Bu artikul "${dupSku[0].name}" tovarida allaqachon bor`);
  }
  // O'lcham: model nomi va o'lcham birga keladi (masalan: "Futbolka" + "M"); yuborilmasa — o'zgarmaydi
  const sizeGiven = body.model_name !== undefined || body.variant_label !== undefined;
  const modelName = sizeGiven ? (str(body.model_name, 'Model nomi', { max: 150 }) || null) : null;
  const variantLabel = sizeGiven ? (str(body.variant_label, "O'lcham", { max: 40 }) || null) : null;
  if (Boolean(modelName) !== Boolean(variantLabel)) throw new HttpError(400, "O'lcham uchun tovar nomi va o'lchamning o'zi ikkalasi ham kerak");
  // Izoh va yaroqlilik muddati: yuborilmasa — o'zgarmaydi; bo'sh satr — o'chiriladi
  const descGiven = body.description !== undefined;
  const description = descGiven ? (str(body.description, 'Izoh', { max: 1000 }) || null) : null;
  // Qo'shimcha xususiyatlar (brend, rang, IMEI, OEM...): faqat ma'lum kalitlar, har biri 200 belgigacha; yuborilmasa — o'zgarmaydi
  const attrsGiven = body.attributes !== undefined;
  let attributes = {};
  if (attrsGiven && body.attributes !== null) {
    if (typeof body.attributes !== 'object' || Array.isArray(body.attributes)) throw new HttpError(400, "Xususiyatlar noto'g'ri yuborildi");
    for (const [k, val] of Object.entries(body.attributes)) {
      if (!ATTRIBUTE_FIELDS[k]) continue;
      const text = str(val, ATTRIBUTE_FIELDS[k].label, { max: 200 });
      if (text) attributes[k] = text;
    }
  }
  const expiryGiven = body.expiry_date !== undefined;
  const expiryDate = expiryGiven ? dateStr(body.expiry_date, 'Yaroqlilik muddati', { optional: true }) : null;
  if (modelName) {
    const { rows: dupSize } = await client.query(
      `SELECT id FROM products WHERE lower(model_name) = lower($1) AND lower(variant_label) = lower($2)
          AND NOT is_archived AND ($3::int IS NULL OR id <> $3)`,
      [modelName, variantLabel, existingId],
    );
    if (dupSize[0]) throw new HttpError(409, `«${modelName}» tovarida «${variantLabel}» o'lchami allaqachon bor`);
  }
  const baseUnitId = num(body.base_unit_id, "Asosiy o'lchov birligi", { positive: true });
  const { rows: unit } = await client.query('SELECT id FROM units WHERE id = $1', [baseUnitId]);
  if (!unit[0]) throw new HttpError(400, "Asosiy birlik topilmadi");
  if (barcode) {
    const { rows: dup } = await client.query(
      'SELECT id, name FROM products WHERE barcode = $1 AND ($2::int IS NULL OR id <> $2)',
      [barcode, existingId],
    );
    if (dup[0]) throw new HttpError(409, `Bu shtrix-kod "${dup[0].name}" tovarida allaqachon bor`);
  }
  const conversions = Array.isArray(body.conversions) ? body.conversions : [];
  const seen = new Set();
  const cleanConv = conversions.map((c) => {
    const unitId = num(c.unit_id, 'Birlik', { positive: true });
    if (unitId === baseUnitId) throw new HttpError(400, "Asosiy birlikni qo'shimcha birlik sifatida qo'shib bo'lmaydi");
    if (seen.has(unitId)) throw new HttpError(400, 'Bir birlik ikki marta kiritilgan');
    seen.add(unitId);
    return { unitId, factor: round4(num(c.factor, 'Konvertatsiya koeffitsienti', { positive: true })) };
  });
  return {
    name,
    barcode,
    sku,
    skuGiven,
    sizeGiven,
    modelName,
    variantLabel,
    description,
    descGiven,
    expiryDate,
    expiryGiven,
    attributes,
    attrsGiven,
    categoryId: body.category_id ? num(body.category_id, 'Kategoriya', { positive: true }) : null,
    supplierId: body.supplier_id ? num(body.supplier_id, 'Yetkazib beruvchi', { positive: true }) : null,
    baseUnitId,
    purchasePrice: round2(num(body.purchase_price, 'Kirim narxi', { min: 0, optional: true })),
    sellingPrice: round2(num(body.selling_price, 'Sotuv narxi', { min: 0, optional: true })),
    minStock: round4(num(body.min_stock, 'Minimal qoldiq', { min: 0, optional: true })),
    conversions: cleanConv,
  };
}

async function saveConversions(client, productId, conversions) {
  await client.query('DELETE FROM product_units WHERE product_id = $1', [productId]);
  for (const c of conversions) {
    await client.query(
      'INSERT INTO product_units (product_id, unit_id, factor) VALUES ($1, $2, $3)',
      [productId, c.unitId, c.factor],
    );
  }
}

// Yangi tovar (tranzaksiya ichida): tekshiruv, yozish, qadoqlar, boshlang'ich qoldiq, tarix
async function createProduct(client, body, user) {
  const v = await validateProductBody(client, body);
  // Rulonlar uzunligi har xil bo'lsa: har bir rulon alohida (masalan: 50, 45, 60 metr)
  const rolls = Array.isArray(body.opening_rolls) ? body.opening_rolls.map((x) => round4(num(x, 'Rulon uzunligi', { positive: true }))) : [];
  if (rolls.length > 200) throw new HttpError(400, "Bir martada 200 tadan ko'p rulon kiritib bo'lmaydi");
  const opening = rolls.length ? round4(rolls.reduce((s2, x) => s2 + x, 0)) : round4(num(body.opening_qty, 'Boshlang\'ich qoldiq', { min: 0, optional: true }));
  const { rows } = await client.query(
    `INSERT INTO products
       (name, barcode, category_id, supplier_id, base_unit_id, purchase_price, selling_price, min_stock, sku, model_name, variant_label,
        description, expiry_date, attributes)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) RETURNING id`,
    [v.name, v.barcode, v.categoryId, v.supplierId, v.baseUnitId, v.purchasePrice, v.sellingPrice, v.minStock, v.sku, v.modelName, v.variantLabel,
      v.description, v.expiryDate, JSON.stringify(v.attributes)],
  );
  const id = rows[0].id;
  await saveConversions(client, id, v.conversions);
  if (opening > 0) {
    const { rows: p } = await client.query(
      'SELECT p.*, u.name AS base_unit_name FROM products p JOIN units u ON u.id = p.base_unit_id WHERE p.id = $1 FOR UPDATE',
      [id],
    );
    for (const qty of (rolls.length ? rolls : [opening])) {
      await receiveStock(client, p[0], qty, v.purchasePrice, {
        type: 'opening', refType: 'product', refId: id, userId: user.id, note: rolls.length ? `Boshlang'ich qoldiq (rulon ${qty})` : 'Boshlang\'ich qoldiq',
      });
    }
  }
  await audit(client, user.id, 'product.create', 'product', id, { name: v.name, barcode: v.barcode, opening, ...(rolls.length ? { rolls: rolls.length } : {}) });
  return id;
}

router.post('/products', requirePerm('products.manage'), async (req, res) => {
  const body = req.body || {};
  const result = await withTransaction((client) => createProduct(client, body, req.user));
  res.status(201).json({ id: result });
});

// ---------- Excel / CSV dan tovarlarni yuklash ----------
// Ustunlar nomi bo'yicha topiladi (tartibi muhim emas): Nomi, Shtrix-kod, Artikul, Kategoriya, Birlik,
// Kelish narxi, Sotuv narxi, Qoldiq, Minimal qoldiq, Brend, Rangi, Yaroqlilik muddati.
const IMPORT_COLUMNS = [
  ['min_stock', /(minimal|min\.?|ogohlantir)/],
  ['expiry_date', /(yaroqlilik|muddat|expir)/],
  ['purchase_price', /(xarid|kelish|tannarx|kirim narx|olish narx|purchase|cost)/],
  ['selling_price', /(sotuv|sotish|narx|price)/],
  ['opening_qty', /(qoldiq|soni|miqdor|nechta|qty|quantity|ombor)/],
  ['barcode', /(shtrix|barcode|bar ?kod|barkod)/],
  ['sku', /(artikul|sku)/],
  ['category', /(kategoriya|turkum|category)/],
  ['unit', /(birlik|olchov|unit)/],
  ['brand', /(brend|brand)/],
  ['color', /(rang|color)/],
  ['name', /(nomi|nom|tovar|tovar|name)/],
];
const norm = (s) => String(s || '').toLowerCase().replace(/[ʻ'’`‘"]/g, '').replace(/\s+/g, ' ').trim();
const UNIT_SYNONYMS = {
  dona: 'piece', ta: 'piece', sht: 'piece', pcs: 'piece', kg: 'kg', kilogramm: 'kg', kilo: 'kg', gramm: 'g', gr: 'g', g: 'g',
  tonna: 't', t: 't', litr: 'l', l: 'l', ml: 'ml', millilitr: 'ml', metr: 'm', m: 'm', quti: 'box', pachka: 'pack',
  rulon: 'roll', juft: 'pair', qop: 'bag', toplam: 'set', 'kv metr': 'm2', m2: 'm2', 'kub metr': 'm3', m3: 'm3', kub: 'm3',
};
const moneyIn = (v) => {
  let s = String(v ?? '').toLowerCase().replace(/so['ʻ’`‘]?m|сўм|сум|uzs/g, '').replace(/[\s  '’ʻ‘`_]/g, '');
  if (!s) return 0;
  if (/^-?[1-9]\d{0,2}([.,]\d{3})+$/.test(s)) s = s.replace(/[.,]/g, '');
  else if (s.includes('.') && s.includes(',')) {
    const i = Math.max(s.lastIndexOf('.'), s.lastIndexOf(','));
    s = `${s.slice(0, i).replace(/[.,]/g, '')}.${s.slice(i + 1)}`;
  } else s = s.replace(',', '.');
  return /^-?(\d+\.?\d*|\.\d+)$/.test(s) ? Number(s) : NaN;
};
const qtyIn = (v) => {
  const s = String(v ?? '').replace(/\s/g, '').replace(',', '.');
  return s === '' ? 0 : (/^-?(\d+\.?\d*|\.\d+)$/.test(s) ? Number(s) : NaN);
};
// Excel sana raqami (masalan 46000) yoki 31.12.2026 / 2026-12-31 → YYYY-MM-DD
const dateIn = (v) => {
  const s = String(v ?? '').trim();
  if (!s) return '';
  if (/^\d{4,5}(\.\d+)?$/.test(s)) return new Date(Date.UTC(1899, 11, 30) + Math.floor(Number(s)) * 86400000).toISOString().slice(0, 10);
  const m = s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return s;
};

function mapTable(table) {
  // Sarlavha qatori: birinchi 8 qatordan «nomi» ustuni topilgani
  let headerAt = -1;
  let cols = null;
  for (let i = 0; i < Math.min(8, table.length) && headerAt < 0; i += 1) {
    const found = {};
    table[i].forEach((cell, ci) => {
      const h = norm(cell);
      if (!h) return;
      const hit = IMPORT_COLUMNS.find(([key, re]) => re.test(h) && found[key] === undefined);
      if (hit) found[hit[0]] = ci;
    });
    if (found.name !== undefined && (found.selling_price !== undefined || Object.keys(found).length >= 2)) { headerAt = i; cols = found; }
  }
  if (headerAt < 0) throw new HttpError(400, "Jadvalda «Nomi» va «Sotuv narxi» ustunlari topilmadi. Namunaviy faylni yuklab, shu shaklda to'ldiring");
  const rows = [];
  for (let i = headerAt + 1; i < table.length; i += 1) {
    const r = table[i];
    const get = (k) => (cols[k] === undefined ? '' : String(r[cols[k]] ?? '').trim());
    if (!get('name') && !get('selling_price')) continue;
    rows.push({
      line: i + 1, name: get('name'), barcode: get('barcode'), sku: get('sku'), category: get('category'), unit: get('unit'),
      purchase_price: get('purchase_price'), selling_price: get('selling_price'), opening_qty: get('opening_qty'),
      min_stock: get('min_stock'), brand: get('brand'), color: get('color'), expiry_date: get('expiry_date'),
    });
  }
  return { rows, columns: Object.keys(cols) };
}

function fileUpload() {
  return multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });
}

router.get('/products/import/template', requirePerm('products.manage'), async (req, res) => {
  const columns = [
    { key: 'name', header: 'Nomi', type: 'text', width: 30 },
    { key: 'category', header: 'Kategoriya', type: 'text', width: 18 },
    { key: 'unit', header: 'Birlik', type: 'text', width: 10 },
    { key: 'purchase_price', header: 'Xarid narxi', type: 'number', width: 14 },
    { key: 'selling_price', header: 'Sotuv narxi', type: 'number', width: 14 },
    { key: 'opening_qty', header: 'Qoldiq', type: 'number', width: 10 },
    { key: 'min_stock', header: 'Minimal qoldiq', type: 'number', width: 14 },
    { key: 'barcode', header: 'Shtrix-kod', type: 'text', width: 18 },
    { key: 'sku', header: 'Artikul', type: 'text', width: 12 },
    { key: 'brand', header: 'Brend', type: 'text', width: 14 },
    { key: 'color', header: 'Rangi', type: 'text', width: 10 },
    { key: 'expiry_date', header: 'Yaroqlilik muddati', type: 'text', width: 16 },
  ];
  const rows = [
    { name: 'Pepsi 1 L', category: 'Ichimliklar', unit: 'dona', purchase_price: 8000, selling_price: 10000, opening_qty: 24, min_stock: 6, barcode: '', sku: '', brand: 'Pepsi', color: '', expiry_date: '' },
    { name: 'Guruch lazer', category: 'Oziq-ovqat', unit: 'kg', purchase_price: 16000, selling_price: 19500, opening_qty: 50, min_stock: 10, barcode: '', sku: '', brand: '', color: '', expiry_date: '' },
  ];
  const file = buildXlsx([{ name: 'Tovarlar', title: "Tovarlarni yuklash uchun namuna", subtitle: "Har bir qatorga bitta tovar yozing. Majburiy: Nomi va Sotuv narxi", columns, rows }]);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="tovarlar-namuna.xlsx"');
  res.send(file);
});

// ?dry=1 — faqat tekshirish (hech narsa saqlanmaydi): har bir qator uchun «qo'shiladi» yoki xato sababi
router.post('/products/import', requirePerm('products.manage'), (req, res, next) => {
  fileUpload().single('file')(req, res, async (err) => {
    try {
      if (err) throw err.code === 'LIMIT_FILE_SIZE' ? new HttpError(413, 'Fayl hajmi 5 MB dan oshmasligi kerak') : err;
      if (!req.file) throw new HttpError(400, 'Fayl tanlanmagan');
      const dry = req.query.dry === '1';
      const { rows } = mapTable(readTable(req.file.buffer, req.file.originalname));
      if (!rows.length) throw new HttpError(400, "Jadvalda tovar topilmadi");
      if (rows.length > 500) throw new HttpError(400, `Bir martada 500 tagacha tovar yuklash mumkin (faylda ${rows.length} ta). Faylni bo'lib yuklang`);
      const results = [];
      const DRY = new Error('dry-run');
      try {
        await withTransaction(async (client) => {
          const { rows: units } = await client.query('SELECT id, code, name FROM units');
          const unitId = (text) => {
            const t = norm(text);
            if (!t) return units.find((u) => u.code === 'piece')?.id;
            const code = UNIT_SYNONYMS[t];
            return (code && units.find((u) => u.code === code)?.id) || units.find((u) => norm(u.name) === t)?.id || null;
          };
          const cats = new Map();
          for (const r of rows) {
            const fail = (reason) => results.push({ line: r.line, name: r.name, ok: false, reason });
            if (!r.name) { fail('Nomi yozilmagan'); continue; }
            const sell = moneyIn(r.selling_price);
            const cost = moneyIn(r.purchase_price);
            const qty = qtyIn(r.opening_qty);
            const min = qtyIn(r.min_stock);
            if (r.selling_price === '' || !(sell >= 0)) { fail("Sotuv narxi yozilmagan yoki noto'g'ri"); continue; }
            if (!(cost >= 0)) { fail("Xarid narxi noto'g'ri"); continue; }
            if (!(qty >= 0)) { fail("Qoldiq noto'g'ri"); continue; }
            if (!(min >= 0)) { fail("Minimal qoldiq noto'g'ri"); continue; }
            const uid = unitId(r.unit);
            if (!uid) { fail(`Birlik tanilmadi: «${r.unit}» (dona, kg, litr, metr, quti, rulon...)`); continue; }
            const { rows: same } = await client.query(
              'SELECT 1 FROM products WHERE NOT is_archived AND lower(name) = lower($1) LIMIT 1', [r.name],
            );
            if (same[0]) { fail('Bu nomli tovar allaqachon bor'); continue; }
            await client.query('SAVEPOINT imp');
            try {
              let categoryId = null;
              if (r.category) {
                const key = r.category.toLowerCase();
                if (!cats.has(key)) {
                  const { rows: c } = await client.query(
                    `INSERT INTO categories (name) VALUES ($1) ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name RETURNING id`, [r.category],
                  );
                  cats.set(key, c[0].id);
                }
                categoryId = cats.get(key);
              }
              const attributes = {};
              if (r.brand) attributes.brand = r.brand;
              if (r.color) attributes.color = r.color;
              const id = await createProduct(client, {
                name: r.name, barcode: r.barcode || null, sku: r.sku || null, category_id: categoryId, base_unit_id: uid,
                purchase_price: cost, selling_price: sell, min_stock: min, opening_qty: qty, conversions: [],
                attributes, ...(r.expiry_date ? { expiry_date: dateIn(r.expiry_date) } : {}),
              }, req.user);
              await client.query('RELEASE SAVEPOINT imp');
              results.push({ line: r.line, name: r.name, ok: true, id, qty, sell, cost });
            } catch (e) {
              await client.query('ROLLBACK TO SAVEPOINT imp');
              fail(e instanceof HttpError ? e.message : "Saqlab bo'lmadi");
            }
          }
          if (dry) throw DRY;
          await audit(client, req.user.id, 'product.import', 'product', null, { created: results.filter((x) => x.ok).length, file: req.file.originalname });
        });
      } catch (e) {
        if (e !== DRY) throw e;
      }
      const okCount = results.filter((x) => x.ok).length;
      res.json({ dry, total: rows.length, created: okCount, skipped: results.filter((x) => !x.ok), rows: results.slice(0, 500) });
    } catch (e) {
      next(e);
    }
  });
});

router.put('/products/:id', requirePerm('products.manage'), async (req, res) => {
  const id = Number(req.params.id);
  const body = req.body || {};
  await withTransaction(async (client) => {
    const { rows: cur } = await client.query('SELECT * FROM products WHERE id = $1 FOR UPDATE', [id]);
    if (!cur[0]) throw new HttpError(404, 'Tovar topilmadi');
    const v = await validateProductBody(client, body, id);
    if (v.baseUnitId !== cur[0].base_unit_id && Number(cur[0].stock_qty) > 0) {
      throw new HttpError(400, "Qoldig'i bor tovarning asosiy birligini o'zgartirib bo'lmaydi");
    }
    await client.query(
      `UPDATE products SET name = $2, barcode = $3, category_id = $4, supplier_id = $5,
              base_unit_id = $6, purchase_price = $7, selling_price = $8, min_stock = $9,
              sku = CASE WHEN $11 THEN $10 ELSE sku END,
              model_name = CASE WHEN $14 THEN $12 ELSE model_name END,
              variant_label = CASE WHEN $14 THEN $13 ELSE variant_label END,
              description = CASE WHEN $16 THEN $15 ELSE description END,
              expiry_date = CASE WHEN $18 THEN $17::date ELSE expiry_date END,
              attributes = CASE WHEN $20 THEN $19::jsonb ELSE attributes END, updated_at = now()
        WHERE id = $1`,
      [id, v.name, v.barcode, v.categoryId, v.supplierId, v.baseUnitId, v.purchasePrice, v.sellingPrice, v.minStock, v.sku, v.skuGiven, v.modelName, v.variantLabel, v.sizeGiven,
        v.description, v.descGiven, v.expiryDate, v.expiryGiven, JSON.stringify(v.attributes), v.attrsGiven],
    );
    await saveConversions(client, id, v.conversions);
    // Kelish narxi yozilgan/o'zgargan bo'lsa: boshlang'ich va narxsiz qoldiq hamda ulardan qilingan sotuvlar qayta hisoblanadi
    let recost = null;
    // Narx o'zgargan bo'lsa — boshlang'ich qoldiq ham; o'zgarmagan bo'lsa — faqat narxsiz (0) qoldiq to'ldiriladi
    const changed = Math.abs(v.purchasePrice - Number(cur[0].purchase_price)) > 0.004;
    const mode = body.recost === false || body.recost === 'none' ? null
      : body.recost === 'all' ? 'all' : changed ? 'missing' : 'zero';
    if (mode && v.purchasePrice > 0) {
      recost = await recostProduct(client, id, v.purchasePrice, mode);
      if (!recost.batches) recost = null;
    }
    await audit(client, req.user.id, 'product.update', 'product', id, {
      name: v.name, selling_price: v.sellingPrice, purchase_price: v.purchasePrice, min_stock: v.minStock,
      ...(recost ? { recost_batches: recost.batches, recost_sales: recost.sales } : {}),
    });
    return recost;
  }).then((recost) => res.json({ ok: true, recost }));
});

// Tannarxni to'g'irlash: kelish narxi yozilmagan yoki xato yozilgan tovar uchun foyda qayta hisoblanadi
router.post('/products/:id/recost', requirePerm('products.manage'), async (req, res) => {
  const id = Number(req.params.id);
  const body = req.body || {};
  const price = round2(num(body.purchase_price, 'Xarid narxi', { positive: true }));
  const mode = body.mode === 'all' ? 'all' : 'missing';
  const result = await withTransaction(async (client) => {
    const { rows } = await client.query('SELECT id, name FROM products WHERE id = $1 FOR UPDATE', [id]);
    if (!rows[0]) throw new HttpError(404, 'Tovar topilmadi');
    const r = await recostProduct(client, id, price, mode);
    await audit(client, req.user.id, 'product.recost', 'product', id, { name: rows[0].name, purchase_price: price, mode, recost_batches: r.batches, recost_sales: r.sales });
    return r;
  });
  res.json({ ok: true, ...result });
});

router.post('/products/:id/archive', requirePerm('products.manage'), async (req, res) => {
  const id = Number(req.params.id);
  await withTransaction(async (client) => {
    const { rows } = await client.query(
      'UPDATE products SET is_archived = TRUE, updated_at = now() WHERE id = $1 RETURNING name',
      [id],
    );
    if (!rows[0]) throw new HttpError(404, 'Tovar topilmadi');
    await audit(client, req.user.id, 'product.archive', 'product', id, { name: rows[0].name });
  });
  res.json({ ok: true });
});

router.post('/products/:id/restore', requirePerm('products.manage'), async (req, res) => {
  const id = Number(req.params.id);
  await withTransaction(async (client) => {
    const { rows } = await client.query(
      'UPDATE products SET is_archived = FALSE, updated_at = now() WHERE id = $1 RETURNING name',
      [id],
    );
    if (!rows[0]) throw new HttpError(404, 'Tovar topilmadi');
    await audit(client, req.user.id, 'product.restore', 'product', id, { name: rows[0].name });
  });
  res.json({ ok: true });
});

router.post('/products/:id/image', requirePerm('products.manage'), (req, res, next) => {
  imageUpload().single('image')(req, res, async (err) => {
    try {
      if (err) throw err.code === 'LIMIT_FILE_SIZE'
        ? new HttpError(413, "Rasm hajmi 3 MB dan oshmasligi kerak")
        : err;
      if (!req.file) throw new HttpError(400, 'Rasm tanlanmagan');
      const id = Number(req.params.id);
      const { rows } = await pool.query('SELECT image_path FROM products WHERE id = $1', [id]);
      if (!rows[0]) {
        if (req.file.path) await fs.unlink(req.file.path).catch(() => {});
        throw new HttpError(404, 'Tovar topilmadi');
      }
      const old = rows[0].image_path && rows[0].image_path.startsWith('/uploads/') ? path.basename(rows[0].image_path) : null;
      let name = req.file.filename;
      if (imagesInDb()) {
        const ext = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' }[req.file.mimetype];
        name = `${crypto.randomUUID()}${ext}`;
        await pool.query('INSERT INTO product_images (name, content_type, data) VALUES ($1, $2, $3)', [name, req.file.mimetype, req.file.buffer]);
      }
      const imagePath = `/uploads/${name}`;
      await pool.query('UPDATE products SET image_path = $2, updated_at = now() WHERE id = $1', [id, imagePath]);
      if (old) {
        if (imagesInDb()) await pool.query('DELETE FROM product_images WHERE name = $1', [old]).catch(() => {});
        else await fs.unlink(path.join(config.uploadDir, old)).catch(() => {});
      }
      res.json({ image_path: imagePath });
    } catch (e) {
      next(e);
    }
  });
});

// Do'kon logotipi: chek va yon menyuda ko'rinadi
router.post('/settings/logo', requirePerm('settings.manage'), (req, res, next) => {
  imageUpload().single('image')(req, res, async (err) => {
    try {
      if (err) throw err.code === 'LIMIT_FILE_SIZE' ? new HttpError(413, 'Rasm hajmi 3 MB dan oshmasligi kerak') : err;
      if (!req.file) throw new HttpError(400, 'Rasm tanlanmagan');
      let name = req.file.filename;
      if (imagesInDb()) {
        const ext = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' }[req.file.mimetype];
        name = `${crypto.randomUUID()}${ext}`;
        await pool.query('INSERT INTO product_images (name, content_type, data) VALUES ($1, $2, $3)', [name, req.file.mimetype, req.file.buffer]);
      }
      const logoPath = `/uploads/${name}`;
      const settings = await withTransaction(async (client) => {
        const saved = await saveSettings(client, { logo_path: logoPath });
        await audit(client, req.user.id, 'settings.update', 'settings', null, { logo_path: logoPath });
        return saved;
      });
      res.json({ logo_path: logoPath, settings });
    } catch (e) {
      next(e);
    }
  });
});

router.get('/products/:id/history', requirePerm('products.view', 'history.view'), async (req, res) => {
  const id = Number(req.params.id);
  // Har bir harakat: oldingi qoldiq = keyingi − o'zgarish; narx — sotuvda sotuv narxi, kirimda kelish narxi (1 asosiy birlik)
  const { rows: movements } = await pool.query(
    `SELECT m.id, m.movement_type, m.quantity, m.balance_after, m.balance_after - m.quantity AS balance_before,
            m.value, m.reference_type, m.reference_id, m.note, m.created_at, u.full_name AS user_name,
            CASE WHEN m.movement_type = 'sale' THEN
                   (SELECT ROUND(SUM(si.line_total) / NULLIF(SUM(si.base_quantity), 0), 2) FROM sale_items si
                     WHERE si.sale_id = m.reference_id AND si.product_id = m.product_id)
                 ELSE ROUND(ABS(m.value) / NULLIF(ABS(m.quantity), 0), 2) END AS unit_price
       FROM stock_movements m LEFT JOIN users u ON u.id = m.created_by
      WHERE m.product_id = $1 ORDER BY m.created_at DESC, m.id DESC LIMIT 300`,
    [id],
  );
  const { rows: sales } = await pool.query(
    `SELECT s.id, s.receipt_no, s.created_at, si.quantity, si.line_total, si.cost_total, un.name AS unit_name
       FROM sale_items si JOIN sales s ON s.id = si.sale_id JOIN units un ON un.id = si.unit_id
      WHERE si.product_id = $1 ORDER BY s.created_at DESC LIMIT 100`,
    [id],
  );
  const { rows: purchases } = await pool.query(
    `SELECT p.id, p.purchase_no, p.purchase_date, pi.quantity, pi.unit_price, pi.unit_cost, un.name AS unit_name
       FROM purchase_items pi JOIN purchases p ON p.id = pi.purchase_id JOIN units un ON un.id = pi.unit_id
      WHERE pi.product_id = $1 ORDER BY p.purchase_date DESC, p.id DESC LIMIT 100`,
    [id],
  );
  if (!seesCost(req.user)) {
    // Kassirga kelish narxi ko'rsatilmaydi — faqat sotuv narxi
    for (const m of movements) if (m.movement_type !== 'sale') m.unit_price = null;
    return res.json({
      movements: movements.map(({ value: _v, ...m }) => m),
      sales: sales.map(({ cost_total: _c, ...x }) => x),
      purchases: [],
      cost_hidden: true,
    });
  }
  res.json({ movements, sales, purchases });
});

export default router;
