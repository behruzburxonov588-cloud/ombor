// Bildirishnomalar markazi: ogohlantirishlarni aniqlash, rejali xulosalar, takrorlanishdan himoya
// va tashqi kanallarga (Telegram) yetkazish.
//
// Takrorlanishga qarshi qoidalar:
//  - har bir bildirishnomaning noyob dedup_key kaliti bor (bazada UNIQUE) — ikki marta yaratilmaydi;
//  - kam qolgan tovar haqida qayta xabar faqat "eslatish oralig'i" o'tgach yuboriladi;
//  - haftalik tahlillar (savdo pasayishi, xarajatlar) haftasiga ko'pi bilan bir marta;
//  - Telegramga har bir xabar har bir chatga faqat bir marta yuboriladi (notification_deliveries UNIQUE).
import crypto from 'node:crypto';
import { HttpError, round2, addDays } from '../util.js';
import { getSettings, saveSettings } from './settings.js';
import { mondayOf } from './analytics.js';
import { currentSchema } from '../db.js';
import {
  dailySummary, weeklySummary, monthlySummary, computeInsights, money, dmy,
} from './insights.js';

export const TYPE_GROUPS = {
  daily_summary: { label: 'Kunlik xulosa', hint: "Har kuni belgilangan vaqtda: savdo, foyda, xarajat, eng ko'p sotilganlar", audience: ['reports.view'] },
  weekly_summary: { label: 'Haftalik xulosa', hint: "O'tgan hafta natijalari va oldingi hafta bilan taqqoslash", audience: ['reports.view'] },
  monthly_summary: { label: 'Oylik hisobot', hint: "O'tgan oy natijalari", audience: ['reports.view'] },
  low_stock: { label: 'Kam qolgan va tugagan tovarlar', hint: 'Minimal qoldiqdan kamaygan yoki tugagan tovarlar', audience: ['stock.view', 'products.view', 'purchases.create'] },
  debt_reminder: { label: 'Qarz eslatmalari', hint: "Muddati o'tgan va yaqinlashgan mijoz qarzlari", audience: ['customers.view', 'payments.create'] },
  supplier_due: { label: "Yetkazib beruvchiga to'lov", hint: "Yetkazib beruvchiga qarzni to'lash muddati yaqin yoki o'tgan", audience: ['suppliers.view', 'purchases.view'] },
  expense_spike: { label: "G'ayrioddiy xarajatlar", hint: "Haftalik xarajat odatdagidan sezilarli ko'p bo'lsa", audience: ['reports.view', 'expenses.view'] },
  sales_decline: { label: "Savdo pasayishi va marja o'zgarishi", hint: 'Umumiy savdo, alohida tovarlar yoki foyda marjasi pasaysa', audience: ['reports.view'] },
  inventory_change: { label: "Muhim ombor o'zgarishlari", hint: "Katta zarar/tuzatish, yo'qotishlar o'sishi, qoldiq nomuvofiqligi", audience: ['stock.view', 'reports.view'] },
  business_event: { label: 'Muhim voqealar', hint: 'Smena kassasidagi farq, katta qaytarish, tasdiqlangan sanash', audience: ['reports.view', 'cash.view'] },
};
export const CHANNELS = ['app', 'telegram', 'browser'];

export const NOTIFY_DEFAULTS = {
  types: Object.fromEntries(Object.keys(TYPE_GROUPS).map((k) => [k, { enabled: true, channels: ['app', 'browser'] }])),
  schedule: { daily_time: '21:00', weekly_day: 1, weekly_time: '09:00', monthly_day: 1, monthly_time: '09:00' },
  thresholds: {
    expense_spike_pct: 50,
    sales_decline_pct: 30,
    product_decline_pct: 40,
    margin_change_pp: 5,
    inventory_change_value: 500000,
    large_refund_value: 500000,
    debt_reminder_days: 3,
    restock_remind_days: 7,
  },
  quiet_hours: { enabled: false, start: '22:00', end: '08:00' },
  telegram: { enabled: false, chat_ids: [] },
};

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const clone = (o) => JSON.parse(JSON.stringify(o));

// ---------- Sozlamalar ----------

function mergeConfig(raw) {
  const c = clone(NOTIFY_DEFAULTS);
  if (!raw || typeof raw !== 'object') return c;
  for (const k of Object.keys(c.types)) {
    const t = raw.types?.[k];
    if (t && typeof t === 'object') {
      if (typeof t.enabled === 'boolean') c.types[k].enabled = t.enabled;
      if (Array.isArray(t.channels)) c.types[k].channels = t.channels.filter((x) => CHANNELS.includes(x));
    }
  }
  Object.assign(c.schedule, pickValid(raw.schedule, c.schedule));
  Object.assign(c.thresholds, pickValid(raw.thresholds, c.thresholds));
  Object.assign(c.quiet_hours, pickValid(raw.quiet_hours, c.quiet_hours));
  if (raw.telegram && typeof raw.telegram === 'object') {
    if (typeof raw.telegram.enabled === 'boolean') c.telegram.enabled = raw.telegram.enabled;
    if (Array.isArray(raw.telegram.chat_ids)) c.telegram.chat_ids = raw.telegram.chat_ids.map(String);
  }
  return c;
}

function pickValid(src, defaults) {
  const out = {};
  if (!src || typeof src !== 'object') return out;
  for (const [k, def] of Object.entries(defaults)) {
    if (src[k] === undefined) continue;
    if (typeof def === typeof src[k]) out[k] = src[k];
  }
  return out;
}

export async function getNotifyConfig(db) {
  const { rows } = await db.query("SELECT key, value FROM settings WHERE key IN ('notify_config', 'telegram_bot_token')");
  const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  const config = mergeConfig(map.notify_config);
  const settings = await getSettings(db);
  // Eski sozlamalar bilan moslik (Sozlamalar sahifasidagi umumiy kalitlar)
  if (settings.notify_low_stock === false) config.types.low_stock.enabled = false;
  if (settings.notify_debts === false) config.types.debt_reminder.enabled = false;
  return { config, token: typeof map.telegram_bot_token === 'string' ? map.telegram_bot_token : '' };
}

// Tokenning faqat oxirgi 4 belgisi ko'rsatiladi
export function publicConfig({ config, token }) {
  return {
    ...config,
    telegram: { ...config.telegram, token_set: Boolean(token), token_hint: token ? `…${token.slice(-4)}` : '' },
  };
}

export function validateConfig(input) {
  if (!input || typeof input !== 'object') throw new HttpError(400, "Sozlamalar noto'g'ri");
  const c = mergeConfig(input);
  for (const [k, v] of Object.entries(c.schedule)) {
    if (k.endsWith('_time') && !TIME_RE.test(v)) throw new HttpError(400, "Vaqt HH:MM formatida bo'lishi kerak (masalan 21:00)");
  }
  if (!Number.isInteger(c.schedule.weekly_day) || c.schedule.weekly_day < 1 || c.schedule.weekly_day > 7) {
    throw new HttpError(400, "Hafta kuni 1 (dushanba) dan 7 (yakshanba) gacha bo'lishi kerak");
  }
  if (!Number.isInteger(c.schedule.monthly_day) || c.schedule.monthly_day < 1 || c.schedule.monthly_day > 28) {
    throw new HttpError(400, "Oyning kuni 1 dan 28 gacha bo'lishi kerak");
  }
  const limits = {
    expense_spike_pct: [10, 1000], sales_decline_pct: [5, 95], product_decline_pct: [10, 95], margin_change_pp: [1, 50],
    inventory_change_value: [0, 1e12], large_refund_value: [0, 1e12], debt_reminder_days: [1, 30], restock_remind_days: [1, 60],
  };
  for (const [k, [min, max]] of Object.entries(limits)) {
    const v = Number(c.thresholds[k]);
    if (!Number.isFinite(v) || v < min || v > max) throw new HttpError(400, `"${k}" qiymati ${min} va ${max} oralig'ida bo'lishi kerak`);
    c.thresholds[k] = v;
  }
  if (!TIME_RE.test(c.quiet_hours.start) || !TIME_RE.test(c.quiet_hours.end)) {
    throw new HttpError(400, "Tinch soatlar HH:MM formatida bo'lishi kerak");
  }
  const ids = [...new Set(c.telegram.chat_ids.map((x) => String(x).trim()).filter(Boolean))];
  if (ids.length > 10) throw new HttpError(400, "Ko'pi bilan 10 ta Telegram chat qo'shish mumkin");
  for (const id of ids) {
    if (!/^-?\d{3,20}$/.test(id) && !/^@[A-Za-z0-9_]{4,64}$/.test(id)) {
      throw new HttpError(400, `Telegram chat ID noto'g'ri: ${id}`);
    }
  }
  c.telegram.chat_ids = ids;
  return c;
}

export async function saveNotifyConfig(db, input, { token, clearToken } = {}) {
  const config = validateConfig(input);
  await db.query(
    `INSERT INTO settings (key, value, updated_at) VALUES ('notify_config', $1, now())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
    [JSON.stringify(config)],
  );
  if (clearToken) {
    await db.query("DELETE FROM settings WHERE key = 'telegram_bot_token'");
  } else if (token) {
    if (!/^\d{5,15}:[A-Za-z0-9_-]{20,80}$/.test(token)) {
      throw new HttpError(400, "Telegram bot tokeni noto'g'ri. BotFather bergan tokenni to'liq kiriting");
    }
    await db.query(
      `INSERT INTO settings (key, value, updated_at) VALUES ('telegram_bot_token', $1, now())
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
      [JSON.stringify(token)],
    );
  }
  await saveSettings(db, {
    notify_low_stock: config.types.low_stock.enabled,
    notify_debts: config.types.debt_reminder.enabled,
  });
  return getNotifyConfig(db);
}

// ---------- Vaqt yordamchilari (Toshkent vaqti) ----------

export function localClock(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Tashkent', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false, weekday: 'short',
  }).formatToParts(date);
  const g = (t) => parts.find((p) => p.type === t)?.value;
  const wd = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 }[g('weekday')];
  const hour = g('hour') === '24' ? '00' : g('hour');
  return { date: `${g('year')}-${g('month')}-${g('day')}`, time: `${hour}:${g('minute')}`, weekday: wd };
}

export function inQuietHours(cfg, date = new Date()) {
  if (!cfg.quiet_hours?.enabled) return false;
  const { time } = localClock(date);
  const { start, end } = cfg.quiet_hours;
  return start <= end ? time >= start && time < end : time >= start || time < end;
}

const hash = (v) => crypto.createHash('sha1').update(String(v)).digest('hex').slice(0, 12);
const epochDay = (date) => Math.floor(Date.parse(`${date}T00:00:00Z`) / 86400000);

// ---------- Yaratish va yetkazish ----------

export async function createNotification(db, cfg, n) {
  const group = TYPE_GROUPS[n.type_group];
  if (!group) throw new Error(`Noma'lum bildirishnoma turi: ${n.type_group}`);
  const { rows } = await db.query(
    `INSERT INTO notifications (kind, type_group, level, title, body, link, audience, data, dedup_key)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     ON CONFLICT (dedup_key) DO NOTHING RETURNING *`,
    [n.kind, n.type_group, n.level, n.title.slice(0, 200), n.body.slice(0, 4000), n.link || null,
      n.audience || group.audience, n.data ? JSON.stringify(n.data) : null, n.dedup_key],
  );
  const row = rows[0] || null;
  if (row && cfg.telegram.enabled && cfg.types[n.type_group]?.channels.includes('telegram')) {
    for (const chat of cfg.telegram.chat_ids) {
      await db.query(
        `INSERT INTO notification_deliveries (notification_id, channel, target, status)
         VALUES ($1, 'telegram', $2, 'pending') ON CONFLICT DO NOTHING`,
        [row.id, chat],
      );
    }
  }
  return row;
}

const escHtml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function telegramText(n, storeName) {
  const mark = { critical: '🔴', warning: '🟠', success: '🟢', info: '🔵' }[n.level] || '';
  return `${mark} <b>${escHtml(n.title)}</b>\n${escHtml(n.body)}\n\n<i>${escHtml(storeName || 'OMBOR PRO')}</i>`;
}

const apiBase = () => process.env.TELEGRAM_API_BASE || 'https://api.telegram.org';

function cleanError(err, token) {
  return String(err?.message || err || 'Xatolik').split(token || '\u0000').join('***').slice(0, 300);
}

export async function telegramCall(token, method, body) {
  if (!token) throw new HttpError(400, "Telegram bot tokeni kiritilmagan");
  let res;
  try {
    res = await fetch(`${apiBase()}/bot${token}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {}),
      signal: AbortSignal.timeout(10000),
    });
  } catch (err) {
    throw new Error(`Telegram serveriga ulanib bo'lmadi: ${cleanError(err, token)}`);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) throw new Error(cleanError(data.description || `HTTP ${res.status}`, token));
  return data.result;
}

export async function sendTelegram(token, chatId, text) {
  return telegramCall(token, 'sendMessage', { chat_id: chatId, text, parse_mode: 'HTML', disable_web_page_preview: true });
}

// Botga yozgan chatlarni topish (egasi chat ID ni qo'lda qidirmasligi uchun)
export async function discoverTelegramChats(token) {
  const updates = await telegramCall(token, 'getUpdates', { limit: 100, allowed_updates: ['message', 'channel_post', 'my_chat_member'] });
  const chats = new Map();
  for (const u of updates || []) {
    const chat = u.message?.chat || u.channel_post?.chat || u.my_chat_member?.chat;
    if (!chat) continue;
    chats.set(String(chat.id), {
      id: String(chat.id),
      type: chat.type,
      title: chat.title || [chat.first_name, chat.last_name].filter(Boolean).join(' ') || chat.username || String(chat.id),
      username: chat.username || null,
    });
  }
  return [...chats.values()];
}

// Kutilayotgan Telegram xabarlarini yuboradi (tinch soatlarda kutadi; muvaffaqiyatsiz bo'lsa 3 martagacha qayta)
export async function deliverPending(db, cfg, token, storeName) {
  if (!cfg.telegram.enabled || !token || inQuietHours(cfg)) return { sent: 0, failed: 0 };
  const { rows } = await db.query(
    `UPDATE notification_deliveries d SET status = 'sending', attempts = attempts + 1
      WHERE d.id IN (
        SELECT id FROM notification_deliveries
         WHERE channel = 'telegram' AND (status = 'pending' OR (status = 'failed' AND attempts < 3))
           AND created_at > now() - interval '2 days'
         ORDER BY id LIMIT 25 FOR UPDATE SKIP LOCKED)
      RETURNING d.*`,
  );
  let sent = 0;
  let failed = 0;
  for (const d of rows) {
    const { rows: n } = await db.query('SELECT * FROM notifications WHERE id = $1', [d.notification_id]);
    if (!n[0]) continue;
    try {
      await sendTelegram(token, d.target, telegramText(n[0], storeName));
      await db.query("UPDATE notification_deliveries SET status = 'sent', sent_at = now(), error = NULL WHERE id = $1", [d.id]);
      sent += 1;
    } catch (err) {
      await db.query("UPDATE notification_deliveries SET status = 'failed', error = $2 WHERE id = $1", [d.id, cleanError(err, token)]);
      failed += 1;
    }
  }
  return { sent, failed };
}

// ---------- Ogohlantirishlarni aniqlash ----------

async function recentlyAlerted(db, kind, key, days) {
  const { rows } = await db.query(
    `SELECT DISTINCT jsonb_array_elements_text(data->$2) AS id FROM notifications
      WHERE kind = $1 AND created_at > now() - ($3::int * interval '1 day')`,
    [kind, key, days],
  );
  return new Set(rows.map((r) => String(r.id)));
}

async function checkStock(db, cfg, today) {
  const created = [];
  const { rows } = await db.query(
    `SELECT p.id, p.name, p.stock_qty, p.min_stock, un.name AS unit,
            CASE WHEN p.stock_qty <= 0 THEN 'out' ELSE 'low' END AS state
       FROM products p JOIN units un ON un.id = p.base_unit_id
      WHERE NOT p.is_archived
        AND (p.stock_qty <= 0 OR (p.min_stock > 0 AND p.stock_qty <= p.min_stock))
        AND EXISTS (SELECT 1 FROM stock_movements m WHERE m.product_id = p.id)
      ORDER BY p.name`,
  );
  for (const state of ['out', 'low']) {
    const kind = state === 'out' ? 'out_of_stock' : 'low_stock';
    const seen = await recentlyAlerted(db, kind, 'product_ids', cfg.thresholds.restock_remind_days);
    const fresh = rows.filter((r) => r.state === state && !seen.has(String(r.id)));
    if (!fresh.length) continue;
    const ids = fresh.map((r) => r.id);
    const list = fresh.slice(0, 8).map((r) => (state === 'out'
      ? `• ${r.name}`
      : `• ${r.name}: ${round2(r.stock_qty)} ${r.unit} (minimal ${round2(r.min_stock)})`));
    const row = await createNotification(db, cfg, {
      kind,
      type_group: 'low_stock',
      level: state === 'out' ? 'critical' : 'warning',
      title: state === 'out' ? `${fresh.length} ta tovar tugadi` : `${fresh.length} ta tovar kam qoldi`,
      body: `${list.join('\n')}${fresh.length > 8 ? `\n… va yana ${fresh.length - 8} ta` : ''}\nQayta buyurtma berishni rejalashtiring.`,
      link: `#/products?filter=${state}`,
      data: { product_ids: ids },
      dedup_key: `${kind}:${today}:${hash(ids.join(','))}`,
    });
    if (row) created.push(row);
  }
  return created;
}

async function checkDebts(db, cfg, settings, today) {
  const created = [];
  const { rows: overdue } = await db.query(
    `SELECT c.id, c.name, SUM(s.balance_due) AS debt, MIN(s.due_date) AS since
       FROM sales s JOIN customers c ON c.id = s.customer_id
      WHERE s.balance_due > 0 AND s.due_date < $1::date
      GROUP BY c.id, c.name ORDER BY SUM(s.balance_due) DESC`,
    [today],
  );
  if (overdue.length) {
    const total = overdue.reduce((s, r) => s + Number(r.debt), 0);
    const bucket = Math.floor(epochDay(today) / cfg.thresholds.debt_reminder_days);
    const row = await createNotification(db, cfg, {
      kind: 'debt_overdue',
      type_group: 'debt_reminder',
      level: 'critical',
      title: `Muddati o'tgan qarzlar: ${money(total)}`,
      body: `${overdue.slice(0, 8).map((r) => `• ${r.name}: ${money(r.debt)} (muddat ${dmy(r.since)})`).join('\n')}${overdue.length > 8 ? `\n… va yana ${overdue.length - 8} ta mijoz` : ''}`,
      link: '#/debts',
      data: { customer_ids: overdue.map((r) => r.id), total: round2(total) },
      dedup_key: `debt_overdue:${bucket}`,
    });
    if (row) created.push(row);
  }
  const warnDays = Number(settings.debt_warning_days) || 3;
  const { rows: soon } = await db.query(
    `SELECT s.id, s.receipt_no, s.balance_due, s.due_date, c.name
       FROM sales s JOIN customers c ON c.id = s.customer_id
      WHERE s.balance_due > 0 AND s.due_date >= $1::date AND s.due_date <= $2::date
      ORDER BY s.due_date, s.id`,
    [today, addDays(today, warnDays)],
  );
  const seen = await recentlyAlerted(db, 'debt_due', 'sale_ids', 60);
  const fresh = soon.filter((r) => !seen.has(String(r.id)));
  if (fresh.length) {
    const ids = fresh.map((r) => r.id);
    const row = await createNotification(db, cfg, {
      kind: 'debt_due',
      type_group: 'debt_reminder',
      level: 'warning',
      title: `To'lov muddati yaqin: ${fresh.length} ta qarz`,
      body: fresh.slice(0, 8).map((r) => `• ${r.name}: ${money(r.balance_due)} — ${dmy(r.due_date)} gacha (${r.receipt_no})`).join('\n'),
      link: '#/debts',
      data: { sale_ids: ids },
      dedup_key: `debt_due:${today}:${hash(ids.join(','))}`,
    });
    if (row) created.push(row);
  }
  return created;
}

// Yetkazib beruvchiga qarz: muddati o'tgan (har N kunda bir marta) va yaqinlashgan (har kirim uchun bir marta)
async function checkSupplierDue(db, cfg, settings, today) {
  const created = [];
  const { rows: overdue } = await db.query(
    `SELECT s.id, s.name, SUM(p.remaining_debt) AS debt, MIN(p.due_date) AS since
       FROM purchases p JOIN suppliers s ON s.id = p.supplier_id
      WHERE p.remaining_debt > 0 AND p.due_date < $1::date
      GROUP BY s.id, s.name ORDER BY SUM(p.remaining_debt) DESC`,
    [today],
  );
  if (overdue.length) {
    const total = overdue.reduce((sum, r) => sum + Number(r.debt), 0);
    const bucket = Math.floor(epochDay(today) / cfg.thresholds.debt_reminder_days);
    const row = await createNotification(db, cfg, {
      kind: 'supplier_overdue',
      type_group: 'supplier_due',
      level: 'critical',
      title: `Yetkazib beruvchiga to'lov muddati o'tgan: ${money(total)}`,
      body: `${overdue.slice(0, 8).map((r) => `• ${r.name}: ${money(r.debt)} (muddat ${dmy(r.since)})`).join('\n')}${overdue.length > 8 ? `\n… va yana ${overdue.length - 8} ta` : ''}`,
      link: '#/debts?tab=suppliers',
      data: { supplier_ids: overdue.map((r) => r.id), total: round2(total) },
      dedup_key: `supplier_overdue:${bucket}`,
    });
    if (row) created.push(row);
  }
  const warnDays = Number(settings.debt_warning_days) || 3;
  const { rows: soon } = await db.query(
    `SELECT p.id, p.purchase_no, p.remaining_debt, p.due_date, s.name
       FROM purchases p JOIN suppliers s ON s.id = p.supplier_id
      WHERE p.remaining_debt > 0 AND p.due_date >= $1::date AND p.due_date <= $2::date
      ORDER BY p.due_date, p.id`,
    [today, addDays(today, warnDays)],
  );
  const seen = await recentlyAlerted(db, 'supplier_due', 'purchase_ids', 60);
  const fresh = soon.filter((r) => !seen.has(String(r.id)));
  if (fresh.length) {
    const ids = fresh.map((r) => r.id);
    const row = await createNotification(db, cfg, {
      kind: 'supplier_due',
      type_group: 'supplier_due',
      level: 'warning',
      title: `Yetkazib beruvchiga to'lov yaqin: ${fresh.length} ta`,
      body: fresh.slice(0, 8).map((r) => `• ${r.name}: ${money(r.remaining_debt)} — ${dmy(r.due_date)} gacha (${r.purchase_no})`).join('\n'),
      link: '#/debts?tab=suppliers',
      data: { purchase_ids: ids },
      dedup_key: `supplier_due:${today}:${hash(ids.join(','))}`,
    });
    if (row) created.push(row);
  }
  return created;
}

async function checkInsights(db, cfg, today) {
  const created = [];
  const wantSales = cfg.types.sales_decline.enabled;
  const wantExp = cfg.types.expense_spike.enabled;
  if (!wantSales && !wantExp) return created;
  const insights = await computeInsights(db, { financial: true, stock: false, debts: false, thresholds: cfg.thresholds });
  const week = mondayOf(today);
  const map = {
    sales_decline: wantSales ? 'sales_decline' : null,
    product_decline: wantSales ? 'sales_decline' : null,
    margin_change: wantSales ? 'sales_decline' : null,
    expense_spike: wantExp ? 'expense_spike' : null,
  };
  for (const i of insights) {
    const group = map[i.kind];
    if (!group || i.level === 'success') continue;
    const row = await createNotification(db, cfg, {
      kind: i.kind,
      type_group: group,
      level: i.level === 'critical' ? 'critical' : 'warning',
      title: i.title,
      body: `${i.text}\n${i.recommendation}`,
      link: i.link,
      data: { week },
      dedup_key: `${i.kind}:${week}`,
    });
    if (row) created.push(row);
  }
  return created;
}

async function checkInventoryChanges(db, cfg, today) {
  const created = [];
  const { rows: last } = await db.query(
    "SELECT COALESCE(MAX((data->>'max_id')::bigint), 0) AS id FROM notifications WHERE kind = 'inventory_change'",
  );
  const { rows } = await db.query(
    `SELECT m.id, m.movement_type, m.quantity, m.value, m.note, p.name, un.name AS unit, u.full_name AS user_name
       FROM stock_movements m JOIN products p ON p.id = m.product_id JOIN units un ON un.id = p.base_unit_id
       LEFT JOIN users u ON u.id = m.created_by
      WHERE m.movement_type IN ('damage', 'correction') AND m.id > $1
        AND m.created_at > now() - interval '2 days' AND ABS(m.value) >= $2
      ORDER BY m.id`,
    [last[0].id, cfg.thresholds.inventory_change_value],
  );
  if (rows.length) {
    const maxId = rows[rows.length - 1].id;
    const lost = rows.filter((r) => Number(r.value) < 0).reduce((s, r) => s - Number(r.value), 0);
    const row = await createNotification(db, cfg, {
      kind: 'inventory_change',
      type_group: 'inventory_change',
      level: lost > 0 ? 'warning' : 'info',
      title: `Ombordagi katta o'zgarish${rows.length > 1 ? `lar (${rows.length} ta)` : ''}`,
      body: rows.slice(0, 8).map((r) => `• ${r.name}: ${Number(r.quantity) > 0 ? '+' : ''}${round2(r.quantity)} ${r.unit} (${money(r.value)})${r.movement_type === 'damage' ? ' — zarar' : ' — tuzatish'}${r.user_name ? `, ${r.user_name}` : ''}${r.note ? `: ${r.note}` : ''}`).join('\n'),
      link: '#/stock?tab=movements',
      data: { max_id: Number(maxId) },
      dedup_key: `inventory_change:${maxId}`,
    });
    if (row) created.push(row);
  }

  // Yo'qotishlar o'sishi: so'nggi 30 kun <-> oldingi 30 kun
  const { rows: loss } = await db.query(
    `SELECT COALESCE(-SUM(value) FILTER (WHERE created_at >= now() - interval '30 days'), 0) AS recent,
            COALESCE(-SUM(value) FILTER (WHERE created_at < now() - interval '30 days'), 0) AS prior
       FROM stock_movements WHERE movement_type IN ('damage', 'correction') AND created_at >= now() - interval '60 days'`,
  );
  const recent = Number(loss[0].recent);
  const prior = Number(loss[0].prior);
  if (prior > 0 && recent > prior * 1.3 && recent - prior >= cfg.thresholds.inventory_change_value / 5) {
    const row = await createNotification(db, cfg, {
      kind: 'loss_increase',
      type_group: 'inventory_change',
      level: 'warning',
      title: "Ombor yo'qotishlari oshmoqda",
      body: `So'nggi 30 kunda yo'qotishlar ${money(recent)}, oldingi 30 kunda ${money(prior)} edi.\nSaqlash sharoitini va sanash natijalarini tekshiring.`,
      link: '#/stock?tab=movements',
      data: { recent: round2(recent), prior: round2(prior) },
      dedup_key: `loss_increase:${mondayOf(today)}`,
    });
    if (row) created.push(row);
  }

  // Qoldiq va partiyalar mos kelmasligi (ma'lumotlar yaxlitligi)
  const { rows: mismatch } = await db.query(
    `SELECT p.id, p.name FROM products p LEFT JOIN stock_batches b ON b.product_id = p.id
      GROUP BY p.id HAVING ABS(p.stock_qty - COALESCE(SUM(b.qty_remaining), 0)) > 0.0001 LIMIT 20`,
  );
  if (mismatch.length) {
    const row = await createNotification(db, cfg, {
      kind: 'stock_mismatch',
      type_group: 'inventory_change',
      level: 'critical',
      title: 'Qoldiqda nomuvofiqlik topildi',
      body: `${mismatch.map((r) => r.name).join(', ')}.\nOmbor → Nomuvofiqliklar bo'limini tekshiring.`,
      link: '#/stock?tab=discrepancies',
      data: { product_ids: mismatch.map((r) => r.id) },
      dedup_key: `stock_mismatch:${today}`,
    });
    if (row) created.push(row);
  }
  return created;
}

async function checkEvents(db, cfg) {
  const created = [];
  const { rows: shifts } = await db.query(
    `SELECT s.id, s.difference, s.expected_amount, s.counted_amount, s.closed_at, u.full_name
       FROM cash_shifts s LEFT JOIN users u ON u.id = s.closed_by
      WHERE s.status = 'closed' AND s.closed_at > now() - interval '2 days' AND ABS(s.difference) >= 1`,
  );
  for (const s of shifts) {
    const short = Number(s.difference) < 0;
    const row = await createNotification(db, cfg, {
      kind: 'shift_difference',
      type_group: 'business_event',
      level: short ? 'critical' : 'warning',
      title: `Smena kassasida ${short ? 'kamomad' : 'ortiqcha'}: ${money(Math.abs(s.difference))}`,
      body: `Kutilgan: ${money(s.expected_amount)}, sanalgan: ${money(s.counted_amount)}.${s.full_name ? ` Smenani yopgan: ${s.full_name}.` : ''}`,
      link: '#/cash?tab=cash',
      audience: ['reports.view', 'cash.view'],
      data: { shift_id: s.id },
      dedup_key: `shift_difference:${s.id}`,
    });
    if (row) created.push(row);
  }
  if (cfg.thresholds.large_refund_value > 0) {
    const { rows: refunds } = await db.query(
      `SELECT r.return_no, SUM(r.amount) AS amount, MIN(s.receipt_no) AS receipt_no, MIN(u.full_name) AS user_name
         FROM sale_returns r JOIN sales s ON s.id = r.sale_id LEFT JOIN users u ON u.id = r.created_by
        WHERE r.created_at > now() - interval '2 days'
        GROUP BY r.return_no HAVING SUM(r.amount) >= $1`,
      [cfg.thresholds.large_refund_value],
    );
    for (const r of refunds) {
      const row = await createNotification(db, cfg, {
        kind: 'large_refund',
        type_group: 'business_event',
        level: 'warning',
        title: `Katta qaytarish: ${money(r.amount)}`,
        body: `${r.return_no} — ${r.receipt_no} chekidan${r.user_name ? `, rasmiylashtirgan: ${r.user_name}` : ''}.`,
        link: '#/sales/history',
        audience: ['reports.view', 'sales.view'],
        data: { return_no: r.return_no },
        dedup_key: `large_refund:${r.return_no}`,
      });
      if (row) created.push(row);
    }
  }
  const { rows: counts } = await db.query(
    `SELECT c.id, c.count_no, c.total_gain, c.total_loss, u.full_name
       FROM inventory_counts c LEFT JOIN users u ON u.id = c.approved_by
      WHERE c.status = 'approved' AND c.approved_at > now() - interval '2 days'`,
  );
  for (const c of counts) {
    const row = await createNotification(db, cfg, {
      kind: 'count_approved',
      type_group: 'business_event',
      level: Number(c.total_loss) > Number(c.total_gain) ? 'warning' : 'info',
      title: `Sanash tasdiqlandi: ${c.count_no}`,
      body: `Kamomad: ${money(c.total_loss)}, ortiqcha: ${money(c.total_gain)}.${c.full_name ? ` Tasdiqlagan: ${c.full_name}.` : ''}`,
      link: `#/stock/count/${c.id}`,
      audience: ['reports.view', 'stock.view'],
      data: { count_id: c.id },
      dedup_key: `count_approved:${c.id}`,
    });
    if (row) created.push(row);
  }
  return created;
}

// Rejali xulosalar: belgilangan vaqt o'tgan bo'lsa va hali yaratilmagan bo'lsa (server o'chiq bo'lgan
// bo'lsa ham, keyin yoqilganda shu davr uchun bir marta yaratiladi)
async function checkSummaries(db, cfg, clock) {
  const created = [];
  const { date, time, weekday } = clock;
  const hasActivity = async (days) => {
    const { rows } = await db.query(
      `SELECT EXISTS (SELECT 1 FROM sales WHERE kind = 'sale' AND created_at > now() - ($1::int * interval '1 day')) AS x`,
      [days],
    );
    return rows[0].x;
  };
  if (cfg.types.daily_summary.enabled && time >= cfg.schedule.daily_time && await hasActivity(30)) {
    const s = await dailySummary(db, date);
    const row = s.active && await createNotification(db, cfg, {
      kind: 'daily_summary', type_group: 'daily_summary', level: 'info',
      title: s.title, body: s.body, link: '#/assistant', data: s.data, dedup_key: `daily_summary:${date}`,
    });
    if (row) created.push(row);
  }
  const weekDue = weekday > cfg.schedule.weekly_day || (weekday === cfg.schedule.weekly_day && time >= cfg.schedule.weekly_time);
  if (cfg.types.weekly_summary.enabled && weekDue && await hasActivity(14)) {
    const start = addDays(mondayOf(date), -7);
    const s = await weeklySummary(db, start);
    const row = s.active && await createNotification(db, cfg, {
      kind: 'weekly_summary', type_group: 'weekly_summary', level: 'info',
      title: s.title, body: s.body, link: `#/reports?tab=weekly&start=${start}`, data: s.data, dedup_key: `weekly_summary:${start}`,
    });
    if (row) created.push(row);
  }
  const day = Number(date.slice(8, 10));
  const monthDue = day > cfg.schedule.monthly_day || (day === cfg.schedule.monthly_day && time >= cfg.schedule.monthly_time);
  if (cfg.types.monthly_summary.enabled && monthDue && await hasActivity(62)) {
    const prevMonth = addDays(`${date.slice(0, 8)}01`, -1).slice(0, 7);
    const s = await monthlySummary(db, prevMonth);
    const row = s.active && await createNotification(db, cfg, {
      kind: 'monthly_summary', type_group: 'monthly_summary', level: 'info',
      title: s.title, body: s.body, link: `#/reports?tab=pnl&from=${prevMonth}-01&to=${addDays(`${date.slice(0, 8)}01`, -1)}`,
      data: s.data, dedup_key: `monthly_summary:${prevMonth}`,
    });
    if (row) created.push(row);
  }
  return created;
}

// Bitta to'liq tekshiruv sikli. Bir nechta server bo'lsa ham bir vaqtda faqat bittasi bajaradi.
export async function runCycle(db, { now = new Date() } = {}) {
  // Tranzaksiya qulfi: bir nechta server (yoki Cloudflare nusxasi) bo'lsa ham bir vaqtda faqat bittasi bajaradi.
  // Sessiya qulfidan farqli o'laroq, ulanishlar puli (Neon, Hyperdrive) orqali ham to'g'ri ishlaydi.
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    // Qulf har bir do'kon (sxema) uchun alohida: do'konlar bir-birini kutmaydi
    const { rows: lock } = await client.query('SELECT pg_try_advisory_xact_lock(515151, hashtext(current_schema())) AS ok');
    if (!lock[0].ok) return { skipped: true, created: [] };
    const { config: cfg, token } = await getNotifyConfig(db);
    const settings = await getSettings(db);
    const clock = localClock(now);
    const created = [];
    const steps = [
      () => (cfg.types.low_stock.enabled ? checkStock(db, cfg, clock.date) : []),
      () => (cfg.types.debt_reminder.enabled ? checkDebts(db, cfg, settings, clock.date) : []),
      () => (cfg.types.supplier_due.enabled ? checkSupplierDue(db, cfg, settings, clock.date) : []),
      () => checkInsights(db, cfg, clock.date),
      () => (cfg.types.inventory_change.enabled ? checkInventoryChanges(db, cfg, clock.date) : []),
      () => (cfg.types.business_event.enabled ? checkEvents(db, cfg) : []),
      () => checkSummaries(db, cfg, clock),
    ];
    for (const step of steps) {
      try {
        created.push(...await step());
      } catch (err) {
        console.error('Bildirishnoma tekshiruvida xato:', err.message);
      }
    }
    const delivery = await deliverPending(db, cfg, token, settings.store_name).catch((err) => {
      console.error('Telegramga yuborishda xato:', err.message);
      return { sent: 0, failed: 0 };
    });
    return { skipped: false, created, delivery };
  } finally {
    await client.query('COMMIT').catch(() => {});
    client.release();
  }
}

// Ro'yxat so'ralganda ma'lumot eskirmasligi uchun: oxirgi tekshiruvdan 5 daqiqa o'tgan bo'lsa qayta tekshiradi
// Har bir do'kon uchun alohida hisoblanadi
const lastRun = new Map();
export async function ensureFresh(db, { maxAgeMs = 5 * 60 * 1000, force = false } = {}) {
  const key = currentSchema();
  if (!force && Date.now() - (lastRun.get(key) || 0) < maxAgeMs) return null;
  lastRun.set(key, Date.now());
  return runCycle(db);
}
export function resetFreshness() {
  lastRun.clear();
}

// ---------- Foydalanuvchi uchun ro'yxat ----------

// Davr tugmalari: Bugun, Kecha, 7 kun, 30 kun, Shu oy (90 kun — eski sozlamalar uchun)
const RANGE_KEYS = ['today', 'yesterday', '7d', '30d', 'month', '90d'];
export const WIDGETS = ['assistant', 'kpis', 'sales_chart', 'pnl', 'top_products', 'forecast', 'inventory', 'recent'];
export const PREF_DEFAULTS = {
  // mode: 'simple' — oddiy bosh sahifa (ombor, keldi-ketdi, pul); 'detailed' — grafiklar va batafsil tahlil
  dashboard: { widgets: WIDGETS.map((id) => ({ id, visible: true })), range: 'today', onboarding_hidden: false, mode: 'simple', simple_range: 'today' },
  reports: { period: 'month', grain: 'daily' },
  notifications: { muted: [], browser: false, browser_levels: ['critical', 'warning', 'info', 'success'] },
};

// base: noto'g'ri yoki berilmagan qiymat o'rniga qoladigan sozlamalar (saqlashda — joriy sozlamalar)
export function mergePrefs(raw, base = PREF_DEFAULTS) {
  const p = clone(base);
  if (!raw || typeof raw !== 'object') return p;
  if (Array.isArray(raw.dashboard?.widgets)) {
    const seen = new Set();
    const list = raw.dashboard.widgets
      .filter((w) => w && WIDGETS.includes(w.id) && !seen.has(w.id) && seen.add(w.id))
      .map((w) => ({ id: w.id, visible: w.visible !== false }));
    for (const id of WIDGETS) if (!seen.has(id)) list.push({ id, visible: true });
    p.dashboard.widgets = list;
  }
  if (RANGE_KEYS.includes(raw.dashboard?.range)) p.dashboard.range = raw.dashboard.range;
  if (typeof raw.dashboard?.onboarding_hidden === 'boolean') p.dashboard.onboarding_hidden = raw.dashboard.onboarding_hidden;
  if (['simple', 'detailed'].includes(raw.dashboard?.mode)) p.dashboard.mode = raw.dashboard.mode;
  if (RANGE_KEYS.includes(raw.dashboard?.simple_range)) p.dashboard.simple_range = raw.dashboard.simple_range;
  if (['today', 'week', 'month', 'year'].includes(raw.reports?.period)) p.reports.period = raw.reports.period;
  if (['daily', 'weekly', 'monthly'].includes(raw.reports?.grain)) p.reports.grain = raw.reports.grain;
  if (Array.isArray(raw.notifications?.muted)) p.notifications.muted = raw.notifications.muted.filter((k) => TYPE_GROUPS[k]);
  if (typeof raw.notifications?.browser === 'boolean') p.notifications.browser = raw.notifications.browser;
  if (Array.isArray(raw.notifications?.browser_levels)) {
    p.notifications.browser_levels = raw.notifications.browser_levels.filter((l) => ['critical', 'warning', 'info', 'success'].includes(l));
  }
  return p;
}

export async function getPrefs(db, userId) {
  const { rows } = await db.query('SELECT prefs FROM user_preferences WHERE user_id = $1', [userId]);
  return mergePrefs(rows[0]?.prefs);
}

export async function savePrefs(db, userId, patch) {
  const current = await getPrefs(db, userId);
  const next = mergePrefs({
    dashboard: { ...current.dashboard, ...(patch?.dashboard || {}) },
    reports: { ...current.reports, ...(patch?.reports || {}) },
    notifications: { ...current.notifications, ...(patch?.notifications || {}) },
  }, current);
  await db.query(
    `INSERT INTO user_preferences (user_id, prefs, updated_at) VALUES ($1, $2, now())
     ON CONFLICT (user_id) DO UPDATE SET prefs = EXCLUDED.prefs, updated_at = now()`,
    [userId, JSON.stringify(next)],
  );
  return next;
}

function userPerms(user) {
  return Object.entries(user.permissions || {}).filter(([, v]) => v).map(([k]) => k);
}

export async function listForUser(db, user, q = {}) {
  const prefs = await getPrefs(db, user.id);
  const perms = userPerms(user);
  const muted = prefs.notifications.muted;
  const params = [user.id, perms, muted];
  const where = [
    'n.audience && $2::text[]',
    'NOT (n.type_group = ANY($3::text[]))',
    "n.created_at > now() - interval '90 days'",
  ];
  if (q.unread === '1' || q.unread === true) where.push('r.user_id IS NULL');
  if (q.group && TYPE_GROUPS[q.group]) {
    params.push(q.group);
    where.push(`n.type_group = $${params.length}`);
  }
  if (q.level && ['info', 'success', 'warning', 'critical'].includes(q.level)) {
    params.push(q.level);
    where.push(`n.level = $${params.length}`);
  }
  if (q.before && Number(q.before) > 0) {
    params.push(Number(q.before));
    where.push(`n.id < $${params.length}`);
  }
  if (q.since_id && Number(q.since_id) >= 0) {
    params.push(Number(q.since_id));
    where.push(`n.id > $${params.length}`);
  }
  const limit = Math.min(Math.max(Number(q.limit) || 30, 1), 100);
  const { rows } = await db.query(
    `SELECT n.id, n.kind, n.type_group, n.level, n.title, n.body, n.link, n.created_at, (r.user_id IS NOT NULL) AS is_read
       FROM notifications n
       LEFT JOIN notification_reads r ON r.notification_id = n.id AND r.user_id = $1
      WHERE ${where.join(' AND ')}
      ORDER BY n.id DESC LIMIT ${limit + 1}`,
    params,
  );
  const { rows: cnt } = await db.query(
    `SELECT COUNT(*)::int AS n FROM notifications n
       LEFT JOIN notification_reads r ON r.notification_id = n.id AND r.user_id = $1
      WHERE n.audience && $2::text[] AND NOT (n.type_group = ANY($3::text[]))
        AND n.created_at > now() - interval '90 days' AND r.user_id IS NULL`,
    [user.id, perms, muted],
  );
  const { config } = await getNotifyConfig(db);
  return {
    items: rows.slice(0, limit),
    has_more: rows.length > limit,
    unread: cnt[0].n,
    browser: prefs.notifications,
    browser_groups: Object.entries(config.types).filter(([, t]) => t.enabled && t.channels.includes('browser')).map(([k]) => k),
    quiet: inQuietHours(config),
  };
}

export async function markRead(db, user, ids) {
  if (!ids.length) return 0;
  const { rowCount } = await db.query(
    `INSERT INTO notification_reads (notification_id, user_id)
     SELECT id, $1 FROM notifications WHERE id = ANY($2::bigint[]) AND audience && $3::text[]
     ON CONFLICT DO NOTHING`,
    [user.id, ids, userPerms(user)],
  );
  return rowCount;
}

export async function markAllRead(db, user) {
  const prefs = await getPrefs(db, user.id);
  const { rowCount } = await db.query(
    `INSERT INTO notification_reads (notification_id, user_id)
     SELECT n.id, $1 FROM notifications n
      WHERE n.audience && $2::text[] AND NOT (n.type_group = ANY($3::text[]))
        AND n.created_at > now() - interval '90 days'
     ON CONFLICT DO NOTHING`,
    [user.id, userPerms(user), prefs.notifications.muted],
  );
  return rowCount;
}

export async function deliveryLog(db) {
  const { rows } = await db.query(
    `SELECT d.id, d.channel, d.target, d.status, d.attempts, d.error, d.sent_at, d.created_at, n.title
       FROM notification_deliveries d JOIN notifications n ON n.id = d.notification_id
      ORDER BY d.id DESC LIMIT 30`,
  );
  return rows;
}
