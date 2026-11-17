// Fon rejalashtiruvchi: har daqiqada bildirishnomalarni tekshiradi va rejali xulosalarni yaratadi.
// Bir nechta server ishlasa ham bazadagi qulf (advisory lock) va noyob kalitlar takrorlanishga yo'l qo'ymaydi.
import { pool } from '../db.js';
import { ensureFresh } from './notify.js';

let timer = null;
let running = false;

async function tick() {
  if (running) return;
  running = true;
  try {
    await ensureFresh(pool, { maxAgeMs: 55 * 1000 });
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
