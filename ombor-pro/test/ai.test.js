// AI yordamchi: bepul tez savollar, sinov, tariflar, limit, ruxsatlar va platforma egasi (Claude o'rniga soxta mijoz)
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { resetDatabase, startServer, client, pool, unitIdByCode } from './helper.js';
import Anthropic from '@anthropic-ai/sdk';
import { setAiClientFactory } from '../src/services/ai.js';

let srv;
let owner;
let cashier;
let piece;
let productId;

// Soxta Claude: navbat bilan javoblar qaytaradi va so'rovlarni yozib boradi
function fake(script) {
  const calls = [];
  const make = (kind) => async (params) => {
    calls.push({ kind, params });
    const step = script[calls.length - 1];
    if (!step) throw new Error('kutilmagan so\'rov');
    return typeof step === 'function' ? step(params) : step;
  };
  return { calls, messages: { create: make('messages') }, beta: { messages: { create: make('beta') } } };
}
const toolUse = (name, input, id = 't1') => ({
  stop_reason: 'tool_use', content: [{ type: 'tool_use', id, name, input }], usage: { input_tokens: 1000, output_tokens: 40 },
});
const lastToolResult = (params) => JSON.parse(params.messages.at(-1).content[0].content);
const textAnswer = (fn) => (params) => ({
  stop_reason: 'end_turn', content: [{ type: 'text', text: fn(params) }], usage: { input_tokens: 1200, output_tokens: 60, cache_read_input_tokens: 500 },
});

before(async () => {
  await resetDatabase();
  srv = await startServer();
  owner = client(srv.base);
  await owner.post('/api/setup', { full_name: 'Egasi', username: 'owner', password: 'secret1', store_name: 'Atlas mato' });
  piece = await unitIdByCode(owner, 'piece');
  const p = await owner.post('/api/products', { name: "Ipak ro'mol", base_unit_id: piece, selling_price: 85000, purchase_price: 55000, opening_qty: 5, min_stock: 5 });
  productId = p.body.id;
  await owner.post('/api/sales', { items: [{ product_id: productId, quantity: 2 }], payment: { method: 'cash' } });
  await owner.post('/api/users', { full_name: 'Madina', username: 'madina', password: 'secret1', role: 'cashier' });
  cashier = client(srv.base);
  await cashier.post('/api/auth/login', { username: 'madina', password: 'secret1' });
  process.env.OMBOR_PLATFORM_ADMINS = 'owner';
});

after(async () => {
  setAiClientFactory(null);
  delete process.env.OMBOR_PLATFORM_ADMINS;
  await srv.close();
  await pool.end();
});

test("tez savollar bepul: AI'siz, aniq raqam, kassirga foyda ko'rsatilmaydi", async () => {
  const st = (await owner.get('/api/ai/status')).body;
  assert.equal(st.active, false);
  assert.equal(st.can_start_trial, true);
  assert.equal(st.plans.basic.price, 49000);
  assert.equal(st.plans.pro.price, 249000);
  assert.ok(st.quick.length >= 6);

  const sales = (await owner.post('/api/ai/quick', { topic: 'sales_today' })).body;
  assert.match(sales.answer, /170 000 so'm/);
  assert.match(sales.answer, /1 ta chek/);
  const profit = (await owner.post('/api/ai/quick', { topic: 'profit_today' })).body;
  assert.match(profit.answer, /\+60 000 so'm/, profit.answer);
  const low = (await owner.post('/api/ai/quick', { topic: 'low_stock' })).body;
  assert.match(low.answer, /Ipak ro'mol — 3 dona/);
  const cash = (await owner.post('/api/ai/quick', { topic: 'cash' })).body;
  assert.match(cash.answer, /170 000 so'm/);

  const cp = (await cashier.post('/api/ai/quick', { topic: 'profit_today' })).body;
  assert.match(cp.answer, /faqat do'kon egasi/);
  assert.equal((await cashier.post('/api/ai/quick', { topic: 'nimadir' })).status, 400);
});

test('tarifsiz istalgan savol — 402; sinov bir marta; kassir sinovni yoqa olmaydi', async () => {
  assert.equal((await owner.post('/api/ai/ask', { question: 'Bugun qancha sotdim?' })).status, 402);
  assert.equal((await cashier.post('/api/ai/trial', {})).status, 403);
  const t = await owner.post('/api/ai/trial', {});
  assert.equal(t.status, 200, JSON.stringify(t.body));
  assert.equal(t.body.plan, 'trial');
  assert.equal(t.body.limit, 30);
  assert.equal((await owner.post('/api/ai/trial', {})).status, 409);
  assert.equal((await owner.get('/api/ai/status')).body.can_start_trial, false);
});

test('istalgan savol: vosita chaqiriladi, javob raqam bilan, xarajat yoziladi; kalit bo\'lmasa 503', async () => {
  setAiClientFactory(() => null);
  assert.equal((await owner.post('/api/ai/ask', { question: 'Bugun qancha sotdim?' })).status, 503);

  const f = fake([
    toolUse('sales_summary', { period: 'today' }),
    textAnswer((p) => {
      const r = lastToolResult(p);
      return `Bugun **${r.savdo} so'm** sotdingiz, sof foyda ${r.sof_foyda}.`;
    }),
  ]);
  setAiClientFactory(() => f);
  const r = await owner.post('/api/ai/ask', { question: 'Bugun qancha sotdim?', history: [{ role: 'assistant', content: 'salom' }] });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.match(r.body.answer, /170000 so'm/);
  assert.match(r.body.answer, /sof foyda 60000/);
  assert.equal(r.body.used, 1);
  // Sinov — Haiku, oddiy (beta bo'lmagan) so'rov, tizim matni keshlanadi, vositalar qat'iy
  assert.equal(f.calls[0].kind, 'messages');
  assert.equal(f.calls[0].params.model, 'claude-haiku-5-5');
  assert.equal(f.calls[0].params.system[0].cache_control.type, 'ephemeral');
  assert.ok(f.calls[0].params.tools.every((t) => t.strict === true && t.input_schema.additionalProperties === false));
  assert.equal(f.calls[0].params.messages[0].role, 'user', "tarix assistant bilan boshlanmaydi");
  assert.match(f.calls[0].params.messages[0].content, /Bugun: \d{4}-\d{2}-\d{2}/);
  const { rows } = await pool.query('SELECT questions, input_tokens, output_tokens, cost_usd FROM core.ai_usage');
  assert.equal(rows[0].questions, 1);
  assert.equal(Number(rows[0].input_tokens), 2700);
  assert.ok(Number(rows[0].cost_usd) > 0);
  assert.equal((await owner.get('/api/ai/status')).body.used, 1);
});

test("kassirning AI'si olgan narx va foydani ko'rmaydi", async () => {
  const f = fake([
    toolUse('find_products', { query: 'ipak' }),
    (p) => {
      const r = lastToolResult(p);
      assert.equal(r.tovarlar[0].nomi, "Ipak ro'mol");
      assert.equal(r.tovarlar[0].qoldiq, 3);
      assert.equal(r.tovarlar[0].olgan_narxi, undefined, 'kassirga olgan narx berilmaydi');
      return toolUse('sales_summary', { period: 'today' }, 't2');
    },
    textAnswer((p) => {
      const r = lastToolResult(p);
      assert.equal(r.sof_foyda, undefined, 'kassirga foyda berilmaydi');
      assert.equal(r.savdo, 170000);
      return "3 dona qoldi.";
    }),
  ]);
  setAiClientFactory(() => f);
  const r = await cashier.post('/api/ai/ask', { question: "Ipak ro'mol qancha qoldi?" });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.answer, '3 dona qoldi.');
  // Egasida esa olgan narx bor
  const f2 = fake([toolUse('find_products', { query: 'ipak' }), textAnswer((p) => String(lastToolResult(p).tovarlar[0].olgan_narxi))]);
  setAiClientFactory(() => f2);
  assert.equal((await owner.post('/api/ai/ask', { question: 'ipak qancha turadi?' })).body.answer, '55000');
});

test('platforma egasi: tarif yoqadi (Pro — Opus va zaxira model), limit tugasa 429, o\'chirsa 402', async () => {
  assert.equal((await cashier.get('/api/platform/ai')).status, 403);
  const ov = await owner.get('/api/platform/ai');
  assert.equal(ov.status, 200);
  assert.equal(ov.body.stores.length, 1);
  const storeId = ov.body.stores[0].id;
  assert.equal(ov.body.stores[0].plan, 'trial');
  assert.equal((await owner.put(`/api/platform/ai/${storeId}`, { plan: 'gold', days: 30 })).status, 400);
  const set = await owner.put(`/api/platform/ai/${storeId}`, { plan: 'pro', days: 30 });
  assert.equal(set.status, 200, JSON.stringify(set.body));
  assert.equal(set.body.totals.pro, 1);
  assert.equal(set.body.totals.income, 249000);
  const st = (await owner.get('/api/ai/status')).body;
  assert.equal(st.plan, 'pro');
  assert.equal(st.limit, 300);
  assert.ok(st.days_left >= 29 && st.days_left <= 30);
  // Yana 30 kun — muddat uzayadi
  await owner.put(`/api/platform/ai/${storeId}`, { plan: 'pro', days: 30 });
  assert.ok((await owner.get('/api/ai/status')).body.days_left >= 59);

  const f = fake([textAnswer(() => 'Salom!')]);
  setAiClientFactory(() => f);
  assert.equal((await owner.post('/api/ai/ask', { question: 'salom' })).status, 200);
  assert.equal(f.calls[0].kind, 'beta');
  assert.equal(f.calls[0].params.model, 'claude-opus-5-5');
  assert.equal(f.calls[0].params.fallbacks, 'default');
  assert.deepEqual(f.calls[0].params.betas, ['server-side-fallback-2026-07-01']);

  await pool.query('UPDATE core.ai_usage SET questions = 300');
  assert.equal((await owner.post('/api/ai/ask', { question: 'salom' })).status, 429);
  await owner.put(`/api/platform/ai/${storeId}`, { plan: 'none' });
  assert.equal((await owner.get('/api/ai/status')).body.active, false);
  assert.equal((await owner.post('/api/ai/ask', { question: 'salom' })).status, 402);
});

test("AI ulanishini tekshirish: kalit yo'q, ishlayapti, kalit noto'g'ri, hisobda pul yo'q", async () => {
  const test = () => owner.post('/api/platform/ai/test', {});
  assert.equal((await cashier.post('/api/platform/ai/test', {})).status, 403);
  setAiClientFactory(() => null);
  let r = (await test()).body;
  assert.equal(r.ok, false);
  assert.equal(r.code, 'no_key');

  const f = fake([textAnswer(() => 'Tayyor')]);
  setAiClientFactory(() => f);
  r = (await test()).body;
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.answer, 'Tayyor');
  assert.equal(f.calls[0].params.model, 'claude-haiku-5-5');

  const thrower = (err) => ({ messages: { create: async () => { throw err; } }, beta: { messages: { create: async () => { throw err; } } } });
  setAiClientFactory(() => thrower(new Anthropic.AuthenticationError(401, { type: 'error', error: { type: 'authentication_error', message: 'invalid x-api-key' } }, 'invalid x-api-key', new Headers())));
  r = (await test()).body;
  assert.equal(r.code, 'bad_key');
  const credit = new Anthropic.BadRequestError(400, { type: 'error', error: { type: 'invalid_request_error', message: 'Your credit balance is too low to access the Anthropic API.' } }, 'Your credit balance is too low to access the Anthropic API.', new Headers());
  setAiClientFactory(() => thrower(credit));
  r = (await test()).body;
  assert.equal(r.code, 'no_credit');
  // Bozorchiga esa tushunarli xabar: AI vaqtincha ishlamayapti
  const storeId = (await owner.get('/api/platform/ai')).body.stores[0].id;
  await owner.put(`/api/platform/ai/${storeId}`, { plan: 'basic', days: 30 });
  const ask = await owner.post('/api/ai/ask', { question: 'salom' });
  assert.equal(ask.status, 503);
  assert.match(ask.body.error, /hisobini to'ldirish/);
});

test("OMBOR_PLATFORM_ADMINS bo'lmasa — birinchi do'kon egasi platforma egasi, boshqa do'kon egasi emas", async () => {
  const saved = process.env.OMBOR_PLATFORM_ADMINS;
  delete process.env.OMBOR_PLATFORM_ADMINS;
  try {
    assert.equal((await owner.get('/api/platform/ai')).status, 200);
    assert.equal((await owner.get('/api/ai/status')).body.is_platform_admin, true);
    const other = client(srv.base);
    const reg = await other.post('/api/auth/register', {
      store_name: "Ikkinchi do'kon", full_name: 'Boshqa Egasi', username: 'ikkinchi', password: 'secret1', store_types: ['grocery'], employee_count: '1', region: 'Toshkent shahri',
    });
    assert.ok([200, 201].includes(reg.status), JSON.stringify(reg.body));
    assert.equal((await other.get('/api/platform/ai')).status, 403);
    assert.equal((await other.get('/api/ai/status')).body.is_platform_admin, false);
    assert.equal((await cashier.get('/api/platform/ai')).status, 403);
  } finally {
    process.env.OMBOR_PLATFORM_ADMINS = saved;
  }
});
