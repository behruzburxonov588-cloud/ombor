import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { resetDatabase, startServer, client, pool, unitIdByCode } from './helper.js';

let srv;
let owner;
const ids = {};

before(async () => {
  await resetDatabase();
  srv = await startServer();
  owner = client(srv.base);
});

after(async () => {
  await srv.close();
  await pool.end();
});

test('tizim birinchi marta sozlanadi va ikkinchi marta sozlab bo\'lmaydi', async () => {
  const status = await owner.get('/api/auth/status');
  assert.equal(status.body.setup_required, true);

  const setup = await owner.post('/api/setup', {
    full_name: 'Aziz Egasi', username: 'Owner', password: 'secret1', store_name: "Test do'koni",
  });
  assert.equal(setup.status, 201);
  assert.equal(setup.body.user.role, 'owner');
  assert.equal(setup.body.user.username, 'owner');

  const again = await client(srv.base).post('/api/setup', {
    full_name: 'Boshqa', username: 'other', password: 'secret1', store_name: 'X',
  });
  assert.equal(again.status, 409);
});

test('login: noto\'g\'ri parol rad etiladi, to\'g\'risi qabul qilinadi', async () => {
  const bad = await client(srv.base).login('owner', 'wrong-password');
  assert.equal(bad.status, 401);
  assert.equal(bad.body.error, "Login yoki parol noto'g'ri");

  const ok = await owner.login('owner', 'secret1');
  assert.equal(ok.status, 200);
  const me = await owner.get('/api/auth/me');
  assert.equal(me.status, 200);
  assert.equal(me.body.user.permissions['employees.manage'], true);
});

test('API sessiyasiz ishlamaydi', async () => {
  const res = await client(srv.base).get('/api/products');
  assert.equal(res.status, 401);
});

test('xodimlar: kassir mahsulot yarata olmaydi, sotuv qila oladi', async () => {
  const created = await owner.post('/api/users', {
    full_name: 'Kassir Dilnoza', username: 'kassir', password: 'kassir1', role: 'cashier',
  });
  assert.equal(created.status, 201);

  const cashier = client(srv.base);
  assert.equal((await cashier.login('kassir', 'kassir1')).status, 200);

  const createProduct = await cashier.post('/api/products', { name: 'Test', base_unit_id: 1 });
  assert.equal(createProduct.status, 403);
  assert.equal(createProduct.body.error, "Bu amal uchun ruxsatingiz yo'q");

  const users = await cashier.get('/api/users');
  assert.equal(users.status, 403);

  const products = await cashier.get('/api/products');
  assert.equal(products.status, 200);
});

test('admin egasi rolini bera olmaydi; egasi oxirgi egasini pasaytira olmaydi', async () => {
  await owner.post('/api/users', { full_name: 'Admin', username: 'admin1', password: 'admin123', role: 'administrator' });
  const admin = client(srv.base);
  assert.equal((await admin.login('admin1', 'admin123')).status, 200);
  const r = await admin.post('/api/users', { full_name: 'X', username: 'newowner', password: 'secret1', role: 'owner' });
  assert.equal(r.status, 403);

  const me = await owner.get('/api/auth/me');
  const demote = await owner.put(`/api/users/${me.body.user.id}`, { role: 'cashier' });
  assert.equal(demote.status, 400);
});

test('ikki xil login bir xil nom bilan yaratilmaydi', async () => {
  const dup = await owner.post('/api/users', { full_name: 'Y', username: 'kassir', password: 'secret1', role: 'cashier' });
  assert.equal(dup.status, 409);
});

test('birliklar: maxsus birlik qo\'shish', async () => {
  const res = await owner.post('/api/units', { name: 'bog\'lam' });
  assert.equal(res.status, 201);
  assert.equal(res.body.unit.is_custom, true);
  const list = await owner.get('/api/units');
  assert.ok(list.body.units.some((u) => u.name === "bog'lam"));
  ids.kg = await unitIdByCode(owner, 'kg');
  ids.piece = await unitIdByCode(owner, 'piece');
  ids.pack = await unitIdByCode(owner, 'pack');
  ids.liter = await unitIdByCode(owner, 'l');
  ids.ml = await unitIdByCode(owner, 'ml');
});

test('mahsulot: birlik konvertatsiyasi bilan yaratiladi va shtrix-kod bo\'yicha topiladi', async () => {
  const created = await owner.post('/api/products', {
    name: "Qog'oz daftar",
    barcode: '4780000000011',
    base_unit_id: ids.piece,
    purchase_price: 1200,
    selling_price: 2000,
    min_stock: 5,
    conversions: [{ unit_id: ids.pack, factor: 10 }],
  });
  assert.equal(created.status, 201);
  ids.daftar = created.body.id;

  const detail = await owner.get(`/api/products/${ids.daftar}`);
  assert.equal(detail.body.product.conversions.length, 1);
  assert.equal(detail.body.product.conversions[0].factor, 10);

  const byBarcode = await owner.get('/api/products/barcode/4780000000011');
  assert.equal(byBarcode.status, 200);
  assert.equal(byBarcode.body.product.id, ids.daftar);
});

test('mahsulot: bir xil shtrix-kod ikkinchi marta qo\'yilmaydi', async () => {
  const res = await owner.post('/api/products', {
    name: 'Boshqa', barcode: '4780000000011', base_unit_id: ids.piece, selling_price: 1,
  });
  assert.equal(res.status, 409);
  assert.match(res.body.error, /Qog'oz daftar/);
});

test('mahsulot: asosiy birlikni qo\'shimcha birlik sifatida qo\'shib bo\'lmaydi', async () => {
  const res = await owner.post('/api/products', {
    name: 'Xato', base_unit_id: ids.piece, conversions: [{ unit_id: ids.piece, factor: 1 }],
  });
  assert.equal(res.status, 400);
});

test('mahsulot: sozlanmagan birlik bilan sotuv/kirim rad etiladi', async () => {
  const res = await owner.post('/api/sales', {
    items: [{ product_id: ids.daftar, unit_id: ids.kg, quantity: 1 }],
    payment: { method: 'cash' },
  });
  assert.equal(res.status, 400);
  assert.match(res.body.error, /sozlanmagan/);
});

test('mahsulot: narxni o\'zgartirish va arxivlash/tiklash', async () => {
  const upd = await owner.put(`/api/products/${ids.daftar}`, {
    name: "Qog'oz daftar", barcode: '4780000000011', base_unit_id: ids.piece,
    purchase_price: 1300, selling_price: 2100, min_stock: 5, conversions: [{ unit_id: ids.pack, factor: 10 }],
  });
  assert.equal(upd.status, 200);
  const detail = await owner.get(`/api/products/${ids.daftar}`);
  assert.equal(detail.body.product.selling_price, 2100);

  assert.equal((await owner.post(`/api/products/${ids.daftar}/archive`)).status, 200);
  const list = await owner.get('/api/products');
  assert.ok(!list.body.products.some((p) => p.id === ids.daftar));
  const archived = await owner.get('/api/products?archived=1');
  assert.ok(archived.body.products.some((p) => p.id === ids.daftar));
  const scan = await owner.get('/api/products/barcode/4780000000011');
  assert.equal(scan.status, 400);

  assert.equal((await owner.post(`/api/products/${ids.daftar}/restore`)).status, 200);
});

test('kategoriya va yetkazib beruvchi yaratish', async () => {
  const cat = await owner.post('/api/categories', { name: 'Kanselyariya' });
  assert.equal(cat.status, 201);
  const sup = await owner.post('/api/suppliers', { name: "Ta'minotchi A", phone: '+998901112233' });
  assert.equal(sup.status, 201);
  ids.supplier = sup.body.supplier.id;
});

test('login urinishlari cheklanadi (8 ta noto\'g\'ri urinishdan keyin)', async () => {
  const attacker = client(srv.base);
  for (let i = 0; i < 8; i += 1) {
    const r = await attacker.login('nomalum', 'xxxxxx');
    assert.equal(r.status, 401);
  }
  const blocked = await attacker.login('nomalum', 'xxxxxx');
  assert.equal(blocked.status, 429);
});

test('chiqish sessiyani bekor qiladi', async () => {
  const tmp = client(srv.base);
  await tmp.login('owner', 'secret1');
  assert.equal((await tmp.get('/api/products')).status, 200);
  await tmp.post('/api/auth/logout', {});
  assert.equal((await tmp.get('/api/products')).status, 401);
});
