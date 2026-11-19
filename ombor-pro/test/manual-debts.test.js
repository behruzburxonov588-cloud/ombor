// Qo'lda yozilgan qarz: daftardagi eski qarz savdo emas — tushum/foyda/savdolar soniga kirmaydi,
// lekin qarz, muddati o'tgan qarz va to'lov taqsimotida oddiy nasiya kabi ishlaydi
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { resetDatabase, startServer, client, pool, unitIdByCode } from './helper.js';
import { todayLocal, addDays } from '../src/util.js';

let srv;
let owner;
let cashier;
let store;
const ids = {};
const today = todayLocal();

before(async () => {
  await resetDatabase();
  srv = await startServer();
  owner = client(srv.base);
  await owner.post('/api/setup', { full_name: 'Egasi', username: 'owner', password: 'secret1', store_name: "Do'kon" });
  await owner.post('/api/users', { full_name: 'Kassir', username: 'kassir', password: 'kassir1', role: 'cashier' });
  await owner.post('/api/users', { full_name: 'Omborchi', username: 'ombor1', password: 'ombor11', role: 'warehouse' });
  cashier = client(srv.base);
  await cashier.login('kassir', 'kassir1');
  store = client(srv.base);
  await store.login('ombor1', 'ombor11');
  const piece = await unitIdByCode(owner, 'piece');
  ids.p = (await owner.post('/api/products', { name: 'Non', base_unit_id: piece, selling_price: 5000, purchase_price: 3000, opening_qty: 100 })).body.id;
  ids.c = (await owner.post('/api/customers', { name: 'Gulnora', phone: '+998901112233' })).body.customer.id;
  ids.s = (await owner.post('/api/suppliers', { name: 'Ulgurji' })).body.supplier.id;
});

after(async () => {
  await srv.close();
  await pool.end();
});

test("mijozga qo'lda qarz yozish: qarz ko'payadi, savdo hisoblanmaydi", async () => {
  // Haqiqiy nasiya savdo: 10 ta non = 50 000
  const sale = await owner.post('/api/sales', { items: [{ product_id: ids.p, quantity: 10 }], payment: { method: 'credit' }, customer_id: ids.c, due_date: addDays(today, 5) });
  assert.equal(sale.status, 201);
  const before = (await owner.get('/api/analytics/dashboard')).body;

  // Daftardagi eski qarz: 30 000, 10 kun oldin, muddati kecha o'tgan
  const r = await owner.post(`/api/customers/${ids.c}/debts`, {
    amount: 30000, date: addDays(today, -10), due_date: addDays(today, -1), note: 'Daftardan', idempotency_key: 'qarz-1',
  });
  assert.equal(r.status, 201);
  assert.equal(r.body.doc_no, 'Q-000001');
  assert.equal(r.body.debt, 80000);
  // Takroriy bosish — ikkinchi qarz yaratilmaydi
  const dup = await owner.post(`/api/customers/${ids.c}/debts`, { amount: 30000, idempotency_key: 'qarz-1' });
  assert.equal(dup.status, 200);
  assert.equal(dup.body.debt, 80000);

  const after = (await owner.get('/api/analytics/dashboard')).body;
  assert.equal(after.kpis.revenue.value, before.kpis.revenue.value, 'tushum o\'zgarmaydi');
  assert.equal(after.kpis.sales_count.value, before.kpis.sales_count.value, 'savdolar soni o\'zgarmaydi');
  assert.equal(after.kpis.net_profit.value, before.kpis.net_profit.value, 'foyda o\'zgarmaydi');
  assert.equal(after.kpis.customer_debt.value, 80000, 'mijozlar qarzi ko\'payadi');

  const from = addDays(today, -30);
  const pnl = (await owner.get(`/api/analytics/pnl?from=${from}&to=${today}`)).body;
  assert.equal(pnl.current.net_revenue, 50000);
  const hist = (await owner.get(`/api/sales?from=${from}&to=${today}`)).body.sales;
  assert.deepEqual(hist.map((s) => s.receipt_no), ['C-000001'], 'savdolar tarixida qarz yozuvi yo\'q');
  const staff = (await owner.get(`/api/analytics/staff?from=${from}&to=${today}`)).body;
  assert.equal(staff.staff.reduce((s, x) => s + x.sales_count, 0), 1);

  // Mijoz sahifasida ko'rinadi, xaridlar summasiga kirmaydi
  const cust = (await owner.get(`/api/customers/${ids.c}`)).body;
  assert.equal(cust.debt, 80000);
  assert.equal(cust.total_purchases, 50000);
  assert.ok(cust.sales.some((s) => s.kind === 'debt' && s.receipt_no === 'Q-000001' && s.note === 'Daftardan'));
  // Qarzdorlar ro'yxati va muddati o'tgan qism
  const debts = (await owner.get('/api/analytics/debts')).body;
  const g = debts.customers.find((c) => c.id === ids.c);
  assert.equal(g.debt, 80000);
  assert.equal(g.overdue, 30000);
});

test("to'lov eng eski qarzdan (daftardagi) boshlab yopiladi; qarz yozuvidan tovar qaytarib bo'lmaydi", async () => {
  const pay = await cashier.post(`/api/customers/${ids.c}/payments`, { amount: 40000, method: 'cash' });
  assert.equal(pay.status, 201);
  assert.equal(pay.body.remaining_debt, 40000);
  const cust = (await owner.get(`/api/customers/${ids.c}`)).body;
  assert.equal(cust.sales.find((s) => s.receipt_no === 'Q-000001').balance_due, 0);
  assert.equal(cust.sales.find((s) => s.receipt_no === 'C-000001').balance_due, 40000);
  const debtDoc = cust.sales.find((s) => s.receipt_no === 'Q-000001');
  const ret = await owner.post(`/api/sales/${debtDoc.id}/return`, { items: [] });
  assert.equal(ret.status, 400);
});

test("ruxsat va tekshiruvlar", async () => {
  // Kassir (mijozlarni boshqaradi) yoza oladi, omborchi yo'q
  assert.equal((await cashier.post(`/api/customers/${ids.c}/debts`, { amount: 1000 })).status, 201);
  assert.equal((await store.post(`/api/customers/${ids.c}/debts`, { amount: 1000 })).status, 403);
  assert.equal((await owner.post(`/api/customers/${ids.c}/debts`, { amount: 0 })).status, 400);
  assert.equal((await owner.post(`/api/customers/${ids.c}/debts`, { amount: 1000, date: addDays(today, 2) })).status, 400);
  assert.equal((await owner.post('/api/customers/99999/debts', { amount: 1000 })).status, 404);
});

test("yetkazib beruvchiga qarz: kirim emas, lekin to'lanadi", async () => {
  const r = await owner.post(`/api/suppliers/${ids.s}/debts`, { amount: 100000, note: 'Oldingi oydan', date: addDays(today, -20) });
  assert.equal(r.status, 201);
  assert.equal(r.body.doc_no, 'QK-000001');
  assert.equal(r.body.debt, 100000);
  const list = (await owner.get(`/api/purchases?from=${addDays(today, -30)}&to=${today}`)).body.purchases;
  assert.ok(!list.some((p) => p.purchase_no === 'QK-000001'), "kirimlar ro'yxatida yo'q");
  const sup = (await owner.get(`/api/suppliers/${ids.s}`)).body;
  assert.equal(sup.debt, 100000);
  assert.equal(sup.total_purchased, 0);
  const pay = await owner.post(`/api/suppliers/${ids.s}/payments`, { amount: 60000, method: 'cash' });
  assert.equal(pay.status, 201);
  assert.equal(pay.body.remaining_debt, 40000);
  // Ombor qiymati o'zgarmaydi (tovar kelmagan)
  const inv = (await owner.get('/api/analytics/inventory')).body;
  assert.equal(inv.totals.cost_value, 90 * 3000);
  // Zaxira nusxada yangi hisoblagichlar bor
  const backup = (await owner.get('/api/admin/backup')).body;
  assert.match(backup, /debt_seq/);
  assert.match(backup, /supplier_debt_seq/);
});
