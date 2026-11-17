// Kirim, sotuv, qaytarish, qarzlar, kassa, xarajat, hisobotlar va inventarizatsiya (FIFO)
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { resetDatabase, startServer, client, pool, unitIdByCode } from './helper.js';
import { todayLocal } from '../src/util.js';

let srv;
let owner;
let cashier;
const ids = {};
const near = (actual, expected, eps = 0.05) => {
  assert.ok(Math.abs(Number(actual) - expected) <= eps, `kutilgan ${expected}, olingan ${actual}`);
};

before(async () => {
  await resetDatabase();
  srv = await startServer();
  owner = client(srv.base);
  await owner.post('/api/setup', { full_name: 'Egasi', username: 'owner', password: 'secret1', store_name: 'Do\'kon' });
  await owner.post('/api/users', { full_name: 'Kassir', username: 'kassir', password: 'kassir1', role: 'cashier' });
  cashier = client(srv.base);
  await cashier.login('kassir', 'kassir1');

  ids.kg = await unitIdByCode(owner, 'kg');
  ids.piece = await unitIdByCode(owner, 'piece');
  ids.pack = await unitIdByCode(owner, 'pack');
  ids.liter = await unitIdByCode(owner, 'l');
  ids.ml = await unitIdByCode(owner, 'ml');

  const un = await owner.post('/api/products', {
    name: 'Un', base_unit_id: ids.kg, purchase_price: 5000, selling_price: 8000, min_stock: 20,
  });
  ids.un = un.body.id;
  const daftar = await owner.post('/api/products', {
    name: "Qog'oz daftar", barcode: '4780000000011', base_unit_id: ids.piece,
    purchase_price: 1200, selling_price: 2000, min_stock: 5, conversions: [{ unit_id: ids.pack, factor: 10 }],
  });
  ids.daftar = daftar.body.id;
  const sut = await owner.post('/api/products', {
    name: 'Sut', base_unit_id: ids.liter, purchase_price: 9000, selling_price: 12000,
    conversions: [{ unit_id: ids.ml, factor: 0.001 }],
  });
  ids.sut = sut.body.id;

  const sup = await owner.post('/api/suppliers', { name: "Ta'minotchi A", phone: '+998901112233' });
  ids.supplier = sup.body.supplier.id;
  ids.c1 = (await owner.post('/api/customers', { name: 'Vali', phone: '+998935550101' })).body.customer.id;
  ids.c2 = (await owner.post('/api/customers', { name: 'Gulnora' })).body.customer.id;
});

after(async () => {
  await srv.close();
  await pool.end();
});

async function productStock(id) {
  const { body } = await owner.get(`/api/products/${id}`);
  return body.product.stock_qty;
}

test('kirim: bir nechta mahsulot, yetkazib berish va chegirma, qisman to\'lov', async () => {
  const res = await owner.post('/api/purchases', {
    supplier_id: ids.supplier,
    delivery_cost: 10000,
    discount: 5000,
    paid_amount: 300000,
    payment_method: 'cash',
    items: [
      { product_id: ids.un, unit_id: ids.kg, quantity: 100, unit_price: 5000 },
      { product_id: ids.daftar, unit_id: ids.pack, quantity: 5, unit_price: 12000 },
    ],
  });
  assert.equal(res.status, 201);
  const p = res.body.purchase;
  assert.equal(p.subtotal, 560000);
  assert.equal(p.total, 565000);
  assert.equal(p.paid_amount, 300000);
  assert.equal(p.remaining_debt, 265000);
  // 5 pachka = 50 dona (1 pachka = 10 dona)
  const daftarLine = p.items.find((i) => i.product_id === ids.daftar);
  assert.equal(daftarLine.base_quantity, 50);
  near(daftarLine.landed_total, 60535.71, 0.01);
  ids.purchase1 = p.id;

  assert.equal(await productStock(ids.un), 100);
  assert.equal(await productStock(ids.daftar), 50);
  const sup = await owner.get(`/api/suppliers/${ids.supplier}`);
  assert.equal(sup.body.debt, 265000);
});

test('kirim: ikkinchi partiya (boshqa narx) va to\'lanmagan kirim qarzga yoziladi', async () => {
  const res = await owner.post('/api/purchases', {
    supplier_id: ids.supplier,
    items: [{ product_id: ids.un, unit_id: ids.kg, quantity: 50, unit_price: 6000 }],
  });
  assert.equal(res.status, 201);
  assert.equal(res.body.purchase.remaining_debt, 300000);
  assert.equal(await productStock(ids.un), 150);
  const sup = await owner.get(`/api/suppliers/${ids.supplier}`);
  assert.equal(sup.body.debt, 565000);

  const sutBuy = await owner.post('/api/purchases', {
    supplier_id: ids.supplier,
    items: [{ product_id: ids.sut, unit_id: ids.liter, quantity: 20, unit_price: 9000 }],
  });
  assert.equal(sutBuy.status, 201);
  assert.equal(await productStock(ids.sut), 20);
});

test('kirim: noto\'g\'ri ma\'lumot rad etiladi (bo\'sh ro\'yxat, manfiy narx, katta to\'lov)', async () => {
  assert.equal((await owner.post('/api/purchases', { supplier_id: ids.supplier, items: [] })).status, 400);
  const neg = await owner.post('/api/purchases', {
    supplier_id: ids.supplier, items: [{ product_id: ids.un, unit_id: ids.kg, quantity: 1, unit_price: -5 }],
  });
  assert.equal(neg.status, 400);
  const over = await owner.post('/api/purchases', {
    supplier_id: ids.supplier, paid_amount: 999999,
    items: [{ product_id: ids.un, unit_id: ids.kg, quantity: 1, unit_price: 5 }],
  });
  assert.equal(over.status, 400);
});

test('sotuv: naqd, FIFO tannarx bilan (1-partiya + 2-partiya)', async () => {
  const res = await owner.post('/api/sales', {
    items: [{ product_id: ids.un, unit_id: ids.kg, quantity: 120 }],
    payment: { method: 'cash', cash: 960000 },
  });
  assert.equal(res.status, 201);
  const s = res.body.sale;
  assert.equal(s.total, 960000);
  assert.equal(s.paid_total, 960000);
  // 100 kg * 5044.6429 + 20 kg * 6000
  near(s.cost_total, 624464.29, 0.02);
  assert.equal(await productStock(ids.un), 30);
  ids.sale1 = s.id;
});

test('sotuv: nasiya (mijoz majburiy), qarz ro\'yxatga tushadi', async () => {
  const noCustomer = await owner.post('/api/sales', {
    items: [{ product_id: ids.daftar, unit_id: ids.pack, quantity: 2 }],
    payment: { method: 'credit' },
  });
  assert.equal(noCustomer.status, 400);

  const res = await owner.post('/api/sales', {
    customer_id: ids.c1,
    due_date: todayLocal(),
    items: [{ product_id: ids.daftar, unit_id: ids.pack, quantity: 2 }],
    payment: { method: 'credit' },
  });
  assert.equal(res.status, 201);
  assert.equal(res.body.sale.total, 40000);
  assert.equal(res.body.sale.balance_due, 40000);
  assert.equal(res.body.sale.paid_total, 0);
  near(res.body.sale.cost_total, 24214.28, 0.01);
  ids.sale2 = res.body.sale.id;
  assert.equal(await productStock(ids.daftar), 30);
});

test('sotuv: aralash to\'lov (naqd + karta + nasiya)', async () => {
  const bad = await owner.post('/api/sales', {
    customer_id: ids.c1,
    items: [{ product_id: ids.daftar, unit_id: ids.piece, quantity: 15 }],
    payment: { method: 'mixed', cash: 1000, card: 0, credit: 0 },
  });
  assert.equal(bad.status, 400);
  assert.equal(await productStock(ids.daftar), 30, 'xato sotuvda qoldiq o\'zgarmasligi kerak');

  const res = await owner.post('/api/sales', {
    customer_id: ids.c1,
    due_date: todayLocal(),
    items: [{ product_id: ids.daftar, unit_id: ids.piece, quantity: 15 }],
    payment: { method: 'mixed', cash: 10000, card: 5000, credit: 15000 },
  });
  assert.equal(res.status, 201);
  assert.equal(res.body.sale.total, 30000);
  assert.equal(res.body.sale.balance_due, 15000);
  assert.equal(res.body.sale.payment_method, 'mixed');
  ids.sale3 = res.body.sale.id;
  assert.equal(await productStock(ids.daftar), 15);

  const debt = await owner.get(`/api/customers/${ids.c1}`);
  assert.equal(debt.body.debt, 55000);
});

test('sotuv: qoldiq yetmasa sotuv rad etiladi va qoldiq o\'zgarmaydi', async () => {
  const res = await owner.post('/api/sales', {
    items: [{ product_id: ids.daftar, unit_id: ids.piece, quantity: 100 }],
    payment: { method: 'cash' },
  });
  assert.equal(res.status, 409);
  assert.match(res.body.error, /yetarli emas/);
  assert.equal(await productStock(ids.daftar), 15);
});

test('sotuv: takroriy so\'rov (idempotency kaliti) ikki marta sotuv yaratmaydi', async () => {
  const body = {
    items: [{ product_id: ids.sut, unit_id: ids.ml, quantity: 500 }],
    payment: { method: 'cash' },
    idempotency_key: 'kassa-1-abc',
  };
  const first = await owner.post('/api/sales', body);
  assert.equal(first.status, 201);
  near(first.body.sale.total, 6000, 0.001);
  near(first.body.sale.cost_total, 4500, 0.001);
  const second = await owner.post('/api/sales', body);
  assert.equal(second.status, 200);
  assert.equal(second.body.duplicate, true);
  assert.equal(second.body.sale.id, first.body.sale.id);
  near(await productStock(ids.sut), 19.5, 0.0001);
  ids.sale4 = first.body.sale.id;
});

test('sotuv: chegirma faqat ruxsatli foydalanuvchiga', async () => {
  const denied = await cashier.post('/api/sales', {
    items: [{ product_id: ids.un, unit_id: ids.kg, quantity: 10, discount: 5000 }],
    payment: { method: 'cash' },
  });
  assert.equal(denied.status, 403);

  const ok = await owner.post('/api/sales', {
    items: [{ product_id: ids.un, unit_id: ids.kg, quantity: 10, discount: 5000 }],
    payment: { method: 'cash' },
  });
  assert.equal(ok.status, 201);
  assert.equal(ok.body.sale.gross_total, 80000);
  assert.equal(ok.body.sale.discount_total, 5000);
  assert.equal(ok.body.sale.total, 75000);
  assert.equal(ok.body.sale.cost_total, 60000);
  ids.sale5 = ok.body.sale.id;
  assert.equal(await productStock(ids.un), 20);
});

test('kassir savdo qila oladi, lekin tovarni arxivlay olmaydi', async () => {
  const sale = await cashier.post('/api/sales', {
    items: [{ product_id: ids.sut, unit_id: ids.liter, quantity: 1 }],
    payment: { method: 'cash' },
  });
  assert.equal(sale.status, 201);
  ids.sale6 = sale.body.sale.id;
  const archive = await cashier.post(`/api/products/${ids.sut}/archive`);
  assert.equal(archive.status, 403);
});

test('mijoz to\'lovi eng eski qarzdan boshlab taqsimlanadi; ortiqcha to\'lov rad etiladi', async () => {
  const over = await owner.post(`/api/customers/${ids.c1}/payments`, { amount: 90000, method: 'cash' });
  assert.equal(over.status, 400);

  const res = await owner.post(`/api/customers/${ids.c1}/payments`, { amount: 20000, method: 'cash' });
  assert.equal(res.status, 201);
  assert.equal(res.body.allocations[0].sale_id, ids.sale2);
  assert.equal(res.body.remaining_debt, 35000);
  const detail = await owner.get(`/api/customers/${ids.c1}`);
  assert.equal(detail.body.debt, 35000);
  assert.equal(detail.body.payments.length, 1);
});

test('qaytarish (nasiya sotuv): qarz kamayadi, naqd pul qaytarilmaydi', async () => {
  const sale = await owner.get(`/api/sales/${ids.sale2}`);
  const item = sale.body.sale.items[0];
  const res = await owner.post(`/api/sales/${ids.sale2}/return`, {
    items: [{ sale_item_id: item.id, quantity: 1 }],
    refund_method: 'cash',
  });
  assert.equal(res.status, 201);
  assert.equal(res.body.amount, 20000);
  assert.equal(res.body.debt_reduced, 20000);
  assert.equal(res.body.refund, 0);
  assert.equal(res.body.status, 'partially_returned');
  assert.equal(await productStock(ids.daftar), 25);

  const detail = await owner.get(`/api/customers/${ids.c1}`);
  assert.equal(detail.body.debt, 15000);
});

test('qaytarish (naqd sotuv): pul qaytariladi va kassadan chiqadi', async () => {
  const sale = await owner.get(`/api/sales/${ids.sale1}`);
  const item = sale.body.sale.items[0];
  const res = await owner.post(`/api/sales/${ids.sale1}/return`, {
    items: [{ sale_item_id: item.id, quantity: 10 }],
    refund_method: 'cash',
  });
  assert.equal(res.status, 201);
  assert.equal(res.body.amount, 80000);
  assert.equal(res.body.refund, 80000);
  near(res.body.sale.items[0].returned_cost, 52038.69, 0.01);
  assert.equal(await productStock(ids.un), 30);

  const again = await owner.post(`/api/sales/${ids.sale1}/return`, {
    items: [{ sale_item_id: item.id, quantity: 200 }],
  });
  assert.equal(again.status, 400);
});

test('yetkazib beruvchiga to\'lov eng eski kirimdan boshlab taqsimlanadi', async () => {
  const over = await owner.post(`/api/suppliers/${ids.supplier}/payments`, { amount: 99999999, method: 'cash' });
  assert.equal(over.status, 400);
  const res = await owner.post(`/api/suppliers/${ids.supplier}/payments`, { amount: 100000, method: 'cash' });
  assert.equal(res.status, 201);
  assert.equal(res.body.allocations[0].purchase_id, ids.purchase1);
  // Qarz: 265000 + 300000 + 180000 (sut kirimi) - 100000 = 645000
  const sup = await owner.get(`/api/suppliers/${ids.supplier}`);
  assert.equal(sup.body.debt, 645000);
});

test('xarajat qo\'shiladi va kassadan chiqadi', async () => {
  assert.equal((await owner.post('/api/expenses', { category: 'rent', amount: 200000, method: 'cash', description: 'Oylik ijara' })).status, 201);
  assert.equal((await owner.post('/api/expenses', { category: 'delivery', amount: 30000, method: 'cash' })).status, 201);
  const bad = await owner.post('/api/expenses', { category: 'noma\'lum', amount: 1, method: 'cash' });
  assert.equal(bad.status, 400);
});

test('kassa: naqd, karta balansi va smena (ochish, yopish, farq)', async () => {
  let summary = await owner.get('/api/cash/summary');
  // Naqd kirim: 960000 + 10000 + 6000 + 75000 + 12000 (kassir) + 20000 (mijoz)
  // Naqd chiqim: 300000 (kirim) + 80000 (qaytarish) + 100000 (yetkazib beruvchi) + 200000 + 30000 (xarajat)
  assert.equal(summary.body.balances.cash, 373000);
  assert.equal(summary.body.balances.card, 5000);
  assert.equal(summary.body.balances.transfer, 0);

  const open = await owner.post('/api/cash/shifts/open', { opening_amount: 50000 });
  assert.equal(open.status, 201);
  const second = await owner.post('/api/cash/shifts/open', { opening_amount: 1 });
  assert.equal(second.status, 409);

  const sale = await owner.post('/api/sales', {
    items: [{ product_id: ids.sut, unit_id: ids.liter, quantity: 1 }],
    payment: { method: 'cash' },
  });
  assert.equal(sale.status, 201);

  const wd = await owner.post('/api/cash/movements', { kind: 'withdrawal', amount: 20000, method: 'cash', note: 'Sayfa' });
  assert.equal(wd.status, 201);

  summary = await owner.get('/api/cash/summary');
  assert.equal(summary.body.shift.expected_amount, 42000);

  const close = await owner.post('/api/cash/shifts/close', { counted_amount: 41000 });
  assert.equal(close.status, 200);
  assert.equal(close.body.expected, 42000);
  assert.equal(close.body.difference, -1000);

  summary = await owner.get('/api/cash/summary');
  assert.equal(summary.body.shift, null);
  assert.equal(summary.body.balances.cash, 365000);
});

test('bosh sahifa: bugungi savdo, foyda va qarzlar', async () => {
  const { body } = await owner.get('/api/dashboard');
  // Savdo jami: 1 135 000 - qaytarish 100 000 = sof tushum 1 035 000
  assert.equal(body.today.net_sales, 1035000);
  // Yalpi foyda: 1 035 000 - tannarx 685 193.45
  near(body.today.gross_profit, 349806.55, 0.1);
  assert.equal(body.today.expenses, 230000);
  assert.equal(body.totals.customer_debt, 15000);
  assert.equal(body.totals.supplier_debt, 645000);
  assert.equal(body.totals.cash.total, 370000);
  assert.ok(body.debt_alerts.some((d) => d.name === 'Vali'));
  assert.ok(body.recent.length > 0);
  assert.equal(body.chart.length, 14);
  assert.ok(body.totals.products >= 3);
});

test('zarar: yaroqsiz tovar va inventarizatsiya (kamomad/ortiqcha) tarixga yoziladi', async () => {
  const dmg = await owner.post('/api/stock/adjust', {
    product_id: ids.daftar, kind: 'damage', direction: 'minus', quantity: 2, note: 'Ezilgan',
  });
  assert.equal(dmg.status, 201);
  assert.equal(await productStock(ids.daftar), 23);
  // Zarar manfiy qiymat bilan yoziladi (2 dona * 1210.7142)
  near(dmg.body.value, -2421.43, 0.01);

  const noReason = await owner.post('/api/stock/adjust', {
    product_id: ids.un, kind: 'correction', direction: 'minus', quantity: 1,
  });
  assert.equal(noReason.status, 400);

  const count = await owner.post('/api/stock/counts', { note: 'Oy oxiri' });
  assert.equal(count.status, 201);
  ids.count = count.body.count.id;
  const detail = await owner.get(`/api/stock/counts/${ids.count}`);
  const counted = detail.body.items.map((i) => ({
    product_id: i.product_id,
    counted_qty: i.product_name === 'Un' ? 25 : i.product_name === 'Sut' ? 19 : i.current_qty,
  }));
  const save = await owner.put(`/api/stock/counts/${ids.count}`, { items: counted });
  assert.equal(save.status, 200);

  const approve = await owner.post(`/api/stock/counts/${ids.count}/approve`);
  assert.equal(approve.status, 200);
  near(approve.body.loss, 30000, 0.01);
  // Sut: 17.5 dan 19 gacha, o'rtacha tannarx 9000 -> 1.5 * 9000
  near(approve.body.gain, 13500, 0.01);
  assert.equal(await productStock(ids.un), 25);
  near(await productStock(ids.sut), 19, 0.0001);

  const again = await owner.post(`/api/stock/counts/${ids.count}/approve`);
  assert.equal(again.status, 400);

  const disc = await owner.get('/api/stock/discrepancies');
  assert.equal(disc.body.mismatches.length, 0, 'partiyalar qoldiqqa mos bo\'lishi kerak');
  assert.ok(disc.body.count_differences.some((d) => d.name === 'Un' && Number(d.applied_diff) === -5));
});

test('ombor holati va hisobotlar sof foydani to\'g\'ri ko\'rsatadi', async () => {
  const overview = await owner.get('/api/stock/overview');
  const un = overview.body.items.find((i) => i.name === 'Un');
  // 120 (1-savdo) + 10 (5-savdo) - 10 (qaytarilgan)
  near(un.sold, 120, 0.0001);
  assert.equal(un.current, 25);
  assert.equal(un.status, 'ok');
  assert.equal(overview.body.totals.out, 0);

  const sum = await owner.get('/api/reports/summary');
  const s = sum.body.summary;
  assert.equal(s.net_sales, 1035000);
  near(s.cogs, 685193.45, 0.1);
  // Zarar: yaroqsiz 2421.43 + kamomad 30000 - ortiqcha 13500
  near(s.losses, 18921.43, 0.1);
  near(s.net_profit, 349806.55 - 230000 - 18921.43, 0.2);
  // Tushgan pul: savdo (naqd + karta) 1 080 000 + mijoz to'lovi 20 000; nasiya kirmaydi
  assert.equal(s.cash_received, 1100000);

  const daily = await owner.get('/api/reports/sales?period=daily');
  assert.equal(daily.body.rows.length, 1);
  assert.equal(daily.body.total.net_sales, 1035000);

  const products = await owner.get('/api/reports/products');
  assert.equal(products.body.best_sellers[0].name, 'Un');
  assert.ok(products.body.slow_moving.length > 0);
});

test('tarix: amallar kim tomonidan va qachon qilinganini ko\'rsatadi; moliyaviy yozuv o\'chmaydi', async () => {
  const hist = await owner.get('/api/history');
  assert.ok(hist.body.entries.some((e) => e.action === 'sale.create' && e.user_name === 'Egasi'));
  assert.ok(hist.body.entries.some((e) => e.action === 'count.approve'));

  const movements = await owner.get(`/api/products/${ids.un}/history`);
  assert.ok(movements.body.movements.length > 3);

  await assert.rejects(
    () => pool.query('DELETE FROM sales WHERE id = $1', [ids.sale1]),
    /o'chirish yoki o'zgartirish mumkin emas/,
  );
  await assert.rejects(() => pool.query('UPDATE stock_movements SET quantity = 0'), /mumkin emas/);
});

test('qidiruv: mahsulot, mijoz va yetkazib beruvchi topiladi', async () => {
  const res = await owner.get('/api/search?q=daft');
  assert.equal(res.body.products.length, 1);
  const byPhone = await owner.get('/api/search?q=935550101');
  assert.equal(byPhone.body.customers.length, 1);
});
