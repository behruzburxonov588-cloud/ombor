import path from 'node:path';
import { fileURLToPath } from 'node:url';

function rootDir() {
  try {
    return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  } catch {
    // Cloudflare Workers: fayl tizimi yo'q, yo'l faqat Node.js rejimida kerak
    return '/';
  }
}

export const ROOT = rootDir();
const DEV_SECRET = 'dev-only-secret-change-me';

// Qiymatlar har safar muhit o'zgaruvchilaridan o'qiladi (Cloudflare'da ular ishga tushgandan keyin beriladi)
export const config = {
  get port() { return Number(process.env.PORT || 3000); },
  get databaseUrl() { return process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/ombor_dev'; },
  get isProd() { return process.env.NODE_ENV === 'production'; },
  get jwtSecret() {
    const s = process.env.JWT_SECRET || '';
    if (s) return s;
    if (this.isProd) throw new Error("JWT_SECRET muhit o'zgaruvchisi production rejimida majburiy");
    return DEV_SECRET;
  },
  get uploadDir() { return process.env.UPLOAD_DIR || path.join(ROOT, 'uploads'); },
  get backupDir() { return process.env.BACKUP_DIR || path.join(ROOT, 'backups'); },
  // Sessiya: foydalanuvchi o'zi «Chiqish» tugmasini bosmaguncha tizimda qoladi.
  // Muddat har kuni ishlatilganda yangilanadi; 90 kun umuman kirilmasa — qayta kirish so'raladi.
  sessionDays: 90,
  sessionRenewHours: 24,
};

// Ishga tushishda tekshirish: production rejimida maxfiy kalit bo'lishi shart
export function assertConfig() {
  return config.jwtSecret;
}
