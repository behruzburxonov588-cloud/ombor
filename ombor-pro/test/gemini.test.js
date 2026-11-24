// Gemini yordamchi: do'kon savolida vosita orqali haqiqiy bazadan javob, umumiy savolda — vositasiz,
// suhbat tarixi, ruxsatlar (kassirga foyda yo'q), xatolar va ulanishni tekshirish. Haqiqiy API o'rniga soxta fetch.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { resetDatabase, startServer, client, pool, unitIdByCode } from './helper.js';
import { setGeminiFetch } from '../src/services/gemini.js';
import { testConnection, aiProvider } from '../src/services/ai.js';

let srv;
let owner;
let cashier;
const calls = [];

// Soxta Gemini: har bir so'rovni yozib boradi, navbatdagi javobni qaytaradi
function fakeGemini(script) {
  calls.length = 0;
  setGeminiFetch(async (url, init) => {
    const body = JSON.parse(init.body);
    calls.push({ url, headers: init.headers, body });
    const step = script[calls.length - 1];
    if (!step) throw new Error("kutilmagan so'rov");
    const r = typeof step === 'function' ? step(body) : step;
    return { ok: (r.status || 200) < 400, status: r.status || 200, json: async () => r.json };
  });
}
const call = (name, args) => ({ json: { candidates: [{ content: { role: 'model', parts: [{ functionCall: { name, args } }] }, finishReason: 'STOP' }], usageMetadata: { promptTokenCount: 900, candidatesTokenCount: 20 } } });
const text = (fn) => (body) => ({ json: { candidates: [{ content: { role: 'model', parts: [{ text: fn(body) }] }, finishReason: 'STOP' }], usageMetadata: { promptTokenCount: 1100, candidatesTokenCount: 80 } } });

before(async () => {
  process.env.GEMINI_API_KEY = 'test-gemini-key';
  process.env.OMBOR_PLATFORM_ADMINS = 'owner';
  await resetDatabase();
  srv = await startServer();
  owner = client(srv.base);
  await owner.post('/api/setup', { full_name: 'Egasi', username: 'owner', password: 'secret1', store_name: 'Atlas mato' });
  const piece = await unitIdByCode(owner, 'piece');
  const id = (await owner.post('/api/products', { name: "Ipak ro'mol", base_unit_id: piece, selling_price: 85000, purchase_price: 55000, opening_qty: 5 })).body.id;
  await owner.post('/api/sales', { items: [{ product_id: id, quantity: 2 }], payment: { method: 'cash' } });
  await owner.post('/api/users', { full_name: 'Madina', username: 'madina', password: 'secret1', role: 'cashier' });
  cashier = client(srv.base);
  await cashier.post('/api/auth/login', { username: 'madina', password: 'secret1' });
  const st = (await owner.get('/api/platform/ai')).body;
  const me = st.stores[0];
  const on = await owner.put(`/api/platform/ai/${me.id}`, { plan: 'basic', days: 30 });
  assert.ok([200, 201].includes(on.status), JSON.stringify(on.body));
});

after(async () => {
  setGeminiFetch(null);
  delete process.env.GEMINI_API_KEY;
  delete process.env.OMBOR_PLATFORM_ADMINS;
  await srv.close();
  await pool.end();
});

test('Gemini kaliti bo\'lsa — Gemini ishlaydi', () => {
  assert.equal(aiProvider(), 'gemini');
});

test("do'kon savoli: vosita chaqiriladi, javob haqiqiy bazadan", async () => {
  fakeGemini([
    call('sales_summary', { period: 'today' }),
    text((body) => {
      const fr = body.contents.at(-1).parts[0].functionResponse;
      return `Bugun **${String(fr.response.result.savdo).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} so'm** sotdingiz`;
    }),
  ]);
  const r = await owner.post('/api/ai/ask', { question: 'Bugun qancha sotdim?' });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.match(r.body.answer, /170 000 so'm/);
  // So'rov: kalit sarlavhada, tizim ko'rsatmasi va vositalar bor
  assert.equal(calls[0].headers['x-goog-api-key'], 'test-gemini-key');
  assert.match(calls[0].url, /models\/gemini-2\.5-flash:generateContent$/);
  assert.match(calls[0].body.systemInstruction.parts[0].text, /Savol turini o'zingiz aniqlang/);
  const names = calls[0].body.tools[0].functionDeclarations.map((d) => d.name);
  assert.ok(names.includes('sales_summary') && names.includes('debts') && names.includes('find_products'));
  assert.ok(!JSON.stringify(calls[0].body.tools).includes('additionalProperties'), 'Gemini sxemasiga mos');
  // Ikkinchi so'rovda modelning qismi o'zgarmay qaytgan va vosita natijasi yuborilgan
  assert.deepEqual(calls[1].body.contents.at(-2), { role: 'model', parts: [{ functionCall: { name: 'sales_summary', args: { period: 'today' } } }] });
  const usage = await pool.query('SELECT questions, input_tokens FROM core.ai_usage');
  assert.equal(usage.rows[0].questions, 1);
  assert.ok(usage.rows[0].input_tokens >= 2000);
});

test("umumiy savol (reklama matni): vositasiz, tarix bilan; o'zbek/rus/ingliz", async () => {
  fakeGemini([text(() => 'Ipak ro\'mollar — bayram uchun eng yaxshi sovg\'a!')]);
  const r = await owner.post('/api/ai/ask', {
    question: "Ro'mol uchun qisqa reklama yozib ber",
    history: [{ role: 'user', content: 'Salom' }, { role: 'assistant', content: 'Salom! Qanday yordam beray?' }],
  });
  assert.equal(r.status, 200);
  assert.match(r.body.answer, /sovg'a/);
  assert.equal(calls.length, 1, 'vosita chaqirilmadi');
  const roles = calls[0].body.contents.map((c) => c.role);
  assert.deepEqual(roles, ['user', 'model', 'user'], "tarix: assistant → model");
  assert.match(calls[0].body.systemInstruction.parts[0].text, /o'zbek, rus yoki ingliz/);
});

test("kassir so'rasa — foyda vositadan berilmaydi", async () => {
  fakeGemini([
    call('sales_summary', { period: 'today' }),
    text((body) => JSON.stringify(body.contents.at(-1).parts[0].functionResponse.response.result)),
  ]);
  const r = await cashier.post('/api/ai/ask', { question: 'Bugungi foyda qancha?' });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.ok(!/sof_foyda|olgan_narx|55000/.test(r.body.answer), r.body.answer);
});

test("xatolar oddiy tilda: kalit noto'g'ri, kvota tugagan; ulanishni tekshirish", async () => {
  fakeGemini([{ status: 400, json: { error: { code: 400, message: 'API key not valid', status: 'INVALID_ARGUMENT', details: [{ reason: 'API_KEY_INVALID' }] } } }]);
  let r = await owner.post('/api/ai/ask', { question: 'Salom' });
  assert.equal(r.status, 503);
  fakeGemini([{ status: 429, json: { error: { code: 429, message: 'Quota exceeded', status: 'RESOURCE_EXHAUSTED' } } }]);
  r = await owner.post('/api/ai/ask', { question: 'Salom' });
  assert.equal(r.status, 503);
  assert.match(r.body.error, /band/);

  fakeGemini([text(() => 'OK')]);
  const ok = await testConnection();
  assert.equal(ok.ok, true);
  assert.match(ok.model, /gemini/);
  fakeGemini([{ status: 400, json: { error: { message: 'API key not valid', details: [{ reason: 'API_KEY_INVALID' }] } } }]);
  const bad = await testConnection();
  assert.equal(bad.code, 'bad_key');
  assert.match(bad.fix, /GEMINI_API_KEY/);
});
