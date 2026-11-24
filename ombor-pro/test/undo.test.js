// «Tovar kiritish» → «Bekor qilish»: xato kiritilgan yuk butunlay qaytadi (qoldiq, narx, to'lov, kassa),
// lekin undan keyin sotilgan yoki to'langan bo'lsa — bekor qilinmaydi.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { resetDatabase, startServer, client, pool, unitIdByCode } from './helper.js';

let srv;
let owner;
let cashier;
const ids = {};

const product = async (id) => (await owner.get(`/api/products/${id}`)).body.product;
const cashBalance = async () => (await pool.query("SELECT COALESCE(SUM(CASE WHEN direction = 'in' THEN amount ELSE -amount END), 0)::float AS b FROM cash_transactions WHERE method = 'cash'")).rows[0].b;

before(async () => {
  await resetDatabase();
  srv = await startServer();
  owner = client(srv.base);
  await owner.post('/api/setup', { full_name: 'Egasi', username: 'owner', password: 'secret1', store_name: "Do'kon" });
  ids.piece = await unitIdByCode(owner, 'piece');
  ids.p = (await owner.post('/api/products', {
    name: 'Cola 1 L', base_unit_id: ids.piece, selling_price: 9000, purchase_price: 7000, opening_qty: 10,
  })).body.id;
  ids.sup = (await owner.post('/api/suppliers', { name: 'Anvar opt' })).body.supplier.id;
  await owner.post('/api/users', { full_name: 'Omborchi', username: 'ombor1', password: 'secret1', role: 'warehouse' });
  cashier = client(srv.base);
  await cashier.post('/api/auth/login', { username: 'ombor1', password: 'secret1' });
});

after(async () => {
  await srv.close();
  await pool.end();
});

test("to'langan kiritish bekor qilinsa, qoldiq, narx va kassa qaytadi", async () => {
  const cash0 = await cashBalance();
  const r = await owner.post('/api/purchases', {
    items: [{ product_id: ids.p, quantity: 24, unit_price: 7200 }], paid_amount: 172800, payment_method: 'cash',
  });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  let p = await product(ids.p);
  assert.equal(p.stock_qty, 34);
  assert.equal(Number(p.purchase_price), 7200);
  assert.equal(await cashBalance(), cash0 - 172800);

  const u = await owner.post(`/api/purchases/${r.body.purchase.id}/undo`, {});
  assert.equal(u.status, 200, JSON.stringify(u.body));
  assert.equal(u.body.products[0].stock_qty, 10);
  p = await product(ids.p);
  assert.equal(p.stock_qty, 10);
  assert.equal(Number(p.purchase_price), 7000, "xarid narxi oldingisiga qaytadi");
  assert.equal(Number(p.avg_cost), 7000);
  assert.equal(await cashBalance(), cash0);
  assert.equal((await owner.get(`/api/purchases/${r.body.purchase.id}`)).status, 404);
  const moves = await pool.query("SELECT COUNT(*)::int AS n FROM stock_movements WHERE reference_type = 'purchase' AND reference_id = $1", [r.body.purchase.id]);
  assert.equal(moves.rows[0].n, 0);
  const log = await pool.query("SELECT 1 FROM audit_log WHERE action = 'purchase.undo'");
  assert.equal(log.rows.length, 1, 'amallar tarixida qoladi');
});

test('qarzga olingan kiritish bekor qilinsa, yetkazib beruvchi qarzi ham yo\'qoladi', async () => {
  const r = await owner.post('/api/purchases', {
    supplier_id: ids.sup, items: [{ product_id: ids.p, quantity: 5, unit_price: 7000 }], paid_amount: 0,
  });
  assert.equal(r.status, 201);
  const debt = async () => (await pool.query('SELECT COALESCE(SUM(remaining_debt), 0)::float AS d FROM purchases WHERE supplier_id = $1', [ids.sup])).rows[0].d;
  assert.equal(await debt(), 35000);
  const u = await owner.post(`/api/purchases/${r.body.purchase.id}/undo`, {});
  assert.equal(u.status, 200, JSON.stringify(u.body));
  assert.equal(await debt(), 0);
  assert.equal((await product(ids.p)).stock_qty, 10);
});

test("keyin sotilgan bo'lsa, bekor qilinmaydi", async () => {
  const r = await owner.post('/api/purchases', {
    items: [{ product_id: ids.p, quantity: 6, unit_price: 7000 }], paid_amount: 42000, payment_method: 'cash',
  });
  assert.equal(r.status, 201);
  const s = await owner.post('/api/sales', { items: [{ product_id: ids.p, quantity: 1 }], payment: { method: 'cash' } });
  assert.equal(s.status, 201, JSON.stringify(s.body));
  const u = await owner.post(`/api/purchases/${r.body.purchase.id}/undo`, {});
  assert.equal(u.status, 409);
  assert.match(u.body.error, /sotilgan/);
  assert.equal((await product(ids.p)).stock_qty, 15, "qoldiq o'zgarmaydi");
});

test("keyin to'lov qilingan bo'lsa, bekor qilinmaydi", async () => {
  const p2 = (await owner.post('/api/products', { name: 'Fanta 1 L', base_unit_id: ids.piece, selling_price: 9000 })).body.id;
  const r = await owner.post('/api/purchases', {
    supplier_id: ids.sup, items: [{ product_id: p2, quantity: 4, unit_price: 7000 }], paid_amount: 0,
  });
  assert.equal(r.status, 201);
  const pay = await owner.post(`/api/suppliers/${ids.sup}/payments`, { amount: 10000, method: 'cash' });
  assert.ok([200, 201].includes(pay.status), JSON.stringify(pay.body));
  const u = await owner.post(`/api/purchases/${r.body.purchase.id}/undo`, {});
  assert.equal(u.status, 409);
  assert.match(u.body.error, /to'lov/);
});

test("boshqa xodim kiritganini omborchi bekor qila olmaydi; egasi esa qila oladi", async () => {
  const r = await owner.post('/api/purchases', {
    items: [{ product_id: ids.p, quantity: 2, unit_price: 7000 }], paid_amount: 14000, payment_method: 'cash',
  });
  const c = await cashier.post(`/api/purchases/${r.body.purchase.id}/undo`, {});
  assert.ok([403].includes(c.status), `omborchi: ${c.status}`);
  const u = await owner.post(`/api/purchases/${r.body.purchase.id}/undo`, {});
  assert.equal(u.status, 200, JSON.stringify(u.body));
});
