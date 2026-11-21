import { createHash } from 'node:crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { config } from './config.js';
import { query } from './db.js';
import { HttpError } from './util.js';
import { effectivePermissions } from './permissions.js';

export const COOKIE_NAME = 'ombor_session';

// Parol xeshi (bcrypt, 12). Cloudflare Workers'da protsessor vaqti cheklangan (bepul rejada 10 ms),
// bcrypt esa ~400 ms oladi — shuning uchun u yerda xesh bazada (pgcrypto) hisoblanadi.
// Ikkala usul bir xil bcrypt formatini ishlatadi: parollar har ikki muhitda ishlaydi.
const hashInDb = () => process.env.OMBOR_RUNTIME === 'worker';
const BCRYPT_RE = /^\$2[abxy]\$\d{2}\$[./A-Za-z0-9]{53}$/;

// pgcrypto funksiyalari qaysi sxemada. Do'kon sxemalarida search_path faqat o'z sxemasi bo'ladi,
// shuning uchun funksiyalar to'liq nomi bilan chaqiriladi.
let cryptoSchema = null;
async function pgcrypto() {
  if (cryptoSchema) return cryptoSchema;
  const { rows } = await query(
    "SELECT n.nspname AS s FROM pg_extension e JOIN pg_namespace n ON n.oid = e.extnamespace WHERE e.extname = 'pgcrypto'",
  );
  const s = rows[0]?.s;
  if (!s || !/^[a-z_][a-z0-9_]*$/.test(s)) throw new Error("pgcrypto o'rnatilmagan");
  cryptoSchema = s;
  return s;
}

export async function hashPassword(password) {
  if (hashInDb()) {
    const ns = await pgcrypto();
    const { rows } = await query(`SELECT ${ns}.crypt($1, ${ns}.gen_salt('bf', 12)) AS h`, [password]);
    return rows[0].h;
  }
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password, hash) {
  if (!hash || !BCRYPT_RE.test(hash)) return false;
  if (hashInDb()) {
    // $2b$ va $2a$ 72 belgigacha parollar uchun bir xil; pgcrypto $2a$ ni qabul qiladi
    const ns = await pgcrypto();
    const norm = `$2a$${hash.slice(4)}`;
    const { rows } = await query(`SELECT ${ns}.crypt($1, $2) = $2 AS ok`, [password, norm]);
    return rows[0].ok === true;
  }
  return bcrypt.compare(password, hash);
}

export function publicUser(row) {
  return {
    id: row.id,
    full_name: row.full_name,
    username: row.username,
    role: row.role,
    phone: row.phone,
    is_active: row.is_active,
    permissions: effectivePermissions(row.role, row.permissions),
  };
}

// Parol versiyasi: parol o'zgarsa, eski sessiyalar (boshqa qurilmalardagi ham) yaroqsiz bo'ladi
export function passwordVersion(hash) {
  return createHash('sha256').update(String(hash || '')).digest('base64url').slice(0, 12);
}

// Sessiya: foydalanuvchi va uning do'koni (sxemasi). Eski sessiyalarda do'kon yo'q — ular birinchi do'konga tegishli.
// user — users jadvali qatori (id va password_hash kerak)
export function setSessionCookie(res, user, store = null) {
  const payload = { sub: user.id, pv: passwordVersion(user.password_hash) };
  if (store) {
    payload.sid = store.id;
    payload.sch = store.schema;
  }
  const token = jwt.sign(payload, config.jwtSecret, { expiresIn: `${config.sessionDays}d` });
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'strict',
    secure: config.isProd,
    maxAge: config.sessionDays * 24 * 3600 * 1000,
    path: '/',
  });
}

export function clearSessionCookie(res) {
  res.clearCookie(COOKIE_NAME, { path: '/', sameSite: 'strict', secure: config.isProd });
}

function readCookie(req, name) {
  const header = req.headers.cookie || '';
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    if (part.slice(0, idx).trim() === name) {
      return decodeURIComponent(part.slice(idx + 1).trim());
    }
  }
  return null;
}

// Cookie'dagi sessiya: { sub, sid, sch }, yaroqsiz bo'lsa { invalid: true }, yo'q bo'lsa null
export function readSession(req) {
  const token = readCookie(req, COOKIE_NAME);
  if (!token) return null;
  try {
    const payload = jwt.verify(token, config.jwtSecret);
    return { ...payload, sch: payload.sch || 'public', sid: payload.sid || null };
  } catch {
    return { invalid: true };
  }
}

// Har bir so'rovda sessiyani tekshiradi va joriy huquqlarni yuklaydi.
// So'rov allaqachon sessiyadagi do'kon sxemasida bajarilmoqda (app.js: tenantContext).
export async function authenticate(req, res, next) {
  try {
    const payload = req.session === undefined ? readSession(req) : req.session;
    if (!payload) throw new HttpError(401, 'Avval tizimga kiring');
    if (payload.invalid) throw new HttpError(401, 'Sessiya muddati tugagan. Qaytadan kiring');
    const { rows } = await query('SELECT * FROM users WHERE id = $1', [payload.sub]);
    const row = rows[0];
    if (!row || !row.is_active) {
      throw new HttpError(401, 'Foydalanuvchi topilmadi yoki faol emas');
    }
    if (payload.pv && payload.pv !== passwordVersion(row.password_hash)) {
      throw new HttpError(401, "Parol o'zgargan. Yangi parol bilan kiring");
    }
    req.user = publicUser(row);
    if (!req.store) req.store = { schema: payload.sch || 'public', id: payload.sid || null };
    // Ishlatilayotgan sessiya muddati uzayadi: foydalanuvchi o'zi chiqmaguncha qayta kirish so'ralmaydi
    const ageHours = (Date.now() / 1000 - (payload.iat || 0)) / 3600;
    if ((ageHours >= config.sessionRenewHours || !payload.pv) && !res.headersSent) {
      setSessionCookie(res, row, payload.sid ? { id: payload.sid, schema: payload.sch } : null);
    }
    next();
  } catch (err) {
    next(err);
  }
}

export function can(user, key) {
  return Boolean(user && user.permissions && user.permissions[key]);
}

// Berilgan ruxsatlardan kamida bittasi bo'lishi kerak
export function requirePerm(...keys) {
  return (req, res, next) => {
    if (!req.user) return next(new HttpError(401, 'Avval tizimga kiring'));
    if (keys.some((k) => can(req.user, k))) return next();
    return next(new HttpError(403, "Bu amal uchun ruxsatingiz yo'q"));
  };
}
