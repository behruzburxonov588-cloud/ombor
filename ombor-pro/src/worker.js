// Cloudflare Workers kirish nuqtasi.
// Mavjud Express ilovasi o'zgarmagan holda Cloudflare'ning Node.js mosligi (nodejs_compat) orqali ishlaydi:
//  - sahifalar, stillar va skriptlarni Cloudflare o'zi beradi (public/ papkasi, "assets");
//  - /api/* va /uploads/* so'rovlari shu yerga keladi va Express'ga uzatiladi;
//  - har bir so'rov bazaga o'z ulanishini oladi (Workers'da ulanishni so'rovlar orasida bo'lishib bo'lmaydi);
//  - ko'p do'kon: so'rov sessiyadagi do'kon sxemasida bajariladi (app.js, tenants.js);
//  - bildirishnomalar soatiga bir marta Cron orqali tekshiriladi (ilova ochiq bo'lsa — tez-tez).
import { handleAsNodeRequest } from 'cloudflare:node';
import { createApp } from './app.js';
import { runWithPools, makePool, pool as dbPool } from './db.js';
import { setMigrationSources } from './migrate.js';
import { assertConfig } from './config.js';
import { registerFonts } from './services/pdf.js';
import { cleanDatabaseUrl, databaseUrlProblem, databaseErrorMessage } from './dburl.js';
import { runCycle } from './services/notify.js';
import { ensureCoreOnce } from './tenants.js';
import { forEachStore } from './services/scheduler.js';
import m001 from '../migrations/001_init.sql';
import m002 from '../migrations/002_analytics.sql';
import m003 from '../migrations/003_notifications.sql';
import m004 from '../migrations/004_product_images.sql';
import m005 from '../migrations/005_pgcrypto.sql';
import m006 from '../migrations/006_manual_debts.sql';
import m007 from '../migrations/007_due_dates_sku.sql';
import m008 from '../migrations/008_sizes.sql';
import m009 from '../migrations/009_product_details.sql';
import interRegular from '../assets/fonts/Inter-Regular.ttf';
import interSemiBold from '../assets/fonts/Inter-SemiBold.ttf';

// Yangi migratsiya qo'shilsa, shu ro'yxatga ham qo'shing
const MIGRATIONS = [
  { name: '001_init.sql', sql: m001 },
  { name: '002_analytics.sql', sql: m002 },
  { name: '003_notifications.sql', sql: m003 },
  { name: '004_product_images.sql', sql: m004 },
  { name: '005_pgcrypto.sql', sql: m005 },
  { name: '006_manual_debts.sql', sql: m006 },
  { name: '007_due_dates_sku.sql', sql: m007 },
  { name: '008_sizes.sql', sql: m008 },
  { name: '009_product_details.sql', sql: m009 },
];

setMigrationSources(MIGRATIONS);

const PORT = 8080;
let listening = false;
// Cron: bitta ishga tushishda ko'pi bilan shuncha do'kon tekshiriladi (bepul rejadagi ulanishlar chegarasi uchun);
// do'konlar navbat bilan almashadi. Ilova ochiq bo'lsa, tekshiruv so'rovlar orqali ham bajariladi.
const CRON_STORES_PER_RUN = 8;

function applyEnv(env) {
  for (const [k, v] of Object.entries(env || {})) {
    if (typeof v === 'string') process.env[k] = v;
  }
  if (process.env.DATABASE_URL) process.env.DATABASE_URL = cleanDatabaseUrl(process.env.DATABASE_URL);
  // Hyperdrive ATAYLAB ishlatilmaydi: u ulanishlarni tranzaksiya rejimida bo'lishadi va har bir do'kon sxemasiga
  // o'tish (SET search_path) saqlanmaydi, natijada do'konlar ma'lumoti aralashishi mumkin. Tezlik uchun
  // wrangler.jsonc dagi Smart Placement ishlatiladi (Worker bazaga yaqin joyda ishlaydi).
  if (env?.HYPERDRIVE && !applyEnv.warned) { applyEnv.warned = true; console.warn('HYPERDRIVE ulangan, lekin xavfsizlik uchun ishlatilmaydi'); }
  process.env.OMBOR_RUNTIME = 'worker';
}

function setupProblem() {
  try {
    assertConfig();
  } catch {
    return "JWT_SECRET sozlanmagan. Cloudflare → Worker → Settings → Variables and Secrets bo'limida JWT_SECRET maxfiy qiymatini qo'shing.";
  }
  return databaseUrlProblem(process.env.DATABASE_URL);
}

function ensureServer() {
  if (listening) return;
  registerFonts(interRegular, interSemiBold);
  createApp().listen(PORT);
  listening = true;
}

// Har bir so'rov o'z ulanishlarini oladi; do'kon sxemasi bo'yicha alohida pool (odatda bitta)
const poolFactory = (schema, timing) => {
  const p = makePool(process.env.DATABASE_URL, schema, { max: 4, connectionTimeoutMillis: 15000 });
  if (timing) {
    const started = Date.now();
    p.on('connect', () => { timing.conns += 1; timing.connMs = Math.max(timing.connMs, Date.now() - started); });
  }
  return p;
};

// Baza mintaqasi (faqat mintaqa nomi, masalan "aws:eu-central-1") — tezlikni tekshirish uchun javob sarlavhasida
function dbRegion() {
  try {
    const host = new URL(process.env.DATABASE_URL).hostname;
    const m = host.match(/\.([a-z]{2}-[a-z]+-\d)\.aws\.neon\.tech$/) || host.match(/\.([a-z0-9]+)\.azure\.neon\.tech$/);
    if (!m) return 'boshqa';
    return host.includes('.azure.') ? `azure:${m[1]}` : `aws:${m[1]}`;
  } catch {
    return '?';
  }
}

function withTiming(res, t) {
  try {
    const h = new Headers(res.headers);
    h.set('Server-Timing', [
      `total;dur=${t.total}`, `start;dur=${t.core}`, `connect;dur=${t.connMs};desc="${t.conns} ta ulanish"`,
      `db;desc="${dbRegion()}"`, `fresh;desc="${t.fresh ? 'yangi nusxa' : 'issiq nusxa'}"`,
    ].join(', '));
    return new Response(res.body, { status: res.status, statusText: res.statusText, headers: h });
  } catch {
    return res;
  }
}
let isolateFresh = true;

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
    const t0 = Date.now();
    const fresh = isolateFresh;
    isolateFresh = false;
    let tCore = 0;
    // Umumiy jadvallar (do'konlar, loginlar) shu nusxada birinchi marta tekshiriladi; do'kon sxemasi esa
    // so'rov ichida (app.js) sessiyadan aniqlanadi va kerak bo'lsa yangilanadi
    const { result, closeAll, timing } = runWithPools(poolFactory, async () => {
      await ensureCoreOnce();
      tCore = Date.now() - t0;
      return handleAsNodeRequest(PORT, request, env, ctx);
    });
    try {
      const res = await result;
      return withTiming(res, { total: Date.now() - t0, core: tCore, connMs: timing.connMs, conns: timing.conns, fresh });
    } catch (err) {
      console.error(err);
      return jsonError(500, databaseErrorMessage(err));
    } finally {
      ctx.waitUntil(closeAll());
    }
  },

  async scheduled(controller, env, ctx) {
    applyEnv(env);
    if (setupProblem()) return;
    const now = new Date(controller.scheduledTime || Date.now());
    const { result, closeAll } = runWithPools(poolFactory, () => forEachStore(
      () => runCycle(dbPool, { now }),
      { limit: CRON_STORES_PER_RUN, offset: Math.floor(now.getTime() / 3600000) * CRON_STORES_PER_RUN },
    ));
    ctx.waitUntil((async () => {
      try {
        await result;
      } catch (err) {
        console.error('Rejali tekshiruvda xato:', databaseErrorMessage(err), err.message);
      } finally {
        await closeAll();
      }
    })());
  },
};
