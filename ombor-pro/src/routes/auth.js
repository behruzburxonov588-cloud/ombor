import { Router } from 'express';
import { pool, withTransaction } from '../db.js';
import {
  authenticate, hashPassword, verifyPassword, publicUser, setSessionCookie, clearSessionCookie,
} from '../auth.js';
import { HttpError, str } from '../util.js';
import { saveSettings } from '../services/settings.js';
import { audit } from '../audit.js';

const router = Router();

// Kirishga urinishlar cheklovi (xotirada): 15 daqiqada 8 ta noto'g'ri urinish
const attempts = new Map();
const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 8;

function checkLocked(key) {
  const entry = attempts.get(key);
  if (!entry) return false;
  if (Date.now() - entry.first > WINDOW_MS) {
    attempts.delete(key);
    return false;
  }
  return entry.count >= MAX_ATTEMPTS;
}

function recordFailure(key) {
  const entry = attempts.get(key);
  if (!entry || Date.now() - entry.first > WINDOW_MS) {
    attempts.set(key, { count: 1, first: Date.now() });
  } else {
    entry.count += 1;
  }
}

export function validateUsername(value) {
  const username = str(value, 'Login', { required: true, max: 50 }).toLowerCase();
  if (!/^[a-z0-9_.-]{3,50}$/.test(username)) {
    throw new HttpError(400, "Login faqat lotin harflari, raqam, nuqta, pastki chiziq va defisdan iborat bo'lib, kamida 3 belgi bo'lsin");
  }
  return username;
}

export function validatePassword(value) {
  const password = String(value || '');
  if (password.length < 6) throw new HttpError(400, "Parol kamida 6 belgidan iborat bo'lishi kerak");
  if (password.length > 200) throw new HttpError(400, "Parol juda uzun");
  return password;
}

// Tizim birinchi marta sozlanmaganmi
router.get('/auth/status', async (req, res) => {
  const { rows } = await pool.query('SELECT COUNT(*)::int AS n FROM users');
  res.json({ setup_required: rows[0].n === 0 });
});

// Birinchi marta: do'kon va egasi hisobini yaratish (faqat bir marta)
router.post('/setup', async (req, res) => {
  const body = req.body || {};
  const user = await withTransaction(async (client) => {
    await client.query('SELECT pg_advisory_xact_lock(777)');
    const { rows: cnt } = await client.query('SELECT COUNT(*)::int AS n FROM users');
    if (cnt[0].n > 0) throw new HttpError(409, 'Tizim allaqachon sozlangan. Tizimga kiring');

    const fullName = str(body.full_name, 'Ism familiya', { required: true, max: 100 });
    const username = validateUsername(body.username);
    const password = validatePassword(body.password);
    const storeName = str(body.store_name, "Do'kon nomi", { required: true, max: 100 });
    const hash = await hashPassword(password);
    const { rows } = await client.query(
      `INSERT INTO users (full_name, username, password_hash, role)
       VALUES ($1, $2, $3, 'owner') RETURNING *`,
      [fullName, username, hash],
    );
    await saveSettings(client, {
      store_name: storeName,
      store_phone: str(body.store_phone, 'Telefon', { max: 30 }) || '',
      store_address: str(body.store_address, 'Manzil', { max: 200 }) || '',
    });
    await audit(client, rows[0].id, 'setup', 'store', null, { store_name: storeName });
    return rows[0];
  });
  setSessionCookie(res, user.id);
  res.status(201).json({ user: publicUser(user) });
});

router.post('/auth/login', async (req, res) => {
  const username = String(req.body?.username || '').trim().toLowerCase();
  const password = String(req.body?.password || '');
  // Cloudflare orqali kelganda haqiqiy IP shu sarlavhada bo'ladi
  const key = `${username}|${req.headers['cf-connecting-ip'] || req.ip}`;
  if (checkLocked(key)) {
    throw new HttpError(429, "Juda ko'p noto'g'ri urinish. 15 daqiqadan keyin qayta urinib ko'ring");
  }
  if (!username || !password) throw new HttpError(400, 'Login va parolni kiriting');

  const { rows } = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
  const user = rows[0];
  const ok = Boolean(user && user.is_active && await verifyPassword(password, user.password_hash));
  if (!ok) {
    recordFailure(key);
    throw new HttpError(401, "Login yoki parol noto'g'ri");
  }
  attempts.delete(key);
  setSessionCookie(res, user.id);
  await audit(pool, user.id, 'login', 'user', user.id);
  res.json({ user: publicUser(user) });
});

router.post('/auth/logout', (req, res) => {
  clearSessionCookie(res);
  res.json({ ok: true });
});

router.get('/auth/me', authenticate, (req, res) => {
  res.json({ user: req.user });
});

router.post('/auth/password', authenticate, async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM users WHERE id = $1', [req.user.id]);
  const ok = await verifyPassword(String(req.body?.current_password || ''), rows[0].password_hash);
  if (!ok) throw new HttpError(400, "Joriy parol noto'g'ri");
  const next = validatePassword(req.body?.new_password);
  await withTransaction(async (client) => {
    await client.query('UPDATE users SET password_hash = $2 WHERE id = $1', [req.user.id, await hashPassword(next)]);
    await audit(client, req.user.id, 'password.change', 'user', req.user.id);
  });
  res.json({ ok: true });
});

export default router;
