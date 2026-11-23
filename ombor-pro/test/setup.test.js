// Do'kon sozlash (turi, xodimlar, joylashuv), tovar xususiyatlari va Excel/CSV dan yuklash
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { resetDatabase, startServer, client, pool, unitIdByCode } from './helper.js';
import { buildXlsx } from '../src/services/xlsx.js';
import { readTable } from '../src/services/xlsxread.js';

let srv;
let owner;
let piece;

before(async () => {
  await resetDatabase();
  srv = await startServer();
  owner = client(srv.base);
  await owner.post('/api/setup', { full_name: 'Egasi', username: 'owner', password: 'secret1', store_name: 'Yangi do\'kon' });
  piece = await unitIdByCode(owner, 'piece');
});

after(async () => {
  await srv.close();
  await pool.end();
});

const SETUP = {
  store_types: ['clothing', 'grocery'], employee_count: '2-5', region: 'Toshkent shahri', district: 'Chilonzor',
  store_name: 'Baraka market', store_phone: '+998 90 123 45 67', store_address: 'Bunyodkor ko\'chasi 5',
};

test("sozlash: tekshiruv, turkum va birliklar qo'shiladi, takrorlansa ikki marta qo'shilmaydi", async () => {
  const types = (await owner.get('/api/store-types')).body;
  assert.equal(types.types.length, 11);
  assert.ok(types.fields.serial && types.fields.oem);
  assert.equal((await owner.put('/api/setup', { ...SETUP, store_types: [] })).status, 400);
  assert.equal((await owner.put('/api/setup', { ...SETUP, store_types: ['kosmos'] })).status, 400);
  assert.equal((await owner.put('/api/setup', { ...SETUP, employee_count: '100' })).status, 400);
  assert.equal((await owner.put('/api/setup', { ...SETUP, region: '' })).status, 400);
  const r = await owner.put('/api/setup', SETUP);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.ok(r.body.categories >= 10, `turkumlar: ${r.body.categories}`);
  const s = (await owner.get('/api/settings')).body.settings;
  assert.deepEqual(s.store_types, ['clothing', 'grocery']);
  assert.equal(s.setup_done, true);
  assert.equal(s.store_name, 'Baraka market');
  assert.equal(s.district, 'Chilonzor');
  const cats = (await owner.get('/api/categories')).body.categories.map((c) => c.name);
  assert.ok(cats.includes("Ko'ylaklar") && cats.includes('Sut mahsulotlari'));
  const again = await owner.put('/api/setup', SETUP);
  assert.equal(again.body.categories, 0, "ikkinchi marta turkum qo'shilmaydi");
  const units = (await owner.get('/api/units')).body.units.map((u) => u.code);
  assert.ok(units.includes('pair') && units.includes('g') && units.includes('m3'));
});

test("kassir do'kon sozlamalarini o'zgartira olmaydi", async () => {
  await owner.post('/api/users', { full_name: 'Kassir', username: 'kassir9', password: 'secret1', role: 'cashier' });
  const c = client(srv.base);
  await c.post('/api/auth/login', { username: 'kassir9', password: 'secret1' });
  assert.equal((await c.put('/api/setup', SETUP)).status, 403);
});

test("tovar xususiyatlari (brend, IMEI): saqlanadi, qidiruvda topiladi, noma'lumlari tashlanadi", async () => {
  const r = await owner.post('/api/products', {
    name: 'Samsung A15', base_unit_id: piece, selling_price: 2100000, purchase_price: 1800000,
    attributes: { brand: 'Samsung', serial: '356789104512345', warranty: '12 oy', hacker: 'x' },
  });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  let p = (await owner.get(`/api/products/${r.body.id}`)).body.product;
  assert.deepEqual(p.attributes, { brand: 'Samsung', serial: '356789104512345', warranty: '12 oy' });
  const found = (await owner.get('/api/products?q=104512345')).body.products.map((x) => x.name);
  assert.deepEqual(found, ['Samsung A15']);
  const base = { name: 'Samsung A15', base_unit_id: piece, selling_price: 2100000, purchase_price: 1800000, conversions: [] };
  await owner.put(`/api/products/${r.body.id}`, base);
  p = (await owner.get(`/api/products/${r.body.id}`)).body.product;
  assert.equal(p.attributes.brand, 'Samsung', "yuborilmasa o'zgarmaydi");
  await owner.put(`/api/products/${r.body.id}`, { ...base, attributes: { brand: 'Samsung' } });
  p = (await owner.get(`/api/products/${r.body.id}`)).body.product;
  assert.deepEqual(p.attributes, { brand: 'Samsung' });
});

const xlsxOf = (rows) => buildXlsx([{
  name: 'Tovarlar', title: 'Tovarlar', subtitle: 'sinov',
  columns: [
    { key: 'name', header: 'Nomi', type: 'text' }, { key: 'unit', header: 'Birlik', type: 'text' },
    { key: 'cost', header: 'Kelish narxi', type: 'text' }, { key: 'sell', header: 'Sotuv narxi', type: 'text' },
    { key: 'qty', header: 'Qoldiq', type: 'text' }, { key: 'cat', header: 'Kategoriya', type: 'text' },
    { key: 'brand', header: 'Brend', type: 'text' },
  ],
  rows,
}]);

test("Excel import: namuna, tekshirish (saqlamasdan), xato qatorlar sababi bilan, keyin haqiqiy yuklash", async () => {
  const tpl = await owner.raw('/api/products/import/template');
  assert.equal(tpl.status, 200);
  assert.equal(tpl.buf.readUInt32LE(0), 0x04034b50, 'xlsx (zip)');
  const tplRows = readTable(tpl.buf, 'namuna.xlsx');
  assert.ok(tplRows.some((r) => r.includes('Nomi') && r.includes('Sotuv narxi')));

  const file = xlsxOf([
    { name: 'Un oliy nav', unit: 'kg', cost: '7.500', sell: '9 000', qty: '50', cat: 'Oziq-ovqat', brand: '' },
    { name: 'Shakar', unit: 'kilogramm', cost: '11000', sell: '13500', qty: '20', cat: 'Oziq-ovqat', brand: '' },
    { name: 'Sovun Duru', unit: 'dona', cost: '5000', sell: '7.000', qty: '30', cat: 'Gigiyena', brand: 'Duru' },
    { name: 'Narxsiz tovar', unit: 'dona', cost: '100', sell: '', qty: '1', cat: '', brand: '' },
    { name: 'Samsung A15', unit: 'dona', cost: '1', sell: '2', qty: '1', cat: '', brand: '' },
    { name: 'Gilam', unit: 'gektar', cost: '1', sell: '2', qty: '1', cat: '', brand: '' },
  ]);
  const before = (await owner.get('/api/products')).body.products.length;
  const dry = await owner.upload('/api/products/import?dry=1', 'file', { name: 'tovarlar.xlsx', data: file });
  assert.equal(dry.status, 200, JSON.stringify(dry.body));
  assert.equal(dry.body.created, 3);
  assert.deepEqual(dry.body.skipped.map((s) => s.name), ['Narxsiz tovar', 'Samsung A15', 'Gilam']);
  assert.match(dry.body.skipped[1].reason, /allaqachon bor/);
  assert.match(dry.body.skipped[2].reason, /Birlik tanilmadi/);
  assert.equal((await owner.get('/api/products')).body.products.length, before, "tekshirishda hech narsa saqlanmaydi");

  const real = await owner.upload('/api/products/import', 'file', { name: 'tovarlar.xlsx', data: file });
  assert.equal(real.body.created, 3);
  const list = (await owner.get('/api/products?q=Un oliy')).body.products;
  assert.equal(list[0].purchase_price, 7500);
  assert.equal(list[0].selling_price, 9000);
  assert.equal(list[0].stock_qty, 50);
  assert.equal(list[0].category_name, 'Oziq-ovqat');
  const soap = (await owner.get('/api/products?q=Sovun')).body.products[0];
  assert.equal(soap.selling_price, 7000);
  assert.equal(soap.attributes.brand, 'Duru');
  // qayta yuklansa — takror qo'shilmaydi
  const again = await owner.upload('/api/products/import', 'file', { name: 'tovarlar.xlsx', data: file });
  assert.equal(again.body.created, 0);
});

test("CSV import (nuqtali vergul, Excel'ning o'zbekcha saqlashi)", async () => {
  const csv = '﻿Nomi;Sotuv narxi;Kelish narxi;Qoldiq;Birlik\n"Choy ""Ahmad"" 100 g";21 000;17 000;10;dona\nMakaron;11500;9000;5;\n';
  const r = await owner.upload('/api/products/import', 'file', { name: 'tovar.csv', data: csv, type: 'text/csv' });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.created, 2);
  const tea = (await owner.get('/api/products?q=Ahmad')).body.products[0];
  assert.equal(tea.name, 'Choy "Ahmad" 100 g');
  assert.equal(tea.selling_price, 21000);
  const bad = await owner.upload('/api/products/import', 'file', { name: 'x.csv', data: 'a;b\n1;2\n', type: 'text/csv' });
  assert.equal(bad.status, 400);
});
