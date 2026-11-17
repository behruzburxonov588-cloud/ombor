// Tahlil, aqlli yordamchi, hisobot eksporti va xodimlar samaradorligi
import { Router } from 'express';
import { pool } from '../db.js';
import { requirePerm, can } from '../auth.js';
import { HttpError } from '../util.js';
import { getSettings } from '../services/settings.js';
import {
  dashboard, salesAnalytics, pnlReport, productStats, topLists, filterSortPage, resolveRange,
  inventoryAnalytics, weeklyReport, forecast, customerDebts, staffPerformance, assertRange,
} from '../services/analytics.js';
import { briefing } from '../services/insights.js';
import { getNotifyConfig } from '../services/notify.js';
import { buildReportDoc, toXlsx, toPdf, REPORT_KINDS } from '../services/reportdocs.js';

const router = Router();

router.use('/analytics', (req, res, next) => {
  try {
    assertRange(req.query);
    next();
  } catch (err) {
    next(err);
  }
});

router.get('/analytics/dashboard', requirePerm('dashboard.view'), async (req, res) => {
  res.json(await dashboard(pool, req.user, req.query));
});

router.get('/analytics/assistant', requirePerm('dashboard.view', 'reports.view'), async (req, res) => {
  const { config } = await getNotifyConfig(pool);
  res.json(await briefing(pool, req.user, { thresholds: config.thresholds }));
});

router.get('/analytics/sales', requirePerm('reports.view'), async (req, res) => {
  res.json(await salesAnalytics(pool, req.query));
});

router.get('/analytics/pnl', requirePerm('reports.view'), async (req, res) => {
  res.json(await pnlReport(pool, req.query));
});

router.get('/analytics/products', requirePerm('reports.view'), async (req, res) => {
  const range = resolveRange(req.query);
  const settings = await getSettings(pool);
  const items = await productStats(pool, range, settings.costing_method);
  const page = filterSortPage(items, req.query);
  const sold = items.filter((i) => i.qty_sold > 0);
  res.json({
    range,
    tops: topLists(items),
    summary: {
      products: items.filter((i) => !i.is_archived).length,
      sold: sold.length,
      revenue: Math.round(items.reduce((s, i) => s + i.revenue, 0) * 100) / 100,
      profit: Math.round(items.reduce((s, i) => s + i.profit, 0) * 100) / 100,
    },
    ...page,
  });
});

router.get('/analytics/inventory', requirePerm('stock.view', 'reports.view'), async (req, res) => {
  res.json(await inventoryAnalytics(pool, { financial: can(req.user, 'reports.view') }));
});

router.get('/analytics/weekly', requirePerm('reports.view'), async (req, res) => {
  const settings = await getSettings(pool);
  res.json(await weeklyReport(pool, req.query, settings.costing_method));
});

router.get('/analytics/forecast', requirePerm('reports.view'), async (req, res) => {
  res.json(await forecast(pool));
});

router.get('/analytics/debts', requirePerm('customers.view', 'reports.view'), async (req, res) => {
  res.json(await customerDebts(pool));
});

// Xodimlar: rahbar hammani ko'radi; boshqa xodim faqat o'z natijasini
router.get('/analytics/staff', async (req, res) => {
  const all = can(req.user, 'employees.manage') || can(req.user, 'reports.view');
  const data = await staffPerformance(pool, req.query, { userId: all ? null : req.user.id });
  if (!can(req.user, 'reports.view')) {
    for (const s of data.staff) delete s.gross_profit;
  }
  res.json({ ...data, scope: all ? 'all' : 'self' });
});

// Xodim amallari tarixi (faqat tarixni ko'rish huquqi bilan)
router.get('/analytics/staff/:id/activity', requirePerm('history.view'), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, "Xodim noto'g'ri");
  const range = resolveRange(req.query);
  const { rows } = await pool.query(
    `SELECT a.id, a.action, a.entity_type, a.entity_id, a.details, a.created_at
       FROM audit_log a WHERE a.user_id = $1 AND a.created_at >= $2 AND a.created_at < $3
      ORDER BY a.created_at DESC, a.id DESC LIMIT 200`,
    [id, range.fromTs, range.toTs],
  );
  const { rows: summary } = await pool.query(
    `SELECT action, COUNT(*)::int AS n FROM audit_log
      WHERE user_id = $1 AND created_at >= $2 AND created_at < $3 GROUP BY action ORDER BY n DESC`,
    [id, range.fromTs, range.toTs],
  );
  res.json({ range, entries: rows, summary });
});

// ---------- Eksport (Excel va PDF) ----------

router.get('/reports/export', requirePerm('reports.export'), async (req, res) => {
  const kind = String(req.query.report || '');
  if (!REPORT_KINDS[kind]) throw new HttpError(400, "Hisobot turi noto'g'ri");
  const format = req.query.format === 'pdf' ? 'pdf' : 'xlsx';
  assertRange(req.query);
  if (kind === 'debts' && !(can(req.user, 'customers.view') || can(req.user, 'reports.view'))) {
    throw new HttpError(403, "Bu hisobot uchun ruxsatingiz yo'q");
  }
  const doc = await buildReportDoc(pool, kind, req.query, req.user);
  const buf = format === 'pdf' ? toPdf(doc) : toXlsx(doc);
  res.setHeader('Content-Type', format === 'pdf'
    ? 'application/pdf'
    : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${doc.filename}.${format}"`);
  res.setHeader('Cache-Control', 'no-store');
  res.send(buf);
});

export default router;
