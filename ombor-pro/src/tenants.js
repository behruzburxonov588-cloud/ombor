// Ko'p do'kon (multi-tenant): do'konlar ro'yxati, umumiy loginlar va har bir do'kon sxemasini tayyorlash.
//
// Tuzilma:
//  - core.stores  — barcha do'konlar va ularning sxemasi (birinchi do'kon "public", keyingilari "t_<id>");
//  - core.logins  — barcha loginlar (har bir login butun tizimda yagona) va u qaysi do'konga tegishli.
// Kirishda login bo'yicha do'kon topiladi, sessiya (JWT) do'kon sxemasini saqlaydi va har bir so'rov
// faqat o'sha sxemada bajariladi.
import { pool, runWithSchema, SCHEMA_RE } from './db.js';
import { migrate } from './migrate.js';
import { HttpError } from './util.js';

const CORE_SQL = `
CREATE SCHEMA IF NOT EXISTS core;
CREATE TABLE IF NOT EXISTS core.stores (
  id SERIAL PRIMARY KEY,
  schema_name TEXT UNIQUE,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('creating', 'active', 'disabled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS core.logins (
  username TEXT PRIMARY KEY,
  store_id INT NOT NULL REFERENCES core.stores(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS logins_store_idx ON core.logins (store_id);
DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pgcrypto SCHEMA public;
EXCEPTION WHEN insufficient_privilege OR duplicate_object THEN
  NULL;
END
$$;
`;

let coreReady = null;
const schemaReady = new Map();
const storeIdCache = new Map();

// Umumiy jadvallarni yaratadi va birinchi (mavjud) do'konni ro'yxatga oladi. Bir necha marta chaqirish xavfsiz.
export async function ensureCore() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(424242)');
    await client.query(CORE_SQL);
    // Mavjud do'kon ("public" sxemasidagi foydalanuvchilar) birinchi do'kon sifatida ro'yxatga olinadi
    const { rows: hasUsers } = await client.query(
      "SELECT to_regclass('public.users') IS NOT NULL AS t",
    );
    if (hasUsers[0].t) {
      const { rows: cnt } = await client.query('SELECT COUNT(*)::int AS n FROM public.users');
      if (cnt[0].n > 0) {
        await client.query(`
          INSERT INTO core.stores (schema_name, name)
          SELECT 'public', COALESCE((SELECT value #>> '{}' FROM public.settings WHERE key = 'store_name'), 'Do''kon')
          WHERE NOT EXISTS (SELECT 1 FROM core.stores WHERE schema_name = 'public')`);
        // Loginlar ro'yxatida yo'q foydalanuvchilar qo'shiladi (masalan, zaxiradan tiklangandan keyin)
        await client.query(`
          INSERT INTO core.logins (username, store_id)
          SELECT u.username, s.id FROM public.users u CROSS JOIN core.stores s
          WHERE s.schema_name = 'public'
          ON CONFLICT (username) DO NOTHING`);
      }
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

export function ensureCoreOnce() {
  if (!coreReady) coreReady = ensureCore().catch((err) => { coreReady = null; throw err; });
  return coreReady;
}

// Do'kon sxemasi so'nggi migratsiyalar bilan tayyor bo'lishini ta'minlaydi (har bir jarayonda bir marta)
export function ensureSchemaReady(schema) {
  if (!SCHEMA_RE.test(schema)) return Promise.reject(new Error("Noto'g'ri sxema"));
  let p = schemaReady.get(schema);
  if (!p) {
    p = runWithSchema(schema, () => migrate(() => {})).catch((err) => { schemaReady.delete(schema); throw err; });
    schemaReady.set(schema, p);
  }
  return p;
}

export function markSchemaReady(schema) {
  schemaReady.set(schema, Promise.resolve([]));
}

export function resetTenantCaches() {
  coreReady = null;
  schemaReady.clear();
  storeIdCache.clear();
}

// Hech qanday do'kon ochilmaganmi (birinchi marta sozlash kerakmi)
export async function noStoresYet() {
  const { rows } = await pool.query('SELECT NOT EXISTS (SELECT 1 FROM core.stores) AS empty');
  return rows[0].empty;
}

// Login bo'yicha do'kon: { store_id, schema } yoki null
export async function findLogin(username) {
  const { rows } = await pool.query(
    `SELECT s.id AS store_id, s.schema_name AS schema, s.status
     FROM core.logins l JOIN core.stores s ON s.id = l.store_id
     WHERE l.username = $1`,
    [username],
  );
  return rows[0] || null;
}

export async function storeIdForSchema(schema) {
  if (storeIdCache.has(schema)) return storeIdCache.get(schema);
  const { rows } = await pool.query('SELECT id FROM core.stores WHERE schema_name = $1', [schema]);
  const id = rows[0]?.id ?? null;
  if (id !== null) storeIdCache.set(schema, id);
  return id;
}

// Loginni butun tizim bo'yicha band qiladi (shu tranzaksiya ichida). Band bo'lsa — 409.
export async function reserveLogin(client, username, storeId) {
  const { rowCount } = await client.query(
    'INSERT INTO core.logins (username, store_id) VALUES ($1, $2) ON CONFLICT (username) DO NOTHING',
    [username, storeId],
  );
  if (rowCount === 0) throw new HttpError(409, 'Bu login band. Boshqa login tanlang');
}

// Do'kon ochish yarim yo'lda uzilib qolgan bo'lsa (masalan, aloqa uzildi), login qotib qolmasligi uchun
// 2 daqiqadan eski "yaratilmoqda" holatidagi yozuv tozalanadi va qayta urinish mumkin bo'ladi
export async function releaseStuckLogin(username) {
  const { rows } = await pool.query(
    `SELECT s.id, s.schema_name AS schema FROM core.logins l JOIN core.stores s ON s.id = l.store_id
     WHERE l.username = $1 AND s.status = 'creating' AND s.created_at < now() - interval '2 minutes'`,
    [username],
  );
  if (rows[0]) await dropStore({ id: rows[0].id, schema: rows[0].schema || 'public' });
}

export async function loginTaken(username) {
  const { rows } = await pool.query('SELECT 1 FROM core.logins WHERE username = $1', [username]);
  return Boolean(rows[0]);
}

export async function listActiveStores() {
  const { rows } = await pool.query("SELECT id, schema_name AS schema FROM core.stores WHERE status = 'active' AND schema_name IS NOT NULL ORDER BY id");
  return rows.filter((r) => SCHEMA_RE.test(r.schema));
}

// Yangi do'kon: ro'yxatga oladi, loginni band qiladi va alohida sxemani yaratadi.
// Birinchi do'kon (hali hech narsa yo'q bo'lsa) "public" sxemasiga yoziladi.
export async function createStore({ name, username }) {
  const client = await pool.connect();
  let store;
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(424243)');
    const { rows: any } = await client.query('SELECT EXISTS (SELECT 1 FROM core.stores) AS e');
    const { rows: pubUsers } = await client.query(
      "SELECT to_regclass('public.users') IS NOT NULL AND EXISTS (SELECT 1 FROM public.users) AS e",
    );
    const first = !any[0].e && !pubUsers[0].e;
    const { rows } = await client.query(
      "INSERT INTO core.stores (schema_name, name, status) VALUES (NULL, $1, 'creating') RETURNING id",
      [name],
    );
    const id = rows[0].id;
    const schema = first ? 'public' : `t_${id}`;
    await client.query('UPDATE core.stores SET schema_name = $2 WHERE id = $1', [id, schema]);
    await reserveLogin(client, username, id);
    if (schema !== 'public') await client.query(`CREATE SCHEMA ${schema}`);
    await client.query('COMMIT');
    store = { id, schema };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
  try {
    await ensureSchemaReady(store.schema);
  } catch (err) {
    await dropStore(store).catch(() => {});
    throw err;
  }
  return store;
}

export async function activateStore(store) {
  await pool.query("UPDATE core.stores SET status = 'active' WHERE id = $1", [store.id]);
  storeIdCache.set(store.schema, store.id);
}

// Yaratish yarim yo'lda to'xtasa — izsiz tozalaydi
export async function dropStore(store) {
  if (store.schema !== 'public') await pool.query(`DROP SCHEMA IF EXISTS ${store.schema} CASCADE`);
  await pool.query('DELETE FROM core.stores WHERE id = $1', [store.id]);
  schemaReady.delete(store.schema);
}
