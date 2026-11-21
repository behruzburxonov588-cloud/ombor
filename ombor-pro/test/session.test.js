// Sessiya: foydalanuvchi o'zi chiqmaguncha tizimda qoladi (uzoq va o'zi yangilanadigan sessiya),
// parol o'zgarsa eski sessiyalar yopiladi
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import { resetDatabase, startServer, client, pool } from './helper.js';
import { passwordVersion } from '../src/auth.js';

let srv;
let owner;
let ownerId;
let kassirId;

const cookieOf = (res) => (res.headers.get('set-cookie') || '').split(';')[0];
const me = (cookie) => fetch(`${srv.base}/api/auth/me`, { headers: { Cookie: cookie } });
const token = (claims, opts = {}) => `ombor_session=${jwt.sign(claims, 'test-secret-value', { expiresIn: '90d', ...opts })}`;

before(async () => {
  await resetDatabase();
  srv = await startServer();
  owner = client(srv.base);
  const r = await owner.post('/api/setup', {
    store_name: 'Sessiya savdo', full_name: 'Egasi', username: 'egasi', password: 'parol123',
  });
  assert.equal(r.status, 201);
  ownerId = r.body.user.id;
  const k = await owner.post('/api/users', { full_name: 'Kassir', username: 'kassir', password: 'kassir1', role: 'cashier' });
  assert.equal(k.status, 201);
  kassirId = k.body.user.id;
});

after(async () => {
  await srv.close();
  await pool.end();
});

test("kirish sessiyasi uzoq muddatli: 90 kun, saytni yopib ochganda qayta so'ralmaydi", async () => {
  const res = await fetch(`${srv.base}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'egasi', password: 'parol123' }),
  });
  assert.equal(res.status, 200);
  const raw = res.headers.get('set-cookie');
  const maxAge = Number(/Max-Age=(\d+)/i.exec(raw)[1]);
  assert.ok(maxAge >= 89 * 24 * 3600, `Max-Age juda qisqa: ${maxAge}`);
  assert.match(raw, /HttpOnly/i);
  const payload = jwt.decode(cookieOf(res).split('=')[1]);
  assert.ok(payload.exp - payload.iat >= 89 * 24 * 3600);
  assert.ok(payload.pv, 'parol versiyasi sessiyada bor');
  // Yangi sessiya darhol qayta yozilmaydi
  const r2 = await me(cookieOf(res));
  assert.equal(r2.status, 200);
  assert.equal(r2.headers.get('set-cookie'), null);
});

test("ishlatilayotgan sessiya o'zi yangilanadi: 2 kunlik sessiya yana 90 kunga uzayadi", async () => {
  const { rows } = await pool.query('SELECT password_hash FROM users WHERE id = $1', [ownerId]);
  const old = token({ sub: ownerId, pv: passwordVersion(rows[0].password_hash), iat: Math.floor(Date.now() / 1000) - 2 * 24 * 3600 });
  const res = await me(old);
  assert.equal(res.status, 200);
  const fresh = cookieOf(res);
  assert.ok(fresh.startsWith('ombor_session='), 'yangi cookie berildi');
  const p = jwt.decode(fresh.split('=')[1]);
  assert.ok(Date.now() / 1000 - p.iat < 60);
  assert.ok(p.exp - Date.now() / 1000 > 89 * 24 * 3600);
  assert.equal((await me(fresh)).status, 200);
});

test('eski sessiyalar (parol versiyasisiz) ishlashda davom etadi va yangilanadi', async () => {
  const res = await me(token({ sub: ownerId }, { expiresIn: '1h' }));
  assert.equal(res.status, 200);
  const p = jwt.decode(cookieOf(res).split('=')[1]);
  assert.ok(p.pv);
});

test("parol o'zgarsa: boshqa qurilmalar chiqariladi, shu qurilma tizimda qoladi", async () => {
  const phone = client(srv.base);
  assert.equal((await phone.login('egasi', 'parol123')).status, 200);
  const laptop = await fetch(`${srv.base}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'egasi', password: 'parol123' }),
  });
  const laptopCookie = cookieOf(laptop);
  const ch = await phone.post('/api/auth/password', { current_password: 'parol123', new_password: 'yangi-parol' });
  assert.equal(ch.status, 200);
  assert.equal((await phone.get('/api/auth/me')).status, 200, "parolni o'zgartirgan qurilma chiqarilmaydi");
  const r = await me(laptopCookie);
  assert.equal(r.status, 401);
  assert.match((await r.json()).error, /Parol o'zgargan/);
  assert.equal((await phone.login('egasi', 'yangi-parol')).status, 200);
});

test("egasi xodim parolini almashtirsa, xodimning eski sessiyasi yopiladi", async () => {
  const kassir = client(srv.base);
  assert.equal((await kassir.login('kassir', 'kassir1')).status, 200);
  assert.equal((await kassir.get('/api/auth/me')).status, 200);
  const boss = client(srv.base);
  assert.equal((await boss.login('egasi', 'yangi-parol')).status, 200);
  assert.equal((await boss.put(`/api/users/${kassirId}`, { password: 'kassir2' })).status, 200);
  assert.equal((await kassir.get('/api/auth/me')).status, 401);
  assert.equal((await kassir.login('kassir', 'kassir2')).status, 200);
  // Egasi o'z parolini xodimlar sahifasidan o'zgartirsa ham shu qurilmada qoladi
  assert.equal((await boss.put(`/api/users/${ownerId}`, { password: 'egasi-123' })).status, 200);
  assert.equal((await boss.get('/api/auth/me')).status, 200);
});

test('chiqish sessiyani yopadi', async () => {
  const c = client(srv.base);
  assert.equal((await c.login('egasi', 'egasi-123')).status, 200);
  assert.equal((await c.post('/api/auth/logout')).status, 200);
  assert.equal((await c.get('/api/auth/me')).status, 401);
});
