// Cloudflare Workers kirish nuqtasi.
// Mavjud Express ilovasi o'zgarmagan holda Cloudflare'ning Node.js mosligi (nodejs_compat) orqali ishlaydi:
//  - sahifalar, stillar va skriptlarni Cloudflare o'zi beradi (public/ papkasi, "assets");
//  - /api/* va /uploads/* so'rovlari shu yerga keladi va Express'ga uzatiladi;
//  - har bir so'rov bazaga o'z ulanishini oladi (Workers'da ulanishni so'rovlar orasida bo'lishib bo'lmaydi);
//  - bildirishnomalar soatiga bir marta Cron orqali tekshiriladi (ilova ochiq bo'lsa — tez-tez).
import { handleAsNodeRequest } from 'cloudflare:node';
import pg from 'pg';
import { createApp } from './app.js';
import { runWithPool } from './db.js';
import { migrate } from './migrate.js';
import { assertConfig } from './config.js';
import { registerFonts } from './services/pdf.js';
import { runCycle } from './services/notify.js';
import m001 from '../migrations/001_init.sql';
import m002 from '../migrations/002_analytics.sql';
import m003 from '../migrations/003_notifications.sql';
import m004 from '../migrations/004_product_images.sql';
import m005 from '../migrations/005_pgcrypto.sql';
import interRegular from '../assets/fonts/Inter-Regular.ttf';
import interSemiBold from '../assets/fonts/Inter-SemiBold.ttf';

// Yangi migratsiya qo'shilsa, shu ro'yxatga ham qo'shing
const MIGRATIONS = [
  { name: '001_init.sql', sql: m001 },
  { name: '002_analytics.sql', sql: m002 },
  { name: '003_notifications.sql', sql: m003 },
  { name: '004_product_images.sql', sql: m004 },
  { name: '005_pgcrypto.sql', sql: m005 },
];

const PORT = 8080;
let listening = false;
let migrated = false;

function applyEnv(env) {
  for (const [k, v] of Object.entries(env || {})) {
    if (typeof v === 'string') process.env[k] = v;
  }
  // Hyperdrive ulangan bo'lsa, u ustun (tezroq: ulanishlar puli Cloudflare tarmog'ida)
  if (env?.HYPERDRIVE?.connectionString) process.env.DATABASE_URL = env.HYPERDRIVE.connectionString;
  process.env.OMBOR_RUNTIME = 'worker';
}

function setupProblem() {
  try {
    assertConfig();
  } catch {
    return "JWT_SECRET sozlanmagan. Cloudflare → Worker → Settings → Variables and Secrets bo'limida JWT_SECRET maxfiy qiymatini qo'shing.";
  }
  if (!process.env.DATABASE_URL) {
    return "Ma'lumotlar bazasi ulanmagan. DATABASE_URL maxfiy qiymatini (Neon PostgreSQL manzili) yoki HYPERDRIVE bog'lanishini qo'shing.";
  }
  return null;
}

function ensureServer() {
  if (listening) return;
  registerFonts(interRegular, interSemiBold);
  createApp().listen(PORT);
  listening = true;
}

function makePool() {
  return new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 4, connectionTimeoutMillis: 15000 });
}

// Har bir nusxa (isolate) birinchi marta ishga tushganda migratsiyalar tekshiriladi.
// Bir vaqtda kelgan so'rovlar tranzaksiya qulfi tufayli navbat bilan bajaradi.
async function ensureMigrated() {
  if (migrated) return;
  await migrate(() => {}, MIGRATIONS);
  migrated = true;
}

const jsonError = (status, message) => new Response(JSON.stringify({ error: message }), {
  status,
  headers: { 'Content-Type': 'application/json; charset=utf-8' },
});

export default {
  async fetch(request, env, ctx) {
    applyEnv(env);
    const problem = setupProblem();
    if (problem) return jsonError(503, problem);
    ensureServer();
    const pool = makePool();
    try {
      return await runWithPool(pool, async () => {
        await ensureMigrated();
        return handleAsNodeRequest(PORT, request, env, ctx);
      });
    } catch (err) {
      console.error(err);
      return jsonError(500, "Server xatosi. Ma'lumotlar bazasi ulanishini tekshiring");
    } finally {
      ctx.waitUntil(pool.end().catch(() => {}));
    }
  },

  async scheduled(controller, env, ctx) {
    applyEnv(env);
    if (setupProblem()) return;
    const pool = makePool();
    ctx.waitUntil((async () => {
      try {
        await runWithPool(pool, async () => {
          await ensureMigrated();
          await runCycle(pool, { now: new Date(controller.scheduledTime || Date.now()) });
        });
      } catch (err) {
        console.error('Rejali tekshiruvda xato:', err.message);
      } finally {
        await pool.end().catch(() => {});
      }
    })());
  },
};
