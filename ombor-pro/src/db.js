import pg from 'pg';
import { AsyncLocalStorage } from 'node:async_hooks';
import { config } from './config.js';

// NUMERIC -> number (pul va miqdorlar uchun), DATE -> matn (YYYY-MM-DD), BIGINT -> number
pg.types.setTypeParser(1700, (v) => (v === null ? null : Number(v)));
pg.types.setTypeParser(1082, (v) => v);
pg.types.setTypeParser(20, (v) => Number(v));

// Oddiy serverda (Node.js) bitta umumiy pool ishlatiladi.
// Cloudflare Workers'da esa ulanishni so'rovlar orasida qayta ishlatib bo'lmaydi, shuning uchun
// har bir so'rov o'z poolini oladi (runWithPool) va kod o'zgarmagan holda shu pool bilan ishlaydi.
const scope = new AsyncLocalStorage();
let shared = null;

function current() {
  const scoped = scope.getStore();
  if (scoped) return scoped;
  if (!shared) shared = new pg.Pool({ connectionString: config.databaseUrl, max: 10 });
  return shared;
}

export const pool = {
  query: (...args) => current().query(...args),
  connect: () => current().connect(),
  end: async () => {
    if (shared) {
      const p = shared;
      shared = null;
      await p.end();
    }
  },
};

export function runWithPool(p, fn) {
  return scope.run(p, fn);
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
  await pool.end();
}
