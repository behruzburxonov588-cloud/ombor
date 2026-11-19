// Yangi do'kon yo'riqnomasi: holat sonlari va "yashirish" sozlamasi
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { resetDatabase, startServer, client, pool, unitIdByCode } from './helper.js';

let srv;
let owner;
let cashier;

before(async () => {
  await resetDatabase();
  srv = await startServer();
  owner = client(srv.base);
  await owner.post('/api/setup', { full_name: 'Egasi', username: 'owner', password: 'secret1', store_name: "Do'kon" });
  await owner.post('/api/users', { full_name: 'Kassir', username: 'kassir', password: 'kassir1', role: 'cashier' });
  cashier = client(srv.base);
  await cashier.login('kassir', 'kassir1');
});

after(async () => {
  await srv.close();
  await pool.end();
});

test("yo'riqnoma holati bosqichma-bosqich o'zgaradi", async () => {
  let r = await owner.get('/api/onboarding');
  assert.equal(r.status, 200);
  assert.deepEqual(r.body, { products: 0, stocked: 0, purchases: 0, sales: 0, users: 2 });

  const piece = await unitIdByCode(owner, 'piece');
  const p = await owner.post('/api/products', { name: 'Shakar', base_unit_id: piece, selling_price: 12000, purchase_price: 10000 });
  r = await owner.get('/api/onboarding');
  assert.equal(r.body.products, 1);
  assert.equal(r.body.stocked, 0);

  await owner.post('/api/products', { name: 'Choy', base_unit_id: piece, selling_price: 25000, opening_qty: 5 });
  r = await owner.get('/api/onboarding');
  assert.equal(r.body.stocked, 1, "boshlang'ich qoldiq ham kirim deb hisoblanadi");

  await owner.post('/api/sales', { items: [{ product_id: p.body.id + 1, quantity: 1 }], payment: { method: 'cash' } });
  r = await cashier.get('/api/onboarding');
  assert.equal(r.status, 200, "kassir ham faqat sonlarni ko'radi");
  assert.equal(r.body.sales, 1);
  assert.deepEqual(Object.keys(r.body).sort(), ['products', 'purchases', 'sales', 'stocked', 'users']);
});

test("yo'riqnomani yashirish faqat shu foydalanuvchi uchun saqlanadi", async () => {
  let r = await owner.get('/api/me/preferences');
  assert.equal(r.body.prefs.dashboard.onboarding_hidden, false);
  r = await owner.put('/api/me/preferences', { dashboard: { onboarding_hidden: true } });
  assert.equal(r.body.prefs.dashboard.onboarding_hidden, true);
  assert.equal(r.body.prefs.dashboard.range, 'today', "boshqa sozlamalar o'zgarmaydi");
  r = await owner.put('/api/me/preferences', { dashboard: { onboarding_hidden: 'ha' } });
  assert.equal(r.body.prefs.dashboard.onboarding_hidden, true, "noto'g'ri qiymat e'tiborga olinmaydi");
  r = await cashier.get('/api/me/preferences');
  assert.equal(r.body.prefs.dashboard.onboarding_hidden, false);
});
