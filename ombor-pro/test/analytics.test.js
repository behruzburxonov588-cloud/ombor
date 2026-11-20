// Tahlil, aqlli yordamchi, bildirishnomalar, eksport va takroriy yozuvlardan himoya
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { resetDatabase, startServer, client, pool, unitIdByCode } from './helper.js';
import { todayLocal, addDays } from '../src/util.js';
import { runCycle, resetFreshness } from '../src/services/notify.js';

let srv;
let owner;
let cashier;
let accountant;
const ids = {};
const today = todayLocal();
const near = (actual, expected, eps = 0.05) => {
  assert.ok(Math.abs(Number(actual) - expected) <= eps, `kutilgan ${expected}, olingan ${actual}`);
};

// Telegram API o'rniga mahalliy soxta server: yuborilgan xabarlarni yozib oladi
const tgMessages = [];
let tg;

before(async () => {
  tg = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      if (req.url.endsWith('/sendMessage')) tgMessages.push(JSON.parse(body));
      res.setHeader('Content-Type', 'application/json');
      if (req.url.endsWith('/getUpdates')) {
        res.end(JSON.stringify({ ok: true, result: [{ update_id: 1, message: { chat: { id: 555111, type: 'private', first_name: 'Ali' } } }] }));
      } else {
        res.end(JSON.stringify({ ok: true, result: {} }));
      }
    });
  });
  await new Promise((r) => tg.listen(0, '127.0.0.1', r));
  process.env.TELEGRAM_API_BASE = `http://127.0.0.1:${tg.address().port}`;

  await resetDatabase();
  srv = await startServer();
  owner = client(srv.base);
  await owner.post('/api/setup', { full_name: 'Egasi Aliyev', username: 'owner', password: 'secret1', store_name: 'Tahlil do\'koni' });
  await owner.post('/api/users', { full_name: 'Kassir', username: 'kassir', password: 'kassir1', role: 'cashier' });
  await owner.post('/api/users', { full_name: 'Buxgalter', username: 'bux', password: 'bux123', role: 'accountant' });
  cashier = client(srv.base);
  await cashier.login('kassir', 'kassir1');
  accountant = client(srv.base);
  await accountant.login('bux', 'bux123');

  ids.piece = await unitIdByCode(owner, 'piece');
  ids.kg = await unitIdByCode(owner, 'kg');
  ids.sup = (await owner.post('/api/suppliers', { name: 'Ulgurji' })).body.supplier.id;
  ids.choy = (await owner.post('/api/products', { name: 'Choy', base_unit_id: ids.piece, purchase_price: 10000, selling_price: 15000, min_stock: 5 })).body.id;
  ids.shakar = (await owner.post('/api/products', { name: 'Shakar', base_unit_id: ids.kg, purchase_price: 8000, selling_price: 11000, min_stock: 3 })).body.id;
  ids.moloko = (await owner.post('/api/products', { name: 'Молоко', base_unit_id: ids.piece, purchase_price: 7000, selling_price: 9000 })).body.id;
  ids.customer = (await owner.post('/api/customers', { name: 'Qarzdor Vali' })).body.customer.id;

  await owner.post('/api/purchases', {
    supplier_id: ids.sup, paid_amount: 0,
    items: [
      { product_id: ids.choy, unit_id: ids.piece, quantity: 20, unit_price: 10000 },
      { product_id: ids.shakar, unit_id: ids.kg, quantity: 10, unit_price: 8000 },
      { product_id: ids.moloko, unit_id: ids.piece, quantity: 30, unit_price: 7000 },
    ],
  });
});

after(async () => {
  await srv.close();
  await new Promise((r) => tg.close(r));
  await pool.end();
});

test('sotuvlar: chegirma, nasiya (muddati o\'tgan), qaytarish, xarajat va zarar', async () => {
  // 1) Naqd: 10 choy (150 000) - chegirma 10 000 = 140 000; tannarx 100 000
  const s1 = await owner.post('/api/sales', {
    items: [{ product_id: ids.choy, quantity: 10, discount: 10000 }], payment: { method: 'cash' },
  });
  assert.equal(s1.status, 201);
  ids.sale1 = s1.body.sale.id;
  // 2) Nasiya, muddati kecha: 4 kg shakar = 44 000; tannarx 32 000
  const s2 = await owner.post('/api/sales', {
    items: [{ product_id: ids.shakar, quantity: 4 }], payment: { method: 'credit' },
    customer_id: ids.customer, due_date: addDays(today, -1),
  });
  assert.equal(s2.status, 201);
  // 3) Kassir: 9 choy = 135 000; tannarx 90 000 (choy qoldig'i 1 ta qoladi: minimal 5 dan kam)
  const s3 = await cashier.post('/api/sales', { items: [{ product_id: ids.choy, quantity: 9 }], payment: { method: 'card' } });
  assert.equal(s3.status, 201);
  // Qaytarish: 1-savdodan 2 ta choy. Qaytarish summasi = 140 000 * 2/10 = 28 000, tannarx 20 000
  const items = (await owner.get(`/api/sales/${ids.sale1}`)).body.sale.items;
  const ret = await owner.post(`/api/sales/${ids.sale1}/return`, { items: [{ sale_item_id: items[0].id, quantity: 2 }] });
  assert.equal(ret.status, 201);
  assert.equal(ret.body.amount, 28000);
  // Xarajat 50 000 va zarar: 1 kg shakar (8 000)
  assert.equal((await owner.post('/api/expenses', { category: 'rent', amount: 50000, method: 'cash' })).status, 201);
  assert.equal((await owner.post('/api/stock/adjust', { product_id: ids.shakar, kind: 'damage', quantity: 1, note: 'Namlangan' })).status, 201);
});

test('bosh sahifa: foyda formulasi to\'g\'ri, tushum foyda bilan aralashmaydi', async () => {
  const { status, body } = await owner.get(`/api/analytics/dashboard?from=${today}&to=${today}`);
  assert.equal(status, 200);
  const c = body.pnl.current;
  assert.equal(c.gross_revenue, 150000 + 44000 + 135000);
  assert.equal(c.discounts, 10000);
  assert.equal(c.returns, 28000);
  assert.equal(c.net_revenue, 329000 - 10000 - 28000);
  assert.equal(c.cogs, 100000 + 32000 + 90000 - 20000);
  assert.equal(c.gross_profit, 291000 - 202000);
  assert.equal(c.expenses, 50000);
  assert.equal(c.losses, 8000);
  assert.equal(c.net_profit, 89000 - 50000 - 8000);
  assert.equal(c.sales_count, 3);
  assert.equal(body.kpis.revenue.value, 291000);
  assert.equal(body.kpis.net_profit.value, 31000);
  assert.equal(body.kpis.customer_debt.value, 44000);
  assert.ok(body.kpis.inventory_value.value > 0);
  assert.equal(body.chart.grain, 'hour');
  assert.equal(body.chart.current.length, 24);
  assert.equal(body.top.best[0].name, 'Choy');
  assert.equal(body.forecast.is_estimate, true);
  assert.equal(body.forecast.confidence, 'insufficient');
});

test('mijoz qarz to\'lovi yangi savdo sifatida hisoblanmaydi', async () => {
  const pay = await owner.post(`/api/customers/${ids.customer}/payments`, { amount: 4000, method: 'cash', idempotency_key: 'pay-test-1' });
  assert.equal(pay.status, 201);
  const again = await owner.post(`/api/customers/${ids.customer}/payments`, { amount: 4000, method: 'cash', idempotency_key: 'pay-test-1' });
  assert.equal(again.status, 200);
  assert.equal(again.body.duplicate, true);
  const { body } = await owner.get(`/api/analytics/pnl?from=${today}&to=${today}`);
  assert.equal(body.current.net_revenue, 291000);
  assert.equal(body.current.debt_collected, 4000);
  assert.equal(body.debts.customers, 40000);
});

test('takroriy xarajat (bir xil kalit) ikki marta yozilmaydi', async () => {
  const a = await owner.post('/api/expenses', { category: 'other', amount: 1000, method: 'cash', idempotency_key: 'exp-1' });
  const b = await owner.post('/api/expenses', { category: 'other', amount: 1000, method: 'cash', idempotency_key: 'exp-1' });
  assert.equal(a.status, 201);
  assert.equal(b.status, 200);
  assert.equal(b.body.expense.id, a.body.expense.id);
  const { rows } = await pool.query("SELECT COUNT(*)::int AS n FROM expenses WHERE idempotency_key = 'exp-1'");
  assert.equal(rows[0].n, 1);
});

test('kassir: foyda, tannarx va xarajatlarni ko\'rmaydi', async () => {
  const { status, body } = await cashier.get('/api/analytics/dashboard');
  assert.equal(status, 200);
  assert.equal(body.access.financial, false);
  assert.equal(body.kpis.net_profit, undefined);
  assert.equal(body.kpis.expenses, undefined);
  assert.equal(body.pnl, undefined);
  assert.equal(body.top, undefined);
  assert.equal(body.chart.current[0].gross_profit, undefined);
  assert.equal((await cashier.get('/api/analytics/pnl')).status, 403);
  assert.equal((await cashier.get('/api/analytics/products')).status, 403);
  const legacy = await cashier.get('/api/dashboard');
  assert.equal(legacy.body.today.net_profit, undefined);
  assert.equal(legacy.body.today.cogs, undefined);
  const brief = await cashier.get('/api/analytics/assistant');
  assert.equal(brief.status, 200);
  assert.equal(brief.body.today.net_profit, undefined);
  // Mahsulot sahifasi: kassir kirim narxi, tannarx va foydani ko'rmaydi; egasi ko'radi
  const cp = await cashier.get(`/api/products/${ids.choy}`);
  assert.equal(cp.body.product.purchase_price, undefined);
  assert.equal(cp.body.product.profit, undefined);
  assert.equal(cp.body.product.cost_hidden, true);
  assert.ok(cp.body.batches.every((b) => b.unit_cost === undefined));
  assert.equal(cp.body.product.selling_price, 15000);
  const list = await cashier.get('/api/products');
  assert.ok(list.body.products.every((p) => p.avg_cost === undefined && p.stock_value === undefined));
  const hist = await cashier.get(`/api/products/${ids.choy}/history`);
  assert.equal(hist.body.purchases.length, 0);
  assert.ok(hist.body.movements.every((m) => m.value === undefined));
  const op = await owner.get(`/api/products/${ids.choy}`);
  assert.equal(op.body.product.purchase_price, 10000);
  assert.ok(op.body.product.profit !== undefined);
});

test('mahsulotlar tahlili: TOP ro\'yxatlar, saralash, filtr va sahifalash', async () => {
  const { body } = await owner.get(`/api/analytics/products?from=${today}&to=${today}&sort=profit&dir=desc&limit=2`);
  assert.equal(body.tops.best[0].name, 'Choy');
  assert.equal(body.tops.frequent[0].receipts, 2);
  assert.equal(body.rows.length, 2);
  assert.equal(body.total, 3);
  assert.ok(body.rows[0].profit >= body.rows[1].profit);
  const choy = body.rows.find((r) => r.name === 'Choy');
  near(choy.revenue, 140000 - 28000 + 135000);
  near(choy.qty_sold, 17);
  const unsold = await owner.get(`/api/analytics/products?from=${today}&to=${today}&filter=unsold`);
  assert.deepEqual(unsold.body.rows.map((r) => r.name), ['Молоко']);
  assert.equal(unsold.body.tops.zero[0].name, 'Молоко');
});

test('ombor tahlili: kam qolgan, qayta buyurtma tavsiyasi', async () => {
  const { body } = await owner.get('/api/analytics/inventory');
  const choy = body.low.find((p) => p.name === 'Choy');
  assert.ok(choy, 'Choy kam qolganlar ro\'yxatida bo\'lishi kerak');
  assert.match(choy.recommendation, /buyurtma/i);
  assert.ok(body.restock.some((p) => p.name === 'Choy' && p.suggested_qty > 0));
  assert.equal(body.movement.length, 30);
  assert.ok(body.totals.cost_value > 0);
});

test('haftalik hisobot va prognoz', async () => {
  const w = await owner.get('/api/analytics/weekly');
  assert.equal(w.body.days.length, 7);
  assert.equal(w.body.totals.sales_count, 3);
  assert.equal(w.body.best_product.name, 'Choy');
  const f = await owner.get('/api/analytics/forecast');
  assert.equal(f.body.days.length, 7);
  assert.equal(f.body.is_estimate, true);
});

test('qarzlar: muddati o\'tgan qarz aniqlanadi', async () => {
  const { body } = await owner.get('/api/analytics/debts');
  assert.equal(body.totals.debt, 40000);
  assert.equal(body.totals.overdue, 40000);
  assert.equal(body.customers[0].status, 'overdue');
});

test('xodimlar: rahbar hammani, kassir faqat o\'zini ko\'radi', async () => {
  const all = await owner.get(`/api/analytics/staff?from=${today}&to=${today}`);
  assert.equal(all.body.scope, 'all');
  const k = all.body.staff.find((s) => s.full_name === 'Kassir');
  assert.equal(k.sales_count, 1);
  assert.equal(k.net_revenue, 135000);
  const self = await cashier.get(`/api/analytics/staff?from=${today}&to=${today}`);
  assert.equal(self.body.scope, 'self');
  assert.equal(self.body.staff.length, 1);
  assert.equal(self.body.staff[0].gross_profit, undefined);
  assert.equal((await cashier.get(`/api/analytics/staff/${k.id}/activity`)).status, 403);
  const act = await owner.get(`/api/analytics/staff/${k.id}/activity`);
  assert.ok(act.body.entries.some((e) => e.action === 'sale.create'));
});

test('yordamchi: kunlik xulosa va tavsiyalar haqiqiy ma\'lumotdan', async () => {
  const { body } = await owner.get('/api/analytics/assistant');
  assert.equal(body.today.sales_count, 3);
  assert.equal(body.today.net_profit, 31000 - 1000);
  assert.ok(body.summary[0].includes('3 ta savdo'));
  assert.ok(body.attention.some((a) => a.kind === 'low_stock'));
  assert.ok(body.attention.some((a) => a.kind === 'debt_overdue'));
  assert.ok(body.insights.some((i) => i.id === 'restock'));
});

test('bildirishnomalar: yaratiladi, takrorlanmaydi, o\'qilgan deb belgilanadi', async () => {
  resetFreshness();
  const first = await owner.get('/api/notifications');
  assert.equal(first.status, 200);
  const kinds = first.body.items.map((n) => n.kind);
  assert.ok(kinds.includes('low_stock'), 'kam qolgan mahsulot haqida xabar');
  assert.ok(kinds.includes('debt_overdue'), 'muddati o\'tgan qarz haqida xabar');
  const total = first.body.items.length;

  const forced = await owner.post('/api/notifications/check');
  assert.equal(forced.body.created, 0, 'ikkinchi tekshiruvda yangi xabar yaratilmasligi kerak');
  const second = await owner.get('/api/notifications');
  assert.equal(second.body.items.length, total);

  // Kassir xarajat/savdo pasayishi kabi moliyaviy xabarlarni ko'rmaydi, lekin qarz va qoldiqni ko'radi
  const cn = await cashier.get('/api/notifications');
  assert.ok(cn.body.items.every((n) => !['daily_summary', 'expense_spike', 'sales_decline'].includes(n.type_group)));
  assert.ok(cn.body.items.some((n) => n.kind === 'debt_overdue'));

  const unread = second.body.unread;
  assert.ok(unread > 0);
  await owner.post('/api/notifications/read', { ids: [second.body.items[0].id] });
  assert.equal((await owner.get('/api/notifications')).body.unread, unread - 1);
  await owner.post('/api/notifications/read-all');
  assert.equal((await owner.get('/api/notifications')).body.unread, 0);

  // Shaxsiy: qoldiq xabarlarini o'chirish
  await owner.put('/api/me/preferences', { notifications: { muted: ['low_stock'] } });
  const muted = await owner.get('/api/notifications');
  assert.ok(muted.body.items.every((n) => n.type_group !== 'low_stock'));
  await owner.put('/api/me/preferences', { notifications: { muted: [] } });
});

test('rejali kunlik xulosa belgilangan vaqtda bir marta yaratiladi', async () => {
  const late = new Date(`${today}T23:30:00+05:00`);
  const early = new Date(`${today}T08:00:00+05:00`);
  await pool.query("DELETE FROM notifications WHERE kind = 'daily_summary'");
  const r0 = await runCycle(pool, { now: early });
  assert.ok(!r0.created.some((n) => n.kind === 'daily_summary'), 'vaqti kelmagan');
  const r1 = await runCycle(pool, { now: late });
  const daily = r1.created.find((n) => n.kind === 'daily_summary');
  assert.ok(daily, 'kunlik xulosa yaratilishi kerak');
  assert.match(daily.body, /3 ta savdo/);
  const r2 = await runCycle(pool, { now: late });
  assert.ok(!r2.created.some((n) => n.kind === 'daily_summary'), 'takrorlanmasligi kerak');
});

test('bildirishnoma sozlamalari: token yashirin, noto\'g\'ri qiymat rad etiladi', async () => {
  const cur = await owner.get('/api/notifications/settings');
  assert.equal(cur.status, 200);
  const config = cur.body.config;
  const bad = await owner.put('/api/notifications/settings', { config: { ...config, schedule: { ...config.schedule, daily_time: '25:99' } } });
  assert.equal(bad.status, 400);
  const badToken = await owner.put('/api/notifications/settings', { config, telegram_token: 'abc' });
  assert.equal(badToken.status, 400);

  const token = '123456789:AAEhBP0av28kCzSmlL3sTbdIZfcSd7WvP1q';
  const types = { ...config.types, inventory_change: { enabled: true, channels: ['app', 'telegram'] } };
  const ok = await owner.put('/api/notifications/settings', {
    config: { ...config, types, telegram: { enabled: true, chat_ids: ['555111'] } },
    telegram_token: token,
  });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.config.telegram.token_set, true);
  assert.equal(JSON.stringify(ok.body).includes(token), false, 'token javobda bo\'lmasligi kerak');
  const settings = await owner.get('/api/settings');
  assert.equal(JSON.stringify(settings.body).includes(token), false);
  assert.equal((await cashier.get('/api/notifications/settings')).status, 403);

  const chats = await owner.post('/api/notifications/telegram/chats');
  assert.equal(chats.body.chats[0].id, '555111');
  const testMsg = await owner.post('/api/notifications/telegram/test');
  assert.equal(testMsg.body.results[0].ok, true);
  assert.equal(tgMessages.at(-1).chat_id, '555111');
});

test('Telegram: muhim ombor o\'zgarishi bir marta yuboriladi', async () => {
  const before = tgMessages.length;
  // 20 ta Молоко zarar: 140 000 so'm (chegara 500 000) — xabar bo'lmaydi; chegarani pasaytiramiz
  const cur = (await owner.get('/api/notifications/settings')).body.config;
  await owner.put('/api/notifications/settings', { config: { ...cur, thresholds: { ...cur.thresholds, inventory_change_value: 100000 } } });
  await owner.post('/api/stock/adjust', { product_id: ids.moloko, kind: 'damage', quantity: 20, note: 'Muddati o\'tgan' });
  await owner.post('/api/notifications/check');
  const sent = tgMessages.slice(before).filter((m) => m.text.includes('Молоко'));
  assert.equal(sent.length, 1);
  assert.match(sent[0].text, /zarar/);
  await owner.post('/api/notifications/check');
  assert.equal(tgMessages.slice(before).filter((m) => m.text.includes('Молоко')).length, 1, 'takroran yuborilmasligi kerak');
  const { rows } = await pool.query("SELECT status FROM notification_deliveries WHERE channel = 'telegram'");
  assert.ok(rows.every((r) => r.status === 'sent'));
});

async function download(api, path) {
  const login = await fetch(`${srv.base}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(api),
  });
  const cookie = login.headers.get('set-cookie').split(';')[0];
  const res = await fetch(`${srv.base}${path}`, { headers: { Cookie: cookie } });
  return { status: res.status, type: res.headers.get('content-type'), buf: Buffer.from(await res.arrayBuffer()) };
}

test('eksport: Excel va PDF fayllar, ruxsat tekshiriladi', async () => {
  for (const report of ['pnl', 'sales', 'products', 'inventory', 'weekly', 'debts', 'staff', 'expenses']) {
    const x = await download({ username: 'bux', password: 'bux123' }, `/api/reports/export?report=${report}&format=xlsx&from=${today}&to=${today}`);
    assert.equal(x.status, 200, `${report} xlsx`);
    assert.match(x.type, /spreadsheetml/);
    assert.equal(x.buf.subarray(0, 2).toString(), 'PK');
    const p = await download({ username: 'bux', password: 'bux123' }, `/api/reports/export?report=${report}&format=pdf&from=${today}&to=${today}`);
    assert.equal(p.status, 200, `${report} pdf`);
    assert.equal(p.buf.subarray(0, 5).toString(), '%PDF-');
    assert.ok(p.buf.includes('/FontFile2'));
  }
  const denied = await download({ username: 'kassir', password: 'kassir1' }, '/api/reports/export?report=pnl&format=xlsx');
  assert.equal(denied.status, 403);
  const bad = await download({ username: 'owner', password: 'secret1' }, '/api/reports/export?report=nope');
  assert.equal(bad.status, 400);
});

test('davr: oldingi davr bilan taqqoslash va noto\'g\'ri sana', async () => {
  const r = await owner.get(`/api/analytics/sales?from=${addDays(today, -6)}&to=${today}`);
  assert.equal(r.status, 200);
  assert.equal(r.body.days.length, 7);
  assert.equal(r.body.previous_days.length, 7);
  assert.equal(r.body.range.prevTo, addDays(today, -7));
  assert.equal(r.body.totals.net_revenue, 291000);
  assert.equal((await owner.get('/api/analytics/sales?from=2024-13-45')).status, 400);
});
