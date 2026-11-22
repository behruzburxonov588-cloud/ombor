// Tovar o'lchamlari (kiyim S/M/L, poyabzal 38/39 ...): har bir o'lcham — o'z qoldig'i bilan alohida tovar,
// lekin bitta modelga bog'langan. Takror o'lcham rad etiladi, sotuv va kirim har bir o'lcham bo'yicha yuradi.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { resetDatabase, startServer, client, pool, unitIdByCode } from './helper.js';

let srv;
let owner;
let piece;
const ids = {};

before(async () => {
  await resetDatabase();
  srv = await startServer();
  owner = client(srv.base);
  await owner.post('/api/setup', { full_name: 'Egasi', username: 'owner', password: 'secret1', store_name: 'Kiyim do\'koni' });
  piece = await unitIdByCode(owner, 'piece');
});

after(async () => {
  await srv.close();
  await pool.end();
});

const size = (label, qty, extra = {}) => owner.post('/api/products', {
  name: `Futbolka oq ${label}`, model_name: 'Futbolka oq', variant_label: label,
  base_unit_id: piece, selling_price: 150000, purchase_price: 100000, opening_qty: qty, ...extra,
});

test("o'lchamli tovar yaratiladi va model bo'yicha ro'yxati olinadi", async () => {
  for (const [label, qty] of [['S', 3], ['M', 5], ['L', 0]]) {
    const r = await size(label, qty);
    assert.equal(r.status, 201, JSON.stringify(r.body));
    ids[label] = r.body.id;
  }
  await owner.post('/api/products', { name: 'Paypoq', base_unit_id: piece, selling_price: 20000 });
  const r = await owner.get('/api/products?model=futbolka%20OQ');
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.products.map((p) => p.variant_label).sort(), ['L', 'M', 'S']);
  const m = r.body.products.find((p) => p.variant_label === 'M');
  assert.equal(m.model_name, 'Futbolka oq');
  assert.equal(m.stock_qty, 5);
  const all = (await owner.get('/api/products')).body.products;
  assert.equal(all.find((p) => p.name === 'Paypoq').model_name, null);
});

test("bir xil o'lcham ikki marta qo'shilmaydi, model nomisiz o'lcham rad etiladi", async () => {
  const dup = await size('m', 1);
  assert.equal(dup.status, 409);
  assert.match(dup.body.error, /«M»|«m»/);
  const bad = await owner.post('/api/products', { name: 'X', variant_label: 'XL', base_unit_id: piece, selling_price: 1 });
  assert.equal(bad.status, 400);
});

test("tahrirlashda o'lcham yuborilmasa bog'lanish saqlanadi", async () => {
  const cur = (await owner.get(`/api/products/${ids.S}`)).body.product;
  const r = await owner.put(`/api/products/${ids.S}`, {
    name: cur.name, base_unit_id: cur.base_unit_id, selling_price: 155000, purchase_price: 100000, min_stock: 1, conversions: [],
  });
  assert.equal(r.status, 200);
  const after = (await owner.get(`/api/products/${ids.S}`)).body.product;
  assert.equal(after.model_name, 'Futbolka oq');
  assert.equal(after.variant_label, 'S');
  assert.equal(after.selling_price, 155000);
});

test("sotuv va kirim har bir o'lcham bo'yicha qoldiqni o'zgartiradi", async () => {
  const sale = await owner.post('/api/sales', { items: [{ product_id: ids.M, quantity: 2 }], payment: { method: 'cash' } });
  assert.equal(sale.status, 201, JSON.stringify(sale.body));
  const pur = await owner.post('/api/purchases', { items: [{ product_id: ids.L, quantity: 4, unit_price: 100000 }], paid_amount: 400000 });
  assert.equal(pur.status, 201, JSON.stringify(pur.body));
  const list = (await owner.get('/api/products?model=Futbolka oq')).body.products;
  const by = Object.fromEntries(list.map((p) => [p.variant_label, p.stock_qty]));
  assert.deepEqual(by, { S: 3, M: 3, L: 4 });
});
