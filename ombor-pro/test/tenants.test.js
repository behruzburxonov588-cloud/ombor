// Ko'p do'kon: har kim o'z do'konini ochadi, ma'lumotlar to'liq ajratilgan, loginlar yagona,
// bir login bilan istalgan qurilmadan kiriladi, eski sessiyalar ishlashda davom etadi
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import { resetDatabase, startServer, client, pool, unitIdByCode } from './helper.js';
import { runWithSchema } from '../src/db.js';
import { runCycle } from '../src/services/notify.js';
import { forEachStore } from '../src/services/scheduler.js';

let srv;
let a; // birinchi do'kon egasi
let b; // ikkinchi do'kon egasi
let schemaB;

const newStore = (store, user) => ({
  store_name: store, full_name: `${user} egasi`, username: user, password: 'parol123',
});

before(async () => {
  await resetDatabase();
  srv = await startServer();
  a = client(srv.base);
  b = client(srv.base);
});

after(async () => {
  delete process.env.OMBOR_SIGNUP;
  delete process.env.OMBOR_RUNTIME;
  await srv.close();
  await pool.end();
});

test("birinchi do'kon: holat, sozlash va ro'yxatdan o'tish imkoniyati", async () => {
  let st = await a.get('/api/auth/status');
  assert.deepEqual(st.body, { setup_required: true, signup: true });
  const r = await a.post('/api/setup', newStore('Baraka', 'ali'));
  assert.equal(r.status, 201);
  st = await a.get('/api/auth/status');
  assert.equal(st.body.setup_required, false);
  // Ikkinchi marta sozlash mumkin emas — faqat ro'yxatdan o'tish
  assert.equal((await client(srv.base).post('/api/setup', newStore('X', 'xx1'))).status, 409);
});

test("ikkinchi do'kon ochiladi, login band bo'lsa rad etiladi", async () => {
  const taken = await b.post('/api/auth/register', newStore('Nur', 'ali'));
  assert.equal(taken.status, 409);
  assert.match(taken.body.error, /login band/);
  const bad = await b.post('/api/auth/register', { ...newStore('Nur', 'vali'), password: '123' });
  assert.equal(bad.status, 400);
  const r = await b.post('/api/auth/register', newStore('Nur savdo', 'vali'));
  assert.equal(r.status, 201);
  assert.equal(r.body.user.role, 'owner');
  const { rows } = await pool.query("SELECT s.schema_name, s.status FROM core.logins l JOIN core.stores s ON s.id = l.store_id WHERE l.username = 'vali'");
  schemaB = rows[0].schema_name;
  assert.match(schemaB, /^t_\d+$/);
  assert.equal(rows[0].status, 'active');
  // Muvaffaqiyatsiz urinishlar izsiz: band login uchun do'kon yaratilmagan
  const { rows: stores } = await pool.query('SELECT COUNT(*)::int AS n FROM core.stores');
  assert.equal(stores[0].n, 2);
});

test("do'konlar ma'lumoti to'liq ajratilgan", async () => {
  const pa = await a.post('/api/products', { name: 'Non', base_unit_id: await unitIdByCode(a, 'piece'), selling_price: 4000, opening_qty: 10 });
  const pb = await b.post('/api/products', { name: 'Olma', base_unit_id: await unitIdByCode(b, 'kg'), selling_price: 15000, opening_qty: 5 });
  assert.equal(pa.status, 201);
  assert.equal(pb.status, 201);
  const la = await a.get('/api/products');
  const lb = await b.get('/api/products');
  assert.deepEqual(la.body.products.map((p) => p.name), ['Non']);
  assert.deepEqual(lb.body.products.map((p) => p.name), ['Olma']);
  // Boshqa do'kon mahsulotiga to'g'ridan-to'g'ri murojaat ham ishlamaydi (id bir xil bo'lsa ham)
  const cross = await b.get(`/api/products/${pa.body.id}`);
  assert.ok(cross.status === 404 || cross.body.product?.name === 'Olma');
  // Har bir do'konda chek raqamlari o'z hisobidan boshlanadi
  const sa = await a.post('/api/sales', { items: [{ product_id: pa.body.id, quantity: 2 }], payment: { method: 'cash' } });
  const sb = await b.post('/api/sales', { items: [{ product_id: pb.body.id, quantity: 1 }], payment: { method: 'cash' } });
  assert.equal(sa.status, 201);
  assert.equal(sb.status, 201);
  assert.equal(sa.body.sale.receipt_no, sb.body.sale.receipt_no);
  const da = await a.get('/api/analytics/dashboard');
  const db = await b.get('/api/analytics/dashboard');
  assert.equal(da.body.kpis.revenue.value, 8000);
  assert.equal(db.body.kpis.revenue.value, 15000);
  // Sozlamalar ham alohida
  assert.equal((await a.get('/api/settings')).body.settings.store_name, 'Baraka');
  assert.equal((await b.get('/api/settings')).body.settings.store_name, 'Nur savdo');
});

test("xodim logini butun tizimda yagona; xodim istalgan qurilmadan o'z do'koniga kiradi", async () => {
  const r = await b.post('/api/users', { full_name: 'Kassir', username: 'kassir', password: 'kassir1', role: 'cashier' });
  assert.equal(r.status, 201);
  const dup = await a.post('/api/users', { full_name: 'Boshqa', username: 'kassir', password: 'kassir1', role: 'cashier' });
  assert.equal(dup.status, 409);
  assert.match(dup.body.error, /login band/);
  // Yangi qurilma (yangi sessiya)
  const phone = client(srv.base);
  const login = await phone.login('kassir', 'kassir1');
  assert.equal(login.status, 200);
  const list = await phone.get('/api/products');
  assert.deepEqual(list.body.products.map((p) => p.name), ['Olma']);
  // Do'kon egasi ham boshqa qurilmadan kiradi
  const laptop = client(srv.base);
  assert.equal((await laptop.login('vali', 'parol123')).status, 200);
  assert.equal((await laptop.get('/api/settings')).body.settings.store_name, 'Nur savdo');
  assert.equal((await laptop.login('vali', 'xato-parol')).status, 401);
  assert.equal((await laptop.login('yoq-login', 'parol123')).status, 401);
});

test("eski sessiya (do'konsiz) birinchi do'konga, soxta sessiya rad etiladi", async () => {
  const { rows } = await pool.query("SELECT id FROM public.users WHERE username = 'ali'");
  const call = (token) => fetch(`${srv.base}/api/auth/me`, { headers: { Cookie: `ombor_session=${token}` } });
  const legacy = jwt.sign({ sub: rows[0].id }, 'test-secret-value', { expiresIn: '1h' });
  const r1 = await call(legacy);
  assert.equal(r1.status, 200);
  assert.equal((await r1.json()).user.username, 'ali');
  const forged = jwt.sign({ sub: 1, sch: schemaB }, 'boshqa-kalit', { expiresIn: '1h' });
  assert.equal((await call(forged)).status, 401);
  const weird = jwt.sign({ sub: 1, sch: 'core' }, 'test-secret-value', { expiresIn: '1h' });
  assert.equal((await call(weird)).status, 401);
});

test("bildirishnomalar va zaxira nusxa har bir do'kon uchun alohida", async () => {
  const seen = [];
  await forEachStore(async (s) => {
    seen.push(s.schema);
    await runCycle(pool);
  });
  assert.deepEqual(seen.sort(), ['public', schemaB].sort());
  const backupB = await b.get('/api/admin/backup');
  assert.equal(backupB.status, 200);
  assert.ok(backupB.body.includes('Olma'));
  assert.ok(!backupB.body.includes('Non'));
  const countIn = (schema) => runWithSchema(schema, () => pool.query('SELECT COUNT(*)::int AS n FROM products')).then((r) => r.rows[0].n);
  assert.equal(await countIn('public'), 1);
  assert.equal(await countIn(schemaB), 1);
});

test("Cloudflare rejimi: parol bazada tekshiriladi (alohida do'kon sxemasida ham)", async () => {
  process.env.OMBOR_RUNTIME = 'worker';
  try {
    const c = client(srv.base);
    const r = await c.post('/api/auth/register', newStore('Bulut', 'bulut'));
    assert.equal(r.status, 201);
    const d = client(srv.base);
    assert.equal((await d.login('bulut', 'parol123')).status, 200);
    assert.equal((await d.login('bulut', 'noto-gri')).status, 401);
  } finally {
    delete process.env.OMBOR_RUNTIME;
  }
});

test("yarim yo'lda uzilgan do'kon ochish loginni qotirib qo'ymaydi", async () => {
  // Uzilgan holatni yasaymiz: login band, do'kon "yaratilmoqda", 5 daqiqa oldin
  const { rows } = await pool.query("INSERT INTO core.stores (schema_name, name, status, created_at) VALUES (NULL, 'Uzilgan', 'creating', now() - interval '5 minutes') RETURNING id");
  const id = rows[0].id;
  await pool.query('UPDATE core.stores SET schema_name = $2 WHERE id = $1', [id, `t_${id}`]);
  await pool.query(`CREATE SCHEMA t_${id}`);
  await pool.query("INSERT INTO core.logins (username, store_id) VALUES ('qotgan', $1)", [id]);
  assert.equal((await client(srv.base).login('qotgan', 'parol123')).status, 401);
  const r = await client(srv.base).post('/api/auth/register', newStore('Qayta', 'qotgan'));
  assert.equal(r.status, 201);
  const { rows: gone } = await pool.query("SELECT 1 FROM pg_namespace WHERE nspname = $1", [`t_${id}`]);
  assert.equal(gone.length, 0, 'eski yarim sxema tozalangan');
  // Yangi (2 daqiqadan yosh) "yaratilmoqda" yozuvi esa tegilmaydi — parallel ochilayotgan bo'lishi mumkin
  const { rows: fresh } = await pool.query("INSERT INTO core.stores (schema_name, name, status) VALUES (NULL, 'Hozir', 'creating') RETURNING id");
  await pool.query("INSERT INTO core.logins (username, store_id) VALUES ('hozirgi', $1)", [fresh[0].id]);
  assert.equal((await client(srv.base).post('/api/auth/register', newStore('X', 'hozirgi'))).status, 409);
});

test("yangi do'kon ochishni o'chirib qo'yish mumkin", async () => {
  process.env.OMBOR_SIGNUP = 'off';
  try {
    assert.equal((await a.get('/api/auth/status')).body.signup, false);
    const r = await client(srv.base).post('/api/auth/register', newStore('Yopiq', 'yopiq'));
    assert.equal(r.status, 403);
  } finally {
    delete process.env.OMBOR_SIGNUP;
  }
});
