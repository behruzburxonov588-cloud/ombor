// Oddiy bosh sahifa: omborda nima bor, nima keldi, nima ketdi, pul (foyda yoki zarar)
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { resetDatabase, startServer, client, pool, unitIdByCode } from './helper.js';
import { todayLocal, addDays } from '../src/util.js';

let srv;
let owner;
let cashier;
const ids = {};
const today = todayLocal();
const q = `from=${addDays(today, -6)}&to=${today}`;

before(async () => {
  await resetDatabase();
  srv = await startServer();
  owner = client(srv.base);
  await owner.post('/api/setup', { full_name: 'Egasi', username: 'owner', password: 'secret1', store_name: "Do'kon" });
  await owner.post('/api/users', { full_name: 'Kassir', username: 'kassir', password: 'kassir1', role: 'cashier' });
  cashier = client(srv.base);
  await cashier.login('kassir', 'kassir1');
  const piece = await unitIdByCode(owner, 'piece');
  const m = await unitIdByCode(owner, 'm');
  const roll = await unitIdByCode(owner, 'roll');
  ids.non = (await owner.post('/api/products', { name: 'Non', base_unit_id: piece, selling_price: 1500, purchase_price: 1000, opening_qty: 10, min_stock: 13 })).body.id;
  ids.mato = (await owner.post('/api/products', { name: 'Mato', base_unit_id: m, selling_price: 7000, purchase_price: 5000, conversions: [{ unit_id: roll, factor: 100 }] })).body.id;
  ids.sup = (await owner.post('/api/suppliers', { name: 'Ulgurji' })).body.supplier.id;
  // Yuk keldi: 5 ta non (1000) va 1 rulon mato (500 000), 300 000 to'landi
  const pur = await owner.post('/api/purchases', {
    supplier_id: ids.sup, paid_amount: 300000,
    items: [
      { product_id: ids.non, unit_id: piece, quantity: 5, unit_price: 1000 },
      { product_id: ids.mato, unit_id: roll, quantity: 1, unit_price: 500000 },
    ],
  });
  assert.equal(pur.status, 201);
  // Sotildi: 3 ta non (4 500) va 10 metr mato (70 000)
  assert.equal((await owner.post('/api/sales', { items: [{ product_id: ids.non, quantity: 3 }], payment: { method: 'cash' } })).status, 201);
  assert.equal((await owner.post('/api/sales', { items: [{ product_id: ids.mato, quantity: 10 }], payment: { method: 'cash' } })).status, 201);
});

after(async () => {
  await srv.close();
  await pool.end();
});

test("egasi: nima keldi, nima ketdi, omborda nima bor va foyda", async () => {
  const r = await owner.get(`/api/analytics/overview?${q}`);
  assert.equal(r.status, 200);
  const d = r.body;
  assert.equal(d.access.financial, true);
  // Keldi: non 10 (boshlang'ich) + 5 = 15 dona, 15 000; mato 100 metr, 500 000
  const inNon = d.moves.in.find((x) => x.id === ids.non);
  const inMato = d.moves.in.find((x) => x.id === ids.mato);
  assert.equal(inNon.qty, 15);
  assert.equal(inNon.value, 15000);
  assert.equal(inMato.qty, 100);
  assert.equal(inMato.unit, 'metr');
  assert.equal(inMato.value, 500000);
  assert.equal(d.moves.in_value, 515000);
  // Ketdi: non 3 dona (4 500), mato 10 metr (70 000)
  assert.deepEqual(d.moves.out.map((x) => [x.id, x.qty, x.amount]), [[ids.mato, 10, 70000], [ids.non, 3, 4500]]);
  assert.equal(d.moves.out_amount, 74500);
  // Pul: tushum 74 500, tovar narxi 3 000 + 50 000 = 53 000, foyda 21 500
  assert.equal(d.money.revenue, 74500);
  assert.equal(d.money.cogs, 53000);
  assert.equal(d.money.net_profit, 21500);
  assert.equal(d.money.purchases_count, 1);
  assert.equal(d.money.purchases_total, 515000 - 10000);
  assert.equal(d.money.paid_suppliers, 300000);
  // Ombor: non 12 dona (kam qolgan: minimal 13), mato 90 metr
  const sNon = d.stock.items.find((x) => x.id === ids.non);
  const sMato = d.stock.items.find((x) => x.id === ids.mato);
  assert.equal(sNon.qty, 12);
  assert.equal(sNon.status, 'low');
  assert.equal(sMato.qty, 90);
  assert.equal(d.stock.low, 1);
  assert.equal(d.stock.value, 12 * 1000 + 90 * 5000);
});

test("xarajat foydadan ko'p bo'lsa — zarar (minus)", async () => {
  assert.equal((await owner.post('/api/expenses', { category: 'rent', amount: 30000, method: 'cash' })).status, 201);
  const d = (await owner.get(`/api/analytics/overview?${q}`)).body;
  assert.equal(d.money.expenses, 30000);
  assert.equal(d.money.net_profit, -8500);
});

test("kassir: pul va kelish narxlarini ko'rmaydi, tovar harakatini ko'radi", async () => {
  const r = await cashier.get(`/api/analytics/overview?${q}`);
  assert.equal(r.status, 200);
  const d = r.body;
  assert.equal(d.access.financial, false);
  assert.equal(d.access.costs, false);
  assert.deepEqual(Object.keys(d.money).sort(), ['revenue', 'sales_count']);
  assert.ok(d.moves.in.every((x) => x.value === undefined));
  assert.equal(d.moves.in_value, null);
  assert.ok(d.stock.items.every((x) => x.value === undefined));
  assert.equal(d.stock.value, null);
  assert.equal(d.moves.out_amount, 74500);
});

test("bosh sahifa ko'rinishi sozlamada saqlanadi (oddiy / batafsil)", async () => {
  let p = (await owner.get('/api/me/preferences')).body.prefs.dashboard;
  assert.equal(p.mode, 'simple');
  assert.equal(p.simple_range, 'today', 'bosh sahifa odatda bugungi kunni ko\'rsatadi');
  p = (await owner.put('/api/me/preferences', { dashboard: { mode: 'detailed', simple_range: '30d' } })).body.prefs.dashboard;
  assert.equal(p.mode, 'detailed');
  assert.equal(p.simple_range, '30d');
  // Yangi davr tugmalari: Kecha va Shu oy
  p = (await owner.put('/api/me/preferences', { dashboard: { simple_range: 'yesterday', range: 'month' } })).body.prefs.dashboard;
  assert.equal(p.simple_range, 'yesterday');
  assert.equal(p.range, 'month');
  p = (await owner.put('/api/me/preferences', { dashboard: { simple_range: '5y' } })).body.prefs.dashboard;
  assert.equal(p.simple_range, 'yesterday', "noma'lum davr e'tiborga olinmaydi");
  p = (await owner.put('/api/me/preferences', { dashboard: { mode: 'boshqa' } })).body.prefs.dashboard;
  assert.equal(p.mode, 'detailed', "noto'g'ri qiymat e'tiborga olinmaydi");
});

test("oylik natija: joriy oy «Foyda va zarar» bilan bir xil, kassirga yopiq", async () => {
  const r = await owner.get('/api/analytics/monthly?months=3');
  assert.equal(r.status, 200);
  const ms = r.body.months;
  assert.equal(ms.length, 3);
  const cur = ms[ms.length - 1];
  assert.equal(cur.month, today.slice(0, 7));
  assert.equal(cur.partial, true);
  assert.equal(cur.to, today);
  const pnl = (await owner.get(`/api/analytics/overview?from=${cur.from}&to=${cur.to}`)).body.money;
  assert.equal(cur.revenue, pnl.revenue);
  assert.equal(cur.net_profit, pnl.net_profit);
  assert.equal(cur.sales_count, 2);
  // Oylar ketma-ket va o'sish tartibida
  assert.ok(ms[0].month < ms[1].month && ms[1].month < ms[2].month);
  assert.equal((await cashier.get('/api/analytics/monthly')).status, 403);
});
