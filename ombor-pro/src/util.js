// Umumiy yordamchi funksiyalar: xatolar, raqam va sana tekshiruvi

export class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
export const round4 = (n) => Math.round((Number(n) + Number.EPSILON) * 10000) / 10000;

// Raqamni tekshiradi. Bo'sh qiymat va min/max chegaralari hisobga olinadi.
export function num(value, label, { min = null, max = null, optional = false, positive = false } = {}) {
  if (value === undefined || value === null || value === '') {
    if (optional) return 0;
    throw new HttpError(400, `${label} kiritilishi shart`);
  }
  const n = typeof value === 'number' ? value : Number(String(value).replace(/\s/g, '').replace(',', '.'));
  if (!Number.isFinite(n)) throw new HttpError(400, `${label} noto'g'ri kiritilgan`);
  if (min !== null && n < min) throw new HttpError(400, `${label} ${min} dan kichik bo'lmasligi kerak`);
  if (max !== null && n > max) throw new HttpError(400, `${label} ${max} dan katta bo'lmasligi kerak`);
  if (positive && n <= 0) throw new HttpError(400, `${label} noldan katta bo'lishi kerak`);
  return n;
}

export function str(value, label, { max = 200, required = false } = {}) {
  const s = value === undefined || value === null ? '' : String(value).trim();
  if (!s && required) throw new HttpError(400, `${label} kiritilishi shart`);
  if (s.length > max) throw new HttpError(400, `${label} ${max} belgidan oshmasligi kerak`);
  return s || null;
}

export function dateStr(value, label, { optional = false } = {}) {
  if (value === undefined || value === null || value === '') {
    if (optional) return null;
    throw new HttpError(400, `${label} kiritilishi shart`);
  }
  const s = String(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || Number.isNaN(Date.parse(`${s}T00:00:00Z`))) {
    throw new HttpError(400, `${label} noto'g'ri formatda (YYYY-MM-DD)`);
  }
  return s;
}

// Toshkent vaqti (UTC+5, yozgi vaqt yo'q)
export function todayLocal() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tashkent', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
}

export function addDays(dateString, days) {
  const d = new Date(`${dateString}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// [from, to) oraliq vaqt chegaralari (Toshkent vaqti bilan)
export function periodBounds(from, to) {
  const f = from || todayLocal();
  const t = to || f;
  return { from: `${f}T00:00:00+05:00`, to: `${addDays(t, 1)}T00:00:00+05:00`, fromDate: f, toDate: t };
}

export function paging(query, defaults = { limit: 100, max: 500 }) {
  const limit = Math.min(Number(query.limit) || defaults.limit, defaults.max);
  const offset = Math.max(Number(query.offset) || 0, 0);
  return { limit, offset };
}
