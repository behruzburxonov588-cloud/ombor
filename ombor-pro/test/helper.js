// Test yordamchilari. Testlar alohida ombor_test bazasida ishlaydi (dev bazaga tegmaydi).
const TEST_DB = process.env.OMBOR_TEST_DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/ombor_test';
if (!/ombor_test/.test(TEST_DB)) {
  throw new Error("Test bazasi nomi 'ombor_test' bo'lishi kerak");
}
process.env.DATABASE_URL = TEST_DB;
process.env.JWT_SECRET = 'test-secret-value';
process.env.UPLOAD_DIR = process.env.UPLOAD_DIR || new URL('../uploads-test', import.meta.url).pathname;

const { pool } = await import('../src/db.js');
const { migrate } = await import('../src/migrate.js');
const { createApp } = await import('../src/app.js');

export { pool };

export async function resetDatabase() {
  await pool.query('DROP SCHEMA public CASCADE');
  await pool.query('CREATE SCHEMA public');
  await migrate(() => {});
}

export async function startServer() {
  const app = createApp();
  const server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  return { base, close: () => new Promise((resolve) => server.close(resolve)) };
}

// Har bir foydalanuvchi uchun alohida sessiya (cookie)
export function client(base) {
  let cookie = '';
  async function call(method, path, body) {
    const headers = {};
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (cookie) headers.Cookie = cookie;
    const res = await fetch(base + path, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const setCookie = res.headers.get('set-cookie');
    if (setCookie) cookie = setCookie.split(';')[0];
    const text = await res.text();
    let data = text;
    try {
      data = JSON.parse(text);
    } catch {
      // matn javobi
    }
    return { status: res.status, body: data };
  }
  return {
    get: (p) => call('GET', p),
    post: (p, b = {}) => call('POST', p, b),
    put: (p, b = {}) => call('PUT', p, b),
    login: (username, password) => call('POST', '/api/auth/login', { username, password }),
  };
}

export async function unitIdByCode(api, code) {
  const { body } = await api.get('/api/units');
  const u = body.units.find((x) => x.code === code);
  if (!u) throw new Error(`Birlik topilmadi: ${code}`);
  return u.id;
}
