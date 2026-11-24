// Nasiya: boshlang'ich to'lov bilan sotuv, qolgan qarz, qisman va to'liq qaytarish; qarz daftari holatlari;
// kassa faqat kelgan pulni ko'radi; ombor kamayadi; sotuvda tez tanlash ro'yxatlari.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { resetDatabase, startServer, client, pool, unitIdByCode } from './helper.js';
import { todayLocal, addDays } from '../src/util.js';

let srv;
let owner;
const ids = {};
const cashBal = async () => (await pool.query("SELECT COALESCE(SUM(CASE WHEN direction = 'in' THEN amount ELSE -amount END), 0)::float AS b FROM cash_transactions WHERE method = 'cash'")).rows[0].b;
const stock = async (id) => (await owner.get(`/api/products/${id}`)).body.product.stock_qty;

before(async () => {
  await resetDatabase();
  srv = await startServer();
  owner = client(srv.base);
  await owner.post('/api/setup', { full_name: 'Egasi', username: 'owner', password: 'secret1', store_name: "Do'kon" });
  const piece = await unitIdByCode(owner, 'piece');
  ids.p = (await owner.post('/api/products', { name: 'Choynak', base_unit_id: piece, selling_price: 100000, purchase_price: 70000, opening_qty: 10 })).body.id;
  ids.c = (await owner.post('/api/customers', { name: 'Malika', phone: '+998901112233' })).body.customer.id;
});

after(async () => {
  await srv.close();
  await pool.end();
});

test("200 000 lik nasiya, 50 000 boshlang'ich to'lov: qarz 150 000, kassaga faqat 50 000", async () => {
  const cash0 = await cashBal();
  const r = await owner.post('/api/sales', {
    items: [{ product_id: ids.p, quantity: 2 }],
    payment: { method: 'mixed', cash: 50000, credit: 150000 },
    customer_id: ids.c, due_date: addDays(todayLocal(), 10),
  });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.equal(await stock(ids.p), 8, 'nasiyaga sotilgan ham ombordan kamayadi');
  assert.equal(await cashBal(), cash0 + 50000, "kassaga faqat kelgan pul");
  const d = (await owner.get('/api/analytics/debts')).body;
  const m = d.ledger.find((x) => x.id === ids.c);
  assert.deepEqual({ taken: m.taken, paid: m.paid, remaining: m.remaining, state: m.state }, { taken: 200000, paid: 50000, remaining: 150000, state: 'partial' });
  assert.equal(d.totals.debt, 150000);
  assert.equal(d.totals.partial_customers, 1);
});

test("qisman qaytarish 100 000, keyin qolgan 50 000: holat «yopilgan», har to'lov tarixda", async () => {
  const cash0 = await cashBal();
  const p1 = await owner.post(`/api/customers/${ids.c}/payments`, { amount: 100000, method: 'cash' });
  assert.ok([200, 201].includes(p1.status), JSON.stringify(p1.body));
  let m = (await owner.get('/api/analytics/debts')).body.ledger.find((x) => x.id === ids.c);
  assert.equal(m.remaining, 50000);
  assert.equal(m.paid, 150000);
  const p2 = await owner.post(`/api/customers/${ids.c}/payments`, { amount: 50000, method: 'card' });
  assert.ok([200, 201].includes(p2.status), JSON.stringify(p2.body));
  const d = (await owner.get('/api/analytics/debts')).body;
  m = d.ledger.find((x) => x.id === ids.c);
  assert.equal(m.remaining, 0);
  assert.equal(m.state, 'paid');
  assert.equal(d.totals.closed_customers, 1);
  assert.equal(d.customers.length, 0, "qarzdorlar ro'yxatidan chiqdi");
  assert.equal(await cashBal(), cash0 + 100000, 'naqd 100 000 kassaga, karta — kartaga');
  const pays = await pool.query('SELECT COUNT(*)::int AS n FROM customer_payments WHERE customer_id = $1', [ids.c]);
  assert.equal(pays.rows[0].n, 2);
  // Ortiqcha to'lov qabul qilinmaydi
  const over = await owner.post(`/api/customers/${ids.c}/payments`, { amount: 1000, method: 'cash' });
  assert.equal(over.status, 400);
});

test("muddati o'tgan qarz «muddati kelgan»ga kiradi; foyda qarzga bog'liq emas", async () => {
  const c2 = (await owner.post('/api/customers', { name: 'Anvar' })).body.customer.id;
  const r = await owner.post('/api/sales', {
    items: [{ product_id: ids.p, quantity: 1 }], payment: { method: 'credit' }, customer_id: c2, due_date: todayLocal(),
  });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  const d = (await owner.get('/api/analytics/debts')).body;
  const a = d.ledger.find((x) => x.id === c2);
  assert.equal(a.state, 'due');
  assert.equal(d.totals.due_now, 100000);
  // Foyda: 3 ta choynak × (100 000 − 70 000) = 90 000 — to'langan-to'lanmaganidan qat'i nazar
  const h = (await owner.get(`/api/analytics/home?from=${todayLocal()}&to=${todayLocal()}`)).body;
  assert.equal(h.profit.goods, 90000);
});

test("sotuvda tez tanlash: oxirgi va ko'p sotilganlar", async () => {
  const r = await owner.get('/api/sales/quick-picks');
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.recent, [ids.p]);
  assert.deepEqual(r.body.top, [ids.p]);
});
