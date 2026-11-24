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

// form — tovar qo'shish formasini shu turga moslash:
//   name — nomiga misol; more_units — «Boshqa» ro'yxatidagi qo'shimcha birliklar (asosiylari units'da);
//   packs — qadoq turlari (rulon, quti, qop...); pack / variant — belgilar matni [sarlavha, misol];
//   presets — o'lcham tugmalari (bo'sh bo'lsa — faqat rang tanlanadi); base_units — «Qanday sotasiz?» tugmalari
//   (berilmasa — units). «Boshqa do'kon»da hammasi chiqadi.
export const STORE_TYPES = [
  {
    key: 'clothing', label: "Kiyim do'koni", icon: 'shirt', hint: "O'lcham, rang, model",
    units: ['piece', 'set'], fields: ['brand', 'color', 'material'], variants: 'sizes', colors: true,
    categories: ["Erkaklar kiyimi", "Ayollar kiyimi", "Bolalar kiyimi", "Ko'ylaklar", 'Shimlar', 'Ustki kiyimlar', 'Futbolkalar'],
    form: {
      name: "Masalan: Futbolka oq, Ko'ylak klassik, Shim jinsi", more_units: ['pair'], packs: ['pack', 'box', 'set'],
      pack: ['Pachka yoki qutida keladi', "Masalan: 1 pachka ichida 10 dona. Narxni pachka yoki dona uchun yozasiz — ikkinchisi o'zi chiqadi"],
      variant: ["O'lchami yoki rangi bor", "Masalan: S, M, L yoki 48, 50, 52. Ranglarini rasmga olib qo'shasiz — har birining qoldig'i alohida"],
      presets: ['sml', 'xs3xl', 'shirt', 'wear', 'kids', 'std'],
    },
  },
  {
    key: 'shoes', label: "Poyabzal do'koni", icon: 'footprints', hint: "Poyabzal o'lchami, rang",
    units: ['pair', 'piece'], fields: ['brand', 'color', 'material'], variants: 'shoes', colors: true,
    categories: ['Erkaklar poyabzali', 'Ayollar poyabzali', 'Bolalar poyabzali', 'Krossovkalar', 'Tuflilar', 'Etiklar', 'Shippaklar'],
    form: {
      name: 'Masalan: Krossovka Nike, Tufli qora, Etik qishki', more_units: [], packs: ['box', 'crate'],
      pack: ['Qutida yoki yashikda keladi', "Masalan: 1 yashik ichida 12 juft. Narxni yashik yoki juft uchun yozasiz — ikkinchisi o'zi chiqadi"],
      variant: ["O'lchami yoki rangi bor", "Masalan: 38, 39, 40. Ranglarini rasmga olib qo'shasiz — har birining qoldig'i alohida"],
      presets: ['shoes', 'kidshoes', 'std'],
    },
  },
  {
    key: 'grocery', label: "Oziq-ovqat do'koni", icon: 'basket', hint: 'Kg, litr, yaroqlilik muddati',
    units: ['piece', 'kg', 'g', 'l'], fields: ['brand', 'batch'], expiry: true,
    categories: ['Oziq-ovqat', 'Ichimliklar', 'Sut mahsulotlari', 'Non mahsulotlari', 'Shirinliklar', "Go'sht mahsulotlari", 'Gigiyena'],
    form: {
      name: 'Masalan: Pepsi 1 L, Un oliy nav, Guruch lazer', more_units: ['ml'], packs: ['block', 'box', 'pack', 'bag', 'crate', 'bottle'],
      pack: ['Blok, quti yoki qopda keladi', 'Masalan: 1 blok ichida 12 dona, 1 qop ichida 50 kilogramm'],
      variant: ['Har xil hajmi bor', "Masalan: 0,5 L, 1 L, 1,5 L yoki 250 g, 500 g. Har birining qoldig'i alohida ko'rinadi"],
      presets: ['liters', 'grams', 'std'],
    },
  },
  {
    key: 'construction', label: 'Qurilish mollari', icon: 'hammer', hint: 'Metr, kub, tonna, qop',
    units: ['piece', 'm', 'm2', 'm3', 't', 'bag', 'kg'], fields: ['brand', 'dims', 'material'],
    categories: ['Sement va quruq aralashmalar', "G'isht va bloklar", 'Armatura va metall', "Bo'yoqlar", 'Santexnika', 'Elektr mollari', 'Asboblar'],
    form: {
      name: 'Masalan: Sement M400, Armatura 12 mm, Kafel 30×60', more_units: ['l', 'set', 'cm'], packs: ['bag', 'pack', 'box', 'roll'],
      pack: ['Qop, pachka yoki rulonda keladi', 'Masalan: 1 qop ichida 50 kilogramm, 1 pachka ichida 10 dona'],
      variant: ["Har xil o'lchami bor", "Masalan: 10 mm, 12 mm, 14 mm. Har birining qoldig'i alohida ko'rinadi"],
      presets: ['mm', 'std'],
    },
  },
  {
    key: 'fabric', label: "Mato va gazlama", icon: 'scissors', hint: 'Metr, rulon, eni, rangi',
    units: ['m', 'roll', 'piece'], fields: ['color', 'width', 'material'], colors: true,
    categories: ['Gazlamalar', 'Atlas va adras', 'Parda matolari', 'Ip va tikuv buyumlari'],
    form: {
      name: 'Masalan: Oq atlas, Parda «Velyur», Shoyi gulli', more_units: [], packs: ['roll'],
      // Mato metrlab sotiladi; rulon — qadoq («Rulonda keladi»), shunda metr ham, rulon ham yo'qolmaydi
      base_units: ['m', 'piece'],
      pack: ['Rulonda keladi', "Masalan: 1 rulon ichida 50 metr. Narxni rulon yoki metr uchun yozasiz — ikkinchisi o'zi chiqadi"],
      variant: ['Rangi bor', "Har bir rangini rasmga olasiz — har birining qoldig'i alohida ko'rinadi"],
      presets: [],
    },
  },
  {
    key: 'cosmetics', label: "Kosmetika do'koni", icon: 'sparkles', hint: 'Brend, hajm, muddat',
    units: ['piece', 'ml', 'l'], fields: ['brand', 'volume', 'batch'], expiry: true,
    categories: ['Yuz parvarishi', 'Soch parvarishi', 'Pardoz vositalari', 'Atirlar', 'Gigiyena'],
    form: {
      name: 'Masalan: Nivea krem 100 ml, Shampun Head&Shoulders', more_units: ['g', 'set'], packs: ['box', 'pack', 'set'],
      pack: ['Qutida yoki pachkada keladi', "Masalan: 1 quti ichida 12 dona. Narxni quti yoki dona uchun yozasiz — ikkinchisi o'zi chiqadi"],
      variant: ['Har xil hajmi bor', "Masalan: 50 ml, 100 ml, 200 ml. Har birining qoldig'i alohida ko'rinadi"],
      presets: ['ml', 'std'],
    },
  },
  {
    key: 'accessories', label: 'Aksessuarlar', icon: 'gem', hint: 'Brend, model, rang',
    units: ['piece', 'pair', 'set'], fields: ['brand', 'model', 'color'], colors: true,
    categories: ['Sumkalar', 'Soatlar', 'Taqinchoqlar', "Ko'zoynaklar", 'Kamarlar'],
    form: {
      name: 'Masalan: Ayollar sumkasi, Soat Casio, Kamar charm', more_units: [], packs: ['box', 'pack', 'set'],
      pack: ['Qutida keladi', "Masalan: 1 quti ichida 10 dona. Narxni quti yoki dona uchun yozasiz — ikkinchisi o'zi chiqadi"],
      variant: ['Rangi bor', "Har bir rangini rasmga olasiz — har birining qoldig'i alohida ko'rinadi"],
      presets: [],
    },
  },
  {
    key: 'electronics', label: "Elektronika do'koni", icon: 'smartphone', hint: 'Model, IMEI, kafolat',
    units: ['piece', 'set'], fields: ['brand', 'model', 'serial', 'warranty'],
    categories: ['Telefonlar', 'Telefon aksessuarlari', 'Maishiy texnika', 'Kompyuter texnikasi', 'Zaryadlovchi va kabellar'],
    form: {
      name: 'Masalan: Samsung Galaxy A15, USB-C kabel, Zaryadlovchi 20W', more_units: ['m'], packs: ['box', 'set'],
      pack: ['Qutida keladi', "Masalan: 1 quti ichida 20 dona. Narxni quti yoki dona uchun yozasiz — ikkinchisi o'zi chiqadi"],
      variant: ['Har xil turi bor (xotira, rang)', "Masalan: 64 GB, 128 GB, 256 GB. Har birining qoldig'i alohida ko'rinadi"],
      presets: ['gb', 'std'],
    },
  },
  {
    key: 'household', label: "Xo'jalik mollari", icon: 'sofa', hint: "Material, o'lcham, to'plam",
    units: ['piece', 'set', 'l', 'kg'], fields: ['brand', 'material', 'dims', 'color'], expiry: true, colors: true,
    categories: ['Idish-tovoq', 'Oshxona anjomlari', 'Tozalash vositalari', 'Uy jihozlari'],
    form: {
      name: "Masalan: Choynak 2 L, Tarelka to'plami, Supurgi", more_units: ['m', 'pair'], packs: ['box', 'pack', 'set', 'crate'],
      pack: ['Qutida yoki yashikda keladi', "Masalan: 1 quti ichida 6 dona. Narxni quti yoki dona uchun yozasiz — ikkinchisi o'zi chiqadi"],
      variant: ["Har xil o'lchami yoki rangi bor", "Masalan: 24 sm, 28 sm. Ranglarini rasmga olib qo'shasiz — har birining qoldig'i alohida"],
      presets: ['std'],
    },
  },
  {
    key: 'auto', label: 'Avto ehtiyot qismlar', icon: 'car', hint: 'OEM, artikul, mos mashinalar',
    units: ['piece', 'set', 'l'], fields: ['oem', 'maker', 'cars', 'brand'],
    categories: ['Dvigatel qismlari', 'Tormoz tizimi', 'Filtrlar', 'Moylar va suyuqliklar', 'Elektr qismlar', 'Kuzov qismlari'],
    form: {
      name: 'Masalan: Moy filtri Cobalt, Tormoz kolodkasi Nexia', more_units: ['pair', 'm'], packs: ['box', 'set', 'can', 'barrel'],
      pack: ['Qutida yoki kanistrda keladi', 'Masalan: 1 quti ichida 10 dona, 1 kanistr ichida 20 litr'],
      variant: ['Har xil turi bor', "Masalan: 5W-30, 10W-40 yoki old, orqa. Har birining qoldig'i alohida ko'rinadi"],
      presets: ['std'],
    },
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
  // Xodimlar soni ixtiyoriy: so'ralmasa — «faqat o'zim» (keyin Sozlamalarda o'zgartiriladi)
  const employees = String(body.employee_count || '1');
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
  // Viloyat ixtiyoriy — ro'yxatdan o'tishda so'ralmaydi, keyin Sozlamalarda yoziladi
  if (body.receipt_footer !== undefined) patch.receipt_footer = str(body.receipt_footer, 'Chek izohi', { max: 200 }) || '';
  if (body.notify_low_stock !== undefined) patch.notify_low_stock = Boolean(body.notify_low_stock);
  if (body.costing_method !== undefined) {
    if (!['FIFO', 'WAVG'].includes(body.costing_method)) throw new HttpError(400, "Foyda hisoblash usuli noto'g'ri");
    patch.costing_method = body.costing_method;
  }
  return patch;
}
