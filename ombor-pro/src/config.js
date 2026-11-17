import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const config = {
  port: Number(process.env.PORT || 3000),
  databaseUrl: process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/ombor_dev',
  jwtSecret: process.env.JWT_SECRET || '',
  isProd: process.env.NODE_ENV === 'production',
  uploadDir: process.env.UPLOAD_DIR || path.join(ROOT, 'uploads'),
  backupDir: process.env.BACKUP_DIR || path.join(ROOT, 'backups'),
  sessionHours: 12,
};

if (!config.jwtSecret) {
  if (config.isProd) {
    throw new Error("JWT_SECRET muhit o'zgaruvchisi production rejimida majburiy");
  }
  config.jwtSecret = 'dev-only-secret-change-me';
}
