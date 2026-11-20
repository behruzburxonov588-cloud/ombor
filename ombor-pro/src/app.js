import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, config } from './config.js';
import { HttpError } from './util.js';
import { authenticate, readSession } from './auth.js';
import { pool, runWithSchema, SCHEMA_RE } from './db.js';
import { ensureCoreOnce, ensureSchemaReady } from './tenants.js';
import authRoutes from './routes/auth.js';
import peopleRoutes from './routes/people.js';
import catalogRoutes, { imagesInDb } from './routes/catalog.js';
import tradeRoutes from './routes/trade.js';
import stockRoutes from './routes/stock.js';
import financeRoutes from './routes/finance.js';
import analyticsRoutes from './routes/analytics.js';
import notificationRoutes from './routes/notifications.js';

const PG_MESSAGES = {
  '23503': "Bog'liq ma'lumot topilmadi yoki o'chirib bo'lmaydi",
  '23502': "Majburiy maydon to'ldirilmagan",
  '22P02': "Kiritilgan qiymat noto'g'ri formatda",
};

function dbErrorMessage(err) {
  if (err.code === '23505') {
    if (err.constraint === 'products_barcode_key') return 'Bu shtrix-kod boshqa mahsulotda mavjud';
    if (err.constraint === 'products_sku_uniq') return 'Bu artikul (SKU) boshqa mahsulotda mavjud';
    if (err.constraint === 'users_username_key' || err.constraint === 'logins_pkey') return 'Bu login band';
    return 'Bunday yozuv allaqachon mavjud';
  }
  if (err.code === '23514') {
    if (String(err.constraint || '').includes('stock_qty')) return "Qoldiq manfiy bo'lishi mumkin emas";
    return "Kiritilgan qiymat ruxsat etilgan chegaradan tashqarida";
  }
  if (err.code === 'P0001') return err.message;
  return PG_MESSAGES[err.code] || null;
}

function errorHandler(err, req, res, next) {
  if (res.headersSent) return next(err);
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.message, details: err.details });
  }
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: "So'rov ma'lumoti noto'g'ri formatda" });
  }
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ error: "So'rov hajmi juda katta" });
  }
  if (err.code && /^[0-9A-Z]{5}$/.test(err.code)) {
    const message = dbErrorMessage(err);
    if (message) {
      const status = err.code === '23505' ? 409 : 400;
      return res.status(status).json({ error: message });
    }
  }
  console.error(err);
  return res.status(500).json({ error: "Ichki xatolik yuz berdi. Qayta urinib ko'ring" });
}

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  const worker = process.env.OMBOR_RUNTIME === 'worker';
  if (!imagesInDb()) fs.mkdirSync(config.uploadDir, { recursive: true });

  app.use(express.json({ limit: '1mb' }));

  // Ko'p do'kon: sessiyadagi do'kon aniqlanadi va so'rov to'liq o'sha do'kon sxemasida bajariladi.
  // Kirmagan foydalanuvchi uchun — umumiy qism (kirish, ro'yxatdan o'tish).
  app.use(['/api', '/uploads'], async (req, res, next) => {
    try {
      const session = readSession(req);
      let schema = 'public';
      if (session && !session.invalid) {
        if (SCHEMA_RE.test(session.sch)) schema = session.sch;
        else req.session = { invalid: true };
      }
      if (req.session === undefined) req.session = session;
      req.store = { schema, id: session?.sid || null };
      await ensureCoreOnce();
      await ensureSchemaReady(schema);
      runWithSchema(schema, next);
    } catch (err) {
      next(err);
    }
  });

  // Himoya: API faqat JSON yoki fayl yuklash (multipart) so'rovlarini qabul qiladi.
  // Oddiy HTML forma orqali yuborilgan so'rovlar bloklanadi (CSRF).
  app.use('/api', (req, res, next) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
    if (req.is('application/json') || req.is('multipart/form-data')) return next();
    return next(new HttpError(415, "So'rov turi qo'llab-quvvatlanmaydi"));
  });

  app.use('/api', authRoutes);
  app.use('/api', authenticate);
  app.use('/api', peopleRoutes, catalogRoutes, tradeRoutes, stockRoutes, financeRoutes, analyticsRoutes, notificationRoutes);
  app.use('/api', (req, res) => res.status(404).json({ error: "So'rov topilmadi" }));

  if (imagesInDb()) {
    // Rasmlar bazada (Cloudflare yoki doimiy diski yo'q hosting)
    app.get('/uploads/:name', async (req, res) => {
      const { rows } = await pool.query('SELECT content_type, data FROM product_images WHERE name = $1', [req.params.name]);
      if (!rows[0]) return res.status(404).end();
      res.set('Content-Type', rows[0].content_type);
      // Rasm faqat o'z do'koniga tegishli: umumiy keshlarda saqlanmaydi
      res.set('Cache-Control', 'private, max-age=86400, immutable');
      return res.send(rows[0].data);
    });
  } else {
    app.use('/uploads', express.static(config.uploadDir, { maxAge: '1d', index: false, dotfiles: 'deny' }));
  }
  // Cloudflare'da sahifalar va fayllarni platformaning o'zi beradi
  if (!worker) {
    app.use(express.static(path.join(ROOT, 'public'), { index: 'index.html' }));
    app.get(/^\/(?!api\/|uploads\/).*/, (req, res) => {
      res.sendFile(path.join(ROOT, 'public', 'index.html'));
    });
  }

  app.use(errorHandler);
  return app;
}
