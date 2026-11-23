// AI yordamchi va platforma egasi uchun AI tariflarini boshqarish
import { Router } from 'express';
import { requirePerm, can } from '../auth.js';
import { currentSchema } from '../db.js';
import { storeIdForSchema } from '../tenants.js';
import { HttpError } from '../util.js';
import {
  planConfig, planStatus, startTrial, quickAnswer, askAI, QUICK, isPlatformAdmin, aiConfigured,
  platformOverview, setStorePlan,
} from '../services/ai.js';

const router = Router();

async function storeIdOf(req) {
  if (req.store?.id) return req.store.id;
  const id = await storeIdForSchema(currentSchema());
  if (!id) throw new HttpError(400, "Do'kon aniqlanmadi");
  return id;
}

function platformOnly(req, res, next) {
  if (!isPlatformAdmin(req.user)) return next(new HttpError(403, 'Bu sahifa faqat platforma egasi uchun'));
  return next();
}

// Holat: tarif, muddat, bu oy nechta savol, narxlar
router.get('/ai/status', async (req, res) => {
  const storeId = await storeIdOf(req);
  const cfg = planConfig();
  const st = await planStatus(storeId);
  res.json({
    ...st,
    quick: QUICK,
    configured: aiConfigured(),
    can_start_trial: !st.trial_used && !st.active && can(req.user, 'settings.manage'),
    plans: {
      basic: { label: cfg.basic.label, price: cfg.basic.price, limit: cfg.basic.limit },
      pro: { label: cfg.pro.label, price: cfg.pro.price, limit: cfg.pro.limit },
      trial: { label: cfg.trial.label, days: cfg.trial.days, limit: cfg.trial.limit },
    },
    contact: process.env.OMBOR_SUPPORT_CONTACT || '',
    is_platform_admin: isPlatformAdmin(req.user),
  });
});

// 7 kunlik bepul sinov (bir do'konga bir marta, faqat egasi yoki sozlama huquqi borlar)
router.post('/ai/trial', requirePerm('settings.manage'), async (req, res) => {
  res.json(await startTrial(await storeIdOf(req), req.user));
});

// Bepul «Tez savollar» — AI ishlatilmaydi
router.post('/ai/quick', async (req, res) => {
  res.json(await quickAnswer(String(req.body?.topic || ''), req.user));
});

// Istalgan savol — pullik (yoki sinov)
router.post('/ai/ask', async (req, res) => {
  res.json(await askAI({
    user: req.user, storeId: await storeIdOf(req), question: req.body?.question, history: req.body?.history,
  }));
});

// ---------- Platforma egasi ----------

router.get('/platform/ai', platformOnly, async (req, res) => {
  res.json(await platformOverview());
});

router.put('/platform/ai/:storeId', platformOnly, async (req, res) => {
  const storeId = Number(req.params.storeId);
  if (!Number.isInteger(storeId)) throw new HttpError(400, "Do'kon noto'g'ri");
  await setStorePlan(storeId, String(req.body?.plan || ''), req.body?.days ?? 30, req.user);
  res.json(await platformOverview());
});

export default router;
