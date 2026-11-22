// Tovar izohi va yaroqlilik muddati; bosh sahifa uchun 7 kunlik savdo (/analytics/daily)
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { resetDatabase, startServer, client, pool, unitIdByCode } from './helper.js';

let srv;
let owner;
let piece;

before(async () => {
  await resetDatabase();
  srv = await startServer();
  owner = client(srv.base);
  await owner.post('/api/setup', { full_name: 'Egasi', username: 'owner', password: 'secret1', store_name: 'Dorixona' });
  piece = await unitIdByCode(owner, 'piece');
});

after(async () => {
  await srv.close();
  await pool.end();
});

const isoPlus = (days) => {
  const d = new Date(Date.now() + 5 * 3600e3 + days * 86400e3);
  return d.toISOString().slice(0, 10);
};

test("izoh va yaroqlilik muddati saqlanadi, holati hisoblanadi", async () => {
  const soon = await owner.post('/api/products', {
    name: 'Sut 1 L', base_unit_id: piece, selling_price: 12000, description: 'Yog\'liligi 3,2%', expiry_date: isoPlus(5),
  });
  assert.equal(soon.status, 201, JSON.stringify(soon.body));
  const old = await owner.post('/api/products', { name: 'Qatiq', base_unit_id: piece, selling_price: 8000, expiry_date: isoPlus(-2) });
  const far = await owner.post('/api/products', { name: 'Tuz', base_unit_id: piece, selling_price: 3000, expiry_date: isoPlus(200) });
  await owner.post('/api/products', { name: 'Gugurt', base_unit_id: piece, selling_price: 1000 });
  const p = (await owner.get(`/api/products/${soon.body.id}`)).body.product;
  assert.equal(p.description, "Yog'liligi 3,2%");
  assert.equal(p.expiry_date, isoPlus(5));
  assert.equal(p.expiry_status, 'soon');
  const all = (await owner.get('/api/products')).body.products;
  const by = Object.fromEntries(all.map((x) => [x.name, x.expiry_status]));
  assert.deepEqual(by, { 'Sut 1 L': 'soon', Qatiq: 'expired', Tuz: 'ok', Gugurt: null });
  const soonList = (await owner.get('/api/products?expiry=soon')).body.products.map((x) => x.name).sort();
  assert.deepEqual(soonList, ['Qatiq', 'Sut 1 L']);
  assert.ok(old.body.id && far.body.id);
});

test("tahrirlashda yuborilmagan izoh saqlanadi, bo'sh satr o'chiradi, noto'g'ri sana rad etiladi", async () => {
  const { id } = (await owner.post('/api/products', { name: 'Non', base_unit_id: piece, selling_price: 4000, description: 'Tandir', expiry_date: isoPlus(2) })).body;
  const base = { name: 'Non', base_unit_id: piece, selling_price: 4500, conversions: [] };
  assert.equal((await owner.put(`/api/products/${id}`, base)).status, 200);
  let p = (await owner.get(`/api/products/${id}`)).body.product;
  assert.equal(p.description, 'Tandir');
  assert.equal(p.expiry_date, isoPlus(2));
  assert.equal((await owner.put(`/api/products/${id}`, { ...base, description: '', expiry_date: '' })).status, 200);
  p = (await owner.get(`/api/products/${id}`)).body.product;
  assert.equal(p.description, null);
  assert.equal(p.expiry_date, null);
  const bad = await owner.put(`/api/products/${id}`, { ...base, expiry_date: '2026-13-45' });
  assert.equal(bad.status, 400);
});

test("bosh sahifa: so'nggi 7 kunlik savdo kunma-kun", async () => {
  const { id } = (await owner.post('/api/products', { name: 'Choy', base_unit_id: piece, selling_price: 10000, purchase_price: 7000, opening_qty: 10 })).body;
  const sale = await owner.post('/api/sales', { items: [{ product_id: id, quantity: 2 }], payment: { method: 'cash' } });
  assert.equal(sale.status, 201, JSON.stringify(sale.body));
  const r = await owner.get('/api/analytics/daily?days=7');
  assert.equal(r.status, 200);
  assert.equal(r.body.days.length, 7);
  assert.equal(r.body.financial, true);
  const today = r.body.days[6];
  assert.equal(today.day, r.body.to);
  assert.equal(today.sales_count, 1);
  assert.equal(today.net_revenue, 20000);
  assert.equal(today.gross_profit, 6000);
});
