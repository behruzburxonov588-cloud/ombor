// Bazaga ulanish manzilini tekshirish va ulanish xatolarini tushunarli qilish.
// Bu xabarlar saytda hammaga ko'rinadi: ularda manzil, foydalanuvchi yoki parol HECH QACHON bo'lmaydi.

const URL_RE = /postgres(?:ql)?:\/\/[^\s'"`]+/;
const FIX = " Neon → Connect oynasidan to'liq manzilni qaytadan nusxalab, Cloudflare'da DATABASE_URL qiymatini yangilang.";

// Panelga nusxalashda tez-tez bo'ladigan xatolarni kechiradi:
// psql 'postgresql://...', DATABASE_URL="postgresql://...", boshidagi/oxiridagi bo'sh joy yoki qo'shtirnoq.
export function cleanDatabaseUrl(value) {
  if (typeof value !== 'string') return value;
  const m = value.match(URL_RE);
  return m ? m[0] : value.trim();
}

export function databaseUrlProblem(url) {
  if (!url) {
    return "Ma'lumotlar bazasi ulanmagan. DATABASE_URL maxfiy qiymatini (Neon PostgreSQL manzili) yoki HYPERDRIVE bog'lanishini qo'shing.";
  }
  if (!/^postgres(?:ql)?:\/\//.test(url)) {
    return `DATABASE_URL noto'g'ri kiritilgan: u postgresql:// bilan boshlanishi kerak.${FIX}`;
  }
  let host = '';
  try {
    host = new URL(url).hostname;
  } catch {
    host = '';
  }
  if (!host) return `DATABASE_URL to'liq emas: unda server manzili yo'q.${FIX}`;
  return null;
}

const safeCode = (code) => (typeof code === 'string' && /^[A-Z0-9_]{1,24}$/.test(code) ? code : '');

export function databaseErrorMessage(err) {
  const code = safeCode(err?.code);
  const msg = String(err?.message || '');
  if (code === '28P01' || /password authentication failed/i.test(msg)) return `Baza paroli noto'g'ri.${FIX}`;
  if (code === '28000' || /role .* does not exist/i.test(msg)) return `Baza foydalanuvchisi topilmadi.${FIX}`;
  if (code === '3D000') return `Bunday nomli baza yo'q.${FIX}`;
  if (/endpoint/i.test(msg)) return `Neon loyihasi topilmadi yoki o'chirilgan. Neon'da loyiha borligini tekshiring.${FIX}`;
  if (code === '42501') return "Baza foydalanuvchisida huquq yetarli emas. Neon'dagi asosiy (neondb_owner) foydalanuvchi manzilidan foydalaning.";
  if (code === 'ENOTFOUND' || code === 'EAI_AGAIN' || /getaddrinfo|dns|resolve/i.test(msg)) {
    return `Baza serveri topilmadi: manzil noto'g'ri.${FIX}`;
  }
  if (code === 'ETIMEDOUT' || /time(?:d)? ?out/i.test(msg)) {
    return "Baza javob bermadi (vaqt tugadi). Bir daqiqadan keyin sahifani yangilang.";
  }
  if (['ECONNREFUSED', 'ECONNRESET', 'EPIPE'].includes(code) || /connect|socket|network|terminated/i.test(msg)) {
    return `Bazaga ulanib bo'lmadi.${FIX}`;
  }
  return `Server xatosi. Ma'lumotlar bazasi ulanishini tekshiring${code ? ` (kod: ${code})` : ''}`;
}
