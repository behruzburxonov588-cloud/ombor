// AI yordamchi.
//   • «Tez savollar» — bepul: tayyor savollarga javob to'g'ridan-to'g'ri bazadan (AI ishlatilmaydi).
//   • Istalgan savol — pullik (AI Oddiy: Claude Haiku 5.5, AI Pro: Claude Opus 5.5) yoki 7 kunlik bepul sinov.
// AI faqat O'QIYDI: hech narsani o'zgartirmaydi va faqat shu do'kon ma'lumotini ko'radi (so'rov do'kon sxemasida
// bajariladi). Har bir vosita foydalanuvchi ruxsatini tekshiradi: kassirga kelish narxi va foyda berilmaydi.
import Anthropic from '@anthropic-ai/sdk';
import { pool } from '../db.js';
import { can } from '../auth.js';
import { HttpError, round2, todayLocal, addDays } from '../util.js';
import { overview, customerDebts, productStats, resolveRange } from './analytics.js';
import { balances } from './cash.js';
import { getSettings } from './settings.js';

// ---------- Tariflar ----------

const posNum = (v, d) => {
  const x = Number(v);
  return Number.isFinite(x) && x > 0 ? x : d;
};

export function planConfig() {
  return {
    basic: {
      key: 'basic', label: 'AI Oddiy', model: 'claude-haiku-5-5', effort: 'low',
      price: posNum(process.env.OMBOR_AI_PRICE_BASIC, 49000), limit: posNum(process.env.OMBOR_AI_LIMIT_BASIC, 1000),
    },
    pro: {
      key: 'pro', label: 'AI Pro', model: 'claude-opus-5-5', effort: 'medium',
      price: posNum(process.env.OMBOR_AI_PRICE_PRO, 249000), limit: posNum(process.env.OMBOR_AI_LIMIT_PRO, 300),
    },
    trial: {
      key: 'trial', label: 'Bepul sinov', model: 'claude-haiku-5-5', effort: 'low',
      price: 0, limit: posNum(process.env.OMBOR_AI_LIMIT_TRIAL, 30), days: 7,
    },
  };
}

// 1 million token narxi (AQSh dollari) — xarajatni hisoblash uchun
const PRICES_USD = {
  'claude-haiku-5-5': { in: 0.10, out: 0.50, cacheRead: 0.01, cacheWrite: 0.125 },
  'claude-opus-5-5': { in: 4, out: 20, cacheRead: 0.20, cacheWrite: 5 },
};

export const usdToUzs = () => posNum(process.env.OMBOR_USD_UZS, 12800);
const monthStart = () => `${todayLocal().slice(0, 8)}01`;

// Platforma egasi (barcha do'konlarga AI yoqadigan odam): OMBOR_PLATFORM_ADMINS="login1,login2".
// Bu sozlama berilmagan bo'lsa — eng birinchi ochilgan do'konning egasi (saytni o'rnatgan odam).
export async function isPlatformAdmin(user, storeId) {
  if (!user || user.role !== 'owner') return false;
  const list = String(process.env.OMBOR_PLATFORM_ADMINS || '').split(',').map((x) => x.trim().toLowerCase()).filter(Boolean);
  if (list.length) return list.includes(String(user.username || '').toLowerCase());
  if (!storeId) return false;
  const { rows } = await pool.query('SELECT MIN(id) AS id FROM core.stores');
  return Number(rows[0]?.id) === Number(storeId);
}

export function aiConfigured() {
  return Boolean(process.env.ANTHROPIC_API_KEY) || Boolean(clientFactory !== defaultFactory);
}

export async function planStatus(storeId) {
  const cfg = planConfig();
  const [{ rows }, { rows: us }] = await Promise.all([
    pool.query('SELECT plan, expires_at, trial_used FROM core.ai_plans WHERE store_id = $1', [storeId]),
    pool.query('SELECT questions, cost_usd FROM core.ai_usage WHERE store_id = $1 AND month = $2', [storeId, monthStart()]),
  ]);
  const r = rows[0];
  const active = Boolean(r && new Date(r.expires_at).getTime() > Date.now());
  const plan = active ? cfg[r.plan] : null;
  return {
    plan: active ? r.plan : null,
    label: plan?.label || null,
    active,
    expires_at: r?.expires_at || null,
    days_left: active ? Math.max(1, Math.ceil((new Date(r.expires_at).getTime() - Date.now()) / 86400000)) : 0,
    trial_used: Boolean(r?.trial_used),
    used: us[0]?.questions || 0,
    limit: plan?.limit || 0,
  };
}

export async function startTrial(storeId, user) {
  const days = planConfig().trial.days;
  const { rows } = await pool.query('SELECT trial_used, expires_at FROM core.ai_plans WHERE store_id = $1', [storeId]);
  if (rows[0]?.trial_used) throw new HttpError(409, "Bepul sinov allaqachon ishlatilgan");
  if (rows[0] && new Date(rows[0].expires_at).getTime() > Date.now()) throw new HttpError(409, 'AI allaqachon yoqilgan');
  await pool.query(
    `INSERT INTO core.ai_plans (store_id, plan, expires_at, trial_used, updated_by)
     VALUES ($1, 'trial', now() + ($2 || ' days')::interval, true, $3)
     ON CONFLICT (store_id) DO UPDATE SET plan = 'trial', expires_at = EXCLUDED.expires_at, trial_used = true,
       updated_at = now(), updated_by = EXCLUDED.updated_by`,
    [storeId, String(days), user.username],
  );
  return planStatus(storeId);
}

// Platforma egasi: do'konga tarif yoqish (shu tarif hali amalda bo'lsa — muddat uzaytiriladi) yoki o'chirish
export async function setStorePlan(storeId, plan, days, user) {
  const { rows: st } = await pool.query('SELECT id FROM core.stores WHERE id = $1', [storeId]);
  if (!st[0]) throw new HttpError(404, "Do'kon topilmadi");
  if (plan === 'none') {
    await pool.query('UPDATE core.ai_plans SET expires_at = now(), updated_at = now(), updated_by = $2 WHERE store_id = $1', [storeId, user.username]);
    return;
  }
  if (!['basic', 'pro'].includes(plan)) throw new HttpError(400, "Tarif noto'g'ri");
  const d = Math.round(Number(days));
  if (!(d >= 1 && d <= 366)) throw new HttpError(400, "Kunlar soni 1 dan 366 gacha bo'lsin");
  await pool.query(
    `INSERT INTO core.ai_plans (store_id, plan, expires_at, updated_by)
     VALUES ($1, $2, now() + ($3 || ' days')::interval, $4)
     ON CONFLICT (store_id) DO UPDATE SET
       expires_at = CASE WHEN core.ai_plans.plan = EXCLUDED.plan AND core.ai_plans.expires_at > now()
                         THEN core.ai_plans.expires_at + ($3 || ' days')::interval ELSE EXCLUDED.expires_at END,
       plan = EXCLUDED.plan, updated_at = now(), updated_by = EXCLUDED.updated_by`,
    [storeId, plan, String(d), user.username],
  );
}

export async function platformOverview() {
  const cfg = planConfig();
  const { rows } = await pool.query(
    `SELECT s.id, s.name, s.status, s.created_at,
            (SELECT l.username FROM core.logins l WHERE l.store_id = s.id ORDER BY l.created_at, l.username LIMIT 1) AS login,
            p.plan, p.expires_at, p.trial_used,
            COALESCE(u.questions, 0) AS questions, COALESCE(u.cost_usd, 0) AS cost_usd
       FROM core.stores s
       LEFT JOIN core.ai_plans p ON p.store_id = s.id
       LEFT JOIN core.ai_usage u ON u.store_id = s.id AND u.month = $1
      WHERE s.status <> 'creating'
      ORDER BY s.id DESC`,
    [monthStart()],
  );
  const rate = usdToUzs();
  const stores = rows.map((r) => {
    const active = Boolean(r.plan && new Date(r.expires_at).getTime() > Date.now());
    return {
      id: r.id, name: r.name, login: r.login, created_at: r.created_at, status: r.status,
      plan: active ? r.plan : null, plan_label: active ? cfg[r.plan].label : null, expires_at: r.expires_at, trial_used: r.trial_used,
      questions: r.questions, limit: active ? cfg[r.plan].limit : 0,
      cost_usd: round2(r.cost_usd), cost_uzs: Math.round(Number(r.cost_usd) * rate),
    };
  });
  const paid = stores.filter((s) => s.plan === 'basic' || s.plan === 'pro');
  const income = paid.reduce((sum, s) => sum + cfg[s.plan].price, 0);
  const cost = stores.reduce((sum, s) => sum + s.cost_uzs, 0);
  return {
    stores,
    prices: { basic: cfg.basic.price, pro: cfg.pro.price },
    limits: { basic: cfg.basic.limit, pro: cfg.pro.limit, trial: cfg.trial.limit },
    usd_uzs: rate,
    configured: aiConfigured(),
    admins_from_env: Boolean(String(process.env.OMBOR_PLATFORM_ADMINS || '').trim()),
    totals: {
      basic: paid.filter((s) => s.plan === 'basic').length,
      pro: paid.filter((s) => s.plan === 'pro').length,
      trial: stores.filter((s) => s.plan === 'trial').length,
      income, cost, profit: income - cost,
    },
  };
}

// ---------- Ma'lumot vositalari (faqat o'qish) ----------

const n = (v) => Number(v || 0);
// 1250000 → «1 250 000», 3.5 → «3,5»
const fmt = (v) => {
  const x = round2(v);
  const [i, d] = Math.abs(x).toFixed(2).split('.');
  const dec = d.replace(/0+$/, '');
  return `${x < 0 ? '−' : ''}${i.replace(/\B(?=(\d{3})+(?!\d))/g, ' ')}${dec ? `,${dec}` : ''}`;
};
const som = (v) => `${fmt(v)} so'm`;
const financial = (user) => can(user, 'reports.view');
const seesCost = (user) => ['products.manage', 'reports.view', 'purchases.view', 'stock.view'].some((k) => can(user, k));

const PERIOD_LABEL = {
  today: 'Bugun', yesterday: 'Kecha', last_7_days: "So'nggi 7 kun", last_30_days: "So'nggi 30 kun", this_month: 'Shu oy', last_month: "O'tgan oy",
};
export function periodRange(period) {
  const today = todayLocal();
  switch (period) {
    case 'yesterday': { const y = addDays(today, -1); return { from: y, to: y }; }
    case 'last_7_days': return { from: addDays(today, -6), to: today };
    case 'last_30_days': return { from: addDays(today, -29), to: today };
    case 'this_month': return { from: `${today.slice(0, 8)}01`, to: today };
    case 'last_month': {
      const first = `${today.slice(0, 8)}01`;
      const lastPrev = addDays(first, -1);
      return { from: `${lastPrev.slice(0, 8)}01`, to: lastPrev };
    }
    default: return { from: today, to: today };
  }
}

const EXPENSE_LABEL = {
  food: 'Ovqat (obed)', household: 'Suv, choy, mayda', rent: 'Ijara', salaries: 'Maosh', utilities: 'Kommunal',
  delivery: 'Yetkazib berish', transport: 'Transport', repairs: "Ta'mirlash", other: 'Boshqa',
};

async function salesSummary(user, { period }) {
  const r = periodRange(period);
  const ov = await overview(pool, user, r);
  const m = ov.money;
  const out = { davr: PERIOD_LABEL[period] || 'Bugun', from: r.from, to: r.to, savdo: m.revenue, cheklar: m.sales_count };
  if (financial(user)) {
    Object.assign(out, {
      olgan_narx: m.cogs, tovardan_foyda: m.gross_profit, xarajatlar: m.expenses, buzilgan_tovar: m.losses, sof_foyda: m.net_profit,
      savdodan_qolgan_pul: round2(m.revenue - m.expenses), qarzdorlar_tolagan: m.debt_collected,
      kelgan_yuk: { soni: m.purchases_count, summa: m.purchases_total, tolanmagan: m.purchases_unpaid },
    });
  } else {
    out.eslatma = "Foyda va olgan narxni faqat do'kon egasi ko'radi";
  }
  return out;
}

async function findProducts(user, { query }) {
  const q = String(query || '').trim().slice(0, 80);
  if (!q) return { tovarlar: [] };
  const { rows } = await pool.query(
    `SELECT p.name, u.name AS unit, p.stock_qty, p.min_stock, p.selling_price, p.purchase_price, p.avg_cost, p.is_archived,
            c.name AS category,
            (SELECT COUNT(*) FROM stock_batches b WHERE b.product_id = p.id AND b.qty_remaining > 0)::int AS batches,
            EXISTS (SELECT 1 FROM product_units pu JOIN units un ON un.id = pu.unit_id WHERE pu.product_id = p.id AND lower(un.name) = 'rulon') AS is_roll
       FROM products p JOIN units u ON u.id = p.base_unit_id LEFT JOIN categories c ON c.id = p.category_id
      WHERE p.name ILIKE $1 OR p.barcode = $2 OR p.sku ILIKE $1 OR p.attributes::text ILIKE $1
      ORDER BY p.is_archived, (p.name ILIKE $3) DESC, p.name LIMIT 8`,
    [`%${q}%`, q, `${q}%`],
  );
  const costs = seesCost(user);
  return {
    tovarlar: rows.map((r) => {
      const qty = n(r.stock_qty);
      const min = n(r.min_stock);
      return {
        nomi: r.name, turkum: r.category || null, birlik: r.unit, qoldiq: qty, ogohlantirish_chegarasi: min || null,
        holat: qty <= 0 ? 'tugagan' : min > 0 && qty <= min ? 'kam qolgan' : 'yetarli',
        sotuv_narxi: n(r.selling_price),
        ...(costs ? { olgan_narxi: n(r.avg_cost) || n(r.purchase_price) || null } : {}),
        ...(r.is_roll ? { rulonlar_soni: r.batches } : {}),
        ...(r.is_archived ? { arxivda: true } : {}),
      };
    }),
  };
}

async function lowStock() {
  const { rows } = await pool.query(
    `SELECT p.name, u.name AS unit, p.stock_qty, p.min_stock
       FROM products p JOIN units u ON u.id = p.base_unit_id
      WHERE NOT p.is_archived AND (p.stock_qty <= 0 OR (p.min_stock > 0 AND p.stock_qty <= p.min_stock))
      ORDER BY p.stock_qty <= 0 DESC, p.stock_qty / NULLIF(p.min_stock, 0), p.name LIMIT 50`,
  );
  return {
    tugagan: rows.filter((r) => n(r.stock_qty) <= 0).map((r) => ({ nomi: r.name, birlik: r.unit })),
    kam_qolgan: rows.filter((r) => n(r.stock_qty) > 0).map((r) => ({ nomi: r.name, qoldiq: n(r.stock_qty), birlik: r.unit, chegara: n(r.min_stock) })),
  };
}

async function debts(user, { who }) {
  if (who === 'suppliers') {
    if (!['suppliers.view', 'purchases.view', 'reports.view'].some((k) => can(user, k))) return { xato: "Bu ma'lumotni ko'rishga ruxsat yo'q" };
    const { rows } = await pool.query(
      `SELECT s.name, s.phone, SUM(p.remaining_debt) AS debt, MIN(p.due_date) FILTER (WHERE p.remaining_debt > 0) AS next_due
         FROM purchases p JOIN suppliers s ON s.id = p.supplier_id
        WHERE p.remaining_debt > 0 GROUP BY s.id ORDER BY SUM(p.remaining_debt) DESC LIMIT 20`,
    );
    return {
      men_qarzdorman: rows.map((r) => ({ kimga: r.name, telefon: r.phone || null, qarz: n(r.debt), tolash_muddati: r.next_due || null })),
      jami: round2(rows.reduce((s, r) => s + n(r.debt), 0)),
      bugun: todayLocal(),
    };
  }
  if (!['customers.view', 'reports.view'].some((k) => can(user, k))) return { xato: "Bu ma'lumotni ko'rishga ruxsat yo'q" };
  const d = await customerDebts(pool);
  const list = d.customers || [];
  return {
    menga_qarzdorlar: list.slice(0, 20).map((c) => ({
      kim: c.name, telefon: c.phone || null, qarz: c.debt, muddati_otgani: c.overdue || 0, keyingi_muddat: c.next_due || null,
    })),
    soni: list.length,
    jami: round2(list.reduce((s, c) => s + n(c.debt), 0)),
    bugun: todayLocal(),
  };
}

async function cashBalance(user) {
  if (!['cash.view', 'cash.shift'].some((k) => can(user, k))) return { xato: "Kassani ko'rishga ruxsat yo'q" };
  const b = await balances(pool);
  return { naqd: round2(b.cash), karta: round2(b.card), otkazma: round2(b.transfer), jami: round2(b.cash + b.card + b.transfer) };
}

async function topProducts(user, { period, sort_by: sortBy }) {
  const r = periodRange(period);
  const settings = await getSettings(pool);
  const items = (await productStats(pool, resolveRange(r), settings.costing_method)).filter((p) => n(p.qty_sold) > 0);
  const fin = financial(user);
  const key = sortBy === 'profit' && fin ? 'profit' : sortBy === 'quantity' ? 'qty_sold' : 'revenue';
  items.sort((a, b) => n(b[key]) - n(a[key]));
  return {
    davr: PERIOD_LABEL[period] || 'Bugun',
    tovarlar: items.slice(0, 10).map((p) => ({
      nomi: p.name, sotildi: n(p.qty_sold), birlik: p.unit, savdo: n(p.revenue), ...(fin ? { foyda: n(p.profit), marja_foiz: n(p.margin) } : {}),
    })),
    ...(sortBy === 'profit' && !fin ? { eslatma: "Foydani faqat do'kon egasi ko'radi — savdo bo'yicha saralandi" } : {}),
  };
}

async function expenses(user, { period }) {
  if (!['expenses.view', 'reports.view'].some((k) => can(user, k))) return { xato: "Xarajatlarni ko'rishga ruxsat yo'q" };
  const r = periodRange(period);
  const { rows } = await pool.query(
    `SELECT category, SUM(amount) AS total, COUNT(*)::int AS cnt FROM expenses
      WHERE expense_date BETWEEN $1::date AND $2::date GROUP BY category ORDER BY SUM(amount) DESC`,
    [r.from, r.to],
  );
  return {
    davr: PERIOD_LABEL[period] || 'Bugun',
    turlari: rows.map((x) => ({ turi: EXPENSE_LABEL[x.category] || x.category, summa: n(x.total), soni: x.cnt })),
    jami: round2(rows.reduce((s, x) => s + n(x.total), 0)),
  };
}

const PERIOD_SCHEMA = { type: 'string', enum: Object.keys(PERIOD_LABEL), description: 'Davr: today, yesterday, last_7_days, last_30_days, this_month, last_month' };
const obj = (properties) => ({ type: 'object', properties, required: Object.keys(properties), additionalProperties: false });

export const TOOLS = [
  { name: 'sales_summary', strict: true, description: "Tanlangan davrdagi savdo: tushum, cheklar soni; ruxsat bo'lsa — olgan narx, tovardan foyda, xarajatlar, sof foyda, kelgan yuk.", input_schema: obj({ period: PERIOD_SCHEMA }) },
  { name: 'find_products', strict: true, description: "Tovarni nomi, shtrix-kodi, artikuli yoki xususiyati (rang, eni...) bo'yicha topadi: qoldiq, birlik, sotuv narxi, holat, rulonlar soni.", input_schema: obj({ query: { type: 'string', description: "Qidiruv so'zi, masalan: atlas" } }) },
  { name: 'low_stock', strict: true, description: 'Tugagan va kam qolgan tovarlar ro\'yxati.', input_schema: obj({}) },
  { name: 'debts', strict: true, description: "Qarzlar: customers — mijozlar sizga qarzi (nasiya); suppliers — siz yetkazib beruvchilarga qarzingiz. Muddatlari bilan.", input_schema: obj({ who: { type: 'string', enum: ['customers', 'suppliers'] } }) },
  { name: 'cash_balance', strict: true, description: 'Hozir kassadagi pul: naqd, karta, o\'tkazma.', input_schema: obj({}) },
  { name: 'top_products', strict: true, description: "Davr bo'yicha eng ko'p sotilgan yoki eng foydali tovarlar (10 tagacha).", input_schema: obj({ period: PERIOD_SCHEMA, sort_by: { type: 'string', enum: ['revenue', 'profit', 'quantity'] } }) },
  { name: 'expenses', strict: true, description: 'Davrdagi xarajatlar turlari bo\'yicha (ovqat, suv, ijara, maosh...).', input_schema: obj({ period: PERIOD_SCHEMA }) },
];

const RUN = {
  sales_summary: salesSummary,
  find_products: findProducts,
  low_stock: (user) => lowStock(user),
  debts,
  cash_balance: (user) => cashBalance(user),
  top_products: topProducts,
  expenses,
};

export async function runTool(name, input, user) {
  const fn = RUN[name];
  if (!fn) return { xato: "Bunday vosita yo'q" };
  return fn(user, input || {});
}

// ---------- Bepul «Tez savollar» (AI'siz) ----------

export const QUICK = [
  { key: 'sales_today', label: 'Bugun qancha sotdim?' },
  { key: 'profit_today', label: 'Bugun qancha foyda qildim?' },
  { key: 'low_stock', label: 'Nima tugayapti?' },
  { key: 'debts', label: 'Kim qarzdor?' },
  { key: 'cash', label: 'Kassada qancha pul bor?' },
  { key: 'top_today', label: "Bugun eng ko'p nima sotildi?" },
];

export async function quickAnswer(topic, user) {
  if (topic === 'sales_today') {
    const s = await salesSummary(user, { period: 'today' });
    if (!s.cheklar) return { answer: "Bugun hali sotuv bo'lmadi.", link: { href: '#/sales', label: 'Sotishni boshlash' } };
    return { answer: `Bugun **${som(s.savdo)}** sotdingiz — ${s.cheklar} ta chek.`, link: { href: '#/sales/history', label: "Cheklarni ko'rish" } };
  }
  if (topic === 'profit_today') {
    if (!financial(user)) return { answer: "Foydani faqat do'kon egasi ko'radi." };
    const s = await salesSummary(user, { period: 'today' });
    if (!s.cheklar && !s.xarajatlar) return { answer: "Bugun hali savdo ham, xarajat ham bo'lmadi." };
    const word = s.sof_foyda < 0 ? 'Zarar' : 'Sof foyda';
    return {
      answer: `${word}: **${s.sof_foyda < 0 ? '−' : '+'}${som(Math.abs(s.sof_foyda))}**\n`
        + `Sotdingiz ${som(s.savdo)} − xarid narxi ${som(s.olgan_narx)} = sotuvdan foyda ${som(s.tovardan_foyda)}`
        + `${s.xarajatlar ? ` − xarajatlar ${som(s.xarajatlar)}` : ''}${s.buzilgan_tovar ? ` − buzilgan tovar ${som(s.buzilgan_tovar)}` : ''}.`,
      link: { href: '#/reports', label: 'Batafsil hisobot' },
    };
  }
  if (topic === 'low_stock') {
    const l = await lowStock(user);
    if (!l.tugagan.length && !l.kam_qolgan.length) return { answer: "Hammasi yetarli — tugagan yoki kam qolgan tovar yo'q." };
    const lines = [];
    if (l.tugagan.length) lines.push(`**Tugagan (${l.tugagan.length}):** ${l.tugagan.slice(0, 8).map((x) => x.nomi).join(', ')}${l.tugagan.length > 8 ? '…' : ''}`);
    if (l.kam_qolgan.length) lines.push(`**Kam qolgan (${l.kam_qolgan.length}):** ${l.kam_qolgan.slice(0, 8).map((x) => `${x.nomi} — ${fmt(x.qoldiq)} ${x.birlik}`).join(', ')}${l.kam_qolgan.length > 8 ? '…' : ''}`);
    return { answer: lines.join('\n'), link: { href: '#/stockin', label: 'Tovar kiritish' } };
  }
  if (topic === 'debts') {
    const d = await debts(user, { who: 'customers' });
    if (d.xato) return { answer: d.xato };
    if (!d.soni) return { answer: "Hech kim sizga qarzdor emas." };
    const overdue = d.menga_qarzdorlar.filter((c) => c.muddati_otgani > 0);
    return {
      answer: `**${d.soni} kishi** sizga jami **${som(d.jami)}** qarzdor.\n`
        + d.menga_qarzdorlar.slice(0, 5).map((c) => `- ${c.kim} — ${som(c.qarz)}${c.muddati_otgani > 0 ? ' (muddati o\'tgan)' : ''}`).join('\n')
        + (overdue.length ? `\nMuddati o'tganlar: ${overdue.length} kishi.` : ''),
      link: { href: '#/debts', label: 'Qarzlarga o\'tish' },
    };
  }
  if (topic === 'cash') {
    const c = await cashBalance(user);
    if (c.xato) return { answer: c.xato };
    return { answer: `Kassada naqd **${som(c.naqd)}**, kartada ${som(c.karta)}${c.otkazma ? `, o'tkazmada ${som(c.otkazma)}` : ''}.`, link: { href: '#/cash?tab=cash', label: 'Kassadagi pul' } };
  }
  if (topic === 'top_today') {
    const t = await topProducts(user, { period: 'today', sort_by: 'revenue' });
    if (!t.tovarlar.length) return { answer: "Bugun hali hech narsa sotilmadi." };
    return { answer: `Bugun eng ko'p sotilganlar:\n${t.tovarlar.slice(0, 5).map((p, i) => `${i + 1}. ${p.nomi} — ${fmt(p.sotildi)} ${p.birlik} (${som(p.savdo)})`).join('\n')}` };
  }
  throw new HttpError(400, "Bunday savol yo'q");
}

// ---------- Istalgan savol (Claude) ----------

const SYSTEM_PROMPT = `Siz OMBOR PRO do'kon dasturidagi yordamchisiz. Savol beruvchilar — bozor va do'kon sotuvchilari, ko'pchiligi kompyuterni yaxshi bilmaydi.

Qanday javob berasiz:
- Doim o'zbek tilida (lotin yozuvida), juda sodda so'zlar bilan, qisqa: odatda 1–5 qator.
- Raqamlarni faqat vositalardan (tools) olasiz — hech qachon o'zingizdan to'qimang yoki taxmin qilmang. Ma'lumot kerak bo'lsa, avval vositani chaqiring.
- Pulni shunday yozing: 1 250 000 so'm. Muhim raqamni **qalin** qiling.
- «Tannarx», «marja», «tushum» kabi murakkab so'zlar o'rniga: «xarid narxi», «sotuvdan foyda», «sotuv», «qolgan mahsulot», «mijozlar qarzi».
- Vosita «xato» yoki «ruxsat yo'q» desa — shuni oddiy tilda ayting, boshqa yo'l bilan topishga urinmang.
- Siz hech narsani o'zgartira olmaysiz (sotish, o'chirish, narx yozish). Bunday so'rovda qaysi bo'limda qanday qilinishini qisqa ayting.
- Do'kon va dasturga aloqasi yo'q savolga bir jumla bilan javob bering va do'kon ishiga qaytaring.
- Maslahat berishda aniq bo'ling: qaysi tovar, qancha, nima uchun (raqam bilan).

Dastur bo'limlari (yo'l ko'rsatish uchun):
- Bosh sahifa — bugun qancha sotildi, qancha foyda qoldi, kassadagi pul, nima tugayapti, bugun nima qilish kerak.
- Sotuv — xaridorga sotish: tovarni bosing, metr/kg bo'lsa miqdorni yozing, rulonni tanlash mumkin; pastda to'lov turi va «Sotish» tugmasi.
- Sotuvlar tarixi — barcha cheklar, qaytarish shu yerda.
- Tovar kiritish — kelgan tovarni omborga: tepadagi qatorga nomini yozing, nechta kelgani va xarid narxini yozing, Enter. Har biri darhol omborga tushadi; xato bo'lsa o'ngdagi ro'yxatda «Bekor qilish». Rulonda kelsa — nechta rulon va uzunligi; kiyimda — har bir o'lchamdan nechta. Ichida «Ko'p tovar bitta yuk» (yo'l kira, chegirma bilan) va «Kelgan yuklar».
- Mahsulotlar — ro'yxat, narxlar, rasmlar; «Yangi mahsulot» tugmasi; Excel'dan yuklash.
- Ombor — «Qolgan mahsulot» (qoldiq va harakatlar tarixi, «Zarar / tuzatish») va «Mahsulotlarni sanash».
- Xarajatlar — obed, suv, ijara... (sotuv pulidan ayriladi) va «Kassadagi pul» (smena, naqd/karta).
- Mijozlar va qarzlar — kim qancha qarz (menga qarzdorlar va men qarzdorman), to'lov qabul qilish, mijozlar ro'yxati.
- Yetkazib beruvchilar — tovar kimdan keladi, ularga qarz.
- Hisobotlar — foyda va zarar (Excel/PDF), «Grafiklar», «Maslahatlar», «Xodimlar natijasi».
- Sozlamalar — «Do'kon», «Xodimlar» (sotuvchiga login berish), «Amallar tarixi», «Bildirishnomalar».
- Har sahifada yuqorida «+» tugmasi bor: tez qo'shish (sotuv, tovar kiritish, yangi mahsulot, xarajat, qarz yozish, mijoz).

Foyda qanday hisoblanadi: sotuvdan foyda = sotuv − sotilgan tovarlarning xarid narxi; sof foyda = sotuvdan foyda − xarajatlar − buzilgan tovar. Kassir (sotuvchi) xarid narxi va foydani ko'rmaydi.`;

let defaultFactory = () => (process.env.ANTHROPIC_API_KEY ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }) : null);
let clientFactory = defaultFactory;
// Sinovlar uchun: haqiqiy API o'rniga soxta mijoz
export function setAiClientFactory(fn) { clientFactory = fn || defaultFactory; }

const ROLE_LABEL = { owner: 'egasi', administrator: 'administrator', cashier: 'kassir', warehouse: 'omborchi', accountant: 'buxgalter' };
const WEEKDAYS = ['yakshanba', 'dushanba', 'seshanba', 'chorshanba', 'payshanba', 'juma', 'shanba'];

function cleanHistory(history) {
  if (!Array.isArray(history)) return [];
  const items = history
    .filter((h) => h && (h.role === 'user' || h.role === 'assistant') && typeof h.content === 'string' && h.content.trim())
    .slice(-6)
    .map((h) => ({ role: h.role, content: h.content.slice(0, 1500) }));
  while (items.length && items[0].role !== 'user') items.shift();
  // Navbat: user → assistant → user ...
  const out = [];
  for (const h of items) {
    if (out.length && out[out.length - 1].role === h.role) out[out.length - 1] = h;
    else out.push(h);
  }
  if (out.length && out[out.length - 1].role === 'user') out.pop();
  return out;
}

function addUsage(acc, resp, model) {
  const u = resp.usage || {};
  const p = PRICES_USD[model] || PRICES_USD['claude-opus-5-5'];
  const input = n(u.input_tokens);
  const output = n(u.output_tokens);
  const cr = n(u.cache_read_input_tokens);
  const cw = n(u.cache_creation_input_tokens);
  acc.input += input + cr + cw;
  acc.output += output;
  acc.cost += (input * p.in + output * p.out + cr * p.cacheRead + cw * p.cacheWrite) / 1e6;
}

async function recordUsage(storeId, acc, questions) {
  if (!acc.input && !acc.output && !questions) return;
  await pool.query(
    `INSERT INTO core.ai_usage (store_id, month, questions, input_tokens, output_tokens, cost_usd)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (store_id, month) DO UPDATE SET
       questions = core.ai_usage.questions + EXCLUDED.questions,
       input_tokens = core.ai_usage.input_tokens + EXCLUDED.input_tokens,
       output_tokens = core.ai_usage.output_tokens + EXCLUDED.output_tokens,
       cost_usd = core.ai_usage.cost_usd + EXCLUDED.cost_usd`,
    [storeId, monthStart(), questions, Math.round(acc.input), Math.round(acc.output), acc.cost],
  );
}

// Anthropic hisobida pul tugagan (400 «credit balance is too low»)
const noCredit = (err) => err instanceof Anthropic.BadRequestError && /credit balance/i.test(String(err.message));

function aiError(err) {
  if (err instanceof HttpError) return err;
  if (noCredit(err)) {
    console.error('AI: Anthropic hisobida mablag\' yo\'q');
    return new HttpError(503, "AI vaqtincha ishlamayapti. Dastur egasiga ayting (AI hisobini to'ldirish kerak)");
  }
  if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) {
    return new HttpError(503, "AI kaliti ishlamayapti. Dastur egasiga ayting");
  }
  if (err instanceof Anthropic.RateLimitError || err instanceof Anthropic.OverloadedError) {
    return new HttpError(503, "AI hozir band. Bir daqiqadan keyin qayta urinib ko'ring");
  }
  if (err instanceof Anthropic.APIConnectionError) return new HttpError(503, "AI bilan aloqa yo'q. Internetni tekshirib, qayta urinib ko'ring");
  if (err instanceof Anthropic.APIError) {
    console.error('AI so\'rovida xato:', err.status, err.message);
    return new HttpError(502, "AI javob bera olmadi. Qayta urinib ko'ring");
  }
  console.error('AI xatosi:', err);
  return new HttpError(500, "AI javob bera olmadi. Qayta urinib ko'ring");
}

// Bir foydalanuvchi daqiqasiga ko'pi bilan 8 ta savol (tasodifan ko'p bosilsa xarajat oshmasligi uchun)
const recent = new Map();
function throttle(key) {
  const now = Date.now();
  const list = (recent.get(key) || []).filter((t) => now - t < 60000);
  if (list.length >= 8) throw new HttpError(429, "Juda tez-tez so'rayapsiz. Bir daqiqa kuting");
  list.push(now);
  recent.set(key, list);
}

// Platforma egasi uchun: AI ulanishini tekshirish — kichik so'rov yuborib, xatoning aniq sababini aytadi
export async function testConnection() {
  const client = clientFactory();
  if (!client) {
    return { ok: false, code: 'no_key', title: "Kalit qo'shilmagan", fix: "Cloudflare'da ANTHROPIC_API_KEY maxfiy qiymatini qo'shing (pastdagi 4 qadam)" };
  }
  const t0 = Date.now();
  try {
    const resp = await client.messages.create({
      model: 'claude-haiku-5-5',
      max_tokens: 300,
      output_config: { effort: 'low' },
      messages: [{ role: 'user', content: "Faqat bitta so'z bilan javob ber: Tayyor" }],
    });
    const text = resp.content.filter((b) => b.type === 'text').map((b) => b.text).join(' ').trim();
    return { ok: true, model: 'Claude Haiku 5.5', ms: Date.now() - t0, answer: text.slice(0, 60) };
  } catch (err) {
    const fail = (code, title, fix) => ({ ok: false, code, title, fix, detail: String(err?.message || '').slice(0, 300) });
    if (err instanceof Anthropic.AuthenticationError) {
      return fail('bad_key', "Kalit noto'g'ri yoki o'chirilgan", "console.anthropic.com → API Keys'da yangi kalit yarating va Cloudflare'dagi ANTHROPIC_API_KEY qiymatini almashtiring");
    }
    if (noCredit(err)) {
      return fail('no_credit', "Anthropic hisobida mablag' yo'q", "console.anthropic.com → Billing bo'limida hisobni to'ldiring (kamida 5 $). Bir necha daqiqadan keyin qayta tekshiring");
    }
    if (err instanceof Anthropic.PermissionDeniedError) {
      return fail('forbidden', 'Kalitga ruxsat berilmagan', "Anthropic hisobingiz cheklangan bo'lishi mumkin. console.anthropic.com'da hisob holatini tekshiring");
    }
    if (err instanceof Anthropic.RateLimitError) {
      return fail('rate_limit', 'Juda ko\'p so\'rov', 'Bir daqiqadan keyin qayta tekshiring');
    }
    if (err instanceof Anthropic.OverloadedError || err instanceof Anthropic.InternalServerError) {
      return fail('busy', 'Anthropic serveri hozir band', "Birozdan keyin qayta tekshiring. Bu sizdagi xato emas");
    }
    if (err instanceof Anthropic.APIConnectionError) {
      return fail('network', "Server Anthropic'ga ulana olmadi", "Tarmoq muammosi. Birozdan keyin qayta tekshiring");
    }
    if (err instanceof Anthropic.APIError) {
      return fail('api', `Anthropic xato qaytardi (${err.status || '?'})`, 'Pastdagi xabarni dastur egasiga (dasturchiga) yuboring');
    }
    console.error('AI ulanishini tekshirishda xato:', err);
    return fail('unknown', "Noma'lum xato", 'Pastdagi xabarni dasturchiga yuboring');
  }
}

export async function askAI({ user, storeId, question, history }) {
  const q = String(question || '').trim();
  if (!q) throw new HttpError(400, 'Savolingizni yozing');
  if (q.length > 1000) throw new HttpError(400, "Savol juda uzun (1000 belgigacha)");
  const st = await planStatus(storeId);
  if (!st.active) throw new HttpError(402, "Istalgan savolga javob beradigan AI — pullik xizmat. Tez savollar bepul");
  if (st.used >= st.limit) throw new HttpError(429, `Bu oydagi savollar tugadi (${st.limit} ta). Keyingi oy yangilanadi yoki tarifni oshiring`);
  const client = clientFactory();
  if (!client) throw new HttpError(503, "AI hali ulanmagan. Dastur egasi AI kalitini qo'shishi kerak");
  throttle(`${storeId}:${user.id}`);

  const cfg = planConfig()[st.plan];
  const settings = await getSettings(pool);
  const today = todayLocal();
  const wd = WEEKDAYS[new Date(`${today}T12:00:00Z`).getUTCDay()];
  const context = `[Bugun: ${today}, ${wd}. Do'kon: ${settings.store_name || ''}. Savol beruvchi: ${user.full_name} (${ROLE_LABEL[user.role] || user.role}).]`;
  const messages = [...cleanHistory(history), { role: 'user', content: `${context}\n\n${q}` }];
  const acc = { input: 0, output: 0, cost: 0 };
  let answer = '';
  let ok = false;
  try {
    for (let step = 0; step < 6; step += 1) {
      const params = {
        model: cfg.model,
        max_tokens: 8000,
        system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
        tools: TOOLS,
        messages,
        output_config: { effort: cfg.effort },
      };
      // Opus: xavfsizlik tizimi rad etsa, server o'zi boshqa modelda qayta urinadi
      const resp = cfg.model === 'claude-opus-5-5'
        ? await client.beta.messages.create({ ...params, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' })
        : await client.messages.create(params);
      addUsage(acc, resp, cfg.model);
      if (resp.stop_reason === 'refusal') {
        answer = "Kechirasiz, bu savolga javob bera olmayman. Do'kon bo'yicha boshqa savol bering.";
        break;
      }
      const uses = resp.content.filter((b) => b.type === 'tool_use');
      if ((resp.stop_reason === 'tool_use' && uses.length) || resp.stop_reason === 'pause_turn') {
        messages.push({ role: 'assistant', content: resp.content });
        if (!uses.length) continue;
        const results = [];
        for (const t of uses) {
          try {
            const data = await runTool(t.name, t.input, user);
            results.push({ type: 'tool_result', tool_use_id: t.id, content: JSON.stringify(data) });
          } catch (err) {
            console.error('AI vositasida xato:', t.name, err.message);
            results.push({ type: 'tool_result', tool_use_id: t.id, is_error: true, content: "Ma'lumotni olishda xato" });
          }
        }
        messages.push({ role: 'user', content: results });
        continue;
      }
      answer = resp.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();
      if (resp.stop_reason === 'max_tokens') answer += "\n\n(Javob uzun bo'lgani uchun qisqartirildi)";
      break;
    }
    if (!answer) answer = "Kechirasiz, javob tayyorlay olmadim. Savolni boshqacha yozib ko'ring.";
    ok = true;
  } catch (err) {
    throw aiError(err);
  } finally {
    await recordUsage(storeId, acc, ok ? 1 : 0).catch((e) => console.error('AI xarajatini yozishda xato:', e.message));
  }
  return { answer, used: st.used + 1, limit: st.limit, plan: st.plan };
}
