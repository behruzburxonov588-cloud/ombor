// Hisobot hujjatlari: bir xil ma'lumotdan Excel va PDF yaratiladi.
// Hisobot turlari: pnl (foyda va zarar), sales (savdo), products (mahsulotlar), inventory (ombor),
// weekly (haftalik), debts (mijoz qarzlari), staff (xodimlar).
import { HttpError, todayLocal } from '../util.js';
import { getSettings } from './settings.js';
import {
  pnlReport, salesAnalytics, productStats, resolveRange, inventoryAnalytics, weeklyReport, customerDebts,
  staffPerformance,
} from './analytics.js';
import { buildXlsx } from './xlsx.js';
import { buildPdf, fmtCell } from './pdf.js';
import { EXPENSE_LABELS } from './insights.js';

export const REPORT_KINDS = {
  pnl: 'Foyda va zarar hisoboti',
  sales: 'Savdo hisoboti',
  products: 'Mahsulotlar bo\'yicha hisobot',
  inventory: 'Ombor holati hisoboti',
  weekly: 'Haftalik hisobot',
  debts: 'Mijozlar qarzi hisoboti',
  staff: 'Xodimlar samaradorligi',
};

const CASH_LABELS = {
  sale: 'Savdo tushumi', refund: 'Qaytarilgan pul', customer_payment: "Mijoz qarz to'lovlari",
  supplier_payment: "Yetkazib beruvchilarga to'lov", expense: 'Xarajatlar', deposit: 'Kassaga kiritilgan', withdrawal: 'Kassadan olingan',
};
const METHOD_LABELS = { cash: 'Naqd', card: 'Karta', transfer: "O'tkazma", credit: 'Nasiya', mixed: 'Aralash' };
const STATUS_LABELS = { out: 'Tugagan', low: 'Kam qolgan', ok: 'Yetarli' };
const ROLE_LABELS = { owner: 'Egasi', administrator: 'Administrator', cashier: 'Kassir', warehouse: 'Ombor xodimi', accountant: 'Buxgalter' };

const m = (v) => `${fmtCell(v, 'money')} so'm`;
const p = (v) => (v === null || v === undefined ? '—' : `${v > 0 ? '+' : ''}${fmtCell(v, 'percent')}`);
const d = (s) => fmtCell(s, 'date');
const pct = (cur, prev) => {
  if (Math.abs(prev) < 0.005) return null;
  return Math.round(((cur - prev) / Math.abs(prev)) * 1000) / 10;
};
const tone = (v) => (v < 0 ? 'bad' : v > 0 ? 'good' : undefined);

const col = (key, header, type = 'text', opts = {}) => ({
  key, header, type, width: opts.width, pdfWidth: opts.pdf, tone: opts.tone,
});

function dailyColumns() {
  return [
    col('day', 'Sana', 'date', { width: 12, pdf: 1.4 }),
    col('sales_count', 'Savdolar', 'number', { width: 10, pdf: 1 }),
    col('gross_revenue', 'Yalpi tushum', 'money'),
    col('discounts', 'Chegirma', 'money'),
    col('returns', 'Qaytarish', 'money'),
    col('net_revenue', 'Sof tushum', 'money'),
    col('cogs', 'Tannarx', 'money'),
    col('gross_profit', 'Yalpi foyda', 'money', { tone: true }),
    col('expenses', 'Xarajat', 'money'),
    col('losses', "Yo'qotish", 'money'),
    col('net_profit', 'Sof foyda', 'money', { tone: true }),
  ];
}

function sumRows(rows, keys, label = 'Jami', labelKey = 'day') {
  const t = { [labelKey]: label };
  for (const k of keys) t[k] = Math.round(rows.reduce((s, r) => s + Number(r[k] || 0), 0) * 100) / 100;
  return t;
}

async function pnlDoc(db, q) {
  const r = await pnlReport(db, q);
  const c = r.current;
  const pv = r.previous;
  const line = (item, cur, prev, sign = '') => ({ item, current: cur, previous: prev, change: pct(cur, prev), sign });
  const statement = [
    line('Yalpi tushum (chegirmagacha)', c.gross_revenue, pv.gross_revenue),
    line('− Chegirmalar', c.discounts, pv.discounts),
    line('− Qaytarishlar', c.returns, pv.returns),
    line('= Sof tushum', c.net_revenue, pv.net_revenue),
    line('− Sotilgan tovar tannarxi', c.cogs, pv.cogs),
    line('= Yalpi foyda', c.gross_profit, pv.gross_profit),
    line('− Operatsion xarajatlar', c.expenses, pv.expenses),
    line("− Ombor yo'qotishlari (sof)", c.losses, pv.losses),
    line('    yaroqsiz tovar', c.damage, pv.damage),
    line('    inventarizatsiya kamomadi', c.shrinkage, pv.shrinkage),
    line('    inventarizatsiya ortiqchasi (+)', c.surplus, pv.surplus),
    line('= Sof foyda', c.net_profit, pv.net_profit),
  ];
  return {
    range: r.range,
    summary: [
      { label: 'Sof tushum', value: m(c.net_revenue) },
      { label: 'Yalpi foyda', value: m(c.gross_profit), tone: tone(c.gross_profit) },
      { label: 'Xarajatlar', value: m(c.expenses) },
      { label: 'Sof foyda', value: m(c.net_profit), tone: tone(c.net_profit) },
      { label: 'Sof marja', value: fmtCell(c.net_margin, 'percent') },
      { label: 'Yalpi marja', value: fmtCell(c.gross_margin, 'percent') },
      { label: 'Savdolar soni', value: String(c.sales_count) },
      { label: "O'rtacha chek", value: m(c.avg_order) },
      { label: 'Mijozlar qarzi (hozir)', value: m(r.debts.customers), tone: r.debts.customers > 0 ? 'warn' : undefined },
      { label: 'Yetkazib beruvchilarga qarz', value: m(r.debts.suppliers) },
    ],
    notes: [
      `Taqqoslash davri: ${d(r.range.prevFrom)} – ${d(r.range.prevTo)}.`,
      "Mijozlarning eski qarz to'lovlari savdo tushumiga qo'shilmagan — ular pul oqimida ko'rsatilgan.",
    ],
    tables: [
      {
        title: 'Foyda va zarar',
        name: 'Foyda va zarar',
        columns: [
          col('item', "Ko'rsatkich", 'text', { width: 38, pdf: 4 }),
          col('current', 'Joriy davr', 'money', { tone: true }),
          col('previous', 'Oldingi davr', 'money', { tone: true }),
          col('change', "O'zgarish", 'percent', { pdf: 1.2 }),
        ],
        rows: statement,
        landscape: false,
      },
      {
        title: 'Pul oqimi',
        name: 'Pul oqimi',
        columns: [
          col('label', 'Turi', 'text', { width: 32, pdf: 4 }),
          col('in', 'Kirim', 'money'),
          col('out', 'Chiqim', 'money'),
        ],
        rows: r.cash.by_category.map((x) => ({
          label: CASH_LABELS[x.category] || x.category,
          in: x.direction === 'in' ? x.amount : null,
          out: x.direction === 'out' ? x.amount : null,
        })),
        totals: { label: `Jami (sof: ${m(r.cash.net)})`, in: r.cash.inflow, out: r.cash.outflow },
      },
      {
        title: 'Xarajatlar turkumlar bo\'yicha',
        name: 'Xarajatlar',
        columns: [col('label', 'Turkum', 'text', { width: 28, pdf: 3 }), col('count', 'Soni', 'number'), col('total', 'Summa', 'money')],
        rows: r.expenses_by_category.map((x) => ({ label: EXPENSE_LABELS[x.category] || x.category, count: x.count, total: x.total })),
        totals: { label: 'Jami', count: r.expenses_by_category.reduce((s, x) => s + x.count, 0), total: c.expenses },
        empty: "Bu davrda xarajat yo'q",
      },
      {
        title: 'Kunlar bo\'yicha',
        name: 'Kunlik',
        columns: dailyColumns(),
        rows: r.days,
        totals: sumRows(r.days, ['sales_count', 'gross_revenue', 'discounts', 'returns', 'net_revenue', 'cogs', 'gross_profit', 'expenses', 'losses', 'net_profit']),
      },
    ],
  };
}

async function salesDoc(db, q) {
  const r = await salesAnalytics(db, q);
  const t = r.totals;
  const grainLabel = { daily: 'Sana', weekly: 'Hafta boshi', monthly: 'Oy' }[r.grain];
  const cols = dailyColumns();
  cols[0] = col('period', grainLabel, 'date', { width: 12, pdf: 1.4 });
  return {
    range: r.range,
    summary: [
      { label: 'Sof tushum', value: m(t.net_revenue) },
      { label: 'Savdolar soni', value: String(t.sales_count) },
      { label: "O'rtacha chek", value: m(t.avg_order) },
      { label: 'Yalpi foyda', value: m(t.gross_profit), tone: tone(t.gross_profit) },
      { label: 'Chegirmalar', value: m(t.discounts) },
      { label: 'Qaytarishlar', value: m(t.returns) },
      { label: 'Nasiyaga sotilgan', value: m(t.credit_sales) },
      { label: "Oldingi davrga nisbatan", value: p(pct(t.net_revenue, r.previous.net_revenue)) },
    ],
    notes: [],
    tables: [
      {
        title: `${{ daily: 'Kunlik', weekly: 'Haftalik', monthly: 'Oylik' }[r.grain]} taqsimot`,
        name: 'Savdo',
        columns: cols,
        rows: r.rows,
        totals: sumRows(r.rows, ['sales_count', 'gross_revenue', 'discounts', 'returns', 'net_revenue', 'cogs', 'gross_profit', 'expenses', 'losses', 'net_profit'], 'Jami', 'period'),
      },
      {
        title: "To'lov usullari",
        name: "To'lov usullari",
        columns: [col('label', 'Usul', 'text', { width: 20, pdf: 3 }), col('count', 'Savdolar', 'number'), col('total', 'Summa', 'money')],
        rows: r.by_method.map((x) => ({ label: METHOD_LABELS[x.method] || x.method, count: x.count, total: x.total })),
      },
    ],
  };
}

async function productsDoc(db, q, settings) {
  const range = resolveRange(q);
  const items = (await productStats(db, range, settings.costing_method))
    .sort((a, b) => b.revenue - a.revenue || a.name.localeCompare(b.name));
  const cols = [
    col('name', 'Mahsulot', 'text', { width: 32, pdf: 3.6 }),
    col('category_name', 'Kategoriya', 'text', { width: 16, pdf: 1.6 }),
    col('qty_sold', 'Sotilgan', 'number', { pdf: 1.1 }),
    col('unit', 'Birlik', 'text', { width: 8, pdf: 0.8 }),
    col('receipts', 'Cheklar', 'number', { pdf: 0.9 }),
    col('revenue', 'Tushum', 'money'),
    col('cogs', 'Tannarx', 'money'),
    col('profit', 'Foyda', 'money', { tone: true }),
    col('margin', 'Marja', 'percent', { pdf: 0.9 }),
    col('stock_qty', 'Qoldiq', 'number', { pdf: 1.1 }),
    col('stock_value', 'Qoldiq qiymati', 'money'),
  ];
  const sold = items.filter((i) => i.qty_sold > 0);
  return {
    range,
    summary: [
      { label: 'Sotilgan mahsulotlar', value: `${sold.length} xil` },
      { label: 'Tushum', value: m(items.reduce((s, i) => s + i.revenue, 0)) },
      { label: 'Foyda', value: m(items.reduce((s, i) => s + i.profit, 0)) },
      { label: 'Sotilmagan (qoldig\'i bor)', value: `${items.filter((i) => !i.is_archived && i.stock_qty > 0 && i.qty_sold <= 0).length} ta` },
    ],
    notes: [],
    landscape: true,
    tables: [{
      title: 'Mahsulotlar', name: 'Mahsulotlar', columns: cols, rows: items,
      totals: { ...sumRows(items, ['revenue', 'cogs', 'profit', 'stock_value'], 'Jami', 'name'), receipts: null },
    }],
  };
}

async function inventoryDoc(db, q, settings, user) {
  const inv = await inventoryAnalytics(db, { financial: Boolean(user.permissions['reports.view']), method: settings.costing_method });
  const all = [...inv.out, ...inv.low, ...inv.dead, ...inv.slow, ...inv.overstock];
  const seen = new Set();
  const flagged = all.filter((x) => !seen.has(x.id) && seen.add(x.id));
  const cols = [
    col('name', 'Mahsulot', 'text', { width: 32, pdf: 3 }),
    col('stock_qty', 'Qoldiq', 'number', { pdf: 1 }),
    col('unit', 'Birlik', 'text', { width: 8, pdf: 0.7 }),
    col('min_stock', 'Minimal', 'number', { pdf: 0.9 }),
    col('stock_value', 'Qiymati', 'money', { pdf: 1.4 }),
    col('qty_30d', '30 kunda sotilgan', 'number', { pdf: 1.2 }),
    col('cover_days', 'Necha kunga yetadi', 'number', { pdf: 1.2 }),
    col('status_label', 'Holat', 'text', { width: 12, pdf: 1 }),
    col('recommendation', 'Tavsiya', 'text', { width: 60, pdf: 5 }),
  ];
  const label = (x) => ({ ...x, status_label: STATUS_LABELS[x.status] || x.status });
  return {
    range: { from: todayLocal(), to: todayLocal() },
    summary: [
      { label: 'Ombor qiymati (tannarx)', value: m(inv.totals.cost_value) },
      ...(inv.totals.retail_value !== null ? [{ label: 'Sotuv narxida', value: m(inv.totals.retail_value) }] : []),
      { label: 'Mahsulotlar', value: `${inv.totals.products} ta (${inv.totals.in_stock} tasi bor)` },
      { label: 'Tugagan', value: `${inv.totals.out} ta`, tone: inv.totals.out ? 'bad' : undefined },
      { label: 'Kam qolgan', value: `${inv.totals.low} ta`, tone: inv.totals.low ? 'warn' : undefined },
      { label: 'Sotilmayotgan (30 kun)', value: `${inv.totals.dead} ta · ${m(inv.totals.dead_value)}` },
      { label: 'Ortiqcha zaxira', value: `${inv.totals.overstock} ta · ${m(inv.totals.excess_value)}` },
    ],
    notes: inv.notes.map((n) => n.text),
    landscape: true,
    tables: [
      {
        title: 'Qayta buyurtma kerak', name: 'Buyurtma',
        columns: [
          col('name', 'Mahsulot', 'text', { width: 32, pdf: 3 }),
          col('stock_qty', 'Qoldiq', 'number'), col('unit', 'Birlik', 'text', { width: 8, pdf: 0.8 }),
          col('min_stock', 'Minimal', 'number'), col('qty_30d', '30 kunda sotilgan', 'number'),
          col('suggested_qty', 'Tavsiya: buyurtma', 'number', { pdf: 1.3 }),
          col('status_label', 'Holat', 'text', { width: 12, pdf: 1 }),
        ],
        rows: inv.restock.map(label),
        empty: "Hozircha qayta buyurtma kerak emas",
      },
      { title: "E'tibor talab qiladigan mahsulotlar", name: 'Tahlil', columns: cols, rows: flagged.map(label), empty: "Muammoli mahsulot yo'q" },
    ],
  };
}

async function weeklyDoc(db, q, settings) {
  const w = await weeklyReport(db, q, settings.costing_method);
  const c = w.totals;
  const notes = [];
  if (w.best_product) notes.push(`Eng ko'p sotilgan: ${w.best_product.name} — ${m(w.best_product.revenue)}`);
  if (w.most_profitable) notes.push(`Eng foydali: ${w.most_profitable.name} — foyda ${m(w.most_profitable.profit)}`);
  if (w.worst_product) notes.push(`Eng sust: ${w.worst_product.name} — tushum ${m(w.worst_product.revenue)}, qoldiq qiymati ${m(w.worst_product.stock_value)}`);
  const rows = w.days.map((x) => ({
    ...x,
    prev_net_revenue: x.previous?.net_revenue ?? 0,
    prev_net_profit: x.previous?.net_profit ?? 0,
    change: x.future ? null : pct(x.net_revenue, x.previous?.net_revenue ?? 0),
  }));
  return {
    range: { from: w.start, to: w.end },
    summary: [
      { label: 'Savdolar', value: String(c.sales_count) },
      { label: 'Sof tushum', value: m(c.net_revenue) },
      { label: 'Xarajatlar', value: m(c.expenses) },
      { label: 'Yalpi foyda', value: m(c.gross_profit), tone: tone(c.gross_profit) },
      { label: 'Sof foyda', value: m(c.net_profit), tone: tone(c.net_profit) },
      { label: "Yo'qotishlar", value: m(c.losses) },
      { label: "O'tgan haftaga nisbatan", value: p(pct(c.net_revenue, w.previous.net_revenue)) },
    ],
    notes,
    landscape: true,
    tables: [{
      title: 'Kunma-kun taqqoslash', name: 'Haftalik',
      columns: [
        col('day', 'Sana', 'date', { width: 12, pdf: 1.3 }),
        col('sales_count', 'Savdolar', 'number', { pdf: 0.9 }),
        col('net_revenue', 'Sof tushum', 'money'),
        col('prev_net_revenue', "O'tgan hafta", 'money'),
        col('change', "O'zgarish", 'percent', { pdf: 1 }),
        col('gross_profit', 'Yalpi foyda', 'money', { tone: true }),
        col('expenses', 'Xarajat', 'money'),
        col('losses', "Yo'qotish", 'money'),
        col('net_profit', 'Sof foyda', 'money', { tone: true }),
      ],
      rows,
      totals: sumRows(rows, ['sales_count', 'net_revenue', 'prev_net_revenue', 'gross_profit', 'expenses', 'losses', 'net_profit']),
    }],
  };
}

async function debtsDoc(db) {
  const r = await customerDebts(db);
  return {
    range: { from: todayLocal(), to: todayLocal() },
    summary: [
      { label: 'Jami qarz', value: m(r.totals.debt), tone: r.totals.debt ? 'warn' : undefined },
      { label: "Muddati o'tgan", value: m(r.totals.overdue), tone: r.totals.overdue ? 'bad' : undefined },
      { label: 'Qarzdor mijozlar', value: `${r.totals.customers} ta` },
      { label: "30 kunda undirilgan", value: m(r.totals.collected_30d), tone: 'good' },
    ],
    notes: [],
    landscape: true,
    tables: [{
      title: 'Qarzdor mijozlar', name: 'Qarzlar',
      columns: [
        col('name', 'Mijoz', 'text', { width: 28, pdf: 2.6 }),
        col('phone', 'Telefon', 'text', { width: 16, pdf: 1.5 }),
        col('debt', 'Qarz', 'money'),
        col('overdue', "Muddati o'tgan", 'money'),
        col('open_sales', 'Ochiq cheklar', 'number', { pdf: 1 }),
        col('next_due', "To'lov muddati", 'date', { width: 14, pdf: 1.2 }),
        col('d30', '0–30 kun', 'money'),
        col('d60', '31–60 kun', 'money'),
        col('d90p', '60+ kun', 'money'),
      ],
      rows: r.customers.map((x) => ({ ...x, d30: x.aging.d30, d60: x.aging.d60, d90p: x.aging.d90 + x.aging.d90p })),
      totals: { name: 'Jami', debt: r.totals.debt, overdue: r.totals.overdue, d30: r.totals.aging.d30, d60: r.totals.aging.d60, d90p: r.totals.aging.d90 + r.totals.aging.d90p },
      empty: "Qarzdor mijoz yo'q",
    }],
  };
}

async function staffDoc(db, q, user) {
  const r = await staffPerformance(db, q);
  const financial = Boolean(user.permissions['reports.view']);
  return {
    range: r.range,
    summary: [
      { label: 'Jami sof tushum', value: m(r.total_net_revenue) },
      { label: 'Xodimlar', value: `${r.staff.length} ta` },
    ],
    notes: [],
    landscape: true,
    tables: [{
      title: 'Xodimlar bo\'yicha', name: 'Xodimlar',
      columns: [
        col('full_name', 'Xodim', 'text', { width: 26, pdf: 2.4 }),
        col('role_label', 'Rol', 'text', { width: 14, pdf: 1.3 }),
        col('sales_count', 'Savdolar', 'number', { pdf: 0.9 }),
        col('net_revenue', 'Sof tushum', 'money'),
        ...(financial ? [col('gross_profit', 'Yalpi foyda', 'money', { tone: true })] : []),
        col('avg_order', "O'rtacha chek", 'money'),
        col('discounts', 'Chegirmalar', 'money'),
        col('returns', 'Qaytarishlar', 'money'),
        col('share', 'Ulushi', 'percent', { pdf: 0.9 }),
      ],
      rows: r.staff.map((s) => ({ ...s, role_label: ROLE_LABELS[s.role] || s.role })),
    }],
  };
}

export async function buildReportDoc(db, kind, query, user) {
  if (!REPORT_KINDS[kind]) throw new HttpError(400, "Hisobot turi noto'g'ri");
  const settings = await getSettings(db);
  const builders = {
    pnl: () => pnlDoc(db, query),
    sales: () => salesDoc(db, query),
    products: () => productsDoc(db, query, settings),
    inventory: () => inventoryDoc(db, query, settings, user),
    weekly: () => weeklyDoc(db, query, settings),
    debts: () => debtsDoc(db),
    staff: () => staffDoc(db, query, user),
  };
  const doc = await builders[kind]();
  const r = doc.range;
  const periodText = r.from === r.to ? d(r.from) : `${d(r.from)} – ${d(r.to)}`;
  const now = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Tashkent', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(new Date()).replace(',', '').replace(/\//g, '.');
  return {
    ...doc,
    kind,
    title: REPORT_KINDS[kind],
    store: settings.store_name,
    subtitle: `Davr: ${periodText}`,
    generated: `Yaratildi: ${now} · ${user.full_name}`,
    filename: `ombor-${kind}-${r.from}${r.to !== r.from ? `_${r.to}` : ''}`,
  };
}

export function toXlsx(doc) {
  const summarySheet = {
    name: 'Xulosa',
    title: `${doc.title} — ${doc.store}`,
    subtitle: `${doc.subtitle}. ${doc.generated}`,
    columns: [col('label', "Ko'rsatkich", 'text', { width: 34 }), col('value', 'Qiymat', 'text', { width: 30 })],
    rows: [...doc.summary.map((s) => ({ label: s.label, value: s.value })), ...doc.notes.map((n) => ({ label: n, value: '' }))],
  };
  const sheets = [summarySheet, ...doc.tables.map((t) => ({
    name: t.name || t.title,
    title: t.title,
    subtitle: doc.subtitle,
    columns: t.columns.map((c) => ({ ...c, width: c.width || (c.type === 'money' ? 16 : c.type === 'text' ? 24 : 12) })),
    rows: t.rows,
    totals: t.totals,
  }))];
  return buildXlsx(sheets);
}

export function toPdf(doc) {
  return buildPdf({
    title: doc.title,
    subtitle: doc.subtitle,
    store: doc.store,
    generated: doc.generated,
    summary: doc.summary,
    notes: doc.notes,
    tables: doc.tables,
    landscape: doc.landscape ?? doc.tables.some((t) => t.columns.length > 6),
  });
}
