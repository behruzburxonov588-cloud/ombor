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
const { ensureCore, resetTenantCaches, markSchemaReady } = await import('../src/tenants.js');

export { pool };

// Bazani to'liq tozalaydi: birinchi do'kon (public), qo'shimcha do'konlar (t_*) va umumiy jadvallar (core)
export async function resetDatabase() {
  const { rows } = await pool.query("SELECT nspname FROM pg_namespace WHERE nspname = 'core' OR nspname ~ '^t_[0-9]+$'");
  for (const r of rows) await pool.query(`DROP SCHEMA ${r.nspname} CASCADE`);
  await pool.query('DROP SCHEMA public CASCADE');
  await pool.query('CREATE SCHEMA public');
  resetTenantCaches();
  await migrate(() => {});
  markSchemaReady('public');
  await ensureCore();
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
    // Fayl yuborish (multipart): field — maydon nomi, file — { name, data: Buffer|string, type }
    async upload(path, field, file) {
      const form = new FormData();
      form.append(field, new Blob([file.data], { type: file.type || 'application/octet-stream' }), file.name);
      const res = await fetch(base + path, { method: 'POST', headers: cookie ? { Cookie: cookie } : {}, body: form });
      const text = await res.text();
      let data = text;
      try { data = JSON.parse(text); } catch { /* matn */ }
      return { status: res.status, body: data };
    },
    async raw(path) {
      const res = await fetch(base + path, { headers: cookie ? { Cookie: cookie } : {} });
      return { status: res.status, type: res.headers.get('content-type'), buf: Buffer.from(await res.arrayBuffer()) };
    },
  };
}

export async function unitIdByCode(api, code) {
  const { body } = await api.get('/api/units');
  const u = body.units.find((x) => x.code === code);
  if (!u) throw new Error(`Birlik topilmadi: ${code}`);
  return u.id;
}
