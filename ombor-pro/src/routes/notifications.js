// Bildirishnomalar markazi va shaxsiy sozlamalar
import { Router } from 'express';
import { pool, withTransaction } from '../db.js';
import { requirePerm } from '../auth.js';
import { HttpError, str } from '../util.js';
import { audit } from '../audit.js';
import { getSettings } from '../services/settings.js';
import {
  TYPE_GROUPS, CHANNELS, NOTIFY_DEFAULTS, WIDGETS, getNotifyConfig, publicConfig, saveNotifyConfig,
  listForUser, markRead, markAllRead, ensureFresh, getPrefs, savePrefs, sendTelegram, discoverTelegramChats,
  deliveryLog, telegramText,
} from '../services/notify.js';

const router = Router();

router.get('/notifications', async (req, res) => {
  await ensureFresh(pool);
  res.json(await listForUser(pool, req.user, req.query));
});

router.post('/notifications/read', async (req, res) => {
  const ids = (Array.isArray(req.body?.ids) ? req.body.ids : [])
    .map(Number).filter((x) => Number.isInteger(x) && x > 0).slice(0, 500);
  res.json({ ok: true, marked: await markRead(pool, req.user, ids) });
});

router.post('/notifications/read-all', async (req, res) => {
  res.json({ ok: true, marked: await markAllRead(pool, req.user) });
});

// Hozir tekshirish (rahbar uchun)
router.post('/notifications/check', requirePerm('settings.manage', 'reports.view'), async (req, res) => {
  const result = await ensureFresh(pool, { force: true });
  res.json({ ok: true, created: result?.created?.length || 0, delivery: result?.delivery || null });
});

// ---------- Do'kon darajasidagi sozlamalar ----------

router.get('/notifications/settings', requirePerm('settings.manage'), async (req, res) => {
  res.json({
    config: publicConfig(await getNotifyConfig(pool)),
    types: TYPE_GROUPS,
    channels: CHANNELS,
    defaults: NOTIFY_DEFAULTS,
    deliveries: await deliveryLog(pool),
  });
});

router.put('/notifications/settings', requirePerm('settings.manage'), async (req, res) => {
  const body = req.body || {};
  const token = body.telegram_token ? String(body.telegram_token).trim() : '';
  const saved = await withTransaction(async (client) => {
    const result = await saveNotifyConfig(client, body.config, { token, clearToken: body.clear_token === true });
    await audit(client, req.user.id, 'notifications.settings', 'settings', null, {
      types: Object.fromEntries(Object.entries(result.config.types).map(([k, v]) => [k, v.enabled])),
      telegram: result.config.telegram.enabled,
      token_changed: Boolean(token) || body.clear_token === true,
    });
    return result;
  });
  res.json({ config: publicConfig(saved) });
});

router.post('/notifications/telegram/test', requirePerm('settings.manage'), async (req, res) => {
  const { config, token } = await getNotifyConfig(pool);
  if (!token) throw new HttpError(400, 'Avval Telegram bot tokenini saqlang');
  const chats = config.telegram.chat_ids;
  if (!chats.length) throw new HttpError(400, "Kamida bitta chat ID qo'shing");
  const settings = await getSettings(pool);
  const results = [];
  for (const chat of chats) {
    try {
      await sendTelegram(token, chat, telegramText({
        level: 'success', title: 'Sinov xabari', body: 'OMBOR PRO bildirishnomalari shu chatga keladi.',
      }, settings.store_name));
      results.push({ chat, ok: true });
    } catch (err) {
      results.push({ chat, ok: false, error: err.message });
    }
  }
  res.json({ results });
});

router.post('/notifications/telegram/chats', requirePerm('settings.manage'), async (req, res) => {
  const { token } = await getNotifyConfig(pool);
  const candidate = req.body?.token ? String(req.body.token).trim() : token;
  if (!candidate) throw new HttpError(400, 'Avval Telegram bot tokenini kiriting');
  try {
    res.json({ chats: await discoverTelegramChats(candidate) });
  } catch (err) {
    throw new HttpError(400, err.message);
  }
});

// ---------- Shaxsiy sozlamalar ----------

router.get('/me/preferences', async (req, res) => {
  res.json({ prefs: await getPrefs(pool, req.user.id), widgets: WIDGETS, types: TYPE_GROUPS });
});

router.put('/me/preferences', async (req, res) => {
  const body = req.body || {};
  if (body.notifications?.muted && !Array.isArray(body.notifications.muted)) {
    throw new HttpError(400, "Sozlamalar noto'g'ri");
  }
  str(JSON.stringify(body), 'Sozlamalar', { max: 10000 });
  res.json({ prefs: await savePrefs(pool, req.user.id, body) });
});

export default router;
