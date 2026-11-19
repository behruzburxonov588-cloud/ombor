// Zaxira nusxa: yuklab olish (faqat egasi), bo'sh bazaga aynan tiklash, to'la bazaga tiklashni rad etish
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { resetDatabase, startServer, client, pool, unitIdByCode } from './helper.js';
import { runWithPool } from '../src/db.js';
import { restoreBackup } from '../src/restore.js';
import { BACKUP_TABLES } from '../src/services/backup.js';

const RESTORE_DB = (process.env.OMBOR_TEST_DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/ombor_test').replace(/ombor_test$/, 'ombor_test_restore');
let srv;
let owner;
let cashier;
let target;
let backupSql = '';

before(async () => {
  await resetDatabase();
  await pool.query('DROP DATABASE IF EXISTS ombor_test_restore');
  await pool.query('CREATE DATABASE ombor_test_restore');
  target = new pg.Pool({ connectionString: RESTORE_DB });
  srv = await startServer();
  owner = client(srv.base);
  await owner.post('/api/setup', { full_name: "Egasi O'g'li", username: 'owner', password: 'secret1', store_name: "Do'kon \"Baraka\"" });
  await owner.post('/api/users', { full_name: 'Kassir', username: 'kassir', password: 'kassir1', role: 'cashier' });
  cashier = client(srv.base);
  await cashier.login('kassir', 'kassir1');
  const piece = await unitIdByCode(owner, 'piece');
  const p = await owner.post('/api/products', {
    name: "Choy 'Ahmad' — 100 g; DROP TABLE x", base_unit_id: piece, purchase_price: 1234.5, selling_price: 2000.25, opening_qty: 10,
  });
  const c = await owner.post('/api/customers', { name: 'Vali', phone: '+998901234567' });
  await owner.post('/api/sales', { items: [{ product_id: p.body.id, quantity: 3 }], payment: { method: 'credit' }, customer_id: c.body.customer.id });
  await owner.post('/api/sales', { items: [{ product_id: p.body.id, quantity: 1.5 }], payment: { method: 'cash' } });
  // Rasm (bytea) va sozlamalar (jsonb)
  await pool.query("INSERT INTO product_images (name, content_type, data) VALUES ('a.png', 'image/png', '\\x89504e470d0a00ff'::bytea)");
  await owner.put('/api/me/preferences', { notifications: { muted: ['low_stock'] } });
});

after(async () => {
  await target.end();
  // pool.end() ulanishlar to'liq yopilishini kutmaydi: bazani o'chirishdan oldin ular uzilguncha kutamiz,
  // aks holda "DROP ... WITH (FORCE)" yopilayotgan ulanishni uzib, kutilmagan xato beradi
  for (let i = 0; i < 60; i += 1) {
    const { rows } = await pool.query("SELECT COUNT(*)::int AS n FROM pg_stat_activity WHERE datname = 'ombor_test_restore'");
    if (!rows[0].n) break;
    await new Promise((r) => { setTimeout(r, 50); });
  }
  await srv.close();
  await pool.query('DROP DATABASE IF EXISTS ombor_test_restore WITH (FORCE)').catch(() => {});
  await pool.end();
});

test('zaxirani faqat egasi yuklab oladi', async () => {
  const denied = await cashier.get('/api/admin/backup');
  assert.equal(denied.status, 403);
  const res = await owner.get('/api/admin/backup');
  assert.equal(res.status, 200);
  backupSql = res.body;
  assert.ok(backupSql.startsWith('-- OMBOR PRO zaxira nusxasi'));
  assert.match(backupSql, /-- Migratsiyalar: 001_init\.sql,/);
  const hist = await owner.get('/api/history');
  assert.ok(hist.body.entries.some((e) => e.action === 'backup.download'));
});

test("bo'sh bazaga tiklanadi va har bir jadval aynan bir xil bo'ladi", async () => {
  const stats = await runWithPool(target, () => restoreBackup(backupSql, { log: () => {} }));
  assert.equal(stats.users, 2);
  assert.equal(stats.sales, 2);
  const sum = (p, t) => p.query(`SELECT COUNT(*)::int AS n, md5(COALESCE(string_agg(x::text, '|' ORDER BY x::text), '')) AS h FROM ${t} x`).then((r) => r.rows[0]);
  for (const t of BACKUP_TABLES) {
    if (t === 'audit_log') continue; // zaxira yuklanganidan keyin yozilgan amal manbada qo'shimcha bo'ladi
    const [a, b] = await Promise.all([sum(pool, t), sum(target, t)]);
    assert.deepEqual(b, a, `${t} jadvali farq qiladi`);
  }
  // Hisoblagichlar: keyingi chek raqami davom etadi; ishlatilmagan hisoblagich 1 dan boshlanadi
  const next = await target.query("SELECT nextval('receipt_seq') AS r, nextval('purchase_seq') AS p");
  assert.equal(Number(next.rows[0].r), 3);
  assert.equal(Number(next.rows[0].p), 1);
  const img = await target.query("SELECT encode(data, 'hex') AS h FROM product_images WHERE name = 'a.png'");
  assert.equal(img.rows[0].h, '89504e470d0a00ff');
});

test("ma'lumoti bor bazaga tiklash rad etiladi va hech narsa o'zgarmaydi", async () => {
  const before = await target.query('SELECT COUNT(*)::int AS n FROM sales');
  await assert.rejects(() => runWithPool(target, () => restoreBackup(backupSql, { log: () => {} })), /allaqachon ma'lumot bor/);
  const after = await target.query('SELECT COUNT(*)::int AS n FROM sales');
  assert.equal(after.rows[0].n, before.rows[0].n);
  await assert.rejects(() => runWithPool(target, () => restoreBackup('SELECT 1', { log: () => {} })), /zaxira nusxasi emas/);
});

test('parol: bazadagi (Cloudflare) va ilovadagi bcrypt bir-biriga mos', async () => {
  const { hashPassword, verifyPassword } = await import('../src/auth.js');
  const appHash = await hashPassword("Parol'123 — o'zbekcha");
  process.env.OMBOR_RUNTIME = 'worker';
  try {
    assert.equal(await verifyPassword("Parol'123 — o'zbekcha", appHash), true, 'ilova xeshi bazada tekshiriladi');
    assert.equal(await verifyPassword("noto'g'ri", appHash), false);
    const dbHash = await hashPassword('yangi-parol-77');
    assert.match(dbHash, /^\$2a\$12\$/);
    process.env.OMBOR_RUNTIME = '';
    assert.equal(await verifyPassword('yangi-parol-77', dbHash), true, 'baza xeshi ilovada tekshiriladi');
    assert.equal(await verifyPassword('yangi-parol-78', dbHash), false);
    assert.equal(await verifyPassword('x', 'buzilgan-xesh'), false);
  } finally {
    process.env.OMBOR_RUNTIME = '';
  }
});
