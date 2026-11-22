// Foyda to'g'ri chiqishi: kelish narxi keyin yozilsa yoki xato yozilgan bo'lsa — tannarx qayta hisoblanadi
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
  await owner.post('/api/setup', { full_name: 'Egasi', username: 'owner', password: 'secret1', store_name: 'Foyda' });
  piece = await unitIdByCode(owner, 'piece');
});

after(async () => {
  await srv.close();
  await pool.end();
});

const today = async () => (await owner.get('/api/analytics/daily?days=2')).body.days[1];
const sell = (id, quantity) => owner.post('/api/sales', { items: [{ product_id: id, quantity }], payment: { method: 'cash' } });

test("kelish narxisiz qo'shilgan tovar: narx yozilgach eski sotuvlar foydasi to'g'rilanadi", async () => {
  const { id } = (await owner.post('/api/products', { name: 'Choy', base_unit_id: piece, selling_price: 10000, opening_qty: 10 })).body;
  assert.equal((await sell(id, 4)).status, 201);
  let d = await today();
  assert.equal(d.net_revenue, 40000);
  assert.equal(d.gross_profit, 40000, 'narxsiz — butun tushum foyda bo\'lib chiqadi');
  let p = (await owner.get(`/api/products/${id}`)).body;
  assert.deepEqual(p.missing_cost, { stock_qty: 6, sales: 1 });

  const r = await owner.put(`/api/products/${id}`, { name: 'Choy', base_unit_id: piece, selling_price: 10000, purchase_price: 7000, conversions: [] });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.deepEqual(r.body.recost, { batches: 1, sales: 1 });
  d = await today();
  assert.equal(d.gross_profit, 12000, '4 × (10 000 − 7 000)');
  p = (await owner.get(`/api/products/${id}`)).body;
  assert.deepEqual(p.missing_cost, { stock_qty: 0, sales: 0 });
  assert.equal(p.product.avg_cost, 7000);
  assert.equal(p.batches[0].unit_cost, 7000);
  // keyingi sotuv yangi narx bilan
  await sell(id, 1);
  d = await today();
  assert.equal(d.gross_profit, 15000);
});

test("qaytarilgan tovar tannarxi ham qayta hisoblanadi", async () => {
  const { id } = (await owner.post('/api/products', { name: 'Sut', base_unit_id: piece, selling_price: 12000, opening_qty: 5 })).body;
  const sale = (await sell(id, 2)).body.sale;
  const ret = await owner.post(`/api/sales/${sale.id}/return`, { items: [{ sale_item_id: sale.items[0].id, quantity: 1 }], refund_method: 'cash' });
  assert.equal(ret.status, 201, JSON.stringify(ret.body));
  const before = await today();
  await owner.put(`/api/products/${id}`, { name: 'Sut', base_unit_id: piece, selling_price: 12000, purchase_price: 9000, conversions: [] });
  const after = await today();
  // Sut: 2 sotildi, 1 qaytdi → sof 1 dona: tushum 12 000, tannarx 9 000 → foyda 3 000 (oldin 12 000 edi)
  assert.equal(Math.round(before.gross_profit - after.gross_profit), 9000);
});

test("narx xato yozilgan kirim: «hammasini to'g'irlash» bilan foyda to'g'rilanadi, kirim hujjati o'zgarmaydi", async () => {
  const { id } = (await owner.post('/api/products', { name: 'Un', base_unit_id: piece, selling_price: 9000, purchase_price: 7000 })).body;
  // «7.000» o'rniga 7 so'm bo'lib kirib qolgan yuk
  const pur = await owner.post('/api/purchases', { items: [{ product_id: id, quantity: 10, unit_price: 7 }], paid_amount: 70 });
  assert.equal(pur.status, 201, JSON.stringify(pur.body));
  let p = (await owner.get(`/api/products/${id}`)).body.product;
  assert.equal(p.purchase_price, 7, "kelish narxi oxirgi yukdan olinadi");
  const before = await today();
  await sell(id, 3);
  const mid = await today();
  assert.equal(Math.round(mid.gross_profit - before.gross_profit), 3 * (9000 - 7));
  const fix = await owner.post(`/api/products/${id}/recost`, { purchase_price: 7000, mode: 'all' });
  assert.equal(fix.status, 200, JSON.stringify(fix.body));
  assert.equal(fix.body.sales, 1);
  const after = await today();
  assert.equal(Math.round(after.gross_profit - before.gross_profit), 3 * 2000);
  p = (await owner.get(`/api/products/${id}`)).body.product;
  assert.equal(p.purchase_price, 7000);
  const doc = (await owner.get(`/api/purchases/${pur.body.id ?? pur.body.purchase?.id}`)).body;
  assert.equal(Number((doc.purchase || doc).total), 70, "kirim hujjati (qarz) o'zgarmaydi");
});

test("tahrirlashda narx o'zgarmasa boshlang'ich qoldiq tannarxi tegilmaydi; bosh sahifa ogohlantiradi", async () => {
  const { id } = (await owner.post('/api/products', { name: 'Tuz', base_unit_id: piece, selling_price: 3000, purchase_price: 2000, opening_qty: 5 })).body;
  await owner.post('/api/purchases', { items: [{ product_id: id, quantity: 5, unit_price: 2500 }], paid_amount: 12500 });
  const p1 = (await owner.get(`/api/products/${id}`)).body;
  assert.equal(p1.product.purchase_price, 2500);
  await owner.put(`/api/products/${id}`, { name: 'Tuz yodlangan', base_unit_id: piece, selling_price: 3000, purchase_price: 2500, conversions: [] });
  const p2 = (await owner.get(`/api/products/${id}`)).body;
  assert.deepEqual(p2.batches.map((b) => b.unit_cost).sort(), [2000, 2500]);
  const { id: g } = (await owner.post('/api/products', { name: 'Gugurt', base_unit_id: piece, selling_price: 1000, opening_qty: 3 })).body;
  await sell(g, 1);
  const t = new Date(Date.now() + 5 * 3600e3).toISOString().slice(0, 10);
  const dash = (await owner.get(`/api/analytics/dashboard?from=${t}&to=${t}`)).body;
  assert.equal(dash.cost_missing.products, 1);
  assert.equal(dash.cost_missing.revenue, 1000);
  const list = (await owner.get('/api/products?cost=missing')).body.products.map((x) => x.name);
  assert.deepEqual(list, ['Gugurt']);
});

test("xarajat (obed, suv) savdo pulidan ayiriladi: savdodan qolgan pul va tovardan foyda alohida", async () => {
  const t = new Date(Date.now() + 5 * 3600e3).toISOString().slice(0, 10);
  const before = (await owner.get(`/api/analytics/dashboard?from=${t}&to=${t}`)).body.kpis;
  const { id } = (await owner.post('/api/products', { name: 'Non', base_unit_id: piece, selling_price: 10000, purchase_price: 5000, opening_qty: 20 })).body;
  await sell(id, 10); // savdo 100 000, tovardan foyda 50 000
  for (const [category, amount] of [['food', 30000], ['household', 5000]]) {
    const r = await owner.post('/api/expenses', { category, amount, method: 'cash', expense_date: t, description: category === 'food' ? 'Obed' : 'Suv' });
    assert.equal(r.status, 201, JSON.stringify(r.body));
  }
  const k = (await owner.get(`/api/analytics/dashboard?from=${t}&to=${t}`)).body.kpis;
  const d = (key) => Math.round(k[key].value - before[key].value);
  assert.equal(d('revenue'), 100000);
  assert.equal(d('expenses'), 35000);
  assert.equal(d('sales_left'), 65000, 'savdo − xarajat');
  assert.equal(d('gross_profit'), 50000, 'tovardan foyda xarajatga bog\'liq emas');
  assert.equal(d('net_profit'), 15000, 'sof foyda = tovardan foyda − xarajat');
  const cats = (await owner.get('/api/expenses?limit=5')).body;
  assert.ok((cats.categories || []).includes('food') && cats.categories.includes('household'));
});
