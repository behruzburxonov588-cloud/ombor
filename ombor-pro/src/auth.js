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

export async function hashPassword(password) {
  if (hashInDb()) {
    const { rows } = await query("SELECT crypt($1, gen_salt('bf', 12)) AS h", [password]);
    return rows[0].h;
  }
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password, hash) {
  if (!hash || !BCRYPT_RE.test(hash)) return false;
  if (hashInDb()) {
    // $2b$ va $2a$ 72 belgigacha parollar uchun bir xil; pgcrypto $2a$ ni qabul qiladi
    const norm = `$2a$${hash.slice(4)}`;
    const { rows } = await query('SELECT crypt($1, $2) = $2 AS ok', [password, norm]);
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

export function setSessionCookie(res, userId) {
  const token = jwt.sign({ sub: userId }, config.jwtSecret, { expiresIn: `${config.sessionHours}h` });
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'strict',
    secure: config.isProd,
    maxAge: config.sessionHours * 3600 * 1000,
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

// Har bir so'rovda sessiyani tekshiradi va joriy huquqlarni yuklaydi
export async function authenticate(req, res, next) {
  try {
    const token = readCookie(req, COOKIE_NAME);
    if (!token) throw new HttpError(401, 'Avval tizimga kiring');
    let payload;
    try {
      payload = jwt.verify(token, config.jwtSecret);
    } catch {
      throw new HttpError(401, 'Sessiya muddati tugagan. Qaytadan kiring');
    }
    const { rows } = await query('SELECT * FROM users WHERE id = $1', [payload.sub]);
    if (!rows[0] || !rows[0].is_active) {
      throw new HttpError(401, 'Foydalanuvchi topilmadi yoki faol emas');
    }
    req.user = publicUser(rows[0]);
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
