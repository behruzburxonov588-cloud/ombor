import { HttpError } from '../util.js';

export const SETTING_DEFAULTS = {
  store_name: "Mening do'konim",
  store_phone: '',
  store_address: '',
  currency_code: 'UZS',
  currency_symbol: "so'm",
  receipt_footer: 'Xaridingiz uchun rahmat!',
  costing_method: 'FIFO',
  notify_low_stock: true,
  notify_debts: true,
  debt_warning_days: 3,
  // Do'kon profili (birinchi sozlash): turi, xodimlar soni, joylashuvi, logotip
  store_types: [],
  employee_count: '',
  region: '',
  district: '',
  logo_path: '',
  setup_done: false,
};

export async function getSettings(db) {
  const { rows } = await db.query('SELECT key, value FROM settings');
  const result = { ...SETTING_DEFAULTS };
  for (const row of rows) {
    if (row.key in SETTING_DEFAULTS) result[row.key] = row.value;
  }
  return result;
}

export async function saveSettings(db, patch) {
  if (patch.costing_method !== undefined && !['FIFO', 'WAVG'].includes(patch.costing_method)) {
    throw new HttpError(400, "Tannarx usuli noto'g'ri. FIFO yoki WAVG tanlang");
  }
  for (const [key, value] of Object.entries(patch)) {
    if (!(key in SETTING_DEFAULTS)) continue;
    await db.query(
      `INSERT INTO settings (key, value, updated_at) VALUES ($1, $2, now())
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
      [key, JSON.stringify(value)],
    );
  }
  return getSettings(db);
}
