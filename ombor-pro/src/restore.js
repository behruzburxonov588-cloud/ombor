// Zaxira nusxasini yangi (bo'sh) bazaga tiklash.
// Ishlatish: DATABASE_URL=... npm run restore -- ombor-zaxira.sql
// Xavfsizlik: bazada allaqachon foydalanuvchi bo'lsa, hech narsa o'zgartirilmaydi.
import { pathToFileURL } from 'node:url';
import { pool } from './db.js';
import { migrate } from './migrate.js';

export async function restoreBackup(sql, { log = console.log } = {}) {
  const header = sql.slice(0, 2000);
  if (!header.startsWith('-- OMBOR PRO zaxira nusxasi')) {
    throw new Error("Bu fayl OMBOR PRO zaxira nusxasi emas");
  }
  const migLine = header.match(/^-- Migratsiyalar: (.*)$/m);
  const needed = migLine ? migLine[1].split(',').filter(Boolean) : [];

  await migrate(log);
  const { rows: have } = await pool.query('SELECT name FROM schema_migrations');
  const known = new Set(have.map((r) => r.name));
  const missing = needed.filter((m) => !known.has(m));
  if (missing.length) {
    throw new Error(`Zaxira yangiroq dastur versiyasidan olingan (${missing.join(', ')}). Avval dasturni yangilang`);
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query('SELECT (SELECT COUNT(*) FROM users) + (SELECT COUNT(*) FROM products) + (SELECT COUNT(*) FROM sales) AS n');
    if (Number(rows[0].n) > 0) {
      throw new Error("Bu bazada allaqachon ma'lumot bor. Tiklash faqat bo'sh bazaga qilinadi (ma'lumot ustidan yozilmaydi)");
    }
    // Migratsiya yaratgan standart qatorlar (o'lchov birliklari) zaxiradagi bilan almashtiriladi
    await client.query('TRUNCATE settings, units RESTART IDENTITY CASCADE');
    await client.query(sql);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
  const { rows: stats } = await pool.query(
    `SELECT (SELECT COUNT(*) FROM users)::int AS users, (SELECT COUNT(*) FROM products)::int AS products,
            (SELECT COUNT(*) FROM sales)::int AS sales, (SELECT COUNT(*) FROM customers)::int AS customers`,
  );
  return stats[0];
}

if (process.argv?.[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const file = process.argv[2];
  if (!file) {
    console.error('Ishlatish: npm run restore -- <zaxira-fayl.sql>');
    process.exit(1);
  }
  const fs = await import('node:fs/promises');
  try {
    const stats = await restoreBackup(await fs.readFile(file, 'utf8'));
    console.log(`Tiklandi: ${stats.users} ta xodim, ${stats.products} ta mahsulot, ${stats.sales} ta savdo, ${stats.customers} ta mijoz`);
    await pool.end();
  } catch (err) {
    console.error(`Xato: ${err.message}`);
    await pool.end();
    process.exit(1);
  }
}
