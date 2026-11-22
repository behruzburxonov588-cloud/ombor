import { pathToFileURL } from 'node:url';
import { pool, currentSchema } from './db.js';
import { ROOT } from './config.js';

// Cloudflare Workers'da fayl tizimi yo'q: migratsiyalar matni oldindan beriladi
let defaultSources = null;
export function setMigrationSources(list) {
  defaultSources = list;
}

async function readMigrationFiles() {
  const fs = await import('node:fs/promises');
  const path = await import('node:path');
  const dir = path.join(ROOT, 'migrations');
  const files = (await fs.readdir(dir)).filter((f) => f.endsWith('.sql')).sort();
  return Promise.all(files.map(async (name) => ({ name, sql: await fs.readFile(path.join(dir, name), 'utf8') })));
}

// Migratsiyalarni tartib bilan bir marta qo'llaydi.
// Hammasi bitta tranzaksiyada va tranzaksiya qulfi bilan bajariladi: bir vaqtda bir nechta server
// (yoki Cloudflare nusxasi) ishga tushsa ham, ulanishlar puli (Neon, Hyperdrive) orqali ham xavfsiz.
// sources: [{ name, sql }] — berilmasa migrations/ papkasidan o'qiladi.
// Joriy do'kon sxemasida bajariladi (har bir do'konning jadvallari alohida yangilanadi)
export async function migrate(log = console.log, sources = null) {
  const list = sources || defaultSources || await readMigrationFiles();
  const schema = currentSchema();
  // Tezkor yo'l: barcha migratsiyalar allaqachon qo'llangan bo'lsa (odatdagi holat) — bitta so'rov, qulfsiz.
  // Cloudflare'da har bir yangi nusxa shu tekshiruvdan o'tadi, shuning uchun u arzon bo'lishi kerak.
  try {
    const { rows } = await pool.query('SELECT name FROM schema_migrations');
    const have = new Set(rows.map((r) => r.name));
    if (list.every((m) => have.has(m.name))) return [];
  } catch {
    // jadval yoki sxema hali yo'q — to'liq yo'l
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(424242)');
    if (schema !== 'public') await client.query(`CREATE SCHEMA IF NOT EXISTS ${schema}`);
    await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      name TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
    const { rows } = await client.query('SELECT name FROM schema_migrations');
    const done = new Set(rows.map((r) => r.name));
    const applied = [];
    for (const m of [...list].sort((a, b) => a.name.localeCompare(b.name))) {
      if (done.has(m.name)) continue;
      await client.query(m.sql);
      await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [m.name]);
      applied.push(m.name);
    }
    await client.query('COMMIT');
    for (const name of applied) log(`Migratsiya qo'llandi: ${name}`);
    return applied;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

if (process.argv?.[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  migrate()
    .then(() => pool.end())
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
