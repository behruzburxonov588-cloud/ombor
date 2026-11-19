import pg from 'pg';
import { AsyncLocalStorage } from 'node:async_hooks';
import { config } from './config.js';

// NUMERIC -> number (pul va miqdorlar uchun), DATE -> matn (YYYY-MM-DD), BIGINT -> number
pg.types.setTypeParser(1700, (v) => (v === null ? null : Number(v)));
pg.types.setTypeParser(1082, (v) => v);
pg.types.setTypeParser(20, (v) => Number(v));

// Ko'p do'kon: har bir do'konning jadvallari bazada alohida sxemada turadi
// (birinchi do'kon — "public", keyingilari — "t_<raqam>"). So'rov qaysi do'konga tegishli bo'lsa,
// ulanish o'sha sxemaga yo'naltiriladi (search_path), shuning uchun boshqa kod o'zgarmaydi va
// bir do'kon boshqasining ma'lumotini hech qachon ko'rmaydi.
export const SCHEMA_RE = /^(public|t_[0-9]{1,9})$/;

// Kontekst: { schema, factory?, pools?, fixed? }
//  - oddiy server (Node.js): har bir sxema uchun bitta umumiy pool;
//  - Cloudflare Workers: ulanishni so'rovlar orasida bo'lishib bo'lmaydi, shuning uchun har bir so'rov
//    o'z poollarini oladi (runWithPools) va so'rov oxirida yopadi;
//  - fixed: berilgan bitta pool (sinov va tiklash vositalari uchun).
const scope = new AsyncLocalStorage();
const shared = new Map();

export function makePool(connectionString, schema, options = {}) {
  if (!SCHEMA_RE.test(schema)) throw new Error(`Noto'g'ri sxema nomi: ${schema}`);
  const p = new pg.Pool({ connectionString, max: 10, ...options });
  if (schema !== 'public') {
    // Har bir yangi ulanish birinchi navbatda o'z do'koni sxemasiga o'tadi (keyingi so'rovlar navbatda kutadi)
    p.on('connect', (client) => {
      client.query(`SET search_path TO ${schema}`).catch(() => {});
    });
  }
  return p;
}

export function currentSchema() {
  return scope.getStore()?.schema || 'public';
}

function poolFor(schema) {
  const ctx = scope.getStore();
  if (ctx?.fixed) return ctx.fixed;
  if (ctx?.factory) {
    let p = ctx.pools.get(schema);
    if (!p) {
      p = ctx.factory(schema);
      ctx.pools.set(schema, p);
    }
    return p;
  }
  let p = shared.get(schema);
  if (!p) {
    p = makePool(config.databaseUrl, schema, schema === 'public' ? { max: 10 } : { max: 4, idleTimeoutMillis: 20000 });
    shared.set(schema, p);
  }
  return p;
}

export const pool = {
  query: (...args) => poolFor(currentSchema()).query(...args),
  connect: () => poolFor(currentSchema()).connect(),
  end: () => closePool(),
};

// Berilgan do'kon sxemasida bajarish
export function runWithSchema(schema, fn) {
  if (!SCHEMA_RE.test(schema)) throw new Error(`Noto'g'ri sxema nomi: ${schema}`);
  const ctx = scope.getStore();
  if (ctx?.schema === schema) return fn();
  return scope.run({ ...(ctx || {}), schema }, fn);
}

// Bitta tayyor pool bilan bajarish (sinov va tiklash vositalari uchun)
export function runWithPool(p, fn) {
  return scope.run({ schema: 'public', fixed: p }, fn);
}

// So'rov uchun alohida poollar (Cloudflare Workers). closeAll() so'rov oxirida chaqiriladi.
export function runWithPools(factory, fn) {
  const ctx = { schema: 'public', factory, pools: new Map() };
  const closeAll = () => Promise.all([...ctx.pools.values()].map((p) => p.end().catch(() => {})));
  return { result: scope.run(ctx, fn), closeAll };
}

export function query(text, params) {
  return pool.query(text, params);
}

// Hammasi muvaffaqiyatli bo'lsa saqlanadi, aks holda to'liq bekor qilinadi
export async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch {
      // ulanish uzilgan bo'lsa, asl xatoni qaytaramiz
    }
    throw err;
  } finally {
    client.release();
  }
}

export async function closePool() {
  const all = [...shared.values()];
  shared.clear();
  await Promise.all(all.map((p) => p.end().catch(() => {})));
}
