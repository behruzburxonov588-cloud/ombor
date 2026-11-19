import { Router } from 'express';
import { pool, withTransaction, runWithSchema } from '../db.js';
import {
  noStoresYet, createStore, activateStore, dropStore, findLogin, loginTaken, storeIdForSchema, ensureSchemaReady,
  releaseStuckLogin,
} from '../tenants.js';
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

// Yangi do'kon ochishga ruxsat (OMBOR_SIGNUP=off bo'lsa — faqat birinchi do'kon)
const signupAllowed = () => String(process.env.OMBOR_SIGNUP || 'on').toLowerCase() !== 'off';

// Ro'yxatdan o'tish cheklovi: bitta IP dan soatiga 5 ta yangi do'kon (faqat muvaffaqiyatli ochilganlar sanaladi)
const signups = new Map();
const recentSignups = (ip) => (signups.get(ip) || []).filter((t) => Date.now() - t < 60 * 60 * 1000);
function checkSignupLimit(ip) {
  if (recentSignups(ip).length >= 5) throw new HttpError(429, "Juda ko'p yangi do'kon ochildi. Bir soatdan keyin urinib ko'ring");
}
function recordSignup(ip) {
  signups.set(ip, [...recentSignups(ip), Date.now()]);
}
const clientIp = (req) => req.headers['cf-connecting-ip'] || req.ip;

// Kirish sahifasi uchun: birinchi marta sozlash kerakmi va yangi do'kon ochish mumkinmi
router.get('/auth/status', async (req, res) => {
  res.json({ setup_required: await noStoresYet(), signup: signupAllowed() });
});

// Yangi do'kon: alohida sxema, egasi hisobi va sozlamalar. Login butun tizimda yagona.
async function openStore(req, res) {
  const body = req.body || {};
  const fullName = str(body.full_name, 'Ism familiya', { required: true, max: 100 });
  const username = validateUsername(body.username);
  const password = validatePassword(body.password);
  const storeName = str(body.store_name, "Do'kon nomi", { required: true, max: 100 });
  const storePhone = str(body.store_phone, 'Telefon', { max: 30 }) || '';
  const storeAddress = str(body.store_address, 'Manzil', { max: 200 }) || '';
  await releaseStuckLogin(username);
  if (await loginTaken(username)) throw new HttpError(409, 'Bu login band. Boshqa login tanlang');
  const hash = await hashPassword(password);

  const store = await createStore({ name: storeName, username });
  let user;
  try {
    user = await runWithSchema(store.schema, () => withTransaction(async (client) => {
      const { rows: cnt } = await client.query('SELECT COUNT(*)::int AS n FROM users');
      if (cnt[0].n > 0) throw new HttpError(409, 'Tizim allaqachon sozlangan. Tizimga kiring');
      const { rows } = await client.query(
        `INSERT INTO users (full_name, username, password_hash, role)
         VALUES ($1, $2, $3, 'owner') RETURNING *`,
        [fullName, username, hash],
      );
      await saveSettings(client, { store_name: storeName, store_phone: storePhone, store_address: storeAddress });
      await audit(client, rows[0].id, 'setup', 'store', null, { store_name: storeName });
      return rows[0];
    }));
    await activateStore(store);
  } catch (err) {
    await dropStore(store).catch(() => {});
    throw err;
  }
  setSessionCookie(res, user.id, store);
  res.status(201).json({ user: publicUser(user) });
}

// Birinchi marta: birinchi do'kon va egasi hisobi (faqat hech qanday do'kon bo'lmaganda)
router.post('/setup', async (req, res) => {
  if (!(await noStoresYet())) throw new HttpError(409, 'Tizim allaqachon sozlangan. Tizimga kiring');
  await openStore(req, res);
});

// Ro'yxatdan o'tish: istalgan odam o'z do'konini ochadi
router.post('/auth/register', async (req, res) => {
  if (!signupAllowed() && !(await noStoresYet())) {
    throw new HttpError(403, "Yangi do'kon ochish o'chirilgan");
  }
  checkSignupLimit(clientIp(req));
  await openStore(req, res);
  recordSignup(clientIp(req));
});

router.post('/auth/login', async (req, res) => {
  const username = String(req.body?.username || '').trim().toLowerCase();
  const password = String(req.body?.password || '');
  // Cloudflare orqali kelganda haqiqiy IP shu sarlavhada bo'ladi
  const key = `${username}|${clientIp(req)}`;
  if (checkLocked(key)) {
    throw new HttpError(429, "Juda ko'p noto'g'ri urinish. 15 daqiqadan keyin qayta urinib ko'ring");
  }
  if (!username || !password) throw new HttpError(400, 'Login va parolni kiriting');

  // Login qaysi do'konga tegishli. Ro'yxatda bo'lmasa (eski yozuv) — birinchi do'kondan qidiriladi.
  const found = await findLogin(username);
  let store = null;
  if (found) {
    if (found.status === 'active') store = { id: found.store_id, schema: found.schema };
  } else {
    const id = await storeIdForSchema('public');
    store = { id, schema: 'public' };
  }
  let user = null;
  if (store) {
    await ensureSchemaReady(store.schema);
    user = await runWithSchema(store.schema, async () => {
      const { rows } = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
      const u = rows[0];
      const ok = Boolean(u && u.is_active && await verifyPassword(password, u.password_hash));
      if (ok) await audit(pool, u.id, 'login', 'user', u.id);
      return ok ? u : null;
    });
  }
  if (!user) {
    recordFailure(key);
    throw new HttpError(401, "Login yoki parol noto'g'ri");
  }
  attempts.delete(key);
  setSessionCookie(res, user.id, store.id ? store : null);
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
