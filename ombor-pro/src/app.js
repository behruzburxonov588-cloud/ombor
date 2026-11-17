import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, config } from './config.js';
import { HttpError } from './util.js';
import { authenticate } from './auth.js';
import authRoutes from './routes/auth.js';
import peopleRoutes from './routes/people.js';
import catalogRoutes from './routes/catalog.js';
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
    if (err.constraint === 'users_username_key') return 'Bu login band';
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
  fs.mkdirSync(config.uploadDir, { recursive: true });

  app.use(express.json({ limit: '1mb' }));

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

  app.use('/uploads', express.static(config.uploadDir, { maxAge: '1d', index: false, dotfiles: 'deny' }));
  app.use(express.static(path.join(ROOT, 'public'), { index: 'index.html' }));
  app.get(/^\/(?!api\/|uploads\/).*/, (req, res) => {
    res.sendFile(path.join(ROOT, 'public', 'index.html'));
  });

  app.use(errorHandler);
  return app;
}
