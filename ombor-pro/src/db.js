import pg from 'pg';
import { config } from './config.js';

// NUMERIC -> number (pul va miqdorlar uchun), DATE -> matn (YYYY-MM-DD), BIGINT -> number
pg.types.setTypeParser(1700, (v) => (v === null ? null : Number(v)));
pg.types.setTypeParser(1082, (v) => v);
pg.types.setTypeParser(20, (v) => Number(v));

export const pool = new pg.Pool({ connectionString: config.databaseUrl, max: 10 });

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
