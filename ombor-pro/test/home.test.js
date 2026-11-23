// Oddiy bosh sahifa: /api/analytics/home — savdo, foyda, kassa va «Diqqat», ruxsatlarga qarab
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { resetDatabase, startServer, client, pool, unitIdByCode } from './helper.js';

let srv;
let owner;
let cashier;
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tashkent' }).format(new Date());
const shift = (d, k) => { const x = new Date(`${d}T00:00:00Z`); x.setUTCDate(x.getUTCDate() + k); return x.toISOString().slice(0, 10); };

before(async () => {
  await resetDatabase();
  srv = await startServer();
  owner = client(srv.base);
  await owner.post('/api/setup', { full_name: 'Egasi', username: 'owner', password: 'secret1', store_name: 'Atlas mato' });
  const piece = await unitIdByCode(owner, 'piece');
  const romol = (await owner.post('/api/products', { name: "Ipak ro'mol", base_unit_id: piece, selling_price: 85000, purchase_price: 55000, opening_qty: 5, min_stock: 5 })).body;
  await owner.post('/api/products', { name: 'Parda', base_unit_id: piece, selling_price: 35000, purchase_price: 24000, opening_qty: 0 });
  const noCost = (await owner.post('/api/products', { name: 'Shoyi', base_unit_id: piece, selling_price: 20000, opening_qty: 50 })).body;
  await owner.post('/api/sales', { items: [{ product_id: romol.id, quantity: 2 }], payment: { method: 'cash' } });
  await owner.post('/api/sales', { items: [{ product_id: noCost.id, quantity: 1 }], payment: { method: 'card' } });
  await owner.post('/api/expenses', { category: 'food', amount: 30000, method: 'cash', description: 'Obed' });
  const c = (await owner.post('/api/customers', { name: 'Malika' })).body.customer;
  await owner.post(`/api/customers/${c.id}/debts`, { amount: 350000, date: shift(today, -10), due_date: shift(today, -2) });
  await owner.post(`/api/customers/${c.id}/debts`, { amount: 100000, due_date: shift(today, 10) });
  const s = (await owner.post('/api/suppliers', { name: 'Anvar opt' })).body.supplier;
  await owner.post(`/api/suppliers/${s.id}/debts`, { amount: 2000000, due_date: shift(today, 1) });
  await owner.post(`/api/suppliers/${s.id}/debts`, { amount: 500000, due_date: shift(today, 30) });
  await owner.post('/api/users', { full_name: 'Madina', username: 'madina', password: 'secret1', role: 'cashier' });
  cashier = client(srv.base);
  await cashier.post('/api/auth/login', { username: 'madina', password: 'secret1' });
});

after(async () => {
  await srv.close();
  await pool.end();
});

test("egasi: savdo, foyda hisobi, kassa va «Diqqat» to'g'ri", async () => {
  const r = await owner.get(`/api/analytics/home?from=${today}&to=${today}`);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const h = r.body;
  assert.deepEqual(h.sales, { revenue: 190000, count: 2 });
  // 190 000 − 110 000 (olgan narx; Shoyi narxsiz → 0) − 30 000 = 50 000
  assert.equal(h.profit.cogs, 110000);
  assert.equal(h.profit.expenses, 30000);
  assert.equal(h.profit.net, 50000);
  assert.equal(h.cash.cash, 170000 - 30000);
  assert.equal(h.cash.card, 20000);
  const a = h.attention;
  assert.equal(a.out_count, 1);
  assert.equal(a.out[0].name, 'Parda');
  assert.equal(a.low_count, 1);
  assert.equal(a.low[0].qty, 3);
  assert.equal(a.overdue_count, 1, "faqat muddati o'tgan qarz");
  assert.equal(a.overdue_total, 350000);
  assert.equal(a.supplier_due_count, 1, "faqat to'lov kuni yaqinlashgani");
  assert.equal(a.supplier_due[0].debt, 2000000);
  assert.equal(a.supplier_due[0].late, false);
  assert.deepEqual(a.cost_missing, { products: 1, revenue: 20000 });

  const y = (await owner.get(`/api/analytics/home?from=${shift(today, -1)}&to=${shift(today, -1)}`)).body;
  assert.deepEqual(y.sales, { revenue: 0, count: 0 });
  assert.equal(y.profit.net, 0);
});

test("kassir: foyda, olgan narx va yetkazib beruvchi qarzi berilmaydi", async () => {
  const r = await cashier.get(`/api/analytics/home?from=${today}&to=${today}`);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.profit, null);
  assert.equal(r.body.attention.cost_missing, null);
  assert.equal(r.body.attention.supplier_due_count, 0);
  assert.equal(r.body.sales.revenue, 190000);
  assert.ok(!JSON.stringify(r.body).includes('cogs'));
  assert.equal(r.body.attention.overdue_count, 1, "kassir nasiya beradi — muddati o'tgan qarzni ko'radi");
});
