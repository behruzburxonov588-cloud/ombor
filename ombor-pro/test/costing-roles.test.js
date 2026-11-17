// O'rtacha tannarx (WAVG) rejimi va buxgalter/ombor rollari
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
  await owner.post('/api/setup', { full_name: 'Egasi', username: 'owner', password: 'secret1', store_name: 'Non do\'koni' });
  await owner.post('/api/users', { full_name: 'Buxgalter', username: 'buxgalter', password: 'buxg123', role: 'accountant' });
  await owner.post('/api/users', { full_name: 'Ombor', username: 'ombor', password: 'ombor12', role: 'warehouse' });
  ids.piece = await unitIdByCode(owner, 'piece');
  const p = await owner.post('/api/products', { name: 'Non', base_unit_id: ids.piece, selling_price: 500 });
  ids.non = p.body.id;
});

after(async () => {
  await srv.close();
  await pool.end();
});

test('FIFO rejimida tannarx partiya bo\'yicha olinadi', async () => {
  const sup = await owner.post('/api/suppliers', { name: 'Non zavodi' });
  ids.sup = sup.body.supplier.id;
  await owner.post('/api/purchases', { supplier_id: ids.sup, items: [{ product_id: ids.non, unit_id: ids.piece, quantity: 10, unit_price: 100 }] });
  await owner.post('/api/purchases', { supplier_id: ids.sup, items: [{ product_id: ids.non, unit_id: ids.piece, quantity: 10, unit_price: 200 }] });

  const detail = await owner.get(`/api/products/${ids.non}`);
  assert.equal(detail.body.product.avg_cost, 150);

  const sale = await owner.post('/api/sales', { items: [{ product_id: ids.non, unit_id: ids.piece, quantity: 5 }], payment: { method: 'cash' } });
  assert.equal(sale.body.sale.cost_total, 500, 'FIFO: birinchi partiya narxi');
});

test('O\'rtacha tannarx (WAVG) rejimiga o\'tkazish faqat egasi uchun', async () => {
  const warehouse = client(srv.base);
  await warehouse.login('ombor', 'ombor12');
  const denied = await warehouse.put('/api/settings', { costing_method: 'WAVG' });
  assert.equal(denied.status, 403);

  const bad = await owner.put('/api/settings', { costing_method: 'LIFO' });
  assert.equal(bad.status, 400);

  const ok = await owner.put('/api/settings', { costing_method: 'WAVG' });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.settings.costing_method, 'WAVG');
});

test('WAVG: sotuv tannarxi o\'rtacha narx bilan hisoblanadi (5 * 150 = 750)', async () => {
  const sale = await owner.post('/api/sales', { items: [{ product_id: ids.non, unit_id: ids.piece, quantity: 5 }], payment: { method: 'cash' } });
  assert.equal(sale.status, 201);
  assert.equal(sale.body.sale.cost_total, 750);

  const overview = await owner.get('/api/stock/overview');
  assert.equal(overview.body.costing_method, 'WAVG');
  // Qoldiq: 10 dona, o'rtacha 150 -> 1500
  assert.equal(overview.body.totals.inventory_value, 1500);
});

test('buxgalter hisobotlarni ko\'radi, lekin savdo qila olmaydi', async () => {
  const acc = client(srv.base);
  await acc.login('buxgalter', 'buxg123');
  assert.equal((await acc.get('/api/reports/summary')).status, 200);
  assert.equal((await acc.get('/api/history')).status, 200);
  const sale = await acc.post('/api/sales', { items: [{ product_id: ids.non, unit_id: ids.piece, quantity: 1 }], payment: { method: 'cash' } });
  assert.equal(sale.status, 403);
  const hidden = await acc.get('/api/users');
  assert.equal(hidden.status, 403);
});

test('ruxsatlar: egasi alohida ruxsat bersa, xodim unga ega bo\'ladi', async () => {
  const list = await owner.get('/api/users');
  const acc = list.body.users.find((u) => u.username === 'buxgalter');
  const upd = await owner.put(`/api/users/${acc.id}`, { overrides: { 'sales.create': true } });
  assert.equal(upd.status, 200);
  assert.equal(upd.body.user.permissions['sales.create'], true);

  const acc2 = client(srv.base);
  await acc2.login('buxgalter', 'buxg123');
  const sale = await acc2.post('/api/sales', { items: [{ product_id: ids.non, unit_id: ids.piece, quantity: 1 }], payment: { method: 'cash' } });
  assert.equal(sale.status, 201);
});

test('kassa: naqd kirim-chiqim sababsiz bajarilmaydi', async () => {
  const noNote = await owner.post('/api/cash/movements', { kind: 'deposit', amount: 1000, method: 'cash' });
  assert.equal(noNote.status, 400);
  const dep = await owner.post('/api/cash/movements', { kind: 'deposit', amount: 1000, method: 'cash', note: 'Boshlang\'ich qoldiq' });
  assert.equal(dep.status, 201);
});

test('CSRF: JSON bo\'lmagan so\'rovlar API da rad etiladi', async () => {
  const res = await fetch(`${srv.base}/api/products`, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: '{"name":"x"}',
  });
  assert.equal(res.status, 415);
});
