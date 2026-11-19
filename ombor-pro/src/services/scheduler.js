// Fon rejalashtiruvchi: har daqiqada har bir do'kon uchun bildirishnomalarni tekshiradi va rejali xulosalarni yaratadi.
// Bir nechta server ishlasa ham bazadagi qulf (advisory lock) va noyob kalitlar takrorlanishga yo'l qo'ymaydi.
import { pool, runWithSchema } from '../db.js';
import { ensureFresh } from './notify.js';
import { ensureCoreOnce, ensureSchemaReady, listActiveStores } from '../tenants.js';

let timer = null;
let running = false;

// Barcha faol do'konlar uchun bir sikl (do'konlar ketma-ket, biri xato bersa boshqalari davom etadi)
export async function forEachStore(fn, { limit = Infinity, offset = 0 } = {}) {
  await ensureCoreOnce();
  const stores = await listActiveStores();
  const n = stores.length;
  const count = Math.min(limit, n);
  for (let i = 0; i < count; i += 1) {
    const s = stores[(offset + i) % n];
    try {
      await ensureSchemaReady(s.schema);
      await runWithSchema(s.schema, () => fn(s));
    } catch (err) {
      console.error(`Do'kon #${s.id} tekshiruvida xato:`, err.message);
    }
  }
  return count;
}

async function tick() {
  if (running) return;
  running = true;
  try {
    await forEachStore(() => ensureFresh(pool, { maxAgeMs: 55 * 1000 }));
  } catch (err) {
    console.error('Rejalashtiruvchida xato:', err.message);
  } finally {
    running = false;
  }
}

export function startScheduler({ intervalMs = 60 * 1000 } = {}) {
  if (timer || process.env.OMBOR_DISABLE_SCHEDULER === '1') return;
  setTimeout(tick, 5000).unref();
  timer = setInterval(tick, intervalMs);
  timer.unref();
}

export function stopScheduler() {
  if (timer) clearInterval(timer);
  timer = null;
}
