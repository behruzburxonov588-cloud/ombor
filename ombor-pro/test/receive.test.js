// «Yuk keldi»: yetkazib beruvchi ixtiyoriy (to'liq to'langan kirim «Noma'lum» nomiga yoziladi),
// qarzga olinganda esa kimdan kelgani majburiy. Ro'yxatda qadoq (pack) qaytariladi.
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
  await owner.post('/api/setup', { full_name: 'Egasi', username: 'owner', password: 'secret1', store_name: "Do'kon" });
  const piece = await unitIdByCode(owner, 'piece');
  const units = (await owner.get('/api/units')).body.units;
  const box = units.find((u) => u.code === 'box') || units.find((u) => u.id !== piece);
  ids.box = box.id;
  ids.p = (await owner.post('/api/products', {
    name: 'Pepsi 0,5', base_unit_id: piece, selling_price: 6000, purchase_price: 5000, opening_qty: 13,
    conversions: [{ unit_id: box.id, factor: 12 }],
  })).body.id;
});

after(async () => {
  await srv.close();
  await pool.end();
});

test("ro'yxatda qadoq va qoldiq bor", async () => {
  const r = await owner.get('/api/products');
  assert.equal(r.status, 200);
  const p = r.body.products.find((x) => x.id === ids.p);
  assert.equal(p.stock_qty, 13);
  assert.deepEqual(p.pack, { unit_id: ids.box, name: p.pack.name, factor: 12 });
  assert.equal(p.conversions.length, 1);
  assert.equal(p.conversions[0].factor, 12);
});

test("kimdan kelgani ko'rsatilmasa, to'liq to'langan yuk saqlanadi", async () => {
  const r = await owner.post('/api/purchases', {
    items: [{ product_id: ids.p, unit_id: ids.box, quantity: 2, unit_price: 60000 }],
    paid_amount: 120000, payment_method: 'cash', idempotency_key: 'rcv-1',
  });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.equal(r.body.purchase.supplier_name, "Noma'lum");
  const p = (await owner.get(`/api/products/${ids.p}`)).body.product;
  assert.equal(p.stock_qty, 37, '13 + 2 quti × 12 = 37');

  // Ikkinchi marta ham o'sha «Noma'lum» ishlatiladi (yangisi yaratilmaydi)
  const r2 = await owner.post('/api/purchases', {
    supplier_id: null,
    items: [{ product_id: ids.p, quantity: 3, unit_price: 5000 }],
    paid_amount: 15000,
  });
  assert.equal(r2.status, 201, JSON.stringify(r2.body));
  assert.equal(r2.body.purchase.supplier_id, r.body.purchase.supplier_id);
  const sups = (await owner.get('/api/suppliers')).body.suppliers.filter((s) => s.name === "Noma'lum");
  assert.equal(sups.length, 1);
});

test("qarzga olinsa, kimdan kelgani so'raladi", async () => {
  const r = await owner.post('/api/purchases', {
    items: [{ product_id: ids.p, quantity: 5, unit_price: 5000 }],
    paid_amount: 10000,
  });
  assert.equal(r.status, 400);
  assert.match(r.body.error, /kimdan kelganini/);
  const p = (await owner.get(`/api/products/${ids.p}`)).body.product;
  assert.equal(p.stock_qty, 40, "xato bo'lsa qoldiq o'zgarmaydi");

  const sup = (await owner.post('/api/suppliers', { name: 'Ulgurji' })).body.supplier.id;
  const ok = await owner.post('/api/purchases', {
    supplier_id: sup,
    items: [{ product_id: ids.p, quantity: 5, unit_price: 5000 }],
    paid_amount: 0,
  });
  assert.equal(ok.status, 201);
  assert.equal(Number(ok.body.purchase.remaining_debt), 25000);
});
