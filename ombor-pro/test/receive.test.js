// «Yuk keldi»: yetkazib beruvchi ixtiyoriy (to'liq to'langan kirim «Noma'lum» nomiga yoziladi),
// qarzga olinganda esa kimdan kelgani majburiy. Ro'yxatda qadoq (pack) qaytariladi.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { resetDatabase, startServer, client, pool, unitIdByCode } from './helper.js';
import { todayLocal, addDays } from '../src/util.js';

let srv;
let owner;
const ids = {};

before(async () => {
  await resetDatabase();
  srv = await startServer();
  owner = client(srv.base);
  await owner.post('/api/setup', { full_name: 'Egasi', username: 'owner', password: 'secret1', store_name: "Do'kon" });
  const piece = await unitIdByCode(owner, 'piece');
  const units = (await owner.get('/api/units')).body.units;
  const box = units.find((u) => u.code === 'box') || units.find((u) => u.id !== piece);
  ids.box = box.id;
  ids.p = (await owner.post('/api/products', {
    name: 'Pepsi 0,5', base_unit_id: piece, selling_price: 6000, purchase_price: 5000, opening_qty: 13,
    conversions: [{ unit_id: box.id, factor: 12 }],
  })).body.id;
});

after(async () => {
  await srv.close();
  await pool.end();
});

test("ro'yxatda qadoq va qoldiq bor", async () => {
  const r = await owner.get('/api/products');
  assert.equal(r.status, 200);
  const p = r.body.products.find((x) => x.id === ids.p);
  assert.equal(p.stock_qty, 13);
  assert.deepEqual(p.pack, { unit_id: ids.box, name: p.pack.name, factor: 12 });
  assert.equal(p.conversions.length, 1);
  assert.equal(p.conversions[0].factor, 12);
});

test("kimdan kelgani ko'rsatilmasa, to'liq to'langan yuk saqlanadi", async () => {
  const r = await owner.post('/api/purchases', {
    items: [{ product_id: ids.p, unit_id: ids.box, quantity: 2, unit_price: 60000 }],
    paid_amount: 120000, payment_method: 'cash', idempotency_key: 'rcv-1',
  });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.equal(r.body.purchase.supplier_name, "Noma'lum");
  const p = (await owner.get(`/api/products/${ids.p}`)).body.product;
  assert.equal(p.stock_qty, 37, '13 + 2 quti × 12 = 37');

  // Ikkinchi marta ham o'sha «Noma'lum» ishlatiladi (yangisi yaratilmaydi)
  const r2 = await owner.post('/api/purchases', {
    supplier_id: null,
    items: [{ product_id: ids.p, quantity: 3, unit_price: 5000 }],
    paid_amount: 15000,
  });
  assert.equal(r2.status, 201, JSON.stringify(r2.body));
  assert.equal(r2.body.purchase.supplier_id, r.body.purchase.supplier_id);
  const sups = (await owner.get('/api/suppliers')).body.suppliers.filter((s) => s.name === "Noma'lum");
  assert.equal(sups.length, 1);
});

test("qarzga olinsa, kimdan kelgani so'raladi", async () => {
  const r = await owner.post('/api/purchases', {
    items: [{ product_id: ids.p, quantity: 5, unit_price: 5000 }],
    paid_amount: 10000,
  });
  assert.equal(r.status, 400);
  assert.match(r.body.error, /kimdan kelganini/);
  const p = (await owner.get(`/api/products/${ids.p}`)).body.product;
  assert.equal(p.stock_qty, 40, "xato bo'lsa qoldiq o'zgarmaydi");

  const sup = (await owner.post('/api/suppliers', { name: 'Ulgurji' })).body.supplier.id;
  const ok = await owner.post('/api/purchases', {
    supplier_id: sup,
    items: [{ product_id: ids.p, quantity: 5, unit_price: 5000 }],
    paid_amount: 0,
  });
  assert.equal(ok.status, 201);
  assert.equal(Number(ok.body.purchase.remaining_debt), 25000);
});

test("qarzga olingan yuk: to'lov muddati saqlanadi, yetkazib beruvchi ro'yxatida va eslatmada ko'rinadi", async () => {
  const sup = (await owner.post('/api/suppliers', { name: 'Muddatli' })).body.supplier.id;
  const today = todayLocal();
  // 1) Muddati o'tgan qarz (qo'lda yozilgan) va 2) muddati ertaga bo'lgan kirim
  const old = await owner.post(`/api/suppliers/${sup}/debts`, { amount: 40000, date: addDays(today, -10), due_date: addDays(today, -2) });
  assert.equal(old.status, 201);
  const soon = await owner.post('/api/purchases', {
    supplier_id: sup, due_date: addDays(today, 1),
    items: [{ product_id: ids.p, quantity: 2, unit_price: 5000 }], paid_amount: 0,
  });
  assert.equal(soon.status, 201, JSON.stringify(soon.body));
  assert.equal(soon.body.purchase.due_date.slice(0, 10), addDays(today, 1));
  // Muddat kirim sanasidan oldin bo'lolmaydi
  const bad = await owner.post('/api/purchases', {
    supplier_id: sup, due_date: addDays(today, -1), items: [{ product_id: ids.p, quantity: 1, unit_price: 5000 }], paid_amount: 0,
  });
  assert.equal(bad.status, 400);
  // To'liq to'langan kirimda muddat saqlanmaydi
  const paid = await owner.post('/api/purchases', {
    supplier_id: sup, due_date: addDays(today, 5), items: [{ product_id: ids.p, quantity: 1, unit_price: 5000 }], paid_amount: 5000,
  });
  assert.equal(paid.body.purchase.due_date, null);

  const row = (await owner.get('/api/suppliers')).body.suppliers.find((s) => s.id === sup);
  assert.equal(Number(row.debt), 50000);
  assert.equal(Number(row.overdue), 40000);
  assert.equal(row.next_due.slice(0, 10), addDays(today, -2));

  const r = await owner.post('/api/notifications/check', {});
  assert.equal(r.status, 200);
  const list = (await owner.get('/api/notifications?limit=50')).body.items;
  const overdue = list.find((n) => n.kind === 'supplier_overdue');
  const due = list.find((n) => n.kind === 'supplier_due');
  assert.ok(overdue, "muddati o'tgan to'lov eslatmasi bor");
  assert.match(overdue.title, /40 000/);
  assert.ok(due, "muddati yaqin to'lov eslatmasi bor");
  // Takroriy tekshiruv — yangi eslatma yaratmaydi
  await owner.post('/api/notifications/check', {});
  const again = (await owner.get('/api/notifications?limit=50')).body.items.filter((n) => n.kind.startsWith('supplier_'));
  assert.equal(again.length, 2);
});

test('artikul (SKU): saqlanadi, qidiruvda topiladi, takrorlanmaydi, tahrirda saqlanib qoladi', async () => {
  const piece = await unitIdByCode(owner, 'piece');
  const a = await owner.post('/api/products', { name: 'Sovun', base_unit_id: piece, selling_price: 5000, sku: 'SV-01' });
  assert.equal(a.status, 201);
  const dup = await owner.post('/api/products', { name: 'Sovun 2', base_unit_id: piece, selling_price: 5000, sku: 'sv-01' });
  assert.equal(dup.status, 409);
  assert.match(dup.body.error, /artikul/);
  const found = (await owner.get('/api/products?q=SV-01')).body.products;
  assert.equal(found.length, 1);
  assert.equal(found[0].sku, 'SV-01');
  // Tahrir: sku yuborilmasa — o'zgarmaydi; bo'sh yuborilsa — o'chadi
  const upd = await owner.put(`/api/products/${a.body.id}`, { name: 'Sovun', base_unit_id: piece, selling_price: 5500 });
  assert.equal(upd.status, 200);
  assert.equal((await owner.get(`/api/products/${a.body.id}`)).body.product.sku, 'SV-01');
  await owner.put(`/api/products/${a.body.id}`, { name: 'Sovun', base_unit_id: piece, selling_price: 5500, sku: '' });
  assert.equal((await owner.get(`/api/products/${a.body.id}`)).body.product.sku, null);
});
