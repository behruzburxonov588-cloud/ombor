// Baza manzili: nusxalashdagi xatolarni kechirish va ulanish xatolarini tushunarli qilish (parol ko'rinmaydi)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { cleanDatabaseUrl, databaseUrlProblem, databaseErrorMessage } from '../src/dburl.js';

const GOOD = 'postgresql://neondb_owner:npg_Sir123@ep-cool-sun-a1b2.eu-central-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require';
const LOCAL = process.env.OMBOR_TEST_DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/ombor_test';

test("nusxalashdagi ortiqcha so'zlar va qo'shtirnoqlar olib tashlanadi", () => {
  assert.equal(cleanDatabaseUrl(GOOD), GOOD);
  assert.equal(cleanDatabaseUrl(`  ${GOOD}\n`), GOOD);
  assert.equal(cleanDatabaseUrl(`psql '${GOOD}'`), GOOD);
  assert.equal(cleanDatabaseUrl(`DATABASE_URL="${GOOD}"`), GOOD);
  assert.equal(cleanDatabaseUrl('JWT_SECRET'), 'JWT_SECRET');
});

test("noto'g'ri manzil ulanishdan oldin aniqlanadi", () => {
  assert.equal(databaseUrlProblem(GOOD), null);
  assert.match(databaseUrlProblem(''), /ulanmagan/);
  assert.match(databaseUrlProblem('JWT_SECRET'), /postgresql:\/\/ bilan boshlanishi kerak/);
  assert.match(databaseUrlProblem('postgresql://'), /server manzili yo'q/);
});

test('ulanish xatolari tushunarli xabarga aylanadi va parolni oshkor qilmaydi', async () => {
  const wrong = new URL(LOCAL);
  wrong.password = 'mutlaqo-notogri-parol';
  const tries = [
    [wrong.toString(), /paroli noto'g'ri/],
    [LOCAL.replace(/\/[^/]+$/, '/bunday_baza_yoq'), /Bunday nomli baza yo'q/],
    ['postgres://postgres:sirli@127.0.0.1:1/x', /ulanib bo'lmadi/],
  ];
  for (const [url, re] of tries) {
    const c = new pg.Client({ connectionString: url, connectionTimeoutMillis: 5000 });
    const err = await c.connect().then(() => null, (e) => e);
    await c.end().catch(() => {});
    assert.ok(err, `${re} uchun xato kutilgan edi`);
    const text = databaseErrorMessage(err);
    assert.match(text, re);
    assert.doesNotMatch(text, /mutlaqo-notogri-parol|sirli|postgres:/);
  }
  assert.match(databaseErrorMessage({ code: 'XX000', message: 'The requested endpoint could not be found' }), /Neon loyihasi topilmadi/);
  assert.match(databaseErrorMessage({ code: 'x y', message: 'boshqa' }), /^Server xatosi\. Ma'lumotlar bazasi ulanishini tekshiring$/);
});
