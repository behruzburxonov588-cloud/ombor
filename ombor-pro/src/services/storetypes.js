// Do'kon turlari: har biriga mos turkumlar, o'lchov birliklari va tovar maydonlari.
// Sozlash (onboarding) paytida tanlangan turlar uchun turkumlar va birliklar avtomatik qo'shiladi,
// tovar qo'shish formasida esa faqat shu turlarga kerakli maydonlar ko'rsatiladi.

import { HttpError, str } from '../util.js';

// Tovarning qo'shimcha maydonlari (products.attributes JSONB ichida saqlanadi)
export const ATTRIBUTE_FIELDS = {
  brand: { label: 'Brend', placeholder: 'Masalan: Nike, Samsung, Bosch' },
  model: { label: 'Model', placeholder: 'Masalan: Galaxy A15, Air Max 90' },
  color: { label: 'Rangi', placeholder: 'Masalan: qora, oq, ko\'k' },
  material: { label: 'Materiali', placeholder: 'Masalan: paxta, charm, plastik' },
  dims: { label: "O'lchami (bo'yi × eni)", placeholder: 'Masalan: 60 × 120 sm' },
  width: { label: 'Eni', placeholder: 'Masalan: 150 sm' },
  volume: { label: 'Hajmi', placeholder: 'Masalan: 250 ml, 50 g' },
  batch: { label: 'Partiya raqami', placeholder: 'Masalan: LOT-2411' },
  serial: { label: 'Seriya raqami yoki IMEI', placeholder: 'Masalan: 356789104512345' },
  warranty: { label: 'Kafolat muddati', placeholder: 'Masalan: 12 oy' },
  oem: { label: 'OEM raqami', placeholder: 'Masalan: 96553450' },
  maker: { label: 'Ishlab chiqaruvchi', placeholder: 'Masalan: GM Uzbekistan, Bosch' },
  cars: { label: 'Mos mashinalar', placeholder: 'Masalan: Cobalt, Nexia 3, Lacetti' },
};

export const STORE_TYPES = [
  {
    key: 'clothing', label: "Kiyim do'koni", icon: 'shirt', hint: "O'lcham, rang, model",
    units: ['piece', 'set'], fields: ['brand', 'color', 'material'], variants: 'sizes', colors: true,
    categories: ["Erkaklar kiyimi", "Ayollar kiyimi", "Bolalar kiyimi", "Ko'ylaklar", 'Shimlar', 'Ustki kiyimlar', 'Futbolkalar'],
  },
  {
    key: 'shoes', label: "Poyabzal do'koni", icon: 'footprints', hint: "Poyabzal o'lchami, rang",
    units: ['pair', 'piece'], fields: ['brand', 'color', 'material'], variants: 'shoes', colors: true,
    categories: ['Erkaklar poyabzali', 'Ayollar poyabzali', 'Bolalar poyabzali', 'Krossovkalar', 'Tuflilar', 'Etiklar', 'Shippaklar'],
  },
  {
    key: 'grocery', label: "Oziq-ovqat do'koni", icon: 'basket', hint: 'Kg, litr, yaroqlilik muddati',
    units: ['piece', 'kg', 'g', 'l'], fields: ['brand', 'batch'], expiry: true,
    categories: ['Oziq-ovqat', 'Ichimliklar', 'Sut mahsulotlari', 'Non mahsulotlari', 'Shirinliklar', "Go'sht mahsulotlari", 'Gigiyena'],
  },
  {
    key: 'construction', label: 'Qurilish mollari', icon: 'hammer', hint: 'Metr, kub, tonna, qop',
    units: ['piece', 'm', 'm2', 'm3', 't', 'bag', 'kg'], fields: ['brand', 'dims', 'material'],
    categories: ['Sement va quruq aralashmalar', "G'isht va bloklar", 'Armatura va metall', "Bo'yoqlar", 'Santexnika', 'Elektr mollari', 'Asboblar'],
  },
  {
    key: 'fabric', label: "Mato va gazlama", icon: 'scissors', hint: 'Metr, rulon, eni, rangi',
    units: ['m', 'roll', 'piece'], fields: ['color', 'width', 'material'], colors: true,
    categories: ['Gazlamalar', 'Atlas va adras', 'Parda matolari', 'Ip va tikuv buyumlari'],
  },
  {
    key: 'cosmetics', label: "Kosmetika do'koni", icon: 'sparkles', hint: 'Brend, hajm, muddat',
    units: ['piece', 'ml', 'l'], fields: ['brand', 'volume', 'batch'], expiry: true,
    categories: ['Yuz parvarishi', 'Soch parvarishi', 'Pardoz vositalari', 'Atirlar', 'Gigiyena'],
  },
  {
    key: 'accessories', label: 'Aksessuarlar', icon: 'gem', hint: 'Brend, model, rang',
    units: ['piece', 'pair', 'set'], fields: ['brand', 'model', 'color'], colors: true,
    categories: ['Sumkalar', 'Soatlar', 'Taqinchoqlar', "Ko'zoynaklar", 'Kamarlar'],
  },
  {
    key: 'electronics', label: "Elektronika do'koni", icon: 'smartphone', hint: 'Model, IMEI, kafolat',
    units: ['piece', 'set'], fields: ['brand', 'model', 'serial', 'warranty'],
    categories: ['Telefonlar', 'Telefon aksessuarlari', 'Maishiy texnika', 'Kompyuter texnikasi', 'Zaryadlovchi va kabellar'],
  },
  {
    key: 'household', label: "Xo'jalik mollari", icon: 'sofa', hint: "Material, o'lcham, to'plam",
    units: ['piece', 'set', 'l', 'kg'], fields: ['brand', 'material', 'dims', 'color'], expiry: true,
    categories: ['Idish-tovoq', 'Oshxona anjomlari', 'Tozalash vositalari', 'Uy jihozlari'],
  },
  {
    key: 'auto', label: 'Avto ehtiyot qismlar', icon: 'car', hint: 'OEM, artikul, mos mashinalar',
    units: ['piece', 'set', 'l'], fields: ['oem', 'maker', 'cars', 'brand'],
    categories: ['Dvigatel qismlari', 'Tormoz tizimi', 'Filtrlar', 'Moylar va suyuqliklar', 'Elektr qismlar', 'Kuzov qismlari'],
  },
  {
    key: 'other', label: "Boshqa do'kon", icon: 'store', hint: "Umumiy do'kon",
    units: ['piece', 'kg', 'l', 'm'], fields: ['brand', 'color'], expiry: true,
    categories: [],
  },
];

export const STORE_TYPE_KEYS = STORE_TYPES.map((t) => t.key);
export const EMPLOYEE_COUNTS = ['1', '2-5', '6-15', '16+'];

// Sozlash paytida qo'shiladigan birliklar (kod → nom). Bor bo'lsa takror qo'shilmaydi.
export const UNIT_NAMES = {
  piece: 'dona', kg: 'kilogramm', g: 'gramm', t: 'tonna', m: 'metr', l: 'litr', ml: 'millilitr',
  box: 'quti', pack: 'pachka', roll: 'rulon', set: "to'plam", bag: 'qop', pair: 'juft', m2: 'kvadrat metr', m3: 'kub metr',
};

// Tanlangan turlar uchun turkumlar va birliklarni qo'shadi. Qaytaradi: nechta turkum qo'shildi
export async function applyStoreTypes(client, types) {
  const picked = STORE_TYPES.filter((t) => types.includes(t.key));
  const cats = [...new Set(picked.flatMap((t) => t.categories))];
  let added = 0;
  for (const name of cats) {
    const { rowCount } = await client.query(
      `INSERT INTO categories (name) SELECT $1::text
        WHERE NOT EXISTS (SELECT 1 FROM categories WHERE lower(name) = lower($1::text))`,
      [name],
    );
    added += rowCount;
  }
  const codes = [...new Set(picked.flatMap((t) => t.units))];
  for (const code of codes) {
    const name = UNIT_NAMES[code];
    if (!name) continue;
    await client.query(
      `INSERT INTO units (code, name) SELECT $1::text, $2::text
        WHERE NOT EXISTS (SELECT 1 FROM units WHERE code = $1::text OR lower(name) = lower($2::text))`,
      [code, name],
    );
  }
  return { categories: added };
}

// Do'kon profili (turi, xodimlar, joylashuv, nomi...) — tekshirib, sozlamalarga yoziladigan qiymatlarni qaytaradi.
// Ro'yxatdan o'tishda ham, keyin «Sozlamalar»dan o'zgartirishda ham bir xil tekshiriladi.
export function parseStoreProfile(body = {}) {
  const types = Array.isArray(body.store_types) ? [...new Set(body.store_types.map(String))] : [];
  if (!types.length) throw new HttpError(400, "Do'kon turini tanlang (bir nechtasini ham tanlash mumkin)");
  if (types.some((t) => !STORE_TYPE_KEYS.includes(t))) throw new HttpError(400, "Do'kon turi noto'g'ri");
  const employees = String(body.employee_count || '');
  if (!EMPLOYEE_COUNTS.includes(employees)) throw new HttpError(400, 'Xodimlar sonini tanlang');
  const patch = {
    store_types: types,
    employee_count: employees,
    region: str(body.region, 'Viloyat', { max: 60 }) || '',
    district: str(body.district, 'Tuman', { max: 60 }) || '',
    store_name: str(body.store_name, "Do'kon nomi", { required: true, max: 100 }),
    store_phone: str(body.store_phone, 'Telefon', { max: 30 }) || '',
    store_address: str(body.store_address, 'Manzil', { max: 200 }) || '',
    setup_done: true,
  };
  if (!patch.region) throw new HttpError(400, 'Viloyatni tanlang');
  if (body.receipt_footer !== undefined) patch.receipt_footer = str(body.receipt_footer, 'Chek izohi', { max: 200 }) || '';
  if (body.notify_low_stock !== undefined) patch.notify_low_stock = Boolean(body.notify_low_stock);
  if (body.costing_method !== undefined) {
    if (!['FIFO', 'WAVG'].includes(body.costing_method)) throw new HttpError(400, "Foyda hisoblash usuli noto'g'ri");
    patch.costing_method = body.costing_method;
  }
  return patch;
}
