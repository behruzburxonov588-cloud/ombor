// Rulonli tovar (mato, kabel, gilam): rulonlar uzunligi har xil; metrlab, butun rulon va rulonning bir qismini sotish
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { resetDatabase, startServer, client, pool, unitIdByCode } from './helper.js';

let srv;
let owner;
let metr;
let rulon;
let id;

before(async () => {
  await resetDatabase();
  srv = await startServer();
  owner = client(srv.base);
  await owner.post('/api/setup', { full_name: 'Egasi', username: 'owner', password: 'secret1', store_name: 'Mato' });
  metr = await unitIdByCode(owner, 'm');
  rulon = await unitIdByCode(owner, 'roll');
});

after(async () => {
  await srv.close();
  await pool.end();
});

const prod = async () => (await owner.get(`/api/products/${id}`)).body;
const sell = (items) => owner.post('/api/sales', { items, payment: { method: 'cash' } });

test("rulonlar har xil uzunlikda: 50 + 45 + 60 = 155 metr, 3 ta rulon", async () => {
  const r = await owner.post('/api/products', {
    name: 'Oq mato', base_unit_id: metr, selling_price: 12000, purchase_price: 8000,
    conversions: [{ unit_id: rulon, factor: 50 }], opening_rolls: [50, 45, 60],
  });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  id = r.body.id;
  const { product, batches } = await prod();
  assert.equal(product.stock_qty, 155);
  assert.equal(product.is_roll, true);
  assert.equal(product.roll_count, 3);
  assert.deepEqual(batches.map((b) => Number(b.qty_remaining)), [50, 45, 60]);
});

test("12 metr sotildi → 143 metr qoldi, birinchi rulondan olindi (38 qoldi)", async () => {
  const s = await sell([{ product_id: id, quantity: 12, unit_id: metr }]);
  assert.equal(s.status, 201, JSON.stringify(s.body));
  assert.equal(s.body.sale.total, 144000);
  const { product, batches } = await prod();
  assert.equal(product.stock_qty, 143);
  assert.deepEqual(batches.map((b) => Number(b.qty_remaining)), [38, 45, 60]);
  assert.equal(product.roll_count, 3);
});

test("butun rulon: 60 metrli rulon tanlab sotiladi → aynan shu rulon tugaydi", async () => {
  const { batches } = await prod();
  const roll60 = batches.find((b) => Number(b.qty_remaining) === 60);
  const s = await sell([{ product_id: id, quantity: 60, unit_id: metr, batch_id: roll60.id }]);
  assert.equal(s.status, 201, JSON.stringify(s.body));
  assert.equal(s.body.sale.total, 720000);
  const after = await prod();
  assert.equal(after.product.stock_qty, 83);
  assert.equal(after.product.roll_count, 2);
  assert.deepEqual(after.batches.map((b) => Number(b.qty_remaining)), [38, 45]);
  // tugagan rulonni qayta tanlab bo'lmaydi
  const bad = await sell([{ product_id: id, quantity: 1, unit_id: metr, batch_id: roll60.id }]);
  assert.equal(bad.status, 409);
  assert.equal((await prod()).product.stock_qty, 83, "xato sotuv qoldiqqa tegmaydi");
});

test("rulonning bir qismi: 45 metrli rulondan 3,5 metr; foyda to'g'ri", async () => {
  const { batches } = await prod();
  const roll45 = batches.find((b) => Number(b.qty_remaining) === 45);
  const s = await sell([{ product_id: id, quantity: 3.5, unit_id: metr, batch_id: roll45.id }]);
  assert.equal(s.status, 201);
  assert.equal(s.body.sale.total, 42000);
  assert.equal(s.body.sale.profit, 3.5 * 4000);
  const after = await prod();
  assert.equal(after.product.stock_qty, 79.5);
  assert.deepEqual(after.batches.map((b) => Number(b.qty_remaining)), [38, 41.5]);
});

test("yana yuk keldi: 2 rulon (50 va 40 metr) → 169,5 metr, 4 ta rulon; tarixda oldingi va yangi qoldiq", async () => {
  const pur = await owner.post('/api/purchases', {
    items: [{ product_id: id, unit_id: metr, quantity: 50, unit_price: 8500 }, { product_id: id, unit_id: metr, quantity: 40, unit_price: 8500 }],
    paid_amount: 90 * 8500,
  });
  assert.equal(pur.status, 201, JSON.stringify(pur.body));
  const { product } = await prod();
  assert.equal(product.stock_qty, 169.5);
  assert.equal(product.roll_count, 4);
  assert.equal(product.purchase_price, 8500);
  const h = (await owner.get(`/api/products/${id}/history`)).body.movements;
  const last = h[0];
  assert.equal(last.movement_type, 'purchase');
  assert.equal(Number(last.balance_before), 129.5);
  assert.equal(Number(last.balance_after), 169.5);
  assert.equal(Number(last.unit_price), 8500);
  const sale = h.find((m) => m.movement_type === 'sale');
  assert.equal(Number(sale.unit_price), 12000);
  const recent = (await owner.get('/api/purchases/recent-items')).body.items;
  assert.equal(recent[0].product_id, id);
  assert.equal(recent[0].quantity, 40);
  assert.equal(recent[0].unit_price, 8500);
});
